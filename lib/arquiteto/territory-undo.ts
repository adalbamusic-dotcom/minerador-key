/**
 * DESFAZER SILO — decisão humana; nada de histórico é apagado.
 *
 * Um botão só ("Desfazer Silo", aba Silos), um núcleo só (este módulo + o
 * servidor `lib/server/arquiteto-territory-undo.ts`), os writers de sempre. O
 * MESMO núcleo desmonta o Arquiteto quando o Minerador exclui as keywords de
 * uma cor ou de uma seleção ("Excluir" / "Excluir tudo da cor").
 *
 *   SILO SUGERIDO (candidato/confirmado, sem artigo aprovado, sem par, fora do
 *   plano, sem nada publicado nem adiante) — como sempre:
 *     TERRITÓRIO  confirmed/candidate → rejected, com o motivo, o ator e a
 *                 hora nos `reasons`;
 *     KEYWORDS    cada membro volta para "sem Silo" pela MESMA decisão humana
 *                 da aba Silos (`humanSiloDecision`, estado `unassigned`).
 *
 *   SILO INTEIRO (2026-10-18). Primeiro a decisão "Manter em duas etapas"; no
 *   mesmo dia, a decisão do dono que a amplia (literal): "tem que poder apagar
 *   sim não interessa qual seja o estado, isso está no contrato global, tudo
 *   tem que poder ser apagado e claro com instâncias de seleção e confirmação,
 *   e alerta falando o que está apagando". Nenhum estado recusa mais: o Silo
 *   consolidado, do plano, com par ou artigos aprovados, com o Pilar, com
 *   artigo publicado ou que já seguiu para o Radar/Redator sai inteiro:
 *     ARTIGOS     o evento `rejected` na versão vigente de cada ArticleDNA do
 *                 Silo (o mesmo evento e o mesmo writer de "Retirar artigo do
 *                 Silo"); a versão fica como histórico (CANONICAL_HISTORY);
 *     PAR         o evento `rejected` na versão vigente do SiloDNA e da
 *                 SiloPage (nada é apagado, a versão fica como histórico);
 *     GRAFO       o grafo de links aprovado foi feito sobre esse par: deixa de
 *                 valer junto com ele (o grafo só é vigente sobre o par
 *                 vigente — `findApprovedGraphForSilo`); nada é regravado;
 *     ADIANTE     o item do artigo no Radar (e no Redator/Publicações, quando
 *                 há item de esteira) sai da operação — estado `withdrawn`,
 *                 com o registro; a investigação fica como histórico;
 *     PUBLICADO   a página no site, a URL, o slug e o canonical NÃO mudam
 *                 (nada é despublicado); no Arquiteto o artigo sai de vigência;
 *                 excluir a keyword publicada é no Minerador, na lixeira de 24 h;
 *     TERRITÓRIO  consolidated/confirmed/candidate → rejected; a consolidação
 *                 sai do território e fica registrada nos `reasons`;
 *     GRUPO       `editorial_groups.silo_id` desligado e as etiquetas de cor dos
 *                 artigos retirados tiradas (os writers de sempre); o plano do
 *                 cadastro fica no Minerador.
 *   Pede a confirmação forte: o nome do Silo digitado, sobre a prévia vigente
 *   (`decisionHash`). A prévia É o alerta: diz, por área, tudo o que sai ou
 *   deixa de valer, com os nomes.
 *
 * Só recusa o que não tem o que desfazer: o Silo já desfeito (rejected),
 * substituído ou arquivado.
 *
 * Domínio puro: sem rede, sem React. O servidor lê o banco e chama
 * `planTerritoryUndo`; a tela chama `territoryUndoRefusals` e
 * `territoryUndoWholeSiloReasons` para mostrar o botão antes do clique. O
 * servidor é a autoridade.
 */

import { type TerritoryCandidate } from "./territory.ts";
import { humanSiloDecision } from "./silo-assignment.ts";
import type { KeywordTerritoryDecision } from "./territory.ts";
import type { VersionStatusEvent } from "./contracts.ts";
import { deterministicUuid } from "./silo-article-withdrawal.ts";

/*
 * 2026-10-18 · SUBSTITUÍDOS (AGENTS.md §0.5), na ordem do dia:
 *  - de manhã: CONSOLIDATED, DECLARED_PLAN_SILO ("Tirar do plano/Substituir o plano no Minerador"),
 *    APPROVED_ARTICLE_DNA ("Desfaça ou refaça o artigo antes") e APPROVED_SILO_ARTIFACT;
 *  - depois (decisão do dono "tem que poder apagar … não interessa qual seja o estado"): PUBLISHED_ADDRESS,
 *    EXISTING_SILO, PUBLISHED_KEYWORD, KEYWORD_NOT_EDITABLE, ARTICLE_OF_OTHER_SILO, ARTICLE_PUBLISHED e
 *    ARTICLE_IN_DOWNSTREAM — viraram LINHAS da prévia (o alerta), nunca recusa.
 * Fica só NOT_UNDOABLE_STATE: o Silo já desfeito, substituído ou arquivado (não há o que desfazer).
 */
export const TERRITORY_UNDO_REFUSAL_CODES = ["NOT_UNDOABLE_STATE"] as const;
export type TerritoryUndoRefusalCode = (typeof TERRITORY_UNDO_REFUSAL_CODES)[number];
export type TerritoryUndoRefusal = { code: TerritoryUndoRefusalCode; message: string };

/** Motivo gravado em cada keyword que sai do Silo desfeito. */
export const TERRITORY_UNDO_KEYWORD_REASON = "Decisão humana: Silo sugerido desfeito; a keyword volta para sem Silo.";
/** O mesmo, quando o Silo desfeito é o Silo inteiro (com artigos, par ou plano). */
export const TERRITORY_UNDO_WHOLE_SILO_KEYWORD_REASON = "Decisão humana: Silo inteiro desfeito; a keyword volta para sem Silo.";

/** Rótulos da tela e do catálogo do MCP: um texto só. */
export const TERRITORY_UNDO_ACTION_LABEL = "Desfazer Silo" as const;

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
  /** `false` quando o item de workflow não está editável pelo Arquiteto (fica como está; a prévia diz). */
  editable?: boolean;
};

/**
 * Um ArticleDNA (a versão vigente) que pode ser deste Silo. Os campos depois de
 * `keywordIds` são aditivos: o servidor lê do banco; a tela pode omitir (vale
 * "approved", não publicado, sem etapa posterior).
 */
export type TerritoryUndoApprovedArticle = {
  articleId: string;
  label?: string | null;
  territoryRef: string | null;
  keywordIds: readonly string[];
  siloId?: string | null;
  versionId?: string;
  versionNumber?: number;
  /** Status efetivo da versão vigente (o último evento; sem evento, o da linha). Ausente = "approved". */
  status?: string;
  /** A versão vigente carrega identidade publicada (`publishedIdentityRef`). */
  published?: boolean;
  /** Etapas posteriores onde o artigo já tem item (`radar`, `writer`, `publications`). */
  downstreamStages?: readonly string[];
};

export type TerritoryUndoSiloArtifact = {
  kind: "silo_dna" | "silo_page";
  territoryRef: string | null;
  /** Status efetivo da versão vigente. */
  status: string;
  /** SiloPage com `publicationStatus: "published"`. */
  published?: boolean;
  siloId?: string | null;
  versionId?: string;
  versionNumber?: number;
  /** Só SiloDNA: a composição vigente. */
  pillarArticleId?: string | null;
  articleIds?: readonly string[];
};

/** O grafo de links aprovado do Silo (só para a prévia dizer que ele deixa de valer). */
export type TerritoryUndoLinkGraph = { graphVersionId: string; versionNumber: number; siloId: string };
/** O grupo editorial ligado a este Silo (`editorial_groups.silo_id`). */
export type TerritoryUndoLinkedGroup = { groupId: string; groupLabel: string; siloId: string };

export type TerritoryUndoInput = {
  territory: TerritoryUndoTerritory;
  members: readonly TerritoryUndoMember[];
  approvedArticles: readonly TerritoryUndoApprovedArticle[];
  siloArtifacts: readonly TerritoryUndoSiloArtifact[];
  /** O grupo com plano declarado de quem este é o Silo (`declaredPlanSiloGroupFor`), quando é. */
  declaredPlan?: { groupLabel: string; siloName: string } | null;
};

export type TerritoryUndoWholeSiloReason = "consolidated" | "declared_plan" | "silo_pair" | "approved_articles" | "published" | "downstream" | "existing_silo";

/** Status que tiram a versão de vigência: ela não cita mais nada nem é desfeita de novo. */
const FORA_DE_VIGENCIA = new Set(["rejected", "superseded"]);
/** Par SiloDNA/SiloPage que já é Silo de verdade (não proposta). */
const PAR_DE_VERDADE = new Set(["approved", "consolidated"]);

/** O nome de cada etapa posterior, na língua da tela. */
export const TERRITORY_UNDO_DOWNSTREAM_LABELS: Record<string, string> = { radar: "Radar", writer: "Redator", publications: "Publicações" };

/** Nome que a pessoa reconhece; o ref técnico só aparece se não houver outro. */
export function territoryUndoLabel(territory: Pick<TerritoryUndoTerritory, "territoryRef" | "name" | "centralEntity">): string {
  return territory.name?.trim() || territory.centralEntity?.trim() || "Silo sem nome";
}

/** Endereço publicado = o Silo já está no ar (ou veio de uma página que está). */
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
const entreAspas = (itens: readonly string[], max = 5) => lista(itens.map(item => `“${item}”`), max);

/** Os ids de Silo deste território: ele mesmo, o da consolidação, o do registro anterior e os dos artefatos que apontam para ele. */
function siloIdsOf(input: Pick<TerritoryUndoInput, "territory" | "siloArtifacts">): Set<string> {
  const ref = input.territory.territoryRef;
  const ids = new Set<string>([ref]);
  if (input.territory.consolidation?.siloId) ids.add(input.territory.consolidation.siloId);
  if (input.territory.existingSiloRef?.siloId) ids.add(input.territory.existingSiloRef.siloId);
  for (const artifact of input.siloArtifacts) if (artifact.territoryRef === ref && artifact.siloId) ids.add(artifact.siloId);
  return ids;
}

/** Os SiloDNA/SiloPage vigentes deste Silo (pelo território ou pelo id do Silo), fora os já rejeitados. */
export function territoryUndoSiloArtifactsOf(input: Pick<TerritoryUndoInput, "territory" | "siloArtifacts">): TerritoryUndoSiloArtifact[] {
  const ref = input.territory.territoryRef;
  const ids = siloIdsOf(input);
  return input.siloArtifacts.filter(artifact =>
    (artifact.territoryRef === ref || Boolean(artifact.siloId && ids.has(artifact.siloId)))
    && !FORA_DE_VIGENCIA.has(artifact.status));
}

/**
 * Os artigos (versão vigente, fora os já rejeitados) DESTE Silo e os de OUTRO
 * Silo que usam keyword dele. Do Silo: aponta para ele (território ou id do
 * Silo), está na composição do SiloDNA vigente ou usa keyword membro sem
 * apontar para outro Silo.
 */
export function classifyTerritoryUndoArticles(input: TerritoryUndoInput): { ofSilo: TerritoryUndoApprovedArticle[]; ofOtherSilo: TerritoryUndoApprovedArticle[] } {
  const ref = input.territory.territoryRef;
  const ids = siloIdsOf(input);
  const membros = new Set(input.members.map(member => member.keywordId));
  const composicao = new Set(territoryUndoSiloArtifactsOf(input)
    .filter(artifact => artifact.kind === "silo_dna")
    .flatMap(artifact => [artifact.pillarArticleId, ...(artifact.articleIds || [])].filter((id): id is string => Boolean(id))));
  const ofSilo: TerritoryUndoApprovedArticle[] = [];
  const ofOtherSilo: TerritoryUndoApprovedArticle[] = [];
  const vistos = new Set<string>();
  for (const article of input.approvedArticles) {
    if (FORA_DE_VIGENCIA.has(article.status ?? "approved")) continue;
    if (vistos.has(article.articleId)) continue;
    const aponta = article.territoryRef === ref || Boolean(article.siloId && ids.has(article.siloId));
    const usa = article.keywordIds.some(keywordId => membros.has(keywordId));
    const outro = Boolean((article.territoryRef && article.territoryRef !== ref) || (article.siloId && !ids.has(article.siloId)));
    if (aponta || composicao.has(article.articleId) || (usa && !outro)) { ofSilo.push(article); vistos.add(article.articleId); }
    else if (usa) { ofOtherSilo.push(article); vistos.add(article.articleId); }
  }
  return { ofSilo, ofOtherSilo };
}

/**
 * Por que este Silo é desfeito INTEIRO (prévia + confirmação forte), e não
 * como sugestão. Lista vazia = Silo sugerido (o de sempre).
 */
export function territoryUndoWholeSiloReasons(input: TerritoryUndoInput): TerritoryUndoWholeSiloReason[] {
  const reasons: TerritoryUndoWholeSiloReason[] = [];
  const artefatos = territoryUndoSiloArtifactsOf(input);
  const { ofSilo } = classifyTerritoryUndoArticles(input);
  if (input.territory.lifecycleStatus === "consolidated" || input.territory.consolidation) reasons.push("consolidated");
  if (input.declaredPlan) reasons.push("declared_plan");
  if (artefatos.some(artifact => PAR_DE_VERDADE.has(artifact.status) || artifact.published)) reasons.push("silo_pair");
  if (ofSilo.some(article => (article.status ?? "approved") === "approved")) reasons.push("approved_articles");
  if (territoryHasPublishedAddress(input.territory) || artefatos.some(artifact => artifact.published) || input.members.some(member => member.isPublished) || ofSilo.some(article => article.published)) reasons.push("published");
  if (ofSilo.some(article => article.downstreamStages?.length)) reasons.push("downstream");
  if (input.territory.existingSiloRef) reasons.push("existing_silo");
  return reasons;
}

/** O porquê do Silo inteiro, numa frase curta para a tela. */
export function territoryUndoWholeSiloSentence(reasons: readonly TerritoryUndoWholeSiloReason[]): string {
  const partes = reasons.map(reason => reason === "consolidated" ? "consolidado"
    : reason === "declared_plan" ? "do plano declarado"
    : reason === "silo_pair" ? "com SiloDNA e SiloPage"
    : reason === "approved_articles" ? "com artigos aprovados"
    : reason === "published" ? "com algo publicado"
    : reason === "downstream" ? "com artigo já no Radar ou depois"
    : "registro de um Silo que já existia");
  return `Silo ${partes.join(", ")}: sai inteiro (artigos, Pilar incluído), com a prévia do que sai e a confirmação forte.`;
}

function etapasDe(article: TerritoryUndoApprovedArticle): string {
  const nomes = [...new Set((article.downstreamStages || []).map(stage => TERRITORY_UNDO_DOWNSTREAM_LABELS[stage] || stage))];
  return nomes.length > 1 ? `${nomes.slice(0, -1).join(", ")} e ${nomes.at(-1)}` : nomes[0] || "outra etapa";
}

/**
 * O que NÃO pode ser desfeito agora: só o que não tem o que desfazer (o Silo
 * já desfeito, substituído ou arquivado). Lista vazia = pode.
 */
export function territoryUndoRefusals(input: TerritoryUndoInput): TerritoryUndoRefusal[] {
  const estado = input.territory.lifecycleStatus;
  if (estado === "rejected") return [{ code: "NOT_UNDOABLE_STATE", message: "Este Silo já foi desfeito." }];
  if (estado !== "candidate" && estado !== "confirmed" && estado !== "consolidated") {
    return [{ code: "NOT_UNDOABLE_STATE", message: `Este Silo está "${estado}": não há o que desfazer.` }];
  }
  return [];
}

/**
 * O ALERTA: o que é publicado, adiante, de outro Silo ou fora da etapa — cada
 * coisa numa frase, para a prévia. Nada aqui recusa (2026-10-18).
 */
export function territoryUndoNotices(input: TerritoryUndoInput): string[] {
  const avisos: string[] = [];
  const { territory } = input;
  const { ofSilo, ofOtherSilo } = classifyTerritoryUndoArticles(input);
  if (territoryHasPublishedAddress(territory)) {
    const endereco = territory.slugState.publishedCanonical || territory.slugState.publishedSlug;
    avisos.push(`Publicado: o Silo tem endereço no site${endereco ? ` (${endereco})` : ""}. A página no site, a URL, o slug e o canonical não mudam (nada é despublicado); no Arquiteto ele sai de vigência.`);
  }
  if (territoryUndoSiloArtifactsOf(input).some(artifact => artifact.kind === "silo_page" && artifact.published)) {
    avisos.push("Publicado: a SiloPage está publicada. A página no site não muda; a versão sai de vigência no Arquiteto e fica como histórico.");
  }
  const publicados = ofSilo.filter(article => article.published);
  if (publicados.length) {
    avisos.push(`Publicado: ${publicados.length} artigo(s) deste Silo estão no ar (${entreAspas(publicados.map(article => article.label || article.articleId))}). No site nada muda (URL, slug e canonical ficam); no Arquiteto o ArticleDNA sai de vigência. Excluir a keyword publicada é no Minerador, na lixeira de 24 h.`);
  }
  const keywordsPublicadas = input.members.filter(member => member.isPublished);
  if (keywordsPublicadas.length) {
    avisos.push(`Publicada: ${keywordsPublicadas.length} keyword(s) (${entreAspas(keywordsPublicadas.map(member => member.label || member.keywordId))}) saem do Silo no Arquiteto; URL, slug e canonical não mudam.`);
  }
  for (const article of ofSilo.filter(item => item.downstreamStages?.length)) {
    avisos.push(`Adiante: “${article.label || article.articleId}” está no ${etapasDe(article)} — o item sai da operação (“retirado”); a investigação e o documento ficam como histórico.`);
  }
  if (ofOtherSilo.length) {
    avisos.push(`De outro Silo: ${ofOtherSilo.length} artigo(s) (${entreAspas(ofOtherSilo.map(article => article.label || article.articleId))}) usam keyword deste Silo e ficam como estão (a keyword só sai deste Silo).`);
  }
  const foraDaEtapa = input.members.filter(member => member.editable === false);
  if (foraDaEtapa.length) {
    avisos.push(`Fora da etapa do Arquiteto: ${foraDaEtapa.length} keyword(s) (${entreAspas(foraDaEtapa.map(member => member.label || member.keywordId))}) ficam como estão.`);
  }
  if (territory.existingSiloRef) {
    avisos.push("Este Silo é o registro de um Silo que já existia antes dele: o SiloDNA de origem também sai de vigência (fica como histórico).");
  }
  return avisos;
}

export type TerritoryUndoWholeSiloPlan = {
  reasons: TerritoryUndoWholeSiloReason[];
  siloName: string;
  /** O que a pessoa digita para confirmar (`typedConfirmationMatches`). */
  confirmationName: string;
  articles: Array<{ articleId: string; versionId: string; versionNumber: number | null; label: string; role: "Pilar" | "Suporte" | null; published: boolean; downstreamStages: string[] }>;
  pair: Array<{ kind: "silo_dna" | "silo_page"; versionId: string; versionNumber: number | null; siloId: string | null }>;
  linkGraphs: TerritoryUndoLinkGraph[];
  group: TerritoryUndoLinkedGroup | null;
  memberCount: number;
  /** O alerta: publicado, adiante, de outro Silo, fora da etapa. */
  notices: string[];
  /** O que sai, em frases, na ordem da prévia (o alerta incluído). */
  lines: string[];
};

export type TerritoryUndoPlan =
  | { ok: false; refusals: TerritoryUndoRefusal[] }
  | {
    ok: true;
    /** "suggested" = o de sempre; "whole_silo" = o Silo inteiro (artigos, par, grafo, adiante, grupo). */
    scope: "suggested" | "whole_silo";
    /** O território inteiro, já em `rejected`, para o writer territorial com lock. */
    territoryDraft: Record<string, unknown>;
    /** A mesma decisão humana "sem Silo" da aba Silos, para cada membro editável. */
    keywordDecision: KeywordTerritoryDecision;
    memberKeywordIds: string[];
    wholeSilo: TerritoryUndoWholeSiloPlan | null;
  };

const versao = (numero: number | null | undefined) => (typeof numero === "number" ? ` v${numero}` : "");

/** As frases da prévia do Silo inteiro, por área (nada pago; nada de histórico apagado). */
export function territoryUndoWholeSiloLines(plan: Omit<TerritoryUndoWholeSiloPlan, "lines">): string[] {
  const linhas: string[] = [];
  const pilar = plan.articles.some(article => article.role === "Pilar");
  linhas.push(plan.articles.length
    ? `Artigos: ${plan.articles.length} saem do Silo${pilar ? " (Pilar incluído)" : ""} — a versão vigente de cada ArticleDNA recebe o status “rejeitado”, com o motivo; nenhuma versão é apagada.`
    : "Artigos: nenhum ArticleDNA vigente neste Silo.");
  for (const article of plan.articles) linhas.push(`${article.role ?? "Artigo"} · “${article.label}”${versao(article.versionNumber)}${article.published ? " · publicado (no site nada muda)" : ""}${article.downstreamStages.length ? ` · no ${article.downstreamStages.map(stage => TERRITORY_UNDO_DOWNSTREAM_LABELS[stage] || stage).join(" e ")} (sai da operação)` : ""}`);
  const dna = plan.pair.find(item => item.kind === "silo_dna");
  const page = plan.pair.find(item => item.kind === "silo_page");
  linhas.push(dna || page
    ? `${[dna ? `SiloDNA${versao(dna.versionNumber)}` : null, page ? `SiloPage${versao(page.versionNumber)}` : null].filter(Boolean).join(" e ")}: deixa${dna && page ? "m" : ""} de valer (status “rejeitado”); as versões ficam como histórico.`
    : "SiloDNA e SiloPage: este Silo não tem o par vigente.");
  for (const graph of plan.linkGraphs) linhas.push(`Grafo de links internos${versao(graph.versionNumber)} (aprovado): deixa de valer junto com o par em que foi feito; nada é regravado.`);
  linhas.push(`Território “${plan.siloName}”: vira desfeito (rejeitado), com o motivo, o ator e a hora; ${plan.memberCount} keyword(s) voltam para “sem Silo” e continuam na mesa.`);
  if (plan.group) linhas.push(`Grupo ${plan.group.groupLabel}: desligado deste Silo, e os artigos retirados perdem a etiqueta da cor. O plano do cadastro continua no Minerador (“Recriar o Silo do plano” traz o Silo de volta).`);
  linhas.push(...plan.notices);
  linhas.push("Custo: nenhum (nada é pago).");
  linhas.push("As keywords continuam no Minerador; para excluí-las, “Excluir” ou “Excluir tudo da cor” lá, com uma prévia nova.");
  return linhas;
}

/**
 * O plano da gravação. Ator e hora são do SERVIDOR: a tela nunca os declara.
 * Nada de histórico é apagado — o território fica no banco como `rejected`.
 */
export function planTerritoryUndo(input: TerritoryUndoInput & {
  territory: TerritoryCandidate;
  /** Só para o Silo inteiro: o grafo aprovado e o grupo ligado (o servidor lê). */
  linkGraphs?: readonly TerritoryUndoLinkGraph[];
  linkedGroup?: TerritoryUndoLinkedGroup | null;
  actorUserId: string;
  decidedAt: string;
}): TerritoryUndoPlan {
  const refusals = territoryUndoRefusals(input);
  if (refusals.length) return { ok: false, refusals };
  // Só o membro editável recebe a decisão de Silo; o de fora da etapa fica (a prévia diz).
  const memberKeywordIds = [...new Set(input.members.filter(member => member.editable !== false).map(member => member.keywordId))].sort();
  const reasons = territoryUndoWholeSiloReasons(input);
  const humano = { ...input.territory.provenance, humanAdjustmentCount: input.territory.provenance.humanAdjustmentCount + 1 };

  if (!reasons.length) {
    const registro = `Silo sugerido desfeito por decisão humana em ${input.decidedAt} (ator ${input.actorUserId}). Nada foi apagado; ${memberKeywordIds.length} keyword(s) voltaram para sem Silo.`;
    return {
      ok: true,
      scope: "suggested",
      territoryDraft: {
        ...input.territory,
        lifecycleStatus: "rejected",
        decisionState: "rejected",
        reasons: [...input.territory.reasons, registro],
        provenance: humano,
      },
      keywordDecision: humanSiloDecision("unassigned", TERRITORY_UNDO_KEYWORD_REASON, input.decidedAt),
      memberKeywordIds,
      wholeSilo: null,
    };
  }

  const nome = territoryUndoLabel(input.territory);
  const artefatos = territoryUndoSiloArtifactsOf(input);
  const dnaVigente = artefatos.find(artifact => artifact.kind === "silo_dna");
  const suportes = new Set(dnaVigente?.articleIds || []);
  const { ofSilo } = classifyTerritoryUndoArticles(input);
  const semVersao = ofSilo.filter(article => !article.versionId);
  if (semVersao.length) {
    return { ok: false, refusals: [{ code: "NOT_UNDOABLE_STATE", message: `A leitura de ${semVersao.length} artigo(s) deste Silo está incompleta (${lista(semVersao.map(article => article.label || article.articleId))}); recarregue e abra a prévia de novo.` }] };
  }
  const articles = ofSilo
    .map(article => ({
      articleId: article.articleId,
      versionId: article.versionId as string,
      versionNumber: article.versionNumber ?? null,
      label: article.label?.trim() || article.articleId,
      role: dnaVigente?.pillarArticleId === article.articleId ? "Pilar" as const : suportes.has(article.articleId) ? "Suporte" as const : null,
      published: Boolean(article.published),
      downstreamStages: [...new Set(article.downstreamStages || [])].sort(),
    }))
    .sort((a, b) => Number(b.role === "Pilar") - Number(a.role === "Pilar") || a.label.localeCompare(b.label, "pt-BR"));
  const pair = artefatos
    .filter((artifact): artifact is TerritoryUndoSiloArtifact & { versionId: string } => Boolean(artifact.versionId))
    .map(artifact => ({ kind: artifact.kind, versionId: artifact.versionId, versionNumber: artifact.versionNumber ?? null, siloId: artifact.siloId ?? null }))
    .sort((a, b) => a.kind.localeCompare(b.kind));
  const base = {
    reasons,
    siloName: nome,
    confirmationName: nome,
    articles,
    pair,
    linkGraphs: [...(input.linkGraphs || [])],
    group: input.linkedGroup ?? null,
    memberCount: memberKeywordIds.length,
    notices: territoryUndoNotices(input),
  };
  const wholeSilo: TerritoryUndoWholeSiloPlan = { ...base, lines: territoryUndoWholeSiloLines(base) };

  const consolidacao = input.territory.consolidation;
  const adiante = articles.filter(article => article.downstreamStages.length);
  const registro = [
    `Silo inteiro desfeito por decisão humana em ${input.decidedAt} (ator ${input.actorUserId}):`,
    `${articles.length} artigo(s) retirado(s) (evento “rejeitado” na versão vigente${articles.some(article => article.role === "Pilar") ? ", Pilar incluído" : ""});`,
    pair.length ? `${pair.map(item => `${item.kind === "silo_dna" ? "SiloDNA" : "SiloPage"} ${item.versionId}${versao(item.versionNumber)}`).join(" e ")} fora de vigência (evento “rejeitado”);` : "",
    consolidacao ? `a consolidação registrada (SiloDNA ${consolidacao.siloDnaVersionRef.versionId} v${consolidacao.siloDnaVersionRef.versionNumber}, SiloPage ${consolidacao.siloPageVersionRef.versionId} v${consolidacao.siloPageVersionRef.versionNumber}, em ${consolidacao.consolidatedAt}) fica como histórico aqui;` : "",
    adiante.length ? `${adiante.length} item(ns) adiante (Radar/Redator/Publicações) retirado(s) da operação;` : "",
    input.linkedGroup ? `o grupo ${input.linkedGroup.groupLabel} desligado do Silo;` : "",
    `nada de histórico foi apagado; ${memberKeywordIds.length} keyword(s) voltaram para sem Silo.`,
  ].filter(Boolean).join(" ");
  return {
    ok: true,
    scope: "whole_silo",
    territoryDraft: {
      ...input.territory,
      lifecycleStatus: "rejected",
      decisionState: "rejected",
      // O território desfeito não carrega consolidação (o contrato só a aceita em consolidated/superseded/archived);
      // as versões do par continuam no banco, rejeitadas, e o registro acima diz quais eram.
      consolidation: null,
      reasons: [...input.territory.reasons, registro],
      provenance: humano,
    },
    keywordDecision: humanSiloDecision("unassigned", TERRITORY_UNDO_WHOLE_SILO_KEYWORD_REASON, input.decidedAt),
    memberKeywordIds,
    wholeSilo,
  };
}

/**
 * Os eventos `rejected` do Silo inteiro: um por ArticleDNA vigente e um por
 * versão vigente do par. Id determinístico pela versão e pelo território:
 * repetir depois de uma falha não duplica o evento.
 */
export async function buildTerritoryUndoRejections(plan: TerritoryUndoWholeSiloPlan, input: { territoryRef: string; actorId: string; occurredAt: string }): Promise<VersionStatusEvent[]> {
  const eventos: VersionStatusEvent[] = [];
  for (const article of plan.articles) {
    eventos.push({
      eventId: await deterministicUuid(`territory-undo|${article.versionId}|${input.territoryRef}`),
      versionId: article.versionId,
      status: "rejected",
      actorId: input.actorId,
      reason: `Silo “${plan.siloName}” desfeito inteiro por decisão humana: o artigo${article.role === "Pilar" ? " (Pilar)" : ""} sai junto. Nada é apagado.`,
      occurredAt: input.occurredAt,
    });
  }
  for (const item of plan.pair) {
    eventos.push({
      eventId: await deterministicUuid(`territory-undo|${item.versionId}|${input.territoryRef}`),
      versionId: item.versionId,
      status: "rejected",
      actorId: input.actorId,
      reason: `Silo “${plan.siloName}” desfeito inteiro por decisão humana: ${item.kind === "silo_dna" ? "o SiloDNA" : "a SiloPage"} deixa de valer. Nada é apagado.`,
      occurredAt: input.occurredAt,
    });
  }
  return eventos;
}

/**
 * O evento `rejected` de um ArticleDNA que cita uma keyword excluída e não está
 * em Silo nenhum (o Minerador, "Excluir"): o mesmo evento, a mesma regra de id.
 */
export async function buildLooseArticleRejection(input: { versionId: string; label: string; actorId: string; occurredAt: string }): Promise<VersionStatusEvent> {
  return {
    eventId: await deterministicUuid(`keyword-delete|${input.versionId}`),
    versionId: input.versionId,
    status: "rejected",
    actorId: input.actorId,
    reason: `Keyword excluída no Minerador por decisão humana: o artigo “${input.label}” sai de vigência. Nada é apagado.`,
    occurredAt: input.occurredAt,
  };
}

export type TerritoryUndoOutcome = "applied" | "partial" | "refused";

/**
 * O desfecho vem da RELEITURA, nunca da resposta da gravação: aplicado só
 * quando o território voltou `rejected`, nenhuma keyword aponta mais para ele
 * e — no Silo inteiro — nenhum artigo nem SiloDNA dele voltou na mesa.
 */
export function resolveTerritoryUndoOutcome(input: {
  territoryRef: string;
  readbackLifecycle: string | null;
  /** Keywords que estavam no Silo antes da gravação. */
  expectedMemberIds: readonly string[];
  /** Keywords que, na releitura, ainda apontam para este território. */
  readbackMemberIds: readonly string[];
  /** Silo inteiro (aditivo): os artigos e os Silos que precisam ter saído da mesa, e os que a releitura ainda mostra. */
  expectedGoneArticleIds?: readonly string[];
  readbackArticleIds?: readonly string[];
  expectedGoneSiloIds?: readonly string[];
  readbackSiloIds?: readonly string[];
}): { outcome: TerritoryUndoOutcome; remaining: string[]; remainingArticles: string[]; remainingSilos: string[] } {
  const remaining = [...new Set(input.readbackMemberIds)].sort();
  const artigosNaMesa = new Set(input.readbackArticleIds || []);
  const silosNaMesa = new Set(input.readbackSiloIds || []);
  const remainingArticles = [...new Set(input.expectedGoneArticleIds || [])].filter(id => artigosNaMesa.has(id)).sort();
  const remainingSilos = [...new Set(input.expectedGoneSiloIds || [])].filter(id => silosNaMesa.has(id)).sort();
  const rejeitado = input.readbackLifecycle === "rejected";
  if (rejeitado && !remaining.length && !remainingArticles.length && !remainingSilos.length) return { outcome: "applied", remaining, remainingArticles, remainingSilos };
  const artigosEsperados = input.expectedGoneArticleIds || [];
  const nadaMudou = !rejeitado
    && input.expectedMemberIds.every(keywordId => remaining.includes(keywordId))
    && artigosEsperados.every(id => artigosNaMesa.has(id));
  return { outcome: nadaMudou ? "refused" : "partial", remaining, remainingArticles, remainingSilos };
}
