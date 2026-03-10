export class Memory {
  private store: Map<string, any> = new Map();

  set(key: string, value: any) {
    this.store.set(key, value);
  }

  get(key: string) {
    return this.store.get(key);
  }
}
