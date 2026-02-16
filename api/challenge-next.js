import { airtableFetch, getEnv, jsonResponse, optionsResponse } from "./_airtable.js";

export async function OPTIONS() {
  return optionsResponse();
}

export default async function handler(req, res) {
  // CORS Preflight
  if (req.method === "OPTIONS") return optionsResponse(res);

  // Nur POST erlauben
  if (req.method !== "POST") {
    return jsonResponse(res, 405, { error: "Method not allowed" });
  }

  try {
    const { baseId, challengesTable, sessionsTable } = getEnv();

    const { session_id } = req.body || {};
    if (!session_id) {
      return jsonResponse(res, 400, { error: "Missing session_id" });
    }

    // 1) Session in Airtable finden (über session_id Feld)
    const sessionLookup = await airtableFetch(
      `/${baseId}/${encodeURIComponent(sessionsTable)}?filterByFormula=${encodeURIComponent(
        `{session_id}="${session_id}"`
      )}&maxRecords=1`
    );

    if (!sessionLookup.ok) {
      return jsonResponse(res, 500, {
        error: "airtable_sessions_fetch_failed",
        detail: sessionLookup,
      });
    }

    const sessionRecord = sessionLookup.data?.records?.[0];
    if (!sessionRecord) {
      return jsonResponse(res, 404, { error: "session_not_found" });
    }

    const sessionFields = sessionRecord.fields || {};
    const seenRaw = sessionFields.seen_ids;

    // 2) seen_ids robust parsen (Long text)
    let seenIds = [];
    if (typeof seenRaw === "string" && seenRaw.trim().length > 0) {
      try {
        const parsed = JSON.parse(seenRaw);
        if (Array.isArray(parsed)) seenIds = parsed;
      } catch (e) {
        // Fallback: alle "rec...." IDs aus dem Text ziehen
        const matches = seenRaw.match(/rec[a-zA-Z0-9]+/g);
        if (matches) seenIds = matches;
      }
    }

    // Duplikate entfernen
    seenIds = Array.from(new Set(seenIds));

    // 3) Filter (aus Session-Feldern) für Challenges bauen
    //    Wichtig: diese Werte müssen exakt so heißen wie in Airtable (Single Select)
    const groupType = sessionFields.play_with || sessionFields.group_type || null;
    const mode = sessionFields.alcohol || sessionFields.mode || null;
    const difficulty = sessionFields.level || sessionFields.difficulty || null;

    // Airtable FilterByFormula
    const formulaParts = [`{status}="active"`];
    if (groupType) formulaParts.push(`{group_type}="${groupType}"`);
    if (mode) formulaParts.push(`{mode}="${mode}"`);
    if (difficulty) formulaParts.push(`{difficulty}="${difficulty}"`);

    const filterFormula = `AND(${formulaParts.join(",")})`;

    // 4) Challenges laden (limitiert; reicht für MVP)
    const challengesResp = await airtableFetch(
      `/${baseId}/${encodeURIComponent(challengesTable)}?filterByFormula=${encodeURIComponent(
        filterFormula
      )}&maxRecords=100`
    );

    if (!challengesResp.ok) {
      return jsonResponse(res, 500, {
        error: "airtable_challenges_fetch_failed",
        detail: challengesResp,
      });
    }

    const challenges = challengesResp.data?.records || [];
    if (challenges.length === 0) {
      return jsonResponse(res, 404, {
        error: "no_matching_challenges_found",
        filter: { group_type: groupType, mode, difficulty },
      });
    }

    // 5) Bereits gesehene rausfiltern
    const unseen = challenges.filter((c) => !seenIds.includes(c.id));

    // Wenn alles gesehen wurde: optional reset (für MVP sinnvoll)
    // -> dann darf wieder von vorne gestartet werden
    const pool = unseen.length > 0 ? unseen : challenges;

    // 6) Random auswählen
    const pick = pool[Math.floor(Math.random() * pool.length)];

    // 7) seen_ids updaten (append), aber nur wenn es nicht schon drin ist
    if (!seenIds.includes(pick.id)) seenIds.push(pick.id);

    const updateResp = await airtableFetch(
      `/${baseId}/${encodeURIComponent(sessionsTable)}/${pickSafeId(sessionRecord.id)}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          fields: {
            seen_ids: JSON.stringify(seenIds),
          },
        }),
      }
    );

    if (!updateResp.ok) {
      // Wir geben trotzdem die Challenge zurück, aber melden Update-Fehler
      return jsonResponse(res, 200, {
        status: "ok",
        session_id,
        warning: "seen_ids_update_failed",
        challenge: mapChallenge(pick),
        filter: { group_type: groupType, mode, difficulty },
        detail: updateResp,
      });
    }

    // 8) Antwort
    return jsonResponse(res, 200, {
      status: "ok",
      session_id,
      challenge: mapChallenge(pick),
      filter: { group_type: groupType, mode, difficulty },
      seen_ids: seenIds, // hilfreich fürs Debugging
    });
  } catch (err) {
    console.error("challenge-next error:", err);
    return jsonResponse(res, 500, { error: "internal_server_error" });
  }
}

// Airtable record IDs sind safe, aber wir kapseln es sauber
function pickSafeId(id) {
  return encodeURIComponent(id);
}

function mapChallenge(record) {
  const f = record.fields || {};
  return {
    id: record.id, // Airtable Record ID (wichtig für seen_ids)
    challenge_id: f.challenge_id,
    challenge_text: f.challenge_text,
    group_type: f.group_type,
    mode: f.mode,
    difficulty: f.difficulty,
    status: f.status,
  };
}
