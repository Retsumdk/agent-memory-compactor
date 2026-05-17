# agent-memory-compactor

Background service for semantic summarization and compaction of long-term agent memories to maintain context efficiency.

## Overview

As AI agents interact with users over long periods, their "memory" (history, context) can grow large and redundant. `agent-memory-compactor` solves this by:
1.  **Semantic Analysis**: Classifying memory importance using LLMs.
2.  **Temporal Clustering**: Grouping related memories within time windows.
3.  **Semantic Compaction**: Using LLMs to summarize clusters of low-importance memories into high-density facts.
4.  **Critical Preservation**: Keeping high-importance memories in their raw form for precision.

## Features

- **Production-Ready**: Written in TypeScript with full type safety.
- **Zo Integration**: Built specifically for the Zo Computer ecosystem, using the internal `/zo/ask` API.
- **Configurable**: Adjustable thresholds for importance and compaction frequency.
- **Daemon Mode**: Can run as a background service to continuously maintain efficiency.

## Installation

```bash
git clone https://github.com/Retsumdk/agent-memory-compactor.git
cd agent-memory-compactor
bun install
```

## Usage

### Add a new memory
```bash
bun run src/index.ts --add "User mentioned they like dark mode." --tags "ui,preference"
```

### Run compaction
```bash
bun run src/index.ts --compact
```

### List memories
```bash
bun run src/index.ts --list
```

### Run as a daemon
```bash
bun run src/index.ts daemon --interval 60
```

## Configuration

The service uses a `config.json` file:

```json
{
  "threshold": 8,
  "maxEntriesPerCluster": 20,
  "compactionIntervalDays": 7,
  "storagePath": "./data/memories.json"
}
```

## Architecture

```
CLI (index.ts) -> Compactor (compactor.ts) -> MemoryStore (store.ts)
                                          -> ZoClient (client.ts) -> Zo API
```

## License

MIT License

---

Built by [Retsumdk](https://github.com/Retsumdk)
