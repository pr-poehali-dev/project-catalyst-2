import { useState, useEffect } from "react";
import { profileApi, formatDate } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";

interface Profile {
  id: number; email: string; username: string; role: string;
  full_name: string; birth_date: string; phone: string; bio: string;
  created_at: string; updated_at: string;
  course_name: string; course_year: number | null;
}

const ROLE_LABEL: Record<string, string> = { admin: "Администратор", teacher: "Преподаватель", student: "Студент" };
const AVATAR_BG: Record<string, string> = { admin: "bg-[#ed4245]", teacher: "bg-[#3ba55c]", student: "bg-[#5865f2]" };

interface Props {
  onBack: () => void;
  viewUserId?: number;
}

export default function ProfilePage({ onBack, viewUserId }: Props) {
  const { user, refreshUser } = useAuth();
  const isOwn = !viewUserId || viewUserId === user?.id;
  const isAdmin = user?.role === "admin";

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"info" | "password">("info");

  const [form, setForm] = useState({ full_name: "", birth_date: "", phone: "", bio: "", username: "" });
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  const [pwForm, setPwForm] = useState({ old_password: "", new_password: "", confirm: "" });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState("");
  const [adminPw, setAdminPw] = useState("");
  const [adminPwMsg, setAdminPwMsg] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    profileApi.get(viewUserId).then(d => {
      setProfile(d.profile);
      setForm({
        full_name: d.profile.full_name || "",
        birth_date: d.profile.birth_date || "",
        phone: d.profile.phone || "",
        bio: d.profile.bio || "",
        username: d.profile.username || "",
      });
    }).catch(e => setError(e.message || "Ошибка загрузки"))
      .finally(() => setLoading(false));
  }, [viewUserId]);

  const displayName = (p: Profile) =>
    p.full_name ? `${p.full_name} (${p.username})` : p.username;

  const avatarLetter = (p: Profile) =>
    (p.full_name || p.username)?.[0]?.toUpperCase() || "?";

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setSaveMsg("");
    try {
      await profileApi.update({ ...form, user_id: viewUserId || user?.id || 0 });
      setSaveMsg("Сохранено!");
      if (isOwn) await refreshUser();
      setProfile(prev => prev ? { ...prev, ...form } : prev);
    } catch (err) {
      setSaveMsg(err instanceof Error ? err.message : "Ошибка");
    } finally { setSaving(false); }
  };

  const handleChangePw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwForm.new_password !== pwForm.confirm) { setPwMsg("Пароли не совпадают"); return; }
    setPwSaving(true); setPwMsg("");
    try {
      await profileApi.changePassword(pwForm.old_password, pwForm.new_password);
      setPwMsg("Пароль успешно изменён!");
      setPwForm({ old_password: "", new_password: "", confirm: "" });
    } catch (err) {
      setPwMsg(err instanceof Error ? err.message : "Ошибка");
    } finally { setPwSaving(false); }
  };

  const handleAdminPw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (adminPw.length < 6) { setAdminPwMsg("Минимум 6 символов"); return; }
    try {
      await profileApi.adminChangePassword(viewUserId || profile!.id, adminPw);
      setAdminPwMsg("Пароль изменён!");
      setAdminPw("");
    } catch (err) {
      setAdminPwMsg(err instanceof Error ? err.message : "Ошибка");
    }
  };

  return (
    <div className="min-h-screen bg-[#36393f] text-white flex flex-col">
      {/* Шапка — кнопка назад ВСЕГДА */}
      <nav className="bg-[#2f3136] border-b border-[#202225] px-4 py-3 flex items-center gap-3 flex-shrink-0">
        <Button onClick={onBack} variant="ghost" size="sm"
          className="text-[#b9bbbe] hover:text-white hover:bg-[#40444b] p-1.5 flex-shrink-0">
          <Icon name="ArrowLeft" size={16} />
        </Button>
        <Icon name="User" size={18} className="text-[#b9bbbe]" />
        <span className="text-white font-semibold text-sm truncate">
          {loading ? "Загрузка..." : profile ? (isOwn ? "Мой кабинет" : displayName(profile)) : "Профиль"}
        </span>
      </nav>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="max-w-2xl mx-auto">
          {/* Загрузка */}
          {loading && (
            <div className="flex items-center justify-center py-20">
              <div className="text-[#b9bbbe] text-sm">Загрузка профиля...</div>
            </div>
          )}

          {/* Ошибка — с кнопкой назад */}
          {!loading && error && (
            <div className="bg-[#2f3136] border border-[#202225] rounded-lg p-8 text-center">
              <Icon name="AlertCircle" size={40} className="mx-auto mb-3 text-[#ed4245] opacity-60" />
              <div className="text-white font-medium mb-1">Не удалось загрузить профиль</div>
              <div className="text-[#b9bbbe] text-sm mb-4">{error}</div>
              <Button onClick={onBack} className="bg-[#5865f2] hover:bg-[#4752c4] text-white">
                <Icon name="ArrowLeft" size={14} className="mr-2" />
                Вернуться назад
              </Button>
            </div>
          )}

          {/* Профиль */}
          {!loading && !error && profile && (
            <>
              {/* Карточка */}
              <div className="bg-[#2f3136] rounded-lg overflow-hidden mb-4 border border-[#202225]">
                <div className="h-24 bg-gradient-to-r from-[#5865f2] to-[#7c3aed]" />
                <div className="px-5 pb-5">
                  <div className="flex items-end gap-4 -mt-8 mb-4">
                    <div className={`w-20 h-20 rounded-full border-4 border-[#2f3136] flex items-center justify-center text-white text-3xl font-bold flex-shrink-0 ${AVATAR_BG[profile.role]}`}>
                      {avatarLetter(profile)}
                    </div>
                    <div className="pb-1 min-w-0">
                      {/* ФИО — главное, username — вторично */}
                      {profile.full_name ? (
                        <>
                          <div className="text-white text-xl font-bold truncate">{profile.full_name}</div>
                          <div className="text-[#b9bbbe] text-sm">@{profile.username}</div>
                        </>
                      ) : (
                        <div className="text-white text-xl font-bold truncate">@{profile.username}</div>
                      )}
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                          profile.role === "admin" ? "bg-[#ed4245]/20 text-[#ed4245]"
                          : profile.role === "teacher" ? "bg-[#3ba55c]/20 text-[#3ba55c]"
                          : "bg-[#5865f2]/20 text-[#5865f2]"}`}>
                          {ROLE_LABEL[profile.role]}
                        </span>
                        {profile.course_name && (
                          <span className="text-[#b9bbbe] text-xs">{profile.course_name}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-sm">
                    <div className="flex items-center gap-2 text-[#b9bbbe]">
                      <Icon name="Mail" size={13} className="flex-shrink-0 text-[#5865f2]" />
                      <span className="truncate">{profile.email}</span>
                    </div>
                    {profile.phone && (
                      <div className="flex items-center gap-2 text-[#b9bbbe]">
                        <Icon name="Phone" size={13} className="flex-shrink-0 text-[#5865f2]" />
                        <span>{profile.phone}</span>
                      </div>
                    )}
                    {profile.birth_date && (
                      <div className="flex items-center gap-2 text-[#b9bbbe]">
                        <Icon name="Calendar" size={13} className="flex-shrink-0 text-[#5865f2]" />
                        <span>{new Date(profile.birth_date).toLocaleDateString("ru-RU")}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-[#b9bbbe]">
                      <Icon name="Clock" size={13} className="flex-shrink-0 text-[#5865f2]" />
                      <span>Зарегистрирован {formatDate(profile.created_at)}</span>
                    </div>
                  </div>

                  {profile.bio && (
                    <p className="mt-3 text-[#dcddde] text-sm leading-relaxed border-t border-[#40444b] pt-3">{profile.bio}</p>
                  )}
                </div>
              </div>

              {/* Редактирование */}
              {(isOwn || isAdmin) && (
                <div className="bg-[#2f3136] rounded-lg border border-[#202225] overflow-hidden">
                  <div className="flex border-b border-[#202225]">
                    <button onClick={() => setTab("info")}
                      className={`flex-1 py-2.5 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${tab === "info" ? "text-white border-b-2 border-[#5865f2]" : "text-[#8e9297] hover:text-[#dcddde]"}`}>
                      <Icon name="Edit3" size={14} />Редактировать
                    </button>
                    <button onClick={() => setTab("password")}
                      className={`flex-1 py-2.5 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${tab === "password" ? "text-white border-b-2 border-[#5865f2]" : "text-[#8e9297] hover:text-[#dcddde]"}`}>
                      <Icon name="Lock" size={14} />Пароль
                    </button>
                  </div>

                  <div className="p-5">
                    {tab === "info" && (
                      <form onSubmit={handleSave} className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="text-[#b9bbbe] text-xs font-semibold uppercase tracking-wide block mb-1.5">ФИО</label>
                            <input value={form.full_name} onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))}
                              className="w-full bg-[#40444b] text-white placeholder-[#72767d] rounded px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[#5865f2]"
                              placeholder="Иванов Иван Иванович" />
                          </div>
                          <div>
                            <label className="text-[#b9bbbe] text-xs font-semibold uppercase tracking-wide block mb-1.5">Имя пользователя</label>
                            <input value={form.username} onChange={e => setForm(p => ({ ...p, username: e.target.value }))}
                              className="w-full bg-[#40444b] text-white placeholder-[#72767d] rounded px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[#5865f2]"
                              placeholder="ivan_ivanov" />
                          </div>
                          <div>
                            <label className="text-[#b9bbbe] text-xs font-semibold uppercase tracking-wide block mb-1.5">Дата рождения</label>
                            <input type="date" value={form.birth_date} onChange={e => setForm(p => ({ ...p, birth_date: e.target.value }))}
                              className="w-full bg-[#40444b] text-white rounded px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[#5865f2]" />
                          </div>
                          <div>
                            <label className="text-[#b9bbbe] text-xs font-semibold uppercase tracking-wide block mb-1.5">Телефон</label>
                            <input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                              className="w-full bg-[#40444b] text-white placeholder-[#72767d] rounded px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[#5865f2]"
                              placeholder="+7 (999) 123-45-67" />
                          </div>
                        </div>
                        <div>
                          <label className="text-[#b9bbbe] text-xs font-semibold uppercase tracking-wide block mb-1.5">О себе</label>
                          <textarea value={form.bio} onChange={e => setForm(p => ({ ...p, bio: e.target.value }))}
                            rows={3}
                            className="w-full bg-[#40444b] text-white placeholder-[#72767d] rounded px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[#5865f2] resize-none"
                            placeholder="Расскажите немного о себе..." />
                        </div>
                        {saveMsg && (
                          <div className={`text-sm ${saveMsg === "Сохранено!" ? "text-[#3ba55c]" : "text-[#ed4245]"}`}>{saveMsg}</div>
                        )}
                        <Button type="submit" disabled={saving} className="bg-[#5865f2] hover:bg-[#4752c4] text-white">
                          <Icon name="Save" size={14} className="mr-2" />
                          {saving ? "Сохранение..." : "Сохранить"}
                        </Button>
                      </form>
                    )}

                    {tab === "password" && (
                      <div className="space-y-6">
                        {isOwn && (
                          <form onSubmit={handleChangePw} className="space-y-4">
                            <h3 className="text-white font-medium text-sm">Сменить пароль</h3>
                            {[
                              { label: "Текущий пароль", key: "old_password", placeholder: "••••••••" },
                              { label: "Новый пароль", key: "new_password", placeholder: "Минимум 6 символов" },
                              { label: "Повторите новый пароль", key: "confirm", placeholder: "••••••••" },
                            ].map(f => (
                              <div key={f.key}>
                                <label className="text-[#b9bbbe] text-xs font-semibold uppercase tracking-wide block mb-1.5">{f.label}</label>
                                <input type="password"
                                  value={pwForm[f.key as keyof typeof pwForm]}
                                  onChange={e => setPwForm(p => ({ ...p, [f.key]: e.target.value }))}
                                  className="w-full bg-[#40444b] text-white placeholder-[#72767d] rounded px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[#5865f2]"
                                  placeholder={f.placeholder} required />
                              </div>
                            ))}
                            {pwMsg && <div className={`text-sm ${pwMsg.includes("!") ? "text-[#3ba55c]" : "text-[#ed4245]"}`}>{pwMsg}</div>}
                            <Button type="submit" disabled={pwSaving} className="bg-[#5865f2] hover:bg-[#4752c4] text-white">
                              <Icon name="Key" size={14} className="mr-2" />
                              {pwSaving ? "Сохранение..." : "Изменить пароль"}
                            </Button>
                          </form>
                        )}

                        {isAdmin && !isOwn && (
                          <form onSubmit={handleAdminPw} className="space-y-4">
                            <h3 className="text-white font-medium text-sm flex items-center gap-2">
                              <Icon name="ShieldAlert" size={15} className="text-[#ed4245]" />
                              Установить новый пароль пользователю
                            </h3>
                            <input type="password" value={adminPw} onChange={e => { setAdminPw(e.target.value); setAdminPwMsg(""); }}
                              className="w-full bg-[#40444b] text-white placeholder-[#72767d] rounded px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[#5865f2]"
                              placeholder="Новый пароль (мин. 6 символов)" required minLength={6} />
                            {adminPwMsg && <div className={`text-sm ${adminPwMsg.includes("!") ? "text-[#3ba55c]" : "text-[#ed4245]"}`}>{adminPwMsg}</div>}
                            <Button type="submit" className="bg-[#ed4245] hover:bg-[#c03537] text-white">
                              <Icon name="Key" size={14} className="mr-2" />
                              Установить пароль
                            </Button>
                          </form>
                        )}

                        {isAdmin && isOwn && (
                          <p className="text-[#72767d] text-xs">Для смены пароля другим — откройте вкладку «Аккаунты» в панели администратора.</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
