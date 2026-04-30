# YouTube Agent

Automated YouTube channel manager that generates a 30-day content plan, creates AI-generated videos with voiceover and captions, uploads them to YouTube, monitors comments, and sends daily Gmail digest emails.

## How It Works

```
.env (credentials + niches)
        |
        v
  Planner Agent (Ollama 14B)
  Generates 30-day content plan
        |
        v
  Video Workers (Python x N)
  Script -> Images -> TTS -> Captions -> FFmpeg
        |
        v
  Uploader Agent (YouTube API)
  Uploads videos on scheduled dates
        |
        v
  Comment Watcher + Gmail Digest
  Polls comments, sends daily email summary
```

## Tech Stack

| Component | Technology |
|---|---|
| Orchestrator | Node.js / TypeScript |
| Video Engine | Python (moviepy, FFmpeg) |
| LLM | Ollama (Qwen 2.5 14B + 7B) |
| Image Generation | Pollinations.ai (free) + Stable Diffusion 1.5 fallback |
| Voiceover | edge-tts (Microsoft, free) |
| Captions | ASS subtitles burned via FFmpeg |
| Database | SQLite |
| YouTube | YouTube Data API v3 (OAuth2) |
| Email | Gmail SMTP via nodemailer |

## Prerequisites

- **Node.js** >= 18
- **Python** >= 3.10
- **FFmpeg** — macOS: `brew install ffmpeg`; Windows: `winget install Gyan.FFmpeg`
- **Ollama** — [ollama.com](https://ollama.com)

## Setup

macOS, Linux, or WSL:

```bash
# Clone and setup
git clone https://github.com/ShikherSinghal/youtube-agent.git
cd youtube-agent
bash scripts/setup.sh
```

Windows PowerShell:

```powershell
# Clone and setup
git clone https://github.com/ShikherSinghal/youtube-agent.git
cd youtube-agent
powershell -ExecutionPolicy Bypass -File .\scripts\setup.ps1

# Pull Ollama models
ollama pull qwen2.5:14b
ollama pull qwen2.5:7b

# Fill in credentials
notepad .env

# Build
npm run build
```

## Configuration

Copy `.env.example` to `.env` and fill in:

```env
# YouTube OAuth2 (from Google Cloud Console)
YOUTUBE_CLIENT_ID=your-client-id
YOUTUBE_CLIENT_SECRET=your-client-secret
YOUTUBE_REFRESH_TOKEN=your-refresh-token

# Gmail (use App Password, not regular password)
GMAIL_USER=you@gmail.com
GMAIL_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx

# Content niches (comma-separated)
NICHES=tech facts,space exploration,ancient history,psychology

# Ollama
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL_HEAVY=qwen2.5:14b
OLLAMA_MODEL_LIGHT=qwen2.5:7b

# Video settings
VIDEO_DURATION_SECS=210
VIDEO_WORKERS=2
IMAGES_PER_VIDEO=8

# Comment watcher
COMMENT_POLL_INTERVAL_MS=1800000
DIGEST_HOUR=9
```

## Usage

### Full Autopilot

```bash
npx youtube-agent run
```

This runs the entire pipeline: plan -> generate all videos -> upload scheduled ones -> monitor comments forever.

### Individual Commands

```bash
# Generate 30-day content plan
npx youtube-agent plan

# Generate next batch of videos
npx youtube-agent generate

# Generate a specific video
npx youtube-agent generate --video-id 42

# Upload rendered videos due today
npx youtube-agent upload

# Start comment monitoring + daily digest
npx youtube-agent watch

# View status dashboard
npx youtube-agent status
```

## Video Generation Pipeline

Each video goes through 5 stages:

1. **Script Writing** — Ollama generates narration with 8 scene breakdowns (hook + 6 scenes + outro)
2. **Image Generation** — Pollinations.ai creates one image per scene (falls back to local Stable Diffusion if API is down)
3. **TTS Voiceover** — edge-tts converts the narration to natural-sounding audio
4. **Caption Generation** — Script text is aligned to audio timestamps as ASS subtitles
5. **Compositing** — FFmpeg stitches images with Ken Burns pan/zoom effects + audio + burned-in captions

Output: ~3.5 minute `.mp4` video ready for YouTube.

## Video Lifecycle

Each video in the database moves through these statuses:

```
planned -> scripted -> generating -> rendered -> uploaded
```

If any step crashes, the status stays at its current value and the next `run` or `generate` will retry it.

## Project Structure

```
youtube-agent/
├── src/                    # Node.js orchestrator (TypeScript)
│   ├── index.ts            # CLI entry point
│   ├── orchestrator.ts     # Pipeline controller
│   ├── config.ts           # .env loading + validation
│   ├── db.ts               # SQLite database layer
│   ├── agents/
│   │   ├── planner.ts      # 30-day content plan
│   │   ├── uploader.ts     # YouTube upload
│   │   └── watcher.ts      # Comment monitoring + Gmail
│   └── ollama/
│       └── client.ts       # Ollama API client
├── video-engine/           # Python video generation
│   ├── generate.py         # Main entry point
│   └── scripts/
│       ├── writer.py       # Script generation
│       ├── images.py       # AI image generation
│       ├── tts.py          # Text-to-speech
│       ├── captions.py     # Subtitle generation
│       └── compositor.py   # FFmpeg compositing
├── tests/                  # Node.js tests (vitest)
├── video-engine/tests/     # Python tests (pytest)
├── data/                   # SQLite database
├── output/videos/          # Generated videos
└── scripts/setup.sh        # Project setup
```

## Testing

```bash
# Node.js tests (34 tests)
npm test

# Python tests (16 tests)
PYTHONPATH="video-engine" python -m pytest video-engine/tests/ -v
```

## Daily Digest Email

The watcher sends a daily email at the configured hour containing:

- Videos uploaded that day
- New comments grouped by video (with author and preview)
- Tomorrow's scheduled uploads

## Getting YouTube API Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project
3. Enable **YouTube Data API v3**
4. Create OAuth 2.0 credentials (Desktop app type)
5. Run the OAuth flow to get a refresh token
6. Add credentials to `.env`

## Getting Gmail App Password

1. Enable 2-Factor Authentication on your Google account
2. Go to [App Passwords](https://myaccount.google.com/apppasswords)
3. Generate a new app password for "Mail"
4. Add it to `.env` as `GMAIL_APP_PASSWORD`

## License

MIT
