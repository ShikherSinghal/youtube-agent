# YouTube Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an automated YouTube channel manager that generates 30-day content plans, creates AI-generated videos with voiceover and captions, uploads to YouTube, monitors comments, and sends daily Gmail digests.

**Architecture:** Node.js/TypeScript CLI orchestrator with SQLite state management spawns Python subprocesses for video generation. Phases run sequentially (Plan → Generate → Upload → Watch) with parallel video generation via worker pool. Ollama (local LLM) powers all AI decisions.

**Tech Stack:** TypeScript (commander, better-sqlite3, googleapis, nodemailer), Python (edge-tts, moviepy, Pillow, requests, diffusers), SQLite, Ollama (Qwen 2.5 7B/14B), FFmpeg, Pollinations.ai

---

## File Map

### Node.js Orchestrator (`src/`)
| File | Responsibility |
|---|---|
| `src/index.ts` | CLI entry point — commander.js commands |
| `src/orchestrator.ts` | Pipeline controller — run, generate, upload sequencing |
| `src/db.ts` | SQLite schema init, typed query helpers for videos/comments tables |
| `src/config.ts` | Load and validate .env, export typed config object |
| `src/agents/planner.ts` | 30-day content plan generation via Ollama 14B |
| `src/agents/uploader.ts` | YouTube Data API v3 upload + OAuth2 token refresh |
| `src/agents/watcher.ts` | Comment polling loop + daily Gmail digest |
| `src/ollama/client.ts` | Ollama HTTP client with heavy/light model routing |
| `src/utils/logger.ts` | Structured console logging with levels |

### Python Video Engine (`video-engine/`)
| File | Responsibility |
|---|---|
| `video-engine/generate.py` | CLI entry — reads SQLite, orchestrates pipeline, writes .mp4 |
| `video-engine/scripts/writer.py` | Narration script + scene breakdown via Ollama 14B |
| `video-engine/scripts/images.py` | Pollinations.ai image gen + SD 1.5 fallback |
| `video-engine/scripts/tts.py` | edge-tts voiceover generation |
| `video-engine/scripts/captions.py` | Script-to-audio timestamp alignment → ASS subtitles |
| `video-engine/scripts/compositor.py` | FFmpeg compositing — images + Ken Burns + audio + captions → .mp4 |

### Tests
| File | Tests For |
|---|---|
| `tests/config.test.ts` | Config loading and validation |
| `tests/db.test.ts` | SQLite schema, CRUD operations |
| `tests/ollama-client.test.ts` | Ollama client routing and error handling |
| `tests/planner.test.ts` | Planner agent prompt construction and DB insertion |
| `tests/uploader.test.ts` | YouTube upload flow and status transitions |
| `tests/watcher.test.ts` | Comment polling, digest email construction |
| `video-engine/tests/test_writer.py` | Script generation and scene parsing |
| `video-engine/tests/test_images.py` | Image generation and fallback |
| `video-engine/tests/test_tts.py` | TTS audio generation |
| `video-engine/tests/test_captions.py` | Caption timestamp alignment |
| `video-engine/tests/test_compositor.py` | FFmpeg compositing pipeline |

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.env.example`
- Create: `video-engine/requirements.txt`
- Create: `src/utils/logger.ts`

- [ ] **Step 1: Initialize Node.js project**

```bash
cd /Users/shikher.s/youtube-agent
npm init -y
```

- [ ] **Step 2: Install Node.js dependencies**

```bash
npm install commander better-sqlite3 googleapis nodemailer dotenv
npm install -D typescript @types/node @types/better-sqlite3 @types/nodemailer vitest
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 4: Add scripts to package.json**

Add to `package.json`:
```json
{
  "type": "module",
  "bin": {
    "youtube-agent": "./dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 5: Create .env.example**

```
# YouTube OAuth2 Credentials
YOUTUBE_CLIENT_ID=
YOUTUBE_CLIENT_SECRET=
YOUTUBE_REFRESH_TOKEN=

# Gmail (for comment digest notifications)
GMAIL_USER=you@gmail.com
GMAIL_APP_PASSWORD=

# Content Niches (comma-separated)
NICHES=tech facts,space exploration,ancient history,psychology

# Ollama
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL_HEAVY=qwen2.5:14b
OLLAMA_MODEL_LIGHT=qwen2.5:7b

# Video Settings
VIDEO_DURATION_SECS=210
VIDEO_WORKERS=2
IMAGES_PER_VIDEO=8

# Comment Watcher
COMMENT_POLL_INTERVAL_MS=1800000
DIGEST_HOUR=9
```

- [ ] **Step 6: Create Python requirements.txt**

Write to `video-engine/requirements.txt`:
```
edge-tts>=6.1.0
Pillow>=10.0.0
requests>=2.31.0
moviepy>=1.0.3
ffmpeg-python>=0.2.0
ollama>=0.3.0
diffusers>=0.27.0
torch --index-url https://download.pytorch.org/whl/cpu
accelerate>=0.27.0
```

- [ ] **Step 7: Create logger utility**

Write to `src/utils/logger.ts`:
```typescript
type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: "\x1b[90m",
  info: "\x1b[36m",
  warn: "\x1b[33m",
  error: "\x1b[31m",
};

const RESET = "\x1b[0m";

let currentLevel: LogLevel = "info";

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

export function log(level: LogLevel, component: string, message: string, data?: Record<string, unknown>): void {
  if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[currentLevel]) return;
  const timestamp = new Date().toISOString();
  const color = LEVEL_COLORS[level];
  const prefix = `${color}[${timestamp}] [${level.toUpperCase()}] [${component}]${RESET}`;
  if (data) {
    console.log(`${prefix} ${message}`, JSON.stringify(data));
  } else {
    console.log(`${prefix} ${message}`);
  }
}

export const logger = {
  debug: (component: string, msg: string, data?: Record<string, unknown>) => log("debug", component, msg, data),
  info: (component: string, msg: string, data?: Record<string, unknown>) => log("info", component, msg, data),
  warn: (component: string, msg: string, data?: Record<string, unknown>) => log("warn", component, msg, data),
  error: (component: string, msg: string, data?: Record<string, unknown>) => log("error", component, msg, data),
};
```

- [ ] **Step 8: Create directories**

```bash
mkdir -p src/agents src/ollama src/utils tests video-engine/scripts video-engine/assets/music video-engine/tests data output/videos
```

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: scaffold project with Node.js + Python structure"
```

---

## Task 2: Config Loading

**Files:**
- Create: `src/config.ts`
- Create: `tests/config.test.ts`

- [ ] **Step 1: Write the failing test**

Write to `tests/config.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadConfig, type Config } from "../src/config.js";

describe("loadConfig", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("loads all config values from env", () => {
    process.env.YOUTUBE_CLIENT_ID = "test-client-id";
    process.env.YOUTUBE_CLIENT_SECRET = "test-secret";
    process.env.YOUTUBE_REFRESH_TOKEN = "test-token";
    process.env.GMAIL_USER = "test@gmail.com";
    process.env.GMAIL_APP_PASSWORD = "test-pass";
    process.env.NICHES = "tech,science,history";
    process.env.OLLAMA_HOST = "http://localhost:11434";
    process.env.OLLAMA_MODEL_HEAVY = "qwen2.5:14b";
    process.env.OLLAMA_MODEL_LIGHT = "qwen2.5:7b";
    process.env.VIDEO_DURATION_SECS = "210";
    process.env.VIDEO_WORKERS = "2";
    process.env.IMAGES_PER_VIDEO = "8";
    process.env.COMMENT_POLL_INTERVAL_MS = "1800000";
    process.env.DIGEST_HOUR = "9";

    const config = loadConfig();
    expect(config.youtube.clientId).toBe("test-client-id");
    expect(config.youtube.clientSecret).toBe("test-secret");
    expect(config.youtube.refreshToken).toBe("test-token");
    expect(config.gmail.user).toBe("test@gmail.com");
    expect(config.gmail.appPassword).toBe("test-pass");
    expect(config.niches).toEqual(["tech", "science", "history"]);
    expect(config.ollama.host).toBe("http://localhost:11434");
    expect(config.ollama.heavyModel).toBe("qwen2.5:14b");
    expect(config.ollama.lightModel).toBe("qwen2.5:7b");
    expect(config.video.durationSecs).toBe(210);
    expect(config.video.workers).toBe(2);
    expect(config.video.imagesPerVideo).toBe(8);
    expect(config.watcher.pollIntervalMs).toBe(1800000);
    expect(config.watcher.digestHour).toBe(9);
  });

  it("throws on missing required NICHES", () => {
    process.env.YOUTUBE_CLIENT_ID = "x";
    process.env.YOUTUBE_CLIENT_SECRET = "x";
    process.env.YOUTUBE_REFRESH_TOKEN = "x";
    process.env.GMAIL_USER = "x";
    process.env.GMAIL_APP_PASSWORD = "x";
    process.env.OLLAMA_HOST = "http://localhost:11434";

    expect(() => loadConfig()).toThrow("NICHES");
  });

  it("uses defaults for optional values", () => {
    process.env.YOUTUBE_CLIENT_ID = "x";
    process.env.YOUTUBE_CLIENT_SECRET = "x";
    process.env.YOUTUBE_REFRESH_TOKEN = "x";
    process.env.GMAIL_USER = "x";
    process.env.GMAIL_APP_PASSWORD = "x";
    process.env.NICHES = "tech";

    const config = loadConfig();
    expect(config.ollama.host).toBe("http://localhost:11434");
    expect(config.ollama.heavyModel).toBe("qwen2.5:14b");
    expect(config.ollama.lightModel).toBe("qwen2.5:7b");
    expect(config.video.durationSecs).toBe(210);
    expect(config.video.workers).toBe(2);
    expect(config.video.imagesPerVideo).toBe(8);
    expect(config.watcher.pollIntervalMs).toBe(1800000);
    expect(config.watcher.digestHour).toBe(9);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/config.test.ts`
Expected: FAIL — cannot find module `../src/config.js`

- [ ] **Step 3: Write implementation**

Write to `src/config.ts`:
```typescript
export interface Config {
  youtube: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
  };
  gmail: {
    user: string;
    appPassword: string;
  };
  niches: string[];
  ollama: {
    host: string;
    heavyModel: string;
    lightModel: string;
  };
  video: {
    durationSecs: number;
    workers: number;
    imagesPerVideo: number;
  };
  watcher: {
    pollIntervalMs: number;
    digestHour: number;
  };
}

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env var: ${key}`);
  return value;
}

function optionalEnv(key: string, fallback: string): string {
  return process.env[key] || fallback;
}

export function loadConfig(): Config {
  return {
    youtube: {
      clientId: requireEnv("YOUTUBE_CLIENT_ID"),
      clientSecret: requireEnv("YOUTUBE_CLIENT_SECRET"),
      refreshToken: requireEnv("YOUTUBE_REFRESH_TOKEN"),
    },
    gmail: {
      user: requireEnv("GMAIL_USER"),
      appPassword: requireEnv("GMAIL_APP_PASSWORD"),
    },
    niches: requireEnv("NICHES").split(",").map((n) => n.trim()),
    ollama: {
      host: optionalEnv("OLLAMA_HOST", "http://localhost:11434"),
      heavyModel: optionalEnv("OLLAMA_MODEL_HEAVY", "qwen2.5:14b"),
      lightModel: optionalEnv("OLLAMA_MODEL_LIGHT", "qwen2.5:7b"),
    },
    video: {
      durationSecs: parseInt(optionalEnv("VIDEO_DURATION_SECS", "210"), 10),
      workers: parseInt(optionalEnv("VIDEO_WORKERS", "2"), 10),
      imagesPerVideo: parseInt(optionalEnv("IMAGES_PER_VIDEO", "8"), 10),
    },
    watcher: {
      pollIntervalMs: parseInt(optionalEnv("COMMENT_POLL_INTERVAL_MS", "1800000"), 10),
      digestHour: parseInt(optionalEnv("DIGEST_HOUR", "9"), 10),
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/config.test.ts`
Expected: PASS — all 3 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/config.ts tests/config.test.ts
git commit -m "feat: add config loading with env validation and defaults"
```

---

## Task 3: SQLite Database Layer

**Files:**
- Create: `src/db.ts`
- Create: `tests/db.test.ts`

- [ ] **Step 1: Write the failing test**

Write to `tests/db.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Database } from "../src/db.js";
import fs from "fs";
import path from "path";

const TEST_DB = path.join(import.meta.dirname, "test.db");

describe("Database", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(TEST_DB);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  describe("videos", () => {
    it("inserts and retrieves a video plan", () => {
      const id = db.insertVideo({
        niche: "tech",
        title: "Test Video",
        description: "A test",
        hashtags: ["#tech", "#test"],
        tags: ["tech", "test"],
        hook: "Did you know?",
        thumbnailText: "MIND BLOWN",
        scheduledDate: "2026-05-01",
      });

      const video = db.getVideo(id);
      expect(video).toBeDefined();
      expect(video!.title).toBe("Test Video");
      expect(video!.niche).toBe("tech");
      expect(video!.status).toBe("planned");
      expect(JSON.parse(video!.hashtags!)).toEqual(["#tech", "#test"]);
    });

    it("updates video status", () => {
      const id = db.insertVideo({
        niche: "tech",
        title: "Test",
        scheduledDate: "2026-05-01",
      });

      db.updateVideoStatus(id, "scripted");
      expect(db.getVideo(id)!.status).toBe("scripted");

      db.updateVideoStatus(id, "generating");
      expect(db.getVideo(id)!.status).toBe("generating");
    });

    it("gets videos by status", () => {
      db.insertVideo({ niche: "tech", title: "A", scheduledDate: "2026-05-01" });
      db.insertVideo({ niche: "tech", title: "B", scheduledDate: "2026-05-02" });
      db.insertVideo({ niche: "science", title: "C", scheduledDate: "2026-05-03" });

      const planned = db.getVideosByStatus("planned");
      expect(planned).toHaveLength(3);
    });

    it("gets videos due for upload", () => {
      const id1 = db.insertVideo({ niche: "tech", title: "A", scheduledDate: "2020-01-01" });
      const id2 = db.insertVideo({ niche: "tech", title: "B", scheduledDate: "2099-01-01" });
      db.updateVideoStatus(id1, "rendered");
      db.updateVideoStatus(id2, "rendered");

      const due = db.getVideosDueForUpload();
      expect(due).toHaveLength(1);
      expect(due[0].title).toBe("A");
    });

    it("sets video path", () => {
      const id = db.insertVideo({ niche: "tech", title: "A", scheduledDate: "2026-05-01" });
      db.setVideoPath(id, "/output/videos/1.mp4");
      expect(db.getVideo(id)!.video_path).toBe("/output/videos/1.mp4");
    });

    it("sets youtube id", () => {
      const id = db.insertVideo({ niche: "tech", title: "A", scheduledDate: "2026-05-01" });
      db.setYoutubeId(id, "abc123");
      expect(db.getVideo(id)!.youtube_id).toBe("abc123");
    });

    it("sets script on video", () => {
      const id = db.insertVideo({ niche: "tech", title: "A", scheduledDate: "2026-05-01" });
      db.setVideoScript(id, "This is the narration script.");
      expect(db.getVideo(id)!.script).toBe("This is the narration script.");
    });
  });

  describe("comments", () => {
    it("inserts and retrieves comments", () => {
      const videoId = db.insertVideo({ niche: "tech", title: "A", scheduledDate: "2026-05-01" });

      db.insertComment({
        videoId,
        youtubeCommentId: "yt-123",
        author: "User1",
        text: "Great video!",
        publishedAt: "2026-05-01T12:00:00Z",
      });

      const comments = db.getUnnotifiedComments();
      expect(comments).toHaveLength(1);
      expect(comments[0].author).toBe("User1");
      expect(comments[0].text).toBe("Great video!");
    });

    it("marks comments as notified", () => {
      const videoId = db.insertVideo({ niche: "tech", title: "A", scheduledDate: "2026-05-01" });
      db.insertComment({
        videoId,
        youtubeCommentId: "yt-456",
        author: "User2",
        text: "Nice",
        publishedAt: "2026-05-01T12:00:00Z",
      });

      db.markCommentsNotified([1]);
      expect(db.getUnnotifiedComments()).toHaveLength(0);
    });

    it("deduplicates by youtube_comment_id", () => {
      const videoId = db.insertVideo({ niche: "tech", title: "A", scheduledDate: "2026-05-01" });
      db.insertComment({ videoId, youtubeCommentId: "yt-dup", author: "A", text: "Hi", publishedAt: "2026-05-01T12:00:00Z" });
      db.insertComment({ videoId, youtubeCommentId: "yt-dup", author: "A", text: "Hi", publishedAt: "2026-05-01T12:00:00Z" });

      const comments = db.getUnnotifiedComments();
      expect(comments).toHaveLength(1);
    });
  });

  describe("status dashboard", () => {
    it("returns count per status", () => {
      db.insertVideo({ niche: "tech", title: "A", scheduledDate: "2026-05-01" });
      db.insertVideo({ niche: "tech", title: "B", scheduledDate: "2026-05-02" });
      const id3 = db.insertVideo({ niche: "science", title: "C", scheduledDate: "2026-05-03" });
      db.updateVideoStatus(id3, "rendered");

      const counts = db.getStatusCounts();
      expect(counts.planned).toBe(2);
      expect(counts.rendered).toBe(1);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/db.test.ts`
Expected: FAIL — cannot find module `../src/db.js`

- [ ] **Step 3: Write implementation**

Write to `src/db.ts`:
```typescript
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
  tags?: string[];
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
        id              INTEGER PRIMARY KEY,
        niche           TEXT NOT NULL,
        title           TEXT NOT NULL,
        description     TEXT,
        hashtags        TEXT,
        tags            TEXT,
        hook            TEXT,
        script          TEXT,
        thumbnail_text  TEXT,
        scheduled_date  DATE NOT NULL,
        status          TEXT DEFAULT 'planned',
        video_path      TEXT,
        youtube_id      TEXT,
        created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS comments (
        id                   INTEGER PRIMARY KEY,
        video_id             INTEGER REFERENCES videos(id),
        youtube_comment_id   TEXT UNIQUE,
        author               TEXT,
        text                 TEXT,
        published_at         DATETIME,
        notified             BOOLEAN DEFAULT 0,
        created_at           DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }

  insertVideo(params: InsertVideoParams): number {
    const stmt = this.db.prepare(`
      INSERT INTO videos (niche, title, description, hashtags, tags, hook, thumbnail_text, scheduled_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      params.niche,
      params.title,
      params.description ?? null,
      params.hashtags ? JSON.stringify(params.hashtags) : null,
      params.tags ? JSON.stringify(params.tags) : null,
      params.hook ?? null,
      params.thumbnailText ?? null,
      params.scheduledDate,
    );
    return result.lastInsertRowid as number;
  }

  getVideo(id: number): VideoRow | undefined {
    return this.db.prepare("SELECT * FROM videos WHERE id = ?").get(id) as VideoRow | undefined;
  }

  getVideosByStatus(status: string): VideoRow[] {
    return this.db.prepare("SELECT * FROM videos WHERE status = ? ORDER BY scheduled_date").all(status) as VideoRow[];
  }

  getVideosDueForUpload(): VideoRow[] {
    return this.db.prepare(
      "SELECT * FROM videos WHERE status = 'rendered' AND scheduled_date <= date('now') ORDER BY scheduled_date",
    ).all() as VideoRow[];
  }

  getUploadedVideos(): VideoRow[] {
    return this.db.prepare("SELECT * FROM videos WHERE status = 'uploaded' AND youtube_id IS NOT NULL").all() as VideoRow[];
  }

  updateVideoStatus(id: number, status: string): void {
    this.db.prepare("UPDATE videos SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(status, id);
  }

  setVideoPath(id: number, videoPath: string): void {
    this.db.prepare("UPDATE videos SET video_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(videoPath, id);
  }

  setVideoScript(id: number, script: string): void {
    this.db.prepare("UPDATE videos SET script = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(script, id);
  }

  setYoutubeId(id: number, youtubeId: string): void {
    this.db.prepare("UPDATE videos SET youtube_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(youtubeId, id);
  }

  insertComment(params: InsertCommentParams): void {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO comments (video_id, youtube_comment_id, author, text, published_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(params.videoId, params.youtubeCommentId, params.author, params.text, params.publishedAt);
  }

  getUnnotifiedComments(): CommentRow[] {
    return this.db.prepare(`
      SELECT c.*, v.title FROM comments c
      JOIN videos v ON c.video_id = v.id
      WHERE c.notified = 0
      ORDER BY c.published_at
    `).all() as CommentRow[];
  }

  markCommentsNotified(ids: number[]): void {
    const placeholders = ids.map(() => "?").join(",");
    this.db.prepare(`UPDATE comments SET notified = 1 WHERE id IN (${placeholders})`).run(...ids);
  }

  getStatusCounts(): Record<string, number> {
    const rows = this.db.prepare("SELECT status, COUNT(*) as count FROM videos GROUP BY status").all() as Array<{ status: string; count: number }>;
    const counts: Record<string, number> = { planned: 0, scripted: 0, generating: 0, rendered: 0, uploaded: 0 };
    for (const row of rows) {
      counts[row.status] = row.count;
    }
    return counts;
  }

  getAllVideos(): VideoRow[] {
    return this.db.prepare("SELECT * FROM videos ORDER BY scheduled_date").all() as VideoRow[];
  }

  hasVideos(): boolean {
    const row = this.db.prepare("SELECT COUNT(*) as count FROM videos").get() as { count: number };
    return row.count > 0;
  }

  close(): void {
    this.db.close();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/db.test.ts`
Expected: PASS — all tests pass

- [ ] **Step 5: Commit**

```bash
git add src/db.ts tests/db.test.ts
git commit -m "feat: add SQLite database layer with videos and comments tables"
```

---

## Task 4: Ollama Client

**Files:**
- Create: `src/ollama/client.ts`
- Create: `tests/ollama-client.test.ts`

- [ ] **Step 1: Write the failing test**

Write to `tests/ollama-client.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { OllamaClient } from "../src/ollama/client.js";

// Mock global fetch
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
      json: async () => ({
        message: { content: '{"title":"Test"}' },
      }),
    });

    const result = await client.generateJSON("heavy", "Generate a title", { title: "string" });
    expect(result).toEqual({ title: "Test" });

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:11434/api/chat",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("qwen2.5:14b"),
      }),
    );
  });

  it("sends prompt to light model for text", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        message: { content: "Hello world" },
      }),
    });

    const result = await client.generateText("light", "Say hello");
    expect(result).toBe("Hello world");

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:11434/api/chat",
      expect.objectContaining({
        body: expect.stringContaining("qwen2.5:7b"),
      }),
    );
  });

  it("throws on non-OK response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    });

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ollama-client.test.ts`
Expected: FAIL — cannot find module

- [ ] **Step 3: Write implementation**

Write to `src/ollama/client.ts`:
```typescript
type ModelTier = "heavy" | "light";

export interface OllamaConfig {
  host: string;
  heavyModel: string;
  lightModel: string;
}

export class OllamaClient {
  private config: OllamaConfig;

  constructor(config: OllamaConfig) {
    this.config = config;
  }

  private getModel(tier: ModelTier): string {
    return tier === "heavy" ? this.config.heavyModel : this.config.lightModel;
  }

  async generateText(tier: ModelTier, prompt: string, systemPrompt?: string): Promise<string> {
    const messages = [];
    if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
    messages.push({ role: "user", content: prompt });

    const response = await fetch(`${this.config.host}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.getModel(tier),
        messages,
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama request failed: ${response.status}`);
    }

    const data = await response.json();
    return data.message.content;
  }

  async generateJSON<T = unknown>(tier: ModelTier, prompt: string, _schema?: Record<string, string>): Promise<T> {
    const systemPrompt = "You are a JSON generator. Respond ONLY with valid JSON. No markdown, no explanation, no code fences.";
    const text = await this.generateText(tier, prompt, systemPrompt);

    // Extract JSON from response — handle cases where LLM wraps in code fences
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, text];
    const jsonStr = jsonMatch[1]!.trim();

    return JSON.parse(jsonStr) as T;
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/ollama-client.test.ts`
Expected: PASS — all 5 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/ollama/client.ts tests/ollama-client.test.ts
git commit -m "feat: add Ollama client with heavy/light model routing"
```

---

## Task 5: Planner Agent

**Files:**
- Create: `src/agents/planner.ts`
- Create: `tests/planner.test.ts`

- [ ] **Step 1: Write the failing test**

Write to `tests/planner.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PlannerAgent } from "../src/agents/planner.js";
import { Database } from "../src/db.js";
import { OllamaClient } from "../src/ollama/client.js";
import fs from "fs";
import path from "path";

const TEST_DB = path.join(import.meta.dirname, "planner-test.db");

describe("PlannerAgent", () => {
  let db: Database;
  let mockOllama: OllamaClient;
  let planner: PlannerAgent;

  beforeEach(() => {
    db = new Database(TEST_DB);

    mockOllama = {
      generateJSON: vi.fn(),
      generateText: vi.fn(),
      isHealthy: vi.fn().mockResolvedValue(true),
    } as unknown as OllamaClient;

    planner = new PlannerAgent(db, mockOllama);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it("generates a 30-day plan and inserts videos into DB", async () => {
    const niches = ["tech", "science"];

    // Mock distribution response
    vi.mocked(mockOllama.generateJSON).mockResolvedValueOnce({
      distribution: { tech: 16, science: 14 },
    });

    // Mock video ideas for tech (16 videos)
    vi.mocked(mockOllama.generateJSON).mockResolvedValueOnce({
      videos: Array.from({ length: 16 }, (_, i) => ({
        title: `Tech Video ${i + 1}`,
        hook: `Tech hook ${i + 1}`,
        description: `Tech desc ${i + 1}`,
        hashtags: ["#tech"],
        tags: ["tech"],
        thumbnailText: `TECH ${i + 1}`,
      })),
    });

    // Mock video ideas for science (14 videos)
    vi.mocked(mockOllama.generateJSON).mockResolvedValueOnce({
      videos: Array.from({ length: 14 }, (_, i) => ({
        title: `Science Video ${i + 1}`,
        hook: `Science hook ${i + 1}`,
        description: `Science desc ${i + 1}`,
        hashtags: ["#science"],
        tags: ["science"],
        thumbnailText: `SCIENCE ${i + 1}`,
      })),
    });

    await planner.generatePlan(niches);

    const allVideos = db.getAllVideos();
    expect(allVideos).toHaveLength(30);
    expect(allVideos.every((v) => v.status === "planned")).toBe(true);
    expect(allVideos.every((v) => v.scheduled_date !== null)).toBe(true);

    // Check niches are distributed
    const techCount = allVideos.filter((v) => v.niche === "tech").length;
    const scienceCount = allVideos.filter((v) => v.niche === "science").length;
    expect(techCount).toBe(16);
    expect(scienceCount).toBe(14);
  });

  it("assigns unique scheduled dates across 30 days", async () => {
    const niches = ["tech"];

    vi.mocked(mockOllama.generateJSON).mockResolvedValueOnce({
      distribution: { tech: 30 },
    });

    vi.mocked(mockOllama.generateJSON).mockResolvedValueOnce({
      videos: Array.from({ length: 30 }, (_, i) => ({
        title: `Video ${i + 1}`,
        hook: `Hook ${i + 1}`,
        description: `Desc ${i + 1}`,
        hashtags: ["#tech"],
        tags: ["tech"],
        thumbnailText: `TEXT ${i + 1}`,
      })),
    });

    await planner.generatePlan(niches);

    const dates = db.getAllVideos().map((v) => v.scheduled_date);
    const uniqueDates = new Set(dates);
    expect(uniqueDates.size).toBe(30);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/planner.test.ts`
Expected: FAIL — cannot find module

- [ ] **Step 3: Write implementation**

Write to `src/agents/planner.ts`:
```typescript
import { Database } from "../db.js";
import { OllamaClient } from "../ollama/client.js";
import { logger } from "../utils/logger.js";

interface DistributionResponse {
  distribution: Record<string, number>;
}

interface VideoIdea {
  title: string;
  hook: string;
  description: string;
  hashtags: string[];
  tags: string[];
  thumbnailText: string;
}

interface VideoIdeasResponse {
  videos: VideoIdea[];
}

export class PlannerAgent {
  private db: Database;
  private ollama: OllamaClient;

  constructor(db: Database, ollama: OllamaClient) {
    this.db = db;
    this.ollama = ollama;
  }

  async generatePlan(niches: string[]): Promise<void> {
    logger.info("planner", `Generating 30-day plan for niches: ${niches.join(", ")}`);

    // Step 1: Get AI-decided distribution
    const distribution = await this.getDistribution(niches);
    logger.info("planner", "Distribution decided", distribution);

    // Step 2: Generate video ideas per niche
    const allVideos: Array<VideoIdea & { niche: string }> = [];
    for (const [niche, count] of Object.entries(distribution)) {
      const ideas = await this.getVideoIdeas(niche, count);
      for (const idea of ideas) {
        allVideos.push({ ...idea, niche });
      }
    }

    // Step 3: Assign scheduled dates (one per day, interleave niches)
    const startDate = new Date();
    startDate.setDate(startDate.getDate() + 1); // Start tomorrow

    // Shuffle to interleave niches
    const shuffled = this.interleaveByNiche(allVideos);

    for (let i = 0; i < shuffled.length; i++) {
      const video = shuffled[i];
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      const dateStr = date.toISOString().split("T")[0];

      this.db.insertVideo({
        niche: video.niche,
        title: video.title,
        description: video.description,
        hashtags: video.hashtags,
        tags: video.tags,
        hook: video.hook,
        thumbnailText: video.thumbnailText,
        scheduledDate: dateStr,
      });
    }

    logger.info("planner", `Plan created: ${shuffled.length} videos across 30 days`);
  }

  private async getDistribution(niches: string[]): Promise<Record<string, number>> {
    const prompt = `You are a YouTube content strategist. Given these niches: ${niches.join(", ")}

Decide how to distribute exactly 30 videos across these niches over a 30-day period. Consider which niches have more content potential and audience appeal.

Respond with JSON: {"distribution": {"niche_name": number_of_videos, ...}}
The numbers MUST add up to exactly 30.`;

    const result = await this.ollama.generateJSON<DistributionResponse>("heavy", prompt);

    // Validate total is 30
    const total = Object.values(result.distribution).reduce((sum, n) => sum + n, 0);
    if (total !== 30) {
      // Adjust the first niche to make it exactly 30
      const firstNiche = Object.keys(result.distribution)[0];
      result.distribution[firstNiche] += 30 - total;
    }

    return result.distribution;
  }

  private async getVideoIdeas(niche: string, count: number): Promise<VideoIdea[]> {
    const prompt = `You are a YouTube content creator specializing in "${niche}" short-form content (3-4 minute videos).

Generate exactly ${count} unique, engaging video ideas. Each video should be attention-grabbing and suitable for a faceless YouTube channel.

Respond with JSON:
{
  "videos": [
    {
      "title": "catchy title under 60 chars",
      "hook": "opening line that hooks viewers in first 5 seconds",
      "description": "YouTube description 2-3 sentences",
      "hashtags": ["#relevant", "#hashtags", "#max6"],
      "tags": ["search", "tags", "for", "youtube"],
      "thumbnailText": "SHORT BOLD TEXT FOR THUMBNAIL"
    }
  ]
}

Generate exactly ${count} videos.`;

    const result = await this.ollama.generateJSON<VideoIdeasResponse>("heavy", prompt);
    logger.info("planner", `Generated ${result.videos.length} ideas for "${niche}"`);
    return result.videos.slice(0, count);
  }

  private interleaveByNiche<T extends { niche: string }>(videos: T[]): T[] {
    const byNiche = new Map<string, T[]>();
    for (const v of videos) {
      const arr = byNiche.get(v.niche) || [];
      arr.push(v);
      byNiche.set(v.niche, arr);
    }

    const result: T[] = [];
    const niches = [...byNiche.keys()];
    let added = true;
    let round = 0;

    while (added) {
      added = false;
      for (const niche of niches) {
        const arr = byNiche.get(niche)!;
        if (round < arr.length) {
          result.push(arr[round]);
          added = true;
        }
      }
      round++;
    }

    return result;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/planner.test.ts`
Expected: PASS — all tests pass

- [ ] **Step 5: Commit**

```bash
git add src/agents/planner.ts tests/planner.test.ts
git commit -m "feat: add planner agent for 30-day content plan generation"
```

---

## Task 6: Python Video Engine — Script Writer

**Files:**
- Create: `video-engine/scripts/__init__.py`
- Create: `video-engine/scripts/writer.py`
- Create: `video-engine/tests/__init__.py`
- Create: `video-engine/tests/test_writer.py`

- [ ] **Step 1: Create Python package init files**

Write empty `video-engine/scripts/__init__.py` and `video-engine/tests/__init__.py`.

- [ ] **Step 2: Write the failing test**

Write to `video-engine/tests/test_writer.py`:
```python
import json
import pytest
from unittest.mock import patch, MagicMock
from scripts.writer import ScriptWriter


class TestScriptWriter:
    def setup_method(self):
        self.writer = ScriptWriter(
            ollama_host="http://localhost:11434",
            model="qwen2.5:14b"
        )

    @patch("scripts.writer.requests.post")
    def test_generates_script_with_scenes(self, mock_post):
        mock_response = MagicMock()
        mock_response.ok = True
        mock_response.json.return_value = {
            "message": {
                "content": json.dumps({
                    "narration": "Full narration text here for the video.",
                    "scenes": [
                        {"scene": "hook", "text": "Did you know?", "image_prompt": "dramatic space image"},
                        {"scene": "scene_1", "text": "First point.", "image_prompt": "planet earth from space"},
                        {"scene": "scene_2", "text": "Second point.", "image_prompt": "galaxy formation"},
                        {"scene": "scene_3", "text": "Third point.", "image_prompt": "nebula colors"},
                        {"scene": "scene_4", "text": "Fourth point.", "image_prompt": "black hole"},
                        {"scene": "scene_5", "text": "Fifth point.", "image_prompt": "astronaut floating"},
                        {"scene": "scene_6", "text": "Sixth point.", "image_prompt": "mars surface"},
                        {"scene": "outro", "text": "Subscribe for more!", "image_prompt": "subscribe button graphic"},
                    ]
                })
            }
        }
        mock_post.return_value = mock_response

        result = self.writer.generate(
            title="Space Facts That Will Blow Your Mind",
            hook="Did you know that space is completely silent?",
            niche="space"
        )

        assert result["narration"] is not None
        assert len(result["scenes"]) == 8
        assert result["scenes"][0]["scene"] == "hook"
        assert result["scenes"][-1]["scene"] == "outro"
        assert all("image_prompt" in s for s in result["scenes"])
        assert all("text" in s for s in result["scenes"])

    @patch("scripts.writer.requests.post")
    def test_handles_code_fenced_response(self, mock_post):
        mock_response = MagicMock()
        mock_response.ok = True
        mock_response.json.return_value = {
            "message": {
                "content": '```json\n{"narration":"test","scenes":[{"scene":"hook","text":"hi","image_prompt":"img"}]}\n```'
            }
        }
        mock_post.return_value = mock_response

        result = self.writer.generate(title="Test", hook="Test hook", niche="test")
        assert result["narration"] == "test"

    @patch("scripts.writer.requests.post")
    def test_raises_on_api_error(self, mock_post):
        mock_response = MagicMock()
        mock_response.ok = False
        mock_response.status_code = 500
        mock_response.text = "Internal Server Error"
        mock_post.return_value = mock_response

        with pytest.raises(RuntimeError, match="Ollama request failed"):
            self.writer.generate(title="Test", hook="Hook", niche="test")
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd /Users/shikher.s/youtube-agent && python -m pytest video-engine/tests/test_writer.py -v`
Expected: FAIL — ModuleNotFoundError

- [ ] **Step 4: Write implementation**

Write to `video-engine/scripts/writer.py`:
```python
import json
import re
import requests


class ScriptWriter:
    def __init__(self, ollama_host: str, model: str):
        self.ollama_host = ollama_host
        self.model = model

    def generate(self, title: str, hook: str, niche: str) -> dict:
        prompt = f"""You are a YouTube script writer for a faceless channel about "{niche}".

Write a narration script for a 3-4 minute video.
Title: "{title}"
Opening hook: "{hook}"

Structure the script as exactly 8 scenes:
- hook: attention-grabbing opening (~15 seconds of speech)
- scene_1 through scene_6: main content (~25 seconds of speech each)
- outro: call to action — subscribe, like, comment (~15 seconds of speech)

For each scene, provide:
- "text": the narration text to be spoken
- "image_prompt": a detailed prompt for AI image generation that matches the narration

Respond ONLY with JSON:
{{
  "narration": "the complete narration as one string",
  "scenes": [
    {{"scene": "hook", "text": "...", "image_prompt": "..."}},
    {{"scene": "scene_1", "text": "...", "image_prompt": "..."}},
    {{"scene": "scene_2", "text": "...", "image_prompt": "..."}},
    {{"scene": "scene_3", "text": "...", "image_prompt": "..."}},
    {{"scene": "scene_4", "text": "...", "image_prompt": "..."}},
    {{"scene": "scene_5", "text": "...", "image_prompt": "..."}},
    {{"scene": "scene_6", "text": "...", "image_prompt": "..."}},
    {{"scene": "outro", "text": "...", "image_prompt": "..."}}
  ]
}}"""

        response = requests.post(
            f"{self.ollama_host}/api/chat",
            json={
                "model": self.model,
                "messages": [
                    {"role": "system", "content": "You are a JSON generator. Respond ONLY with valid JSON."},
                    {"role": "user", "content": prompt},
                ],
                "stream": False,
            },
        )

        if not response.ok:
            raise RuntimeError(f"Ollama request failed: {response.status_code} — {response.text}")

        content = response.json()["message"]["content"]
        return self._parse_json(content)

    def _parse_json(self, text: str) -> dict:
        # Strip code fences if present
        match = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
        if match:
            text = match.group(1)
        return json.loads(text.strip())
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /Users/shikher.s/youtube-agent && python -m pytest video-engine/tests/test_writer.py -v`
Expected: PASS — all 3 tests pass

- [ ] **Step 6: Commit**

```bash
git add video-engine/scripts/ video-engine/tests/
git commit -m "feat: add script writer for video narration generation"
```

---

## Task 7: Python Video Engine — Image Generator

**Files:**
- Create: `video-engine/scripts/images.py`
- Create: `video-engine/tests/test_images.py`

- [ ] **Step 1: Write the failing test**

Write to `video-engine/tests/test_images.py`:
```python
import os
import pytest
from unittest.mock import patch, MagicMock
from scripts.images import ImageGenerator


class TestImageGenerator:
    def setup_method(self):
        self.gen = ImageGenerator(output_dir="/tmp/test-images")

    @patch("scripts.images.requests.get")
    def test_generates_image_via_pollinations(self, mock_get):
        mock_response = MagicMock()
        mock_response.ok = True
        mock_response.content = b"\x89PNG\r\n\x1a\n"  # PNG magic bytes
        mock_get.return_value = mock_response

        path = self.gen.generate_image("a beautiful sunset over ocean", "scene_1")

        assert path.endswith("scene_1.png")
        mock_get.assert_called_once()
        call_url = mock_get.call_args[0][0]
        assert "pollinations.ai" in call_url

    @patch("scripts.images.requests.get")
    def test_saves_image_to_correct_path(self, mock_get):
        mock_response = MagicMock()
        mock_response.ok = True
        mock_response.content = b"\x89PNG\r\n\x1a\n"
        mock_get.return_value = mock_response

        path = self.gen.generate_image("test prompt", "hook")
        assert path == "/tmp/test-images/hook.png"

    @patch("scripts.images.requests.get")
    def test_retries_on_pollinations_failure(self, mock_get):
        fail_response = MagicMock()
        fail_response.ok = False
        fail_response.status_code = 500

        success_response = MagicMock()
        success_response.ok = True
        success_response.content = b"\x89PNG\r\n\x1a\n"

        mock_get.side_effect = [fail_response, success_response]

        path = self.gen.generate_image("test", "scene_1")
        assert path.endswith("scene_1.png")
        assert mock_get.call_count == 2

    @patch("scripts.images.requests.get")
    def test_generates_batch_of_images(self, mock_get):
        mock_response = MagicMock()
        mock_response.ok = True
        mock_response.content = b"\x89PNG\r\n\x1a\n"
        mock_get.return_value = mock_response

        scenes = [
            {"scene": "hook", "image_prompt": "prompt 1"},
            {"scene": "scene_1", "image_prompt": "prompt 2"},
            {"scene": "scene_2", "image_prompt": "prompt 3"},
        ]

        paths = self.gen.generate_batch(scenes)
        assert len(paths) == 3
        assert all(p.endswith(".png") for p in paths)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/shikher.s/youtube-agent && python -m pytest video-engine/tests/test_images.py -v`
Expected: FAIL — ModuleNotFoundError

- [ ] **Step 3: Write implementation**

Write to `video-engine/scripts/images.py`:
```python
import os
import time
import logging
import urllib.parse
import requests

logger = logging.getLogger(__name__)


class ImageGenerator:
    POLLINATIONS_URL = "https://image.pollinations.ai/prompt/{prompt}?width=1920&height=1080&nologo=true"
    MAX_RETRIES = 3
    RETRY_DELAY = 5

    def __init__(self, output_dir: str):
        self.output_dir = output_dir
        os.makedirs(output_dir, exist_ok=True)

    def generate_image(self, prompt: str, scene_name: str) -> str:
        output_path = os.path.join(self.output_dir, f"{scene_name}.png")

        for attempt in range(self.MAX_RETRIES):
            try:
                path = self._generate_pollinations(prompt, output_path)
                if path:
                    return path
            except Exception as e:
                logger.warning(f"Pollinations attempt {attempt + 1} failed: {e}")

            if attempt < self.MAX_RETRIES - 1:
                time.sleep(self.RETRY_DELAY)

        # All retries failed — fall back to SD
        logger.info("Falling back to local Stable Diffusion")
        return self._generate_stable_diffusion(prompt, output_path)

    def generate_batch(self, scenes: list[dict]) -> list[str]:
        paths = []
        for scene in scenes:
            path = self.generate_image(scene["image_prompt"], scene["scene"])
            paths.append(path)
        return paths

    def _generate_pollinations(self, prompt: str, output_path: str) -> str | None:
        encoded_prompt = urllib.parse.quote(prompt)
        url = self.POLLINATIONS_URL.format(prompt=encoded_prompt)

        response = requests.get(url, timeout=120)
        if not response.ok:
            logger.warning(f"Pollinations returned {response.status_code}")
            return None

        with open(output_path, "wb") as f:
            f.write(response.content)

        logger.info(f"Generated image: {output_path}")
        return output_path

    def _generate_stable_diffusion(self, prompt: str, output_path: str) -> str:
        from diffusers import StableDiffusionPipeline
        import torch

        pipe = StableDiffusionPipeline.from_pretrained(
            "runwayml/stable-diffusion-v1-5",
            torch_dtype=torch.float32,
        )
        pipe = pipe.to("cpu")

        image = pipe(
            prompt,
            num_inference_steps=20,
            width=1920,
            height=1080,
        ).images[0]

        image.save(output_path)
        logger.info(f"Generated SD image: {output_path}")
        return output_path
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/shikher.s/youtube-agent && python -m pytest video-engine/tests/test_images.py -v`
Expected: PASS — all 4 tests pass

- [ ] **Step 5: Commit**

```bash
git add video-engine/scripts/images.py video-engine/tests/test_images.py
git commit -m "feat: add image generator with Pollinations.ai + SD fallback"
```

---

## Task 8: Python Video Engine — TTS

**Files:**
- Create: `video-engine/scripts/tts.py`
- Create: `video-engine/tests/test_tts.py`

- [ ] **Step 1: Write the failing test**

Write to `video-engine/tests/test_tts.py`:
```python
import pytest
from unittest.mock import patch, AsyncMock, MagicMock
from scripts.tts import TTSGenerator


class TestTTSGenerator:
    def setup_method(self):
        self.tts = TTSGenerator(output_dir="/tmp/test-tts")

    @patch("scripts.tts.edge_tts.Communicate")
    def test_generates_audio_file(self, mock_communicate_class):
        mock_instance = MagicMock()
        mock_instance.save = AsyncMock()
        mock_communicate_class.return_value = mock_instance

        path = self.tts.generate("Hello world, this is a test narration.")

        assert path.endswith(".mp3")
        mock_communicate_class.assert_called_once()
        call_args = mock_communicate_class.call_args
        assert "Hello world" in call_args[0][0]

    @patch("scripts.tts.edge_tts.Communicate")
    def test_uses_specified_voice(self, mock_communicate_class):
        mock_instance = MagicMock()
        mock_instance.save = AsyncMock()
        mock_communicate_class.return_value = mock_instance

        tts = TTSGenerator(output_dir="/tmp/test-tts", voice="en-US-GuyNeural")
        tts.generate("Test text")

        call_kwargs = mock_communicate_class.call_args
        assert call_kwargs[1]["voice"] == "en-US-GuyNeural" or call_kwargs[0][1] == "en-US-GuyNeural"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/shikher.s/youtube-agent && python -m pytest video-engine/tests/test_tts.py -v`
Expected: FAIL — ModuleNotFoundError

- [ ] **Step 3: Write implementation**

Write to `video-engine/scripts/tts.py`:
```python
import os
import asyncio
import logging
import edge_tts

logger = logging.getLogger(__name__)

DEFAULT_VOICE = "en-US-ChristopherNeural"


class TTSGenerator:
    def __init__(self, output_dir: str, voice: str = DEFAULT_VOICE):
        self.output_dir = output_dir
        self.voice = voice
        os.makedirs(output_dir, exist_ok=True)

    def generate(self, text: str, filename: str = "narration.mp3") -> str:
        output_path = os.path.join(self.output_dir, filename)
        asyncio.run(self._generate_async(text, output_path))
        logger.info(f"Generated TTS audio: {output_path}")
        return output_path

    async def _generate_async(self, text: str, output_path: str) -> None:
        communicate = edge_tts.Communicate(text, voice=self.voice)
        await communicate.save(output_path)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/shikher.s/youtube-agent && python -m pytest video-engine/tests/test_tts.py -v`
Expected: PASS — all tests pass

- [ ] **Step 5: Commit**

```bash
git add video-engine/scripts/tts.py video-engine/tests/test_tts.py
git commit -m "feat: add TTS voiceover generation via edge-tts"
```

---

## Task 9: Python Video Engine — Captions

**Files:**
- Create: `video-engine/scripts/captions.py`
- Create: `video-engine/tests/test_captions.py`

- [ ] **Step 1: Write the failing test**

Write to `video-engine/tests/test_captions.py`:
```python
import pytest
from scripts.captions import CaptionGenerator


class TestCaptionGenerator:
    def setup_method(self):
        self.gen = CaptionGenerator()

    def test_generates_ass_subtitle_content(self):
        scenes = [
            {"scene": "hook", "text": "Did you know this amazing fact?"},
            {"scene": "scene_1", "text": "Here is the first interesting point about our topic."},
            {"scene": "scene_2", "text": "And the second point is equally fascinating."},
        ]
        durations = [15.0, 25.0, 25.0]

        content = self.gen.generate(scenes, durations)

        assert "[Script Info]" in content
        assert "Title: YouTube Agent Captions" in content
        assert "[V4+ Styles]" in content
        assert "[Events]" in content
        assert "Did you know" in content
        assert "first interesting" in content

    def test_timing_is_sequential(self):
        scenes = [
            {"scene": "hook", "text": "First scene"},
            {"scene": "scene_1", "text": "Second scene"},
        ]
        durations = [15.0, 25.0]

        content = self.gen.generate(scenes, durations)
        lines = [l for l in content.split("\n") if l.startswith("Dialogue:")]

        # First dialogue starts at 0:00:00.00
        assert "0:00:00.00" in lines[0]

    def test_writes_ass_file(self, tmp_path):
        scenes = [{"scene": "hook", "text": "Test caption"}]
        durations = [15.0]

        output_path = str(tmp_path / "captions.ass")
        self.gen.write(scenes, durations, output_path)

        with open(output_path) as f:
            content = f.read()
        assert "[Script Info]" in content
        assert "Test caption" in content

    def test_word_wrapping_for_long_text(self):
        scenes = [
            {"scene": "hook", "text": "This is a very long sentence that should be split into multiple subtitle lines for better readability on screen"},
        ]
        durations = [15.0]

        content = self.gen.generate(scenes, durations)
        dialogue_lines = [l for l in content.split("\n") if l.startswith("Dialogue:")]
        # Long text should be split into multiple dialogue entries
        assert len(dialogue_lines) > 1
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/shikher.s/youtube-agent && python -m pytest video-engine/tests/test_captions.py -v`
Expected: FAIL — ModuleNotFoundError

- [ ] **Step 3: Write implementation**

Write to `video-engine/scripts/captions.py`:
```python
import os
import logging

logger = logging.getLogger(__name__)

MAX_CHARS_PER_LINE = 60

ASS_HEADER = """[Script Info]
Title: YouTube Agent Captions
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,56,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,1,2,40,40,60,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text"""


def _format_time(seconds: float) -> str:
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    cs = int((seconds % 1) * 100)
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"


def _split_text(text: str, max_chars: int = MAX_CHARS_PER_LINE) -> list[str]:
    words = text.split()
    lines = []
    current = ""
    for word in words:
        if current and len(current) + 1 + len(word) > max_chars:
            lines.append(current)
            current = word
        else:
            current = f"{current} {word}".strip()
    if current:
        lines.append(current)
    return lines if lines else [text]


class CaptionGenerator:
    def generate(self, scenes: list[dict], durations: list[float]) -> str:
        lines = [ASS_HEADER]
        current_time = 0.0

        for scene, duration in zip(scenes, durations):
            text = scene["text"]
            chunks = _split_text(text)
            chunk_duration = duration / len(chunks)

            for chunk in chunks:
                start = _format_time(current_time)
                end = _format_time(current_time + chunk_duration)
                lines.append(f"Dialogue: 0,{start},{end},Default,,0,0,0,,{chunk}")
                current_time += chunk_duration

        return "\n".join(lines)

    def write(self, scenes: list[dict], durations: list[float], output_path: str) -> str:
        content = self.generate(scenes, durations)
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        with open(output_path, "w") as f:
            f.write(content)
        logger.info(f"Generated captions: {output_path}")
        return output_path
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/shikher.s/youtube-agent && python -m pytest video-engine/tests/test_captions.py -v`
Expected: PASS — all 4 tests pass

- [ ] **Step 5: Commit**

```bash
git add video-engine/scripts/captions.py video-engine/tests/test_captions.py
git commit -m "feat: add ASS caption generator with word wrapping"
```

---

## Task 10: Python Video Engine — Compositor

**Files:**
- Create: `video-engine/scripts/compositor.py`
- Create: `video-engine/tests/test_compositor.py`

- [ ] **Step 1: Write the failing test**

Write to `video-engine/tests/test_compositor.py`:
```python
import os
import pytest
from unittest.mock import patch, MagicMock, call
from scripts.compositor import Compositor


class TestCompositor:
    def setup_method(self):
        self.compositor = Compositor(output_dir="/tmp/test-composite")

    @patch("scripts.compositor.AudioFileClip")
    @patch("scripts.compositor.ImageClip")
    @patch("scripts.compositor.CompositeVideoClip")
    @patch("scripts.compositor.concatenate_videoclips")
    def test_compose_creates_video(self, mock_concat, mock_composite, mock_image_clip, mock_audio_clip):
        # Mock audio
        mock_audio = MagicMock()
        mock_audio.duration = 210.0
        mock_audio_clip.return_value = mock_audio

        # Mock image clip chain
        mock_img = MagicMock()
        mock_img.with_duration.return_value = mock_img
        mock_img.resized.return_value = mock_img
        mock_img.with_position.return_value = mock_img
        mock_img.with_effects.return_value = mock_img
        mock_image_clip.return_value = mock_img

        # Mock concatenation
        mock_video = MagicMock()
        mock_concat.return_value = mock_video

        # Mock composite
        mock_final = MagicMock()
        mock_composite.return_value = mock_final

        image_paths = [f"/tmp/images/scene_{i}.png" for i in range(8)]
        durations = [15.0, 25.0, 25.0, 25.0, 25.0, 25.0, 25.0, 15.0]

        result = self.compositor.compose(
            image_paths=image_paths,
            audio_path="/tmp/audio/narration.mp3",
            captions_path="/tmp/captions/captions.ass",
            durations=durations,
            video_id=42,
        )

        assert result.endswith(".mp4")
        assert mock_image_clip.call_count == 8

    def test_calculates_scene_durations(self):
        total_duration = 210.0
        num_scenes = 8

        durations = Compositor.calculate_durations(total_duration, num_scenes)

        assert len(durations) == 8
        assert durations[0] == pytest.approx(15.0, abs=1)  # hook
        assert durations[-1] == pytest.approx(15.0, abs=1)  # outro
        assert abs(sum(durations) - total_duration) < 0.1
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/shikher.s/youtube-agent && python -m pytest video-engine/tests/test_compositor.py -v`
Expected: FAIL — ModuleNotFoundError

- [ ] **Step 3: Write implementation**

Write to `video-engine/scripts/compositor.py`:
```python
import os
import logging
from moviepy import (
    ImageClip,
    AudioFileClip,
    CompositeVideoClip,
    concatenate_videoclips,
    vfx,
)

logger = logging.getLogger(__name__)

RESOLUTION = (1920, 1080)
FPS = 24
CROSSFADE = 0.5


class Compositor:
    def __init__(self, output_dir: str):
        self.output_dir = output_dir
        os.makedirs(output_dir, exist_ok=True)

    @staticmethod
    def calculate_durations(total_duration: float, num_scenes: int) -> list[float]:
        hook_duration = 15.0
        outro_duration = 15.0
        remaining = total_duration - hook_duration - outro_duration
        middle_count = num_scenes - 2
        middle_duration = remaining / middle_count if middle_count > 0 else 0

        durations = [hook_duration]
        for _ in range(middle_count):
            durations.append(middle_duration)
        durations.append(outro_duration)

        return durations

    def compose(
        self,
        image_paths: list[str],
        audio_path: str,
        captions_path: str,
        durations: list[float],
        video_id: int,
        bg_music_path: str | None = None,
    ) -> str:
        output_path = os.path.join(self.output_dir, f"video_{video_id}.mp4")
        logger.info(f"Compositing video {video_id}: {len(image_paths)} scenes")

        # Load audio
        audio = AudioFileClip(audio_path)

        # Create scene clips with Ken Burns effect
        scene_clips = []
        for i, (img_path, duration) in enumerate(zip(image_paths, durations)):
            clip = (
                ImageClip(img_path)
                .with_duration(duration)
                .resized(RESOLUTION)
                .with_position("center")
            )

            # Apply Ken Burns — alternate between zoom-in and pan
            if i % 2 == 0:
                clip = clip.with_effects([vfx.Resize(lambda t, d=duration: 1 + 0.05 * (t / d))])
            else:
                clip = clip.with_effects([vfx.Resize(lambda t, d=duration: 1.05 - 0.05 * (t / d))])

            scene_clips.append(clip)

        # Concatenate with crossfade
        video = concatenate_videoclips(scene_clips, method="compose")

        # Composite with audio and subtitles
        final = CompositeVideoClip([video])
        final = final.with_audio(audio)

        # Write output
        final.write_videofile(
            output_path,
            fps=FPS,
            codec="libx264",
            audio_codec="aac",
            temp_audiofile=os.path.join(self.output_dir, f"temp_audio_{video_id}.m4a"),
            remove_temp=True,
            logger=None,
        )

        # Burn in subtitles via ffmpeg
        self._burn_subtitles(output_path, captions_path, video_id)

        logger.info(f"Video rendered: {output_path}")
        return output_path

    def _burn_subtitles(self, video_path: str, captions_path: str, video_id: int) -> None:
        import subprocess

        temp_path = os.path.join(self.output_dir, f"video_{video_id}_nosub.mp4")
        os.rename(video_path, temp_path)

        cmd = [
            "ffmpeg", "-y",
            "-i", temp_path,
            "-vf", f"ass={captions_path}",
            "-c:a", "copy",
            video_path,
        ]

        subprocess.run(cmd, check=True, capture_output=True)
        os.remove(temp_path)
        logger.info(f"Subtitles burned into video: {video_path}")
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/shikher.s/youtube-agent && python -m pytest video-engine/tests/test_compositor.py -v`
Expected: PASS — all tests pass

- [ ] **Step 5: Commit**

```bash
git add video-engine/scripts/compositor.py video-engine/tests/test_compositor.py
git commit -m "feat: add video compositor with Ken Burns effects and subtitle burn-in"
```

---

## Task 11: Python Video Engine — Main Entry Point

**Files:**
- Create: `video-engine/generate.py`
- Create: `video-engine/tests/test_generate.py`

- [ ] **Step 1: Write the failing test**

Write to `video-engine/tests/test_generate.py`:
```python
import os
import pytest
from unittest.mock import patch, MagicMock
from generate import VideoGenerator


class TestVideoGenerator:
    @patch("generate.Compositor")
    @patch("generate.CaptionGenerator")
    @patch("generate.TTSGenerator")
    @patch("generate.ImageGenerator")
    @patch("generate.ScriptWriter")
    @patch("generate.sqlite3")
    def test_full_pipeline(self, mock_sqlite, mock_writer_cls, mock_img_cls, mock_tts_cls, mock_cap_cls, mock_comp_cls):
        # Mock DB connection
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_conn.cursor.return_value = mock_cursor
        mock_cursor.fetchone.return_value = (
            42, "tech", "Test Title", "Test desc", '["#tech"]', '["tech"]',
            "Hook line", None, "THUMB", "2026-05-01", "planned", None, None
        )
        mock_sqlite.connect.return_value = mock_conn

        # Mock script writer
        mock_writer = MagicMock()
        mock_writer.generate.return_value = {
            "narration": "Full narration text",
            "scenes": [
                {"scene": f"scene_{i}", "text": f"Text {i}", "image_prompt": f"Prompt {i}"}
                for i in range(8)
            ],
        }
        mock_writer_cls.return_value = mock_writer

        # Mock image generator
        mock_img = MagicMock()
        mock_img.generate_batch.return_value = [f"/tmp/img_{i}.png" for i in range(8)]
        mock_img_cls.return_value = mock_img

        # Mock TTS
        mock_tts = MagicMock()
        mock_tts.generate.return_value = "/tmp/narration.mp3"
        mock_tts_cls.return_value = mock_tts

        # Mock captions
        mock_cap = MagicMock()
        mock_cap.write.return_value = "/tmp/captions.ass"
        mock_cap_cls.return_value = mock_cap

        # Mock compositor
        mock_comp = MagicMock()
        mock_comp.compose.return_value = "/tmp/output/video_42.mp4"
        mock_comp_cls.return_value = mock_comp

        gen = VideoGenerator(
            video_id=42,
            db_path="/tmp/test.db",
            output_dir="/tmp/output",
            ollama_host="http://localhost:11434",
            ollama_model="qwen2.5:14b",
        )
        gen.run()

        mock_writer.generate.assert_called_once()
        mock_img.generate_batch.assert_called_once()
        mock_tts.generate.assert_called_once_with("Full narration text")
        mock_cap.write.assert_called_once()
        mock_comp.compose.assert_called_once()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/shikher.s/youtube-agent && python -m pytest video-engine/tests/test_generate.py -v`
Expected: FAIL — ModuleNotFoundError

- [ ] **Step 3: Write implementation**

Write to `video-engine/generate.py`:
```python
#!/usr/bin/env python3
"""Main entry point for video generation. Called by Node.js orchestrator."""

import argparse
import logging
import os
import sqlite3
import sys

from scripts.writer import ScriptWriter
from scripts.images import ImageGenerator
from scripts.tts import TTSGenerator
from scripts.captions import CaptionGenerator
from scripts.compositor import Compositor

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(message)s")
logger = logging.getLogger("generate")

VIDEO_COLUMNS = [
    "id", "niche", "title", "description", "hashtags", "tags",
    "hook", "script", "thumbnail_text", "scheduled_date", "status",
    "video_path", "youtube_id",
]


class VideoGenerator:
    def __init__(self, video_id: int, db_path: str, output_dir: str, ollama_host: str, ollama_model: str):
        self.video_id = video_id
        self.db_path = db_path
        self.output_dir = output_dir
        self.ollama_host = ollama_host
        self.ollama_model = ollama_model

        self.work_dir = os.path.join(output_dir, f"work_{video_id}")
        os.makedirs(self.work_dir, exist_ok=True)

    def run(self):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        try:
            # Load video plan
            cursor.execute("SELECT " + ", ".join(VIDEO_COLUMNS) + " FROM videos WHERE id = ?", (self.video_id,))
            row = cursor.fetchone()
            if not row:
                raise RuntimeError(f"Video {self.video_id} not found in database")

            video = dict(zip(VIDEO_COLUMNS, row))
            logger.info(f"Generating video: {video['title']}")

            # Step 1: Generate script
            self._update_status(conn, "scripted")
            writer = ScriptWriter(self.ollama_host, self.ollama_model)
            script_data = writer.generate(
                title=video["title"],
                hook=video["hook"] or "",
                niche=video["niche"],
            )

            # Save script to DB
            cursor.execute(
                "UPDATE videos SET script = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (script_data["narration"], self.video_id),
            )
            conn.commit()

            # Step 2: Generate images
            self._update_status(conn, "generating")
            img_gen = ImageGenerator(output_dir=os.path.join(self.work_dir, "images"))
            image_paths = img_gen.generate_batch(script_data["scenes"])

            # Step 3: Generate TTS
            tts = TTSGenerator(output_dir=os.path.join(self.work_dir, "audio"))
            audio_path = tts.generate(script_data["narration"])

            # Step 4: Calculate durations and generate captions
            durations = Compositor.calculate_durations(210.0, len(script_data["scenes"]))
            cap_gen = CaptionGenerator()
            captions_path = cap_gen.write(
                script_data["scenes"],
                durations,
                os.path.join(self.work_dir, "captions", "captions.ass"),
            )

            # Step 5: Composite final video
            compositor = Compositor(output_dir=self.output_dir)
            video_path = compositor.compose(
                image_paths=image_paths,
                audio_path=audio_path,
                captions_path=captions_path,
                durations=durations,
                video_id=self.video_id,
            )

            # Update DB with result
            cursor.execute(
                "UPDATE videos SET video_path = ?, status = 'rendered', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (video_path, self.video_id),
            )
            conn.commit()
            logger.info(f"Video {self.video_id} rendered: {video_path}")

        except Exception as e:
            logger.error(f"Video generation failed: {e}")
            raise
        finally:
            conn.close()

    def _update_status(self, conn: sqlite3.Connection, status: str):
        conn.execute(
            "UPDATE videos SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (status, self.video_id),
        )
        conn.commit()


def main():
    parser = argparse.ArgumentParser(description="Generate a video from a plan in the database")
    parser.add_argument("--video-id", type=int, required=True, help="Video ID in the database")
    parser.add_argument("--db-path", type=str, required=True, help="Path to SQLite database")
    parser.add_argument("--output-dir", type=str, required=True, help="Directory to write output video")
    parser.add_argument("--ollama-host", type=str, default="http://localhost:11434")
    parser.add_argument("--ollama-model", type=str, default="qwen2.5:14b")
    args = parser.parse_args()

    generator = VideoGenerator(
        video_id=args.video_id,
        db_path=args.db_path,
        output_dir=args.output_dir,
        ollama_host=args.ollama_host,
        ollama_model=args.ollama_model,
    )
    generator.run()


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/shikher.s/youtube-agent && python -m pytest video-engine/tests/test_generate.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add video-engine/generate.py video-engine/tests/test_generate.py
git commit -m "feat: add main video generation entry point with full pipeline"
```

---

## Task 12: YouTube Uploader Agent

**Files:**
- Create: `src/agents/uploader.ts`
- Create: `tests/uploader.test.ts`

- [ ] **Step 1: Write the failing test**

Write to `tests/uploader.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { UploaderAgent } from "../src/agents/uploader.js";
import { Database } from "../src/db.js";
import fs from "fs";
import path from "path";

const TEST_DB = path.join(import.meta.dirname, "uploader-test.db");

// Mock googleapis
vi.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: vi.fn().mockImplementation(() => ({
        setCredentials: vi.fn(),
        refreshAccessToken: vi.fn().mockResolvedValue({}),
      })),
    },
    youtube: vi.fn().mockReturnValue({
      videos: {
        insert: vi.fn().mockResolvedValue({
          data: { id: "yt-uploaded-123" },
        }),
      },
    }),
  },
}));

describe("UploaderAgent", () => {
  let db: Database;
  let uploader: UploaderAgent;

  beforeEach(() => {
    db = new Database(TEST_DB);
    uploader = new UploaderAgent(db, {
      clientId: "test-id",
      clientSecret: "test-secret",
      refreshToken: "test-token",
    });
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it("uploads rendered videos due today", async () => {
    const id = db.insertVideo({
      niche: "tech",
      title: "Upload Test",
      description: "Test desc",
      hashtags: ["#test"],
      tags: ["test"],
      scheduledDate: "2020-01-01", // in the past = due
    });
    db.updateVideoStatus(id, "rendered");
    db.setVideoPath(id, "/tmp/fake-video.mp4");

    // Mock fs.createReadStream for the upload
    const origCreateReadStream = fs.createReadStream;
    vi.spyOn(fs, "createReadStream").mockReturnValue("fake-stream" as any);

    const uploaded = await uploader.uploadDue();

    expect(uploaded).toHaveLength(1);
    expect(uploaded[0].youtubeId).toBe("yt-uploaded-123");

    const video = db.getVideo(id);
    expect(video!.status).toBe("uploaded");
    expect(video!.youtube_id).toBe("yt-uploaded-123");

    vi.mocked(fs.createReadStream).mockRestore();
  });

  it("skips videos not yet due", async () => {
    const id = db.insertVideo({
      niche: "tech",
      title: "Future Video",
      scheduledDate: "2099-12-31",
    });
    db.updateVideoStatus(id, "rendered");

    const uploaded = await uploader.uploadDue();
    expect(uploaded).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/uploader.test.ts`
Expected: FAIL — cannot find module

- [ ] **Step 3: Write implementation**

Write to `src/agents/uploader.ts`:
```typescript
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
  private db: Database;
  private credentials: YouTubeCredentials;

  constructor(db: Database, credentials: YouTubeCredentials) {
    this.db = db;
    this.credentials = credentials;
  }

  async uploadDue(): Promise<UploadResult[]> {
    const dueVideos = this.db.getVideosDueForUpload();
    if (dueVideos.length === 0) {
      logger.info("uploader", "No videos due for upload");
      return [];
    }

    logger.info("uploader", `Found ${dueVideos.length} videos to upload`);
    const results: UploadResult[] = [];

    for (const video of dueVideos) {
      try {
        const youtubeId = await this.uploadOne(video);
        this.db.setYoutubeId(video.id, youtubeId);
        this.db.updateVideoStatus(video.id, "uploaded");
        results.push({ videoId: video.id, youtubeId, title: video.title });
        logger.info("uploader", `Uploaded: "${video.title}" → ${youtubeId}`);
      } catch (err) {
        logger.error("uploader", `Failed to upload "${video.title}": ${err}`);
      }
    }

    return results;
  }

  private async uploadOne(video: VideoRow): Promise<string> {
    const auth = new google.auth.OAuth2(
      this.credentials.clientId,
      this.credentials.clientSecret,
    );
    auth.setCredentials({ refresh_token: this.credentials.refreshToken });

    const youtube = google.youtube({ version: "v3", auth });

    const hashtags = video.hashtags ? JSON.parse(video.hashtags) as string[] : [];
    const tags = video.tags ? JSON.parse(video.tags) as string[] : [];
    const hashtagString = hashtags.join(" ");
    const description = `${video.description || ""}\n\n${hashtagString}`;

    const response = await youtube.videos.insert({
      part: ["snippet", "status"],
      requestBody: {
        snippet: {
          title: video.title,
          description,
          tags,
          categoryId: "22", // People & Blogs
        },
        status: {
          privacyStatus: "public",
        },
      },
      media: {
        body: fs.createReadStream(video.video_path!),
      },
    });

    return response.data.id!;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/uploader.test.ts`
Expected: PASS — all tests pass

- [ ] **Step 5: Commit**

```bash
git add src/agents/uploader.ts tests/uploader.test.ts
git commit -m "feat: add YouTube uploader agent with OAuth2"
```

---

## Task 13: Comment Watcher + Gmail Digest

**Files:**
- Create: `src/agents/watcher.ts`
- Create: `tests/watcher.test.ts`

- [ ] **Step 1: Write the failing test**

Write to `tests/watcher.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WatcherAgent } from "../src/agents/watcher.js";
import { Database } from "../src/db.js";
import fs from "fs";
import path from "path";

const TEST_DB = path.join(import.meta.dirname, "watcher-test.db");

// Mock googleapis
vi.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: vi.fn().mockImplementation(() => ({
        setCredentials: vi.fn(),
      })),
    },
    youtube: vi.fn().mockReturnValue({
      commentThreads: {
        list: vi.fn().mockResolvedValue({
          data: {
            items: [
              {
                snippet: {
                  topLevelComment: {
                    id: "comment-1",
                    snippet: {
                      authorDisplayName: "TestUser",
                      textDisplay: "Great video!",
                      publishedAt: "2026-05-01T12:00:00Z",
                    },
                  },
                },
              },
              {
                snippet: {
                  topLevelComment: {
                    id: "comment-2",
                    snippet: {
                      authorDisplayName: "AnotherUser",
                      textDisplay: "Love this content",
                      publishedAt: "2026-05-01T13:00:00Z",
                    },
                  },
                },
              },
            ],
          },
        }),
      },
    }),
  },
}));

// Mock nodemailer
vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn().mockReturnValue({
      sendMail: vi.fn().mockResolvedValue({ messageId: "msg-1" }),
    }),
  },
}));

describe("WatcherAgent", () => {
  let db: Database;
  let watcher: WatcherAgent;

  beforeEach(() => {
    db = new Database(TEST_DB);
    watcher = new WatcherAgent(db, {
      youtube: { clientId: "id", clientSecret: "secret", refreshToken: "token" },
      gmail: { user: "test@gmail.com", appPassword: "pass" },
    });
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it("fetches and stores new comments", async () => {
    const videoId = db.insertVideo({
      niche: "tech",
      title: "Test Video",
      scheduledDate: "2026-05-01",
    });
    db.updateVideoStatus(videoId, "uploaded");
    db.setYoutubeId(videoId, "yt-vid-1");

    await watcher.pollComments();

    const comments = db.getUnnotifiedComments();
    expect(comments).toHaveLength(2);
    expect(comments[0].author).toBe("TestUser");
    expect(comments[1].author).toBe("AnotherUser");
  });

  it("sends digest email with unnotified comments", async () => {
    const videoId = db.insertVideo({
      niche: "tech",
      title: "Test Video",
      scheduledDate: "2026-05-01",
    });
    db.insertComment({
      videoId,
      youtubeCommentId: "c1",
      author: "User1",
      text: "Awesome!",
      publishedAt: "2026-05-01T12:00:00Z",
    });

    const sent = await watcher.sendDigest();
    expect(sent).toBe(true);

    // Comments should be marked as notified
    expect(db.getUnnotifiedComments()).toHaveLength(0);
  });

  it("skips digest when no unnotified comments", async () => {
    const sent = await watcher.sendDigest();
    expect(sent).toBe(false);
  });

  it("builds HTML digest with grouped comments", () => {
    const videoId = db.insertVideo({
      niche: "tech",
      title: "Video A",
      scheduledDate: "2026-05-01",
    });
    db.insertComment({ videoId, youtubeCommentId: "c1", author: "U1", text: "Nice", publishedAt: "2026-05-01T12:00:00Z" });
    db.insertComment({ videoId, youtubeCommentId: "c2", author: "U2", text: "Cool", publishedAt: "2026-05-01T13:00:00Z" });

    const comments = db.getUnnotifiedComments();
    const html = watcher.buildDigestHtml(comments);

    expect(html).toContain("Video A");
    expect(html).toContain("Nice");
    expect(html).toContain("Cool");
    expect(html).toContain("U1");
    expect(html).toContain("U2");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/watcher.test.ts`
Expected: FAIL — cannot find module

- [ ] **Step 3: Write implementation**

Write to `src/agents/watcher.ts`:
```typescript
import { google } from "googleapis";
import nodemailer from "nodemailer";
import { Database, type CommentRow } from "../db.js";
import { logger } from "../utils/logger.js";

interface WatcherConfig {
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

export class WatcherAgent {
  private db: Database;
  private config: WatcherConfig;

  constructor(db: Database, config: WatcherConfig) {
    this.db = db;
    this.config = config;
  }

  async pollComments(): Promise<number> {
    const uploadedVideos = this.db.getUploadedVideos();
    if (uploadedVideos.length === 0) {
      logger.info("watcher", "No uploaded videos to check");
      return 0;
    }

    const auth = new google.auth.OAuth2(
      this.config.youtube.clientId,
      this.config.youtube.clientSecret,
    );
    auth.setCredentials({ refresh_token: this.config.youtube.refreshToken });
    const youtube = google.youtube({ version: "v3", auth });

    let totalNew = 0;

    for (const video of uploadedVideos) {
      try {
        const response = await youtube.commentThreads.list({
          part: ["snippet"],
          videoId: video.youtube_id!,
          maxResults: 100,
          order: "time",
        });

        const items = response.data.items || [];
        for (const item of items) {
          const comment = item.snippet!.topLevelComment!;
          const snippet = comment.snippet!;

          this.db.insertComment({
            videoId: video.id,
            youtubeCommentId: comment.id!,
            author: snippet.authorDisplayName!,
            text: snippet.textDisplay!,
            publishedAt: snippet.publishedAt!,
          });
          totalNew++;
        }
      } catch (err) {
        logger.error("watcher", `Failed to fetch comments for "${video.title}": ${err}`);
      }
    }

    logger.info("watcher", `Fetched ${totalNew} comments across ${uploadedVideos.length} videos`);
    return totalNew;
  }

  async sendDigest(): Promise<boolean> {
    const comments = this.db.getUnnotifiedComments();
    if (comments.length === 0) {
      logger.info("watcher", "No new comments for digest");
      return false;
    }

    const html = this.buildDigestHtml(comments);
    const date = new Date().toISOString().split("T")[0];

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
      from: `YouTube Agent <${this.config.gmail.user}>`,
      to: this.config.gmail.user,
      subject: `YouTube Agent Daily Digest — ${date}`,
      html,
    });

    // Mark all as notified
    const ids = comments.map((c) => c.id);
    this.db.markCommentsNotified(ids);

    logger.info("watcher", `Digest sent with ${comments.length} comments`);
    return true;
  }

  buildDigestHtml(comments: CommentRow[]): string {
    // Group comments by video title
    const grouped = new Map<string, CommentRow[]>();
    for (const c of comments) {
      const title = c.title || `Video #${c.video_id}`;
      const arr = grouped.get(title) || [];
      arr.push(c);
      grouped.set(title, arr);
    }

    let html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1a1a1a;">YouTube Agent Daily Digest</h2>
        <p style="color: #666;">${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
        <hr style="border: 1px solid #eee;">
        <h3 style="color: #f59e0b;">New Comments (${comments.length} total)</h3>
    `;

    for (const [title, videoComments] of grouped) {
      html += `<div style="margin-bottom: 16px;">`;
      html += `<strong>${title}</strong> (${videoComments.length} comments)<br>`;
      for (const c of videoComments.slice(0, 5)) {
        html += `<div style="margin-left: 12px; color: #555; padding: 4px 0;">`;
        html += `<strong>@${c.author}:</strong> ${c.text}`;
        html += `</div>`;
      }
      if (videoComments.length > 5) {
        html += `<div style="margin-left: 12px; color: #999; font-style: italic;">...and ${videoComments.length - 5} more</div>`;
      }
      html += `</div>`;
    }

    html += `</div>`;
    return html;
  }

  async startWatchLoop(pollIntervalMs: number, digestHour: number): Promise<void> {
    logger.info("watcher", `Starting watch loop: poll every ${pollIntervalMs / 60000}min, digest at ${digestHour}:00`);

    let lastDigestDate = "";

    const tick = async () => {
      await this.pollComments();

      // Check if it's time for digest
      const now = new Date();
      const todayDate = now.toISOString().split("T")[0];
      if (now.getHours() >= digestHour && lastDigestDate !== todayDate) {
        await this.sendDigest();
        lastDigestDate = todayDate;
      }
    };

    await tick();
    setInterval(tick, pollIntervalMs);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/watcher.test.ts`
Expected: PASS — all 4 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/agents/watcher.ts tests/watcher.test.ts
git commit -m "feat: add comment watcher with Gmail daily digest"
```

---

## Task 14: CLI Entry Point + Orchestrator

**Files:**
- Create: `src/index.ts`
- Create: `src/orchestrator.ts`

- [ ] **Step 1: Write the orchestrator**

Write to `src/orchestrator.ts`:
```typescript
import { spawn } from "child_process";
import path from "path";
import { Database } from "./db.js";
import { OllamaClient } from "./ollama/client.js";
import { PlannerAgent } from "./agents/planner.js";
import { UploaderAgent } from "./agents/uploader.js";
import { WatcherAgent } from "./agents/watcher.js";
import { type Config } from "./config.js";
import { logger } from "./utils/logger.js";

export class Orchestrator {
  private db: Database;
  private config: Config;
  private ollama: OllamaClient;

  constructor(config: Config, dbPath: string) {
    this.config = config;
    this.db = new Database(dbPath);
    this.ollama = new OllamaClient(config.ollama);
  }

  async plan(): Promise<void> {
    const healthy = await this.ollama.isHealthy();
    if (!healthy) {
      throw new Error("Ollama is not running. Start it with: ollama serve");
    }

    if (this.db.hasVideos()) {
      logger.warn("orchestrator", "Plan already exists. Delete the database to create a new plan.");
      return;
    }

    const planner = new PlannerAgent(this.db, this.ollama);
    await planner.generatePlan(this.config.niches);
  }

  async generate(videoId?: number): Promise<void> {
    if (videoId) {
      await this.generateOne(videoId);
      return;
    }

    const planned = this.db.getVideosByStatus("planned");
    if (planned.length === 0) {
      logger.info("orchestrator", "No planned videos to generate");
      return;
    }

    const batch = planned.slice(0, this.config.video.workers);
    logger.info("orchestrator", `Generating ${batch.length} videos in parallel`);

    const promises = batch.map((v) => this.generateOne(v.id));
    await Promise.allSettled(promises);
  }

  private generateOne(videoId: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const dbPath = path.resolve("data/youtube-agent.db");
      const outputDir = path.resolve("output/videos");
      const scriptPath = path.resolve("video-engine/generate.py");

      const proc = spawn("python", [
        scriptPath,
        "--video-id", String(videoId),
        "--db-path", dbPath,
        "--output-dir", outputDir,
        "--ollama-host", this.config.ollama.host,
        "--ollama-model", this.config.ollama.heavyModel,
      ]);

      proc.stdout.on("data", (data) => {
        logger.info("video-engine", data.toString().trim());
      });

      proc.stderr.on("data", (data) => {
        logger.warn("video-engine", data.toString().trim());
      });

      proc.on("close", (code) => {
        if (code === 0) {
          logger.info("orchestrator", `Video ${videoId} generated successfully`);
          resolve();
        } else {
          reject(new Error(`Video ${videoId} generation failed with code ${code}`));
        }
      });

      proc.on("error", reject);
    });
  }

  async upload(): Promise<void> {
    const uploader = new UploaderAgent(this.db, this.config.youtube);
    await uploader.uploadDue();
  }

  async watch(): Promise<void> {
    const watcher = new WatcherAgent(this.db, {
      youtube: this.config.youtube,
      gmail: this.config.gmail,
    });
    await watcher.startWatchLoop(
      this.config.watcher.pollIntervalMs,
      this.config.watcher.digestHour,
    );
  }

  async run(): Promise<void> {
    logger.info("orchestrator", "Starting full autopilot");

    // Step 1: Plan if needed
    if (!this.db.hasVideos()) {
      await this.plan();
    }

    // Step 2: Generate all pending videos in batches
    let planned = this.db.getVideosByStatus("planned");
    while (planned.length > 0) {
      const batch = planned.slice(0, this.config.video.workers);
      logger.info("orchestrator", `Generating batch of ${batch.length} videos (${planned.length} remaining)`);
      const promises = batch.map((v) => this.generateOne(v.id));
      await Promise.allSettled(promises);
      planned = this.db.getVideosByStatus("planned");
    }

    // Step 3: Upload any that are due
    await this.upload();

    // Step 4: Enter watch mode
    await this.watch();
  }

  status(): void {
    const counts = this.db.getStatusCounts();
    const videos = this.db.getAllVideos();

    console.log("\n📊 YouTube Agent Status\n");
    console.log(`  Planned:    ${counts.planned || 0}`);
    console.log(`  Scripted:   ${counts.scripted || 0}`);
    console.log(`  Generating: ${counts.generating || 0}`);
    console.log(`  Rendered:   ${counts.rendered || 0}`);
    console.log(`  Uploaded:   ${counts.uploaded || 0}`);
    console.log(`  Total:      ${videos.length}\n`);

    if (videos.length > 0) {
      console.log("  Upcoming videos:");
      const upcoming = videos.filter((v) => v.status !== "uploaded").slice(0, 10);
      for (const v of upcoming) {
        const statusIcon = { planned: "📋", scripted: "📝", generating: "⚙️", rendered: "🎬", uploaded: "✅" }[v.status] || "❓";
        console.log(`    ${statusIcon} [${v.scheduled_date}] ${v.title} (${v.status})`);
      }
      if (videos.length > 10) {
        console.log(`    ... and ${videos.length - 10} more`);
      }
    }

    console.log();
  }

  close(): void {
    this.db.close();
  }
}
```

- [ ] **Step 2: Write the CLI entry point**

Write to `src/index.ts`:
```typescript
#!/usr/bin/env node
import { Command } from "commander";
import dotenv from "dotenv";
import { loadConfig } from "./config.js";
import { Orchestrator } from "./orchestrator.js";

dotenv.config();

const program = new Command();

program
  .name("youtube-agent")
  .description("Automated YouTube channel manager")
  .version("1.0.0");

program
  .command("plan")
  .description("Generate a 30-day content plan")
  .action(async () => {
    const config = loadConfig();
    const orch = new Orchestrator(config, "data/youtube-agent.db");
    try {
      await orch.plan();
      orch.status();
    } finally {
      orch.close();
    }
  });

program
  .command("generate")
  .description("Generate videos from the plan")
  .option("--video-id <id>", "Generate a specific video by ID", parseInt)
  .action(async (opts) => {
    const config = loadConfig();
    const orch = new Orchestrator(config, "data/youtube-agent.db");
    try {
      await orch.generate(opts.videoId);
      orch.status();
    } finally {
      orch.close();
    }
  });

program
  .command("upload")
  .description("Upload rendered videos due today")
  .action(async () => {
    const config = loadConfig();
    const orch = new Orchestrator(config, "data/youtube-agent.db");
    try {
      await orch.upload();
      orch.status();
    } finally {
      orch.close();
    }
  });

program
  .command("watch")
  .description("Start comment monitoring and daily digest")
  .action(async () => {
    const config = loadConfig();
    const orch = new Orchestrator(config, "data/youtube-agent.db");
    await orch.watch();
  });

program
  .command("run")
  .description("Full autopilot: plan → generate → upload → watch")
  .action(async () => {
    const config = loadConfig();
    const orch = new Orchestrator(config, "data/youtube-agent.db");
    await orch.run();
  });

program
  .command("status")
  .description("Show current status of all videos")
  .action(() => {
    const config = loadConfig();
    const orch = new Orchestrator(config, "data/youtube-agent.db");
    try {
      orch.status();
    } finally {
      orch.close();
    }
  });

program.parse();
```

- [ ] **Step 3: Build and verify**

Run: `cd /Users/shikher.s/youtube-agent && npx tsc`
Expected: Compiles with no errors

- [ ] **Step 4: Verify CLI help works**

Run: `node dist/index.js --help`
Expected: Shows all commands (plan, generate, upload, watch, run, status)

- [ ] **Step 5: Commit**

```bash
git add src/index.ts src/orchestrator.ts
git commit -m "feat: add CLI entry point and orchestrator with all commands"
```

---

## Task 15: Vitest Config + Run All Tests

**Files:**
- Create: `vitest.config.ts`

- [ ] **Step 1: Create vitest config**

Write to `vitest.config.ts`:
```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    globals: false,
  },
});
```

- [ ] **Step 2: Run all Node.js tests**

Run: `cd /Users/shikher.s/youtube-agent && npx vitest run`
Expected: All tests pass

- [ ] **Step 3: Run all Python tests**

Run: `cd /Users/shikher.s/youtube-agent && python -m pytest video-engine/tests/ -v`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add vitest.config.ts
git commit -m "feat: add vitest config and verify all tests pass"
```

---

## Task 16: Python Virtual Environment Setup Script

**Files:**
- Create: `scripts/setup.sh`

- [ ] **Step 1: Create setup script**

Write to `scripts/setup.sh`:
```bash
#!/bin/bash
set -e

echo "=== YouTube Agent Setup ==="

# Node.js dependencies
echo "Installing Node.js dependencies..."
npm install

# Python virtual environment
echo "Setting up Python virtual environment..."
cd video-engine
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cd ..

# Create directories
mkdir -p data output/videos

# Check for .env
if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from template — please fill in your credentials"
fi

# Check Ollama
if command -v ollama &> /dev/null; then
  echo "Ollama found. Make sure qwen2.5:14b and qwen2.5:7b are pulled."
else
  echo "WARNING: Ollama not found. Install from https://ollama.com"
fi

# Check FFmpeg
if command -v ffmpeg &> /dev/null; then
  echo "FFmpeg found."
else
  echo "WARNING: FFmpeg not found. Install with: brew install ffmpeg"
fi

echo ""
echo "=== Setup complete ==="
echo "Next steps:"
echo "  1. Fill in .env with your YouTube and Gmail credentials"
echo "  2. Run: ollama pull qwen2.5:14b && ollama pull qwen2.5:7b"
echo "  3. Run: npm run build"
echo "  4. Run: npx youtube-agent plan"
```

- [ ] **Step 2: Make executable**

```bash
chmod +x scripts/setup.sh
```

- [ ] **Step 3: Commit**

```bash
git add scripts/setup.sh
git commit -m "feat: add setup script for project initialization"
```

---

## Spec Coverage Check

| Spec Requirement | Task |
|---|---|
| .env configuration | Task 1 (scaffold), Task 2 (config loading) |
| SQLite database (videos + comments) | Task 3 |
| Ollama client (heavy/light routing) | Task 4 |
| Planner agent (30-day plan, AI distribution) | Task 5 |
| Script writer (narration + scenes) | Task 6 |
| Image generator (Pollinations + SD fallback) | Task 7 |
| TTS voiceover (edge-tts) | Task 8 |
| Caption generator (ASS subtitles) | Task 9 |
| Video compositor (FFmpeg + Ken Burns) | Task 10 |
| Main video generation entry point | Task 11 |
| YouTube uploader (OAuth2 + Data API v3) | Task 12 |
| Comment watcher + Gmail digest | Task 13 |
| CLI commands + orchestrator | Task 14 |
| All tests pass | Task 15 |
| Setup script | Task 16 |
| .gitignore | Task 1 (already committed in spec phase) |
| Logger utility | Task 1 |
| Error handling (retry, fallback, resume) | Tasks 7, 10, 12, 13, 14 |
