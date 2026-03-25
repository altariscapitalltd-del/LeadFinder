"use client";
import { useState, useEffect } from "react";
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Card, CardTitle, Spinner } from "../ui";
import { Activity, Users, Send, MessageSquare, AlertCircle, TrendingUp, Globe } from "lucide-react";

const COLORS = ["#4F8EF7","#A855F7","#22C55E","#F59E0B","#06B6D4","#EF4444","#64748b","#ec4899"];

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

export default function Analytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/analytics").then(r=>r.json()).then(d=>{ setData(d); setLoading(false); });
  }, []);

  if (loading) return <div style={{display:"flex",justifyContent:"center",padding:60}}><Spinner/></div>;
  if (!data) return null;

  const stats = [
    { label:"Total Contacts",  value:data.totalContacts, icon:<Users size={15}/>,        color:"#4F8EF7" },
    { label:"New Today",       value:data.newToday,      icon:<Activity size={15}/>,      color:"#22C55E" },
    { label:"Emails Sent",     value:data.totalSent,     icon:<Send size={15}/>,          color:"#A855F7" },
    { label:"Reply Rate",      value:`${data.replyRate}%`, icon:<MessageSquare size={15}/>, color:"#06B6D4" },
    { label:"Bounce Rate",     value:`${data.bounceRate}%`, icon:<AlertCircle size={15}/>, color:"#EF4444" },
  ];

  return (
    <div style={{padding:20}}>
      {/* KPI row */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:12,marginBottom:18}}>
        {stats.map((s,i) => (
          <div key={i} style={{background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:12,padding:16,position:"relative",overflow:"hidden"}}>
            <div style={{position:"absolute",top:0,left:0,right:0,height:2,background:`linear-gradient(90deg,${s.color},transparent)`}}/>
            <div style={{width:34,height:34,borderRadius:8,background:`${s.color}20`,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:10}}>
              <span style={{color:s.color}}>{s.icon}</span>
            </div>
            <div style={{fontSize:10,color:"var(--text-muted)",marginBottom:4}}>{s.label}</div>
            <div style={{fontFamily:"var(--font-display)",fontWeight:700,fontSize:24,color:"var(--text-primary)"}}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:14,marginBottom:14}}>
        {/* Growth chart */}
        <Card>
          <CardTitle icon={<TrendingUp size={14}/>}>Contact Growth (Last 14 Days)</CardTitle>
          {data.growth.length === 0
            ? <div style={{textAlign:"center",padding:30,color:"var(--text-muted)",fontSize:12}}>No data yet — import contacts to see growth</div>
            : <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={data.growth}>
                  <defs>
                    <linearGradient id="ga" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#4F8EF7" stopOpacity={0.3}/>
                      <stop offset="100%" stopColor="#4F8EF7" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false}/>
                  <XAxis dataKey="d" tick={{fill:"var(--text-muted)",fontSize:10}} axisLine={false} tickLine={false}/>
                  <YAxis tick={{fill:"var(--text-muted)",fontSize:10}} axisLine={false} tickLine={false}/>
                  <Tooltip content={<TTip/>}/>
                  <Area type="monotone" dataKey="contacts" name="Contacts" stroke="#4F8EF7" fill="url(#ga)" strokeWidth={2}/>
                </AreaChart>
              </ResponsiveContainer>
          }
        </Card>

        {/* Status pie */}
        <Card>
          <CardTitle icon={<Activity size={14}/>} color="var(--violet)">By Status</CardTitle>
          {data.byStatus.length === 0
            ? <div style={{textAlign:"center",padding:30,color:"var(--text-muted)",fontSize:12}}>No contacts yet</div>
            : <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={data.byStatus} dataKey="count" nameKey="status" cx="50%" cy="50%" outerRadius={65} innerRadius={35} paddingAngle={3}>
                    {data.byStatus.map((_,i) => <Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
                  </Pie>
                  <Tooltip content={<TTip/>}/>
                  <Legend iconType="circle" iconSize={6} wrapperStyle={{fontSize:10,color:"var(--text-secondary)"}}/>
                </PieChart>
              </ResponsiveContainer>
          }
        </Card>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
        {/* Campaign performance */}
        <Card>
          <CardTitle icon={<Send size={14}/>} color="var(--green)">Campaign Performance</CardTitle>
          {data.campaigns.length === 0
            ? <div style={{textAlign:"center",padding:30,color:"var(--text-muted)",fontSize:12}}>No campaigns yet</div>
            : <ResponsiveContainer width="100%" height={180}>
                <BarChart data={data.campaigns.slice(0,6)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false}/>
                  <XAxis type="number" tick={{fill:"var(--text-muted)",fontSize:10}} axisLine={false} tickLine={false}/>
                  <YAxis dataKey="name" type="category" tick={{fill:"var(--text-muted)",fontSize:9}} axisLine={false} tickLine={false} width={90}/>
                  <Tooltip content={<TTip/>}/>
                  <Bar dataKey="sent_count" name="Sent" fill="#4F8EF7" radius={[0,3,3,0]}/>
                  <Bar dataKey="replied_count" name="Replied" fill="#22C55E" radius={[0,3,3,0]}/>
                </BarChart>
              </ResponsiveContainer>
          }
        </Card>

        {/* Geographic split */}
        <Card>
          <CardTitle icon={<Globe size={14}/>} color="var(--cyan)">Top Countries</CardTitle>
          {data.byCountry.length === 0
            ? <div style={{textAlign:"center",padding:30,color:"var(--text-muted)",fontSize:12}}>No location data yet</div>
            : <div style={{paddingTop:4}}>
                {data.byCountry.slice(0,8).map((c,i) => {
                  const maxCount = data.byCountry[0]?.count || 1;
                  return (
                    <div key={i} style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                      <div style={{width:80,fontSize:11,color:"var(--text-secondary)",textAlign:"right",flexShrink:0}}>{c.country||"Unknown"}</div>
                      <div style={{flex:1,height:6,background:"var(--border)",borderRadius:3,overflow:"hidden"}}>
                        <div style={{height:"100%",width:`${(c.count/maxCount)*100}%`,background:COLORS[i%COLORS.length],borderRadius:3}}/>
                      </div>
                      <div style={{width:36,fontSize:11,color:"var(--text-muted)",fontFamily:"var(--font-mono)",flexShrink:0}}>{c.count}</div>
                    </div>
                  );
                })}
              </div>
          }
        </Card>
      </div>
    </div>
  );
}
