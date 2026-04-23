import { Database } from "../db.js";
import { OllamaClient } from "../ollama/client.js";
import { logger } from "../utils/logger.js";

interface VideoIdea {
  title: string;
  hook: string;
  description: string;
  hashtags: string[];
  tags: string[];
  thumbnailText: string;
}

interface DistributionResponse {
  distribution: Record<string, number>;
}

interface VideoIdeasResponse {
  videos: VideoIdea[];
}

export class PlannerAgent {
  constructor(
    private db: Database,
    private ollama: OllamaClient,
  ) {}

  async generatePlan(niches: string[]): Promise<void> {
    logger.info("PlannerAgent", "Generating 30-day content plan", { niches: niches as unknown as Record<string, unknown> });

    // 1. Get distribution across niches
    const distribution = await this.getDistribution(niches);
    logger.info("PlannerAgent", "Distribution decided", { distribution: distribution as unknown as Record<string, unknown> });

    // 2. Generate video ideas for each niche
    const ideasByNiche: Record<string, VideoIdea[]> = {};
    for (const niche of niches) {
      const count = distribution[niche] ?? 0;
      if (count > 0) {
        ideasByNiche[niche] = await this.getVideoIdeas(niche, count);
        logger.info("PlannerAgent", `Generated ${ideasByNiche[niche].length} ideas for ${niche}`);
      }
    }

    // 3. Interleave by niche for variety
    const interleaved = this.interleaveByNiche(ideasByNiche);

    // 4. Assign sequential dates starting tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    // 5. Insert each video into DB
    for (let i = 0; i < interleaved.length; i++) {
      const { niche, idea } = interleaved[i];
      const date = new Date(tomorrow);
      date.setDate(tomorrow.getDate() + i);
      const scheduledDate = date.toISOString().split("T")[0];

      this.db.insertVideo({
        niche,
        title: idea.title,
        description: idea.description,
        hashtags: idea.hashtags,
        tags: idea.tags.join(","),
        hook: idea.hook,
        thumbnailText: idea.thumbnailText,
        scheduledDate,
      });
    }

    logger.info("PlannerAgent", `Inserted ${interleaved.length} videos into database`);
  }

  private async getDistribution(niches: string[]): Promise<Record<string, number>> {
    const prompt = `You are a YouTube content strategist. Distribute exactly 30 videos across these niches: ${niches.join(", ")}.
Return a JSON object with a "distribution" key mapping each niche to its video count. The counts must total exactly 30.
Example: {"distribution": {"tech": 15, "science": 15}}`;

    const result = await this.ollama.generateJSON<DistributionResponse>("heavy", prompt);
    const distribution = result.distribution;

    // Ensure total is exactly 30; adjust first niche if needed
    const total = Object.values(distribution).reduce((sum, n) => sum + n, 0);
    if (total !== 30) {
      const firstNiche = niches[0];
      distribution[firstNiche] = (distribution[firstNiche] ?? 0) + (30 - total);
    }

    return distribution;
  }

  private async getVideoIdeas(niche: string, count: number): Promise<VideoIdea[]> {
    const prompt = `Generate exactly ${count} YouTube video ideas for the "${niche}" niche.
Return a JSON object with a "videos" array. Each video must have: title, hook, description, hashtags (array of strings), tags (array of strings), thumbnailText.
Make each idea unique, engaging, and optimized for YouTube discovery.`;

    const result = await this.ollama.generateJSON<VideoIdeasResponse>("heavy", prompt);
    return result.videos.slice(0, count);
  }

  private interleaveByNiche(
    ideasByNiche: Record<string, VideoIdea[]>,
  ): Array<{ niche: string; idea: VideoIdea }> {
    const result: Array<{ niche: string; idea: VideoIdea }> = [];
    const niches = Object.keys(ideasByNiche);
    const indices: Record<string, number> = {};
    for (const niche of niches) {
      indices[niche] = 0;
    }

    let remaining = Object.values(ideasByNiche).reduce((sum, arr) => sum + arr.length, 0);

    while (remaining > 0) {
      for (const niche of niches) {
        const ideas = ideasByNiche[niche];
        const idx = indices[niche];
        if (idx < ideas.length) {
          result.push({ niche, idea: ideas[idx] });
          indices[niche]++;
          remaining--;
        }
      }
    }

    return result;
  }
}
