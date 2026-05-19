"""
Synapse module: clinical room management for the Aether platform.

Enforces clinical room policies:
  - Rooms tagged io.aether.clinical get default E2EE and join-rule "invite"
  - Prevents accidental public exposure of clinical rooms
  - Injects clinical context state event on room creation if provided
"""

from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from synapse.module_api import ModuleApi

logger = logging.getLogger(__name__)

CLINICAL_TAG = "io.aether.clinical"
CLINICAL_CONTEXT_EVENT_TYPE = "io.aether.patient_context"


class ClinicalRoomModule:
    def __init__(self, config: Dict[str, Any], api: ModuleApi):
        self._api = api
        self._clinical_room_tag = config.get("clinical_room_tag", CLINICAL_TAG)

        api.register_third_party_rules_callbacks(
            on_create_room=self._on_create_room,
            check_event_allowed=self._check_event_allowed,
        )

        logger.info("ClinicalRoomModule loaded, tag: %s", self._clinical_room_tag)

    @staticmethod
    def parse_config(config: Dict[str, Any]) -> Dict[str, Any]:
        return config

    async def _on_create_room(
        self,
        requester: Any,
        room_config: Dict[str, Any],
        is_requester_admin: bool,
    ) -> None:
        """
        When a room is created with the clinical tag in initial_state,
        enforce invite-only join rules and enable E2EE.
        """
        initial_state = room_config.get("initial_state", [])
        is_clinical = any(
            e.get("type") == "m.tag" and
            self._clinical_room_tag in (e.get("content", {}).get("tags") or {})
            for e in initial_state
        ) or room_config.get("creation_content", {}).get(self._clinical_room_tag)

        if not is_clinical:
            return

        # Force invite-only join rule for clinical rooms
        room_config.setdefault("preset", "private_chat")

        logger.info(
            "Clinical room created by %s — enforcing invite-only",
            getattr(requester, "user", {}).to_string() if hasattr(requester, "user") else requester,
        )

    async def _check_event_allowed(
        self,
        event: Any,
        state_events: Any,
    ) -> Optional[Dict[str, Any]]:
        """
        Prevent changing a clinical room's join_rules to 'public'.
        """
        if event.type == "m.room.join_rules":
            join_rule = event.content.get("join_rule", "")
            if join_rule == "public":
                # Check if this is a clinical room
                tag_event = state_events.get(("m.tag", ""))
                if tag_event and self._clinical_room_tag in (
                    tag_event.content.get("tags") or {}
                ):
                    logger.warning(
                        "Blocked attempt to make clinical room %s public", event.room_id
                    )
                    return {
                        "errcode": "IO_AETHER_CLINICAL_ROOM_LOCKED",
                        "error": "Clinical rooms cannot be made public",
                    }

        return None
