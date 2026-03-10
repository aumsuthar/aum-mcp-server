/**
 * GitHub tools — contribution graph and user data.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerGithubTools(server: McpServer) {
  server.tool(
    "github_contributions",
    "Get GitHub contribution data for aumsuthar — total contributions and daily breakdown for the past year.",
    {
      days: z
        .number()
        .default(365)
        .describe("Number of days back to fetch (default 365)"),
    },
    async ({ days }) => {
      const token = process.env.GITHUB_TOKEN;
      if (!token) {
        return {
          content: [{ type: "text" as const, text: "Error: GITHUB_TOKEN not set." }],
          isError: true,
        };
      }

      const to = new Date().toISOString();
      const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

      const res = await fetch("https://api.github.com/graphql", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: `query {
            user(login: "aumsuthar") {
              contributionsCollection(from: "${from}", to: "${to}") {
                contributionCalendar {
                  totalContributions
                  weeks {
                    contributionDays {
                      date
                      contributionCount
                    }
                  }
                }
              }
            }
          }`,
        }),
      });

      const data = await res.json() as any;
      const calendar = data?.data?.user?.contributionsCollection?.contributionCalendar;

      if (!calendar) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
          isError: true,
        };
      }

      const days_flat = calendar.weeks.flatMap((w: any) => w.contributionDays);
      const active_days = days_flat.filter((d: any) => d.contributionCount > 0);
      const max_day = days_flat.reduce((a: any, b: any) =>
        b.contributionCount > a.contributionCount ? b : a
      );

      const summary = {
        totalContributions: calendar.totalContributions,
        activeDays: active_days.length,
        peakDay: max_day,
        recentDays: days_flat.slice(-14),
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(summary, null, 2) }],
      };
    }
  );

  server.tool(
    "github_profile",
    "Get aumsuthar's GitHub profile — repos, followers, bio, pinned repos.",
    {},
    async () => {
      const token = process.env.GITHUB_TOKEN;
      if (!token) {
        return {
          content: [{ type: "text" as const, text: "Error: GITHUB_TOKEN not set." }],
          isError: true,
        };
      }

      const res = await fetch("https://api.github.com/graphql", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: `query {
            user(login: "aumsuthar") {
              name
              bio
              followers { totalCount }
              following { totalCount }
              repositories(first: 6, orderBy: { field: STARGAZERS, direction: DESC }, privacy: PUBLIC) {
                nodes {
                  name
                  description
                  stargazerCount
                  primaryLanguage { name }
                  url
                }
              }
            }
          }`,
        }),
      });

      const data = await res.json() as any;
      const user = data?.data?.user;

      if (!user) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
          isError: true,
        };
      }

      return {
        content: [{ type: "text" as const, text: JSON.stringify(user, null, 2) }],
      };
    }
  );
}
