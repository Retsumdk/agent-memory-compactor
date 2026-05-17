/**
 * agent-memory-compactor - Types
 */

export interface MemoryEntry {
  id: string;
  content: string;
  timestamp: string;
  importance: number; // 1-10
  tags: string[];
  metadata: Record<string, any>;
  isCompacted: boolean;
  parentId?: string; // If this is a summary of other memories
}

export interface MemoryCluster {
  id: string;
  entries: MemoryEntry[];
  summary?: string;
  theme: string;
  startTime: string;
  endTime: string;
}

export interface CompactionConfig {
  threshold: number; // Importance threshold to keep raw
  maxEntriesPerCluster: number;
  compactionIntervalDays: number;
  llmModel: string;
  storagePath: string;
}

export interface ZoAskResponse {
  output: string;
  error?: string;
}
