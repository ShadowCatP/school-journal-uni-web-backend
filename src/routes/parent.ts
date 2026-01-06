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


const verifyChild = async (connection: any, parentUserId: number, studentId: number) => {
    const query = `
        SELECT 1 FROM parent p
        JOIN parentstudentpair psp ON p.parent_id = psp.Parent_parent_id
        JOIN Student s ON psp.Student_student_id = s.student_id
        WHERE p.user_id = ? AND s.student_id = ?
    `;
    const [rows]: any = await connection.execute(query, [parentUserId, studentId]);
    return rows.length > 0;
};

// DASHBOARD RODZICA (Główny widok)
router.get('/dashboard', authenticateToken, async (req: AuthRequest, res: Response) => {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Brak autoryzacji' });

    let connection;
    try {
        connection = await getConn();


        const childrenQuery = `
            SELECT DISTINCT
                s.student_id, 
                s.class_id, 
                u_child.first_name, 
                u_child.last_name 
            FROM parent p
            JOIN parentstudentpair psp ON p.parent_id = psp.Parent_parent_id
            JOIN Student s ON psp.Student_student_id = s.student_id
            JOIN User u_child ON s.user_id = u_child.user_id
            WHERE p.user_id = ?
        `;
        
        const [children]: any = await connection.execute(childrenQuery, [user.id]);

        if (children.length === 0) {
            return res.json({ children: [], recentGrades: [], announcements: [] });
        }

        const studentIds = children.map((c: any) => c.student_id);
        const classIds = children.map((c: any) => c.class_id).filter((id: any) => id);


        let recentGrades: any = [];
        if (studentIds.length > 0) {
            const placeholders = studentIds.map(() => '?').join(',');
            const gradesQuery = `
                SELECT g.grade, g.weight, c.name as subject_name, g.created_at, u.first_name as student_name
                FROM Grade g
                JOIN Course c ON g.course_id = c.course_id
                JOIN Student s ON g.student_id = s.student_id
                JOIN User u ON s.user_id = u.user_id
                WHERE g.student_id IN (${placeholders})
                ORDER BY g.created_at DESC
                LIMIT 5
            `;
            const [gradesRes]: any = await connection.execute(gradesQuery, studentIds);
            recentGrades = gradesRes;
        }


        let announcements: any = [];
        if (classIds.length > 0) {
            const clsPlaceholders = classIds.map(() => '?').join(',');
            const annQuery = `
                SELECT a.title, a.content, a.created_at, u.first_name, u.last_name
                FROM Announcement a
                LEFT JOIN User u ON a.user_id = u.user_id
                WHERE a.class_id IN (${clsPlaceholders})
                ORDER BY a.created_at DESC
                LIMIT 3
            `;
            const [annRes]: any = await connection.execute(annQuery, classIds);
            announcements = annRes;
        }


        const childrenWithAttendance = [];
        for (const child of children) {
            const [totalLessonsRes]: any = await connection.execute(
                'SELECT COUNT(*) as total FROM Lesson WHERE class_id = ? AND start_time < NOW()', 
                [child.class_id]
            );
            const totalLessons = totalLessonsRes[0].total;

            const [absencesRes]: any = await connection.execute(
                'SELECT COUNT(*) as absent FROM Absence WHERE student_id = ?', 
                [child.student_id]
            );
            const absences = absencesRes[0].absent;

            let percentage = 100;
            if (totalLessons > 0) {
                percentage = Math.round(((totalLessons - absences) / totalLessons) * 100);
            }
            
            childrenWithAttendance.push({
                ...child,
                attendance_percentage: percentage
            });
        }

        res.json({
            children: childrenWithAttendance,
            recentGrades,
            announcements
        });

    } catch (error: any) {
        console.error("Błąd parent dashboard:", error);
        res.status(500).json({ error: error.message });
    } finally {
        if (connection) await connection.end();
    }
});

// PLAN LEKCJI DZIECKA
router.get('/schedule', authenticateToken, async (req: AuthRequest, res: Response) => {
    const parentId = req.user!.id;
    const studentId = req.query.studentId;

    if (!studentId) return res.status(400).json({ error: "Brak studentId" });

    let connection;
    try {
        connection = await getConn();
        if (!(await verifyChild(connection, parentId, Number(studentId)))) {
             return res.status(403).json({ error: "To nie Twoje dziecko!" });
        }

        const query = `
            SELECT 
                l.lesson_id, l.day_of_week, 
                CASE 
                    WHEN l.day_of_week = 'Monday' THEN 'PONIEDZIAŁEK'
                    WHEN l.day_of_week = 'Tuesday' THEN 'WTOREK'
                    WHEN l.day_of_week = 'Wednesday' THEN 'ŚRODA'
                    WHEN l.day_of_week = 'Thursday' THEN 'CZWARTEK'
                    WHEN l.day_of_week = 'Friday' THEN 'PIĄTEK'
                END as day_name,
                s.name as subject, 
                u.last_name as teacher, 
                r.name as room,
                DATE_FORMAT(l.start_time, '%H:%i') as start_time_only,
                CONCAT(DATE_FORMAT(l.start_time, '%H:%i'), ' - ', DATE_FORMAT(DATE_ADD(l.start_time, INTERVAL 45 MINUTE), '%H:%i')) as time_slot
            FROM Lesson l
            JOIN Course c ON l.course_id = c.course_id
            JOIN Subject s ON c.subject_id = s.subject_id
            JOIN Staff st ON c.teacher_id = st.staff_id
            JOIN User u ON st.user_id = u.user_id
            JOIN Room r ON l.room_id = r.room_id
            JOIN Student stud ON stud.class_id = l.class_id
            WHERE stud.student_id = ?
            ORDER BY l.start_time
        `;
        const [schedule]: any = await connection.execute(query, [studentId]);
        res.json(schedule);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
    finally { if (connection) await connection.end(); }
});

// OCENY DZIECKA
router.get('/grades', authenticateToken, async (req: AuthRequest, res: Response) => {
    const parentId = req.user!.id;
    const studentId = req.query.studentId;
    if (!studentId) return res.status(400).json({ error: "Brak studentId" });

    let connection;
    try {
        connection = await getConn();
        if (!(await verifyChild(connection, parentId, Number(studentId)))) {
             return res.status(403).json({ error: "Brak dostępu" });
        }

        const query = `
            SELECT g.grade_id, g.grade, g.weight, g.created_at, s.name as subject_name, g.comment
            FROM Grade g
            JOIN Course c ON g.course_id = c.course_id
            JOIN Subject s ON c.subject_id = s.subject_id
            WHERE g.student_id = ?
            ORDER BY g.created_at DESC
        `;
        const [grades]: any = await connection.execute(query, [studentId]);
        res.json(grades);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
    finally { if (connection) await connection.end(); }
});

// KURSY DZIECKA
router.get('/courses', authenticateToken, async (req: AuthRequest, res: Response) => {
    const parentId = req.user!.id;
    const studentId = req.query.studentId;
    if (!studentId) return res.status(400).json({ error: "Brak studentId" });

    let connection;
    try {
        connection = await getConn();
        if (!(await verifyChild(connection, parentId, Number(studentId)))) {
             return res.status(403).json({ error: "Brak dostępu" });
        }

        const query = `
            SELECT c.course_id, sub.name as subject_name, u.last_name as teacher_name, c.description,
            (SELECT COUNT(*) FROM Lesson l2 WHERE l2.course_id = c.course_id AND l2.start_time < NOW()) as total_lessons,
            (SELECT COUNT(*) FROM Absence a 
             JOIN Lesson l3 ON a.lesson_id = l3.lesson_id 
             WHERE l3.course_id = c.course_id AND a.student_id = ?) as absences
            FROM Course c
            JOIN StudentCoursePair scp ON c.course_id = scp.Course2course_id
            JOIN Subject sub ON c.subject_id = sub.subject_id
            JOIN Staff st ON c.teacher_id = st.staff_id
            JOIN User u ON st.user_id = u.user_id
            WHERE scp.Student2student_id = ?
        `;
        const [courses]: any = await connection.execute(query, [studentId, studentId]);

        const coursesWithAttendance = courses.map((c: any) => {
            let attendance = 100;
            if (c.total_lessons > 0) {
                attendance = Math.round(((c.total_lessons - c.absences) / c.total_lessons) * 100);
            }
            return { ...c, attendance_percentage: attendance };
        });

        res.json(coursesWithAttendance);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
    finally { if (connection) await connection.end(); }
});

// STYPENDIA DZIECKA
router.get('/scholarships', authenticateToken, async (req: AuthRequest, res: Response) => {
    const parentId = req.user!.id;
    const studentId = req.query.studentId;
    if (!studentId) return res.status(400).json({ error: "Brak studentId" });

    let connection;
    try {
        connection = await getConn();
        if (!(await verifyChild(connection, parentId, Number(studentId)))) return res.status(403).json({error: "No access"});
        
        const activeQuery = `
            SELECT s.scholarship_id, s.amount, s.start_date, st.requirements as name
            FROM scholarship s
            JOIN scholarshiptype st ON s.scholarship_type_id = st.scholarship_type_id
            WHERE s.student_id = ?
        `;
        const [active]: any = await connection.execute(activeQuery, [studentId]);

        const availableQuery = `SELECT scholarship_type_id, requirements as name, duration_semesters FROM scholarshiptype`;
        const [available]: any = await connection.execute(availableQuery);

        res.json({ active, available });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
    finally { if (connection) await connection.end(); }
});

export default router;