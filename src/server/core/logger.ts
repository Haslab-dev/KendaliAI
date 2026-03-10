export class Logger {
  info(message: string, context?: any) {
    console.log(`[INFO] ${message}`, context || "");
  }
  error(message: string, error?: any) {
    console.error(`[ERROR] ${message}`, error || "");
  }
  warn(message: string, context?: any) {
    console.warn(`[WARN] ${message}`, context || "");
  }
}
export const log = new Logger();
