"use client";

/**
 * ===== DIAGNÓSTICO E REPARO DO ARTIGO (`ARTICLE_REPAIR_1`) =====
 *
 * SDD: `docs/04-arquiteto/sdd-reparo-pontual-do-artigo-2026-10-01.md`.
 *
 * A tela do diagnóstico é LEITURA: ela mostra o que está quebrado e o que cada
 * bloqueio admite, e não escreve nada sozinha. Só os passos que a classificação
 * marcou como disponíveis ganham ação, e `decisao_humana` nunca ganha botão de
 * um clique — ela abre uma decisão, com as opções do contrato e motivo
 * obrigatório.
 *
 * Quem decide a classe é `lib/arquiteto/article-repair.ts`; aqui só se desenha.
 */

import { useState } from "react";
import { AlertTriangle, ShieldCheck, Wrench, X } from "lucide-react";
import type { ArticleRepairPlan, ArticleRepairStep, RepairClass } from "@/lib/arquiteto/article-repair";
import { ARTICLE_SERP_HUMAN_DECISIONS, type ArticleSerpHumanDecision } from "@/lib/arquiteto/article-serp-record";

const CLASSE_ROTULO: Readonly<Record<RepairClass, string>> = {
  reexecutavel: "registro perdido",
  decisao_humana: "falta decisão",
  custo_de_provider: "precisa de coleta",
  outra_fase: "outra fase",
  composicao: "composição",
};

/* Só duas classes são acionáveis aqui; as outras existem para explicar, não para agir. */
const CLASSE_COR: Readonly<Record<RepairClass, string>> = {
  reexecutavel: "border-module-accent/45 text-module-accent",
  decisao_humana: "border-warning/45 text-warning",
  custo_de_provider: "border-divider text-text-muted",
  outra_fase: "border-divider text-text-muted",
  composicao: "border-divider text-text-muted",
};

export const DECISAO_ROTULO: Readonly<Record<ArticleSerpHumanDecision, string>> = {
  accept_current_composition: "Manter a composição como está",
  change_composition: "Recompor o artigo",
  change_principal: "Trocar a Principal",
  split: "Separar em mais de um artigo",
  merge: "Juntar com outro artigo",
};

function Passo({ passo, onReexecutar, onDecidir, busy }: {
  passo: ArticleRepairStep;
  onReexecutar: () => void;
  onDecidir: (decisao: ArticleSerpHumanDecision, motivo: string) => void;
  busy: boolean;
}) {
  const [decisao, setDecisao] = useState<ArticleSerpHumanDecision>("accept_current_composition");
  const [motivo, setMotivo] = useState("");

  return (
    <li className="rounded-md border border-divider bg-surface-subtle p-3" data-repair-step={passo.code} data-repair-class={passo.classe}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] text-text-muted">{passo.code}</span>
        <span className={`rounded border px-1.5 py-0.5 text-[10px] ${CLASSE_COR[passo.classe]}`}>{CLASSE_ROTULO[passo.classe]}</span>
      </div>
      <p className="mt-1 text-sm leading-6 text-foreground">{passo.motivo}</p>

      {passo.classe === "reexecutavel" && passo.disponivel && (
        <>
          <p className="mt-1 text-sm leading-6 text-text-muted">{passo.acao}</p>
          <button type="button" onClick={onReexecutar} disabled={busy} data-repair-action="reexecutar"
            className="mt-2 inline-flex items-center gap-1 rounded border border-module-accent/45 px-2 py-1 text-xs text-module-accent hover:border-module-accent disabled:cursor-not-allowed disabled:opacity-40">
            <Wrench className="h-3 w-3" aria-hidden="true"/>{busy ? "Reparando…" : "Regravar o registro"}
          </button>
        </>
      )}

      {passo.classe === "decisao_humana" && passo.disponivel && (
        <div className="mt-2 space-y-2" data-repair-decision>
          {/*
            * NÃO existe botão de "resolver". A decisão é a pergunta que o
            * parecer faz, com as opções do contrato — um atalho aqui
            * transformaria o portão em formalidade.
            */}
          <p className="text-sm leading-6 text-text-muted">{passo.acao}</p>
          <label className="block text-xs text-text-muted">Decisão
            <select value={decisao} onChange={event => setDecisao(event.target.value as ArticleSerpHumanDecision)}
              className="mt-1 block w-full rounded border border-divider bg-surface px-2 py-1 text-sm text-foreground">
              {ARTICLE_SERP_HUMAN_DECISIONS.map(item => <option key={item} value={item}>{DECISAO_ROTULO[item]}</option>)}
            </select>
          </label>
          <label className="block text-xs text-text-muted">Motivo <span className="text-text-muted">(obrigatório)</span>
            <textarea value={motivo} onChange={event => setMotivo(event.target.value)} rows={2}
              placeholder="Por que esta é a decisão para este artigo?"
              className="mt-1 block w-full rounded border border-divider bg-surface px-2 py-1 text-sm text-foreground"/>
          </label>
          <button type="button" onClick={() => onDecidir(decisao, motivo.trim())} disabled={busy || motivo.trim().length === 0}
            data-repair-action="decidir"
            className="inline-flex items-center gap-1 rounded border border-warning/45 px-2 py-1 text-xs text-warning hover:border-warning disabled:cursor-not-allowed disabled:opacity-40">
            <ShieldCheck className="h-3 w-3" aria-hidden="true"/>{busy ? "Registrando…" : "Registrar decisão"}
          </button>
        </div>
      )}

      {!passo.disponivel && passo.onde && (
        <p className="mt-1 text-sm leading-6 text-text-muted">Resolve-se em: {passo.onde}</p>
      )}
    </li>
  );
}

export function ArticleRepairPanel({ planos, busy, mensagem, onReexecutar, onDecidir, onClose }: {
  planos: readonly ArticleRepairPlan[];
  busy: boolean;
  mensagem: { tom: "erro" | "sucesso" | "progresso"; texto: string } | null;
  onReexecutar: (articleId: string, code: string) => void;
  onDecidir: (articleId: string, decisao: ArticleSerpHumanDecision, motivo: string) => void;
  onClose: () => void;
}) {
  const comBloqueio = planos.filter(plano => !plano.saudavel);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/60 p-6" role="dialog" aria-modal="true"
      aria-label="Diagnóstico e reparo do artigo" data-article-repair-panel>
      <div className="w-full max-w-2xl rounded-lg border border-divider bg-surface p-4 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Diagnóstico e reparo</h2>
            <p className="mt-1 text-sm leading-6 text-text-muted">
              O diagnóstico é leitura e não altera nada. Cada reparo passa pela mesma autoridade que o fluxo normal usaria, com releitura.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="rounded border border-divider p-1 text-text-muted hover:text-foreground">
            <X className="h-4 w-4"/>
          </button>
        </div>

        {mensagem && (
          <p className={`mt-3 text-sm leading-6 ${mensagem.tom === "erro" ? "text-danger" : mensagem.tom === "sucesso" ? "text-positive-soft" : "text-text-muted"}`}
            role={mensagem.tom === "erro" ? "alert" : "status"} data-repair-feedback={mensagem.tom}>
            {mensagem.texto}
          </p>
        )}

        {comBloqueio.length === 0 ? (
          <p className="mt-4 text-sm leading-6 text-text-muted" data-repair-empty>
            Nenhum bloqueio nos artigos selecionados.
          </p>
        ) : comBloqueio.map(plano => (
          <section key={plano.articleId} className="mt-4" data-repair-article={plano.articleId}>
            <p className="text-sm font-semibold text-foreground">{plano.label}</p>
            <ul className="mt-2 space-y-2">
              {plano.bloqueios.map(passo => (
                <Passo key={passo.code} passo={passo} busy={busy}
                  onReexecutar={() => onReexecutar(plano.articleId, passo.code)}
                  onDecidir={(decisao, motivo) => onDecidir(plano.articleId, decisao, motivo)}/>
              ))}
            </ul>
          </section>
        ))}

        <p className="mt-4 flex items-start gap-1 text-xs leading-5 text-text-muted">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true"/>
          O reparo age em um artigo por vez e nunca escreve em outro. O que depende de coleta de SERP ou de composição não é reparado aqui.
        </p>
      </div>
    </div>
  );
}
