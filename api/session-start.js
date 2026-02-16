// /api/session-start.js
import { airtableFetch, getEnv, jsonResponse, optionsResponse } from "./_airtable.js";

export async function OPTIONS(req, res) {
  return optionsResponse(res);
}

export default async function handler(req, res) {
  try {
    if (req.method === "OPTIONS") return optionsResponse(res);

    if (req.method !== "POST") {
      return jsonResponse(res, 405, { error: "Method not allowed" });
    }

    const baseId = getEnv("AIRTABLE_BASE_ID");
    const sessionsTable = getEnv("AIRTABLE_SESSIONS_TABLE"); // z.B. "Sessions"

    // Next.js liefert req.body je nach Setup als object oder string
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});

    const {
      device_id,
      play_with,
      alcohol,
      location,
      level,
    } = body;

    if (!device_id || !play_with || !alcohol || !location) {
      return jsonResponse(res, 400, {
        status: "error",
        error: "missing_required_fields",
        required: ["device_id", "play_with", "alcohol", "location"],
        got: body,
      });
    }

    // Session-ID erzeugen
    const session_id = `sess_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;

    // seen_ids als JSON-String, weil Airtable long-text ist
    const fields = {
      session_id,
      device_id,
      play_with,
      alcohol,
      location,
      ...(level ? { level } : {}),
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

    // Airtable wirklich fehlgeschlagen -> 422 zurückgeben
    if (!createResp.ok) {
      return jsonResponse(res, 422, {
        status: "error",
        error: "airtable_create_failed",
        detail: createResp,
        sent_fields: fields,
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
