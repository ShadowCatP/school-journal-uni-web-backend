import { Router, Response, Request } from 'express';
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
    try {
        console.log(`[DATABASE] Próba nawiązania połączenia z hostem: ${dbConfig.host}`);
        const connection = await createConnection(dbConfig);
        return connection;
    } catch (error: any) {
        console.error("[DATABASE ERROR] Nie udało się połączyć z bazą danych:", error.message);
        throw new Error("Błąd krytyczny połączenia z bazą danych.");
    }
};


const getSchoolYearStart = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  

  const startYear = month >= 8 ? year : year - 1;
  const formattedDate = `${startYear}-09-01 00:00:00`;
  
  console.log(`[SYSTEM] Wyznaczony początek roku szkolnego dla zapytań: ${formattedDate}`);
  return formattedDate;
};


function getSlot(timeStr: string): string {
  if (!timeStr) return 'Brak czasu';
  
  const [h, m] = timeStr.split(':').map(Number);
  const totalMinutes = h * 60 + m;
  
  console.log(`[FORMATTER] Mapowanie czasu ${timeStr} (minuty: ${totalMinutes}) na slot.`);
  
  if (totalMinutes >= 440 && totalMinutes <= 520) return '8:00 - 8:45';
  if (totalMinutes >= 521 && totalMinutes <= 580) return '8:55 - 9:40';
  if (totalMinutes >= 581 && totalMinutes <= 640) return '9:50 - 10:35';
  if (totalMinutes >= 641 && totalMinutes <= 700) return '10:50 - 11:35';
  if (totalMinutes >= 701 && totalMinutes <= 755) return '11:45 - 12:30';
  if (totalMinutes >= 756 && totalMinutes <= 810) return '12:40 - 13:25';
  if (totalMinutes >= 811 && totalMinutes <= 865) return '13:35 - 14:20';
  if (totalMinutes >= 866 && totalMinutes <= 920) return '14:30 - 15:15';
  if (totalMinutes >= 921 && totalMinutes <= 980) return '15:25 - 16:10';
  
  return `Lekcja poza planem (${timeStr})`;
}


const polishDays: any = { 
  'Monday': 'PONIEDZIAŁEK', 
  'Tuesday': 'WTOREK', 
  'Wednesday': 'ŚRODA', 
  'Thursday': 'CZWARTEK', 
  'Friday': 'PIĄTEK', 
  'Saturday': 'SOBOTA', 
  'Sunday': 'NIEDZIELA'
};


router.post('/scholarships', authenticateToken, async (req: AuthRequest, res: Response) => {
    console.log(`[AUTH-LOG] Użytkownik ${req.user?.email} próbuje wywołać POST /scholarships`);
    const user = req.user;
    const { scholarshipTypeId } = req.body;
    

    if (user!.role === 'parent') {
        console.warn(`[SECURITY ALERT] Rodzic o ID ${user!.id} próbował wykonać zapis stypendium.`);
        return res.status(403).json({ 
            error: 'Odmowa uprawnień: Tylko studenci mogą aktywować swoje świadczenia finansowe.',
            code: 'FORBIDDEN_PARENT_ACTION'
        });
    }
    
    if (!scholarshipTypeId) {
        return res.status(400).json({ error: 'Błąd żądania: Nie przesłano identyfikatora typu stypendium.' });
    }

    let connection;
    try {
        connection = await getConn();
        

        console.log(`[DB-QUERY] Szukanie profilu studenta dla User ID: ${user!.id}`);
        const [studentRes]: any = await connection.execute(
            'SELECT student_id FROM Student WHERE user_id = ?', 
            [user!.id]
        );
        
        if (studentRes.length === 0) {
            return res.status(404).json({ error: 'Profil błędu: Twoje konto nie jest powiązane z żadnym studentem.' });
        }
        
        const studentId = studentRes[0].student_id;
        console.log(`[DB-DATA] Student ID zidentyfikowany: ${studentId}`);


        const [existing]: any = await connection.execute(
            'SELECT scholarship_id FROM scholarship WHERE student_id = ? AND scholarship_type_id = ?',
            [studentId, scholarshipTypeId]
        );

        if (existing.length > 0) {
            console.log(`[VALIDATION] Student ${studentId} posiada już aktywne stypendium typu ${scholarshipTypeId}`);
            return res.status(409).json({ 
                error: 'Wewnętrzny błąd bazy danych: Operacja zablokowana: Student ma już aktywne stypendium w tym okresie.' 
            });
        }


        console.log(`[DB-INSERT] Dodawanie rekordu stypendium dla studenta ${studentId}`);
        await connection.execute(
            'INSERT INTO scholarship (student_id, scholarship_type_id, amount, start_date) VALUES (?, ?, ?, NOW())',
            [studentId, scholarshipTypeId, 1000.00]
        );

        res.status(201).json({ message: 'Świadczenie zostało pomyślnie przypisane do Twojego profilu.' });

    } catch (error: any) {
        console.error("[CRITICAL SQL ERROR] POST /scholarships:", error.message);
        res.status(500).json({ error: 'Wystąpił krytyczny błąd bazy danych podczas zapisu: ' + error.message });
    } finally {
        if (connection) {
            await connection.end();
            console.log("[DB-SESSION] Połączenie zamknięte poprawnie.");
        }
    }
});


router.get('/scholarships', authenticateToken, async (req: AuthRequest, res: Response) => {
    const user = req.user;
    const childId = req.headers['x-child-id'];
    
    console.log(`[GRADES-LOG] Pobieranie finansów dla: ${user?.email}, Context ChildID: ${childId || 'N/A'}`);

    let connection;
    try {
        connection = await getConn();
        let s_id;
        

        if (user!.role === 'parent' && childId) {
            s_id = childId;
            console.log(`[ROLE-CHECK] Rodzic przegląda dane dziecka o ID: ${s_id}`);
        } else {
            const [r]: any = await connection.execute('SELECT student_id FROM Student WHERE user_id = ?', [user!.id]);
            if (r.length === 0) return res.status(404).json({ error: 'Nie odnaleziono Twojego profilu studenta.' });
            s_id = r[0]?.student_id;
        }


        console.log(`[DB-QUERY] Pobieranie aktywnych stypendiów dla studenta ${s_id}`);
        const [active]: any = await connection.execute(`
            SELECT s.scholarship_id, s.amount, s.start_date, st.requirements as name 
            FROM scholarship s
            JOIN scholarshiptype st ON s.scholarship_type_id = st.scholarship_type_id 
            WHERE s.student_id = ?`, [s_id]);
        

        const [available]: any = await connection.execute(`
            SELECT scholarship_type_id, requirements as name, duration_semesters FROM scholarshiptype`);

        res.json({ active, available });
    } catch (error: any) {
        console.error("[ERROR] GET /scholarships failed:", error.message);
        res.status(500).json({ error: 'Błąd synchronizacji modułu finansowego: ' + error.message });
    } finally {
        if (connection) await connection.end();
    }
});


router.get('/schedule', authenticateToken, async (req: AuthRequest, res: Response) => {
    const user = req.user;
    const childId = req.headers['x-child-id'];
    const onlyFuture = req.query.future === 'true';
    
    console.log(`[SCHEDULE-FETCH] Start procesu pobierania planu. User: ${user?.email}`);
    console.log(`[SCHEDULE-CONTEXT] Context: ${user!.role === 'parent' ? 'RODZIC' : 'UCZEŃ'}, ChildID: ${childId || 'N/A'}`);

    let connection;
    try {
        connection = await getConn();
        let s_id;


        if (user!.role === 'parent' && childId) {
            s_id = childId;
            console.log(`[AUTH] Rodzic przegląda plan dziecka o identyfikatorze: ${s_id}`);
        } else {
            console.log(`[AUTH] Uczeń o ID ${user!.id} pobiera swój własny plan lekcji.`);
            const [studentRow]: any = await connection.execute(
                'SELECT student_id FROM Student WHERE user_id = ?', 
                [user!.id]
            );
            
            if (studentRow.length === 0) {
                console.error(`[CRITICAL] Nie znaleziono studenta dla User ID: ${user!.id}`);
                return res.status(404).json({ error: 'Błąd dostępu: Nie odnaleziono powiązanego profilu studenta.' });
            }
            s_id = studentRow[0].student_id;
        }


        console.log(`[DB-QUERY] Pobieranie klasy dla studenta ID: ${s_id}`);
        const [stRes]: any = await connection.execute(
            'SELECT class_id FROM Student WHERE student_id = ?', 
            [s_id]
        );
        
        if (stRes.length === 0 || !stRes[0]?.class_id) {
            return res.status(404).json({ error: 'Uczeń nie jest aktualnie przypisany do żadnego oddziału klasowego.' });
        }
        const c_id = stRes[0].class_id;


        let query = `
            SELECT 
                l.lesson_id, 
                DAYNAME(l.start_time) as day_name, 
                TIME_FORMAT(l.start_time, '%H:%i') as start_time_only,
                l.start_time as raw_start_time, 
                c.name as subject_name, 
                l.room_id as room, 
                u.last_name as teacher_name, 
                l.duration_min,
                (SELECT COUNT(*) FROM Absence a WHERE a.student_id = ? AND a.lesson_id = l.lesson_id) as is_absent
            FROM Lesson l 
            JOIN Course c ON l.course_id = c.course_id 
            LEFT JOIN Staff s ON l.teacher_id = s.staff_id 
            LEFT JOIN User u ON s.user_id = u.user_id
            WHERE l.class_id = ? AND l.start_time >= ?`;

        if (onlyFuture) {
            console.log(`[FILTER] Zastosowano filtr tylko nadchodzących lekcji (?future=true)`);
            query += ` AND DATE_ADD(l.start_time, INTERVAL l.duration_min MINUTE) > NOW()`;
        }

        query += ` ORDER BY l.start_time ASC`;

        console.log(`[DB-EXECUTE] Wykonywanie zapytania planu dla Class ID: ${c_id}`);
        const [rows]: any = await connection.execute(query, [s_id, c_id, getSchoolYearStart()]);
        

        const formattedSchedule = rows.map((row: any) => ({
            ...row, 
            time_slot: getSlot(row.start_time_only),
            day_of_week: polishDays[row.day_name] || row.day_name,
            subject: row.subject_name, 
            teacher: row.teacher_name || 'Nauczyciel nieprzypisany',
            is_absent: row.is_absent > 0
        }));

        console.log(`[SUCCESS] Przesyłanie planu (${formattedSchedule.length} lekcji) do klienta.`);
        res.json(formattedSchedule);

    } catch (error: any) { 
        console.error("[CRITICAL SQL ERROR] Błąd w GET /schedule:", error.message);
        res.status(500).json({ error: 'Wystąpił wewnętrzny błąd podczas generowania planu lekcji: ' + error.message }); 
    } finally { 
        if (connection) {
            await connection.end();
            console.log("[DB-SESSION] Zamknięto połączenie planu lekcji.");
        }
    }
});


router.get('/attendance', authenticateToken, async (req: AuthRequest, res: Response) => {
    const user = req.user;
    const childId = req.headers['x-child-id'];
    
    console.log(`[ATTENDANCE-CALC] Inicjalizacja obliczeń frekwencji. User: ${user?.email}`);

    let connection;
    try {
        connection = await getConn();
        let s_id, c_id;


        if (user!.role === 'parent' && childId) {
            s_id = childId;
            const [r]: any = await connection.execute('SELECT class_id FROM Student WHERE student_id = ?', [s_id]);
            c_id = r[0]?.class_id;
        } else {
            const [r]: any = await connection.execute(
                'SELECT student_id, class_id FROM Student WHERE user_id = ?', 
                [user!.id]
            );
            if (r.length === 0) return res.status(404).json({ error: 'Nie odnaleziono studenta.' });
            s_id = r[0].student_id; 
            c_id = r[0].class_id;
        }

        const semStart = getSchoolYearStart();
        console.log(`[ATT-STATS] Liczenie dla Student ID: ${s_id}, Class ID: ${c_id}, Start: ${semStart}`);


        const [totalRes]: any = await connection.execute(
            'SELECT COUNT(*) as total FROM Lesson WHERE class_id = ? AND start_time BETWEEN ? AND NOW()', 
            [c_id, semStart]
        );
        

        const [absRes]: any = await connection.execute(
            'SELECT COUNT(DISTINCT lesson_id) as absent FROM Absence WHERE student_id = ? AND date >= ?', 
            [s_id, semStart]
        );

        const totalLessonsCount = totalRes[0].total;
        const absencesCount = absRes[0].absent;
        

        let percentage = 100;
        if (totalLessonsCount > 0) {
            percentage = Math.max(0, Math.round(((totalLessonsCount - absencesCount) / totalLessonsCount) * 100));
        }
        
        console.log(`[ATT-RESULT] Wynik: ${percentage}% (Lekcje: ${totalLessonsCount}, Absencje: ${absencesCount})`);
        res.json({ 
            percentage,
            meta: {
                total_conducted_lessons: totalLessonsCount,
                student_absences: absencesCount,
                calculation_date: new Date().toISOString()
            }
        });

    } catch (error: any) { 
        console.error("[ERROR] Błąd krytyczny w GET /attendance:", error.message);
        res.status(500).json({ error: 'Nie udało się przetworzyć statystyk obecności: ' + error.message }); 
    } finally { 
        if (connection) await connection.end(); 
    }
});


router.get('/grades', authenticateToken, async (req: AuthRequest, res: Response) => {
    const user = req.user;
    const childId = req.headers['x-child-id'];
    
    console.log(`[GRADES-FETCH] Inicjalizacja pobierania ocen. Użytkownik: ${user?.email}`);
    console.log(`[GRADES-CONTEXT] Rola: ${user?.role}, Aktywne Dziecko (Nagłówek): ${childId || 'Brak'}`);

    let connection;
    try {
        connection = await getConn();
        let s_id;
        

        if (user!.role === 'parent' && childId) {
            s_id = childId;
            console.log(`[AUTH-SUCCESS] Rodzic autoryzowany do wglądu w oceny dziecka ID: ${s_id}`);
        } else {
            console.log(`[AUTH-SUCCESS] Student autoryzowany do wglądu w oceny własne.`);
            const [studentRow]: any = await connection.execute(
                'SELECT student_id FROM Student WHERE user_id = ?', 
                [user!.id]
            );
            
            if (studentRow.length === 0) {
                console.error(`[DB-ERROR] Nie odnaleziono rekordu studenta dla User ID: ${user!.id}`);
                return res.status(404).json({ error: 'Błąd synchronizacji: Nie odnaleziono powiązanego profilu studenta.' });
            }
            s_id = studentRow[0].student_id;
        }


        const query = `
            SELECT 
                g.grade, 
                g.weight, 
                c.name as subject_name, 
                g.created_at,
                g.comment
            FROM Grade g
            JOIN Course c ON g.course_id = c.course_id 
            WHERE g.student_id = ? AND g.created_at >= ?
            ORDER BY g.created_at DESC`;

        console.log(`[DB-QUERY] Pobieranie ocen dla Student ID: ${s_id} od daty: ${getSchoolYearStart()}`);
        const [grades]: any = await connection.execute(query, [s_id, getSchoolYearStart()]);
        
        console.log(`[SUCCESS] Znaleziono ${grades.length} ocen dla bieżącego okresu.`);
        res.json(grades);

    } catch (error: any) {
        console.error("[CRITICAL DATABASE ERROR] Błąd w GET /grades:", error.message);
        res.status(500).json({ 
            error: 'Wystąpił błąd podczas synchronizacji arkusza ocen. Prosimy o kontakt z administratorem.',
            details: error.message 
        });
    } finally {
        if (connection) {
            await connection.end();
            console.log("[DB-SESSION] Sesja pobierania ocen została poprawnie zamknięta.");
        }
    }
});


router.get('/class-info', authenticateToken, async (req: AuthRequest, res: Response) => {
    const user = req.user;
    const childId = req.headers['x-child-id'];
    
    console.log(`[CLASS-INFO-LOG] Żądanie danych klasy od: ${user?.email}`);

    let connection;
    try {
        connection = await getConn();
        let s_id;

        if (user!.role === 'parent' && childId) {
            s_id = childId;
            console.log(`[CONTEXT] Przełączono na profil klasy dziecka ID: ${s_id}`);
        } else {
            const [studentRow]: any = await connection.execute(
                'SELECT student_id FROM Student WHERE user_id = ?', 
                [user!.id]
            );
            if (studentRow.length === 0) return res.status(404).json({ error: 'Błąd: Nie odnaleziono profilu ucznia.' });
            s_id = studentRow[0].student_id;
        }


        const classQuery = `
            SELECT 
                s.class_id, 
                c.name as class_name, 
                u.first_name as educator_name, 
                u.last_name as educator_surname,
                u.email as educator_email
            FROM Student s 
            LEFT JOIN Class c ON s.class_id = c.class_id
            LEFT JOIN Staff st ON c.main_teacher_id = st.staff_id 
            LEFT JOIN User u ON st.user_id = u.user_id
            WHERE s.student_id = ?`;

        console.log(`[DB-QUERY] Pobieranie informacji o klasie dla studenta ID: ${s_id}`);
        const [studentRes]: any = await connection.execute(classQuery, [s_id]);
        const classInfo = studentRes[0];


        if (!classInfo?.class_id) {
            console.warn(`[WARNING] Student ID ${s_id} nie jest przypisany do żadnej klasy.`);
            return res.json({ 
                info: { class_name: "Klasa niezdefiniowana" }, 
                announcements: [],
                status: "UNASSIGNED"
            });
        }


        console.log(`[DB-QUERY] Pobieranie tablicy ogłoszeń dla Class ID: ${classInfo.class_id}`);
        const [ann]: any = await connection.execute(`
            SELECT 
                a.title, 
                a.content, 
                a.created_at, 
                u.first_name, 
                u.last_name 
            FROM Announcement a 
            LEFT JOIN User u ON a.user_id = u.user_id 
            WHERE a.class_id = ? 
            ORDER BY a.created_at DESC`, 
            [classInfo.class_id]
        );

        console.log(`[SUCCESS] Dane klasy i ${ann.length} ogłoszeń przesłane do klienta.`);
        res.json({ 
            info: classInfo, 
            announcements: ann,
            meta: {
                timestamp: new Date().toISOString(),
                child_context: childId || null
            }
        });
    } catch (error: any) {
        console.error("[ERROR] Błąd krytyczny w GET /class-info:", error.message);
        res.status(500).json({ error: 'Nie udało się pobrać danych klasy: ' + error.message });
    } finally {
        if (connection) {
            await connection.end();
            console.log("[DB-SESSION] Zamknięto sesję danych klasy.");
        }
    }
});


router.get('/courses', authenticateToken, async (req: AuthRequest, res: Response) => {
    const user = req.user;
    const childId = req.headers['x-child-id'];
    
    console.log(`[COURSES-LIST] Inicjalizacja pobierania przedmiotów. User: ${user?.email}`);

    let connection;
    try {
        connection = await getConn();
        let s_id;
        let c_id;


        if (user!.role === 'parent' && childId) {
            s_id = childId;
            console.log(`[AUTH] Tryb Rodzica: Pobieranie kursów dla dziecka ID: ${s_id}`);

            const [classRes]: any = await connection.execute('SELECT class_id FROM Student WHERE student_id = ?', [s_id]);
            c_id = classRes[0]?.class_id;
        } else {
            console.log(`[AUTH] Tryb Studenta: Pobieranie własnych kursów.`);
            const [studentRow]: any = await connection.execute(
                'SELECT student_id, class_id FROM Student WHERE user_id = ?', 
                [user!.id]
            );
            if (studentRow.length === 0) return res.status(404).json({ error: 'Nie odnaleziono Twojego profilu.' });
            s_id = studentRow[0].student_id;
            c_id = studentRow[0].class_id;
        }

        const semStart = getSchoolYearStart();


        const query = `
            SELECT DISTINCT 
                c.course_id, 
                c.name as subject_name, 
                u.last_name as teacher_surname,
                u.first_name as teacher_firstname,
                (SELECT COUNT(*) FROM Lesson l 
                 WHERE l.course_id = c.course_id AND l.class_id = ? 
                 AND l.start_time BETWEEN ? AND NOW()) as total_lessons,
                (SELECT COUNT(*) FROM Absence a 
                 JOIN Lesson l2 ON a.lesson_id = l2.lesson_id 
                 WHERE l2.course_id = c.course_id AND a.student_id = ? 
                 AND l2.start_time >= ?) as absent_lessons
            FROM Course c 
            JOIN Lesson l ON c.course_id = l.course_id 
            LEFT JOIN Staff st ON l.teacher_id = st.staff_id
            LEFT JOIN User u ON st.user_id = u.user_id 
            WHERE l.class_id = ? 
            GROUP BY c.course_id 
            ORDER BY c.name`;

        console.log(`[DB-QUERY] Wykonywanie obliczeń frekwencji dla przedmiotów studenta ${s_id}`);
        const [courses]: any = await connection.execute(query, [c_id, semStart, s_id, semStart, c_id]);
        
        console.log(`[SUCCESS] Znaleziono ${courses.length} aktywnych kursów.`);
        res.json(courses);
    } catch (error: any) {
        console.error("[CRITICAL ERROR] GET /courses failed:", error.message);
        res.status(500).json({ error: 'Błąd generowania listy przedmiotów: ' + error.message });
    } finally {
        if (connection) await connection.end();
    }
});


router.get('/courses/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
    const user = req.user;
    const courseId = req.params.id;
    const childId = req.headers['x-child-id'];
    
    if (!courseId) return res.status(400).json({ error: 'Brak identyfikatora przedmiotu.' });

    let connection;
    try {
        connection = await getConn();
        let s_id, c_id;

        if (user!.role === 'parent' && childId) {
            s_id = childId;
            const [cRes]: any = await connection.execute('SELECT class_id FROM Student WHERE student_id = ?', [s_id]);
            c_id = cRes[0]?.class_id;
        } else {
            const [sRes]: any = await connection.execute('SELECT student_id, class_id FROM Student WHERE user_id = ?', [user!.id]);
            s_id = sRes[0].student_id; 
            c_id = sRes[0].class_id;
        }

        const semStart = getSchoolYearStart();
        

        const [grades]: any = await connection.execute(`
            SELECT grade, weight, created_at, comment FROM Grade 
            WHERE student_id = ? AND course_id = ? AND created_at >= ? 
            ORDER BY created_at DESC`, [s_id, courseId, semStart]);


        const [course]: any = await connection.execute(`SELECT name, description FROM Course WHERE course_id = ?`, [courseId]);
        

        const [missed]: any = await connection.execute(`
            SELECT a.date, l.start_time 
            FROM Absence a 
            JOIN Lesson l ON a.lesson_id = l.lesson_id 
            WHERE a.student_id = ? AND l.course_id = ? AND a.date >= ? 
            ORDER BY a.date DESC`, [s_id, courseId, semStart]);

        console.log(`[DETAILS] Pobrano dane kursu ${courseId} dla studenta ${s_id}.`);
        res.json({ 
            subject: course[0] || { name: "Przedmiot" }, 
            grades, 
            absences: missed 
        });
    } catch (error: any) {
        console.error("[ERROR] GET /courses/:id failed:", error.message);
        res.status(500).json({ error: 'Błąd szczegółów przedmiotu: ' + error.message });
    } finally {
        if (connection) await connection.end();
    }
});






function getLessonRelativeDay(date: Date) {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.toDateString() === today.toDateString()) return "Dzisiaj";
    if (date.toDateString() === tomorrow.toDateString()) return "Jutro";
    
    return date.toLocaleDateString('pl-PL', { weekday: 'long' });
}

router.get('/dashboard-summary', authenticateToken, async (req: AuthRequest, res: Response) => {
    const user = req.user;
    const childId = req.headers['x-child-id'];
    let connection;

    try {
        connection = await getConn();
        let s_id, c_id;

        if (user!.role === 'parent' && childId) {
            s_id = childId;
            const [r]: any = await connection.execute('SELECT class_id FROM Student WHERE student_id = ?', [s_id]);
            c_id = r[0]?.class_id;
        } else {
            const [r]: any = await connection.execute('SELECT student_id, class_id FROM Student WHERE user_id = ?', [user!.id]);
            if (r.length === 0) return res.status(404).json({ error: 'Profil nie istnieje.' });
            s_id = r[0].student_id; 
            c_id = r[0].class_id;
        }

        const semStart = getSchoolYearStart();

        const [totalL]: any = await connection.execute(
            'SELECT COUNT(*) as total FROM Lesson WHERE class_id = ? AND start_time BETWEEN ? AND NOW()', [c_id, semStart]
        );
        const [absentL]: any = await connection.execute(
            'SELECT COUNT(DISTINCT lesson_id) as absent FROM Absence WHERE student_id = ? AND date >= ?', [s_id, semStart]
        );
        
        const conducted = totalL[0].total || 0;
        const missed = absentL[0].absent || 0;
        const attendance = conducted > 0 ? Math.round(((conducted - missed) / conducted) * 100) : 100;

        const [nextLessonsRaw]: any = await connection.execute(`
            SELECT 
                l.lesson_id, 
                c.name as subject, 
                l.start_time, 
                l.room_name,   
                l.room_id,
                u.last_name as teacher 
            FROM Lesson l
            JOIN Course c ON l.course_id = c.course_id
            LEFT JOIN Staff s ON l.teacher_id = s.staff_id
            LEFT JOIN User u ON s.user_id = u.user_id
            WHERE l.class_id = ? AND l.start_time > NOW()
            ORDER BY l.start_time ASC LIMIT 1`, [c_id]);

        const formattedNextLessons = nextLessonsRaw.map((l: any) => {
            const date = new Date(l.start_time);
            return {
                ...l,
                room: l.room_name || l.room_id,
                relative_day: getLessonRelativeDay(date),
                time_display: date.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }),
                teacher: l.teacher || 'Brak danych'
            };
        });

        const [recentGrades]: any = await connection.execute(`
            SELECT g.grade, g.weight, c.name as subject, g.created_at
            FROM Grade g
            JOIN Course c ON g.course_id = c.course_id
            WHERE g.student_id = ?
            ORDER BY g.created_at DESC LIMIT 5`, [s_id]);

        const [ann]: any = await connection.execute(`
            SELECT a.title, a.content, a.created_at, u.first_name, u.last_name
            FROM Announcement a
            LEFT JOIN User u ON a.user_id = u.user_id
            WHERE a.class_id = ? OR a.class_id IS NULL
            ORDER BY a.created_at DESC LIMIT 5`, [c_id]);

        res.json({
            attendance,
            nextLessons: formattedNextLessons,
            recentGrades: recentGrades.map((g: any) => ({
                ...g,
                grade: parseFloat(g.grade).toString(),
                weight: parseFloat(g.weight).toFixed(2)
            })),
            announcement: ann[0] || null,
            announcements: ann
        });

    } catch (error: any) {
        console.error("[DASHBOARD-ERROR]", error.message);
        res.status(500).json({ error: 'Krytyczny błąd agregacji danych.' });
    } finally {
        if (connection) await connection.end();
    }
});

export default router;