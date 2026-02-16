import {
  airtableFetch,
  getEnv,
  jsonResponse,
  optionsResponse,
} from "./_airtable.js";

export async function OPTIONS() {
  return optionsResponse();
}

// Hilfsfunktionen
function safeParseJsonArray(value) {
  if (!value || typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
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

    // 1) Session-Datensatz holen (über session_id)
    const sessResp = await airtableFetch(
      `/${baseId}/${encodeURIComponent(
        sessionsTable
      )}?filterByFormula=${encodeURIComponent(`{session_id}='${session_id}'`)}&maxRecords=1`
    );

    const sessRec = sessResp?.records?.[0];
    if (!sessRec) {
      return jsonResponse(404, { error: "Session not found" });
    }

    const sessFields = sessRec.fields || {};

    const play_with = sessFields.play_with;
    const alcohol = sessFields.alcohol;
    const location = sessFields.location;
    const level = sessFields.level; // optional

    // 2) seen_ids aus Long text als JSON-Array lesen
    const seenIds = safeParseJsonArray(sessFields.seen_ids);

    // 3) Airtable Filter bauen: active + matching session categories
    //    Achtung: Feldnamen müssen exakt so heißen wie in Airtable:
    //    Challenges: status, group_type, mode, difficulty, language, challenge_text, challenge_id
    const conditions = [
      `{status}='active'`,
      play_with ? `{group_type}='${play_with}'` : null,
      alcohol ? `{mode}='${alcohol}'` : null,
      // location gibt es in Challenges ggf. NICHT → dann NICHT filtern
      // location ? `{location}='${location}'` : null,
      level ? `{difficulty}='${level}'` : null,
    ].filter(Boolean);

    // 4) Exclude bereits gesehene Challenge-RecordIDs (wenn vorhanden)
    //    Wir speichern RECORD_ID()s im seen_ids Array, z.B. "recXXXX"
    //    -> NOT(OR(RECORD_ID()='rec1', RECORD_ID()='rec2', ...))
    let excludeSeenFormula = "";
    if (seenIds.length > 0) {
      const orParts = seenIds.map((id) => `RECORD_ID()='${id}'`);
      excludeSeenFormula = `NOT(OR(${orParts.join(",")}))`;
      conditions.push(excludeSeenFormula);
    }

    const filterFormula =
      conditions.length > 1 ? `AND(${conditions.join(",")})` : conditions[0];

    // 5) Passende Challenges holen (limit, damit schnell)
    const challResp = await airtableFetch(
      `/${baseId}/${encodeURIComponent(
        challengesTable
      )}?filterByFormula=${encodeURIComponent(filterFormula)}&maxRecords=50`
    );

    const challenges = challResp?.records || [];
    if (challenges.length === 0) {
      // Falls alles "gesehen" ist oder Filter zu strikt
      return jsonResponse(404, {
        error: "No challenges found",
        detail: {
          filterFormula,
          seen_count: seenIds.length,
        },
      });
    }

    // 6) Zufällig eine ziehen
    const chosen = pickRandom(challenges);

    // 7) chosen RECORD_ID in seen_ids speichern
    const newSeen = Array.from(new Set([...seenIds, chosen.id]));
    await airtableFetch(
      `/${baseId}/${encodeURIComponent(sessionsTable)}/${sessRec.id}`,
      {
        method: "PATCH",
        body: {
          fields: {
            seen_ids: JSON.stringify(newSeen),
          },
        },
      }
    );

    // 8) Antwort an App / Bravo
    return jsonResponse(200, {
      status: "ok",
      session_id,
      challenge: {
        airtable_record_id: chosen.id,
        challenge_id: chosen.fields?.challenge_id ?? null,
        challenge_text: chosen.fields?.challenge_text ?? "",
        group_type: chosen.fields?.group_type ?? null,
        mode: chosen.fields?.mode ?? null,
        difficulty: chosen.fields?.difficulty ?? null,
        language: chosen.fields?.language ?? null,
      },
      seen_count: newSeen.length,
    });
  } catch (err) {
    console.error("challenge-next error:", err);
    return jsonResponse(500, { error: "Internal server error" });
  }
}
