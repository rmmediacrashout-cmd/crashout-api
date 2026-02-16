import { airtableFetch, getEnv, jsonResponse, optionsResponse } from "./_airtable.js";

export async function OPTIONS() {
  return optionsResponse();
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return jsonResponse(res, 405, { error: "Method not allowed" });
  }

  try {
    const { baseId, challengesTable, sessionsTable } = getEnv();
    const { session_id } = req.body || {};

    if (!session_id) {
      return jsonResponse(res, 400, { error: "missing_session_id" });
    }

    // 1️⃣ Session laden
    const sessionResp = await airtableFetch(
      `${baseId}/${encodeURIComponent(sessionsTable)}?filterByFormula={session_id}="${session_id}"`
    );

    const sessionRecord = sessionResp?.records?.[0];

    if (!sessionRecord) {
      return jsonResponse(res, 404, { error: "session_not_found" });
    }

    const sessionFields = sessionRecord.fields || {};

    // 2️⃣ seen_ids robust parsen
    let seenIds = [];
    try {
      if (sessionFields.seen_ids) {
        seenIds = JSON.parse(sessionFields.seen_ids);
        if (!Array.isArray(seenIds)) seenIds = [];
      }
    } catch (e) {
      seenIds = [];
    }

    // 3️⃣ Filter aufbauen
    const filterFormula = `
      AND(
        {status}="active",
        {group_type}="${sessionFields.play_with}",
        {mode}="${sessionFields.alcohol}",
        {location}="${sessionFields.location}",
        {level}="${sessionFields.level}"
      )
    `.replace(/\n/g, "");

    const challengesResp = await airtableFetch(
      `${baseId}/${encodeURIComponent(challengesTable)}?filterByFormula=${encodeURIComponent(filterFormula)}`
    );

    const allChallenges = challengesResp?.records || [];

    // 4️⃣ Bereits gesehene rausfiltern
    const availableChallenges = allChallenges.filter(c =>
      !seenIds.includes(c.id)
    );

    if (availableChallenges.length === 0) {
      return jsonResponse(res, 404, {
        error: "no_matching_challenges_found",
      });
    }

    // 5️⃣ Zufällige wählen
    const randomIndex = Math.floor(Math.random() * availableChallenges.length);
    const challenge = availableChallenges[randomIndex];

    // 6️⃣ Neue ID zu seen_ids hinzufügen
    const updatedSeenIds = [...seenIds, challenge.id];

    await airtableFetch(
      `${baseId}/${encodeURIComponent(sessionsTable)}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          records: [
            {
              id: sessionRecord.id,
              fields: {
                seen_ids: JSON.stringify(updatedSeenIds),
              },
            },
          ],
        }),
      }
    );

    return jsonResponse(res, 200, {
      status: "ok",
      challenge: {
        id: challenge.id,
        ...challenge.fields,
      },
    });

  } catch (err) {
    console.error("challenge-next error:", err);
    return jsonResponse(res, 500, {
      error: "internal_server_error",
      message: err?.message || "unknown_error",
    });
  }
}
