const AIRTABLE_API = "https://api.airtable.com/v0";

function mustEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export function getEnv() {
  return {
    pat: mustEnv("AIRTABLE_PAT"),
    baseId: mustEnv("AIRTABLE_BASE_ID"),
    challengesTable: mustEnv("AIRTABLE_CHALLENGES_TABLE"),
    sessionsTable: mustEnv("AIRTABLE_SESSIONS_TABLE"),
  };
}

export async function airtableFetch(path, { method = "GET", body } = {}) {
  const { pat } = getEnv();
  const res = await fetch(`${AIRTABLE_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${pat}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const json = await res.json();
  if (!res.ok) {
    return { ok: false, status: res.status, json };
  }
  return { ok: true, status: res.status, json };
}

export function jsonResponse(status, data) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function makeSessionId() {
  return `sess_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function safeParseJsonArray(s) {
  if (!s) return [];
  try {
    const a = JSON.parse(s);
    return Array.isArray(a) ? a : [];
  } catch {
    return [];
  }
}

