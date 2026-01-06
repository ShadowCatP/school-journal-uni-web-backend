-- 1. CZYSZCZENIE I TWORZENIE BAZY
DROP DATABASE IF EXISTS school;
CREATE DATABASE school DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE school;

-- 2. TWORZENIE TABEL
CREATE TABLE User (
    user_id int(8) NOT NULL AUTO_INCREMENT,
    first_name varchar(25) NOT NULL,
    middle_name varchar(25),
    last_name varchar(25) NOT NULL,
    email varchar(50) NOT NULL UNIQUE,
    password_hash varchar(255) NOT NULL,
    pesel char(11) NOT NULL UNIQUE,
    created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id),
    INDEX (first_name),
    INDEX (last_name)
);

CREATE TABLE Student (
    student_id int(5) NOT NULL AUTO_INCREMENT,
    user_id int(8) NOT NULL,
    class_id int(4),
    student_number int(10) NOT NULL,
    enrollment_date datetime NOT NULL,
    PRIMARY KEY (student_id),
    INDEX (user_id),
    INDEX (class_id),
    UNIQUE INDEX (student_number)
);

CREATE TABLE Parent (
    parent_id int(6) NOT NULL AUTO_INCREMENT,
    user_id int(8) NOT NULL,
    Address_address_id int(5) NOT NULL,
    PRIMARY KEY (parent_id),
    INDEX (user_id),
    INDEX (Address_address_id)
);

CREATE TABLE Occupations (
    occupation_id int(3) NOT NULL AUTO_INCREMENT,
    occupation varchar(20) NOT NULL UNIQUE,
    PRIMARY KEY (occupation_id)
);

CREATE TABLE Staff (
    staff_id int(5) NOT NULL AUTO_INCREMENT,
    user_id int(8) NOT NULL,
    occupation_id int(3) NOT NULL,
    employed_at datetime NOT NULL,
    salary int(6) NOT NULL,
    PRIMARY KEY (staff_id),
    INDEX (user_id),
    INDEX (occupation_id)
);

CREATE TABLE Class (
    class_id int(4) NOT NULL AUTO_INCREMENT,
    main_teacher_id int(5),
    name varchar(25) NOT NULL,
    PRIMARY KEY (class_id),
    INDEX (main_teacher_id)
);

CREATE TABLE Lesson (
    lesson_id int(10) NOT NULL AUTO_INCREMENT,
    class_id int(4) NOT NULL,
    course_id int(6) NOT NULL,
    room_id int(3) NOT NULL,
    start_time datetime NOT NULL,
    duration_min int(3) NOT NULL,
    room_name varchar(50) NOT NULL,
    PRIMARY KEY (lesson_id),
    INDEX (class_id),
    INDEX (course_id),
    INDEX (start_time)
);

CREATE TABLE Subject (
    subject_id int(3) NOT NULL AUTO_INCREMENT,
    name varchar(25) NOT NULL,
    description text NOT NULL,
    PRIMARY KEY (subject_id)
);

CREATE TABLE ParentStudentPair (
    Parent_parent_id int(6) NOT NULL,
    Student_student_id int(5) NOT NULL,
    relationship_id int(3) NOT NULL,
    PRIMARY KEY (Parent_parent_id, Student_student_id),
    INDEX (relationship_id)
);

CREATE TABLE Room (
    room_id int(3) NOT NULL AUTO_INCREMENT,
    subject_id int(3),
    name varchar(50) NOT NULL,
    capacity int(3) NOT NULL,
    floor_number int(2) NOT NULL,
    PRIMARY KEY (room_id),
    INDEX (subject_id)
);

CREATE TABLE Grade (
    grade_id int(8) NOT NULL AUTO_INCREMENT,
    student_id int(5) NOT NULL,
    lesson_id int(10),
    course_id int(6) NOT NULL,
    grade int(3) NOT NULL,
    created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    weight decimal(3, 2) NOT NULL,
    comment varchar(255),
    PRIMARY KEY (grade_id),
    INDEX (student_id),
    INDEX (course_id)
);

CREATE TABLE Announcement (
    announcement_id int(6) NOT NULL AUTO_INCREMENT,
    user_id int(8) NOT NULL,
    class_id int(4),
    title varchar(255) NOT NULL,
    content text NOT NULL,
    created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_pinned bit(1) NOT NULL,
    PRIMARY KEY (announcement_id),
    INDEX (class_id),
    INDEX (is_pinned)
);

CREATE TABLE Course (
    course_id int(6) NOT NULL AUTO_INCREMENT,
    subject_id int(3) NOT NULL,
    name varchar(50) NOT NULL,
    description text NOT NULL,
    created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    weight int(2) NOT NULL,
    PRIMARY KEY (course_id),
    INDEX (subject_id)
);

CREATE TABLE StudentCoursePair (
    Student_student_id int(5) NOT NULL,
    Course_course_id int(6) NOT NULL,
    PRIMARY KEY (Student_student_id, Course_course_id)
);

CREATE TABLE FinalGrade (
    student_id int(5) NOT NULL,
    course_id int(6) NOT NULL,
    computed_average int(3) NOT NULL,
    override_grade int(3),
    PRIMARY KEY (student_id, course_id)
);

CREATE TABLE TeacherCoursePair (
    teacher_id int(5) NOT NULL,
    course_id int(6) NOT NULL,
    PRIMARY KEY (teacher_id, course_id)
);

CREATE TABLE Absence (
    student_id int(5) NOT NULL,
    lesson_id int(10) NOT NULL,
    late_reason_id int(3),
    `date` datetime NOT NULL,
    PRIMARY KEY (student_id, lesson_id),
    INDEX (lesson_id)
);

CREATE TABLE LateReason (
    late_reason_id int(3) NOT NULL AUTO_INCREMENT,
    late_reason varchar(100) NOT NULL,
    PRIMARY KEY (late_reason_id)
);

CREATE TABLE Scholarship (
    scholarship_id int(5) NOT NULL AUTO_INCREMENT,
    student_id int(5) NOT NULL,
    scholarship_type_id int(2) NOT NULL,
    amount decimal(7, 2) NOT NULL,
    start_date datetime NOT NULL,
    PRIMARY KEY (scholarship_id),
    INDEX (student_id)
);

CREATE TABLE ScholarshipType (
    scholarship_type_id int(2) NOT NULL AUTO_INCREMENT,
    requirements text NOT NULL,
    duration_semesters int(2) NOT NULL,
    PRIMARY KEY (scholarship_type_id)
);

CREATE TABLE Address (
    address_id int(5) NOT NULL AUTO_INCREMENT,
    street_name varchar(50),
    building_number varchar(4) NOT NULL,
    apartment_number varchar(4),
    town varchar(25) NOT NULL,
    voivodeship varchar(25) NOT NULL,
    country varchar(25) NOT NULL,
    post_code varchar(8) NOT NULL,
    PRIMARY KEY (address_id)
);

CREATE TABLE RelationshipType (
    relationship_id int(3) NOT NULL AUTO_INCREMENT,
    relationship varchar(25) NOT NULL,
    PRIMARY KEY (relationship_id)
);

CREATE TABLE UserPhoneNumber (
    user_id int(8) NOT NULL,
    phone_number_id int(10) NOT NULL,
    PRIMARY KEY (user_id, phone_number_id)
);

-- 3. TRIGGERY I PROCEDURY
DELIMITER $$

CREATE TRIGGER BeforeAddressDelete BEFORE DELETE ON Address
FOR EACH ROW
BEGIN
    IF EXISTS (SELECT 1 FROM Parent WHERE Address_address_id = OLD.address_id) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Nie można usunąć adresu: jest powiązany z rodzicem.';
    END IF;
END$$

CREATE TRIGGER BeforeRelationTypeDelete BEFORE DELETE ON RelationshipType
FOR EACH ROW
BEGIN
    IF EXISTS (SELECT 1 FROM ParentStudentPair WHERE relationship_id = OLD.relationship_id) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Nie można usunąć typu relacji: jest używany w parze Rodzic-Student.';
    END IF;
END$$

CREATE TRIGGER BeforeScholarshipTypeDelete BEFORE DELETE ON ScholarshipType
FOR EACH ROW
BEGIN
    IF EXISTS (SELECT 1 FROM Scholarship WHERE scholarship_type_id = OLD.scholarship_type_id) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Nie można usunąć typu stypendium: jest powiązany z aktywnym stypendium.';
    END IF;
END$$

CREATE TRIGGER BeforeLateReasonDelete BEFORE DELETE ON LateReason
FOR EACH ROW
BEGIN
    IF EXISTS (SELECT 1 FROM Absence WHERE late_reason_id = OLD.late_reason_id) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Nie można usunąć powodu spóźnienia: jest używany we wpisach nieobecności.';
    END IF;
END$$

CREATE TRIGGER BeforeClassDelete BEFORE DELETE ON Class
FOR EACH ROW
BEGIN
    IF EXISTS (SELECT 1 FROM Student WHERE class_id = OLD.class_id) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Nie można usunąć klasy: ma przypisanych uczniów.';
    END IF;
    IF EXISTS (SELECT 1 FROM Lesson WHERE class_id = OLD.class_id) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Nie można usunąć klasy: ma zaplanowane lekcje.';
    END IF;
    IF EXISTS (SELECT 1 FROM Class WHERE main_teacher_id = OLD.main_teacher_id AND class_id != OLD.class_id) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Nie można usunąć klasy: nauczyciel jest wychowawcą innej klasy.';
    END IF;
END$$

CREATE TRIGGER GradeSetTimestamps BEFORE INSERT ON Grade
FOR EACH ROW
BEGIN
    IF NEW.created_at IS NULL THEN SET NEW.created_at = NOW(); END IF;
    SET NEW.updated_at = NOW();
END$$

CREATE TRIGGER AnnouncementSetTimestamps BEFORE INSERT ON Announcement
FOR EACH ROW
BEGIN
    IF NEW.created_at IS NULL THEN SET NEW.created_at = NOW(); END IF;
    SET NEW.updated_at = NOW();
END$$

CREATE TRIGGER UserSetTimestamps BEFORE INSERT ON User
FOR EACH ROW
BEGIN
    IF NEW.created_at IS NULL THEN SET NEW.created_at = NOW(); END IF;
    SET NEW.updated_at = NOW();
END$$

CREATE TRIGGER CourseSetTimestamps BEFORE INSERT ON Course
FOR EACH ROW
BEGIN
    IF NEW.created_at IS NULL THEN SET NEW.created_at = NOW(); END IF;
END$$

CREATE TRIGGER AbsenceSetTimestamps BEFORE INSERT ON Absence
FOR EACH ROW
BEGIN
    IF NEW.`date` IS NULL THEN SET NEW.`date` = NOW(); END IF;
END$$

CREATE TRIGGER GradeUpdateTimestamp BEFORE UPDATE ON Grade
FOR EACH ROW SET NEW.updated_at = NOW()$$

CREATE TRIGGER AnnouncementUpdateTimestamp BEFORE UPDATE ON Announcement
FOR EACH ROW SET NEW.updated_at = NOW()$$

CREATE TRIGGER UserUpdateTimestamp BEFORE UPDATE ON User
FOR EACH ROW SET NEW.updated_at = NOW()$$

CREATE TRIGGER BeforeScholarshipInsert BEFORE INSERT ON Scholarship
FOR EACH ROW
BEGIN
    IF EXISTS (
        SELECT 1 FROM Scholarship
        WHERE student_id = NEW.student_id 
        AND scholarship_id <> NEW.scholarship_id 
        AND NEW.start_date < DATE_ADD(start_date, INTERVAL scholarship_type_id * 6 MONTH)
    ) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Operacja zablokowana: Student ma już aktywne stypendium w tym okresie.';
    END IF;
END$$

CREATE TRIGGER BeforeScholarshipUpdateOnUpdate BEFORE UPDATE ON Scholarship
FOR EACH ROW
BEGIN
    IF EXISTS (
        SELECT 1 FROM Scholarship
        WHERE student_id = NEW.student_id 
        AND scholarship_id <> NEW.scholarship_id 
        AND NEW.start_date < DATE_ADD(start_date, INTERVAL scholarship_type_id * 6 MONTH)
    ) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Operacja zablokowana: Student ma już aktywne stypendium w tym okresie.';
    END IF;
END$$

CREATE TRIGGER StudentBeforeInsert BEFORE INSERT ON Student
FOR EACH ROW
BEGIN
    DECLARE current_year CHAR(4);
    DECLARE next_sequence INT;
    IF NEW.student_number IS NULL OR NEW.student_number = 0 THEN
        SET current_year = DATE_FORMAT(NOW(), '%Y');
        SELECT COALESCE(MAX(SUBSTRING(student_number, 5)), 0) + 1 INTO next_sequence
        FROM Student
        WHERE SUBSTRING(student_number, 1, 4) = current_year;
        SET NEW.student_number = CONCAT(current_year, LPAD(next_sequence, 3, '0'));
    END IF;
END$$

CREATE PROCEDURE CalculateFinalGrade(IN student INT, IN course INT)
BEGIN
    DECLARE weighted_avg DECIMAL(5, 2);
    DECLARE total_weight DECIMAL(5, 2);

    SELECT SUM(grade * weight), SUM(weight)
    INTO weighted_avg, total_weight
    FROM Grade
    WHERE student_id = student AND course_id = course;

    IF total_weight IS NOT NULL AND total_weight > 0 THEN
        SET weighted_avg = weighted_avg / total_weight;
        INSERT INTO FinalGrade (student_id, course_id, computed_average, override_grade)
        VALUES (student, course, ROUND(weighted_avg), NULL)
        ON DUPLICATE KEY UPDATE computed_average = ROUND(weighted_avg);
    ELSE
        DELETE FROM FinalGrade
        WHERE student_id = student AND course_id = course AND override_grade IS NULL;
    END IF;
END$$

CREATE TRIGGER GradeInsert AFTER INSERT ON Grade
FOR EACH ROW BEGIN CALL CalculateFinalGrade(NEW.student_id, NEW.course_id); END$$

CREATE TRIGGER GradeUpdateCalc AFTER UPDATE ON Grade
FOR EACH ROW BEGIN CALL CalculateFinalGrade(NEW.student_id, NEW.course_id); END$$

CREATE TRIGGER AfterGradeDelete AFTER DELETE ON Grade
FOR EACH ROW BEGIN CALL CalculateFinalGrade(OLD.student_id, OLD.course_id); END$$

CREATE TRIGGER AfterUserDelete AFTER DELETE ON User
FOR EACH ROW
BEGIN
    DELETE FROM Student WHERE user_id = OLD.user_id;
    DELETE FROM Staff WHERE user_id = OLD.user_id;
    DELETE FROM Parent WHERE user_id = OLD.user_id;
    DELETE FROM Announcement WHERE user_id = OLD.user_id;
    DELETE FROM UserPhoneNumber WHERE user_id = OLD.user_id;
END$$

CREATE TRIGGER BeforeClassTeacherInsert BEFORE INSERT ON Class
FOR EACH ROW
BEGIN
    DECLARE is_teacher INT DEFAULT 0;
    SELECT 1 INTO is_teacher FROM Staff S JOIN Occupations O ON S.occupation_id = O.occupation_id
    WHERE S.staff_id = NEW.main_teacher_id AND O.occupation = 'Nauczyciel';
    IF is_teacher = 0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Błąd: Główny nauczyciel musi mieć stanowisko "Nauczyciel".'; END IF;
END$$

CREATE TRIGGER BeforeClassTeacherUpdate BEFORE UPDATE ON Class
FOR EACH ROW
BEGIN
    DECLARE is_teacher INT DEFAULT 0;
    IF NEW.main_teacher_id IS NOT NULL AND (OLD.main_teacher_id IS NULL OR NEW.main_teacher_id <> OLD.main_teacher_id) THEN
        SELECT 1 INTO is_teacher FROM Staff S JOIN Occupations O ON S.occupation_id = O.occupation_id
        WHERE S.staff_id = NEW.main_teacher_id AND O.occupation = 'Nauczyciel';
        IF is_teacher = 0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Błąd: Główny nauczyciel musi mieć stanowisko "Nauczyciel".'; END IF;
    END IF;
END$$

CREATE TRIGGER BeforeCourseTeacherInsert BEFORE INSERT ON TeacherCoursePair
FOR EACH ROW
BEGIN
    DECLARE is_teacher INT DEFAULT 0;
    SELECT 1 INTO is_teacher FROM Staff S JOIN Occupations O ON S.occupation_id = O.occupation_id
    WHERE S.staff_id = NEW.teacher_id AND O.occupation = 'Nauczyciel';
    IF is_teacher = 0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Błąd: Nauczyciel kursu musi mieć stanowisko "Nauczyciel".'; END IF;
END$$

CREATE TRIGGER BeforeCourseTeacherUpdate BEFORE UPDATE ON TeacherCoursePair
FOR EACH ROW
BEGIN
    DECLARE is_teacher INT DEFAULT 0;
    IF NEW.teacher_id IS NOT NULL AND NEW.teacher_id <> OLD.teacher_id THEN
        SELECT 1 INTO is_teacher FROM Staff S JOIN Occupations O ON S.occupation_id = O.occupation_id
        WHERE S.staff_id = NEW.teacher_id AND O.occupation = 'Nauczyciel';
        IF is_teacher = 0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Błąd: Nauczyciel kursu musi mieć stanowisko "Nauczyciel".'; END IF;
    END IF;
END$$

DELIMITER ;

-- 4. INSERT DANYCH TESTOWYCH
INSERT INTO RelationshipType (relationship) VALUES ('Matka'), ('Ojciec'), ('Opiekun');
INSERT INTO Occupations (occupation) VALUES ('Nauczyciel'), ('Sekretarka'), ('Dyrektor');
INSERT INTO Subject (name, description) VALUES ('Matematyka', 'Algebra, geometria i rachunek różniczkowy'), ('Język polski', 'Gramatyka, literatura i ortografia'), ('Historia', 'Dzieje Polski i świata');
INSERT INTO Address (street_name, building_number, apartment_number, town, voivodeship, country, post_code) VALUES ('ul. Kwiatowa', '12', '5', 'Warszawa', 'Mazowieckie', 'Polska', '00-001'), ('ul. Leśna', '7A', NULL, 'Kraków', 'Małopolskie', 'Polska', '30-002'), ('al. Solidarności', '101', '12', 'Gdańsk', 'Pomorskie', 'Polska', '80-003');
INSERT INTO User (first_name, middle_name, last_name, email, password_hash, pesel, created_at, updated_at) VALUES ('Anna', NULL, 'Kowalska', 'anna.kowalska@example.pl', 'hash1', '90010112345', '2024-09-01 08:00:00', '2024-09-01 08:00:00'), ('Jan', 'Piotr', 'Nowak', 'jan.nowak@example.pl', 'hash2', '85050567890', '2024-09-01 08:05:00', '2024-09-01 08:05:00'), ('Marta', NULL, 'Wiśniewska', 'marta.wisniewska@example.pl', 'hash3', '92021234567', '2024-09-01 08:10:00', '2024-09-01 08:10:00'), ('Krzysztof', 'Adam', 'Zieliński', 'krzysztof.zielinski@example.pl', 'hash4', '88080811223', '2024-09-01 08:15:00', '2024-09-01 08:15:00'), ('Ewa', NULL, 'Dąbrowska', 'ewa.dabrowska@example.pl', 'hash5', '93030399887', '2024-09-01 08:20:00', '2024-09-01 08:20:00');
INSERT INTO ScholarshipType (requirements, duration_semesters) VALUES ('Wysokie wyniki w nauce', 2), ('Aktywność społeczna', 1);
INSERT INTO LateReason (late_reason) VALUES ('Korki'), ('Wizyta u lekarza');
INSERT INTO Staff (user_id, occupation_id, employed_at, salary) VALUES (2, 1, '2023-01-10 09:00:00', 5500), (4, 1, '2022-09-01 09:00:00', 6000), (5, 2, '2024-02-15 09:00:00', 4200);
INSERT INTO Class (main_teacher_id, name) VALUES (1, '1A'), (2, '2B');
INSERT INTO Course (subject_id, name, description, created_at, weight) VALUES (1, 'Algebra I', 'Podstawy algebry liniowej', '2024-09-05 10:00:00', 2), (2, 'Literatura współczesna', 'Analiza tekstów współczesnych', '2024-09-05 10:10:00', 1), (3, 'Historia Polski', 'Najważniejsze wydarzenia historyczne', '2024-09-05 10:20:00', 2);
INSERT INTO Room (subject_id, name, capacity, floor_number) VALUES (1, 'Sala 101', 30, 1), (NULL, 'Sala 202', 25, 2), (2, 'Sala 303', 20, 3);
INSERT INTO Lesson (class_id, course_id, room_id, start_time, duration_min, room_name) VALUES (1, 1, 1, '2024-09-10 08:00:00', 45, 'Sala 101'), (1, 2, 2, '2024-09-10 09:00:00', 45, 'Sala 202'), (2, 3, 3, '2024-09-11 10:00:00', 45, 'Sala 303');
INSERT INTO Student (user_id, class_id, student_number, enrollment_date) VALUES (1, 1, 100001, '2024-09-01 12:00:00'), (3, 1, 100002, '2024-09-01 12:10:00');
INSERT INTO Parent (user_id, Address_address_id) VALUES (4, 1), (5, 2);
INSERT INTO ParentStudentPair (Parent_parent_id, Student_student_id, relationship_id) VALUES (1, 1, 1), (2, 2, 2);
INSERT INTO TeacherCoursePair (teacher_id, course_id) VALUES (1, 1), (2, 3);
INSERT INTO StudentCoursePair (Student_student_id, Course_course_id) VALUES (1, 1), (1, 2), (2, 3);

-- TUTAJ SĄ DODAWANE OCENY
INSERT INTO Grade (student_id, lesson_id, course_id, grade, created_at, updated_at, weight, comment) VALUES (1, 1, 1, 5, '2024-09-12 12:00:00', '2024-09-12 12:00:00', 0.50, 'Bardzo dobra praca'), (1, 2, 2, 4, '2024-09-13 12:00:00', '2024-09-13 12:00:00', 0.30, 'Solidne przygotowanie'), (2, 3, 3, 3, '2024-09-14 12:00:00', '2024-09-14 12:00:00', 0.20, 'Wymaga poprawy');

-- AKTUALIZACJA ISTNIEJĄCYCH OCEN KOŃCOWYCH
INSERT INTO FinalGrade (student_id, course_id, computed_average, override_grade) VALUES
(1, 1, 5, NULL),
(1, 2, 4, NULL),
(2, 3, 3, 4)
ON DUPLICATE KEY UPDATE
    override_grade = VALUES(override_grade),
    computed_average = VALUES(computed_average);

INSERT INTO Absence (student_id, lesson_id, late_reason_id, `date`) VALUES (1, 2, 1, '2024-09-10 09:00:00'), (2, 3, 2, '2024-09-11 10:00:00');
INSERT INTO Scholarship (student_id, scholarship_type_id, amount, start_date) VALUES (1, 1, 500.00, '2024-10-01 08:00:00'), (2, 2, 300.00, '2024-10-01 08:00:00');
INSERT INTO Announcement (user_id, class_id, title, content, created_at, updated_at, is_pinned) VALUES (2, 1, 'Plan lekcji', 'Zaktualizowany plan lekcji na wrzesień', '2024-09-08 12:00:00', '2024-09-08 12:00:00', b'1'), (5, 2, 'Zebranie rodziców', 'Zapraszamy na zebranie w przyszłym tygodniu', '2024-09-09 15:00:00', '2024-09-09 15:00:00', b'0');
INSERT INTO UserPhoneNumber (user_id, phone_number_id) VALUES (1, 500001), (2, 500002), (3, 500003), (4, 500004), (5, 500005);

-- 5. NAKŁADANIE KLUCZY OBCYCH
ALTER TABLE `ParentStudentPair` ADD CONSTRAINT `fk_parentstudentpair_parent` FOREIGN KEY (`Parent_parent_id`) REFERENCES `Parent` (`parent_id`);
ALTER TABLE `ParentStudentPair` ADD CONSTRAINT `fk_parentstudentpair_student` FOREIGN KEY (`Student_student_id`) REFERENCES `Student` (`student_id`);
ALTER TABLE `Staff` ADD CONSTRAINT `fk_staff_user` FOREIGN KEY (`user_id`) REFERENCES `User` (`user_id`);
ALTER TABLE `Student` ADD CONSTRAINT `fk_student_user` FOREIGN KEY (`user_id`) REFERENCES `User` (`user_id`);
ALTER TABLE `Parent` ADD CONSTRAINT `fk_parent_user` FOREIGN KEY (`user_id`) REFERENCES `User` (`user_id`);
ALTER TABLE `Student` ADD CONSTRAINT `fk_student_class` FOREIGN KEY (`class_id`) REFERENCES `Class` (`class_id`);
ALTER TABLE `Lesson` ADD CONSTRAINT `fk_lesson_room` FOREIGN KEY (`room_id`) REFERENCES `Room` (`room_id`);
ALTER TABLE `Announcement` ADD CONSTRAINT `fk_announcement_class` FOREIGN KEY (`class_id`) REFERENCES `Class` (`class_id`);
ALTER TABLE `Announcement` ADD CONSTRAINT `fk_announcement_user` FOREIGN KEY (`user_id`) REFERENCES `User` (`user_id`);
ALTER TABLE `Class` ADD CONSTRAINT `fk_class_main_teacher` FOREIGN KEY (`main_teacher_id`) REFERENCES `Staff` (`staff_id`);
ALTER TABLE `Grade` ADD CONSTRAINT `fk_grade_lesson` FOREIGN KEY (`lesson_id`) REFERENCES `Lesson` (`lesson_id`);
ALTER TABLE `Course` ADD CONSTRAINT `fk_course_subject` FOREIGN KEY (`subject_id`) REFERENCES `Subject` (`subject_id`);
ALTER TABLE `Lesson` ADD CONSTRAINT `fk_lesson_course` FOREIGN KEY (`course_id`) REFERENCES `Course` (`course_id`);
ALTER TABLE `Grade` ADD CONSTRAINT `fk_grade_course` FOREIGN KEY (`course_id`) REFERENCES `Course` (`course_id`);
ALTER TABLE `StudentCoursePair` ADD CONSTRAINT `fk_scp_student` FOREIGN KEY (`Student_student_id`) REFERENCES `Student` (`student_id`);
ALTER TABLE `StudentCoursePair` ADD CONSTRAINT `fk_scp_course` FOREIGN KEY (`Course_course_id`) REFERENCES `Course` (`course_id`);
ALTER TABLE `FinalGrade` ADD CONSTRAINT `fk_finalgrade_student` FOREIGN KEY (`student_id`) REFERENCES `Student` (`student_id`);
ALTER TABLE `FinalGrade` ADD CONSTRAINT `fk_finalgrade_course` FOREIGN KEY (`course_id`) REFERENCES `Course` (`course_id`);
ALTER TABLE `Absence` ADD CONSTRAINT `fk_absence_student` FOREIGN KEY (`student_id`) REFERENCES `Student` (`student_id`);
ALTER TABLE `Absence` ADD CONSTRAINT `fk_absence_lesson` FOREIGN KEY (`lesson_id`) REFERENCES `Lesson` (`lesson_id`);
ALTER TABLE `Room` ADD CONSTRAINT `fk_room_subject` FOREIGN KEY (`subject_id`) REFERENCES `Subject` (`subject_id`);
ALTER TABLE `Absence` ADD CONSTRAINT `fk_absence_late_reason` FOREIGN KEY (`late_reason_id`) REFERENCES `LateReason` (`late_reason_id`);
ALTER TABLE `Scholarship` ADD CONSTRAINT `fk_scholarship_student` FOREIGN KEY (`student_id`) REFERENCES `Student` (`student_id`);
ALTER TABLE `Scholarship` ADD CONSTRAINT `fk_scholarship_type` FOREIGN KEY (`scholarship_type_id`) REFERENCES `ScholarshipType` (`scholarship_type_id`);
ALTER TABLE `Parent` ADD CONSTRAINT `fk_parent_address` FOREIGN KEY (`Address_address_id`) REFERENCES `Address` (`address_id`);
ALTER TABLE `Grade` ADD CONSTRAINT `fk_grade_student` FOREIGN KEY (`student_id`) REFERENCES `Student` (`student_id`);
ALTER TABLE `ParentStudentPair` ADD CONSTRAINT `fk_parentstudentpair_relationship` FOREIGN KEY (`relationship_id`) REFERENCES `RelationshipType` (`relationship_id`);
ALTER TABLE `Lesson` ADD CONSTRAINT `fk_lesson_class` FOREIGN KEY (`class_id`) REFERENCES `Class` (`class_id`);
ALTER TABLE `UserPhoneNumber` ADD CONSTRAINT `fk_userphonenumber_user` FOREIGN KEY (`user_id`) REFERENCES `User` (`user_id`);
ALTER TABLE `Staff` ADD CONSTRAINT `fk_staff_occupation` FOREIGN KEY (`occupation_id`) REFERENCES `Occupations` (`occupation_id`);
ALTER TABLE `TeacherCoursePair` ADD CONSTRAINT `fk_tcp_course` FOREIGN KEY (`course_id`) REFERENCES `Course` (`course_id`);
ALTER TABLE `TeacherCoursePair` ADD CONSTRAINT `fk_tcp_teacher` FOREIGN KEY (`teacher_id`) REFERENCES `Staff` (`staff_id`);

-- 6. TWORZENIE WIDOKÓW
CREATE OR REPLACE VIEW StudentGradesDuringSemester AS
SELECT G.student_id, S.name AS subject_name, C.name AS course_name, G.grade, G.created_at AS grade_date
FROM Grade G JOIN Student T ON G.student_id = T.student_id JOIN Course C ON G.course_id = C.course_id JOIN Subject S ON C.subject_id = S.subject_id;

CREATE OR REPLACE VIEW StudentFinalGrades AS
SELECT FG.student_id, S.name AS subject_name, C.name AS course_name, FG.computed_average, FG.override_grade, COALESCE(FG.override_grade, FG.computed_average) AS final_grade
FROM FinalGrade FG JOIN Student T ON FG.student_id = T.student_id JOIN Course C ON FG.course_id = C.course_id JOIN Subject S ON C.subject_id = S.subject_id;

CREATE OR REPLACE VIEW CourseWithPlannedLessons AS
SELECT C.course_id, C.name AS course_name, S.name AS subject_name, CONCAT(U.first_name, ' ', U.last_name) AS teacher_name, L.lesson_id, L.start_time AS lesson_datetime, R.name AS room_name, R.floor_number, C.description AS lesson_topic, CASE WHEN L.start_time < NOW() THEN 'Zakończona' ELSE 'Zaplanowana' END AS lesson_status
FROM Course C JOIN Subject S ON C.subject_id = S.subject_id LEFT JOIN TeacherCoursePair TCP ON TCP.course_id = C.course_id LEFT JOIN Staff T ON TCP.teacher_id = T.staff_id LEFT JOIN User U ON T.user_id = U.user_id JOIN Lesson L ON C.course_id = L.course_id JOIN Room R ON L.room_id = R.room_id;

CREATE OR REPLACE VIEW TeacherSubjects AS
SELECT T.staff_id AS teacher_id, CONCAT(U.first_name, ' ', U.last_name) AS teacher_name, S.name AS subject_name, COUNT(C.course_id) AS number_of_courses
FROM Staff T JOIN User U ON T.user_id = U.user_id JOIN TeacherCoursePair TCP ON T.staff_id = TCP.teacher_id JOIN Course C ON TCP.course_id = C.course_id JOIN Subject S ON C.subject_id = S.subject_id
GROUP BY T.staff_id, U.first_name, U.last_name, S.name ORDER BY teacher_name, subject_name;

CREATE OR REPLACE VIEW StudentAttendance AS
SELECT A.student_id, C.course_id, C.name AS course_name, L.lesson_id, L.start_time AS lesson_date, LR.late_reason
FROM Student T JOIN StudentCoursePair SCP ON T.student_id = SCP.Student_student_id JOIN Course C ON SCP.Course_course_id = C.course_id LEFT JOIN Lesson L ON C.course_id = L.course_id LEFT JOIN Absence A ON T.student_id = A.student_id AND L.lesson_id = A.lesson_id LEFT JOIN LateReason LR ON A.late_reason_id = LR.late_reason_id;

CREATE OR REPLACE VIEW ParentContactInformation AS
SELECT P.parent_id, ParentUser.first_name AS parent_first_name, ParentUser.last_name AS parent_last_name, ParentUser.email AS parent_email, (SELECT GROUP_CONCAT(phone_number_id) FROM UserPhoneNumber WHERE user_id = ParentUser.user_id) AS phone_numbers, CONCAT(A.street_name, ' ', A.building_number) AS address_street, A.post_code, A.town, CONCAT(StudentUser.first_name, ' ', StudentUser.last_name) AS student_name
FROM Parent P JOIN User ParentUser ON P.user_id = ParentUser.user_id LEFT JOIN Address A ON P.Address_address_id = A.address_id JOIN ParentStudentPair PSP ON P.parent_id = PSP.Parent_parent_id JOIN Student T ON PSP.Student_student_id = T.student_id JOIN User StudentUser ON T.user_id = StudentUser.user_id;

CREATE OR REPLACE VIEW StudentEnrolledInCourse AS
SELECT C.course_id, C.name AS course_name, T.student_id, U.first_name AS student_first_name, U.last_name AS student_last_name, CL.name AS class_name
FROM Course C JOIN StudentCoursePair SCP ON C.course_id = SCP.Course_course_id JOIN Student T ON SCP.Student_student_id = T.student_id JOIN User U ON T.user_id = U.user_id LEFT JOIN Class CL ON T.class_id = CL.class_id;

CREATE OR REPLACE VIEW ClassInfo AS
SELECT CL.class_id, CL.name AS class_name, T.staff_id AS main_teacher_id, CONCAT(U.first_name, ' ', U.last_name) AS main_teacher_name, COUNT(S.student_id) AS number_of_students
FROM Class CL LEFT JOIN Staff T ON CL.main_teacher_id = T.staff_id LEFT JOIN User U ON T.user_id = U.user_id LEFT JOIN Student S ON CL.class_id = S.class_id
GROUP BY CL.class_id, CL.name, T.staff_id, U.first_name, U.last_name ORDER BY CL.class_id;

-- 7. ROLE I UŻYTKOWNICY (POPRAWIONO SKŁADNIĘ DLA XAMPP/MARIADB)
CREATE ROLE IF NOT EXISTS 'StudentRole';
CREATE ROLE IF NOT EXISTS 'ParentRole';
CREATE ROLE IF NOT EXISTS 'TeacherRole';
CREATE ROLE IF NOT EXISTS 'ManagementRole';
CREATE ROLE IF NOT EXISTS 'SystemAdminRole';

CREATE USER IF NOT EXISTS 'student_a'@'%' IDENTIFIED BY 's_pass1';
GRANT 'StudentRole' TO 'student_a'@'%';
SET DEFAULT ROLE 'StudentRole' FOR 'student_a'@'%';

CREATE USER IF NOT EXISTS 'parent_b'@'%' IDENTIFIED BY 'p_pass1';
GRANT 'ParentRole' TO 'parent_b'@'%';
SET DEFAULT ROLE 'ParentRole' FOR 'parent_b'@'%';

CREATE USER IF NOT EXISTS 'teacher_c'@'%' IDENTIFIED BY 't_pass1';
GRANT 'TeacherRole' TO 'teacher_c'@'%';
SET DEFAULT ROLE 'TeacherRole' FOR 'teacher_c'@'%';

CREATE USER IF NOT EXISTS 'director'@'%' IDENTIFIED BY 'd_pass1';
GRANT 'ManagementRole' TO 'director'@'%';
SET DEFAULT ROLE 'ManagementRole' FOR 'director'@'%';

CREATE USER IF NOT EXISTS 'sysadmin'@'%' IDENTIFIED BY 'a_pass1';
GRANT 'SystemAdminRole' TO 'sysadmin'@'%';
SET DEFAULT ROLE 'SystemAdminRole' FOR 'sysadmin'@'%';

GRANT SELECT ON `school`.* TO 'ManagementRole';
GRANT INSERT, UPDATE, DELETE ON `school`.`User` TO 'SystemAdminRole';
GRANT ALL PRIVILEGES ON *.* TO 'SystemAdminRole' WITH GRANT OPTION;

GRANT SELECT ON `school`.`Student` TO 'TeacherRole';
GRANT SELECT ON `school`.`Class` TO 'TeacherRole';
GRANT SELECT ON `school`.`Course` TO 'TeacherRole';
GRANT SELECT ON `school`.`Subject` TO 'TeacherRole';
GRANT SELECT ON `school`.`Room` TO 'TeacherRole';
GRANT SELECT ON `school`.`Lesson` TO 'TeacherRole';
GRANT SELECT ON `school`.`Announcement` TO 'TeacherRole';
GRANT SELECT ON `school`.`ParentContactInformation` TO 'TeacherRole';
GRANT SELECT, INSERT, UPDATE ON `school`.`Grade` TO 'TeacherRole';
GRANT SELECT, INSERT, UPDATE ON `school`.`Absence` TO 'TeacherRole';
GRANT UPDATE ON `school`.`Lesson` TO 'TeacherRole';
GRANT INSERT ON `school`.`Announcement` TO 'TeacherRole';

GRANT SELECT ON `school`.`Grade` TO 'StudentRole';
GRANT SELECT ON `school`.`FinalGrade` TO 'StudentRole';
GRANT SELECT ON `school`.`Absence` TO 'StudentRole';
GRANT SELECT ON `school`.`Course` TO 'StudentRole';
GRANT SELECT ON `school`.`Lesson` TO 'StudentRole';
GRANT SELECT ON `school`.`Announcement` TO 'StudentRole';

GRANT SELECT ON `school`.`Grade` TO 'ParentRole';
GRANT SELECT ON `school`.`FinalGrade` TO 'ParentRole';
GRANT SELECT ON `school`.`Absence` TO 'ParentRole';
GRANT SELECT ON `school`.`Course` TO 'ParentRole';
GRANT SELECT ON `school`.`Lesson` TO 'ParentRole';
GRANT SELECT ON `school`.`Announcement` TO 'ParentRole';