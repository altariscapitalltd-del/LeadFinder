"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bot,
  Globe,
  LayoutDashboard,
  Menu,
  Search,
  Settings,
  Sparkles,
  Users,
  X,
  Zap,
} from "lucide-react";
import Dashboard from "./pages/Dashboard";
import Leads from "./pages/Leads";
import SettingsPage from "./pages/SettingsPage";
import Scraping from "./pages/Scraping";
import Agent from "./pages/Agent";
import Outreach from "./pages/Outreach";
import { Toast } from "./ui";

const NAV = [
  { key: "dashboard", label: "Command", icon: LayoutDashboard, hint: "Overview and momentum" },
  { key: "agent", label: "Agent", icon: Bot, hint: "Chat and act across the app" },
  { key: "scraping", label: "Discovery", icon: Globe, hint: "Keyword and source harvesting" },
  { key: "leads", label: "Leads", icon: Users, hint: "Contacts and enrichment" },
  { key: "outreach", label: "Outreach", icon: Zap, hint: "Templates, campaigns, automation" },
  { key: "settings", label: "Settings", icon: Settings, hint: "Providers and delivery" },
];

const MOBILE_NAV = [
  { key: "agent", label: "Chat", icon: Bot },
  { key: "scraping", label: "Discover", icon: Sparkles },
  { key: "leads", label: "Data", icon: Users },
  { key: "outreach", label: "Outreach", icon: Zap },
  { key: "settings", label: "Settings", icon: Settings },
];

const QUICK_SPACES = [
  "Vercel Environment Setup",
  "Email Scraper Testing Resources",
  "Battery Calculation 12V 50Ah",
];

const TITLES = {
  dashboard: "Command Center",
  agent: "App Agent",
  scraping: "Discovery Engine",
  leads: "Lead Vault",
  outreach: "Outreach Studio",
  settings: "Settings",
};

export default function Shell() {
  const [page, setPage] = useState("dashboard");
  const [toast, setToast] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [stats, setStats] = useState(null);

  const notify = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3200);
  }, []);

  useEffect(() => {
    fetch("/api/analytics")
      .then((r) => r.json())
      .then((data) => setStats(data))
      .catch(() => {});
  }, []);

  const pages = {
    dashboard: <Dashboard notify={notify} />,
    agent: <Agent notify={notify} />,
    leads: <Leads notify={notify} />,
    scraping: <Scraping notify={notify} />,
    outreach: <Outreach notify={notify} />,
    settings: <SettingsPage notify={notify} />,
  };

  const quickStats = useMemo(() => ([
    { label: "Contacts", value: stats?.totalContacts ?? 0 },
    { label: "Sent", value: stats?.totalSent ?? 0 },
    { label: "Reply Rate", value: `${stats?.replyRate ?? 0}%` },
  ]), [stats]);

  return (
    <div className="app-shell">
      <div className={`app-backdrop ${sidebarOpen ? "open" : ""}`} onClick={() => setSidebarOpen(false)} />
      <aside className={`app-sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="brand-block">
          <div className="brand-mark">LF</div>
          <div>
            <div className="brand-name">LeadForge</div>
            <div className="brand-sub">AI-native growth OS</div>
          </div>
        </div>

        <div className="sidebar-panel" style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)", borderRadius: 18, padding: "11px 14px" }}>
            <Search size={14} color="var(--text-muted)" />
            <input placeholder="Search workspace" style={{ background: "transparent", border: "none", outline: "none", color: "var(--text-primary)", width: "100%" }} />
          </div>
        </div>

        <div className="sidebar-panel">
          <div className="eyebrow">Navigation</div>
          <nav className="nav-list">
            {NAV.map((item) => {
              const Icon = item.icon;
              const active = item.key === page;
              return (
                <button
                  key={item.key}
                  className="nav-item"
                  data-active={active}
                  onClick={() => {
                    setPage(item.key);
                    setSidebarOpen(false);
                  }}
                >
                  <div className="nav-icon"><Icon size={15} /></div>
                  <div>
                    <div className="nav-label">{item.label}</div>
                    <div className="nav-hint">{item.hint}</div>
                  </div>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="sidebar-callout">
          <div className="eyebrow">Recent Spaces</div>
          <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
            {QUICK_SPACES.map((item) => (
              <div key={item} style={{ fontSize: 12, color: "var(--text-secondary)", padding: "10px 0", borderBottom: "1px solid var(--border)" }}>{item}</div>
            ))}
          </div>
        </div>

        <div className="sidebar-callout">
          <div className="eyebrow">Mission Pulse</div>
          {quickStats.map((item) => (
            <div key={item.label} className="pulse-row">
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>
      </aside>

      <main className="app-main">
        <header className="topbar">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button className="icon-btn mobile-only" onClick={() => setSidebarOpen((v) => !v)}>
              {sidebarOpen ? <X size={16} /> : <Menu size={16} />}
            </button>
            <div>
              <div className="eyebrow">LeadForge Workspace</div>
              <div className="topbar-title">{TITLES[page]}</div>
            </div>
          </div>

          <div className="topbar-actions">
            <button className="pill-btn" onClick={() => setPage("agent")}><Sparkles size={14} />Agent</button>
            <button className="pill-btn primary" onClick={() => setPage("scraping")}><Globe size={14} />Run Discovery</button>
          </div>
        </header>

        <section className="content-area">
          {pages[page]}
        </section>

        <nav className="mobile-bottom-nav">
          {MOBILE_NAV.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.key} className="mobile-nav-item" data-active={page === item.key} onClick={() => setPage(item.key)}>
                <Icon size={16} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </main>

      {toast && <Toast msg={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
