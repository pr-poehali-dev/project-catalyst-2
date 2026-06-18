import { useState, useEffect } from "react";
import { adminApi, profileApi, formatDate, formatFileSize } from "@/lib/api";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";

interface User { id: number; email: string; username: string; role: string; created_at: string; course_id: number | null; course_name: string | null }
interface Course { id: number; year: number; name: string }
interface Member { id: number; username: string; email: string; role: string }
interface LogEntry { id: number; action: string; details: string; ip: string; created_at: string; username: string }
interface FileItem { id: number; name: string; size: number; mime_type: string; url: string; created_at: string; uploaded_by: string }
interface Stats { total_users: number; students: number; teachers: number; total_files: number; total_messages: number; total_enrollments: number }
interface AccountUser { id: number; email: string; username: string; role: string; full_name: string; birth_date: string; phone: string; created_at: string; course_name: string; course_year: number | null }

const ACTION_ICONS: Record<string, string> = { login: "LogIn", register: "UserPlus", enroll: "UserCheck", set_role: "Shield", delete_file: "Trash2", change_password: "Key", admin_change_password: "ShieldAlert", profile_update: "Edit3", delete_message: "Trash2" };

export default function AdminPanel({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<"stats" | "users" | "courses" | "accounts" | "files" | "logs">("stats");
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [fileSearch, setFileSearch] = useState("");
  const [fileDate, setFileDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [updatingUser, setUpdatingUser] = useState<number | null>(null);

  // Аккаунты
  const [accounts, setAccounts] = useState<AccountUser[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<AccountUser | null>(null);
  const [newPw, setNewPw] = useState("");
  const [pwMsg, setPwMsg] = useState("");

  useEffect(() => {
    adminApi.getStats().then(d => setStats(d.stats));
    adminApi.getUsers().then(d => setUsers(d.users));
    adminApi.getCourses().then(d => setCourses(d.courses));
  }, []);

  useEffect(() => {
    if (tab === "logs") {
      setLoading(true);
      adminApi.getLogs(200).then(d => setLogs(d.logs)).finally(() => setLoading(false));
    }
    if (tab === "files") loadFiles();
    if (tab === "accounts") {
      setLoading(true);
      profileApi.adminList().then(d => setAccounts(d.users)).finally(() => setLoading(false));
    }
  }, [tab]);

  useEffect(() => {
    if (selectedCourse) adminApi.getCourseMembers(selectedCourse.id).then(d => setMembers(d.members));
  }, [selectedCourse]);

  const loadFiles = () => {
    setLoading(true);
    adminApi.getAllFiles(fileSearch || undefined, fileDate || undefined)
      .then(d => setFiles(d.files)).finally(() => setLoading(false));
  };

  useEffect(() => { if (tab === "files") loadFiles(); }, [fileSearch, fileDate]);

  const handleSetRole = async (userId: number, role: string) => {
    setUpdatingUser(userId);
    try {
      await adminApi.setRole(userId, role);
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role } : u));
    } finally { setUpdatingUser(null); }
  };

  const handleEnroll = async (userId: number, courseId: number) => {
    setUpdatingUser(userId);
    try {
      await adminApi.enroll(userId, courseId);
      const cname = courses.find(c => c.id === courseId)?.name || null;
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, course_id: courseId, course_name: cname } : u));
    } finally { setUpdatingUser(null); }
  };

  const handleDeleteFile = async (fid: number) => {
    if (!confirm("Удалить файл без возможности восстановления?")) return;
    await adminApi.deleteFile(fid);
    setFiles(prev => prev.filter(f => f.id !== fid));
  };

  const roleLabel = (r: string) => r === "admin" ? "Администратор" : r === "teacher" ? "Преподаватель" : "Студент";
  const roleColor = (r: string) => r === "admin" ? "text-[#ed4245]" : r === "teacher" ? "text-[#3ba55c]" : "text-[#b9bbbe]";
  const avatarBg = (r: string) => r === "admin" ? "bg-[#ed4245]" : r === "teacher" ? "bg-[#3ba55c]" : "bg-[#5865f2]";

  const handleAdminChangePw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAccount) return;
    if (newPw.length < 6) { setPwMsg("Минимум 6 символов"); return; }
    try {
      await profileApi.adminChangePassword(selectedAccount.id, newPw);
      setPwMsg("Пароль изменён!");
      setNewPw("");
    } catch (err) {
      setPwMsg(err instanceof Error ? err.message : "Ошибка");
    }
  };

  const ROLE_LABEL: Record<string, string> = { admin: "Администратор", teacher: "Преподаватель", student: "Студент" };
  const AVATAR_BG: Record<string, string> = { admin: "bg-[#ed4245]", teacher: "bg-[#3ba55c]", student: "bg-[#5865f2]" };

  const TABS = [
    { key: "stats", label: "Статистика", icon: "BarChart2" },
    { key: "users", label: "Пользователи", icon: "Users" },
    { key: "courses", label: "Курсы", icon: "GraduationCap" },
    { key: "accounts", label: "Аккаунты", icon: "UserCog" },
    { key: "files", label: "Файлы", icon: "FolderOpen" },
    { key: "logs", label: "Логи", icon: "Activity" },
  ];

  return (
    <div className="min-h-screen bg-[#36393f] text-white flex flex-col">
      {/* Шапка */}
      <nav className="bg-[#2f3136] border-b border-[#202225] px-4 py-3 flex items-center gap-3 flex-shrink-0">
        <Button onClick={onBack} variant="ghost" size="sm" className="text-[#b9bbbe] hover:text-white hover:bg-[#40444b] p-1.5">
          <Icon name="ArrowLeft" size={16} />
        </Button>
        <div className="w-8 h-8 bg-[#ed4245] rounded-full flex items-center justify-center">
          <Icon name="Shield" size={16} className="text-white" />
        </div>
        <div>
          <div className="text-white font-bold text-sm">Панель администратора</div>
          <div className="text-[#b9bbbe] text-xs">УчебаЛаб</div>
        </div>
      </nav>

      <div className="flex flex-1 overflow-hidden">
        {/* Боковое меню */}
        <div className="w-48 bg-[#2f3136] flex flex-col p-2 flex-shrink-0 border-r border-[#202225]">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key as typeof tab)}
              className={`flex items-center gap-2 px-3 py-2 rounded text-sm mb-0.5 text-left transition-colors ${tab === t.key ? "bg-[#393c43] text-white" : "text-[#8e9297] hover:text-[#dcddde] hover:bg-[#34373c]"}`}>
              <Icon name={t.icon} size={15} />
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {/* СТАТИСТИКА */}
          {tab === "stats" && stats && (
            <div>
              <h2 className="text-xl font-bold mb-5">Статистика платформы</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {[
                  { label: "Пользователей", value: stats.total_users, icon: "Users", color: "bg-[#5865f2]" },
                  { label: "Студентов", value: stats.students, icon: "BookOpen", color: "bg-[#3ba55c]" },
                  { label: "Преподавателей", value: stats.teachers, icon: "GraduationCap", color: "bg-[#faa61a]" },
                  { label: "Файлов", value: stats.total_files, icon: "File", color: "bg-[#eb459e]" },
                  { label: "Сообщений", value: stats.total_messages, icon: "MessageSquare", color: "bg-[#57f287]" },
                  { label: "Зачислений", value: stats.total_enrollments, icon: "UserCheck", color: "bg-[#fee75c]" },
                ].map(s => (
                  <div key={s.label} className="bg-[#2f3136] border border-[#202225] rounded-lg p-4">
                    <div className={`w-10 h-10 ${s.color} rounded-lg flex items-center justify-center mb-3`}>
                      <Icon name={s.icon} size={20} className="text-white" />
                    </div>
                    <div className="text-2xl font-bold mb-0.5">{s.value}</div>
                    <div className="text-[#b9bbbe] text-xs">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ПОЛЬЗОВАТЕЛИ */}
          {tab === "users" && (
            <div>
              <h2 className="text-xl font-bold mb-5">Пользователи ({users.length})</h2>
              <div className="space-y-2">
                {users.map(u => (
                  <div key={u.id} className="bg-[#2f3136] border border-[#202225] rounded-lg p-3">
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0 ${avatarBg(u.role)}`}>
                        {u.username[0]?.toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-white text-sm font-medium">{u.username}</div>
                        <div className="text-[#b9bbbe] text-xs">{u.email} · {formatDate(u.created_at)}</div>
                      </div>
                      <span className={`text-xs font-semibold ${roleColor(u.role)}`}>{roleLabel(u.role)}</span>

                      {/* Роль */}
                      <select value={u.role} disabled={updatingUser === u.id}
                        onChange={e => handleSetRole(u.id, e.target.value)}
                        className="bg-[#40444b] text-[#dcddde] text-xs rounded px-2 py-1 outline-none focus:ring-1 focus:ring-[#5865f2] cursor-pointer">
                        <option value="student">Студент</option>
                        <option value="teacher">Преподаватель</option>
                        <option value="admin">Администратор</option>
                      </select>

                      {/* Курс (только для студентов) */}
                      {u.role === "student" && (
                        <select value={u.course_id || ""} disabled={updatingUser === u.id}
                          onChange={e => e.target.value && handleEnroll(u.id, Number(e.target.value))}
                          className="bg-[#40444b] text-[#dcddde] text-xs rounded px-2 py-1 outline-none focus:ring-1 focus:ring-[#5865f2] cursor-pointer">
                          <option value="">Не зачислен</option>
                          {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* КУРСЫ */}
          {tab === "courses" && (
            <div>
              <h2 className="text-xl font-bold mb-5">Курсы и участники</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                {courses.map(c => (
                  <button key={c.id} onClick={() => setSelectedCourse(selectedCourse?.id === c.id ? null : c)}
                    className={`p-4 rounded-lg border text-left transition-colors ${selectedCourse?.id === c.id ? "bg-[#5865f2]/20 border-[#5865f2]" : "bg-[#2f3136] border-[#202225] hover:border-[#5865f2]/50"}`}>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-[#5865f2] rounded-full flex items-center justify-center text-white font-bold text-lg">{c.year}</div>
                      <div>
                        <div className="text-white font-semibold">{c.name}</div>
                        <div className="text-[#b9bbbe] text-xs">{c.year} год обучения</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              {selectedCourse && (
                <div className="bg-[#2f3136] border border-[#202225] rounded-lg p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-white font-semibold">{selectedCourse.name} — участники ({members.length})</h3>
                  </div>
                  {members.length === 0
                    ? <p className="text-[#72767d] text-sm">Нет зачисленных студентов</p>
                    : <div className="space-y-2">
                      {members.map(m => (
                        <div key={m.id} className="flex items-center gap-3 p-2 rounded hover:bg-[#36393f] transition-colors">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold ${avatarBg(m.role)}`}>
                            {m.username[0]?.toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-white text-sm">{m.username}</div>
                            <div className="text-[#b9bbbe] text-xs">{m.email}</div>
                          </div>
                          <span className={`text-xs ${roleColor(m.role)}`}>{roleLabel(m.role)}</span>
                        </div>
                      ))}
                    </div>
                  }
                </div>
              )}
            </div>
          )}

          {/* АККАУНТЫ */}
          {tab === "accounts" && (
            <div className="flex gap-4 h-full" style={{ minHeight: 500 }}>
              {/* Список аккаунтов */}
              <div className="w-64 flex-shrink-0">
                <h2 className="text-xl font-bold mb-4">Аккаунты ({accounts.length})</h2>
                {loading && <div className="text-[#b9bbbe] text-sm">Загрузка...</div>}
                <div className="space-y-1.5">
                  {accounts.map(a => (
                    <button key={a.id} onClick={() => { setSelectedAccount(a); setNewPw(""); setPwMsg(""); }}
                      className={`w-full flex items-center gap-2.5 p-2.5 rounded-lg text-left transition-colors border ${selectedAccount?.id === a.id ? "bg-[#5865f2]/20 border-[#5865f2]" : "bg-[#2f3136] border-[#202225] hover:border-[#5865f2]/40"}`}>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0 ${AVATAR_BG[a.role]}`}>
                        {(a.full_name || a.username)[0]?.toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-white text-sm font-medium truncate">{a.full_name || a.username}</div>
                        <div className="text-[#b9bbbe] text-xs truncate">{ROLE_LABEL[a.role]}{a.course_name ? ` · ${a.course_name}` : ""}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Карточка выбранного аккаунта */}
              {selectedAccount ? (
                <div className="flex-1 bg-[#2f3136] border border-[#202225] rounded-lg overflow-hidden self-start">
                  <div className="h-20 bg-gradient-to-r from-[#5865f2] to-[#7c3aed]" />
                  <div className="px-5 pb-5">
                    <div className="flex items-end gap-3 -mt-7 mb-4">
                      <div className={`w-14 h-14 rounded-full border-4 border-[#2f3136] flex items-center justify-center text-white text-xl font-bold flex-shrink-0 ${AVATAR_BG[selectedAccount.role]}`}>
                        {(selectedAccount.full_name || selectedAccount.username)[0]?.toUpperCase()}
                      </div>
                      <div className="pb-1">
                        <div className="text-white font-bold">{selectedAccount.full_name || selectedAccount.username}</div>
                        <div className="text-[#b9bbbe] text-xs">{selectedAccount.email}</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 mb-4 text-sm">
                      {[
                        { icon: "Shield", label: "Роль", value: ROLE_LABEL[selectedAccount.role] },
                        { icon: "GraduationCap", label: "Курс", value: selectedAccount.course_name || "—" },
                        { icon: "Calendar", label: "Дата рождения", value: selectedAccount.birth_date ? new Date(selectedAccount.birth_date).toLocaleDateString("ru-RU") : "—" },
                        { icon: "Phone", label: "Телефон", value: selectedAccount.phone || "—" },
                        { icon: "Clock", label: "Зарегистрирован", value: formatDate(selectedAccount.created_at) },
                      ].map(item => (
                        <div key={item.label} className="bg-[#36393f] rounded p-2.5">
                          <div className="flex items-center gap-1.5 text-[#8e9297] text-xs mb-0.5">
                            <Icon name={item.icon} size={11} />
                            {item.label}
                          </div>
                          <div className="text-white text-sm">{item.value}</div>
                        </div>
                      ))}
                    </div>

                    {/* Смена пароля */}
                    <div className="border-t border-[#40444b] pt-4">
                      <h4 className="text-white text-sm font-semibold mb-3 flex items-center gap-2">
                        <Icon name="Key" size={14} className="text-[#ed4245]" />
                        Сменить пароль
                      </h4>
                      <form onSubmit={handleAdminChangePw} className="flex gap-2">
                        <input type="password" value={newPw} onChange={e => { setNewPw(e.target.value); setPwMsg(""); }}
                          placeholder="Новый пароль (мин. 6 символов)"
                          className="flex-1 bg-[#40444b] text-white placeholder-[#72767d] rounded px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[#5865f2]"
                          minLength={6} required />
                        <Button type="submit" className="bg-[#ed4245] hover:bg-[#c03537] text-white text-sm px-4">
                          Задать
                        </Button>
                      </form>
                      {pwMsg && (
                        <div className={`text-xs mt-2 ${pwMsg.includes("!") ? "text-[#3ba55c]" : "text-[#ed4245]"}`}>{pwMsg}</div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center text-[#72767d] text-sm">
                  <div className="text-center">
                    <Icon name="UserCog" size={40} className="mx-auto mb-2 opacity-20" />
                    <p>Выберите аккаунт слева</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ФАЙЛЫ */}
          {tab === "files" && (
            <div>
              <h2 className="text-xl font-bold mb-4">Все файлы</h2>
              <div className="flex gap-2 mb-4 flex-wrap">
                <div className="flex-1 min-w-48 relative">
                  <Icon name="Search" size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#72767d]" />
                  <input value={fileSearch} onChange={e => setFileSearch(e.target.value)}
                    placeholder="Поиск по названию..."
                    className="w-full bg-[#40444b] text-white placeholder-[#72767d] rounded px-8 py-2 text-sm outline-none focus:ring-1 focus:ring-[#5865f2]" />
                </div>
                <input type="date" value={fileDate} onChange={e => setFileDate(e.target.value)}
                  className="bg-[#40444b] text-white rounded px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[#5865f2]" />
                {(fileSearch || fileDate) && (
                  <button onClick={() => { setFileSearch(""); setFileDate(""); }} className="text-[#b9bbbe] hover:text-white px-2">✕</button>
                )}
              </div>

              {loading && <div className="text-[#b9bbbe] text-sm">Загрузка...</div>}
              {!loading && files.length === 0 && (
                <div className="text-center text-[#72767d] text-sm py-10">
                  <Icon name="FolderOpen" size={36} className="mx-auto mb-2 opacity-20" />
                  <p>{fileSearch || fileDate ? "Ничего не найдено" : "Файлов нет"}</p>
                </div>
              )}
              <div className="space-y-2">
                {files.map(f => (
                  <div key={f.id} className="bg-[#2f3136] border border-[#202225] rounded-lg p-3 flex items-center gap-3">
                    <div className="w-9 h-9 bg-[#5865f2]/20 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Icon name={f.mime_type?.includes("pdf") ? "FileText" : f.mime_type?.includes("image") ? "Image" : "File"}
                        size={18} className="text-[#5865f2]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-white text-sm font-medium truncate">{f.name}</div>
                      <div className="text-[#b9bbbe] text-xs">{formatFileSize(f.size)} · {f.uploaded_by} · {formatDate(f.created_at)}</div>
                    </div>
                    <a href={f.url} target="_blank" rel="noopener noreferrer"
                      className="w-7 h-7 flex items-center justify-center rounded hover:bg-[#40444b] text-[#b9bbbe] hover:text-white transition-colors">
                      <Icon name="Download" size={15} />
                    </a>
                    <button onClick={() => handleDeleteFile(f.id)}
                      className="w-7 h-7 flex items-center justify-center rounded hover:bg-[#ed4245]/20 text-[#b9bbbe] hover:text-[#ed4245] transition-colors">
                      <Icon name="Trash2" size={15} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ЛОГИ */}
          {tab === "logs" && (
            <div>
              <h2 className="text-xl font-bold mb-5">Журнал действий</h2>
              {loading && <div className="text-[#b9bbbe] text-sm">Загрузка...</div>}
              <div className="space-y-1.5">
                {logs.map(l => (
                  <div key={l.id} className="bg-[#2f3136] border border-[#202225] rounded-lg px-4 py-3 flex items-start gap-3">
                    <div className="w-7 h-7 bg-[#40444b] rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Icon name={ACTION_ICONS[l.action] || "Activity"} size={13} className="text-[#b9bbbe]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-white text-sm font-medium">{l.username || "Система"}</span>
                        <span className="text-[#5865f2] text-xs font-mono bg-[#5865f2]/10 px-1.5 py-0.5 rounded">{l.action}</span>
                        {l.details && <span className="text-[#b9bbbe] text-xs truncate max-w-xs">{l.details}</span>}
                      </div>
                      <div className="text-[#72767d] text-xs mt-0.5">
                        {formatDate(l.created_at)}{l.ip ? ` · ${l.ip}` : ""}
                      </div>
                    </div>
                  </div>
                ))}
                {!loading && logs.length === 0 && <div className="text-[#72767d] text-sm">Логов пока нет</div>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}