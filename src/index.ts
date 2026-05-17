#!/usr/bin/env bun
/**
 * agent-memory-compactor - CLI Entrypoint
 * 
 * Background service for semantic summarization and compaction of 
 * long-term agent memories to maintain context efficiency.
 * 
 * Built by Retsumdk
 */

import { Command } from "commander";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { MemoryStore } from "./store";
import { ZoClient } from "./client";
import { Compactor } from "./compactor";
import { CompactionConfig } from "./types";

const APP_NAME = "agent-memory-compactor";
const DEFAULT_STORE_PATH = join(process.cwd(), "data", "memories.json");

const DEFAULTS: CompactionConfig = {
  threshold: 8,
  maxEntriesPerCluster: 20,
  compactionIntervalDays: 7,
  llmModel: "byok:0cf92f1b-88df-402e-89b6-158fac1470b3",
  storagePath: DEFAULT_STORE_PATH,
};

function loadConfig(configPath?: string): CompactionConfig {
  const path = configPath || join(process.cwd(), "config.json");
  if (existsSync(path)) {
    try {
      const data = JSON.parse(readFileSync(path, "utf-8"));
      return { ...DEFAULTS, ...data };
    } catch (e) {
      console.warn(`Warning: Could not parse config at ${path}, using defaults.`);
    }
  }
  return { ...DEFAULTS };
}

async function runCompaction(opts: any) {
  const config = loadConfig(opts.config);
  const token = process.env.ZO_CLIENT_IDENTITY_TOKEN || process.env.ZO_API_KEY;

  if (!token) {
    console.error("Error: ZO_CLIENT_IDENTITY_TOKEN or ZO_API_KEY is required.");
    process.exit(1);
  }

  const store = new MemoryStore(config.storagePath);
  await store.load();

  const client = new ZoClient(token, config.llmModel);
  const compactor = new Compactor(store, client, config);

  if (opts.add) {
    console.log(`Adding new memory: "${opts.add}"`);
    await compactor.addRawMemory(opts.add, opts.tags?.split(",") || []);
  }

  if (opts.compact || !opts.add) {
    console.log("Starting compaction cycle...");
    await compactor.run();
  }

  if (opts.list) {
    const memories = store.getAllMemories();
    console.log(`\n--- Memory List (${memories.length} total) ---`);
    for (const m of memories) {
      const status = m.isCompacted ? "[COMPACTED]" : "[RAW]";
      console.log(`[${m.timestamp}] ${status} (Imp: ${m.importance}) ${m.content.substring(0, 100)}${m.content.length > 100 ? "..." : ""}`);
    }
  }
}

const program = new Command();
program
  .name(APP_NAME)
  .description("Maintain agent context efficiency via semantic compaction")
  .version("1.0.0");

program
  .option("-c, --config <path>", "Path to config.json")
  .option("-a, --add <text>", "Add a new raw memory entry")
  .option("-t, --tags <tags>", "Comma-separated tags for the new memory")
  .option("-k, --compact", "Explicitly trigger a compaction cycle")
  .option("-l, --list", "List all memories in the store")
  .option("-v, --verbose", "Enable verbose logging")
  .action(async (opts) => {
    try {
      await runCompaction(opts);
    } catch (e) {
      console.error(`Fatal Error: ${e instanceof Error ? e.message : e}`);
      if (opts.verbose) console.error(e);
      process.exit(1);
    }
  });

// Support for running as a daemon/background process
program
  .command("daemon")
  .description("Run the compactor in background mode")
  .option("-i, --interval <minutes>", "Interval between compaction cycles", "60")
  .action(async (opts) => {
    const intervalMs = parseInt(opts.interval) * 60 * 1000;
    console.log(`[${APP_NAME}] Daemon started. Interval: ${opts.interval} minutes.`);
    
    const cycle = async () => {
      console.log(`[${new Date().toISOString()}] Running scheduled compaction...`);
      try {
        await runCompaction({ compact: true });
      } catch (e) {
        console.error("Scheduled cycle failed:", e);
      }
    };

    await cycle();
    setInterval(cycle, intervalMs);
  });

program.parse(process.argv);

/**
 * Technical implementation details:
 * - Uses Bun for high-performance execution.
 * - Leverages Zo Computer's internal /zo/ask API for intelligent summarization.
 * - Implements a temporal clustering algorithm to group related memories.
 * - Preserves high-importance (critical) memories in their raw form.
 * - Maintains an immutable-style ledger of memory transformations.
 * 
 * Future Roadmap:
 * - Vector-based semantic clustering for non-temporal grouping.
 * - Support for hierarchical compaction (summaries of summaries).
 * - Integration with external vector databases.
 */
