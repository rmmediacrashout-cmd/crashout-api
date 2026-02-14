import { airtableFetch, getEnv, jsonResponse, optionsResponse } from "./_airtable.js";

export async function OPTIONS() {
  return optionsResponse();
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    return optionsResponse();
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  try {
    const { baseId, challengesTable } = getEnv();
    const { session_id } = req.body || {};

    if (!session_id) {
      return jsonResponse(400, { error: "Missing session_id" });
    }

    // 🔹 1. Lade ALLE aktiven Challenges (limitiert!)
    const response = await airtableFetch(
      `/${baseId}/${encodeURIComponent(challengesTable)}?filterByFormula={status}='active'&maxRecords=50`
    );

    const challenges = response.records || [];

    if (challenges.length === 0) {
      return jsonResponse(404, { error: "No active challenges found" });
    }

    // 🔹 2. Wähle zufällige Challenge
    const randomIndex = Math.floor(Math.random() * challenges.length);
    const challenge = challenges[randomIndex];

    return jsonResponse(200, {
      challenge_id: challenge.fields.challenge_id,
      challenge_text: challenge.fields.challenge_text,
      group_type: challenge.fields.group_type,
      mode: challenge.fields.mode,
      difficulty: challenge.fields.difficulty
    });

  } catch (error) {
    console.error("challenge-next error:", error);
    return jsonResponse(500, { error: "Internal server error" });
  }
}
