import { Router, Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth.middleware';
import bcrypt from 'bcrypt';
import { createConnection } from 'mysql2/promise';

const router = Router();

const dbConfig = { 
    host: process.env.DB_HOST || 'localhost', 
    user: process.env.DB_USER || 'root', 
    password: process.env.DB_PASSWORD || '', 
    database: process.env.DB_DATABASE || 'school' 
};


router.post('/register', authenticateToken, async (req: AuthRequest, res: Response) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Dostęp zabroniony. Tylko Administrator.' });
  }

  const { email, password, role, first_name, last_name, pesel } = req.body;
  
  if (!pesel || pesel.length !== 11 || !/^\d+$/.test(pesel)) {
    return res.status(400).json({ error: 'PESEL musi mieć 11 cyfr.' });
  }

  let connection;
  try {
    connection = await createConnection(dbConfig);
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const [result]: any = await connection.execute(
      'INSERT INTO user (first_name, last_name, email, password_hash, pesel) VALUES (?, ?, ?, ?, ?)',
      [first_name, last_name, email, hashedPassword, pesel]
    );
    
    const newId = result.insertId;

    if (role === 'student') {
      await connection.execute('INSERT INTO student (user_id) VALUES (?)', [newId]);
    } else if (role === 'teacher' || role === 'admin') {
      const occId = role === 'admin' ? 3 : 1;
      const salary = role === 'admin' ? 6000 : 4500;
      await connection.execute(
        'INSERT INTO staff (user_id, occupation_id, employed_at, salary) VALUES (?, ?, NOW(), ?)', 
        [newId, occId, salary]
      );
    } else if (role === 'parent') {
       await connection.execute('INSERT INTO parent (user_id, address_address_id) VALUES (?, 1)', [newId]);
    }

    res.status(201).json({ message: 'Utworzono konto użytkownika.' });
  } catch (e: any) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'Email lub PESEL już istnieje w bazie.' });
    res.status(500).json({ error: 'Błąd bazy danych: ' + e.message });
  } finally {
    if (connection) await connection.end();
  }
});


router.get('/users', authenticateToken, async (req: AuthRequest, res: Response) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Brak uprawnień' });
  
  let connection;
  try {
    connection = await createConnection(dbConfig);

    const [users]: any = await connection.execute(`
        SELECT 
            u.user_id, u.first_name, u.last_name, u.email, u.pesel,
            s.student_id,
            cl.name as class_name, 
            CASE 
                WHEN st.occupation_id = 3 THEN 'Admin'
                WHEN st.user_id IS NOT NULL THEN 'Nauczyciel'
                WHEN s.user_id IS NOT NULL THEN 'Uczeń'
                WHEN p.user_id IS NOT NULL THEN 'Rodzic'
                ELSE 'Gość'
            END as display_role
        FROM user u
        LEFT JOIN student s ON u.user_id = s.user_id
        LEFT JOIN class cl ON s.class_id = cl.class_id 
        LEFT JOIN staff st ON u.user_id = st.user_id
        LEFT JOIN parent p ON u.user_id = p.user_id
        GROUP BY u.user_id
        ORDER BY u.last_name ASC
    `);
    res.json(users);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
  finally { if (connection) await connection.end(); }
});


router.delete('/users/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Brak uprawnień' });
  
  const userId = req.params.id;
  let connection;
  try {
    connection = await createConnection(dbConfig);
    await connection.beginTransaction();
    
    const [staff]: any = await connection.execute('SELECT staff_id FROM staff WHERE user_id = ?', [userId]);
    const [student]: any = await connection.execute('SELECT student_id FROM student WHERE user_id = ?', [userId]);
    
    if (staff.length > 0) {
        await connection.execute('DELETE FROM teachercoursepair WHERE teacher_id = ?', [staff[0].staff_id]);
        await connection.execute('UPDATE lesson SET teacher_id = NULL WHERE teacher_id = ?', [staff[0].staff_id]);
    }
    
    if (student.length > 0) {
      await connection.execute('DELETE FROM grade WHERE student_id = ?', [student[0].student_id]);
      await connection.execute('DELETE FROM absence WHERE student_id = ?', [student[0].student_id]);
      await connection.execute('DELETE FROM scholarship WHERE student_id = ?', [student[0].student_id]);
      await connection.execute('DELETE FROM studentcoursepairs WHERE student_id = ?', [student[0].student_id]);
    }

    await connection.execute('DELETE FROM student WHERE user_id = ?', [userId]);
    await connection.execute('DELETE FROM staff WHERE user_id = ?', [userId]);
    await connection.execute('DELETE FROM parent WHERE user_id = ?', [userId]);
    await connection.execute('DELETE FROM user WHERE user_id = ?', [userId]);
    
    await connection.commit();
    res.json({ message: 'Użytkownik usunięty.' });
  } catch (e: any) {
    if (connection) await connection.rollback();
    res.status(500).json({ error: 'Nie udało się usunąć: ' + e.message });
  } finally { if (connection) await connection.end(); }
});


router.post('/assign-class', authenticateToken, async (req: AuthRequest, res: Response) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Brak uprawnień' });
  const { user_id, class_id } = req.body;
  
  let connection;
  try {
    connection = await createConnection(dbConfig);
    await connection.execute('UPDATE student SET class_id = ? WHERE user_id = ?', [class_id, user_id]);
    res.json({ message: 'Uczeń przypisany do klasy!' });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
  finally { if (connection) await connection.end(); }
});


router.get('/scholarship-types', authenticateToken, async (req: AuthRequest, res: Response) => {
    let connection;
    try {
        connection = await createConnection(dbConfig);
        const [types] = await connection.execute('SELECT * FROM scholarshiptype');
        res.json(types);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
    finally { if (connection) await connection.end(); }
});


router.get('/scholarships', authenticateToken, async (req: AuthRequest, res: Response) => {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Brak uprawnień' });
    let connection;
    try {
        connection = await createConnection(dbConfig);
        const query = `
            SELECT 
                s.scholarship_id, s.amount, s.start_date,
                st.requirements as type_name, st.duration_semesters,
                u.first_name, u.last_name, cl.name as class_name
            FROM scholarship s
            JOIN scholarshiptype st ON s.scholarship_type_id = st.scholarship_type_id
            JOIN student stu ON s.student_id = stu.student_id
            JOIN user u ON stu.user_id = u.user_id
            LEFT JOIN class cl ON stu.class_id = cl.class_id
            ORDER BY s.start_date DESC
        `;
        const [scholarships] = await connection.execute(query);
        res.json(scholarships);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
    finally { if (connection) await connection.end(); }
});


router.post('/scholarships', authenticateToken, async (req: AuthRequest, res: Response) => {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Brak uprawnień' });
    
    const { student_id, scholarship_type_id, amount, start_date } = req.body;
    
    if (!student_id || !scholarship_type_id || !amount) {
        return res.status(400).json({ error: 'Wymagane pola: uczeń, typ, kwota' });
    }

    let connection;
    try {
        connection = await createConnection(dbConfig);
        await connection.execute(
            'INSERT INTO scholarship (student_id, scholarship_type_id, amount, start_date) VALUES (?, ?, ?, ?)',
            [student_id, scholarship_type_id, amount, start_date || new Date()]
        );
        res.status(201).json({ message: 'Stypendium przyznane.' });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
    finally { if (connection) await connection.end(); }
});


router.delete('/scholarships/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Brak uprawnień' });
    const id = req.params.id;
    let connection;
    try {
        connection = await createConnection(dbConfig);
        await connection.execute('DELETE FROM scholarship WHERE scholarship_id = ?', [id]);
        res.json({ message: 'Stypendium cofnięte.' });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
    finally { if (connection) await connection.end(); }
});



router.get('/stats', authenticateToken, async (req: AuthRequest, res: Response) => {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Brak uprawnień' });
    let connection;
    try {
        connection = await createConnection(dbConfig);
        const [students]: any = await connection.execute('SELECT COUNT(*) as count FROM student');
        const [teachers]: any = await connection.execute('SELECT COUNT(*) as count FROM staff WHERE occupation_id = 1');
        const [courses]: any = await connection.execute('SELECT COUNT(*) as count FROM course');
        const [lessons]: any = await connection.execute('SELECT COUNT(*) as count FROM lesson WHERE start_time >= CURDATE()');
        
        res.json({ 
            studentCount: students[0].count, 
            teacherCount: teachers[0].count, 
            courseCount: courses[0].count,
            lessonsToday: lessons[0].count
        });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
    finally { if (connection) await connection.end(); }
});

router.get('/rooms', authenticateToken, async (req: AuthRequest, res: Response) => {
  let connection;
  try {
    connection = await createConnection(dbConfig);
    const [rooms] = await connection.execute('SELECT room_id, name FROM room');
    res.json(rooms);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
  finally { if (connection) await connection.end(); }
});




router.get('/classes', authenticateToken, async (req: AuthRequest, res: Response) => {
    let connection;
    try {
        connection = await createConnection(dbConfig);
        const [classes] = await connection.execute(`
            SELECT c.class_id, c.name, u.first_name, u.last_name 
            FROM class c 
            LEFT JOIN staff s ON c.main_teacher_id = s.staff_id
            LEFT JOIN user u ON s.user_id = u.user_id
        `);
        res.json(classes);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
    finally { if (connection) await connection.end(); }
});

router.post('/classes', authenticateToken, async (req: AuthRequest, res: Response) => {
    const { name, main_teacher_id } = req.body;
    let connection;
    try {
        connection = await createConnection(dbConfig);
        await connection.execute('INSERT INTO class (name, main_teacher_id) VALUES (?, ?)', [name, main_teacher_id || null]);
        res.status(201).json({ message: 'Klasa utworzona' });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
    finally { if (connection) await connection.end(); }
});

router.delete('/classes/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    let connection;
    try {
        connection = await createConnection(dbConfig);
        await connection.execute('DELETE FROM class WHERE class_id = ?', [id]);
        res.json({ message: 'Klasa usunięta' });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
    finally { if (connection) await connection.end(); }
});


router.get('/teachers', authenticateToken, async (req: AuthRequest, res: Response) => {
    let connection;
    try {
        connection = await createConnection(dbConfig);
        const [teachers] = await connection.execute(`
            SELECT s.staff_id, u.first_name, u.last_name 
            FROM staff s 
            JOIN user u ON s.user_id = u.user_id 
            ORDER BY u.last_name
        `);
        res.json(teachers);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
    finally { if (connection) await connection.end(); }
});


router.get('/subjects', authenticateToken, async (req: AuthRequest, res: Response) => {
    let connection;
    try {
        connection = await createConnection(dbConfig);
        const [subjects] = await connection.execute('SELECT * FROM subject');
        res.json(subjects);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
    finally { if (connection) await connection.end(); }
});


router.get('/courses', authenticateToken, async (req: AuthRequest, res: Response) => {
    let connection;
    try {
        console.log("🔄 Uruchamiam pobieranie kursów...");
        connection = await createConnection(dbConfig);
        
        const query = `
            SELECT 
                c.course_id, 
                c.name, 
                c.description, 
                c.weight,
                sub.name AS subject_name,
                CONCAT(u.first_name, ' ', u.last_name) AS teacher_name
            FROM course c
            LEFT JOIN subject sub ON c.subject_id = sub.subject_id
            LEFT JOIN teachercoursepair tcp ON c.course_id = tcp.course_id
            LEFT JOIN staff s ON tcp.teacher_id = s.staff_id
            LEFT JOIN user u ON s.user_id = u.user_id
            ORDER BY c.created_at DESC
        `;
        

        const [courses] = await connection.execute(query) as any;
        

        if (courses.length > 0) {
            console.log("Przykładowy rekord z bazy:", courses[0]);
        } else {
            console.log("Baza zwróciła pustą listę kursów.");
        }

        res.json(courses);
    } catch (e: any) { 
        console.error("BŁĄD SQL:", e);
        res.status(500).json({ error: e.message }); 
    }
    finally { if (connection) await connection.end(); }
});


router.post('/courses', authenticateToken, async (req: AuthRequest, res: Response) => {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Brak uprawnień' });

    const { name, description, weight, subject_id, teacher_id } = req.body;

    if (!name || !subject_id || !teacher_id) {
        return res.status(400).json({ error: 'Wymagane pola: nazwa, przedmiot, nauczyciel' });
    }

    let connection;
    try {
        connection = await createConnection(dbConfig);
        await connection.beginTransaction();


        const [result]: any = await connection.execute(
            'INSERT INTO course (name, description, weight, subject_id, created_at) VALUES (?, ?, ?, ?, NOW())',
            [name, description || '', weight || 1, subject_id]
        );
        const newCourseId = result.insertId;


        await connection.execute(
            'INSERT INTO teachercoursepair (teacher_id, course_id) VALUES (?, ?)',
            [teacher_id, newCourseId]
        );

        await connection.commit(); 
        res.status(201).json({ message: 'Kurs utworzony pomyślnie.' });

    } catch (e: any) { 
        if (connection) await connection.rollback(); 
        console.error("Błąd SQL przy tworzeniu kursu:", e); 
        

        res.status(500).json({ error: e.sqlMessage || e.message }); 
    }
    finally { if (connection) await connection.end(); }
});


router.delete('/courses/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Brak uprawnień' });
    
    const courseId = req.params.id;
    let connection;
    try {
        connection = await createConnection(dbConfig);
        await connection.execute('DELETE FROM teachercoursepair WHERE course_id = ?', [courseId]);
        await connection.execute('DELETE FROM course WHERE course_id = ?', [courseId]);
        
        res.json({ message: 'Kurs usunięty.' });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
    finally { if (connection) await connection.end(); }
});


router.get('/lessons-all', authenticateToken, async (req: AuthRequest, res: Response) => {
    let connection;
    try {
        connection = await createConnection(dbConfig);
        const [lessons] = await connection.execute(`
            SELECT l.lesson_id, l.start_time, c.name as class_name, co.name as course_name, l.room_name
            FROM lesson l
            JOIN class c ON l.class_id = c.class_id
            JOIN course co ON l.course_id = co.course_id
            ORDER BY l.start_time DESC LIMIT 100
        `);
        res.json(lessons);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
    finally { if (connection) await connection.end(); }
});

router.delete('/lessons/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
    let connection;
    try {
        connection = await createConnection(dbConfig);
        await connection.execute('DELETE FROM lesson WHERE lesson_id = ?', [req.params.id]);
        res.json({ message: 'Lekcja usunięta' });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
    finally { if (connection) await connection.end(); }
});


router.get('/grades/student/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
    const studentId = req.params.id;
    let connection;
    try {
        connection = await createConnection(dbConfig);
        const [grades] = await connection.execute(`
            SELECT g.grade, g.weight, c.name as course_name, g.created_at
            FROM grade g
            JOIN course c ON g.course_id = c.course_id
            WHERE g.student_id = ?
            ORDER BY g.created_at DESC
        `, [studentId]);
        res.json(grades);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
    finally { if (connection) await connection.end(); }
});


router.post('/lessons', authenticateToken, async (req: AuthRequest, res: Response) => {
  const { class_id, course_id, room_id, teacher_id, start_time, duration_min } = req.body;
  if (!teacher_id || !start_time || !class_id) return res.status(400).json({ error: 'Wymagane dane lekcji.' });

  let connection;
  try {
    connection = await createConnection(dbConfig);
    

    const [existing]: any = await connection.execute(
      'SELECT lesson_id FROM lesson WHERE class_id = ? AND start_time = ?',
      [class_id, start_time]
    );

    if (existing.length > 0) {
      return res.status(400).json({ error: 'Ta klasa ma już zaplanowaną lekcję w tym czasie!' });
    }


    await connection.execute(
      'INSERT INTO lesson (class_id, course_id, room_id, teacher_id, start_time, duration_min, room_name) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [class_id, course_id, room_id, teacher_id, start_time, duration_min || 45, 'Sala ' + room_id]
    );
    
    res.json({ message: 'Lekcja dodana pomyślnie!' });
  } catch (e: any) { 
    res.status(500).json({ error: 'Błąd: ' + e.message }); 
  }
  finally { if (connection) await connection.end(); }
});


router.get('/announcements', authenticateToken, async (req: AuthRequest, res: Response) => {
    let connection;
    try {
        connection = await createConnection(dbConfig);

        const query = `
            SELECT 
                a.announcement_id, a.title, a.content, a.created_at, 
                u.first_name, u.last_name,
                c.name as class_name
            FROM announcement a
            JOIN user u ON a.user_id = u.user_id
            LEFT JOIN class c ON a.class_id = c.class_id
            ORDER BY a.created_at DESC
            LIMIT 10
        `;
        const [rows] = await connection.execute(query);
        res.json(rows);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
    finally { if (connection) await connection.end(); }
});


router.post('/announcements', authenticateToken, async (req: AuthRequest, res: Response) => {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Brak uprawnień' });
    

    const { title, content, class_id } = req.body; 

    if (!title || !content) return res.status(400).json({ error: 'Tytuł i treść są wymagane.' });

    let connection;
    try {
        connection = await createConnection(dbConfig);
        await connection.execute(
            'INSERT INTO announcement (user_id, class_id, title, content, created_at, updated_at, is_pinned) VALUES (?, ?, ?, ?, NOW(), NOW(), 0)',
            [req.user.id, class_id || null, title, content]
        );
        res.status(201).json({ message: 'Ogłoszenie opublikowane.' });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
    finally { if (connection) await connection.end(); }
});



export default router;