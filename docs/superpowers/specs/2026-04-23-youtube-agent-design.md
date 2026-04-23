# YouTube Agent — Design Spec

Automated YouTube channel manager that generates a 30-day content plan, creates AI-generated videos, uploads them to YouTube, monitors comments, and sends daily Gmail digests.

## Tech Stack

- **Orchestrator**: Node.js / TypeScript — CLI pipeline controller
- **Video Engine**: Python — image generation, TTS, compositing
- **Database**: SQLite — state management, crash recovery
- **LLM**: Ollama (Qwen 2.5 14B for heavy tasks, 7B for lightweight)
- **Image Generation**: Pollinations.ai API (free, no key) + local Stable Diffusion 1.5 fallback
- **TTS**: edge-tts (Microsoft, free, no API key)
- **Video Compositing**: FFmpeg via moviepy
- **YouTube**: YouTube Data API v3 (OAuth2)
- **Email**: nodemailer via Gmail SMTP (App Password)

## Architecture

CLI pipeline with SQLite state. Node.js orchestrator spawns Python subprocesses for video generation. Phases run sequentially: Plan → Generate → Upload → Watch. Video generation parallelizes via a configurable worker pool.

No external dependencies beyond Ollama (must be running locally).

## .env Configuration

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

## Project Structure

```
youtube-agent/
├── .env
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # CLI entry point (commander.js)
│   ├── orchestrator.ts       # Main pipeline controller
│   ├── db.ts                 # SQLite schema + queries (better-sqlite3)
│   ├── agents/
│   │   ├── planner.ts        # 30-day content plan via Ollama
│   │   ├── uploader.ts       # YouTube Data API v3 upload
│   │   └── watcher.ts        # Comment polling + Gmail digest
│   ├── ollama/
│   │   └── client.ts         # Ollama API wrapper (7B/14B routing)
│   └── utils/
│       └── logger.ts         # Structured logging
├── video-engine/
│   ├── requirements.txt
│   ├── generate.py           # Main entry — called by Node
│   ├── scripts/
│   │   ├── writer.py         # Script generation via Ollama
│   │   ├── images.py         # Pollinations.ai + SD fallback
│   │   ├── tts.py            # edge-tts voiceover
│   │   ├── captions.py       # ASS subtitle generation
│   │   └── compositor.py     # FFmpeg — stitch everything
│   └── assets/
│       └── music/            # Royalty-free background tracks
├── data/
│   └── youtube-agent.db      # SQLite database
└── output/
    └── videos/               # Generated .mp4 files
```

## Database Schema

```sql
CREATE TABLE videos (
  id              INTEGER PRIMARY KEY,
  niche           TEXT NOT NULL,
  title           TEXT NOT NULL,
  description     TEXT,
  hashtags        TEXT,             -- JSON array
  tags            TEXT,             -- JSON array (YouTube tags)
  hook            TEXT,             -- opening hook line
  script          TEXT,             -- full narration script
  thumbnail_text  TEXT,
  scheduled_date  DATE,
  status          TEXT DEFAULT 'planned',
    -- planned → scripted → generating → rendered → uploaded
  video_path      TEXT,
  youtube_id      TEXT,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE comments (
  id                   INTEGER PRIMARY KEY,
  video_id             INTEGER REFERENCES videos(id),
  youtube_comment_id   TEXT UNIQUE,
  author               TEXT,
  text                 TEXT,
  published_at         DATETIME,
  notified             BOOLEAN DEFAULT 0,
  created_at           DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## Component Details

### 1. Planner Agent (`src/agents/planner.ts`)

Uses Ollama 14B to:
1. Read niches from .env
2. Decide video distribution across niches (AI-decided based on content potential)
3. Generate video ideas with titles, hooks, and angles for each niche
4. Generate metadata: descriptions, hashtags, tags, thumbnail text
5. Assign scheduled dates across 30 days
6. Save all video plans to SQLite with status="planned"

### 2. Video Engine (`video-engine/`)

One Python subprocess per video, spawned by Node orchestrator. Pipeline per video:

1. **Script Writer** (`writer.py`) — Ollama 14B generates full narration script with scene breakdowns from title + hook
2. **Image Generator** (`images.py`) — Pollinations.ai generates 8 images (1 per scene). Falls back to local Stable Diffusion 1.5 if API is down
3. **TTS Voiceover** (`tts.py`) — edge-tts converts script to MP3 audio (~3-4 minutes)
4. **Caption Generator** (`captions.py`) — Aligns script text to audio timestamps, generates ASS subtitle file
5. **Compositor** (`compositor.py`) — FFmpeg stitches images (with Ken Burns pan/zoom effects) + audio + captions + background music → final .mp4

Scene structure for a ~3.5 minute video:
- Hook: ~15s (attention-grabbing opening, zoom-in effect)
- Scenes 1-6: ~25s each (main content, Ken Burns pan/zoom)
- Outro: ~15s (CTA — subscribe, like, comment)
- Crossfade transitions between all scenes

Node ↔ Python interface:
```
python video-engine/generate.py --video-id 42 --db-path data/youtube-agent.db --output-dir output/videos/
```
Python reads the video plan from SQLite, updates status through the lifecycle, writes final .mp4.

### 3. Uploader Agent (`src/agents/uploader.ts`)

1. Queries SQLite for videos with status="rendered" and scheduled_date ≤ today
2. Refreshes OAuth2 access token using refresh token from .env
3. Uploads .mp4 via YouTube Data API v3 with title, description, tags, hashtags, category, privacy=public
4. Stores youtube_id in SQLite, sets status="uploaded"

### 4. Comment Watcher (`src/agents/watcher.ts`)

Polling loop:
1. Runs every 30 minutes (configurable via COMMENT_POLL_INTERVAL_MS)
2. For each uploaded video, fetches commentThreads from YouTube API
3. Deduplicates by youtube_comment_id, stores new comments in SQLite with notified=false

Daily digest:
1. Runs at configured hour (DIGEST_HOUR, default 9 AM)
2. Queries SQLite for comments with notified=false
3. Sends HTML email via nodemailer/Gmail SMTP containing:
   - Videos uploaded that day
   - New comments grouped by video (with preview of top comments)
   - Tomorrow's scheduled uploads
4. Marks all included comments as notified=true

## CLI Commands

```
npx youtube-agent plan              # Generate 30-day content plan
npx youtube-agent generate          # Generate next batch of videos (VIDEO_WORKERS at a time)
npx youtube-agent generate --video-id 42   # Generate a specific video
npx youtube-agent upload            # Upload all rendered videos due today
npx youtube-agent watch             # Start comment polling + daily digest loop
npx youtube-agent run               # Full autopilot: plan → generate → upload → watch
npx youtube-agent status            # Dashboard showing all 30 days with statuses
```

### `run` command (full autopilot)

1. Check if plan exists in SQLite — if not, run planner
2. Find videos with status="planned", generate in batches (VIDEO_WORKERS parallel)
3. Upload rendered videos with scheduled_date ≤ today
4. Enter watch mode (comment polling + daily digest)
5. Daily loop: generate any remaining pending videos → upload due ones → continue watching

## Error Handling

| Failure | Recovery |
|---|---|
| Ollama not running | Error on startup with clear message |
| Pollinations.ai down | Auto-fallback to local Stable Diffusion 1.5 |
| Video generation crash | Status stays "generating" — next run retries |
| YouTube upload fails | Status stays "rendered" — next upload cycle retries |
| YouTube API quota exceeded | Log warning, retry next day (quota resets daily) |
| Gmail send fails | Comments stay notified=false, included in next digest |
| Process killed/crash | SQLite state survives — `run` resumes from where it left off |

## Key Dependencies

### Node.js (package.json)
- `commander` — CLI framework
- `better-sqlite3` — SQLite driver
- `googleapis` — YouTube Data API v3
- `nodemailer` — Gmail SMTP
- `dotenv` — .env loading

### Python (requirements.txt)
- `edge-tts` — Microsoft TTS
- `Pillow` — Image processing
- `requests` — Pollinations.ai API
- `moviepy` — Video composition + Ken Burns
- `ffmpeg-python` — FFmpeg wrapper
- `diffusers` + `torch` (CPU) — Stable Diffusion 1.5 fallback
- `ollama` — Python Ollama client

## .gitignore

```
.env
data/
output/
node_modules/
dist/
video-engine/__pycache__/
video-engine/.venv/
.superpowers/
```
