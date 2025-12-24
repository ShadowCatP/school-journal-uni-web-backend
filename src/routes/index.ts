import { Router } from "express";

import { getDbPool } from "../db/pool";
import usersRoutes from "./users";
import authRoutes from "./auth";

const router = Router();

router.use("/auth", authRoutes);
router.use("/users", usersRoutes);

router.get("/", async (req, res) => {
  res.send("Hello World");
});

router.get("/db", async (req, res) => {
  try {
    const pool = getDbPool();
    if (!pool) {
      return res.status(503).json({ error: "Database unavailable" });
    }

    const [rows] = await pool.query("SELECT 1 AS db_alive");
    return res.json(rows);
  } catch (err) {
    return res.status(503).json({ error: err });
  }
});

export default router;
