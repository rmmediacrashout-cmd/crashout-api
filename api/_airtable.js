// api/_airtable.js

// ==============================
// ENV
// ==============================
export function getEnv() {
  const airtablePat = process.env.AIRTABLE_PAT;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const sessionsTable = process.env.AIRTABLE_SESSIONS_TABLE;
  const challengesTable = process.env.AIRTABLE_CHALLENGES_TABLE;

  if (!airtablePat || !baseId) {
    throw new Error("Missing Airtable environment variables");
  }

  return {
    airtablePat,
    baseId,
    sessionsTable,
    challengesTable,
  };
}

// ==============================
// JSON RESPONSE HELPER
// ==============================
export function jsonResponse(status, data) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    },
  });
}

// ==============================
// OPTIONS RESPONSE (CORS)
// ==============================
export function optionsResponse() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    },
  });
}

// ==============================
// AIRTABLE FETCH (MIT TIMEOUT!)
// ==============================
export async function airtableFetch(path, opts = {}) {
  const { airtablePat } = getEnv();

  const url = `https://api.airtable.com/v0${path}`;
  const controller = new AbortController();
  const timeoutMs = 15000; // 15 Sekunden
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: opts.method || "GET",
      headers: {
        Authorization: `Bearer ${airtablePat}`,
        "Content-Type": "application/json",
        ...(opts.headers || {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    });

    const text = await res.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    if (!res.ok) {
      return {
        airtable_error: true,
        status: res.status,
        data,
      };
    }

    return data;
  } catch (error) {
    const isTimeout = error?.name === "AbortError";

    return {
      airtable_error: true,
      status: isTimeout ? 504 : 500,
      data: {
        message: isTimeout
          ? `Airtable timeout after ${timeoutMs}ms`
          : String(error),
      },
    };
  } finally {
    clearTimeout(timeout);
  }
}
