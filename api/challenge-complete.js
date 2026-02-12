import { airtableFetch, getEnv, jsonResponse, safeParseJsonArray } from "./_airtable.js";

export async function POST(req) {
  try {
    const { baseId, sessionsTable } = getEnv();
    const body = await req.json().catch(() => null);

    const session_id = body?.session_id;
    const challenge_id = body?.challenge_id;

    if (!session_id || !challenge_id) {
      return jsonResponse(400, {
        status: "error",
        error: "missing_fields"
      });
    }

    // 1️⃣ Session laden
    const sessionRes = await airtableFetch(
      `/${baseId}/${encodeURIComponent(sessionsTable)}?filterByFormula=${encodeURIComponent(
        `{session_id}='${session_id}'`
      )}&maxRecords=1`
    );

    if (!sessionRes.ok) {
      return jsonResponse(500, { status: "error", error: "session_fetch_failed" });
    }

    const session = sessionRes.json?.records?.[0];
    if (!session?.id) {
      return jsonResponse(404, { status: "error", error: "session_not_found" });
    }

    const seen = safeParseJsonArray(session.fields?.seen_ids);

    if (!seen.includes(challenge_id)) {
      seen.push(challenge_id);
    }

    // 2️⃣ Update seen_ids
    const update = await airtableFetch(
      `/${baseId}/${encodeURIComponent(sessionsTable)}`,
      {
        method: "PATCH",
        body: {
          records: [
            {
              id: session.id,
              fields: {
                seen_ids: JSON.stringify(seen)
              }
            }
          ]
        }
      }
    );

    if (!update.ok) {
      return jsonResponse(500, { status: "error", error: "update_failed" });
    }

    return jsonResponse(200, { status: "ok" });

  } catch (e) {
    return jsonResponse(500, { status: "error", error: "server_error_
