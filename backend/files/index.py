import json
import os
import base64
import uuid
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
    """Файлы: list|upload|delete|search"""
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

        # --- СПИСОК ФАЙЛОВ ---
        if action == "list":
            sch_id = params.get("channel_id")
            search = params.get("search", "")
            date_from = params.get("date_from", "")
            with conn.cursor() as cur:
                base_q = """
                    SELECT f.id, f.original_name, f.size, f.mime_type, f.s3_key, f.created_at, u.username
                    FROM files f JOIN users u ON u.id=f.uploaded_by
                    WHERE f.s3_key != ''
                """
                filters = []
                args = []
                if sch_id:
                    filters.append("f.subject_channel_id=%s")
                    args.append(sch_id)
                if search:
                    filters.append("f.original_name ILIKE %s")
                    args.append(f"%{search}%")
                if date_from:
                    filters.append("f.created_at::date >= %s")
                    args.append(date_from)
                if filters:
                    base_q += " AND " + " AND ".join(filters)
                base_q += " ORDER BY f.created_at DESC LIMIT 100"
                cur.execute(base_q, args)
                rows = cur.fetchall()
            access_key = os.environ["AWS_ACCESS_KEY_ID"]
            files = [{"id": r[0], "name": r[1], "size": r[2], "mime_type": r[3],
                      "url": f"https://cdn.poehali.dev/projects/{access_key}/bucket/{r[4]}",
                      "created_at": r[5].isoformat(), "uploaded_by": r[6]} for r in rows]
            return {"statusCode": 200, "headers": cors, "body": json.dumps({"files": files})}

        # --- ЗАГРУЗКА ---
        if action == "upload":
            if not user:
                return {"statusCode": 401, "headers": cors, "body": json.dumps({"error": "Не авторизован"})}
            file_data = body.get("file")
            file_name = body.get("name", "file")
            sch_id = body.get("channel_id")
            mime_type = body.get("mime_type", "application/octet-stream")
            if not file_data:
                return {"statusCode": 400, "headers": cors, "body": json.dumps({"error": "Файл не передан"})}
            file_bytes = base64.b64decode(file_data)
            if len(file_bytes) > 50 * 1024 * 1024:
                return {"statusCode": 400, "headers": cors, "body": json.dumps({"error": "Файл > 50МБ"})}
            ext = file_name.rsplit(".", 1)[-1] if "." in file_name else "bin"
            s3_key = f"lms/files/{uuid.uuid4()}.{ext}"
            s3 = get_s3()
            s3.put_object(Bucket="files", Key=s3_key, Body=file_bytes, ContentType=mime_type)
            with conn.cursor() as cur:
                cur.execute(
                    """INSERT INTO files (name, original_name, s3_key, size, mime_type, subject_channel_id, uploaded_by)
                       VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING id, created_at""",
                    (file_name, file_name, s3_key, len(file_bytes), mime_type, sch_id, user["id"])
                )
                row = cur.fetchone()
            conn.commit()
            access_key = os.environ["AWS_ACCESS_KEY_ID"]

            # уведомления участникам курса
            if sch_id:
                with conn.cursor() as cur:
                    cur.execute("SELECT subject_id FROM subject_channels WHERE id=%s", (sch_id,))
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
                        push_notification(conn, rid, "file",
                                          f"Новый файл от {user['username']}",
                                          file_name)

            file_obj = {"id": row[0], "name": file_name, "size": len(file_bytes),
                        "mime_type": mime_type,
                        "url": f"https://cdn.poehali.dev/projects/{access_key}/bucket/{s3_key}",
                        "created_at": row[1].isoformat(), "uploaded_by": user["username"]}
            return {"statusCode": 200, "headers": cors, "body": json.dumps({"file": file_obj})}

        # --- УДАЛЕНИЕ (преподаватель или владелец) ---
        if action == "delete":
            if not user:
                return {"statusCode": 401, "headers": cors, "body": json.dumps({"error": "Не авторизован"})}
            fid = body.get("file_id")
            with conn.cursor() as cur:
                cur.execute("SELECT s3_key, uploaded_by FROM files WHERE id=%s", (fid,))
                row = cur.fetchone()
            if not row:
                return {"statusCode": 404, "headers": cors, "body": json.dumps({"error": "Не найден"})}
            s3_key, owner_id = row
            if user["role"] not in ("admin", "teacher") and owner_id != user["id"]:
                return {"statusCode": 403, "headers": cors, "body": json.dumps({"error": "Нет прав"})}
            try:
                s3 = get_s3()
                s3.delete_object(Bucket="files", Key=s3_key)
            except Exception:
                pass
            with conn.cursor() as cur:
                cur.execute("UPDATE files SET s3_key='' WHERE id=%s", (fid,))
            conn.commit()
            return {"statusCode": 200, "headers": cors, "body": json.dumps({"ok": True})}

        return {"statusCode": 400, "headers": cors, "body": json.dumps({"error": "Unknown action"})}
    finally:
        conn.close()