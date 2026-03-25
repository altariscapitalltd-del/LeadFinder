"use client";
import { useState, useEffect } from "react";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Card, CardTitle, Spinner } from "../ui";
import { Users, Zap, MessageSquare, AlertCircle, ArrowUpRight, Activity } from "lucide-react";

const TTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{background:"var(--bg-elevated)",border:"1px solid var(--border)",borderRadius:8,padding:"9px 13px",fontSize:11}}>
      {label && <div style={{color:"var(--text-muted)",marginBottom:5}}>{label}</div>}
      {payload.map((p,i) => (
        <div key={i} style={{color:p.color||"var(--text-secondary)",marginBottom:2}}>
          {p.name}: <strong>{p.value}</strong>
        </div>
      ))}
    </div>
  );
};

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
      } catch (err) {
        if (mounted) {
          setStats(null);
          notify?.(err.message || "Failed to load analytics");
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [notify]);

  if (loading) return <div style={{display:"flex",justifyContent:"center",padding:80}}><Spinner/></div>;

  const cards = [
    { label:"Total Contacts",  value:stats?.totalContacts ?? 0,     icon:<Users size={16}/>,           color:"#4F8EF7", bg:"rgba(79,142,247,0.15)" },
    { label:"Emails Sent",     value:stats?.totalSent ?? 0,         icon:<Zap size={16}/>,             color:"#A855F7", bg:"rgba(168,85,247,0.15)" },
    { label:"Reply Rate",      value:`${stats?.replyRate ?? 0}%`,   icon:<MessageSquare size={16}/>,   color:"#22C55E", bg:"rgba(34,197,94,0.15)" },
    { label:"Bounce Rate",     value:`${stats?.bounceRate ?? 0}%`,  icon:<AlertCircle size={16}/>,     color:"#F59E0B", bg:"rgba(245,158,11,0.15)" },
  ];

  const isNew = !stats || stats.totalContacts === 0;

  return (
    <div style={{padding:20}}>
      {/* Stat cards */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:20}}>
        {cards.map((c,i) => (
          <div key={i} style={{background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:12,padding:16,position:"relative",overflow:"hidden"}}>
            <div style={{position:"absolute",top:0,left:0,right:0,height:2,background:`linear-gradient(90deg,${c.color},transparent)`}}/>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
              <div>
                <div style={{fontSize:10,color:"var(--text-muted)",marginBottom:8}}>{c.label}</div>
                <div style={{fontFamily:"var(--font-display)",fontWeight:700,fontSize:28,color:"var(--text-primary)",lineHeight:1}}>{c.value}</div>
              </div>
              <div style={{width:36,height:36,borderRadius:9,background:c.bg,display:"flex",alignItems:"center",justifyContent:"center"}}>
                <span style={{color:c.color}}>{c.icon}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {isNew ? (
        /* ── Onboarding checklist for new users ── */
        <Card>
          <CardTitle icon={<Activity size={14}/>}>Getting Started</CardTitle>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            {[
              { step:1, title:"Add SMTP Account", desc:"Go to Settings → Add your Gmail App Password to start sending", done:false },
              { step:2, title:"Add AI API Key",   desc:"Go to Settings → Add your Anthropic/OpenAI key for AI writing",  done:false },
              { step:3, title:"Import Contacts",  desc:"Go to Leads → Import CSV with an 'email' column",                done:false },
              { step:4, title:"Create Template",  desc:"Go to Templates → Write or AI-generate your first email",        done:false },
              { step:5, title:"Launch Campaign",  desc:"Go to Campaigns → Create and run your first campaign",            done:false },
            ].map(s => (
              <div key={s.step} style={{display:"flex",gap:12,padding:14,background:"var(--bg-elevated)",borderRadius:10}}>
                <div style={{width:26,height:26,borderRadius:"50%",background:"var(--accent-dim)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,color:"var(--accent)",flexShrink:0}}>{s.step}</div>
                <div>
                  <div style={{fontSize:13,fontWeight:600,color:"var(--text-primary)",marginBottom:3}}>{s.title}</div>
                  <div style={{fontSize:11,color:"var(--text-muted)",lineHeight:1.5}}>{s.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : (
        <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:14}}>
          {/* Growth chart */}
          <Card>
            <CardTitle icon={<Activity size={14}/>}>Contact Growth</CardTitle>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={stats.growth}>
                <defs>
                  <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#4F8EF7" stopOpacity={0.3}/>
                    <stop offset="100%" stopColor="#4F8EF7" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false}/>
                <XAxis dataKey="d" tick={{fill:"var(--text-muted)",fontSize:10}} axisLine={false} tickLine={false}/>
                <YAxis tick={{fill:"var(--text-muted)",fontSize:10}} axisLine={false} tickLine={false}/>
                <Tooltip content={<TTip/>}/>
                <Area type="monotone" dataKey="contacts" name="Contacts" stroke="#4F8EF7" fill="url(#cg)" strokeWidth={2}/>
              </AreaChart>
            </ResponsiveContainer>
          </Card>

          {/* Status breakdown */}
          <Card>
            <CardTitle icon={<Users size={14}/>} color="var(--violet)">By Status</CardTitle>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={stats.byStatus} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false}/>
                <XAxis type="number" tick={{fill:"var(--text-muted)",fontSize:9}} axisLine={false} tickLine={false}/>
                <YAxis dataKey="status" type="category" tick={{fill:"var(--text-muted)",fontSize:9}} axisLine={false} tickLine={false} width={70}/>
                <Tooltip content={<TTip/>}/>
                <Bar dataKey="count" name="Contacts" fill="#4F8EF7" radius={[0,3,3,0]}/>
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div>
      )}
    </div>
  );
}
