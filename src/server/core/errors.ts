// Platform error definitions
export class PlatformError extends Error {
  constructor(
    message: string,
    public code: string,
  ) {
    super(message);
    this.name = "PlatformError";
  }
}
