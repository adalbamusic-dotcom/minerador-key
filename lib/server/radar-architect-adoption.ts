/**
 * ===== F5 · ADOTAR A VERSÃO NOVA DO ARTICLEDNA NO RADAR — o núcleo (SDD acelerar-fluxo 2026-10-13, item 14) =====
 *
 * Um núcleo só para a tela (rota `/api/editorial/radar-architect-update`) e
 * para o MCP (`adopt_architect_version`):
 *
 *   PRÉVIA (só leitura) → o hash da decisão → ADOTAR (decisão humana) →
 *   releitura confirmada → evento `adopt_architect_version`.
 *
 * O item passa a transportar a versão nova pelo MESMO caminho do envio
 * (`importArticlesToRadar` + `RadarItemSchema`), com o contexto do Silo
 * resolvido no servidor pelo índice canônico e os links do envio (aresta só da
 * versão anterior é lacuna declarada, nunca bloqueio). A investigação que
 * continua válida é reaproveitada numa versão nova da análise
 * (`radarAnalysisAdoptionPatch`); o que precisa ser refeito fica marcado.
 *
 * O Arquiteto NUNCA é tocado: o núcleo só escreve a linha `stage = radar` do
 * item, a tabela das corridas e o evento. Nada pago, nada de IA.
 *
 * Item com investigação congelada, pacote aprovado ou enviado ao Redator é
 * recusado nesta fase (D11: a troca só acontece depois do congelamento novo);
 * ele segue na versão transportada, e os entregáveis também.
 * SUBSTITUÍDO em 2026-10-18 para a TELA (`continueOnScreen`): com o Google
 * congelado (enviado ou não ao Redator) e a principal e o slug iguais, a
 * adoção vale e reabre a investigação numa versão nova da análise; a tela
 * continua na MESMA confirmação pelo "Pesquisar e finalizar" de sempre (só o
 * que falta, congelamento novo, artigo-modelo). Pelo MCP, a recusa é a de
 * antes (o congelamento novo é trabalho da tela). Pacote aprovado e principal
 * ou slug novo continuam recusados.
 *
 * Sem `server-only` e sem Supabase aqui: o acesso ao banco é a porta
 * `RadarArchitectAdoptionStore` (`radar-architect-adoption-store.ts`), para o
 * teste provar a regra com fixtures.
 *
 * 2026-10-14 · O GRAFO DE LINKS NOVO (decisão do dono: "links não mudam a
 * SERP"). O mesmo núcleo detecta também o InternalLinkGraph aprovado vigente
 * do Silo mais novo que o grafo transportado pelo item e o adota com a mesma
 * prévia, o mesmo hash, a mesma trava e a mesma releitura: troca SÓ
 * `arquitetoInternalLinks` (pelo MESMO `relevantEdgesForArticle` do envio),
 * sem versão nova da análise, e vale também para item finalizado, aprovado ou
 * enviado ao Redator. A adoção do ArticleDNA passa a levar o grafo vigente
 * quando ele cobre a versão nova.
 */

import type { ArticleDNA, InternalLinkGraph, SiloDNA, SiloPage, VersionEnvelope } from "../arquiteto/contracts.ts";
import { contentHash } from "../arquiteto/versioning.ts";
import {
  findApprovedGraphForSilo,
  relevantEdgesForArticle,
  resolveCanonicalSiloForArticle,
  type ArticleInternalLinks,
} from "../arquiteto/radar-handoff-context.ts";
import type { CanonicalApprovalIndex } from "../arquiteto/operational-status.ts";
import { importArticlesToRadar, RadarItemSchema } from "../editorial/operational-flow.ts";
import { radarReadbackMatches } from "../editorial/global-workflow-status.ts";
import { createRadarAnalysisSuccessor, VersionedRadarAnalysisSchema, type RadarAnalysisVersion } from "../radar/analysis-contracts.ts";
import { mergeAnalysisRun, splitAnalysisRun } from "../radar/analysis-run-storage.ts";
import { radarTransportedArticleDnaVersionIdOf } from "../radar/article-dna-current.ts";
import { RadarDeepResearchRecordSchema } from "../radar/deep-research.ts";
import { radarResearchResumption } from "../radar/research-resumption.ts";
import {
  classifyArchitectUpdate,
  radarArchitectAdoptionRefreezes,
  radarArchitectKeywordText,
  type RadarArchitectRefreezeInput,
  detectArchitectUpdate,
  diffArchitectLinks,
  RADAR_ARCHITECT_UPDATE_CLASS_LABEL,
  radarAdoptionSourceKeywords,
  radarAnalysisAdoptionPatch,
  radarArchitectAdoptionDecisionHash,
  radarArchitectAdoptionPlan,
  radarArchitectAdoptionRefusal,
  radarArchitectLinksAdoptionPlan,
  radarArchitectLinksFollowArticleRefusal,
  radarArchitectLinksUpdateItemHash,
  radarArchitectLinksUpdateLabel,
  radarArchitectUpdateItemHash,
  radarArchitectUpdateLabel,
  radarItemPayloadAdoptingLinks,
  radarItemPayloadAdoptingVersion,
  type RadarArchitectAdoptionRefusal,
  type RadarArchitectDnaUpdateClass,
  type RadarArchitectGraphChange,
  type RadarArchitectGraphNodeInfo,
  type RadarArchitectUpdatePreviewItem,
} from "../radar/architect-update.ts";

/* ================================ a porta ================================= */

/** A linha do item do Radar como está gravada (payload LEVE: as corridas moram em `radar_analysis_runs`). */
export type RadarAdoptionItemRow = {
  id: string;
  marca_id: string;
  article_id: string;
  stage: string;
  state: string;
  lock_version: number;
  source_entity_id: string | null;
  source_version_id: string | null;
  source_content_hash: string | null;
  created_at: string;
  updated_at: string;
  payload: Record<string, unknown> | null;
};

/**
 * A CABEÇA da linha, sem o payload: a detecção só precisa da versão
 * transportada. O payload (MBs por item) só é lido para quem tem versão nova.
 */
export type RadarAdoptionItemHead = {
  id: string;
  marca_id: string;
  article_id: string;
  stage: string;
  state: string;
  lock_version: number;
  source_version_id: string | null;
  /** `payload->>articleDnaVersionId`: a versão que o item transporta. */
  transported_version_id: string | null;
  /** 2026-10-14 · `payload->arquitetoInternalLinks->>graphVersionId`: o grafo que o item transporta (ausente = não lido). */
  carried_graph_version_id?: string | null;
};

export type RadarArchitectAdoptionStore = {
  listRadarItemHeads(brandId: string, articleIds: readonly string[] | null): Promise<RadarAdoptionItemHead[]>;
  readRadarItem(brandId: string, itemId: string): Promise<RadarAdoptionItemRow | null>;
  canonicalIndex(brandId: string): Promise<CanonicalApprovalIndex>;
  /** As versões do ArticleDNA pedidas, com o `content_hash` da coluna (conferido contra o envelope). */
  readArticleVersions(brandId: string, articleIds: readonly string[], versionIds: readonly string[]): Promise<Array<{ envelope: VersionEnvelope<ArticleDNA>; storedContentHash: string }>>;
  readSiloInputs(brandId: string, versionIds: readonly string[]): Promise<{ siloVersions: VersionEnvelope<SiloDNA>[]; siloPageVersions: VersionEnvelope<SiloPage>[] }>;
  readAnalysisRun(itemId: string, versionId: string): Promise<Record<string, unknown> | null>;
  writeAnalysisRun(input: { itemId: string; brandId: string; articleId: string; versionId: string; run: Record<string, unknown>; actorId: string }): Promise<void>;
  /** 2026-10-14 · Os InternalLinkGraph pedidos (nós e arestas), só leitura. O núcleo filtra os aprovados vigentes. */
  readInternalLinkGraphs(brandId: string, graphVersionIds: readonly string[]): Promise<InternalLinkGraph[]>;
  /**
   * Grava SÓ a linha `stage = radar` com a trava otimista. `null` = a trava não bateu.
   * Sem `source*` (adoção de links), as colunas da versão transportada não são escritas.
   */
  updateRadarItem(input: { itemId: string; brandId: string; expectedLock: number; payload: Record<string, unknown>; sourceEntityId?: string; sourceVersionId?: string; sourceContentHash?: string; actorId: string }): Promise<{ lock_version: number } | null>;
  appendDecisionEvent(input: { brandId: string; itemId: string; articleId: string; state: string; sourceVersionId: string; payload: Record<string, unknown>; actorId: string }): Promise<void>;
};

/* ================================ a prévia ================================ */

export type RadarArchitectUpdatePreview = {
  brandId: string;
  /** Itens com versão nova aprovada no Arquiteto (adotáveis ou recusados com o motivo). */
  items: RadarArchitectUpdatePreviewItem[];
  adoptable: number;
  refused: number;
  /** O hash da decisão sobre TODOS os adotáveis (o padrão da tela e do MCP). */
  decisionHash: string | null;
  /** 2026-10-14 · o hash só dos adotáveis de cada tipo (o MCP adota "só os links" ou "só a versão nova" com ele). */
  decisionHashByKind: { article_dna: string | null; links: string | null };
  readOnly: true;
};

type Candidato = {
  row: RadarAdoptionItemRow;
  from: VersionEnvelope<ArticleDNA>;
  to: VersionEnvelope<ArticleDNA>;
  classification: RadarArchitectDnaUpdateClass;
  preview: RadarArchitectUpdatePreviewItem;
  resolvedSilo: Extract<ReturnType<typeof resolveCanonicalSiloForArticle>, { ok: true }>["context"] | null;
  /** 2026-10-14 · as relações do grafo vigente para a versão nova (vêm junto na adoção); `null` = seguem as do envio. */
  linksForNewVersion: ArticleInternalLinks | null;
};

/** 2026-10-14 · A atualização de links de um item: o grafo vigente para a versão TRANSPORTADA. */
type CandidatoDeLinks = {
  row: RadarAdoptionItemRow;
  transportedVersionId: string;
  graph: RadarArchitectGraphChange;
  links: ArticleInternalLinks | null;
  preview: RadarArchitectUpdatePreviewItem;
};

type Candidatos = { dna: Candidato[]; links: CandidatoDeLinks[] };

/** O nome e o papel de cada nó dos grafos lidos (o mais novo vence). */
function nosDosGrafos(grafos: readonly InternalLinkGraph[]): Map<string, RadarArchitectGraphNodeInfo> {
  const nos = new Map<string, RadarArchitectGraphNodeInfo>();
  for (const grafo of [...grafos].sort((a, b) => a.versionNumber - b.versionNumber)) {
    for (const no of grafo.nodes) {
      nos.set(no.nodeId, {
        label: no.snapshot?.label || nos.get(no.nodeId)?.label || "",
        role: no.nodeType === "SILO_PAGE" ? "SiloPage" : no.architecturalRole,
      });
    }
  }
  return nos;
}

/** O papel deste artigo no grafo vigente (o nó da versão transportada); sem ele, o da foto do envio. */
function papelDoArtigo(grafo: InternalLinkGraph, versionId: string, payload: Record<string, unknown> | null): string | null {
  const no = grafo.nodes.find(item => item.articleDnaVersionRef?.versionId === versionId);
  if (no?.architecturalRole) return no.architecturalRole;
  const silo = registro(registro(payload?.hydration)?.silo);
  return typeof silo?.articleRole === "string" ? silo.articleRole : typeof payload?.hierarchy === "string" ? payload.hierarchy : null;
}

const registro = (valor: unknown): Record<string, unknown> | null =>
  valor && typeof valor === "object" && !Array.isArray(valor) ? valor as Record<string, unknown> : null;

const versoesDaAnalise = (payload: Record<string, unknown> | null) =>
  Array.isArray(payload?.analysisVersions) ? payload.analysisVersions as Record<string, unknown>[] : [];

/** A versão corrente da análise: a última do array (a mesma régua da trava de escrita e do append). */
const analiseCorrenteLeve = (payload: Record<string, unknown> | null) => {
  const versoes = versoesDaAnalise(payload);
  return versoes.length ? versoes[versoes.length - 1] : null;
};

/**
 * As versões que alguma leitura trata como CORRENTE: a última do array (a da
 * trava de escrita e do append) e a de maior número (a do export). No banco
 * real são a mesma; se divergirem, a recusa olha as duas — basta uma estar
 * congelada para a fotografia valer para algum leitor.
 */
function analisesCorrentesLeves(payload: Record<string, unknown> | null): Record<string, unknown>[] {
  const versoes = versoesDaAnalise(payload);
  if (!versoes.length) return [];
  let maior: Record<string, unknown> | null = null;
  for (const versao of versoes) {
    const numero = versao.versionNumber;
    if (typeof numero !== "number" || !Number.isInteger(numero) || typeof versao.versionId !== "string" || !versao.versionId) continue;
    if (!maior || numero > (maior.versionNumber as number)) maior = versao;
  }
  return [...new Set([versoes[versoes.length - 1], ...(maior ? [maior] : [])])];
}

const maiorNumeroDeVersao = (payload: Record<string, unknown> | null) =>
  Math.max(0, ...versoesDaAnalise(payload).map(versao => typeof versao.versionNumber === "number" && Number.isInteger(versao.versionNumber) ? versao.versionNumber : 0));

/** A primeira recusa entre as versões correntes (leves bastam: as fotografias e os recibos não saem da linha). */
function recusaDasCorrentes(input: { state: string; payload: Record<string, unknown> | null; from: ArticleDNA; to: ArticleDNA; allowRefreeze?: boolean }): RadarArchitectAdoptionRefusal | null {
  const correntes = analisesCorrentesLeves(input.payload);
  if (!correntes.length) return radarArchitectAdoptionRefusal({ state: input.state, analysis: null, from: input.from, to: input.to });
  for (const corrente of correntes) {
    const recusa = radarArchitectAdoptionRefusal({ state: input.state, analysis: registro(corrente.payload) as never, from: input.from, to: input.to, allowRefreeze: input.allowRefreeze });
    if (recusa) return recusa;
  }
  return null;
}

/** 2026-10-18 · Alguma versão corrente pede o congelamento novo (Google congelado, principal igual, na tela)? */
const refazCongelamentoNasCorrentes = (input: { payload: Record<string, unknown> | null; from: ArticleDNA; to: ArticleDNA; allowRefreeze?: boolean }) =>
  analisesCorrentesLeves(input.payload).some(corrente => radarArchitectAdoptionRefreezes({ analysis: registro(corrente.payload) as never, from: input.from, to: input.to, allowRefreeze: input.allowRefreeze }));

/**
 * 2026-10-18 · O QUE O CONGELAMENTO NOVO REAPROVEITA E O QUE COLETA, lido da
 * investigação gravada (a mesma autoridade de retomada do START,
 * `radarResearchResumption`): a SERP da principal com evidência, as auxiliares
 * das keywords que ficaram com evidência, as que ficaram sem resultado e as
 * keywords novas (secundárias e reforços) que ainda não têm SERP auxiliar.
 */
function entradaDoCongelamentoNovo(input: {
  analise: Record<string, unknown> | null;
  from: VersionEnvelope<ArticleDNA>;
  to: VersionEnvelope<ArticleDNA>;
  sentToWriter: boolean;
}): RadarArchitectRefreezeInput {
  const pesquisa = RadarDeepResearchRecordSchema.safeParse(input.analise?.deepResearch ?? null);
  const record = pesquisa.success ? pesquisa.data : null;
  const retomada = radarResearchResumption({ record });
  const ficam = new Set(input.to.payload.keywordReferences.map(reference => reference.keywordId));
  const antes = new Set(input.from.payload.keywordReferences.map(reference => reference.keywordId));
  const comEvidencia = new Set((record?.queries || []).filter(query => query.serpClass === "auxiliary" && query.evidence).map(query => query.keywordId));
  const novas = input.to.payload.keywordReferences
    .filter(reference => reference.role !== "principal" && !antes.has(reference.keywordId) && !comEvidencia.has(reference.keywordId))
    .map(radarArchitectKeywordText);
  return {
    sentToWriter: input.sentToWriter,
    canonicalReused: retomada.canonicalComplete,
    newKeywords: [...new Set(novas)],
    keptAuxiliaryMissing: retomada.auxiliaryToCollect.filter(query => ficam.has(query.keywordId) && antes.has(query.keywordId)).length,
    keptAuxiliaryReused: [...comEvidencia].filter(keywordId => ficam.has(keywordId)).length,
    youtubeFrozen: Boolean(input.analise?.youtubeFrozenInvestigation),
    amazonFrozen: Boolean(input.analise?.amazonFrozenInvestigation),
    fromVersionNumber: input.from.versionNumber,
    toVersionNumber: input.to.versionNumber,
  };
}

/** A versão vigente aprovada do artigo no índice canônico (a mesma régua do envio). */
function vigenteDoArtigo(canonical: CanonicalApprovalIndex, articleId: string): string | null {
  const candidatas = [...canonical.approvedArticleVersions].filter(versionId => canonical.articleIdByVersion.get(versionId) === articleId);
  return candidatas.length === 1 ? candidatas[0] : candidatas.sort()[0] ?? null;
}

const transportadaDa = (cabeca: RadarAdoptionItemHead) =>
  radarTransportedArticleDnaVersionIdOf({ payload: { articleDnaVersionId: cabeca.transported_version_id }, source_version_id: cabeca.source_version_id });

const ordemDaPrevia = (a: RadarArchitectUpdatePreviewItem, b: RadarArchitectUpdatePreviewItem) =>
  (a.siloName || "").localeCompare(b.siloName || "", "pt-BR") || a.title.localeCompare(b.title, "pt-BR")
  || Number((a.updateKind ?? "article_dna") === "links") - Number((b.updateKind ?? "article_dna") === "links");

async function montarCandidatos(store: RadarArchitectAdoptionStore, input: { brandId: string; articleIds: readonly string[] | null; siloId?: string | null; continueOnScreen?: boolean }): Promise<Candidatos> {
  const cabecas = (await store.listRadarItemHeads(input.brandId, input.articleIds))
    // 2026-10-18 · o item retirado da operação (Silo/artigo desmontado) não recebe versão nova: é histórico.
    .filter(cabeca => cabeca.marca_id === input.brandId && cabeca.stage === "radar" && cabeca.article_id && cabeca.state !== "withdrawn");
  if (!cabecas.length) return { dna: [], links: [] };
  const canonical = await store.canonicalIndex(input.brandId);
  const pares = cabecas.map(cabeca => ({
    cabeca,
    transportada: transportadaDa(cabeca),
    vigente: vigenteDoArtigo(canonical, cabeca.article_id),
  })).filter(par => par.transportada && par.vigente && par.transportada !== par.vigente);
  /*
   * 2026-10-14 · LINKS: item cujo grafo transportado NÃO é o aprovado vigente
   * (ou que não levou grafo) e marca com grafo aprovado vigente. A cabeça
   * já diz o grafo transportado; a linha inteira só é lida para quem passa.
   */
  const comLinks = canonical.approvedGraphVersions.size
    ? cabecas.filter(cabeca => transportadaDa(cabeca) && !(cabeca.carried_graph_version_id && canonical.approvedGraphVersions.has(cabeca.carried_graph_version_id)))
    : [];
  if (!pares.length && !comLinks.length) return { dna: [], links: [] };

  const idsDeVersao = [...new Set([...pares.flatMap(par => [par.transportada!, par.vigente!]), ...comLinks.map(cabeca => transportadaDa(cabeca)!)])];
  const idsDeArtigo = [...new Set([...pares.map(par => par.cabeca.article_id), ...comLinks.map(cabeca => cabeca.article_id)])];
  const versoes = await store.readArticleVersions(input.brandId, idsDeArtigo, idsDeVersao);
  const porId = new Map(versoes.map(versao => [versao.envelope.versionId, versao]));

  /* O Silo é resolvido pelo índice canônico, e os grafos lidos, só se houver algum candidato. */
  let siloInputsLidos: Awaited<ReturnType<RadarArchitectAdoptionStore["readSiloInputs"]>> | null = null;
  const siloInputs = async () => (siloInputsLidos ??= await store.readSiloInputs(input.brandId, [...canonical.approvedSiloVersions, ...canonical.approvedSiloPageVersions]));
  const grafosLidos = new Map<string, InternalLinkGraph>();
  const lerGrafos = async (ids: readonly string[]): Promise<InternalLinkGraph[]> => {
    const faltam = [...new Set(ids)].filter(id => !grafosLidos.has(id));
    if (faltam.length) {
      for (const grafo of await store.readInternalLinkGraphs(input.brandId, faltam)) {
        if (grafo.brandId === input.brandId && faltam.includes(grafo.graphVersionId)) grafosLidos.set(grafo.graphVersionId, grafo);
      }
    }
    return ids.map(id => grafosLidos.get(id)).filter((grafo): grafo is InternalLinkGraph => Boolean(grafo));
  };
  /* Os aprovados VIGENTES (o índice canônico já tira o sucedido e o com conflito): a mesma régua do envio. */
  const grafosVigentes = async () => canonical.approvedGraphVersions.size
    ? (await lerGrafos([...canonical.approvedGraphVersions])).filter(grafo => grafo.workflowStatus === "approved")
    : [];
  const linhasLidas = new Map<string, RadarAdoptionItemRow | null>();
  const lerLinha = async (cabeca: RadarAdoptionItemHead) => {
    if (!linhasLidas.has(cabeca.id)) linhasLidas.set(cabeca.id, await store.readRadarItem(input.brandId, cabeca.id));
    const linha = linhasLidas.get(cabeca.id) ?? null;
    return linha && linha.marca_id === input.brandId && linha.stage === "radar" && linha.article_id === cabeca.article_id ? linha : null;
  };

  const candidatos: Candidato[] = [];
  for (const par of pares) {
    const de = porId.get(par.transportada!);
    const para = porId.get(par.vigente!);
    if (!de || !para) continue;
    const deteccao = detectArchitectUpdate({ brandId: input.brandId, articleId: par.cabeca.article_id, transported: de.envelope, current: para.envelope });
    if (!deteccao.available) continue;
    /* Só agora a linha inteira (payload leve) e a corrida da análise corrente: só de quem tem versão nova. */
    const linha = await lerLinha(par.cabeca);
    if (!linha) continue;
    const payload = linha.payload;
    const { classification, changes } = classifyArchitectUpdate(de.envelope.payload, para.envelope.payload);
    const leve = analiseCorrenteLeve(payload);
    const versaoLeve = typeof leve?.versionId === "string" ? leve.versionId : "";
    const corrida = versaoLeve ? await store.readAnalysisRun(linha.id, versaoLeve) : null;
    const analise = registro((corrida ? mergeAnalysisRun(leve, corrida) : leve)?.payload);

    let refusal: RadarArchitectAdoptionRefusal | null = recusaDasCorrentes({ state: linha.state, payload, from: de.envelope.payload, to: para.envelope.payload, allowRefreeze: input.continueOnScreen });
    /* 2026-10-18 · a confirmação também congela de novo (Google congelado, principal igual, na tela). */
    const refaz = !refusal && refazCongelamentoNasCorrentes({ payload, from: de.envelope.payload, to: para.envelope.payload, allowRefreeze: input.continueOnScreen });
    if (!refusal && para.storedContentHash !== para.envelope.contentHash) {
      refusal = { code: "version_integrity", reason: "A versão nova do ArticleDNA diverge do que está gravado no acervo; nada foi adotado." };
    }
    let resolvedSilo: Candidato["resolvedSilo"] = null;
    if (!refusal) {
      const lidos = await siloInputs();
      const resolucao = resolveCanonicalSiloForArticle({ article: para.envelope.payload, siloVersions: lidos.siloVersions, siloPageVersions: lidos.siloPageVersions });
      if (resolucao.ok) resolvedSilo = resolucao.context;
      else refusal = { code: "silo_unresolved", reason: `O Silo da versão nova não foi resolvido no índice canônico: ${resolucao.reason}` };
    }
    /*
     * 2026-10-14 · O GRAFO VIGENTE QUE COBRE A VERSÃO NOVA vem junto na adoção
     * (o MESMO `findApprovedGraphForSilo` + `relevantEdgesForArticle` do envio).
     * Sem ele, seguem as relações do envio (aresta só da versão anterior é
     * lacuna declarada, como na F5).
     */
    const linksForNewVersion = resolvedSilo
      ? relevantEdgesForArticle({ graph: findApprovedGraphForSilo({ silo: resolvedSilo, graphs: await grafosVigentes() }), articleDnaVersionId: para.envelope.versionId })
      : null;
    const links = registro(payload?.arquitetoInternalLinks);
    const linksCobrem = linksForNewVersion ? true : links && typeof links.graphVersionId === "string" ? false : null;
    const plan = radarArchitectAdoptionPlan({
      classification,
      hasAnalysis: Boolean(analise),
      hasGoogleResearch: Boolean(analise?.deepResearch),
      hasYoutubeRun: Boolean(analise?.youtubeSearch) && !analise?.youtubeFrozenInvestigation,
      hasAmazonRun: Boolean(analise?.amazonSearch) && !analise?.amazonFrozenInvestigation,
      linksCoverNewVersion: linksCobrem,
      refreeze: refaz && !refusal
        ? entradaDoCongelamentoNovo({
          analise, from: de.envelope, to: para.envelope,
          sentToWriter: linha.state === "sent_writer" || analisesCorrentesLeves(payload).some(versao => Boolean(registro(versao.payload)?.writerBundle || registro(versao.payload)?.writerTransfer)),
        })
        : null,
    });
    const siloId = resolvedSilo?.siloId ?? (typeof payload?.siloId === "string" ? payload.siloId : null);
    const hidratacao = registro(payload?.hydration);
    const siloName = resolvedSilo?.siloName ?? (typeof registro(hidratacao?.silo)?.name === "string" ? registro(hidratacao?.silo)!.name as string : null);
    if (input.siloId && siloId !== input.siloId) continue;
    const itemHash = await radarArchitectUpdateItemHash({
      articleId: linha.article_id, itemId: linha.id, lockVersion: linha.lock_version,
      from: deteccao.from, to: { ...deteccao.to, contentHash: para.envelope.contentHash },
      classification, adoptable: !refusal, linksGraphVersionId: linksForNewVersion?.graphVersionId ?? null,
    });
    candidatos.push({
      row: linha, from: de.envelope, to: para.envelope, classification, resolvedSilo, linksForNewVersion,
      preview: {
        articleId: linha.article_id, itemId: linha.id, lockVersion: linha.lock_version,
        title: typeof payload?.title === "string" ? payload.title : para.envelope.payload.promise,
        slug: typeof payload?.slug === "string" ? payload.slug : de.envelope.payload.suggestedSlug,
        siloId, siloName, state: linha.state, updateKind: "article_dna",
        label: radarArchitectUpdateLabel(deteccao.from.versionNumber, deteccao.to.versionNumber),
        from: deteccao.from, to: deteccao.to,
        classification, classificationLabel: RADAR_ARCHITECT_UPDATE_CLASS_LABEL[classification],
        changes, plan, adoptable: !refusal, refusal, itemHash,
      },
    });
  }

  /*
   * 2026-10-14 · A ATUALIZAÇÃO DE LINKS. O grafo aprovado vigente do Silo do
   * artigo (resolvido pela versão TRANSPORTADA, como no envio) é outro que o
   * transportado e cobre a versão transportada: adotável em qualquer estado
   * do item. Se ele só cobre a versão nova do ArticleDNA, aparece recusado
   * ("os links chegam com a adoção dela") e a regra do ArticleDNA continua.
   */
  const dnaPorArtigo = new Map(candidatos.map(candidato => [candidato.row.article_id, candidato]));
  const deLinks: CandidatoDeLinks[] = [];
  for (const cabeca of comLinks) {
    const transportada = transportadaDa(cabeca)!;
    const de = porId.get(transportada);
    if (!de || de.envelope.payload.articleId !== cabeca.article_id || de.envelope.payload.brandId !== input.brandId) continue;
    const linha = await lerLinha(cabeca);
    if (!linha) continue;
    const payload = linha.payload;
    const lidos = RadarItemSchema.shape.arquitetoInternalLinks.safeParse(payload?.arquitetoInternalLinks ?? null);
    if (!lidos.success) continue;
    const carregados = lidos.data ?? null;
    if (carregados && canonical.approvedGraphVersions.has(carregados.graphVersionId)) continue;
    const silos = await siloInputs();
    const resolucao = resolveCanonicalSiloForArticle({ article: de.envelope.payload, siloVersions: silos.siloVersions, siloPageVersions: silos.siloPageVersions });
    if (!resolucao.ok) continue;
    const grafo = findApprovedGraphForSilo({ silo: resolucao.context, graphs: await grafosVigentes() });
    if (!grafo || grafo.graphVersionId === carregados?.graphVersionId) continue;
    const novos = relevantEdgesForArticle({ graph: grafo, articleDnaVersionId: transportada });
    const doArticleDna = dnaPorArtigo.get(cabeca.article_id);
    let refusal: RadarArchitectAdoptionRefusal | null = null;
    if (!novos) {
      /* O grafo vigente não cobre a versão transportada: só aparece se ele cobre a versão nova do ArticleDNA (que vem junto). */
      if (!doArticleDna || !relevantEdgesForArticle({ graph: grafo, articleDnaVersionId: doArticleDna.to.versionId })) continue;
      refusal = radarArchitectLinksFollowArticleRefusal(doArticleDna.to.versionNumber, grafo.versionNumber);
    }
    const siloId: string | null = resolucao.context.siloId;
    if (input.siloId && siloId !== input.siloId) continue;
    const anterior = carregados ? (await lerGrafos([carregados.graphVersionId]))[0] ?? null : null;
    const graph: RadarArchitectGraphChange = {
      graphId: grafo.graphId,
      fromGraphVersionId: carregados?.graphVersionId ?? null,
      fromGraphVersionNumber: anterior?.versionNumber ?? null,
      toGraphVersionId: grafo.graphVersionId,
      toGraphVersionNumber: grafo.versionNumber,
      toGraphContentHash: grafo.contentHash,
    };
    const correntes = analisesCorrentesLeves(payload).map(versao => registro(versao.payload));
    const congelado = correntes.some(analise => Boolean(analise?.finalizedBundle || analise?.youtubeFrozenInvestigation || analise?.amazonFrozenInvestigation));
    const enviado = linha.state === "sent_writer" || correntes.some(analise => Boolean(analise?.writerBundle || analise?.writerTransfer));
    const changes = novos
      ? diffArchitectLinks({ articleRole: papelDoArtigo(grafo, transportada, payload), from: carregados, to: novos, nodes: nosDosGrafos(anterior ? [anterior, grafo] : [grafo]) })
      : [];
    const itemHash = await radarArchitectLinksUpdateItemHash({
      articleId: linha.article_id, itemId: linha.id, lockVersion: linha.lock_version, transportedVersionId: transportada, graph, adoptable: !refusal,
    });
    const versaoTransportada = { versionId: transportada, versionNumber: de.envelope.versionNumber };
    deLinks.push({
      row: linha, transportedVersionId: transportada, graph, links: novos,
      preview: {
        articleId: linha.article_id, itemId: linha.id, lockVersion: linha.lock_version,
        title: typeof payload?.title === "string" ? payload.title : de.envelope.payload.promise,
        slug: typeof payload?.slug === "string" ? payload.slug : de.envelope.payload.suggestedSlug,
        siloId, siloName: resolucao.context.siloName, state: linha.state, updateKind: "links",
        label: radarArchitectLinksUpdateLabel(graph.fromGraphVersionNumber, graph.toGraphVersionNumber),
        from: versaoTransportada, to: versaoTransportada, graph,
        classification: "links_changed", classificationLabel: RADAR_ARCHITECT_UPDATE_CLASS_LABEL.links_changed,
        changes, plan: radarArchitectLinksAdoptionPlan({ frozen: congelado, sentToWriter: enviado }),
        adoptable: !refusal, refusal, itemHash,
      },
    });
  }
  return {
    dna: candidatos.sort((a, b) => ordemDaPrevia(a.preview, b.preview)),
    links: deLinks.sort((a, b) => ordemDaPrevia(a.preview, b.preview)),
  };
}

/** A PRÉVIA: leitura pura. Nada é gravado; o Arquiteto não é lido além do acervo, do índice canônico e dos grafos. */
export async function previewArchitectUpdatesWithCore(store: RadarArchitectAdoptionStore, input: {
  brandId: string; articleIds?: readonly string[] | null; siloId?: string | null;
  /** 2026-10-18 · a tela do Radar continua o congelamento novo depois da adoção (o MCP não: lá a recusa é a de antes). */
  continueOnScreen?: boolean;
}): Promise<RadarArchitectUpdatePreview> {
  const { dna, links } = await montarCandidatos(store, { brandId: input.brandId, articleIds: input.articleIds?.length ? input.articleIds : null, siloId: input.siloId ?? null, continueOnScreen: input.continueOnScreen });
  const items = [...dna.map(candidato => candidato.preview), ...links.map(candidato => candidato.preview)].sort(ordemDaPrevia);
  const adotaveis = items.filter(item => item.adoptable);
  const doTipo = (tipo: "article_dna" | "links") => adotaveis.filter(item => (item.updateKind ?? "article_dna") === tipo);
  const hashDe = async (lista: RadarArchitectUpdatePreviewItem[]) => lista.length ? await radarArchitectAdoptionDecisionHash(lista) : null;
  return {
    brandId: input.brandId,
    items,
    adoptable: adotaveis.length,
    refused: items.length - adotaveis.length,
    decisionHash: await hashDe(adotaveis),
    decisionHashByKind: { article_dna: await hashDe(doTipo("article_dna")), links: await hashDe(doTipo("links")) },
    readOnly: true,
  };
}

/* ================================= adotar ================================= */

/** `updateKind` ausente = a versão nova do ArticleDNA (o leitor de antes segue igual). */
export type RadarArchitectAdoptionOutcome =
  /** 2026-10-18 · `refreeze`: a investigação foi reaberta na versão nova e a tela continua o congelamento novo. */
  | { articleId: string; status: "adopted"; updateKind?: "article_dna"; title: string; from: number; to: number; classification: RadarArchitectUpdatePreviewItem["classification"]; redo: string[]; lockVersion: number; refreeze?: boolean }
  | { articleId: string; status: "adopted"; updateKind: "links"; title: string; fromGraphVersion: number | null; toGraphVersion: number; classification: "links_changed"; redo: string[]; lockVersion: number }
  | { articleId: string; status: "refused"; updateKind?: "article_dna" | "links"; code: string; reason: string }
  | { articleId: string; status: "nothing_to_adopt"; updateKind?: "article_dna" | "links"; reason: string };

export type RadarArchitectAdoptionResult =
  | { state: "APPLIED"; adopted: number; refused: number; results: RadarArchitectAdoptionOutcome[]; readbackConfirmed: boolean }
  | { state: "REFUSED"; code: "STALE_DECISION" | "NOTHING_TO_ADOPT"; message: string };

class RecusaDoItem extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}

/**
 * ADOTAR — decisão humana sobre a prévia, por artigo e em lote.
 *
 * `articleIds` é a seleção confirmada da versão nova do ArticleDNA e
 * `linkArticleIds` a dos links novos (2026-10-14); a recusa por item é
 * desmarcar. O hash é recalculado sobre o estado de AGORA, com as duas
 * seleções; se a prévia venceu (item mexido, versão ou grafo novo outra vez),
 * nada é gravado. Item recusado pela regra sai com o motivo e os outros seguem.
 */
export async function adoptArchitectVersionWithCore(store: RadarArchitectAdoptionStore, input: {
  brandId: string;
  actorId: string;
  articleIds: readonly string[];
  /** 2026-10-14 · os artigos cujos links novos (grafo vigente) a pessoa adota. */
  linkArticleIds?: readonly string[];
  decisionHash: string;
  now?: string;
  /** 2026-10-18 · a tela continua o congelamento novo (a mesma régua da prévia que ela mostrou). */
  continueOnScreen?: boolean;
}): Promise<RadarArchitectAdoptionResult> {
  const pedidos = [...new Set(input.articleIds.map(id => id.trim()).filter(Boolean))];
  const pedidosDeLinks = [...new Set((input.linkArticleIds ?? []).map(id => id.trim()).filter(Boolean))];
  if (!pedidos.length && !pedidosDeLinks.length) return { state: "REFUSED", code: "NOTHING_TO_ADOPT", message: "Nenhum artigo selecionado para adotar a versão nova." };
  const { dna: candidatos, links: deLinks } = await montarCandidatos(store, { brandId: input.brandId, articleIds: [...new Set([...pedidos, ...pedidosDeLinks])], continueOnScreen: input.continueOnScreen });
  const porArtigo = new Map(candidatos.map(candidato => [candidato.row.article_id, candidato]));
  const linksPorArtigo = new Map(deLinks.map(candidato => [candidato.row.article_id, candidato]));
  const adotaveis = pedidos.map(id => porArtigo.get(id)).filter((candidato): candidato is Candidato => Boolean(candidato?.preview.adoptable));
  const linksAdotaveis = pedidosDeLinks.map(id => linksPorArtigo.get(id)).filter((candidato): candidato is CandidatoDeLinks => Boolean(candidato?.preview.adoptable));
  if (!adotaveis.length && !linksAdotaveis.length) {
    return { state: "REFUSED", code: "NOTHING_TO_ADOPT", message: "Nenhum dos artigos selecionados tem versão nova adotável agora: releia a prévia." };
  }
  const hashAgora = await radarArchitectAdoptionDecisionHash([...adotaveis, ...linksAdotaveis].map(candidato => candidato.preview));
  if (hashAgora !== input.decisionHash.trim().toLowerCase()) {
    return { state: "REFUSED", code: "STALE_DECISION", message: "A prévia mudou desde que foi mostrada (o item foi alterado ou há outra versão nova). Nada foi gravado: gere a prévia de novo e confirme." };
  }

  const now = input.now ?? new Date().toISOString();
  const results: RadarArchitectAdoptionOutcome[] = [];
  const adotadosAgora = new Set<string>();
  for (const articleId of pedidos) {
    const candidato = porArtigo.get(articleId);
    if (!candidato) { results.push({ articleId, status: "nothing_to_adopt", reason: "Este item já está na versão vigente do Arquiteto." }); continue; }
    if (!candidato.preview.adoptable) {
      results.push({ articleId, status: "refused", code: candidato.preview.refusal?.code ?? "refused", reason: candidato.preview.refusal?.reason ?? "Recusado." });
      continue;
    }
    try {
      const lock = await adotarUm(store, candidato, { brandId: input.brandId, actorId: input.actorId, now, continueOnScreen: input.continueOnScreen });
      adotadosAgora.add(articleId);
      results.push({
        articleId, status: "adopted", title: candidato.preview.title, from: candidato.preview.from.versionNumber, to: candidato.preview.to.versionNumber,
        classification: candidato.preview.classification, redo: candidato.preview.plan.redo, lockVersion: lock,
        ...(candidato.preview.plan.refreeze ? { refreeze: true } : {}),
      });
    } catch (error) {
      if (error instanceof RecusaDoItem) { results.push({ articleId, status: "refused", code: error.code, reason: error.message }); continue; }
      throw error;
    }
  }
  /* 2026-10-14 · os links novos, depois da versão nova (a do mesmo artigo, adotada agora, já levou o grafo que a cobre). */
  for (const articleId of pedidosDeLinks) {
    const candidato = linksPorArtigo.get(articleId);
    if (adotadosAgora.has(articleId)) {
      const levou = porArtigo.get(articleId)?.linksForNewVersion;
      results.push({ articleId, status: "nothing_to_adopt", updateKind: "links", reason: levou
        ? `Os links do grafo vigente vieram junto com a versão nova adotada agora.`
        : "O item passou para a versão nova agora; os links seguem os do envio até o grafo aprovado cobrir a versão nova (gere a prévia de novo)." });
      continue;
    }
    if (!candidato) { results.push({ articleId, status: "nothing_to_adopt", updateKind: "links", reason: "Este item já transporta o grafo de links vigente do Arquiteto." }); continue; }
    if (!candidato.preview.adoptable) {
      results.push({ articleId, status: "refused", updateKind: "links", code: candidato.preview.refusal?.code ?? "refused", reason: candidato.preview.refusal?.reason ?? "Recusado." });
      continue;
    }
    try {
      const lock = await adotarLinks(store, candidato, { brandId: input.brandId, actorId: input.actorId });
      results.push({ articleId, status: "adopted", updateKind: "links", title: candidato.preview.title, fromGraphVersion: candidato.graph.fromGraphVersionNumber, toGraphVersion: candidato.graph.toGraphVersionNumber, classification: "links_changed", redo: [], lockVersion: lock });
    } catch (error) {
      if (error instanceof RecusaDoItem) { results.push({ articleId, status: "refused", updateKind: "links", code: error.code, reason: error.message }); continue; }
      throw error;
    }
  }
  const adopted = results.filter(item => item.status === "adopted").length;
  return { state: "APPLIED", adopted, refused: results.filter(item => item.status === "refused").length, results, readbackConfirmed: adopted > 0 };
}

async function adotarUm(store: RadarArchitectAdoptionStore, candidato: Candidato, input: { brandId: string; actorId: string; now: string; continueOnScreen?: boolean }): Promise<number> {
  const { to, from } = candidato;
  const articleId = candidato.row.article_id;
  /* 1 · a linha de AGORA, com a trava da prévia. */
  const linha = await store.readRadarItem(input.brandId, candidato.row.id);
  if (!linha || linha.marca_id !== input.brandId || linha.stage !== "radar" || linha.article_id !== articleId) throw new RecusaDoItem("radar_item_not_found", "O item do Radar não foi encontrado nesta marca.");
  if (linha.lock_version !== candidato.row.lock_version) throw new RecusaDoItem("stale_item", "O item mudou depois da prévia (outra gravação no Radar). Gere a prévia de novo.");
  if (await contentHash(to.payload) !== to.contentHash) throw new RecusaDoItem("version_integrity", "A versão nova do ArticleDNA não confere com o próprio hash; nada foi adotado.");
  const payloadAtual = linha.payload ?? {};

  /* 2 · a versão corrente da análise, INTEIRA (leve + corrida), e a mesma recusa da prévia sobre ela. */
  const leve = analiseCorrenteLeve(payloadAtual);
  let corrente: RadarAnalysisVersion | null = null;
  if (leve) {
    const versionId = typeof leve.versionId === "string" ? leve.versionId : "";
    const corrida = versionId ? await store.readAnalysisRun(linha.id, versionId) : null;
    corrente = VersionedRadarAnalysisSchema.parse(corrida ? mergeAnalysisRun(leve, corrida) : leve);
  }
  const recusa = recusaDasCorrentes({ state: linha.state, payload: payloadAtual, from: from.payload, to: to.payload, allowRefreeze: input.continueOnScreen });
  if (recusa) throw new RecusaDoItem(recusa.code, recusa.reason);
  /* 2026-10-18 · a mesma régua da prévia: a investigação do Google é reaberta na versão nova (a fotografia antiga fica no histórico). */
  const refaz = Boolean(candidato.preview.plan.refreeze) && refazCongelamentoNasCorrentes({ payload: payloadAtual, from: from.payload, to: to.payload, allowRefreeze: input.continueOnScreen });

  /* 3 · o item construído pelo MESMO caminho do envio. */
  const atual = RadarItemSchema.safeParse({ ...payloadAtual, id: linha.id, brandId: linha.marca_id, articleId, state: linha.state, lockVersion: linha.lock_version, importedAt: new Date(linha.created_at).toISOString(), updatedAt: new Date(linha.updated_at).toISOString(), origin: "real" });
  if (!atual.success) throw new RecusaDoItem("radar_item_incompatible", "O item do Radar não corresponde ao contrato vigente; nada foi adotado.");
  if (!candidato.resolvedSilo) throw new RecusaDoItem("silo_unresolved", "O Silo da versão nova não foi resolvido.");
  const carregado = atual.data;
  const contexto = {
    silo: candidato.resolvedSilo,
    /* 2026-10-14 · o grafo vigente que cobre a versão nova vem junto; sem ele, as relações do envio. */
    internalLinks: candidato.linksForNewVersion ?? carregado.arquitetoInternalLinks ?? null,
    /* A proveniência da SERP da formação vale para a mesma principal; com a principal nova, ela não descreve o artigo. */
    serpProvenance: candidato.preview.classification === "principal_changed" ? null : carregado.arquitetoSerpProvenance ?? null,
  };
  const [construido] = importArticlesToRadar([], [to], input.brandId, input.now, radarAdoptionSourceKeywords(carregado.hydration), {}, {},
    { [articleId]: carregado.arquitetoSerpAssessment ?? null }, { [articleId]: contexto as never });
  if (!construido) throw new RecusaDoItem("silo_unresolved", "O envio não montou o item da versão nova (Silo não resolvido).");
  const item = RadarItemSchema.parse(construido);
  if (item.articleId !== articleId || item.articleDnaVersionId !== to.versionId || item.articleDnaContentHash !== to.contentHash || item.brandId !== input.brandId) {
    throw new RecusaDoItem("radar_item_mismatch", "O item construído não corresponde à versão nova do ArticleDNA.");
  }

  /* 4 · a versão nova da análise: reaproveita o que vale, marca o que refaz. A corrida vai antes do payload. */
  let versoes = versoesDaAnalise(payloadAtual);
  if (corrente) {
    const patch = radarAnalysisAdoptionPatch({ current: corrente.payload, to, classification: candidato.classification, refreeze: refaz });
    const sucessora = await createRadarAnalysisSuccessor(corrente, patch, input.actorId, input.now);
    /* O número nunca repete um que a linha já tem (a versão de maior número pode não ser a última do array). */
    const comMotivo = VersionedRadarAnalysisSchema.parse({
      ...sucessora,
      versionNumber: Math.max(sucessora.versionNumber, maiorNumeroDeVersao(payloadAtual) + 1),
      changeReason: `Adoção da versão nova do ArticleDNA no Radar (v${from.versionNumber} → v${to.versionNumber}, ${candidato.preview.classification})${refaz ? "; investigação do Google reaberta para o congelamento novo" : ""}.`,
    });
    const { light, run, hasRun } = splitAnalysisRun(comMotivo as unknown as Record<string, unknown>);
    if (hasRun) await store.writeAnalysisRun({ itemId: linha.id, brandId: input.brandId, articleId, versionId: comMotivo.versionId, run, actorId: input.actorId });
    versoes = [...versoes, light];
  }
  const proximo = { ...radarItemPayloadAdoptingVersion({ currentPayload: payloadAtual, built: item }), analysisVersions: versoes };
  const validado = RadarItemSchema.safeParse({ ...proximo, id: linha.id, brandId: linha.marca_id, articleId, state: linha.state, lockVersion: linha.lock_version, importedAt: carregado.importedAt, updatedAt: input.now, origin: "real" });
  if (!validado.success) throw new RecusaDoItem("radar_item_incompatible", "O item adotado não passaria no contrato do Radar; nada foi gravado.");

  /* 5 · a gravação, com a trava otimista, e a releitura. */
  const gravado = await store.updateRadarItem({ itemId: linha.id, brandId: input.brandId, expectedLock: linha.lock_version, payload: proximo, sourceEntityId: to.entityId, sourceVersionId: to.versionId, sourceContentHash: to.contentHash, actorId: input.actorId });
  if (!gravado) throw new RecusaDoItem("stale_item", "O item mudou durante a adoção (trava otimista). Nada foi gravado: gere a prévia de novo.");
  const relido = await store.readRadarItem(input.brandId, linha.id);
  const doRelido = registro(relido?.payload);
  if (!relido || !radarReadbackMatches(relido as never, input.brandId, articleId, to.versionId, to.contentHash) || doRelido?.articleDnaVersionId !== to.versionId) {
    throw new RecusaDoItem("readback_failed", "A releitura do servidor não confirmou a versão nova no item.");
  }
  await store.appendDecisionEvent({
    brandId: input.brandId, itemId: linha.id, articleId, state: linha.state, sourceVersionId: to.versionId, actorId: input.actorId,
    payload: {
      fromVersionId: from.versionId, fromVersionNumber: from.versionNumber, toVersionId: to.versionId, toVersionNumber: to.versionNumber,
      classification: candidato.preview.classification, changes: candidato.preview.changes.map(change => change.field), itemHash: candidato.preview.itemHash,
      ...(candidato.linksForNewVersion ? { linksGraphVersionId: candidato.linksForNewVersion.graphVersionId } : {}),
      ...(refaz ? { refreeze: true } : {}),
    },
  });
  return relido.lock_version;
}

/**
 * 2026-10-14 · ADOTAR OS LINKS NOVOS de um item: troca SÓ o grafo transportado
 * (`arquitetoInternalLinks`), pelo MESMO `relevantEdgesForArticle` do envio,
 * na versão transportada do ArticleDNA. A análise não ganha versão nova (a
 * investigação, a SERP, as evidências, o pacote congelado e a planta ficam),
 * as colunas da versão transportada não são escritas e o estado do item não
 * muda. Vale em qualquer estado: links não mudam a SERP.
 */
async function adotarLinks(store: RadarArchitectAdoptionStore, candidato: CandidatoDeLinks, input: { brandId: string; actorId: string }): Promise<number> {
  const articleId = candidato.row.article_id;
  if (!candidato.links) throw new RecusaDoItem("links_follow_article_version", "O grafo vigente não cobre a versão transportada.");
  /* 1 · a linha de AGORA, com a trava da prévia, na mesma versão e no mesmo grafo de origem. */
  const linha = await store.readRadarItem(input.brandId, candidato.row.id);
  if (!linha || linha.marca_id !== input.brandId || linha.stage !== "radar" || linha.article_id !== articleId) throw new RecusaDoItem("radar_item_not_found", "O item do Radar não foi encontrado nesta marca.");
  if (linha.lock_version !== candidato.row.lock_version) throw new RecusaDoItem("stale_item", "O item mudou depois da prévia (outra gravação no Radar). Gere a prévia de novo.");
  const payloadAtual = linha.payload ?? {};
  if (radarTransportedArticleDnaVersionIdOf({ payload: payloadAtual, source_version_id: linha.source_version_id }) !== candidato.transportedVersionId) {
    throw new RecusaDoItem("stale_item", "O item passou a transportar outra versão do ArticleDNA depois da prévia. Gere a prévia de novo.");
  }
  const origem = registro(payloadAtual.arquitetoInternalLinks);
  if ((typeof origem?.graphVersionId === "string" ? origem.graphVersionId : null) !== candidato.graph.fromGraphVersionId) {
    throw new RecusaDoItem("stale_item", "O grafo transportado pelo item mudou depois da prévia. Gere a prévia de novo.");
  }

  /* 2 · o item continua no contrato com o grafo novo; nada mais muda. */
  const meta = { id: linha.id, brandId: linha.marca_id, articleId, state: linha.state, lockVersion: linha.lock_version, importedAt: new Date(linha.created_at).toISOString(), updatedAt: new Date(linha.updated_at).toISOString(), origin: "real" };
  if (!RadarItemSchema.safeParse({ ...payloadAtual, ...meta }).success) throw new RecusaDoItem("radar_item_incompatible", "O item do Radar não corresponde ao contrato vigente; nada foi adotado.");
  const links = RadarItemSchema.shape.arquitetoInternalLinks.parse(candidato.links);
  if (!links || links.graphVersionId !== candidato.graph.toGraphVersionId) throw new RecusaDoItem("radar_item_mismatch", "As relações montadas não são as do grafo vigente.");
  const proximo = radarItemPayloadAdoptingLinks({ currentPayload: payloadAtual, links });
  if (!RadarItemSchema.safeParse({ ...proximo, ...meta }).success) throw new RecusaDoItem("radar_item_incompatible", "O item com os links novos não passaria no contrato do Radar; nada foi gravado.");

  /* 3 · a gravação (só a linha stage = radar, sem as colunas da versão), a releitura e o evento. */
  const gravado = await store.updateRadarItem({ itemId: linha.id, brandId: input.brandId, expectedLock: linha.lock_version, payload: proximo, actorId: input.actorId });
  if (!gravado) throw new RecusaDoItem("stale_item", "O item mudou durante a adoção (trava otimista). Nada foi gravado: gere a prévia de novo.");
  const relido = await store.readRadarItem(input.brandId, linha.id);
  const doRelido = registro(relido?.payload);
  const grafoRelido = registro(doRelido?.arquitetoInternalLinks);
  if (!relido || relido.article_id !== articleId || grafoRelido?.graphVersionId !== candidato.graph.toGraphVersionId
    || radarTransportedArticleDnaVersionIdOf({ payload: doRelido ?? {}, source_version_id: relido.source_version_id }) !== candidato.transportedVersionId) {
    throw new RecusaDoItem("readback_failed", "A releitura do servidor não confirmou os links novos no item.");
  }
  await store.appendDecisionEvent({
    brandId: input.brandId, itemId: linha.id, articleId, state: linha.state, sourceVersionId: candidato.transportedVersionId, actorId: input.actorId,
    payload: {
      updateKind: "links", classification: "links_changed",
      fromGraphVersionId: candidato.graph.fromGraphVersionId, fromGraphVersionNumber: candidato.graph.fromGraphVersionNumber,
      toGraphVersionId: candidato.graph.toGraphVersionId, toGraphVersionNumber: candidato.graph.toGraphVersionNumber,
      changes: candidato.preview.changes.map(change => change.field), itemHash: candidato.preview.itemHash,
    },
  });
  return relido.lock_version;
}
