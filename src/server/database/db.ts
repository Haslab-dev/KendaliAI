import { createClient, Client } from "@libsql/client";
import { log } from "../core";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

export class DatabaseManager {
  public client: Client;
  public db: ReturnType<typeof drizzle>;

  constructor() {
    log.info("[Database] Initializing SQLite with LibSQL and Drizzle ORM...");
    this.client = createClient({
      url: "file:src/server/database/kendaliai.sqlite",
    });
    this.db = drizzle(this.client, { schema });
  }
}

export const dbManager = new DatabaseManager();
