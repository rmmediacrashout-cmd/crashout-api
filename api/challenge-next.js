import { airtableFetch, getEnv, jsonResponse, optionsResponse, safeParseJsonArray } from "./_airtable.js";

export async function OPTIONS() {
  return optionsResponse();
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") return optionsResponse();

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  try {
    const { baseId, sessionsTable, challengesTable } = getEnv();
    const body = req.body || {};
    const { session_id } = body;

    if (!session_id) {
      return jsonResponse(400, { error: "Missing session_id" });
    }

    // 1) Session laden
    const sessionFormula = `{session_id}='${String(session_id).replace(/'/g, "\\'")}'`;
    const sessionUrl =
      `/${baseId}/${encodeURIComponent(sessionsTable)}` +
      `?filterByFormula=${encodeURIComponent(sessionFormula)}` +
      `&maxRecords=1`;

    const sessionResp = await airtableFetch(sessionUrl);
    const sessionRecords = sessionResp?.records || [];

    if (sessionRecords.length === 0) {
      return jsonResponse(404, { error: "session_not_found" });
    }

    const sessionRecord = sessionRecords[0];
    const sessionFields = sessionRecord.fields || {};

    const play_with = sessionFields.play_with;   // z.B. "friends"
    const alcohol = sessionFields.alcohol;       // z.B. "non-alcohol"
    const level = sessionFields.level;           // z.B. "yamas" / "heatwave" / "crashout"
    const language = sessionFields.language || "deutsch"; // optional, falls du es später nutzt

    if (!play_with || !alcohol || !level) {
      return jsonResponse(400, {
        error: "session_missing_fields",
        detail: { play_with, alcohol, level },
      });
    }

    // 2) seen_ids parsen (Long Text => JSON Array im String)
    const seen = safeParseJsonArray(sessionFields.seen_ids);
    const seenSet = new Set((seen || []).map(String));

    // 3) Challenges passend zur Session holen (nur aktive)
    //    (Wir holen max 200 und filtern doppelte dann in JS raus)
    const challengesFormula = `AND(
      {status}='active',
      {group_type}='${String(play_with).replace(/'/g, "\\'")}',
      {mode}='${String(alcohol).replace(/'/g, "\\'")}',
      {difficulty}='${String(level).replace(/'/g, "\\'")}'
    )`;

    const fields = [
      "challenge_id",
      "challenge_text",
      "group_type",
      "mode",
      "difficulty",
      "status",
      "language",
      "created_at",
    ];

    const fieldsQs = fields.map(f => `fields[]=${encodeURIComponent(f)}`).join("&");

    const challengesUrl =
      `/${baseId}/${encodeURIComponent(challengesTable)}` +
      `?filterByFormula=${encodeURIComponent(challengesFormula)}` +
      `&maxRecords=200&${fieldsQs}`;

    const challengesResp = await airtableFetch(challengesUrl);
    const all = challengesResp?.records || [];

    if (all.length === 0) {
      return jsonResponse(404, { error: "no_challenges_found_for_filters" });
    }

    // 4) ungesehene Challenges filtern
    const unseen = all.filter((r) => {
      const cid = r?.fields?.challenge_id;
      if (cid === undefined || cid === null) return false;
      return !seenSet.has(String(cid));
    });

    // Wenn alles schon gesehen wurde: optional Reset (oder lieber Fehler)
    if (unseen.length === 0) {
      return jsonResponse(409, {
        error: "all_seen",
        message: "All matching challenges were already seen in this session.",
        total_matching: all.length,
        seen_count: seenSet.size,
      });
    }

    // 5) zufällige ungesehene Challenge wählen
    const picked = unseen[Math.floor(Math.random() * unseen.length)];
    const pickedFields = picked.fields || {};
    const pickedChallengeId = String(pickedFields.challenge_id);

    // 6) seen_ids updaten (in Session)
    const newSeen = [...seenSet, pickedChallengeId];
    const newSeenJson = JSON.stringify(newSeen);

    const updateUrl = `/${baseId}/${encodeURIComponent(sessionsTable)}/${sessionRecord.id}`;
    await airtableFetch(updateUrl, {
      method: "PATCH",
      body: {
        fields: {
          seen_ids: newSeenJson,
        },
      },
    });

    // 7) Response
    return jsonResponse(200, {
      status: "ok",
      session_id,
      picked: {
        challenge_id: pickedFields.challenge_id,
        challenge_text: pickedFields.challenge_text,
        group_type: pickedFields.group_type,
        mode: pickedFields.mode,
        difficulty: pickedFields.difficulty,
        language: pickedFields.language,
      },
      meta: {
        total_matching: all.length,
        unseen_remaining_after_pick: unseen.length - 1,
        seen_ids: newSeen, // als Array zurück (praktisch fürs Frontend)
      },
    });
  } catch (err) {
    console.error("challenge-next error:", err);
    return jsonResponse(500, { error: "internal_server_error" });
  }
}
