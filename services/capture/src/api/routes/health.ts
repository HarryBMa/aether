import { Router } from "express";

export const healthRouter = Router();

const startedAt = new Date().toISOString();

healthRouter.get("/", (_req, res) => {
  res.json({ status: "ok", startedAt, uptime: process.uptime() });
});
