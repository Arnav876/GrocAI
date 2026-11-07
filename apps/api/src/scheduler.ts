import dotenv from "dotenv";
dotenv.config();

import { PrismaClient } from "@prisma/client";
import { ConnectorRegistry } from "./connectors/registry.js";
import { CatalogBackgroundService } from "./services/catalogJobs.js";
import { PostgresScrapeQueue } from "./ingestion/queue.js";

const prisma = new PrismaClient();
const registry = new ConnectorRegistry(prisma);
const queue = new PostgresScrapeQueue(prisma);
const catalogJobs = new CatalogBackgroundService(prisma, registry, queue);

const intervalMs = parseInt(
  process.env.CATALOG_MAINTENANCE_INTERVAL_MS || String(15 * 60 * 1000),
  10
);

async function runOnce(): Promise<void> {
  const metrics = await catalogJobs.runMaintenanceCycle();
  console.log("[Scheduler] Maintenance cycle complete:", JSON.stringify(metrics));
}

async function main(): Promise<void> {
  await runOnce();

  if (process.argv.includes("--once")) {
    await prisma.$disconnect();
    return;
  }

  console.log(`[Scheduler] Running every ${intervalMs}ms`);
  catalogJobs.startPeriodic(intervalMs);

  const shutdown = async (signal: string) => {
    console.log(`[Scheduler] ${signal} received, stopping...`);
    catalogJobs.stop();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch(async (err) => {
  console.error("[Scheduler] Fatal error:", err);
  await prisma.$disconnect();
  process.exit(1);
});
