import { log } from "../core";
import { KendaliPlugin } from "../sdk";

export class PluginManager {
  private loadedPlugins = new Map<string, KendaliPlugin>();

  load(plugin: KendaliPlugin) {
    if (this.loadedPlugins.has(plugin.id)) {
      log.warn(`[PluginManager] Plugin ${plugin.id} already loaded.`);
      return;
    }

    this.loadedPlugins.set(plugin.id, plugin);
    log.info(`[PluginManager] Loaded plugin: ${plugin.id} v${plugin.version}`);
  }
}

export const pluginManager = new PluginManager();
