import { log } from "../core";

export class WorkflowEngine {
  async runFlow(graph: any) {
    log.info(`[WorkflowEngine] Starting workflow run`, graph);
    // Mock iteration
    return { status: "success" };
  }
}

export const workflowEngine = new WorkflowEngine();
