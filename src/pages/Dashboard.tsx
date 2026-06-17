import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { chatApi, filesApi, formatFileSize, formatDate } from "@/lib/api";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";

interface Channel { id: number; name: string; description: string }
interface Message { id: number; content: string; created_at: string; username: string; role: string }
interface FileItem { id: number; name: string; size: number; mime_type: string; url: string; created_at: string; uploaded_by: string }

const ROLE_COLORS: Record<string, string> = {
  admin: "text-[#ed4245]",
  teacher: "text-[#3ba55c]",
  student: "text-white",
};
const ROLE_LABELS: Record<string, string> = {
  admin: "АДМИН",
  teacher: "ПРЕПОД",
  student: "",
};

interface Props {
  onOpenAdmin: () => void;
}

export default function Dashboard({ onOpenAdmin }: Props) {
  const { user, logout } = useAuth();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
  const [activeTab, setActiveTab] = useState<"chat" | "files">("chat");
  const [messages, setMessages] = useState<Message[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const [online, setOnline] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastMessageIdRef = useRef<number>(0);
  const activeChannelRef = useRef<Channel | null>(null);

  useEffect(() => {
    chatApi.getChannels().then((d) => {
      setChannels(d.channels);
      if (d.channels.length > 0) setActiveChannel(d.channels[0]);
    });
  }, []);

  // Держим ref в синхронизации с state для использования внутри polling
  useEffect(() => {
    activeChannelRef.current = activeChannel;
  }, [activeChannel]);

  const loadFiles = useCallback(async (channelId: number) => {
    const d = await filesApi.getFiles(channelId);
    setFiles(d.files);
  }, []);

  // Загрузка истории при смене канала
  useEffect(() => {
    if (!activeChannel) return;
    lastMessageIdRef.current = 0;
    setMessages([]);

    chatApi.getMessages(activeChannel.id).then((d) => {
      setMessages(d.messages);
      if (d.messages.length > 0) {
        lastMessageIdRef.current = d.messages[d.messages.length - 1].id;
      }
    });
    loadFiles(activeChannel.id);
  }, [activeChannel, loadFiles]);

  // Long-polling: каждые 2 сек спрашиваем новые сообщения по last_id
  useEffect(() => {
    let stopped = false;

    const poll = async () => {
      if (stopped) return;
      const ch = activeChannelRef.current;
      if (!ch) {
        pollRef.current = setTimeout(poll, 2000);
        return;
      }
      try {
        const d = await chatApi.pollMessages(ch.id, lastMessageIdRef.current);
        if (!stopped && d.messages.length > 0) {
          setMessages((prev) => {
            const existingIds = new Set(prev.map((m) => m.id));
            const newMsgs = d.messages.filter((m: Message) => !existingIds.has(m.id));
            if (newMsgs.length === 0) return prev;
            lastMessageIdRef.current = newMsgs[newMsgs.length - 1].id;
            return [...prev, ...newMsgs];
          });
        }
        setOnline(true);
      } catch {
        setOnline(false);
      }
      if (!stopped) pollRef.current = setTimeout(poll, 2000);
    };

    pollRef.current = setTimeout(poll, 2000);
    return () => {
      stopped = true;
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !activeChannel || sending) return;
    setSending(true);
    try {
      const d = await chatApi.sendMessage(activeChannel.id, input.trim());
      setMessages((prev) => {
        const exists = prev.some((m) => m.id === d.message.id);
        if (exists) return prev;
        lastMessageIdRef.current = d.message.id;
        return [...prev, d.message];
      });
      setInput("");
    } finally {
      setSending(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeChannel) return;
    setUploading(true);
    try {
      const d = await filesApi.upload(file, activeChannel.id) as { file: FileItem };
      setFiles((prev) => [d.file, ...prev]);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Ошибка загрузки");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const avatarLetter = (name: string) => name?.[0]?.toUpperCase() || "?";
  const avatarColor = (role: string) =>
    role === "admin" ? "bg-[#ed4245]" : role === "teacher" ? "bg-[#3ba55c]" : "bg-[#5865f2]";

  return (
    <div className="min-h-screen bg-[#36393f] text-white flex flex-col">
      {/* Топ-навигация */}
      <nav className="bg-[#2f3136] border-b border-[#202225] px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#5865f2] rounded-full flex items-center justify-center">
            <Icon name="GraduationCap" size={18} className="text-white" />
          </div>
          <span className="font-bold text-white">УчебаЛаб</span>
          {/* Индикатор соединения */}
          <div className="flex items-center gap-1.5 ml-2">
            <div className={`w-2 h-2 rounded-full ${online ? "bg-[#3ba55c]" : "bg-[#ed4245]"} animate-pulse`} />
            <span className="text-[#8e9297] text-xs hidden sm:block">{online ? "в сети" : "нет связи"}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold ${avatarColor(user?.role || "")}`}>
              {avatarLetter(user?.username || "")}
            </div>
            <div>
              <div className="text-white text-sm font-medium leading-none">{user?.username}</div>
              <div className="text-[#b9bbbe] text-xs">{user?.role === "admin" ? "Администратор" : user?.role === "teacher" ? "Преподаватель" : "Студент"}</div>
            </div>
          </div>
          {user?.role === "admin" && (
            <Button onClick={onOpenAdmin} size="sm" className="bg-[#ed4245] hover:bg-[#c03537] text-white text-xs px-3">
              <Icon name="Settings" size={14} className="mr-1" />
              Админ
            </Button>
          )}
          <Button onClick={logout} variant="ghost" size="sm" className="text-[#b9bbbe] hover:text-white hover:bg-[#40444b] p-2">
            <Icon name="LogOut" size={16} />
          </Button>
        </div>
      </nav>

      <div className="flex flex-1 overflow-hidden">
        {/* Боковая панель каналов */}
        <div className={`${mobileSidebar ? "flex" : "hidden"} sm:flex w-60 bg-[#2f3136] flex-col flex-shrink-0`}>
          <div className="p-3 border-b border-[#202225]">
            <div className="text-[#8e9297] text-xs font-semibold uppercase tracking-wide px-2 py-1">Каналы</div>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {channels.map((ch) => (
              <button
                key={ch.id}
                onClick={() => { setActiveChannel(ch); setMobileSidebar(false); setActiveTab("chat"); }}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm mb-0.5 transition-colors text-left ${
                  activeChannel?.id === ch.id
                    ? "bg-[#393c43] text-white"
                    : "text-[#8e9297] hover:text-[#dcddde] hover:bg-[#393c43]"
                }`}
              >
                <Icon name="Hash" size={16} />
                {ch.name}
              </button>
            ))}
          </div>
          {/* Пользователь */}
          <div className="p-3 bg-[#292b2f] flex items-center gap-2 border-t border-[#202225]">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0 ${avatarColor(user?.role || "")}`}>
              {avatarLetter(user?.username || "")}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-white text-sm font-medium truncate">{user?.username}</div>
              <div className="text-[#b9bbbe] text-xs truncate">
                {user?.role === "admin" ? "Администратор" : user?.role === "teacher" ? "Преподаватель" : "Студент"}
              </div>
            </div>
          </div>
        </div>

        {/* Основная область */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Заголовок канала */}
          <div className="h-12 bg-[#36393f] border-b border-[#202225] flex items-center px-4 gap-3 flex-shrink-0">
            <button onClick={() => setMobileSidebar(!mobileSidebar)} className="sm:hidden text-[#8e9297] hover:text-white">
              <Icon name="Menu" size={20} />
            </button>
            <Icon name="Hash" size={18} className="text-[#8e9297]" />
            <span className="font-semibold text-white">{activeChannel?.name || "Выберите канал"}</span>
            <div className="w-px h-5 bg-[#40444b] mx-1" />
            <span className="text-[#8e9297] text-sm hidden sm:block truncate">{activeChannel?.description}</span>
            <div className="ml-auto flex items-center gap-1">
              <button
                onClick={() => setActiveTab("chat")}
                className={`flex items-center gap-1.5 px-3 py-1 rounded text-sm font-medium transition-colors ${activeTab === "chat" ? "bg-[#40444b] text-white" : "text-[#8e9297] hover:text-white"}`}
              >
                <Icon name="MessageSquare" size={14} />
                <span className="hidden sm:inline">Чат</span>
              </button>
              <button
                onClick={() => setActiveTab("files")}
                className={`flex items-center gap-1.5 px-3 py-1 rounded text-sm font-medium transition-colors ${activeTab === "files" ? "bg-[#40444b] text-white" : "text-[#8e9297] hover:text-white"}`}
              >
                <Icon name="FolderOpen" size={14} />
                <span className="hidden sm:inline">Файлы</span>
              </button>
            </div>
          </div>

          {/* Вкладка: Чат */}
          {activeTab === "chat" && (
            <>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.length === 0 && (
                  <div className="text-center text-[#72767d] text-sm py-12">
                    <Icon name="MessageSquare" size={40} className="mx-auto mb-3 opacity-30" />
                    <p>Сообщений пока нет. Напишите первым!</p>
                  </div>
                )}
                {messages.map((msg) => (
                  <div key={msg.id} className="flex gap-3 group">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0 ${avatarColor(msg.role)}`}>
                      {avatarLetter(msg.username)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 mb-0.5">
                        <span className={`font-medium text-sm ${ROLE_COLORS[msg.role] || "text-white"}`}>{msg.username}</span>
                        {ROLE_LABELS[msg.role] && (
                          <span className={`text-xs px-1 rounded font-semibold ${msg.role === "admin" ? "bg-[#ed4245]/20 text-[#ed4245]" : "bg-[#3ba55c]/20 text-[#3ba55c]"}`}>
                            {ROLE_LABELS[msg.role]}
                          </span>
                        )}
                        <span className="text-[#72767d] text-xs">{formatDate(msg.created_at)}</span>
                      </div>
                      <p className="text-[#dcddde] text-sm leading-relaxed break-words">{msg.content}</p>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
              <form onSubmit={sendMessage} className="p-4 flex-shrink-0">
                <div className="bg-[#40444b] rounded-lg flex items-center gap-2 px-4 py-2">
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    className="flex-1 bg-transparent text-white placeholder-[#72767d] text-sm outline-none"
                    placeholder={activeChannel ? `Сообщение #${activeChannel.name}` : "Выберите канал"}
                    disabled={!activeChannel || sending}
                  />
                  <button type="submit" disabled={!input.trim() || !activeChannel || sending} className="text-[#b9bbbe] hover:text-white disabled:opacity-40 transition-colors">
                    <Icon name="Send" size={18} />
                  </button>
                </div>
              </form>
            </>
          )}

          {/* Вкладка: Файлы */}
          {activeTab === "files" && (
            <div className="flex-1 overflow-y-auto p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-white font-semibold">Файлы канала</h3>
                {(user?.role === "teacher" || user?.role === "admin") && (
                  <>
                    <input ref={fileInputRef} type="file" onChange={handleFileUpload} className="hidden" />
                    <Button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading || !activeChannel}
                      size="sm"
                      className="bg-[#5865f2] hover:bg-[#4752c4] text-white"
                    >
                      <Icon name="Upload" size={14} className="mr-1.5" />
                      {uploading ? "Загрузка..." : "Загрузить файл"}
                    </Button>
                  </>
                )}
              </div>

              {files.length === 0 && (
                <div className="text-center text-[#72767d] text-sm py-12">
                  <Icon name="FolderOpen" size={40} className="mx-auto mb-3 opacity-30" />
                  <p>Файлов пока нет</p>
                  {user?.role === "student" && <p className="text-xs mt-1">Преподаватель ещё не загрузил материалы</p>}
                </div>
              )}

              <div className="space-y-2">
                {files.map((file) => (
                  <div key={file.id} className="bg-[#2f3136] border border-[#202225] rounded-lg p-3 flex items-center gap-3 hover:bg-[#36393f] transition-colors">
                    <div className="w-10 h-10 bg-[#5865f2]/20 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Icon
                        name={file.mime_type?.includes("pdf") ? "FileText" : file.mime_type?.includes("image") ? "Image" : "File"}
                        size={20}
                        className="text-[#5865f2]"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-white text-sm font-medium truncate">{file.name}</div>
                      <div className="text-[#b9bbbe] text-xs">
                        {formatFileSize(file.size)} · {file.uploaded_by} · {formatDate(file.created_at)}
                      </div>
                    </div>
                    <a
                      href={file.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded hover:bg-[#40444b] text-[#b9bbbe] hover:text-white transition-colors"
                    >
                      <Icon name="Download" size={16} />
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
