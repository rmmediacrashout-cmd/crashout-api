export function optionsResponse(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.statusCode = 200;
  res.end();
}

export function jsonResponse(res, status, data) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.statusCode = status;
  res.end(JSON.stringify(data));
}

// Robust: funktioniert sowohl wenn req.body bereits existiert,
// als auch wenn wir den Stream selbst lesen müssen.
export async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8").trim();

  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (e) {
    return { __raw: raw, __parse_error: true };
  }
}

export function getEnv() {
  // Wir akzeptieren beide Namen, damit du nicht wieder an Vercel drehen musst.
  const pat =
    process.env.AIRTABLE_PAT ||
    process.env.AIRTABLE_TOKEN ||
    process.env.AIRTABLE_API_KEY;

  const baseId = process.env.AIRTABLE_BASE_ID;
  const challengesTable =
    process.env.AIRTABLE_CHALLENGES_TABLE || "Challenges";
  const sessionsTable = process.env.AIRTABLE_SESSIONS_TABLE || "Sessions";

  if (!pat) throw new Error("Missing env var: AIRTABLE_PAT");
  if (!baseId) throw new Error("Missing env var: AIRTABLE_BASE_ID");

  return { pat, baseId, challengesTable, sessionsTable };
}

export async function airtableFetch(path, options = {}) {
  const { pat } = getEnv();

  const url = `https://api.airtable.com/v0${path}`;
  const headers = {
    Authorization: `Bearer ${pat}`,
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  const r = await fetch(url, { ...options, headers });

  const text = await r.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (e) {
    data = { __raw: text };
  }

  return {
    ok: r.ok,
    status: r.status,
    data,
    raw: text,
  };
}
