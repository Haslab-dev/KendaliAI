// Core internal types
export type AgentRole = "planner" | "executor" | "analyzer" | "communicator";

export interface Task {
  id: string;
  description: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  result?: string;
}
