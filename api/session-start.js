import { airtableFetch, getEnv, jsonResponse, optionsResponse, readJsonBody } from "./_airtable.js";

export async function OPTIONS(req, res) {
  return optionsResponse(res);
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") return optionsResponse(res);

  if (req.method !== "POST") {
    return jsonResponse(res, 405, { error: "Method not allowed" });
  }

  try {
    const { baseId, sessionsTable } = getEnv();

    const body = await readJsonBody(req);

    const device_id = body.device_id;
    const play_with = body.play_with;
    const alcohol = body.alcohol;
    const location = body.location;
    const level = body.level;

    if (!device_id || !play_with || !alcohol || !location || !level) {
      return jsonResponse(res, 400, {
        error: "missing_fields",
        required: ["device_id", "play_with", "alcohol", "location", "level"],
        got: body,
      });
    }

    // Session-ID erzeugen
    const session_id = `sess_${Date.now()}_${Math.random().toString(16).slice(2)}`;

    // seen_ids als JSON-Array im Long-Text Feld speichern
    const fields = {
      session_id,
      device_id,
      play_with,
      alcohol,
      location,
      level,
      seen_ids: "[]",
      status: "active",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
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
        detail: createResp,
      });
    }

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
      message: String(err?.message || err),
    });
  }
}
