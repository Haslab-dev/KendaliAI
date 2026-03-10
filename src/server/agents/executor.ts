import { log } from "../core";
import { gateway } from "../gateway";
import { dbManager } from "../database";
import { taskSteps, tasks, toolsLog } from "../database/schema";
import { eq } from "drizzle-orm";
import { toolRegistry } from "../tools";
import { TaskPlan, TaskStep } from "./planner";

export interface ExecutionResult {
  success: boolean;
  taskId: string;
  completedSteps: number;
  totalSteps: number;
  outputs: Record<string, any>;
  error?: string;
  finalResponse?: string;
}

export interface StepResult {
  stepId: string;
  success: boolean;
  output?: any;
  error?: string;
  executionTimeMs: number;
}

const EXECUTION_PROMPT = `You are executing a step in a task plan.

Step: {STEP}
Description: {DESCRIPTION}

Previous step outputs:
{CONTEXT}

Execute this step and provide a result. If you need to use a tool, specify which tool and parameters.
Respond with:
1. A brief summary of what you did
2. The result or output
3. Any data to pass to the next step`;

export class Executor {
  private model: string = "gpt-4o";

  constructor(model?: string) {
    this.model = model || "gpt-4o";
  }

  /**
   * Execute a complete task plan
   */
  async executePlan(plan: TaskPlan): Promise<ExecutionResult> {
    log.info(
      `[Executor] Starting execution of plan ${plan.id} with ${plan.steps.length} steps`,
    );

    const outputs: Record<string, any> = {};
    let completedSteps = 0;
    let lastError: string | undefined;

    // Update task status
    await this.updateTaskStatus(plan.id, "in_progress");

    // Build dependency graph
    const stepMap = new Map<string, TaskStep>();
    const completedSet = new Set<string>();

    for (const step of plan.steps) {
      stepMap.set(step.action, step);
    }

    // Execute steps in order (respecting dependencies)
    for (const step of plan.steps) {
      // Check if dependencies are met
      if (step.dependencies && step.dependencies.length > 0) {
        const pendingDeps = step.dependencies.filter(
          (dep) => !completedSet.has(dep),
        );
        if (pendingDeps.length > 0) {
          log.warn(
            `[Executor] Step ${step.action} has pending dependencies: ${pendingDeps.join(", ")}`,
          );
          continue;
        }
      }

      // Execute step
      const result = await this.executeStep(step, outputs);

      if (result.success) {
        completedSet.add(step.action);
        completedSteps++;
        outputs[step.action] = result.output;

        // Update step in database
        await this.updateStepStatus(step.id, "completed", result.output);
      } else {
        await this.updateStepStatus(step.id, "failed", undefined, result.error);
        lastError = result.error;

        // Decide whether to continue or stop
        // For now, we'll continue with remaining steps
        log.warn(`[Executor] Step ${step.action} failed: ${result.error}`);
      }
    }

    // Generate final response
    let finalResponse: string | undefined;
    if (completedSteps === plan.steps.length) {
      finalResponse = await this.generateFinalResponse(plan, outputs);
      await this.updateTaskStatus(plan.id, "completed", finalResponse);
    } else {
      await this.updateTaskStatus(plan.id, "failed", undefined, lastError);
    }

    return {
      success: completedSteps === plan.steps.length,
      taskId: plan.id,
      completedSteps,
      totalSteps: plan.steps.length,
      outputs,
      error: lastError,
      finalResponse,
    };
  }

  /**
   * Execute a single step
   */
  async executeStep(
    step: TaskStep,
    context: Record<string, any>,
  ): Promise<StepResult> {
    const startTime = Date.now();
    log.info(`[Executor] Executing step: ${step.action}`);

    try {
      let output: any;

      // If step specifies a tool, execute it
      if (step.toolName && toolRegistry.has(step.toolName)) {
        output = await this.executeTool(
          step.toolName,
          step.toolParams || {},
          step.id,
        );
      } else {
        // Use AI to execute the step
        output = await this.executeWithAI(step, context);
      }

      return {
        stepId: step.id,
        success: true,
        output,
        executionTimeMs: Date.now() - startTime,
      };
    } catch (error: any) {
      log.error(`[Executor] Step ${step.action} failed: ${error}`);
      return {
        stepId: step.id,
        success: false,
        error: error.message,
        executionTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Execute a tool
   */
  private async executeTool(
    toolName: string,
    params: Record<string, any>,
    stepId: string,
  ): Promise<any> {
    const startTime = Date.now();

    try {
      const result = await toolRegistry.execute(toolName, params);

      // Log tool execution
      await dbManager.db.insert(toolsLog).values({
        toolName,
        taskId: stepId.split("_")[0] || null,
        input: JSON.stringify(params),
        output: JSON.stringify(result),
        status: "success",
        executionTimeMs: Date.now() - startTime,
      });

      return result;
    } catch (error: any) {
      // Log tool error
      await dbManager.db.insert(toolsLog).values({
        toolName,
        taskId: stepId.split("_")[0] || null,
        input: JSON.stringify(params),
        status: "error",
        error: error.message,
        executionTimeMs: Date.now() - startTime,
      });

      throw error;
    }
  }

  /**
   * Execute step using AI
   */
  private async executeWithAI(
    step: TaskStep,
    context: Record<string, any>,
  ): Promise<any> {
    const contextStr = Object.entries(context)
      .map(
        ([key, value]) => `${key}: ${JSON.stringify(value).substring(0, 500)}`,
      )
      .join("\n");

    const prompt = EXECUTION_PROMPT.replace("{STEP}", step.action)
      .replace("{DESCRIPTION}", step.description)
      .replace("{CONTEXT}", contextStr || "No previous context");

    const response = await gateway.chatCompletion({
      model: this.model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 1000,
    });

    return response.choices[0]?.message?.content || "";
  }

  /**
   * Generate final response from all outputs
   */
  private async generateFinalResponse(
    plan: TaskPlan,
    outputs: Record<string, any>,
  ): Promise<string> {
    const outputsStr = Object.entries(outputs)
      .map(
        ([key, value]) => `${key}: ${JSON.stringify(value).substring(0, 500)}`,
      )
      .join("\n");

    const prompt = `Task: ${plan.description}

Step outputs:
${outputsStr}

Based on the above, provide a final summary/response for this task.`;

    const response = await gateway.chatCompletion({
      model: this.model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.5,
      max_tokens: 500,
    });

    return response.choices[0]?.message?.content || "";
  }

  /**
   * Update task status in database
   */
  private async updateTaskStatus(
    taskId: string,
    status: string,
    result?: string,
    error?: string,
  ): Promise<void> {
    try {
      const updateData: Record<string, any> = {
        status,
        updatedAt: new Date().toISOString(),
      };

      if (result) updateData.result = result;
      if (error) updateData.error = error;
      if (status === "completed")
        updateData.completedAt = new Date().toISOString();

      await dbManager.db
        .update(tasks)
        .set(updateData)
        .where(eq(tasks.id, taskId));
    } catch (err) {
      log.warn(`[Executor] Failed to update task status: ${err}`);
    }
  }

  /**
   * Update step status in database
   */
  private async updateStepStatus(
    stepId: string,
    status: string,
    output?: any,
    error?: string,
  ): Promise<void> {
    try {
      const updateData: Record<string, any> = {
        status,
      };

      if (output !== undefined) updateData.output = JSON.stringify(output);
      if (error) updateData.error = error;
      if (status === "running") updateData.startedAt = new Date().toISOString();
      if (status === "completed" || status === "failed") {
        updateData.completedAt = new Date().toISOString();
      }

      await dbManager.db
        .update(taskSteps)
        .set(updateData)
        .where(eq(taskSteps.id, stepId));
    } catch (err) {
      log.warn(`[Executor] Failed to update step status: ${err}`);
    }
  }
}

export const executor = new Executor();
