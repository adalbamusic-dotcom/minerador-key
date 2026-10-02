"use client";

import { useState } from "react";
import { radarRefreezeButtonLabel, type RadarRefreezeDiagnosis, type RadarRefreezeProfile } from "@/lib/radar/refreeze-repair";

/**
 * ===== REPARAR O CONGELAMENTO — o botão cirúrgico de cada perfil (Adendo E, 2026-10-02) =====
 *
 * O mesmo desenho do "Diagnosticar e reparar" do Arquiteto: o clique abre a
 * prévia, que é LEITURA; só a confirmação grava. A prévia diz o que divergiu,
 * qual dos dois caminhos se aplica (recongelar grátis ou zerar e coletar pago)
 * e o que acontece antes de acontecer. Um painel por perfil — Google, YouTube
 * e Amazon —, cada um com os seus handlers.
 */
const botao = "inline-flex min-h-10 items-center justify-center rounded-md border border-divider px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-context-accent hover:text-context-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-50";
const botaoPrincipal = "inline-flex min-h-10 items-center justify-center rounded-md border border-context-accent px-3 py-2 text-sm font-medium text-foreground transition-colors hover:text-context-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-50";
const discreto = "inline-flex min-h-10 items-center justify-center rounded-md px-3 py-2 text-sm text-text-muted transition-colors hover:text-context-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-50";
const bloco = "rounded-md border border-divider bg-surface-subtle p-3";

/** O que a página entrega a cada painel: diagnóstico (só leitura), recongelar e recoletar. */
export type RadarRefreezeHandlers = {
  onDiagnose: () => Promise<RadarRefreezeDiagnosis>;
  onRefreeze: () => Promise<void>;
  onRecollect: () => Promise<void>;
};

export function RadarRefreezePanel({ profile, disabled = false, onDiagnose, onRefreeze, onRecollect }: {
  profile: RadarRefreezeProfile;
  disabled?: boolean;
  /** Só leitura: relê o servidor, ensaia e compara. Nunca grava. */
  onDiagnose: () => Promise<RadarRefreezeDiagnosis>;
  /** Recongelar com a leitura atual — grátis. */
  onRefreeze: () => Promise<void>;
  /** Zerar o perfil e coletar de novo — pago. */
  onRecollect: () => Promise<void>;
}) {
  const [aberto, setAberto] = useState(false);
  const [estado, setEstado] = useState<"" | "lendo" | "gravando">("");
  const [diagnostico, setDiagnostico] = useState<RadarRefreezeDiagnosis | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const prefixo = `radar-refreeze-${profile.toLowerCase()}`;

  const diagnosticar = async () => {
    setAberto(true);
    setEstado("lendo");
    setErro(null);
    setDiagnostico(null);
    try {
      setDiagnostico(await onDiagnose());
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "Não foi possível ler o congelamento deste perfil.");
    } finally {
      setEstado("");
    }
  };

  const executar = async (acao: () => Promise<void>) => {
    setEstado("gravando");
    setErro(null);
    try {
      await acao();
      setAberto(false);
      setDiagnostico(null);
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "O reparo não foi concluído.");
    } finally {
      setEstado("");
    }
  };

  const ocupado = disabled || Boolean(estado);
  if (!aberto) {
    return <button type="button" className={discreto} disabled={ocupado} onClick={() => void diagnosticar()} data-testid={`${prefixo}-open`}
      title="Diagnostica a fotografia deste perfil contra a leitura de hoje. O diagnóstico só lê; nada é gravado sem a sua confirmação.">
      {radarRefreezeButtonLabel(profile)}
    </button>;
  }

  return <div className={`${bloco} w-full space-y-2`} role="region" aria-label={radarRefreezeButtonLabel(profile)} data-testid={`${prefixo}-panel`}>
    <p className="text-sm font-semibold text-foreground">{radarRefreezeButtonLabel(profile)}</p>
    <p className="text-sm leading-6 text-text-muted">O diagnóstico é leitura e não altera nada. Só a confirmação abaixo grava.</p>
    {estado === "lendo" && <p className="text-sm text-text-muted" role="status">Lendo a investigação no servidor e refazendo a leitura sem gravar…</p>}
    {erro && <p className="text-sm text-warning" role="status" data-testid={`${prefixo}-error`}>{erro}</p>}
    {diagnostico && <div className="space-y-2" data-testid={`${prefixo}-diagnosis`} data-mode={diagnostico.mode}>
      <p className={`text-sm leading-6 ${diagnostico.mode === "NOTHING" ? "text-success" : diagnostico.mode === "RECOLLECT" ? "text-warning" : "text-foreground"}`}>{diagnostico.headline}</p>
      {diagnostico.differences.length > 0 && <div>
        <p className="text-sm font-medium text-foreground">O que divergiu</p>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-6 text-foreground">{diagnostico.differences.map(item => <li key={item}>{item}</li>)}</ul>
      </div>}
      {diagnostico.reason && <p className="text-sm leading-6 text-text-muted">Motivo: {diagnostico.reason}</p>}
      {diagnostico.consequences.length > 0 && <div>
        <p className="text-sm font-medium text-foreground">Se confirmar</p>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-6 text-foreground">{diagnostico.consequences.map(item => <li key={item}>{item}</li>)}</ul>
      </div>}
    </div>}
    <div className="flex flex-wrap gap-2">
      {diagnostico?.mode === "REFREEZE" && <button type="button" className={botaoPrincipal} disabled={ocupado} onClick={() => void executar(onRefreeze)} data-testid={`${prefixo}-confirm`}>
        {estado === "gravando" ? "Recongelando…" : "Recongelar com a leitura atual"}
      </button>}
      {diagnostico?.mode === "RECOLLECT" && <button type="button" className={botaoPrincipal} disabled={ocupado} onClick={() => void executar(onRecollect)} data-testid={`${prefixo}-recollect`}>
        {estado === "gravando" ? "Zerando…" : "Zerar e coletar de novo (pago)"}
      </button>}
      <button type="button" className={botao} disabled={estado === "gravando"} onClick={() => { setAberto(false); setDiagnostico(null); setErro(null); }} data-testid={`${prefixo}-close`}>
        {diagnostico && diagnostico.mode !== "REFREEZE" && diagnostico.mode !== "RECOLLECT" ? "Fechar" : "Cancelar"}
      </button>
    </div>
  </div>;
}
