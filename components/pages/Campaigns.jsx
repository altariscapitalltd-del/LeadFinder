"use client";
import { useState, useEffect } from "react";
import { Plus, Play, Pause, Square, Copy, Send, Trash2, Zap } from "lucide-react";
import { Badge, Btn, Input, Select, Modal, Spinner, EmptyState } from "../ui";

export default function Campaigns({ notify }) {
  const [campaigns, setCampaigns] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [smtpAccounts, setSmtpAccounts] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [running, setRunning] = useState(null);
  const [form, setForm] = useState({ name:"", template_id:"", smtp_account_id:"", daily_limit:"100", send_delay_min:"30", send_delay_max:"90", schedule_time:"09:00" });

  useEffect(() => { load(); }, []);

  async function load() {
    const [c, t, s] = await Promise.all([
      fetch("/api/campaigns").then(r=>r.json()),
      fetch("/api/templates").then(r=>r.json()),
      fetch("/api/smtp").then(r=>r.json()),
    ]);
    setCampaigns(c.campaigns || []);
    setTemplates(t.templates || []);
    setSmtpAccounts(s.accounts || []);
  }

  async function createCampaign() {
    if (!form.name || !form.template_id || !form.smtp_account_id) {
      notify("Name, template and SMTP account are required"); return;
    }
    const res = await fetch("/api/campaigns", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ ...form, template_id:parseInt(form.template_id), smtp_account_id:parseInt(form.smtp_account_id), daily_limit:parseInt(form.daily_limit), send_delay_min:parseInt(form.send_delay_min), send_delay_max:parseInt(form.send_delay_max) })
    });
    const data = await res.json();
    if (data.error) { notify("Error: "+data.error); return; }
    notify("Campaign created");
    setShowModal(false); setForm({ name:"", template_id:"", smtp_account_id:"", daily_limit:"100", send_delay_min:"30", send_delay_max:"90", schedule_time:"09:00" });
    load();
  }

  async function setStatus(id, status) {
    await fetch("/api/campaigns", {
      method:"PATCH", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({ id, status })
    });
    notify(`Campaign ${status}`); load();
  }

  async function runBatch(id) {
    if (running) return;
    setRunning(id);
    notify("Sending batch — check results in a moment...");
    try {
      const res = await fetch("/api/campaigns/run", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ campaignId:id, batchSize:20 })
      });
      const data = await res.json();
      if (data.error) notify("Error: "+data.error);
      else notify(`Batch complete — Sent: ${data.sent}, Skipped: ${data.skipped}`);
    } catch(e) { notify("Error: "+e.message); }
    setRunning(null); load();
  }

  async function deleteCampaign(id) {
    if (!confirm("Delete this campaign?")) return;
    await fetch(`/api/campaigns?id=${id}`, { method:"DELETE" });
    notify("Campaign deleted"); load();
  }

  const statColors = { active:"#22C55E", paused:"#F59E0B", draft:"#64748b", scheduled:"#4F8EF7", completed:"#22C55E", stopped:"#EF4444" };

  return (
    <div style={{padding:20}}>
      <div style={{display:"flex",justifyContent:"flex-end",marginBottom:16}}>
        <Btn variant="primary" onClick={()=>setShowModal(true)}><Plus size={11}/>New Campaign</Btn>
      </div>

      {campaigns.length === 0 && (
        <EmptyState icon={<Zap size={40}/>} title="No campaigns yet"
          sub="Create a campaign to start sending email sequences"
          action={<Btn variant="primary" onClick={()=>setShowModal(true)}><Plus size={11}/>New Campaign</Btn>}/>
      )}

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(360px,1fr))",gap:14}}>
        {campaigns.map(c => {
          const openRate = c.delivered_count > 0 ? ((c.opened_count/c.delivered_count)*100).toFixed(1) : 0;
          const replyRate = c.sent_count > 0 ? ((c.replied_count/c.sent_count)*100).toFixed(1) : 0;
          return (
            <div key={c.id} style={{background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:12,padding:18}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                <div>
                  <div style={{fontFamily:"var(--font-display)",fontWeight:700,fontSize:15,color:"var(--text-primary)"}}>{c.name}</div>
                  <div style={{fontSize:11,color:"var(--text-muted)",marginTop:3}}>
                    {c.template_name || "No template"} · {c.smtp_label || c.smtp_user || "No SMTP"}
                  </div>
                </div>
                <div style={{display:"flex",alignItems:"center",fontSize:11,fontWeight:600,
                  color:statColors[c.status],background:`${statColors[c.status]}20`,
                  padding:"3px 10px",borderRadius:20}}>
                  <span style={{width:5,height:5,borderRadius:"50%",background:statColors[c.status],marginRight:5}}/>
                  {c.status}
                </div>
              </div>

              {/* Open rate bar */}
              <div style={{marginBottom:12}}>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"var(--text-muted)",marginBottom:4}}>
                  <span>Open rate</span>
                  <span style={{color:"var(--accent)",fontFamily:"var(--font-mono)"}}>{openRate}%</span>
                </div>
                <div style={{height:4,background:"var(--border)",borderRadius:2,overflow:"hidden"}}>
                  <div style={{height:"100%",width:`${Math.min(openRate,100)}%`,background:"linear-gradient(90deg,var(--accent),var(--violet))",borderRadius:2}}/>
                </div>
              </div>

              {/* Stats */}
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,padding:"12px 0",borderTop:"1px solid var(--border)"}}>
                {[["Sent",c.sent_count],["Opened",c.opened_count],["Replied",c.replied_count],["Bounced",c.bounced_count]].map(([l,v])=>(
                  <div key={l} style={{textAlign:"center"}}>
                    <div style={{fontFamily:"var(--font-display)",fontWeight:700,fontSize:18,color:"var(--text-primary)"}}>{v||0}</div>
                    <div style={{fontSize:9,color:"var(--text-muted)",textTransform:"uppercase",letterSpacing:"0.8px",marginTop:2}}>{l}</div>
                  </div>
                ))}
              </div>

              {/* Actions */}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:12,paddingTop:12,borderTop:"1px solid var(--border)"}}>
                <div style={{fontSize:10,color:"var(--text-muted)"}}>Daily limit: <span style={{color:"var(--text-secondary)"}}>{c.daily_limit}</span></div>
                <div style={{display:"flex",gap:6}}>
                  {c.status === "active" || c.status === "draft"
                    ? <Btn size="sm" onClick={()=>runBatch(c.id)} disabled={!!running} variant="primary">
                        {running===c.id ? <Spinner/> : <Send size={10}/>}
                        {running===c.id ? "Sending..." : "Send Batch"}
                      </Btn>
                    : null
                  }
                  {c.status === "active"
                    ? <Btn size="sm" onClick={()=>setStatus(c.id,"paused")}><Pause size={10}/>Pause</Btn>
                    : c.status !== "completed" && c.status !== "stopped"
                    ? <Btn size="sm" variant="success" onClick={()=>setStatus(c.id,"active")}><Play size={10}/>Start</Btn>
                    : null
                  }
                  <Btn size="sm" variant="danger" onClick={()=>deleteCampaign(c.id)}><Trash2 size={10}/></Btn>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {showModal && (
        <Modal title="New Campaign" onClose={()=>setShowModal(false)}>
          <div style={{display:"grid",gap:12}}>
            <Input label="Campaign Name *" value={form.name} onChange={v=>setForm(f=>({...f,name:v}))} placeholder="Q1 SaaS Outreach"/>
            <Select label="Email Template *" value={form.template_id} onChange={v=>setForm(f=>({...f,template_id:v}))}
              options={[{value:"",label:"Select template..."},...templates.map(t=>({value:String(t.id),label:t.name}))]}/>
            <Select label="SMTP Account *" value={form.smtp_account_id} onChange={v=>setForm(f=>({...f,smtp_account_id:v}))}
              options={[{value:"",label:"Select SMTP account..."},...smtpAccounts.map(a=>({value:String(a.id),label:`${a.label} (${a.user})`}))]}/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
              <Input label="Daily Limit" value={form.daily_limit} onChange={v=>setForm(f=>({...f,daily_limit:v}))} placeholder="100"/>
              <Input label="Min Delay (s)" value={form.send_delay_min} onChange={v=>setForm(f=>({...f,send_delay_min:v}))} placeholder="30"/>
              <Input label="Max Delay (s)" value={form.send_delay_max} onChange={v=>setForm(f=>({...f,send_delay_max:v}))} placeholder="90"/>
            </div>
            {(smtpAccounts.length === 0 || templates.length === 0) && (
              <div style={{padding:10,background:"var(--amber-dim)",borderRadius:8,fontSize:11,color:"var(--amber)"}}>
                {smtpAccounts.length === 0 && "⚠ No SMTP accounts — go to Settings first. "}
                {templates.length === 0 && "⚠ No templates — go to Templates first."}
              </div>
            )}
            <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:4}}>
              <Btn onClick={()=>setShowModal(false)}>Cancel</Btn>
              <Btn variant="primary" onClick={createCampaign}>Create Campaign</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
