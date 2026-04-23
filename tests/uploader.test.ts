import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Database } from "../src/db.js";
import { unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";

const { mockInsert, mockSetCredentials } = vi.hoisted(() => ({
  mockInsert: vi.fn().mockResolvedValue({ data: { id: "yt-uploaded-123" } }),
  mockSetCredentials: vi.fn(),
}));

vi.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: vi.fn().mockImplementation(() => ({
        setCredentials: mockSetCredentials,
      })),
    },
    youtube: vi.fn().mockReturnValue({
      videos: {
        insert: mockInsert,
      },
    }),
  },
}));

vi.mock("fs", async () => {
  const actual = await vi.importActual<typeof import("fs")>("fs");
  return {
    ...actual,
    default: {
      ...actual,
      createReadStream: vi.fn().mockReturnValue("fake-stream"),
    },
    createReadStream: vi.fn().mockReturnValue("fake-stream"),
  };
});

import { UploaderAgent } from "../src/agents/uploader.js";

const TEST_DB = join(import.meta.dirname, "uploader-test.db");

let db: Database;

beforeEach(() => {
  db = new Database(TEST_DB);
  vi.clearAllMocks();
  mockInsert.mockResolvedValue({ data: { id: "yt-uploaded-123" } });
});

afterEach(() => {
  db.close();
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
});

const credentials = {
  clientId: "test-client-id",
  clientSecret: "test-client-secret",
  refreshToken: "test-refresh-token",
};

describe("UploaderAgent", () => {
  it("uploads rendered videos due today", async () => {
    const videoId = db.insertVideo({
      niche: "tech",
      title: "Test Upload Video",
      description: "A video to upload",
      hashtags: ["#tech", "#test"],
      tags: "tech,test",
      scheduledDate: "2024-01-01",
    });
    db.updateVideoStatus(videoId, "rendered");
    db.setVideoPath(videoId, "/tmp/test-video.mp4");

    const agent = new UploaderAgent(db, credentials);
    const results = await agent.uploadDue();

    expect(results).toHaveLength(1);
    expect(results[0].youtubeId).toBe("yt-uploaded-123");
    expect(results[0].videoId).toBe(videoId);
    expect(results[0].title).toBe("Test Upload Video");

    const updated = db.getVideo(videoId);
    expect(updated!.youtube_id).toBe("yt-uploaded-123");
    expect(updated!.status).toBe("uploaded");
  });

  it("skips videos not yet due", async () => {
    const videoId = db.insertVideo({
      niche: "tech",
      title: "Future Video",
      description: "Not due yet",
      scheduledDate: "2099-12-31",
    });
    db.updateVideoStatus(videoId, "rendered");
    db.setVideoPath(videoId, "/tmp/future-video.mp4");

    const agent = new UploaderAgent(db, credentials);
    const results = await agent.uploadDue();

    expect(results).toHaveLength(0);
    expect(mockInsert).not.toHaveBeenCalled();
  });
});
