/**
 * ===== HISTÓRICO DO GRUPO — DOMÍNIO PURO (SDD 2026-10-12 §10.4) =====
 *
 * "Histórico do grupo", no menu da etiqueta de cor: as operações do grupo
 * (tipo, data, ator, resultado, custo, link do resultado), lidas de duas
 * fontes que já existem — nenhuma tabela nova:
 *
 *   - `editorial_group_events` (append-only, M1): criar, renomear, trocar a
 *     cor, liberar, mover keywords/artigos, plano declarado/trocado, Silo ligado;
 *   - `editorial_workflow_items` com `subject_type = 'operation_ledger'` (o
 *     registro do guarda de retrabalho, F5): `payload = { kind, fingerprint,
 *     groupId, inputsSummary, attempts: [{ at, actorId, outcome, outcomeCode,
 *     resultRef, costUsd }] }`. Cada tentativa vira uma linha do histórico.
 *
 * Leitura TOLERANTE: o registro do guarda pode ainda não existir (nenhuma
 * linha), vir com campos faltando ou com formato de uma versão futura. O que
 * não fecha o mínimo (data) é descartado em silêncio; nunca derruba a leitura.
 *
 * Sem storage, sem fetch, sem React.
 */

import { REWORK_OPERATION_LABELS } from "./rework-guard.ts";
import { GROUP_DELETE_ALL_ACTION_LABEL, GROUP_DELETE_ALL_RELEASE_VIA } from "../minerador/group-delete-all.ts";

export type GroupHistorySource ="group_event" | "operation_ledger";

export type GroupHistoryEntry = {
  id: string;
  source: GroupHistorySource;
  groupId: string;
  /** Código técnico (event_type ou kind do registro). */
  kind: string;
  /** O tipo em português, para a tela. */
  label: string;
  /** ISO 8601. */
  at: string;
  actorId: string | null;
  /** O resultado em português (ex.: "Confirmado", "Recusado: …"). */
  outcome: string | null;
  /** Tom do resultado (só para o ícone/texto; nunca a cor sozinha). */
  outcomeTone: "success" | "warning" | "danger" | "neutral";
  /** Detalhe curto (de → para, quantidades). */
  detail: string | null;
  costUsd: number | null;
  /** Link interno do resultado (só caminho relativo da própria plataforma). */
  resultHref: string | null;
  /** Referência do resultado quando não é link (id de execução, versão…). */
  resultRef: string | null;
};

const EVENT_LABELS: Record<string, string> = {
  created: "Grupo criado",
  renamed: "Nome do grupo",
  recolored: "Cor trocada",
  archived: "Cor liberada (grupo arquivado)",
  reactivated: "Grupo reativado",
  keywords_assigned: "Keywords entraram no grupo",
  keywords_unassigned: "Keywords saíram do grupo",
  article_assigned: "Artigos etiquetados",
  plan_declared: "Plano do Silo declarado",
  plan_changed: "Plano do Silo trocado",
  silo_linked: "Silo ligado ao grupo",
};

/* Os nomes canônicos das operações do guarda vêm de `REWORK_OPERATION_LABELS`; os demais ficam para registros antigos. */
const LEDGER_LABELS: Record<string, string> = {
  ...REWORK_OPERATION_LABELS,
  article_improvement:"Melhorar publicados e formar Assuntos",
  improvement_prepare: "Preparar melhoria",
  composition_refusal: "Parecer de composição recusado",
  article_withdrawal: "Retirada de artigo do Silo",
  serp_collection: "Coleta SERP",
  plan_withdrawal: "Tirar do plano",
};

const COLOR_LABELS: Record<string, string> = { amarelo: "Amarelo", azul: "Azul", verde: "Verde", lima: "Lima", laranja: "Laranja" };

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

const text = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);

function isoOf(value: unknown): string | null {
  const bruto = text(value);
  if (!bruto) return null;
  const data = new Date(bruto);
  return Number.isNaN(data.getTime()) ? null : data.toISOString();
}

function numberOf(value: unknown): number | null {
  const numero = typeof value === "string" && value.trim() ? Number(value) : value;
  return typeof numero === "number" && Number.isFinite(numero) && numero >= 0 ? numero : null;
}

const humanizeKind = (kind: string) => kind.replace(/[_-]+/g, " ").replace(/^\w/, letra => letra.toUpperCase());

/** Só caminho interno ("/marca--id/arquiteto?..."): nunca link externo vindo do banco. */
export function safeInternalHref(value: unknown): string | null {
  const ref = text(value);
  if (!ref || !ref.startsWith("/") || ref.startsWith("//") || /[\s<>"'`\\]/.test(ref)) return null;
  return ref;
}

const count = (value: unknown) => (Array.isArray(value) ? value.length : numberOf(value));

function eventDetail(eventType: string, payload: Record<string, unknown>): string | null {
  // 2026-10-14 · F7 "Excluir tudo da cor": o registro diz quanto saiu e como (as keywords apagadas não existem mais).
  if (payload.via === GROUP_DELETE_ALL_RELEASE_VIA) {
    if (eventType === "keywords_unassigned") {
      const contagens = asRecord(payload.counts);
      const partes = [
        `${numberOf(contagens.hardDeleted) ?? 0} apagada(s) de vez`,
        `${numberOf(contagens.recoverable) ?? 0} na lixeira de 24 h`,
        numberOf(contagens.out) ? `${numberOf(contagens.out)} ficaram fora` : null,
        numberOf(contagens.refusedKeywords) ? `${numberOf(contagens.refusedKeywords)} recusada(s) por bloco` : null,
      ].filter(Boolean);
      return `${GROUP_DELETE_ALL_ACTION_LABEL} · ${partes.join(" · ")}`;
    }
    if (eventType === "plan_changed") {
      const versao = numberOf(payload.planVersion);
      const saiu = count(payload.removedSubjects);
      return payload.cleared === true
        ? `${GROUP_DELETE_ALL_ACTION_LABEL} · plano limpo${versao ? ` (v${versao})` : ""}`
        : `${GROUP_DELETE_ALL_ACTION_LABEL} · plano v${versao ?? "?"}${saiu ? ` · ${saiu} Assunto(s) saíram` : ""}`;
    }
    if (eventType === "archived") return `${GROUP_DELETE_ALL_ACTION_LABEL}${payload.siloUnlinked === true ? " · Silo não consolidado desligado" : ""}`;
  }
  if (eventType === "renamed") {
    const de = text(payload.from);
    const para = text(payload.to);
    return de && para ? `“${de}” → “${para}”` : null;
  }
  if (eventType === "recolored") {
    const de = text(payload.from);
    const para = text(payload.to);
    return de && para ? `${COLOR_LABELS[de] ?? de} → ${COLOR_LABELS[para] ?? para}` : null;
  }
  if (eventType === "created") {
    const nome = text(payload.name);
    const cor = text(payload.color);
    return nome ? `“${nome}”${cor ? ` · ${COLOR_LABELS[cor] ?? cor}` : ""}${payload.origin === "declared_plan" ? " · plano declarado" : ""}` : null;
  }
  if (eventType === "plan_declared" || eventType === "plan_changed") {
    const versao = numberOf(payload.planVersion);
    const retirada = asRecord(payload.withdrawal);
    const frase = text(retirada.subjectPhrase);
    const partes = [versao ? `plano v${versao}` : null, frase ? `“${frase}” saiu do plano` : null].filter(Boolean);
    return partes.length ? partes.join(" · ") : null;
  }
  if (eventType === "silo_linked") return text(payload.siloId);
  if (eventType === "keywords_assigned" || eventType === "keywords_unassigned" || eventType === "article_assigned") {
    const n = count(payload.keywordIds) ?? count(payload.articleIds) ?? numberOf(payload.count);
    return n !== null ? `${n} item(ns)` : null;
  }
  return null;
}

/** Uma linha de `editorial_group_events` → entrada do histórico (ou null). */
export function groupEventHistoryEntry(row: unknown): GroupHistoryEntry | null {
  const r = asRecord(row);
  const at = isoOf(r.occurred_at);
  const groupId = text(r.group_id);
  const kind = text(r.event_type);
  if (!at || !groupId || !kind) return null;
  const payload = asRecord(r.payload);
  return {
    id: `evento:${text(r.id) ?? `${groupId}:${at}:${kind}`}`,
    source: "group_event",
    groupId,
    kind,
    label: EVENT_LABELS[kind] ?? humanizeKind(kind),
    at,
    actorId: text(r.actor_id),
    outcome: "Gravado e relido",
    outcomeTone: "success",
    detail: eventDetail(kind, payload),
    costUsd: null,
    resultHref: null,
    resultRef: null,
  };
}

function ledgerOutcome(outcome: string | null, code: string | null): { text: string | null; tone: GroupHistoryEntry["outcomeTone"] } {
  const o = (outcome || "").toLowerCase();
  const sufixo = code ? ` (${code})` : "";
  if (["success", "succeeded", "done", "applied", "ok", "completed", "reused"].includes(o)) return { text: `${o === "reused" ? "Reaproveitado" : "Concluído"}${sufixo}`, tone: "success" };
  if (["refused", "refusal", "rejected", "blocked"].includes(o)) return { text: `Recusado${sufixo}`, tone: "warning" };
  if (["failed", "failure", "error"].includes(o)) return { text: `Falhou${sufixo}`, tone: "danger" };
  if (o) return { text: `${humanizeKind(o)}${sufixo}`, tone: "neutral" };
  return { text: code, tone: "neutral" };
}

/**
 * Uma linha `operation_ledger` de `editorial_workflow_items` → uma entrada por
 * tentativa (as últimas 20 que o guarda guarda). Linha de outro grupo, sem
 * tentativas legíveis ou de outro `subject_type` → nada.
 */
export function operationLedgerHistoryEntries(row: unknown, groupIds: ReadonlySet<string>): GroupHistoryEntry[] {
  const r = asRecord(row);
  if (r.subject_type !== undefined && r.subject_type !== "operation_ledger") return [];
  const payload = asRecord(r.payload);
  const groupId = text(payload.groupId);
  if (!groupId || !groupIds.has(groupId)) return [];
  const kind = text(payload.kind) ?? text(r.subject_id)?.split(":")[0] ?? "operacao";
  const resumo = asRecord(payload.inputsSummary);
  const resumoTexto = text(payload.inputsSummary) ?? (Object.keys(resumo).length
    ? Object.entries(resumo).slice(0, 4).map(([chave, valor]) => `${chave}: ${typeof valor === "object" ? JSON.stringify(valor) : String(valor)}`).join(" · ")
    : null);
  const tentativas = Array.isArray(payload.attempts) ? payload.attempts : [];
  const saida: GroupHistoryEntry[] = [];
  tentativas.forEach((bruta, indice) => {
    const tentativa = asRecord(bruta);
    const at = isoOf(tentativa.at);
    if (!at) return;
    const resultado = ledgerOutcome(text(tentativa.outcome), text(tentativa.outcomeCode));
    const ref = text(tentativa.resultRef);
    saida.push({
      id: `registro:${text(r.subject_id) ?? kind}:${indice}:${at}`,
      source: "operation_ledger",
      groupId,
      kind,
      label: LEDGER_LABELS[kind] ?? humanizeKind(kind),
      at,
      actorId: text(tentativa.actorId),
      outcome: resultado.text,
      outcomeTone: resultado.tone,
      detail: resumoTexto ? resumoTexto.slice(0, 280) : null,
      costUsd: numberOf(tentativa.costUsd),
      resultHref: safeInternalHref(ref),
      resultRef: safeInternalHref(ref) ? null : ref,
    });
  });
  return saida;
}

/** As duas fontes juntas, da mais nova para a mais antiga, sem repetição. */
export function mergeGroupHistory(events: readonly unknown[], ledgerRows: readonly unknown[], groupIds: readonly string[], limit = 200): GroupHistoryEntry[] {
  const grupos = new Set(groupIds);
  const entradas = [
    ...events.map(groupEventHistoryEntry).filter((entry): entry is GroupHistoryEntry => Boolean(entry) && grupos.has((entry as GroupHistoryEntry).groupId)),
    ...ledgerRows.flatMap(row => operationLedgerHistoryEntries(row, grupos)),
  ];
  const vistos = new Set<string>();
  return entradas
    .filter(entry => (vistos.has(entry.id) ? false : (vistos.add(entry.id), true)))
    .sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id))
    .slice(0, limit);
}

/** "US$ 0,224" — o custo como foi registrado; sem custo, nada. */
export function formatHistoryCost(costUsd: number | null): string | null {
  if (costUsd === null) return null;
  return `US$ ${costUsd.toLocaleString("pt-BR", { minimumFractionDigits: costUsd > 0 && costUsd < 0.01 ? 4 : 2, maximumFractionDigits: 4 })}`;
}
