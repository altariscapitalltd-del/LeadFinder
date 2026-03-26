"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, AlertCircle, ArrowUpRight, MessageSquare, Sparkles, Users, Zap } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, BarChart, Bar } from "recharts";
import { Btn, Card, CardTitle, Spinner, Surface } from "../ui";

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "rgba(10,10,10,0.96)", border: "1px solid var(--border)", borderRadius: 14, padding: "10px 12px", fontSize: 12 }}>
      <div style={{ color: "var(--text-muted)", marginBottom: 6 }}>{label}</div>
      {payload.map((item) => (
        <div key={item.name} style={{ color: item.color || "var(--text-secondary)" }}>
          {item.name}: <strong>{item.value}</strong>
        </div>
      ))}
    </div>
  );
}

const CHECKLIST = [
  { title: "Connect AI routing", desc: "Add one working provider in Settings so chat, templates, and scoring become fully active." },
  { title: "Add SMTP delivery", desc: "Save and test your sender account so campaigns can actually send without guesswork." },
  { title: "Import or discover leads", desc: "Use Leads import or Discovery jobs to populate the workspace with real contacts." },
  { title: "Create your first template", desc: "Draft one email template before running campaigns so outreach has reusable copy." },
];

export default function Dashboard({ notify }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch("/api/analytics");
        const text = await res.text();
        const data = text ? JSON.parse(text) : null;
        if (!res.ok) throw new Error(data?.error || `Failed to load analytics (${res.status})`);
        if (mounted) setStats(data);
      } catch (error) {
        if (mounted) {
          setStats(null);
          notify?.(error.message || "Failed to load analytics");
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [notify]);

  const statCards = useMemo(
    () => [
      {
        label: "Total Contacts",
        value: stats?.totalContacts ?? 0,
        accent: "#60a5fa",
        icon: <Users size={16} />,
      },
      {
        label: "Emails Sent",
        value: stats?.totalSent ?? 0,
        accent: "#a78bfa",
        icon: <Zap size={16} />,
      },
      {
        label: "Reply Rate",
        value: `${stats?.replyRate ?? 0}%`,
        accent: "#4ade80",
        icon: <MessageSquare size={16} />,
      },
      {
        label: "Bounce Rate",
        value: `${stats?.bounceRate ?? 0}%`,
        accent: "#fb7185",
        icon: <AlertCircle size={16} />,
      },
    ],
    [stats]
  );

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 84 }}>
        <Spinner />
      </div>
    );
  }

  const isNew = !stats || Number(stats.totalContacts || 0) === 0;

  return (
    <div className="page-shell">
      <div className="page-hero">
        <div>
          <div className="eyebrow">Daily Overview</div>
          <h1 className="page-title">Command Center</h1>
          <p className="page-subtitle">
            Track delivery, replies, and pipeline health from one clean view. This layout is tuned to stay readable on desktop while still feeling calm and usable on iPhone.
          </p>
        </div>
        <div className="responsive-three" style={{ minWidth: "min(100%, 420px)" }}>
          <div className="hero-stat">
            <span className="eyebrow">Today</span>
            <strong>{stats?.newToday ?? 0}</strong>
            <span className="muted-small">new contacts added</span>
          </div>
          <div className="hero-stat">
            <span className="eyebrow">Momentum</span>
            <strong>{stats?.growth?.length || 0}</strong>
            <span className="muted-small">active days in trendline</span>
          </div>
          <div className="hero-stat">
            <span className="eyebrow">Campaigns</span>
            <strong>{stats?.campaigns?.length || 0}</strong>
            <span className="muted-small">recent campaigns tracked</span>
          </div>
        </div>
      </div>

      <div className="stats-grid">
        {statCards.map((item) => (
          <Surface key={item.label} className="stat-surface">
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div className="eyebrow" style={{ marginBottom: 10 }}>
                  {item.label}
                </div>
                <div className="stat-number">{item.value}</div>
              </div>
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 14,
                  display: "grid",
                  placeItems: "center",
                  background: `${item.accent}20`,
                  color: item.accent,
                }}
              >
                {item.icon}
              </div>
            </div>
          </Surface>
        ))}
      </div>

      {isNew ? (
        <div className="dashboard-grid">
          <Card>
            <CardTitle icon={<Sparkles size={16} />}>Launch Checklist</CardTitle>
            <div className="insight-stack">
              {CHECKLIST.map((item, index) => (
                <div key={item.title} className="insight-card" style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 12,
                      background: "rgba(154,230,255,0.12)",
                      color: "var(--accent)",
                      display: "grid",
                      placeItems: "center",
                      fontFamily: "var(--font-mono)",
                      fontSize: 12,
                      flexShrink: 0,
                    }}
                  >
                    {index + 1}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>{item.title}</div>
                    <div className="muted-small" style={{ lineHeight: 1.7 }}>
                      {item.desc}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardTitle icon={<ArrowUpRight size={16} />} color="var(--accent-3)">
              Best Next Moves
            </CardTitle>
            <div className="insight-stack">
              <div className="insight-card">
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Start with Settings</div>
                <div className="muted-small">Most broken-feeling flows begin with a missing provider or SMTP account. This is the fastest stability win.</div>
              </div>
              <div className="insight-card">
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Use Discovery for fresh data</div>
                <div className="muted-small">Queue a keyword scrape and let the UI stream back progress instead of guessing whether the system is working.</div>
              </div>
              <Btn variant="primary">
                <Sparkles size={14} />
                Open Discovery
              </Btn>
            </div>
          </Card>
        </div>
      ) : (
        <div className="dashboard-grid">
          <Card>
            <CardTitle icon={<Activity size={16} />}>Contact Growth</CardTitle>
            <div style={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats?.growth || []}>
                  <defs>
                    <linearGradient id="dashboard-growth" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#9ae6ff" stopOpacity={0.32} />
                      <stop offset="100%" stopColor="#9ae6ff" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis dataKey="d" tick={{ fill: "#8f959e", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#8f959e", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="contacts" name="Contacts" stroke="#9ae6ff" fill="url(#dashboard-growth)" strokeWidth={2.2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card>
            <CardTitle icon={<Users size={16} />} color="var(--accent-2)">
              Status Snapshot
            </CardTitle>
            <div style={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats?.byStatus || []} layout="vertical">
                  <CartesianGrid stroke="rgba(255,255,255,0.06)" horizontal={false} />
                  <XAxis type="number" tick={{ fill: "#8f959e", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis dataKey="status" type="category" tick={{ fill: "#d1d5db", fontSize: 11 }} axisLine={false} tickLine={false} width={84} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="count" name="Contacts" fill="#7c8cff" radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
