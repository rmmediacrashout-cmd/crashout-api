import { airtableFetch, getEnv, jsonResponse, optionsResponse } from "./_airtable.js";

export async function OPTIONS() {
  return optionsResponse();
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") return optionsResponse(res);
  if (req.method !== "POST") return jsonResponse(res, 405, { error: "Method not allowed" });

  try {
    const { baseId, sessionsTable } = getEnv();

    // Body robust lesen (falls mal leer/kaputt)
    const body = req.body || {};

    const device_id = body.device_id;
    const play_with = body.play_with;
    const alcohol = body.alcohol;
    const location = body.location;
    const level = body.level;

    // Minimal-Validation (damit Airtable nicht mit cryptic errors kommt)
    const missing = [];
    if (!device_id) missing.push("device_id");
    if (!play_with) missing.push("play_with");
    if (!alcohol) missing.push("alcohol");
    if (!location) missing.push("location");
    if (!level) missing.push("level");

    if (missing.length) {
      return jsonResponse(res, 400, { error: "missing_fields", missing });
    }

    // Session-ID generieren
    const session_id = `sess_${Date.now()}_${Math.random().toString(16).slice(2)}`;

    const now = new Date().toISOString();

    // seen_ids als JSON-Array STRING (weil Airtable Feld bei dir long-text ist)
    const fields = {
      session_id,
      device_id,
      play_with,
      alcohol,
      location,
      level,
      seen_ids: "[]",
      status: "active",
      created_at: now,
      updated_at: now,
    };

    const createResp = await airtableFetch(
      `/${baseId}/${encodeURIComponent(sessionsTable)}`,
      {
        method: "POST",
        body: JSON.stringify({ records: [{ fields }] }),
      }
    );

    // Wenn Airtable wirklich fehlschlägt -> 422
    if (!createResp.ok) {
      return jsonResponse(res, 422, {
        status: "error",
        error: "airtable_create_failed",
        detail: createResp,
      });
    }

    // Airtable Success -> IMMER 200 zurückgeben
    const record = createResp.data?.records?.[0];
    return jsonResponse(res, 200, {
      status: "ok",
      session_id,
      airtable_record_id: record?.id || null,
      fields: record?.fields || fields,
    });
  } catch (err) {
    console.error("session-start error:", err);
    return jsonResponse(res, 500, {
      status: "error",
      error: "internal_server_error",
    });
  }
}
