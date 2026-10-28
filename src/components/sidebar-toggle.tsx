"use client";

import * as React from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

// Slides the task sidebar out of the way and back. The choice is remembered, and applied before paint on the next load.
function apply(collapsed: boolean) {
  const root = document.documentElement;
  if (collapsed) root.dataset.sidebar = "collapsed";
  else delete root.dataset.sidebar;
  try {
    if (collapsed) localStorage.setItem("sidebar", "collapsed");
    else localStorage.removeItem("sidebar");
  } catch {}
}

export function SidebarToggle() {
  const [collapsed, setCollapsed] = React.useState(false);

  React.useEffect(() => {
    setCollapsed(document.documentElement.dataset.sidebar === "collapsed");
  }, []);

  const toggle = React.useCallback(() => {
    setCollapsed((c) => {
      apply(!c);
      return !c;
    });
  }, []);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.key !== "\\" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (el && (["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || el.isContentEditable || el.closest('[role="dialog"]'))) return;
      e.preventDefault();
      toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  const label = collapsed ? "Show task sidebar (\\)" : "Hide task sidebar (\\)";
  return (
    <button onClick={toggle} className="icon-round sidebar-toggle" title={label} aria-label={label} aria-expanded={!collapsed}>
      {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
    </button>
  );
}
