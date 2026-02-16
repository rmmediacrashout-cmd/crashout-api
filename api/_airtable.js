// /api/_airtable.js

export function getEnv(key) {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env var: ${key}`);
  return v;
}

export function optionsResponse(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.status(200).end();
}

export function jsonResponse(res, statusCode, data) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.status(statusCode).send(JSON.stringify(data));
}

export async function airtableFetch(path, options = {}) {
  const AIRTABLE_TOKEN = getEnv("AIRTABLE_TOKEN");

  const url = `https://api.airtable.com/v0${path}`;

  // wichtig: Content-Type IMMER setzen, sonst 422 "Could not parse request body"
  const headers = {
    Authorization: `Bearer ${AIRTABLE_TOKEN}`,
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  const resp = await fetch(url, {
    ...options,
    headers,
  });

  const text = await resp.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (e) {
    data = { raw: text };
  }

  return {
    ok: resp.ok,
    status: resp.status,
    data,
  };
}
