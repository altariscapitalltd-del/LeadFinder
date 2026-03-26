"use client";

import { useMemo, useState } from "react";
import { Activity, FileText, Send, Sparkles, Zap } from "lucide-react";
import Campaigns from "./Campaigns";
import Templates from "./Templates";
import Automation from "./Automation";
import { Surface } from "../ui";

const TABS = [
  { key: "campaigns", label: "Campaigns", icon: Send, hint: "Run and monitor sends" },
  { key: "templates", label: "Templates", icon: FileText, hint: "Create reusable copy" },
  { key: "automation", label: "Automation", icon: Activity, hint: "Rules and recurring ops" },
];

export default function Outreach({ notify }) {
  const [tab, setTab] = useState("campaigns");

  const content = useMemo(() => {
    if (tab === "templates") return <Templates notify={notify} compact />;
    if (tab === "automation") return <Automation notify={notify} compact />;
    return <Campaigns notify={notify} compact />;
  }, [tab, notify]);

  return (
    <div className="page-shell">
      <div className="page-hero">
        <div>
          <div className="eyebrow">Outbound Workspace</div>
          <h1 className="page-title">Outreach Studio</h1>
          <p className="page-subtitle">
            Templates, campaigns, and automation now live in one flow so you can write, launch, and tune outreach without bouncing across disconnected tabs.
          </p>
        </div>
        <div className="responsive-three" style={{ minWidth: "min(100%, 420px)" }}>
          <div className="hero-stat">
            <span className="eyebrow">Build</span>
            <strong>Write</strong>
            <span className="muted-small">draft templates with AI support</span>
          </div>
          <div className="hero-stat">
            <span className="eyebrow">Launch</span>
            <strong>Send</strong>
            <span className="muted-small">start batches and monitor status</span>
          </div>
          <div className="hero-stat">
            <span className="eyebrow">Scale</span>
            <strong>Automate</strong>
            <span className="muted-small">turn repeat work into rules</span>
          </div>
        </div>
      </div>

      <Surface>
        <div className="segment-bar">
          {TABS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                type="button"
                className="segment-button"
                data-active={tab === item.key}
                onClick={() => setTab(item.key)}
              >
                <Icon size={15} />
                <div>
                  <div>{item.label}</div>
                  <div className="segment-hint">{item.hint}</div>
                </div>
              </button>
            );
          })}
        </div>
      </Surface>

      {content}
    </div>
  );
}
