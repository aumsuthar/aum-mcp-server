/**
 * aum-mcp dashboard — local web UI for the MCP server.
 * Run with: npm run web
 */

import { createServer, IncomingMessage, ServerResponse } from "http";
import { readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";
import {
  homedir,
  hostname,
  platform,
  arch,
  cpus,
  totalmem,
  freemem,
} from "os";

const NOTES_DIR = join(homedir(), ".aum-mcp");
const NOTES_FILE = join(NOTES_DIR, "notes.json");
const PORT = 4242;

type Notes = Record<string, { content: string; updated: string }>;

async function loadNotes(): Promise<Notes> {
  try {
    const raw = await readFile(NOTES_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function saveNotes(notes: Notes): Promise<void> {
  await mkdir(NOTES_DIR, { recursive: true });
  await writeFile(NOTES_FILE, JSON.stringify(notes, null, 2), "utf-8");
}

async function getBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
  });
}

function json(res: ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

const TOOLS = [
  {
    group: "web",
    label: "Web & HTTP",
    tools: [
      { name: "fetch_url", desc: "Fetch any URL with GET/POST/PUT/PATCH/DELETE" },
      { name: "http_status", desc: "Check HTTP status without downloading body" },
      { name: "call_api", desc: "Call JSON APIs with automatic serialization" },
    ],
  },
  {
    group: "files",
    label: "File System",
    tools: [
      { name: "read_file", desc: "Read file contents from the local filesystem" },
      { name: "write_file", desc: "Write content to a file" },
      { name: "list_directory", desc: "List files and directories (optional recursive)" },
    ],
  },
  {
    group: "utility",
    label: "Utility",
    tools: [
      { name: "system_info", desc: "Hostname, platform, memory, architecture" },
      { name: "current_datetime", desc: "Current date/time in any IANA timezone" },
      { name: "run_command", desc: "Execute shell commands" },
      { name: "get_env", desc: "Read environment variables" },
    ],
  },
  {
    group: "notes",
    label: "Notes",
    tools: [
      { name: "note_set", desc: "Save a persistent note by key" },
      { name: "note_get", desc: "Retrieve a note by key" },
      { name: "note_list", desc: "List all saved note keys" },
      { name: "note_delete", desc: "Delete a note by key" },
    ],
  },
  {
    group: "github",
    label: "GitHub",
    tools: [
      { name: "github_contributions", desc: "Contribution calendar and stats for the past N days" },
      { name: "github_profile", desc: "Profile info — repos, followers, top starred repos" },
    ],
  },
  {
    group: "spotify",
    label: "Spotify",
    tools: [
      { name: "spotify_now_playing", desc: "Currently playing track" },
      { name: "spotify_recent", desc: "10 most recently played tracks" },
      { name: "spotify_top_artists", desc: "Top artists over the past ~6 months" },
    ],
  },
  {
    group: "canvas",
    label: "Canvas",
    tools: [
      { name: "canvas_courses", desc: "Active OSU courses with current grades and scores" },
    ],
  },
  {
    group: "gmail",
    label: "Gmail",
    tools: [
      { name: "gmail_inbox", desc: "Get recent emails from inbox (up to 25)" },
      { name: "gmail_search", desc: "Search emails using Gmail query syntax" },
      { name: "gmail_get_message", desc: "Get the full body of a message by ID" },
      { name: "gmail_send", desc: "Send an email from Gmail" },
    ],
  },
  {
    group: "calendar",
    label: "Google Calendar",
    tools: [
      { name: "calendar_events", desc: "Get upcoming events (configurable days ahead)" },
      { name: "calendar_today", desc: "Get all events scheduled for today" },
      { name: "calendar_list", desc: "List all calendars in the Google account" },
      { name: "calendar_create_event", desc: "Create a new event on the primary calendar" },
    ],
  },
  {
    group: "contacts",
    label: "Google Contacts",
    tools: [
      { name: "contacts_search", desc: "Search contacts by name or email — auto-called when a name is mentioned" },
      { name: "contacts_list", desc: "List contacts sorted by most recently interacted" },
      { name: "contacts_get", desc: "Get full details of a contact by resource name" },
    ],
  },
  {
    group: "notion",
    label: "Notion",
    tools: [
      { name: "notion_search", desc: "Search pages and databases in the workspace" },
      { name: "notion_get_page", desc: "Get the full content of a page by ID" },
      { name: "notion_create_page", desc: "Create a new page under a parent page or database" },
      { name: "notion_append_blocks", desc: "Append text content to an existing page" },
      { name: "notion_query_database", desc: "Query entries from a Notion database" },
    ],
  },
  {
    group: "imessage",
    label: "iMessage",
    tools: [
      { name: "imessage_search", desc: "Search messages by contact or content" },
      { name: "imessage_recent", desc: "Get most recent messages across all chats" },
      { name: "imessage_chat", desc: "Get messages from a specific conversation" },
      { name: "imessage_contacts", desc: "List all iMessage contacts with last message" },
      { name: "imessage_send", desc: "Send an iMessage via Messages.app" },
    ],
  },
  {
    group: "office",
    label: "Microsoft Office",
    tools: [
      { name: "word_read", desc: "Extract text from a .docx file" },
      { name: "word_create", desc: "Create a .docx file from headings, paragraphs, and bullets" },
      { name: "ppt_read", desc: "Extract slide text from a .pptx file" },
      { name: "ppt_create", desc: "Create a .pptx file from a list of slides" },
    ],
  },
  {
    group: "osc",
    label: "Ohio Supercomputer Center",
    tools: [
      { name: "osc_run", desc: "Run a shell command on the OSC cluster via SSH" },
      { name: "osc_jobs", desc: "List SLURM jobs in the queue" },
      { name: "osc_files", desc: "List files in a remote directory" },
      { name: "osc_read_file", desc: "Read a file from the OSC cluster" },
      { name: "osc_submit_job", desc: "Submit a SLURM batch job script" },
      { name: "osc_storage", desc: "Check disk quota and storage usage" },
    ],
  },
  {
    group: "ollama",
    label: "Ollama (Local LLM)",
    tools: [
      { name: "ollama_models", desc: "List installed models ranked by tool-use capability" },
      { name: "ollama_chat", desc: "Agentic chat with best local model — file, web, shell & notes tools included" },
    ],
  },
];

function maskKey(val: string | undefined): string {
  if (!val) return "(not set)";
  if (val.length <= 12) return val.slice(0, 4) + "...";
  return val.slice(0, 12) + "..." + val.slice(-4);
}

const INTEGRATIONS = [
  {
    id: "github",
    name: "GitHub",
    envKey: "GITHUB_TOKEN",
    url: "github.com/aumsuthar",
    color: "#fff",
    logo: `<svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>`,
  },
  {
    id: "spotify",
    name: "Spotify",
    envKey: "SPOTIFY_REFRESH_TOKEN",
    url: "open.spotify.com",
    color: "#1DB954",
    logo: `<svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>`,
  },
  {
    id: "canvas",
    name: "Canvas LMS",
    envKey: "CANVAS_TOKEN",
    url: "osu.instructure.com",
    color: "#E66000",
    logo: `<svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28"><path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zm0 2a8 8 0 1 1 0 16A8 8 0 0 1 12 4zm-1 3v5.586l-2.707 2.707 1.414 1.414L12 14.414l2.293 2.293 1.414-1.414L13 12.586V7h-2z"/></svg>`,
  },
  {
    id: "supabase",
    name: "Supabase",
    envKey: "SUPABASE_KEY",
    url: "supabase.co",
    color: "#3ECF8E",
    logo: `<svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28"><path d="M11.9 1.036c-.015-.986-1.26-1.41-1.874-.637L.764 12.05C.285 12.63.712 13.5 1.476 13.5h8.033l-.072 9.455c.015.986 1.26 1.41 1.874.637l9.262-11.652c.48-.578.052-1.448-.712-1.448h-8.033l.072-9.456z"/></svg>`,
  },
  {
    id: "notion",
    name: "Notion",
    envKey: "NOTION_TOKEN",
    url: "notion.so",
    color: "#fff",
    logo: `<svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28"><path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952L12.21 19s0 .84-1.168.84l-3.222.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.14c-.093-.514.28-.887.747-.933zM1.936 1.035l13.31-.98c1.634-.14 2.055-.047 3.082.7l4.249 2.986c.7.513.934.653.934 1.213v16.378c0 1.026-.373 1.634-1.68 1.726l-15.458.934c-.98.047-1.448-.093-1.962-.747l-3.129-4.06c-.56-.747-.793-1.306-.793-1.96V2.667c0-.839.374-1.54 1.447-1.632z"/></svg>`,
  },
  {
    id: "google",
    name: "Google",
    envKey: "GOOGLE_REFRESH_TOKEN",
    url: "gmail.com · calendar.google.com",
    color: "#4285F4",
    logo: `<svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>`,
  },
  {
    id: "ollama",
    name: "Ollama",
    envKey: "OLLAMA_HOST",
    url: "localhost:11434",
    color: "#fff",
    logo: `<svg role="img" viewBox="0 0 24 24" fill="currentColor" width="28" height="28" xmlns="http://www.w3.org/2000/svg"><path d="M16.361 10.26a.894.894 0 0 0-.558.47l-.072.148.001.207c0 .193.004.217.059.353.076.193.152.312.291.448.24.238.51.3.872.205a.86.86 0 0 0 .517-.436.752.752 0 0 0 .08-.498c-.064-.453-.33-.782-.724-.897a1.06 1.06 0 0 0-.466 0zm-9.203.005c-.305.096-.533.32-.65.639a1.187 1.187 0 0 0-.06.52c.057.309.31.59.598.667.362.095.632.033.872-.205.14-.136.215-.255.291-.448.055-.136.059-.16.059-.353l.001-.207-.072-.148a.894.894 0 0 0-.565-.472 1.02 1.02 0 0 0-.474.007Zm4.184 2c-.131.071-.223.25-.195.383.031.143.157.288.353.407.105.063.112.072.117.136.004.038-.01.146-.029.243-.02.094-.036.194-.036.222.002.074.07.195.143.253.064.052.076.054.255.059.164.005.198.001.264-.03.169-.082.212-.234.15-.525-.052-.243-.042-.28.087-.355.137-.08.281-.219.324-.314a.365.365 0 0 0-.175-.48.394.394 0 0 0-.181-.033c-.126 0-.207.03-.355.124l-.085.053-.053-.032c-.219-.13-.259-.145-.391-.143a.396.396 0 0 0-.193.032zm.39-2.195c-.373.036-.475.05-.654.086-.291.06-.68.195-.951.328-.94.46-1.589 1.226-1.787 2.114-.04.176-.045.234-.045.53 0 .294.005.357.043.524.264 1.16 1.332 2.017 2.714 2.173.3.033 1.596.033 1.896 0 1.11-.125 2.064-.727 2.493-1.571.114-.226.169-.372.22-.602.039-.167.044-.23.044-.523 0-.297-.005-.355-.045-.531-.288-1.29-1.539-2.304-3.072-2.497a6.873 6.873 0 0 0-.855-.031zm.645.937a3.283 3.283 0 0 1 1.44.514c.223.148.537.458.671.662.166.251.26.508.303.82.02.143.01.251-.043.482-.08.345-.332.705-.672.957a3.115 3.115 0 0 1-.689.348c-.382.122-.632.144-1.525.138-.582-.006-.686-.01-.853-.042-.57-.107-1.022-.334-1.35-.68-.264-.28-.385-.535-.45-.946-.03-.192.025-.509.137-.776.136-.326.488-.73.836-.963.403-.269.934-.46 1.422-.512.187-.02.586-.02.773-.002zm-5.503-11a1.653 1.653 0 0 0-.683.298C5.617.74 5.173 1.666 4.985 2.819c-.07.436-.119 1.04-.119 1.503 0 .544.064 1.24.155 1.721.02.107.031.202.023.208a8.12 8.12 0 0 1-.187.152 5.324 5.324 0 0 0-.949 1.02 5.49 5.49 0 0 0-.94 2.339 6.625 6.625 0 0 0-.023 1.357c.091.78.325 1.438.727 2.04l.13.195-.037.064c-.269.452-.498 1.105-.605 1.732-.084.496-.095.629-.095 1.294 0 .67.009.803.088 1.266.095.555.288 1.143.503 1.534.071.128.243.393.264.407.007.003-.014.067-.046.141a7.405 7.405 0 0 0-.548 1.873c-.062.417-.071.552-.071.991 0 .56.031.832.148 1.279L3.42 24h1.478l-.05-.091c-.297-.552-.325-1.575-.068-2.597.117-.472.25-.819.498-1.296l.148-.29v-.177c0-.165-.003-.184-.057-.293a.915.915 0 0 0-.194-.25 1.74 1.74 0 0 1-.385-.543c-.424-.92-.506-2.286-.208-3.451.124-.486.329-.918.544-1.154a.787.787 0 0 0 .223-.531c0-.195-.07-.355-.224-.522a3.136 3.136 0 0 1-.817-1.729c-.14-.96.114-2.005.69-2.834.563-.814 1.353-1.336 2.237-1.475.199-.033.57-.028.776.01.226.04.367.028.512-.041.179-.085.268-.19.374-.431.093-.215.165-.333.36-.576.234-.29.46-.489.822-.729.413-.27.884-.467 1.352-.561.17-.035.25-.04.569-.04.319 0 .398.005.569.04a4.07 4.07 0 0 1 1.914.997c.117.109.398.457.488.602.034.057.095.177.132.267.105.241.195.346.374.43.14.068.286.082.503.045.343-.058.607-.053.943.016 1.144.23 2.14 1.173 2.581 2.437.385 1.108.276 2.267-.296 3.153-.097.15-.193.27-.333.419-.301.322-.301.722-.001 1.053.493.539.801 1.866.708 3.036-.062.772-.26 1.463-.533 1.854a2.096 2.096 0 0 1-.224.258.916.916 0 0 0-.194.25c-.054.109-.057.128-.057.293v.178l.148.29c.248.476.38.823.498 1.295.253 1.008.231 2.01-.059 2.581a.845.845 0 0 0-.044.098c0 .006.329.009.732.009h.73l.02-.074.036-.134c.019-.076.057-.3.088-.516.029-.217.029-1.016 0-1.258-.11-.875-.295-1.57-.597-2.226-.032-.074-.053-.138-.046-.141.008-.005.057-.074.108-.152.376-.569.607-1.284.724-2.228.031-.26.031-1.378 0-1.628-.083-.645-.182-1.082-.348-1.525a6.083 6.083 0 0 0-.329-.7l-.038-.064.131-.194c.402-.604.636-1.262.727-2.04a6.625 6.625 0 0 0-.024-1.358 5.512 5.512 0 0 0-.939-2.339 5.325 5.325 0 0 0-.95-1.02 8.097 8.097 0 0 1-.186-.152.692.692 0 0 1 .023-.208c.208-1.087.201-2.443-.017-3.503-.19-.924-.535-1.658-.98-2.082-.354-.338-.716-.482-1.15-.455-.996.059-1.8 1.205-2.116 3.01a6.805 6.805 0 0 0-.097.726c0 .036-.007.066-.015.066a.96.96 0 0 1-.149-.078A4.857 4.857 0 0 0 12 3.03c-.832 0-1.687.243-2.456.698a.958.958 0 0 1-.148.078c-.008 0-.015-.03-.015-.066a6.71 6.71 0 0 0-.097-.725C8.997 1.392 8.337.319 7.46.048a2.096 2.096 0 0 0-.585-.041Zm.293 1.402c.248.197.523.759.682 1.388.03.113.06.244.069.292.007.047.026.152.041.233.067.365.098.76.102 1.24l.002.475-.12.175-.118.178h-.278c-.324 0-.646.041-.954.124l-.238.06c-.033.007-.038-.003-.057-.144a8.438 8.438 0 0 1 .016-2.323c.124-.788.413-1.501.696-1.711.067-.05.079-.049.157.013zm9.825-.012c.17.126.358.46.498.888.28.854.36 2.028.212 3.145-.019.14-.024.151-.057.144l-.238-.06a3.693 3.693 0 0 0-.954-.124h-.278l-.119-.178-.119-.175.002-.474c.004-.669.066-1.19.214-1.772.157-.623.434-1.185.68-1.382.078-.062.09-.063.159-.012z"/></svg>`,
  },
  {
    id: "osc",
    name: "Ohio Supercomputer Center",
    envKey: "OSC_PASSWORD",
    url: "osc.edu",
    color: "#0E3F75",
    logo: `<svg viewBox="0 0 200 144" xmlns="http://www.w3.org/2000/svg" width="70" height="50"><style>.oc0{fill:#0E3F75}.oc1{fill:#C12637}</style><g><g><path class="oc1" d="M141,99.2c-0.2,0.5-0.3,0.9-0.4,1.3c-0.1,0.3-0.2,0.7-0.3,0.9c-0.1,0.3-0.4,0.9-1.5,0.7c-0.6-0.1-1.2-0.2-1.8-0.2c-3.7,0-6.6,2-8.6,6c-4.1,1-6.1,4.3-7.1,7.8c-1-0.4-1.9-0.6-2.9-0.6c-2.8,0-6.6,1.4-8.3,8.2c-0.7,2.5-1,5.4-1.3,7.7c0,0.1,0,0.1,0,0.2c-1,0.5-2,1.2-3,2.5c-1,1.4-1.4,2.8-1.5,4l0,0.3c0,0-0.2-0.1-0.3-0.2c-0.7-0.6-2.1-1.9-2.7-2.9c-0.2-0.4-0.5-0.8-0.7-1.2c-1.6-2.7-4.2-7.2-9.6-7.2c-1.8,0-3.6,0.6-5.3,1.7c-2.4,1.5-4,1.8-4.7,1.8c-0.4,0-0.7-0.1-1-0.2l-0.1,0l0,0c-1-0.5-2.4-1.1-4.3-1.5c-0.5-0.1-1.1-0.1-1.6-0.1c-1.9,0-3.5,0.7-4.6,1.4c-3-4.3-7-4.3-9.2-4.3l-0.2,0l-0.4,0c-1.4,0-2.2-0.1-3.2-0.7c-0.7-0.5-1-0.9-1-2.4v-7c-2,1-4,1.7-6,2.3c0,2.1,0,3.9,0,4.7c0,2.2,0.4,5.2,3.6,7.4c2.4,1.7,4.7,1.8,6.6,1.8c0.2,0,0.3,0,0.5,0c0.1,0,0.1,0,0.2,0c2.2,0,3.4,0.1,4.8,2.5c1.1,2,2.1,2.9,3.3,3.1c0.2,0,0.3,0,0.5,0c1.2,0,2.1-0.8,2.9-1.4c0.9-0.8,1.5-1.3,2.5-1.3c0.2,0,0.3,0,0.5,0c1.2,0.2,2,0.6,2.8,1c1,0.5,2.3,0.8,3.6,0.8c2.3,0,5-0.8,8-2.7c0.7-0.5,1.4-0.7,2-0.7c2.3,0,3.7,3.2,5.3,5.6c1.2,2,3.7,4.5,5.4,5.3c3.5,1.5,6.8,0.3,7.8-1.8c0.9-1.9,0.3-2.9,1.3-4.3c1.3-1.7,3.3,0.1,3.8-3.3c0.6-3.8,1.1-12.9,3.9-12.9c0.3,0,0.5,0.1,0.8,0.2c2.1,1.2,4,2.7,5.3,2.7c0.9,0,1.6-0.8,1.9-3.1c0.9-7.8,3.4-7.2,4.4-7.4c0.7-0.2,1.9-0.5,2.5-2c1.1-2.6,2.1-3.7,3.7-3.7c0.2,0,0.5,0,0.7,0.1c0.4,0.1,0.8,0.1,1.2,0.1c2.8,0,5.5-1.6,6.7-4.1c0.6-1.1,0.8-2.6,1.4-3.8C145,100.2,142.9,99.9,141,99.2z"/></g><g><path class="oc1" d="M41.6,16.6c0,0,28.7,0,30.4,0c0.2,0.2,0.5,0.5,0.8,0.8l0,0l0,0c2.8,2.5,6.4,2.7,9.3,2.8l0.1,0l0,0c0.9,0,2.4,0.1,3,0.3c2,3.2,4.7,3.7,6.2,3.7c0.8,0,1.5-0.1,2.2-0.3c1.5,2.5,4.3,6,9.9,6c1.9,0,4-0.4,6.3-1.3c6.4-2.5,8.8-2.9,11.6-3.3c1-0.2,2.1-0.3,3.4-0.6c4.7-0.9,7.5-3,11.3-5.9c1.3-1,2.7-2.1,4.5-3.3c3.1-2.2,10.6-5.3,17-7.3v37.9c2.1,0.2,4.1,0.7,6,1.7V0c0,0-19.6,5.7-26.4,10.5c-6.9,4.8-9,7.4-13.6,8.3c-4.5,0.9-6.7,0.5-16,4.1c-1.6,0.6-3,0.9-4.1,0.9c-3.3,0-4.5-2.5-5.4-4.4c-0.3-0.6-0.5-1.1-0.8-1.5c-0.5-0.7-1.2-0.9-1.9-0.9c-0.8,0-1.6,0.3-2.2,0.6c-0.8,0.3-1.3,0.5-1.7,0.5c-0.5,0-0.8-0.3-1.2-0.9c-1.7-2.9-5-3-7.9-3.1c-2.2-0.1-4.3-0.1-5.6-1.3c-0.5-0.4-0.6-0.7-1.4-1.6c-0.6-0.7-1.5-0.8-2.4-0.8c0,0-37.5,0-37.5,0v22.3l6,5.4V16.6z"/></g><g><g><ellipse transform="matrix(0.827 -0.5621 0.5621 0.827 -3.5366 83.4193)" class="oc0" cx="133.8" cy="47.5" rx="5.9" ry="4.8"/></g><g><g><path class="oc0" d="M179.5,53.7c-0.7-0.3-1.3-0.4-2-0.3c-1.3,0.2-2.6,1.2-3.2,2.6c-1.4,3.2-3.3,6.3-7.2,6.9c-0.8-4-2.5-7.1-4.9-8.9c-2.1-1.6-4.8-2.3-7.7-1.8c-5.8,0.8-11,5-14.7,11.6c-2.3,4.2-3.7,9-4.1,13.6c-3.9,8.9-6.4,12.3-9.3,12.7c-1.7,0.2-2.4-0.8-2.5-1.6c-0.6-4,6.1-21.8,9.1-27.1c0.4-0.8,0.5-1.7,0.1-2.5c-0.4-1-1.5-2.7-4.2-2.4c-1.4,0.2-2.5,1-3,2.1c-2.9,6.2-6.4,14.1-8.2,21c-3.7,8.6-6.8,12.8-9.6,13.2c-0.9,0.1-1.4-0.2-1.5-0.9c-0.3-2.1,1.4-5.8,3.3-9.7c2.5-5.2,5.3-11.1,4.6-15.7c-0.3-2.3-1.4-4.3-3.1-5.6c-1.6-1.3-3.6-1.8-5.6-1.5c-3.6,0.5-5.9,2.1-9.1,5.2c7-17.1,9.7-19.9,10.7-20c0.5-0.1,0.8,0.1,1.2,0.3c0.4,0.3,0.9,0.6,2,0.4c1.4-0.2,2.5-1.8,2.2-4.3c-0.6-3.9-3.9-5.3-6.7-4.9c-5.7,0.8-12.3,15.9-14.2,20.4c-1.6,3.9-7.7,19.4-12.9,30.9c-1.9,4.2-3.8,9.1-7.9,11c-1.6,0.7-2.8,1.5-2.3,4c0.4,2,1.3,2.8,3.2,2.8c0.4,0,0.7,0,1.2-0.1c5.5-0.8,9.8-8.2,13.2-15.4c9.9-20.2,17.5-21.8,18.4-21.9c0.9-0.1,1.4,0.4,1.6,1.6c0.3,2.3-1.5,6.1-3.4,10.1c-2.3,4.8-4.9,10.2-4.3,14.3c0.3,2.4,1.6,4.2,3.5,5.4c1.7,1,4,1.3,6.5,1c3.7-0.5,6.8-2.4,9.6-6.3c0.6,0.8,1.4,1.6,2.3,2.2c7,4.4,14.9-0.8,17.5-6.6c0.7,1.2,1.6,2.1,2.6,2.9c1.8,1.4,3.9,2.1,6.5,2c16.4-0.2,20.4-21.6,20.3-24.1c8.3-0.8,11.5-6.6,13.7-12.3C181.9,55.9,181.3,54.6,179.5,53.7z M148.6,86.6c-1.4,0.1-2.6,0-3.5-0.7c-1.1-0.8-1.7-2.3-2-4.2c-0.2-1.3-0.1-2.8,0-4.3l0.1-0.6c1.1-7.3,5.7-16.3,11.4-17.2c0.2,0,0.4,0,0.6,0c0.8,0,1.6,0.2,2.2,0.7C164.3,66.7,156.1,85.9,148.6,86.6z"/></g></g><g><path class="oc0" d="M78.7,58.5c1-1.9,1.6-4,1.8-6c0.7-7.5-3.7-13.4-10.9-14.8c-10.2-2-20.2,1-28.3,8.3c-0.7-0.6-8.2-7.5-10.9-9.5c-6.1-4.6-13.9-5.8-20.3-3c-5.5,2.4-9.1,7.3-10,13.4c-0.8,6.2,1.6,11.4,7,14.7c3.6,2.2,7.3,2.8,7.7,2.9c2.1,0.3,4-1.2,4.4-3.4c0.3-2.2-1.2-4.2-3.3-4.5c-0.9-0.1-9-1.6-8.1-8.5c0.4-3.3,2.3-5.9,5.3-7.1c3.9-1.7,8.8-0.9,12.8,2.1c2.4,1.8,9.5,8.3,10.2,8.9c-13.7,14.8-15.3,29.5-14.8,38c0.5,9.1,4.2,16.2,10.4,19.9c2.9,1.7,6.2,2.6,9.8,2.6c11.2,0,23.4-8.9,31.1-22.6C78.2,79.5,80.6,67.9,78.7,58.5z M68.2,45.5c4.7,0.9,4.8,4.6,4.7,6.2c-0.4,3.7-3.4,7.7-8.4,7.7c0,0-6.5,0.7-17.1-8.2C53.5,46,60.7,44,68.2,45.5z M65.8,85.7c-6.1,10.9-16.2,18.6-24.5,18.6c0,0,0,0,0,0c-2.2,0-4.1-0.5-5.8-1.5c-3.9-2.3-6.2-7.1-6.6-13.4c-0.4-7,1.7-14.8,5.8-22.1c2.1-3.7,4.7-7.2,7.5-10c5.7,4.7,13.4,10,21.9,10.1l0.3,0c2.6,0,5-0.6,7.2-1.7C71.6,72.1,69.5,79.2,65.8,85.7z"/></g></g></g></g></svg>`,
  },
];

function renderHTML(): string {
  const totalTools = TOOLS.reduce((acc, g) => acc + g.tools.length, 0);

  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>ॐ aum-mcp-server</title>
  <style>
    :root {
      --bg: #000000;
      --fg: #F2F2F2;
      --card: #0C0C0C;
      --secondary: #191919;
      --muted: #262626;
      --muted-fg: #999999;
      --accent: #E6E2DA;
      --border: #333333;
      --radius: 4px;
      --font-mono: Monaco, "Courier New", monospace;
      --font-sans: -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif;
    }

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    html, body {
      background: var(--bg);
      color: var(--fg);
      font-family: var(--font-mono);
      font-size: 13px;
      line-height: 1.6;
      min-height: 100vh;
    }

    a { color: var(--accent); text-decoration: none; }

    /* ── Nav ── */
    nav {
      position: sticky;
      top: 0;
      z-index: 100;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 24px;
      height: 52px;
      background: var(--bg);
      border-bottom: 1px solid var(--border);
    }
    .nav-logo {
      font-family: var(--font-mono);
      font-size: 14px;
      color: var(--accent);
      letter-spacing: 0.02em;
    }
    .nav-right {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .nav-badge {
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--muted-fg);
      padding: 2px 8px;
      border: 1px solid var(--border);
      border-radius: var(--radius);
    }
    .nav-badge.online {
      color: #6ee7b7;
      border-color: rgba(110, 231, 183, 0.3);
    }
    #live-clock {
      font-family: var(--font-mono);
      font-size: 12px;
      color: var(--muted-fg);
    }

    /* ── Layout ── */
    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 0 24px;
    }

    section {
      padding: 40px 0;
      border-bottom: 1px solid var(--border);
    }
    section:last-child { border-bottom: none; }

    .section-label {
      font-family: var(--font-mono);
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.15em;
      color: var(--muted-fg);
      margin-bottom: 20px;
    }
    .section-label::before {
      content: "// ";
      color: var(--border);
    }

    /* ── Cards ── */
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 20px;
    }
    .card:hover { border-color: var(--accent); }
    .card-title {
      font-family: var(--font-mono);
      font-size: 12px;
      color: var(--accent);
      margin-bottom: 4px;
    }
    .card-value {
      font-family: var(--font-sans);
      font-size: 22px;
      font-weight: 600;
      letter-spacing: -0.025em;
      color: var(--fg);
      margin-bottom: 8px;
    }
    .card-meta {
      font-size: 11px;
      color: var(--muted-fg);
    }

    /* ── Stats row ── */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
    }
    @media (max-width: 640px) {
      .stats-grid { grid-template-columns: 1fr; }
    }

    /* ── Tools ── */
    .tools-section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 20px;
      cursor: pointer;
      user-select: none;
    }
    .tools-section-header .section-label { margin-bottom: 0; }
    .tools-toggle {
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--muted-fg);
      padding: 3px 10px;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: transparent;
      cursor: pointer;
      transition: border-color 120ms, color 120ms;
    }
    .tools-toggle:hover { border-color: var(--accent); color: var(--accent); }
    .tools-collapsible { display: none; }
    .tools-collapsible.open { display: block; }
    .tools-groups {
      display: flex;
      flex-direction: column;
      gap: 28px;
    }
    .tool-group-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: var(--muted-fg);
      margin-bottom: 10px;
    }
    .tools-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 8px;
    }
    .tool-card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 14px 16px;
      transition: border-color 120ms ease;
    }
    .tool-card:hover { border-color: var(--accent); }
    .tool-name {
      font-family: var(--font-mono);
      font-size: 12px;
      color: var(--accent);
      margin-bottom: 4px;
    }
    .tool-desc {
      font-size: 11px;
      color: var(--muted-fg);
      line-height: 1.5;
    }

    /* ── Notes ── */
    .notes-layout {
      display: grid;
      grid-template-columns: 280px 1fr;
      gap: 12px;
      min-height: 320px;
    }
    @media (max-width: 720px) {
      .notes-layout { grid-template-columns: 1fr; }
    }
    .notes-list {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      overflow: hidden;
    }
    .notes-list-header {
      padding: 10px 14px;
      border-bottom: 1px solid var(--border);
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--muted-fg);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .notes-items { overflow-y: auto; max-height: 420px; }
    .note-item {
      padding: 10px 14px;
      border-bottom: 1px solid var(--border);
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 8px;
      transition: background 80ms;
    }
    .note-item:last-child { border-bottom: none; }
    .note-item:hover { background: var(--secondary); }
    .note-item.active { background: var(--muted); border-left: 2px solid var(--accent); }
    .note-item-key {
      font-family: var(--font-mono);
      font-size: 12px;
      color: var(--fg);
    }
    .note-item-date {
      font-size: 10px;
      color: var(--muted-fg);
      white-space: nowrap;
      flex-shrink: 0;
    }
    .note-empty {
      padding: 24px 14px;
      font-size: 11px;
      color: var(--muted-fg);
      text-align: center;
    }

    .notes-panel {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .notes-editor {
      flex: 1;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .notes-editor-header {
      padding: 10px 14px;
      border-bottom: 1px solid var(--border);
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--muted-fg);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .notes-editor-body {
      flex: 1;
      padding: 14px;
      font-family: var(--font-mono);
      font-size: 12px;
      color: var(--muted-fg);
      min-height: 160px;
      white-space: pre-wrap;
      word-break: break-word;
      overflow-y: auto;
      max-height: 340px;
    }
    .notes-editor-body.placeholder { font-style: italic; }

    .notes-create {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .notes-create-title {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--muted-fg);
      margin-bottom: 4px;
    }
    .input-row { display: flex; gap: 8px; }
    input[type="text"], textarea {
      background: var(--secondary);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      color: var(--fg);
      font-family: var(--font-mono);
      font-size: 12px;
      padding: 7px 10px;
      outline: none;
      transition: border-color 120ms;
      width: 100%;
    }
    input[type="text"]:focus, textarea:focus {
      border-color: var(--accent);
    }
    input[type="text"]::placeholder, textarea::placeholder {
      color: var(--muted-fg);
    }
    textarea { resize: vertical; min-height: 72px; }

    /* ── Buttons ── */
    .btn {
      font-family: var(--font-mono);
      font-size: 12px;
      padding: 6px 14px;
      border-radius: var(--radius);
      cursor: pointer;
      border: none;
      transition: opacity 120ms, transform 80ms;
      white-space: nowrap;
    }
    .btn:hover { opacity: 0.8; transform: translateY(-1px); }
    .btn-primary {
      background: var(--accent);
      color: var(--bg);
    }
    .btn-ghost {
      background: transparent;
      border: 1px solid var(--border);
      color: var(--muted-fg);
    }
    .btn-ghost:hover { border-color: var(--accent); color: var(--accent); }
    .btn-danger {
      background: transparent;
      border: 1px solid rgba(239, 68, 68, 0.4);
      color: #ef4444;
    }
    .btn-danger:hover { border-color: #ef4444; opacity: 0.8; }
    .btn-sm { padding: 4px 10px; font-size: 11px; }

    /* ── Integrations ── */
    .integrations-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 12px;
    }
    .integration-card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 14px;
      transition: border-color 120ms ease;
    }
    .integration-card:hover { border-color: var(--accent); }
    .integration-header {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .integration-logo {
      width: 40px;
      height: 40px;
      border-radius: var(--radius);
      background: var(--secondary);
      border: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .integration-name {
      font-family: var(--font-sans);
      font-size: 15px;
      font-weight: 600;
      letter-spacing: -0.02em;
      color: var(--fg);
    }
    .integration-url {
      font-family: var(--font-mono);
      font-size: 10px;
      color: var(--muted-fg);
      margin-top: 1px;
    }
    .integration-connected {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: 10px;
      color: #6ee7b7;
    }
    .integration-connected::before {
      content: '';
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #6ee7b7;
    }
    .integration-key-row {
      background: var(--secondary);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 8px 10px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
    }
    .integration-key-label {
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--muted-fg);
      margin-bottom: 2px;
    }
    .integration-key-value {
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--fg);
      letter-spacing: 0.02em;
    }

    /* ── Toast ── */
    #toast {
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: var(--secondary);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 10px 16px;
      font-family: var(--font-mono);
      font-size: 12px;
      color: var(--fg);
      opacity: 0;
      transform: translateY(8px);
      transition: opacity 200ms, transform 200ms;
      pointer-events: none;
      z-index: 999;
    }
    #toast.show { opacity: 1; transform: translateY(0); }

    /* ── Footer ── */
    footer {
      border-top: 1px solid var(--border);
      padding: 20px 24px;
      font-size: 11px;
      color: var(--muted-fg);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    footer .accent { color: var(--accent); }
  </style>
</head>
<body>

<nav>
  <span class="nav-logo">ॐ aum-mcp-server</span>
  <div class="nav-right">
    <span id="live-clock"></span>
    <span class="nav-badge online">● running</span>
    <span class="nav-badge">v1.0.0</span>
  </div>
</nav>

<main class="container">

  <!-- Status -->
  <section>
    <p class="section-label">status</p>
    <div class="stats-grid">
      <div class="card">
        <div class="card-title">server</div>
        <div class="card-value" id="stat-hostname">—</div>
        <div class="card-meta" id="stat-platform">loading...</div>
      </div>
      <div class="card">
        <div class="card-title">runtime</div>
        <div class="card-value" id="stat-node">—</div>
        <div class="card-meta" id="stat-memory">loading...</div>
      </div>
      <div class="card">
        <div class="card-title">tools</div>
        <div class="card-value">${totalTools}</div>
        <div class="card-meta">${TOOLS.length} groups · ${INTEGRATIONS.length} integrations</div>
      </div>
    </div>
  </section>

  <!-- Integrations -->
  <section>
    <p class="section-label">integrations</p>
    <div class="integrations-grid">
      ${INTEGRATIONS.map((i) => `
      <div class="integration-card">
        <div class="integration-header">
          <div class="integration-logo" style="color:${i.color}">
            ${i.logo}
          </div>
          <div>
            <div class="integration-name">${i.name}</div>
            <div class="integration-url">${i.url}</div>
          </div>
          <div style="margin-left:auto">
            <span class="integration-connected">${i.id === "ollama" ? (process.env[i.envKey] ? "custom host" : "local") : (process.env[i.envKey] ? "connected" : "not set")}</span>
          </div>
        </div>
        <div class="integration-key-row">
          <div>
            <div class="integration-key-label">${i.id === "ollama" ? "OLLAMA_HOST (optional)" : i.envKey}</div>
            <div class="integration-key-value">${i.id === "ollama" ? (process.env[i.envKey] ?? "http://localhost:11434") : maskKey(process.env[i.envKey])}</div>
          </div>
        </div>
      </div>`).join("")}
    </div>
  </section>

  <!-- Tools -->
  <section>
    <div class="tools-section-header" onclick="toggleTools()">
      <p class="section-label">tools</p>
      <button class="tools-toggle" id="tools-toggle-btn">show ↓</button>
    </div>
    <div class="tools-collapsible" id="tools-collapsible">
      <div class="tools-groups">
        ${TOOLS.map(
          (group) => `
        <div>
          <div class="tool-group-label">${group.label}</div>
          <div class="tools-grid">
            ${group.tools
              .map(
                (t) => `
            <div class="tool-card">
              <div class="tool-name">${t.name}</div>
              <div class="tool-desc">${t.desc}</div>
            </div>`
              )
              .join("")}
          </div>
        </div>`
        ).join("")}
      </div>
    </div>
  </section>

  <!-- Notes -->
  <section>
    <p class="section-label">notes</p>
    <div class="notes-layout">
      <!-- List -->
      <div class="notes-list">
        <div class="notes-list-header">
          <span>saved notes</span>
          <button class="btn btn-ghost btn-sm" onclick="loadNotes()">↻ refresh</button>
        </div>
        <div class="notes-items" id="notes-items">
          <div class="note-empty">loading...</div>
        </div>
      </div>

      <!-- Panel -->
      <div class="notes-panel">
        <div class="notes-editor">
          <div class="notes-editor-header">
            <span id="editor-key">no note selected</span>
            <div style="display:flex;gap:6px;">
              <button class="btn btn-danger btn-sm" id="btn-delete" style="display:none" onclick="deleteNote()">delete</button>
            </div>
          </div>
          <div class="notes-editor-body placeholder" id="editor-body">Select a note from the list to view its content.</div>
        </div>

        <div class="notes-create">
          <div class="notes-create-title">new note</div>
          <div class="input-row">
            <input type="text" id="new-key" placeholder="key" style="max-width:160px" />
            <input type="text" id="new-content-inline" placeholder="content (single line)" />
          </div>
          <textarea id="new-content-multi" placeholder="or write multi-line content here..."></textarea>
          <div style="display:flex;justify-content:flex-end;">
            <button class="btn btn-primary" onclick="createNote()">save note</button>
          </div>
        </div>
      </div>
    </div>
  </section>

</main>

<footer>
  <span>ॐ <span class="accent">aum-mcp-server</span> — localhost:${PORT}</span>
  <span id="notes-count">—</span>
</footer>

<div id="toast"></div>

<script>
  let selectedKey = null;
  let notesCache = {};

  // Clock
  function updateClock() {
    const now = new Date();
    document.getElementById('live-clock').textContent = now.toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    });
  }
  updateClock();
  setInterval(updateClock, 1000);

  // Toast
  let toastTimer;
  function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
  }

  // Status
  async function loadStatus() {
    try {
      const res = await fetch('/api/status');
      const d = await res.json();
      document.getElementById('stat-hostname').textContent = d.hostname;
      document.getElementById('stat-platform').textContent = d.platform + ' · ' + d.arch;
      document.getElementById('stat-node').textContent = d.nodeVersion;
      document.getElementById('stat-memory').textContent =
        d.freeMemoryGB + ' GB free / ' + d.totalMemoryGB + ' GB total';
    } catch {}
  }

  // Notes
  async function loadNotes() {
    try {
      const res = await fetch('/api/notes');
      notesCache = await res.json();
      renderNotesList();
    } catch {}
  }

  function renderNotesList() {
    const keys = Object.keys(notesCache);
    const container = document.getElementById('notes-items');
    const countEl = document.getElementById('notes-count');
    countEl.textContent = keys.length + ' note' + (keys.length !== 1 ? 's' : '');

    if (keys.length === 0) {
      container.innerHTML = '<div class="note-empty">no notes saved yet</div>';
      return;
    }

    container.innerHTML = keys.map(k => {
      const note = notesCache[k];
      const date = new Date(note.updated).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const active = k === selectedKey ? ' active' : '';
      return \`<div class="note-item\${active}" onclick="selectNote('\${escHtml(k)}')">
        <span class="note-item-key">\${escHtml(k)}</span>
        <span class="note-item-date">\${date}</span>
      </div>\`;
    }).join('');
  }

  function selectNote(key) {
    selectedKey = key;
    const note = notesCache[key];
    document.getElementById('editor-key').textContent = key;
    const body = document.getElementById('editor-body');
    body.textContent = note.content;
    body.classList.remove('placeholder');
    document.getElementById('btn-delete').style.display = 'inline-block';
    renderNotesList();
  }

  async function createNote() {
    const key = document.getElementById('new-key').value.trim();
    const inline = document.getElementById('new-content-inline').value;
    const multi = document.getElementById('new-content-multi').value;
    const content = multi.trim() || inline.trim();

    if (!key || !content) { toast('key and content are required'); return; }

    const res = await fetch('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, content }),
    });
    if (res.ok) {
      document.getElementById('new-key').value = '';
      document.getElementById('new-content-inline').value = '';
      document.getElementById('new-content-multi').value = '';
      toast('saved "' + key + '"');
      await loadNotes();
      selectNote(key);
    }
  }

  async function deleteNote() {
    if (!selectedKey) return;
    if (!confirm('Delete note "' + selectedKey + '"?')) return;
    const res = await fetch('/api/notes/' + encodeURIComponent(selectedKey), { method: 'DELETE' });
    if (res.ok) {
      toast('deleted "' + selectedKey + '"');
      selectedKey = null;
      document.getElementById('editor-key').textContent = 'no note selected';
      const body = document.getElementById('editor-body');
      body.textContent = 'Select a note from the list to view its content.';
      body.classList.add('placeholder');
      document.getElementById('btn-delete').style.display = 'none';
      await loadNotes();
    }
  }

  function escHtml(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // Tools toggle
  function toggleTools() {
    const panel = document.getElementById('tools-collapsible');
    const btn = document.getElementById('tools-toggle-btn');
    const isOpen = panel.classList.toggle('open');
    btn.textContent = isOpen ? 'hide ↑' : 'show ↓';
  }

  // Init
  loadStatus();
  loadNotes();
  setInterval(loadStatus, 15000);
  setInterval(loadNotes, 10000);
</script>
</body>
</html>`;
}

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const url = req.url ?? "/";
  const method = req.method ?? "GET";

  res.setHeader("Access-Control-Allow-Origin", "*");

  // GET / — dashboard
  if (url === "/" && method === "GET") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(renderHTML());
    return;
  }

  // GET /api/status
  if (url === "/api/status" && method === "GET") {
    json(res, {
      hostname: hostname(),
      platform: platform(),
      arch: arch(),
      cpus: cpus().length,
      totalMemoryGB: (totalmem() / 1e9).toFixed(1),
      freeMemoryGB: (freemem() / 1e9).toFixed(1),
      nodeVersion: process.version,
    });
    return;
  }

  // GET /api/notes
  if (url === "/api/notes" && method === "GET") {
    const notes = await loadNotes();
    json(res, notes);
    return;
  }

  // POST /api/notes
  if (url === "/api/notes" && method === "POST") {
    try {
      const body = JSON.parse(await getBody(req));
      const { key, content } = body;
      if (!key || !content) { json(res, { error: "key and content required" }, 400); return; }
      const notes = await loadNotes();
      notes[key] = { content, updated: new Date().toISOString() };
      await saveNotes(notes);
      json(res, { ok: true });
    } catch {
      json(res, { error: "invalid request" }, 400);
    }
    return;
  }

  // DELETE /api/notes/:key
  if (url.startsWith("/api/notes/") && method === "DELETE") {
    const key = decodeURIComponent(url.slice("/api/notes/".length));
    const notes = await loadNotes();
    if (!(key in notes)) { json(res, { error: "not found" }, 404); return; }
    delete notes[key];
    await saveNotes(notes);
    json(res, { ok: true });
    return;
  }

  res.writeHead(404);
  res.end("not found");
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`\naum-mcp dashboard → http://localhost:${PORT}\n`);
});
