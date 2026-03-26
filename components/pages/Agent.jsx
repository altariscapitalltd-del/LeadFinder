"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Download, Loader2, MessageSquarePlus, Send, Sparkles } from "lucide-react";
import { Btn, Card } from "../ui";

const STARTERS = [
  "Find my highest scoring contacts and summarize them.",
  "Queue a crypto discovery run and collect business emails.",
  "Create a new outreach template for AI agencies.",
  "Show me active campaigns and what needs attention.",
];

function MessageBubble({ message }) {
  const roleLabel = message.role === "assistant" ? "LeadForge Agent" : message.role === "tool" ? `Tool: ${message.tool_name || "action"}` : "You";
  return (
    <div className={`agent-message-row ${message.role === "user" ? "user" : "assistant"}`}>
      <div className={`agent-bubble-card ${message.role === "user" ? "user" : message.role === "tool" ? "tool" : "assistant"}`}>
        <div className="agent-role">{roleLabel}</div>
        <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.75 }}>{message.content}</div>
      </div>
    </div>
  );
}

export default function Agent({ notify }) {
  const [threads, setThreads] = useState([]);
  const [activeThreadId, setActiveThreadId] = useState(null);
  const [thread, setThread] = useState(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [mobileThreadsOpen, setMobileThreadsOpen] = useState(false);
  const messagesRef = useRef(null);

  async function loadThreads(targetThreadId) {
    const res = await fetch("/api/agent");
    const data = await res.json();
    const nextThreads = data.threads || [];
    setThreads(nextThreads);
    const selectedId = targetThreadId || activeThreadId || nextThreads[0]?.id || null;
    if (selectedId) {
      await loadThread(selectedId);
    } else {
      setThread(null);
      setActiveThreadId(null);
    }
  }

  async function loadThread(id) {
    const res = await fetch(`/api/agent?threadId=${id}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load thread");
    setThread(data.thread);
    setActiveThreadId(data.thread.id);
    setMobileThreadsOpen(false);
  }

  useEffect(() => {
    loadThreads().catch((error) => notify?.(error.message || "Failed to load agent"));
  }, [notify]);

  useEffect(() => {
    function handleInstallPrompt(event) {
      event.preventDefault();
      setInstallPrompt(event);
    }

    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
  }, []);

  useEffect(() => {
    if (!messagesRef.current) return;
    messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
  }, [thread, loading]);

  async function sendMessage(messageText) {
    const content = String(messageText || input).trim();
    if (!content || loading) return;
    setLoading(true);
    try {
      const optimistic = thread
        ? { ...thread, messages: [...thread.messages, { id: `temp-${Date.now()}`, role: "user", content }] }
        : { id: activeThreadId || "new", messages: [{ id: `temp-${Date.now()}`, role: "user", content }] };
      setThread(optimistic);
      setInput("");

      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: activeThreadId, message: content }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Agent request failed");
      setThread(data.thread);
      setActiveThreadId(data.thread.id);
      await loadThreads(data.thread.id);
    } catch (error) {
      notify?.(error.message || "Agent request failed");
    } finally {
      setLoading(false);
    }
  }

  const messages = useMemo(() => thread?.messages || [], [thread]);
  const agentReady = useMemo(() => threads.length > 0 || messages.length > 0, [threads, messages]);

  return (
    <div className="page-shell">
      <div className="agent-stage">
        <aside className={`agent-panel ${mobileThreadsOpen ? "open" : ""}`}>
          <div className="agent-panel-header">
            <div>
              <div className="eyebrow">Conversations</div>
              <div className="agent-panel-title">LeadForge Agent</div>
            </div>
            <Btn size="icon" onClick={() => { setThread(null); setActiveThreadId(null); }}>
              <MessageSquarePlus size={14} />
            </Btn>
          </div>

          <div className="agent-search">Search chats coming soon</div>

          <div className="agent-thread-list">
            {threads.length === 0 && <div className="muted-small">No conversations yet. Start with a task below.</div>}
            {threads.map((item) => (
              <button
                key={item.id}
                className="agent-thread-button"
                data-active={item.id === activeThreadId}
                onClick={() => loadThread(item.id).catch((error) => notify?.(error.message))}
              >
                <div style={{ fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>{item.title || `Thread ${item.id}`}</div>
                <div className="muted-small">{item.last_message?.slice(0, 78) || "No messages yet"}</div>
              </button>
            ))}
          </div>

          <Card className="agent-side-card">
            <div className="eyebrow">Workspace Mode</div>
            <div style={{ fontWeight: 700, fontSize: 16, margin: "8px 0 6px" }}>Operator-ready agent</div>
            <div className="muted-small" style={{ lineHeight: 1.7 }}>
              Ask for scrapes, templates, campaign checks, or contact summaries. If AI is not configured, the app still falls back to direct actions where it can.
            </div>
          </Card>
        </aside>

        <div className="agent-chat-shell">
          <div className="agent-chat-topbar">
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button type="button" className="icon-btn mobile-only" onClick={() => setMobileThreadsOpen((value) => !value)}>
                <Bot size={16} />
              </button>
              <div className="agent-avatar">
                <Bot size={18} />
              </div>
              <div>
                <div style={{ fontWeight: 700 }}>LeadForge Agent</div>
                <div className="muted-small">Chat, act, and run work across the app</div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {installPrompt && (
                <Btn
                  variant="ghost"
                  onClick={async () => {
                    await installPrompt.prompt();
                    setInstallPrompt(null);
                  }}
                >
                  <Download size={14} />
                  Install
                </Btn>
              )}
              <Btn variant="primary" onClick={() => sendMessage("Show me a summary of the app right now.")}>
                <Sparkles size={14} />
                Summarize App
              </Btn>
            </div>
          </div>

          <div className="agent-chat-body" ref={messagesRef}>
            {!agentReady && (
              <div className="agent-welcome">
                <div className="agent-orb large">
                  <Bot size={28} />
                </div>
                <div className="agent-empty-title">Give the agent a real task</div>
                <div className="muted-small" style={{ maxWidth: 620, lineHeight: 1.8 }}>
                  The goal here is a calmer, ChatGPT-style workspace. You type naturally, the system responds clearly, and the app can act on your data instead of feeling like a dead form.
                </div>
                <div className="starter-grid">
                  {STARTERS.map((starter) => (
                    <button key={starter} className="starter-card" onClick={() => sendMessage(starter)}>
                      {starter}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}

            {loading && (
              <div className="agent-message-row assistant">
                <div className="agent-bubble-card assistant">
                  <div className="agent-role">LeadForge Agent</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Loader2 size={16} className="animate-spin" />
                    Working through that now...
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="agent-composer-wrap">
            <div className="agent-chip-row">
              <button type="button" className="mini-chip" onClick={() => sendMessage("List my top 10 contacts by score.")}>
                Top contacts
              </button>
              <button type="button" className="mini-chip" onClick={() => sendMessage("Start a discovery run for crypto companies in the United States.")}>
                Run discovery
              </button>
              <button type="button" className="mini-chip" onClick={() => sendMessage("Show me campaign health.")}>
                Campaign health
              </button>
            </div>

            <div className="agent-composer">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder="Message LeadForge Agent"
              />
              <Btn variant="primary" onClick={() => sendMessage()} disabled={loading}>
                {loading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                {loading ? "Working" : "Send"}
              </Btn>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
