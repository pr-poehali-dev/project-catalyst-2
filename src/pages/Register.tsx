import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";

interface Props {
  onGoLogin: () => void;
}

export default function Register({ onGoLogin }: Props) {
  const { register } = useAuth();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("student");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await register(email, username, password, role);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка регистрации");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#36393f] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-[#2f3136] rounded-lg p-8 shadow-xl">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-[#5865f2] rounded-full flex items-center justify-center mx-auto mb-4">
              <Icon name="GraduationCap" size={32} className="text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white">УчебаЛаб</h1>
            <p className="text-[#b9bbbe] text-sm mt-1">Создайте аккаунт</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-[#b9bbbe] text-xs font-semibold uppercase tracking-wide block mb-2">
                Имя
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-[#40444b] text-white placeholder-[#72767d] rounded px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#5865f2] border border-transparent"
                placeholder="Иван Иванов"
                required
              />
            </div>
            <div>
              <label className="text-[#b9bbbe] text-xs font-semibold uppercase tracking-wide block mb-2">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-[#40444b] text-white placeholder-[#72767d] rounded px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#5865f2] border border-transparent"
                placeholder="your@email.com"
                required
              />
            </div>
            <div>
              <label className="text-[#b9bbbe] text-xs font-semibold uppercase tracking-wide block mb-2">
                Пароль
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[#40444b] text-white placeholder-[#72767d] rounded px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#5865f2] border border-transparent"
                placeholder="Минимум 6 символов"
                required
                minLength={6}
              />
            </div>
            <div>
              <label className="text-[#b9bbbe] text-xs font-semibold uppercase tracking-wide block mb-2">
                Роль
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: "student", label: "Студент", icon: "BookOpen" },
                  { value: "teacher", label: "Преподаватель", icon: "GraduationCap" },
                ].map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setRole(r.value)}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded text-sm font-medium transition-colors ${
                      role === r.value
                        ? "bg-[#5865f2] text-white"
                        : "bg-[#40444b] text-[#b9bbbe] hover:bg-[#4f545c]"
                    }`}
                  >
                    <Icon name={r.icon} size={16} />
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <div className="bg-[#ed4245]/20 border border-[#ed4245]/40 text-[#ed4245] text-sm rounded px-3 py-2">
                {error}
              </div>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-[#5865f2] hover:bg-[#4752c4] text-white font-medium py-2.5 rounded"
            >
              {loading ? "Создание..." : "Создать аккаунт"}
            </Button>
          </form>

          <p className="text-center text-[#b9bbbe] text-sm mt-6">
            Уже есть аккаунт?{" "}
            <button onClick={onGoLogin} className="text-[#5865f2] hover:underline font-medium">
              Войти
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
