import { randomUUID } from "crypto";
import { log } from "../core";
import { gateway } from "../gateway";
import { dbManager } from "../database";
import { tasks, taskSteps } from "../database/schema";
import { eq } from "drizzle-orm";
import { toolRegistry, ToolDefinition } from "../tools";

export interface TaskStep {
  id: string;
  order: number;
  action: string;
  description: string;
  toolName?: string;
  toolParams?: Record<string, unknown>;
  dependencies?: string[];
  status: "pending" | "running" | "completed" | "failed";
}

export interface TaskPlan {
  id: string;
  description: string;
  steps: TaskStep[];
  estimatedComplexity: "low" | "medium" | "high";
  requiresTools: string[];
}

const PLANNING_PROMPT = `You are an AI task planner. Break down the given task into executable steps.

Available tools:
{TOOLS}

Task: {TASK}

Respond with a JSON array of steps. Each step should have:
- action: a short action name (e.g., "fetch_data", "analyze_content", "send_result")
- description: detailed description of what this step does
- toolName: the name of the tool to use (if applicable)
- toolParams: parameters for the tool (if applicable)
- dependencies: array of step action names that must complete first (if any)

Example response format:
[
  {
    "action": "fetch_messages",
    "description": "Retrieve recent messages from the database",
    "toolName": "database.query",
    "toolParams": {"query": "SELECT * FROM messages LIMIT 10"},
    "dependencies": []
  },
  {
    "action": "summarize",
    "description": "Summarize the fetched messages",
    "toolName": null,
    "toolParams": null,
    "dependencies": ["fetch_messages"]
  }
]

Only respond with the JSON array, no additional text.`;

export class Planner {
  private model: string = "gpt-4o";

  constructor(model?: string) {
    this.model = model || "gpt-4o";
  }

  /**
   * Get available tools for planning
   */
  private getAvailableTools(): string {
    const tools = toolRegistry.listTools();
    if (tools.length === 0) {
      return "- No tools registered";
    }
    return tools
      .map((t: ToolDefinition) => `- ${t.name}: ${t.description}`)
      .join("\n");
  }

  /**
   * Parse AI response into task steps
   */
  private parseSteps(response: string): Omit<TaskStep, "id" | "status">[] {
    try {
      // Try to extract JSON from response
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        throw new Error("No JSON array found in response");
      }

      const parsed = JSON.parse(jsonMatch[0]);

      if (!Array.isArray(parsed)) {
        throw new Error("Response is not an array");
      }

      return parsed.map((step, index) => ({
        order: index + 1,
        action: step.action || `step_${index + 1}`,
        description: step.description || "",
        toolName: step.toolName || undefined,
        toolParams: step.toolParams || undefined,
        dependencies: step.dependencies || [],
      }));
    } catch (error) {
      log.warn(`[Planner] Failed to parse steps: ${error}`);

      // Fallback: create a single step
      return [
        {
          order: 1,
          action: "execute_task",
          description: response.substring(0, 500),
          dependencies: [],
        },
      ];
    }
  }

  /**
   * Create a task plan using AI
   */
  async createPlan(taskDescription: string): Promise<TaskPlan> {
    log.info(`[Planner] Creating plan for: ${taskDescription}`);

    const taskId = `task_${randomUUID()}`;
    const tools = this.getAvailableTools();

    // Build prompt
    const prompt = PLANNING_PROMPT.replace("{TOOLS}", tools).replace(
      "{TASK}",
      taskDescription,
    );

    try {
      // Use AI to generate plan
      const response = await gateway.chatCompletion({
        model: this.model,
        messages: [
          {
            role: "system",
            content:
              "You are a precise task planner. Always respond with valid JSON.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 2000,
      });

      const content = response.choices[0]?.message?.content || "";

      // Parse steps from response
      const rawSteps = this.parseSteps(content);

      // Create full task steps with IDs
      const steps: TaskStep[] = rawSteps.map((step) => ({
        id: `step_${randomUUID()}`,
        ...step,
        status: "pending" as const,
      }));

      // Determine complexity
      const complexity = this.estimateComplexity(steps);

      // Extract required tools
      const requiresTools = [
        ...new Set(
          steps.filter((s) => s.toolName).map((s) => s.toolName as string),
        ),
      ];

      const plan: TaskPlan = {
        id: taskId,
        description: taskDescription,
        steps,
        estimatedComplexity: complexity,
        requiresTools,
      };

      log.info(
        `[Planner] Created plan with ${steps.length} steps (complexity: ${complexity})`,
      );

      return plan;
    } catch (error) {
      log.error(`[Planner] AI planning failed: ${error}`);

      // Fallback: create simple plan
      return this.createFallbackPlan(taskId, taskDescription);
    }
  }

  /**
   * Estimate task complexity
   */
  private estimateComplexity(steps: TaskStep[]): "low" | "medium" | "high" {
    if (steps.length <= 2) return "low";
    if (steps.length <= 5) return "medium";
    return "high";
  }

  /**
   * Create a simple fallback plan
   */
  private createFallbackPlan(taskId: string, description: string): TaskPlan {
    return {
      id: taskId,
      description,
      steps: [
        {
          id: `step_${randomUUID()}`,
          order: 1,
          action: "analyze_request",
          description: "Analyze and understand the request",
          status: "pending",
          dependencies: [],
        },
        {
          id: `step_${randomUUID()}`,
          order: 2,
          action: "execute_task",
          description: `Execute: ${description}`,
          status: "pending",
          dependencies: ["analyze_request"],
        },
        {
          id: `step_${randomUUID()}`,
          order: 3,
          action: "generate_response",
          description: "Generate final response",
          status: "pending",
          dependencies: ["execute_task"],
        },
      ],
      estimatedComplexity: "low",
      requiresTools: [],
    };
  }

  /**
   * Save plan to database
   */
  async savePlan(plan: TaskPlan, agentId?: string): Promise<void> {
    try {
      // Save task
      await dbManager.db.insert(tasks).values({
        id: plan.id,
        agentId,
        description: plan.description,
        status: "pending",
        priority: "normal",
        metadata: JSON.stringify({
          estimatedComplexity: plan.estimatedComplexity,
          requiresTools: plan.requiresTools,
        }),
      });

      // Save steps
      for (const step of plan.steps) {
        await dbManager.db.insert(taskSteps).values({
          id: step.id,
          taskId: plan.id,
          stepOrder: step.order,
          action: step.action,
          status: "pending",
          input: JSON.stringify({
            description: step.description,
            toolName: step.toolName,
            toolParams: step.toolParams,
            dependencies: step.dependencies,
          }),
        });
      }

      log.info(`[Planner] Saved plan ${plan.id} to database`);
    } catch (error) {
      log.error(`[Planner] Failed to save plan: ${error}`);
      throw error;
    }
  }

  /**
   * Load plan from database
   */
  async loadPlan(taskId: string): Promise<TaskPlan | null> {
    try {
      const taskResult = await dbManager.db
        .select()
        .from(tasks)
        .where(eq(tasks.id, taskId))
        .limit(1);

      if (taskResult.length === 0) return null;

      const task = taskResult[0];
      const stepsResult = await dbManager.db
        .select()
        .from(taskSteps)
        .where(eq(taskSteps.taskId, taskId));

      const steps: TaskStep[] = stepsResult.map((s) => {
        const input = s.input ? JSON.parse(s.input) : {};
        return {
          id: s.id,
          order: s.stepOrder,
          action: s.action,
          description: input.description || "",
          toolName: input.toolName,
          toolParams: input.toolParams,
          dependencies: input.dependencies || [],
          status: s.status as TaskStep["status"],
        };
      });

      const metadata = task.metadata ? JSON.parse(task.metadata) : {};

      return {
        id: task.id,
        description: task.description,
        steps,
        estimatedComplexity: metadata.estimatedComplexity || "low",
        requiresTools: metadata.requiresTools || [],
      };
    } catch (error) {
      log.error(`[Planner] Failed to load plan: ${error}`);
      return null;
    }
  }
}

export const planner = new Planner();
