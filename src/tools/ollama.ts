/**
 * Ollama tools — local LLM with smart MCP tool routing.
 *
 * Key behaviours:
 *  - Auto-routes to a relevant subset of tools (5-10) based on prompt keywords
 *  - Explicit `tools` param lets the caller whitelist exactly which tools to expose
 *  - Dangerous write/send/run tools are stripped from auto-selected sets
 *  - Tool calls are validated before execution (must be in allowed set, registered)
 *  - Default system prompt steers the model to use tools sparingly and stop early
 *  - max_iterations defaults to 3 (not 10)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { registry, toOllamaToolDef, callTool } from "../registry.js";

const OLLAMA_BASE = process.env.OLLAMA_HOST ?? "http://localhost:11434";

// ---------------------------------------------------------------------------
// Model scoring
// ---------------------------------------------------------------------------

const TOOL_USE_SCORES: Record<string, number> = {
  "qwen3":          100,
  "qwen2.5":         95,
  "llama3.3":        90,
  "llama3.2":        85,
  "llama3.1":        80,
  "mistral-nemo":    75,
  "mistral-large":   72,
  "command-r-plus":  70,
  "command-r":       65,
  "hermes3":         60,
  "firefunction":    58,
  "mixtral":         50,
  "mistral":         45,
  "phi4":            40,
  "phi3":            35,
};

function scoreModel(name: string): number {
  const lower = name.toLowerCase().replace(/:.*$/, "");
  for (const [key, score] of Object.entries(TOOL_USE_SCORES)) {
    if (lower.startsWith(key)) return score;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Tool namespace routing
// Maps prompt keywords → safe tool names to expose for that topic
// ---------------------------------------------------------------------------

const TOOL_NAMESPACES: Record<string, string[]> = {
  osc:          ["osc_files", "osc_jobs", "osc_read_file", "osc_storage"],
  hpc:          ["osc_files", "osc_jobs", "osc_read_file", "osc_storage"],
  slurm:        ["osc_jobs", "osc_read_file"],
  cluster:      ["osc_files", "osc_jobs", "osc_read_file", "osc_storage"],
  gmail:        ["gmail_inbox", "gmail_search", "gmail_get_message"],
  email:        ["gmail_inbox", "gmail_search", "gmail_get_message"],
  inbox:        ["gmail_inbox"],
  calendar:     ["calendar_today", "calendar_events", "calendar_list"],
  schedule:     ["calendar_today", "calendar_events"],
  meeting:      ["calendar_today", "calendar_events"],
  notion:       ["notion_search", "notion_get_page", "notion_query_database"],
  note:         ["note_get", "note_list"],
  notes:        ["note_get", "note_list"],
  spotify:      ["spotify_now_playing", "spotify_recent", "spotify_top_artists"],
  music:        ["spotify_now_playing", "spotify_recent"],
  github:       ["github_profile", "github_contributions"],
  git:          ["github_contributions"],
  canvas:       ["canvas_courses"],
  course:       ["canvas_courses"],
  grade:        ["canvas_courses"],
  contact:      ["contacts_search", "contacts_list"],
  contacts:     ["contacts_search", "contacts_list"],
  imessage:     ["imessage_recent", "imessage_search", "imessage_contacts"],
  message:      ["imessage_recent", "imessage_search"],
  text:         ["imessage_recent", "imessage_search"],
  file:         ["read_file", "list_directory"],
  files:        ["read_file", "list_directory"],
  directory:    ["list_directory", "read_file"],
  folder:       ["list_directory"],
  web:          ["fetch_url", "http_status"],
  fetch:        ["fetch_url"],
  url:          ["fetch_url", "http_status"],
  http:         ["fetch_url", "http_status", "call_api"],
  api:          ["call_api", "fetch_url"],
  system:       ["system_info", "current_datetime"],
  time:         ["current_datetime"],
  date:         ["current_datetime"],
  env:          ["get_env"],
  word:         ["word_read"],
  docx:         ["word_read"],
  pptx:         ["ppt_read"],
  presentation: ["ppt_read"],
  powerpoint:   ["ppt_read"],
};

// Tools with irreversible side effects — excluded from auto-selected sets.
// Must be explicitly listed in the `tools` param to be available.
const DANGEROUS_TOOLS = new Set([
  "write_file",
  "run_command",
  "gmail_send",
  "imessage_send",
  "calendar_create_event",
  "note_set",
  "note_delete",
  "word_create",
  "ppt_create",
  "osc_run",
  "osc_submit_job",
]);

// Read-only fallback when no keywords match
const DEFAULT_TOOLS = [
  "read_file",
  "list_directory",
  "fetch_url",
  "system_info",
  "current_datetime",
  "note_get",
  "note_list",
];

const MAX_AUTO_TOOLS = 10;

// ---------------------------------------------------------------------------
// Tool selection
// ---------------------------------------------------------------------------

function selectTools(
  prompt: string,
  explicitList: string[] | undefined
): { toolDefs: ReturnType<typeof toOllamaToolDef>[]; names: Set<string> } {
  let candidates: string[];

  if (explicitList && explicitList.length > 0) {
    // Explicit list: trust the caller, only filter out unregistered tools
    candidates = explicitList.filter((n) => registry.has(n));
  } else {
    const lower = prompt.toLowerCase();
    const matched = new Set<string>();

    for (const [keyword, tools] of Object.entries(TOOL_NAMESPACES)) {
      if (lower.includes(keyword)) {
        for (const t of tools) matched.add(t);
      }
    }

    if (matched.size === 0) {
      candidates = DEFAULT_TOOLS;
    } else {
      // Strip dangerous tools from auto-routed sets
      candidates = Array.from(matched).filter((n) => !DANGEROUS_TOOLS.has(n));
      if (candidates.length === 0) candidates = DEFAULT_TOOLS;
    }

    candidates = candidates.slice(0, MAX_AUTO_TOOLS);
  }

  // Never expose ollama_chat itself (infinite recursion)
  const finalNames = new Set(
    candidates.filter((n) => n !== "ollama_chat" && registry.has(n))
  );

  const toolDefs = Array.from(finalNames).map((n) =>
    toOllamaToolDef(registry.get(n)!)
  );

  return { toolDefs, names: finalNames };
}

// ---------------------------------------------------------------------------
// Tool call validation
// ---------------------------------------------------------------------------

function validateToolCall(
  toolName: string,
  args: Record<string, unknown>,
  allowedTools: Set<string>
): string | null {
  if (!allowedTools.has(toolName)) {
    return `'${toolName}' was not in the allowed tool set for this call`;
  }
  if (!registry.has(toolName)) {
    return `'${toolName}' is not a registered tool`;
  }
  // Check required args — any field whose schema rejects undefined is required
  const entry = registry.get(toolName)!;
  for (const [key, schema] of Object.entries(entry.zodShape)) {
    const result = (schema as z.ZodTypeAny).safeParse(undefined);
    const isRequired = !result.success;
    const val = args[key];
    if (isRequired && (val === undefined || val === null || val === "")) {
      return `'${toolName}' requires arg '${key}' but it is missing or empty`;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Default system prompt
// ---------------------------------------------------------------------------

const DEFAULT_SYSTEM_PROMPT = `You are a helpful assistant with access to a focused set of tools.

Rules:
- Only call a tool when it is directly needed to answer the request.
- If one tool call is enough, stop — do not chain unnecessary calls.
- Never write files, send messages, or run commands unless explicitly asked.
- If you already have enough information to answer, respond immediately without tools.
- Keep responses concise and factual.

Examples:
User: "What files are in ~/Documents?"
→ call list_directory with path="/Users/<name>/Documents", then answer.

User: "What's today's date?"
→ call current_datetime, then answer directly.

User: "Show me my latest email."
→ call gmail_inbox, then summarize the first result only.`;

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerOllamaTools(server: McpServer) {
  // --- ollama_models ---
  server.tool(
    "ollama_models",
    "List installed Ollama models ranked by tool-use capability. Shows which model ollama_chat will auto-select.",
    {},
    async () => {
      try {
        const res = await fetch(`${OLLAMA_BASE}/api/tags`);
        if (!res.ok)
          throw new Error(`Ollama not reachable at ${OLLAMA_BASE} (HTTP ${res.status})`);
        const data: any = await res.json();
        const models = ((data.models ?? []) as any[])
          .map((m) => ({
            name: m.name,
            size: `${(m.size / 1e9).toFixed(1)} GB`,
            toolScore: scoreModel(m.name),
            modified: (m.modified_at ?? "").slice(0, 10),
          }))
          .sort((a, b) => b.toolScore - a.toolScore);

        const lines = [
          `Ollama host: ${OLLAMA_BASE}`,
          `Models (${models.length}):`,
          "",
          ...models.map(
            (m, i) =>
              `${i === 0 ? "★" : " "} ${m.name.padEnd(36)} score=${m.toolScore}  ${m.size}  ${m.modified}`
          ),
          "",
          models[0]
            ? `Auto-selected: ${models[0].name}`
            : "No models installed. Run: ollama pull qwen2.5",
        ];

        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
      } catch (err: any) {
        return {
          content: [{ type: "text" as const, text: `Error: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  // --- ollama_chat ---
  server.tool(
    "ollama_chat",
    "Chat with the best local Ollama model. Auto-routes to 5-10 relevant MCP tools based on prompt keywords. Dangerous write/send tools require explicit opt-in via the `tools` param.",
    {
      prompt: z.string().describe("The task or question for the model"),
      model: z
        .string()
        .optional()
        .describe("Override model name (e.g. 'llama3.2'). Auto-selects best tool-capable model by default."),
      system: z
        .string()
        .optional()
        .describe("Override the system prompt. A safe default is used if omitted."),
      tools: z
        .array(z.string())
        .optional()
        .describe(
          "Explicit tool whitelist (e.g. ['osc_files','osc_run','osc_jobs']). " +
          "Overrides keyword auto-routing. Required to use dangerous write/send tools."
        ),
      use_tools: z
        .boolean()
        .default(true)
        .describe("Enable tool use (default: true). Set false for plain text generation."),
      max_iterations: z
        .number()
        .default(3)
        .describe("Max tool-call rounds (default: 3). Increase only for multi-step tasks."),
    },
    async ({ prompt, model, system, tools: explicitTools, use_tools, max_iterations }) => {
      try {
        // 1. Resolve model
        let chosenModel = model;
        if (!chosenModel) {
          const tagsRes = await fetch(`${OLLAMA_BASE}/api/tags`);
          if (!tagsRes.ok)
            throw new Error(
              `Ollama not reachable at ${OLLAMA_BASE} (HTTP ${tagsRes.status}). Is Ollama running?`
            );
          const tagsData: any = await tagsRes.json();
          const installed = (tagsData.models ?? []) as Array<{ name: string }>;
          if (installed.length === 0)
            throw new Error("No Ollama models installed. Run `ollama pull qwen2.5` first.");
          chosenModel = [...installed].sort(
            (a, b) => scoreModel(b.name) - scoreModel(a.name)
          )[0].name;
        }

        // 2. Select tools
        const { toolDefs, names: allowedTools } = use_tools
          ? selectTools(prompt, explicitTools)
          : { toolDefs: [], names: new Set<string>() };

        // 3. Build messages — always inject system prompt
        const messages: any[] = [
          { role: "system", content: system ?? DEFAULT_SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ];

        const toolCallLog: string[] = [];
        const rejectedCalls: string[] = [];
        let iterations = 0;
        let finalText = "";

        // 4. Agentic loop
        while (iterations < max_iterations) {
          iterations++;

          const body: Record<string, unknown> = {
            model: chosenModel,
            messages,
            stream: false,
          };
          if (toolDefs.length > 0) body.tools = toolDefs;

          const chatRes = await fetch(`${OLLAMA_BASE}/api/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });

          if (!chatRes.ok) {
            const errText = await chatRes.text();
            throw new Error(`Ollama /api/chat error ${chatRes.status}: ${errText}`);
          }

          const chatData: any = await chatRes.json();
          const msg = chatData.message;
          if (!msg) throw new Error("Ollama returned no message");

          messages.push(msg);

          if (!msg.tool_calls || msg.tool_calls.length === 0) {
            finalText = msg.content ?? "";
            break;
          }

          // Execute each validated tool call
          for (const tc of msg.tool_calls) {
            const toolName: string = tc.function?.name ?? "unknown";
            const toolArgs: Record<string, unknown> =
              typeof tc.function?.arguments === "string"
                ? JSON.parse(tc.function.arguments)
                : (tc.function?.arguments ?? {});

            const validationErr = validateToolCall(toolName, toolArgs, allowedTools);
            if (validationErr) {
              rejectedCalls.push(`✗ ${toolName}: ${validationErr}`);
              messages.push({ role: "tool", content: `Rejected: ${validationErr}` });
              continue;
            }

            toolCallLog.push(`[${iterations}] ${toolName}(${JSON.stringify(toolArgs)})`);
            const result = await callTool(toolName, toolArgs);
            messages.push({ role: "tool", content: result });
          }
        }

        if (!finalText && iterations >= max_iterations) {
          finalText = "(max iterations reached)";
        }

        const header = [
          `Model: ${chosenModel}  |  Tools: ${Array.from(allowedTools).join(", ") || "none"}`,
          toolCallLog.length ? `Calls: ${toolCallLog.join(" → ")}` : "",
          rejectedCalls.length ? `Rejected: ${rejectedCalls.join("; ")}` : "",
          "",
        ].filter(Boolean).join("\n");

        return { content: [{ type: "text" as const, text: header + finalText }] };
      } catch (err: any) {
        return {
          content: [{ type: "text" as const, text: `Error: ${err.message}` }],
          isError: true,
        };
      }
    }
  );
}
