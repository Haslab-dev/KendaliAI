import { randomUUID } from "crypto";
import { dbManager } from "../database";
import { users, apiKeys } from "../database/schema";
import { eq } from "drizzle-orm";
import { log } from "../core";
import { User, ApiKey, AuthContext, Permission } from "./types";

// Secure password hashing using Bun's built-in argon2 implementation
// Bun.password uses argon2id by default which is the recommended algorithm
async function hashPassword(password: string): Promise<string> {
  return await Bun.password.hash(password, {
    // Use argon2id - the most secure variant
    algorithm: "argon2id",
    memoryCost: 65536, // 64 MB
    timeCost: 2, // 2 iterations
  });
}

async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  try {
    return await Bun.password.verify(password, hash);
  } catch (error) {
    log.error("[Auth] Password verification error:", error);
    return false;
  }
}

// Generate a secure API key
function generateApiKey(): string {
  const prefix = "kai_";
  const key = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
  return prefix + key;
}

// Hash API key for storage
async function hashApiKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

class AuthManager {
  /**
   * Create a new user
   */
  async createUser(
    username: string,
    password: string,
    role: "admin" | "user" = "user",
  ): Promise<User> {
    const id = `user_${randomUUID()}`;
    const passwordHash = await hashPassword(password);

    await dbManager.db.insert(users).values({
      id,
      username,
      passwordHash,
      role,
    });

    log.info(`[Auth] Created user: ${username}`);
    return this.getUserById(id) as Promise<User>;
  }

  /**
   * Get user by ID
   */
  async getUserById(id: string): Promise<User | null> {
    const result = await dbManager.db
      .select()
      .from(users)
      .where(eq(users.id, id));
    if (result.length === 0) return null;

    const u = result[0];
    return {
      id: u.id,
      username: u.username,
      role: u.role as "admin" | "user",
      apiKey: u.apiKey || undefined,
      createdAt: u.createdAt || "",
      updatedAt: u.updatedAt || "",
    };
  }

  /**
   * Get user by username
   */
  async getUserByUsername(username: string): Promise<User | null> {
    const result = await dbManager.db
      .select()
      .from(users)
      .where(eq(users.username, username));
    if (result.length === 0) return null;

    const u = result[0];
    return {
      id: u.id,
      username: u.username,
      role: u.role as "admin" | "user",
      apiKey: u.apiKey || undefined,
      createdAt: u.createdAt || "",
      updatedAt: u.updatedAt || "",
    };
  }

  /**
   * Validate user credentials
   */
  async validateCredentials(
    username: string,
    password: string,
  ): Promise<User | null> {
    const user = await this.getUserByUsername(username);
    if (!user) return null;

    const result = await dbManager.db
      .select()
      .from(users)
      .where(eq(users.id, user.id));
    if (result.length === 0) return null;

    const isValid = await verifyPassword(password, result[0].passwordHash);
    return isValid ? user : null;
  }

  /**
   * Create an API key for a user
   */
  async createApiKey(
    userId: string,
    name: string,
    permissions: Permission[] = [],
    expiresAt?: string,
  ): Promise<{ key: string; apiKey: ApiKey }> {
    const id = `key_${randomUUID()}`;
    const rawKey = generateApiKey();
    const keyHash = await hashApiKey(rawKey);
    const prefix = rawKey.substring(0, 12);

    await dbManager.db.insert(apiKeys).values({
      id,
      userId,
      name,
      keyHash,
      prefix,
      permissions: JSON.stringify(permissions),
      expiresAt,
    });

    log.info(`[Auth] Created API key: ${name} for user ${userId}`);

    return {
      key: rawKey,
      apiKey: {
        id,
        userId,
        name,
        prefix,
        permissions,
        expiresAt,
        createdAt: new Date().toISOString(),
      },
    };
  }

  /**
   * Validate an API key
   */
  async validateApiKey(key: string): Promise<AuthContext | null> {
    const keyHash = await hashApiKey(key);

    const result = await dbManager.db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.keyHash, keyHash));

    if (result.length === 0) return null;

    const apiKey = result[0];

    // Check if userId exists
    if (!apiKey.userId) return null;

    // Check if revoked
    if (apiKey.revokedAt) {
      return null;
    }

    // Check if expired
    if (apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date()) {
      return null;
    }

    // Get user
    const user = await this.getUserById(apiKey.userId);
    if (!user) return null;

    // Update last used
    await dbManager.db
      .update(apiKeys)
      .set({ lastUsedAt: new Date().toISOString() })
      .where(eq(apiKeys.id, apiKey.id));

    return {
      user,
      apiKey: {
        id: apiKey.id,
        userId: apiKey.userId,
        name: apiKey.name,
        prefix: apiKey.prefix,
        permissions: apiKey.permissions ? JSON.parse(apiKey.permissions) : [],
        lastUsedAt: apiKey.lastUsedAt || undefined,
        expiresAt: apiKey.expiresAt || undefined,
        createdAt: apiKey.createdAt || "",
      },
      isAuthenticated: true,
      isApiKey: true,
    };
  }

  /**
   * Revoke an API key
   */
  async revokeApiKey(keyId: string): Promise<boolean> {
    await dbManager.db
      .update(apiKeys)
      .set({ revokedAt: new Date().toISOString() })
      .where(eq(apiKeys.id, keyId));

    log.info(`[Auth] Revoked API key: ${keyId}`);
    return true;
  }

  /**
   * List API keys for a user
   */
  async listApiKeys(userId: string): Promise<ApiKey[]> {
    const result = await dbManager.db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.userId, userId));

    return result
      .filter((k) => !k.revokedAt && k.userId)
      .map((k) => ({
        id: k.id,
        userId: k.userId!,
        name: k.name,
        prefix: k.prefix,
        permissions: k.permissions ? JSON.parse(k.permissions) : [],
        lastUsedAt: k.lastUsedAt || undefined,
        expiresAt: k.expiresAt || undefined,
        createdAt: k.createdAt || "",
      }));
  }

  /**
   * Check if context has permission
   */
  hasPermission(context: AuthContext, permission: Permission): boolean {
    if (!context.isAuthenticated) return false;

    // Admin has all permissions
    if (context.user?.role === "admin") return true;

    // Check API key permissions
    if (context.apiKey) {
      if (context.apiKey.permissions.includes("admin")) return true;
      return context.apiKey.permissions.includes(permission);
    }

    // Default permissions for authenticated users
    const defaultUserPermissions: Permission[] = [
      "read:agents",
      "write:agents",
      "read:workflows",
      "write:workflows",
      "read:tools",
      "read:plugins",
      "read:messages",
      "write:messages",
      "read:gateway",
    ];

    return defaultUserPermissions.includes(permission);
  }
}

export const authManager = new AuthManager();
export { AuthManager };
