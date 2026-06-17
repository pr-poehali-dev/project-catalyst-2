import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";

interface Props {
  onGoRegister: () => void;
}

export default function Login({ onGoRegister }: Props) {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка входа");
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
            <p className="text-[#b9bbbe] text-sm mt-1">Войдите в свой аккаунт</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
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
                placeholder="••••••••"
                required
              />
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
              {loading ? "Вход..." : "Войти"}
            </Button>
          </form>

          <p className="text-center text-[#b9bbbe] text-sm mt-6">
            Нет аккаунта?{" "}
            <button onClick={onGoRegister} className="text-[#5865f2] hover:underline font-medium">
              Зарегистрироваться
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
