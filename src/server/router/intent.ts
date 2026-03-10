import { log } from "../core";

export type IntentHandler = (text: string) => Promise<boolean>;

export class IntentRouter {
  private routes: Array<{
    pattern: RegExp;
    handler: (matches: RegExpMatchArray) => Promise<void>;
  }> = [];

  register(
    pattern: RegExp,
    handler: (matches: RegExpMatchArray) => Promise<void>,
  ) {
    this.routes.push({ pattern, handler });
    log.info(`[IntentRouter] Registered route pattern: ${pattern}`);
  }

  async process(text: string): Promise<boolean> {
    for (const route of this.routes) {
      const match = text.match(route.pattern);
      if (match) {
        log.info(`[IntentRouter] Match found for: ${text}`);
        await route.handler(match);
        return true;
      }
    }
    return false;
  }
}

export const intentRouter = new IntentRouter();
