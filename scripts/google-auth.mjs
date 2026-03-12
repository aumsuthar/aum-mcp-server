#!/usr/bin/env node
/**
 * One-time script to get a Google OAuth2 refresh token.
 *
 * Usage:
 *   node --env-file=.env scripts/google-auth.mjs
 *
 * Prerequisites:
 *   1. Go to console.cloud.google.com → New project
 *   2. APIs & Services → Enable: Gmail API, Google Calendar API
 *   3. APIs & Services → Credentials → Create OAuth client ID
 *      - Application type: Web application
 *      - Authorized redirect URIs: add http://localhost:9999/callback
 *   4. Copy Client ID and Client Secret into .env
 *   5. Run this script, approve in browser, paste the refresh token into .env
 */

import { createServer } from "http";
import { createReadStream } from "fs";

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error("❌  Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env first.");
  process.exit(1);
}

const REDIRECT_URI = "http://localhost:9999/callback";
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/contacts.readonly",
].join(" ");

const authUrl =
  "https://accounts.google.com/o/oauth2/v2/auth?" +
  new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent",
  }).toString();

console.log("\n─────────────────────────────────────────────");
console.log("  Google OAuth2 — aum-mcp-server");
console.log("─────────────────────────────────────────────");
console.log("\n1. Open this URL in your browser:\n");
console.log("  " + authUrl);
console.log("\n2. Approve the permissions.");
console.log("3. You'll be redirected to localhost — the refresh token will print here.\n");

// Spin up a one-shot local server to catch the callback
const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost:9999");
  if (url.pathname !== "/callback") {
    res.writeHead(404);
    res.end("not found");
    return;
  }

  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error || !code) {
    res.writeHead(400, { "Content-Type": "text/plain" });
    res.end(`Error: ${error ?? "no code returned"}`);
    server.close();
    return;
  }

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: REDIRECT_URI,
        grant_type: "authorization_code",
      }).toString(),
    });

    const data = await tokenRes.json();

    if (!tokenRes.ok) {
      throw new Error(JSON.stringify(data));
    }

    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(`<html><body style="font-family:monospace;padding:40px;background:#000;color:#eee">
      <h2 style="color:#6ee7b7">✓ Authorized</h2>
      <p>You can close this tab. Check your terminal for the refresh token.</p>
    </body></html>`);

    console.log("─────────────────────────────────────────────");
    console.log("✓  Authorization successful!\n");
    console.log("Add this to your .env file:\n");
    console.log(`GOOGLE_REFRESH_TOKEN="${data.refresh_token}"`);
    console.log("\n─────────────────────────────────────────────\n");

    server.close();
  } catch (err) {
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end(`Token exchange failed: ${err.message}`);
    console.error("Token exchange failed:", err);
    server.close();
  }
});

server.listen(9999, "127.0.0.1", () => {
  console.log("Waiting for Google callback on http://localhost:9999/callback ...\n");
});
