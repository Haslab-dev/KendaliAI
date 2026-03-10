import { Provider } from "../gateway";

export class OpenAIProvider implements Provider {
  name = "openai";

  async chat(prompt: string, options?: any): Promise<string> {
    // Mock implementation for Phase 2 bootstrap
    return `[OpenAI] Processed: ${prompt}`;
  }
}
