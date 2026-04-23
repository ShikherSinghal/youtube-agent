import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Database } from "../src/db.js";
import { PlannerAgent } from "../src/agents/planner.js";
import { unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";

const TEST_DB = join(import.meta.dirname, "planner-test.db");

function makeVideoIdea(niche: string, index: number) {
  return {
    title: `${niche} video ${index}`,
    hook: `Amazing ${niche} hook ${index}`,
    description: `Description for ${niche} video ${index}`,
    hashtags: [`#${niche}`, `#video${index}`],
    tags: [`${niche}`, `video${index}`],
    thumbnailText: `${niche} thumb ${index}`,
  };
}

function makeMockOllama(distribution: Record<string, number>) {
  const callCount = { n: 0 };
  const generateJSON = vi.fn().mockImplementation(async () => {
    callCount.n++;
    if (callCount.n === 1) {
      return { distribution };
    }
    // Subsequent calls return video ideas for each niche in order
    const niches = Object.keys(distribution);
    const nicheIndex = callCount.n - 2;
    const niche = niches[nicheIndex];
    const count = distribution[niche];
    return {
      videos: Array.from({ length: count }, (_, i) => makeVideoIdea(niche, i + 1)),
    };
  });

  return {
    generateJSON,
    generateText: vi.fn(),
    isHealthy: vi.fn().mockResolvedValue(true),
  };
}

let db: Database;

beforeEach(() => {
  db = new Database(TEST_DB);
});

afterEach(() => {
  db.close();
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  // Clean up WAL/SHM files
  for (const suffix of ["-wal", "-shm"]) {
    const p = TEST_DB + suffix;
    if (existsSync(p)) unlinkSync(p);
  }
});

describe("PlannerAgent", () => {
  it("generates a 30-day plan and inserts videos into DB", async () => {
    const mockOllama = makeMockOllama({ tech: 16, science: 14 });
    const planner = new PlannerAgent(db, mockOllama as any);

    await planner.generatePlan(["tech", "science"]);

    const videos = db.getAllVideos();
    expect(videos).toHaveLength(30);

    // Check that all videos have required fields
    for (const video of videos) {
      expect(video.title).toBeTruthy();
      expect(video.hook).toBeTruthy();
      expect(video.description).toBeTruthy();
      expect(video.niche).toBeTruthy();
      expect(video.scheduled_date).toBeTruthy();
      expect(video.status).toBe("planned");
    }

    // Check niche counts
    const techVideos = videos.filter((v) => v.niche === "tech");
    const scienceVideos = videos.filter((v) => v.niche === "science");
    expect(techVideos).toHaveLength(16);
    expect(scienceVideos).toHaveLength(14);

    // Verify generateJSON was called 3 times: distribution + 2 niches
    expect(mockOllama.generateJSON).toHaveBeenCalledTimes(3);
  });

  it("assigns unique scheduled dates across 30 days", async () => {
    const mockOllama = makeMockOllama({ tech: 16, science: 14 });
    const planner = new PlannerAgent(db, mockOllama as any);

    await planner.generatePlan(["tech", "science"]);

    const videos = db.getAllVideos();
    const dates = videos.map((v) => v.scheduled_date);

    // All dates should be unique
    const uniqueDates = new Set(dates);
    expect(uniqueDates.size).toBe(30);

    // Dates should start from tomorrow and be sequential
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const sortedDates = [...dates].sort();
    for (let i = 0; i < 30; i++) {
      const expected = new Date(tomorrow);
      expected.setDate(tomorrow.getDate() + i);
      const expectedStr = expected.toISOString().split("T")[0];
      expect(sortedDates[i]).toBe(expectedStr);
    }
  });
});
