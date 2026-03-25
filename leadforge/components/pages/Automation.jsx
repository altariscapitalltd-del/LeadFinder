"use client";
import { useState, useEffect } from "react";
import { Plus, Play, Clock, Zap, Edit3, Trash2 } from "lucide-react";
import { Card, CardTitle, Btn, Input, Select, Modal, Toggle, EmptyState } from "../ui";

const ACTION_TYPES = [
  { value:"run_campaign",     label:"Run campaign batch" },
  { value:"validate_contacts",label:"Validate contacts" },
  { value:"import_contacts",  label:"Import from source" },
  { value:"send_followups",   label:"Send follow-ups" },
  { value:"score_contacts",   label:"AI score new contacts" },
  { value:"generate_report",  label:"Generate analytics report" },
];
const TRIGGER_TYPES = [
  { value:"schedule", label:"Scheduled (recurring)" },
  { value:"event",    label:"Event-based" },
];
const SCHEDULE_OPTS = ["Daily","Weekly","Monday","Weekdays","Monthly","Hourly"];

export default function Automation({ notify }) {
  const [rules, setRules] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name:"", trigger_type:"schedule", schedule:"Daily at 09:00", event_type:"", action_type:"run_campaign", action_config:"{}" });

  useEffect(() => { loadRules(); }, []);

  async function loadRules() {
    const res = await fetch("/api/automations");
    const d = await res.json();
    setRules(d.automations || []);
  }

  async function saveRule() {
    if (!form.name || !form.action_type) { notify("Name and action type are required"); return; }
    const method = form.id ? "PATCH" : "POST";
    const res = await fetch("/api/automations", {
      method, headers:{"Content-Type":"application/json"}, body:JSON.stringify(form)
    });
    const data = await res.json();
    if (data.error) { notify("Error: "+data.error); return; }
    notify("Automation rule saved");
    setShowModal(false);
    setForm({ name:"", trigger_type:"schedule", schedule:"Daily at 09:00", event_type:"", action_type:"run_campaign", action_config:"{}" });
    loadRules();
  }

  async function toggleRule(id, active) {
    await fetch("/api/automations", {
      method:"PATCH", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({ id, active:active?1:0 })
    });
    notify(`Rule ${active?"enabled":"disabled"}`); loadRules();
  }

  async function deleteRule(id) {
    if (!confirm("Delete this automation rule?")) return;
    await fetch(`/api/automations?id=${id}`, { method:"DELETE" });
    notify("Rule deleted"); loadRules();
  }

  return (
    <div style={{padding:20}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <div>
          <div style={{fontFamily:"var(--font-display)",fontWeight:700,fontSize:16,color:"var(--text-primary)"}}>Automation Rules</div>
          <div style={{fontSize:12,color:"var(--text-muted)",marginTop:2}}>Set rules that run automatically on a schedule or trigger.</div>
        </div>
        <Btn variant="primary" onClick={()=>setShowModal(true)}><Plus size={11}/>New Rule</Btn>
      </div>

      {rules.length === 0 && (
        <EmptyState icon={<Zap size={40}/>} title="No automation rules yet"
          sub="Create rules to run campaigns, import contacts, and send follow-ups automatically"
          action={<Btn variant="primary" onClick={()=>setShowModal(true)}><Plus size={11}/>New Rule</Btn>}/>
      )}

      {rules.map(r => (
        <div key={r.id} style={{background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:12,padding:16,marginBottom:10,display:"flex",alignItems:"center",gap:14}}>
          <div style={{width:38,height:38,borderRadius:9,display:"flex",alignItems:"center",justifyContent:"center",
            background:r.active?"var(--green-dim)":"var(--bg-elevated)",flexShrink:0}}>
            {r.trigger_type==="schedule"
              ? <Clock size={16} color={r.active?"var(--green)":"var(--text-muted)"}/>
              : <Zap size={16} color={r.active?"var(--green)":"var(--text-muted)"}/>
            }
          </div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontWeight:600,fontSize:13,color:"var(--text-primary)"}}>{r.name}</div>
            <div style={{fontSize:11,color:"var(--text-muted)",marginTop:2,display:"flex",gap:10}}>
              <span>⏰ {r.schedule || r.event_type || "—"}</span>
              <span style={{color:"var(--border)"}}>→</span>
              <span>{ACTION_TYPES.find(a=>a.value===r.action_type)?.label || r.action_type}</span>
            </div>
          </div>
          <div style={{textAlign:"right",fontSize:10,color:"var(--text-muted)",minWidth:120}}>
            {r.last_run && <div>Last: <span style={{color:"var(--text-secondary)"}}>{r.last_run.slice(0,16)}</span></div>}
            {r.next_run && <div style={{marginTop:2}}>Next: <span style={{color:"var(--accent)"}}>{r.next_run.slice(0,16)}</span></div>}
          </div>
          <Toggle value={!!r.active} onChange={v=>toggleRule(r.id,v)}/>
          <Btn size="icon" onClick={()=>deleteRule(r.id)} variant="danger"><Trash2 size={11}/></Btn>
        </div>
      ))}

      {showModal && (
        <Modal title="New Automation Rule" onClose={()=>setShowModal(false)}>
          <div style={{display:"grid",gap:12}}>
            <Input label="Rule Name *" value={form.name} onChange={v=>setForm(f=>({...f,name:v}))} placeholder="Daily Campaign Send"/>
            <Select label="Trigger Type" value={form.trigger_type} onChange={v=>setForm(f=>({...f,trigger_type:v}))}
              options={TRIGGER_TYPES}/>
            {form.trigger_type==="schedule"
              ? <Input label="Schedule" value={form.schedule} onChange={v=>setForm(f=>({...f,schedule:v}))} placeholder="Daily at 09:00 AM"/>
              : <Input label="Event Type" value={form.event_type} onChange={v=>setForm(f=>({...f,event_type:v}))} placeholder="contact_replied, contact_bounced..."/>
            }
            <Select label="Action *" value={form.action_type} onChange={v=>setForm(f=>({...f,action_type:v}))}
              options={ACTION_TYPES}/>
            <div style={{fontSize:11,color:"var(--text-muted)",background:"var(--bg-elevated)",borderRadius:8,padding:10,lineHeight:1.6}}>
              ℹ Automation rules are saved and tracked here. Full background job execution requires adding a cron job to call <code style={{color:"var(--accent)"}}>POST /api/automations/run</code> on your server.
            </div>
            <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:4}}>
              <Btn onClick={()=>setShowModal(false)}>Cancel</Btn>
              <Btn variant="primary" onClick={saveRule}>Save Rule</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
