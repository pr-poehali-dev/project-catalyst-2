import func2url from "../../backend/func2url.json";

const URLS = {
  auth: func2url.auth,
  chat: func2url.chat,
  files: func2url.files,
  admin: func2url.admin,
};

function getToken(): string {
  return localStorage.getItem("session_id") || "";
}

// GET: только Authorization (не вызывает preflight)
// POST: добавляем Content-Type
function hGet(): Record<string, string> {
  return { "Authorization": getToken() };
}
function hPost(): Record<string, string> {
  return { "Authorization": getToken(), "Content-Type": "application/json" };
}

async function req(url: string, options: RequestInit = {}) {
  const res = await fetch(url, options);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Ошибка сервера");
  return data;
}

export const authApi = {
  register: (email: string, username: string, password: string, role: string) =>
    req(`${URLS.auth}?action=register`, { method: "POST", headers: hPost(), body: JSON.stringify({ email, username, password, role }) }),
  login: (email: string, password: string) =>
    req(`${URLS.auth}?action=login`, { method: "POST", headers: hPost(), body: JSON.stringify({ email, password }) }),
  me: () => req(`${URLS.auth}?action=me`, { headers: hGet() }),
  logout: () => req(`${URLS.auth}?action=logout`, { method: "POST", headers: hPost() }),
};

export const chatApi = {
  getCourses: () => req(`${URLS.chat}?action=courses`, { headers: hGet() }),
  getSubjects: (course_id: number) => req(`${URLS.chat}?action=subjects&course_id=${course_id}`, { headers: hGet() }),
  getSubjectChannels: (subject_id: number) => req(`${URLS.chat}?action=subject_channels&subject_id=${subject_id}`, { headers: hGet() }),
  getMembers: (course_id: number) => req(`${URLS.chat}?action=members&course_id=${course_id}`, { headers: hGet() }),
  getMessages: (channel_id: number) => req(`${URLS.chat}?action=messages&channel_id=${channel_id}`, { headers: hGet() }),
  pollMessages: (channel_id: number, last_id: number) =>
    req(`${URLS.chat}?action=poll&channel_id=${channel_id}&last_id=${last_id}`, { headers: hGet() }),
  sendMessage: (channel_id: number, content: string) =>
    req(`${URLS.chat}?action=send`, { method: "POST", headers: hPost(), body: JSON.stringify({ channel_id, content }) }),
  react: (message_id: number, emoji: string) =>
    req(`${URLS.chat}?action=react`, { method: "POST", headers: hPost(), body: JSON.stringify({ message_id, emoji }) }),
  getNotifications: () => req(`${URLS.chat}?action=notifications`, { headers: hGet() }),
  markRead: (notification_id?: number) =>
    req(`${URLS.chat}?action=mark_read`, { method: "POST", headers: hPost(), body: JSON.stringify({ notification_id }) }),
};

export const filesApi = {
  getFiles: (channel_id?: number, search?: string, date_from?: string) => {
    const p = new URLSearchParams({ action: "list" });
    if (channel_id) p.set("channel_id", String(channel_id));
    if (search) p.set("search", search);
    if (date_from) p.set("date_from", date_from);
    return req(`${URLS.files}?${p}`, { headers: hGet() });
  },
  upload: (file: File, channel_id?: number) =>
    new Promise<unknown>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64 = (reader.result as string).split(",")[1];
          resolve(await req(`${URLS.files}?action=upload`, {
            method: "POST", headers: hPost(),
            body: JSON.stringify({ file: base64, name: file.name, mime_type: file.type || "application/octet-stream", channel_id: channel_id || null }),
          }));
        } catch (e) { reject(e); }
      };
      reader.onerror = () => reject(new Error("Ошибка чтения файла"));
      reader.readAsDataURL(file);
    }),
  deleteFile: (file_id: number) =>
    req(`${URLS.files}?action=delete`, { method: "POST", headers: hPost(), body: JSON.stringify({ file_id }) }),
};

export const adminApi = {
  getStats: () => req(`${URLS.admin}?action=stats`, { headers: hGet() }),
  getUsers: () => req(`${URLS.admin}?action=users`, { headers: hGet() }),
  setRole: (user_id: number, role: string) =>
    req(`${URLS.admin}?action=set_role`, { method: "POST", headers: hPost(), body: JSON.stringify({ user_id, role }) }),
  enroll: (user_id: number, course_id: number) =>
    req(`${URLS.admin}?action=enroll`, { method: "POST", headers: hPost(), body: JSON.stringify({ user_id, course_id }) }),
  getCourses: () => req(`${URLS.admin}?action=courses`, { headers: hGet() }),
  getCourseMembers: (course_id: number) =>
    req(`${URLS.admin}?action=course_members&course_id=${course_id}`, { headers: hGet() }),
  getLogs: (limit = 100) => req(`${URLS.admin}?action=logs&limit=${limit}`, { headers: hGet() }),
  deleteFile: (file_id: number) =>
    req(`${URLS.admin}?action=delete_file`, { method: "POST", headers: hPost(), body: JSON.stringify({ file_id }) }),
  getAllFiles: (search?: string, date_from?: string) => {
    const p = new URLSearchParams({ action: "all_files" });
    if (search) p.set("search", search);
    if (date_from) p.set("date_from", date_from);
    return req(`${URLS.admin}?${p}`, { headers: hGet() });
  },
};

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function formatDateOnly(iso: string): string {
  return new Date(iso).toLocaleDateString("ru-RU");
}
