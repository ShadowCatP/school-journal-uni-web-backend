import type { Response } from "express";
import type { Pool } from "mysql2/promise";

import { getDbPool } from "../db/pool";

export function getPoolOr503(res: Response): Pool | null {
  const pool = getDbPool();
  if (!pool) {
    res.status(503).json({ ok: false, error: "Database is not configured" });
    return null;
  }
  return pool;
}

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

export function asNonEmptyString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed.length ? trimmed : null;
}

export function isMysqlDuplicateError(err: unknown): boolean {
  return (
    isRecord(err) && typeof err.code === "string" && err.code === "ER_DUP_ENTRY"
  );
}
