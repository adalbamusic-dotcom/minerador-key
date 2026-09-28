import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";
import type { ArchitectKeyword, ArticleDNA, SiloDNA, VersionEnvelope, VersionReference } from "@/lib/arquiteto/contracts";
import { articleApprovalRevalidationIssues } from "@/lib/arquiteto/article-approval-revalidation";
import { contentHash, createVersionEnvelope } from "@/lib/arquiteto/versioning";
import { buildCanonicalWorkflowWorkspaceItems, type CanonicalWorkflowItem, type CanonicalWorkspaceKeyword } from "@/lib/arquiteto/canonical-workspace";
import { buildSerpSubjectIndex } from "@/lib/arquiteto/serp-subject-overlap";
import { serpObservedBarrier } from "@/lib/arquiteto/serp-subject-convergence";
import { serpSuggestionMatch } from "@/lib/arquiteto/serp-subject-suggestions";
import type { ArticleFormationKeyword } from "@/lib/arquiteto/article-formation";
import { ARTICLE_FORMATION_REF_PREFIX } from "@/lib/arquiteto/article-formation-decision";
import { proposePublishedPrimarySwap, type PublishedPrimarySwapProposal } from "@/lib/arquiteto/published-primary-swap";
import { formationKeywordOfPage, readPageRanking, type DifferentiationPage } from "@/lib/arquiteto/published-differentiation";
import { REINFORCEMENT_SEARCH_SUBJECT_TYPE } from "@/lib/arquiteto/published-reinforcement-search";
import {
  PUBLISHED_REINFORCEMENT_APPROVAL_TEXT,
  PUBLISHED_REINFORCEMENT_MAX_PAGES,
  applyReinforcementSwap,
  buildFirstPublishedArticleDna,
  describePublishedReinforcementOutcome,
  planPublishedReinforcementPage,
  publishedReinforcementReadbackConfirms,
  publishedSlugOf,
  withHumanArticleApproval,
  withReinforcementKeywords,
  type PublishedReinforcementPageFacts,
  type PublishedReinforcementPageOutcome,
  type PublishedReinforcementPagePlan,
  type ReinforcementKeywordFacts,
  type ReinforcementNewKeyword,
} from "@/lib/arquiteto/published-reinforcement";
import { readSerpEvidenceRecord, serpEvidenceAxisValue } from "@/lib/minerador/serp-evidence-record";
import { normalizeKeyword } from "@/lib/minerador/keyword-import-core";
import type { SubjectDiscoverySource } from "@/lib/minerador/subject-discovery-plan";
import { SUBJECT_DISCOVERY_ORIGINS, type SubjectDiscoveryImportRequest } from "@/lib/minerador/subject-discovery-import";
import {
  readDifferentiationArticleIndex,
  readDifferentiationBrandKeywords,
  readFreshPublishedPosts,
  readLatestArticleDnaVersion,
  readPublishedFootprints,
  readReinforcementSearchSuggestions,
  type DifferentiationStoreContext,
} from "@/lib/server/arquiteto-differentiation-store";

/**
 * REFORÇAR PUBLICADOS — PRÉVIA E APLICAR NO SERVIDOR (SDD 2026-09-28 §3).
 *
 *   preview  grátis e sem gravar: relê publicados, Posto, itens de workflow,
 *            ArticleDNA, cache de SERP (nível e ranqueamento) e o resultado
 *            gravado da busca em lote; devolve, por página, o que será gravado
 *            e o `decisionHash` (SHA-256 do que foi lido e planejado).
 *   apply    humano, com o MESMO `decisionHash` (estado mudou → nada é
 *            gravado). Na ordem, por página, parando no primeiro erro com o
 *            motivo: keywords novas (import da Pesquisa por Assunto → Lógica →
 *            Volume do Google Ads → aprovação humana → envio ao Arquiteto),
 *            composição do artigo (item de workflow, pela mesma rota da mesa,
 *            com a mudança de Silo quando preciso) e o ArticleDNA (primeiro ou
 *            sucessora, com a troca aceita), cada passo com releitura.
 *
 * `brandId` e ator vêm do contexto resolvido no servidor. Todas as escritas
 * são portas injetadas — a rota monta os núcleos reais das telas, o teste
 * monta dublês. Nenhuma escrita paralela: nada aqui fala com o banco para
 * gravar, só para ler.
 */

const BrandIdSchema = z.string().min(1).max(80);
const KeywordIdSchema = z.string().min(1).max(80);

export const PublishedReinforcementRequestSchema = z.object({
  brandId: BrandIdSchema,
  mode: z.enum(["preview", "apply"]),
  pages: z.array(z.object({
    publishedKeywordId: KeywordIdSchema,
    /** Keywords do Minerador que devem estar no artigo (as que o cartão mostra e as marcadas). */
    keywordIds: z.array(KeywordIdSchema).max(10).default([]),
    /** Keywords novas do resultado gravado da busca em lote desta página (o texto). */
    newKeywords: z.array(z.string().trim().min(1).max(200)).max(10).default([]),
    /** A troca da principal aceita no cartão (uma keyword do Minerador). */
    swapKeywordId: KeywordIdSchema.nullable().default(null),
  }).strict()).min(1).max(PUBLISHED_REINFORCEMENT_MAX_PAGES),
  decisionHash: z.string().min(1).max(200).optional(),
  /** Idempotência dos passos do Minerador numa nova tentativa. */
  operationRequestId: z.string().uuid().optional(),
  /** O dono leu que aprova as keywords novas no Minerador. */
  approveNewKeywords: z.boolean().optional(),
}).strict().superRefine((value, context) => {
  if (value.mode === "apply" && !value.decisionHash) context.addIssue({ code: "custom", path: ["decisionHash"], message: "Aplicar exige o hash da prévia." });
  if (value.mode === "apply" && !value.operationRequestId) context.addIssue({ code: "custom", path: ["operationRequestId"], message: "Aplicar exige o operationRequestId." });
  const ids = value.pages.map(page => page.publishedKeywordId);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: "custom", path: ["pages"], message: "Cada publicado aparece uma vez só." });
  // Uma keyword vai para UM artigo só por confirmação: a segunda página tiraria a keyword da primeira em silêncio.
  const destinos = value.pages.flatMap(page => [...new Set([...page.keywordIds, ...page.newKeywords.map(frase => frase.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim())])]);
  const repetidas = [...new Set(destinos.filter((item, indice) => destinos.indexOf(item) !== indice))];
  if (repetidas.length) context.addIssue({ code: "custom", path: ["pages"], message: `Cada keyword vai para um artigo só nesta confirmação: ${repetidas.slice(0, 3).join(", ")}.` });
  if (value.pages.some(page => ids.includes(page.swapKeywordId ?? "") || page.keywordIds.some(id => ids.includes(id)))) {
    context.addIssue({ code: "custom", path: ["pages"], message: "Uma keyword publicada nunca entra em outro artigo publicado." });
  }
});

export type PublishedReinforcementRequest = z.infer<typeof PublishedReinforcementRequestSchema>;

export type WorkingCopyPatch = { workflowItemId: string; expectedLock: number; assignment: Record<string, unknown> };

/** O parecer de SERP do artigo gravado pelo Processar (`article_formation_serp`), como referência de versão. */
export type ArticleSerpReferenceRow = { candidateRef: string; territoryRef: string; reference: VersionReference };

export type PublishedReinforcementMineradorPorts = {
  importKeywords: (request: SubjectDiscoveryImportRequest) => Promise<{ ok: true } | { ok: false; reason: string }>;
  runLogic: (keywordIds: string[]) => Promise<{ ok: boolean; reason: string | null }>;
  measureVolume: (keywordIds: string[], operationRequestId: string) => Promise<{ ok: boolean; reason: string | null }>;
  readVolumes: (keywordIds: string[]) => Promise<Map<string, { volume: number | null; validated: boolean }>>;
  approve: (keywordIds: string[]) => Promise<{ ok: boolean; reason: string | null }>;
  handoff: (keywordIds: string[]) => Promise<void>;
};

/**
 * Os cabeçalhos de uma chamada em processo a outra rota (PATCH da mesa, Volume
 * do Google Ads): só a sessão (cookie) e o tipo do corpo. Repassar os
 * cabeçalhos do pedido original levaria `content-length` de OUTRO corpo.
 */
export function inProcessRequestHeaders(original: Headers): Headers {
  const headers = new Headers({ "content-type": "application/json" });
  const cookie = original.get("cookie");
  if (cookie) headers.set("cookie", cookie);
  const authorization = original.get("authorization");
  if (authorization) headers.set("authorization", authorization);
  return headers;
}

export type PublishedReinforcementDeps = {
  store: DifferentiationStoreContext;
  now: () => Date;
  /** O workspace canônico do Arquiteto (itens recebidos, linhas inteiras, SiloDNAs e os ArticleDNAs vigentes). */
  readWorkspace: () => Promise<{ workflowItems: CanonicalWorkflowItem[]; keywords: CanonicalWorkspaceKeyword[]; siloDnas: VersionEnvelope<SiloDNA>[]; articleDnas?: VersionEnvelope<ArticleDNA>[] }>;
  /** Os pareceres de SERP dos artigos (Processar): a evidência que a aprovação exige. */
  readArticleSerpReferences?: () => Promise<ArticleSerpReferenceRow[]>;
  /** O writer da cópia de trabalho da mesa (PATCH /api/arquiteto/workspace). */
  patchWorkingCopy?: (updates: WorkingCopyPatch[]) => Promise<void>;
  /** O writer canônico do ArticleDNA (`appendArquitetoArtifact`, status aprovado). */
  persistArticleVersion?: (version: VersionEnvelope<ArticleDNA>) => Promise<{ status: "PERSISTED" | "UNCHANGED"; versionId: string }>;
  /** Os núcleos do Minerador, só quando há keyword nova. */
  minerador?: PublishedReinforcementMineradorPorts;
  /**
   * Os mesmos núcleos, montados só quando a prévia confirmada tem keyword nova
   * (a rota confere ali as permissões do Minerador; pedido sem keyword nova
   * não exige permissão no Minerador).
   */
  loadMinerador?: () => Promise<PublishedReinforcementMineradorPorts>;
};

export type PublishedReinforcementOutcomeBody = { status: number; body: Record<string, unknown> };

const falhou = (status: number, code: string, message: string, extra: Record<string, unknown> = {}): PublishedReinforcementOutcomeBody => ({ status, body: { success: false, code, error: message, ...extra } });

/** Um UUID v4 estável a partir das partes: a mesma tentativa, a mesma chave. */
export function stableUuid(...parts: string[]): string {
  const h = createHash("sha256").update(parts.join("|")).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${((parseInt(h[16], 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

const hostsDe = (pages: readonly Pick<DifferentiationPage, "url">[]) => [...new Set(pages.map(page => { try { return page.url ? new URL(page.url).hostname.replace(/^www\./, "") : null; } catch { return null; } }).filter((host): host is string => Boolean(host)))];
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
const texto = (valor: unknown) => typeof valor === "string" && valor.trim() ? valor.trim() : null;

type WorkspaceRow = ArchitectKeyword & Record<string, unknown>;

/** As linhas da mesa (a mesma projeção da tela) por keyword, com o item de workflow. */
function projectWorkspace(workspace: Awaited<ReturnType<PublishedReinforcementDeps["readWorkspace"]>>, brandId: string) {
  const linhas = buildCanonicalWorkflowWorkspaceItems(workspace.workflowItems, workspace.keywords, brandId) as unknown as WorkspaceRow[];
  return new Map(linhas.map(linha => [String(linha.id), linha]));
}

/** O papel decidido por humano na formação, do item de workflow. */
function formationRoleOf(item: CanonicalWorkflowItem | null | undefined): ReinforcementKeywordFacts["formationRole"] {
  const decisao = item?.payload?.articleFormationDecision;
  const papel = decisao && typeof decisao === "object" ? (decisao as { role?: unknown }).role : null;
  return papel === "principal" || papel === "secundaria" || papel === "reforco" ? papel : null;
}

function factsOf(linha: WorkspaceRow | undefined, id: string, nome: string | null, otherArticleOf?: (keywordId: string) => string | null): ReinforcementKeywordFacts {
  const item = (linha?.canonicalWorkflow ?? null) as CanonicalWorkflowItem | null;
  const volume = typeof linha?.volume_search === "number" && Number.isFinite(linha.volume_search) ? linha.volume_search : null;
  return {
    formationRole: formationRoleOf(item),
    otherArticleId: otherArticleOf ? otherArticleOf(id) : null,
    keywordId: id,
    keyword: linha ? String(linha.keyword) : nome ?? id,
    workflowItemId: item?.id ?? null,
    lockVersion: item?.lockVersion ?? null,
    received: item?.state === "received",
    territoryRef: texto(linha?.territoryRef),
    formationRef: texto(linha?.articleFormationRef),
    isPublished: Boolean(linha?.isPublished),
    volume,
    volumeValidated: String(linha?.volume_source ?? "").toLowerCase() === "google_ads" && (volume ?? 0) > 0,
  };
}

/** A intenção OBSERVADA na SERP, do pacote aprovado (como a mesa lê, D5). */
function observedOf(linha: WorkspaceRow | undefined): { observedIntent: string | null; observedFunnel: string | null } {
  const payload = ((linha?.canonicalWorkflow as CanonicalWorkflowItem | undefined)?.payload) || {};
  const aprovado = payload.approvedDna && typeof payload.approvedDna === "object" ? payload.approvedDna as Record<string, unknown> : null;
  const semantica = aprovado?.analiseSemantica && typeof aprovado.analiseSemantica === "object" ? aprovado.analiseSemantica as Record<string, unknown> : null;
  const registro = readSerpEvidenceRecord(semantica as never);
  return { observedIntent: serpEvidenceAxisValue(registro, "intent"), observedFunnel: serpEvidenceAxisValue(registro, "funnel") };
}

type Reading = {
  /** O parecer de SERP de cada página (a evidência que a aprovação leva). */
  serpRefByPage: Map<string, VersionReference | null>;
  facts: PublishedReinforcementPageFacts[];
  plans: PublishedReinforcementPagePlan[];
  missingPages: string[];
  decisionHash: string;
  rows: Map<string, WorkspaceRow>;
  siloDnas: VersionEnvelope<SiloDNA>[];
  footprintsByPage: Map<string, Awaited<ReturnType<typeof readPublishedFootprints>>["footprints"]>;
};

/** Lê tudo (grátis) e planeja cada página. */
async function readAndPlan(deps: PublishedReinforcementDeps, body: PublishedReinforcementRequest): Promise<Reading> {
  const pedidos = body.pages;
  const [marca, indice, workspace, buscas, postos, pareceres] = await Promise.all([
    readDifferentiationBrandKeywords(deps.store),
    readDifferentiationArticleIndex(deps.store),
    deps.readWorkspace(),
    readReinforcementSearchSuggestions(deps.store, REINFORCEMENT_SEARCH_SUBJECT_TYPE),
    readFreshPublishedPosts(deps.store, pedidos.map(item => item.publishedKeywordId)),
    deps.readArticleSerpReferences ? deps.readArticleSerpReferences() : Promise.resolve([] as ArticleSerpReferenceRow[]),
  ]);
  // Em que ArticleDNA vigente cada keyword já está (uma keyword mora num artigo só).
  const artigoDaKeyword = new Map<string, string>();
  for (const versao of workspace.articleDnas || []) {
    if (versao.payload.brandId !== deps.store.brandId) continue;
    for (const referencia of versao.payload.keywordReferences) artigoDaKeyword.set(String(referencia.keywordId), versao.entityId);
  }
  const rows = projectWorkspace(workspace, deps.store.brandId);
  const nomePorId = new Map([...marca.existingByNormalized.entries()].map(([normal, id]) => [id, normal]));
  const paginas = new Map(marca.pages.map(page => [page.keywordId, page]));
  const hosts = hostsDe(marca.pages);
  const facts: PublishedReinforcementPageFacts[] = [];
  const missingPages: string[] = [];
  const footprintsByPage = new Map<string, Awaited<ReturnType<typeof readPublishedFootprints>>["footprints"]>();
  // O status das keywords novas que já existem no Minerador (rejeitada não volta sozinha).
  const jaExistentes = [...new Set(pedidos.flatMap(pedido => pedido.newKeywords.map(frase => marca.existingByNormalized.get(normalizeKeyword(frase))).filter((id): id is string => Boolean(id))))];
  const rejeitadas = new Set<string>();
  /** Keyword já no Minerador com item do Arquiteto em outro estado (ex.: tirada por humano): não é reenviada sozinha. */
  const foraDoArquiteto = new Map<string, string>();
  if (jaExistentes.length) {
    const [lidas, itens] = await Promise.all([
      deps.store.supabase.from("minerador_keywords").select("id,status").eq("brand_id", deps.store.brandId).is("deleted_at", null).in("id", jaExistentes),
      deps.store.supabase.from("editorial_workflow_items").select("subject_id,state").eq("marca_id", deps.store.brandId).eq("subject_type", "keyword").eq("stage", "architect").in("subject_id", jaExistentes),
    ]);
    if (lidas.error) throw new Error("Leitura do status das keywords novas: " + (lidas.error.message || "falha"));
    if (itens.error) throw new Error("Leitura do Arquiteto das keywords novas: " + (itens.error.message || "falha"));
    for (const linha of (lidas.data || []) as Array<{ id: string; status: string | null }>) if (String(linha.status ?? "").toLowerCase() === "rejeitado") rejeitadas.add(String(linha.id));
    for (const linha of (itens.data || []) as Array<{ subject_id: string; state: string | null }>) {
      if (linha.state && linha.state !== "received") foraDoArquiteto.set(String(linha.subject_id), String(linha.state));
    }
  }
  const serpRefByPage = new Map<string, VersionReference | null>();

  for (const pedido of pedidos) {
    const lida = paginas.get(pedido.publishedKeywordId);
    if (!lida) { missingPages.push(pedido.publishedKeywordId); continue; }
    const artigoIndice = indice.get(lida.keywordId);
    const page: DifferentiationPage = { ...lida, post: postos.get(lida.keywordId) ?? lida.post, articleId: artigoIndice?.articleId ?? null, articleKeywordCount: artigoIndice?.keywordCount ?? null };
    const proprioArtigo = artigoIndice?.articleId ?? null;
    const alheio = (keywordId: string) => { const dono = artigoDaKeyword.get(keywordId) ?? null; return dono && dono !== proprioArtigo ? dono : null; };
    const item = rows.has(page.keywordId) ? factsOf(rows.get(page.keywordId), page.keywordId, page.keyword) : null;
    const members = item?.formationRef
      ? [...rows.values()].filter(linha => texto(linha.articleFormationRef) === item.formationRef && String(linha.id) !== page.keywordId).map(linha => factsOf(linha, String(linha.id), null, alheio))
      : [];
    // O parecer de SERP do artigo: pelo candidato da formação gravada ou pelo do publicado no Silo dele.
    const territorioDaPagina = item?.territoryRef ?? null;
    const candidatos = [item?.formationRef ?? null, territorioDaPagina ? `article-candidate:${territorioDaPagina}:${page.keywordId}` : null].filter((ref): ref is string => Boolean(ref));
    const parecer = candidatos.map(ref => pareceres.find(linha => linha.candidateRef === ref)).find(Boolean)
      ?? pareceres.find(linha => linha.candidateRef.endsWith(`:${page.keywordId}`) && linha.territoryRef === territorioDaPagina)
      ?? null;
    serpRefByPage.set(page.keywordId, parecer?.reference ?? null);
    const versao = artigoIndice ? await readLatestArticleDnaVersion(deps.store, artigoIndice.articleId) : null;
    const article = versao ? { articleId: versao.entityId, versionId: versao.versionId, versionNumber: versao.versionNumber, payload: versao.payload } : null;

    // Keywords novas: só as do resultado gravado da busca desta página; a que já existe e está no Arquiteto vira "do Minerador".
    const busca = buscas.get(page.keywordId) ?? null;
    const sugestoes = new Map((busca?.suggestions || []).map(item => [String(item.normalizedKeyword ?? normalizeKeyword(String(item.keyword ?? ""))), item]));
    const escolhidasIds = [...new Set(pedido.keywordIds)];
    const newKeywords: ReinforcementNewKeyword[] = [];
    const newMissing: string[] = [];
    const newRefused: Array<{ keyword: string; reason: string }> = [];
    for (const frase of pedido.newKeywords) {
      const normal = normalizeKeyword(frase);
      const sugestao = sugestoes.get(normal);
      if (!sugestao || !busca) { newMissing.push(frase); continue; }
      const existente = marca.existingByNormalized.get(normal) ?? null;
      // Decisão humana preservada: a que o dono rejeitou no Minerador não volta sozinha.
      if (existente && rejeitadas.has(existente)) { newRefused.push({ keyword: frase, reason: "Você a rejeitou no Minerador: ela não volta sozinha." }); continue; }
      if (existente && foraDoArquiteto.has(existente)) { newRefused.push({ keyword: frase, reason: `Está no Arquiteto em outro estado ("${foraDoArquiteto.get(existente)}"): ela não é reenviada sozinha.` }); continue; }
      if (existente && alheio(existente)) { newRefused.push({ keyword: frase, reason: "Já está no ArticleDNA de outro artigo: tire-a de lá antes." }); continue; }
      if (existente && rows.get(existente)?.canonicalWorkflow && (rows.get(existente)!.canonicalWorkflow as CanonicalWorkflowItem).state === "received") {
        if (!escolhidasIds.includes(existente)) escolhidasIds.push(existente);
        continue;
      }
      const origens = (Array.isArray(sugestao.origins) ? sugestao.origins : []).filter((origem): origem is SubjectDiscoverySource => (SUBJECT_DISCOVERY_ORIGINS as readonly string[]).includes(String(origem)));
      newKeywords.push({
        keyword: String(sugestao.keyword ?? frase),
        normalizedKeyword: normal,
        adsVolume: typeof sugestao.adsVolume === "number" ? sugestao.adsVolume : 0,
        level: sugestao.level === "strong" ? "strong" : "probable",
        sharedPageCount: typeof sugestao.sharedPageCount === "number" ? sugestao.sharedPageCount : 0,
        origins: origens.length ? origens : ["ads_keyword_seed"],
        evidence: (Array.isArray(sugestao.evidence) ? sugestao.evidence : []).map(String).slice(0, 3),
        searchId: busca.operationRequestId,
        existingKeywordId: existente,
      });
    }

    // O cache de SERP da página e das escolhidas: o nível e o ranqueamento, relidos agora.
    const idsParaMedir = [...new Set([...escolhidasIds, ...(pedido.swapKeywordId ? [pedido.swapKeywordId] : [])])];
    const alvos = [{ keywordId: page.keywordId, keyword: page.keyword }, ...idsParaMedir.flatMap(id => rows.get(id) ? [{ keywordId: id, keyword: String(rows.get(id)!.keyword) }] : [])];
    let footprints: Awaited<ReturnType<typeof readPublishedFootprints>>["footprints"] = [];
    let serpLida = true;
    try {
      footprints = (await readPublishedFootprints(deps.store, alvos, deps.now())).footprints;
    } catch {
      serpLida = false;
    }
    footprintsByPage.set(page.keywordId, footprints);
    const serp = buildSerpSubjectIndex(footprints);
    const ancora: ArticleFormationKeyword = { ...formationKeywordOfPage(page), ...observedOf(rows.get(page.keywordId)) };
    const unknownIds: string[] = [];
    const chosen: PublishedReinforcementPageFacts["chosen"] = [];
    for (const id of escolhidasIds) {
      const linha = rows.get(id);
      if (!linha && !nomePorId.has(id)) { unknownIds.push(id); continue; }
      const base = factsOf(linha, id, nomePorId.get(id) ?? null, alheio);
      const candidata: ArticleFormationKeyword = { keywordId: id, keyword: base.keyword, intent: null, volume: base.volume, kgr: null, entity: null, problem: null, isPublished: base.isPublished, ...observedOf(linha) };
      const match = linha && serpLida && !serpObservedBarrier(ancora, candidata, serp) ? serpSuggestionMatch(ancora, candidata, serp) : null;
      chosen.push({ ...base, level: match?.level ?? null, sharedPageCount: match?.sharedPageCount ?? 0 });
    }

    let swapProposal: PublishedPrimarySwapProposal | null = null;
    if (pedido.swapKeywordId && rows.get(pedido.swapKeywordId)) {
      const substituta = factsOf(rows.get(pedido.swapKeywordId), pedido.swapKeywordId, null);
      swapProposal = proposePublishedPrimarySwap({
        published: ancora,
        post: page.post,
        identity: { url: page.url, canonical: page.canonical, slug: page.slug },
        candidates: [{ keywordId: substituta.keywordId, keyword: substituta.keyword, intent: null, volume: substituta.volume, kgr: null, entity: null, problem: null, isPublished: substituta.isPublished, volumeValidated: substituta.volumeValidated, ...observedOf(rows.get(pedido.swapKeywordId)) }],
        serp,
      });
    }
    const ranking = serpLida ? readPageRanking(page, serp.footprint(page.keywordId), hosts) : null;
    facts.push({ page, item, members, article, ranking, chosen, unknownIds, newKeywords, newMissing, newRefused, swapKeywordId: pedido.swapKeywordId, swapProposal });
  }

  // O primeiro ArticleDNA é montado já na prévia (sem as keywords novas): o que
  // o construtor recusaria (ex.: intenção incompatível grave) sai recusado aqui,
  // com o motivo, em vez de parar no meio da confirmação.
  const recusarPlano = (plano: PublishedReinforcementPagePlan, motivo: string): PublishedReinforcementPagePlan => ({ ...plano, status: "refused", refusal: motivo, dna: { ...plano.dna, mode: "none" }, lines: [`"${plano.keyword}": nada será gravado. ${motivo}`] });
  const plans = facts.map(item => {
    const plano = planPublishedReinforcementPage(item);
    if (plano.status !== "ready") return plano;
    // A aprovação leva a evidência SERP do artigo (a mesma portaria da rota de artefatos).
    const serpRef = serpRefByPage.get(item.page.keywordId) ?? null;
    if (!serpRef && !item.article?.payload.serpAssessmentRef) {
      return recusarPlano(plano, "O artigo ainda não tem o parecer da SERP gravado: use \"Processar artigos\" (cache primeiro) e abra a prévia de novo.");
    }
    if (plano.dna.mode !== "first" || !plano.territoryRef) return plano;
    const composicao = compositionOf(plano, null, [], rows);
    const linhas = composicao.ids.map(id => rows.get(id)).filter((linha): linha is WorkspaceRow => Boolean(linha));
    const ensaio = buildFirstPublishedArticleDna({ brandId: deps.store.brandId, page: item.page, territoryRef: plano.territoryRef, keywords: linhas, roles: composicao.roles, siloVersions: workspace.siloDnas });
    if (!ensaio.ok) return recusarPlano(plano, ensaio.reason);
    const issues = articleApprovalRevalidationIssues({ version: { payload: withHumanArticleApproval(ensaio.payload, serpRef) } as VersionEnvelope<ArticleDNA>, authorizedBrandId: deps.store.brandId });
    return issues.length ? recusarPlano(plano, `A aprovação não passaria na revalidação do servidor: ${issues.map(issue => issue.detail).join(" ")}`) : plano;
  });
  const decisionHash = await contentHash({
    brandId: deps.store.brandId,
    actorUserId: deps.store.actorUserId,
    pages: body.pages,
    missingPages,
    serp: [...serpRefByPage.entries()].map(([pagina, referencia]) => [pagina, referencia?.versionId ?? null]),
    facts: facts.map(item => ({
      page: [item.page.keywordId, item.page.url, item.page.canonical, item.page.post],
      item: item.item ? [item.item.workflowItemId, item.item.lockVersion, item.item.territoryRef, item.item.formationRef] : null,
      members: item.members.map(membro => [membro.keywordId, membro.lockVersion, membro.formationRole ?? null, membro.otherArticleId ?? null]),
      article: item.article ? [item.article.versionId, item.article.versionNumber] : null,
      ranking: item.ranking ? [item.ranking.ranks, item.ranking.possiblyRanks] : null,
      chosen: item.chosen.map(escolhida => [escolhida.keywordId, escolhida.lockVersion, escolhida.level, escolhida.volume, escolhida.territoryRef, escolhida.formationRef, escolhida.otherArticleId ?? null]),
      newKeywords: item.newKeywords.map(nova => [nova.normalizedKeyword, nova.adsVolume, nova.level, nova.existingKeywordId, nova.searchId]),
      swap: item.swapProposal ? [item.swapProposal.state, item.swapProposal.substitute?.keywordId ?? null] : null,
    })),
    plans,
  });
  return { serpRefByPage, facts, plans, missingPages, decisionHash, rows, siloDnas: workspace.siloDnas, footprintsByPage };
}

function previewData(leitura: Reading) {
  const prontas = leitura.plans.filter(plan => plan.status === "ready");
  const novas = leitura.plans.reduce((total, plan) => total + plan.create.length, 0);
  return {
    mode: "preview",
    decisionHash: leitura.decisionHash,
    pages: leitura.plans,
    missingPages: leitura.missingPages,
    approvalText: novas ? PUBLISHED_REINFORCEMENT_APPROVAL_TEXT : null,
    written: false,
    message: prontas.length
      ? `${prontas.length} artigo(s) publicado(s) prontos para gravar${novas ? `, com ${novas} keyword(s) nova(s) que você aprova no Minerador` : ""}. Nada foi gravado ainda. Para gravar: confirme "Reforçar publicados".`
      : "Nada a gravar: os publicados escolhidos já têm tudo o que foi marcado, ou foram recusados com o motivo. Nada foi gravado.",
  };
}

/**
 * A composição que o artigo terá (publicada primeiro), com o papel de cada uma.
 *
 * O papel vem do ArticleDNA vigente; sem ele, da decisão humana gravada na
 * formação (`reforco` → `reforco_narrativo`). Achatar tudo em "secundária"
 * apagaria o reforço narrativo que o dono decidiu (article-formation-decision).
 */
function compositionOf(plan: PublishedReinforcementPagePlan, article: ArticleDNA | null, createdIds: readonly string[], rows: ReadonlyMap<string, WorkspaceRow>) {
  const papelNoArtigo = new Map((article?.keywordReferences || []).map(reference => [String(reference.keywordId), reference.role]));
  const ids = [plan.publishedKeywordId, ...plan.keep.map(item => item.keywordId), ...plan.add.map(item => item.keywordId), ...createdIds];
  const unicos = [...new Set(ids)];
  const roles: Record<string, "principal" | "secundaria" | "reforco_narrativo"> = {};
  for (const id of unicos) {
    const papel = papelNoArtigo.get(id) ?? (formationRoleOf(rows.get(id)?.canonicalWorkflow as CanonicalWorkflowItem | undefined) === "reforco" ? "reforco_narrativo" : null);
    roles[id] = id === plan.publishedKeywordId ? "principal" : papel === "reforco_narrativo" ? "reforco_narrativo" : "secundaria";
  }
  return { ids: unicos, roles };
}

export async function handlePublishedReinforcement(deps: PublishedReinforcementDeps, body: PublishedReinforcementRequest): Promise<PublishedReinforcementOutcomeBody> {
  const leitura = await readAndPlan(deps, body);
  if (body.mode === "preview") return { status: 200, body: { success: true, data: previewData(leitura) } };

  if (body.decisionHash !== leitura.decisionHash) {
    return falhou(409, "PREVIEW_CHANGED", "O estado mudou desde a prévia que você viu. Recarregue a prévia antes de confirmar; nada foi gravado.", { preview: previewData(leitura) });
  }
  const prontas = leitura.plans.filter(plan => plan.status === "ready");
  if (!prontas.length) return { status: 200, body: { success: true, data: { mode: "apply", pages: [], notAttempted: [], written: false, readbackConfirmed: true, tone: "info", message: "Nada foi gravado: os artigos já tinham tudo o que foi marcado." } } };
  const comNovas = prontas.some(plan => plan.create.length);
  if (comNovas && body.approveNewKeywords !== true) {
    return falhou(422, "HUMAN_APPROVAL_REQUIRED", `Há keywords novas: a confirmação precisa dizer que você as aprova no Minerador. ${PUBLISHED_REINFORCEMENT_APPROVAL_TEXT} Nada foi gravado.`);
  }
  if (!deps.patchWorkingCopy || !deps.persistArticleVersion) return falhou(503, "ARTICLE_WRITER_UNAVAILABLE", "O gravador do Arquiteto não está disponível. Nada foi gravado.");
  // As permissões do Minerador só são conferidas quando a prévia confirmada tem keyword nova.
  const mineradorPortas = comNovas ? deps.minerador ?? (deps.loadMinerador ? await deps.loadMinerador() : undefined) : undefined;
  if (comNovas && !mineradorPortas) return falhou(503, "MINERADOR_UNAVAILABLE", "Os núcleos do Minerador não estão disponíveis para as keywords novas. Nada foi gravado.");

  const agora = deps.now().toISOString();
  const operationRequestId = body.operationRequestId!;
  const outcomes: PublishedReinforcementPageOutcome[] = [];
  let parou: string | null = null;
  const factsPorPagina = new Map(leitura.facts.map(item => [item.page.keywordId, item]));

  for (const plan of prontas) {
    const facts = factsPorPagina.get(plan.publishedKeywordId)!;
    const resultado: PublishedReinforcementPageOutcome = { publishedKeywordId: plan.publishedKeywordId, keyword: plan.keyword, written: false, versionNumber: null, added: plan.add.length, created: 0, swapApplied: false, error: null, partial: [], leftOut: [] };
    const parar = (motivo: string) => { resultado.error = motivo; parou = `"${plan.keyword}": ${motivo}`; outcomes.push(resultado); };
    const gravouNoMinerador = (frase: string) => { resultado.partial!.push(frase); };

    /* 1. Keywords novas: os núcleos do Minerador, na ordem das telas. */
    let criadas: string[] = [];
    if (plan.create.length) {
      const minerador = mineradorPortas!;
      const paraImportar = plan.create.filter(item => !item.existingKeywordId);
      const porBusca = new Map<string, ReinforcementNewKeyword[]>();
      for (const item of paraImportar) porBusca.set(item.searchId, [...(porBusca.get(item.searchId) || []), item]);
      let erroImport: string | null = null;
      for (const [searchId, itens] of porBusca) {
        const importado = await minerador.importKeywords({
          importRequestId: stableUuid(deps.store.brandId, operationRequestId, plan.publishedKeywordId, searchId, "import"),
          searchId,
          subjectKeywordId: null,
          subjectPhrase: plan.keyword,
          items: itens.map(item => ({ keyword: item.keyword, origins: item.origins, evidence: item.evidence })),
        });
        if (!importado.ok) { erroImport = importado.reason; break; }
      }
      if (erroImport) { parar(`o import no Minerador falhou: ${erroImport}`); break; }
      const marcaAgora = await readDifferentiationBrandKeywords(deps.store);
      const ids = plan.create.map(item => marcaAgora.existingByNormalized.get(item.normalizedKeyword) ?? null);
      if (ids.some(id => !id)) { parar("o import não confirmou todas as keywords novas na releitura."); break; }
      const novasIds = ids as string[];
      const nomeDe = (id: string) => plan.create[novasIds.indexOf(id)]?.keyword ?? id;
      if (paraImportar.length) gravouNoMinerador(`${paraImportar.length} keyword(s) importada(s) no Minerador (${paraImportar.map(item => `"${item.keyword}"`).join(", ")})`);
      const logica = await minerador.runLogic(novasIds);
      if (!logica.ok) { parar(`a Lógica não foi confirmada: ${logica.reason ?? "releitura falhou"}`); break; }
      gravouNoMinerador("a Lógica delas");
      const volume = await minerador.measureVolume(novasIds, stableUuid(deps.store.brandId, operationRequestId, plan.publishedKeywordId, "volume"));
      if (!volume.ok) { parar(`o Volume do Google Ads não foi medido: ${volume.reason ?? "falha no Google Ads"}`); break; }
      gravouNoMinerador("o Volume do Google Ads delas");
      const volumes = await minerador.readVolumes(novasIds);
      criadas = novasIds.filter(id => volumes.get(id)?.validated);
      const semVolume = novasIds.filter(id => !volumes.get(id)?.validated);
      if (semVolume.length) resultado.leftOut!.push(...semVolume.map(id => ({ keyword: nomeDe(id), reason: "o Google Ads não confirmou volume: ficou no Minerador, fora do artigo" })));
      if (criadas.length) {
        const aprovacao = await minerador.approve(criadas);
        if (!aprovacao.ok) { parar(`a aprovação no Minerador não foi confirmada: ${aprovacao.reason ?? "releitura falhou"}`); break; }
        gravouNoMinerador(`aprovação de ${criadas.length} no Minerador`);
        try {
          await minerador.handoff(criadas);
        } catch (error) {
          parar(`o envio ao Arquiteto falhou: ${error instanceof Error ? error.message.slice(0, 160) : "erro"}`);
          break;
        }
        gravouNoMinerador(`envio de ${criadas.length} ao Arquiteto`);
      }
      resultado.created = criadas.length;
    }

    /* 2. A composição do artigo no item de workflow (mesmo writer da mesa). */
    let workspace = await deps.readWorkspace();
    let rows = projectWorkspace(workspace, deps.store.brandId);
    const naoRecebidas = criadas.filter(id => (rows.get(id)?.canonicalWorkflow as CanonicalWorkflowItem | undefined)?.state !== "received");
    if (naoRecebidas.length) { parar("as keywords novas não chegaram ao Arquiteto na releitura."); break; }
    const composicao = compositionOf(plan, facts.article?.payload ?? null, criadas, rows);
    const formationRef = plan.formationRef ?? `${ARTICLE_FORMATION_REF_PREFIX}${stableUuid(deps.store.brandId, plan.publishedKeywordId, "reforco")}`;
    const territorio = plan.territoryRef!;
    // Só quem ENTRA agora muda de Silo (as marcadas e as novas, anunciadas na prévia);
    // quem já estava no artigo ou na formação fica onde está.
    const entram = new Set([...plan.add.map(item => item.keywordId), ...criadas]);
    const patches: WorkingCopyPatch[] = [];
    const esperado = new Map<string, { territoryRef: string | null }>();
    for (const id of composicao.ids) {
      const linha = rows.get(id);
      const item = linha?.canonicalWorkflow as CanonicalWorkflowItem | undefined;
      if (!item || item.state !== "received") continue;
      const papel = composicao.roles[id] === "principal" ? "principal" : composicao.roles[id] === "reforco_narrativo" ? "reforco" : "secundaria";
      const mudaSilo = entram.has(id) && texto(linha?.territoryRef) !== territorio;
      // Já está nesta formação: a decisão humana dela fica como está (nada é "normalizado").
      if (texto(linha?.articleFormationRef) === formationRef && !mudaSilo) continue;
      esperado.set(item.id, { territoryRef: mudaSilo ? territorio : texto(linha?.territoryRef) });
      patches.push({
        workflowItemId: item.id,
        expectedLock: item.lockVersion,
        assignment: {
          articleFormationRef: formationRef,
          articleFormationDecision: { operation: "move", role: papel, reason: "Reforçar publicados: composição do artigo publicado decidida por humano.", source: "human", decidedAt: agora },
          ...(mudaSilo ? {
            territoryRef: territorio,
            territoryAssignment: { state: "existing_silo_match", reason: "Decisão humana: reforço do artigo publicado (Reforçar publicados).", source: "human", decidedAt: agora },
          } : {}),
        },
      });
    }
    if (patches.length) {
      try {
        await deps.patchWorkingCopy(patches);
      } catch (error) {
        parar(`a composição não foi gravada: ${error instanceof Error ? error.message.slice(0, 160) : "erro"}`);
        break;
      }
      workspace = await deps.readWorkspace();
      rows = projectWorkspace(workspace, deps.store.brandId);
      const naoConfirmadas = patches.filter(patch => {
        const linha = [...rows.values()].find(item => (item.canonicalWorkflow as CanonicalWorkflowItem | undefined)?.id === patch.workflowItemId);
        const papel = (patch.assignment.articleFormationDecision as { role: string }).role;
        return !linha
          || texto(linha.articleFormationRef) !== formationRef
          || formationRoleOf(linha.canonicalWorkflow as CanonicalWorkflowItem | undefined) !== papel
          || texto(linha.territoryRef) !== esperado.get(patch.workflowItemId)?.territoryRef;
      });
      if (naoConfirmadas.length) { parar("a releitura não confirmou a composição do artigo."); break; }
      resultado.partial!.push(`a composição do artigo na mesa (${plural(patches.length, "keyword", "keywords")})`);
    }

    /* 3. O ArticleDNA: o primeiro ou a sucessora, com a troca aceita, aprovado por humano. */
    const linhasDoArtigo = composicao.ids.map(id => rows.get(id)).filter((linha): linha is WorkspaceRow => Boolean(linha));
    let payload: ArticleDNA;
    let mudou = true;
    if (!facts.article) {
      const primeiro = buildFirstPublishedArticleDna({ brandId: deps.store.brandId, page: facts.page, territoryRef: territorio, keywords: linhasDoArtigo, roles: composicao.roles, siloVersions: workspace.siloDnas });
      if (!primeiro.ok) { parar(`o ArticleDNA não pôde ser montado: ${primeiro.reason}`); break; }
      payload = primeiro.payload;
    } else {
      const novas = linhasDoArtigo.filter(linha => !facts.article!.payload.keywordReferences.some(reference => String(reference.keywordId) === String(linha.id)));
      const sucessora = withReinforcementKeywords({ current: facts.article.payload, brandId: deps.store.brandId, add: novas, decidedAt: agora });
      payload = sucessora.payload;
      mudou = sucessora.changed;
    }
    if (plan.swap.state === "apply" && facts.swapProposal) {
      const troca = applyReinforcementSwap({
        current: payload,
        proposal: facts.swapProposal,
        page: facts.page,
        substituteVolume: facts.chosen.find(item => item.keywordId === plan.swap.keywordId)?.volume ?? null,
        actorId: deps.store.actorUserId,
        decidedAt: agora,
      });
      if (!troca.ok) { parar(`a troca da principal não pôde ser montada: ${troca.reason}`); break; }
      payload = troca.payload;
      mudou = true;
      resultado.swapApplied = true;
    }
    // Sucessora igual à vigente (ex.: as novas ficaram sem volume): não há versão nova.
    if (!mudou) { outcomes.push(resultado); continue; }
    payload = withHumanArticleApproval(payload, leitura.serpRefByPage.get(plan.publishedKeywordId) ?? null);
    const anterior = facts.article?.payload ?? null;
    try {
      const versao = await createVersionEnvelope({
        entityId: facts.article?.articleId ?? payload.articleId,
        versionNumber: (facts.article?.versionNumber ?? 0) + 1,
        previousVersionId: facts.article?.versionId ?? null,
        origin: "human",
        changeReason: facts.article
          ? "Reforçar publicados: keywords com volume e/ou troca da principal aprovadas por humano. URL, slug e canonical preservados."
          : "Reforçar publicados: primeiro ArticleDNA do artigo publicado, aprovado por humano. URL, slug e canonical preservados.",
        createdBy: deps.store.actorUserId,
        payload,
      }) as VersionEnvelope<ArticleDNA>;
      // A mesma portaria da rota de artefatos: aprovado só com arquitetura confirmada e evidência SERP.
      const issues = articleApprovalRevalidationIssues({ version: versao, authorizedBrandId: deps.store.brandId });
      if (issues.length) { parar(`a aprovação não passou na revalidação do servidor: ${issues.map(issue => issue.detail).join(" ")}`); break; }
      const gravada = await deps.persistArticleVersion(versao);
      const relida = await readLatestArticleDnaVersion(deps.store, versao.entityId);
      const confirma = Boolean(relida)
        && relida!.versionId === gravada.versionId
        && (gravada.status !== "PERSISTED" || relida!.contentHash === versao.contentHash)
        && publishedReinforcementReadbackConfirms({ written: payload, readback: relida?.payload ?? null, previous: anterior });
      if (!confirma) { parar("a releitura do ArticleDNA não confirmou a versão gravada."); break; }
      resultado.written = gravada.status === "PERSISTED";
      resultado.versionNumber = relida?.versionNumber ?? null;
    } catch (error) {
      parar(`o ArticleDNA não foi gravado: ${error instanceof Error ? error.message.slice(0, 160) : "erro"}`);
      break;
    }
    outcomes.push(resultado);
  }

  const tentadas = new Set(outcomes.map(item => item.publishedKeywordId));
  const naoTentadas = prontas.filter(plan => !tentadas.has(plan.publishedKeywordId));
  const desfecho = describePublishedReinforcementOutcome(outcomes, parou, naoTentadas.map(plan => plan.keyword));
  return {
    status: 200,
    body: {
      success: true,
      data: {
        mode: "apply",
        pages: outcomes,
        notAttempted: naoTentadas.map(plan => ({ publishedKeywordId: plan.publishedKeywordId, keyword: plan.keyword })),
        plans: prontas,
        written: outcomes.some(item => item.written),
        readbackConfirmed: !parou && outcomes.every(item => !item.error),
        stopped: parou,
        tone: desfecho.tone,
        message: desfecho.message,
        publishedSlugs: prontas.map(plan => ({ keywordId: plan.publishedKeywordId, slug: publishedSlugOf(plan.url) })),
      },
    },
  };
}
