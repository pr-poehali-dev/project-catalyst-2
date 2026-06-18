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
    """Аутентификация + профиль. ?action=register|login|me|logout|profile_get|profile_update|change_password|admin_change_password|admin_list"""
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

    token = (event.get("headers", {}).get("X-Authorization", "")
             or params.get("token", ""))
    ip = (event.get("requestContext") or {}).get("identity", {}).get("sourceIp", "")
    conn = get_db()

    try:
        # ── AUTH ──────────────────────────────────────────────────────
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

        # ── ПРОФИЛЬ ───────────────────────────────────────────────────
        if action == "profile_get":
            user = get_user_by_session(conn, token)
            if not user:
                return {"statusCode": 401, "headers": cors, "body": json.dumps({"error": "Не авторизован"})}
            target_id = params.get("user_id", str(user["id"]))
            if target_id != str(user["id"]) and user["role"] != "admin":
                return {"statusCode": 403, "headers": cors, "body": json.dumps({"error": "Нет прав"})}
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT u.id, u.email, u.username, u.role, u.full_name, u.birth_date,
                           u.phone, u.bio, u.created_at, u.updated_at,
                           c.name, c.year
                    FROM users u
                    LEFT JOIN enrollments e ON e.user_id = u.id
                    LEFT JOIN courses c ON c.id = e.course_id
                    WHERE u.id = %s
                """, (int(target_id),))
                row = cur.fetchone()
            if not row:
                return {"statusCode": 404, "headers": cors, "body": json.dumps({"error": "Не найден"})}
            profile = {
                "id": row[0], "email": row[1], "username": row[2], "role": row[3],
                "full_name": row[4] or "", "birth_date": row[5].isoformat() if row[5] else "",
                "phone": row[6] or "", "bio": row[7] or "",
                "created_at": row[8].isoformat() if row[8] else "",
                "updated_at": row[9].isoformat() if row[9] else "",
                "course_name": row[10] or "", "course_year": row[11],
            }
            return {"statusCode": 200, "headers": cors, "body": json.dumps({"profile": profile})}

        if action == "profile_update":
            user = get_user_by_session(conn, token)
            if not user:
                return {"statusCode": 401, "headers": cors, "body": json.dumps({"error": "Не авторизован"})}
            target_id = int(body.get("user_id", user["id"]))
            if target_id != user["id"] and user["role"] != "admin":
                return {"statusCode": 403, "headers": cors, "body": json.dumps({"error": "Нет прав"})}
            full_name = body.get("full_name", "").strip() or None
            birth_date = body.get("birth_date") or None
            phone = body.get("phone", "").strip() or None
            bio = body.get("bio", "").strip() or None
            username = body.get("username", "").strip()
            with conn.cursor() as cur:
                if username:
                    cur.execute("""
                        UPDATE users SET full_name=%s, birth_date=%s, phone=%s, bio=%s,
                        username=%s, updated_at=NOW() WHERE id=%s
                    """, (full_name, birth_date, phone, bio, username, target_id))
                else:
                    cur.execute("""
                        UPDATE users SET full_name=%s, birth_date=%s, phone=%s, bio=%s,
                        updated_at=NOW() WHERE id=%s
                    """, (full_name, birth_date, phone, bio, target_id))
            conn.commit()
            log_action(conn, user["id"], "profile_update", f"target={target_id}", ip)
            return {"statusCode": 200, "headers": cors, "body": json.dumps({"ok": True})}

        if action == "change_password":
            user = get_user_by_session(conn, token)
            if not user:
                return {"statusCode": 401, "headers": cors, "body": json.dumps({"error": "Не авторизован"})}
            old_pw = body.get("old_password", "")
            new_pw = body.get("new_password", "")
            if len(new_pw) < 6:
                return {"statusCode": 400, "headers": cors, "body": json.dumps({"error": "Пароль минимум 6 символов"})}
            with conn.cursor() as cur:
                cur.execute("SELECT id FROM users WHERE id=%s AND password_hash=%s",
                            (user["id"], hash_password(old_pw)))
                if not cur.fetchone():
                    return {"statusCode": 400, "headers": cors, "body": json.dumps({"error": "Неверный текущий пароль"})}
                cur.execute("UPDATE users SET password_hash=%s, updated_at=NOW() WHERE id=%s",
                            (hash_password(new_pw), user["id"]))
            conn.commit()
            log_action(conn, user["id"], "change_password", "self", ip)
            return {"statusCode": 200, "headers": cors, "body": json.dumps({"ok": True})}

        if action == "admin_change_password":
            user = get_user_by_session(conn, token)
            if not user or user["role"] != "admin":
                return {"statusCode": 403, "headers": cors, "body": json.dumps({"error": "Нет прав"})}
            target_id = int(body.get("user_id"))
            new_pw = body.get("new_password", "")
            if len(new_pw) < 6:
                return {"statusCode": 400, "headers": cors, "body": json.dumps({"error": "Пароль минимум 6 символов"})}
            with conn.cursor() as cur:
                cur.execute("UPDATE users SET password_hash=%s, updated_at=NOW() WHERE id=%s",
                            (hash_password(new_pw), target_id))
            conn.commit()
            log_action(conn, user["id"], "admin_change_password", f"target={target_id}", ip)
            return {"statusCode": 200, "headers": cors, "body": json.dumps({"ok": True})}

        if action == "admin_list":
            user = get_user_by_session(conn, token)
            if not user or user["role"] != "admin":
                return {"statusCode": 403, "headers": cors, "body": json.dumps({"error": "Нет прав"})}
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT u.id, u.email, u.username, u.role, u.full_name, u.birth_date,
                           u.phone, u.created_at, c.name, c.year
                    FROM users u
                    LEFT JOIN enrollments e ON e.user_id = u.id
                    LEFT JOIN courses c ON c.id = e.course_id
                    ORDER BY u.created_at DESC
                """)
                rows = cur.fetchall()
            users = [{
                "id": r[0], "email": r[1], "username": r[2], "role": r[3],
                "full_name": r[4] or "", "birth_date": r[5].isoformat() if r[5] else "",
                "phone": r[6] or "", "created_at": r[7].isoformat() if r[7] else "",
                "course_name": r[8] or "", "course_year": r[9],
            } for r in rows]
            return {"statusCode": 200, "headers": cors, "body": json.dumps({"users": users})}

        return {"statusCode": 400, "headers": cors, "body": json.dumps({"error": "Unknown action"})}
    finally:
        conn.close()