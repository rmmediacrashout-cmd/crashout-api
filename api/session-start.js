import { airtableFetch, getEnv, jsonResponse, makeSessionId } from "./_airtable.js";

export async function POST(req) {
  try {
    const { baseId, sessionsTable } = getEnv();
    const body = await req.json().catch(() => null);

    const device_id = body?.device_id;
    const play_with = body?.play_with;
    const alcohol = body?.alcohol;
    const location = body?.location;

    if (!device_id || !play_with || !alcohol || !location) {
      return jsonResponse(400, {
        status: "error",
        error: "Missing required fields: device_id, play_with, alcohol, location",
      });
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
                level: "",
                seen_ids: "[]",
                status: "active",
              },
            },
          ],
        },
      }
    );

    if (!create.ok) {
      return jsonResponse(500, { status: "error", error: "airtable_create_failed", detail: create });
    }

    return jsonResponse(200, { status: "ok", session_id });
  } catch (e) {
    return jsonResponse(500, { status: "error", error: "server_error", message: String(e?.message || e) });
  }
}
