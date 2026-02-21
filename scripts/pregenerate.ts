/**
 * Pregenerate wikis for example repositories.
 *
 * Usage:
 *   npx tsx scripts/pregenerate.ts
 *
 * Reads .env.local for API keys. Processes repos sequentially to stay
 * within rate limits.
 */

import * as fs from "fs";
import * as path from "path";

// Load .env.local manually since we're outside Next.js
const envPath = path.resolve(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

// Now import project modules (they read process.env at call time)
import { runAnalysisPipeline } from "../src/lib/analyzer";
import type { AnalysisEvent } from "../src/lib/types";

const EXAMPLE_REPOS = [
  { owner: "Textualize", repo: "rich-cli" },
  { owner: "browser-use", repo: "browser-use" },
  { owner: "tastejs", repo: "todomvc" },
];

async function main() {
  console.log("=== Cubic Wiki — Pregeneration Script ===\n");
  console.log(`Processing ${EXAMPLE_REPOS.length} repositories...\n`);

  for (const { owner, repo } of EXAMPLE_REPOS) {
    console.log(`\n${"─".repeat(60)}`);
    console.log(`▶ ${owner}/${repo}`);
    console.log(`${"─".repeat(60)}`);

    const startTime = Date.now();

    const onEvent = (event: AnalysisEvent) => {
      switch (event.type) {
        case "status":
          console.log(`  [${event.status}] ${event.message}`);
          break;
        case "feature_started":
          console.log(`  → Generating: ${event.featureTitle}`);
          break;
        case "feature_done":
          console.log(`  ✓ Done: ${event.featureTitle}`);
          break;
        case "done":
          console.log(`  ✅ Wiki ID: ${event.wikiId}`);
          break;
        case "error":
          console.error(`  ❌ Error: ${event.message}`);
          break;
      }
    };

    try {
      const wikiId = await runAnalysisPipeline(owner, repo, onEvent);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`  Completed in ${elapsed}s — wiki: ${wikiId}`);
    } catch (err) {
      console.error(`  FAILED:`, err);
    }
  }

  console.log("\n=== Pregeneration complete ===");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
