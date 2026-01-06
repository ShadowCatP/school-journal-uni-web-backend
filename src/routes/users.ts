import { Router } from "express";
import type { ResultSetHeader } from "mysql2/promise";
import bcrypt from "bcrypt";

import { UserRow } from "../schemas/user.schema";
import {
  asNonEmptyString,
  getPoolOr503,
  isMysqlDuplicateError,
  isRecord,
} from "../utils/db.utils";
import {
  authenticateToken,
  authorizeRoles,
} from "../middleware/auth.middleware";

const router = Router();

router.get(
  "/",
  authenticateToken,
  authorizeRoles("staff", "teacher"),
  async (req, res) => {
    const pool = getPoolOr503(res);
    if (!pool) return;

    const [rows] = await pool.execute<UserRow[]>(
      "SELECT user_id, first_name, middle_name, last_name, email, pesel, created_at, updated_at FROM User ORDER BY user_id DESC"
    );

    return res.json(rows);
  }
);

router.get(
  "/:id",
  authenticateToken,
  authorizeRoles("staff", "teacher"),
  async (req, res) => {
    const pool = getPoolOr503(res);
    if (!pool) return;

    const userId = Number(req.params.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ error: "Invalid user id" });
    }

    const [rows] = await pool.execute<UserRow[]>(
      "SELECT user_id, first_name, middle_name, last_name, email, pesel, created_at, updated_at FROM User WHERE user_id = ?",
      [userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.json(rows[0]);
  }
);

router.post(
  "/",
  authenticateToken,
  authorizeRoles("staff"),
  async (req, res) => {
    const pool = getPoolOr503(res);
    if (!pool) return;

    const first_name = asNonEmptyString(req.body?.first_name);
    const middle_name_raw = req.body?.middle_name;
    const middle_name =
      middle_name_raw === null || middle_name_raw === undefined ?
        null
      : asNonEmptyString(middle_name_raw);
    const last_name = asNonEmptyString(req.body?.last_name);
    const email = asNonEmptyString(req.body?.email);
    const password = asNonEmptyString(req.body?.password);
    const pesel = asNonEmptyString(req.body?.pesel);

    if (!first_name || !last_name || !email || !password || !pesel) {
      return res.status(400).json({
        error: "Missing required fields",
        required: ["first_name", "last_name", "email", "password", "pesel"],
      });
    }

    if (pesel.length !== 11) {
      return res.status(400).json({ error: "PESEL must be 11 characters" });
    }

    try {
      const hashedPassword = await bcrypt.hash(password, 10);

      const [result] = await pool.execute<ResultSetHeader>(
        "INSERT INTO User (first_name, middle_name, last_name, email, password_hash, pesel) VALUES (?, ?, ?, ?, ?, ?)",
        [first_name, middle_name, last_name, email, hashedPassword, pesel]
      );

      const [rows] = await pool.execute<UserRow[]>(
        "SELECT user_id, first_name, middle_name, last_name, email, pesel, created_at, updated_at FROM User WHERE user_id = ?",
        [result.insertId]
      );

      return res.status(201).json(rows.length ? rows[0] : null);
    } catch (err) {
      if (isMysqlDuplicateError(err)) {
        return res.status(409).json({ error: "Email or PESEL already exists" });
      }
      return res.status(500).json({ error: "Failed to create user" });
    }
  }
);

router.put(
  "/:id",
  authenticateToken,
  authorizeRoles("staff"),
  async (req, res) => {
    const pool = getPoolOr503(res);
    if (!pool) return;

    const userId = Number(req.params.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ error: "Invalid user id" });
    }

    const patch: Record<string, unknown> = isRecord(req.body) ? req.body : {};

    const allowed = {
      first_name: asNonEmptyString(patch.first_name),
      middle_name:
        patch.middle_name === null || patch.middle_name === undefined ?
          undefined
        : asNonEmptyString(patch.middle_name),
      last_name: asNonEmptyString(patch.last_name),
      email: asNonEmptyString(patch.email),
      password: asNonEmptyString(patch.password),
      pesel: asNonEmptyString(patch.pesel),
    };

    if (allowed.pesel && allowed.pesel.length !== 11) {
      return res.status(400).json({ error: "PESEL must be 11 characters" });
    }

    const sets: string[] = [];
    const values: unknown[] = [];

    if (allowed.first_name) {
      sets.push("first_name = ?");
      values.push(allowed.first_name);
    }
    if (allowed.middle_name !== undefined) {
      sets.push("middle_name = ?");
      values.push(allowed.middle_name);
    }
    if (allowed.last_name) {
      sets.push("last_name = ?");
      values.push(allowed.last_name);
    }
    if (allowed.email) {
      sets.push("email = ?");
      values.push(allowed.email);
    }
    if (allowed.password) {
      sets.push("password_hash = ?");
      values.push(await bcrypt.hash(allowed.password, 10));
    }
    if (allowed.pesel) {
      sets.push("pesel = ?");
      values.push(allowed.pesel);
    }

    if (sets.length === 0) {
      return res.status(400).json({ error: "No valid fields to update" });
    }

    try {
      const [result] = await pool.execute<ResultSetHeader>(
        `UPDATE User SET ${sets.join(", ")} WHERE user_id = ?`,
        [...values, userId]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: "User not found" });
      }

      const [rows] = await pool.execute<UserRow[]>(
        "SELECT user_id, first_name, middle_name, last_name, email, pesel, created_at, updated_at FROM User WHERE user_id = ?",
        [userId]
      );

      return res.json(rows.length ? rows[0] : null);
    } catch (err) {
      if (isMysqlDuplicateError(err)) {
        return res.status(409).json({ error: "Email or PESEL already exists" });
      }
      return res.status(500).json({ error: "Failed to update user" });
    }
  }
);

router.delete(
  "/:id",
  authenticateToken,
  authorizeRoles("staff"),
  async (req, res) => {
    const pool = getPoolOr503(res);
    if (!pool) return;

    const userId = Number(req.params.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ error: "Invalid user id" });
    }

    const [result] = await pool.execute<ResultSetHeader>(
      "DELETE FROM User WHERE user_id = ?",
      [userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.status(204).send();
  }
);

export default router;
