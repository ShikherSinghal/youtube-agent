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

function parseIntEnv(key: string, fallback: string): number {
  const raw = optionalEnv(key, fallback);
  const parsed = parseInt(raw, 10);
  if (isNaN(parsed)) {
    throw new Error(`Invalid integer for env var ${key}: "${raw}"`);
  }
  return parsed;
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
      durationSecs: parseIntEnv("VIDEO_DURATION_SECS", "210"),
      workers: parseIntEnv("VIDEO_WORKERS", "2"),
      imagesPerVideo: parseIntEnv("IMAGES_PER_VIDEO", "8"),
    },
    watcher: {
      pollIntervalMs: parseIntEnv("COMMENT_POLL_INTERVAL_MS", "1800000"),
      digestHour: parseIntEnv("DIGEST_HOUR", "9"),
    },
  };
}
