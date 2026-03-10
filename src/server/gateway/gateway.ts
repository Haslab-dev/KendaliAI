import { log } from "../core";

export interface Provider {
  name: string;
  chat(prompt: string, options?: any): Promise<string>;
}

export class AIGateway {
  private providers: Map<string, Provider> = new Map();

  register(provider: Provider) {
    this.providers.set(provider.name, provider);
    log.info(`[AIGateway] Registered provider: ${provider.name}`);
  }

  async chatCompletion(
    providerName: string,
    prompt: string,
    options?: any,
  ): Promise<string> {
    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new Error(`Provider not found: ${providerName}`);
    }

    log.info(`[AIGateway] Routing chat request to ${providerName}`);
    return provider.chat(prompt, options);
  }
}

export const gateway = new AIGateway();
