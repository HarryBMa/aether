const BASE_URL = import.meta.env.VITE_CAPTURE_SERVICE_URL ?? "http://localhost:3400";
const API_KEY  = import.meta.env.VITE_CAPTURE_SERVICE_API_KEY ?? "";

async function request(method, path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": API_KEY,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw Object.assign(new Error(err.error ?? "Request failed"), { status: res.status, body: err });
  }

  return res.json();
}

export async function listCaptures({ patientId, status, limit = 50, offset = 0 } = {}) {
  const params = new URLSearchParams();
  if (patientId) params.set("patient_id", patientId);
  if (status)    params.set("status", status);
  params.set("limit", String(limit));
  params.set("offset", String(offset));
  return request("GET", `/captures?${params}`);
}

export async function getCapture(id) {
  return request("GET", `/captures/${id}`);
}

export async function requestStepUp(captureId) {
  return request("POST", `/captures/${captureId}/step-up`);
}

export async function verifyStepUp(captureId, stepUpToken) {
  return request("POST", `/captures/${captureId}/verify-step-up`, { stepUpToken });
}

export async function uploadToEMR(captureId, hsaId) {
  return request("POST", `/captures/${captureId}/upload`, { hsaId });
}
