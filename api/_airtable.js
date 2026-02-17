// api/_airtable.js

function getEnv(name, fallbackNames = []) {
  const v = process.env[name];
  if (v) return v;
  for (const fb of fallbackNames) {
    const vv = process.env[fb];
    if (vv) return vv;
  }
  return null;
}

// ✅ Nutze AIRTABLE_PAT (wie bei dir in Vercel), aber erlaube Fallbacks
const AIRTABLE_TOKEN = getEnv("AIRTABLE_PAT", ["AIRTABLE_TOKEN", "AIRTABLE_API_KEY"]);
const AIRTABLE_BASE_ID = getEnv("AIRTABLE_BASE_ID");
const AIRTABLE_CHALLENGES_TABLE = getEnv("AIRTABLE_CHALLENGES_TABLE");
const AIRTABLE_SESSIONS_TABLE = getEnv("AIRTABLE_SESSIONS_TABLE");

export function optionsResponse(res) {
  // Wichtig für Browser-Calls (CORS)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.status(200).json({ ok: true });
}

export function jsonResponse(res, status, data) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return res.status(status).json(data);
}

export async function readJsonBody(req) {
  // Vercel Node/Next API route: req.body ist manchmal schon geparst, manchmal string
  if (req.body == null) return {};
  if (typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return {};
}

export function getEnvVars() {
  if (!AIRTABLE_TOKEN) throw new Error("Missing env var: AIRTABLE_PAT");
  if (!AIRTABLE_BASE_ID) throw new Error("Missing env var: AIRTABLE_BASE_ID");
  if (!AIRTABLE_CHALLENGES_TABLE) throw new Error("Missing env var: AIRTABLE_CHALLENGES_TABLE");
  if (!AIRTABLE_SESSIONS_TABLE) throw new Error("Missing env var: AIRTABLE_SESSIONS_TABLE");

  return {
    token: AIRTABLE_TOKEN,
    baseId: AIRTABLE_BASE_ID,
    challengesTable: AIRTABLE_CHALLENGES_TABLE,
    sessionsTable: AIRTABLE_SESSIONS_TABLE,
  };
}

export async function airtableFetch(path, init = {}) {
  const { token } = getEnvVars();

  const url = `https://api.airtable.com/v0${path}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    ...(init.headers || {}),
  };

  const r = await fetch(url, { ...init, headers });

  const text = await r.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  return {
    ok: r.ok,
    status: r.status,
    text,
    data,
  };
}
