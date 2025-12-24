import { Router } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { getPoolOr503, asNonEmptyString } from "../utils/db.utils";
import config from "../config/config";
import { UserWithPassword } from "../schemas/user.schema";
import { Role } from "../types/auth";
import { RowDataPacket } from "mysql2";

const router = Router();

router.post("/login", async (req, res) => {
  const pool = getPoolOr503(res);
  if (!pool) return;

  const email = asNonEmptyString(req.body?.email);
  const password = asNonEmptyString(req.body?.password);

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  try {
    const [users] = await pool.execute<(RowDataPacket & UserWithPassword)[]>(
      "SELECT * FROM User WHERE email = ?",
      [email]
    );

    if (users.length === 0) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const user = users[0];

    let passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch && user.password_hash === password) {
      passwordMatch = true;
    }

    if (!passwordMatch) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    let role: Role | null = null;

    const [staff] = await pool.execute<RowDataPacket[]>(
      `SELECT O.occupation 
            FROM Staff S 
            JOIN Occupations O ON S.occupation_id = O.occupation_id 
            WHERE S.user_id = ?`,
      [user.user_id]
    );

    if (staff.length > 0) {
      const occupation = staff[0].occupation;
      if (occupation === "Nauczyciel") {
        role = "teacher";
      } else {
        role = "school_staff";
      }
    } else {
      const [students] = await pool.execute<RowDataPacket[]>(
        "SELECT 1 FROM Student WHERE user_id = ?",
        [user.user_id]
      );
      if (students.length > 0) {
        role = "student";
      } else {
        const [parents] = await pool.execute<RowDataPacket[]>(
          "SELECT 1 FROM Parent WHERE user_id = ?",
          [user.user_id]
        );
        if (parents.length > 0) {
          role = "parent";
        }
      }
    }

    if (!role) {
      return res.status(403).json({ error: "User has no assigned role" });
    }

    const token = jwt.sign(
      { user_id: user.user_id, email: user.email, role },
      config.jwtSecret,
      { expiresIn: "1h" }
    );

    // Don't send password_hash back
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password_hash, ...userWithoutPassword } = user;

    return res.json({ token, user: { ...userWithoutPassword, role } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Login failed" });
  }
});

export default router;
