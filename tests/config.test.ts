import { expect, test, describe, beforeEach } from "bun:test";
import { configLoader } from "../src/server/config/loader";
import { defaultConfig } from "../src/server/config/defaults";
import { defineConfig } from "../src/server/config/types";

describe("Config Loader", () => {
  test("loads default configuration", async () => {
    await configLoader.load();
    const config = configLoader.get();

    expect(config).toBeDefined();
    expect(config.server).toBeDefined();
    expect(config.database).toBeDefined();
  });

  test("returns default server port", () => {
    const config = configLoader.get();
    expect(config.server?.port).toBeDefined();
  });

  test("returns provider config", () => {
    const openaiConfig = configLoader.getProvider("openai");
    expect(openaiConfig).toBeDefined();
  });

  test("returns default tool permission", () => {
    const permission = configLoader.getToolPermission("unknown_tool");
    expect(permission).toBe("allowed");
  });
});

describe("Default Config", () => {
  test("has server defaults", () => {
    expect(defaultConfig.server).toBeDefined();
    expect(defaultConfig.server?.port).toBe(3000);
    expect(defaultConfig.server?.host).toBe("0.0.0.0");
  });

  test("has database defaults", () => {
    expect(defaultConfig.database).toBeDefined();
    expect(defaultConfig.database?.url).toBeDefined();
  });

  test("has logging defaults", () => {
    expect(defaultConfig.logging).toBeDefined();
    expect(defaultConfig.logging?.level).toBe("info");
  });

  test("has security defaults", () => {
    expect(defaultConfig.security).toBeDefined();
    expect(defaultConfig.security?.apiKeysEnabled).toBe(true);
  });
});

describe("defineConfig", () => {
  test("merges with defaults", () => {
    const config = defineConfig({
      server: {
        port: 4000,
        host: "0.0.0.0",
      },
    });

    expect(config.server?.port).toBe(4000);
    expect(config.server?.host).toBe("0.0.0.0");
  });

  test("accepts provider config", () => {
    const config = defineConfig({
      providers: {
        openai: {
          apiKey: "test-key",
        },
      },
    });

    expect(config.providers?.openai?.apiKey).toBe("test-key");
  });

  test("accepts tool permissions", () => {
    const config = defineConfig({
      tools: {
        "filesystem.write": "restricted",
        "system.exec": "disabled",
      },
    });

    expect(config.tools?.["filesystem.write"]).toBe("restricted");
    expect(config.tools?.["system.exec"]).toBe("disabled");
  });

  test("accepts workflow config", () => {
    const config = defineConfig({
      workflows: {
        maxConcurrentRuns: 20,
        defaultTimeout: 60000,
      },
    });

    expect(config.workflows?.maxConcurrentRuns).toBe(20);
    expect(config.workflows?.defaultTimeout).toBe(60000);
  });
});
