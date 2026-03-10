import { log } from "../core";
import { eventBus } from "../eventbus";

export abstract class MessagingAdapter {
  abstract name: string;
  abstract connect(): Promise<void>;
  abstract sendMessage(to: string, message: string): Promise<void>;

  protected emitMessageReceived(from: string, text: string) {
    log.info(
      `[MessagingAdapter:${this.name}] Received message from ${from}: ${text}`,
    );
    eventBus.emit("MESSAGE_RECEIVED", { adapter: this.name, from, text });
  }
}
