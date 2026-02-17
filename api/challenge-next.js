// api/challenge-next.js
import { airtableFetch, getEnvVars, jsonResponse, optionsResponse, readJsonBody } from "./_airtable.js";

export async function OPTIONS(req, res) {
  return optionsResponse(res);
}

export default async function handler(req, res) {
  try {
    if (req.method === "OPTIONS") return optionsResponse(res);
    if (req.method !== "POST") return jsonResponse(res, 405, { error: "Method not allowed" });

    const { baseId, challengesTable, sessionsTable } = getEnvVars();
    const body = await readJsonBody(req);

    const { session_id } = body || {};
    if (!session_id) {
      return jsonResponse(res, 400, { status: "error", error: "missing_session_id" });
    }

    // 1) Session laden
    const sessResp = await airtableFetch(
      `/${baseId}/${encodeURIComponent(sessionsTable)}?filterByFormula=${encodeURIComponent(
        `{session_id}='${session_id}'`
      )}&maxRecords=1`,
      { method: "GET" }
    );

    if (!sessResp.ok) {
      return jsonResponse(res, 500, {
        status: "error",
        error: "airtable_sessions_fetch_failed",
        detail: sessResp.data || sessResp.text,
      });
    }

    const sessionRecord = sessResp.data?.records?.[0];
    if (!sessionRecord) {
      return jsonResponse(res, 404, { status: "error", error: "session_not_found" });
    }

    const s = sessionRecord.fields || {};
    const group_type = s.play_with || null;
    const mode = s.alcohol || null;
    const difficulty = s.level || null;

    // seen_ids: long-text JSON array string => robust parsen
    let seen = [];
    try {
      if (typeof s.seen_ids === "string" && s.seen_ids.trim() !== "") {
        const parsed = JSON.parse(s.seen_ids);
        if (Array.isArray(parsed)) seen = parsed;
      } else if (Array.isArray(s.seen_ids)) {
        // falls es doch mal als Array ankommt
        seen = s.seen_ids;
      }
    } catch (_) {
      seen = [];
    }

    // 2) Filter bauen
    const parts = ["{status}='active'"];
    const filterObj = {};
    if (group_type) {
      parts.push(`{group_type}='${group_type}'`);
      filterObj.group_type = group_type;
    }
    if (mode) {
      parts.push(`{mode}='${mode}'`);
      filterObj.mode = mode;
    }
    if (difficulty) {
      parts.push(`{difficulty}='${difficulty}'`);
      filterObj.difficulty = difficulty;
    }
    const formula = `AND(${parts.join(",")})`;

    // 3) Challenges holen
    const chResp = await airtableFetch(
      `/${baseId}/${encodeURIComponent(challengesTable)}?filterByFormula=${encodeURIComponent(formula)}&maxRecords=100`,
      { method: "GET" }
    );

    if (!chResp.ok) {
      return jsonResponse(res, 500, {
        status: "error",
        error: "airtable_challenges_fetch_failed",
        detail: chResp.data || chResp.text,
      });
    }

    const records = chResp.data?.records || [];
    if (records.length === 0) {
      return jsonResponse(res, 404, {
        status: "error",
        error: "no_matching_challenges_found",
        filter: filterObj,
        formula,
      });
    }

    // 4) Ungesehene filtern (via challenge_id)
    const unseen = records.filter((r) => {
      const cid = r.fields?.challenge_id;
      return cid != null && !seen.includes(cid);
    });

    // Fallback: wenn alle schon gesehen -> wieder alles zulassen
    const pool = unseen.length > 0 ? unseen : records;

    // 5) Random pick
    const pick = pool[Math.floor(Math.random() * pool.length)];

    const challenge = {
      id: pick.id,
      challenge_id: pick.fields?.challenge_id,
      challenge_text: pick.fields?.challenge_text,
      group_type: pick.fields?.group_type,
      mode: pick.fields?.mode,
      difficulty: pick.fields?.difficulty,
      status: pick.fields?.status,
    };

    // 6) seen_ids updaten (long-text JSON array string)
    const pickedCid = challenge.challenge_id;
    let updatedSeen = seen;

    if (pickedCid != null && !seen.includes(pickedCid)) {
      updatedSeen = [...seen, pickedCid];

      const patchResp = await airtableFetch(
        `/${baseId}/${encodeURIComponent(sessionsTable)}/${sessionRecord.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            fields: {
              // ✅ long-text -> JSON array als STRING speichern
              seen_ids: JSON.stringify(updatedSeen),
              // ❌ updated_at NICHT setzen (computed/last modified in Airtable)
            },
          }),
        }
      );

      if (!patchResp.ok) {
        // Challenge trotzdem liefern – nur warning ausgeben
        return jsonResponse(res, 200, {
          status: "ok",
          session_id,
          challenge,
          warning: "seen_ids_update_failed",
          seen_ids_before: seen,
          detail: patchResp.data || patchResp.text,
        });
      }
    }

    return jsonResponse(res, 200, {
      status: "ok",
      session_id,
      challenge,
      seen_ids: updatedSeen,
      filter: filterObj,
      formula,
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
