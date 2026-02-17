// api/challenge-next.js
import { airtableFetch, getEnvVars, jsonResponse, optionsResponse, readJsonBody } from "./_airtable.js";

export async function OPTIONS(req, res) {
  return optionsResponse(res);
}

function safeParseSeenIds(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v; // falls Airtable mal was komisches liefert
  if (typeof v !== "string") return [];
  try {
    const parsed = JSON.parse(v);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default async function handler(req, res) {
  try {
    if (req.method === "OPTIONS") return optionsResponse(res);
    if (req.method !== "POST") return jsonResponse(res, 405, { error: "Method not allowed" });

    const { baseId, challengesTable, sessionsTable } = getEnvVars();
    const body = await readJsonBody(req);
    const session_id = body.session_id;

    if (!session_id) {
      return jsonResponse(res, 400, { status: "error", error: "missing_session_id" });
    }

    // 1) Session laden
    const sessResp = await airtableFetch(
      `/${baseId}/${encodeURIComponent(sessionsTable)}?filterByFormula=${encodeURIComponent(`{session_id}='${session_id}'`)}&maxRecords=1`,
      { method: "GET" }
    );

    if (!sessResp.ok) {
      return jsonResponse(res, 500, {
        status: "error",
        error: "airtable_session_fetch_failed",
        detail: sessResp.data || sessResp.text,
      });
    }

    const sessionRecord = sessResp.data?.records?.[0];
    if (!sessionRecord) {
      return jsonResponse(res, 404, { status: "error", error: "session_not_found" });
    }

    const s = sessionRecord.fields || {};
    const seen = safeParseSeenIds(s.seen_ids);

    // 2) Challenge-Filter aus Session bauen
    // Airtable-Felder: group_type, mode, difficulty, status (active)
    const filters = [];
    filters.push(`{status}='active'`);

    if (s.play_with) filters.push(`{group_type}='${s.play_with}'`);
    if (s.alcohol) filters.push(`{mode}='${s.alcohol}'`);
    if (s.level) filters.push(`{difficulty}='${s.level}'`);

    const formula = `AND(${filters.join(",")})`;

    const chResp = await airtableFetch(
      `/${baseId}/${encodeURIComponent(challengesTable)}?filterByFormula=${encodeURIComponent(formula)}&maxRecords=100`,
      { method: "GET" }
    );

    if (!chResp.ok) {
      return jsonResponse(res, 500, {
        status: "error",
        error: "airtable_challenges_fetch_failed",
        detail: chResp.data || chResp.text,
        formula,
      });
    }

    const challenges = chResp.data?.records || [];
    if (challenges.length === 0) {
      return jsonResponse(res, 404, {
        status: "error",
        error: "no_matching_challenges_found",
        filter: { group_type: s.play_with, mode: s.alcohol, difficulty: s.level },
        formula,
      });
    }

    // 3) Ungesehene herausfiltern
    const unseen = challenges.filter(r => {
      const cid = r.fields?.challenge_id;
      return cid != null && !seen.includes(cid);
    });

    const pickFrom = unseen.length ? unseen : challenges; // wenn alle gesehen -> wiederholen erlaubt
    const random = pickFrom[Math.floor(Math.random() * pickFrom.length)];

    const challenge = {
      id: random.id,
      challenge_id: random.fields?.challenge_id,
      challenge_text: random.fields?.challenge_text,
      group_type: random.fields?.group_type,
      mode: random.fields?.mode,
      difficulty: random.fields?.difficulty,
      status: random.fields?.status,
    };

    // 4) seen_ids updaten (nur wenn challenge_id vorhanden)
    if (challenge.challenge_id != null) {
      const updatedSeen = seen.includes(challenge.challenge_id) ? seen : [...seen, challenge.challenge_id];

      const updResp = await airtableFetch(
        `/${baseId}/${encodeURIComponent(sessionsTable)}/${sessionRecord.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            fields: {
              seen_ids: JSON.stringify(updatedSeen),
              updated_at: new Date().toISOString(),
            },
          }),
        }
      );

      if (!updResp.ok) {
        // Challenge trotzdem zurückgeben, aber warnen
        return jsonResponse(res, 200, {
          status: "ok",
          session_id,
          challenge,
          warning: "seen_ids_update_failed",
          seen_ids_before: seen,
          detail: updResp.data || updResp.text,
        });
      }
    }

    return jsonResponse(res, 200, {
      status: "ok",
      session_id,
      challenge,
      filter: { group_type: s.play_with, mode: s.alcohol, difficulty: s.level },
    });
  } catch (err) {
    console.error("challenge-next error:", err);
    return jsonResponse(res, 500, {
      status: "error",
      error: "internal_server_error",
      message: String(err?.message || err),
    });
  }
}
