import { defineConfig } from "drizzle-kit";

// Use relative path since it's executed from process.cwd()
export default defineConfig({
  schema: "./src/server/database/schema.ts",
  out: "./src/server/database/migrations",
  dialect: "sqlite",
  dbCredentials: {
    url: "file:./src/server/database/kendaliai.sqlite",
  },
});
