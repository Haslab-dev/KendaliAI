/**
 * KendaliAI Agent System
 *
 * Phase 4: Agent personality configuration, templates, and per-gateway behavior.
 * Provides customizable AI agents with distinct personalities and capabilities.
 */

import { Database } from "bun:sqlite";
import { randomUUID } from "crypto";
import { AIClient, createProvider, type ModelMessage } from "../ai";

// ============================================
// Types
// ============================================

export type ResponseStyle =
  | "concise"
  | "detailed"
  | "friendly"
  | "formal"
  | "technical";
export type AgentTrait =
  | "analytical"
  | "creative"
  | "empathetic"
  | "thorough"
  | "patient"
  | "casual"
  | "professional"
  | "playful"
  | "serious"
  | "helpful";

export interface AgentPersonality {
  name: string;
  description?: string;
  traits: AgentTrait[];
  responseStyle: ResponseStyle;
  tone?: string;
  expertise?: string[];
  languages?: string[];
}

export interface AgentConfig {
  id: string;
  gatewayId: string;
  name: string;
  personality: AgentPersonality;
  systemPrompt: string;
  customInstructions: string[];
  greeting?: string;
  farewell?: string;
  maxTokens: number;
  temperature: number;
  createdAt: number;
  updatedAt: number;
}

export interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  personality: AgentPersonality;
  systemPromptTemplate: string;
  defaultInstructions: string[];
  suggestedSkills: string[];
  suggestedTools: string[];
}

export interface ConversationContext {
  gatewayId: string;
  channelId: string;
  userId: string;
  history: ModelMessage[];
  metadata: Record<string, unknown>;
}

// ============================================
// Agent Templates
// ============================================

export const AGENT_TEMPLATES: AgentTemplate[] = [
  {
    id: "dev-assistant",
    name: "Development Assistant",
    description:
      "Senior developer for code review, debugging, and development tasks",
    category: "development",
    personality: {
      name: "DevAssistant",
      traits: ["analytical", "thorough", "helpful", "professional"],
      responseStyle: "technical",
      expertise: ["typescript", "python", "rust", "go", "javascript"],
    },
    systemPromptTemplate: `You are {name}, a senior software developer with 10+ years of experience in full-stack development.

Your personality traits: {traits}
Response style: {responseStyle}

Areas of expertise: {expertise}

Your role is to:
- Help with code review, debugging, and development tasks
- Provide clear, well-structured code examples
- Explain technical concepts in an understandable way
- Follow best practices and clean code principles
- Be thorough but concise in your explanations

{customInstructions}`,
    defaultInstructions: [
      "Always consider security implications in code suggestions",
      "Suggest tests when providing code examples",
      "Explain the reasoning behind your recommendations",
    ],
    suggestedSkills: ["code-analysis", "git-operations", "debugging"],
    suggestedTools: ["shell", "git", "file", "memory"],
  },
  {
    id: "support-bot",
    name: "Customer Support Bot",
    description: "Friendly customer support representative",
    category: "support",
    personality: {
      name: "SupportBot",
      traits: ["empathetic", "patient", "helpful", "professional"],
      responseStyle: "friendly",
    },
    systemPromptTemplate: `You are {name}, a friendly customer support representative.

Your personality traits: {traits}
Response style: {responseStyle}

Your role is to:
- Help customers resolve issues quickly and politely
- Be empathetic and understanding
- Provide clear step-by-step instructions
- Escalate complex issues when appropriate
- Maintain a positive and helpful attitude

{customInstructions}`,
    defaultInstructions: [
      "Always acknowledge the customer's frustration",
      "Provide numbered steps for instructions",
      "Offer additional help at the end of each response",
    ],
    suggestedSkills: ["web-search", "faq-lookup"],
    suggestedTools: ["http", "memory"],
  },
  {
    id: "data-analyst",
    name: "Data Analyst",
    description: "Analytical data expert for analysis and visualization",
    category: "analytics",
    personality: {
      name: "DataAnalyst",
      traits: ["analytical", "thorough", "professional"],
      responseStyle: "detailed",
      expertise: [
        "data-analysis",
        "visualization",
        "statistics",
        "python",
        "sql",
      ],
    },
    systemPromptTemplate: `You are {name}, an analytical data expert.

Your personality traits: {traits}
Response style: {responseStyle}

Areas of expertise: {expertise}

Your role is to:
- Analyze data and provide insights
- Create visualizations and reports
- Explain statistical concepts clearly
- Help with data processing and transformation
- Recommend best practices for data handling

{customInstructions}`,
    defaultInstructions: [
      "Always cite data sources and methodologies",
      "Provide confidence intervals when relevant",
      "Suggest visualizations for complex data",
    ],
    suggestedSkills: ["data-processing", "visualization"],
    suggestedTools: ["python", "shell", "file"],
  },
  {
    id: "content-writer",
    name: "Content Writer",
    description: "Creative writer for content creation",
    category: "creative",
    personality: {
      name: "ContentWriter",
      traits: ["creative", "helpful", "playful"],
      responseStyle: "friendly",
      expertise: ["blog-writing", "copywriting", "seo", "storytelling"],
    },
    systemPromptTemplate: `You are {name}, a creative content writer.

Your personality traits: {traits}
Response style: {responseStyle}

Areas of expertise: {expertise}

Your role is to:
- Create engaging and well-structured content
- Adapt tone and style to the target audience
- Optimize content for SEO when requested
- Help with editing and proofreading
- Generate creative ideas and concepts

{customInstructions}`,
    defaultInstructions: [
      "Consider the target audience for all content",
      "Suggest headlines and hooks",
      "Offer to expand or condense content as needed",
    ],
    suggestedSkills: ["web-search", "seo-optimization"],
    suggestedTools: ["http", "file", "memory"],
  },
  {
    id: "general-assistant",
    name: "General Assistant",
    description: "Versatile AI assistant for general tasks",
    category: "general",
    personality: {
      name: "Assistant",
      traits: ["helpful", "patient", "professional"],
      responseStyle: "concise",
    },
    systemPromptTemplate: `You are {name}, a helpful AI assistant.

Your personality traits: {traits}
Response style: {responseStyle}

Your role is to:
- Answer questions accurately and helpfully
- Assist with a wide variety of tasks
- Be clear and concise in your responses
- Admit when you don't know something
- Provide follow-up suggestions when appropriate

{customInstructions}`,
    defaultInstructions: [
      "Be concise but thorough",
      "Offer to elaborate if more detail is needed",
    ],
    suggestedSkills: ["web-search"],
    suggestedTools: ["http", "memory"],
  },
];

// ============================================
// Agent Manager Class
// ============================================

export class AgentManager {
  private db: Database;
  private clients: Map<string, AIClient> = new Map();

  constructor(db: Database) {
    this.db = db;
  }

  /**
   * Create or update an agent for a gateway
   */
  configureAgent(
    gatewayId: string,
    config: Partial<
      Omit<AgentConfig, "id" | "gatewayId" | "createdAt" | "updatedAt">
    >,
  ): AgentConfig {
    const now = Date.now();
    const existing = this.getAgentByGateway(gatewayId);

    if (existing) {
      // Update existing agent
      const updated: AgentConfig = {
        ...existing,
        ...config,
        updatedAt: now,
      };

      this.db.run(
        `
        UPDATE agents SET 
          name = ?,
          personality = ?,
          system_prompt = ?,
          custom_instructions = ?,
          greeting = ?,
          farewell = ?,
          max_tokens = ?,
          temperature = ?,
          updated_at = ?
        WHERE gateway_id = ?
      `,
        [
          updated.name,
          JSON.stringify(updated.personality),
          updated.systemPrompt,
          JSON.stringify(updated.customInstructions),
          updated.greeting || null,
          updated.farewell || null,
          updated.maxTokens,
          updated.temperature,
          now,
          gatewayId,
        ],
      );

      // Invalidate cached client
      this.clients.delete(gatewayId);

      return updated;
    }

    // Create new agent
    const agentId = `agent_${randomUUID().slice(0, 8)}`;
    const newAgent: AgentConfig = {
      id: agentId,
      gatewayId,
      name: config.name || "Assistant",
      personality: config.personality || {
        name: "Assistant",
        traits: ["helpful"],
        responseStyle: "concise",
      },
      systemPrompt: config.systemPrompt || "You are a helpful AI assistant.",
      customInstructions: config.customInstructions || [],
      greeting: config.greeting,
      farewell: config.farewell,
      maxTokens: config.maxTokens || 4096,
      temperature: config.temperature ?? 0.7,
      createdAt: now,
      updatedAt: now,
    };

    this.db.run(
      `
      INSERT INTO agents (
        id, gateway_id, name, personality, system_prompt, custom_instructions,
        greeting, farewell, max_tokens, temperature, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [
        newAgent.id,
        newAgent.gatewayId,
        newAgent.name,
        JSON.stringify(newAgent.personality),
        newAgent.systemPrompt,
        JSON.stringify(newAgent.customInstructions),
        newAgent.greeting || null,
        newAgent.farewell || null,
        newAgent.maxTokens,
        newAgent.temperature,
        newAgent.createdAt,
        newAgent.updatedAt,
      ],
    );

    return newAgent;
  }

  /**
   * Create agent from template
   */
  createFromTemplate(
    gatewayId: string,
    templateId: string,
    customizations?: {
      name?: string;
      additionalInstructions?: string[];
      temperature?: number;
    },
  ): AgentConfig | null {
    const template = AGENT_TEMPLATES.find((t) => t.id === templateId);
    if (!template) return null;

    const personality: AgentPersonality = {
      ...template.personality,
      name: customizations?.name || template.personality.name,
    };

    const customInstructions = [
      ...template.defaultInstructions,
      ...(customizations?.additionalInstructions || []),
    ];

    // Build system prompt from template
    const systemPrompt = this.renderSystemPrompt(
      template.systemPromptTemplate,
      {
        name: personality.name,
        traits: personality.traits.join(", "),
        responseStyle: personality.responseStyle,
        expertise: personality.expertise?.join(", ") || "general",
        customInstructions: customInstructions
          .map((i, idx) => `${idx + 1}. ${i}`)
          .join("\n"),
      },
    );

    return this.configureAgent(gatewayId, {
      name: personality.name,
      personality,
      systemPrompt,
      customInstructions,
      maxTokens: 4096,
      temperature: customizations?.temperature ?? 0.7,
    });
  }

  /**
   * Render system prompt template
   */
  private renderSystemPrompt(
    template: string,
    vars: Record<string, string>,
  ): string {
    return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] || `{${key}}`);
  }

  /**
   * Get agent by gateway ID
   */
  getAgentByGateway(gatewayId: string): AgentConfig | null {
    try {
      const result = this.db
        .query<
          {
            id: string;
            gateway_id: string;
            name: string;
            personality: string;
            system_prompt: string;
            custom_instructions: string;
            greeting: string | null;
            farewell: string | null;
            max_tokens: number;
            temperature: number;
            created_at: number;
            updated_at: number;
          },
          [string]
        >(
          `
        SELECT * FROM agents WHERE gateway_id = ?
      `,
        )
        .get(gatewayId);

      if (!result) return null;

      return {
        id: result.id,
        gatewayId: result.gateway_id,
        name: result.name,
        personality: JSON.parse(result.personality),
        systemPrompt: result.system_prompt,
        customInstructions: JSON.parse(result.custom_instructions || "[]"),
        greeting: result.greeting || undefined,
        farewell: result.farewell || undefined,
        maxTokens: result.max_tokens,
        temperature: result.temperature,
        createdAt: result.created_at,
        updatedAt: result.updated_at,
      };
    } catch {
      return null;
    }
  }

  /**
   * Get or create AI client for a gateway
   */
  async getAgentClient(
    gatewayId: string,
    providerConfig: { provider: string; apiKey: string; baseURL?: string },
  ): Promise<AIClient | null> {
    // Check cache
    const cached = this.clients.get(gatewayId);
    if (cached) return cached;

    // Get agent config
    const agent = this.getAgentByGateway(gatewayId);
    if (!agent) return null;

    // Create provider and client
    const provider = createProvider(
      providerConfig.provider,
      providerConfig.apiKey,
      providerConfig.baseURL,
    );

    const client = new AIClient(provider, agent.systemPrompt);
    this.clients.set(gatewayId, client);

    return client;
  }

  /**
   * Generate response using agent
   */
  async generateResponse(
    gatewayId: string,
    providerConfig: {
      provider: string;
      apiKey: string;
      baseURL?: string;
      model?: string;
    },
    messages: ModelMessage[],
    context?: Partial<ConversationContext>,
  ): Promise<string> {
    const client = await this.getAgentClient(gatewayId, providerConfig);
    if (!client) {
      throw new Error("Agent not configured for gateway");
    }

    const agent = this.getAgentByGateway(gatewayId);

    return client.chat(messages, {
      model: providerConfig.model,
      temperature: agent?.temperature,
      maxTokens: agent?.maxTokens,
    });
  }

  /**
   * Stream response using agent
   */
  async *streamResponse(
    gatewayId: string,
    providerConfig: {
      provider: string;
      apiKey: string;
      baseURL?: string;
      model?: string;
    },
    messages: ModelMessage[],
  ): AsyncGenerator<string> {
    const client = await this.getAgentClient(gatewayId, providerConfig);
    if (!client) {
      throw new Error("Agent not configured for gateway");
    }

    const agent = this.getAgentByGateway(gatewayId);

    // Use the client's streamChat method which handles system prompts
    yield* client.streamChat(messages, {
      model: providerConfig.model,
      temperature: agent?.temperature,
      maxTokens: agent?.maxTokens,
    });
  }

  /**
   * Get available templates
   */
  getTemplates(): AgentTemplate[] {
    return AGENT_TEMPLATES;
  }

  /**
   * Get templates by category
   */
  getTemplatesByCategory(category: string): AgentTemplate[] {
    return AGENT_TEMPLATES.filter((t) => t.category === category);
  }

  /**
   * List all agents
   */
  listAgents(): Array<{
    id: string;
    gatewayId: string;
    name: string;
    personality: AgentPersonality;
  }> {
    try {
      const results = this.db
        .query<
          {
            id: string;
            gateway_id: string;
            name: string;
            personality: string;
          },
          []
        >(
          `
        SELECT id, gateway_id, name, personality FROM agents
      `,
        )
        .all();

      return results.map((r) => ({
        id: r.id,
        gatewayId: r.gateway_id,
        name: r.name,
        personality: JSON.parse(r.personality),
      }));
    } catch {
      return [];
    }
  }

  /**
   * Delete agent
   */
  deleteAgent(gatewayId: string): boolean {
    try {
      this.db.run(`DELETE FROM agents WHERE gateway_id = ?`, [gatewayId]);
      this.clients.delete(gatewayId);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Generate greeting message
   */
  generateGreeting(gatewayId: string): string {
    const agent = this.getAgentByGateway(gatewayId);
    if (agent?.greeting) {
      return agent.greeting;
    }

    const name = agent?.personality.name || "Assistant";
    const traits = agent?.personality.traits || ["helpful"];

    if (traits.includes("playful")) {
      return `Hey there! 👋 I'm ${name}. How can I help you today?`;
    } else if (traits.includes("professional")) {
      return `Hello. I'm ${name}, ready to assist you. How may I help?`;
    } else {
      return `Hello! I'm ${name}. How can I assist you today?`;
    }
  }
}

// ============================================
// Database Initialization
// ============================================

export function initAgentTables(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      gateway_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      personality TEXT NOT NULL,
      system_prompt TEXT NOT NULL,
      custom_instructions TEXT,
      greeting TEXT,
      farewell TEXT,
      max_tokens INTEGER DEFAULT 4096,
      temperature REAL DEFAULT 0.7,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (gateway_id) REFERENCES gateways(id)
    )
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_agents_gateway ON agents(gateway_id)
  `);
}

// ============================================
// Singleton Instance
// ============================================

let agentManagerInstance: AgentManager | null = null;

export function getAgentManager(db: Database): AgentManager {
  if (!agentManagerInstance) {
    agentManagerInstance = new AgentManager(db);
    initAgentTables(db);
  }
  return agentManagerInstance;
}

export { agentManagerInstance as agentManager };
