/**
 * KendaliAI Gateway Storage
 *
 * File-based storage for gateway configurations.
 */

import { writeFile, readFile, readdir, unlink, mkdir } from "fs/promises";
import { join } from "path";
import type { GatewayConfig, GatewayInfo } from "./types";

const GATEWAYS_DIR = join(process.cwd(), "gateways");

/**
 * Ensure the gateways directory exists
 */
async function ensureGatewaysDir(): Promise<void> {
  try {
    await mkdir(GATEWAYS_DIR, { recursive: true });
  } catch {
    // Directory already exists
  }
}

/**
 * Save a gateway configuration to file
 */
export async function saveGateway(config: GatewayConfig): Promise<void> {
  await ensureGatewaysDir();
  const filePath = join(GATEWAYS_DIR, `${config.name}.json`);
  await writeFile(filePath, JSON.stringify(config, null, 2));
}

/**
 * Load a gateway configuration by name
 */
export async function loadGateway(name: string): Promise<GatewayConfig | null> {
  try {
    const filePath = join(GATEWAYS_DIR, `${name}.json`);
    const content = await readFile(filePath, "utf-8");
    return JSON.parse(content) as GatewayConfig;
  } catch {
    return null;
  }
}

/**
 * Load a gateway configuration by ID
 */
export async function loadGatewayById(
  id: string,
): Promise<GatewayConfig | null> {
  try {
    const gateways = await listGateways();
    const gateway = gateways.find((g) => g.id === id);
    if (gateway) {
      return await loadGateway(gateway.name);
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * List all gateway configurations
 */
export async function listGateways(): Promise<GatewayConfig[]> {
  try {
    await ensureGatewaysDir();
    const files = await readdir(GATEWAYS_DIR);
    const gateways: GatewayConfig[] = [];

    for (const file of files) {
      if (file.endsWith(".json")) {
        try {
          const content = await readFile(join(GATEWAYS_DIR, file), "utf-8");
          gateways.push(JSON.parse(content) as GatewayConfig);
        } catch {
          // Skip invalid files
        }
      }
    }

    return gateways;
  } catch {
    return [];
  }
}

/**
 * Get simplified gateway info for display
 */
export async function listGatewayInfo(): Promise<GatewayInfo[]> {
  const gateways = await listGateways();
  return gateways.map((g) => ({
    name: g.name,
    provider: g.provider.type,
    channel: g.channel.type,
    status: g.status,
  }));
}

/**
 * Delete a gateway configuration
 */
export async function deleteGateway(name: string): Promise<void> {
  const filePath = join(GATEWAYS_DIR, `${name}.json`);
  await unlink(filePath);
}

/**
 * Update gateway status
 */
export async function updateGatewayStatus(
  name: string,
  status: GatewayConfig["status"],
): Promise<void> {
  const config = await loadGateway(name);
  if (config) {
    config.status = status;
    await saveGateway(config);
  }
}

/**
 * Generate a unique gateway ID
 */
export function generateGatewayId(): string {
  return `gw_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;
}
