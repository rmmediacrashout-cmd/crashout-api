import { airtableFetch, getEnv, jsonResponse } from "./_airtable.js";

export async function POST(req) {
  try {
    const { baseId, sessionsTable } = getEnv();
    const body = await req.json().catch(() => null);

    const session_id = body?.session_id;
    const level = body?.level;

    if (!session_id || !level) {
      return jsonResponse(400, {
        status: "error",
        error: "Missing required fields",
      });
    }

    const find = await airtableFetch(
      `/${baseId}/${encodeURIComponent(sessionsTable)}?filterByFormula=${encodeURIComponent(
        `{session_id}='${session_id}'`
      )}&maxRecords=1`
    );

    if (!find.ok) {
      return jsonResponse(500, { status: "error", error: "session_not_found" });
    }

    const record = find.json?.records?.[0];
    if (!record?.id) {
      return jsonResponse(404, { status: "error", error: "session_not_found" });
    }

    const update = await airtableFetch(
      `/${baseId}/${encodeURIComponent(sessionsTable)}`,
      {
        method: "PATCH",
        body: {
          records: [
            {
              id: record.id,
              fields: { level },
            },
          ],
        },
      }
    );

    if (!update.ok) {
      return jsonResponse(500, { status: "error", error: "update_failed" });
    }

    return jsonResponse(200, { status: "ok" });
  } catch (e) {
    return jsonResponse(500, { status: "error", error: "server_error" });
  }
}
