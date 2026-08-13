"use client";

import { useState, useRef, useEffect } from "react";
import {
  Bot,
  Send,
  X,
  Loader2,
  Sparkles,
  Maximize2,
  Minimize2,
  Trash2,
  Paperclip
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  imageData?: string;
  timestamp: string;
}

export function AiChatFloating() {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Halo! Saya **INSAi Trading Mentor & Copilot**. Ada yang bisa saya bantu terkait analisa XAUUSD, sinyal trading, strategi SMC, atau status sistem?",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [inputMessage, setInputMessage] = useState("");
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedImageMime, setSelectedImageMime] = useState<string>("image/png");
  const [isLoading, setIsLoading] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert("Ukuran file gambar maksimal 5MB");
      return;
    }

    setSelectedImageMime(file.type || "image/png");
    const reader = new FileReader();
    reader.onload = () => {
      setSelectedImage(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSendMessage = async (textToSend?: string) => {
    const prompt = textToSend || inputMessage;
    if ((!prompt.trim() && !selectedImage) || isLoading) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: prompt,
      imageData: selectedImage || undefined,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputMessage("");
    const imagePayload = selectedImage;
    const mimePayload = selectedImageMime;
    setSelectedImage(null);
    setIsLoading(true);

    try {
      // Map history for API
      const history = messages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        content: m.content
      }));

      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: prompt,
          history,
          imageData: imagePayload,
          imageMimeType: mimePayload
        })
      });

      const data = await res.json();

      if (res.ok && data.success) {
        const aiMsg: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: data.reply,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        setMessages((prev) => [...prev, aiMsg]);
      } else {
        const errorMsg: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: data.reply || "Maaf, gagal mendapatkan respon AI. Pastikan server dan GEMINI_API_KEY berjalan.",
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        setMessages((prev) => [...prev, errorMsg]);
      }
    } catch (err) {
      console.error(err);
      const errorMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "Gagal terhubung ke AI Service. Periksa koneksi internet Anda.",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickPrompt = (prompt: string) => {
    handleSendMessage(prompt);
  };

  const clearChat = () => {
    setMessages([
      {
        id: "welcome",
        role: "assistant",
        content: "Percakapan dibersihkan. Silakan tanyakan hal lain seputar XAUUSD, analisa chart, atau platform INSAi.",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);
  };

  return (
    <>
      {/* Floating Trigger Button anchored bottom-right */}
      <div className="fixed bottom-16 right-4 sm:bottom-6 sm:right-6 z-50">
        {!isOpen && (
          <motion.button
            onClick={() => setIsOpen(true)}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="group relative flex items-center gap-2.5 px-3.5 py-2.5 rounded-full bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white font-bold text-[11px] shadow-[0_8px_25px_rgba(37,99,235,0.4)] border border-blue-400/40 hover:border-white/60 transition-all cursor-pointer overflow-hidden"
          >
            <div className="absolute inset-0 bg-white/10 group-hover:bg-white/20 transition-all"></div>
            <div className="relative z-10 p-1 rounded-full bg-white/20 backdrop-blur-sm">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <span className="relative z-10 font-mono tracking-wide uppercase">AI Chat Mentor</span>
            <span className="relative z-10 flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
            </span>
          </motion.button>
        )}
      </div>

      {/* Floating AI Chat Window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className={`fixed z-50 shadow-[0_20px_50px_rgba(0,0,0,0.8)] border border-blue-500/30 bg-zinc-950/95 backdrop-blur-2xl rounded-2xl flex flex-col overflow-hidden transition-all ${
              isExpanded
                ? "inset-2 sm:inset-6"
                : "bottom-16 right-2 left-2 sm:left-auto sm:right-6 sm:bottom-6 sm:w-[420px] h-[580px] max-h-[85vh]"
            }`}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-zinc-900 via-blue-950/40 to-zinc-900 border-b border-white/10 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-xl bg-blue-500/20 border border-blue-400/30 text-blue-400 shadow-sm">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-[12px] font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                    INSAi AI Mentor
                    <span className="text-[9px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">LIVE SNAPSHOT</span>
                  </h3>
                  <p className="text-[10px] text-zinc-400 font-mono">Gemini 3.6 Flash • Jujur & Presisi</p>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={clearChat}
                  title="Clear Chat History"
                  className="p-1.5 text-zinc-400 hover:text-rose-400 hover:bg-white/5 rounded-lg transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setIsExpanded(!isExpanded)}
                  title={isExpanded ? "Minimize Window" : "Expand Window"}
                  className="p-1.5 text-zinc-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                >
                  {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  title="Close AI Chat"
                  className="p-1.5 text-zinc-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Quick Prompt Bar */}
            <div className="flex items-center gap-1.5 px-3 py-2 bg-zinc-900/60 border-b border-white/5 overflow-x-auto custom-scrollbar shrink-0 text-[10px] font-mono">
              <span className="text-zinc-500 font-bold shrink-0">Tanya cepat:</span>
              <button
                onClick={() => handleQuickPrompt("Berapa harga XAUUSD & bias harian sekarang?")}
                className="px-2 py-1 rounded bg-white/5 hover:bg-blue-500/20 text-zinc-300 hover:text-blue-300 border border-white/10 shrink-0 transition-colors"
              >
                Harga XAUUSD Live
              </button>
              <button
                onClick={() => handleQuickPrompt("Jelaskan 5 strategi trading di INSAi")}
                className="px-2 py-1 rounded bg-white/5 hover:bg-blue-500/20 text-zinc-300 hover:text-blue-300 border border-white/10 shrink-0 transition-colors"
              >
                Strategi INSAi
              </button>
              <button
                onClick={() => handleQuickPrompt("Bagaimana status MCP & konektor data saat ini?")}
                className="px-2 py-1 rounded bg-white/5 hover:bg-blue-500/20 text-zinc-300 hover:text-blue-300 border border-white/10 shrink-0 transition-colors"
              >
                Status MCP
              </button>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex gap-2.5 ${
                    msg.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  {msg.role === "assistant" && (
                    <div className="p-1.5 rounded-xl bg-blue-600/20 border border-blue-500/30 text-blue-400 shrink-0 h-fit mt-0.5">
                      <Bot className="w-3.5 h-3.5" />
                    </div>
                  )}

                  <div
                    className={`max-w-[85%] rounded-2xl p-3 text-[11px] leading-relaxed shadow-sm font-sans ${
                      msg.role === "user"
                        ? "bg-blue-600 text-white rounded-tr-none"
                        : "bg-zinc-900 border border-zinc-800 text-zinc-200 rounded-tl-none"
                    }`}
                  >
                    {msg.imageData && (
                      <div className="mb-2 rounded-lg overflow-hidden border border-white/20">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={msg.imageData}
                          alt="User uploaded chart"
                          className="max-h-48 w-full object-cover"
                        />
                      </div>
                    )}
                    <div className="whitespace-pre-wrap font-sans break-words">
                      {msg.content}
                    </div>
                    <span className="block text-[9px] opacity-60 font-mono mt-1 text-right">
                      {msg.timestamp}
                    </span>
                  </div>
                </div>
              ))}

              {isLoading && (
                <div className="flex gap-2.5 items-center text-zinc-400 text-[11px]">
                  <div className="p-1.5 rounded-xl bg-blue-600/20 border border-blue-500/30 text-blue-400">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  </div>
                  <span className="font-mono text-[10px] animate-pulse">INSAi AI sedang menganalisa data...</span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Selected Image Preview Bar */}
            {selectedImage && (
              <div className="px-3 py-1.5 bg-zinc-900 border-t border-white/10 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={selectedImage} alt="Preview" className="w-8 h-8 rounded object-cover border border-white/20" />
                  <span className="text-[10px] text-zinc-300 font-mono">Gambar siap dianalisa AI</span>
                </div>
                <button
                  onClick={() => setSelectedImage(null)}
                  className="text-zinc-400 hover:text-rose-400 p-1"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Input Bar */}
            <div className="p-2.5 bg-zinc-900/90 border-t border-white/10 shrink-0">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendMessage();
                }}
                className="flex items-center gap-2"
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/*"
                  onChange={handleImageSelect}
                  className="hidden"
                />

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  title="Kirim Foto / Chart untuk dianalisa AI"
                  className="p-2 text-zinc-400 hover:text-blue-400 hover:bg-white/5 rounded-xl border border-white/10 transition-colors shrink-0"
                >
                  <Paperclip className="w-4 h-4" />
                </button>

                <input
                  type="text"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  placeholder="Tanya AI mentor / analisa foto..."
                  className="flex-1 bg-black/50 border border-white/10 focus:border-blue-500/50 rounded-xl px-3 py-2 text-[11px] text-white placeholder-zinc-500 outline-none font-mono"
                  disabled={isLoading}
                />

                <button
                  type="submit"
                  disabled={(!inputMessage.trim() && !selectedImage) || isLoading}
                  className="p-2 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white rounded-xl transition-all shrink-0 font-bold shadow-md"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
