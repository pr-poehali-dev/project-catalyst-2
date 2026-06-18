import { useState, useEffect, useRef } from "react";
import { profileApi } from "@/lib/api";
import Icon from "@/components/ui/icon";

interface Profile {
  id: number; username: string; role: string;
  full_name: string; birth_date: string; phone: string;
  course_name: string; course_year: number | null; email: string;
}

const ROLE_LABEL: Record<string, string> = { admin: "Администратор", teacher: "Преподаватель", student: "Студент" };
const AVATAR_BG: Record<string, string> = { admin: "bg-[#ed4245]", teacher: "bg-[#3ba55c]", student: "bg-[#5865f2]" };

interface Props {
  userId: number;
  children: React.ReactNode;
}

export default function UserCard({ userId, children }: Props) {
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || profile) return;
    setLoading(true);
    profileApi.get(userId)
      .then(d => setProfile(d.profile))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, userId, profile]);

  // Закрыть при клике снаружи
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const avatarLetter = (p: Profile) => (p.full_name || p.username)?.[0]?.toUpperCase() || "?";
  const displayName = (p: Profile) => p.full_name ? `${p.full_name}` : p.username;

  return (
    <div className="relative" ref={ref}>
      <div onClick={() => setOpen(v => !v)} className="cursor-pointer">
        {children}
      </div>

      {open && (
        <div className="absolute left-full ml-2 top-0 z-50 w-64 bg-[#18191c] border border-[#202225] rounded-lg shadow-2xl overflow-hidden"
          style={{ maxHeight: "80vh" }}>
          {loading && (
            <div className="p-4 text-center text-[#b9bbbe] text-sm">Загрузка...</div>
          )}
          {!loading && profile && (
            <>
              {/* Шапка с градиентом */}
              <div className="h-14 bg-gradient-to-r from-[#5865f2] to-[#7c3aed]" />
              <div className="px-4 pb-4">
                <div className="flex items-end gap-3 -mt-6 mb-3">
                  <div className={`w-12 h-12 rounded-full border-4 border-[#18191c] flex items-center justify-center text-white text-lg font-bold flex-shrink-0 ${AVATAR_BG[profile.role]}`}>
                    {avatarLetter(profile)}
                  </div>
                </div>

                {/* Имя */}
                <div className="mb-3">
                  <div className="text-white font-bold text-base leading-tight">{displayName(profile)}</div>
                  <div className="text-[#b9bbbe] text-xs">@{profile.username}</div>
                </div>

                {/* Роль */}
                <div className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full mb-3 ${
                  profile.role === "admin" ? "bg-[#ed4245]/20 text-[#ed4245]"
                  : profile.role === "teacher" ? "bg-[#3ba55c]/20 text-[#3ba55c]"
                  : "bg-[#5865f2]/20 text-[#5865f2]"}`}>
                  {ROLE_LABEL[profile.role]}
                </div>

                {/* Детали */}
                <div className="space-y-1.5 border-t border-[#2b2d31] pt-3">
                  {profile.course_name && (
                    <div className="flex items-center gap-2 text-[#b9bbbe] text-xs">
                      <Icon name="GraduationCap" size={12} className="flex-shrink-0 text-[#5865f2]" />
                      <span>{profile.course_name}</span>
                    </div>
                  )}
                  {profile.birth_date && (
                    <div className="flex items-center gap-2 text-[#b9bbbe] text-xs">
                      <Icon name="Calendar" size={12} className="flex-shrink-0 text-[#5865f2]" />
                      <span>{new Date(profile.birth_date).toLocaleDateString("ru-RU")}</span>
                    </div>
                  )}
                  {profile.phone && (
                    <div className="flex items-center gap-2 text-[#b9bbbe] text-xs">
                      <Icon name="Phone" size={12} className="flex-shrink-0 text-[#5865f2]" />
                      <span>{profile.phone}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-[#b9bbbe] text-xs">
                    <Icon name="Mail" size={12} className="flex-shrink-0 text-[#5865f2]" />
                    <span className="truncate">{profile.email}</span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
