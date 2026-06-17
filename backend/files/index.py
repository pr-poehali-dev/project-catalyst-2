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
    """Файлы: список и загрузка. Роутинг через ?action=list|upload"""
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

    session_id = event.get("headers", {}).get("X-Session-Id", "")
    conn = get_db()

    try:
        user = get_user_by_session(conn, session_id) if session_id else None

        # action=list&channel_id=X
        if action == "list":
            channel_id = params.get("channel_id")
            with conn.cursor() as cur:
                if channel_id:
                    cur.execute(
                        """SELECT f.id, f.original_name, f.size, f.mime_type, f.s3_key, f.created_at, u.username
                           FROM files f JOIN users u ON f.uploaded_by = u.id
                           WHERE f.channel_id = %s ORDER BY f.created_at DESC""",
                        (channel_id,)
                    )
                else:
                    cur.execute(
                        """SELECT f.id, f.original_name, f.size, f.mime_type, f.s3_key, f.created_at, u.username
                           FROM files f JOIN users u ON f.uploaded_by = u.id
                           ORDER BY f.created_at DESC LIMIT 50"""
                    )
                rows = cur.fetchall()

            access_key = os.environ["AWS_ACCESS_KEY_ID"]
            files = [
                {
                    "id": r[0], "name": r[1], "size": r[2], "mime_type": r[3],
                    "url": f"https://cdn.poehali.dev/projects/{access_key}/bucket/{r[4]}",
                    "created_at": r[5].isoformat(), "uploaded_by": r[6],
                }
                for r in rows
            ]
            return {"statusCode": 200, "headers": cors, "body": json.dumps({"files": files})}

        # action=upload
        if action == "upload":
            if not user:
                return {"statusCode": 401, "headers": cors, "body": json.dumps({"error": "Не авторизован"})}

            file_data = body.get("file")
            file_name = body.get("name", "file")
            channel_id = body.get("channel_id")
            mime_type = body.get("mime_type", "application/octet-stream")

            if not file_data:
                return {"statusCode": 400, "headers": cors, "body": json.dumps({"error": "Файл не передан"})}

            file_bytes = base64.b64decode(file_data)
            file_size = len(file_bytes)

            if file_size > 50 * 1024 * 1024:
                return {"statusCode": 400, "headers": cors, "body": json.dumps({"error": "Файл слишком большой (макс 50МБ)"})}

            ext = file_name.rsplit(".", 1)[-1] if "." in file_name else "bin"
            s3_key = f"lms/files/{uuid.uuid4()}.{ext}"

            s3 = get_s3()
            s3.put_object(Bucket="files", Key=s3_key, Body=file_bytes, ContentType=mime_type)

            with conn.cursor() as cur:
                cur.execute(
                    """INSERT INTO files (name, original_name, s3_key, size, mime_type, channel_id, uploaded_by)
                       VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id, created_at""",
                    (file_name, file_name, s3_key, file_size, mime_type, channel_id, user["id"])
                )
                row = cur.fetchone()
            conn.commit()

            access_key = os.environ["AWS_ACCESS_KEY_ID"]
            return {
                "statusCode": 200,
                "headers": cors,
                "body": json.dumps({
                    "file": {
                        "id": row[0], "name": file_name, "size": file_size, "mime_type": mime_type,
                        "url": f"https://cdn.poehali.dev/projects/{access_key}/bucket/{s3_key}",
                        "created_at": row[1].isoformat(), "uploaded_by": user["username"],
                    }
                })
            }

        return {"statusCode": 400, "headers": cors, "body": json.dumps({"error": "Unknown action"})}

    finally:
        conn.close()
