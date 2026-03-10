import { randomUUID } from "crypto";
import { log } from "../core";
import { dbManager } from "../database";
import { workflows, workflowRuns } from "../database/schema";
import { eq } from "drizzle-orm";
import {
  nodeEngine,
  WorkflowNode,
  WorkflowEdge,
  NodeExecutionContext,
} from "./node-engine";

export interface WorkflowGraph {
  id: string;
  name: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export interface WorkflowRunResult {
  runId: string;
  workflowId: string;
  success: boolean;
  output: any;
  error?: string;
  duration: number;
}

export class WorkflowEngine {
  /**
   * Run a workflow by ID
   */
  async runWorkflow(
    workflowId: string,
    input: any = {},
  ): Promise<WorkflowRunResult> {
    const startTime = Date.now();
    const runId = `run_${randomUUID()}`;

    log.info(`[WorkflowEngine] Starting workflow run: ${workflowId}`);

    try {
      // Load workflow from database
      const workflow = await this.loadWorkflow(workflowId);
      if (!workflow) {
        throw new Error(`Workflow not found: ${workflowId}`);
      }

      // Create run record
      await dbManager.db.insert(workflowRuns).values({
        id: runId,
        workflowId,
        status: "running",
        input: JSON.stringify(input),
      });

      // Build execution context
      const context: NodeExecutionContext = {
        workflowRunId: runId,
        workflowId,
        input,
        outputs: new Map(),
        variables: {},
      };

      // Find trigger/start nodes
      const startNodes = this.findStartNodes(workflow);
      if (startNodes.length === 0) {
        throw new Error("No start nodes found in workflow");
      }

      // Execute workflow
      const result = await this.executeWorkflow(workflow, context, startNodes);

      // Update run record
      await dbManager.db
        .update(workflowRuns)
        .set({
          status: "completed",
          output: JSON.stringify(result),
          completedAt: new Date().toISOString(),
        })
        .where(eq(workflowRuns.id, runId));

      const duration = Date.now() - startTime;
      log.info(
        `[WorkflowEngine] Workflow ${workflowId} completed in ${duration}ms`,
      );

      return {
        runId,
        workflowId,
        success: true,
        output: result,
        duration,
      };
    } catch (error: any) {
      log.error(`[WorkflowEngine] Workflow run failed: ${error}`);

      // Update run record with error
      try {
        await dbManager.db
          .update(workflowRuns)
          .set({
            status: "failed",
            error: error.message,
            completedAt: new Date().toISOString(),
          })
          .where(eq(workflowRuns.id, runId));
      } catch (updateError) {
        log.warn(
          `[WorkflowEngine] Failed to update run status: ${updateError}`,
        );
      }

      return {
        runId,
        workflowId,
        success: false,
        output: null,
        error: error.message,
        duration: Date.now() - startTime,
      };
    }
  }

  async runFlow(graph: Partial<WorkflowGraph>): Promise<{ status: string }> {
    const workflowId = await this.saveWorkflow(graph);
    const result = await this.runWorkflow(workflowId, {});
    return { status: result.success ? "success" : "error" };
  }

  /**
   * Load workflow from database
   */
  private async loadWorkflow(
    workflowId: string,
  ): Promise<WorkflowGraph | null> {
    try {
      const result = await dbManager.db
        .select()
        .from(workflows)
        .where(eq(workflows.id, workflowId))
        .limit(1);

      if (result.length === 0) return null;

      const w = result[0];
      return {
        id: w.id,
        name: w.name,
        nodes: w.nodes ? JSON.parse(w.nodes) : [],
        edges: w.edges ? JSON.parse(w.edges) : [],
      };
    } catch (error) {
      log.error(`[WorkflowEngine] Failed to load workflow: ${error}`);
      return null;
    }
  }

  /**
   * Find start nodes (trigger nodes or nodes with no incoming edges)
   */
  private findStartNodes(workflow: WorkflowGraph): WorkflowNode[] {
    const targetNodeIds = new Set(workflow.edges.map((e) => e.target));

    // Find trigger nodes first
    const triggerNodes = workflow.nodes.filter((n) => n.type === "trigger");
    if (triggerNodes.length > 0) {
      return triggerNodes;
    }

    // Otherwise, find nodes with no incoming edges
    return workflow.nodes.filter((n) => !targetNodeIds.has(n.id));
  }

  /**
   * Execute workflow starting from given nodes
   */
  private async executeWorkflow(
    workflow: WorkflowGraph,
    context: NodeExecutionContext,
    startNodes: WorkflowNode[],
  ): Promise<any> {
    const executedNodes = new Set<string>();
    const nodeMap = new Map<string, WorkflowNode>();
    const edgeMap = new Map<string, WorkflowEdge[]>();

    // Build lookup maps
    for (const node of workflow.nodes) {
      nodeMap.set(node.id, node);
    }

    for (const edge of workflow.edges) {
      const existing = edgeMap.get(edge.source) || [];
      existing.push(edge);
      edgeMap.set(edge.source, existing);
    }

    // Execute nodes in topological order
    const queue = [...startNodes];
    let finalOutput: any = null;

    while (queue.length > 0) {
      const node = queue.shift()!;

      // Skip if already executed
      if (executedNodes.has(node.id)) continue;

      // Check if all dependencies are met
      const incomingEdges = workflow.edges.filter((e) => e.target === node.id);
      const dependenciesMet = incomingEdges.every((e) =>
        executedNodes.has(e.source),
      );

      if (!dependenciesMet) {
        // Re-queue for later
        queue.push(node);
        continue;
      }

      // Execute node
      const result = await nodeEngine.executeNode(node, context);
      executedNodes.add(node.id);

      if (!result.success) {
        log.warn(`[WorkflowEngine] Node ${node.id} failed: ${result.error}`);
        // Continue with other nodes or throw based on config
        continue;
      }

      // Store output
      context.outputs.set(node.id, result.output);

      // Check if this is an output node
      if (node.type === "output" && node.config.outputType === "response") {
        finalOutput = result.output;
      }

      // Add next nodes to queue
      const nextEdges = edgeMap.get(node.id) || [];
      for (const edge of nextEdges) {
        const nextNode = nodeMap.get(edge.target);
        if (nextNode && !executedNodes.has(nextNode.id)) {
          queue.push(nextNode);
        }
      }
    }

    return finalOutput || Object.fromEntries(context.outputs);
  }

  /**
   * Save workflow to database
   */
  async saveWorkflow(workflow: Partial<WorkflowGraph>): Promise<string> {
    const id = workflow.id || `flow_${Date.now()}`;

    await dbManager.db
      .insert(workflows)
      .values({
        id,
        name: workflow.name || "Untitled Workflow",
        nodes: JSON.stringify(workflow.nodes || []),
        edges: JSON.stringify(workflow.edges || []),
        status: "draft",
      })
      .onConflictDoUpdate({
        target: workflows.id,
        set: {
          name: workflow.name || "Untitled Workflow",
          nodes: JSON.stringify(workflow.nodes || []),
          edges: JSON.stringify(workflow.edges || []),
          updatedAt: new Date().toISOString(),
        },
      });

    log.info(`[WorkflowEngine] Saved workflow ${id}`);
    return id;
  }

  /**
   * List all workflows
   */
  async listWorkflows(): Promise<WorkflowGraph[]> {
    const result = await dbManager.db.select().from(workflows);

    return result.map((w) => ({
      id: w.id,
      name: w.name,
      nodes: w.nodes ? JSON.parse(w.nodes) : [],
      edges: w.edges ? JSON.parse(w.edges) : [],
    }));
  }

  /**
   * Get workflow by ID
   */
  async getWorkflow(workflowId: string): Promise<WorkflowGraph | null> {
    return this.loadWorkflow(workflowId);
  }

  /**
   * Delete workflow
   */
  async deleteWorkflow(workflowId: string): Promise<boolean> {
    try {
      await dbManager.db.delete(workflows).where(eq(workflows.id, workflowId));
      log.info(`[WorkflowEngine] Deleted workflow ${workflowId}`);
      return true;
    } catch (error) {
      log.error(`[WorkflowEngine] Failed to delete workflow: ${error}`);
      return false;
    }
  }
}

export const workflowEngine = new WorkflowEngine();
