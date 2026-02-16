// api/_airtable.js

export function optionsResponse(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  return res.status(200).end();
}

export function jsonResponse(res, statusCode, data) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");
  return res.status(statusCode).json(data);
}

export function getEnv() {
  const AIRTABLE_PAT = process.env.AIRTABLE_PAT;
  const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
  const AIRTABLE_SESSIONS_TABLE = process.env.AIRTABLE_SESSIONS_TABLE;
  const AIRTABLE_CHALLENGES_TABLE = process.env.AIRTABLE_CHALLENGES_TABLE;

  // absichtlich klare Fehlermeldungen
  if (!AIRTABLE_PAT) throw new Error("Missing env var: AIRTABLE_PAT");
  if (!AIRTABLE_BASE_ID) throw new Error("Missing env var: AIRTABLE_BASE_ID");
  if (!AIRTABLE_SESSIONS_TABLE) throw new Error("Missing env var: AIRTABLE_SESSIONS_TABLE");
  if (!AIRTABLE_CHALLENGES_TABLE) throw new Error("Missing env var: AIRTABLE_CHALLENGES_TABLE");

  return {
    pat: AIRTABLE_PAT,
    baseId: AIRTABLE_BASE_ID,
    sessionsTable: AIRTABLE_SESSIONS_TABLE,
    challengesTable: AIRTABLE_CHALLENGES_TABLE,
  };
}

/**
 * airtableFetch:
 * - gibt IMMER ein Objekt zurück: { ok, status, data, raw }
 * - raw ist der geparste JSON Body (oder Text), gut fürs Debugging
 */
export async function airtableFetch(path, options = {}) {
  const { pat } = getEnv();

  const url = `https://api.airtable.com/v0${path}`;
  const headers = {
    Authorization: `Bearer ${pat}`,
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  const r = await fetch(url, { ...options, headers });

  let raw;
  const ct = r.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    raw = await r.json().catch(() => null);
  } else {
    raw = await r.text().catch(() => null);
  }

  return {
    ok: r.ok,
    status: r.status,
    data: raw,
    raw,
  };
}
