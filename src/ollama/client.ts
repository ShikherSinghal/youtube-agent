export interface OllamaConfig {
  host: string;
  heavyModel: string;
  lightModel: string;
}

export type ModelTier = "heavy" | "light";

export class OllamaClient {
  private config: OllamaConfig;

  constructor(config: OllamaConfig) {
    this.config = config;
  }

  private getModel(tier: ModelTier): string {
    return tier === "heavy" ? this.config.heavyModel : this.config.lightModel;
  }

  async generateText(tier: ModelTier, prompt: string, systemPrompt?: string): Promise<string> {
    const model = this.getModel(tier);
    const messages: Array<{ role: string; content: string }> = [];

    if (systemPrompt) {
      messages.push({ role: "system", content: systemPrompt });
    }
    messages.push({ role: "user", content: prompt });

    const response = await fetch(`${this.config.host}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, stream: false }),
    });

    if (!response.ok) {
      throw new Error(`Ollama request failed: ${response.status}`);
    }

    const data = await response.json();
    return data.message.content;
  }

  async generateJSON<T = unknown>(tier: ModelTier, prompt: string, _schema?: unknown): Promise<T> {
    const systemPrompt = "You must respond with valid JSON only. No markdown, no code fences, no explanation.";
    const text = await this.generateText(tier, prompt, systemPrompt);

    // Strip code fences if present (handle preamble text before fences)
    let cleaned = text.trim();
    const fenceMatch = cleaned.match(/```(?:json)?\s*\n([\s\S]*?)\n?```/i);
    if (fenceMatch) {
      cleaned = fenceMatch[1].trim();
    }

    try {
      return JSON.parse(cleaned) as T;
    } catch (err) {
      throw new Error(`Failed to parse LLM response as JSON: ${(err as Error).message}\nRaw response: ${text.slice(0, 500)}`);
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.host}/api/tags`);
      return response.ok;
    } catch {
      return false;
    }
  }
}
