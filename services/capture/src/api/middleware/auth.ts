import type { Request, Response, NextFunction } from "express";
import { config } from "../../config.js";

export function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers["x-api-key"];
  if (!header || header !== config.SERVICE_API_KEY) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}
