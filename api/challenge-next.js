// api/challenge-next.js
import {
  airtableFetch,
  getEnvVars,
  jsonResponse,
  optionsResponse,
  readJsonBody,
} from "./_airtable.js";

export async function OPTIONS(req, res) {
  return optionsResponse(res);
}

export default async function handler(req, res) {
  try {
    if (req.method === "OPTIONS") return optionsResponse(res);
    if (req.method !== "POST") {
      return jsonResponse(res, 405, { error: "Method not allowed" });
    }

    const { baseId, sessionsTable, challengesTable } = getEnvVars();

    const body = await readJsonBody(req);
    const session_id = (body.session_id || "").trim();

    if (!session_id) {
      return jsonResponse(res, 400, { status: "error", error: "missing_session_id" });
    }

    // 1) Session holen
    const sessionFormula = `{session_id}='${session_id}'`;
    const sessResp = await airtableFetch(
      `/v0/${baseId}/${encodeURIComponent(sessionsTable)}?filterByFormula=${encodeURIComponent(
        sessionFormula
      )}&maxRecords=1`
    );

    if (!sessResp.ok) {
      return jsonResponse(res, 502, {
        status: "error",
        error: "airtable_session_fetch_failed",
        airtable_status: sessResp.status,
        airtable_error: sessResp.data ?? null,
        session_id,
      });
    }

    const srec = sessResp.data?.records?.[0];
    if (!srec) {
      return jsonResponse(res, 404, { status: "error", error: "session_not_found", session_id });
    }

    const s = srec.fields || {};

    const group_type = s.play_with || null;
    const mode = s.alcohol || null;
    const difficulty = s.level || null;

    // ✅ Ergänzung #1: Wenn Filter fehlen → sofort harter Fehler (macht Bugs sichtbar)
    if (!group_type || !mode || !difficulty) {
      return jsonResponse(res, 400, {
        status: "error",
        error: "session_filters_missing",
        session_id,
        session_fields: s,
        missing: {
          play_with: !group_type,
          alcohol: !mode,
          level: !difficulty,
        },
      });
    }

    const filterObj = { group_type, mode, difficulty };

    // 2) Challenges Formel bauen
    const parts = ["{status}='active'"];
    if (group_type) parts.push(`{group_type}='${group_type}'`);
    if (mode) parts.push(`{mode}='${mode}'`);
    if (difficulty) parts.push(`{difficulty}='${difficulty}'`);

    const formula = `AND(${parts.join(",")})`;

    // 3) Challenges holen
    const chResp = await airtableFetch(
      `/v0/${baseId}/${encodeURIComponent(challengesTable)}?filterByFormula=${encodeURIComponent(
        formula
      )}`
    );

    if (!chResp.ok) {
      return jsonResponse(res, 502, {
        status: "error",
        error: "airtable_challenges_fetch_failed",
        airtable_status: chResp.status,
        airtable_error: chResp.data ?? null,
        session_id,
        filter: filterObj,
        formula,
      });
    }

    const records = chResp.data?.records ?? [];

    // 4) seen_ids lesen
    let seen = [];
    try {
      const raw = s.seen_ids;
      if (typeof raw === "string") seen = JSON.parse(raw || "[]");
      else if (Array.isArray(raw)) seen = raw;
    } catch {
      seen = [];
    }

    // 5) unseen pool bilden
    const unseen = records.filter((r) => {
      const cid = r.fields?.challenge_id;
      return cid != null && !seen.includes(cid);
    });

    const pool = unseen.length ? unseen : records;

    if (!pool.length) {
      return jsonResponse(res, 404, {
        status: "error",
        error: "no_challenges_found",
        session_id,
        filter: filterObj,
        formula,
      });
    }

    // 6) random pick
    const pick = pool[Math.floor(Math.random() * pool.length)];
    const challenge = pick.fields;

    // 7) seen_ids updaten
    const pickedId = challenge?.challenge_id;
    const updatedSeen = pickedId != null ? Array.from(new Set([...seen, pickedId])) : seen;

    await airtableFetch(`/v0/${baseId}/${encodeURIComponent(sessionsTable)}/${srec.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        fields: {
          seen_ids: JSON.stringify(updatedSeen),
        },
      }),
    });

    // ✅ Ergänzung #2: session_fields zusätzlich zurückgeben (macht Debug in Bravo easy)
    return jsonResponse(res, 200, {
      status: "ok",
      session_id,
      challenge,
      seen_ids: updatedSeen,
      session_fields: s,
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
