import json
import os
import psycopg2


def get_db():
    return psycopg2.connect(os.environ["DATABASE_URL"])


def get_user_by_session(conn, token):
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


def push_notification(conn, user_id, notif_type, title, body_text=""):
    try:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO notifications (user_id, type, title, body) VALUES (%s,%s,%s,%s)",
                (user_id, notif_type, title, body_text)
            )
        conn.commit()
    except Exception:
        pass


def handler(event: dict, context) -> dict:
    """Чат и структура курсов. ?action=courses|subjects|subject_channels|messages|poll|send|members|react|notifications|mark_read"""
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
    conn = get_db()

    try:
        user = get_user_by_session(conn, token)

        # --- КУРСЫ (доступные пользователю) ---
        if action == "courses":
            with conn.cursor() as cur:
                if user and user["role"] in ("admin", "teacher"):
                    cur.execute("SELECT id, year, name, description FROM courses ORDER BY year")
                else:
                    # студент видит только свой курс
                    uid = user["id"] if user else 0
                    cur.execute("""
                        SELECT c.id, c.year, c.name, c.description
                        FROM courses c JOIN enrollments e ON e.course_id=c.id
                        WHERE e.user_id=%s ORDER BY c.year
                    """, (uid,))
                rows = cur.fetchall()
            courses = [{"id": r[0], "year": r[1], "name": r[2], "description": r[3]} for r in rows]
            return {"statusCode": 200, "headers": cors, "body": json.dumps({"courses": courses})}

        # --- ПРЕДМЕТЫ КУРСА ---
        if action == "subjects":
            cid = params.get("course_id")
            with conn.cursor() as cur:
                cur.execute("SELECT id, name, description FROM subjects WHERE course_id=%s ORDER BY id", (cid,))
                rows = cur.fetchall()
            subjects = [{"id": r[0], "name": r[1], "description": r[2]} for r in rows]
            return {"statusCode": 200, "headers": cors, "body": json.dumps({"subjects": subjects})}

        # --- ПОДКАНАЛЫ ПРЕДМЕТА ---
        if action == "subject_channels":
            sid = params.get("subject_id")
            with conn.cursor() as cur:
                cur.execute("SELECT id, name FROM subject_channels WHERE subject_id=%s ORDER BY id", (sid,))
                rows = cur.fetchall()
            channels = [{"id": r[0], "name": r[1]} for r in rows]
            return {"statusCode": 200, "headers": cors, "body": json.dumps({"channels": channels})}

        # --- УЧАСТНИКИ КУРСА/ПРЕДМЕТА ---
        if action == "members":
            cid = params.get("course_id")
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT u.id, u.username, u.role
                    FROM enrollments e JOIN users u ON u.id=e.user_id
                    WHERE e.course_id=%s ORDER BY u.role, u.username
                """, (cid,))
                rows = cur.fetchall()
                # добавим преподавателей (они видят все курсы)
                cur.execute("SELECT id, username, role FROM users WHERE role='teacher' ORDER BY username")
                teachers = cur.fetchall()
            seen = {r[0] for r in rows}
            members = [{"id": r[0], "username": r[1], "role": r[2]} for r in rows]
            for t in teachers:
                if t[0] not in seen:
                    members.append({"id": t[0], "username": t[1], "role": t[2]})
            return {"statusCode": 200, "headers": cors, "body": json.dumps({"members": members})}

        # --- СООБЩЕНИЯ (история) ---
        if action == "messages":
            sch_id = params.get("channel_id")
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT m.id, m.content, m.created_at, u.username, u.role, m.reactions
                    FROM messages m JOIN users u ON m.user_id=u.id
                    WHERE m.subject_channel_id=%s
                    ORDER BY m.created_at DESC LIMIT 50
                """, (sch_id,))
                rows = cur.fetchall()
            messages = [{"id": r[0], "content": r[1], "created_at": r[2].isoformat(),
                         "username": r[3], "role": r[4],
                         "reactions": json.loads(r[5]) if r[5] else {}} for r in reversed(rows)]
            return {"statusCode": 200, "headers": cors, "body": json.dumps({"messages": messages})}

        # --- POLLING новых сообщений ---
        if action == "poll":
            sch_id = params.get("channel_id")
            last_id = int(params.get("last_id", "0"))
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT m.id, m.content, m.created_at, u.username, u.role, m.reactions
                    FROM messages m JOIN users u ON m.user_id=u.id
                    WHERE m.subject_channel_id=%s AND m.id > %s
                    ORDER BY m.created_at ASC LIMIT 20
                """, (sch_id, last_id))
                rows = cur.fetchall()
            messages = [{"id": r[0], "content": r[1], "created_at": r[2].isoformat(),
                         "username": r[3], "role": r[4],
                         "reactions": json.loads(r[5]) if r[5] else {}} for r in rows]
            return {"statusCode": 200, "headers": cors, "body": json.dumps({"messages": messages})}

        # --- ОТПРАВИТЬ СООБЩЕНИЕ ---
        if action == "send":
            if not user:
                return {"statusCode": 401, "headers": cors, "body": json.dumps({"error": "Не авторизован"})}
            sch_id = body.get("channel_id")
            content = body.get("content", "").strip()
            if not sch_id or not content:
                return {"statusCode": 400, "headers": cors, "body": json.dumps({"error": "Заполните поля"})}
            if len(content) > 2000:
                return {"statusCode": 400, "headers": cors, "body": json.dumps({"error": "Слишком длинное"})}
            with conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO messages (subject_channel_id, user_id, content) VALUES (%s,%s,%s) RETURNING id, created_at",
                    (sch_id, user["id"], content)
                )
                row = cur.fetchone()
            conn.commit()
            msg = {"id": row[0], "content": content, "created_at": row[1].isoformat(),
                   "username": user["username"], "role": user["role"], "reactions": {}}

            # уведомления участникам курса
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT sc.subject_id FROM subject_channels sc WHERE sc.id=%s
                """, (sch_id,))
                r = cur.fetchone()
            if r:
                subject_id = r[0]
                with conn.cursor() as cur:
                    cur.execute("""
                        SELECT e.user_id FROM subjects s
                        JOIN enrollments e ON e.course_id=s.course_id
                        WHERE s.id=%s AND e.user_id != %s
                    """, (subject_id, user["id"]))
                    recipients = [x[0] for x in cur.fetchall()]
                for rid in recipients[:20]:
                    push_notification(conn, rid, "message",
                                      f"Новое сообщение от {user['username']}",
                                      content[:80])

            return {"statusCode": 200, "headers": cors, "body": json.dumps({"message": msg})}

        # --- РЕАКЦИЯ ЭМОДЗИ ---
        if action == "react":
            if not user:
                return {"statusCode": 401, "headers": cors, "body": json.dumps({"error": "Не авторизован"})}
            msg_id = body.get("message_id")
            emoji = body.get("emoji", "")[:4]
            with conn.cursor() as cur:
                cur.execute("SELECT reactions FROM messages WHERE id=%s", (msg_id,))
                row = cur.fetchone()
            if not row:
                return {"statusCode": 404, "headers": cors, "body": json.dumps({"error": "Сообщение не найдено"})}
            reactions = json.loads(row[0]) if row[0] else {}
            if emoji not in reactions:
                reactions[emoji] = []
            uid_str = str(user["id"])
            if uid_str in reactions[emoji]:
                reactions[emoji].remove(uid_str)
            else:
                reactions[emoji].append(uid_str)
            if not reactions[emoji]:
                del reactions[emoji]
            with conn.cursor() as cur:
                cur.execute("UPDATE messages SET reactions=%s WHERE id=%s", (json.dumps(reactions), msg_id))
            conn.commit()
            return {"statusCode": 200, "headers": cors, "body": json.dumps({"reactions": reactions})}

        # --- УВЕДОМЛЕНИЯ ПОЛЬЗОВАТЕЛЯ ---
        if action == "notifications":
            if not user:
                return {"statusCode": 401, "headers": cors, "body": json.dumps({"error": "Не авторизован"})}
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT id, type, title, body, is_read, created_at
                    FROM notifications WHERE user_id=%s
                    ORDER BY created_at DESC LIMIT 30
                """, (user["id"],))
                rows = cur.fetchall()
            notifs = [{"id": r[0], "type": r[1], "title": r[2], "body": r[3],
                       "is_read": r[4], "created_at": r[5].isoformat()} for r in rows]
            return {"statusCode": 200, "headers": cors, "body": json.dumps({"notifications": notifs})}

        # --- ОТМЕТИТЬ КАК ПРОЧИТАННОЕ ---
        if action == "mark_read":
            if not user:
                return {"statusCode": 401, "headers": cors, "body": json.dumps({"error": "Не авторизован"})}
            nid = body.get("notification_id")
            with conn.cursor() as cur:
                if nid:
                    cur.execute("UPDATE notifications SET is_read=TRUE WHERE id=%s AND user_id=%s", (nid, user["id"]))
                else:
                    cur.execute("UPDATE notifications SET is_read=TRUE WHERE user_id=%s", (user["id"],))
            conn.commit()
            return {"statusCode": 200, "headers": cors, "body": json.dumps({"ok": True})}

        return {"statusCode": 400, "headers": cors, "body": json.dumps({"error": "Unknown action"})}
    finally:
        conn.close()