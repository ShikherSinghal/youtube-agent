import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadConfig, type Config } from "../src/config.js";

describe("loadConfig", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("loads all config values from env", () => {
    process.env.YOUTUBE_CLIENT_ID = "test-client-id";
    process.env.YOUTUBE_CLIENT_SECRET = "test-secret";
    process.env.YOUTUBE_REFRESH_TOKEN = "test-token";
    process.env.GMAIL_USER = "test@gmail.com";
    process.env.GMAIL_APP_PASSWORD = "test-pass";
    process.env.NICHES = "tech,science,history";
    process.env.OLLAMA_HOST = "http://localhost:11434";
    process.env.OLLAMA_MODEL_HEAVY = "qwen2.5:14b";
    process.env.OLLAMA_MODEL_LIGHT = "qwen2.5:7b";
    process.env.VIDEO_DURATION_SECS = "210";
    process.env.VIDEO_WORKERS = "2";
    process.env.IMAGES_PER_VIDEO = "8";
    process.env.COMMENT_POLL_INTERVAL_MS = "1800000";
    process.env.DIGEST_HOUR = "9";

    const config = loadConfig();
    expect(config.youtube.clientId).toBe("test-client-id");
    expect(config.youtube.clientSecret).toBe("test-secret");
    expect(config.youtube.refreshToken).toBe("test-token");
    expect(config.gmail.user).toBe("test@gmail.com");
    expect(config.gmail.appPassword).toBe("test-pass");
    expect(config.niches).toEqual(["tech", "science", "history"]);
    expect(config.ollama.host).toBe("http://localhost:11434");
    expect(config.ollama.heavyModel).toBe("qwen2.5:14b");
    expect(config.ollama.lightModel).toBe("qwen2.5:7b");
    expect(config.video.durationSecs).toBe(210);
    expect(config.video.workers).toBe(2);
    expect(config.video.imagesPerVideo).toBe(8);
    expect(config.watcher.pollIntervalMs).toBe(1800000);
    expect(config.watcher.digestHour).toBe(9);
  });

  it("throws on missing required NICHES", () => {
    process.env.YOUTUBE_CLIENT_ID = "x";
    process.env.YOUTUBE_CLIENT_SECRET = "x";
    process.env.YOUTUBE_REFRESH_TOKEN = "x";
    process.env.GMAIL_USER = "x";
    process.env.GMAIL_APP_PASSWORD = "x";
    process.env.OLLAMA_HOST = "http://localhost:11434";
    expect(() => loadConfig()).toThrow("NICHES");
  });

  it("uses defaults for optional values", () => {
    process.env.YOUTUBE_CLIENT_ID = "x";
    process.env.YOUTUBE_CLIENT_SECRET = "x";
    process.env.YOUTUBE_REFRESH_TOKEN = "x";
    process.env.GMAIL_USER = "x";
    process.env.GMAIL_APP_PASSWORD = "x";
    process.env.NICHES = "tech";

    const config = loadConfig();
    expect(config.ollama.host).toBe("http://localhost:11434");
    expect(config.ollama.heavyModel).toBe("qwen2.5:14b");
    expect(config.ollama.lightModel).toBe("qwen2.5:7b");
    expect(config.video.durationSecs).toBe(210);
    expect(config.video.workers).toBe(2);
    expect(config.video.imagesPerVideo).toBe(8);
    expect(config.watcher.pollIntervalMs).toBe(1800000);
    expect(config.watcher.digestHour).toBe(9);
  });
});
