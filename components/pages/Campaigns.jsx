"use client";

import { useEffect, useMemo, useState } from "react";
import { Pause, Play, Plus, Send, Trash2, Zap } from "lucide-react";
import { Badge, Btn, EmptyState, Input, Modal, Select, Spinner, Surface } from "../ui";

export default function Campaigns({ notify, compact = false }) {
  const [campaigns, setCampaigns] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [smtpAccounts, setSmtpAccounts] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [running, setRunning] = useState(null);
  const [form, setForm] = useState({
    name: "",
    template_id: "",
    smtp_account_id: "",
    daily_limit: "100",
    send_delay_min: "30",
    send_delay_max: "90",
    schedule_time: "09:00",
  });

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const [campaignRes, templateRes, smtpRes] = await Promise.all([fetch("/api/campaigns"), fetch("/api/templates"), fetch("/api/smtp")]);
    const campaignData = await campaignRes.json();
    const templateData = await templateRes.json();
    const smtpData = await smtpRes.json();
    setCampaigns(campaignData.campaigns || []);
    setTemplates(templateData.templates || []);
    setSmtpAccounts(smtpData.accounts || []);
  }

  async function createCampaign() {
    if (!form.name || !form.template_id || !form.smtp_account_id) {
      notify("Name, template, and SMTP account are required");
      return;
    }
    const res = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        template_id: Number(form.template_id),
        smtp_account_id: Number(form.smtp_account_id),
        daily_limit: Number(form.daily_limit),
        send_delay_min: Number(form.send_delay_min),
        send_delay_max: Number(form.send_delay_max),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      notify(data.error || "Failed to create campaign");
      return;
    }
    notify("Campaign created");
    setShowModal(false);
    setForm({ name: "", template_id: "", smtp_account_id: "", daily_limit: "100", send_delay_min: "30", send_delay_max: "90", schedule_time: "09:00" });
    load();
  }

  async function setStatus(id, status) {
    await fetch("/api/campaigns", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    notify(`Campaign ${status}`);
    load();
  }

  async function runBatch(id) {
    if (running) return;
    setRunning(id);
    try {
      const res = await fetch("/api/campaigns/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId: id, batchSize: 20 }),
      });
      const data = await res.json();
      if (!res.ok) {
        notify(data.error || "Batch failed");
        return;
      }
      notify(`Batch complete · sent ${data.sent}, skipped ${data.skipped}`);
    } catch (error) {
      notify(error.message || "Batch failed");
    } finally {
      setRunning(null);
      load();
    }
  }

  async function deleteCampaign(id) {
    await fetch(`/api/campaigns?id=${id}`, { method: "DELETE" });
    notify("Campaign deleted");
    load();
  }

  const summary = useMemo(() => {
    const active = campaigns.filter((item) => item.status === "active").length;
    const draft = campaigns.filter((item) => item.status === "draft").length;
    const sent = campaigns.reduce((sum, item) => sum + Number(item.sent_count || 0), 0);
    return [
      { label: "Campaigns", value: campaigns.length },
      { label: "Active", value: active },
      { label: "Draft", value: draft },
      { label: "Emails sent", value: sent },
    ];
  }, [campaigns]);

  return (
    <div className="page-shell">
      {!compact && (
        <div className="page-hero">
          <div>
            <div className="eyebrow">Campaign Control</div>
            <h1 className="page-title">Campaigns</h1>
            <p className="page-subtitle">Launch batches, pause sequences, and keep outbound activity readable at a glance.</p>
          </div>
          <div className="responsive-three" style={{ minWidth: "min(100%, 420px)" }}>
            {summary.slice(0, 3).map((item) => (
              <div key={item.label} className="hero-stat">
                <span className="eyebrow">{item.label}</span>
                <strong>{item.value}</strong>
                <span className="muted-small">current campaign state</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <Surface>
        <div className="section-toolbar">
          <div>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18 }}>Campaign Launch Board</div>
            <div className="muted-small">Connect a template and SMTP account, then start controlled send batches.</div>
          </div>
          <Btn variant="primary" onClick={() => setShowModal(true)}>
            <Plus size={14} />
            New Campaign
          </Btn>
        </div>

        {campaigns.length === 0 && (
          <EmptyState
            icon={<Zap size={34} />}
            title="No campaigns yet"
            sub="Create your first campaign once you have at least one template and one SMTP account."
            action={<Btn variant="primary" onClick={() => setShowModal(true)}><Plus size={14} />New Campaign</Btn>}
          />
        )}

        <div className="card-grid-two">
          {campaigns.map((campaign) => {
            const openRate = campaign.delivered_count > 0 ? ((campaign.opened_count / campaign.delivered_count) * 100).toFixed(1) : "0.0";
            const replyRate = campaign.sent_count > 0 ? ((campaign.replied_count / campaign.sent_count) * 100).toFixed(1) : "0.0";
            return (
              <div key={campaign.id} className="data-card">
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>{campaign.name}</div>
                    <div className="muted-small" style={{ marginTop: 6 }}>
                      {campaign.template_name || "No template"} · {campaign.smtp_label || campaign.smtp_user || "No SMTP"}
                    </div>
                  </div>
                  <Badge status={campaign.status} />
                </div>

                <div className="stats-grid" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
                  {[
                    { label: "Sent", value: campaign.sent_count || 0 },
                    { label: "Opened", value: campaign.opened_count || 0 },
                    { label: "Replied", value: campaign.replied_count || 0 },
                    { label: "Bounced", value: campaign.bounced_count || 0 },
                  ].map((item) => (
                    <div key={item.label} className="stat-surface" style={{ padding: 14, borderRadius: 18, border: "1px solid var(--border)", background: "rgba(255,255,255,0.02)" }}>
                      <div className="eyebrow" style={{ marginBottom: 8 }}>{item.label}</div>
                      <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "1.35rem" }}>{item.value}</div>
                    </div>
                  ))}
                </div>

                <div className="insight-stack">
                  <div className="insight-card">
                    <div className="insight-row"><span>Open rate</span><strong>{openRate}%</strong></div>
                    <div className="insight-row"><span>Reply rate</span><strong>{replyRate}%</strong></div>
                    <div className="insight-row"><span>Daily limit</span><strong>{campaign.daily_limit}</strong></div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {(campaign.status === "active" || campaign.status === "draft") && (
                    <Btn variant="primary" onClick={() => runBatch(campaign.id)} disabled={running === campaign.id || !!running}>
                      {running === campaign.id ? <Spinner /> : <Send size={14} />}
                      {running === campaign.id ? "Sending" : "Send Batch"}
                    </Btn>
                  )}
                  {campaign.status === "active" ? (
                    <Btn onClick={() => setStatus(campaign.id, "paused")}><Pause size={14} />Pause</Btn>
                  ) : campaign.status !== "completed" && campaign.status !== "stopped" ? (
                    <Btn variant="success" onClick={() => setStatus(campaign.id, "active")}><Play size={14} />Start</Btn>
                  ) : null}
                  <Btn variant="danger" onClick={() => deleteCampaign(campaign.id)}><Trash2 size={14} />Delete</Btn>
                </div>
              </div>
            );
          })}
        </div>
      </Surface>

      {showModal && (
        <Modal title="Create Campaign" onClose={() => setShowModal(false)} width={720}>
          <div style={{ display: "grid", gap: 12 }}>
            <Input label="Campaign name" value={form.name} onChange={(value) => setForm((current) => ({ ...current, name: value }))} placeholder="Q2 Product Outreach" />
            <div className="form-grid-two">
              <Select
                label="Template"
                value={form.template_id}
                onChange={(value) => setForm((current) => ({ ...current, template_id: value }))}
                options={[{ value: "", label: "Select template..." }, ...templates.map((item) => ({ value: String(item.id), label: item.name }))]}
              />
              <Select
                label="SMTP account"
                value={form.smtp_account_id}
                onChange={(value) => setForm((current) => ({ ...current, smtp_account_id: value }))}
                options={[{ value: "", label: "Select SMTP..." }, ...smtpAccounts.map((item) => ({ value: String(item.id), label: `${item.label} (${item.user})` }))]}
              />
            </div>
            <div className="form-grid-three">
              <Input label="Daily limit" value={form.daily_limit} onChange={(value) => setForm((current) => ({ ...current, daily_limit: value }))} />
              <Input label="Min delay (s)" value={form.send_delay_min} onChange={(value) => setForm((current) => ({ ...current, send_delay_min: value }))} />
              <Input label="Max delay (s)" value={form.send_delay_max} onChange={(value) => setForm((current) => ({ ...current, send_delay_max: value }))} />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Btn onClick={() => setShowModal(false)}>Cancel</Btn>
              <Btn variant="primary" onClick={createCampaign}><Plus size={14} />Create Campaign</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
