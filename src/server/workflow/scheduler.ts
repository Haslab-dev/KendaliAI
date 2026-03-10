import { log } from "../core";

export class Scheduler {
  schedule(cron: string, task: () => Promise<void>) {
    log.info(`[Scheduler] Task scheduled with cron: ${cron}`);
    // Mock scheduler implementation
  }
}

export const scheduler = new Scheduler();
