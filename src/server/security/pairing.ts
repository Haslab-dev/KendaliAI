/**
 * KendaliAI Security Module - ZeroClaw-Style
 *
 * Features:
 * - 6-digit pairing code system
 * - Bearer token generation
 * - Channel allowlists (deny-by-default)
 * - Workspace scoping
 */

import { randomBytes, createHash } from "crypto";
import { Database } from "bun:sqlite";

// ============================================
// Types
// ============================================

export interface PairingResult {
  success: boolean;
  pairingCode?: string;
  bearerToken?: string;
  error?: string;
}

export interface PairingStatus {
  isPaired: boolean;
  pairingCode?: string;
  expiresAt?: Date;
}

export interface AllowlistCheck {
  allowed: boolean;
  reason?: string;
}

// ============================================
// Configuration
// ============================================

const PAIRING_CODE_LENGTH = 6;
const PAIRING_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const BEARER_TOKEN_BYTES = 32;

// ============================================
// Pairing System
// ============================================

/**
 * Generate a 6-digit pairing code
 */
export function generatePairingCode(): string {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  return code;
}

/**
 * Generate a secure bearer token
 */
export function generateBearerToken(): string {
  const bytes = randomBytes(BEARER_TOKEN_BYTES);
  return `kai_${bytes.toString("base64url")}`;
}

/**
 * Hash a token for storage
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Get database from global or create new
 */
function getDb(): Database {
  // Try to use global db if available
  const globalDb = (globalThis as any).__kendaliai_db as Database | undefined;
  if (globalDb) return globalDb;

  // Otherwise create new connection
  return new Database(".kendaliai/kendaliai.db");
}

/**
 * Create a new pairing for a gateway
 */
export async function createPairing(gatewayId: string): Promise<PairingResult> {
  const db = getDb();
  const pairingId = `pair_${randomBytes(8).toString("hex")}`;
  const pairingCode = generatePairingCode();
  const now = Date.now();
  const expiresAt = now + PAIRING_EXPIRY_MS;

  // Invalidate any existing pending pairings
  db.run(
    `
    UPDATE pairings SET status = 'expired'
    WHERE gateway_id = ? AND status = 'pending'
  `,
    [gatewayId],
  );

  // Create new pairing
  db.run(
    `
    INSERT INTO pairings (id, gateway_id, pairing_code, status, created_at, expires_at)
    VALUES (?, ?, ?, 'pending', ?, ?)
  `,
    [pairingId, gatewayId, pairingCode, now, expiresAt],
  );

  return {
    success: true,
    pairingCode,
  };
}

/**
 * Complete pairing with code exchange for bearer token
 */
export async function completePairing(
  gatewayId: string,
  pairingCode: string,
  metadata?: { ip?: string; userAgent?: string },
): Promise<PairingResult> {
  const db = getDb();
  const now = Date.now();

  // Find valid pairing
  const pairing = db
    .query<
      {
        id: string;
        gateway_id: string;
        pairing_code: string;
        status: string;
        expires_at: number;
      },
      [string, string, number]
    >(
      `
    SELECT id, gateway_id, pairing_code, status, expires_at 
    FROM pairings 
    WHERE gateway_id = ? AND pairing_code = ? AND status = 'pending' AND expires_at > ?
    LIMIT 1
  `,
    )
    .get(gatewayId, pairingCode, now);

  if (!pairing) {
    return {
      success: false,
      error: "Invalid or expired pairing code",
    };
  }

  // Generate bearer token
  const bearerToken = generateBearerToken();
  const tokenHash = hashToken(bearerToken);

  // Update pairing
  db.run(
    `
    UPDATE pairings 
    SET status = 'paired', bearer_token = ?, token_hash = ?, paired_by = ?, user_agent = ?, paired_at = ?
    WHERE id = ?
  `,
    [
      bearerToken,
      tokenHash,
      metadata?.ip || null,
      metadata?.userAgent || null,
      now,
      pairing.id,
    ],
  );

  return {
    success: true,
    bearerToken,
  };
}

/**
 * Verify a bearer token
 */
export async function verifyBearerToken(
  gatewayId: string,
  token: string,
): Promise<boolean> {
  const db = getDb();
  const tokenHash = hashToken(token);

  const pairing = db
    .query<{ id: string }, [string, string]>(
      `
    SELECT id FROM pairings 
    WHERE gateway_id = ? AND token_hash = ? AND status = 'paired'
    LIMIT 1
  `,
    )
    .get(gatewayId, tokenHash);

  return !!pairing;
}

/**
 * Get pairing status for a gateway
 */
export async function getPairingStatus(
  gatewayId: string,
): Promise<PairingStatus> {
  const db = getDb();
  const now = Date.now();

  // Check for paired status
  const paired = db
    .query<{ id: string }, [string]>(
      `
    SELECT id FROM pairings 
    WHERE gateway_id = ? AND status = 'paired'
    LIMIT 1
  `,
    )
    .get(gatewayId);

  if (paired) {
    return { isPaired: true };
  }

  // Check for pending pairing
  const pending = db
    .query<
      {
        pairing_code: string;
        expires_at: number;
      },
      [string, number]
    >(
      `
    SELECT pairing_code, expires_at FROM pairings 
    WHERE gateway_id = ? AND status = 'pending' AND expires_at > ?
    LIMIT 1
  `,
    )
    .get(gatewayId, now);

  if (pending) {
    return {
      isPaired: false,
      pairingCode: pending.pairing_code,
      expiresAt: new Date(pending.expires_at),
    };
  }

  return { isPaired: false };
}

/**
 * Revoke all pairings for a gateway
 */
export async function revokePairings(gatewayId: string): Promise<void> {
  const db = getDb();
  db.run(
    `
    UPDATE pairings SET status = 'revoked' WHERE gateway_id = ?
  `,
    [gatewayId],
  );
}

// ============================================
// Channel Allowlists (Deny-by-Default)
// ============================================

/**
 * Check if a user is allowed to interact with a channel
 */
export async function checkAllowlist(
  channelId: string,
  userId: string,
): Promise<AllowlistCheck> {
  const db = getDb();

  const channel = db
    .query<{ allowed_users: string | null }, [string]>(
      `
    SELECT allowed_users FROM channels WHERE id = ? LIMIT 1
  `,
    )
    .get(channelId);

  if (!channel) {
    return { allowed: false, reason: "Channel not found" };
  }

  // Parse allowed users
  let allowedUsers: string[] = [];
  try {
    allowedUsers = channel.allowed_users
      ? JSON.parse(channel.allowed_users)
      : [];
  } catch {
    allowedUsers = [];
  }

  // Empty allowlist = deny all
  if (allowedUsers.length === 0) {
    return {
      allowed: false,
      reason: "No users in allowlist (deny-by-default)",
    };
  }

  // "*" = allow all
  if (allowedUsers.includes("*")) {
    return { allowed: true };
  }

  // Check exact match
  if (allowedUsers.includes(userId)) {
    return { allowed: true };
  }

  return { allowed: false, reason: "User not in allowlist" };
}

/**
 * Add user to channel allowlist
 */
export async function addToAllowlist(
  channelId: string,
  userId: string,
): Promise<void> {
  const db = getDb();

  const channel = db
    .query<{ allowed_users: string | null }, [string]>(
      `
    SELECT allowed_users FROM channels WHERE id = ? LIMIT 1
  `,
    )
    .get(channelId);

  if (!channel) return;

  let allowedUsers: string[] = [];
  try {
    allowedUsers = channel.allowed_users
      ? JSON.parse(channel.allowed_users)
      : [];
  } catch {
    allowedUsers = [];
  }

  if (!allowedUsers.includes(userId)) {
    allowedUsers.push(userId);
    db.run(
      `
      UPDATE channels SET allowed_users = ?, updated_at = ? WHERE id = ?
    `,
      [JSON.stringify(allowedUsers), Date.now(), channelId],
    );
  }
}

/**
 * Remove user from channel allowlist
 */
export async function removeFromAllowlist(
  channelId: string,
  userId: string,
): Promise<void> {
  const db = getDb();

  const channel = db
    .query<{ allowed_users: string | null }, [string]>(
      `
    SELECT allowed_users FROM channels WHERE id = ? LIMIT 1
  `,
    )
    .get(channelId);

  if (!channel) return;

  let allowedUsers: string[] = [];
  try {
    allowedUsers = channel.allowed_users
      ? JSON.parse(channel.allowed_users)
      : [];
  } catch {
    allowedUsers = [];
  }

  allowedUsers = allowedUsers.filter((u) => u !== userId);

  db.run(
    `
    UPDATE channels SET allowed_users = ?, updated_at = ? WHERE id = ?
  `,
    [JSON.stringify(allowedUsers), Date.now(), channelId],
  );
}

// ============================================
// Workspace Scoping
// ============================================

const FORBIDDEN_PATHS = [
  "/etc",
  "/root",
  "/proc",
  "/sys",
  "/dev",
  "/boot",
  "/lib",
  "/usr",
  "/bin",
  "/sbin",
  "/var/log",
  "/home",
];

const FORBIDDEN_FILES = [".ssh", ".gnupg", ".aws", ".env", ".htpasswd"];

/**
 * Check if a path is allowed under workspace scoping
 */
export function isPathAllowed(
  path: string,
  workspaceRoot: string,
  workspaceOnly: boolean = true,
): { allowed: boolean; reason?: string } {
  // Normalize path
  const normalizedPath = path.replace(/\\/g, "/");
  const normalizedRoot = workspaceRoot.replace(/\\/g, "/");

  // Check for null bytes (security)
  if (path.includes("\0")) {
    return { allowed: false, reason: "Null byte in path" };
  }

  // Check forbidden paths
  for (const forbidden of FORBIDDEN_PATHS) {
    if (normalizedPath.startsWith(forbidden)) {
      return { allowed: false, reason: `Access to ${forbidden} is forbidden` };
    }
  }

  // Check forbidden files
  for (const forbidden of FORBIDDEN_FILES) {
    if (
      normalizedPath.includes(`/${forbidden}/`) ||
      normalizedPath.endsWith(`/${forbidden}`)
    ) {
      return { allowed: false, reason: `Access to ${forbidden} is forbidden` };
    }
  }

  // If workspace_only, check if path is within workspace
  if (workspaceOnly) {
    if (!normalizedPath.startsWith(normalizedRoot)) {
      return {
        allowed: false,
        reason: "Path outside workspace (workspace_only enabled)",
      };
    }
  }

  return { allowed: true };
}

// ============================================
// Gateway Security Check
// ============================================

/**
 * Check if gateway can bind to public address
 */
export async function canBindPublic(
  gatewayId: string,
): Promise<{ allowed: boolean; reason?: string }> {
  const db = getDb();

  const gateway = db
    .query<{ allow_public_bind: number }, [string]>(
      `
    SELECT allow_public_bind FROM gateways WHERE id = ? LIMIT 1
  `,
    )
    .get(gatewayId);

  if (!gateway) {
    return { allowed: false, reason: "Gateway not found" };
  }

  if (gateway.allow_public_bind) {
    return { allowed: true };
  }

  // Check if tunnel is active
  // TODO: Check tunnel status

  return {
    allowed: false,
    reason: "Public bind requires tunnel or explicit allow_public_bind",
  };
}

// ============================================
// Export Security Manager
// ============================================

export const securityManager = {
  // Pairing
  createPairing,
  completePairing,
  verifyBearerToken,
  getPairingStatus,
  revokePairings,

  // Allowlists
  checkAllowlist,
  addToAllowlist,
  removeFromAllowlist,

  // Workspace
  isPathAllowed,

  // Gateway
  canBindPublic,

  // Utils
  generatePairingCode,
  generateBearerToken,
  hashToken,
};
