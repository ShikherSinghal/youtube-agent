import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Database } from "../src/db.js";
import { unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";

const { mockListComments, mockSetCredentials, mockSendMail } = vi.hoisted(() => ({
  mockListComments: vi.fn().mockResolvedValue({
    data: {
      items: [
        {
          id: "comment-1",
          snippet: {
            topLevelComment: {
              snippet: {
                authorDisplayName: "Alice",
                textDisplay: "Great video!",
                publishedAt: "2024-06-01T12:00:00Z",
              },
            },
          },
        },
        {
          id: "comment-2",
          snippet: {
            topLevelComment: {
              snippet: {
                authorDisplayName: "Bob",
                textDisplay: "Very informative",
                publishedAt: "2024-06-01T13:00:00Z",
              },
            },
          },
        },
      ],
    },
  }),
  mockSetCredentials: vi.fn(),
  mockSendMail: vi.fn().mockResolvedValue({ messageId: "msg-1" }),
}));

vi.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: vi.fn().mockImplementation(() => ({
        setCredentials: mockSetCredentials,
      })),
    },
    youtube: vi.fn().mockReturnValue({
      commentThreads: {
        list: mockListComments,
      },
    }),
  },
}));

vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn().mockReturnValue({
      sendMail: mockSendMail,
    }),
  },
}));

import { WatcherAgent } from "../src/agents/watcher.js";

const TEST_DB = join(import.meta.dirname, "watcher-test.db");

let db: Database;

const config = {
  youtube: {
    clientId: "test-client-id",
    clientSecret: "test-client-secret",
    refreshToken: "test-refresh-token",
  },
  gmail: {
    user: "test@gmail.com",
    appPassword: "test-app-password",
  },
};

beforeEach(() => {
  db = new Database(TEST_DB);
  vi.clearAllMocks();
});

afterEach(() => {
  db.close();
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
});

describe("WatcherAgent", () => {
  it("fetches and stores new comments", async () => {
    const videoId = db.insertVideo({
      niche: "tech",
      title: "My Tech Video",
      description: "A tech video",
      scheduledDate: "2024-01-01",
    });
    db.updateVideoStatus(videoId, "uploaded");
    db.setYoutubeId(videoId, "yt-vid-123");

    const agent = new WatcherAgent(db, config);
    const count = await agent.pollComments();

    expect(count).toBe(2);
    expect(mockListComments).toHaveBeenCalledWith(
      expect.objectContaining({
        videoId: "yt-vid-123",
        part: ["snippet"],
      })
    );

    const comments = db.getUnnotifiedComments();
    expect(comments).toHaveLength(2);
    expect(comments[0].author).toBe("Alice");
    expect(comments[1].author).toBe("Bob");
  });

  it("sends digest email with unnotified comments", async () => {
    const videoId = db.insertVideo({
      niche: "tech",
      title: "Digest Video",
      description: "A video",
      scheduledDate: "2024-01-01",
    });
    db.updateVideoStatus(videoId, "uploaded");

    db.insertComment({
      videoId,
      youtubeCommentId: "yt-comment-99",
      author: "Charlie",
      text: "Nice work!",
      publishedAt: "2024-06-01T10:00:00Z",
    });

    const agent = new WatcherAgent(db, config);
    const sent = await agent.sendDigest();

    expect(sent).toBe(true);
    expect(mockSendMail).toHaveBeenCalledOnce();
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "test@gmail.com",
        subject: expect.stringContaining("YouTube Comment Digest"),
      })
    );

    const remaining = db.getUnnotifiedComments();
    expect(remaining).toHaveLength(0);
  });

  it("skips digest when no unnotified comments", async () => {
    const agent = new WatcherAgent(db, config);
    const sent = await agent.sendDigest();

    expect(sent).toBe(false);
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it("builds HTML digest with grouped comments", () => {
    const comments = [
      {
        id: 1,
        video_id: 1,
        youtube_comment_id: "c1",
        author: "Alice",
        text: "Great video!",
        published_at: "2024-06-01T12:00:00Z",
        notified: 0,
        created_at: "2024-06-01T12:00:00Z",
        title: "My Tech Video",
      },
      {
        id: 2,
        video_id: 1,
        youtube_comment_id: "c2",
        author: "Bob",
        text: "Very informative",
        published_at: "2024-06-01T13:00:00Z",
        notified: 0,
        created_at: "2024-06-01T13:00:00Z",
        title: "My Tech Video",
      },
    ];

    const agent = new WatcherAgent(db, config);
    const html = agent.buildDigestHtml(comments);

    expect(html).toContain("My Tech Video");
    expect(html).toContain("Alice");
    expect(html).toContain("Great video!");
    expect(html).toContain("Bob");
    expect(html).toContain("Very informative");
  });

  it("escapes HTML in digest to prevent XSS", () => {
    const comments = [
      {
        id: 1,
        video_id: 1,
        youtube_comment_id: "c1",
        author: '<script>alert("xss")</script>',
        text: '<img src=x onerror="alert(1)">',
        published_at: "2024-06-01T12:00:00Z",
        notified: 0,
        created_at: "2024-06-01T12:00:00Z",
        title: "My Video",
      },
    ];

    const agent = new WatcherAgent(db, config);
    const html = agent.buildDigestHtml(comments);

    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
  });
});
