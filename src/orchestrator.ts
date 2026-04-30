import { spawn } from "child_process";
import { existsSync } from "fs";
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
      throw new Error("Ollama is not reachable. Please start Ollama and try again.");
    }

    if (this.db.hasVideos()) {
      logger.warn("Orchestrator", "Plan already exists. Skipping planning phase.");
      return;
    }

    const planner = new PlannerAgent(this.db, this.ollama);
    await planner.generatePlan(this.config.niches);
    logger.info("Orchestrator", "Content plan generated successfully.");
  }

  async generate(videoId?: number): Promise<void> {
    if (videoId !== undefined) {
      const video = this.db.getVideo(videoId);
      if (!video) {
        throw new Error(`Video with ID ${videoId} not found.`);
      }
      await this.generateOne(videoId);
      return;
    }

    const planned = this.db.getVideosByStatus("planned");
    if (planned.length === 0) {
      logger.info("Orchestrator", "No planned videos to generate.");
      return;
    }

    const workers = this.config.video.workers;
    logger.info("Orchestrator", `Generating ${planned.length} videos with ${workers} workers`);

    for (let i = 0; i < planned.length; i += workers) {
      const batch = planned.slice(i, i + workers);
      const promises = batch.map((v) => this.generateOne(v.id));
      await Promise.all(promises);
    }

    logger.info("Orchestrator", "All video generation complete.");
  }

  private generateOne(videoId: number): Promise<void> {
    const scriptPath = path.resolve("video-engine/generate.py");
    const dbPath = path.resolve("data/youtube-agent.db");
    const outputDir = path.resolve("output");
    const python = this.getPythonInvocation();

    return new Promise<void>((resolve, reject) => {
      logger.info("Orchestrator", `Starting generation for video ${videoId}`);
      logger.info("Orchestrator", `Using Python: ${python.command} ${python.args.join(" ")}`.trim());

      const child = spawn(python.command, [
        ...python.args,
        scriptPath,
        "--video-id", String(videoId),
        "--db-path", dbPath,
        "--output-dir", outputDir,
        "--ollama-host", this.config.ollama.host,
        "--ollama-model", this.config.ollama.heavyModel,
        "--duration-secs", String(this.config.video.durationSecs),
      ], {
        env: {
          ...process.env,
          PYTHONUNBUFFERED: "1",
        },
      });

      child.stdout.on("data", (data: Buffer) => {
        logger.info("Orchestrator", `[video-${videoId}] ${data.toString().trim()}`);
      });

      child.stderr.on("data", (data: Buffer) => {
        logger.warn("Orchestrator", `[video-${videoId}] ${data.toString().trim()}`);
      });

      child.on("close", (code, signal) => {
        if (code === 0) {
          logger.info("Orchestrator", `Video ${videoId} generation complete.`);
          resolve();
        } else {
          const reason = signal ? `signal ${signal}` : `exit code ${code}`;
          reject(new Error(`Video ${videoId} generation failed with ${reason}`));
        }
      });

      child.on("error", (err) => {
        reject(new Error(`Failed to spawn generator for video ${videoId}: ${err.message}`));
      });
    });
  }

  private getPythonInvocation(): { command: string; args: string[] } {
    if (process.env.PYTHON) {
      return { command: process.env.PYTHON, args: [] };
    }

    const windowsVenv = path.resolve("video-engine/.venv/Scripts/python.exe");
    if (existsSync(windowsVenv)) {
      return { command: windowsVenv, args: [] };
    }

    const unixVenv = path.resolve("video-engine/.venv/bin/python");
    if (existsSync(unixVenv)) {
      return { command: unixVenv, args: [] };
    }

    if (process.platform === "win32") {
      return { command: "py", args: ["-3"] };
    }

    return { command: "python3", args: [] };
  }

  async upload(): Promise<void> {
    const uploader = new UploaderAgent(this.db, this.config.youtube);
    const results = await uploader.uploadDue();
    logger.info("Orchestrator", `Uploaded ${results.length} video(s).`);
  }

  async watch(): Promise<void> {
    const watcher = new WatcherAgent(this.db, {
      youtube: this.config.youtube,
      gmail: this.config.gmail,
    });
    logger.info("Orchestrator", "Starting comment watcher loop...");
    await watcher.startWatchLoop(
      this.config.watcher.pollIntervalMs,
      this.config.watcher.digestHour,
    );
  }

  async run(): Promise<void> {
    logger.info("Orchestrator", "Starting full autopilot run...");

    // 1. Plan if needed
    await this.plan();

    // 2. Generate all planned videos
    await this.generate();

    // 3. Upload due videos
    await this.upload();

    // 4. Start watching comments
    await this.watch();
  }

  status(): void {
    const counts = this.db.getStatusCounts();
    const total = Object.values(counts).reduce((s, n) => s + n, 0);

    console.log("\n=== YouTube Agent Dashboard ===\n");
    console.log(`Total videos: ${total}`);
    console.log("Status breakdown:");
    for (const [status, count] of Object.entries(counts)) {
      console.log(`  ${status}: ${count}`);
    }

    const upcoming = this.db.getVideosByStatus("planned").slice(0, 5);
    if (upcoming.length > 0) {
      console.log("\nUpcoming planned videos:");
      for (const v of upcoming) {
        console.log(`  [${v.id}] ${v.title} (${v.scheduled_date})`);
      }
    }

    const dueForUpload = this.db.getVideosDueForUpload();
    if (dueForUpload.length > 0) {
      console.log(`\nVideos due for upload: ${dueForUpload.length}`);
    }

    console.log("");
  }

  close(): void {
    this.db.close();
  }
}
