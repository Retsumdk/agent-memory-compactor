/**
 * agent-memory-compactor - Core Compaction Logic
 */

import { randomUUID } from "crypto";
import { MemoryStore } from "./store";
import { ZoClient } from "./client";
import { MemoryEntry, MemoryCluster, CompactionConfig } from "./types";

export class Compactor {
  private store: MemoryStore;
  private client: ZoClient;
  private config: CompactionConfig;

  constructor(store: MemoryStore, client: ZoClient, config: CompactionConfig) {
    this.store = store;
    this.client = client;
    this.config = config;
  }

  /**
   * Main compaction loop
   */
  async run(): Promise<void> {
    const uncompacted = this.store.getUncompacted();
    if (uncompacted.length === 0) {
      console.log("No new memories to compact.");
      return;
    }

    console.log(`Analyzing ${uncompacted.length} uncompacted memories...`);

    // Step 1: Group memories by semantic similarity or time
    // For simplicity in this implementation, we'll group by time windows (e.g., daily)
    const clusters = this.clusterByTime(uncompacted);
    console.log(`Formed ${clusters.length} temporal clusters.`);

    for (const cluster of clusters) {
      await this.processCluster(cluster);
    }

    await this.store.save();
    console.log("Compaction complete.");
  }

  private clusterByTime(entries: MemoryEntry[]): MemoryCluster[] {
    const sorted = [...entries].sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const clusters: MemoryCluster[] = [];
    let currentCluster: MemoryEntry[] = [];
    
    for (const entry of sorted) {
      if (currentCluster.length === 0) {
        currentCluster.push(entry);
        continue;
      }

      const firstInCluster = new Date(currentCluster[0].timestamp);
      const entryTime = new Date(entry.timestamp);
      
      // If within 24 hours of cluster start, add to current
      if (entryTime.getTime() - firstInCluster.getTime() < 24 * 60 * 60 * 1000) {
        currentCluster.push(entry);
      } else {
        clusters.push(this.createClusterObject(currentCluster));
        currentCluster = [entry];
      }
    }

    if (currentCluster.length > 0) {
      clusters.push(this.createClusterObject(currentCluster));
    }

    return clusters;
  }

  private createClusterObject(entries: MemoryEntry[]): MemoryCluster {
    const sorted = [...entries].sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    
    return {
      id: randomUUID(),
      entries: sorted,
      theme: "Temporal Group",
      startTime: sorted[0].timestamp,
      endTime: sorted[sorted.length - 1].timestamp
    };
  }

  private async processCluster(cluster: MemoryCluster): Promise<void> {
    console.log(`Processing cluster ${cluster.id} (${cluster.entries.length} entries)...`);

    // Filter out very important entries - we keep raw copies of those
    const toCompact = cluster.entries.filter(e => e.importance < this.config.threshold);
    const critical = cluster.entries.filter(e => e.importance >= this.config.threshold);

    if (toCompact.length === 0) {
      console.log(`- Cluster ${cluster.id} has only critical memories. Skipping compaction.`);
      return;
    }

    const textToSummarize = toCompact
      .map(e => `[${e.timestamp}] ${e.content}`)
      .join("\n");

    try {
      const summary = await this.client.summarize(textToSummarize);
      console.log(`- Generated summary for ${toCompact.length} memories.`);

      // Create a new summary entry
      const summaryEntry: MemoryEntry = {
        id: randomUUID(),
        content: `SUMMARY: ${summary}`,
        timestamp: new Date().toISOString(),
        importance: Math.max(...toCompact.map(e => e.importance)),
        tags: [...new Set(toCompact.flatMap(e => e.tags)), "summary"],
        metadata: {
          originalCount: toCompact.length,
          sourceCluster: cluster.id,
          compactedIds: toCompact.map(e => e.id)
        },
        isCompacted: false,
        parentId: undefined
      };

      this.store.addEntry(summaryEntry);
      this.store.markAsCompacted(toCompact.map(e => e.id));
      
      cluster.summary = summary;
      this.store.addCluster(cluster);
      
    } catch (e) {
      console.error(`- Failed to summarize cluster ${cluster.id}:`, e);
    }
  }

  async addRawMemory(content: string, tags: string[] = []): Promise<void> {
    const importance = await this.client.classifyImportance(content);
    const entry: MemoryEntry = {
      id: randomUUID(),
      content,
      timestamp: new Date().toISOString(),
      importance,
      tags,
      metadata: {},
      isCompacted: false
    };
    this.store.addEntry(entry);
    await this.store.save();
    console.log(`Added memory with importance ${importance}.`);
  }
}
