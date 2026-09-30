/**
 * DESFAZER SILO SUGERIDO — decisão humana, nada é apagado.
 *
 * O Arquiteto sugere Silos novos (território sem endereço publicado). Quem
 * quer manter ativos só os Silos publicados precisava de um caminho de volta:
 * este módulo diz QUANDO um Silo pode ser desfeito e O QUE a gravação faz.
 *
 *   TERRITÓRIO  confirmed/candidate → rejected (a transição que o domínio já
 *               permite; consolidated nunca). A linha fica no banco, com o
 *               motivo, o ator e a hora nos `reasons`.
 *   KEYWORDS    cada membro volta para "sem Silo" pela MESMA decisão humana
 *               da aba Silos (`humanSiloDecision`, estado `unassigned`).
 *               Nenhuma keyword sai da mesa.
 *
 * Recusa, com o motivo por extenso, quando o Silo tem endereço publicado,
 * quando já virou SiloDNA/SiloPage, quando há ArticleDNA aprovado com keyword
 * dele ou quando uma keyword membro é publicada (publicada não é remanejada
 * por aqui, como na decisão de Silo).
 *
 * Domínio puro: sem rede, sem React. O servidor lê o banco e chama
 * `planTerritoryUndo`; a tela chama `territoryUndoRefusals` para mostrar o
 * botão e o motivo antes do clique. O servidor é a autoridade.
 */

import { canTransitionTerritoryLifecycle, type TerritoryCandidate } from "./territory.ts";
import { humanSiloDecision } from "./silo-assignment.ts";
import type { KeywordTerritoryDecision } from "./territory.ts";

export const TERRITORY_UNDO_REFUSAL_CODES = [
  "NOT_UNDOABLE_STATE",
  "CONSOLIDATED",
  "PUBLISHED_ADDRESS",
  "EXISTING_SILO",
  "PUBLISHED_KEYWORD",
  "KEYWORD_NOT_EDITABLE",
  "APPROVED_ARTICLE_DNA",
  "APPROVED_SILO_ARTIFACT",
] as const;
export type TerritoryUndoRefusalCode = (typeof TERRITORY_UNDO_REFUSAL_CODES)[number];
export type TerritoryUndoRefusal = { code: TerritoryUndoRefusalCode; message: string };

/** Motivo gravado em cada keyword que sai do Silo desfeito. */
export const TERRITORY_UNDO_KEYWORD_REASON = "Decisão humana: Silo sugerido desfeito; a keyword volta para sem Silo.";

export type TerritoryUndoTerritory = Pick<TerritoryCandidate,
  | "territoryRef"
  | "name"
  | "centralEntity"
  | "lifecycleStatus"
  | "publicationProtection"
  | "slugState"
  | "existingSiloRef"
  | "consolidation"
> & { publishedStructureRef?: TerritoryCandidate["publishedStructureRef"] };

export type TerritoryUndoMember = {
  keywordId: string;
  label?: string | null;
  isPublished: boolean;
  /** `false` quando o item de workflow não está editável pelo Arquiteto. */
  editable?: boolean;
};

export type TerritoryUndoApprovedArticle = {
  articleId: string;
  label?: string | null;
  territoryRef: string | null;
  keywordIds: readonly string[];
};

export type TerritoryUndoSiloArtifact = {
  kind: "silo_dna" | "silo_page";
  territoryRef: string | null;
  status: string;
  /** SiloPage com `publicationStatus: "published"`. */
  published?: boolean;
};

const ARTIFACT_BLOCKING_STATUSES = new Set(["approved", "consolidated"]);

/** Nome que a pessoa reconhece; o ref técnico só aparece se não houver outro. */
export function territoryUndoLabel(territory: Pick<TerritoryUndoTerritory, "territoryRef" | "name" | "centralEntity">): string {
  return territory.name?.trim() || territory.centralEntity?.trim() || "Silo sem nome";
}

/**
 * Endereço publicado = o Silo já está no ar (ou veio de uma página que está).
 * Esse Silo nunca é "sugerido": o site o declara, e desfazer não se aplica.
 */
export function territoryHasPublishedAddress(territory: TerritoryUndoTerritory): boolean {
  return Boolean(
    territory.slugState.publishedSlug
    || territory.slugState.publishedCanonical
    || territory.publicationProtection === "protected"
    || territory.publishedStructureRef,
  );
}

const lista = (itens: readonly string[], max = 5) =>
  itens.slice(0, max).join(", ") + (itens.length > max ? ` e mais ${itens.length - max}` : "");

/**
 * Todos os motivos pelos quais este Silo NÃO pode ser desfeito agora. Lista
 * vazia = pode. Cada motivo é uma frase curta, pronta para a tela.
 */
export function territoryUndoRefusals(input: {
  territory: TerritoryUndoTerritory;
  members: readonly TerritoryUndoMember[];
  approvedArticles: readonly TerritoryUndoApprovedArticle[];
  siloArtifacts: readonly TerritoryUndoSiloArtifact[];
}): TerritoryUndoRefusal[] {
  const { territory } = input;
  const refusals: TerritoryUndoRefusal[] = [];
  const ref = territory.territoryRef;

  if (territory.lifecycleStatus === "consolidated" || territory.consolidation) {
    refusals.push({ code: "CONSOLIDATED", message: "Este Silo já foi consolidado (tem SiloDNA e SiloPage). Silo consolidado não se desfaz por aqui." });
  } else if (territory.lifecycleStatus !== "candidate" && territory.lifecycleStatus !== "confirmed") {
    refusals.push({ code: "NOT_UNDOABLE_STATE", message: territory.lifecycleStatus === "rejected"
      ? "Este Silo já foi desfeito."
      : `Este Silo está "${territory.lifecycleStatus}" e não pode ser desfeito.` });
  } else {
    const transicao = canTransitionTerritoryLifecycle(territory.lifecycleStatus, "rejected");
    if (!transicao.allowed) refusals.push({ code: "NOT_UNDOABLE_STATE", message: transicao.reason });
  }

  if (territoryHasPublishedAddress(territory)) {
    const endereco = territory.slugState.publishedCanonical || territory.slugState.publishedSlug;
    refusals.push({ code: "PUBLISHED_ADDRESS", message: `Este Silo tem endereço publicado${endereco ? ` (${endereco})` : ""}. Silo publicado continua ativo.` });
  }
  if (territory.existingSiloRef) {
    refusals.push({ code: "EXISTING_SILO", message: "Este Silo já tem SiloDNA registrado. Ele não é uma sugestão nova." });
  }

  const publicadas = input.members.filter(member => member.isPublished);
  if (publicadas.length) {
    refusals.push({ code: "PUBLISHED_KEYWORD", message: `${publicadas.length} keyword(s) publicada(s) estão neste Silo (${lista(publicadas.map(member => member.label || member.keywordId))}). Publicada não muda de Silo por aqui.` });
  }
  const travadas = input.members.filter(member => member.editable === false);
  if (travadas.length) {
    refusals.push({ code: "KEYWORD_NOT_EDITABLE", message: `${travadas.length} keyword(s) deste Silo não estão editáveis no Arquiteto agora (${lista(travadas.map(member => member.label || member.keywordId))}).` });
  }

  const membros = new Set(input.members.map(member => member.keywordId));
  const artigos = input.approvedArticles.filter(article =>
    article.territoryRef === ref || article.keywordIds.some(keywordId => membros.has(keywordId)));
  if (artigos.length) {
    refusals.push({ code: "APPROVED_ARTICLE_DNA", message: `${artigos.length} artigo(s) aprovado(s) usam keywords deste Silo (${lista(artigos.map(article => article.label || article.articleId))}). Desfaça ou refaça o artigo antes.` });
  }

  const artefatos = input.siloArtifacts.filter(artifact =>
    artifact.territoryRef === ref && (ARTIFACT_BLOCKING_STATUSES.has(artifact.status) || artifact.published));
  if (artefatos.length) {
    refusals.push({ code: "APPROVED_SILO_ARTIFACT", message: `Este Silo já tem ${artefatos.map(artifact => artifact.kind === "silo_dna" ? "SiloDNA" : "SiloPage").join(" e ")} aprovado(s). Silo aprovado não se desfaz por aqui.` });
  }

  return refusals;
}

export type TerritoryUndoPlan =
  | { ok: false; refusals: TerritoryUndoRefusal[] }
  | {
    ok: true;
    /** O território inteiro, já em `rejected`, para o writer territorial com lock. */
    territoryDraft: Record<string, unknown>;
    /** A mesma decisão humana "sem Silo" da aba Silos, para cada membro. */
    keywordDecision: KeywordTerritoryDecision;
    memberKeywordIds: string[];
  };

/**
 * O plano da gravação. Ator e hora são do SERVIDOR: a tela nunca os declara.
 * Nada é apagado — o território fica no banco como `rejected`, com o motivo.
 */
export function planTerritoryUndo(input: {
  territory: TerritoryCandidate;
  members: readonly TerritoryUndoMember[];
  approvedArticles: readonly TerritoryUndoApprovedArticle[];
  siloArtifacts: readonly TerritoryUndoSiloArtifact[];
  actorUserId: string;
  decidedAt: string;
}): TerritoryUndoPlan {
  const refusals = territoryUndoRefusals(input);
  if (refusals.length) return { ok: false, refusals };
  const memberKeywordIds = [...new Set(input.members.map(member => member.keywordId))].sort();
  const registro = `Silo sugerido desfeito por decisão humana em ${input.decidedAt} (ator ${input.actorUserId}). Nada foi apagado; ${memberKeywordIds.length} keyword(s) voltaram para sem Silo.`;
  return {
    ok: true,
    territoryDraft: {
      ...input.territory,
      lifecycleStatus: "rejected",
      decisionState: "rejected",
      reasons: [...input.territory.reasons, registro],
      provenance: { ...input.territory.provenance, humanAdjustmentCount: input.territory.provenance.humanAdjustmentCount + 1 },
    },
    keywordDecision: humanSiloDecision("unassigned", TERRITORY_UNDO_KEYWORD_REASON, input.decidedAt),
    memberKeywordIds,
  };
}

export type TerritoryUndoOutcome = "applied" | "partial" | "refused";

/**
 * O desfecho vem da RELEITURA, nunca da resposta da gravação: aplicado só
 * quando o território voltou `rejected` e nenhuma keyword aponta mais para ele.
 */
export function resolveTerritoryUndoOutcome(input: {
  territoryRef: string;
  readbackLifecycle: string | null;
  /** Keywords que estavam no Silo antes da gravação. */
  expectedMemberIds: readonly string[];
  /** Keywords que, na releitura, ainda apontam para este território. */
  readbackMemberIds: readonly string[];
}): { outcome: TerritoryUndoOutcome; remaining: string[] } {
  const remaining = [...new Set(input.readbackMemberIds)].sort();
  const rejeitado = input.readbackLifecycle === "rejected";
  if (rejeitado && !remaining.length) return { outcome: "applied", remaining };
  const nadaMudou = !rejeitado && input.expectedMemberIds.every(keywordId => remaining.includes(keywordId));
  return { outcome: nadaMudou ? "refused" : "partial", remaining };
}
