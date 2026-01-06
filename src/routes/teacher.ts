import { Router, Response } from 'express';
import { createConnection } from 'mysql2/promise';
import { authenticateToken, AuthRequest } from '../middleware/auth.middleware';
import dotenv from 'dotenv';

dotenv.config();
const router = Router();

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_DATABASE || 'school',
};

const getConn = () => createConnection(dbConfig);


const polishDays: any = { 
  'Monday': 'Poniedziałek', 
  'Tuesday': 'Wtorek', 
  'Wednesday': 'Środa', 
  'Thursday': 'Czwartek', 
  'Friday': 'Piątek', 
  'Saturday': 'Sobota', 
  'Sunday': 'Niedziela'
};


function getSlot(timeStr: string): { start: string, end: string } {
  if (!timeStr) return { start: '', end: '' };
  const [h, m] = timeStr.split(':').map(Number);
  const total = h * 60 + m;
  
  if (total >= 440 && total <= 520) return { start: '08:00', end: '08:45' };
  if (total >= 521 && total <= 580) return { start: '08:55', end: '09:40' };
  if (total >= 581 && total <= 640) return { start: '09:50', end: '10:35' };
  if (total >= 641 && total <= 700) return { start: '10:50', end: '11:35' };
  if (total >= 701 && total <= 755) return { start: '11:45', end: '12:30' };
  if (total >= 756 && total <= 810) return { start: '12:40', end: '13:25' };
  if (total >= 811 && total <= 865) return { start: '13:35', end: '14:20' };
  if (total >= 866 && total <= 920) return { start: '14:30', end: '15:15' };
  
  return { start: timeStr, end: '' };
}


router.get('/schedule', authenticateToken, async (req: AuthRequest, res: Response) => {
  let connection;
  try {
    connection = await getConn();
    const [staff]: any = await connection.execute('SELECT staff_id FROM staff WHERE user_id = ?', [req.user?.id]);
    const teacherId = staff[0].staff_id;


    const query = `
      SELECT DISTINCT 
        l.lesson_id, 
        DAYNAME(l.start_time) as day_name, 
        TIME_FORMAT(l.start_time, '%H:%i') as start_time_only,
        sub.name as subject_name, 
        l.room_name as room, 
        c.name as class_name
      FROM lesson l
      JOIN class c ON l.class_id = c.class_id
      JOIN course co ON l.course_id = co.course_id
      JOIN subject sub ON co.subject_id = sub.subject_id
      WHERE l.teacher_id = ?
      ORDER BY l.start_time ASC
    `;
    
    const [rows]: any = await connection.execute(query, [teacherId]);

    const schedule = rows.map((row: any) => {
      const slot = getSlot(row.start_time_only);
      const dayPl = polishDays[row.day_name] || row.day_name;

      return {
        name: `${row.subject_name} (${row.class_name})`,
        day_of_week: dayPl,
        start_time: slot.start,
        end_time: slot.end,
        room: row.room,
        lesson_id: row.lesson_id
      };
    });

    res.json(schedule);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  } finally {
    if (connection) await connection.end();
  }
});




router.get('/classes', authenticateToken, async (req: AuthRequest, res: Response) => {
    let connection;
    try {
        connection = await getConn();
        
        const [staff]: any = await connection.execute('SELECT staff_id FROM staff WHERE user_id = ?', [req.user?.id]);
        if (staff.length === 0) return res.status(403).json({ error: 'Brak uprawnień nauczycielskich' });
        const teacherId = staff[0].staff_id;

        const query = `
            SELECT DISTINCT 
                c.class_id, 
                c.name as class_name,
                (SELECT COUNT(*) FROM student s WHERE s.class_id = c.class_id) as student_count,
                (c.main_teacher_id = ?) as is_main_teacher
            FROM class c
            LEFT JOIN lesson l ON c.class_id = l.class_id
            WHERE c.main_teacher_id = ? OR l.teacher_id = ?
            ORDER BY c.name
        `;

        const [classes]: any = await connection.execute(query, [teacherId, teacherId, teacherId]);
        res.json(classes);

    } catch (e: any) {
        console.error("Błąd pobierania klas:", e);
        res.status(500).json({ error: e.message });
    } finally {
        if (connection) await connection.end();
    }
});


router.get('/classes/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
    const classId = req.params.id;
    let connection;
    try {
        connection = await getConn();
        const [classInfo]: any = await connection.execute(`
            SELECT c.name, u.first_name, u.last_name 
            FROM class c
            LEFT JOIN staff s ON c.main_teacher_id = s.staff_id
            LEFT JOIN user u ON s.user_id = u.user_id
            WHERE c.class_id = ?
        `, [classId]);


        const [students]: any = await connection.execute(`
            SELECT s.student_id, u.first_name, u.last_name, u.email 
            FROM student s
            JOIN user u ON s.user_id = u.user_id
            WHERE s.class_id = ?
            ORDER BY u.last_name
        `, [classId]);


        const [announcements]: any = await connection.execute(`
            SELECT a.announcement_id, a.title, a.content, a.created_at, a.is_pinned,
                   u.first_name, u.last_name
            FROM announcement a
            JOIN user u ON a.user_id = u.user_id
            WHERE a.class_id = ?
            ORDER BY a.is_pinned DESC, a.created_at DESC
        `, [classId]);

        if (classInfo.length === 0) return res.status(404).json({ error: 'Klasa nie istnieje' });

        res.json({
            info: classInfo[0],
            students,
            announcements
        });

    } catch (e: any) {
        res.status(500).json({ error: e.message });
    } finally {
        if (connection) await connection.end();
    }
});


router.get('/dashboard-summary', authenticateToken, async (req: AuthRequest, res: Response) => {
    let connection;
    try {
        connection = await getConn();
        const [staff]: any = await connection.execute('SELECT staff_id FROM staff WHERE user_id = ?', [req.user?.id]);
        if (staff.length === 0) return res.status(403).json({ error: 'Error' });
        const teacherId = staff[0].staff_id;


        const [nextLesson]: any = await connection.execute(`
            SELECT l.lesson_id, l.start_time, l.room_name, sub.name as subject_name, c.name as class_name
            FROM lesson l
            JOIN course co ON l.course_id = co.course_id
            JOIN subject sub ON co.subject_id = sub.subject_id
            JOIN class c ON l.class_id = c.class_id
            WHERE l.teacher_id = ? AND l.start_time >= NOW()
            ORDER BY l.start_time ASC LIMIT 1
        `, [teacherId]);


        const [myClasses]: any = await connection.execute(`
            SELECT DISTINCT c.class_id, c.name, (c.main_teacher_id = ?) as is_main_teacher
            FROM class c LEFT JOIN lesson l ON c.class_id = l.class_id
            WHERE c.main_teacher_id = ? OR l.teacher_id = ?
            LIMIT 3
        `, [teacherId, teacherId, teacherId]);


        const [recentLessons]: any = await connection.execute(`
            SELECT l.lesson_id, l.start_time, sub.name as subject_name, c.name as class_name
            FROM lesson l
            JOIN course co ON l.course_id = co.course_id
            JOIN subject sub ON co.subject_id = sub.subject_id
            JOIN class c ON l.class_id = c.class_id
            WHERE l.teacher_id = ? AND l.start_time < NOW()
            ORDER BY l.start_time DESC LIMIT 3
        `, [teacherId]);

 
        const [announcements]: any = await connection.execute(`
             SELECT a.title, a.content, a.created_at, u.first_name, u.last_name
             FROM announcement a JOIN user u ON a.user_id = u.user_id
             WHERE a.class_id IS NULL
             ORDER BY a.created_at DESC LIMIT 3
        `);

        res.json({
            nextLesson: nextLesson[0] || null,
            classes: myClasses,
            recentLessons: recentLessons,
            announcements: announcements
        });

    } catch (e: any) {
        console.error(e);
        res.status(500).json({ error: e.message });
    } finally {
        if (connection) await connection.end();
    }
});


router.get('/lesson/:lessonId/details', authenticateToken, async (req: AuthRequest, res: Response) => {
  const lessonId = req.params.lessonId;
  let connection;
  try {
    connection = await getConn();
    

    const [lesson]: any = await connection.execute(`
        SELECT l.lesson_id, l.start_time, l.room_name, l.course_id, l.class_id,
               sub.name as subject_name, c.name as class_name, l.room_id
        FROM lesson l
        JOIN course co ON l.course_id = co.course_id
        JOIN subject sub ON co.subject_id = sub.subject_id
        JOIN class c ON l.class_id = c.class_id
        WHERE l.lesson_id = ?
    `, [lessonId]);
    
    if (lesson.length === 0) return res.status(404).json({ error: 'Lekcja nie istnieje' });
    const currentLesson = lesson[0];


    
    const [students]: any = await connection.execute(`
        SELECT 
            s.student_id, u.first_name, u.last_name,
            ab.absence_id as absence_record_id,
            ab.late_reason_id
        FROM student s
        JOIN user u ON s.user_id = u.user_id
        LEFT JOIN absence ab ON s.student_id = ab.student_id AND ab.lesson_id = ?
        WHERE s.class_id = ?
        ORDER BY u.last_name
    `, [lessonId, currentLesson.class_id]);


    
    res.json({
        lesson: currentLesson,
        students: students, 
        lateReasons: [] 
    });

  } catch (error: any) { 
    res.status(500).json({ error: error.message }); 
  } finally { 
    if (connection) await connection.end(); 
  }
});


router.post('/lesson/:lessonId/register', authenticateToken, async (req: AuthRequest, res: Response) => {
    const lessonId = req.params.lessonId;
    const { studentsData } = req.body; 
    
    let connection;
    try {
        connection = await getConn();
        await connection.beginTransaction();


        const [l]: any = await connection.execute('SELECT course_id, start_time FROM lesson WHERE lesson_id = ?', [lessonId]);
        const courseId = l[0].course_id;
        const lessonDate = l[0].start_time;

        for (const s of studentsData) {

            await connection.execute('DELETE FROM absence WHERE lesson_id = ? AND student_id = ?', [lessonId, s.student_id]);
            if (s.is_absent) {
                await connection.execute(
                    'INSERT INTO absence (student_id, lesson_id, date, late_reason_id) VALUES (?, ?, ?, ?)',
                    [s.student_id, lessonId, lessonDate, s.late_reason_id || null]
                );
            }
            if (s.grade) {
                await connection.execute(
                    'INSERT INTO grade (student_id, course_id, grade, weight, created_at) VALUES (?, ?, ?, ?, NOW())',
                    [s.student_id, courseId, s.grade, s.weight || 1]
                );
            }
        }

        await connection.commit();
        res.json({ message: 'Zapisano dziennik.' });

    } catch (e: any) {
        if (connection) await connection.rollback();
        console.error(e);
        res.status(500).json({ error: e.message });
    } finally {
        if (connection) await connection.end();
    }
});


router.post('/add-grade', authenticateToken, async (req: AuthRequest, res: Response) => {
  const { student_id, course_id, grade, weight } = req.body;
  let connection;
  try {
    connection = await getConn();
    await connection.execute('INSERT INTO grade (student_id, course_id, grade, weight, created_at) VALUES (?, ?, ?, ?, NOW())', [student_id, course_id, grade, weight || 1.0]);
    res.status(201).json({ message: 'OK' });
  } catch (error: any) { res.status(500).json({ error: error.message }); }
  finally { if (connection) await connection.end(); }
});


router.get('/course/:courseId/students', authenticateToken, async (req: AuthRequest, res: Response) => {
    const courseId = req.params.courseId;
    let connection;
    try {
        connection = await getConn();
        

        const [lessons]: any = await connection.execute('SELECT DISTINCT class_id FROM lesson WHERE course_id = ? LIMIT 1', [courseId]);
        
        let studentsQuery = '';
        let params: any[] = [];
        
        if (lessons.length > 0) {
            const classId = lessons[0].class_id;
            studentsQuery = `
                SELECT s.student_id, u.first_name, u.last_name 
                FROM student s JOIN user u ON s.user_id = u.user_id 
                WHERE s.class_id = ?
                ORDER BY u.last_name
            `;
            params = [classId];
        } else {

             return res.json([]);
        }

        const [students]: any = await connection.execute(studentsQuery, params);


        const [grades]: any = await connection.execute('SELECT grade_id, student_id, grade, weight FROM grade WHERE course_id = ?', [courseId]);


        const result = students.map((s: any) => ({
            ...s,
            grades: grades.filter((g: any) => g.student_id === s.student_id)
        }));

        res.json(result);

    } catch (e: any) { res.status(500).json({ error: e.message }); }
    finally { if (connection) await connection.end(); }
});


router.put('/grade/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
    const { grade, weight } = req.body;
    let connection;
    try {
        connection = await getConn();
        await connection.execute('UPDATE grade SET grade = ?, weight = ? WHERE grade_id = ?', [grade, weight, req.params.id]);
        res.json({ message: 'Updated' });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
    finally { if (connection) await connection.end(); }
});

router.delete('/grade/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
    let connection;
    try {
        connection = await getConn();
        await connection.execute('DELETE FROM grade WHERE grade_id = ?', [req.params.id]);
        res.json({ message: 'Deleted' });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
    finally { if (connection) await connection.end(); }
});


router.post('/announcements', authenticateToken, async (req: AuthRequest, res: Response) => {
    const { class_id, title, content, is_pinned } = req.body;
    let connection;
    try {
        connection = await getConn();
        await connection.execute(
            'INSERT INTO announcement (user_id, class_id, title, content, is_pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NOW(), NOW())',
            [req.user?.id, class_id, title, content, is_pinned ? 1 : 0]
        );
        res.status(201).json({ message: 'Dodano ogłoszenie' });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
    finally { if (connection) await connection.end(); }
});

export default router;