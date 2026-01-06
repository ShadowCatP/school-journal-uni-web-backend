import { Router, Response } from 'express';
import { createConnection, Connection } from 'mysql2/promise';
import { authenticateToken, AuthRequest } from '../middleware/auth.middleware';
import dotenv from 'dotenv';


dotenv.config();
const router = Router();

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_DATABASE || 'school',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};


const getConn = async (): Promise<Connection> => {
    return await createConnection(dbConfig);
};


const getStaffId = async (connection: Connection, userId: number): Promise<number> => {
    const [rows]: any = await connection.execute(
        'SELECT staff_id FROM staff WHERE user_id = ?', 
        [userId]
    );
    if (rows.length === 0) {
        throw new Error('Użytkownik nie posiada profilu w tabeli Staff (nie jest nauczycielem).');
    }
    return rows[0].staff_id;
};


const getSchoolYearStart = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); 
  const startYear = month >= 8 ? year : year - 1;
  return `${startYear}-09-01 00:00:00`;
};

const polishDays: any = { 
  'Monday': 'Poniedziałek', 'Tuesday': 'Wtorek', 'Wednesday': 'Środa', 
  'Thursday': 'Czwartek', 'Friday': 'Piątek', 'Saturday': 'Sobota', 'Sunday': 'Niedziela'
};


router.get('/dashboard-summary', authenticateToken, async (req: AuthRequest, res: Response) => {
    const user = req.user;
    console.log(`[STAFF-DASHBOARD] Generowanie widoku dla UserID: ${user?.id}`);

    let connection;
    try {
        connection = await getConn();
        
        const staffId = await getStaffId(connection, user!.id);
        console.log(`[AUTH] Zidentyfikowano Nauczyciela: StaffID ${staffId}`);

        const [nextLesson]: any = await connection.execute(`
            SELECT 
                l.lesson_id, 
                c.name as subject_name, 
                cl.name as class_name, 
                l.start_time, 
                l.room_name,
                l.room_id
            FROM lesson l
            JOIN course c ON l.course_id = c.course_id
            JOIN class cl ON l.class_id = cl.class_id
            WHERE l.teacher_id = ? AND l.start_time >= NOW()
            ORDER BY l.start_time ASC
            LIMIT 1`, 
            [staffId]
        );


        const [recentLessons]: any = await connection.execute(`
            SELECT 
                l.lesson_id, 
                c.name as subject_name, 
                cl.name as class_name, 
                l.start_time
            FROM lesson l
            JOIN course c ON l.course_id = c.course_id
            JOIN class cl ON l.class_id = cl.class_id
            WHERE l.teacher_id = ? AND l.start_time < NOW()
            ORDER BY l.start_time DESC
            LIMIT 3`, 
            [staffId]
        );


        const [myClasses]: any = await connection.execute(`
            SELECT DISTINCT cl.class_id, cl.name 
            FROM class cl
            LEFT JOIN lesson l ON cl.class_id = l.class_id
            WHERE l.teacher_id = ? OR cl.main_teacher_id = ?
            ORDER BY cl.name ASC`, 
            [staffId, staffId]
        );


        const [announcements]: any = await connection.execute(`
            SELECT a.title, a.content, a.created_at, u.last_name, u.first_name
            FROM announcement a
            JOIN user u ON a.user_id = u.user_id
            ORDER BY a.created_at DESC
            LIMIT 3`
        );

        res.json({
            nextLesson: nextLesson[0] || null,
            recentLessons,
            classes: myClasses,
            announcements
        });

    } catch (error: any) {
        console.error("[ERROR] Staff Dashboard:", error.message);
        res.status(500).json({ error: 'Błąd generowania pulpitu nauczyciela: ' + error.message });
    } finally {
        if (connection) await connection.end();
    }
});


router.get('/schedule', authenticateToken, async (req: AuthRequest, res: Response) => {
    const user = req.user;
    let connection;
    try {
        connection = await getConn();
        const staffId = await getStaffId(connection, user!.id);
        
        const query = `
            SELECT 
                l.lesson_id, 
                l.start_time, 
                l.duration_min, 
                l.room_name, 
                c.name AS class_name, 
                co.name AS subject_name,
                DAYNAME(l.start_time) as day_name,
                TIME_FORMAT(l.start_time, '%H:%i') as time_str
            FROM lesson l
            JOIN class c ON l.class_id = c.class_id
            JOIN course co ON l.course_id = co.course_id
            WHERE l.teacher_id = ? 
            ORDER BY l.start_time ASC`;
            
        const [rows]: any = await connection.execute(query, [staffId]);

        const schedule = rows.map((row: any) => ({
            ...row,
            day_of_week: polishDays[row.day_name] || row.day_name, // Zamiana Monday -> Poniedziałek
            start_time: row.time_str // Zamiana Date -> "08:00"
        }));

        res.json(schedule);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
    finally { if (connection) await connection.end(); }
});

router.get('/classes', authenticateToken, async (req: AuthRequest, res: Response) => {
    const user = req.user;
    let connection;
    try {
        connection = await getConn();
        const staffId = await getStaffId(connection, user!.id);

        const query = `
            SELECT DISTINCT 
                cl.class_id, 
                cl.name as class_name,
                (SELECT COUNT(*) FROM student s WHERE s.class_id = cl.class_id) as student_count,
                CASE WHEN cl.main_teacher_id = ? THEN 1 ELSE 0 END as is_main_teacher
            FROM class cl
            LEFT JOIN lesson l ON cl.class_id = l.class_id
            WHERE l.teacher_id = ? OR cl.main_teacher_id = ?
            ORDER BY cl.name`;

        const [classes]: any = await connection.execute(query, [staffId, staffId, staffId]);
        res.json(classes);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    } finally {
        if (connection) await connection.end();
    }
});



router.post('/announcements', authenticateToken, async (req: AuthRequest, res: Response) => {
    const { class_id, title, content, is_pinned } = req.body;
    const user = req.user;

    if (!class_id || !title || !content) {
        return res.status(400).json({ error: 'Wymagane pola: class_id, title, content' });
    }

    let connection;
    try {
        connection = await getConn();
        
        await connection.execute(`
            INSERT INTO announcement (user_id, class_id, title, content, created_at, updated_at, is_pinned)
            VALUES (?, ?, ?, ?, NOW(), NOW(), ?)`,
            [user!.id, class_id, title, content, is_pinned ? 1 : 0]
        );

        res.status(201).json({ message: 'Ogłoszenie zostało opublikowane.' });
    } catch (e: any) {
        console.error("Błąd dodawania ogłoszenia:", e);
        res.status(500).json({ error: 'Nie udało się dodać ogłoszenia.' });
    } finally {
        if (connection) await connection.end();
    }
});


router.get('/classes/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    let connection;
    try {
        connection = await getConn();
        const [classInfo]: any = await connection.execute('SELECT class_id, name FROM class WHERE class_id = ?', [id]);
        if (classInfo.length === 0) return res.status(404).json({ error: 'Klasa nie istnieje' });

        const [students]: any = await connection.execute(`
            SELECT s.student_id, u.first_name, u.last_name, u.email 
            FROM student s JOIN user u ON s.user_id = u.user_id
            WHERE s.class_id = ? ORDER BY u.last_name`, [id]);

        const [lessons]: any = await connection.execute(`
            SELECT l.lesson_id, l.start_time, l.room_name, sub.name as subject_name,
            u.last_name as teacher_surname, u.first_name as teacher_firstname
            FROM lesson l JOIN course c ON l.course_id = c.course_id JOIN subject sub ON c.subject_id = sub.subject_id
            LEFT JOIN staff st ON l.teacher_id = st.staff_id LEFT JOIN user u ON st.user_id = u.user_id
            WHERE l.class_id = ? ORDER BY l.start_time DESC LIMIT 50`, [id]);

        const [announcements]: any = await connection.execute(`
            SELECT a.announcement_id, a.title, a.content, a.created_at, u.first_name, u.last_name
            FROM announcement a JOIN user u ON a.user_id = u.user_id
            WHERE a.class_id = ? ORDER BY a.created_at DESC`, [id]);

        res.json({ info: classInfo[0], students, lessons, announcements });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
    finally { if (connection) await connection.end(); }
});

router.post('/announcements', authenticateToken, async (req: AuthRequest, res: Response) => {
    const { class_id, title, content, is_pinned } = req.body;
    const user = req.user;
    let connection;
    try {
        connection = await getConn();
        await connection.execute(`INSERT INTO announcement (user_id, class_id, title, content, created_at, updated_at, is_pinned) VALUES (?, ?, ?, ?, NOW(), NOW(), ?)`, [user!.id, class_id, title, content, is_pinned ? 1 : 0]);
        res.status(201).json({ message: 'Ogłoszenie dodane.' });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
    finally { if (connection) await connection.end(); }
});

// --- ZARZĄDZANIE LEKCJĄ ---

router.get('/lesson/:id/details', authenticateToken, async (req: AuthRequest, res: Response) => {
    const lessonId = req.params.id;
    let connection;
    try {
        connection = await getConn();

        const [lesson]: any = await connection.execute(`
            SELECT l.lesson_id, l.class_id, l.course_id, c.name as subject_name, cl.name as class_name, l.start_time, l.room_name
            FROM lesson l
            JOIN course c ON l.course_id = c.course_id
            JOIN class cl ON l.class_id = cl.class_id
            WHERE l.lesson_id = ?`, [lessonId]
        );

        if (lesson.length === 0) return res.status(404).json({ error: 'Lekcja nie istnieje' });
        const { class_id } = lesson[0];

        const [students]: any = await connection.execute(`
            SELECT 
                s.student_id, 
                u.first_name, 
                u.last_name,
                CASE 
                    WHEN a.lesson_id IS NOT NULL AND a.late_reason_id IS NOT NULL THEN 'late'
                    WHEN a.lesson_id IS NOT NULL AND a.late_reason_id IS NULL THEN 'absent'
                    ELSE 'present'
                END as status
            FROM student s
            JOIN user u ON s.user_id = u.user_id
            LEFT JOIN absence a ON s.student_id = a.student_id AND a.lesson_id = ?
            WHERE s.class_id = ?
            ORDER BY u.last_name ASC`, [lessonId, class_id]
        );

        const [grades]: any = await connection.execute(`
            SELECT grade_id, student_id, grade, weight, comment
            FROM grade
            WHERE lesson_id = ?`, [lessonId]
        );

        res.json({
            lesson: lesson[0],
            students,
            grades
        });

    } catch (e: any) {
        res.status(500).json({ error: e.message });
    } finally {
        if (connection) await connection.end();
    }
});

router.post('/lesson/:id/register', authenticateToken, async (req: AuthRequest, res: Response) => {
    const lessonId = req.params.id;
    const { attendanceData } = req.body; 
    
    let connection;
    try {
        connection = await getConn();
        await connection.beginTransaction();

        for (const s of attendanceData) {
            await connection.execute('DELETE FROM absence WHERE student_id = ? AND lesson_id = ?', [s.student_id, lessonId]);

            if (s.status === 'absent') {
                await connection.execute(
                    'INSERT INTO absence (student_id, lesson_id, date, late_reason_id) VALUES (?, ?, NOW(), NULL)',
                    [s.student_id, lessonId]
                );
            } else if (s.status === 'late') {
                await connection.execute(
                    'INSERT INTO absence (student_id, lesson_id, date, late_reason_id) VALUES (?, ?, NOW(), 1)',
                    [s.student_id, lessonId]
                );
            }
        }

        await connection.commit();
        res.json({ message: 'Obecność zapisana.' });

    } catch (e: any) {
        if (connection) await connection.rollback();
        res.status(500).json({ error: e.message });
    } finally {
        if (connection) await connection.end();
    }
});

router.post('/grade', authenticateToken, async (req: AuthRequest, res: Response) => {
    const { student_id, lesson_id, grade, weight, comment } = req.body;
    let connection;
    try {
        connection = await getConn();
        const [lData]: any = await connection.execute('SELECT course_id FROM lesson WHERE lesson_id = ?', [lesson_id]);
        if (lData.length === 0) return res.status(404).json({error: 'Lekcja nie istnieje'});
        const courseId = lData[0].course_id;

        await connection.execute(
            'INSERT INTO grade (student_id, lesson_id, course_id, grade, weight, comment, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())',
            [student_id, lesson_id, courseId, grade, weight, comment || null]
        );

        res.status(201).json({ message: 'Ocena dodana' });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
    finally { if (connection) await connection.end(); }
});

router.delete('/grade/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
    const gradeId = req.params.id;
    let connection;
    try {
        connection = await getConn();
        await connection.execute('DELETE FROM grade WHERE grade_id = ?', [gradeId]);
        res.json({ message: 'Ocena usunięta' });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
    finally { if (connection) await connection.end(); }
});



export default router;