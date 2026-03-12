/**
 * Google People (Contacts) tools.
 * Requires: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN
 * Scopes: https://www.googleapis.com/auth/contacts.readonly
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { googleFetch } from "./google-oauth.js";

const BASE = "https://people.googleapis.com/v1";

const PERSON_FIELDS = [
  "names",
  "emailAddresses",
  "phoneNumbers",
  "organizations",
  "birthdays",
  "addresses",
  "urls",
  "biographies",
].join(",");

function formatPerson(person: any): object {
  const name = person.names?.[0];
  const emails = (person.emailAddresses ?? []).map((e: any) => ({
    value: e.value,
    type: e.type ?? e.formattedType ?? null,
  }));
  const phones = (person.phoneNumbers ?? []).map((p: any) => ({
    value: p.value,
    type: p.type ?? p.formattedType ?? null,
  }));
  const org = person.organizations?.[0];
  const birthday = person.birthdays?.[0]?.date;

  return {
    resourceName: person.resourceName,
    name: name?.displayName ?? null,
    firstName: name?.givenName ?? null,
    lastName: name?.familyName ?? null,
    emails,
    phones,
    organization: org ? { name: org.name ?? null, title: org.title ?? null } : null,
    birthday: birthday ? `${birthday.year ?? "???"}-${String(birthday.month).padStart(2, "0")}-${String(birthday.day).padStart(2, "0")}` : null,
    addresses: (person.addresses ?? []).map((a: any) => a.formattedValue ?? null).filter(Boolean),
    urls: (person.urls ?? []).map((u: any) => u.value),
    bio: person.biographies?.[0]?.value ?? null,
  };
}

export function registerContactsTools(server: McpServer) {
  server.tool(
    "contacts_search",
    "Search Aum's Google Contacts by name or email. ALWAYS call this automatically when a person's name is mentioned and their email address, phone number, or other contact details are needed — do not ask Aum to provide them manually.",
    {
      query: z.string().describe("Name or email to search for"),
      limit: z.number().int().min(1).max(30).default(10).describe("Max results"),
    },
    async ({ query, limit }) => {
      try {
        const data = await googleFetch(
          `${BASE}/people:searchContacts?` +
            new URLSearchParams({
              query,
              pageSize: String(limit),
              readMask: PERSON_FIELDS,
            }).toString()
        );
        const results = (data.results ?? []).map((r: any) => formatPerson(r.person));
        if (!results.length) {
          return { content: [{ type: "text" as const, text: "No contacts found." }] };
        }
        return { content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "contacts_list",
    "List Aum's Google Contacts, sorted by most recently interacted.",
    {
      limit: z.number().int().min(1).max(100).default(25).describe("Number of contacts to return"),
    },
    async ({ limit }) => {
      try {
        const data = await googleFetch(
          `${BASE}/people/me/connections?` +
            new URLSearchParams({
              pageSize: String(limit),
              personFields: PERSON_FIELDS,
              sortOrder: "LAST_MODIFIED_DESCENDING",
            }).toString()
        );
        const contacts = (data.connections ?? []).map(formatPerson);
        if (!contacts.length) {
          return { content: [{ type: "text" as const, text: "No contacts found." }] };
        }
        return { content: [{ type: "text" as const, text: JSON.stringify(contacts, null, 2) }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "contacts_get",
    "Get full details of a Google Contact by resource name (e.g. 'people/c123456').",
    {
      resource_name: z.string().describe("Contact resource name (e.g. people/c1234567890)"),
    },
    async ({ resource_name }) => {
      try {
        const data = await googleFetch(
          `${BASE}/${resource_name}?personFields=${PERSON_FIELDS}`
        );
        return { content: [{ type: "text" as const, text: JSON.stringify(formatPerson(data), null, 2) }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );
}
