// In-memory event bus
import { log } from "../core";

export type EventCallback = (payload: any) => void | Promise<void>;

export class EventBus {
  private listeners: Map<string, EventCallback[]> = new Map();

  on(event: string, callback: EventCallback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);
  }

  async emit(event: string, payload: any) {
    log.info(`[EventBus] Emitting ${event}`);
    const callbacks = this.listeners.get(event) || [];
    for (const cb of callbacks) {
      try {
        await cb(payload);
      } catch (err) {
        log.error(`[EventBus] Error in callback for ${event}`, err);
      }
    }
  }
}

export const eventBus = new EventBus();
