/**
 * Office tools — read and create Microsoft Word and PowerPoint files.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readFile, writeFile } from "fs/promises";
import mammoth from "mammoth";
import { Document, Packer, Paragraph, HeadingLevel, TextRun, AlignmentType } from "docx";
import PptxGenJS from "pptxgenjs";
import JSZip from "jszip";

export function registerOfficeTools(server: McpServer) {
  // ── Word: Read ─────────────────────────────────────────────────────────────
  server.tool(
    "word_read",
    "Extract all text content from a Microsoft Word (.docx) file.",
    {
      path: z.string().describe("Absolute path to the .docx file"),
    },
    async ({ path }) => {
      try {
        const result = await mammoth.extractRawText({ path });
        return { content: [{ type: "text" as const, text: result.value }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  // ── Word: Create ───────────────────────────────────────────────────────────
  server.tool(
    "word_create",
    "Create a Microsoft Word (.docx) file from structured content (headings, paragraphs, bullets).",
    {
      path: z.string().describe("Absolute path to write the .docx file to"),
      items: z.array(
        z.object({
          type: z.enum(["heading1", "heading2", "heading3", "paragraph", "bullet"]).describe("Content block type"),
          text: z.string().describe("Text content"),
        })
      ).describe("Ordered list of content blocks"),
    },
    async ({ path, items }) => {
      try {
        const children = items.map((item) => {
          if (item.type === "heading1") {
            return new Paragraph({ text: item.text, heading: HeadingLevel.HEADING_1 });
          } else if (item.type === "heading2") {
            return new Paragraph({ text: item.text, heading: HeadingLevel.HEADING_2 });
          } else if (item.type === "heading3") {
            return new Paragraph({ text: item.text, heading: HeadingLevel.HEADING_3 });
          } else if (item.type === "bullet") {
            return new Paragraph({ text: item.text, bullet: { level: 0 } });
          } else {
            return new Paragraph({ children: [new TextRun(item.text)] });
          }
        });

        const doc = new Document({ sections: [{ children }] });
        const buffer = await Packer.toBuffer(doc);
        await writeFile(path, buffer);
        return { content: [{ type: "text" as const, text: `Created Word document at ${path}` }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  // ── PowerPoint: Read ───────────────────────────────────────────────────────
  server.tool(
    "ppt_read",
    "Extract all text content from a Microsoft PowerPoint (.pptx) file, slide by slide.",
    {
      path: z.string().describe("Absolute path to the .pptx file"),
    },
    async ({ path }) => {
      try {
        const data = await readFile(path);
        const zip = await JSZip.loadAsync(data);

        const slideFiles = Object.keys(zip.files)
          .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
          .sort((a, b) => {
            const na = parseInt(a.match(/\d+/)![0]);
            const nb = parseInt(b.match(/\d+/)![0]);
            return na - nb;
          });

        const slides: string[] = [];
        for (let i = 0; i < slideFiles.length; i++) {
          const xml = await zip.files[slideFiles[i]].async("string");
          const texts: string[] = [];
          const regex = /<a:t[^>]*>([^<]*)<\/a:t>/g;
          let match: RegExpExecArray | null;
          while ((match = regex.exec(xml)) !== null) {
            const t = match[1].trim();
            if (t) texts.push(t);
          }
          slides.push(`Slide ${i + 1}:\n${texts.join("\n")}`);
        }

        return { content: [{ type: "text" as const, text: slides.join("\n\n") }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  // ── PowerPoint: Create ─────────────────────────────────────────────────────
  server.tool(
    "ppt_create",
    "Create a Microsoft PowerPoint (.pptx) file from a list of slides, each with a title and optional bullet points.",
    {
      path: z.string().describe("Absolute path to write the .pptx file to (must end in .pptx)"),
      slides: z.array(
        z.object({
          title: z.string().describe("Slide title"),
          content: z.array(z.string()).optional().describe("Bullet points or body lines"),
        })
      ).describe("Ordered list of slides"),
    },
    async ({ path, slides }) => {
      try {
        const prs = new PptxGenJS();

        for (const s of slides) {
          const slide = prs.addSlide();

          slide.addText(s.title, {
            x: 0.5,
            y: 0.4,
            w: 9,
            h: 1.2,
            fontSize: 32,
            bold: true,
            color: "111111",
          });

          if (s.content && s.content.length > 0) {
            const bullets = s.content.map((line) => ({
              text: line,
              options: { bullet: true, fontSize: 18, color: "333333" },
            }));
            slide.addText(bullets, { x: 0.5, y: 1.8, w: 9, h: 4.5 });
          }
        }

        await prs.writeFile({ fileName: path });
        return { content: [{ type: "text" as const, text: `Created PowerPoint at ${path}` }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );
}
