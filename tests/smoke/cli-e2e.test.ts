/**
 * E2E Smoke Test: CLI Commands
 *
 * Tests the KendaliAI CLI commands end-to-end.
 * Run with: bun --env-file=.env test tests/smoke/cli-e2e.test.ts
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { spawn, execSync } from "child_process";
import { existsSync, rmSync, mkdirSync } from "fs";
import { join } from "path";
import { testCredentials } from "./test-config";

// CLI path
const CLI_PATH = join(process.cwd(), "src", "cli.ts");
const TEST_DIR = join(process.cwd(), ".test-kendaliai");

// Helper to run CLI commands
async function runCli(
  args: string[],
  timeout = 30000,
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      proc.kill();
      reject(new Error("Command timeout"));
    }, timeout);

    const proc = spawn("bun", ["run", CLI_PATH, ...args], {
      cwd: process.cwd(),
      env: {
        ...process.env,
      },
    });

    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      clearTimeout(timeoutId);
      resolve({ stdout, stderr, code: code || 0 });
    });

    proc.on("error", (err) => {
      clearTimeout(timeoutId);
      reject(err);
    });
  });
}

describe("CLI E2E Tests", () => {
  beforeAll(() => {
    // Create test directory
    if (!existsSync(TEST_DIR)) {
      mkdirSync(TEST_DIR, { recursive: true });
    }
  });

  afterAll(() => {
    // Cleanup test directory
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe("Help and Version", () => {
    test("should show help message", async () => {
      const { stdout, code } = await runCli(["--help"]);

      expect(code).toBe(0);
      expect(stdout).toContain("KendaliAI");
      expect(stdout).toContain("USAGE");
      expect(stdout).toContain("COMMANDS");
    }, 10000);

    test("should show version", async () => {
      const { stdout, code } = await runCli(["--version"]);

      expect(code).toBe(0);
      expect(stdout).toContain("0.2.0");
    }, 10000);
  });

  describe("Init and Doctor", () => {
    test("should initialize database", async () => {
      const { stdout, code } = await runCli(["init"]);

      expect(code).toBe(0);
      expect(stdout).toContain("Database initialized");
    }, 10000);

    test("should run diagnostics", async () => {
      const { stdout, code } = await runCli(["doctor"]);

      expect(code).toBe(0);
      expect(stdout).toContain("KendaliAI Diagnostics");
      expect(stdout).toContain("Database");
    }, 15000);
  });

  describe("Gateway Management", () => {
    test("should list gateways", async () => {
      const { stdout, code } = await runCli(["gateway", "list"]);

      expect(code).toBe(0);
      expect(stdout).toContain("Name");
    }, 10000);

    test("should create a gateway", async () => {
      const { stdout, code } = await runCli([
        "gateway",
        "create",
        "test-smoke-gw",
        "--provider",
        "deepseek",
        "--api-key",
        testCredentials.provider.apiKey,
        "--model",
        testCredentials.provider.model,
      ]);

      expect(code).toBe(0);
      expect(stdout).toContain("created successfully");
    }, 15000);

    test("should show gateway details", async () => {
      const { stdout, code } = await runCli([
        "gateway",
        "show",
        "test-smoke-gw",
      ]);

      expect(code).toBe(0);
      expect(stdout).toContain("test-smoke-gw");
    }, 10000);

    test("should delete gateway", async () => {
      const { stdout, code } = await runCli([
        "gateway",
        "delete",
        "test-smoke-gw",
        "--force",
      ]);

      expect(code).toBe(0);
      expect(stdout).toContain("deleted");
    }, 10000);
  });

  describe("Status and Info", () => {
    test("should show status", async () => {
      const { stdout, code } = await runCli(["status"]);

      expect(code).toBe(0);
      expect(stdout.length).toBeGreaterThan(0);
    }, 10000);
  });

  describe("Skills", () => {
    test("should list skills", async () => {
      const { stdout, code } = await runCli(["skills", "list"]);

      expect(code).toBe(0);
      expect(stdout.length).toBeGreaterThan(0);
    }, 10000);
  });

  describe("Routing", () => {
    test("should list routing", async () => {
      const { stdout, code } = await runCli(["routing", "list"]);

      expect(code).toBe(0);
      expect(stdout.length).toBeGreaterThan(0);
    }, 10000);
  });

  describe("Agent Chat", () => {
    test("should create gateway for agent test", async () => {
      const { stdout, code } = await runCli([
        "gateway",
        "create",
        "agent-test-gw",
        "--provider",
        "deepseek",
        "--api-key",
        testCredentials.provider.apiKey,
        "--model",
        testCredentials.provider.model,
      ]);

      expect(code).toBe(0);
    }, 15000);

    test("should chat with agent", async () => {
      const { stdout, code } = await runCli([
        "agent",
        "-m",
        'Say "smoke test ok" and nothing else',
        "-g",
        "agent-test-gw",
      ]);

      expect(code).toBe(0);
      expect(stdout).toContain("smoke test");
    }, 30000);

    test("should cleanup agent test gateway", async () => {
      const { stdout, code } = await runCli([
        "gateway",
        "delete",
        "agent-test-gw",
        "--force",
      ]);

      expect(code).toBe(0);
    }, 10000);
  });
});
