import {
  airtableFetch,
  getEnv,
  makeSessionId,
  jsonResponse,
  optionsResponse,
} from "./_airtable.js";

export async function OPTIONS() {
  return optionsResponse();
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") return optionsResponse(res);

  if (req.method !== "POST") {
    return jsonResponse(res, 405, { error: "Method not allowed" });
  }

  try {
    const { baseId, sessionsTable } = getEnv();
    const body = req.body || {};

    const { device_id, play_with, alcohol, location, level } = body;

    // Required fields check (keep it strict)
    if (!device_id || !play_with || !alcohol || !location) {
      return jsonResponse(res, 400, { error: "Missing required fields" });
    }

    const session_id = makeSessionId();

    // IMPORTANT:
    // Airtable long-text stores strings.
    // We store a JSON array string: "[]"
    const seen_ids = "[]";

    const create = await airtableFetch(
      `/${baseId}/${encodeURIComponent(sessionsTable)}`,
      {
        method: "POST",
        body: {
          records: [
            {
              fields: {
                session_id,
                device_id,
                play_with,
                alcohol,
                location,
                ...(level ? { level } : {}),
                seen_ids, // <-- JSON array stored as string
                status: "active",
              },
            },
          ],
        },
      }
    );

    const createdRecord = create?.records?.[0];
    if (!createdRecord) {
      return jsonResponse(res, 422, {
        status: "error",
        error: "airtable_create_failed",
        detail: create,
      });
    }

    return jsonResponse(res, 200, { status: "ok", session_id });
  } catch (err) {
    console.error("session-start error:", err);
    return jsonResponse(res, 500, { error: "Internal server error" });
  }
}
