#!/usr/bin/env node
import { Command } from "commander";
import dotenv from "dotenv";
import { loadConfig } from "./config.js";
import { Orchestrator } from "./orchestrator.js";

dotenv.config();

const program = new Command();

program
  .name("youtube-agent")
  .description("AI-powered YouTube channel automation agent")
  .version("1.0.0");

function createOrchestrator(): Orchestrator {
  const config = loadConfig();
  return new Orchestrator(config, "data/youtube-agent.db");
}

program
  .command("plan")
  .description("Generate a 30-day content plan using AI")
  .action(async () => {
    const orch = createOrchestrator();
    try {
      await orch.plan();
      orch.status();
    } catch (err) {
      console.error("Plan failed:", err instanceof Error ? err.message : err);
      process.exitCode = 1;
    } finally {
      orch.close();
    }
  });

program
  .command("generate")
  .description("Generate videos from planned content")
  .option("--video-id <id>", "Generate a specific video by ID", parseInt)
  .action(async (opts: { videoId?: number }) => {
    const orch = createOrchestrator();
    try {
      await orch.generate(opts.videoId);
      orch.status();
    } catch (err) {
      console.error("Generate failed:", err instanceof Error ? err.message : err);
      process.exitCode = 1;
    } finally {
      orch.close();
    }
  });

program
  .command("upload")
  .description("Upload rendered videos that are due")
  .action(async () => {
    const orch = createOrchestrator();
    try {
      await orch.upload();
      orch.status();
    } catch (err) {
      console.error("Upload failed:", err instanceof Error ? err.message : err);
      process.exitCode = 1;
    } finally {
      orch.close();
    }
  });

program
  .command("watch")
  .description("Start the comment watcher and digest loop")
  .action(async () => {
    const orch = createOrchestrator();
    try {
      await orch.watch();
    } catch (err) {
      console.error("Watch failed:", err instanceof Error ? err.message : err);
      process.exitCode = 1;
    } finally {
      orch.close();
    }
  });

program
  .command("run")
  .description("Full autopilot: plan, generate, upload, and watch")
  .action(async () => {
    const orch = createOrchestrator();
    try {
      await orch.run();
    } catch (err) {
      console.error("Run failed:", err instanceof Error ? err.message : err);
      process.exitCode = 1;
    } finally {
      orch.close();
    }
  });

program
  .command("status")
  .description("Show dashboard with video status counts")
  .action(() => {
    const orch = createOrchestrator();
    try {
      orch.status();
    } catch (err) {
      console.error("Status failed:", err instanceof Error ? err.message : err);
      process.exitCode = 1;
    } finally {
      orch.close();
    }
  });

program.parse();
