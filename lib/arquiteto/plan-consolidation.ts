/**
 * ===== CONSOLIDAR O SILO DO PLANO — regras puras (2026-10-14, noite) =====
 *
 * Pedido do dono, depois de testar com a WifiConecta azul: "o grupo entrou no
 * Arquiteto bem mastigado, com tudo pronto era só olhar e consolidar, alertar
 * né, vai ser isso mesmo, e consolida (…) Aí ele só vê se já tem o silo, cria
 * ele, consolida/valida tudo e vai em frente para os links internos". Adendo
 * datado em `docs/compartilhado/sdd-cadastro-assunto-na-keyword-2026-10-13.md`.
 *
 * Aqui só se DECIDE o que a consolidação faria (prévia grátis): para cada
 * artigo do plano do grupo, gravar o ArticleDNA v1 a partir do plano, manter o
 * que já está formado, ou recusar SÓ esta linha com o motivo (keyword presa em
 * outro artigo, principal que não chegou). O que falta — volume, SERP — vira
 * ALERTA, nunca bloqueio: o plano é decisão humana (D2-bis). Consolidar nunca
 * troca a principal (a do plano, travada ou livre) e nunca grava no Minerador.
 *
 * Domínio puro: sem React, sem rede, sem banco.
 */
import { createHash } from "node:crypto";
import { readArchitectSubjectStanding, suggestSubjectSupport, type ArchitectSubjectStanding } from "./declared-subject.ts";
import { declaredPlanSubjectList } from "./declared-plan-formation.ts";
import { planSheetArticleConflict, planSheetLockOf, readPlanRowVolume, PLAN_SILO_CONSOLIDATE_LABEL, PLAN_SILO_TAB_SENTENCE, type PlanSheetArticle } from "./plan-article-sheet.ts";
import { PLAN_SILO_PAIR_FIX_LABEL } from "./silo-plan-identity.ts";
export { PLAN_SILO_PAIR_FIX_LABEL };

type RecordLike = Record<string, unknown>;
const text = (value: unknown): string | null => typeof value === "string" && value.trim() ? value.trim() : null;

/*
 * 2026-10-15 · PEDIDO DO DONO: "a definição do silo já tem que estar na aba do
 * Silo e não nos artigos. Artigo só mexe com artigos". A consolidação tem dois
 * escopos sobre o MESMO núcleo: `silo` (aba Silos: o Silo do plano — reusa,
 * confirma ou recria com nome/slug/objetivo do plano, põe nele as keywords do
 * plano e a keyword do Silo quando existe, religa o grupo; depois o par
 * SiloDNA + SiloPage) e `articles` (aba Artigos: só o ArticleDNA v1 dos artigos
 * do plano que faltam; nunca cria, confirma ou mexe no Silo).
 */
export type PlanConsolidationScope = "silo" | "articles";
export { PLAN_SILO_CONSOLIDATE_LABEL, PLAN_SILO_TAB_SENTENCE };

/**
 * A IMPRESSÃO DIGITAL DA DECISÃO DO SILO (escopo `silo`): o grupo, a versão do
 * plano, o Silo escolhido (tipo, ref, ciclo), o vínculo do grupo e as keywords
 * que entram nele. Outra pessoa mudou algo no meio = "gere a prévia de novo".
 */
export function planSiloDecisionHash(input: { groupId: string; planVersion: number; territory: { kind: string; territoryRef?: string | null; lifecycleStatus?: string | null }; linkedSiloId: string | null; keywordsWithoutSilo: readonly string[]; headKeywordIds: readonly string[] }): string {
  const corpo = {
    groupId: input.groupId,
    planVersion: input.planVersion,
    territory: { kind: input.territory.kind, ref: input.territory.territoryRef ?? null, lifecycle: input.territory.lifecycleStatus ?? null },
    linked: input.linkedSiloId,
    entering: [...new Set(input.keywordsWithoutSilo)].sort(),
    heads: [...new Set(input.headKeywordIds)].sort(),
  };
  return createHash("sha256").update(JSON.stringify(corpo)).digest("hex");
}

/** No máximo seis keywords por artigo (ADR-022): a principal e até cinco sustentações. */
export const PLAN_CONSOLIDATION_MAX_KEYWORDS = 6;

export type PlanConsolidationAction = "write" | "keep" | "refused";

export type PlanConsolidationLine = {
  keywordId: string;
  keyword: string;
  title: string;
  order: number;
  role: "Pilar" | "Suporte";
  action: PlanConsolidationAction;
  /** A frase da linha na prévia (o que acontece, ou por que fica fora). */
  sentence: string;
  /** A principal do artigo: a keyword do plano (consolidar nunca troca). */
  principalId: string | null;
  /** Principal + sustentações já ligadas no Minerador (lista do Assunto). */
  memberIds: string[];
  /** O que falta, dito como alerta (não bloqueia). */
  alerts: string[];
  /** Já formado: o artigo e a versão vigente. */
  articleId: string | null;
  versionNumber: number | null;
};

export type PlanTerritoryChoice =
  /** As keywords do plano já estão num Silo vivo: é ele (o vínculo do grupo pode estar velho). */
  | { kind: "rows"; territoryRef: string; lifecycleStatus: string; name: string | null }
  /** O Silo ligado ao grupo, ou o de mesmo slug do plano. */
  | { kind: "linked" | "slug"; territoryRef: string; lifecycleStatus: string; name: string | null }
  /** Nenhum Silo do plano ainda: cria com nome, slug e objetivo do plano (núcleo do envio). */
  | { kind: "create" }
  /** As keywords do plano estão em Silos diferentes: decisão em Silos, nada é escrito. */
  | { kind: "split"; territoryRefs: string[] }
  /** O Silo do plano foi desfeito por alguém: volta por "Recriar o Silo do plano". */
  | { kind: "rejected"; territoryRef: string };

export type PlanTerritoryView = { territoryRef: string; lifecycleStatus: string; name?: string | null; slugs: ReadonlyArray<string | null | undefined> };

/*
 * 2026-10-15 (caso WifiConecta) · o Silo onde as keywords do plano já estão
 * conta também CONSOLIDADO: sem isto a prévia caía na regra do envio (que só
 * vê candidato/confirmado) e dizia "será criado" sobre um Silo que existe.
 */
const VIVOS = new Set(["candidate", "confirmed", "consolidated"]);

/**
 * QUAL É O SILO DO PLANO. Primeiro onde as keywords do plano JÁ estão (caso
 * WifiConecta: o grupo apontava para um território que não existe mais e as 7
 * keywords estavam no Silo "Wi-Fi e fibra óptica" confirmado); senão a regra do
 * envio (`choosePlanSiloTerritory`: ligado, mesmo slug, desfeito, criar).
 */
export function choosePlanConsolidationTerritory(input: {
  rowTerritoryRefs: ReadonlyArray<string | null>;
  territories: readonly PlanTerritoryView[];
  fallback: { kind: "linked" | "slug"; territoryRef: string } | { kind: "rejected_by_human"; territoryRef: string } | { kind: "create" };
}): PlanTerritoryChoice {
  const porRef = new Map(input.territories.map(item => [item.territoryRef, item]));
  const vivos = [...new Set(input.rowTerritoryRefs.filter((ref): ref is string => Boolean(ref) && VIVOS.has(porRef.get(ref!)?.lifecycleStatus ?? "")))];
  if (vivos.length > 1) return { kind: "split", territoryRefs: vivos.sort() };
  if (vivos.length === 1) {
    const territorio = porRef.get(vivos[0])!;
    return { kind: "rows", territoryRef: territorio.territoryRef, lifecycleStatus: territorio.lifecycleStatus, name: territorio.name ?? null };
  }
  if (input.fallback.kind === "create") return { kind: "create" };
  if (input.fallback.kind === "rejected_by_human") return { kind: "rejected", territoryRef: input.fallback.territoryRef };
  const territorio = porRef.get(input.fallback.territoryRef);
  return { kind: input.fallback.kind, territoryRef: input.fallback.territoryRef, lifecycleStatus: territorio?.lifecycleStatus ?? "candidate", name: territorio?.name ?? null };
}

export function planTerritoryChoiceSentence(choice: PlanTerritoryChoice, siloName: string): string {
  switch (choice.kind) {
    case "rows":
    case "linked":
    case "slug":
      if (choice.lifecycleStatus === "consolidated") return `Silo do plano “${choice.name || siloName}” já existe e está consolidado (SiloDNA e SiloPage gravados): fica como está.`;
      return choice.lifecycleStatus === "confirmed"
        ? `Silo do plano “${choice.name || siloName}” já existe e está confirmado: fica como está.`
        : `Silo do plano “${choice.name || siloName}” existe como candidato: será confirmado (decisão sua nesta confirmação).`;
    case "create":
      return `Silo do plano “${siloName}” ainda não existe: será criado com o nome, o slug e o objetivo do plano, e confirmado.`;
    case "split":
      return `As keywords do plano estão em ${choice.territoryRefs.length} Silos diferentes: decida em Silos qual é o do plano. Nada é escrito até lá.`;
    case "rejected":
      return `O Silo do plano “${siloName}” foi desfeito: use “Recriar o Silo do plano” antes de consolidar. Nada é escrito até lá.`;
  }
}

/** O artigo que já está na mesa (versão vigente), na forma mínima. */
export type PlanConsolidationArticle = PlanSheetArticle;

/**
 * AS LINHAS DA PRÉVIA, uma por artigo do plano do grupo, na ordem do plano.
 * `rows` são as linhas recebidas no Arquiteto (projeção da mesa); `ownerOf`
 * diz de qual artigo uma keyword já é membro; `isTarget` diz se a keyword do
 * plano é alvo de formação (recebida, não membro de outro artigo).
 */
export function planConsolidationLines(input: {
  brandId: string;
  groupId: string;
  rows: ReadonlyMap<string, RecordLike>;
  standings?: ReadonlyMap<string, ArchitectSubjectStanding>;
  articles: readonly PlanConsolidationArticle[];
  ownerOf: (keywordId: string) => string | null;
  hasIntent: (keywordId: string) => boolean;
  territoryRef: string | null;
  now: Date;
}): PlanConsolidationLine[] {
  const linhas: PlanConsolidationLine[] = [];
  const todas = [...input.rows.values()];
  for (const row of todas) {
    const keywordId = String(row.id ?? "");
    if (!keywordId) continue;
    const standing = input.standings?.get(keywordId) ?? readArchitectSubjectStanding(row);
    const plan = standing.plan;
    if (!plan || plan.groupId !== input.groupId || !standing.declared || !standing.received || !standing.approvedPackageRef || standing.brandId !== input.brandId) continue;
    const base = { keywordId, keyword: String(row.keyword ?? "").trim(), title: standing.phrase, order: plan.order, role: plan.role } as const;
    const volume = readPlanRowVolume(row, input.now);
    const trava = planSheetLockOf(standing, volume);
    const semVolume = !(volume.state === "measured" && (volume.value ?? 0) > 0);
    const alertas: string[] = [];
    if (semVolume) alertas.push(trava.state === "free" ? "sem volume — livre, pode trocar" : "sem volume — travada");
    const artigo = input.articles.filter(item => item.subjectKeywordId === keywordId).sort((a, b) => b.versionNumber - a.versionNumber)[0];
    if (artigo) {
      linhas.push({ ...base, action: "keep", sentence: `Já formado · v${artigo.versionNumber}: fica como está (nenhuma versão nova).`, principalId: artigo.principalKeywordId, memberIds: [...artigo.keywordIds], alerts: alertas, articleId: artigo.articleId, versionNumber: artigo.versionNumber });
      continue;
    }
    const principalId = plan.declaredPrincipal?.keywordId ?? keywordId;
    const conflito = planSheetArticleConflict({ keywordId, declaredPrincipalId: principalId, articles: input.articles });
    const recusa = conflito ? conflito.sentence
      : !input.rows.has(principalId) ? `Aguarda a principal “${plan.declaredPrincipal?.phrase ?? principalId}” chegar ao Arquiteto: aprove-a no Minerador e envie.`
      : input.ownerOf(keywordId) ? "A keyword do plano já é membro de outro artigo: retire-a de lá primeiro (decisão sua)."
      // 2026-10-15 · a aba Artigos não cria nem mexe no Silo: sem Silo, a linha espera "Consolidar o Silo do plano" (aba Silos).
      : !text(row.territoryRef) ? `Sem Silo ainda. ${PLAN_SILO_TAB_SENTENCE} (“${PLAN_SILO_CONSOLIDATE_LABEL}”); depois, esta linha forma aqui.`
      : null;
    if (recusa) {
      linhas.push({ ...base, action: "refused", sentence: recusa, principalId: null, memberIds: [], alerts: alertas, articleId: null, versionNumber: null });
      continue;
    }
    // As sustentações já ligadas no Minerador (lista do Assunto): com volume, intenção, no mesmo Silo, sem outro artigo.
    const lista = declaredPlanSubjectList(suggestSubjectSupport({ brandId: input.brandId, subjectKeyword: row, keywords: todas }));
    const apoio = lista
      .map(item => ({ item, linha: input.rows.get(item.keywordId), volume: input.rows.get(item.keywordId) ? readPlanRowVolume(input.rows.get(item.keywordId)!, input.now) : null }))
      .filter(({ item, linha, volume: v }) => linha && item.keywordId !== principalId && !linha.isPublished && !input.ownerOf(item.keywordId)
        && v?.state === "measured" && (v.value ?? 0) > 0 && input.hasIntent(item.keywordId)
        && (!input.territoryRef || !linha.territoryRef || linha.territoryRef === input.territoryRef))
      .sort((a, b) => (b.volume?.value ?? 0) - (a.volume?.value ?? 0) || a.item.keyword.localeCompare(b.item.keyword, "pt-BR"))
      .slice(0, PLAN_CONSOLIDATION_MAX_KEYWORDS - 1)
      .map(({ item }) => item.keywordId);
    if (!semVolume) alertas.push("SERP das principais na etapa 2 (custo antes)");
    const sustentacoes = apoio.length ? ` + ${apoio.length} sustentação(ões) já ligada(s) no Minerador` : "";
    linhas.push({ ...base, action: "write", sentence: `Vai gravar o ArticleDNA v1 do plano: principal “${input.rows.get(principalId)?.keyword ?? principalId}”${sustentacoes}; papel ${plan.role} · ${plan.order}º; escopo do plano como promessa.`, principalId, memberIds: [principalId, ...apoio], alerts: alertas, articleId: null, versionNumber: null });
  }
  return linhas.sort((a, b) => a.order - b.order || a.keyword.localeCompare(b.keyword, "pt-BR"));
}

/**
 * A IMPRESSÃO DIGITAL DA DECISÃO. Cobre o grupo, a versão do plano e, para
 * cada linha aceita, a principal e as keywords — venham da gravação planejada
 * ou do artigo que esta mesma consolidação já gravou (a composição é a mesma).
 * Assim a confirmação única vale para as gravações em sequência, e qualquer
 * mudança feita por outra pessoa no meio recusa ("gere a prévia de novo").
 */
export function planConsolidationDecisionHash(input: { groupId: string; planVersion: number; lines: readonly PlanConsolidationLine[]; acceptedKeywordIds: readonly string[] }): string {
  const aceitas = [...new Set(input.acceptedKeywordIds)].sort();
  const porId = new Map(input.lines.map(line => [line.keywordId, line]));
  const corpo = {
    groupId: input.groupId,
    planVersion: input.planVersion,
    lines: aceitas.map(id => {
      const line = porId.get(id);
      if (!line || line.action === "refused") return { id, refused: true };
      return { id, principalId: line.principalId, memberIds: [...line.memberIds].sort() };
    }),
  };
  return createHash("sha256").update(JSON.stringify(corpo)).digest("hex");
}

/**
 * 2026-10-15 (caso WifiConecta) · O PAR DO SILO NA PRÉVIA. Sem SiloDNA ainda:
 * a consolidação de sempre grava o v1 depois das linhas. Com o par gravado, a
 * prévia de "Aplicar o plano declarado ao Silo" (o mesmo núcleo, mesma
 * releitura) diz se há mudança real: tema de um suporte, pendência no texto,
 * Pilar ou ordem fora do plano → "Corrigir a página do Silo (vN+1)", gravado
 * na MESMA confirmação; sem mudança, nada novo (versões consolidadas são
 * imutáveis: o conserto é sempre a versão seguinte).
 */
export type PlanSiloPairStep =
  | { state: "missing"; siloId: null; sentence: string }
  | { state: "current"; siloId: string; sentence: string }
  | { state: "fix"; siloId: string; siloDnaVersionId: string; decisionHash: string; nextVersion: number; changes: string[]; sentence: string }
  | { state: "refused"; siloId: string; sentence: string };


export function planSiloPairStep(input: {
  siloId: string | null;
  currentVersion: number | null;
  declaredPlan: { state: "READY" | "UNCHANGED" | "REFUSED"; changes?: readonly string[]; message?: string; decisionHash?: string; siloDnaVersionId?: string } | null;
}): PlanSiloPairStep {
  if (!input.siloId) return { state: "missing", siloId: null, sentence: "O SiloDNA e a SiloPage do plano são gravados depois das linhas (Pilar e ordem do plano)." };
  const previa = input.declaredPlan;
  if (!previa || previa.state === "REFUSED") return { state: "refused", siloId: input.siloId, sentence: `A página do Silo fica como está: ${previa?.message ?? "a prévia do plano no Silo não pôde ser lida."}` };
  if (previa.state === "UNCHANGED" || !previa.decisionHash || !previa.siloDnaVersionId) {
    return { state: "current", siloId: input.siloId, sentence: `SiloDNA e SiloPage${input.currentVersion ? ` v${input.currentVersion}` : ""} já seguem o plano: nenhuma versão nova.` };
  }
  const proxima = (input.currentVersion ?? 0) + 1;
  const mudancas = [...(previa.changes ?? [])];
  return {
    state: "fix", siloId: input.siloId, siloDnaVersionId: previa.siloDnaVersionId, decisionHash: previa.decisionHash, nextVersion: proxima, changes: mudancas,
    sentence: `${PLAN_SILO_PAIR_FIX_LABEL} (v${proxima}) nesta mesma confirmação: ${mudancas.join(" ")}`,
  };
}

/** O resumo da prévia numa frase. */
export function planConsolidationSummary(lines: readonly PlanConsolidationLine[]): string {
  const gravar = lines.filter(line => line.action === "write").length;
  const manter = lines.filter(line => line.action === "keep").length;
  const fora = lines.filter(line => line.action === "refused").length;
  return `${gravar} artigo(s) do plano para gravar (v1), ${manter} já formado(s)${fora ? `, ${fora} fora desta confirmação (motivo na linha)` : ""}. Sem SERP e sem IA; nada é pago; nada é gravado no Minerador.`;
}
