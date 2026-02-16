// api/_airtable.js

const AIRTABLE_API = "https://api.airtable.com/v0";

export function getEnv() {
  const pat = process.env.AIRTABLE_PAT; // <- dein Name in Vercel
  const baseId = process.env.AIRTABLE_BASE_ID;
  const challengesTable = process.env.AIRTABLE_CHALLENGES_TABLE;
  const sessionsTable = process.env.AIRTABLE_SESSIONS_TABLE;

  if (!pat) throw new Error("Missing env var: AIRTABLE_PAT");
  if (!baseId) throw new Error("Missing env var: AIRTABLE_BASE_ID");
  if (!challengesTable) throw new Error("Missing env var: AIRTABLE_CHALLENGES_TABLE");
  if (!sessionsTable) throw new Error("Missing env var: AIRTABLE_SESSIONS_TABLE");

  return { pat, baseId, challengesTable, sessionsTable };
}

function setCors(res) {
  // Für Debug/Console-Tests von beliebigen Origins (google.com etc.)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");
}

export function optionsResponse(res) {
  setCors(res);
  res.status(200).end();
}

export function jsonResponse(res, status, data) {
  setCors(res);
  res.status(status).json(data);
}

export async function readJsonBody(req) {
  // Vercel kann req.body bereits als Object liefern – oder als String – oder leer
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return null;
    }
  }

  // Fallback: raw stream lesen (nur falls nötig)
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function airtableFetch(path, init = {}) {
  const { pat } = getEnv();

  const headers = {
    Authorization: `Bearer ${pat}`,
    "Content-Type": "application/json",
    ...(init.headers || {}),
  };

  const r = await fetch(`${AIRTABLE_API}${path}`, {
    ...init,
    headers,
  });

  const text = await r.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  return {
    ok: r.ok,
    status: r.status,
    data: json,
    raw: text,
  };
}
