import { Database } from "bun:sqlite";
import { log } from "../core";
import { initSchema } from "./schema";

export class DatabaseManager {
  public db: Database;

  constructor() {
    log.info("[Database] Initializing SQLite...");
    this.db = new Database("src/server/database/kendaliai.sqlite", {
      create: true,
    });
    initSchema(this.db);
  }
}

export const dbManager = new DatabaseManager();
