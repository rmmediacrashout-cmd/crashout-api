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

    if (!session_id) {
      return jsonResponse(400, { status: "error", error: "missing_session_id" });
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

    const fields = session.fields;
    const seen = safeParseJsonArray(fields?.seen_ids);

    const formula = buildFormula({
      play_with: fields.play_with,
      alcohol: fields.alcohol,
      location: fields.location,
      level: fields.level,
    });

    // 2️⃣ Challenges laden
    const challengesRes = await airtableFetch(
      `/${baseId}/${encodeURIComponent(challengesTable)}?filterByFormula=${encodeURIComponent(formula)}&maxRecords=100`
    );

    if (!challengesRes.ok) {
      return jsonResponse(500, { status: "error", error: "challenge_fetch_failed" });
    }

    const records = challengesRes.json?.records || [];

    // 3️⃣ Bereits gesehene rausfiltern
    const unseen = records.filter(r => !seen.includes(r.id));

    if (unseen.length === 0) {
      return jsonResponse(200, { status: "empty" });
    }

    // 4️⃣ Random auswählen
    const random = unseen[Math.floor(Math.random() * unseen.length)];
    const cf = random.fields || {};

    return jsonResponse(200, {
      status: "ok",
      challenge: {
        id: random.id,
        category: cf.category || "",
        challenge_text: cf.challenge_text || "",
      }
    });

  } catch (e) {
    return jsonResponse(500, { status: "error", error: "server_error" });
  }
}
