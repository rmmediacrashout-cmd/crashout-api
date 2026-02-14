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
    console.log("STEP 1: Request received");

    const { baseId, challengesTable } = getEnv();
    console.log("STEP 2: ENV loaded", baseId, challengesTable);

    const body = req.body;
    console.log("STEP 3: Body", body);

    if (!body.session_id) {
      return jsonResponse(400, { error: "Missing session_id" });
    }

    console.log("STEP 4: Fetching Airtable...");

    const response = await airtableFetch(
      `/${baseId}/${encodeURIComponent(challengesTable)}?maxRecords=1`
    );

    console.log("STEP 5: Airtable response received");

    const data = await response.json();
    console.log("STEP 6: Parsed JSON", data);

    if (!data.records || data.records.length === 0) {
      return jsonResponse(404, { error: "No challenges found" });
    }

    const record = data.records[0];

    return jsonResponse(200, {
      challenge_id: record.id,
      challenge_text: record.fields.challenge_text
    });

  } catch (error) {
    console.error("ERROR:", error);
    return jsonResponse(500, { error: "Internal error", detail: error.message });
  }
}
