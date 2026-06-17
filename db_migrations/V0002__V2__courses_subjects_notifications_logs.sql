
-- Курсы обучения (1-4 год)
CREATE TABLE courses (
    id SERIAL PRIMARY KEY,
    year INTEGER NOT NULL CHECK (year BETWEEN 1 AND 4),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Предметы (привязаны к курсу)
CREATE TABLE subjects (
    id SERIAL PRIMARY KEY,
    course_id INTEGER NOT NULL REFERENCES courses(id),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Подканалы предмета (объявления, материалы, задания, вопросы, общий)
CREATE TABLE subject_channels (
    id SERIAL PRIMARY KEY,
    subject_id INTEGER NOT NULL REFERENCES subjects(id),
    name VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Привязка студентов к курсу
CREATE TABLE enrollments (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    course_id INTEGER NOT NULL REFERENCES courses(id),
    enrolled_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, course_id)
);

-- Уведомления
CREATE TABLE notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    type VARCHAR(50) NOT NULL,
    title VARCHAR(200) NOT NULL,
    body TEXT,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Логи действий (для администратора)
CREATE TABLE audit_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    details TEXT,
    ip VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Добавляем поле subject_channel_id в messages (nullable — для совместимости с общими каналами)
ALTER TABLE messages ADD COLUMN subject_channel_id INTEGER REFERENCES subject_channels(id);

-- Добавляем поле subject_channel_id в files
ALTER TABLE files ADD COLUMN subject_channel_id INTEGER REFERENCES subject_channels(id);

-- Добавляем поле reactions в messages (json строка)
ALTER TABLE messages ADD COLUMN reactions TEXT DEFAULT '{}';

-- Заполняем 4 курса
INSERT INTO courses (year, name, description) VALUES
    (1, '1 курс', 'Первый год обучения'),
    (2, '2 курс', 'Второй год обучения'),
    (3, '3 курс', 'Третий год обучения'),
    (4, '4 курс', 'Четвертый год обучения');

-- Предметы для каждого курса
INSERT INTO subjects (course_id, name, description) VALUES
    (1, 'Математика', 'Высшая математика'), (1, 'Информатика', 'Основы информатики'), (1, 'Физика', 'Общая физика'),
    (2, 'Программирование', 'Алгоритмы и структуры данных'), (2, 'Базы данных', 'Проектирование БД'), (2, 'Сети', 'Компьютерные сети'),
    (3, 'Веб-разработка', 'Frontend и Backend'), (3, 'Машинное обучение', 'Основы ML'), (3, 'Безопасность', 'Информационная безопасность'),
    (4, 'Дипломный проект', 'Разработка дипломной работы'), (4, 'Практика', 'Производственная практика'), (4, 'Управление проектами', 'PM методологии');
