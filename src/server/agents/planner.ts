import { log } from "../core";

export class Planner {
  async createPlan(request: string) {
    log.info(`[Planner] Creating plan for: ${request}`);
    return ["step1", "step2"]; // Mock plan
  }
}
