/**
 * KendaliAI Routing CLI Module
 * 
 * CLI commands for managing channel-to-gateway routing:
 * - routing bind <channel> <gateway>
 * - routing unbind <channel> <gateway>
 * - routing list
 * - routing set-prefix <gateway> <prefix>
 * - routing set-keywords <gateway> <keywords>
 * - routing set-mode <gateway> <mode>
 */

import { Database } from "bun:sqlite";
import { 
  RoutingManager, 
  getRoutingManager, 
  RoutingMode, 
  RoutingConfig 
} from "../server/routing";

// ============================================
// Helper Functions
// ============================================

function parseRoutingMode(mode: string): RoutingMode | null {
  const validModes: RoutingMode[] = ["prefix", "keyword", "interactive", "broadcast", "round-robin", "default"];
  if (validModes.includes(mode as RoutingMode)) {
    return mode as RoutingMode;
  }
  return null;
}

function printRoutingHelp(): void {
  console.log(`
KendaliAI Channel Routing Commands

Usage: kendaliai routing <command> [options]

Commands:
  bind <channel-id> <gateway-name>  Bind a channel to a gateway
    Options:
      --mode <mode>       Routing mode (prefix, keyword, interactive, broadcast, round-robin)
      --prefix <prefix>   Prefix for prefix-based routing (e.g., /dev)
      --keywords <kw>     Comma-separated keywords for keyword-based routing
      --priority <num>    Binding priority (lower = higher priority)

  unbind <channel-id> <gateway-name>
    Remove binding between channel and gateway

  list                              List all channel bindings
  list <gateway-name>               List bindings for a specific gateway

  set-mode <gateway-name> <mode>    Set routing mode for a gateway
  set-prefix <gateway-name> <prefix>
    Set prefix for prefix-based routing

  set-keywords <gateway-name> <keywords>
    Set keywords for keyword-based routing (comma-separated)

  show <channel-id> [test-message]  Show routing configuration for a channel
                                    Optionally test routing with a message

Examples:
  # Bind channel to gateway with prefix routing
  kendaliai routing bind ch_abc123 dev-assistant --mode prefix --prefix /dev

  # Bind channel with keyword routing
  kendaliai routing bind ch_abc123 support-bot --mode keyword --keywords "help,support,issue"

  # List all bindings
  kendaliai routing list

  # Set gateway routing mode
  kendaliai routing set-mode dev-assistant prefix
`);
}

// ============================================
// Command Handlers
// ============================================

export async function handleRoutingCommand(
  db: Database,
  subCommand: string,
  args: string[]
): Promise<void> {
  const routingManager = getRoutingManager(db);

  switch (subCommand) {
    case "bind": {
      if (args.length < 2) {
        console.error("❌ Error: Channel ID and gateway name required");
        console.log("Usage: kendaliai routing bind <channel-id> <gateway-name> [options]");
        return;
      }

      const channelId = args[0];
      const gatewayName = args[1];

      // Parse options
      let mode: RoutingMode = "default";
      let prefix: string | undefined;
      let keywords: string[] | undefined;
      let priority = 0;

      for (let i = 2; i < args.length; i++) {
        const arg = args[i];
        const nextArg = args[i + 1];

        if (arg === "--mode" && nextArg) {
          const parsedMode = parseRoutingMode(nextArg);
          if (parsedMode) {
            mode = parsedMode;
          } else {
            console.error(`❌ Invalid mode: ${nextArg}`);
            console.log("Valid modes: prefix, keyword, interactive, broadcast, round-robin, default");
            return;
          }
          i++;
        } else if (arg === "--prefix" && nextArg) {
          prefix = nextArg;
          i++;
        } else if (arg === "--keywords" && nextArg) {
          keywords = nextArg.split(",").map(k => k.trim()).filter(k => k);
          i++;
        } else if (arg === "--priority" && nextArg) {
          priority = parseInt(nextArg) || 0;
          i++;
        }
      }

      // Get gateway ID
      const gateway = db.query<{ id: string; name: string }, [string]>(`
        SELECT id, name FROM gateways WHERE name = ?
      `).get(gatewayName);

      if (!gateway) {
        console.error(`❌ Gateway '${gatewayName}' not found`);
        return;
      }

      // Build routing config
      const routingConfig: RoutingConfig = { mode };
      if (prefix) routingConfig.prefix = prefix;
      if (keywords) routingConfig.keywords = keywords;

      // Create binding
      const success = routingManager.bindChannelToGateway(
        channelId,
        gateway.id,
        routingConfig,
        priority
      );

      if (success) {
        console.log(`✅ Bound channel '${channelId}' to gateway '${gatewayName}'`);
        console.log(`   Mode: ${mode}`);
        if (prefix) console.log(`   Prefix: ${prefix}`);
        if (keywords) console.log(`   Keywords: ${keywords.join(", ")}`);
        console.log(`   Priority: ${priority}`);
      } else {
        console.error(`❌ Failed to create binding`);
      }
      break;
    }

    case "unbind": {
      if (args.length < 2) {
        console.error("❌ Error: Channel ID and gateway name required");
        console.log("Usage: kendaliai routing unbind <channel-id> <gateway-name>");
        return;
      }

      const channelId = args[0];
      const gatewayName = args[1];

      // Get gateway ID
      const gateway = db.query<{ id: string }, [string]>(`
        SELECT id FROM gateways WHERE name = ?
      `).get(gatewayName);

      if (!gateway) {
        console.error(`❌ Gateway '${gatewayName}' not found`);
        return;
      }

      const success = routingManager.unbindChannelFromGateway(channelId, gateway.id);

      if (success) {
        console.log(`✅ Unbound channel '${channelId}' from gateway '${gatewayName}'`);
      } else {
        console.error(`❌ Failed to remove binding`);
      }
      break;
    }

    case "list": {
      const gatewayFilter = args[0];

      if (gatewayFilter) {
        // List bindings for specific gateway
        const gateway = db.query<{ id: string; name: string }, [string]>(`
          SELECT id, name FROM gateways WHERE name = ?
        `).get(gatewayFilter);

        if (!gateway) {
          console.error(`❌ Gateway '${gatewayFilter}' not found`);
          return;
        }

        const bindings = routingManager.getGatewayBindings(gateway.id);

        if (bindings.length === 0) {
          console.log(`No bindings for gateway '${gatewayFilter}'`);
          return;
        }

        console.log(`\nBindings for gateway '${gatewayFilter}':\n`);
        for (const binding of bindings) {
          console.log(`  Channel: ${binding.channelId}`);
          console.log(`    Mode: ${binding.routing.mode}`);
          if (binding.routing.prefix) {
            console.log(`    Prefix: ${binding.routing.prefix}`);
          }
          if (binding.routing.keywords) {
            console.log(`    Keywords: ${binding.routing.keywords.join(", ")}`);
          }
          console.log(`    Priority: ${binding.priority}`);
          console.log();
        }
      } else {
        // List all bindings
        const bindings = db.query<{
          id: string;
          channel_id: string;
          gateway_id: string;
          routing_config: string | null;
          priority: number;
          enabled: number;
        }, []>(`
          SELECT * FROM channel_bindings WHERE enabled = 1 ORDER BY priority ASC
        `).all();

        if (bindings.length === 0) {
          console.log("No channel bindings found.");
          console.log("\nTo create a binding:");
          console.log("  kendaliai routing bind <channel-id> <gateway-name> --mode prefix --prefix /dev");
          return;
        }

        console.log("\n╔══════════════════════════════════════════════════════════════════════════╗");
        console.log("║                        Channel Bindings                                   ║");
        console.log("╠══════════════════════════════════════════════════════════════════════════╣");

        for (const binding of bindings) {
          // Get gateway name
          const gateway = db.query<{ name: string }, [string]>(`
            SELECT name FROM gateways WHERE id = ?
          `).get(binding.gateway_id);

          let routing: RoutingConfig = { mode: "default" };
          try {
            if (binding.routing_config) {
              routing = JSON.parse(binding.routing_config);
            }
          } catch {}

          const gatewayName = gateway?.name || binding.gateway_id;
          const mode = routing.mode;
          const extra = routing.prefix ? ` (${routing.prefix})` : 
                        routing.keywords ? ` (${routing.keywords.length} keywords)` : "";

          console.log(`║ ${binding.channel_id.padEnd(16)} → ${gatewayName.padEnd(16)} ${mode.padEnd(12)} ${extra.padEnd(16)} ║`);
        }

        console.log("╚══════════════════════════════════════════════════════════════════════════╝");
        console.log(`\nTotal: ${bindings.length} binding(s)`);
      }
      break;
    }

    case "set-mode": {
      if (args.length < 2) {
        console.error("❌ Error: Gateway name and mode required");
        console.log("Usage: kendaliai routing set-mode <gateway-name> <mode>");
        return;
      }

      const gatewayName = args[0];
      const mode = parseRoutingMode(args[1]);

      if (!mode) {
        console.error(`❌ Invalid mode: ${args[1]}`);
        console.log("Valid modes: prefix, keyword, interactive, broadcast, round-robin, default");
        return;
      }

      const gateway = db.query<{ id: string }, [string]>(`
        SELECT id FROM gateways WHERE name = ?
      `).get(gatewayName);

      if (!gateway) {
        console.error(`❌ Gateway '${gatewayName}' not found`);
        return;
      }

      const success = routingManager.updateGatewayRouting(gateway.id, { mode });

      if (success) {
        console.log(`✅ Set routing mode for '${gatewayName}' to '${mode}'`);
      } else {
        console.error(`❌ Failed to update routing mode`);
      }
      break;
    }

    case "set-prefix": {
      if (args.length < 2) {
        console.error("❌ Error: Gateway name and prefix required");
        console.log("Usage: kendaliai routing set-prefix <gateway-name> <prefix>");
        return;
      }

      const gatewayName = args[0];
      const prefix = args[1];

      const gateway = db.query<{ id: string }, [string]>(`
        SELECT id FROM gateways WHERE name = ?
      `).get(gatewayName);

      if (!gateway) {
        console.error(`❌ Gateway '${gatewayName}' not found`);
        return;
      }

      const success = routingManager.updateGatewayRouting(gateway.id, {
        mode: "prefix",
        prefix
      });

      if (success) {
        console.log(`✅ Set prefix for '${gatewayName}' to '${prefix}'`);
      } else {
        console.error(`❌ Failed to update prefix`);
      }
      break;
    }

    case "set-keywords": {
      if (args.length < 2) {
        console.error("❌ Error: Gateway name and keywords required");
        console.log("Usage: kendaliai routing set-keywords <gateway-name> <keywords>");
        return;
      }

      const gatewayName = args[0];
      const keywords = args[1].split(",").map(k => k.trim()).filter(k => k);

      const gateway = db.query<{ id: string }, [string]>(`
        SELECT id FROM gateways WHERE name = ?
      `).get(gatewayName);

      if (!gateway) {
        console.error(`❌ Gateway '${gatewayName}' not found`);
        return;
      }

      const success = routingManager.updateGatewayRouting(gateway.id, {
        mode: "keyword",
        keywords
      });

      if (success) {
        console.log(`✅ Set keywords for '${gatewayName}':`);
        keywords.forEach(k => console.log(`   - ${k}`));
      } else {
        console.error(`❌ Failed to update keywords`);
      }
      break;
    }

    case "show": {
      if (args.length < 1) {
        console.error("❌ Error: Channel ID required");
        console.log("Usage: kendaliai routing show <channel-id>");
        return;
      }

      const channelId = args[0];

      // Get channel info
      const channel = db.query<{
        id: string;
        type: string;
        name: string;
        gateway_id: string | null;
      }, [string]>(`
        SELECT id, type, name, gateway_id FROM channels WHERE id = ?
      `).get(channelId);

      if (!channel) {
        console.error(`❌ Channel '${channelId}' not found`);
        return;
      }

      console.log(`\nChannel: ${channel.name} (${channel.type})`);
      console.log(`ID: ${channel.id}`);
      console.log(`\nRouting Configuration:`);

      // Test routing with optional user-provided message
      const testMessage = args[1]; // Optional test message
      if (testMessage) {
        const result = routingManager.routeMessage(channelId, testMessage, "test-user");
        console.log(`  Test Message: "${testMessage}"`);
        console.log(`  Routed To: ${result.gatewayName || "None"}`);
        console.log(`  Match Type: ${result.matchType}`);

        if (result.interactiveOptions && result.interactiveOptions.length > 0) {
          console.log(`\n  Interactive Options:`);
          result.interactiveOptions.forEach((opt, i) => {
            console.log(`    [${i + 1}] ${opt.gatewayName} - ${opt.description}`);
          });
        }
      } else {
        // Show default gateway without test message
        const defaultGw = routingManager.getAvailableGateways()[0];
        console.log(`  Default Gateway: ${defaultGw?.name || "None"}`);
      }

      // Show bindings
      const bindings = db.query<{
        gateway_id: string;
        routing_config: string | null;
        priority: number;
      }, [string]>(`
        SELECT gateway_id, routing_config, priority 
        FROM channel_bindings 
        WHERE channel_id = ? AND enabled = 1
        ORDER BY priority ASC
      `).all(channelId);

      if (bindings.length > 0) {
        console.log(`\n  Bindings (${bindings.length}):`);
        for (const binding of bindings) {
          const gw = db.query<{ name: string }, [string]>(`
            SELECT name FROM gateways WHERE id = ?
          `).get(binding.gateway_id);

          let routing: RoutingConfig = { mode: "default" };
          try {
            if (binding.routing_config) {
              routing = JSON.parse(binding.routing_config);
            }
          } catch {}

          console.log(`    - ${gw?.name || binding.gateway_id} (${routing.mode})`);
          if (routing.prefix) console.log(`      Prefix: ${routing.prefix}`);
          if (routing.keywords) console.log(`      Keywords: ${routing.keywords.join(", ")}`);
        }
      }
      break;
    }

    case "help":
    case "--help":
    case "-h":
      printRoutingHelp();
      break;

    default:
      console.error(`❌ Unknown routing command: ${subCommand}`);
      printRoutingHelp();
  }
}

// Export for CLI registration
export { printRoutingHelp };
