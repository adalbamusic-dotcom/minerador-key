import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ARTIGO, MARCA, semearBanco, type Banco, type Linha } from "./radar-export-leitura-fixtures.mts";
import { VersionedArticleDNASchema, type ArticleDNA, type VersionEnvelope } from "../lib/arquiteto/contracts.ts";
import { contentHash } from "../lib/arquiteto/versioning.ts";
import type { CanonicalApprovalIndex } from "../lib/arquiteto/operational-status.ts";
import { mergeAnalysisRun } from "../lib/radar/analysis-run-storage.ts";
import {
  classifyArchitectUpdate,
  detectArchitectUpdate,
  RADAR_ARCHITECT_UPDATE_LABEL,
  radarAnalysisAdoptionPatch,
  radarArchitectAdoptionDecisionHash,
  radarArchitectAdoptionRefusal,
  radarArchitectUpdateLabel,
  radarArchitectUpdatesBySilo,
  radarRebindResearchFingerprint,
} from "../lib/radar/architect-update.ts";
import {
  adoptArchitectVersionWithCore,
  previewArchitectUpdatesWithCore,
  type RadarAdoptionItemRow,
  type RadarArchitectAdoptionStore,
} from "../lib/server/radar-architect-adoption.ts";

/*
 * ===== F5 · O RADAR ACOMPANHA O ARQUITETO (SDD acelerar-fluxo-do-plano 2026-10-13, item 14) =====
 *
 * A bancada é a do export (`radar-export-leitura-fixtures`): F finalizado no
 * Google, N com investigação aberta e corridas, V sem análise. O Arquiteto
 * aprova uma v2 de cada um; o Radar mostra "Atualização disponível do
 * Arquiteto · v1 → v2", e a adoção é decisão humana sobre a prévia.
 *
 * A porta do banco é um armazém em memória: ela conta as escritas, recusa
 * escrita fora da linha `stage = radar` e não tem provider nem IA.
 */

const ATOR = "6b1e0099-2c3d-4e5f-8a9b-000000000099";
const AGORA = "2026-10-13T12:00:00.000Z";
const semComentarios = (fonte: string) => fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const ler = (arquivo: string) => readFileSync(new URL(`../${arquivo}`, import.meta.url), "utf8");

/* ============================ a bancada ============================ */

type Envelope = VersionEnvelope<ArticleDNA>;

const linhaDoDna = (banco: Banco, articleId: string) => banco.editorial_artifact_versions
  .find(linha => linha.artifact_type === "article_dna" && ((linha.payload as Linha).payload as Linha).articleId === articleId)!;

const envelopeV1 = (banco: Banco, articleId: string) => VersionedArticleDNASchema.parse(linhaDoDna(banco, articleId).payload) as Envelope;

/** "Gravar melhorias": a sucessora aprovada (v2), com hash real do conteúdo. */
async function versaoNova(banco: Banco, articleId: string, mudar: (payload: ArticleDNA) => ArticleDNA, numero = 2): Promise<Envelope> {
  const v1 = envelopeV1(banco, articleId);
  const payload = mudar(structuredClone(v1.payload));
  const envelope = VersionedArticleDNASchema.parse({
    ...v1, versionId: `${articleId}-v${numero}`, versionNumber: numero, previousVersionId: v1.versionId,
    contentHash: await contentHash(payload), changeReason: "Melhoria gravada", createdAt: "2026-10-12T09:00:00.000Z", payload,
  }) as Envelope;
  banco.editorial_artifact_versions.push({
    ...linhaDoDna(banco, articleId), payload: envelope, version_id: envelope.versionId, version_number: numero,
    previous_version_id: v1.versionId, content_hash: envelope.contentHash, created_at: envelope.createdAt,
  });
  return envelope;
}

const novaPromessa = (payload: ArticleDNA): ArticleDNA => ({ ...payload, promise: `${payload.promise} — guia atualizado`, coverage: [...payload.coverage, "erros comuns"] });

type Armazem = RadarArchitectAdoptionStore & { escritas: string[]; eventos: Linha[]; aprovadas: Set<string> };

function armazem(banco: Banco): Armazem {
  const escritas: string[] = [];
  const eventos: Linha[] = [];
  const aprovadas = new Set<string>();
  const clonar = <T,>(valor: T): T => structuredClone(valor);
  const linhaDoItem = (id: string) => banco.editorial_workflow_items.find(linha => linha.id === id) || null;
  const envelopes = () => banco.editorial_artifact_versions.map(linha => ({ linha, envelope: linha.payload as Linha }));
  return {
    escritas, eventos, aprovadas,
    async listRadarItemHeads(brandId, articleIds) {
      return banco.editorial_workflow_items
        .filter(linha => linha.marca_id === brandId && linha.stage === "radar" && (!articleIds || articleIds.includes(String(linha.article_id))))
        .map(linha => ({
          id: String(linha.id), marca_id: String(linha.marca_id), article_id: String(linha.article_id), stage: String(linha.stage),
          state: String(linha.state), lock_version: Number(linha.lock_version), source_version_id: (linha.source_version_id as string) ?? null,
          transported_version_id: ((linha.payload as Linha).articleDnaVersionId as string) ?? null,
        }));
    },
    async readRadarItem(brandId, itemId) {
      const linha = linhaDoItem(itemId);
      if (!linha || linha.marca_id !== brandId) return null;
      return clonar({ source_entity_id: null, source_version_id: null, source_content_hash: null, ...linha }) as unknown as RadarAdoptionItemRow;
    },
    async canonicalIndex(): Promise<CanonicalApprovalIndex> {
      const articleIdByVersion = new Map<string, string>();
      for (const { envelope } of envelopes()) {
        const corpo = envelope.payload as Linha | undefined;
        if (typeof corpo?.articleId === "string") articleIdByVersion.set(String(envelope.versionId), corpo.articleId);
      }
      const silo = banco.editorial_artifact_versions.find(linha => linha.artifact_type === "silo_dna")!;
      return {
        approvedArticleVersions: new Set(aprovadas), approvedSiloVersions: new Set([String(silo.version_id)]),
        approvedSiloPageVersions: new Set(), approvedGraphVersions: new Set(), articleIdByVersion, graphBases: new Map(),
      };
    },
    async readArticleVersions(brandId, _articleIds, versionIds) {
      return envelopes().filter(({ linha }) => linha.marca_id === brandId && linha.artifact_type === "article_dna" && versionIds.includes(String(linha.version_id)))
        .map(({ linha, envelope }) => ({ envelope: clonar(envelope) as unknown as Envelope, storedContentHash: String(linha.content_hash) }));
    },
    async readSiloInputs(brandId, versionIds) {
      const silos = banco.editorial_artifact_versions.filter(linha => linha.marca_id === brandId && linha.artifact_type === "silo_dna" && versionIds.includes(String(linha.version_id)));
      return { siloVersions: silos.map(linha => clonar(linha.payload)) as never, siloPageVersions: [] };
    },
    async readAnalysisRun(itemId, versionId) {
      const corrida = banco.radar_analysis_runs.find(linha => linha.workflow_item_id === itemId && linha.version_id === versionId);
      return corrida ? clonar(corrida.payload as Record<string, unknown>) : null;
    },
    async writeAnalysisRun(input) {
      escritas.push(`run:${input.itemId}:${input.versionId}`);
      banco.radar_analysis_runs.push({ workflow_item_id: input.itemId, version_id: input.versionId, marca_id: input.brandId, article_id: input.articleId, payload: clonar(input.run) });
    },
    async updateRadarItem(input) {
      const linha = linhaDoItem(input.itemId);
      if (!linha || linha.marca_id !== input.brandId || linha.stage !== "radar") throw new Error("escrita fora da linha do Radar");
      if (linha.lock_version !== input.expectedLock) return null;
      escritas.push(`item:${input.itemId}`);
      Object.assign(linha, {
        payload: clonar(input.payload), source_entity_id: input.sourceEntityId, source_version_id: input.sourceVersionId,
        source_content_hash: input.sourceContentHash, lock_version: Number(linha.lock_version) + 1, updated_at: AGORA,
      });
      return { lock_version: Number(linha.lock_version) };
    },
    async appendDecisionEvent(input) {
      escritas.push(`evento:${input.articleId}`);
      eventos.push({ ...input });
    },
  };
}

async function cenario() {
  const banco = semearBanco();
  const loja = armazem(banco);
  const v2 = {
    F: await versaoNova(banco, ARTIGO.F, novaPromessa),
    N: await versaoNova(banco, ARTIGO.N, novaPromessa),
    V: await versaoNova(banco, ARTIGO.V, novaPromessa),
  };
  for (const envelope of Object.values(v2)) loja.aprovadas.add(envelope.versionId);
  return { banco, loja, v2 };
}

const itemDe = (banco: Banco, articleId: string) => banco.editorial_workflow_items.find(linha => linha.article_id === articleId)!;

/* ============================ o rótulo ============================ */

test("F5 · o rótulo é PRÓPRIO: 'Atualização disponível do Arquiteto', e o da publicação não muda", () => {
  assert.equal(RADAR_ARCHITECT_UPDATE_LABEL, "Atualização disponível do Arquiteto");
  assert.equal(radarArchitectUpdateLabel(1, 3), "Atualização disponível do Arquiteto · v1 → v3");
  const identidade = semComentarios(ler("lib/radar/editorial-identity.ts"));
  assert.doesNotMatch(identidade, /do Arquiteto/, "a identidade de publicação não ganha o rótulo do Arquiteto");
  assert.match(identidade, /Atualização disponível/, "o rótulo da publicação continua lá");
});

/* ============================ a classificação ============================ */

test("F5 · classificação: mesma base, composição e principal", async () => {
  const banco = semearBanco();
  const v1 = envelopeV1(banco, ARTIGO.N).payload;

  const promessa = classifyArchitectUpdate(v1, novaPromessa(structuredClone(v1)));
  assert.equal(promessa.classification, "same_research_basis");
  assert.deepEqual(promessa.changes.map(change => change.field), ["promise", "scope"]);

  const semSecundaria: ArticleDNA = { ...structuredClone(v1), secondaryKeywordIds: [], keywordReferences: v1.keywordReferences.filter(reference => reference.role === "principal") };
  const composicao = classifyArchitectUpdate(v1, semSecundaria);
  assert.equal(composicao.classification, "composition_changed");
  assert.ok(composicao.changes.some(change => change.field === "keywords_removed"));

  const secundaria = v1.keywordReferences.find(reference => reference.role === "secundaria")!;
  const principal = v1.keywordReferences.find(reference => reference.role === "principal")!;
  const trocada: ArticleDNA = {
    ...structuredClone(v1), principalKeywordId: secundaria.keywordId, secondaryKeywordIds: [principal.keywordId],
    keywordReferences: [{ ...secundaria, role: "principal" }, { ...principal, role: "secundaria" }],
  };
  const principalNova = classifyArchitectUpdate(v1, trocada);
  assert.equal(principalNova.classification, "principal_changed");
  assert.equal(principalNova.changes[0].field, "principal");
  assert.ok(!principalNova.changes.some(change => change.field === "keyword_roles"), "a troca da principal não aparece duas vezes como papel");

  const slug = classifyArchitectUpdate(v1, { ...structuredClone(v1), suggestedSlug: "outro-slug" });
  assert.equal(slug.classification, "principal_changed");

  const assunto = classifyArchitectUpdate(v1, { ...structuredClone(v1), hierarchy: "Pilar" });
  assert.equal(assunto.classification, "same_research_basis");
  assert.ok(assunto.changes.some(change => change.field === "silo_role"));
});

test("F5 · detecção: só versão mais nova, do mesmo artigo e da mesma marca", async () => {
  const { banco, v2 } = await cenario();
  const v1 = envelopeV1(banco, ARTIGO.N);
  assert.deepEqual(detectArchitectUpdate({ brandId: MARCA, articleId: ARTIGO.N, transported: v1, current: v2.N }), {
    available: true, from: { versionId: v1.versionId, versionNumber: 1 }, to: { versionId: v2.N.versionId, versionNumber: 2 },
  });
  assert.equal(detectArchitectUpdate({ brandId: MARCA, articleId: ARTIGO.N, transported: v1, current: v1 }).available, false);
  assert.equal(detectArchitectUpdate({ brandId: MARCA, articleId: ARTIGO.N, transported: v2.N, current: v1 }).available, false, "versão mais velha não é atualização");
  assert.equal(detectArchitectUpdate({ brandId: MARCA, articleId: ARTIGO.F, transported: v1, current: v2.N }).available, false, "versão de outro artigo nunca vale");
  assert.equal(detectArchitectUpdate({ brandId: "outra-marca", articleId: ARTIGO.N, transported: v1, current: v2.N }).available, false);
});

/* ============================ a prévia ============================ */

test("F5 · a prévia lê sem gravar: N e V adotáveis, F recusado (congelado), hash da decisão", async () => {
  const { banco, loja } = await cenario();
  const antes = JSON.stringify(banco.editorial_workflow_items);
  const previa = await previewArchitectUpdatesWithCore(loja, { brandId: MARCA });
  assert.deepEqual(loja.escritas, [], "a prévia não grava nada");
  assert.equal(JSON.stringify(banco.editorial_workflow_items), antes);

  const porArtigo = new Map(previa.items.map(item => [item.articleId, item]));
  assert.deepEqual([...porArtigo.keys()].sort(), [ARTIGO.F, ARTIGO.N, ARTIGO.V].sort());
  const n = porArtigo.get(ARTIGO.N)!;
  assert.equal(n.label, "Atualização disponível do Arquiteto · v1 → v2");
  assert.equal(n.classification, "same_research_basis");
  assert.equal(n.adoptable, true);
  assert.ok(n.plan.keeps.some(texto => /SERP da principal/.test(texto)));
  assert.ok(n.plan.costs.some(texto => /não chama provider nem IA/.test(texto)));
  assert.equal(n.siloName, "Cuidados com a pele oleosa");

  const f = porArtigo.get(ARTIGO.F)!;
  assert.equal(f.adoptable, false);
  assert.equal(f.refusal?.code, "frozen_investigation", "F5 está congelada mesmo não sendo a última do array");
  assert.match(f.refusal!.reason, /congelamento novo/);

  assert.equal(porArtigo.get(ARTIGO.V)!.adoptable, true);
  assert.ok(porArtigo.get(ARTIGO.V)!.plan.keeps.some(texto => /Ainda não há investigação/.test(texto)));
  assert.equal(previa.adoptable, 2);
  assert.equal(previa.refused, 1);
  assert.equal(previa.decisionHash, await radarArchitectAdoptionDecisionHash([n, porArtigo.get(ARTIGO.V)!]));
  assert.match(previa.decisionHash!, /^[a-f0-9]{64}$/);
  assert.equal(radarArchitectUpdatesBySilo(previa.items).length, 1, "o lote agrupa por Silo");
});

test("F5 · item sem versão nova não aparece; recorte por artigos e por Silo", async () => {
  const { loja } = await cenario();
  const so = await previewArchitectUpdatesWithCore(loja, { brandId: MARCA, articleIds: [ARTIGO.N, ARTIGO.T] });
  assert.deepEqual(so.items.map(item => item.articleId), [ARTIGO.N], "T não tem versão nova");
  const outroSilo = await previewArchitectUpdatesWithCore(loja, { brandId: MARCA, siloId: "silo-que-nao-existe" });
  assert.equal(outroSilo.items.length, 0);
});

/* ============================ adotar ============================ */

test("F5 · adotar: o item passa a transportar a v2 pelo caminho do envio, a investigação é reaproveitada, releitura e evento", async () => {
  const { banco, loja, v2 } = await cenario();
  const previa = await previewArchitectUpdatesWithCore(loja, { brandId: MARCA, articleIds: [ARTIGO.N] });
  const itemAntes = structuredClone(itemDe(banco, ARTIGO.N));
  const versoesAntes = ((itemAntes.payload as Linha).analysisVersions as Linha[]);
  const resultado = await adoptArchitectVersionWithCore(loja, { brandId: MARCA, actorId: ATOR, articleIds: [ARTIGO.N], decisionHash: previa.decisionHash!, now: AGORA });
  assert.equal(resultado.state, "APPLIED");
  if (resultado.state !== "APPLIED") return;
  assert.equal(resultado.adopted, 1);
  assert.equal(resultado.readbackConfirmed, true);

  const item = itemDe(banco, ARTIGO.N);
  const payload = item.payload as Linha;
  assert.equal(payload.articleDnaVersionId, v2.N.versionId);
  assert.equal(payload.articleDnaContentHash, v2.N.contentHash);
  assert.equal(item.source_version_id, v2.N.versionId);
  assert.equal(item.source_content_hash, v2.N.contentHash);
  assert.equal(payload.title, v2.N.payload.promise, "o título vem da promessa da versão nova, como no envio");
  assert.equal(item.state, itemAntes.state, "o estado do Radar não muda");
  assert.equal(payload.id, (itemAntes.payload as Linha).id, "a identidade do item fica");
  assert.equal(((payload.hydration as Linha).articleDnaVersionId), v2.N.versionId, "a hidratação é da versão nova");
  assert.equal(((payload.hydration as Linha).principalKeyword as Linha).keyword, (((itemAntes.payload as Linha).hydration as Linha).principalKeyword as Linha).keyword);

  const versoes = payload.analysisVersions as Linha[];
  assert.equal(versoes.length, versoesAntes.length + 1, "uma versão nova da análise; as anteriores ficam");
  assert.deepEqual(versoes.slice(0, -1), versoesAntes);
  const nova = versoes.at(-1)!;
  const anterior = versoesAntes.at(-1)!;
  assert.equal((nova.payload as Linha).articleDnaVersionId, v2.N.versionId);
  assert.equal(nova.previousVersionId, anterior.versionId);
  assert.equal(nova.versionNumber, 3);
  assert.match(String(nova.changeReason), /v1 → v2, same_research_basis/);
  const corridaNova = banco.radar_analysis_runs.find(linha => linha.version_id === nova.versionId)!;
  const corridaAnterior = banco.radar_analysis_runs.find(linha => linha.version_id === anterior.versionId)!;
  assert.deepEqual(corridaNova.payload, corridaAnterior.payload, "as páginas coletadas seguem com a versão nova (corrida copiada)");
  const inteira = mergeAnalysisRun(nova, corridaNova.payload as Linha);
  assert.equal(((inteira.payload as Linha).extractions as unknown[]).length, 4);
  assert.deepEqual(((nova.payload as Linha).keywordDecisions as Linha[]).map(decisao => decisao.keywordId), v2.N.payload.keywordReferences.map(reference => reference.keywordId));

  assert.deepEqual(loja.escritas, [`run:${item.id}:${nova.versionId}`, `item:${item.id}`, `evento:${ARTIGO.N}`], "a corrida vai antes do payload; depois o evento");
  assert.equal(loja.eventos[0].sourceVersionId, v2.N.versionId);
  assert.equal((loja.eventos[0].payload as Linha).classification, "same_research_basis");

  const depois = await previewArchitectUpdatesWithCore(loja, { brandId: MARCA, articleIds: [ARTIGO.N] });
  assert.equal(depois.items.length, 0, "depois de adotar, não há mais atualização disponível");
});

test("F5 · hash vencido não grava; recusa por item deixa o desmarcado intocado", async () => {
  const { banco, loja } = await cenario();
  const previa = await previewArchitectUpdatesWithCore(loja, { brandId: MARCA });
  const vencido = await adoptArchitectVersionWithCore(loja, { brandId: MARCA, actorId: ATOR, articleIds: [ARTIGO.N, ARTIGO.V], decisionHash: "0".repeat(64), now: AGORA });
  assert.equal(vencido.state, "REFUSED");
  assert.equal(vencido.state === "REFUSED" && vencido.code, "STALE_DECISION");
  assert.deepEqual(loja.escritas, []);

  const vAntes = structuredClone(itemDe(banco, ARTIGO.V));
  const soN = previa.items.filter(item => item.articleId === ARTIGO.N);
  const resultado = await adoptArchitectVersionWithCore(loja, { brandId: MARCA, actorId: ATOR, articleIds: [ARTIGO.N, ARTIGO.F], decisionHash: await radarArchitectAdoptionDecisionHash(soN), now: AGORA });
  assert.equal(resultado.state, "APPLIED");
  if (resultado.state !== "APPLIED") return;
  assert.deepEqual(resultado.results.map(item => [item.articleId, item.status]), [[ARTIGO.N, "adopted"], [ARTIGO.F, "refused"]]);
  assert.deepEqual(itemDe(banco, ARTIGO.V), vAntes, "V não foi selecionado: intocado");
  const f = resultado.results.find(item => item.articleId === ARTIGO.F)!;
  assert.equal(f.status === "refused" && f.code, "frozen_investigation");
});

test("F5 · item mexido depois da prévia: a prévia vence e nada é gravado", async () => {
  const { banco, loja } = await cenario();
  const previa = await previewArchitectUpdatesWithCore(loja, { brandId: MARCA, articleIds: [ARTIGO.N] });
  itemDe(banco, ARTIGO.N).lock_version = Number(itemDe(banco, ARTIGO.N).lock_version) + 1;
  const resultado = await adoptArchitectVersionWithCore(loja, { brandId: MARCA, actorId: ATOR, articleIds: [ARTIGO.N], decisionHash: previa.decisionHash!, now: AGORA });
  assert.equal(resultado.state, "REFUSED");
  assert.deepEqual(loja.escritas, []);
});

test("F5 · item sem análise: só troca a versão transportada, sem versão de análise nova", async () => {
  const { banco, loja, v2 } = await cenario();
  const previa = await previewArchitectUpdatesWithCore(loja, { brandId: MARCA, articleIds: [ARTIGO.V] });
  const resultado = await adoptArchitectVersionWithCore(loja, { brandId: MARCA, actorId: ATOR, articleIds: [ARTIGO.V], decisionHash: previa.decisionHash!, now: AGORA });
  assert.equal(resultado.state, "APPLIED");
  const payload = itemDe(banco, ARTIGO.V).payload as Linha;
  assert.equal(payload.articleDnaVersionId, v2.V.versionId);
  assert.deepEqual(payload.analysisVersions, []);
  assert.ok(!loja.escritas.some(escrita => escrita.startsWith("run:")));
});

test("F5 · principal nova: a pesquisa do Google é zerada pelo MESMO reset (as páginas não seguem)", async () => {
  const banco = semearBanco();
  const loja = armazem(banco);
  const v2 = await versaoNova(banco, ARTIGO.N, payload => {
    const secundaria = payload.keywordReferences.find(reference => reference.role === "secundaria")!;
    const principal = payload.keywordReferences.find(reference => reference.role === "principal")!;
    return { ...payload, principalKeywordId: secundaria.keywordId, secondaryKeywordIds: [principal.keywordId], keywordReferences: [{ ...secundaria, role: "principal" }, { ...principal, role: "secundaria" }] };
  });
  loja.aprovadas.add(v2.versionId);
  const previa = await previewArchitectUpdatesWithCore(loja, { brandId: MARCA });
  assert.equal(previa.items[0].classification, "principal_changed");
  assert.ok(previa.items[0].plan.redo.some(texto => /zerada/.test(texto)));
  assert.ok(previa.items[0].plan.costs.some(texto => /paga a SERP/.test(texto)), "o custo da pesquisa nova é dito antes");
  const resultado = await adoptArchitectVersionWithCore(loja, { brandId: MARCA, actorId: ATOR, articleIds: [ARTIGO.N], decisionHash: previa.decisionHash!, now: AGORA });
  assert.equal(resultado.state, "APPLIED");
  const nova = ((itemDe(banco, ARTIGO.N).payload as Linha).analysisVersions as Linha[]).at(-1)!;
  const analise = nova.payload as Linha;
  assert.deepEqual(analise.extractions, []);
  assert.equal(analise.deepResearch, null);
  assert.ok((analise.serpDecisions as Linha[]).every(decisao => decisao.decision === "pending"));
  assert.equal(analise.articleDnaVersionId, v2.versionId);
  const corrida = banco.radar_analysis_runs.find(linha => linha.version_id === nova.versionId);
  assert.ok(!corrida || !((corrida.payload as Linha).extractions), "as páginas da principal antiga não voltam pela corrida");
  assert.equal((itemDe(banco, ARTIGO.N).payload as Linha).arquitetoSerpProvenance ?? null, null, "a proveniência da SERP da formação não descreve a principal nova");
});

/* ============================ regras do dono ============================ */

test("F5 · slug publicado que mudaria é recusado; pacote enviado e aprovado também", async () => {
  const banco = semearBanco();
  const v1 = envelopeV1(banco, ARTIGO.N).payload;
  const publicado = { ...v1, publishedIdentityRef: { url: "https://exemplo.test/artigo", slug: v1.suggestedSlug } } as unknown as ArticleDNA;
  assert.equal(radarArchitectAdoptionRefusal({ state: "research_pending", analysis: null, from: publicado, to: { ...v1, suggestedSlug: "outro" } })?.code, "published_slug_change");
  assert.equal(radarArchitectAdoptionRefusal({ state: "sent_writer", analysis: null, from: v1, to: v1 })?.code, "sent_to_writer");
  assert.equal(radarArchitectAdoptionRefusal({ state: "approved", analysis: null, from: v1, to: v1 })?.code, "approved_package");
  assert.equal(radarArchitectAdoptionRefusal({ state: "research_pending", analysis: { youtubeFrozenInvestigation: {} as never }, from: v1, to: v1 })?.code, "frozen_investigation");
  assert.equal(radarArchitectAdoptionRefusal({ state: "research_pending", analysis: null, from: v1, to: { ...v1, promise: "outra" } }), null);
});

test("F5 · mesma base: a impressão da investigação é reapontada só nas partes do artigo", () => {
  const impressao = { articleDnaVersionId: "v1", articleDnaContentHash: "sha256:a", keywordRefs: [], siloDnaVersionId: "s", siloPageId: null, formationAssessmentId: null, formationBaseHash: null, internalLinkGraphVersionId: null, value: "v1|sha256:a|k1:kw:|s||||" };
  assert.deepEqual(radarRebindResearchFingerprint(impressao, { versionId: "v2", contentHash: "sha256:b" }), { ...impressao, articleDnaVersionId: "v2", articleDnaContentHash: "sha256:b", value: "v2|sha256:b|k1:kw:|s||||" });
  assert.equal(radarRebindResearchFingerprint({ ...impressao, value: "outra-coisa" }, { versionId: "v2", contentHash: "sha256:b" }), null, "formato inesperado: a tela segue dizendo que precisa refazer");

  const banco = semearBanco();
  const v1 = envelopeV1(banco, ARTIGO.N);
  const atual = { keywordDecisions: [], deepResearch: { fingerprint: impressao, marcador: "fica" } } as never;
  const mesma = radarAnalysisAdoptionPatch({ current: atual, to: { ...v1, versionId: "v2", contentHash: "sha256:b" }, classification: "same_research_basis" });
  assert.equal((mesma.deepResearch as unknown as { fingerprint: { value: string }; marcador: string }).fingerprint.value, "v2|sha256:b|k1:kw:|s||||");
  assert.equal((mesma.deepResearch as unknown as { marcador: string }).marcador, "fica");
  const composicao = radarAnalysisAdoptionPatch({ current: atual, to: { ...v1, versionId: "v2", contentHash: "sha256:b" }, classification: "composition_changed" });
  assert.equal("deepResearch" in composicao, false, "composição mudou: a investigação fica marcada para refazer (impressão antiga)");
});

test("F5 · o núcleo nunca escreve no Arquiteto, nem chama provider ou IA, nem toca os entregáveis", () => {
  const nucleo = semComentarios(ler("lib/server/radar-architect-adoption.ts"));
  const porta = semComentarios(ler("lib/server/radar-architect-adoption-store.ts"));
  for (const fonte of [nucleo, porta]) {
    assert.doesNotMatch(fonte, /"architect"/, "nada escreve a linha stage = architect");
    assert.doesNotMatch(fonte, /persistGlobalTransition|fetch\(|dataforseo|anthropic|openai/i);
    assert.doesNotMatch(fonte, /article-blueprint|portable-writing|human-voice|natural-anchor|publication-identity|radar-portable-export|lib\/redator/);
  }
  assert.match(porta, /\.eq\("stage", "radar"\)\.eq\("lock_version", input\.expectedLock\)/, "a gravação é só da linha do Radar, com a trava otimista");
  assert.match(nucleo, /importArticlesToRadar\(/, "o item é montado pelo MESMO caminho do envio");
  assert.match(nucleo, /radarReadbackMatches\(/, "a releitura confirma a versão nova");
});
