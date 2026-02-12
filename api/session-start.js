import { airtableFetch, getEnv, makeSessionId, jsonResponse, optionsResponse } from "./_airtable.js";

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    return optionsResponse();
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  try {
    const { baseId, sessionsTable } = getEnv();
    const body = req.body;

    const { device_id, play_with, alcohol, location } = body;

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
                location
              }
            }
          ]
        }
      }
    );

    return jsonResponse(200, { session_id });

  } catch (err) {
    return jsonResponse(500, { error: err.message });
  }
}
