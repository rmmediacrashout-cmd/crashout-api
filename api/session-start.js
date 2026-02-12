import { airtableFetch, getEnv, makeSessionId } from "./_airtable.js";

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

export default async function handler(req, res) {
  setCors(res);

  // ✅ Preflight sofort beantworten (wichtig!)
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  // Nur POST erlauben
  if (req.method !== "POST") {
    return res.status(405).json({ status: "error", error: "Method not allowed" });
  }

  try {
    const { baseId, sessionsTable } = getEnv();

    const body = req.body || {};
    const { device_id, play_with, alcohol, location } = body;

    if (!device_id || !play_with || !alcohol || !location) {
      return res.status(400).json({
        status: "error",
        error: "Missing required fields",
      });
    }

    const session_id = makeSessionId();

    const create = await airtableFetch(
      `/${baseId}/${encodeURIComponent(sessionsTable)}`,
      {
        method: "POST",
        body: {
          records: [
            {
              fields: {
                session_id,
                device_id,
                play_with,
                alcohol,
                location,
                seen_ids: "[]",
              },
            },
          ],
        },
      }
    );

    if (!create.ok) {
      return res.status(create.status || 500).json({
        status: "error",
        error: "airtable_create_failed",
        detail: create.json,
      });
    }

    return res.status(200).json({ status: "ok", session_id });
  } catch (e) {
    return res.status(500).json({
      status: "error",
      error: "server_error",
      message: String(e?.message || e),
    });
  }
}
