import { Router } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import {
  getPoolOr503,
  asNonEmptyString,
  isMysqlDuplicateError,
} from "../utils/db.utils";
import config from "../config/config";
import { UserWithPassword } from "../schemas/user.schema";
import { Role } from "../types/auth";
import { RowDataPacket, ResultSetHeader } from "mysql2";

const router = Router();

router.post("/register", async (req, res) => {
  const pool = getPoolOr503(res);
  if (!pool) return;

  const email = asNonEmptyString(req.body?.email);
  const password = asNonEmptyString(req.body?.password);
  const firstName = asNonEmptyString(req.body?.first_name);
  const lastName = asNonEmptyString(req.body?.last_name);
  const pesel = asNonEmptyString(req.body?.pesel);
  const role = asNonEmptyString(req.body?.role) || "student";

  if (!email || !password || !firstName || !lastName || !pesel) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  if (pesel.length !== 11) {
    return res.status(400).json({ error: "PESEL must be 11 characters" });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const [result] = await connection.execute<ResultSetHeader>(
        `INSERT INTO User (first_name, last_name, email, password_hash, pesel) 
         VALUES (?, ?, ?, ?, ?)`,
        [firstName, lastName, email, passwordHash, pesel]
      );
      const userId = result.insertId;

      if (role === "student") {
        const [rows] = await connection.execute<RowDataPacket[]>(
          "SELECT MAX(student_number) as max_num FROM Student"
        );
        const maxNum = rows[0].max_num || 0;
        const studentNumber = maxNum + 1;

        await connection.execute(
          `INSERT INTO Student (user_id, student_number, enrollment_date)
           VALUES (?, ?, NOW())`,
          [userId, studentNumber]
        );
      } else if (role === "parent") {
        const [addrResult] = await connection.execute<ResultSetHeader>(
          `INSERT INTO Address (building_number, town, voivodeship, country, post_code)
           VALUES ('1', 'Unknown', 'Unknown', 'Unknown', '00-000')`
        );
        const addressId = addrResult.insertId;

        await connection.execute(
          `INSERT INTO Parent (user_id, Address_address_id)
           VALUES (?, ?)`,
          [userId, addressId]
        );
      } else if (role === "teacher") {
        const [occRows] = await connection.execute<RowDataPacket[]>(
          "SELECT occupation_id FROM Occupations WHERE occupation = 'Nauczyciel'"
        );
        let occupationId;
        if (occRows.length > 0) {
          occupationId = occRows[0].occupation_id;
        } else {
          const [occRes] = await connection.execute<ResultSetHeader>(
            "INSERT INTO Occupations (occupation) VALUES ('Nauczyciel')"
          );
          occupationId = occRes.insertId;
        }

        await connection.execute(
          `INSERT INTO Staff (user_id, occupation_id, employed_at, salary)
           VALUES (?, ?, NOW(), 0)`,
          [userId, occupationId]
        );
      }

      await connection.commit();
      return res.status(201).json({ message: "User registered successfully" });
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  } catch (err) {
    if (isMysqlDuplicateError(err)) {
      return res.status(409).json({ error: "Email or PESEL already exists" });
    }
    console.error(err);
    return res.status(500).json({ error: "Registration failed" });
  }
});

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

    const passwordMatch = await bcrypt.compare(password, user.passwordHash);

    if (!passwordMatch) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    let role: Role | null = null;

    const [staff] = await pool.execute<RowDataPacket[]>(
      `SELECT O.occupation 
            FROM Staff S 
            JOIN Occupations O ON S.occupation_id = O.occupation_id 
            WHERE S.user_id = ?`,
      [user.userId]
    );

    if (staff.length > 0) {
      const occupation = staff[0].occupation;
      if (occupation === "Nauczyciel") {
        role = "teacher";
      } else {
        role = "staff";
      }
    } else {
      const [students] = await pool.execute<RowDataPacket[]>(
        "SELECT 1 FROM Student WHERE user_id = ?",
        [user.userId]
      );
      if (students.length > 0) {
        role = "student";
      } else {
        const [parents] = await pool.execute<RowDataPacket[]>(
          "SELECT 1 FROM Parent WHERE user_id = ?",
          [user.userId]
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
      { user_id: user.userId, email: user.email, role },
      config.jwtSecret,
      { expiresIn: "1h" }
    );

    // Don't send password_hash back
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash: password_hash, ...userWithoutPassword } = user;

    return res.json({ token, user: { ...userWithoutPassword, role } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Login failed" });
  }
});

export default router;
