import { execSync } from "child_process";
import { resolve, join, dirname } from "path";
import { existsSync, lstatSync } from "fs";

/**
 * Hermes Suite v3.0 - RakitKode-Compatible Bun Native Engine
 */
export class HermesSuite {
  private yolo: boolean;
  private root: string;

  constructor(options: { yolo?: boolean; root?: string } = {}) {
    this.yolo = options.yolo || false;
    this.root = options.root || process.cwd();
  }

  public getTools() {
    return [
      {
        name: "terminal",
        description: "Run shell commands (git, bun, npm, pip, etc).",
        parameters: {
          type: "object",
          properties: { command: { type: "string" } },
          required: ["command"],
        },
        execute: async (args: any) => this.run(args.command),
      },
      {
        name: "read_file",
        description: "Read file contents. Returns full file content.",
        parameters: {
          type: "object",
          properties: { path: { type: "string" } },
          required: ["path"],
        },
        execute: async (args: any) => this.read(args.path),
      },
      {
        name: "write_file",
        description:
          "Write/Create a file with complete content. Always provide the full content.",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string" },
            content: { type: "string" },
          },
          required: ["path", "content"],
        },
        execute: async (args: any) => this.write(args.path, args.content),
      },
      {
        name: "ls",
        description: "List files with recursive support and smart filtering.",
        parameters: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "Directory to list (default: .)",
            },
            recursive: { type: "boolean" },
          },
        },
        execute: async (args: any) => this.list(args.path, args.recursive),
      },
      {
        name: "execute_code",
        description: "Execute Python or JS scripts via terminal.",
        parameters: {
          type: "object",
          properties: {
            command: { type: "string" },
            language: { type: "string" },
          },
          required: ["command"],
        },
        execute: async (args: any) => this.runCode(args.command, args.language),
      },
    ];
  }

  private run(command: string) {
    if ((command.includes("rm") || command.includes("mv")) && !this.yolo) {
      return { status: "PENDING_APPROVAL", command };
    }
    try {
      const output = execSync(command, {
        cwd: this.root,
        encoding: "utf8",
        timeout: 45000,
      });
      return output || "Done (successfully executed).";
    } catch (err: any) {
      return `EXECUTION ERROR:\n${err.stderr || err.message}`;
    }
  }

  private async read(path: string) {
    try {
      const full = resolve(this.root, path);
      const file = (globalThis as any).Bun.file(full);
      if (!(await file.exists())) return `Error: File not found at ${path}`;
      const content = await file.text();
      return content.length > 15000
        ? content.slice(0, 15000) + "\n\n[CONTENT TRUNCATED FOR SAFETY]"
        : content;
    } catch (err: any) {
      return `READ ERROR: ${err.message}`;
    }
  }

  private async write(path: string, content: string) {
    if (!this.yolo && (path.includes(".env") || path.includes("config"))) {
      return { status: "PENDING_APPROVAL", command: `write_file: ${path}` };
    }
    try {
      const full = resolve(this.root, path);
      await (globalThis as any).Bun.write(full, content);
      return `Successfully written to ${path} (${content.length} bytes).`;
    } catch (err: any) {
      return `WRITE ERROR: ${err.message}`;
    }
  }

  private async list(path: string = ".", recursive: boolean = false) {
    try {
      const absPath = resolve(this.root, path);
      const pattern = recursive ? "**/*" : "*";
      const glob = new (globalThis as any).Bun.Glob(pattern);

      const files: string[] = [];
      for await (const file of glob.scan({ cwd: absPath, onlyFiles: false })) {
        if (file.includes("node_modules") || file.includes(".git/")) continue;
        if (
          file.startsWith(".") &&
          !file.includes(".env") &&
          !file.includes(".gemini")
        )
          continue;

        files.push(file);
        if (files.length > 500) break;
      }
      return files.length > 0 ? files.join("\n") : "(No matching files found)";
    } catch (err: any) {
      return `LIST ERROR: ${err.message}`;
    }
  }

  private runCode(code: string, lang: string = "python") {
    const isPy = lang.toLowerCase().includes("py");
    // Use temporary file for complex code blocks (RakitKode style)
    const tmpFile = isPy ? "tmp_hermes.py" : "tmp_hermes.js";
    return `[SUGGESTION]: Save your code to ${tmpFile} and then run it with: ${isPy ? "python3" : "node"} ${tmpFile}`;
  }
}
