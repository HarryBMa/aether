import express from "express";
import helmet from "helmet";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { matrixRouter } from "./matrix.js";

const app = express();
app.use(helmet());
app.disable("x-powered-by");
app.use(express.json({ limit: "64kb" }));

// Protect all non-Matrix-spec endpoints with API key
app.use("/hsa", (req, res, next) => {
  const key = req.headers["x-api-key"];
  if (key !== config.API_KEY) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
});

app.use(matrixRouter);

app.use((_req, res) => res.status(404).json({ error: "Not found" }));

const server = app.listen(config.PORT, () => {
  logger.info("HSA bridge listening", {
    port: config.PORT,
    ldap: config.HSA_LDAP_URL,
    domain: config.MATRIX_DOMAIN,
  });
});

const shutdown = () => {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
