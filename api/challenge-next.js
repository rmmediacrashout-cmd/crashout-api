// api/challenge-next.js

export default async function handler(req, res) {
  // --- CORS (wichtig für Bravo / Browser / Console-Tests) ---
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  // Preflight sofort beantworten (sonst: "pending" + Timeouts)
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  // Nur POST erlauben
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const {
      AIRTABLE_PAT,
      AIRTABLE_BASE_ID,
      AIRTABLE_CHALLENGES_TABLE,
    } = process.env;

    if (!AIRTABLE_PAT || !AIRTABLE_BASE_ID || !AIRTABLE_CHALLENGES_TABLE) {
      return res.status(500).json({
        error: "Missing env vars",
        detail: {
          AIRTABLE_PAT: !!AIRTABLE_PAT,
          AIRTABLE_BASE_ID: !!AIRTABLE_BASE_ID,
          AIRTABLE_CHALLENGES_TABLE: !!AIRTABLE_CHALLENGES_TABLE,
        },
      });
    }

    const { session_id } = req.body || {};
    if (!session_id) {
      return res.status(400).json({ error: "Missing session_id" });
    }

    // Airtable: nur aktive Challenges
    const table = encodeURIComponent(AIRTABLE_CHALLENGES_TABLE);
    const filter = encodeURIComponent("{status}='active'");
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${table}?filterByFormula=${filter}&maxRecords=50`;

    const r = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${AIRTABLE_PAT}`,
        "Content-Type": "application/json",
      },
    });

    const data = await r.json();

    if (!r.ok) {
      return res.status(422).json({
        error: "airtable_fetch_failed",
        status: r.status,
        detail: data,
      });
    }

    const records = data.records || [];
    if (records.length === 0) {
      return res.status(404).json({ error: "No active challenges found" });
    }

    // Zufällige Challenge
    const randomIndex = Math.floor(Math.random() * records.length);
    const rec = records[randomIndex];
    const f = rec.fields || {};

    return res.status(200).json({
      status: "ok",
      session_id,
      // was zurückkommt (passt zu deinen Airtable-Feldnamen)
      challenge_id: f.challenge_id ?? null,
      challenge_text: f.challenge_text ?? null,
      group_type: f.group_type ?? null,
      mode: f.mode ?? null,
      difficulty: f.difficulty ?? null,
      language: f.language ?? null,
      airtable_record_id: rec.id,
    });
  } catch (err) {
    console.error("challenge-next error:", err);
    return res.status(500).json({
      error: "internal_server_error",
      detail: String(err?.message || err),
    });
  }
}
