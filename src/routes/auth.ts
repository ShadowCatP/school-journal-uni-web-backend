import { Router } from 'express';
import { createConnection } from 'mysql2/promise';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

dotenv.config();

const router = Router();

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_DATABASE || 'school',
};

// --- REJESTRACJA ---
router.post('/register', async (req, res) => {
  const { first_name, last_name, email, password, pesel, role } = req.body;

  if (!email || !password || !pesel || !role) {
    return res.status(400).json({ error: 'Brak wymaganych pól' });
  }

  let connection;
  try {
    connection = await createConnection(dbConfig);
    
    const [existing] = await connection.execute<RowDataPacket[]>(
      'SELECT * FROM user WHERE email = ?', 
      [email]
    );

    if (existing.length > 0) {
      await connection.end();
      return res.status(400).json({ error: 'Użytkownik o takim adresie e-mail już istnieje' });
    }


    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);

    const [result] = await connection.execute<ResultSetHeader>(
      'INSERT INTO user (first_name, last_name, email, password_hash, pesel) VALUES (?, ?, ?, ?, ?)',
      [first_name, last_name, email, hash, pesel]
    );

    const newUserId = result.insertId;


    if (role === 'student') {
      await connection.execute('INSERT INTO student (user_id) VALUES (?)', [newUserId]);
    } 
    else if (role === 'teacher') {
      await connection.execute(
        'INSERT INTO staff (user_id, occupation_id, employed_at, salary) VALUES (?, 1, NOW(), 4500)', 
        [newUserId]
      );
    } 
    else if (role === 'admin') {
      await connection.execute(
        'INSERT INTO staff (user_id, occupation_id, employed_at, salary) VALUES (?, 3, NOW(), 6000)', 
        [newUserId]
      );
    }
    else if (role === 'parent') {
      await connection.execute(
          'INSERT INTO parent (user_id, Address_address_id) VALUES (?, 1)', 
          [newUserId]
      );
    }

    await connection.end();
    res.status(201).json({ message: 'Użytkownik zarejestrowany pomyślnie' });

  } catch (error) {
    console.error("Registration error:", error);
    if (connection) await connection.end();
    res.status(500).json({ error: 'Błąd serwera podczas rejestracji' });
  }
});

// --- LOGOWANIE ---
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  let connection;
  try {
    connection = await createConnection(dbConfig);

    const [rows] = await connection.execute<RowDataPacket[]>(
      'SELECT * FROM user WHERE email = ?',
      [email]
    );

    if (rows.length === 0) {
      await connection.end();
      return res.status(400).json({ error: 'Użytkownik nie znaleziony' });
    }

    const user = rows[0];
    const userId = user.user_id; 

    const dbPasswordHash = user.password_hash || user.password;
    if (!dbPasswordHash) {
        await connection.end();
        return res.status(500).json({ error: 'Błąd hasła w bazie' });
    }

    const isMatch = await bcrypt.compare(password, dbPasswordHash);
    if (!isMatch) {
      await connection.end();
      return res.status(400).json({ error: 'Nieprawidłowe hasło' });
    }


    let detectedRole = "guest";
    let dashboardUrl = "/";


    const [staffRows] = await connection.execute<RowDataPacket[]>(
        'SELECT occupation_id FROM staff WHERE user_id = ?', [userId] 
    );
    
    if (staffRows.length > 0) {
        const occId = staffRows[0].occupation_id;
        if (occId === 3) { 
            detectedRole = "admin";
            dashboardUrl = "/admin/dashboard";
        } else {
            detectedRole = "teacher";
            dashboardUrl = "/teacher/dashboard";
        }
    } 


    if (detectedRole === "guest") {
        const [studentRows] = await connection.execute<RowDataPacket[]>(
            'SELECT student_id FROM student WHERE user_id = ?', [userId] 
        );
        if (studentRows.length > 0) {
            detectedRole = "student";
            dashboardUrl = "/student/dashboard";
        }
    }

    if (detectedRole === "guest") {
        const [parentRows] = await connection.execute<RowDataPacket[]>(
            'SELECT parent_id FROM parent WHERE user_id = ?', [userId] 
        );
        if (parentRows.length > 0) {
            detectedRole = "parent";
            dashboardUrl = "/parent/dashboard";
        }
    }

    console.log(`Logowanie: ${email} -> Wykryta rola: ${detectedRole}`);

    await connection.end();


    const token = jwt.sign(
      { id: userId, email: user.email, role: detectedRole },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '2h' }
    );

    res.json({
      token,
      user: {
        id: userId, 
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: detectedRole,
        dashboardUrl
      }
    });

  } catch (error) {
    console.error("Login error:", error);
    if (connection) await connection.end();
    res.status(500).json({ error: 'Błąd serwera podczas logowania' });
  }
});

export default router;