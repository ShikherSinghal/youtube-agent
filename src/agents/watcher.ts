import { google } from "googleapis";
import nodemailer from "nodemailer";
import { Database, CommentRow } from "../db.js";

export interface WatcherConfig {
  youtube: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
  };
  gmail: {
    user: string;
    appPassword: string;
  };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export class WatcherAgent {
  constructor(
    private db: Database,
    private config: WatcherConfig
  ) {}

  async pollComments(): Promise<number> {
    const auth = new google.auth.OAuth2(
      this.config.youtube.clientId,
      this.config.youtube.clientSecret
    );
    auth.setCredentials({ refresh_token: this.config.youtube.refreshToken });

    const youtube = google.youtube({ version: "v3", auth });
    const videos = this.db.getUploadedVideos();

    const countBefore = this.db.getUnnotifiedComments().length;

    for (const video of videos) {
      if (!video.youtube_id) continue;

      const response = await youtube.commentThreads.list({
        videoId: video.youtube_id,
        part: ["snippet"],
        maxResults: 100,
      });

      const items = response.data.items ?? [];
      for (const item of items) {
        const snippet = item.snippet?.topLevelComment?.snippet;
        if (!snippet) continue;

        this.db.insertComment({
          videoId: video.id,
          youtubeCommentId: item.id!,
          author: snippet.authorDisplayName ?? "Unknown",
          text: snippet.textDisplay ?? "",
          publishedAt: snippet.publishedAt ?? new Date().toISOString(),
        });
      }
    }

    const countAfter = this.db.getUnnotifiedComments().length;
    return countAfter - countBefore;
  }

  async sendDigest(): Promise<boolean> {
    const comments = this.db.getUnnotifiedComments();
    if (comments.length === 0) return false;

    const html = this.buildDigestHtml(comments);

    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: this.config.gmail.user,
        pass: this.config.gmail.appPassword,
      },
    });

    await transporter.sendMail({
      from: this.config.gmail.user,
      to: this.config.gmail.user,
      subject: `YouTube Comment Digest — ${comments.length} new comment${comments.length !== 1 ? "s" : ""}`,
      html,
    });

    const ids = comments.map((c) => c.id);
    this.db.markCommentsNotified(ids);

    return true;
  }

  buildDigestHtml(comments: CommentRow[]): string {
    const grouped = new Map<string, CommentRow[]>();
    for (const comment of comments) {
      const title = comment.title ?? "Unknown Video";
      if (!grouped.has(title)) {
        grouped.set(title, []);
      }
      grouped.get(title)!.push(comment);
    }

    let html = `<h1>YouTube Comment Digest</h1>`;
    html += `<p>${comments.length} new comment${comments.length !== 1 ? "s" : ""}</p>`;

    for (const [title, videoComments] of grouped) {
      html += `<h2>${escapeHtml(title)}</h2>`;
      html += `<ul>`;
      const displayed = videoComments.slice(0, 5);
      for (const c of displayed) {
        html += `<li><strong>${escapeHtml(c.author)}</strong>: ${escapeHtml(c.text)}</li>`;
      }
      if (videoComments.length > 5) {
        html += `<li><em>...and ${videoComments.length - 5} more</em></li>`;
      }
      html += `</ul>`;
    }

    return html;
  }

  startWatchLoop(
    pollIntervalMs: number,
    digestHour: number
  ): Promise<never> {
    let lastDigestDate = "";

    const tick = async () => {
      try {
        const newCount = await this.pollComments();
        if (newCount > 0) {
          console.log(`Polled ${newCount} new comments`);
        }
      } catch (err) {
        console.error("Poll error:", err);
      }

      const now = new Date();
      const todayStr = now.toISOString().slice(0, 10);
      if (now.getHours() >= digestHour && lastDigestDate !== todayStr) {
        try {
          const sent = await this.sendDigest();
          if (sent) {
            console.log("Digest email sent");
          }
          lastDigestDate = todayStr;
        } catch (err) {
          console.error("Digest error:", err);
        }
      }
    };

    // Run first tick immediately, then poll on interval.
    // Return a promise that never resolves to keep the process alive
    // and prevent the caller from closing the DB.
    return new Promise((_, __) => {
      tick();
      setInterval(tick, pollIntervalMs);
    });
  }
}
