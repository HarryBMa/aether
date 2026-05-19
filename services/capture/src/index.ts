import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { initStore } from "./store.js";
import { initAudit, closeAudit } from "./audit.js";
import { startMatrixSync, stopMatrixSync, purgeExpiredBuffers } from "./matrix/client.js";
import { purgeExpiredTokens } from "./siths.js";
import { requireApiKey } from "./api/middleware/auth.js";
import { capturesRouter } from "./api/routes/captures.js";
import { healthRouter } from "./api/routes/health.js";

async function main(): Promise<void> {
  initStore();
  initAudit();

  const app = express();

  app.use(helmet());
  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" })); // API requests only; images travel via Matrix media

  app.use(
    rateLimit({
      windowMs: 60_000,
      max: 120,
      standardHeaders: true,
      legacyHeaders: false,
    })
  );

  // Health endpoint — no auth required
  app.use("/health", healthRouter);

  // All other routes require API key
  app.use("/captures", requireApiKey, capturesRouter);

  app.use((req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  const server = app.listen(config.PORT, () => {
    logger.info("Capture service listening", { port: config.PORT });
  });

  // Periodic maintenance: purge expired image buffers and step-up tokens
  const maintenanceInterval = setInterval(() => {
    purgeExpiredBuffers();
    purgeExpiredTokens();
  }, 60_000);

  // Start Matrix sync loop (non-blocking)
  startMatrixSync().catch((err) => {
    logger.error("Matrix sync loop crashed", { err });
    process.exit(1);
  });

  const shutdown = (signal: string): void => {
    logger.info(`Received ${signal}, shutting down`);
    clearInterval(maintenanceInterval);
    stopMatrixSync();
    server.close(() => {
      closeAudit();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  console.error("Fatal startup error", err);
  process.exit(1);
});
