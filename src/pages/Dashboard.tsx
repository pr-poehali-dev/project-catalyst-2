import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { chatApi, filesApi, formatFileSize, formatDate } from "@/lib/api";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import UserCard from "@/components/UserCard";

interface Course { id: number; year: number; name: string }
interface Subject { id: number; name: string; description: string }
interface SubChannel { id: number; name: string }
interface Message { id: number; content: string; created_at: string; username: string; role: string; reactions: Record<string, string[]>; user_id?: number }
interface FileItem { id: number; name: string; size: number; mime_type: string; url: string; created_at: string; uploaded_by: string }
interface Member { id: number; username: string; role: string }
interface Notif { id: number; type: string; title: string; body: string; is_read: boolean; created_at: string }

const ROLE_COLOR: Record<string, string> = { admin: "text-[#ed4245]", teacher: "text-[#3ba55c]", student: "text-white" };
const ROLE_BADGE: Record<string, string> = { admin: "АДМИН", teacher: "ПРЕПОД" };
const AVATAR_BG: Record<string, string> = { admin: "bg-[#ed4245]", teacher: "bg-[#3ba55c]", student: "bg-[#5865f2]" };
const QUICK_EMOJIS = ["👍", "❤️", "😂", "🔥", "👏", "😮"];
const CH_ICON: Record<string, string> = { объявления: "Megaphone", материалы: "BookOpen", задания: "ClipboardList", вопросы: "HelpCircle", общий: "MessageSquare" };

export default function Dashboard({ onOpenAdmin, onOpenProfile }: { onOpenAdmin: () => void; onOpenProfile: () => void }) {
  const { user, logout } = useAuth();

  const [courses, setCourses] = useState<Course[]>([]);
  const [activeCourse, setActiveCourse] = useState<Course | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [activeSubject, setActiveSubject] = useState<Subject | null>(null);
  const [subChannels, setSubChannels] = useState<SubChannel[]>([]);
  const [activeChannel, setActiveChannel] = useState<SubChannel | null>(null);
  const [tab, setTab] = useState<"chat" | "files">("chat");

  const [messages, setMessages] = useState<Message[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [unread, setUnread] = useState(0);

  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [showNotifs, setShowNotifs] = useState(false);
  const [showEmojiFor, setShowEmojiFor] = useState<number | null>(null);
  const [fileSearch, setFileSearch] = useState("");
  const [fileDate, setFileDate] = useState("");

  const endRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastIdRef = useRef(0);
  const activeChRef = useRef<SubChannel | null>(null);

  const avatarLetter = (n: string) => n?.[0]?.toUpperCase() || "?";

  const loadNotifs = useCallback(() => {
    chatApi.getNotifications().then(d => {
      setNotifs(d.notifications);
      setUnread(d.notifications.filter((n: Notif) => !n.is_read).length);
    }).catch(() => {});
  }, []);

  const loadFiles = useCallback(() => {
    const ch = activeChRef.current;
    if (!ch) return;
    filesApi.getFiles(ch.id, fileSearch || undefined, fileDate || undefined)
      .then(d => setFiles(d.files));
  }, [fileSearch, fileDate]);

  // Курсы при старте
  useEffect(() => {
    chatApi.getCourses().then(d => {
      setCourses(d.courses);
      if (d.courses.length > 0) setActiveCourse(d.courses[0]);
    });
    loadNotifs();
    const t = setInterval(loadNotifs, 15000);
    return () => clearInterval(t);
  }, [loadNotifs]);

  // Предметы при смене курса
  useEffect(() => {
    if (!activeCourse) return;
    setActiveSubject(null); setActiveChannel(null); setMessages([]); setFiles([]);
    chatApi.getSubjects(activeCourse.id).then(d => {
      setSubjects(d.subjects);
      if (d.subjects.length > 0) setActiveSubject(d.subjects[0]);
    });
    chatApi.getMembers(activeCourse.id).then(d => setMembers(d.members));
  }, [activeCourse]);

  // Подканалы при смене предмета
  useEffect(() => {
    if (!activeSubject) return;
    setActiveChannel(null); setMessages([]);
    chatApi.getSubjectChannels(activeSubject.id).then(d => {
      setSubChannels(d.channels);
      if (d.channels.length > 0) setActiveChannel(d.channels[0]);
    });
  }, [activeSubject]);

  // Синхронизируем ref
  useEffect(() => { activeChRef.current = activeChannel; }, [activeChannel]);

  // История при смене канала
  useEffect(() => {
    if (!activeChannel) return;
    lastIdRef.current = 0; setMessages([]);
    chatApi.getMessages(activeChannel.id).then(d => {
      setMessages(d.messages);
      if (d.messages.length > 0) lastIdRef.current = d.messages[d.messages.length - 1].id;
    });
    loadFiles();
  }, [activeChannel, loadFiles]);

  // Файлы при изменении фильтров
  useEffect(() => { if (activeChannel) loadFiles(); }, [fileSearch, fileDate, loadFiles]);

  // Polling сообщений
  useEffect(() => {
    let stopped = false;
    const poll = async () => {
      if (stopped) return;
      const ch = activeChRef.current;
      if (ch) {
        try {
          const d = await chatApi.pollMessages(ch.id, lastIdRef.current);
          if (!stopped && d.messages.length > 0) {
            setMessages(prev => {
              const ids = new Set(prev.map((m: Message) => m.id));
              const news = d.messages.filter((m: Message) => !ids.has(m.id));
              if (!news.length) return prev;
              lastIdRef.current = news[news.length - 1].id;
              return [...prev, ...news];
            });
          }
        } catch { /* silent */ }
      }
      if (!stopped) pollRef.current = setTimeout(poll, 2500);
    };
    pollRef.current = setTimeout(poll, 2500);
    return () => { stopped = true; if (pollRef.current) clearTimeout(pollRef.current); };
  }, []);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !activeChannel || sending) return;
    setSending(true);
    try {
      const d = await chatApi.sendMessage(activeChannel.id, input.trim());
      setMessages(prev => {
        if (prev.some(m => m.id === d.message.id)) return prev;
        lastIdRef.current = d.message.id;
        return [...prev, d.message];
      });
      setInput("");
    } finally { setSending(false); }
  };

  const handleDeleteMessage = async (msgId: number) => {
    if (!confirm("Удалить сообщение?")) return;
    await chatApi.deleteMessage(msgId);
    setMessages(prev => prev.map(m => m.id === msgId
      ? { ...m, content: "[сообщение удалено]", reactions: {} }
      : m));
  };

  const handleReact = async (msgId: number, emoji: string) => {
    const d = await chatApi.react(msgId, emoji);
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, reactions: d.reactions } : m));
    setShowEmojiFor(null);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeChannel) return;
    setUploading(true);
    try {
      const d = await filesApi.upload(file, activeChannel.id) as { file: FileItem };
      setFiles(prev => [d.file, ...prev]);
    } catch (err) { alert(err instanceof Error ? err.message : "Ошибка"); }
    finally { setUploading(false); if (fileInputRef.current) fileInputRef.current.value = ""; }
  };

  const handleDeleteFile = async (fid: number) => {
    if (!confirm("Удалить файл?")) return;
    await filesApi.deleteFile(fid);
    setFiles(prev => prev.filter(f => f.id !== fid));
  };

  const handleMarkAllRead = async () => {
    await chatApi.markRead();
    setNotifs(prev => prev.map(n => ({ ...n, is_read: true })));
    setUnread(0);
  };

  return (
    <div className="bg-[#36393f] text-white flex flex-col" style={{ height: "100dvh" }}>
      {/* Топ-навигация */}
      <nav className="bg-[#2f3136] border-b border-[#202225] px-4 py-2.5 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#5865f2] rounded-full flex items-center justify-center flex-shrink-0">
            <Icon name="GraduationCap" size={18} className="text-white" />
          </div>
          <span className="font-bold hidden sm:block">FileTracker_Hexlet</span>
        </div>
        <div className="flex items-center gap-1.5">
          {/* Колокольчик */}
          <div className="relative">
            <button onClick={() => { setShowNotifs(v => !v); loadNotifs(); }}
              className="relative w-8 h-8 flex items-center justify-center rounded hover:bg-[#40444b] text-[#b9bbbe] hover:text-white">
              <Icon name="Bell" size={18} />
              {unread > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-[#ed4245] rounded-full text-[10px] flex items-center justify-center font-bold">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </button>
            {showNotifs && (
              <div className="absolute right-0 top-10 w-80 bg-[#2f3136] border border-[#202225] rounded-lg shadow-2xl z-50 max-h-96 overflow-y-auto">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#202225]">
                  <span className="text-white font-semibold text-sm">Уведомления</span>
                  {unread > 0 && <button onClick={handleMarkAllRead} className="text-[#5865f2] text-xs hover:underline">Прочитать все</button>}
                </div>
                {notifs.length === 0 && <div className="text-[#72767d] text-sm text-center py-6">Нет уведомлений</div>}
                {notifs.map(n => (
                  <div key={n.id} className={`px-4 py-3 border-b border-[#202225] last:border-0 ${!n.is_read ? "bg-[#5865f2]/10" : ""}`}>
                    <div className="flex items-start gap-2">
                      <Icon name={n.type === "file" ? "File" : n.type === "enroll" ? "UserCheck" : "MessageSquare"}
                        size={13} className="text-[#5865f2] mt-0.5 flex-shrink-0" />
                      <div className="min-w-0">
                        <div className="text-white text-sm font-medium">{n.title}</div>
                        {n.body && <div className="text-[#b9bbbe] text-xs mt-0.5 truncate">{n.body}</div>}
                        <div className="text-[#72767d] text-xs mt-0.5">{formatDate(n.created_at)}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button onClick={onOpenProfile}
            className="hidden sm:flex items-center gap-2 ml-1 px-2 py-1 rounded hover:bg-[#40444b] transition-colors">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold ${AVATAR_BG[user?.role || "student"]}`}>
              {avatarLetter(user?.username || "")}
            </div>
            <span className="text-white text-sm">{user?.username}</span>
          </button>
          {user?.role === "admin" && (
            <Button onClick={onOpenAdmin} size="sm" className="bg-[#ed4245] hover:bg-[#c03537] text-white text-xs px-2.5 h-7 ml-1">
              <Icon name="Shield" size={13} className="mr-1" />Админ
            </Button>
          )}
          <Button onClick={onOpenProfile} variant="ghost" size="sm" className="sm:hidden text-[#b9bbbe] hover:text-white hover:bg-[#40444b] p-1.5">
            <Icon name="User" size={16} />
          </Button>
          <Button onClick={logout} variant="ghost" size="sm" className="text-[#b9bbbe] hover:text-white hover:bg-[#40444b] p-1.5">
            <Icon name="LogOut" size={16} />
          </Button>
        </div>
      </nav>

      <div className="flex flex-1 overflow-hidden">
        {/* Сайдбар */}
        <div className={`${mobileSidebar ? "flex" : "hidden"} sm:flex flex-col bg-[#2f3136] w-56 flex-shrink-0 overflow-hidden border-r border-[#202225]`}>
          {/* Курсы */}
          <div className="flex-shrink-0 border-b border-[#202225] pb-2">
            <div className="px-3 pt-3 pb-1 text-[#8e9297] text-xs font-semibold uppercase tracking-wide">Курсы</div>
            {courses.map(c => (
              <button key={c.id} onClick={() => { setActiveCourse(c); setMobileSidebar(false); }}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left transition-colors ${activeCourse?.id === c.id ? "bg-[#393c43] text-white" : "text-[#8e9297] hover:text-[#dcddde] hover:bg-[#34373c]"}`}>
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${activeCourse?.id === c.id ? "bg-[#5865f2] text-white" : "bg-[#40444b] text-[#b9bbbe]"}`}>{c.year}</span>
                {c.name}
              </button>
            ))}
          </div>

          {/* Предметы и подканалы */}
          <div className="flex-1 overflow-y-auto py-1">
            {activeCourse && <>
              <div className="px-3 pt-2 pb-1 text-[#8e9297] text-xs font-semibold uppercase tracking-wide">Предметы</div>
              {subjects.map(s => (
                <div key={s.id}>
                  <button onClick={() => setActiveSubject(activeSubject?.id === s.id ? null : s)}
                    className={`w-full flex items-center gap-1.5 px-3 py-1.5 text-sm text-left transition-colors ${activeSubject?.id === s.id ? "text-white" : "text-[#8e9297] hover:text-[#dcddde] hover:bg-[#34373c]"}`}>
                    <Icon name="ChevronRight" size={12} className={`flex-shrink-0 transition-transform ${activeSubject?.id === s.id ? "rotate-90" : ""}`} />
                    <Icon name="BookOpen" size={14} className="flex-shrink-0" />
                    <span className="truncate">{s.name}</span>
                  </button>
                  {activeSubject?.id === s.id && subChannels.map(ch => (
                    <button key={ch.id} onClick={() => { setActiveChannel(ch); setTab("chat"); setMobileSidebar(false); }}
                      className={`w-full flex items-center gap-1.5 pl-8 pr-3 py-1 text-sm text-left transition-colors ${activeChannel?.id === ch.id ? "bg-[#393c43] text-white" : "text-[#72767d] hover:text-[#dcddde] hover:bg-[#34373c]"}`}>
                      <Icon name={CH_ICON[ch.name] || "Hash"} size={14} className="flex-shrink-0" />
                      {ch.name}
                    </button>
                  ))}
                </div>
              ))}
            </>}
          </div>

          {/* Профиль внизу */}
          <div className="flex-shrink-0 p-2 bg-[#292b2f] border-t border-[#202225] flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0 ${AVATAR_BG[user?.role || "student"]}`}>
              {avatarLetter(user?.username || "")}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-white text-sm font-medium truncate">{user?.username}</div>
              <div className="text-[#b9bbbe] text-xs">{user?.role === "admin" ? "Администратор" : user?.role === "teacher" ? "Преподаватель" : activeCourse?.name || "Студент"}</div>
            </div>
          </div>
        </div>

        {/* Основная область */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Заголовок канала */}
          <div className="h-11 bg-[#36393f] border-b border-[#202225] flex items-center px-3 gap-2 flex-shrink-0">
            <button onClick={() => setMobileSidebar(!mobileSidebar)} className="sm:hidden text-[#8e9297] hover:text-white mr-1">
              <Icon name="Menu" size={20} />
            </button>
            {activeChannel ? <>
              <Icon name={CH_ICON[activeChannel.name] || "Hash"} size={16} className="text-[#8e9297]" />
              <span className="font-semibold text-sm">{activeChannel.name}</span>
              <div className="w-px h-4 bg-[#40444b] mx-1 hidden sm:block" />
              <span className="text-[#8e9297] text-xs hidden sm:block truncate">{activeSubject?.name} · {activeCourse?.name}</span>
            </> : <span className="text-[#8e9297] text-sm">Выберите курс и предмет</span>}

            <div className="ml-auto flex items-center gap-0.5">
              {activeChannel && <>
                <button onClick={() => setTab("chat")}
                  className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${tab === "chat" ? "bg-[#40444b] text-white" : "text-[#8e9297] hover:text-white"}`}>
                  <Icon name="MessageSquare" size={13} /><span className="hidden sm:inline ml-1">Чат</span>
                </button>
                <button onClick={() => { setTab("files"); loadFiles(); }}
                  className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${tab === "files" ? "bg-[#40444b] text-white" : "text-[#8e9297] hover:text-white"}`}>
                  <Icon name="FolderOpen" size={13} /><span className="hidden sm:inline ml-1">Файлы</span>
                </button>
                <button onClick={() => setShowMembers(v => !v)}
                  className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${showMembers ? "bg-[#40444b] text-white" : "text-[#8e9297] hover:text-white"}`}>
                  <Icon name="Users" size={13} /><span className="hidden sm:inline ml-1">{members.length}</span>
                </button>
              </>}
            </div>
          </div>

          <div className="flex flex-1 overflow-hidden">
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Пустое состояние */}
              {!activeChannel && (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center text-[#72767d]">
                    <Icon name="GraduationCap" size={48} className="mx-auto mb-3 opacity-20" />
                    <p className="text-sm">Выберите курс → предмет → канал</p>
                  </div>
                </div>
              )}

              {/* ЧАТ */}
              {activeChannel && tab === "chat" && <>
                <div className="flex-1 overflow-y-auto p-3 space-y-3" onClick={() => setShowEmojiFor(null)}>
                  {messages.length === 0 && (
                    <div className="text-center text-[#72767d] text-sm py-10">
                      <Icon name="MessageSquare" size={36} className="mx-auto mb-2 opacity-20" />
                      <p>Сообщений пока нет — напишите первым!</p>
                    </div>
                  )}
                  {messages.map(msg => (
                    <div key={msg.id} className="flex gap-2.5 group relative">
                      <UserCard userId={msg.user_id || 0}>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity ${AVATAR_BG[msg.role]}`}>
                          {avatarLetter(msg.username)}
                        </div>
                      </UserCard>
                      <div className={`flex-1 min-w-0 ${msg.content === "[сообщение удалено]" ? "pr-2" : "pr-16"}`}>
                        <div className="flex items-baseline gap-2 mb-0.5 flex-wrap">
                          <span className={`font-medium text-sm ${ROLE_COLOR[msg.role]}`}>{msg.username}</span>
                          {ROLE_BADGE[msg.role] && (
                            <span className={`text-[10px] px-1 rounded font-bold ${msg.role === "admin" ? "bg-[#ed4245]/20 text-[#ed4245]" : "bg-[#3ba55c]/20 text-[#3ba55c]"}`}>
                              {ROLE_BADGE[msg.role]}
                            </span>
                          )}
                          <span className="text-[#72767d] text-xs">{formatDate(msg.created_at)}</span>
                        </div>
                        {msg.content === "[сообщение удалено]" ? (
                          <p className="text-[#72767d] text-sm italic">[сообщение удалено]</p>
                        ) : (
                          <p className="text-[#dcddde] text-sm leading-relaxed break-words">{msg.content}</p>
                        )}
                        {/* Реакции */}
                        {Object.keys(msg.reactions).length > 0 && (
                          <div className="flex gap-1 mt-1.5 flex-wrap">
                            {Object.entries(msg.reactions).map(([emoji, users]) => (
                              <button key={emoji} onClick={e => { e.stopPropagation(); handleReact(msg.id, emoji); }}
                                className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs border transition-colors ${users.includes(String(user?.id)) ? "bg-[#5865f2]/30 border-[#5865f2]" : "bg-[#40444b] border-transparent hover:border-[#5865f2]"}`}>
                                {emoji}<span className="text-[#b9bbbe]">{users.length}</span>
                              </button>
                            ))}
                          </div>
                        )}
                        {/* Эмодзи пикер */}
                        {showEmojiFor === msg.id && (
                          <div className="flex gap-1.5 mt-1.5 p-2 bg-[#2f3136] rounded-lg border border-[#202225] w-fit" onClick={e => e.stopPropagation()}>
                            {QUICK_EMOJIS.map(e => (
                              <button key={e} onClick={() => handleReact(msg.id, e)} className="text-lg hover:scale-125 transition-transform">{e}</button>
                            ))}
                          </div>
                        )}
                      </div>
                      {/* Кнопки действий — появляются при наведении */}
                      {msg.content !== "[сообщение удалено]" && (
                        <div className="absolute right-0 top-0 opacity-0 group-hover:opacity-100 flex gap-0.5 transition-all">
                          <button onClick={e => { e.stopPropagation(); setShowEmojiFor(showEmojiFor === msg.id ? null : msg.id); }}
                            className="w-7 h-7 flex items-center justify-center rounded hover:bg-[#40444b] text-[#b9bbbe] text-base">
                            😊
                          </button>
                          {(user?.role === "admin" || user?.role === "teacher") && (
                            <button onClick={e => { e.stopPropagation(); handleDeleteMessage(msg.id); }}
                              className="w-7 h-7 flex items-center justify-center rounded hover:bg-[#ed4245]/20 text-[#b9bbbe] hover:text-[#ed4245] transition-colors">
                              <Icon name="Trash2" size={14} />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                  <div ref={endRef} />
                </div>
                <form onSubmit={sendMessage} className="p-3 flex-shrink-0">
                  <div className="bg-[#40444b] rounded-lg flex items-center gap-2 px-3 py-2.5">
                    <input value={input} onChange={e => setInput(e.target.value)}
                      className="flex-1 bg-transparent text-white placeholder-[#72767d] text-sm outline-none"
                      placeholder={`Сообщение #${activeChannel.name}`} disabled={sending} />
                    <button type="submit" disabled={!input.trim() || sending}
                      className="text-[#b9bbbe] hover:text-white disabled:opacity-40 transition-colors">
                      <Icon name="Send" size={17} />
                    </button>
                  </div>
                </form>
              </>}

              {/* ФАЙЛЫ */}
              {activeChannel && tab === "files" && (
                <div className="flex-1 overflow-y-auto p-4">
                  <div className="flex gap-2 mb-4 flex-wrap">
                    <div className="flex-1 min-w-36 relative">
                      <Icon name="Search" size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#72767d]" />
                      <input value={fileSearch} onChange={e => setFileSearch(e.target.value)}
                        placeholder="Поиск по названию..."
                        className="w-full bg-[#40444b] text-white placeholder-[#72767d] rounded px-8 py-1.5 text-sm outline-none focus:ring-1 focus:ring-[#5865f2]" />
                    </div>
                    <input type="date" value={fileDate} onChange={e => setFileDate(e.target.value)}
                      className="bg-[#40444b] text-white rounded px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-[#5865f2]" />
                    {(fileSearch || fileDate) && (
                      <button onClick={() => { setFileSearch(""); setFileDate(""); }} className="text-[#b9bbbe] hover:text-white px-2 text-sm">✕</button>
                    )}
                    {(user?.role === "teacher" || user?.role === "admin") && <>
                      <input ref={fileInputRef} type="file" onChange={handleUpload} className="hidden" />
                      <Button onClick={() => fileInputRef.current?.click()} disabled={uploading}
                        size="sm" className="bg-[#5865f2] hover:bg-[#4752c4] text-white">
                        <Icon name="Upload" size={14} className="mr-1.5" />
                        {uploading ? "Загрузка..." : "Загрузить"}
                      </Button>
                    </>}
                  </div>

                  {files.length === 0 && (
                    <div className="text-center text-[#72767d] text-sm py-10">
                      <Icon name="FolderOpen" size={36} className="mx-auto mb-2 opacity-20" />
                      <p>{fileSearch || fileDate ? "Ничего не найдено" : "Файлов пока нет"}</p>
                    </div>
                  )}
                  <div className="space-y-2">
                    {files.map(f => (
                      <div key={f.id} className="bg-[#2f3136] border border-[#202225] rounded-lg p-3 flex items-center gap-3 hover:bg-[#36393f] transition-colors">
                        <div className="w-9 h-9 bg-[#5865f2]/20 rounded-lg flex items-center justify-center flex-shrink-0">
                          <Icon name={f.mime_type?.includes("pdf") ? "FileText" : f.mime_type?.includes("image") ? "Image" : "File"}
                            size={18} className="text-[#5865f2]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-white text-sm font-medium truncate">{f.name}</div>
                          <div className="text-[#b9bbbe] text-xs">{formatFileSize(f.size)} · {f.uploaded_by} · {formatDate(f.created_at)}</div>
                        </div>
                        <a href={f.url} target="_blank" rel="noopener noreferrer"
                          className="w-7 h-7 flex items-center justify-center rounded hover:bg-[#40444b] text-[#b9bbbe] hover:text-white transition-colors flex-shrink-0">
                          <Icon name="Download" size={15} />
                        </a>
                        {(user?.role === "teacher" || user?.role === "admin") && (
                          <button onClick={() => handleDeleteFile(f.id)}
                            className="w-7 h-7 flex items-center justify-center rounded hover:bg-[#ed4245]/20 text-[#b9bbbe] hover:text-[#ed4245] transition-colors flex-shrink-0">
                            <Icon name="Trash2" size={15} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Участники */}
            {showMembers && activeChannel && (
              <div className="w-48 bg-[#2f3136] border-l border-[#202225] flex-shrink-0 overflow-y-auto p-3">
                <div className="text-[#8e9297] text-xs font-semibold uppercase tracking-wide mb-3">Участники · {members.length}</div>
                {(["admin", "teacher", "student"] as const).map(rk => {
                  const group = members.filter(m => m.role === rk);
                  if (!group.length) return null;
                  return (
                    <div key={rk} className="mb-4">
                      <div className="text-[#8e9297] text-xs font-semibold mb-1.5 uppercase tracking-wide">
                        {rk === "admin" ? "Администраторы" : rk === "teacher" ? "Преподаватели" : "Студенты"} — {group.length}
                      </div>
                      {group.map(m => (
                        <UserCard key={m.id} userId={m.id}>
                          <div className="flex items-center gap-2 py-1 hover:bg-[#36393f] rounded px-1 transition-colors">
                            <div className="relative">
                              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold ${AVATAR_BG[m.role]}`}>
                                {avatarLetter(m.username)}
                              </div>
                              <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-[#3ba55c] border-2 border-[#2f3136] rounded-full" />
                            </div>
                            <span className="text-[#dcddde] text-xs truncate">{m.username}</span>
                          </div>
                        </UserCard>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}