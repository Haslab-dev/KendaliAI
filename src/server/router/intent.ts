/**
 * KendaliAI Intent Router
 */

export interface IntentHandler {
  regex: RegExp;
  handler: (matches: RegExpMatchArray) => Promise<void>;
}

export class IntentRouter {
  private handlers: IntentHandler[] = [];

  register(
    regex: RegExp,
    handler: (matches: RegExpMatchArray) => Promise<void>,
  ) {
    this.handlers.push({ regex, handler });
  }

  async process(text: string) {
    for (const { regex, handler } of this.handlers) {
      const matches = text.match(regex);
      if (matches) {
        await handler(matches);
      }
    }
  }
}

export const intentRouter = new IntentRouter();

export default intentRouter;
