/**
 * agent-memory-compactor - Memory Store
 */

import { writeFile, readFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { dirname } from "path";
import { MemoryEntry, MemoryCluster } from "./types";

export class MemoryStore {
  private path: string;
  private memories: MemoryEntry[] = [];
  private clusters: MemoryCluster[] = [];

  constructor(path: string) {
    this.path = path;
  }

  async load(): Promise<void> {
    if (!existsSync(this.path)) return;
    try {
      const data = await readFile(this.path, "utf-8");
      const parsed = JSON.parse(data);
      this.memories = parsed.memories || [];
      this.clusters = parsed.clusters || [];
    } catch (e) {
      console.error("Failed to load memory store:", e);
    }
  }

  async save(): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(
      this.path,
      JSON.stringify({ memories: this.memories, clusters: this.clusters }, null, 2)
    );
  }

  addEntry(entry: MemoryEntry): void {
    this.memories.push(entry);
  }

  getUncompacted(): MemoryEntry[] {
    return this.memories.filter(m => !m.isCompacted);
  }

  markAsCompacted(ids: string[]): void {
    this.memories = this.memories.map(m => 
      ids.includes(m.id) ? { ...m, isCompacted: true } : m
    );
  }

  addCluster(cluster: MemoryCluster): void {
    this.clusters.push(cluster);
  }

  getAllMemories(): MemoryEntry[] {
    return this.memories;
  }
}
