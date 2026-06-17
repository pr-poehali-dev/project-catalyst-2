import json
import os
import psycopg2


def get_db():
    return psycopg2.connect(os.environ["DATABASE_URL"])


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
    """Администрирование. Роутинг через ?action=stats|users|set_role|create_channel"""
    cors = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Session-Id",
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

    session_id = event.get("headers", {}).get("X-Session-Id", "")
    conn = get_db()

    try:
        user = get_user_by_session(conn, session_id) if session_id else None
        if not user or user["role"] != "admin":
            return {"statusCode": 403, "headers": cors, "body": json.dumps({"error": "Доступ запрещён"})}

        # action=users
        if action == "users":
            with conn.cursor() as cur:
                cur.execute("SELECT id, email, username, role, created_at FROM users ORDER BY created_at DESC")
                rows = cur.fetchall()
            users = [
                {"id": r[0], "email": r[1], "username": r[2], "role": r[3], "created_at": r[4].isoformat()}
                for r in rows
            ]
            return {"statusCode": 200, "headers": cors, "body": json.dumps({"users": users})}

        # action=set_role
        if action == "set_role":
            user_id = body.get("user_id")
            new_role = body.get("role")
            if new_role not in ("student", "teacher", "admin"):
                return {"statusCode": 400, "headers": cors, "body": json.dumps({"error": "Недопустимая роль"})}
            with conn.cursor() as cur:
                cur.execute("UPDATE users SET role = %s WHERE id = %s", (new_role, user_id))
            conn.commit()
            return {"statusCode": 200, "headers": cors, "body": json.dumps({"ok": True})}

        # action=create_channel
        if action == "create_channel":
            name = body.get("name", "").strip()
            description = body.get("description", "").strip()
            if not name:
                return {"statusCode": 400, "headers": cors, "body": json.dumps({"error": "Укажите название канала"})}
            with conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO channels (name, description) VALUES (%s, %s) RETURNING id",
                    (name, description)
                )
                channel_id = cur.fetchone()[0]
            conn.commit()
            return {"statusCode": 200, "headers": cors, "body": json.dumps({"id": channel_id, "name": name})}

        # action=stats
        if action == "stats":
            with conn.cursor() as cur:
                cur.execute("SELECT COUNT(*) FROM users")
                total_users = cur.fetchone()[0]
                cur.execute("SELECT COUNT(*) FROM users WHERE role = 'student'")
                students = cur.fetchone()[0]
                cur.execute("SELECT COUNT(*) FROM users WHERE role = 'teacher'")
                teachers = cur.fetchone()[0]
                cur.execute("SELECT COUNT(*) FROM files")
                total_files = cur.fetchone()[0]
                cur.execute("SELECT COUNT(*) FROM messages")
                total_messages = cur.fetchone()[0]
            return {
                "statusCode": 200,
                "headers": cors,
                "body": json.dumps({
                    "stats": {
                        "total_users": total_users, "students": students, "teachers": teachers,
                        "total_files": total_files, "total_messages": total_messages,
                    }
                })
            }

        return {"statusCode": 400, "headers": cors, "body": json.dumps({"error": "Unknown action"})}

    finally:
        conn.close()
