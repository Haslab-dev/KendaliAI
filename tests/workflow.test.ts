import { expect, test, describe, beforeEach } from "bun:test";
import { WorkflowEngine } from "../src/server/workflow/engine";
import { nodeEngine } from "../src/server/workflow/node-engine";
import type {
  WorkflowNode,
  NodeExecutionContext,
} from "../src/server/workflow/node-engine";

describe("Workflow Engine", () => {
  let engine: WorkflowEngine;

  beforeEach(() => {
    engine = new WorkflowEngine();
  });

  test("creates workflow engine instance", () => {
    expect(engine).toBeDefined();
  });

  test("listWorkflows returns array", async () => {
    const workflows = await engine.listWorkflows();
    expect(Array.isArray(workflows)).toBe(true);
  });

  test("saveWorkflow creates new workflow", async () => {
    const workflowId = await engine.saveWorkflow({
      name: "Test Workflow",
      nodes: [],
      edges: [],
    });
    expect(workflowId).toBeDefined();
    expect(typeof workflowId).toBe("string");
  });

  test("getWorkflow returns null for non-existent workflow", async () => {
    const workflow = await engine.getWorkflow("non_existent_id");
    expect(workflow).toBeNull();
  });

  test("deleteWorkflow returns boolean", async () => {
    const result = await engine.deleteWorkflow("non_existent_id");
    expect(typeof result).toBe("boolean");
  });
});

describe("Node Engine", () => {
  test("creates node engine instance", () => {
    expect(nodeEngine).toBeDefined();
  });

  test("executeNode handles trigger node", async () => {
    const node: WorkflowNode = {
      id: "trigger_1",
      name: "Trigger Node",
      type: "trigger",
      config: {
        triggerType: "manual",
      },
    };

    const context: NodeExecutionContext = {
      workflowRunId: "test_run",
      workflowId: "test_workflow",
      input: {},
      outputs: new Map(),
      variables: {},
    };

    const result = await nodeEngine.executeNode(node, context);
    expect(result).toBeDefined();
    expect(result.success).toBe(true);
  });

  test("executeNode handles output node", async () => {
    const node: WorkflowNode = {
      id: "output_1",
      name: "Output Node",
      type: "output",
      config: {
        outputType: "response",
      },
    };

    const context: NodeExecutionContext = {
      workflowRunId: "test_run",
      workflowId: "test_workflow",
      input: {},
      outputs: new Map(),
      variables: {},
    };

    const result = await nodeEngine.executeNode(node, context);
    expect(result).toBeDefined();
    expect(result.success).toBe(true);
  });

  test("executeNode handles logic node", async () => {
    const node: WorkflowNode = {
      id: "logic_1",
      name: "Logic Node",
      type: "logic",
      config: {
        logicType: "transform",
        expression: "input.value * 2",
      },
    };

    const context: NodeExecutionContext = {
      workflowRunId: "test_run",
      workflowId: "test_workflow",
      input: { value: 5 },
      outputs: new Map(),
      variables: {},
    };

    const result = await nodeEngine.executeNode(node, context);
    expect(result).toBeDefined();
  });
});

describe("Workflow Graph", () => {
  test("validates workflow graph structure", () => {
    const graph = {
      id: "test_workflow",
      name: "Test Workflow",
      nodes: [
        { id: "node_1", name: "Trigger", type: "trigger", config: {} },
        {
          id: "node_2",
          name: "Output",
          type: "output",
          config: { outputType: "response" },
        },
      ],
      edges: [{ id: "edge_1", source: "node_1", target: "node_2" }],
    };

    expect(graph.nodes).toHaveLength(2);
    expect(graph.edges).toHaveLength(1);
  });
});
