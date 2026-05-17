/**
 * agent-memory-compactor - Zo API Client
 */

import { ZoAskResponse } from "./types";

export class ZoClient {
  private baseUrl = "https://api.zo.computer/zo/ask";
  private token: string;
  private model: string;

  constructor(token: string, model: string = "byok:0cf92f1b-88df-402e-89b6-158fac1470b3") {
    this.token = token;
    this.model = model;
  }

  async summarize(content: string): Promise<string> {
    const prompt = `
Summarize the following agent memories into a concise, high-density factual summary.
Preserve key dates, names, decisions, and outcomes.
Focus on extracting durable knowledge that would be useful for long-term recall.

Memories to summarize:
${content}

Output only the summary text.
`;

    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: prompt,
        model_name: this.model,
      }),
    });

    if (!response.ok) {
      throw new Error(`Zo API error: ${response.status} ${await response.text()}`);
    }

    const data = (await response.json()) as ZoAskResponse;
    return data.output.trim();
  }

  async classifyImportance(content: string): Promise<number> {
    const prompt = `
On a scale of 1-10, how important is this memory for long-term agent continuity?
1 = Trivial/Transient (e.g., "User said hello")
5 = Useful (e.g., "User preferred a specific coding style")
10 = Critical (e.g., "Final decision on project architecture", "Major security credential change")

Memory: "${content}"

Respond with only the number.
`;

    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: prompt,
        model_name: this.model,
      }),
    });

    if (!response.ok) return 5; // Default to mid-importance on error

    const data = (await response.json()) as ZoAskResponse;
    const score = parseInt(data.output.trim());
    return isNaN(score) ? 5 : Math.max(1, Math.min(10, score));
  }
}
