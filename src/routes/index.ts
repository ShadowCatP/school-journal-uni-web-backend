import { Router } from "express";

import { getDbPool } from "../db/pool";

const router = Router();

router.get("/", async (req, res) => {
  res.send("Hello World");
});

router.get("/db", async (req, res) => {
  try {
    const pool = getDbPool();
    if (!pool) {
      return res.status(503).json({ ok: false });
    }

    const [rows] = await pool.query("SELECT 1 AS db_alive");
    return res.json({ ok: true, rows });
  } catch (err) {
    return res.status(503).json({ ok: false, msg: err });
  }
});

export default router;
