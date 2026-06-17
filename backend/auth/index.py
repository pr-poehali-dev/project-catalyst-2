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
    session_id = secrets.token_hex(32)
    expires_at = datetime.now() + timedelta(days=30)
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO sessions (id, user_id, expires_at) VALUES (%s, %s, %s)",
            (session_id, user_id, expires_at)
        )
    conn.commit()
    return session_id


def get_user_by_session(conn, session_id: str):
    with conn.cursor() as cur:
        cur.execute(
            """SELECT u.id, u.email, u.username, u.role
               FROM sessions s JOIN users u ON s.user_id = u.id
               WHERE s.id = %s AND s.expires_at > NOW()""",
            (session_id,)
        )
        row = cur.fetchone()
    if not row:
        return None
    return {"id": row[0], "email": row[1], "username": row[2], "role": row[3]}


def handler(event: dict, context) -> dict:
    """Аутентификация: регистрация, вход, выход, получение профиля"""
    cors = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Session-Id",
    }

    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": cors, "body": ""}

    method = event.get("httpMethod", "GET")
    path = event.get("path", "/")
    body = {}
    if event.get("body"):
        try:
            body = json.loads(event["body"])
        except Exception:
            pass

    session_id = event.get("headers", {}).get("X-Session-Id", "")
    conn = get_db()

    try:
        # POST /register
        if method == "POST" and path.endswith("/register"):
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

            sid = create_session(conn, user_id)
            return {
                "statusCode": 200,
                "headers": cors,
                "body": json.dumps({
                    "session_id": sid,
                    "user": {"id": user_id, "email": email, "username": username, "role": role}
                })
            }

        # POST /login
        if method == "POST" and path.endswith("/login"):
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
            sid = create_session(conn, user["id"])
            return {
                "statusCode": 200,
                "headers": cors,
                "body": json.dumps({"session_id": sid, "user": user})
            }

        # GET /me
        if method == "GET" and path.endswith("/me"):
            if not session_id:
                return {"statusCode": 401, "headers": cors, "body": json.dumps({"error": "Не авторизован"})}
            user = get_user_by_session(conn, session_id)
            if not user:
                return {"statusCode": 401, "headers": cors, "body": json.dumps({"error": "Сессия истекла"})}
            return {"statusCode": 200, "headers": cors, "body": json.dumps({"user": user})}

        # POST /logout
        if method == "POST" and path.endswith("/logout"):
            if session_id:
                with conn.cursor() as cur:
                    cur.execute("UPDATE sessions SET expires_at = NOW() WHERE id = %s", (session_id,))
                conn.commit()
            return {"statusCode": 200, "headers": cors, "body": json.dumps({"ok": True})}

        return {"statusCode": 404, "headers": cors, "body": json.dumps({"error": "Not found"})}

    finally:
        conn.close()
