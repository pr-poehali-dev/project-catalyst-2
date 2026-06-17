import json
import os
import hashlib
import secrets
import psycopg2
from datetime import datetime, timedelta


def get_db():
    return psycopg2.connect(os.environ["DATABASE_URL"])


def hash_password(password: str) -> str:
    salt = os.environ.get("SECRET_KEY", "uchebalab_salt_2024")
    return hashlib.sha256((password + salt).encode()).hexdigest()


def create_session(conn, user_id: int) -> str:
    token = secrets.token_hex(32)
    expires_at = datetime.now() + timedelta(days=30)
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO sessions (id, user_id, expires_at) VALUES (%s, %s, %s)",
            (token, user_id, expires_at)
        )
    conn.commit()
    return token


def get_user_by_session(conn, token: str):
    if not token:
        return None
    with conn.cursor() as cur:
        cur.execute(
            """SELECT u.id, u.email, u.username, u.role
               FROM sessions s JOIN users u ON s.user_id = u.id
               WHERE s.id = %s AND s.expires_at > NOW()""",
            (token,)
        )
        row = cur.fetchone()
    if not row:
        return None
    return {"id": row[0], "email": row[1], "username": row[2], "role": row[3]}


def log_action(conn, user_id, action, details="", ip=""):
    try:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO audit_logs (user_id, action, details, ip) VALUES (%s, %s, %s, %s)",
                (user_id, action, details, ip)
            )
        conn.commit()
    except Exception:
        pass


def handler(event: dict, context) -> dict:
    """Аутентификация. ?action=register|login|me|logout"""
    cors = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
    }
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": cors, "body": ""}

    params = event.get("queryStringParameters") or {}
    action = params.get("action", "")
    body = {}
    if event.get("body"):
        try:
            body = json.loads(event["body"])
        except Exception:
            pass

    token = event.get("headers", {}).get("X-Authorization", "")
    ip = (event.get("requestContext") or {}).get("identity", {}).get("sourceIp", "")
    conn = get_db()

    try:
        if action == "register":
            email = body.get("email", "").strip().lower()
            username = body.get("username", "").strip()
            password = body.get("password", "")
            role = body.get("role", "student")
            if role not in ("student", "teacher"):
                role = "student"
            if not email or not username or not password:
                return {"statusCode": 400, "headers": cors, "body": json.dumps({"error": "Заполните все поля"})}
            if len(password) < 6:
                return {"statusCode": 400, "headers": cors, "body": json.dumps({"error": "Пароль минимум 6 символов"})}
            pw_hash = hash_password(password)
            try:
                with conn.cursor() as cur:
                    cur.execute(
                        "INSERT INTO users (email, username, password_hash, role) VALUES (%s, %s, %s, %s) RETURNING id",
                        (email, username, pw_hash, role)
                    )
                    user_id = cur.fetchone()[0]
                conn.commit()
            except psycopg2.errors.UniqueViolation:
                conn.rollback()
                return {"statusCode": 409, "headers": cors, "body": json.dumps({"error": "Email уже занят"})}
            log_action(conn, user_id, "register", f"role={role}", ip)
            sid = create_session(conn, user_id)
            return {"statusCode": 200, "headers": cors, "body": json.dumps({
                "token": sid,
                "user": {"id": user_id, "email": email, "username": username, "role": role, "course_id": None}
            })}

        if action == "login":
            email = body.get("email", "").strip().lower()
            password = body.get("password", "")
            pw_hash = hash_password(password)
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT id, email, username, role FROM users WHERE email = %s AND password_hash = %s",
                    (email, pw_hash)
                )
                row = cur.fetchone()
            if not row:
                return {"statusCode": 401, "headers": cors, "body": json.dumps({"error": "Неверный email или пароль"})}
            user = {"id": row[0], "email": row[1], "username": row[2], "role": row[3]}
            log_action(conn, user["id"], "login", "", ip)
            # курс студента
            course_id = None
            with conn.cursor() as cur:
                cur.execute("SELECT course_id FROM enrollments WHERE user_id = %s LIMIT 1", (user["id"],))
                r = cur.fetchone()
                if r:
                    course_id = r[0]
            user["course_id"] = course_id
            sid = create_session(conn, user["id"])
            return {"statusCode": 200, "headers": cors, "body": json.dumps({"token": sid, "user": user})}

        if action == "me":
            user = get_user_by_session(conn, token)
            if not user:
                return {"statusCode": 401, "headers": cors, "body": json.dumps({"error": "Не авторизован"})}
            course_id = None
            with conn.cursor() as cur:
                cur.execute("SELECT course_id FROM enrollments WHERE user_id = %s LIMIT 1", (user["id"],))
                r = cur.fetchone()
                if r:
                    course_id = r[0]
            user["course_id"] = course_id
            return {"statusCode": 200, "headers": cors, "body": json.dumps({"user": user})}

        if action == "logout":
            if token:
                with conn.cursor() as cur:
                    cur.execute("UPDATE sessions SET expires_at = NOW() WHERE id = %s", (token,))
                conn.commit()
            return {"statusCode": 200, "headers": cors, "body": json.dumps({"ok": True})}

        return {"statusCode": 400, "headers": cors, "body": json.dumps({"error": "Unknown action"})}
    finally:
        conn.close()