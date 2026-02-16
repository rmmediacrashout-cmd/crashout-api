// api/challenge-next.js

import {
  airtableFetch,
  escapeFormulaString,
  getEnv,
  jsonResponse,
  optionsResponse,
} from "./_airtable.js";

function safeParseSeenIds(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value; // falls es doch mal als array reinkommt
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
  if (req.method === "OPTIONS") return optionsResponse(res);
  if (req.method !== "POST") return jsonResponse(res, 405, { error: "Method not allowed" });

  try {
    const { baseId, sessionsTable, challengesTable } = getEnv();
    const body = req.body || {};
    const session_id = body.session_id;

    if (!session_id) {
      return jsonResponse(res, 400, { error: "Missing session_id" });
    }

    // 1) Session laden
    const sessionFilter = `session_id="${escapeFormulaString(session_id)}"`;
    const sessResp = await airtableFetch(
      `/${baseId}/${encodeURIComponent(sessionsTable)}?filterByFormula=${encodeURIComponent(
        sessionFilter
      )}&maxRecords=1`
    );

    if (!sessResp.ok) {
      return jsonResponse(res, 502, { error: "airtable_session_fetch_failed", detail: sessResp.data });
    }

    const sessRec = sessResp.data?.records?.[0];
    if (!sessRec) {
      return jsonResponse(res, 404, { error: "session_not_found" });
    }

    const sessFields = sessRec.fields || {};
    const group_type = sessFields.play_with; // z.B. "friends"
    const mode = sessFields.alcohol;         // z.B. "non-alcohol"
    const seen_ids = safeParseSeenIds(sessFields.seen_ids);

    if (!group_type || !mode) {
      return jsonResponse(res, 422, {
        error: "session_missing_fields",
        need: ["play_with", "alcohol"],
        got: Object.keys(sessFields),
      });
    }

    // 2) Challenges filtern (active + passend)
    // In deiner Challenges-Tabelle heißen Felder: group_type, mode, status
    const challengeFilter = `AND(status="active", group_type="${escapeFormulaString(
      group_type
    )}", mode="${escapeFormulaString(mode)}")`;

    const chResp = await airtableFetch(
      `/${baseId}/${encodeURIComponent(challengesTable)}?filterByFormula=${encodeURIComponent(
        challengeFilter
      )}&maxRecords=200`
    );

    if (!chResp.ok) {
      return jsonResponse(res, 502, { error: "airtable_challenges_fetch_failed", detail: chResp.data });
    }

    const all = chResp.data?.records || [];
    if (all.length === 0) {
      return jsonResponse(res, 404, { error: "no_matching_challenges_found", filter: { group_type, mode } });
    }

    // 3) Unseen auswählen
    const unseen = all.filter((r) => {
      const cid = r?.fields?.challenge_id;
      return cid != null && !seen_ids.includes(cid);
    });

    const chosen = (unseen.length > 0) ? pickRandom(unseen) : pickRandom(all);

    const c = chosen.fields || {};
    const challenge_id = c.challenge_id;

    // 4) seen_ids updaten (nur wenn challenge_id existiert)
    if (challenge_id != null && !seen_ids.includes(challenge_id)) {
      const newSeen = [...seen_ids, challenge_id];
      const patch = await airtableFetch(
        `/${baseId}/${encodeURIComponent(sessionsTable)}`,
        {
          method: "PATCH",
          body: {
            records: [
              {
                id: sessRec.id, // Airtable record ID
                fields: { seen_ids: JSON.stringify(newSeen) },
              },
            ],
          },
        }
      );

      if (!patch.ok) {
        // nicht hart failen – Challenge trotzdem liefern
        console.warn("seen_ids update failed:", patch.data);
      }
    }

    // 5) Response
    return jsonResponse(res, 200, {
      status: "ok",
      session_id,
      filters: { group_type, mode },
      challenge: {
        challenge_id: c.challenge_id,
        challenge_text: c.challenge_text,
        group_type: c.group_type,
        mode: c.mode,
        difficulty: c.difficulty,
        language: c.language,
      },
    });
  } catch (e) {
    console.error("challenge-next error:", e);
    return jsonResponse(res, 500, { error: "Internal server error" });
  }
}
