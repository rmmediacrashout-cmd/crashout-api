import { airtableFetch, getEnv, jsonResponse, optionsResponse, safeParseJsonArray } from "./_airtable.js";

export async function OPTIONS() {
  return optionsResponse();
}

// kleine Helfer, damit nichts 300 Sekunden hängt
function withTimeout(promise, ms, label = "timeout") {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(label)), ms)),
  ]);
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export default async function handler(req, res) {
  try {
    // CORS preflight
    if (req.method === "OPTIONS") return optionsResponse();

    // Nur POST erlauben
    if (req.method !== "POST") {
      return jsonResponse(405, { status: "error", error: "Method not allowed" });
    }

    const env = getEnv();
    const baseId = env.baseId;
    const sessionsTable = env.sessionsTable || env.sessions_table || process.env.AIRTABLE_SESSIONS_TABLE;
    const challengesTable = env.challengesTable || env.challenges_table || process.env.AIRTABLE_CHALLENGES_TABLE;

    if (!baseId || !sessionsTable || !challengesTable) {
      return jsonResponse(500, {
        status: "error",
        error: "missing_env",
        detail: { baseId: !!baseId, sessionsTable: !!sessionsTable, challengesTable: !!challengesTable },
      });
    }

    const body = req.body || {};
    const session_id = body.session_id;

    if (!session_id) {
      return jsonResponse(400, { status: "error", error: "Missing session_id" });
    }

    // 1) Session laden
    const sessionParams = new URLSearchParams({
      maxRecords: "1",
      filterByFormula: `{session_id}='${String(session_id).replaceAll("'", "\\'")}'`,
    });

    const sessionResp = await withTimeout(
      airtableFetch(`/${baseId}/${encodeURIComponent(sessionsTable)}?${sessionParams.toString()}`, "GET"),
      12000,
      "airtable_session_fetch_timeout"
    );

    if (!sessionResp?.ok) {
      return jsonResponse(422, {
        status: "error",
        error: "airtable_session_fetch_failed",
        detail: sessionResp?.json || null,
      });
    }

    const sessionRecord = (sessionResp.json?.records || [])[0];
    if (!sessionRecord) {
      return jsonResponse(404, { status: "error", error: "session_not_found" });
    }

    const sf = sessionRecord.fields || {};

    // Session-Felder (aus deiner Sessions-Base)
    const group_type = sf.group_type || sf.play_with; // fallback falls du das in Sessions anders benannt hast
    const mode = sf.mode || sf.alcohol;
    const difficulty = sf.difficulty || sf.level;
    const language = sf.language || "deutsch";

    // seen_ids robust lesen (kann Array sein oder JSON-String)
    let seen_ids = sf.seen_ids;
    if (typeof seen_ids === "string") seen_ids = safeParseJsonArray(seen_ids);
    if (!Array.isArray(seen_ids)) seen_ids = [];

    if (!group_type || !mode || !difficulty) {
      return jsonResponse(422, {
        status: "error",
        error: "session_fields_missing",
        detail: { group_type, mode, difficulty, language },
      });
    }

    // 2) Challenges holen (nur passende Filter, Rest filtern wir in JS)
    const challengeParams = new URLSearchParams({
      maxRecords: "200",
      filterByFormula:
        `AND(` +
        `{status}='active',` +
        `{group_type}='${String(group_type).replaceAll("'", "\\'")}',` +
        `{mode}='${String(mode).replaceAll("'", "\\'")}',` +
        `{difficulty}='${String(difficulty).replaceAll("'", "\\'")}',` +
        `{language}='${String(language).replaceAll("'", "\\'")}'` +
        `)`,
    });

    const challResp = await withTimeout(
      airtableFetch(`/${baseId}/${encodeURIComponent(challengesTable)}?${challengeParams.toString()}`, "GET"),
      12000,
      "airtable_challenges_fetch_timeout"
    );

    if (!challResp?.ok) {
      return jsonResponse(422, {
        status: "error",
        error: "airtable_challenges_fetch_failed",
        detail: challResp?.json || null,
      });
    }

    const all = challResp.json?.records || [];

    // 3) Auswählen (ohne Endlosschleife)
    const unseen = all.filter(r => {
      const cid = r?.fields?.challenge_id;
      return cid != null && !seen_ids.includes(cid);
    });

    let chosen = null;

    if (unseen.length > 0) {
      chosen = pickRandom(unseen);
    } else if (all.length > 0) {
      // Alles “gesehen” -> wir resetten sinnvollerweise die seen_ids
      chosen = pickRandom(all);
      seen_ids = [];
    } else {
      return jsonResponse(404, { status: "error", error: "no_matching_challenges" });
    }

    const chosenFields = chosen.fields || {};
    const chosenId = chosenFields.challenge_id;

    // 4) Session updaten: seen_ids +1
    const newSeen = [...seen_ids, chosenId];

    const updateResp = await withTimeout(
      airtableFetch(`/${baseId}/${encodeURIComponent(sessionsTable)}`, "PATCH", {
        records: [
          {
            id: sessionRecord.id,
            fields: {
              seen_ids: JSON.stringify(newSeen),
            },
          },
        ],
      }),
      12000,
      "airtable_session_update_timeout"
    );

    if (!updateResp?.ok) {
      return jsonResponse(422, {
        status: "error",
        error: "airtable_session_update_failed",
        detail: updateResp?.json || null,
      });
    }

    // 5) Antwort
    return jsonResponse(200, {
      status: "ok",
      challenge: {
        challenge_id: chosenFields.challenge_id,
        challenge_text: chosenFields.challenge_text,
        group_type: chosenFields.group_type,
        mode: chosenFields.mode,
        difficulty: chosenFields.difficulty,
        language: chosenFields.language,
      },
      meta: {
        used_session: { group_type, mode, difficulty, language },
        counts: { total: all.length, unseen: unseen.length },
      },
    });
  } catch (e) {
    return jsonResponse(500, { status: "error", error: "server_error", detail: String(e?.message || e) });
  }
}
