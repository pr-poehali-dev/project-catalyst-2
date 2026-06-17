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
    """Чат: каналы и сообщения. Роутинг через ?action=channels|messages|send"""
    cors = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Session-Id",
    }

    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": cors, "body": ""}

    method = event.get("httpMethod", "GET")
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

        # action=channels
        if action == "channels":
            with conn.cursor() as cur:
                cur.execute("SELECT id, name, description FROM channels ORDER BY id")
                rows = cur.fetchall()
            channels = [{"id": r[0], "name": r[1], "description": r[2]} for r in rows]
            return {"statusCode": 200, "headers": cors, "body": json.dumps({"channels": channels})}

        # action=messages&channel_id=X
        if action == "messages":
            channel_id = params.get("channel_id")
            if not channel_id:
                return {"statusCode": 400, "headers": cors, "body": json.dumps({"error": "channel_id required"})}
            with conn.cursor() as cur:
                cur.execute(
                    """SELECT m.id, m.content, m.created_at, u.username, u.role
                       FROM messages m JOIN users u ON m.user_id = u.id
                       WHERE m.channel_id = %s
                       ORDER BY m.created_at DESC LIMIT 50""",
                    (channel_id,)
                )
                rows = cur.fetchall()
            messages = [
                {"id": r[0], "content": r[1], "created_at": r[2].isoformat(), "username": r[3], "role": r[4]}
                for r in reversed(rows)
            ]
            return {"statusCode": 200, "headers": cors, "body": json.dumps({"messages": messages})}

        # action=poll&channel_id=X&last_id=Y  — для long-polling новых сообщений
        if action == "poll":
            channel_id = params.get("channel_id")
            last_id = params.get("last_id", "0")
            if not channel_id:
                return {"statusCode": 400, "headers": cors, "body": json.dumps({"error": "channel_id required"})}
            with conn.cursor() as cur:
                cur.execute(
                    """SELECT m.id, m.content, m.created_at, u.username, u.role
                       FROM messages m JOIN users u ON m.user_id = u.id
                       WHERE m.channel_id = %s AND m.id > %s
                       ORDER BY m.created_at ASC LIMIT 20""",
                    (channel_id, int(last_id))
                )
                rows = cur.fetchall()
            messages = [
                {"id": r[0], "content": r[1], "created_at": r[2].isoformat(), "username": r[3], "role": r[4]}
                for r in rows
            ]
            return {"statusCode": 200, "headers": cors, "body": json.dumps({"messages": messages})}

        # action=send
        if action == "send":
            if not user:
                return {"statusCode": 401, "headers": cors, "body": json.dumps({"error": "Не авторизован"})}
            channel_id = body.get("channel_id")
            content = body.get("content", "").strip()
            if not channel_id or not content:
                return {"statusCode": 400, "headers": cors, "body": json.dumps({"error": "Заполните все поля"})}
            if len(content) > 2000:
                return {"statusCode": 400, "headers": cors, "body": json.dumps({"error": "Сообщение слишком длинное"})}
            with conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO messages (channel_id, user_id, content) VALUES (%s, %s, %s) RETURNING id, created_at",
                    (channel_id, user["id"], content)
                )
                row = cur.fetchone()
            conn.commit()
            return {
                "statusCode": 200,
                "headers": cors,
                "body": json.dumps({
                    "message": {
                        "id": row[0], "content": content,
                        "created_at": row[1].isoformat(),
                        "username": user["username"], "role": user["role"]
                    }
                })
            }

        return {"statusCode": 400, "headers": cors, "body": json.dumps({"error": "Unknown action"})}

    finally:
        conn.close()
