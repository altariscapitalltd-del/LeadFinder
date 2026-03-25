"use client";
import { useState, useEffect } from "react";
import { Plus, Sparkles, Edit3, Trash2, Send, RefreshCw } from "lucide-react";
import { Card, CardTitle, Btn, Input, Select, Modal, Spinner, EmptyState } from "../ui";

const TONES = ["professional","friendly","sales","technical","casual"];

export default function Templates({ notify }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);

  // Template form
  const [form, setForm] = useState({ name:"", subject:"", body_html:"", tone:"professional" });

  // AI generator
  const [aiGoal, setAiGoal] = useState("");
  const [aiTone, setAiTone] = useState("professional");
  const [generating, setGenerating] = useState(false);

  useEffect(() => { loadTemplates(); }, []);

  async function loadTemplates() {
    const res = await fetch("/api/templates");
    const d = await res.json();
    setTemplates(d.templates || []);
  }

  async function generateWithAI() {
    if (!aiGoal.trim()) { notify("Describe the goal of this email"); return; }
    setGenerating(true);
    try {
      const res = await fetch("/api/ai", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ action:"generate_email", goal:aiGoal, tone:aiTone })
      });
      const data = await res.json();
      if (data.error) { notify("AI error: " + data.error); setGenerating(false); return; }
      setForm(f => ({
        ...f,
        subject: data.subject || f.subject,
        body_html: data.body_html || data.body_text || f.body_html,
      }));
      notify("AI generated your email — review and save");
    } catch(e) {
      notify("AI error: " + e.message);
    }
    setGenerating(false);
  }

  async function saveTemplate() {
    if (!form.name || !form.subject || !form.body_html) { notify("Name, subject, and body are required"); return; }
    setLoading(true);
    const method = editing ? "PATCH" : "POST";
    const body = editing ? { ...form, id:editing } : form;
    const res = await fetch("/api/templates", {
      method, headers:{"Content-Type":"application/json"}, body:JSON.stringify(body)
    });
    const data = await res.json();
    if (data.error) { notify("Error: " + data.error); setLoading(false); return; }
    notify(editing ? "Template updated" : "Template saved");
    setShowModal(false); setEditing(null);
    setForm({ name:"", subject:"", body_html:"", tone:"professional" });
    loadTemplates(); setLoading(false);
  }

  async function deleteTemplate(id) {
    if (!confirm("Delete this template?")) return;
    await fetch(`/api/templates?id=${id}`, { method:"DELETE" });
    notify("Template deleted"); loadTemplates();
  }

  function openEdit(t) {
    setEditing(t.id);
    setForm({ name:t.name, subject:t.subject, body_html:t.body_html, tone:t.tone });
    setShowModal(true);
  }

  function openNew() {
    setEditing(null);
    setForm({ name:"", subject:"", body_html:"", tone:"professional" });
    setAiGoal(""); setShowModal(true);
  }

  return (
    <div style={{padding:20}}>
      <div style={{display:"flex",justifyContent:"flex-end",marginBottom:16}}>
        <Btn variant="primary" onClick={openNew}><Plus size={11}/>New Template</Btn>
      </div>

      {templates.length === 0 && !loading && (
        <EmptyState icon={<span style={{fontSize:48}}>📝</span>}
          title="No templates yet"
          sub="Create your first email template or use the AI generator"
          action={<Btn variant="primary" onClick={openNew}><Plus size={11}/>Create Template</Btn>}/>
      )}

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:14}}>
        {templates.map(t => (
          <div key={t.id} style={{background:"var(--bg-card)",border:"1px solid var(--border)",
            borderRadius:12,padding:16,transition:"border-color 0.2s"}}>
            <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:8}}>
              <div style={{fontWeight:600,fontSize:13,color:"var(--text-primary)"}}>{t.name}</div>
              <span style={{fontSize:9,background:"var(--violet-dim)",color:"var(--violet)",
                padding:"2px 7px",borderRadius:10,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px"}}>{t.tone}</span>
            </div>
            <div style={{fontSize:11,color:"var(--text-muted)",fontFamily:"var(--font-mono)",marginBottom:8}}>{t.subject}</div>
            <div style={{background:"var(--bg-elevated)",borderRadius:8,padding:"10px 12px",
              fontSize:11,color:"var(--text-secondary)",minHeight:60,lineHeight:1.6,
              fontFamily:"var(--font-mono)",overflow:"hidden",
              display:"-webkit-box",WebkitLineClamp:3,WebkitBoxOrient:"vertical"}}>
              {t.body_html.replace(/<[^>]+>/g," ").trim()}
            </div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:12}}>
              <span style={{fontSize:10,color:"var(--text-muted)"}}>Used {t.use_count} times</span>
              <div style={{display:"flex",gap:6}}>
                <Btn size="sm" onClick={()=>openEdit(t)}><Edit3 size={10}/>Edit</Btn>
                <Btn size="sm" variant="danger" onClick={()=>deleteTemplate(t.id)}><Trash2 size={10}/></Btn>
              </div>
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <Modal title={editing ? "Edit Template" : "New Template"} onClose={()=>setShowModal(false)} width={600}>
          <div style={{display:"grid",gap:12}}>
            {/* AI Generator */}
            <div style={{background:"var(--bg-elevated)",border:"1px solid var(--border)",borderRadius:10,padding:14}}>
              <div style={{fontSize:11,color:"var(--violet)",fontWeight:600,marginBottom:10,display:"flex",alignItems:"center",gap:6}}>
                <Sparkles size={12}/>AI Email Generator
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr auto auto",gap:8}}>
                <input value={aiGoal} onChange={e=>setAiGoal(e.target.value)}
                  placeholder="Describe goal: e.g. cold pitch to SaaS founders about our analytics tool"
                  style={{background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:7,
                    padding:"7px 11px",fontSize:12,color:"var(--text-primary)",outline:"none",fontFamily:"var(--font-body)"}}
                  onFocus={e=>e.target.style.borderColor="var(--accent)"}
                  onBlur={e=>e.target.style.borderColor="var(--border)"}/>
                <select value={aiTone} onChange={e=>setAiTone(e.target.value)}
                  style={{background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:7,
                    padding:"7px 10px",fontSize:12,color:"var(--text-secondary)"}}>
                  {TONES.map(t=><option key={t} value={t}>{t}</option>)}
                </select>
                <Btn variant="violet" onClick={generateWithAI} disabled={generating}>
                  {generating ? <Spinner/> : <Sparkles size={11}/>}
                  {generating ? "Generating..." : "Generate"}
                </Btn>
              </div>
            </div>

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <Input label="Template Name *" value={form.name} onChange={v=>setForm(f=>({...f,name:v}))} placeholder="SaaS Cold Pitch"/>
              <Select label="Tone" value={form.tone} onChange={v=>setForm(f=>({...f,tone:v}))} options={TONES}/>
            </div>
            <Input label="Subject Line *" value={form.subject} onChange={v=>setForm(f=>({...f,subject:v}))} placeholder="Quick question about {{company}}"/>
            <div>
              <div style={{fontSize:11,color:"var(--text-muted)",marginBottom:5,textTransform:"uppercase",letterSpacing:"0.8px",fontWeight:600}}>Body (HTML) *</div>
              <textarea value={form.body_html} onChange={e=>setForm(f=>({...f,body_html:e.target.value}))}
                rows={10} placeholder={"<p>Hi {{name}},</p>\n<p>Your message...</p>"}
                style={{background:"var(--bg-elevated)",border:"1px solid var(--border)",borderRadius:7,
                  padding:"8px 12px",fontSize:12,color:"var(--text-primary)",outline:"none",
                  width:"100%",fontFamily:"var(--font-mono)",resize:"vertical",lineHeight:1.6}}
                onFocus={e=>e.target.style.borderColor="var(--accent)"}
                onBlur={e=>e.target.style.borderColor="var(--border)"}/>
              <div style={{fontSize:10,color:"var(--text-muted)",marginTop:4}}>
                Available variables: <code style={{color:"var(--accent)"}}>{"{{name}} {{email}} {{country}} {{company}}"}</code>
              </div>
            </div>
            <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:4}}>
              <Btn onClick={()=>setShowModal(false)}>Cancel</Btn>
              <Btn variant="primary" onClick={saveTemplate} disabled={loading}>
                {loading ? <Spinner/> : null}
                {editing ? "Update Template" : "Save Template"}
              </Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
