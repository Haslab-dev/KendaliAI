import { log } from "../core";

export class TriggerSystem {
  private triggers = new Map<string, any>();

  register(name: string, handler: any) {
    this.triggers.set(name, handler);
    log.info(`[TriggerSystem] Registered trigger: ${name}`);
  }

  async fire(name: string, payload: any) {
    log.info(`[TriggerSystem] Fired trigger: ${name}`);
    const trigger = this.triggers.get(name);
    if (trigger) {
      await trigger(payload);
    }
  }
}

export const triggerSystem = new TriggerSystem();
