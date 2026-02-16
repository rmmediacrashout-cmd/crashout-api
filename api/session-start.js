// api/session-start.js

import { airtableFetch, getEnv, jsonResponse, optionsResponse, readJsonBody } from "./_airtable.js";

function makeSessionId() {
  // stabil genug für MVP
  return `sess_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
}

export default async function handler(req, res) {
  try {
    if (req.method === "OPTIONS") return optionsResponse(res);
    if (req.method !== "POST") return jsonResponse(res, 405, { error: "Method not allowed" });

    const body = await readJsonBody(req);
    if (!body) return jsonResponse(res, 400, { error: "Invalid JSON body" });

    const { baseId, sessionsTable } = getEnv();

    const device_id = body.device_id ?? null;
    const play_with = body.play_with ?? null;   // Single select value (string)
    const alcohol = body.alcohol ?? null;       // Single select value (string)
    const location = body.location ?? null;     // Single select value (string)
    const level = body.level ?? null;           // Single select value (string)

    const session_id = makeSessionId();

    const fields = {
      session_id,
      device_id,
      play_with,
      alcohol,
      location,
      level,
      // Long-text Feld -> als JSON-Array-String speichern
      seen_ids: "[]",
      status: "active",
    };

    const createResp = await airtableFetch(
      `/${baseId}/${encodeURIComponent(sessionsTable)}`,
      {
        method: "POST",
        body: JSON.stringify({ records: [{ fields }] }),
      }
    );

    if (!createResp.ok) {
      return jsonResponse(res, 422, {
        status: "error",
        error: "airtable_create_failed",
        detail: createResp.data || createResp.raw,
      });
    }

    const record = createResp.data?.records?.[0] || null;

    return jsonResponse(res, 200, {
      status: "ok",
      session_id,
      airtable_record_id: record?.id || null,
      fields: record?.fields || fields,
    });
  } catch (err) {
    return jsonResponse(res, 500, {
      status: "error",
      error: "internal_server_error",
      message: err?.message || String(err),
    });
  }
}
