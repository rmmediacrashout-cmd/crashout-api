// api/session-start.js
import {
  airtableFetch,
  getEnvVars,
  jsonResponse,
  optionsResponse,
  readJsonBody,
} from "../lib/airtable"; // <- so wie bei dir zuvor (Pfad bitte exakt lassen)

/**
 * ✅ Normalisiert Select-Werte:
 * - undefined / null / "" / "   " => defaultValue
 * - sonst => trim()
 */
function normalizeSelect(value, defaultValue) {
  if (typeof value !== "string") return defaultValue;
  const v = value.trim();
  return v.length ? v : defaultValue;
}

export async function OPTIONS(req, res) {
  return optionsResponse(res);
}

export default async function handler(req, res) {
  try {
    if (req.method === "OPTIONS") return optionsResponse(res);
    if (req.method !== "POST") {
      return jsonResponse(res, 405, { error: "Method not allowed" });
    }

    const { baseId, sessionsTable } = getEnvVars();

    const body = await readJsonBody(req);

    // device_id bleibt required (wie bei dir)
    const device_id = body.device_id ?? null;

    // ✅ FIX: sichere Defaults (verhindert 422 / INVALID_MULTIPLE_CHOICE_OPTIONS)
    // Wichtig: Default-Werte müssen exakt den Airtable Single-Select Optionen entsprechen
    const play_with = normalizeSelect(body.play_with, "friends");
    const alcohol   = normalizeSelect(body.alcohol, "non-alcohol");
    const location  = normalizeSelect(body.location, "home");
    const level     = normalizeSelect(body.level, "yamas");

    if (!device_id) {
      return jsonResponse(res, 400, { status: "error", error: "missing_device_id" });
    }

    // long text: JSON Array als STRING speichern
    // created_at / updated_at NICHT senden (Airtable computed fields)
    const fields = {
      session_id: `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
      device_id: device_id,
      play_with: play_with,
      alcohol: alcohol,
      location: location,
      level: level,
      seen_ids: "[]", // ✅ wichtig: long text bleibt STRING
      status: "active",
    };

    const createResp = await airtableFetch(
      `/bases/${baseId}/tables/${encodeURIComponent(sessionsTable)}/records`,
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
        airtable_error: createResp.data,
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
