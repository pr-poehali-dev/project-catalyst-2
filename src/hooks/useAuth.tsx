import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { authApi } from "@/lib/api";

export interface User {
  id: number;
  email: string;
  username: string;
  role: "student" | "teacher" | "admin";
  course_id: number | null;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, username: string, password: string, role: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMe = async () => {
    const token = localStorage.getItem("session_id");
    if (!token) { setLoading(false); return; }
    try {
      const data = await authApi.me();
      setUser(data.user);
    } catch {
      localStorage.removeItem("session_id");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchMe(); }, []);

  const login = async (email: string, password: string) => {
    const data = await authApi.login(email, password);
    localStorage.setItem("session_id", data.token);
    setUser(data.user);
  };

  const register = async (email: string, username: string, password: string, role: string) => {
    const data = await authApi.register(email, username, password, role);
    localStorage.setItem("session_id", data.token);
    setUser(data.user);
  };

  const logout = async () => {
    try { await authApi.logout(); } catch { /* ignore */ }
    localStorage.removeItem("session_id");
    setUser(null);
  };

  const refreshUser = async () => { await fetchMe(); };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
