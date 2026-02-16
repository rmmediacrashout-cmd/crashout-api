// api/challenge-next.js

import { airtableFetch, getEnv, jsonResponse, optionsResponse } from "./_airtable.js";

export async function OPTIONS(req, res) {
  return optionsResponse(res);
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") return optionsResponse(res);
  if (req.method !== "POST") return jsonResponse(res, 405, { error: "Method not allowed" });

  try {
    const { baseId, challengesTable } = getEnv();
    const { session_id } = req.body || {};

    if (!session_id) {
      return jsonResponse(res, 400, { error: "Missing session_id" });
    }

    // 1) Aktive Challenges laden
    // Hinweis: filterByFormula ist empfindlich bzgl. Feldnamen & Values.
    // Hier: Feld "status" muss in Airtable existieren und den Wert "active" haben.
    const path =
      `/${baseId}/${encodeURIComponent(challengesTable)}` +
      `?filterByFormula=${encodeURIComponent("{status}='active'")}` +
      `&maxRecords=50`;

    const resp = await airtableFetch(path, { method: "GET" });

    if (!resp.ok) {
      // WICHTIG: Wir geben dir Airtable Status + Body zurück (ohne Token)
      return jsonResponse(res, 500, {
        error: "airtable_challenges_fetch_failed",
        airtable_status: resp.status,
        airtable_body: resp.raw,
        hint:
          "Prüfe AIRTABLE_CHALLENGES_TABLE (Name/ID), Base-ID, und ob PAT Zugriff auf diese Tabelle hat.",
      });
    }

    const records = Array.isArray(resp.data?.records) ? resp.data.records : [];
    if (records.length === 0) {
      return jsonResponse(res, 404, {
        error: "no_matching_challenges_found",
        filter: { status: "active" },
      });
    }

    // 2) Zufällige Challenge zurückgeben
    const randomIndex = Math.floor(Math.random() * records.length);
    const challenge = records[randomIndex];

    return jsonResponse(res, 200, {
      status: "ok",
      session_id,
      challenge: {
        id: challenge.id,
        // diese Felder müssen natürlich in Airtable existieren
        challenge_id: challenge.fields?.challenge_id ?? null,
        challenge_text: challenge.fields?.challenge_text ?? null,
        group_type: challenge.fields?.group_type ?? null,
        mode: challenge.fields?.mode ?? null,
        difficulty: challenge.fields?.difficulty ?? null,
        status: challenge.fields?.status ?? null,
      },
    });
  } catch (err) {
    console.error("challenge-next error:", err);
    return jsonResponse(res, 500, {
      error: "internal_server_error",
      message: String(err?.message || err),
    });
  }
}
