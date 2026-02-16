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
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  try {
    const { baseId, sessionsTable } = getEnv();
    const body = req.body || {};

    const { device_id, play_with, alcohol, location, level } = body;

    if (!device_id || !play_with || !alcohol || !location) {
      return jsonResponse(400, { error: "Missing required fields" });
    }

    const session_id = makeSessionId();

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
                // level ist optional – falls leer/undefined: einfach nicht setzen
                ...(level ? { level } : {}),
                // Long text: wir speichern JSON-String!
                seen_ids: "[]",
                status: "active",
              },
            },
          ],
        },
      }
    );

    const rec = create?.records?.[0];
    if (!rec?.fields?.session_id) {
      return jsonResponse(422, {
        status: "error",
        error: "airtable_create_failed",
        detail: create,
      });
    }

    return jsonResponse(200, {
      status: "ok",
      session_id: rec.fields.session_id,
    });
  } catch (err) {
    console.error("session-start error:", err);
    return jsonResponse(500, { error: "Internal server error" });
  }
}
