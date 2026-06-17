import func2url from "../../backend/func2url.json";

const URLS = {
  auth: func2url.auth,
  chat: func2url.chat,
  files: func2url.files,
  admin: func2url.admin,
};

function getSession(): string {
  return localStorage.getItem("session_id") || "";
}

function headers(extra: Record<string, string> = {}): Record<string, string> {
  return { "Content-Type": "application/json", "X-Session-Id": getSession(), ...extra };
}

async function req(url: string, options: RequestInit = {}) {
  const res = await fetch(url, options);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Ошибка сервера");
  return data;
}

// AUTH — роутинг через ?action=
export const authApi = {
  register: (email: string, username: string, password: string, role: string) =>
    req(`${URLS.auth}?action=register`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ email, username, password, role }),
    }),

  login: (email: string, password: string) =>
    req(`${URLS.auth}?action=login`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ email, password }),
    }),

  me: () =>
    req(`${URLS.auth}?action=me`, { headers: headers() }),

  logout: () =>
    req(`${URLS.auth}?action=logout`, { method: "POST", headers: headers() }),
};

// CHAT — роутинг через ?action=
export const chatApi = {
  getChannels: () =>
    req(`${URLS.chat}?action=channels`, { headers: headers() }),

  getMessages: (channel_id: number) =>
    req(`${URLS.chat}?action=messages&channel_id=${channel_id}`, { headers: headers() }),

  pollMessages: (channel_id: number, last_id: number) =>
    req(`${URLS.chat}?action=poll&channel_id=${channel_id}&last_id=${last_id}`, { headers: headers() }),

  sendMessage: (channel_id: number, content: string) =>
    req(`${URLS.chat}?action=send`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ channel_id, content }),
    }),
};

// FILES — роутинг через ?action=
export const filesApi = {
  getFiles: (channel_id?: number) => {
    const url = channel_id
      ? `${URLS.files}?action=list&channel_id=${channel_id}`
      : `${URLS.files}?action=list`;
    return req(url, { headers: headers() });
  },

  upload: (file: File, channel_id?: number) =>
    new Promise<unknown>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64 = (reader.result as string).split(",")[1];
          const data = await req(`${URLS.files}?action=upload`, {
            method: "POST",
            headers: headers(),
            body: JSON.stringify({
              file: base64,
              name: file.name,
              mime_type: file.type || "application/octet-stream",
              channel_id: channel_id || null,
            }),
          });
          resolve(data);
        } catch (e) {
          reject(e);
        }
      };
      reader.onerror = () => reject(new Error("Ошибка чтения файла"));
      reader.readAsDataURL(file);
    }),
};

// ADMIN — роутинг через ?action=
export const adminApi = {
  getUsers: () =>
    req(`${URLS.admin}?action=users`, { headers: headers() }),

  setRole: (user_id: number, role: string) =>
    req(`${URLS.admin}?action=set_role`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ user_id, role }),
    }),

  createChannel: (name: string, description: string) =>
    req(`${URLS.admin}?action=create_channel`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ name, description }),
    }),

  getStats: () =>
    req(`${URLS.admin}?action=stats`, { headers: headers() }),
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
