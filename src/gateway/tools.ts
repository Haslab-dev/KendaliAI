/**
 * KendaliAI Gateway Tools
 *
 * Built-in tools that the AI can use to interact with the system.
 */

import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs";

/**
 * Security configuration for tool restrictions
 */
const ALLOWED_SHELL_COMMANDS = [
  // File system (read-only)
  "ls",
  "dir",
  "cat",
  "head",
  "tail",
  "less",
  "more",
  "wc",
  "file",
  "find",
  "locate",
  "whereis",
  "which",
  // System info
  "date",
  "cal",
  "uptime",
  "whoami",
  "hostname",
  "uname",
  "id",
  "df",
  "du",
  "free",
  "top",
  "ps",
  "pgrep",
  "pkill",
  // Network (read-only)
  "ping",
  "curl",
  "wget",
  "nslookup",
  "dig",
  "host",
  "whois",
  // Text processing
  "echo",
  "printf",
  "grep",
  "sed",
  "awk",
  "cut",
  "sort",
  "uniq",
  "tr",
  "tee",
  "xargs",
  // Misc
  "clear",
  "env",
  "printenv",
  "pwd",
];

const BLOCKED_COMMAND_PATTERNS = [
  /\brm\s/, // rm (delete files)
  /\bmv\s/, // mv (move/rename files)
  /\bcp\s/, // cp (copy files)
  /\bchmod\s/, // chmod (change permissions)
  /\bchown\s/, // chown (change ownership)
  /\bsudo\s/, // sudo (elevate privileges)
  /\bsu\s/, // su (switch user)
  /\bdd\s/, // dd (disk operations)
  /\bmkfs/, // mkfs (format disk)
  /\bfdisk/, // fdisk (partition editor)
  /\bshutdown/, // shutdown system
  /\breboot/, // reboot system
  /\binit\s/, // init system
  /\bsystemctl/, // systemd control
  /\bservice\s/, // service control
  /\/etc\/passwd/, // password file
  /\/etc\/shadow/, // shadow file
  /\.ssh/, // SSH keys
  /\.env/, // environment files
  /api[_-]?key/i, // API keys
  /\btoken/i, // tokens
  /\bsecret/i, // secrets
  /\bpassword/i, // passwords
  /\bcredential/i, // credentials
  />/, // output redirection (write)
  /\|/, // pipe (could chain dangerous commands)
  /`/, // command substitution
  /\$\(/, // command substitution
];

// Allowed paths for file operations (relative to cwd or absolute safe paths)
const getAllowedPaths = (): string[] => {
  const cwd = process.cwd();
  return [
    cwd, // Current working directory
    path.join(cwd, "data"), // Data directory
    path.join(cwd, "workspace"), // Workspace directory
    path.join(cwd, "tmp"), // Temp directory
    "/tmp", // System temp (read-only for safety)
  ];
};

/**
 * Check if a path is within allowed directories
 */
function isPathAllowed(targetPath: string): {
  allowed: boolean;
  reason?: string;
} {
  const resolvedPath = path.resolve(targetPath);
  const allowedPaths = getAllowedPaths();

  // Check if path is within any allowed directory
  const isAllowed = allowedPaths.some((allowedPath) => {
    const resolved = path.resolve(allowedPath);
    return resolvedPath.startsWith(resolved);
  });

  if (!isAllowed) {
    return {
      allowed: false,
      reason: `Path '${targetPath}' is outside allowed directories. Allowed: ${allowedPaths.join(", ")}`,
    };
  }

  // Check for suspicious path components
  const suspiciousPatterns = [
    /\.\./, // Parent directory traversal
    /\/etc\//, // System config
    /\/root\//, // Root user home
    /\.ssh/, // SSH keys
    /\.gnupg/, // GPG keys
    /\.env/, // Environment files
    /api[_-]?key/i, // API key files
    /token/i, // Token files
    /secret/i, // Secret files
    /password/i, // Password files
    /credential/i, // Credential files
  ];

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(resolvedPath)) {
      return {
        allowed: false,
        reason: `Path contains restricted component matching pattern: ${pattern}`,
      };
    }
  }

  return { allowed: true };
}

/**
 * Validate shell command for safety
 */
function validateShellCommand(command: string): {
  allowed: boolean;
  reason?: string;
} {
  const trimmed = command.trim();

  // Extract base command (first word)
  const baseCmd = trimmed.split(/\s+/)[0]?.replace(/^\//, "") || "";

  // Check against blocked patterns first
  for (const pattern of BLOCKED_COMMAND_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        allowed: false,
        reason: `Command contains blocked pattern: ${pattern}`,
      };
    }
  }

  // Check if base command is in allowlist
  if (!ALLOWED_SHELL_COMMANDS.includes(baseCmd)) {
    return {
      allowed: false,
      reason: `Command '${baseCmd}' is not in the allowed list. Allowed commands: ${ALLOWED_SHELL_COMMANDS.slice(0, 10).join(", ")}...`,
    };
  }

  return { allowed: true };
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<
      string,
      {
        type: string;
        description: string;
      }
    >;
    required?: string[];
  };
  execute: (params: Record<string, unknown>) => Promise<string>;
}

/**
 * System information tool
 */
export const systemInfoTool: ToolDefinition = {
  name: "get_system_info",
  description:
    "Get information about the system/machine the bot is running on. Returns OS, CPU, memory, and hostname details.",
  parameters: {
    type: "object",
    properties: {
      info_type: {
        type: "string",
        description:
          "Type of info to get: 'all', 'os', 'cpu', 'memory', 'hostname', 'uptime'",
      },
    },
  },
  execute: async (params) => {
    const infoType = (params.info_type as string) || "all";

    const info: Record<string, string> = {};

    if (infoType === "all" || infoType === "os") {
      info.os = `${os.type()} ${os.release()} (${os.platform()})`;
      info.arch = os.arch();
    }

    if (infoType === "all" || infoType === "hostname") {
      info.hostname = os.hostname();
    }

    if (infoType === "all" || infoType === "cpu") {
      const cpus = os.cpus();
      info.cpuModel = cpus[0]?.model || "Unknown";
      info.cpuCores = String(cpus.length);
      info.cpuSpeed = `${cpus[0]?.speed} MHz`;
    }

    if (infoType === "all" || infoType === "memory") {
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const usedMem = totalMem - freeMem;

      info.totalMemory = `${Math.round(totalMem / 1024 / 1024 / 1024)} GB`;
      info.usedMemory = `${Math.round(usedMem / 1024 / 1024 / 1024)} GB`;
      info.freeMemory = `${Math.round(freeMem / 1024 / 1024 / 1024)} GB`;
      info.memoryUsage = `${Math.round((usedMem / totalMem) * 100)}%`;
    }

    if (infoType === "all" || infoType === "uptime") {
      const uptime = os.uptime();
      const days = Math.floor(uptime / 86400);
      const hours = Math.floor((uptime % 86400) / 3600);
      const mins = Math.floor((uptime % 3600) / 60);

      info.uptime = `${days}d ${hours}h ${mins}m`;
    }

    return JSON.stringify(info, null, 2);
  },
};

/**
 * Shell command execution tool
 */
export const shellTool: ToolDefinition = {
  name: "execute_shell",
  description:
    "Execute a shell command on the system. Restricted to safe, read-only commands. Returns stdout and stderr.",
  parameters: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "The shell command to execute (read-only commands only)",
      },
    },
    required: ["command"],
  },
  execute: async (params) => {
    const command = params.command as string;

    // Validate command for security
    const validation = validateShellCommand(command);
    if (!validation.allowed) {
      return `Security: Command blocked - ${validation.reason}`;
    }

    try {
      // Use Bun.spawn with shell to properly execute commands
      const proc = Bun.spawn(["sh", "-c", command], {
        stdout: "pipe",
        stderr: "pipe",
      });

      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;

      let output = stdout;

      if (stderr) {
        output += `\n[stderr]: ${stderr}`;
      }

      if (exitCode !== 0) {
        output = `Exit code: ${exitCode}\n${output}`;
      }

      if (output.length > 10000) {
        output = output.slice(0, 10000) + "\n... (truncated)";
      }

      return output || "(no output)";
    } catch (error: unknown) {
      return `Error: ${(error as Error).message}`;
    }
  },
};

/**
 * File read tool
 */
export const readFileTool: ToolDefinition = {
  name: "read_file",
  description:
    "Read the contents of a file from the filesystem. Restricted to allowed directories.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description:
          "The path to the file to read (must be within allowed directories)",
      },
      lines: {
        type: "number",
        description:
          "Number of lines to read (optional, reads all if not specified)",
      },
    },
    required: ["path"],
  },
  execute: async (params) => {
    const filePath = params.path as string;
    const lines = params.lines as number | undefined;

    // Validate path for security
    const pathValidation = isPathAllowed(filePath);
    if (!pathValidation.allowed) {
      return `Security: Access denied - ${pathValidation.reason}`;
    }

    try {
      const content = await Bun.file(filePath).text();

      if (lines) {
        return content.split("\n").slice(0, lines).join("\n");
      }

      if (content.length > 10000) {
        return content.slice(0, 10000) + "\n\n... (truncated, file too large)";
      }

      return content;
    } catch (error: unknown) {
      return `Error reading file: ${(error as Error).message}`;
    }
  },
};

/**
 * List directory tool
 */
export const listDirTool: ToolDefinition = {
  name: "list_directory",
  description:
    "List contents of a directory. Restricted to allowed directories.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description:
          "The directory path to list (must be within allowed directories, default: current directory)",
      },
    },
  },
  execute: async (params) => {
    const dirPath = (params.path as string) || ".";

    // Validate path for security
    const pathValidation = isPathAllowed(dirPath);
    if (!pathValidation.allowed) {
      return `Security: Access denied - ${pathValidation.reason}`;
    }

    try {
      const files: string[] = [];

      for await (const entry of new Bun.Glob("*").scan(dirPath)) {
        files.push(entry);
      }

      const result = files.map((name) => {
        const filePath = path.join(dirPath, name);
        const file = Bun.file(filePath);

        const type = file.size !== undefined ? "📄" : "📁";
        return `${type} ${name}`;
      });

      return `Contents of ${path.resolve(dirPath)}:\n${result.join("\n")}`;
    } catch (error: unknown) {
      return `Error listing directory: ${(error as Error).message}`;
    }
  },
};

/**
 * Current date/time tool
 */
export const dateTimeTool: ToolDefinition = {
  name: "get_datetime",
  description: "Get the current date and time",
  parameters: {
    type: "object",
    properties: {
      format: {
        type: "string",
        description: "Format: 'iso', 'locale', or 'unix'",
      },
    },
  },
  execute: async (params) => {
    const format = (params.format as string) || "locale";
    const now = new Date();

    switch (format) {
      case "iso":
        return now.toISOString();
      case "unix":
        return String(Math.floor(now.getTime() / 1000));
      default:
        return now.toLocaleString();
    }
  },
};

/**
 * All available tools
 */
export const builtinTools: ToolDefinition[] = [
  systemInfoTool,
  shellTool,
  readFileTool,
  listDirTool,
  dateTimeTool,
];

/**
 * Get tool definitions in AI SDK format
 */
export function getToolDefinitions() {
  return builtinTools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }));
}

/**
 * Execute a tool by name
 */
export async function executeTool(
  name: string,
  params: Record<string, unknown>,
): Promise<string> {
  const tool = builtinTools.find((t) => t.name === name);

  if (!tool) {
    return `Unknown tool: ${name}`;
  }

  return tool.execute(params);
}
