import {
  airtableFetch,
  getEnv,
  jsonResponse,
  optionsResponse,
} from "./_airtable.js";

function safeParseJsonArray(text) {
  // Airtable long-text can be empty, null, or invalid JSON
  if (!text || typeof text !== "string") return [];
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function buildFormula(filters) {
  // Airtable formula: AND({status}="active", {group_type}="friends", ...)
  const parts = [`{status}="active"`];

  // Only add if value exists
  if (filters.group_type) parts.push(`{group_type}="${filters.group_type}"`);
  if (filters.mode) parts.push(`{mode}="${filters.mode}"`);
  if (filters.difficulty) parts.push(`{difficulty}="${filters.difficulty}"`);
  if (filters.language) parts.push(`{language}="${filters.language}"`);

  return `AND(${parts.join(",")})`;
}

export async function OPTIONS() {
  return optionsResponse();
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") return optionsResponse(res);

  if (req.method !== "POST") {
    return jsonResponse(res, 405, { error: "Method not allowed" });
  }

  try {
    const { baseId, challengesTable, sessionsTable } = getEnv();
    const body = req.body || {};
    const { session_id } = body;

    if (!session_id) {
      return jsonResponse(res, 400, { error: "Missing session_id" });
    }

    // 1) Load session by session_id
    const sessionLookup = await airtableFetch(
      `/${baseId}/${encodeURIComponent(sessionsTable)}?filterByFormula=${encodeURIComponent(
        `{session_id}="${session_id}"`
      )}&maxRecords=1`
    );

    const sessionRecord = sessionLookup?.records?.[0];
    if (!sessionRecord) {
      return jsonResponse(res, 404, { error: "session_not_found" });
    }

    const s = sessionRecord.fields || {};

    // Map session fields -> challenge filters
    // Sessions: play_with -> group_type, alcohol -> mode, level -> difficulty
    const filters = {
      group_type: s.play_with,
      mode: s.alcohol,
      difficulty: s.level,
      language: s.language, // optional, only if you store it in sessions
    };

    // 2) Parse seen_ids from Airtable (stored as JSON string)
    const seen = safeParseJsonArray(s.seen_ids);

    // 3) Fetch candidate challenges (active + filters)
    const formula = buildFormula(filters);

    const challengeResp = await airtableFetch(
      `/${baseId}/${encodeURIComponent(
        challengesTable
      )}?filterByFormula=${encodeURIComponent(formula)}&maxRecords=100`
    );

    const allCandidates = challengeResp?.records || [];

    if (allCandidates.length === 0) {
      return jsonResponse(res, 404, {
        error: "no_matching_challenges_found",
        filter: filters,
      });
    }

    // 4) Filter out already-seen challenges (by challenge_id)
    // challenge_id in Airtable is a number in your table -> convert to string for consistent comparison
    const unseen = allCandidates.filter((rec) => {
      const cid = rec?.fields?.challenge_id;
      if (cid === undefined || cid === null) return false;
      return !seen.includes(String(cid));
    });

    // If everything was seen already, you can either:
    // A) allow repeats (fallback to full list)
    // B) return 404 saying none left
    // Here we do A) fallback to repeats to keep the game running
    const pool = unseen.length > 0 ? unseen : allCandidates;

    // 5) Choose random challenge
    const picked = pool[Math.floor(Math.random() * pool.length)];
    const pickedId = picked?.fields?.challenge_id;

    if (pickedId === undefined || pickedId === null) {
      return jsonResponse(res, 500, { error: "challenge_id_missing_in_record" });
    }

    // 6) Update session.seen_ids by appending pickedId (string)
    const nextSeen = Array.from(new Set([...seen, String(pickedId)]));
    const nextSeenText = JSON.stringify(nextSeen);

    await airtableFetch(
      `/${baseId}/${encodeURIComponent(sessionsTable)}/${sessionRecord.id}`,
      {
        method: "PATCH",
        body: {
          fields: {
            seen_ids: nextSeenText,
          },
        },
      }
    );

    // 7) Return the challenge
    return jsonResponse(res, 200, {
      status: "ok",
      session_id,
      filters,
      seen_ids: nextSeen,
      challenge: {
        challenge_id: picked.fields.challenge_id,
        challenge_text: picked.fields.challenge_text,
        group_type: picked.fields.group_type,
        mode: picked.fields.mode,
        difficulty: picked.fields.difficulty,
        language: picked.fields.language,
      },
    });
  } catch (err) {
    console.error("challenge-next error:", err);
    return jsonResponse(res, 500, { error: "Internal server error" });
  }
}
