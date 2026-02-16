// api/challenge-next.js

import { airtableFetch, getEnv, jsonResponse, optionsResponse, readJsonBody } from "./_airtable.js";

function escapeAirtableValue(v) {
  // Airtable Formulas: Strings müssen "..." sein und Quotes doppeln
  return String(v).replace(/"/g, '\\"');
}

function parseSeenIds(seenText) {
  if (!seenText) return [];
  if (Array.isArray(seenText)) return seenText; // falls Airtable mal anders liefert
  try {
    const arr = JSON.parse(seenText);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export default async function handler(req, res) {
  try {
    if (req.method === "OPTIONS") return optionsResponse(res);
    if (req.method !== "POST") return jsonResponse(res, 405, { error: "Method not allowed" });

    const body = await readJsonBody(req);
    if (!body) return jsonResponse(res, 400, { error: "Invalid JSON body" });

    const { session_id } = body;
    if (!session_id) return jsonResponse(res, 400, { error: "Missing session_id" });

    const { baseId, challengesTable, sessionsTable } = getEnv();

    // 1) Session laden (damit wir Filterwerte + seen_ids haben)
    const sessResp = await airtableFetch(
      `/${baseId}/${encodeURIComponent(sessionsTable)}?filterByFormula=${encodeURIComponent(
        `{session_id}="${escapeAirtableValue(session_id)}"`
      )}&maxRecords=1`
    );

    const sessRecord = sessResp.data?.records?.[0];
    if (!sessResp.ok || !sessRecord) {
      return jsonResponse(res, 404, { error: "session_not_found" });
    }

    const sessFields = sessRecord.fields || {};
    const seenIds = parseSeenIds(sessFields.seen_ids);

    // 2) Filter aus Session bauen (nur Felder, die existieren/gefüllt sind)
    // Achtung: Feldnamen hier müssen zu deinen Challenge-Feldnamen passen!
    // In deiner Console war z.B. filter: { group_type:'friends', mode:'non-alcohol' }
    const parts = [`{status}="active"`];

    if (sessFields.play_with) parts.push(`{group_type}="${escapeAirtableValue(sessFields.play_with)}"`);
    if (sessFields.alcohol) parts.push(`{mode}="${escapeAirtableValue(sessFields.alcohol)}"`);
    if (sessFields.location) parts.push(`{location}="${escapeAirtableValue(sessFields.location)}"`);
    if (sessFields.level) parts.push(`{level}="${escapeAirtableValue(sessFields.level)}"`);

    const filterFormula = `AND(${parts.join(",")})`;

    // 3) Challenges laden
    const challResp = await airtableFetch(
      `/${baseId}/${encodeURIComponent(challengesTable)}?filterByFormula=${encodeURIComponent(filterFormula)}&maxRecords=100`
    );

    if (!challResp.ok) {
      return jsonResponse(res, 500, { error: "airtable_challenges_fetch_failed", detail: challResp.data || challResp.raw });
    }

    const challenges = challResp.data?.records || [];
    if (challenges.length === 0) {
      return jsonResponse(res, 404, {
        error: "no_matching_challenges_found",
        filter: { formula: filterFormula },
      });
    }

    // 4) “ungesehene” Challenges priorisieren
    const unseen = challenges.filter((r) => {
      const cid = r.fields?.challenge_id;
      return cid && !seenIds.includes(cid);
    });

    const pool = unseen.length ? unseen : challenges;
    const picked = pool[Math.floor(Math.random() * pool.length)];
    const pickedId = picked.fields?.challenge_id;

    // 5) seen_ids updaten (nur wenn challenge_id existiert)
    if (pickedId) {
      const newSeen = unseen.length ? [...seenIds, pickedId] : [pickedId]; // wenn alles gesehen -> reset auf [picked]
      const updateResp = await airtableFetch(
        `/${baseId}/${encodeURIComponent(sessionsTable)}/${encodeURIComponent(sessRecord.id)}`,
        {
          method: "PATCH",
          body: JSON.stringify({ fields: { seen_ids: JSON.stringify(newSeen) } }),
        }
      );

      if (!updateResp.ok) {
        // Challenge trotzdem zurückgeben, aber Update-Problem sichtbar machen
        return jsonResponse(res, 200, {
          status: "ok",
          warning: "seen_ids_update_failed",
          challenge: picked.fields || {},
          filter: { formula: filterFormula },
          seen_ids_before: seenIds,
          detail: updateResp.data || updateResp.raw,
        });
      }
    }

    // 6) Response
    return jsonResponse(res, 200, {
      status: "ok",
      challenge: picked.fields || {},
      filter: { formula: filterFormula },
    });
  } catch (err) {
    return jsonResponse(res, 500, {
      status: "error",
      error: "internal_server_error",
      message: err?.message || String(err),
    });
  }
}
