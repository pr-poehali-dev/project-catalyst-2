import json
import os
import psycopg2
import boto3


def get_db():
    return psycopg2.connect(os.environ["DATABASE_URL"])


def get_s3():
    return boto3.client(
        "s3",
        endpoint_url="https://bucket.poehali.dev",
        aws_access_key_id=os.environ["AWS_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["AWS_SECRET_ACCESS_KEY"],
    )


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


def log_action(conn, user_id, action, details=""):
    try:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO audit_logs (user_id, action, details) VALUES (%s, %s, %s)",
                (user_id, action, details)
            )
        conn.commit()
    except Exception:
        pass


def push_notification(conn, user_id, notif_type, title, body=""):
    try:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO notifications (user_id, type, title, body) VALUES (%s, %s, %s, %s)",
                (user_id, notif_type, title, body)
            )
        conn.commit()
    except Exception:
        pass


def handler(event: dict, context) -> dict:
    """Админ-панель: stats|users|set_role|enroll|courses|subjects|course_members|logs|delete_file|all_files|notifications|mark_read"""
    cors = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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

    token = event.get("headers", {}).get("X-Session-Id", "")
    conn = get_db()

    try:
        user = get_user_by_session(conn, token)
        if not user or user["role"] != "admin":
            return {"statusCode": 403, "headers": cors, "body": json.dumps({"error": "Доступ запрещён"})}

        if action == "stats":
            with conn.cursor() as cur:
                cur.execute("SELECT COUNT(*) FROM users")
                total_users = cur.fetchone()[0]
                cur.execute("SELECT COUNT(*) FROM users WHERE role='student'")
                students = cur.fetchone()[0]
                cur.execute("SELECT COUNT(*) FROM users WHERE role='teacher'")
                teachers = cur.fetchone()[0]
                cur.execute("SELECT COUNT(*) FROM files WHERE s3_key != ''")
                total_files = cur.fetchone()[0]
                cur.execute("SELECT COUNT(*) FROM messages")
                total_messages = cur.fetchone()[0]
                cur.execute("SELECT COUNT(*) FROM enrollments")
                total_enrollments = cur.fetchone()[0]
            return {"statusCode": 200, "headers": cors, "body": json.dumps({"stats": {
                "total_users": total_users, "students": students, "teachers": teachers,
                "total_files": total_files, "total_messages": total_messages,
                "total_enrollments": total_enrollments
            }})}

        if action == "users":
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT u.id, u.email, u.username, u.role, u.created_at,
                           e.course_id, c.name
                    FROM users u
                    LEFT JOIN enrollments e ON e.user_id = u.id
                    LEFT JOIN courses c ON c.id = e.course_id
                    ORDER BY u.created_at DESC
                """)
                rows = cur.fetchall()
            users = [{"id": r[0], "email": r[1], "username": r[2], "role": r[3],
                      "created_at": r[4].isoformat(), "course_id": r[5], "course_name": r[6]}
                     for r in rows]
            return {"statusCode": 200, "headers": cors, "body": json.dumps({"users": users})}

        if action == "set_role":
            uid = body.get("user_id")
            new_role = body.get("role")
            if new_role not in ("student", "teacher", "admin"):
                return {"statusCode": 400, "headers": cors, "body": json.dumps({"error": "Недопустимая роль"})}
            with conn.cursor() as cur:
                cur.execute("UPDATE users SET role=%s WHERE id=%s", (new_role, uid))
            conn.commit()
            log_action(conn, user["id"], "set_role", f"user={uid} role={new_role}")
            return {"statusCode": 200, "headers": cors, "body": json.dumps({"ok": True})}

        if action == "enroll":
            uid = body.get("user_id")
            cid = body.get("course_id")
            with conn.cursor() as cur:
                cur.execute("SELECT id FROM enrollments WHERE user_id=%s", (uid,))
                exists = cur.fetchone()
                if exists:
                    cur.execute("UPDATE enrollments SET course_id=%s WHERE user_id=%s", (cid, uid))
                else:
                    cur.execute("INSERT INTO enrollments (user_id, course_id) VALUES (%s,%s)", (uid, cid))
            conn.commit()
            log_action(conn, user["id"], "enroll", f"user={uid} course={cid}")
            # уведомление студенту
            with conn.cursor() as cur:
                cur.execute("SELECT name FROM courses WHERE id=%s", (cid,))
                r = cur.fetchone()
            cname = r[0] if r else f"Курс {cid}"
            push_notification(conn, uid, "enroll", f"Вы зачислены на {cname}", "Администратор добавил вас на курс")
            return {"statusCode": 200, "headers": cors, "body": json.dumps({"ok": True})}

        if action == "courses":
            with conn.cursor() as cur:
                cur.execute("SELECT id, year, name, description FROM courses ORDER BY year")
                rows = cur.fetchall()
            courses = [{"id": r[0], "year": r[1], "name": r[2], "description": r[3]} for r in rows]
            return {"statusCode": 200, "headers": cors, "body": json.dumps({"courses": courses})}

        if action == "subjects":
            cid = params.get("course_id")
            with conn.cursor() as cur:
                if cid:
                    cur.execute("SELECT id, name, description, course_id FROM subjects WHERE course_id=%s ORDER BY id", (cid,))
                else:
                    cur.execute("SELECT id, name, description, course_id FROM subjects ORDER BY course_id, id")
                rows = cur.fetchall()
            subjects = [{"id": r[0], "name": r[1], "description": r[2], "course_id": r[3]} for r in rows]
            return {"statusCode": 200, "headers": cors, "body": json.dumps({"subjects": subjects})}

        if action == "course_members":
            cid = params.get("course_id")
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT u.id, u.username, u.email, u.role
                    FROM enrollments e JOIN users u ON u.id=e.user_id
                    WHERE e.course_id=%s ORDER BY u.username
                """, (cid,))
                rows = cur.fetchall()
            members = [{"id": r[0], "username": r[1], "email": r[2], "role": r[3]} for r in rows]
            return {"statusCode": 200, "headers": cors, "body": json.dumps({"members": members})}

        if action == "logs":
            limit = int(params.get("limit", "100"))
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT l.id, l.action, l.details, l.ip, l.created_at, u.username
                    FROM audit_logs l
                    LEFT JOIN users u ON u.id=l.user_id
                    ORDER BY l.created_at DESC LIMIT %s
                """, (limit,))
                rows = cur.fetchall()
            logs = [{"id": r[0], "action": r[1], "details": r[2], "ip": r[3],
                     "created_at": r[4].isoformat(), "username": r[5]} for r in rows]
            return {"statusCode": 200, "headers": cors, "body": json.dumps({"logs": logs})}

        if action == "delete_file":
            fid = body.get("file_id")
            with conn.cursor() as cur:
                cur.execute("SELECT s3_key, original_name FROM files WHERE id=%s", (fid,))
                row = cur.fetchone()
            if not row:
                return {"statusCode": 404, "headers": cors, "body": json.dumps({"error": "Файл не найден"})}
            s3_key, fname = row
            try:
                s3 = get_s3()
                s3.delete_object(Bucket="files", Key=s3_key)
            except Exception:
                pass
            with conn.cursor() as cur:
                cur.execute("UPDATE files SET s3_key='' WHERE id=%s", (fid,))
            conn.commit()
            log_action(conn, user["id"], "delete_file", f"id={fid} name={fname}")
            return {"statusCode": 200, "headers": cors, "body": json.dumps({"ok": True})}

        if action == "all_files":
            search = params.get("search", "")
            date_from = params.get("date_from", "")
            with conn.cursor() as cur:
                if search:
                    cur.execute("""
                        SELECT f.id, f.original_name, f.size, f.mime_type, f.created_at, u.username, f.s3_key
                        FROM files f JOIN users u ON u.id=f.uploaded_by
                        WHERE f.original_name ILIKE %s AND f.s3_key != ''
                        ORDER BY f.created_at DESC LIMIT 100
                    """, (f"%{search}%",))
                elif date_from:
                    cur.execute("""
                        SELECT f.id, f.original_name, f.size, f.mime_type, f.created_at, u.username, f.s3_key
                        FROM files f JOIN users u ON u.id=f.uploaded_by
                        WHERE f.created_at::date >= %s AND f.s3_key != ''
                        ORDER BY f.created_at DESC LIMIT 100
                    """, (date_from,))
                else:
                    cur.execute("""
                        SELECT f.id, f.original_name, f.size, f.mime_type, f.created_at, u.username, f.s3_key
                        FROM files f JOIN users u ON u.id=f.uploaded_by
                        WHERE f.s3_key != ''
                        ORDER BY f.created_at DESC LIMIT 100
                    """)
                rows = cur.fetchall()
            access_key = os.environ["AWS_ACCESS_KEY_ID"]
            files = [{"id": r[0], "name": r[1], "size": r[2], "mime_type": r[3],
                      "created_at": r[4].isoformat(), "uploaded_by": r[5],
                      "url": f"https://cdn.poehali.dev/projects/{access_key}/bucket/{r[6]}"}
                     for r in rows]
            return {"statusCode": 200, "headers": cors, "body": json.dumps({"files": files})}

        if action == "notifications":
            uid = params.get("user_id", str(user["id"]))
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT id, type, title, body, is_read, created_at
                    FROM notifications WHERE user_id=%s
                    ORDER BY created_at DESC LIMIT 30
                """, (uid,))
                rows = cur.fetchall()
            notifs = [{"id": r[0], "type": r[1], "title": r[2], "body": r[3],
                       "is_read": r[4], "created_at": r[5].isoformat()} for r in rows]
            return {"statusCode": 200, "headers": cors, "body": json.dumps({"notifications": notifs})}

        if action == "mark_read":
            nid = body.get("notification_id")
            with conn.cursor() as cur:
                cur.execute("UPDATE notifications SET is_read=TRUE WHERE id=%s AND user_id=%s", (nid, user["id"]))
            conn.commit()
            return {"statusCode": 200, "headers": cors, "body": json.dumps({"ok": True})}

        return {"statusCode": 400, "headers": cors, "body": json.dumps({"error": "Unknown action"})}
    finally:
        conn.close()
