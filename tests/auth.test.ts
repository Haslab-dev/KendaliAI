import { expect, test, describe, beforeEach } from "bun:test";
import { authManager } from "../src/server/auth/manager";

describe("Auth Manager", () => {
  test("hasPermission returns false for unauthenticated context", () => {
    const context = {
      isAuthenticated: false,
    };
    const result = authManager.hasPermission(context as any, "read:agents");
    expect(result).toBe(false);
  });

  test("hasPermission returns true for admin user", () => {
    const context = {
      isAuthenticated: true,
      user: {
        id: "admin_1",
        username: "admin",
        role: "admin",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    };
    const result = authManager.hasPermission(context as any, "admin");
    expect(result).toBe(true);
  });

  test("hasPermission checks user permissions", () => {
    const context = {
      isAuthenticated: true,
      user: {
        id: "user_1",
        username: "testuser",
        role: "user",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    };
    // User has default read permissions
    const result = authManager.hasPermission(context as any, "read:agents");
    expect(result).toBe(true);
  });

  test("hasPermission checks API key permissions", () => {
    const context = {
      isAuthenticated: true,
      isApiKey: true,
      user: {
        id: "user_1",
        username: "testuser",
        role: "user",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      apiKey: {
        id: "key_1",
        userId: "user_1",
        name: "Test Key",
        prefix: "kai_abc123",
        permissions: ["read:agents", "write:agents"],
        createdAt: new Date().toISOString(),
      },
    };

    const hasReadPermission = authManager.hasPermission(
      context as any,
      "read:agents",
    );
    expect(hasReadPermission).toBe(true);

    const hasAdminPermission = authManager.hasPermission(
      context as any,
      "admin",
    );
    expect(hasAdminPermission).toBe(false);
  });
});
