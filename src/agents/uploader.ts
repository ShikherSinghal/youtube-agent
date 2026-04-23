import { google } from "googleapis";
import fs from "fs";
import { Database, type VideoRow } from "../db.js";
import { logger } from "../utils/logger.js";

interface YouTubeCredentials {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

interface UploadResult {
  videoId: number;
  youtubeId: string;
  title: string;
}

export class UploaderAgent {
  constructor(
    private db: Database,
    private credentials: YouTubeCredentials,
  ) {}

  async uploadDue(): Promise<UploadResult[]> {
    const videos = this.db.getVideosDueForUpload();
    logger.info("UploaderAgent", `Found ${videos.length} video(s) due for upload`);

    const results: UploadResult[] = [];

    for (const video of videos) {
      try {
        const youtubeId = await this.uploadOne(video);
        this.db.setYoutubeId(video.id, youtubeId);
        this.db.updateVideoStatus(video.id, "uploaded");
        results.push({
          videoId: video.id,
          youtubeId,
          title: video.title,
        });
        logger.info("UploaderAgent", `Uploaded video ${video.id}: ${video.title}`, { youtubeId });
      } catch (error) {
        logger.error("UploaderAgent", `Failed to upload video ${video.id}: ${video.title}`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return results;
  }

  private async uploadOne(video: VideoRow): Promise<string> {
    if (!video.video_path) {
      throw new Error(`Video ${video.id} has no video_path set`);
    }

    const oauth2Client = new google.auth.OAuth2(
      this.credentials.clientId,
      this.credentials.clientSecret,
    );
    oauth2Client.setCredentials({ refresh_token: this.credentials.refreshToken });

    const youtube = google.youtube({ version: "v3", auth: oauth2Client });

    const hashtags = video.hashtags ? JSON.parse(video.hashtags) as string[] : [];
    const description = [video.description ?? "", ...hashtags].join("\n");
    const tags = video.tags ? video.tags.split(",").map((t) => t.trim()) : [];

    const response = await youtube.videos.insert({
      part: ["snippet", "status"],
      requestBody: {
        snippet: {
          title: video.title,
          description,
          tags,
          categoryId: "22",
        },
        status: {
          privacyStatus: "public",
        },
      },
      media: {
        body: fs.createReadStream(video.video_path),
      },
    });

    const youtubeId = response.data.id;
    if (!youtubeId) {
      throw new Error(`YouTube API did not return a video ID for video ${video.id}`);
    }
    return youtubeId;
  }
}
