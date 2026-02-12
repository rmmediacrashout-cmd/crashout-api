import { airtableFetch, getEnv, jsonResponse, safeParseJsonArray } from "./_airtable.js";

export async function POST(req) {
  try {
    const { baseId, sessionsTable } = getEnv();
    const body = await req.json().catch(() => null);

    const session_id = body?.session_id;
    const challenge_id = body?.challenge_id;

    if (!session_id || !challenge_id) {
      return jsonResponse(400, { status: "error", error: "Missing required fields: session_id, challenge_id" });
    }

    const sess = await airtableFetch(
      `/${baseId}/${encodeURIComponent(sessionsTable)}?filterByFormula=${encodeURIComponent(
        `{session_id}='${session_id}'`
      )}&maxRecords=1`
    );

    if (!sess.ok) return jsonResponse(500, { status: "error", error: "airtable_session_fetch_failed", detail: sess });

    const srec = sess.json?.records?.[0];
    if (!srec?.id) return jsonResponse(404, { status: "error", error: "session_not_found" });

    const seen = safeParseJsonArray(srec.fields?.seen_ids);
    if (!seen.includes(challenge_id)) seen.push(challenge_id);

    const upd = await airtableFetch(`/${baseId}/${encodeURIComponent(sessionsTable)}`, {
      method: "PATCH",
      body: { records: [{ id: srec.id, fields: { seen_ids: JSON.stringify(seen) } }] },
    });

    if (!upd.ok) return jsonResponse(500, { status: "error", error: "airtable_update_failed", detail: upd });

    return jsonResponse(200, { status: "ok" });
  } catch (e) {
    return jsonResponse(500, { status: "error", error: "server_error", message: String(e?.message || e) });
  }
}
