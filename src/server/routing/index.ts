/**
 * KendaliAI Channel Routing Module
 *
 * Implements Phase 3: Channel-to-Gateway Routing
 * - Prefix-based routing
 * - Keyword-based routing
 * - Interactive gateway selection
 * - Channel-to-gateway binding
 */

import { Database } from "bun:sqlite";

// ============================================
// Types
// ============================================

export type RoutingMode =
  | "prefix"
  | "keyword"
  | "interactive"
  | "broadcast"
  | "round-robin"
  | "default";

export interface RoutingConfig {
  mode: RoutingMode;
  defaultGateway?: string;
  gateways?: string[];
  prefix?: string;
  keywords?: string[];
}

export interface ChannelBinding {
  channelId: string;
  gatewayId: string;
  routing: RoutingConfig;
  priority: number;
  enabled: boolean;
}

export interface RoutingResult {
  gatewayId: string | null;
  gatewayName: string | null;
  matched: boolean;
  matchType:
    | "prefix"
    | "keyword"
    | "default"
    | "interactive"
    | "broadcast"
    | "round-robin"
    | "none";
  strippedMessage?: string;
  interactiveOptions?: InteractiveOption[];
}

export interface InteractiveOption {
  gatewayId: string;
  gatewayName: string;
  description: string;
  prefix: string;
}

export interface GatewayInfo {
  id: string;
  name: string;
  description: string | null;
  routing_config: string | null;
}

// ============================================
// Routing Manager Class
// ============================================

export class RoutingManager {
  private db: Database;
  private roundRobinIndex: Map<string, number> = new Map();

  constructor(db: Database) {
    this.db = db;
  }

  /**
   * Route a message to the appropriate gateway
   */
  routeMessage(
    channelId: string,
    message: string,
    senderId: string,
  ): RoutingResult {
    // Get all bindings for this channel
    const bindings = this.getChannelBindings(channelId);

    if (bindings.length === 0) {
      // No bindings - try to get default gateway
      const defaultGateway = this.getDefaultGateway();
      if (defaultGateway) {
        return {
          gatewayId: defaultGateway.id,
          gatewayName: defaultGateway.name,
          matched: true,
          matchType: "default",
        };
      }

      return {
        gatewayId: null,
        gatewayName: null,
        matched: false,
        matchType: "none",
      };
    }

    // Single binding - use it directly
    if (bindings.length === 1) {
      const binding = bindings[0];
      const gateway = this.getGatewayById(binding.gatewayId);

      if (!gateway) {
        return {
          gatewayId: null,
          gatewayName: null,
          matched: false,
          matchType: "none",
        };
      }

      // Check routing mode for single binding
      if (binding.routing.mode === "prefix" && binding.routing.prefix) {
        const prefixResult = this.matchPrefix(message, binding.routing.prefix);
        if (prefixResult.matched) {
          return {
            gatewayId: binding.gatewayId,
            gatewayName: gateway.name,
            matched: true,
            matchType: "prefix",
            strippedMessage: prefixResult.strippedMessage,
          };
        }

        // Prefix not matched - return none
        return {
          gatewayId: null,
          gatewayName: null,
          matched: false,
          matchType: "none",
        };
      }

      return {
        gatewayId: binding.gatewayId,
        gatewayName: gateway.name,
        matched: true,
        matchType: "default",
      };
    }

    // Multiple bindings - apply routing logic
    return this.routeMultipleGateways(bindings, message, channelId);
  }

  /**
   * Route when multiple gateways are bound to a channel
   */
  private routeMultipleGateways(
    bindings: ChannelBinding[],
    message: string,
    channelId: string,
  ): RoutingResult {
    // 1. Try prefix-based routing first
    for (const binding of bindings) {
      if (binding.routing.mode === "prefix" && binding.routing.prefix) {
        const prefixResult = this.matchPrefix(message, binding.routing.prefix);
        if (prefixResult.matched) {
          const gateway = this.getGatewayById(binding.gatewayId);
          return {
            gatewayId: binding.gatewayId,
            gatewayName: gateway?.name || null,
            matched: true,
            matchType: "prefix",
            strippedMessage: prefixResult.strippedMessage,
          };
        }
      }
    }

    // 2. Try keyword-based routing
    for (const binding of bindings) {
      if (
        binding.routing.mode === "keyword" &&
        binding.routing.keywords?.length
      ) {
        if (this.matchKeywords(message, binding.routing.keywords)) {
          const gateway = this.getGatewayById(binding.gatewayId);
          return {
            gatewayId: binding.gatewayId,
            gatewayName: gateway?.name || null,
            matched: true,
            matchType: "keyword",
          };
        }
      }
    }

    // 3. Check for interactive mode
    const interactiveBindings = bindings.filter(
      (b) => b.routing.mode === "interactive",
    );
    if (interactiveBindings.length > 0) {
      // Check if message is a selection number
      const selectionNum = parseInt(message.trim());
      if (
        !isNaN(selectionNum) &&
        selectionNum > 0 &&
        selectionNum <= interactiveBindings.length
      ) {
        const binding = interactiveBindings[selectionNum - 1];
        const gateway = this.getGatewayById(binding.gatewayId);
        return {
          gatewayId: binding.gatewayId,
          gatewayName: gateway?.name || null,
          matched: true,
          matchType: "interactive",
        };
      }

      // Return interactive options
      const options: InteractiveOption[] = interactiveBindings.map(
        (binding, index) => {
          const gateway = this.getGatewayById(binding.gatewayId);
          return {
            gatewayId: binding.gatewayId,
            gatewayName: gateway?.name || "Unknown",
            description: gateway?.description || "",
            prefix: binding.routing.prefix || `/${index + 1}`,
          };
        },
      );

      return {
        gatewayId: null,
        gatewayName: null,
        matched: false,
        matchType: "interactive",
        interactiveOptions: options,
      };
    }

    // 4. Broadcast mode - return all gateways
    const broadcastBindings = bindings.filter(
      (b) => b.routing.mode === "broadcast",
    );
    if (broadcastBindings.length > 0) {
      // For broadcast, we return the first one and mark as broadcast
      // The caller should handle sending to all
      const binding = broadcastBindings[0];
      const gateway = this.getGatewayById(binding.gatewayId);
      return {
        gatewayId: binding.gatewayId,
        gatewayName: gateway?.name || null,
        matched: true,
        matchType: "broadcast",
      };
    }

    // 5. Round-robin mode
    const roundRobinBindings = bindings.filter(
      (b) => b.routing.mode === "round-robin",
    );
    if (roundRobinBindings.length > 0) {
      const index = this.getNextRoundRobinIndex(
        channelId,
        roundRobinBindings.length,
      );
      const binding = roundRobinBindings[index];
      const gateway = this.getGatewayById(binding.gatewayId);
      return {
        gatewayId: binding.gatewayId,
        gatewayName: gateway?.name || null,
        matched: true,
        matchType: "round-robin",
      };
    }

    // 6. Fall back to default gateway
    const defaultBinding = bindings.find((b) => b.routing.defaultGateway);
    if (defaultBinding) {
      const gateway = this.getGatewayById(defaultBinding.gatewayId);
      return {
        gatewayId: defaultBinding.gatewayId,
        gatewayName: gateway?.name || null,
        matched: true,
        matchType: "default",
      };
    }

    // 7. Use first binding as fallback
    const firstBinding = bindings[0];
    const gateway = this.getGatewayById(firstBinding.gatewayId);
    return {
      gatewayId: firstBinding.gatewayId,
      gatewayName: gateway?.name || null,
      matched: true,
      matchType: "default",
    };
  }

  /**
   * Match message against prefix
   */
  private matchPrefix(
    message: string,
    prefix: string,
  ): { matched: boolean; strippedMessage?: string } {
    const normalizedMessage = message.trim();
    const normalizedPrefix = prefix.trim();

    if (normalizedMessage.startsWith(normalizedPrefix)) {
      return {
        matched: true,
        strippedMessage: normalizedMessage
          .slice(normalizedPrefix.length)
          .trim(),
      };
    }

    return { matched: false };
  }

  /**
   * Match message against keywords
   */
  private matchKeywords(message: string, keywords: string[]): boolean {
    const lowerMessage = message.toLowerCase();
    return keywords.some((keyword) => {
      const lowerKeyword = keyword.toLowerCase();
      // Match whole word or phrase
      return lowerMessage.includes(lowerKeyword);
    });
  }

  /**
   * Get next round-robin index
   */
  private getNextRoundRobinIndex(channelId: string, total: number): number {
    const currentIndex = this.roundRobinIndex.get(channelId) || 0;
    const nextIndex = (currentIndex + 1) % total;
    this.roundRobinIndex.set(channelId, nextIndex);
    return currentIndex;
  }

  /**
   * Get channel bindings from database
   */
  private getChannelBindings(channelId: string): ChannelBinding[] {
    try {
      const results = this.db
        .query<
          {
            channel_id: string;
            gateway_id: string;
            routing_config: string | null;
            priority: number;
            enabled: number;
          },
          [string]
        >(
          `
        SELECT cb.channel_id, cb.gateway_id, cb.routing_config, cb.priority, cb.enabled
        FROM channel_bindings cb
        WHERE cb.channel_id = ? AND cb.enabled = 1
        ORDER BY cb.priority ASC
      `,
        )
        .all(channelId);

      return results.map((row) => {
        let routing: RoutingConfig = { mode: "default" };
        try {
          if (row.routing_config) {
            routing = JSON.parse(row.routing_config);
          }
        } catch (parseError) {
          console.warn(
            `Failed to parse routing config for channel ${channelId}:`,
            parseError,
          );
        }

        return {
          channelId: row.channel_id,
          gatewayId: row.gateway_id,
          routing,
          priority: row.priority,
          enabled: row.enabled === 1,
        };
      });
    } catch (error) {
      // Table might not exist yet - this is expected on first run
      if (error instanceof Error && !error.message.includes("no such table")) {
        console.warn("Unexpected error fetching channel bindings:", error);
      }
      return [];
    }
  }

  /**
   * Get gateway by ID
   */
  private getGatewayById(id: string): GatewayInfo | null {
    try {
      const result = this.db
        .query<GatewayInfo, [string]>(
          `
        SELECT id, name, description, routing_config FROM gateways WHERE id = ?
      `,
        )
        .get(id);
      return result || null;
    } catch (error) {
      console.warn(`Failed to fetch gateway ${id}:`, error);
      return null;
    }
  }

  /**
   * Get default gateway
   */
  private getDefaultGateway(): GatewayInfo | null {
    try {
      const result = this.db
        .query<GatewayInfo, []>(
          `
        SELECT id, name, description, routing_config FROM gateways
        WHERE status = 'running'
        LIMIT 1
      `,
        )
        .get();
      return result || null;
    } catch (error) {
      console.warn("Failed to fetch default gateway:", error);
      return null;
    }
  }

  /**
   * Bind a channel to a gateway
   */
  bindChannelToGateway(
    channelId: string,
    gatewayId: string,
    routing: RoutingConfig,
    priority: number = 0,
  ): boolean {
    try {
      const now = Date.now();
      const routingJson = JSON.stringify(routing);

      // Check if binding already exists
      const existing = this.db
        .query<{ id: string }, [string, string]>(
          `
        SELECT id FROM channel_bindings WHERE channel_id = ? AND gateway_id = ?
      `,
        )
        .get(channelId, gatewayId);

      if (existing) {
        // Update existing binding
        this.db.run(
          `
          UPDATE channel_bindings 
          SET routing_config = ?, priority = ?, enabled = 1, updated_at = ?
          WHERE channel_id = ? AND gateway_id = ?
        `,
          [routingJson, priority, now, channelId, gatewayId],
        );
      } else {
        // Create new binding
        const bindingId = `cb_${Date.now().toString(36)}`;
        this.db.run(
          `
          INSERT INTO channel_bindings (id, channel_id, gateway_id, routing_config, priority, enabled, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 1, ?, ?)
        `,
          [bindingId, channelId, gatewayId, routingJson, priority, now, now],
        );
      }

      return true;
    } catch (error) {
      console.error("Failed to bind channel to gateway:", error);
      return false;
    }
  }

  /**
   * Unbind a channel from a gateway
   */
  unbindChannelFromGateway(channelId: string, gatewayId: string): boolean {
    try {
      this.db.run(
        `
        UPDATE channel_bindings SET enabled = 0, updated_at = ?
        WHERE channel_id = ? AND gateway_id = ?
      `,
        [Date.now(), channelId, gatewayId],
      );
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get all bindings for a gateway
   */
  getGatewayBindings(gatewayId: string): ChannelBinding[] {
    try {
      const results = this.db
        .query<
          {
            channel_id: string;
            gateway_id: string;
            routing_config: string | null;
            priority: number;
            enabled: number;
          },
          [string]
        >(
          `
        SELECT channel_id, gateway_id, routing_config, priority, enabled
        FROM channel_bindings
        WHERE gateway_id = ? AND enabled = 1
        ORDER BY priority ASC
      `,
        )
        .all(gatewayId);

      return results.map((row) => {
        let routing: RoutingConfig = { mode: "default" };
        try {
          if (row.routing_config) {
            routing = JSON.parse(row.routing_config);
          }
        } catch {}

        return {
          channelId: row.channel_id,
          gatewayId: row.gateway_id,
          routing,
          priority: row.priority,
          enabled: row.enabled === 1,
        };
      });
    } catch {
      return [];
    }
  }

  /**
   * Generate interactive selection message
   */
  generateInteractiveMessage(options: InteractiveOption[]): string {
    let message = "🤖 *Which assistant do you need?*\n\n";

    options.forEach((option, index) => {
      const desc = option.description ? ` - ${option.description}` : "";
      message += `[${index + 1}] **${option.gatewayName}**${desc}\n`;
    });

    message += "\n_Reply with a number to select an assistant._";
    return message;
  }

  /**
   * Get all gateways that can be bound
   */
  getAvailableGateways(): GatewayInfo[] {
    try {
      return this.db
        .query<GatewayInfo, []>(
          `
        SELECT id, name, description, routing_config FROM gateways
        ORDER BY name ASC
      `,
        )
        .all();
    } catch {
      return [];
    }
  }

  /**
   * Update gateway routing config
   */
  updateGatewayRouting(
    gatewayId: string,
    routing: Partial<RoutingConfig>,
  ): boolean {
    try {
      const gateway = this.getGatewayById(gatewayId);
      if (!gateway) return false;

      let existingRouting: RoutingConfig = { mode: "default" };
      try {
        if (gateway.routing_config) {
          existingRouting = JSON.parse(gateway.routing_config);
        }
      } catch {}

      const newRouting = { ...existingRouting, ...routing };

      this.db.run(
        `
        UPDATE gateways SET routing_config = ?, updated_at = ? WHERE id = ?
      `,
        [JSON.stringify(newRouting), Date.now(), gatewayId],
      );

      return true;
    } catch {
      return false;
    }
  }
}

// ============================================
// Database Initialization
// ============================================

/**
 * Initialize routing tables
 */
export function initRoutingTables(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS channel_bindings (
      id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      gateway_id TEXT NOT NULL,
      routing_config TEXT,
      priority INTEGER DEFAULT 0,
      enabled INTEGER DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (channel_id) REFERENCES channels(id),
      FOREIGN KEY (gateway_id) REFERENCES gateways(id),
      UNIQUE(channel_id, gateway_id)
    )
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_channel_bindings_channel ON channel_bindings(channel_id)
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_channel_bindings_gateway ON channel_bindings(gateway_id)
  `);
}

// Export singleton instance (will be initialized with db)
let routingManagerInstance: RoutingManager | null = null;

export function getRoutingManager(db: Database): RoutingManager {
  if (!routingManagerInstance) {
    routingManagerInstance = new RoutingManager(db);
    initRoutingTables(db);
  }
  return routingManagerInstance;
}

export { routingManagerInstance as routingManager };
