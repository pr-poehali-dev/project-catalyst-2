import json
import os
import hashlib
import psycopg2


def get_db():
    return psycopg2.connect(os.environ["DATABASE_URL"])


def hash_password(password: str) -> str:
    salt = os.environ.get("SECRET_KEY", "uchebalab_salt_2024")
    return hashlib.sha256((password + salt).encode()).hexdigest()


def handler(event: dict, context) -> dict:
    """Инициализация: создание каналов и первого администратора"""
    cors = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Init-Key",
    }

    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": cors, "body": ""}

    init_key = event.get("headers", {}).get("X-Init-Key", "")
    if init_key != os.environ.get("INIT_KEY", "uchebalab_init_2024"):
        return {"statusCode": 403, "headers": cors, "body": json.dumps({"error": "Forbidden"})}

    conn = get_db()
    created = []

    try:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM channels")
            count = cur.fetchone()[0]
            if count == 0:
                channels = [
                    ("объявления", "Важные объявления"),
                    ("материалы", "Учебные материалы и файлы"),
                    ("задания", "Задания и дедлайны"),
                    ("вопросы", "Вопросы и ответы"),
                    ("общий", "Общий чат"),
                ]
                for name, desc in channels:
                    cur.execute(
                        "INSERT INTO channels (name, description) VALUES (%s, %s)",
                        (name, desc)
                    )
                created.append("channels")

            cur.execute("SELECT COUNT(*) FROM users WHERE role = 'admin'")
            admin_count = cur.fetchone()[0]
            if admin_count == 0:
                pw_hash = hash_password("admin123")
                cur.execute(
                    "INSERT INTO users (email, username, password_hash, role) VALUES (%s, %s, %s, %s)",
                    ("admin@uchebalab.ru", "Администратор", pw_hash, "admin")
                )
                created.append("admin_user")

        conn.commit()
        return {
            "statusCode": 200,
            "headers": cors,
            "body": json.dumps({"ok": True, "created": created})
        }
    finally:
        conn.close()
