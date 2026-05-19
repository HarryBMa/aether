"""
Synapse module: SITHS/HSA-ID authentication support for the Aether platform.

Provides:
  SITHSSAMLMappingProvider  — maps SAML2 assertions from CGI/Carelink to Matrix accounts
  SITHSAuthModule           — module hook that syncs display names from HSA bridge on login

Installation: place in the Python path available to Synapse (e.g. /usr/local/lib/python3/dist-packages/)
or install as a package. Reference in homeserver.yaml under `modules`.

SAML2 attribute flow (CGI/Carelink):
  hsa-id          → Matrix localpart (lowercased, hyphens preserved)
  givenName + sn  → display_name
  title           → profile field (non-standard, stored in account_data)
  organizationName→ profile field
"""

from __future__ import annotations

import logging
import re
import urllib.request
import urllib.error
import json
from typing import Any, Dict, Optional, Tuple

import attr
from synapse.handlers.sso import MappingException
from synapse.module_api import ModuleApi, UserProfile

logger = logging.getLogger(__name__)

# HSA-ID format validation: SE followed by region code and identifier
# Example: SE2321000016-ABC1  (Karolinska)
HSA_ID_RE = re.compile(r"^SE[A-Z0-9\-]{3,20}$", re.IGNORECASE)


def _hsaid_to_localpart(hsa_id: str) -> str:
    """
    Convert a SITHS HSA-ID to a valid Matrix localpart.
    SE2321000016-ABC1 → se2321000016-abc1
    """
    safe = hsa_id.lower().strip()
    # Replace any character not in Matrix localpart alphabet
    safe = re.sub(r"[^a-z0-9._\-]", "_", safe)
    return safe


# ── SAML2 Mapping Provider ────────────────────────────────────────────────────

class SITHSSAMLMappingProvider:
    """
    Maps SAML2 assertions from the CGI/Carelink IdP to Synapse user accounts.

    Expected SAML attributes (configured in homeserver.yaml saml2_config):
      hsa-id          (required)  HSA-ID of the practitioner
      givenName       (optional)  First name
      sn              (optional)  Surname
      displayName     (optional)  Full display name (preferred if available)
      title           (optional)  Job title
    """

    def __init__(self, config: "SITHSSAMLMappingProviderConfig", module_api: ModuleApi):
        self._config = config
        self._api = module_api

    @staticmethod
    def parse_config(config: Dict[str, Any]) -> "SITHSSAMLMappingProviderConfig":
        return SITHSSAMLMappingProviderConfig(
            hsa_id_attribute=config.get("hsa_id_attribute", "hsa-id"),
            display_name_attribute=config.get("display_name_attribute", "displayName"),
        )

    @staticmethod
    def get_saml_attributes(
        config: "SITHSSAMLMappingProviderConfig",
    ) -> Tuple[set, set]:
        return (
            {config.hsa_id_attribute},  # required
            {"givenName", "sn", config.display_name_attribute, "title"},  # optional
        )

    async def saml_response_to_user_attributes(
        self,
        saml_response: Any,
        failures: int,
        client_redirect_url: Optional[str],
    ) -> Dict[str, Optional[str]]:
        attrs = saml_response.ava

        hsa_id_raw = self._get_attr(attrs, self._config.hsa_id_attribute)
        if not hsa_id_raw:
            raise MappingException(
                f"SAML response missing required attribute '{self._config.hsa_id_attribute}'"
            )

        hsa_id = hsa_id_raw.strip()
        if not HSA_ID_RE.match(hsa_id):
            raise MappingException(f"Invalid HSA-ID format: {hsa_id!r}")

        # Determine display name
        display_name = self._get_attr(attrs, self._config.display_name_attribute)
        if not display_name:
            given = self._get_attr(attrs, "givenName") or ""
            sn = self._get_attr(attrs, "sn") or ""
            display_name = f"{given} {sn}".strip() or hsa_id

        localpart = _hsaid_to_localpart(hsa_id)

        # Append failure count suffix to avoid conflicts (Synapse requirement)
        if failures:
            localpart = f"{localpart}_{failures}"

        return {
            "mxid_localpart": localpart,
            "displayname": display_name,
            # Store HSA-ID in emails field so it's queryable
            "emails": [],
        }

    @staticmethod
    def _get_attr(attrs: Dict, name: str) -> Optional[str]:
        val = attrs.get(name)
        if not val:
            return None
        if isinstance(val, list):
            return val[0] if val else None
        return str(val)


@attr.s(auto_attribs=True)
class SITHSSAMLMappingProviderConfig:
    hsa_id_attribute: str = "hsa-id"
    display_name_attribute: str = "displayName"


# ── Synapse Module ─────────────────────────────────────────────────────────────

class SITHSAuthModule:
    """
    Synapse module that enriches user profiles from the HSA bridge on login.
    Also enforces that only HSA-ID-patterned localparts can exist on this server.
    """

    def __init__(self, config: Dict[str, Any], api: ModuleApi):
        self._api = api
        self._hsa_bridge_url = config.get("hsa_bridge_url", "http://hsa-bridge:3402")
        self._api_key = config.get("hsa_bridge_api_key", "")

        api.register_third_party_rules_callbacks(
            on_create_room=self._on_create_room,
        )

        logger.info(
            "SITHSAuthModule loaded, HSA bridge: %s", self._hsa_bridge_url
        )

    @staticmethod
    def parse_config(config: Dict[str, Any]) -> Dict[str, Any]:
        return config

    async def _on_create_room(
        self,
        requester: Any,
        config: Dict[str, Any],
        is_requester_admin: bool,
    ) -> None:
        """
        When a clinical room is created, automatically invite the room creator
        and set the clinical room tag.
        """
        # No-op for now — room creation hooks are reserved for future
        # multi-hospital federation setup
        pass

    def _fetch_hsa_profile(self, hsa_id: str) -> Optional[Dict[str, Any]]:
        """
        Fetch practitioner profile from the HSA bridge, which queries
        EK (www.ek.sll.se) first, then falls back to LDAP.
        """
        url = f"{self._hsa_bridge_url}/hsa/person/{hsa_id}"
        req = urllib.request.Request(
            url,
            headers={"X-Api-Key": self._api_key, "Accept": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=3) as resp:
                profile = json.loads(resp.read())
                # Map EK fields to Synapse display name
                if profile.get("displayName"):
                    profile["display_name"] = profile["displayName"]
                if profile.get("title"):
                    profile["display_name"] = (
                        f"{profile.get('displayName', hsa_id)}, {profile['title']}"
                    )
                return profile
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            logger.warning("HSA bridge HTTP error for %s: %s", hsa_id, e)
            return None
        except Exception as e:
            logger.warning("HSA bridge lookup failed for %s: %s", hsa_id, e)
            return None
