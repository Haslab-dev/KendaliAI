import { log } from "../core";

export class Executor {
  async executePlan(steps: string[]) {
    log.info(`[Executor] Executing steps: ${steps.join(", ")}`);
    return true;
  }
}
