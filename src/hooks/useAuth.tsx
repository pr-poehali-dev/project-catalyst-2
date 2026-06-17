import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { authApi } from "@/lib/api";

interface User {
  id: number;
  email: string;
  username: string;
  role: "student" | "teacher" | "admin";
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, username: string, password: string, role: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const sessionId = localStorage.getItem("session_id");
    if (!sessionId) { setLoading(false); return; }
    authApi.me()
      .then((data) => setUser(data.user))
      .catch(() => localStorage.removeItem("session_id"))
      .finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    const data = await authApi.login(email, password);
    localStorage.setItem("session_id", data.session_id);
    setUser(data.user);
  };

  const register = async (email: string, username: string, password: string, role: string) => {
    const data = await authApi.register(email, username, password, role);
    localStorage.setItem("session_id", data.session_id);
    setUser(data.user);
  };

  const logout = async () => {
    await authApi.logout();
    localStorage.removeItem("session_id");
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
