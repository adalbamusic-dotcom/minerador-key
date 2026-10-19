import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeDeclaredPhraseKey, readDeclaredSiloPlan, type DeclaredPlanLockChoice, type DeclaredPlanRole } from "./declared-plan.ts";
import { importDeclaredPlanWithCore, type DeclaredPlanImportResult, type SubjectConversionRequest } from "./declared-plan-import-core.ts";
import { readEditorialGroupPlan } from "../editorial/editorial-groups-store.ts";
import { isEditorialGroupsSchemaMissing } from "../editorial/editorial-groups.ts";
import { buildConversionDraft, type ConversionDraft, type ConversionDraftArticle, type ConversionDraftKeyword, type ConversionDraftSilo } from "./subject-conversion-draft.ts";
import { isConvertibleLegacySubject } from "./subject-conversion.ts";
import type { SubjectImportChannel } from "./keyword-import-core.ts";

/**
 * ===== CONVERTER O FORMATO ANTERIOR — O NÚCLEO DO MINERADOR (tela, rota e MCP) =====
 *
 * SDD `docs/compartilhado/sdd-conversao-assunto-legado-2026-10-13.md` §5.
 *
 *   `readConversionDraftWithCore`  lê o grupo, as keywords, os ArticleDNAs e o
 *                                  SiloDNA vigentes e devolve o rascunho (puro:
 *                                  `buildConversionDraft`). Só leitura.
 *   `convertLegacySubjectsWithCore` monta o cadastro (plano do grupo + o Assunto
 *                                  dentro da keyword escolhida + a conversão) e
 *                                  chama o MESMO núcleo do card,
 *                                  `importDeclaredPlanWithCore` (prévia/aplicar,
 *                                  `importRequestId`, releitura). No `apply`, o
 *                                  que vem depois (Lógica grátis, aprovação pela
 *                                  D2-bis e envio ao Arquiteto) é injetado pelo
 *                                  servidor: os mesmos núcleos do botão e do MCP.
 *
 * A linha-título não é tocada. Nada pago. Nada vai para a lixeira.
 */

type Client = Pick<SupabaseClient, "from">;
const PAGE = 1000;

/**
 * 2026-10-18 · "SEM GRUPO" (SDD `sdd-assunto-pela-principal-e-volume-2026-10-18.md` §6.2-d, G3): o Assunto do formato
 * anterior que não tem grupo de cor também converte. Sem Silo e sem plano: o Assunto passa a morar na keyword escolhida
 * pelo destino "Keyword (sem Silo)" do MESMO núcleo do card (`importDeclaredPlanWithCore`); quando a keyword escolhida é
 * a própria linha, ela só ganha o título (o texto) e a nota antiga vira os detalhes.
 */
export const CONVERSION_WITHOUT_GROUP = "sem-grupo" as const;

export type ConversionRowInput = {
  fromKeywordId: string;
  articleId: string | null;
  order: number;
  role: DeclaredPlanRole;
  /** O título do Assunto (padrão: o texto da linha-título). */
  title: string;
  /** A keyword que passa a carregar o Assunto (texto, como no card). */
  keyword: string;
  scope: string;
  lock?: DeclaredPlanLockChoice | null;
};

export type ConversionFollowUp = {
  /** A Lógica determinística (grátis) nas keywords que ainda não a têm. */
  runLogic: (keywordIds: readonly string[]) => Promise<{ applied: number; failed: number }>;
  /** A aprovação pelo núcleo de sempre (D2-bis: só a Lógica). */
  approve: (keywordIds: readonly string[]) => Promise<Array<{ id: string; outcome: string; reason?: string }>>;
  /** O envio ao Arquiteto pelo handoff de sempre. */
  send: (keywordIds: readonly string[]) => Promise<{ importedKeywordIds: readonly string[] }>;
};

export type ConversionFollowUpResult = {
  keywordIds: string[];
  logic: { applied: number; failed: number } | null;
  approval: Array<{ id: string; outcome: string; reason?: string }>;
  sentKeywordIds: string[];
  /** O próximo passo, numa frase, para a tela e o MCP. */
  nextStep: string;
  error: string | null;
};

export type ConversionResult =
  | { ok: true; mode: "preview"; preview: Extract<DeclaredPlanImportResult, { ok: true; mode: "preview" }> }
  | { ok: true; mode: "apply"; applied: Extract<DeclaredPlanImportResult, { ok: true; mode: "apply" }>; followUp: ConversionFollowUpResult }
  | { ok: false; code: string; reason: string; blockers?: string[] };

async function readBrandKeywords(client: Client, brandId: string): Promise<ConversionDraftKeyword[]> {
  const rows: ConversionDraftKeyword[] = [];
  for (let from = 0; ; from += PAGE) {
    const page = await client.from("minerador_keywords").select("id,keyword,status,group_id,volume_search,analise_semantica").eq("brand_id", brandId).is("deleted_at", null).order("id", { ascending: true }).range(from, from + PAGE - 1);
    if (page.error) throw page.error;
    const data = (page.data || []) as unknown as Array<Record<string, unknown>>;
    for (const row of data) {
      rows.push({
        id: String(row.id),
        keyword: typeof row.keyword === "string" ? row.keyword : "",
        status: typeof row.status === "string" ? row.status : null,
        groupId: typeof row.group_id === "string" ? row.group_id : null,
        volume: typeof row.volume_search === "number" ? row.volume_search : null,
        semantic: row.analise_semantica && typeof row.analise_semantica === "object" && !Array.isArray(row.analise_semantica) ? row.analise_semantica as Record<string, unknown> : null,
      });
    }
    if (data.length < PAGE) return rows;
  }
}

type VersionRow = { entity_id?: unknown; version_number?: unknown; created_at?: unknown; payload?: unknown };

function latest(rows: readonly VersionRow[]): VersionRow[] {
  const porEntidade = new Map<string, VersionRow>();
  for (const row of rows) {
    const id = String(row.entity_id ?? "");
    const atual = porEntidade.get(id);
    if (!atual || Number(row.version_number) > Number(atual.version_number)) porEntidade.set(id, row);
  }
  return [...porEntidade.values()];
}

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);
const text = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);
const record = (value: unknown): Record<string, unknown> => (value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {});

async function readArtifacts(client: Client, brandId: string, type: string): Promise<VersionRow[]> {
  const rows: VersionRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const page = await client.from("editorial_artifact_versions").select("entity_id,version_number,created_at,payload").eq("marca_id", brandId).eq("artifact_type", type).order("entity_id", { ascending: true }).range(from, from + PAGE - 1);
    if (page.error) throw page.error;
    const data = (page.data || []) as VersionRow[];
    rows.push(...data);
    if (data.length < PAGE) return latest(rows);
  }
}

/** O rascunho da conversão do grupo: só leitura. */
export async function readConversionDraftWithCore(input: { brandId: string; keywordsClient: Client; groupsClient: Client; groupId: string }): Promise<
  | { ok: true; group: { id: string; name: string; color: string; hasPlan: boolean; planVersion: number }; draft: ConversionDraft }
  | { ok: false; code: "GROUP_NOT_FOUND" | "GROUPS_NOT_AVAILABLE"; reason: string }
> {
  if (input.groupId === CONVERSION_WITHOUT_GROUP) {
    const [keywords, artigos] = await Promise.all([readBrandKeywords(input.keywordsClient, input.brandId), readArtifacts(input.keywordsClient, input.brandId, "article_dna")]);
    const articles: ConversionDraftArticle[] = artigos.map(row => {
      const payload = record(row.payload);
      return { articleId: text(payload.articleId) ?? String(row.entity_id ?? ""), versionNumber: Number(row.version_number) || 0, principalKeywordId: text(payload.principalKeywordId) ?? "", secondaryKeywordIds: strings(payload.secondaryKeywordIds), narrativeReinforcementIds: strings(payload.narrativeReinforcementIds), subjectKeywordId: text(record(payload.subject).keywordId), promise: text(payload.promise), hierarchy: text(payload.hierarchy) };
    });
    const semGrupo = keywords.map(keyword => ({ ...keyword, groupId: keyword.groupId ?? CONVERSION_WITHOUT_GROUP }));
    const draft = buildConversionDraft({ groupId: CONVERSION_WITHOUT_GROUP, keywords: semGrupo, articles, silo: null });
    return { ok: true, group: { id: CONVERSION_WITHOUT_GROUP, name: "Sem grupo", color: "", hasPlan: false, planVersion: 0 }, draft };
  }
  let lido;
  try {
    lido = await readEditorialGroupPlan(input.groupsClient, input.brandId, input.groupId);
  } catch (error) {
    if (isEditorialGroupsSchemaMissing(error)) return { ok: false, code: "GROUPS_NOT_AVAILABLE", reason: "Os grupos ainda não estão disponíveis neste banco." };
    throw error;
  }
  if (!lido.ok) return { ok: false, code: "GROUPS_NOT_AVAILABLE", reason: lido.message };
  if (!lido.group) return { ok: false, code: "GROUP_NOT_FOUND", reason: "O grupo não existe nesta marca." };
  const [keywords, artigos, silos, paginas] = await Promise.all([
    readBrandKeywords(input.keywordsClient, input.brandId),
    readArtifacts(input.keywordsClient, input.brandId, "article_dna"),
    readArtifacts(input.keywordsClient, input.brandId, "silo_dna"),
    readArtifacts(input.keywordsClient, input.brandId, "silo_page"),
  ]);
  const articles: ConversionDraftArticle[] = artigos.map(row => {
    const payload = record(row.payload);
    return {
      articleId: text(payload.articleId) ?? String(row.entity_id ?? ""),
      versionNumber: Number(row.version_number) || 0,
      principalKeywordId: text(payload.principalKeywordId) ?? "",
      secondaryKeywordIds: strings(payload.secondaryKeywordIds),
      narrativeReinforcementIds: strings(payload.narrativeReinforcementIds),
      subjectKeywordId: text(record(payload.subject).keywordId),
      promise: text(payload.promise),
      hierarchy: text(payload.hierarchy),
    };
  });
  // O Silo vigente que contém os artigos das linhas-título do grupo (o primeiro que casar).
  const titulosDoGrupo = new Set(keywords.filter(keyword => keyword.groupId === input.groupId && isConvertibleLegacySubject(keyword.semantic)).map(keyword => keyword.id));
  const artigosDosTitulos = new Set(articles.filter(article => article.subjectKeywordId && titulosDoGrupo.has(article.subjectKeywordId)).map(article => article.articleId));
  let silo: ConversionDraftSilo | null = null;
  for (const row of silos) {
    const payload = record(row.payload);
    const articleIds = [...strings(payload.narrativeOrder), ...strings(payload.supportArticleIds), ...(text(payload.pillarArticleId) ? [text(payload.pillarArticleId)!] : [])];
    if (!articleIds.some(id => artigosDosTitulos.has(id))) continue;
    const siloId = text(payload.siloId);
    const pagina = paginas.map(page => record(page.payload)).find(page => text(page.siloId) === siloId) ?? {};
    silo = {
      name: text(payload.name) ?? text(payload.centralEntity) ?? "Silo",
      slug: text(pagina.slug),
      objective: text(payload.objective),
      pillarArticleId: text(payload.pillarArticleId),
      narrativeOrder: strings(payload.narrativeOrder),
      articleIds: [...new Set(articleIds)],
    };
    break;
  }
  // Com plano já declarado no grupo, o Silo é o do plano.
  const planoGravado = readDeclaredSiloPlan(lido.group.plan);
  if (planoGravado) silo = { ...(silo ?? { pillarArticleId: null, narrativeOrder: [], articleIds: [] }), name: planoGravado.siloName, slug: planoGravado.siloSlug, objective: planoGravado.objective };
  const draft = buildConversionDraft({ groupId: input.groupId, keywords, articles, silo });
  return { ok: true, group: { id: lido.group.id, name: lido.group.name, color: lido.group.color, hasPlan: Boolean(planoGravado), planVersion: lido.group.planVersion }, draft };
}

/** Converte as linhas pedidas (prévia ou aplicar) pelo núcleo do cadastro e, no apply, encadeia Lógica, aprovação e envio. */
export async function convertLegacySubjectsWithCore(input: {
  brandId: string;
  actorUserId: string;
  keywordsClient: Client;
  groupsClient: Client;
  mode: "preview" | "apply";
  groupId: string;
  silo?: { name: string; slug?: string | null; objective?: string | null } | null;
  rows: readonly ConversionRowInput[];
  importRequestId?: string | null;
  brandSiteUrl?: string | null;
  channel?: SubjectImportChannel;
  followUp?: ConversionFollowUp | null;
  now?: string;
}): Promise<ConversionResult> {
  if (!input.rows.length) return { ok: false, code: "NOTHING_TO_CONVERT", reason: "Escolha pelo menos um Assunto do formato anterior para converter." };
  if (input.groupId === CONVERSION_WITHOUT_GROUP) return convertWithoutGroup(input);
  const lido = await readEditorialGroupPlan(input.groupsClient, input.brandId, input.groupId);
  if (!lido.ok) return { ok: false, code: "GROUPS_NOT_AVAILABLE", reason: lido.message };
  if (!lido.group) return { ok: false, code: "GROUP_NOT_FOUND", reason: "O grupo não existe nesta marca." };
  const temPlano = Boolean(readDeclaredSiloPlan(lido.group.plan));
  if (!temPlano && !input.silo?.name?.trim()) return { ok: false, code: "SILO_REQUIRED", reason: "O grupo ainda não tem plano: informe o nome do Silo (padrão: o do Silo consolidado)." };

  // As linhas-título precisam ser do grupo (a conversão não move Assunto de grupo).
  const ids = [...new Set(input.rows.map(row => row.fromKeywordId))];
  const titulos = await input.keywordsClient.from("minerador_keywords").select("id,keyword,group_id").eq("brand_id", input.brandId).is("deleted_at", null).in("id", ids);
  if (titulos.error) throw titulos.error;
  const doGrupo = new Map(((titulos.data || []) as Array<{ id: unknown; keyword?: unknown; group_id?: unknown }>).map(row => [String(row.id), row]));
  const foraDoGrupo = ids.filter(id => doGrupo.get(id)?.group_id !== input.groupId);
  if (foraDoGrupo.length) return { ok: false, code: "PLAN_BLOCKED", reason: "Há linha-título fora deste grupo (ou que não existe mais).", blockers: foraDoGrupo.map(id => `A linha-título ${id} não está neste grupo.`) };

  // O artigo do Arquiteto (quando há): o Assunto dele é a linha-título, e a keyword escolhida não é apoio dele (D3).
  const comArtigo = input.rows.filter(row => row.articleId);
  if (comArtigo.length) {
    const [artigos, vivas] = await Promise.all([
      readArtifacts(input.keywordsClient, input.brandId, "article_dna"),
      input.keywordsClient.from("minerador_keywords").select("id,keyword").eq("brand_id", input.brandId).is("deleted_at", null),
    ]);
    if (vivas.error) throw vivas.error;
    const idPorTexto = new Map<string, string>();
    for (const row of (vivas.data || []) as Array<{ id: unknown; keyword?: unknown }>) {
      const chave = normalizeDeclaredPhraseKey(row.keyword);
      if (chave && !idPorTexto.has(chave)) idPorTexto.set(chave, String(row.id));
    }
    const impedimentos: string[] = [];
    for (const row of comArtigo) {
      const artigo = artigos.map(item => record(item.payload)).find(payload => text(payload.articleId) === row.articleId);
      if (!artigo) { impedimentos.push(`Linha ${row.order}: o artigo do Arquiteto não foi encontrado nesta marca.`); continue; }
      if (text(record(artigo.subject).keywordId) !== row.fromKeywordId) impedimentos.push(`Linha ${row.order}: o Assunto vigente do artigo não é esta linha-título (já convertido ou trocado); gere o rascunho de novo.`);
      const kId = idPorTexto.get(normalizeDeclaredPhraseKey(row.keyword));
      if (kId && [...strings(artigo.secondaryKeywordIds), ...strings(artigo.narrativeReinforcementIds)].includes(kId)) {
        impedimentos.push(`Linha ${row.order}: “${row.keyword}” é secundária deste artigo — o Assunto não pode ser apoio do mesmo artigo. Converta pela principal e use “Melhorar artigos” depois.`);
      }
    }
    // O artigo já convertido para ESTA keyword não é impedimento (repetir é seguro).
    const jaConvertidos = new Set(comArtigo.filter(row => {
      const artigo = artigos.map(item => record(item.payload)).find(payload => text(payload.articleId) === row.articleId);
      return artigo && text(record(artigo.subject).keywordId) === idPorTexto.get(normalizeDeclaredPhraseKey(row.keyword));
    }).map(row => row.order));
    const reais = impedimentos.filter(item => !jaConvertidos.has(Number(item.match(/^Linha (\d+)/)?.[1])));
    if (reais.length) return { ok: false, code: "PLAN_BLOCKED", reason: "A conversão tem impedimentos: corrija e gere a prévia de novo.", blockers: reais };
  }

  const conversions: SubjectConversionRequest[] = input.rows.map(row => ({ order: row.order, fromKeywordId: row.fromKeywordId, articleId: row.articleId }));
  const result = await importDeclaredPlanWithCore({
    brandId: input.brandId,
    actorUserId: input.actorUserId,
    keywordsClient: input.keywordsClient,
    groupsClient: input.groupsClient,
    mode: input.mode,
    plan: {
      silo: temPlano ? null : { name: input.silo!.name.trim(), slug: input.silo?.slug ?? null, objective: input.silo?.objective ?? null },
      articles: input.rows.map(row => ({ order: row.order, subject: row.title, principal: row.keyword, role: row.role, scope: row.scope, lock: row.lock ?? "auto" })),
    },
    group: { mode: "existing", groupId: input.groupId },
    destination: temPlano ? { kind: "existing_silo", groupId: input.groupId } : { kind: "new_silo" },
    importRequestId: input.importRequestId ?? null,
    brandSiteUrl: input.brandSiteUrl ?? null,
    conversions,
    ...(input.channel ? { channel: input.channel } : {}),
    ...(input.now ? { now: input.now } : {}),
  });
  if (!result.ok) return { ok: false, code: result.code, reason: result.reason, ...(result.blockers ? { blockers: result.blockers } : {}) };
  if (result.mode === "preview") return { ok: true, mode: "preview", preview: result };

  const convertidas = new Set(input.rows.map(row => row.order));
  const keywordIds = [...new Set(result.articles.filter(article => convertidas.has(article.order) && article.outcome !== "failed" && article.subjectKeywordId).map(article => article.subjectKeywordId!))];
  const followUp = await runConversionFollowUp(keywordIds, input.followUp ?? null);
  return { ok: true, mode: "apply", applied: result, followUp };
}

/** "Sem grupo": uma linha = um Assunto na keyword escolhida, pelo destino "Keyword (sem Silo)" do núcleo do card. */
async function convertWithoutGroup(input: Parameters<typeof convertLegacySubjectsWithCore>[0]): Promise<ConversionResult> {
  const ids = [...new Set(input.rows.map(row => row.fromKeywordId))];
  const vivas = await input.keywordsClient.from("minerador_keywords").select("id,keyword,group_id").eq("brand_id", input.brandId).is("deleted_at", null);
  if (vivas.error) throw vivas.error;
  const linhas = (vivas.data || []) as Array<{ id: unknown; keyword?: unknown; group_id?: unknown }>;
  const porId = new Map(linhas.map(row => [String(row.id), row] as const));
  const porTexto = new Map<string, string>();
  for (const row of linhas) { const chave = normalizeDeclaredPhraseKey(row.keyword); if (chave && !porTexto.has(chave)) porTexto.set(chave, String(row.id)); }
  const comGrupo = ids.filter(id => !porId.has(id) || porId.get(id)?.group_id);
  if (comGrupo.length) return { ok: false, code: "PLAN_BLOCKED", reason: "“Sem grupo” converte só o Assunto anterior que não tem cor: escolha o grupo dele.", blockers: comGrupo.map(id => `A linha-título ${id} tem grupo (ou não existe mais).`) };
  const previas: Array<Extract<DeclaredPlanImportResult, { ok: true; mode: "preview" }>> = [];
  const aplicados: Array<Extract<DeclaredPlanImportResult, { ok: true; mode: "apply" }>> = [];
  for (const [index, row] of input.rows.entries()) {
    const alvo = porTexto.get(normalizeDeclaredPhraseKey(row.keyword)) ?? null;
    if (!alvo) return { ok: false, code: "PLAN_BLOCKED", reason: "A keyword escolhida não existe nesta marca.", blockers: [`Linha ${row.order}: “${row.keyword}” não existe nesta marca.`] };
    const result = await importDeclaredPlanWithCore({
      brandId: input.brandId, actorUserId: input.actorUserId, keywordsClient: input.keywordsClient, groupsClient: input.groupsClient, mode: input.mode,
      plan: { silo: null, articles: [{ order: 1, subject: row.title, principal: row.keyword, role: row.role, scope: row.scope }] },
      group: { mode: "new", name: null, color: "" },
      destination: { kind: "keyword", keywordId: alvo },
      importRequestId: input.importRequestId ? `${input.importRequestId}:${index + 1}` : null,
      brandSiteUrl: input.brandSiteUrl ?? null,
      conversions: alvo === row.fromKeywordId ? null : [{ order: 1, fromKeywordId: row.fromKeywordId, articleId: row.articleId }],
      ...(input.channel ? { channel: input.channel } : {}),
      ...(input.now ? { now: input.now } : {}),
    });
    if (!result.ok) return { ok: false, code: result.code, reason: result.reason, ...(result.blockers ? { blockers: result.blockers } : {}) };
    if (result.mode === "preview") previas.push(result); else aplicados.push(result);
  }
  if (input.mode === "preview") {
    const primeira = previas[0];
    const articles = previas.flatMap((previa, index) => previa.articles.map(article => ({ ...article, order: input.rows[index].order })));
    const blockers = [...new Set(previas.flatMap(previa => previa.blockers))];
    return { ok: true, mode: "preview", preview: { ...primeira, articles, blockers, notices: [...new Set(previas.flatMap(previa => previa.notices))], approvedToReview: previas.reduce((soma, previa) => soma + previa.approvedToReview, 0), canApply: previas.every(previa => previa.canApply) } };
  }
  const applied = { ...aplicados[0], articles: aplicados.flatMap((aplicado, index) => aplicado.articles.map(article => ({ ...article, order: input.rows[index].order }))), failed: aplicados.reduce((soma, aplicado) => soma + aplicado.failed, 0), notices: [...new Set(aplicados.flatMap(aplicado => aplicado.notices))] };
  const keywordIds = [...new Set(applied.articles.filter(article => article.outcome !== "failed" && article.subjectKeywordId).map(article => article.subjectKeywordId!))];
  return { ok: true, mode: "apply", applied, followUp: await runConversionFollowUp(keywordIds, input.followUp ?? null) };
}

/**
 * Depois de gravar: Lógica (grátis) → aprovação (D2-bis) → envio ao Arquiteto.
 * Cada passo é idempotente; parar no meio deixa a conversão retomável (o próximo
 * passo é dito). Sem `followUp`, só diz o que falta (aprovar e enviar na tela).
 */
export async function runConversionFollowUp(keywordIds: readonly string[], followUp: ConversionFollowUp | null): Promise<ConversionFollowUpResult> {
  const ids = [...new Set(keywordIds)];
  const base: ConversionFollowUpResult = { keywordIds: ids, logic: null, approval: [], sentKeywordIds: [], nextStep: "", error: null };
  if (!ids.length) return { ...base, nextStep: "Nada foi convertido; confira as falhas acima." };
  if (!followUp) return { ...base, nextStep: "Aprove as keywords convertidas no Minerador e envie-as ao Arquiteto; depois, no Arquiteto, “Atualizar o Assunto dos artigos”." };
  try {
    base.logic = await followUp.runLogic(ids);
    base.approval = await followUp.approve(ids);
    const aprovadas = base.approval.filter(item => item.outcome === "applied" || item.outcome === "unchanged").map(item => item.id);
    const recusadas = base.approval.filter(item => item.outcome !== "applied" && item.outcome !== "unchanged");
    if (aprovadas.length) base.sentKeywordIds = [...(await followUp.send(aprovadas)).importedKeywordIds];
    const naoEnviadas = aprovadas.filter(id => !base.sentKeywordIds.includes(id));
    base.nextStep = recusadas.length || naoEnviadas.length
      ? `${recusadas.length} keyword(s) não foram aprovadas e ${naoEnviadas.length} não foram enviadas: resolva no Minerador (motivo ao lado) e envie ao Arquiteto; depois, no Arquiteto, “Atualizar o Assunto dos artigos”.`
      : "No Arquiteto, abra “Conversões pendentes” e clique em “Atualizar o Assunto dos artigos”.";
  } catch (error) {
    base.error = error instanceof Error ? error.message : "Falha depois de gravar.";
    base.nextStep = "O Assunto já foi gravado nas keywords. Aprove-as e envie ao Arquiteto pela tela (ou repita “Converter”: nada é regravado).";
  }
  return base;
}
