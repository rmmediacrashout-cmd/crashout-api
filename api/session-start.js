// api/session-start.js

import {
  airtableFetch,
  getEnv,
  jsonResponse,
  makeSessionId,
  optionsResponse,
} from "./_airtable.js";

export default async function handler(req, res) {
  if (req.method === "OPTIONS") return optionsResponse(res);
  if (req.method !== "POST") return jsonResponse(res, 405, { error: "Method not allowed" });

  try {
    const { baseId, sessionsTable } = getEnv();
    const body = req.body || {};

    const device_id = body.device_id;
    const play_with = body.play_with;
    const alcohol = body.alcohol;
    const location = body.location;

    if (!device_id || !play_with || !alcohol || !location) {
      return jsonResponse(res, 400, {
        error: "Missing required fields",
        required: ["device_id", "play_with", "alcohol", "location"],
        got: Object.keys(body),
      });
    }

    const session_id = makeSessionId();

    // IMPORTANT: seen_ids ist Long text -> wir speichern JSON string
    const fields = {
      session_id,
      device_id,
      play_with,
      alcohol,
      location,
      seen_ids: "[]",
    };

    const create = await airtableFetch(
      `/${baseId}/${encodeURIComponent(sessionsTable)}`,
      {
        method: "POST",
        body: { records: [{ fields }] },
      }
    );

    if (!create.ok) {
      return jsonResponse(res, 422, {
        status: "error",
        error: "airtable_create_failed",
        detail: create.data,
      });
    }

    return jsonResponse(res, 200, { status: "ok", session_id });
  } catch (e) {
    console.error("session-start error:", e);
    return jsonResponse(res, 500, { error: "Internal server error" });
  }
}
