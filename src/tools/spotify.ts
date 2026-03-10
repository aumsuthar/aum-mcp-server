/**
 * Spotify tools — now playing, recent tracks, top artists.
 * Uses Supabase to cache the access token (same as aumsuthar.com).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// In-memory access token cache to avoid redundant refreshes within a session
let _cachedToken: string | null = null;
let _tokenExpiresAt: number = 0;

async function getAccessToken(): Promise<string> {
  // Return cached token if still valid (with 60s buffer)
  if (_cachedToken && Date.now() < _tokenExpiresAt - 60_000) {
    return _cachedToken;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;
  const clientId = process.env.SPOTIFY_CLIENT_ID ?? "0303ae166e2f4bb292174831aeae5450";

  // Try Supabase-cached token first
  if (supabaseUrl && supabaseKey) {
    const readRes = await fetch(
      `${supabaseUrl}/rest/v1/spotify_tokens?id=eq.1&select=refresh_token,access_token,access_token_expires_at`,
      { headers: { Authorization: `Bearer ${supabaseKey}`, apikey: supabaseKey } }
    );

    if (readRes.ok) {
      const rows = await readRes.json() as any[];
      const row = rows[0];

      if (row?.access_token && row.access_token_expires_at) {
        const expiresAt = new Date(row.access_token_expires_at).getTime();
        if (Date.now() < expiresAt - 60_000) {
          _cachedToken = row.access_token;
          _tokenExpiresAt = expiresAt;
          return _cachedToken!;
        }
      }

      // Refresh using the stored refresh token
      if (row?.refresh_token) {
        return await refreshToken(row.refresh_token, clientId, supabaseUrl, supabaseKey);
      }
    }
  }

  // Fall back to env refresh token
  const refreshTokenVal = process.env.SPOTIFY_REFRESH_TOKEN;
  if (!refreshTokenVal) throw new Error("SPOTIFY_REFRESH_TOKEN not set");
  return await refreshToken(refreshTokenVal, clientId, supabaseUrl, supabaseKey);
}

async function refreshToken(
  refreshTokenVal: string,
  clientId: string,
  supabaseUrl: string | undefined,
  supabaseKey: string | undefined
): Promise<string> {
  const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshTokenVal,
      client_id: clientId,
    }).toString(),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw new Error(`Spotify token refresh failed: ${tokenRes.status} ${err.slice(0, 200)}`);
  }

  const tokenData = await tokenRes.json() as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  const expiresAt = Date.now() + tokenData.expires_in * 1000;
  _cachedToken = tokenData.access_token;
  _tokenExpiresAt = expiresAt;

  // Persist back to Supabase
  if (supabaseUrl && supabaseKey) {
    const update: Record<string, string> = {
      access_token: tokenData.access_token,
      access_token_expires_at: new Date(expiresAt).toISOString(),
    };
    if (tokenData.refresh_token) update.refresh_token = tokenData.refresh_token;

    await fetch(`${supabaseUrl}/rest/v1/spotify_tokens?id=eq.1`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${supabaseKey}`,
        apikey: supabaseKey,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(update),
    });
  }

  return tokenData.access_token;
}

async function spotifyFetch(endpoint: string): Promise<any> {
  const token = await getAccessToken();
  const res = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 204) return { nothing_playing: true };
  return res.json();
}

export function registerSpotifyTools(server: McpServer) {
  server.tool(
    "spotify_now_playing",
    "Get the track currently playing on Aum's Spotify.",
    {},
    async () => {
      try {
        const data = await spotifyFetch("https://api.spotify.com/v1/me/player/currently-playing");

        if (data.nothing_playing) {
          return { content: [{ type: "text" as const, text: "Nothing is currently playing." }] };
        }

        const track = {
          name: data.item?.name,
          artists: data.item?.artists?.map((a: any) => a.name).join(", "),
          album: data.item?.album?.name,
          progress_ms: data.progress_ms,
          duration_ms: data.item?.duration_ms,
          is_playing: data.is_playing,
          url: data.item?.external_urls?.spotify,
        };

        return { content: [{ type: "text" as const, text: JSON.stringify(track, null, 2) }] };
      } catch (err: any) {
        return {
          content: [{ type: "text" as const, text: `Error: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "spotify_recent",
    "Get the 10 most recently played tracks on Aum's Spotify.",
    {},
    async () => {
      try {
        const data = await spotifyFetch(
          "https://api.spotify.com/v1/me/player/recently-played?limit=10"
        );

        const tracks = data.items?.map((item: any) => ({
          name: item.track?.name,
          artists: item.track?.artists?.map((a: any) => a.name).join(", "),
          played_at: item.played_at,
          url: item.track?.external_urls?.spotify,
        }));

        return { content: [{ type: "text" as const, text: JSON.stringify(tracks, null, 2) }] };
      } catch (err: any) {
        return {
          content: [{ type: "text" as const, text: `Error: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "spotify_top_artists",
    "Get Aum's top Spotify artists over the past ~6 months.",
    {},
    async () => {
      try {
        const data = await spotifyFetch(
          "https://api.spotify.com/v1/me/top/artists?time_range=medium_term&limit=10"
        );

        const artists = data.items?.map((a: any) => ({
          name: a.name,
          genres: a.genres?.slice(0, 3),
          popularity: a.popularity,
          url: a.external_urls?.spotify,
        }));

        return { content: [{ type: "text" as const, text: JSON.stringify(artists, null, 2) }] };
      } catch (err: any) {
        return {
          content: [{ type: "text" as const, text: `Error: ${err.message}` }],
          isError: true,
        };
      }
    }
  );
}
