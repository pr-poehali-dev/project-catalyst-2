import { useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import AdminPanel from "./pages/AdminPanel";
import ProfilePage from "./pages/ProfilePage";

const queryClient = new QueryClient();

type Page = "login" | "register" | "dashboard" | "admin" | "profile";

function AppInner() {
  const { user, loading } = useAuth();
  const [page, setPage] = useState<Page>("login");

  if (loading) {
    return (
      <div className="min-h-screen bg-[#36393f] flex items-center justify-center">
        <div className="text-[#b9bbbe] text-sm">Загрузка...</div>
      </div>
    );
  }

  if (!user) {
    if (page === "register") return <Register onGoLogin={() => setPage("login")} />;
    return <Login onGoRegister={() => setPage("register")} />;
  }

  if (page === "admin" && user.role === "admin") {
    return <AdminPanel onBack={() => setPage("dashboard")} />;
  }

  if (page === "profile") {
    return <ProfilePage onBack={() => setPage("dashboard")} />;
  }

  return (
    <Dashboard
      onOpenAdmin={() => setPage("admin")}
      onOpenProfile={() => setPage("profile")}
    />
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <AppInner />
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
