import BetterSqlite3 from "better-sqlite3";

export interface VideoRow {
  id: number;
  niche: string;
  title: string;
  description: string | null;
  hashtags: string | null;
  tags: string | null;
  hook: string | null;
  script: string | null;
  thumbnail_text: string | null;
  scheduled_date: string;
  status: string;
  video_path: string | null;
  youtube_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CommentRow {
  id: number;
  video_id: number;
  youtube_comment_id: string;
  author: string;
  text: string;
  published_at: string;
  notified: number;
  created_at: string;
  title?: string;
}

export interface InsertVideoParams {
  niche: string;
  title: string;
  description?: string;
  hashtags?: string[];
  tags?: string;
  hook?: string;
  thumbnailText?: string;
  scheduledDate: string;
}

export interface InsertCommentParams {
  videoId: number;
  youtubeCommentId: string;
  author: string;
  text: string;
  publishedAt: string;
}

export class Database {
  private db: BetterSqlite3.Database;

  constructor(dbPath: string) {
    this.db = new BetterSqlite3(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.init();
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS videos (
        id INTEGER PRIMARY KEY,
        niche TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        hashtags TEXT,
        tags TEXT,
        hook TEXT,
        script TEXT,
        thumbnail_text TEXT,
        scheduled_date DATE NOT NULL,
        status TEXT DEFAULT 'planned',
        video_path TEXT,
        youtube_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS comments (
        id INTEGER PRIMARY KEY,
        video_id INTEGER REFERENCES videos(id),
        youtube_comment_id TEXT UNIQUE,
        author TEXT,
        text TEXT,
        published_at DATETIME,
        notified BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }

  insertVideo(params: InsertVideoParams): number {
    const stmt = this.db.prepare(`
      INSERT INTO videos (niche, title, description, hashtags, tags, hook, thumbnail_text, scheduled_date)
      VALUES (@niche, @title, @description, @hashtags, @tags, @hook, @thumbnailText, @scheduledDate)
    `);
    const result = stmt.run({
      niche: params.niche,
      title: params.title,
      description: params.description ?? null,
      hashtags: params.hashtags ? JSON.stringify(params.hashtags) : null,
      tags: params.tags ?? null,
      hook: params.hook ?? null,
      thumbnailText: params.thumbnailText ?? null,
      scheduledDate: params.scheduledDate,
    });
    return result.lastInsertRowid as number;
  }

  getVideo(id: number): VideoRow | undefined {
    return this.db.prepare("SELECT * FROM videos WHERE id = ?").get(id) as VideoRow | undefined;
  }

  getVideosByStatus(status: string): VideoRow[] {
    return this.db.prepare("SELECT * FROM videos WHERE status = ?").all(status) as VideoRow[];
  }

  getVideosDueForUpload(): VideoRow[] {
    return this.db
      .prepare("SELECT * FROM videos WHERE status = 'rendered' AND scheduled_date <= date('now')")
      .all() as VideoRow[];
  }

  getUploadedVideos(): VideoRow[] {
    return this.db.prepare("SELECT * FROM videos WHERE status = 'uploaded'").all() as VideoRow[];
  }

  updateVideoStatus(id: number, status: string): void {
    this.db
      .prepare("UPDATE videos SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(status, id);
  }

  setVideoPath(id: number, videoPath: string): void {
    this.db
      .prepare("UPDATE videos SET video_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(videoPath, id);
  }

  setVideoScript(id: number, script: string): void {
    this.db
      .prepare("UPDATE videos SET script = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(script, id);
  }

  setYoutubeId(id: number, youtubeId: string): void {
    this.db
      .prepare("UPDATE videos SET youtube_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(youtubeId, id);
  }

  insertComment(params: InsertCommentParams): void {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO comments (video_id, youtube_comment_id, author, text, published_at)
         VALUES (@videoId, @youtubeCommentId, @author, @text, @publishedAt)`
      )
      .run({
        videoId: params.videoId,
        youtubeCommentId: params.youtubeCommentId,
        author: params.author,
        text: params.text,
        publishedAt: params.publishedAt,
      });
  }

  getUnnotifiedComments(): CommentRow[] {
    return this.db
      .prepare(
        `SELECT c.*, v.title
         FROM comments c
         JOIN videos v ON c.video_id = v.id
         WHERE c.notified = 0`
      )
      .all() as CommentRow[];
  }

  markCommentsNotified(ids: number[]): void {
    if (ids.length === 0) return;
    const placeholders = ids.map(() => "?").join(",");
    this.db
      .prepare(`UPDATE comments SET notified = 1 WHERE id IN (${placeholders})`)
      .run(...ids);
  }

  getStatusCounts(): Record<string, number> {
    const rows = this.db
      .prepare("SELECT status, COUNT(*) as count FROM videos GROUP BY status")
      .all() as { status: string; count: number }[];
    const counts: Record<string, number> = {};
    for (const row of rows) {
      counts[row.status] = row.count;
    }
    return counts;
  }

  getAllVideos(): VideoRow[] {
    return this.db.prepare("SELECT * FROM videos").all() as VideoRow[];
  }

  hasVideos(): boolean {
    const row = this.db.prepare("SELECT COUNT(*) as count FROM videos").get() as { count: number };
    return row.count > 0;
  }

  close(): void {
    this.db.close();
  }
}
