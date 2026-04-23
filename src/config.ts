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
