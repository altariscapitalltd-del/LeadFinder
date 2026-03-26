"use client";

import { useEffect, useState } from "react";
import { Edit3, FileText, Plus, Sparkles, Trash2 } from "lucide-react";
import { Btn, EmptyState, Input, Modal, Select, Spinner, Surface } from "../ui";

const TONES = ["professional", "friendly", "sales", "technical", "casual"];

export default function Templates({ notify, compact = false }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [aiGoal, setAiGoal] = useState("");
  const [aiTone, setAiTone] = useState("professional");
  const [form, setForm] = useState({ name: "", subject: "", body_html: "", tone: "professional" });

  useEffect(() => {
    loadTemplates();
  }, []);

  async function loadTemplates() {
    const res = await fetch("/api/templates");
    const data = await res.json();
    setTemplates(data.templates || []);
  }

  async function generateWithAI() {
    if (!aiGoal.trim()) {
      notify("Describe the goal of the email first");
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate_email", goal: aiGoal, tone: aiTone }),
      });
      const data = await res.json();
      if (!res.ok) {
        notify(data.error || "AI generation failed");
        return;
      }
      setForm((current) => ({
        ...current,
        subject: data.subject || current.subject,
        body_html: data.body_html || data.body_text || current.body_html,
        tone: aiTone,
      }));
      notify("AI draft generated");
    } finally {
      setGenerating(false);
    }
  }

  async function saveTemplate() {
    if (!form.name || !form.subject || !form.body_html) {
      notify("Name, subject, and body are required");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/templates", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing ? { ...form, id: editing } : form),
      });
      const data = await res.json();
      if (!res.ok) {
        notify(data.error || "Failed to save template");
        return;
      }
      notify(editing ? "Template updated" : "Template saved");
      setShowModal(false);
      setEditing(null);
      setForm({ name: "", subject: "", body_html: "", tone: "professional" });
      loadTemplates();
    } finally {
      setLoading(false);
    }
  }

  async function deleteTemplate(id) {
    await fetch(`/api/templates?id=${id}`, { method: "DELETE" });
    notify("Template deleted");
    loadTemplates();
  }

  function openEdit(template) {
    setEditing(template.id);
    setForm({ name: template.name, subject: template.subject, body_html: template.body_html, tone: template.tone });
    setAiGoal("");
    setAiTone(template.tone || "professional");
    setShowModal(true);
  }

  function openNew() {
    setEditing(null);
    setForm({ name: "", subject: "", body_html: "", tone: "professional" });
    setAiGoal("");
    setAiTone("professional");
    setShowModal(true);
  }

  return (
    <div className="page-shell">
      {!compact && (
        <div className="page-hero">
          <div>
            <div className="eyebrow">Template Library</div>
            <h1 className="page-title">Templates</h1>
            <p className="page-subtitle">Generate with AI, keep reusable drafts in one place, and edit without losing structure.</p>
          </div>
          <div className="hero-stat">
            <span className="eyebrow">Stored templates</span>
            <strong>{templates.length}</strong>
            <span className="muted-small">ready for campaigns and one-off sends</span>
          </div>
        </div>
      )}

      <Surface>
        <div className="section-toolbar">
          <div>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18 }}>Template Library</div>
            <div className="muted-small">Use AI for a fast first draft, then refine the final version before saving.</div>
          </div>
          <Btn variant="primary" onClick={openNew}>
            <Plus size={14} />
            New Template
          </Btn>
        </div>

        {templates.length === 0 && (
          <EmptyState
            icon={<FileText size={34} />}
            title="No templates yet"
            sub="Create your first template or use the AI draft builder."
            action={<Btn variant="primary" onClick={openNew}><Plus size={14} />Create Template</Btn>}
          />
        )}

        <div className="card-grid-two">
          {templates.map((template) => (
            <div key={template.id} className="data-card">
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{template.name}</div>
                  <div className="muted-small" style={{ marginTop: 6, fontFamily: "var(--font-mono)" }}>{template.subject}</div>
                </div>
                <span className="mini-chip">{template.tone}</span>
              </div>
              <div className="insight-card" style={{ minHeight: 110, lineHeight: 1.7 }}>
                {String(template.body_html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 220) || "No preview available"}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <span className="muted-small">Used {template.use_count || 0} times</span>
                <div style={{ display: "flex", gap: 8 }}>
                  <Btn onClick={() => openEdit(template)}><Edit3 size={14} />Edit</Btn>
                  <Btn variant="danger" onClick={() => deleteTemplate(template.id)}><Trash2 size={14} />Delete</Btn>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Surface>

      {showModal && (
        <Modal title={editing ? "Edit Template" : "Create Template"} onClose={() => setShowModal(false)} width={760}>
          <div style={{ display: "grid", gap: 14 }}>
            <div className="insight-card">
              <div className="section-toolbar" style={{ padding: 0 }}>
                <div>
                  <div style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}><Sparkles size={16} />AI Draft Builder</div>
                  <div className="muted-small">Describe the goal and let the system draft a usable email structure.</div>
                </div>
              </div>
              <div className="form-grid-three" style={{ marginTop: 12 }}>
                <Input label="Goal" value={aiGoal} onChange={setAiGoal} placeholder="Cold pitch to SaaS founders about analytics" />
                <Select label="Tone" value={aiTone} onChange={setAiTone} options={TONES.map((item) => ({ value: item, label: item }))} />
                <div style={{ display: "flex", alignItems: "end" }}>
                  <Btn variant="violet" onClick={generateWithAI} disabled={generating}>
                    {generating ? <Spinner /> : <Sparkles size={14} />}
                    {generating ? "Generating" : "Generate Draft"}
                  </Btn>
                </div>
              </div>
            </div>

            <div className="form-grid-two">
              <Input label="Template name" value={form.name} onChange={(value) => setForm((current) => ({ ...current, name: value }))} placeholder="SaaS founder intro" />
              <Select label="Tone" value={form.tone} onChange={(value) => setForm((current) => ({ ...current, tone: value }))} options={TONES.map((item) => ({ value: item, label: item }))} />
            </div>
            <Input label="Subject" value={form.subject} onChange={(value) => setForm((current) => ({ ...current, subject: value }))} placeholder="Quick thought for {{company}}" />
            <div>
              <div className="field-label">Body (HTML)</div>
              <textarea
                className="app-textarea"
                rows={12}
                value={form.body_html}
                onChange={(event) => setForm((current) => ({ ...current, body_html: event.target.value }))}
                placeholder={"<p>Hi {{name}},</p>\n<p>Your message...</p>"}
              />
              <div className="muted-small" style={{ marginTop: 8 }}>Variables: {`{{name}} {{email}} {{country}} {{company}}`}</div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Btn onClick={() => setShowModal(false)}>Cancel</Btn>
              <Btn variant="primary" onClick={saveTemplate} disabled={loading}>
                {loading ? <Spinner /> : <Plus size={14} />}
                {editing ? "Update Template" : "Save Template"}
              </Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
