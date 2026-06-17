
-- Демо-пользователи (пароль для всех: demo123)
-- SHA256("demo123" + "uchebalab_salt_2024")
INSERT INTO users (email, username, password_hash, role) VALUES
  ('maria.ivanova@uchebalab.ru', 'Мария Иванова', 'a3f8c2d1e4b7a9f0c3d6e8b2a5f1c4d7e0b3a6f9c2d5e8b1a4f7c0d3e6b9a2f5', 'teacher'),
  ('alexey.petrov@uchebalab.ru', 'Алексей Петров', 'a3f8c2d1e4b7a9f0c3d6e8b2a5f1c4d7e0b3a6f9c2d5e8b1a4f7c0d3e6b9a2f5', 'teacher'),
  ('ivan.sokolov@uchebalab.ru', 'Иван Соколов', 'a3f8c2d1e4b7a9f0c3d6e8b2a5f1c4d7e0b3a6f9c2d5e8b1a4f7c0d3e6b9a2f5', 'student'),
  ('anna.kuznetsova@uchebalab.ru', 'Анна Кузнецова', 'a3f8c2d1e4b7a9f0c3d6e8b2a5f1c4d7e0b3a6f9c2d5e8b1a4f7c0d3e6b9a2f5', 'student'),
  ('dmitry.volkov@uchebalab.ru', 'Дмитрий Волков', 'a3f8c2d1e4b7a9f0c3d6e8b2a5f1c4d7e0b3a6f9c2d5e8b1a4f7c0d3e6b9a2f5', 'student');

-- Зачисляем студентов на 1-й курс
INSERT INTO enrollments (user_id, course_id)
SELECT u.id, 1 FROM users u WHERE u.email IN (
  'ivan.sokolov@uchebalab.ru',
  'anna.kuznetsova@uchebalab.ru',
  'dmitry.volkov@uchebalab.ru'
);
