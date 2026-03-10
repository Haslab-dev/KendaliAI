import { log } from "../core";
import { gateway } from "../gateway";
import { toolRegistry } from "../tools";
import { permissionManager } from "../tools/permissions";
import { dbManager } from "../database";
import { workflowRuns, toolsLog } from "../database/schema";

export type NodeType =
  | "trigger"
  | "ai"
  | "tool"
  | "logic"
  | "output"
  | "condition";

export interface WorkflowNode {
  id: string;
  type: NodeType;
  name: string;
  config: Record<string, any>;
  position?: { x: number; y: number };
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  condition?: Record<string, any>;
}

export interface NodeExecutionContext {
  workflowRunId: string;
  workflowId: string;
  input: Record<string, any>;
  outputs: Map<string, any>;
  variables: Record<string, any>;
}

export interface NodeExecutionResult {
  nodeId: string;
  success: boolean;
  output?: any;
  error?: string;
  nextNodes?: string[]; // IDs of nodes to execute next
}

export class NodeEngine {
  /**
   * Execute a single node
   */
  async executeNode(
    node: WorkflowNode,
    context: NodeExecutionContext,
  ): Promise<NodeExecutionResult> {
    log.info(`[NodeEngine] Executing node ${node.id} (${node.type})`);

    try {
      switch (node.type) {
        case "trigger":
          return await this.executeTriggerNode(node, context);
        case "ai":
          return await this.executeAINode(node, context);
        case "tool":
          return await this.executeToolNode(node, context);
        case "logic":
          return await this.executeLogicNode(node, context);
        case "condition":
          return await this.executeConditionNode(node, context);
        case "output":
          return await this.executeOutputNode(node, context);
        default:
          throw new Error(`Unknown node type: ${node.type}`);
      }
    } catch (error: any) {
      log.error(`[NodeEngine] Node ${node.id} failed: ${error}`);
      return {
        nodeId: node.id,
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Execute trigger node
   */
  private async executeTriggerNode(
    node: WorkflowNode,
    context: NodeExecutionContext,
  ): Promise<NodeExecutionResult> {
    const triggerType = node.config.triggerType || "manual";

    log.info(`[NodeEngine] Trigger node: ${triggerType}`);

    return {
      nodeId: node.id,
      success: true,
      output: {
        triggered: true,
        type: triggerType,
        timestamp: new Date().toISOString(),
        input: context.input,
      },
    };
  }

  /**
   * Execute AI node
   */
  private async executeAINode(
    node: WorkflowNode,
    context: NodeExecutionContext,
  ): Promise<NodeExecutionResult> {
    const model = node.config.model || "gpt-4o";
    const promptTemplate = node.config.prompt || "";
    const systemPrompt = node.config.systemPrompt || "";

    // Build prompt from template and context
    const prompt = this.interpolateTemplate(promptTemplate, context);

    log.info(`[NodeEngine] AI node: calling ${model}`);

    const response = await gateway.chatCompletion({
      model,
      messages: [
        ...(systemPrompt
          ? [{ role: "system" as const, content: systemPrompt }]
          : []),
        { role: "user" as const, content: prompt },
      ],
      temperature: node.config.temperature || 0.7,
      max_tokens: node.config.maxTokens || 1000,
    });

    const output = response.choices[0]?.message?.content || "";

    return {
      nodeId: node.id,
      success: true,
      output: {
        response: output,
        usage: response.usage,
      },
    };
  }

  /**
   * Execute tool node
   */
  private async executeToolNode(
    node: WorkflowNode,
    context: NodeExecutionContext,
  ): Promise<NodeExecutionResult> {
    const toolName = node.config.toolName;
    const toolParams = this.interpolateTemplate(
      node.config.params || {},
      context,
    );

    if (!toolName) {
      throw new Error("Tool node missing toolName");
    }

    if (!toolRegistry.has(toolName)) {
      throw new Error(`Tool not found: ${toolName}`);
    }

    // Check tool permissions before execution
    const permission = await permissionManager.canExecute(toolName, {
      workflowId: context.workflowId,
      source: "workflow",
    });

    if (!permission.allowed) {
      throw new Error(
        `Tool execution denied: ${permission.reason || "Permission denied"}`,
      );
    }

    log.info(`[NodeEngine] Tool node: executing ${toolName}`);

    const startTime = Date.now();
    const result = await toolRegistry.execute(toolName, toolParams);

    // Log tool execution
    await dbManager.db.insert(toolsLog).values({
      toolName,
      workflowRunId: context.workflowRunId,
      input: JSON.stringify(toolParams),
      output: JSON.stringify(result),
      status: "success",
      executionTimeMs: Date.now() - startTime,
    });

    return {
      nodeId: node.id,
      success: true,
      output: result,
    };
  }

  /**
   * Execute logic node
   */
  private async executeLogicNode(
    node: WorkflowNode,
    context: NodeExecutionContext,
  ): Promise<NodeExecutionResult> {
    const operation = node.config.operation || "passthrough";

    switch (operation) {
      case "passthrough":
        return {
          nodeId: node.id,
          success: true,
          output: context.input,
        };

      case "transform":
        // Safe transform: only allow predefined operations
        const transformType = node.config.transformType || "passthrough";
        const transformed = this.safeTransform(
          transformType,
          context.input,
          node.config,
        );
        return {
          nodeId: node.id,
          success: true,
          output: transformed,
        };

      case "merge":
        const sources = node.config.sources || [];
        const merged: Record<string, any> = {};
        for (const sourceId of sources) {
          const sourceOutput = context.outputs.get(sourceId);
          if (sourceOutput) {
            Object.assign(merged, sourceOutput);
          }
        }
        return {
          nodeId: node.id,
          success: true,
          output: merged,
        };

      case "delay":
        const delayMs = node.config.delayMs || 1000;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        return {
          nodeId: node.id,
          success: true,
          output: { delayed: delayMs },
        };

      default:
        throw new Error(`Unknown logic operation: ${operation}`);
    }
  }

  /**
   * Execute condition node
   */
  private async executeConditionNode(
    node: WorkflowNode,
    context: NodeExecutionContext,
  ): Promise<NodeExecutionResult> {
    const conditionType = node.config.conditionType || "equals";
    let result = false;
    let nextNodes: string[] = [];

    switch (conditionType) {
      case "expression":
        // Safe expression evaluation - only allow simple comparisons
        result = this.safeEvaluateCondition(
          node.config.expression || "true",
          context,
        );
        break;

      case "equals":
        const value = this.interpolateTemplate(node.config.value, context);
        const compareValue = this.interpolateTemplate(
          node.config.compareValue,
          context,
        );
        result = value === compareValue;
        break;

      case "exists":
        const checkPath = node.config.path || "";
        const checkValue = this.getNestedValue(context.input, checkPath);
        result = checkValue !== undefined && checkValue !== null;
        break;

      case "greaterThan":
      case "lessThan":
        const numValue = parseFloat(
          this.interpolateTemplate(node.config.value, context),
        );
        const numCompare = parseFloat(
          this.interpolateTemplate(node.config.compareValue, context),
        );
        if (!isNaN(numValue) && !isNaN(numCompare)) {
          result =
            conditionType === "greaterThan"
              ? numValue > numCompare
              : numValue < numCompare;
        }
        break;

      case "contains":
        const containsValue = this.interpolateTemplate(
          node.config.value,
          context,
        );
        const containsCheck = this.interpolateTemplate(
          node.config.compareValue,
          context,
        );
        result = String(containsValue).includes(String(containsCheck));
        break;

      default:
        throw new Error(`Unknown condition type: ${conditionType}`);
    }

    // Determine next nodes based on result
    if (result) {
      nextNodes = node.config.trueBranch ? [node.config.trueBranch] : [];
    } else {
      nextNodes = node.config.falseBranch ? [node.config.falseBranch] : [];
    }

    return {
      nodeId: node.id,
      success: true,
      output: { result, branch: result ? "true" : "false" },
      nextNodes,
    };
  }

  /**
   * Safe transform operations - no arbitrary code execution
   */
  private safeTransform(
    transformType: string,
    input: any,
    config: Record<string, any>,
  ): any {
    switch (transformType) {
      case "passthrough":
        return input;

      case "pick":
        // Pick specific fields from object
        const fields = config.fields || [];
        if (typeof input === "object" && input !== null) {
          const result: Record<string, any> = {};
          for (const field of fields) {
            if (field in input) {
              result[field] = input[field];
            }
          }
          return result;
        }
        return input;

      case "rename":
        // Rename fields in object
        const renameMap = config.renameMap || {};
        if (typeof input === "object" && input !== null) {
          const result: Record<string, any> = { ...input };
          for (const [oldKey, newKey] of Object.entries(renameMap)) {
            if (oldKey in result) {
              result[newKey as string] = result[oldKey];
              delete result[oldKey];
            }
          }
          return result;
        }
        return input;

      case "defaultValue":
        // Set default values for missing fields
        const defaults = config.defaults || {};
        if (typeof input === "object" && input !== null) {
          return { ...defaults, ...input };
        }
        return input;

      case "toArray":
        // Convert to array if not already
        return Array.isArray(input) ? input : [input];

      case "toString":
        return String(input);

      case "toNumber":
        const num = parseFloat(input);
        return isNaN(num) ? 0 : num;

      case "toJson":
        try {
          return typeof input === "string" ? JSON.parse(input) : input;
        } catch {
          return input;
        }

      case "stringify":
        return JSON.stringify(input);

      default:
        log.warn(
          `[NodeEngine] Unknown transform type: ${transformType}, using passthrough`,
        );
        return input;
    }
  }

  /**
   * Safe condition evaluation - only allow simple expressions
   */
  private safeEvaluateCondition(
    expression: string,
    context: NodeExecutionContext,
  ): boolean {
    // Only allow simple boolean literals
    if (expression === "true") return true;
    if (expression === "false") return false;

    // Support simple comparisons: input.field === "value"
    const simpleComparison = expression.match(
      /^input\.(\w+)\s*(===|!==|==|!=|>|<|>=|<=)\s*["'](.*)["']$/,
    );
    if (simpleComparison) {
      const [, field, operator, value] = simpleComparison;
      const fieldValue = context.input?.[field];

      switch (operator) {
        case "===":
        case "==":
          return fieldValue === value;
        case "!==":
        case "!=":
          return fieldValue !== value;
        case ">":
          return parseFloat(fieldValue) > parseFloat(value);
        case "<":
          return parseFloat(fieldValue) < parseFloat(value);
        case ">=":
          return parseFloat(fieldValue) >= parseFloat(value);
        case "<=":
          return parseFloat(fieldValue) <= parseFloat(value);
      }
    }

    // Support numeric comparisons: input.field > 123
    const numericComparison = expression.match(
      /^input\.(\w+)\s*(===|!==|==|!=|>|<|>=|<=)\s*(\d+(?:\.\d+)?)$/,
    );
    if (numericComparison) {
      const [, field, operator, value] = numericComparison;
      const fieldValue = parseFloat(context.input?.[field]);
      const numValue = parseFloat(value);

      if (isNaN(fieldValue)) return false;

      switch (operator) {
        case "===":
        case "==":
          return fieldValue === numValue;
        case "!==":
        case "!=":
          return fieldValue !== numValue;
        case ">":
          return fieldValue > numValue;
        case "<":
          return fieldValue < numValue;
        case ">=":
          return fieldValue >= numValue;
        case "<=":
          return fieldValue <= numValue;
      }
    }

    // Support existence check: input.field
    const existenceCheck = expression.match(/^input\.(\w+)$/);
    if (existenceCheck) {
      const field = existenceCheck[1];
      const value = context.input?.[field];
      return value !== undefined && value !== null && value !== "";
    }

    // For any other expression, log warning and return false
    log.warn(
      `[NodeEngine] Unsafe expression blocked: ${expression}. Use specific condition types instead.`,
    );
    return false;
  }

  /**
   * Execute output node
   */
  private async executeOutputNode(
    node: WorkflowNode,
    context: NodeExecutionContext,
  ): Promise<NodeExecutionResult> {
    const outputType = node.config.outputType || "log";

    switch (outputType) {
      case "log":
        log.info(`[NodeEngine] Output: ${JSON.stringify(context.input)}`);
        break;

      case "webhook":
        const webhookUrl = node.config.webhookUrl;
        if (webhookUrl) {
          await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(context.input),
          });
        }
        break;

      case "variable":
        const varName = node.config.variableName || "output";
        context.variables[varName] = context.input;
        break;

      case "response":
        // This will be captured by the workflow runner
        break;

      default:
        throw new Error(`Unknown output type: ${outputType}`);
    }

    return {
      nodeId: node.id,
      success: true,
      output: context.input,
    };
  }

  /**
   * Interpolate template strings with context values
   */
  private interpolateTemplate(
    template: string | Record<string, any>,
    context: NodeExecutionContext,
  ): any {
    if (typeof template === "string") {
      return template.replace(/\{\{([^}]+)\}\}/g, (_, path) => {
        const value = this.getNestedValue(context, path.trim());
        return value !== undefined ? String(value) : "";
      });
    }

    if (typeof template === "object" && template !== null) {
      const result: Record<string, any> = {};
      for (const [key, value] of Object.entries(template)) {
        result[key] = this.interpolateTemplate(value, context);
      }
      return result;
    }

    return template;
  }

  /**
   * Get nested value from object using dot notation
   */
  private getNestedValue(obj: any, path: string): any {
    const parts = path.split(".");
    let current = obj;

    for (const part of parts) {
      if (current === null || current === undefined) return undefined;

      // Handle array indices
      const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
      if (arrayMatch) {
        const [, arrayKey, index] = arrayMatch;
        current = current[arrayKey]?.[parseInt(index, 10)];
      } else {
        current = current[part];
      }
    }

    return current;
  }
}

export const nodeEngine = new NodeEngine();
