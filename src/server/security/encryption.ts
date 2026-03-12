/**
 * KendaliAI Encryption Utilities
 * 
 * Provides secure encryption for sensitive data like API keys.
 * Uses AES-256-GCM for authenticated encryption.
 */

import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * Get or derive the encryption key from environment or machine-specific data
 */
function getEncryptionKey(): Buffer {
  // Use KENDALIAI_KEY env var if available, otherwise derive from machine
  const envKey = process.env.KENDALIAI_KEY;
  if (envKey) {
    // Use SHA-256 to ensure 32-byte key
    return createHash("sha256").update(envKey).digest();
  }
  
  // Derive key from machine-specific data (home directory + username)
  const machineId = `${process.env.HOME}-${process.env.USER}`;
  return createHash("sha256").update(machineId).digest();
}

/**
 * Encrypt sensitive data
 * @param plaintext - The string to encrypt
 * @returns Encrypted string in format: iv:authTag:ciphertext (base64)
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  
  const cipher = createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(plaintext, "utf8", "base64");
  encrypted += cipher.final("base64");
  
  const authTag = cipher.getAuthTag();
  
  // Format: iv:authTag:ciphertext (all base64 encoded)
  return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted}`;
}

/**
 * Decrypt sensitive data
 * @param encryptedData - The encrypted string in format: iv:authTag:ciphertext
 * @returns Decrypted plaintext
 */
export function decrypt(encryptedData: string): string {
  const key = getEncryptionKey();
  
  const parts = encryptedData.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted data format");
  }
  
  const [ivB64, authTagB64, ciphertext] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(ciphertext, "base64", "utf8");
  decrypted += decipher.final("utf8");
  
  return decrypted;
}

/**
 * Hash a token for storage (one-way)
 * @param token - The token to hash
 * @returns SHA-256 hash of the token
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Mask sensitive data for display
 * @param value - The value to mask
 * @param visibleChars - Number of characters to show at the end
 * @returns Masked string
 */
export function maskValue(value: string, visibleChars: number = 4): string {
  if (!value || value.length <= visibleChars) {
    return "*".repeat(Math.max(value?.length || 4, 4));
  }
  return "*".repeat(value.length - visibleChars) + value.slice(-visibleChars);
}
