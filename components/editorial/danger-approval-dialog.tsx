"use client";

import { useState } from "react";
import { AlertTriangle, X } from "lucide-react";

export function DangerApprovalDialog({ open, title, description, impact, verificationPhrase, confirmLabel, onCancel, onConfirm }: {
  open: boolean;
  title: string;
  description: string;
  impact: string[];
  verificationPhrase: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  const [typed, setTyped] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [confirming, setConfirming] = useState(false);
  if (!open) return null;
  const approved = acknowledged && typed.trim() === verificationPhrase;
  const cancel = () => { setTyped(""); setAcknowledged(false); setConfirming(false); onCancel(); };
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" role="presentation">
    <section role="dialog" aria-modal="true" aria-labelledby="danger-approval-title" className="w-full max-w-lg rounded-lg border border-rose-900/70 bg-[#0b0c10] shadow-2xl">
      <header className="flex items-start justify-between gap-3 border-b border-rose-950 p-4"><div className="flex gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-400"/><div><p className="text-[9px] font-bold uppercase tracking-widest text-rose-500">Aprovação de ação destrutiva</p><h2 id="danger-approval-title" className="mt-1 text-sm font-bold text-white">{title}</h2></div></div><button type="button" onClick={cancel} className="text-slate-500 hover:text-white" aria-label="Cancelar ação"><X className="h-4 w-4"/></button></header>
      <div className="space-y-4 p-4 text-[10px]"><p className="text-slate-300">{description}</p><ul className="space-y-1 rounded border border-rose-950 bg-rose-950/15 p-3 text-rose-200">{impact.map(item => <li key={item}>• {item}</li>)}</ul><label className="flex items-start gap-2 text-slate-300"><input type="checkbox" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} className="mt-0.5"/><span>Revisei o impacto e confirmo que esta ação foi escolhida intencionalmente.</span></label><label className="block text-slate-400">Digite <strong className="select-all text-white">{verificationPhrase}</strong> para liberar a ação.<input autoFocus value={typed} onChange={event => setTyped(event.target.value)} className="mt-2 h-9 w-full rounded border border-slate-800 bg-black px-3 font-mono text-[11px] text-white outline-none focus:border-rose-700"/></label></div>
      <footer className="flex items-center justify-end gap-2 border-t border-slate-850 p-3"><button type="button" onClick={cancel} className="h-8 rounded border border-slate-800 px-3 text-[10px] text-slate-400 hover:text-white">Cancelar</button><button type="button" disabled={!approved || confirming} onClick={async () => { setConfirming(true); await onConfirm(); setTyped(""); setAcknowledged(false); setConfirming(false); }} className="h-8 rounded border border-rose-800 bg-rose-950/30 px-3 text-[10px] font-bold text-rose-300 disabled:cursor-not-allowed disabled:opacity-30">{confirming ? "Confirmando…" : confirmLabel}</button></footer>
    </section>
  </div>;
}
