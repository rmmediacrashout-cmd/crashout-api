import {
  airtableFetch,
  getEnv,
  jsonResponse,
  optionsResponse,
  safeParseJsonArray,
} from "./_airtable.js";

/**
 * CORS preflight
 */
export async function OPTIONS() {
  return optionsResponse();
}

/**
 * POST /api/challenge-next
 * body: { session_id: "sess_..." }
 */
export default async function handler(req, res) {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return optionsResponse();
  }

  // Only allow POST
  if (req.method !== "POST") {
    return jsonResponse(405, { status: "error", error: "Method not allowed" });
  }

  try {
    const { baseId, sessionsTable, challengesTable } = getEnv();

    const body = req.body || {};
    const session_id = body.session_id;

    if (!session_id) {
      return jsonResponse(400, {
        status: "error",
        error: "missing_required_fields",
        detail: { required: ["session_id"] },
      });
    }

    // ---- 1) Load session by session_id ----
    const sessionQuery = `/` +
      `${encodeURIComponent(baseId)}/${encodeURIComponent(sessionsTable)}` +
      `?pageSize=1&filterByFormula=${encodeURIComponent(`{session_id}="${session_id}"`)}`;

    const sessionRes = await airtableFetch(sessionQuery, { method: "GET" });

    if (!sessionRes.ok) {
      return jsonResponse(422, {
        status: "error",
        error: "airtable_session_lookup_failed",
        detail: sessionRes.json,
      });
    }

    const sessionRecords = sessionRes.json?.records || [];
    if (sessionRecords.length === 0) {
      return jsonResponse(404, {
        status: "error",
        error: "session_not_found",
        detail: { session_id },
      });
    }

    const sessionRecord = sessionRecords[0];
    const sessionFields = sessionRecord.fields || {};

    // ---- 2) Derive filters for challenges ----
    // Expected values in Airtable (based on your screenshot):
    // group_type: family | friends | partner | colleagues
    // mode: alcohol | non-alcohol
    // difficulty: yamas | heatwave | crashout
    // status: active
    // language: deutsch

    const group_type = String(sessionFields.play_with || "").toLowerCase().trim();
    const alcoholVal = String(sessionFields.alcohol || "").toLowerCase();
    const mode =
      alcoholVal.includes("free") || alcoholVal.includes("non") ? "non-alcohol" : "alcohol";

    const difficulty = String(sessionFields.level || "").toLowerCase().trim();
    const language = String(sessionFields.language || "deutsch").toLowerCase().trim();

    // seen_ids can be stored as JSON string in a text field
    const seen_ids = safeParseJsonArray(sessionFields.seen_ids);

    // Basic validation so we don't query nonsense
    if (!group_type || !mode || !difficulty || !language) {
      return jsonResponse(422, {
        status: "error",
        error: "session_missing_filters",
        detail: {
          play_with: sessionFields.play_with,
          alcohol: sessionFields.alcohol,
          level: sessionFields.level,
          language: sessionFields.language,
        },
      });
    }

    // ---- 3) Fetch matching challenges from Airtable ----
    // We filter by the main fields in Airtable, and do the "not seen" filter in code.
    const filterFormula = `AND(
      {status}="active",
      {group_type}="${group_type}",
      {mode}="${mode}",
      {difficulty}="${difficulty}",
      {language}="${language}"
    )`;

    const challengesQuery =
      `/${encodeURIComponent(baseId)}/${encodeURIComponent(challengesTable)}` +
      `?pageSize=100&filterByFormula=${encodeURIComponent(filterFormula)}`;

    const challengesRes = await airtableFetch(challengesQuery, { method: "GET" });

    if (!challengesRes.ok) {
      return jsonResponse(422, {
        status: "error",
        error: "airtable_challenges_fetch_failed",
        detail: challengesRes.json,
      });
    }

    const allChallenges = challengesRes.json?.records || [];

    // Filter out already seen challenges by challenge_id (numeric in your table)
    const unseen = allChallenges.filter((r) => {
      const cid = r?.fields?.challenge_id;
      if (cid === undefined || cid === null) return false;
      return !seen_ids.includes(String(cid));
    });

    if (unseen.length === 0) {
      return jsonResponse(200, {
        status: "ok",
        done: true,
        message: "no_more_unseen_challenges_for_this_filter_set",
        filters: { group_type, mode, difficulty, language },
        seen_ids,
      });
    }

    // Pick a random unseen challenge
    const picked = unseen[Math.floor(Math.random() * unseen.length)];
    const pickedFields = picked.fields || {};

    const pickedChallengeId = String(pickedFields.challenge_id);
    const nextSeen = [...seen_ids, pickedChallengeId];

    // ---- 4) Update session.seen_ids in Airtable ----
    // Store as JSON string in a text field (safe for Airtable)
    const updateRes = await airtableFetch(
      `/${encodeURIComponent(baseId)}/${encodeURIComponent(sessionsTable)}/${encodeURIComponent(sessionRecord.id)}`,
      {
        method: "PATCH",
        body: {
          fields: {
            seen_ids: JSON.stringify(nextSeen),
          },
        },
      }
    );

    if (!updateRes.ok) {
      return jsonResponse(422, {
        status: "error",
        error: "airtable_session_update_failed",
        detail: updateRes.json,
      });
    }

    // ---- 5) Return challenge ----
    return jsonResponse(200, {
      status: "ok",
      challenge: {
        challenge_id: pickedFields.challenge_id,
        challenge_text: pickedFields.challenge_text,
        group_type: pickedFields.group_type,
        mode: pickedFields.mode,
        difficulty: pickedFields.difficulty,
        language: pickedFields.language,
      },
      session_id,
      seen_ids: nextSeen,
    });
  } catch (e) {
    return jsonResponse(500, {
      status: "error",
      error: "server_error",
      detail: String(e?.message || e),
    });
  }
}
