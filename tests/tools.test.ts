import { expect, test, describe, beforeEach } from "bun:test";
import { toolRegistry } from "../src/server/tools/registry";
import { ToolValidator, toolValidator } from "../src/server/tools/validation";
import { permissionManager } from "../src/server/tools/permissions";

describe("Tool Registry", () => {
  beforeEach(() => {
    // Clear registered tools
    toolRegistry["tools"].clear();
  });

  test("registers a tool correctly", () => {
    const tool = {
      name: "test_tool",
      description: "A test tool",
      schema: { type: "object", properties: {} },
      execute: async () => "result",
    };

    toolRegistry.register(tool);
    expect(toolRegistry.get("test_tool")).toBeDefined();
  });

  test("lists all registered tools", () => {
    toolRegistry.register({
      name: "tool1",
      description: "Tool 1",
      schema: { type: "object", properties: {} },
      execute: async () => "result1",
    });

    toolRegistry.register({
      name: "tool2",
      description: "Tool 2",
      schema: { type: "object", properties: {} },
      execute: async () => "result2",
    });

    const tools = toolRegistry.listTools();
    expect(tools.length).toBe(2);
  });

  test("executes a tool with parameters", async () => {
    toolRegistry.register({
      name: "echo",
      description: "Echo tool",
      schema: {
        type: "object",
        properties: {
          message: { type: "string" },
        },
      },
      execute: async (params: Record<string, unknown>) => {
        return `Echo: ${params.message}`;
      },
    });

    const result = await toolRegistry.execute("echo", { message: "hello" });
    expect(result).toBe("Echo: hello");
  });

  test("throws error for non-existent tool", async () => {
    await expect(async () => {
      await toolRegistry.execute("non_existent", {});
    }).toThrow();
  });

  test("checks if tool exists", () => {
    toolRegistry.register({
      name: "existing_tool",
      description: "Existing tool",
      schema: { type: "object", properties: {} },
      execute: async () => "result",
    });

    expect(toolRegistry.has("existing_tool")).toBe(true);
    expect(toolRegistry.has("non_existent")).toBe(false);
  });

  test("unregisters a tool", () => {
    toolRegistry.register({
      name: "temp_tool",
      description: "Temporary tool",
      schema: { type: "object", properties: {} },
      execute: async () => "result",
    });

    expect(toolRegistry.has("temp_tool")).toBe(true);
    toolRegistry.unregister("temp_tool");
    expect(toolRegistry.has("temp_tool")).toBe(false);
  });
});

describe("Tool Validator", () => {
  beforeEach(() => {
    // Clear and register test tool
    toolRegistry["tools"].clear();
    toolRegistry.register({
      name: "test_tool",
      description: "Test tool for validation",
      schema: {
        name: "string",
        age: "number",
        "email?": "string", // Optional field (ends with ?)
      },
      execute: async () => "result",
    });
  });

  test("validates correct parameters", () => {
    const errors = toolValidator.validate("test_tool", {
      name: "John",
      age: 25,
      email: "john@example.com",
    });
    expect(errors.length).toBe(0);
  });

  test("catches missing required fields", () => {
    const errors = toolValidator.validate("test_tool", { age: 25 });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.field === "name")).toBe(true);
  });

  test("catches type mismatches", () => {
    const errors = toolValidator.validate("test_tool", {
      name: "John",
      age: "not a number",
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  test("returns error for non-existent tool", () => {
    const errors = toolValidator.validate("non_existent_tool", {});
    expect(errors.length).toBe(1);
    expect(errors[0].field).toBe("tool");
  });

  test("validates and sanitizes parameters", () => {
    const result = toolValidator.validateAndSanitize("test_tool", {
      name: "John",
      age: 25,
      email: "john@example.com",
    });
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  test("sanitize removes unknown fields", () => {
    toolRegistry.register({
      name: "sanitize_test",
      description: "Test sanitization",
      schema: {
        name: "string",
      },
      execute: async () => "result",
    });

    const sanitized = toolValidator.sanitize("sanitize_test", {
      name: "John",
      unknownField: "should be removed",
    });
    expect(sanitized.name).toBe("John");
    expect(sanitized.unknownField).toBeUndefined();
  });
});

describe("Permission Manager", () => {
  test("getPermissionLevel returns allowed by default", async () => {
    // Clear cache
    permissionManager.clearCache();
    const level =
      await permissionManager.getPermissionLevel("unknown_tool_test");
    expect(level).toBe("allowed");
  });

  test("canExecute returns allowed for default tools", async () => {
    permissionManager.clearCache();
    const result = await permissionManager.canExecute("unknown_tool_test", {
      source: "api",
    });
    expect(result.allowed).toBe(true);
  });

  test("clearCache works correctly", () => {
    permissionManager["permissionCache"].set("test", "restricted");
    expect(permissionManager["permissionCache"].has("test")).toBe(true);
    permissionManager.clearCache();
    expect(permissionManager["permissionCache"].has("test")).toBe(false);
  });

  test("listToolPermissions returns array", async () => {
    const permissions = await permissionManager.listToolPermissions();
    expect(Array.isArray(permissions)).toBe(true);
  });
});
