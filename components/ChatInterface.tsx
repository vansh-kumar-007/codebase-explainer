// components/ChatInterface.tsx
// A chat interface for asking questions about the repo.
// Maintains conversation history so follow-up questions work.

"use client";

import { useState, useRef, useEffect } from "react";
import { RepoFile, ChatMessage } from "@/lib/types";

interface Props {
  files: RepoFile[];
  repoName: string;
}

export default function ChatInterface({ files, repoName }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage() {
    if (!input.trim() || loading) return;

    const userMessage: ChatMessage = {
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };

    // Add user message immediately so UI feels responsive
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: userMessage.content,
          files,
          history: messages,
          repoName,
        }),
      });

      const data = await res.json();

      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: data.success
          ? data.answer
          : `Error: ${data.error}`,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);

    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Something went wrong. Try again.",
          timestamp: new Date(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  // Suggested starter questions
  const suggestions = [
    "What does this repo do?",
    "What is the entry point?",
    "How is routing handled?",
    "What are the main dependencies?",
  ];

  return (
    <div className="flex flex-col h-full">

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto space-y-3 mb-3">

        {/* Empty state with suggestions */}
        {messages.length === 0 && (
          <div className="space-y-2">
            <p className="text-gray-500 text-xs mb-3">
              Ask anything about this codebase
            </p>
            {suggestions.map((s) => (
              <button
                key={s}
                onClick={() => setInput(s)}
                className="block w-full text-left text-xs text-gray-400
                           bg-gray-800 hover:bg-gray-700 rounded-lg px-3 py-2
                           transition-colors border border-gray-700
                           hover:border-gray-600"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Message bubbles */}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed
                ${msg.role === "user"
                  ? "bg-yellow-400 text-black"
                  : "bg-gray-800 text-gray-200 border border-gray-700"
                }`}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {/* Loading indicator */}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-800 border border-gray-700 rounded-xl
                            px-3 py-2 flex gap-1">
              <span className="w-1.5 h-1.5 bg-gray-400 rounded-full
                               animate-bounce [animation-delay:0ms]" />
              <span className="w-1.5 h-1.5 bg-gray-400 rounded-full
                               animate-bounce [animation-delay:150ms]" />
              <span className="w-1.5 h-1.5 bg-gray-400 rounded-full
                               animate-bounce [animation-delay:300ms]" />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          placeholder="Ask about this codebase..."
          disabled={loading}
          className="flex-1 bg-gray-900 border border-gray-700 rounded-lg
                     px-3 py-2 text-white text-xs placeholder-gray-500
                     focus:outline-none focus:border-yellow-400
                     transition-colors disabled:opacity-50"
        />
        <button
          onClick={sendMessage}
          disabled={loading || !input.trim()}
          className="bg-yellow-400 hover:bg-yellow-300 disabled:bg-gray-700
                     text-black disabled:text-gray-500 font-bold px-3 py-2
                     rounded-lg transition-colors text-xs
                     disabled:cursor-not-allowed"
        >
          →
        </button>
      </div>
    </div>
  );
}