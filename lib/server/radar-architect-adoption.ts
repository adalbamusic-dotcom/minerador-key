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
 *
 * Sem `server-only` e sem Supabase aqui: o acesso ao banco é a porta
 * `RadarArchitectAdoptionStore` (`radar-architect-adoption-store.ts`), para o
 * teste provar a regra com fixtures.
 */

import type { ArticleDNA, SiloDNA, SiloPage, VersionEnvelope } from "../arquiteto/contracts.ts";
import { contentHash } from "../arquiteto/versioning.ts";
import { resolveCanonicalSiloForArticle } from "../arquiteto/radar-handoff-context.ts";
import type { CanonicalApprovalIndex } from "../arquiteto/operational-status.ts";
import { importArticlesToRadar, RadarItemSchema } from "../editorial/operational-flow.ts";
import { radarReadbackMatches } from "../editorial/global-workflow-status.ts";
import { createRadarAnalysisSuccessor, VersionedRadarAnalysisSchema, type RadarAnalysisVersion } from "../radar/analysis-contracts.ts";
import { mergeAnalysisRun, splitAnalysisRun } from "../radar/analysis-run-storage.ts";
import { radarTransportedArticleDnaVersionIdOf } from "../radar/article-dna-current.ts";
import {
  classifyArchitectUpdate,
  detectArchitectUpdate,
  RADAR_ARCHITECT_UPDATE_CLASS_LABEL,
  radarAdoptionSourceKeywords,
  radarAnalysisAdoptionPatch,
  radarArchitectAdoptionDecisionHash,
  radarArchitectAdoptionPlan,
  radarArchitectAdoptionRefusal,
  radarArchitectUpdateItemHash,
  radarArchitectUpdateLabel,
  radarItemPayloadAdoptingVersion,
  type RadarArchitectAdoptionRefusal,
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
  /** Grava SÓ a linha `stage = radar` com a trava otimista. `null` = a trava não bateu. */
  updateRadarItem(input: { itemId: string; brandId: string; expectedLock: number; payload: Record<string, unknown>; sourceEntityId: string; sourceVersionId: string; sourceContentHash: string; actorId: string }): Promise<{ lock_version: number } | null>;
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
  readOnly: true;
};

type Candidato = {
  row: RadarAdoptionItemRow;
  from: VersionEnvelope<ArticleDNA>;
  to: VersionEnvelope<ArticleDNA>;
  preview: RadarArchitectUpdatePreviewItem;
  resolvedSilo: Extract<ReturnType<typeof resolveCanonicalSiloForArticle>, { ok: true }>["context"] | null;
};

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
function recusaDasCorrentes(input: { state: string; payload: Record<string, unknown> | null; from: ArticleDNA; to: ArticleDNA }): RadarArchitectAdoptionRefusal | null {
  const correntes = analisesCorrentesLeves(input.payload);
  if (!correntes.length) return radarArchitectAdoptionRefusal({ state: input.state, analysis: null, from: input.from, to: input.to });
  for (const corrente of correntes) {
    const recusa = radarArchitectAdoptionRefusal({ state: input.state, analysis: registro(corrente.payload) as never, from: input.from, to: input.to });
    if (recusa) return recusa;
  }
  return null;
}

/** A versão vigente aprovada do artigo no índice canônico (a mesma régua do envio). */
function vigenteDoArtigo(canonical: CanonicalApprovalIndex, articleId: string): string | null {
  const candidatas = [...canonical.approvedArticleVersions].filter(versionId => canonical.articleIdByVersion.get(versionId) === articleId);
  return candidatas.length === 1 ? candidatas[0] : candidatas.sort()[0] ?? null;
}

async function montarCandidatos(store: RadarArchitectAdoptionStore, input: { brandId: string; articleIds: readonly string[] | null; siloId?: string | null }): Promise<Candidato[]> {
  const cabecas = (await store.listRadarItemHeads(input.brandId, input.articleIds))
    .filter(cabeca => cabeca.marca_id === input.brandId && cabeca.stage === "radar" && cabeca.article_id);
  if (!cabecas.length) return [];
  const canonical = await store.canonicalIndex(input.brandId);
  const pares = cabecas.map(cabeca => ({
    cabeca,
    transportada: radarTransportedArticleDnaVersionIdOf({ payload: { articleDnaVersionId: cabeca.transported_version_id }, source_version_id: cabeca.source_version_id }),
    vigente: vigenteDoArtigo(canonical, cabeca.article_id),
  })).filter(par => par.transportada && par.vigente && par.transportada !== par.vigente);
  if (!pares.length) return [];

  const versoes = await store.readArticleVersions(input.brandId, [...new Set(pares.map(par => par.cabeca.article_id))], [...new Set(pares.flatMap(par => [par.transportada!, par.vigente!]))]);
  const porId = new Map(versoes.map(versao => [versao.envelope.versionId, versao]));

  /* O Silo é resolvido pelo índice canônico, só se houver algum candidato. */
  let siloInputs: Awaited<ReturnType<RadarArchitectAdoptionStore["readSiloInputs"]>> | null = null;
  const candidatos: Candidato[] = [];
  for (const par of pares) {
    const de = porId.get(par.transportada!);
    const para = porId.get(par.vigente!);
    if (!de || !para) continue;
    const deteccao = detectArchitectUpdate({ brandId: input.brandId, articleId: par.cabeca.article_id, transported: de.envelope, current: para.envelope });
    if (!deteccao.available) continue;
    /* Só agora a linha inteira (payload leve) e a corrida da análise corrente: só de quem tem versão nova. */
    const linha = await store.readRadarItem(input.brandId, par.cabeca.id);
    if (!linha || linha.marca_id !== input.brandId || linha.stage !== "radar" || linha.article_id !== par.cabeca.article_id) continue;
    const payload = linha.payload;
    const { classification, changes } = classifyArchitectUpdate(de.envelope.payload, para.envelope.payload);
    const leve = analiseCorrenteLeve(payload);
    const versaoLeve = typeof leve?.versionId === "string" ? leve.versionId : "";
    const corrida = versaoLeve ? await store.readAnalysisRun(linha.id, versaoLeve) : null;
    const analise = registro((corrida ? mergeAnalysisRun(leve, corrida) : leve)?.payload);

    let refusal: RadarArchitectAdoptionRefusal | null = recusaDasCorrentes({ state: linha.state, payload, from: de.envelope.payload, to: para.envelope.payload });
    if (!refusal && para.storedContentHash !== para.envelope.contentHash) {
      refusal = { code: "version_integrity", reason: "A versão nova do ArticleDNA diverge do que está gravado no acervo; nada foi adotado." };
    }
    let resolvedSilo: Candidato["resolvedSilo"] = null;
    if (!refusal) {
      siloInputs ??= await store.readSiloInputs(input.brandId, [...canonical.approvedSiloVersions, ...canonical.approvedSiloPageVersions]);
      const resolucao = resolveCanonicalSiloForArticle({ article: para.envelope.payload, siloVersions: siloInputs.siloVersions, siloPageVersions: siloInputs.siloPageVersions });
      if (resolucao.ok) resolvedSilo = resolucao.context;
      else refusal = { code: "silo_unresolved", reason: `O Silo da versão nova não foi resolvido no índice canônico: ${resolucao.reason}` };
    }
    const links = registro(payload?.arquitetoInternalLinks);
    const linksCobrem = links && typeof links.graphVersionId === "string"
      ? [...(canonical.graphBases?.values() ?? [])].some(base => base.articleVersionIds.includes(para.envelope.versionId))
      : null;
    const plan = radarArchitectAdoptionPlan({
      classification,
      hasAnalysis: Boolean(analise),
      hasGoogleResearch: Boolean(analise?.deepResearch),
      hasYoutubeRun: Boolean(analise?.youtubeSearch) && !analise?.youtubeFrozenInvestigation,
      hasAmazonRun: Boolean(analise?.amazonSearch) && !analise?.amazonFrozenInvestigation,
      linksCoverNewVersion: linksCobrem,
    });
    const siloId = resolvedSilo?.siloId ?? (typeof payload?.siloId === "string" ? payload.siloId : null);
    const hidratacao = registro(payload?.hydration);
    const siloName = resolvedSilo?.siloName ?? (typeof registro(hidratacao?.silo)?.name === "string" ? registro(hidratacao?.silo)!.name as string : null);
    if (input.siloId && siloId !== input.siloId) continue;
    const itemHash = await radarArchitectUpdateItemHash({
      articleId: linha.article_id, itemId: linha.id, lockVersion: linha.lock_version,
      from: deteccao.from, to: { ...deteccao.to, contentHash: para.envelope.contentHash },
      classification, adoptable: !refusal,
    });
    candidatos.push({
      row: linha, from: de.envelope, to: para.envelope, resolvedSilo,
      preview: {
        articleId: linha.article_id, itemId: linha.id, lockVersion: linha.lock_version,
        title: typeof payload?.title === "string" ? payload.title : para.envelope.payload.promise,
        slug: typeof payload?.slug === "string" ? payload.slug : de.envelope.payload.suggestedSlug,
        siloId, siloName, state: linha.state,
        label: radarArchitectUpdateLabel(deteccao.from.versionNumber, deteccao.to.versionNumber),
        from: deteccao.from, to: deteccao.to,
        classification, classificationLabel: RADAR_ARCHITECT_UPDATE_CLASS_LABEL[classification],
        changes, plan, adoptable: !refusal, refusal, itemHash,
      },
    });
  }
  return candidatos.sort((a, b) => (a.preview.siloName || "").localeCompare(b.preview.siloName || "", "pt-BR") || a.preview.title.localeCompare(b.preview.title, "pt-BR"));
}

/** A PRÉVIA: leitura pura. Nada é gravado; o Arquiteto não é lido além do acervo e do índice canônico. */
export async function previewArchitectUpdatesWithCore(store: RadarArchitectAdoptionStore, input: { brandId: string; articleIds?: readonly string[] | null; siloId?: string | null }): Promise<RadarArchitectUpdatePreview> {
  const candidatos = await montarCandidatos(store, { brandId: input.brandId, articleIds: input.articleIds?.length ? input.articleIds : null, siloId: input.siloId ?? null });
  const items = candidatos.map(candidato => candidato.preview);
  const adotaveis = items.filter(item => item.adoptable);
  return {
    brandId: input.brandId,
    items,
    adoptable: adotaveis.length,
    refused: items.length - adotaveis.length,
    decisionHash: adotaveis.length ? await radarArchitectAdoptionDecisionHash(adotaveis) : null,
    readOnly: true,
  };
}

/* ================================= adotar ================================= */

export type RadarArchitectAdoptionOutcome =
  | { articleId: string; status: "adopted"; title: string; from: number; to: number; classification: RadarArchitectUpdatePreviewItem["classification"]; redo: string[]; lockVersion: number }
  | { articleId: string; status: "refused"; code: string; reason: string }
  | { articleId: string; status: "nothing_to_adopt"; reason: string };

export type RadarArchitectAdoptionResult =
  | { state: "APPLIED"; adopted: number; refused: number; results: RadarArchitectAdoptionOutcome[]; readbackConfirmed: boolean }
  | { state: "REFUSED"; code: "STALE_DECISION" | "NOTHING_TO_ADOPT"; message: string };

class RecusaDoItem extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}

/**
 * ADOTAR — decisão humana sobre a prévia, por artigo e em lote.
 *
 * `articleIds` é a seleção confirmada (a recusa por item é desmarcar). O hash
 * é recalculado sobre o estado de AGORA; se a prévia venceu (item mexido,
 * versão nova outra vez), nada é gravado. Item recusado pela regra sai com o
 * motivo e os outros seguem.
 */
export async function adoptArchitectVersionWithCore(store: RadarArchitectAdoptionStore, input: {
  brandId: string;
  actorId: string;
  articleIds: readonly string[];
  decisionHash: string;
  now?: string;
}): Promise<RadarArchitectAdoptionResult> {
  const pedidos = [...new Set(input.articleIds.map(id => id.trim()).filter(Boolean))];
  if (!pedidos.length) return { state: "REFUSED", code: "NOTHING_TO_ADOPT", message: "Nenhum artigo selecionado para adotar a versão nova." };
  const candidatos = await montarCandidatos(store, { brandId: input.brandId, articleIds: pedidos });
  const porArtigo = new Map(candidatos.map(candidato => [candidato.row.article_id, candidato]));
  const adotaveis = pedidos.map(id => porArtigo.get(id)).filter((candidato): candidato is Candidato => Boolean(candidato?.preview.adoptable));
  if (!adotaveis.length) {
    return { state: "REFUSED", code: "NOTHING_TO_ADOPT", message: "Nenhum dos artigos selecionados tem versão nova adotável agora: releia a prévia." };
  }
  const hashAgora = await radarArchitectAdoptionDecisionHash(adotaveis.map(candidato => candidato.preview));
  if (hashAgora !== input.decisionHash.trim().toLowerCase()) {
    return { state: "REFUSED", code: "STALE_DECISION", message: "A prévia mudou desde que foi mostrada (o item foi alterado ou há outra versão nova). Nada foi gravado: gere a prévia de novo e confirme." };
  }

  const now = input.now ?? new Date().toISOString();
  const results: RadarArchitectAdoptionOutcome[] = [];
  for (const articleId of pedidos) {
    const candidato = porArtigo.get(articleId);
    if (!candidato) { results.push({ articleId, status: "nothing_to_adopt", reason: "Este item já está na versão vigente do Arquiteto." }); continue; }
    if (!candidato.preview.adoptable) {
      results.push({ articleId, status: "refused", code: candidato.preview.refusal?.code ?? "refused", reason: candidato.preview.refusal?.reason ?? "Recusado." });
      continue;
    }
    try {
      const lock = await adotarUm(store, candidato, { brandId: input.brandId, actorId: input.actorId, now });
      results.push({ articleId, status: "adopted", title: candidato.preview.title, from: candidato.preview.from.versionNumber, to: candidato.preview.to.versionNumber, classification: candidato.preview.classification, redo: candidato.preview.plan.redo, lockVersion: lock });
    } catch (error) {
      if (error instanceof RecusaDoItem) { results.push({ articleId, status: "refused", code: error.code, reason: error.message }); continue; }
      throw error;
    }
  }
  const adopted = results.filter(item => item.status === "adopted").length;
  return { state: "APPLIED", adopted, refused: results.filter(item => item.status === "refused").length, results, readbackConfirmed: adopted > 0 };
}

async function adotarUm(store: RadarArchitectAdoptionStore, candidato: Candidato, input: { brandId: string; actorId: string; now: string }): Promise<number> {
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
  const recusa = recusaDasCorrentes({ state: linha.state, payload: payloadAtual, from: from.payload, to: to.payload });
  if (recusa) throw new RecusaDoItem(recusa.code, recusa.reason);

  /* 3 · o item construído pelo MESMO caminho do envio. */
  const atual = RadarItemSchema.safeParse({ ...payloadAtual, id: linha.id, brandId: linha.marca_id, articleId, state: linha.state, lockVersion: linha.lock_version, importedAt: new Date(linha.created_at).toISOString(), updatedAt: new Date(linha.updated_at).toISOString(), origin: "real" });
  if (!atual.success) throw new RecusaDoItem("radar_item_incompatible", "O item do Radar não corresponde ao contrato vigente; nada foi adotado.");
  if (!candidato.resolvedSilo) throw new RecusaDoItem("silo_unresolved", "O Silo da versão nova não foi resolvido.");
  const carregado = atual.data;
  const contexto = {
    silo: candidato.resolvedSilo,
    internalLinks: carregado.arquitetoInternalLinks ?? null,
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
    const patch = radarAnalysisAdoptionPatch({ current: corrente.payload, to, classification: candidato.preview.classification });
    const sucessora = await createRadarAnalysisSuccessor(corrente, patch, input.actorId, input.now);
    /* O número nunca repete um que a linha já tem (a versão de maior número pode não ser a última do array). */
    const comMotivo = VersionedRadarAnalysisSchema.parse({
      ...sucessora,
      versionNumber: Math.max(sucessora.versionNumber, maiorNumeroDeVersao(payloadAtual) + 1),
      changeReason: `Adoção da versão nova do ArticleDNA no Radar (v${from.versionNumber} → v${to.versionNumber}, ${candidato.preview.classification}).`,
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
    },
  });
  return relido.lock_version;
}
