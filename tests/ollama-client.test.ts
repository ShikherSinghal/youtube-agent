import { describe, it, expect, vi, beforeEach } from "vitest";
import { OllamaClient } from "../src/ollama/client.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("OllamaClient", () => {
  let client: OllamaClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new OllamaClient({
      host: "http://localhost:11434",
      heavyModel: "qwen2.5:14b",
      lightModel: "qwen2.5:7b",
    });
  });

  it("sends prompt to heavy model with JSON response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: { content: '{"title":"Test"}' } }),
    });
    const result = await client.generateJSON("heavy", "Generate a title", { title: "string" });
    expect(result).toEqual({ title: "Test" });
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:11434/api/chat",
      expect.objectContaining({ method: "POST", body: expect.stringContaining("qwen2.5:14b") }),
    );
  });

  it("sends prompt to light model for text", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: { content: "Hello world" } }),
    });
    const result = await client.generateText("light", "Say hello");
    expect(result).toBe("Hello world");
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:11434/api/chat",
      expect.objectContaining({ body: expect.stringContaining("qwen2.5:7b") }),
    );
  });

  it("throws on non-OK response", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500, statusText: "Internal Server Error" });
    await expect(client.generateText("heavy", "fail")).rejects.toThrow("Ollama request failed: 500");
  });

  it("checks connectivity", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    const healthy = await client.isHealthy();
    expect(healthy).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith("http://localhost:11434/api/tags");
  });

  it("returns false when Ollama is unreachable", async () => {
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const healthy = await client.isHealthy();
    expect(healthy).toBe(false);
  });
});
