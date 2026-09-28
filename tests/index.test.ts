import { describe, test, expect, afterAll } from "bun:test";
import { MemoryStore } from "../src/store";
import { Compactor } from "../src/compactor";
import { ZoClient } from "../src/client";
import { MemoryEntry, CompactionConfig } from "../src/types";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "compactor-test-"));
afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

function entry(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  return {
    id: Math.random().toString(36).slice(2),
    content: "some memory content",
    timestamp: new Date().toISOString(),
    importance: 5,
    tags: [],
    metadata: {},
    isCompacted: false,
    ...overrides,
  };
}

const config: CompactionConfig = {
  threshold: 5,
  maxEntriesPerCluster: 100,
  compactionIntervalDays: 1,
  llmModel: "test-model",
  storagePath: path.join(tmpDir, "unused.json"),
};

// Duck-typed stand-in for ZoClient: no network calls in tests.
class FakeClient {
  summarizeCalls: string[] = [];
  async summarize(content: string): Promise<string> {
    this.summarizeCalls.push(content);
    return "THE-SUMMARY";
  }
  async classifyImportance(content: string): Promise<number> {
    return content.includes("critical") ? 9 : 3;
  }
}

function asClient(fake: FakeClient): ZoClient {
  return fake as unknown as ZoClient;
}

describe("MemoryStore", () => {
  test("addEntry, getUncompacted, markAsCompacted", () => {
    const store = new MemoryStore(path.join(tmpDir, "store-a.json"));
    store.addEntry(entry({ id: "1" }));
    store.addEntry(entry({ id: "2", isCompacted: true }));
    expect(store.getUncompacted().map((m) => m.id)).toEqual(["1"]);
    store.markAsCompacted(["1"]);
    expect(store.getUncompacted().length).toBe(0);
  });

  test("save/load roundtrip persists memories and clusters", async () => {
    const file = path.join(tmpDir, "nested", "store-b.json");
    const store = new MemoryStore(file);
    await store.load(); // missing file -> starts empty
    expect(store.getAllMemories().length).toBe(0);
    store.addEntry(entry({ id: "m1", content: "persisted" }));
    (store as any).addCluster({
      id: "c1", entries: [], theme: "Temporal Group",
      startTime: "2026-01-01T00:00:00Z", endTime: "2026-01-01T00:00:00Z",
    });
    await store.save();
    const reloaded = new MemoryStore(file);
    await reloaded.load();
    const all = reloaded.getAllMemories();
    expect(all.length).toBe(1);
    expect(all[0].id).toBe("m1");
    expect((reloaded as any).clusters.length).toBe(1);
  });
});

describe("Compactor", () => {
  test("clusters entries into 24-hour windows", () => {
    const comp = new Compactor(new MemoryStore("unused.json"), asClient(new FakeClient()), config);
    const base = Date.UTC(2026, 0, 1, 12);
    const clusters = (comp as any).clusterByTime([
      entry({ id: "d1", timestamp: new Date(base).toISOString() }),
      entry({ id: "d2", timestamp: new Date(base + 3_600_000).toISOString() }),
      entry({ id: "d3", timestamp: new Date(base + 25 * 3_600_000).toISOString() }),
    ]);
    expect(clusters.length).toBe(2);
    expect(clusters[0].entries.map((e: MemoryEntry) => e.id)).toEqual(["d1", "d2"]);
    expect(clusters[1].entries.map((e: MemoryEntry) => e.id)).toEqual(["d3"]);
    expect(clusters[0].startTime).toBe(clusters[0].entries[0].timestamp);
  });

  test("run() summarizes low-importance memories and keeps critical raw", async () => {
    const fake = new FakeClient();
    const store = new MemoryStore(path.join(tmpDir, "run.json"));
    store.addEntry(entry({ id: "m1", importance: 2, content: "trivial note" }));
    store.addEntry(entry({ id: "m2", importance: 9, content: "critical decision" }));
    const comp = new Compactor(store, asClient(fake), config);
    await comp.run();

    const all = store.getAllMemories();
    const summary = all.find((m) => m.content.startsWith("SUMMARY:"));
    expect(summary).toBeDefined();
    expect(summary!.metadata.compactedIds).toEqual(["m1"]);
    expect(summary!.metadata.sourceCluster).toBeDefined();
    expect(all.find((m) => m.id === "m1")!.isCompacted).toBe(true);
    expect(all.find((m) => m.id === "m2")!.isCompacted).toBe(false);
    expect(fake.summarizeCalls.length).toBe(1);
    expect((store as any).clusters.length).toBe(1);
    expect((store as any).clusters[0].summary).toBe("THE-SUMMARY");
  });

  test("run() skips clusters containing only critical memories", async () => {
    const fake = new FakeClient();
    const store = new MemoryStore(path.join(tmpDir, "critical.json"));
    store.addEntry(entry({ id: "k1", importance: 9 }));
    const comp = new Compactor(store, asClient(fake), config);
    await comp.run();
    expect(fake.summarizeCalls.length).toBe(0);
    expect(store.getAllMemories().filter((m) => m.content.startsWith("SUMMARY:")).length).toBe(0);
    expect(store.getUncompacted().map((m) => m.id)).toEqual(["k1"]);
  });

  test("run() is a no-op when everything is already compacted", async () => {
    const fake = new FakeClient();
    const store = new MemoryStore(path.join(tmpDir, "noop.json"));
    store.addEntry(entry({ id: "z1", isCompacted: true }));
    const comp = new Compactor(store, asClient(fake), config);
    await comp.run();
    expect(fake.summarizeCalls.length).toBe(0);
  });
});
