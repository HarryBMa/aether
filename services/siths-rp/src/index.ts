import https from "https";
import fs from "fs";
import express from "express";
import helmet from "helmet";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { loadKeys } from "./token.js";
import { router } from "./routes.js";

async function main(): Promise<void> {
  await loadKeys();

  const app = express();
  app.use(helmet());
  app.disable("x-powered-by");
  app.use(express.json({ limit: "64kb" }));
  app.use(router);

  app.use((_req, res) => res.status(404).json({ error: "Not found" }));

  const tlsOptions: https.ServerOptions = {
    cert: fs.readFileSync(config.TLS_CERT),
    key: fs.readFileSync(config.TLS_KEY),
    ca: fs.readFileSync(config.SITHS_CA_BUNDLE),
    // Request client cert; verify it unless in dev mode
    requestCert: true,
    rejectUnauthorized: config.REQUIRE_CLIENT_CERT,
    // Only allow TLS 1.2+ (SITHS card readers require at least TLS 1.2)
    minVersion: "TLSv1.2",
  };

  const server = https.createServer(tlsOptions, app);

  server.listen(config.PORT, () => {
    logger.info("SITHS RP listening", {
      port: config.PORT,
      requireClientCert: config.REQUIRE_CLIENT_CERT,
    });
  });

  const shutdown = (signal: string): void => {
    logger.info(`Received ${signal}`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  console.error("Fatal", err);
  process.exit(1);
});
