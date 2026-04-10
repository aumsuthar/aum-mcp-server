/**
 * SLURM HPC cluster tools — SSH access to any SLURM-based cluster.
 * Env vars: SLURM_HOST, SLURM_USERNAME, SLURM_PASSWORD
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Client } from "ssh2";

function sshExec(command: string, timeoutMs = 30000): Promise<string> {
  return new Promise((resolve, reject) => {
    const host = process.env.SLURM_HOST ?? process.env.OSC_HOST;
    const username = process.env.SLURM_USERNAME ?? process.env.OSC_USERNAME;
    const password = process.env.SLURM_PASSWORD ?? process.env.OSC_PASSWORD;

    if (!host || !username || !password) {
      return reject(new Error("SLURM_HOST, SLURM_USERNAME, and SLURM_PASSWORD must be set in .env"));
    }

    const conn = new Client();
    let output = "";
    let errOutput = "";

    const timer = setTimeout(() => {
      conn.end();
      reject(new Error(`SSH command timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);

    conn
      .on("ready", () => {
        conn.exec(command, (err, stream) => {
          if (err) {
            clearTimeout(timer);
            conn.end();
            return reject(err);
          }
          stream
            .on("data", (data: Buffer) => { output += data.toString(); })
            .stderr.on("data", (data: Buffer) => { errOutput += data.toString(); });
          stream.on("close", () => {
            clearTimeout(timer);
            conn.end();
            resolve((output + errOutput).trim());
          });
        });
      })
      .on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      })
      .connect({ host, port: 22, username, password });
  });
}

export function registerSlurmTools(server: McpServer) {
  server.tool(
    "slurm_run",
    "Run a shell command on the HPC cluster via SSH. IMPORTANT: Never run sbatch or any job submission command without explicit user permission in the current message.",
    {
      command: z.string().describe("Shell command to execute on the cluster"),
      timeout: z.number().default(30000).describe("Timeout in milliseconds (default 30s)"),
    },
    async ({ command, timeout }) => {
      try {
        const output = await sshExec(command, timeout);
        return { content: [{ type: "text" as const, text: output || "(no output)" }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "slurm_jobs",
    "List current SLURM jobs in the queue (runs squeue).",
    {
      all: z.boolean().default(false).describe("If true, show all jobs on the cluster, not just the user's"),
    },
    async ({ all }) => {
      const username = process.env.SLURM_USERNAME ?? process.env.OSC_USERNAME ?? "";
      const cmd = all
        ? "squeue --format='%.18i %.9P %.30j %.8u %.8T %.10M %.6D %R'"
        : `squeue -u ${username} --format='%.18i %.9P %.30j %.8u %.8T %.10M %.6D %R'`;
      try {
        const output = await sshExec(cmd);
        return { content: [{ type: "text" as const, text: output || "No jobs in queue." }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "slurm_files",
    "List files in a directory on the HPC cluster.",
    {
      path: z.string().default("$HOME").describe("Remote path to list (default: home directory)"),
    },
    async ({ path }) => {
      try {
        const output = await sshExec(`ls -lah ${path}`);
        return { content: [{ type: "text" as const, text: output }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "slurm_read_file",
    "Read the contents of a file on the HPC cluster.",
    {
      path: z.string().describe("Remote path to the file"),
    },
    async ({ path }) => {
      try {
        const output = await sshExec(`cat ${path}`);
        return { content: [{ type: "text" as const, text: output }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "slurm_submit_job",
    "Submit a SLURM batch job. Writes the script to a temp file then calls sbatch. IMPORTANT: Never submit a job without explicit user permission in the current message. Always show the script and ask for confirmation before submitting.",
    {
      script: z.string().describe("Full contents of the SLURM batch script (including #!/bin/bash and #SBATCH directives)"),
      name: z.string().default("job").describe("Job script filename (without extension)"),
    },
    async ({ script, name }) => {
      try {
        const remote_path = `/tmp/${name}_${Date.now()}.sh`;
        const escaped = script.replace(/'/g, `'\\''`);
        const output = await sshExec(
          `printf '%s' '${escaped}' > ${remote_path} && chmod +x ${remote_path} && sbatch ${remote_path}`,
          60000
        );
        return { content: [{ type: "text" as const, text: output }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "slurm_storage",
    "Check storage quota and disk usage on the HPC cluster.",
    {},
    async () => {
      try {
        const output = await sshExec("quota -s 2>/dev/null || df -h $HOME $SCRATCH 2>/dev/null || echo 'quota not available'");
        return { content: [{ type: "text" as const, text: output }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );
}
