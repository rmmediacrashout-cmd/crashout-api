// api/session-start.js
import { airtableFetch, getEnvVars, jsonResponse, optionsResponse, readJsonBody } from "./_airtable.js";

export async function OPTIONS(req, res) {
  return optionsResponse(res);
}

export default async function handler(req, res) {
  try {
    if (req.method === "OPTIONS") return optionsResponse(res);
    if (req.method !== "POST") return jsonResponse(res, 405, { error: "Method not allowed" });

    const { baseId, sessionsTable } = getEnvVars();
    const body = await readJsonBody(req);

    const device_id = body.device_id ?? null;
    const play_with = body.play_with ?? null;  // Single select text
    const alcohol = body.alcohol ?? null;      // Single select text
    const location = body.location ?? null;    // Single select text
    const level = body.level ?? null;          // Single select text

    if (!device_id) {
      return jsonResponse(res, 400, { status: "error", error: "missing_device_id" });
    }

    // ✅ long-text => JSON Array als STRING speichern
    const fields = {
      session_id: `sess_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`,
      device_id,
      play_with,
      alcohol,
      location,
      level,
      seen_ids: "[]",     // <<< wichtig
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
        airtable_status: createResp.status,
        airtable_error: createResp.data || createResp.text,
        fields_sent: fields,
      });
    }

    const record = createResp.data?.records?.[0];

    return jsonResponse(res, 200, {
      status: "ok",
      session_id: record?.fields?.session_id || fields.session_id,
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
