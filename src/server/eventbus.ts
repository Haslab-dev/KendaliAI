/**
 * KendaliAI Event Bus
 *
 * Simple event emitter for internal system communication.
 */

import { EventEmitter } from "events";

export const eventBus = new EventEmitter();

// Types for events
export enum SystemEvent {
  MESSAGE_RECEIVED = "MESSAGE_RECEIVED",
  MESSAGE_SENT = "MESSAGE_SENT",
  WORKFLOW_STARTED = "WORKFLOW_STARTED",
  WORKFLOW_COMPLETED = "WORKFLOW_COMPLETED",
  AGENT_TASK_STARTED = "AGENT_TASK_STARTED",
  AGENT_TASK_COMPLETED = "AGENT_TASK_COMPLETED",
  ERROR = "ERROR",
}

export default eventBus;
