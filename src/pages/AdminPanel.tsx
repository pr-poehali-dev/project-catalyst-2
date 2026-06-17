import { useState, useEffect } from "react";
import { adminApi, formatDate } from "@/lib/api";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";

interface User { id: number; email: string; username: string; role: string; created_at: string }
interface Stats { total_users: number; students: number; teachers: number; total_files: number; total_messages: number }

interface Props {
  onBack: () => void;
}

export default function AdminPanel({ onBack }: Props) {
  const [users, setUsers] = useState<User[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [tab, setTab] = useState<"stats" | "users" | "channels">("stats");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newChannel, setNewChannel] = useState({ name: "", description: "" });
  const [channelMsg, setChannelMsg] = useState("");
  const [updatingRole, setUpdatingRole] = useState<number | null>(null);

  useEffect(() => {
    Promise.all([adminApi.getStats(), adminApi.getUsers()])
      .then(([statsData, usersData]) => {
        setStats(statsData.stats);
        setUsers(usersData.users);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const changeRole = async (userId: number, role: string) => {
    setUpdatingRole(userId);
    try {
      await adminApi.setRole(userId, role);
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, role } : u));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setUpdatingRole(null);
    }
  };

  const createChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await adminApi.createChannel(newChannel.name, newChannel.description);
      setChannelMsg("Канал создан!");
      setNewChannel({ name: "", description: "" });
    } catch (e) {
      setChannelMsg(e instanceof Error ? e.message : "Ошибка");
    }
  };

  const roleLabel: Record<string, string> = { admin: "Администратор", teacher: "Преподаватель", student: "Студент" };
  const roleColor: Record<string, string> = { admin: "text-[#ed4245]", teacher: "text-[#3ba55c]", student: "text-[#b9bbbe]" };

  return (
    <div className="min-h-screen bg-[#36393f] text-white flex flex-col">
      {/* Шапка */}
      <nav className="bg-[#2f3136] border-b border-[#202225] px-4 py-3 flex items-center gap-3">
        <Button onClick={onBack} variant="ghost" size="sm" className="text-[#b9bbbe] hover:text-white hover:bg-[#40444b] p-2">
          <Icon name="ArrowLeft" size={16} />
        </Button>
        <div className="w-8 h-8 bg-[#ed4245] rounded-full flex items-center justify-center">
          <Icon name="Settings" size={16} className="text-white" />
        </div>
        <div>
          <div className="text-white font-bold text-sm">Панель администратора</div>
          <div className="text-[#b9bbbe] text-xs">УчебаЛаб</div>
        </div>
      </nav>

      <div className="flex flex-1 overflow-hidden">
        {/* Боковое меню */}
        <div className="w-48 bg-[#2f3136] flex flex-col p-2 flex-shrink-0">
          {[
            { key: "stats", label: "Статистика", icon: "BarChart2" },
            { key: "users", label: "Пользователи", icon: "Users" },
            { key: "channels", label: "Каналы", icon: "Hash" },
          ].map((item) => (
            <button
              key={item.key}
              onClick={() => setTab(item.key as typeof tab)}
              className={`flex items-center gap-2 px-3 py-2 rounded text-sm mb-0.5 transition-colors text-left ${
                tab === item.key ? "bg-[#393c43] text-white" : "text-[#8e9297] hover:text-[#dcddde] hover:bg-[#393c43]"
              }`}
            >
              <Icon name={item.icon} size={16} />
              {item.label}
            </button>
          ))}
        </div>

        {/* Контент */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading && <div className="text-[#b9bbbe] text-sm">Загрузка...</div>}
          {error && <div className="text-[#ed4245] text-sm">{error}</div>}

          {/* Статистика */}
          {tab === "stats" && stats && (
            <div>
              <h2 className="text-xl font-bold text-white mb-6">Статистика платформы</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {[
                  { label: "Всего пользователей", value: stats.total_users, icon: "Users", color: "bg-[#5865f2]" },
                  { label: "Студентов", value: stats.students, icon: "BookOpen", color: "bg-[#3ba55c]" },
                  { label: "Преподавателей", value: stats.teachers, icon: "GraduationCap", color: "bg-[#faa61a]" },
                  { label: "Файлов загружено", value: stats.total_files, icon: "FileText", color: "bg-[#eb459e]" },
                  { label: "Сообщений", value: stats.total_messages, icon: "MessageSquare", color: "bg-[#57f287]" },
                ].map((s) => (
                  <div key={s.label} className="bg-[#2f3136] border border-[#202225] rounded-lg p-4">
                    <div className={`w-10 h-10 ${s.color} rounded-lg flex items-center justify-center mb-3`}>
                      <Icon name={s.icon} size={20} className="text-white" />
                    </div>
                    <div className="text-2xl font-bold text-white mb-1">{s.value}</div>
                    <div className="text-[#b9bbbe] text-xs">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Пользователи */}
          {tab === "users" && (
            <div>
              <h2 className="text-xl font-bold text-white mb-6">Пользователи ({users.length})</h2>
              <div className="space-y-2">
                {users.map((u) => (
                  <div key={u.id} className="bg-[#2f3136] border border-[#202225] rounded-lg p-3 flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0 ${
                      u.role === "admin" ? "bg-[#ed4245]" : u.role === "teacher" ? "bg-[#3ba55c]" : "bg-[#5865f2]"
                    }`}>
                      {u.username[0]?.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-white text-sm font-medium">{u.username}</div>
                      <div className="text-[#b9bbbe] text-xs">{u.email} · {formatDate(u.created_at)}</div>
                    </div>
                    <div className={`text-xs font-semibold mr-2 ${roleColor[u.role]}`}>{roleLabel[u.role]}</div>
                    <select
                      value={u.role}
                      disabled={updatingRole === u.id}
                      onChange={(e) => changeRole(u.id, e.target.value)}
                      className="bg-[#40444b] text-[#dcddde] text-xs rounded px-2 py-1 outline-none focus:ring-1 focus:ring-[#5865f2] cursor-pointer"
                    >
                      <option value="student">Студент</option>
                      <option value="teacher">Преподаватель</option>
                      <option value="admin">Администратор</option>
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Каналы */}
          {tab === "channels" && (
            <div>
              <h2 className="text-xl font-bold text-white mb-6">Создать канал</h2>
              <form onSubmit={createChannel} className="bg-[#2f3136] border border-[#202225] rounded-lg p-5 max-w-md space-y-4">
                <div>
                  <label className="text-[#b9bbbe] text-xs font-semibold uppercase tracking-wide block mb-2">Название</label>
                  <input
                    value={newChannel.name}
                    onChange={(e) => setNewChannel((p) => ({ ...p, name: e.target.value }))}
                    className="w-full bg-[#40444b] text-white placeholder-[#72767d] rounded px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#5865f2]"
                    placeholder="например: физика"
                    required
                  />
                </div>
                <div>
                  <label className="text-[#b9bbbe] text-xs font-semibold uppercase tracking-wide block mb-2">Описание</label>
                  <input
                    value={newChannel.description}
                    onChange={(e) => setNewChannel((p) => ({ ...p, description: e.target.value }))}
                    className="w-full bg-[#40444b] text-white placeholder-[#72767d] rounded px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#5865f2]"
                    placeholder="Что обсуждается в этом канале?"
                  />
                </div>
                {channelMsg && (
                  <div className={`text-sm ${channelMsg.includes("!") ? "text-[#3ba55c]" : "text-[#ed4245]"}`}>{channelMsg}</div>
                )}
                <Button type="submit" className="bg-[#5865f2] hover:bg-[#4752c4] text-white w-full">
                  <Icon name="Plus" size={16} className="mr-2" />
                  Создать канал
                </Button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
