/**
 * Shared Google OAuth2 token helper.
 * Used by gmail.ts and calendar.ts.
 */

let _cachedToken: string | null = null;
let _tokenExpiresAt: number = 0;

export async function getGoogleAccessToken(): Promise<string> {
  if (_cachedToken && Date.now() < _tokenExpiresAt - 60_000) {
    return _cachedToken;
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "Missing Google credentials. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN in .env"
    );
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }).toString(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google token refresh failed: ${res.status} ${err.slice(0, 200)}`);
  }

  const data = await res.json() as { access_token: string; expires_in: number };
  _cachedToken = data.access_token;
  _tokenExpiresAt = Date.now() + data.expires_in * 1000;
  return _cachedToken;
}

export async function googleFetch(url: string): Promise<any> {
  const token = await getGoogleAccessToken();
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google API error ${res.status}: ${err.slice(0, 300)}`);
  }
  return res.json();
}
