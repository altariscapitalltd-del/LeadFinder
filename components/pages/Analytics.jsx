"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, AlertCircle, Globe, MessageSquare, Send, TrendingUp, Users } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardTitle, Spinner, Surface } from "../ui";

const COLORS = ["#9ae6ff", "#7c8cff", "#4ade80", "#fbbf24", "#fb7185", "#22d3ee", "#c084fc", "#94a3b8"];

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "rgba(10,10,10,0.96)", border: "1px solid var(--border)", borderRadius: 14, padding: "10px 12px", fontSize: 12 }}>
      {label && <div style={{ color: "var(--text-muted)", marginBottom: 6 }}>{label}</div>}
      {payload.map((item) => (
        <div key={`${item.name}-${item.value}`} style={{ color: item.color || "var(--text-secondary)" }}>
          {item.name}: <strong>{item.value}</strong>
        </div>
      ))}
    </div>
  );
}

export default function Analytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch("/api/analytics");
        const text = await res.text();
        const payload = text ? JSON.parse(text) : null;
        if (!res.ok) throw new Error(payload?.error || `Failed to load analytics (${res.status})`);
        if (mounted) setData(payload);
      } catch {
        if (mounted) setData(null);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const stats = useMemo(
    () => [
      { label: "Total Contacts", value: data?.totalContacts ?? 0, icon: <Users size={16} />, color: "#9ae6ff" },
      { label: "New Today", value: data?.newToday ?? 0, icon: <Activity size={16} />, color: "#4ade80" },
      { label: "Emails Sent", value: data?.totalSent ?? 0, icon: <Send size={16} />, color: "#7c8cff" },
      { label: "Reply Rate", value: `${data?.replyRate ?? 0}%`, icon: <MessageSquare size={16} />, color: "#22d3ee" },
      { label: "Bounce Rate", value: `${data?.bounceRate ?? 0}%`, icon: <AlertCircle size={16} />, color: "#fb7185" },
    ],
    [data]
  );

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 80 }}>
        <Spinner />
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="page-shell">
      <div className="page-hero">
        <div>
          <div className="eyebrow">Performance Intelligence</div>
          <h1 className="page-title">Analytics</h1>
          <p className="page-subtitle">
            See what the app is doing well, what delivery quality looks like, and where your data is strongest. This view is optimized for quick scanning, not clutter.
          </p>
        </div>
        <div className="responsive-three" style={{ minWidth: "min(100%, 420px)" }}>
          <div className="hero-stat">
            <span className="eyebrow">Growth Days</span>
            <strong>{data.growth?.length || 0}</strong>
            <span className="muted-small">days with tracked contacts</span>
          </div>
          <div className="hero-stat">
            <span className="eyebrow">Countries</span>
            <strong>{data.byCountry?.length || 0}</strong>
            <span className="muted-small">top markets available</span>
          </div>
          <div className="hero-stat">
            <span className="eyebrow">Campaigns</span>
            <strong>{data.campaigns?.length || 0}</strong>
            <span className="muted-small">campaign rows in analysis</span>
          </div>
        </div>
      </div>

      <div className="stats-grid analytics-stats-grid">
        {stats.map((item) => (
          <Surface key={item.label} className="stat-surface">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div className="eyebrow" style={{ marginBottom: 10 }}>
                  {item.label}
                </div>
                <div className="stat-number" style={{ fontSize: "2rem" }}>
                  {item.value}
                </div>
              </div>
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 14,
                  display: "grid",
                  placeItems: "center",
                  background: `${item.color}20`,
                  color: item.color,
                }}
              >
                {item.icon}
              </div>
            </div>
          </Surface>
        ))}
      </div>

      <div className="dashboard-grid">
        <Card>
          <CardTitle icon={<TrendingUp size={16} />}>Contact Growth</CardTitle>
          <div style={{ height: 280 }}>
            {data.growth.length === 0 ? (
              <div className="muted-small" style={{ padding: 40, textAlign: "center" }}>
                No growth data yet. Import contacts or complete discovery jobs to start building analytics.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.growth}>
                  <defs>
                    <linearGradient id="analytics-growth" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#9ae6ff" stopOpacity={0.32} />
                      <stop offset="100%" stopColor="#9ae6ff" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis dataKey="d" tick={{ fill: "#8f959e", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#8f959e", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="contacts" name="Contacts" stroke="#9ae6ff" fill="url(#analytics-growth)" strokeWidth={2.2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card>
          <CardTitle icon={<Activity size={16} />} color="var(--accent-2)">
            Status Mix
          </CardTitle>
          <div style={{ height: 280 }}>
            {data.byStatus.length === 0 ? (
              <div className="muted-small" style={{ padding: 40, textAlign: "center" }}>
                No contacts yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data.byStatus} dataKey="count" nameKey="status" cx="50%" cy="50%" outerRadius={92} innerRadius={52} paddingAngle={4}>
                    {data.byStatus.map((entry, index) => (
                      <Cell key={entry.status || index} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: "#d1d5db" }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>

      <div className="dashboard-grid">
        <Card>
          <CardTitle icon={<Send size={16} />} color="var(--accent-3)">
            Campaign Performance
          </CardTitle>
          <div style={{ height: 260 }}>
            {data.campaigns.length === 0 ? (
              <div className="muted-small" style={{ padding: 40, textAlign: "center" }}>
                No campaigns yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.campaigns.slice(0, 6)} layout="vertical">
                  <CartesianGrid stroke="rgba(255,255,255,0.06)" horizontal={false} />
                  <XAxis type="number" tick={{ fill: "#8f959e", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis dataKey="name" type="category" tick={{ fill: "#d1d5db", fontSize: 11 }} axisLine={false} tickLine={false} width={96} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="sent_count" name="Sent" fill="#7c8cff" radius={[0, 8, 8, 0]} />
                  <Bar dataKey="replied_count" name="Replied" fill="#4ade80" radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card>
          <CardTitle icon={<Globe size={16} />} color="var(--cyan)">
            Top Countries
          </CardTitle>
          <div className="insight-stack">
            {data.byCountry.length === 0 && <div className="muted-small">No country data yet.</div>}
            {data.byCountry.slice(0, 8).map((item, index) => {
              const max = data.byCountry[0]?.count || 1;
              return (
                <div key={`${item.country}-${index}`} className="insight-card">
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, gap: 10 }}>
                    <strong>{item.country || "Unknown"}</strong>
                    <span className="muted-small">{item.count}</span>
                  </div>
                  <div style={{ height: 8, borderRadius: 999, overflow: "hidden", background: "rgba(255,255,255,0.08)" }}>
                    <div style={{ width: `${(item.count / max) * 100}%`, height: "100%", borderRadius: 999, background: COLORS[index % COLORS.length] }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}
