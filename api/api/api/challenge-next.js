import { airtableFetch, getEnv, jsonResponse, safeParseJsonArray } from "./_airtable.js";

function buildFormula({ play_with, alcohol, location, level }) {
  return `AND(
    {active}=TRUE(),
    {level}='${level}',
    FIND('${play_with}', ARRAYJOIN({play_with}, ','))>0,
    OR({alcohol_mode}='${alcohol}', {alcohol_mode}='Both'),
    OR({location_mode}='${location}', {location_mode}='Both')
  )`;
}

export async function GET(req) {
  try {
    const { baseId, sessionsTable, challengesTable } = getEnv();

    const url = new URL(req.url);
    const session_id = url.searchParams.get("session_id");
    if (!session_id) return jsonResponse(400, { status: "error", error: "missing_session_id" });

    // 1) Session holen
    const sess = await airtableFetch(
      `/${baseId}/${encodeURIComponent(sessionsTable)}?filterByFormula=${encodeURIComponent(
        `{session_id}='${session_id}'`
      )}&maxRecords=1`
    );

    if (!sess.ok) return jsonResponse(500, { status: "error", error: "airtable_session_fetch_failed", detail: sess });

    const srec = sess.json?.records?.[0];
    if (!srec?.id) return jsonResponse(404, { status: "error", error: "session_not_found" });

    const f = srec.fields || {};
    const play_with = f.play_with;
    const alcohol = f.alcohol;
    const location = f.location;
    const level = f.level;

    if (!play_with || !alcohol || !location || !level) {
      return jsonResponse(400, { status: "error", error: "session_incomplete" });
    }

    const seen = safeParseJsonArray(f.seen_ids);

    // 2) passende Challenges holen
    const formula = buildFormula({ play_with, alcohol, location, level });
    const list = await airtableFetch(
      `/${baseId}/${encodeURIComponent(challengesTable)}?maxRecords=100&filterByFormula=${encodeURIComponent(formula)}`
    );

    if (!list.ok) return jsonResponse(500, { status: "error", error: "airtable_challenges_fetch_failed", detail: list });

    const records = list.json?.records || [];
    const unseen = records.filter((r) => r?.id && !seen.includes(r.id));

    if (unseen.length === 0) return jsonResponse(200, { status: "empty" });

    // random pick
    const pick = unseen[Math.floor(Math.random() * unseen.length)];
    const cf = pick.fields || {};

    return jsonResponse(200, {
      status: "ok",
      challenge: {
        id: pick.id,
        category: cf.category || "",
        challenge_text: cf.challenge_text || "",
      },
    });
  } catch (e) {
    return jsonResponse(500, { status: "error", error: "server_error", message: String(e?.message || e) });
  }
}
