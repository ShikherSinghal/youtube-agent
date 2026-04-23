import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Database } from "../src/db.js";
import { unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";

const TEST_DB = join(import.meta.dirname, "test.db");

let db: Database;

beforeEach(() => {
  db = new Database(TEST_DB);
});

afterEach(() => {
  db.close();
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
});

describe("Database", () => {
  describe("insert and retrieve video", () => {
    it("inserts a video and retrieves it by id", () => {
      const id = db.insertVideo({
        niche: "tech",
        title: "Test Video",
        description: "A test video",
        hashtags: ["#tech", "#test"],
        tags: "tech,test",
        hook: "Amazing hook",
        thumbnailText: "Click me",
        scheduledDate: "2026-05-01",
      });

      expect(id).toBe(1);
      const video = db.getVideo(id);
      expect(video).toBeDefined();
      expect(video!.niche).toBe("tech");
      expect(video!.title).toBe("Test Video");
      expect(video!.description).toBe("A test video");
      expect(JSON.parse(video!.hashtags!)).toEqual(["#tech", "#test"]);
      expect(video!.tags).toBe("tech,test");
      expect(video!.hook).toBe("Amazing hook");
      expect(video!.thumbnail_text).toBe("Click me");
      expect(video!.scheduled_date).toBe("2026-05-01");
      expect(video!.status).toBe("planned");
      expect(video!.video_path).toBeNull();
      expect(video!.youtube_id).toBeNull();
    });

    it("inserts a video with minimal fields", () => {
      const id = db.insertVideo({
        niche: "science",
        title: "Minimal Video",
        scheduledDate: "2026-06-01",
      });

      const video = db.getVideo(id);
      expect(video!.niche).toBe("science");
      expect(video!.title).toBe("Minimal Video");
      expect(video!.description).toBeNull();
      expect(video!.hashtags).toBeNull();
    });

    it("returns undefined for non-existent video", () => {
      expect(db.getVideo(999)).toBeUndefined();
    });
  });

  describe("updateVideoStatus", () => {
    it("updates the status of a video", () => {
      const id = db.insertVideo({
        niche: "tech",
        title: "Status Video",
        scheduledDate: "2026-05-01",
      });

      db.updateVideoStatus(id, "scripted");
      expect(db.getVideo(id)!.status).toBe("scripted");

      db.updateVideoStatus(id, "rendered");
      expect(db.getVideo(id)!.status).toBe("rendered");

      db.updateVideoStatus(id, "uploaded");
      expect(db.getVideo(id)!.status).toBe("uploaded");
    });
  });

  describe("getVideosByStatus", () => {
    it("returns videos filtered by status", () => {
      db.insertVideo({ niche: "tech", title: "V1", scheduledDate: "2026-05-01" });
      db.insertVideo({ niche: "tech", title: "V2", scheduledDate: "2026-05-02" });
      db.insertVideo({ niche: "tech", title: "V3", scheduledDate: "2026-05-03" });

      db.updateVideoStatus(1, "scripted");
      db.updateVideoStatus(2, "scripted");

      const scripted = db.getVideosByStatus("scripted");
      expect(scripted).toHaveLength(2);
      expect(scripted.map((v) => v.title)).toEqual(["V1", "V2"]);

      const planned = db.getVideosByStatus("planned");
      expect(planned).toHaveLength(1);
      expect(planned[0].title).toBe("V3");
    });
  });

  describe("getVideosDueForUpload", () => {
    it("returns rendered videos with scheduled_date <= today", () => {
      // Past date, rendered -> should be due
      const id1 = db.insertVideo({
        niche: "tech",
        title: "Due Video",
        scheduledDate: "2020-01-01",
      });
      db.updateVideoStatus(id1, "rendered");

      // Future date, rendered -> not due
      const id2 = db.insertVideo({
        niche: "tech",
        title: "Future Video",
        scheduledDate: "2099-12-31",
      });
      db.updateVideoStatus(id2, "rendered");

      // Past date, planned -> not due (wrong status)
      db.insertVideo({
        niche: "tech",
        title: "Planned Video",
        scheduledDate: "2020-01-01",
      });

      const due = db.getVideosDueForUpload();
      expect(due).toHaveLength(1);
      expect(due[0].title).toBe("Due Video");
    });
  });

  describe("getUploadedVideos", () => {
    it("returns only uploaded videos", () => {
      const id1 = db.insertVideo({ niche: "tech", title: "Uploaded", scheduledDate: "2026-05-01" });
      db.updateVideoStatus(id1, "uploaded");
      db.insertVideo({ niche: "tech", title: "Planned", scheduledDate: "2026-05-02" });

      const uploaded = db.getUploadedVideos();
      expect(uploaded).toHaveLength(1);
      expect(uploaded[0].title).toBe("Uploaded");
    });
  });

  describe("setVideoPath", () => {
    it("sets the video_path on a video", () => {
      const id = db.insertVideo({ niche: "tech", title: "V", scheduledDate: "2026-05-01" });
      db.setVideoPath(id, "/path/to/video.mp4");
      expect(db.getVideo(id)!.video_path).toBe("/path/to/video.mp4");
    });
  });

  describe("setYoutubeId", () => {
    it("sets the youtube_id on a video", () => {
      const id = db.insertVideo({ niche: "tech", title: "V", scheduledDate: "2026-05-01" });
      db.setYoutubeId(id, "abc123");
      expect(db.getVideo(id)!.youtube_id).toBe("abc123");
    });
  });

  describe("setVideoScript", () => {
    it("sets the script on a video", () => {
      const id = db.insertVideo({ niche: "tech", title: "V", scheduledDate: "2026-05-01" });
      db.setVideoScript(id, "This is the script content.");
      expect(db.getVideo(id)!.script).toBe("This is the script content.");
    });
  });

  describe("comments", () => {
    it("inserts and retrieves comments", () => {
      const videoId = db.insertVideo({ niche: "tech", title: "V", scheduledDate: "2026-05-01" });

      db.insertComment({
        videoId,
        youtubeCommentId: "yt_comment_1",
        author: "Alice",
        text: "Great video!",
        publishedAt: "2026-05-01T12:00:00Z",
      });

      db.insertComment({
        videoId,
        youtubeCommentId: "yt_comment_2",
        author: "Bob",
        text: "Thanks!",
        publishedAt: "2026-05-01T13:00:00Z",
      });

      const unnotified = db.getUnnotifiedComments();
      expect(unnotified).toHaveLength(2);
      expect(unnotified[0].author).toBe("Alice");
      expect(unnotified[0].title).toBe("V"); // JOIN with videos
    });

    it("marks comments as notified", () => {
      const videoId = db.insertVideo({ niche: "tech", title: "V", scheduledDate: "2026-05-01" });

      db.insertComment({
        videoId,
        youtubeCommentId: "c1",
        author: "Alice",
        text: "Hello",
        publishedAt: "2026-05-01T12:00:00Z",
      });
      db.insertComment({
        videoId,
        youtubeCommentId: "c2",
        author: "Bob",
        text: "World",
        publishedAt: "2026-05-01T13:00:00Z",
      });

      const comments = db.getUnnotifiedComments();
      db.markCommentsNotified(comments.map((c) => c.id));

      expect(db.getUnnotifiedComments()).toHaveLength(0);
    });

    it("deduplicates comments by youtube_comment_id", () => {
      const videoId = db.insertVideo({ niche: "tech", title: "V", scheduledDate: "2026-05-01" });

      db.insertComment({
        videoId,
        youtubeCommentId: "dup_id",
        author: "Alice",
        text: "First",
        publishedAt: "2026-05-01T12:00:00Z",
      });

      // Insert same youtube_comment_id again - should be ignored
      db.insertComment({
        videoId,
        youtubeCommentId: "dup_id",
        author: "Alice",
        text: "First again",
        publishedAt: "2026-05-01T12:00:00Z",
      });

      const comments = db.getUnnotifiedComments();
      expect(comments).toHaveLength(1);
      expect(comments[0].text).toBe("First");
    });
  });

  describe("getStatusCounts", () => {
    it("returns count of videos per status", () => {
      db.insertVideo({ niche: "tech", title: "V1", scheduledDate: "2026-05-01" });
      db.insertVideo({ niche: "tech", title: "V2", scheduledDate: "2026-05-02" });
      db.insertVideo({ niche: "tech", title: "V3", scheduledDate: "2026-05-03" });

      db.updateVideoStatus(1, "scripted");
      db.updateVideoStatus(2, "uploaded");

      const counts = db.getStatusCounts();
      expect(counts).toEqual({
        planned: 1,
        scripted: 1,
        uploaded: 1,
      });
    });

    it("returns empty object when no videos", () => {
      expect(db.getStatusCounts()).toEqual({});
    });
  });

  describe("getAllVideos", () => {
    it("returns all videos", () => {
      db.insertVideo({ niche: "tech", title: "V1", scheduledDate: "2026-05-01" });
      db.insertVideo({ niche: "science", title: "V2", scheduledDate: "2026-05-02" });

      const all = db.getAllVideos();
      expect(all).toHaveLength(2);
    });
  });

  describe("hasVideos", () => {
    it("returns false when empty", () => {
      expect(db.hasVideos()).toBe(false);
    });

    it("returns true when videos exist", () => {
      db.insertVideo({ niche: "tech", title: "V1", scheduledDate: "2026-05-01" });
      expect(db.hasVideos()).toBe(true);
    });
  });
});
