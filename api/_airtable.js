// api/_airtable.js  (Next.js pages/api style: handler(req,res))

export function getEnv() {
  const airtablePat = process.env.AIRTABLE_PAT;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const sessionsTable = process.env.AIRTABLE_SESSIONS_TABLE;
  const challengesTable = process.env.AIRTABLE_CHALLENGES_TABLE;

  if (!airtablePat) throw new Error("Missing AIRTABLE_PAT");
  if (!baseId) throw new Error("Missing AIRTABLE_BASE_ID");
  if (!sessionsTable) throw new Error("Missing AIRTABLE_SESSIONS_TABLE");
  if (!challengesTable) throw new Error("Missing AIRTABLE_CHALLENGES_TABLE");

  return { airtablePat, baseId, sessionsTable, challengesTable };
}

export function optionsResponse(res) {
  res.status(204);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.end();
}

export function jsonResponse(res, status, data) {
  res.status(status);
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.end(JSON.stringify(data));
}

export function makeSessionId() {
  return `sess_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function escapeFormulaString(value) {
  // Airtable formula strings use double quotes.
  // We escape backslashes and quotes.
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export async function airtableFetch(path, opts = {}) {
  const { airtablePat } = getEnv();
  const url = `https://api.airtable.com/v0${path}`;

  const controller = new AbortController();
  const timeoutMs = 15000;
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const r = await fetch(url, {
      method: opts.method || "GET",
      headers: {
        Authorization: `Bearer ${airtablePat}`,
        "Content-Type": "application/json",
        ...(opts.headers || {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    });

    const text = await r.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }

    return { ok: r.ok, status: r.status, data: json };
  } catch (e) {
    const isTimeout = e?.name === "AbortError";
    return {
      ok: false,
      status: isTimeout ? 504 : 500,
      data: { error: isTimeout ? `timeout_${timeoutMs}ms` : String(e) },
    };
  } finally {
    clearTimeout(t);
  }
}
