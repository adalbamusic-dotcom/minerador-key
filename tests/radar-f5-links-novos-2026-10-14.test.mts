import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ARTIGO, MARCA, semearBanco, type Banco, type Linha } from "./radar-export-leitura-fixtures.mts";
import { InternalLinkGraphSchema, VersionedArticleDNASchema, type ArticleDNA, type InternalLinkGraph, type VersionEnvelope } from "../lib/arquiteto/contracts.ts";
import { contentHash } from "../lib/arquiteto/versioning.ts";
import { buildStructuralLinkConnections, type StructuralLinkUnit } from "../lib/arquiteto/internal-link-structure.ts";
import { relevantEdgesForArticle } from "../lib/arquiteto/radar-handoff-context.ts";
import type { CanonicalApprovalIndex } from "../lib/arquiteto/operational-status.ts";
import { PLATFORM_OPERATIONS } from "../lib/agent/platform-catalog.ts";
import { RadarItemSchema } from "../lib/editorial/operational-flow.ts";
import { buildRadarArticleResearchContext } from "../lib/radar/article-research-context.ts";
import { buildRadarResearchFingerprint, radarDeepResearchState, radarResearchIsStale } from "../lib/radar/deep-research.ts";
import { radarObservedDivergesFromFrozen } from "../lib/radar/handoff-readiness.ts";
import { radarSiloMeshGraphPriorities } from "../lib/radar/silo-link-mesh.ts";
import {
  RADAR_ARCHITECT_UPDATE_CLASS_LABEL,
  radarArchitectAdoptionDecisionHash,
  radarArchitectLinksUpdateLabel,
  radarArchitectUpdatesBySilo,
} from "../lib/radar/architect-update.ts";
import {
  adoptArchitectVersionWithCore,
  previewArchitectUpdatesWithCore,
  type RadarAdoptionItemRow,
  type RadarArchitectAdoptionStore,
} from "../lib/server/radar-architect-adoption.ts";

/*
 * ===== 2026-10-14 · "ATUALIZAÇÃO DISPONÍVEL DO ARQUITETO · LINKS" =====
 *
 * Decisão do dono (2026-10-14), literal: "estender a 'Atualização disponível do
 * Arquiteto' do Radar para avisar também quando o grafo de links muda. Você
 * adota com um clique, sem reenviar nada e sem refazer a pesquisa, porque links
 * não mudam a SERP. Isso segue a regra de que o Radar se adapta ao Arquiteto."
 *
 * A bancada é a do export e da F5 (`radar-export-leitura-fixtures`): F Pilar
 * finalizado no Google, N com investigação aberta, V sem análise, T enviado ao
 * Redator. O Silo tem o grafo v1 (o esqueleto, como o piloto hoje) e o
 * Arquiteto aprova o v2 (a malha da F4, pelo MESMO gerador). A porta do banco é
 * um armazém em memória; sem provider, sem IA, sem rede.
 */

const ATOR = "6b1e0099-2c3d-4e5f-8a9b-000000000099";
const AGORA = "2026-10-14T12:00:00.000Z";
const H = `sha256:${"a".repeat(64)}`;
const semComentarios = (fonte: string) => fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const ler = (arquivo: string) => readFileSync(new URL(`../${arquivo}`, import.meta.url), "utf8");

type Envelope = VersionEnvelope<ArticleDNA>;
const MEMBROS = ["F", "N", "V", "T", "X", "Z"] as const;
const SELECAO = [ARTIGO.F, ARTIGO.N, ARTIGO.V, ARTIGO.T];

const linhaDoDna = (banco: Banco, articleId: string) => banco.editorial_artifact_versions
  .find(linha => linha.artifact_type === "article_dna" && ((linha.payload as Linha).payload as Linha).articleId === articleId)!;
const envelopeV1 = (banco: Banco, articleId: string) => VersionedArticleDNASchema.parse(linhaDoDna(banco, articleId).payload) as Envelope;
const linhaDoSilo = (banco: Banco) => banco.editorial_artifact_versions.find(linha => linha.artifact_type === "silo_dna")!;
const itemDe = (banco: Banco, articleId: string) => banco.editorial_workflow_items.find(linha => linha.article_id === articleId)!;

/** "Gravar melhorias": a sucessora aprovada do ArticleDNA, com hash real. */
async function versaoNova(banco: Banco, articleId: string): Promise<Envelope> {
  const v1 = envelopeV1(banco, articleId);
  const payload = { ...structuredClone(v1.payload), promise: `${v1.payload.promise} — guia atualizado` };
  const envelope = VersionedArticleDNASchema.parse({
    ...v1, versionId: `${articleId}-v2`, versionNumber: 2, previousVersionId: v1.versionId,
    contentHash: await contentHash(payload), changeReason: "Melhoria gravada", createdAt: "2026-10-13T09:00:00.000Z", payload,
  }) as Envelope;
  banco.editorial_artifact_versions.push({
    ...linhaDoDna(banco, articleId), payload: envelope, version_id: envelope.versionId, version_number: 2,
    previous_version_id: v1.versionId, content_hash: envelope.contentHash, created_at: envelope.createdAt,
  });
  return envelope;
}

/**
 * O grafo do Silo da bancada pelo MESMO gerador do Arquiteto: `malha: false` é
 * o esqueleto (o v1 do piloto hoje); `malha: true` é a malha da F4. `versoes`
 * troca a versão do ArticleDNA de um nó (grafo remontado sobre a versão nova).
 */
function grafoDoSilo(banco: Banco, input: { versao: number; malha: boolean; versoes?: Record<string, Envelope> }): InternalLinkGraph {
  const silo = linhaDoSilo(banco);
  const siloId = String(((silo.payload as Linha).payload as Linha).siloId);
  const artigos = MEMBROS.map(chave => input.versoes?.[ARTIGO[chave]] ?? envelopeV1(banco, ARTIGO[chave]));
  const unidades: StructuralLinkUnit[] = [
    { nodeId: `silo-page:${siloId}`, nodeType: "SILO_PAGE", architecturalRole: null, label: "Cuidados com a pele oleosa" },
    ...artigos.map(envelope => ({
      nodeId: `article:${envelope.payload.articleId}`, nodeType: "ARTICLE_DNA" as const,
      architecturalRole: envelope.payload.articleId === ARTIGO.F ? "PILAR" as const : "SUPORTE" as const, label: envelope.payload.promise,
    })),
  ];
  const refDe = (envelope: Envelope) => ({ entityId: envelope.payload.articleId, versionId: envelope.versionId, contentHash: envelope.contentHash });
  return InternalLinkGraphSchema.parse({
    schemaVersion: 1, graphVersionId: `grafo-v${input.versao}`, graphId: `arquiteto:internal-links:${siloId}`, brandId: MARCA, siloId,
    baseSiloDnaVersionRef: { entityId: siloId, versionId: String(silo.version_id), contentHash: String(silo.content_hash) },
    baseSiloPageVersionRef: { entityId: `silo-page:${siloId}`, versionId: "pagina-v1", contentHash: H },
    participatingArticleDnaVersionRefs: artigos.map(refDe),
    versionNumber: input.versao, previousVersionId: input.versao > 1 ? `grafo-v${input.versao - 1}` : null, workflowStatus: "approved",
    basisHash: H, contentHash: `sha256:${String(input.versao).repeat(64)}`, createdBy: ATOR, createdAt: "2026-10-14T08:00:00.000Z",
    approvedBy: ATOR, approvedAt: "2026-10-14T08:00:00.000Z", metadata: {},
    nodes: unidades.map(unidade => ({
      nodeId: unidade.nodeId, brandId: MARCA, nodeType: unidade.nodeType, architecturalRole: unidade.architecturalRole,
      snapshot: { label: unidade.label, siloId },
      articleDnaVersionRef: unidade.nodeType === "ARTICLE_DNA" ? refDe(artigos.find(envelope => `article:${envelope.payload.articleId}` === unidade.nodeId)!) : null,
      siloPageVersionRef: unidade.nodeType === "SILO_PAGE" ? { entityId: `silo-page:${siloId}`, versionId: "pagina-v1", contentHash: H } : null,
    })),
    edges: buildStructuralLinkConnections(unidades, input.malha ? {} : { mesh: false }).map((conexao, indice) => ({
      edgeId: `e${input.versao}-${indice}`, ...conexao, anchorConcepts: ["a ideia do destino"], origin: "ai",
      createdBy: ATOR, createdAt: "2026-10-14T08:00:00.000Z", provenance: { source: "teste", references: [] },
    })),
    warnings: [], conflicts: [],
  });
}

type Armazem = RadarArchitectAdoptionStore & { escritas: string[]; eventos: Linha[]; aprovadas: Set<string>; grafos: InternalLinkGraph[]; vigentes: Set<string> };

function armazem(banco: Banco): Armazem {
  const escritas: string[] = [];
  const eventos: Linha[] = [];
  const aprovadas = new Set<string>();
  const grafos: InternalLinkGraph[] = [];
  const vigentes = new Set<string>();
  const clonar = <T,>(valor: T): T => structuredClone(valor);
  const linhaDoItem = (id: string) => banco.editorial_workflow_items.find(linha => linha.id === id) || null;
  const envelopes = () => banco.editorial_artifact_versions.map(linha => ({ linha, envelope: linha.payload as Linha }));
  return {
    escritas, eventos, aprovadas, grafos, vigentes,
    async listRadarItemHeads(brandId, articleIds) {
      return banco.editorial_workflow_items
        .filter(linha => linha.marca_id === brandId && linha.stage === "radar" && (!articleIds || articleIds.includes(String(linha.article_id))))
        .map(linha => ({
          id: String(linha.id), marca_id: String(linha.marca_id), article_id: String(linha.article_id), stage: String(linha.stage),
          state: String(linha.state), lock_version: Number(linha.lock_version), source_version_id: (linha.source_version_id as string) ?? null,
          transported_version_id: ((linha.payload as Linha).articleDnaVersionId as string) ?? null,
          carried_graph_version_id: (((linha.payload as Linha).arquitetoInternalLinks as Linha | undefined)?.graphVersionId as string) ?? null,
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
      return {
        approvedArticleVersions: new Set(aprovadas), approvedSiloVersions: new Set([String(linhaDoSilo(banco).version_id)]),
        approvedSiloPageVersions: new Set(), approvedGraphVersions: new Set(vigentes), articleIdByVersion, graphBases: new Map(),
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
    async readInternalLinkGraphs(brandId, graphVersionIds) {
      return grafos.filter(grafo => grafo.brandId === brandId && graphVersionIds.includes(grafo.graphVersionId)).map(clonar);
    },
    async updateRadarItem(input) {
      const linha = linhaDoItem(input.itemId);
      if (!linha || linha.marca_id !== input.brandId || linha.stage !== "radar") throw new Error("escrita fora da linha do Radar");
      if (linha.lock_version !== input.expectedLock) return null;
      escritas.push(input.sourceVersionId ? `item+colunas:${input.itemId}` : `item:${input.itemId}`);
      Object.assign(linha, {
        payload: clonar(input.payload), lock_version: Number(linha.lock_version) + 1, updated_at: AGORA,
        ...(input.sourceVersionId ? { source_entity_id: input.sourceEntityId, source_version_id: input.sourceVersionId, source_content_hash: input.sourceContentHash } : {}),
      });
      return { lock_version: Number(linha.lock_version) };
    },
    async appendDecisionEvent(input) {
      escritas.push(`evento:${input.articleId}`);
      eventos.push({ ...input });
    },
  };
}

/** O piloto hoje: cada item levou o v1 (esqueleto) no envio; T já foi ao Redator; o Arquiteto aprova o v2 (a malha). */
function cenario(opcoes: { aprovarMalha?: boolean } = {}) {
  const banco = semearBanco();
  const loja = armazem(banco);
  const v1 = grafoDoSilo(banco, { versao: 1, malha: false });
  const v2 = grafoDoSilo(banco, { versao: 2, malha: true });
  for (const chave of MEMBROS) {
    const item = itemDe(banco, ARTIGO[chave]);
    (item.payload as Linha).arquitetoInternalLinks = relevantEdgesForArticle({ graph: v1, articleDnaVersionId: envelopeV1(banco, ARTIGO[chave]).versionId });
  }
  itemDe(banco, ARTIGO.T).state = "sent_writer";
  loja.grafos.push(v1, v2);
  loja.vigentes.add(opcoes.aprovarMalha === false ? v1.graphVersionId : v2.graphVersionId);
  return { banco, loja, v1, v2 };
}

const semLinks = (payload: Linha) => {
  const { arquitetoInternalLinks: _fora, ...resto } = payload;
  void _fora;
  return resto;
};

/* ============================ a detecção ============================ */

test("links · grafo novo aprovado: 'Atualização disponível do Arquiteto · links', também para finalizado e enviado ao Redator; ler não grava", async () => {
  const { banco, loja } = cenario();
  const antes = JSON.stringify(banco);
  const previa = await previewArchitectUpdatesWithCore(loja, { brandId: MARCA, articleIds: SELECAO });
  assert.deepEqual(loja.escritas, [], "a prévia não grava nada");
  assert.equal(JSON.stringify(banco), antes);

  assert.equal(previa.items.length, 4);
  for (const item of previa.items) {
    assert.equal(item.updateKind, "links");
    assert.equal(item.classification, "links_changed");
    assert.equal(item.classificationLabel, RADAR_ARCHITECT_UPDATE_CLASS_LABEL.links_changed);
    assert.equal(item.label, "Atualização disponível do Arquiteto · links · grafo v1 → v2");
    assert.equal(item.adoptable, true, `${item.articleId} adotável em qualquer estado`);
    assert.deepEqual(item.graph && [item.graph.fromGraphVersionNumber, item.graph.toGraphVersionNumber], [1, 2]);
    assert.deepEqual(item.plan.redo, [], "nada a refazer: links não mudam a SERP");
    assert.ok(item.plan.costs.every(texto => /Nada pago e nenhuma IA/.test(texto)));
    assert.ok(item.plan.keeps.some(texto => /links não mudam a SERP/.test(texto)));
  }
  const porArtigo = new Map(previa.items.map(item => [item.articleId, item]));
  assert.ok(porArtigo.get(ARTIGO.F)!.plan.keeps.some(texto => /pacote congelado e a planta do artigo-modelo não são regravados/.test(texto)), "F está finalizado: a planta congelada continua");
  assert.equal(porArtigo.get(ARTIGO.T)!.state, "sent_writer");
  assert.ok(porArtigo.get(ARTIGO.T)!.plan.keeps.some(texto => /documento já criado no Redator fica com os links do envio/.test(texto)));

  /* O que mudou, por destino, na régua do Radar (obrigatório no corpo, no corpo se tratar, trilha). */
  const n = porArtigo.get(ARTIGO.N)!;
  const campo = (field: string) => n.changes.find(change => change.field === field);
  assert.match(campo("links_summary")!.before!, /^1 destino\(s\): 1 obrigatório\(s\) no corpo/);
  assert.match(campo("links_summary")!.after!, /^6 destino\(s\): 1 obrigatório\(s\) no corpo/);
  const entram = campo("links_added")!.after!;
  assert.match(entram, /Cuidados com a pele oleosa \(trilha\)/, "a SiloPage entra na trilha");
  assert.match(entram, /Sérum de vitamina C \((no corpo se a seção tratar; senão trilha|trilha)\)/, "o irmão entra, com a obrigação");
  assert.match(campo("links_inbound")!.after!, /passam a apontar: .*Sérum de vitamina C/);
  /* O Pilar já ligava a todos: as mesmas relações, e a prévia diz. */
  const f = porArtigo.get(ARTIGO.F)!;
  assert.equal(f.changes.length, 1);
  assert.match(f.changes[0].after!, /as mesmas relações deste artigo; muda só a versão do grafo/);

  assert.equal(previa.decisionHashByKind.links, await radarArchitectAdoptionDecisionHash(previa.items));
  assert.equal(previa.decisionHashByKind.article_dna, null);
  assert.equal(previa.decisionHash, previa.decisionHashByKind.links);
  assert.equal(radarArchitectLinksUpdateLabel(null, 3), "Atualização disponível do Arquiteto · links · grafo do envio → v3");
});

test("links · sem grafo novo, nada aparece: o vigente é o transportado, ou não há grafo aprovado", async () => {
  const hoje = cenario({ aprovarMalha: false });
  assert.equal((await previewArchitectUpdatesWithCore(hoje.loja, { brandId: MARCA })).items.length, 0, "o piloto hoje: v1 transportado e vigente");
  const semGrafo = cenario();
  semGrafo.loja.vigentes.clear();
  assert.equal((await previewArchitectUpdatesWithCore(semGrafo.loja, { brandId: MARCA })).items.length, 0);
  assert.deepEqual(semGrafo.loja.escritas, []);
});

/* ============================ adotar ============================ */

test("links · adotar: só o grafo transportado troca; a investigação, as corridas, o estado e as colunas da versão ficam; releitura e evento", async () => {
  const { banco, loja, v2 } = cenario();
  const previa = await previewArchitectUpdatesWithCore(loja, { brandId: MARCA, articleIds: [ARTIGO.F, ARTIGO.T, ARTIGO.N] });
  const antes = new Map([ARTIGO.F, ARTIGO.T, ARTIGO.N].map(id => [id, structuredClone(itemDe(banco, id))]));
  const corridasAntes = JSON.stringify(banco.radar_analysis_runs);
  const resultado = await adoptArchitectVersionWithCore(loja, {
    brandId: MARCA, actorId: ATOR, articleIds: [], linkArticleIds: [ARTIGO.F, ARTIGO.T, ARTIGO.N], decisionHash: previa.decisionHashByKind.links!, now: AGORA,
  });
  assert.equal(resultado.state, "APPLIED");
  if (resultado.state !== "APPLIED") return;
  assert.equal(resultado.adopted, 3);
  assert.equal(resultado.readbackConfirmed, true);
  for (const desfecho of resultado.results) {
    assert.equal(desfecho.status, "adopted");
    assert.equal(desfecho.updateKind, "links");
    if (desfecho.status === "adopted" && desfecho.updateKind === "links") assert.deepEqual([desfecho.fromGraphVersion, desfecho.toGraphVersion], [1, 2]);
  }

  for (const [articleId, itemAntes] of antes) {
    const item = itemDe(banco, articleId);
    const payload = item.payload as Linha;
    const versao = String((itemAntes.payload as Linha).articleDnaVersionId);
    assert.deepEqual(semLinks(payload), semLinks(itemAntes.payload as Linha), `${articleId}: só o campo de links muda (análise, hidratação, versão)`);
    assert.deepEqual(payload.arquitetoInternalLinks, RadarItemSchema.shape.arquitetoInternalLinks.parse(relevantEdgesForArticle({ graph: v2, articleDnaVersionId: versao })), "pelo MESMO caminho do envio");
    assert.equal(item.state, itemAntes.state, "o estado do item não muda (enviado continua enviado)");
    assert.equal(item.source_version_id ?? null, itemAntes.source_version_id ?? null, "as colunas da versão transportada não são escritas");
    assert.equal(Number(item.lock_version), Number(itemAntes.lock_version) + 1);
  }
  assert.equal(JSON.stringify(banco.radar_analysis_runs), corridasAntes, "nenhuma corrida nova: a pesquisa não é refeita");
  assert.ok(!loja.escritas.some(escrita => escrita.startsWith("run:") || escrita.startsWith("item+colunas:")));
  assert.equal(loja.eventos.length, 3);
  assert.deepEqual(Object.keys(loja.eventos[0].payload as Linha).sort(), ["changes", "classification", "fromGraphVersionId", "fromGraphVersionNumber", "itemHash", "toGraphVersionId", "toGraphVersionNumber", "updateKind"].sort());
  assert.equal((loja.eventos[0].payload as Linha).updateKind, "links");
  assert.equal((loja.eventos[0].payload as Linha).toGraphVersionId, v2.graphVersionId);
  assert.equal(((itemDe(banco, ARTIGO.F).payload as Linha).analysisVersions as Linha[]).some(versao => (versao.payload as Linha).finalizedBundle), true, "o pacote congelado do F continua lá");

  const depois = await previewArchitectUpdatesWithCore(loja, { brandId: MARCA, articleIds: [ARTIGO.F, ARTIGO.T, ARTIGO.N] });
  assert.equal(depois.items.length, 0, "depois de adotar, não há mais atualização de links");
});

test("links · a investigação não fica desatualizada pelo grafo; o artigo-modelo e o CSV leem a malha nova; o congelado não acusa divergência de links", async () => {
  const { banco, loja, v1, v2 } = cenario();
  const envelope = envelopeV1(banco, ARTIGO.N);
  const contexto = () => buildRadarArticleResearchContext({
    item: RadarItemSchema.parse({ ...(itemDe(banco, ARTIGO.N).payload as Linha), state: "research_pending", origin: "real" }),
    article: envelope,
  });
  const antes = buildRadarResearchFingerprint(contexto());
  const previa = await previewArchitectUpdatesWithCore(loja, { brandId: MARCA, articleIds: [ARTIGO.N] });
  await adoptArchitectVersionWithCore(loja, { brandId: MARCA, actorId: ATOR, articleIds: [], linkArticleIds: [ARTIGO.N], decisionHash: previa.decisionHash!, now: AGORA });
  const lido = contexto();
  const depois = buildRadarResearchFingerprint(lido);

  assert.equal(antes.internalLinkGraphVersionId, v1.graphVersionId);
  assert.equal(depois.internalLinkGraphVersionId, v2.graphVersionId);
  assert.notEqual(antes.value, depois.value);
  assert.equal(radarResearchIsStale(antes, depois), false, "links não mudam a SERP: a investigação continua valendo");
  assert.equal(radarDeepResearchState({ record: { fingerprint: antes, finalizedAt: AGORA } as never, currentFingerprint: depois, running: false }), "FINALIZED");
  const outraVersao = buildRadarResearchFingerprint({ ...lido, article: { ...lido.article, articleDnaVersionId: "outra" } });
  assert.equal(radarResearchIsStale(antes, outraVersao), true, "mudança do artigo continua desatualizando");
  assert.equal(radarResearchIsStale({ value: "a|b|g1" }, { value: "a|b|g2" }), true, "impressão sem o campo do grafo compara inteira, como antes");

  /* A leitura (D6, silo-link-mesh): os irmãos e a SiloPage chegam pelo grafo novo. */
  const prioridades = radarSiloMeshGraphPriorities(lido.internalLinks?.edges);
  assert.equal(prioridades.byArticleId.size, 5, "o Pilar e os 4 irmãos");
  assert.equal(prioridades.byArticleId.get(ARTIGO.F), "HIGH");
  assert.equal(prioridades.siloPage, "LOW");

  /* O dossiê de hoje × o congelado de ontem: contagem de links de grafos diferentes não é divergência. */
  const observado = (grafo: string, links: number) => ({
    sample: { analyzedSuccess: 4, comparablePages: 4, failedFinal: 0 }, concepts: { all: [] },
    internalLinkPlan: { totalRecommendedLinks: links }, authorityEvidence: { claims: [] }, internalLinks: { graphVersionId: grafo },
  }) as never;
  const congelado = { sample: { analyzedSuccess: 4, comparablePages: 4, failedFinal: 0 }, model: { conceptIds: [] }, links: { graphVersionId: v1.graphVersionId, totalRecommendedLinks: 1 }, authority: { claims: [] } } as never;
  assert.deepEqual(radarObservedDivergesFromFrozen(observado(v2.graphVersionId, 6), congelado), []);
  assert.match(radarObservedDivergesFromFrozen(observado(v1.graphVersionId, 6), congelado).join(" "), /Links recomendados: 6 no dossiê, 1 no congelado/, "no mesmo grafo a régua de antes vale");
});

/* ============================ o lote ============================ */

test("links · lote por Silo: uma prévia, uma confirmação, recusa por item e prévia vencida", async () => {
  const { banco, loja } = cenario();
  const previa = await previewArchitectUpdatesWithCore(loja, { brandId: MARCA, articleIds: SELECAO });
  const grupos = radarArchitectUpdatesBySilo(previa.items);
  assert.equal(grupos.length, 1);
  assert.equal(grupos[0].siloName, "Cuidados com a pele oleosa");
  assert.equal(grupos[0].items.length, 4);

  const vencido = await adoptArchitectVersionWithCore(loja, { brandId: MARCA, actorId: ATOR, articleIds: [], linkArticleIds: SELECAO, decisionHash: "0".repeat(64), now: AGORA });
  assert.equal(vencido.state === "REFUSED" && vencido.code, "STALE_DECISION");
  assert.deepEqual(loja.escritas, []);

  const vAntes = structuredClone(itemDe(banco, ARTIGO.V));
  const semV = previa.items.filter(item => item.articleId !== ARTIGO.V);
  const resultado = await adoptArchitectVersionWithCore(loja, {
    brandId: MARCA, actorId: ATOR, articleIds: [], linkArticleIds: semV.map(item => item.articleId), decisionHash: await radarArchitectAdoptionDecisionHash(semV), now: AGORA,
  });
  assert.equal(resultado.state, "APPLIED");
  if (resultado.state !== "APPLIED") return;
  assert.equal(resultado.adopted, 3);
  assert.deepEqual(itemDe(banco, ARTIGO.V), vAntes, "V foi desmarcado: intocado");

  /* Item mexido depois da prévia: o hash de agora não bate e nada é gravado. */
  const outra = cenario();
  const previaOutra = await previewArchitectUpdatesWithCore(outra.loja, { brandId: MARCA, articleIds: [ARTIGO.N] });
  itemDe(outra.banco, ARTIGO.N).lock_version = Number(itemDe(outra.banco, ARTIGO.N).lock_version) + 1;
  const mexido = await adoptArchitectVersionWithCore(outra.loja, { brandId: MARCA, actorId: ATOR, articleIds: [], linkArticleIds: [ARTIGO.N], decisionHash: previaOutra.decisionHash!, now: AGORA });
  assert.equal(mexido.state, "REFUSED");
  assert.deepEqual(outra.loja.escritas, []);
});

/* ============================ ArticleDNA e links ao mesmo tempo ============================ */

test("links + ArticleDNA: as duas aparecem; finalizado adota só os links e segue na versão enviada (F5.b)", async () => {
  const { banco, loja, v2 } = cenario();
  const fV2 = await versaoNova(banco, ARTIGO.F);
  loja.aprovadas.add(fV2.versionId);
  const previa = await previewArchitectUpdatesWithCore(loja, { brandId: MARCA, articleIds: [ARTIGO.F] });
  assert.deepEqual(previa.items.map(item => item.updateKind), ["article_dna", "links"], "a versão nova primeiro, os links depois");
  const [dna, links] = previa.items;
  assert.equal(dna.adoptable, false);
  assert.equal(dna.refusal?.code, "frozen_investigation", "a regra do ArticleDNA continua valendo");
  assert.equal(links.adoptable, true);
  assert.equal(previa.decisionHashByKind.article_dna, null);

  const resultado = await adoptArchitectVersionWithCore(loja, { brandId: MARCA, actorId: ATOR, articleIds: [], linkArticleIds: [ARTIGO.F], decisionHash: previa.decisionHashByKind.links!, now: AGORA });
  assert.equal(resultado.state, "APPLIED");
  const payload = itemDe(banco, ARTIGO.F).payload as Linha;
  assert.equal(payload.articleDnaVersionId, envelopeV1(banco, ARTIGO.F).versionId, "o item segue na versão enviada");
  assert.equal((payload.arquitetoInternalLinks as Linha).graphVersionId, v2.graphVersionId);
  const depois = await previewArchitectUpdatesWithCore(loja, { brandId: MARCA, articleIds: [ARTIGO.F] });
  assert.deepEqual(depois.items.map(item => item.updateKind), ["article_dna"], "a versão nova continua esperando o congelamento novo");
});

test("links + ArticleDNA: grafo remontado só sobre a versão nova → os links chegam com a adoção dela", async () => {
  const { banco, loja } = cenario();
  const nV2 = await versaoNova(banco, ARTIGO.N);
  loja.aprovadas.add(nV2.versionId);
  const v3 = grafoDoSilo(banco, { versao: 3, malha: true, versoes: { [ARTIGO.N]: nV2 } });
  loja.grafos.push(v3);
  loja.vigentes.clear();
  loja.vigentes.add(v3.graphVersionId);

  const previa = await previewArchitectUpdatesWithCore(loja, { brandId: MARCA, articleIds: [ARTIGO.N] });
  const dna = previa.items.find(item => item.updateKind === "article_dna")!;
  const links = previa.items.find(item => item.updateKind === "links")!;
  assert.equal(dna.adoptable, true);
  assert.ok(dna.plan.keeps.some(texto => /grafo aprovado vigente já cobre a versão nova e vem junto/.test(texto)));
  assert.equal(links.adoptable, false);
  assert.equal(links.refusal?.code, "links_follow_article_version");
  assert.match(links.refusal!.reason, /chegam junto com a adoção dessa versão/);

  const resultado = await adoptArchitectVersionWithCore(loja, { brandId: MARCA, actorId: ATOR, articleIds: [ARTIGO.N], linkArticleIds: [ARTIGO.N], decisionHash: previa.decisionHashByKind.article_dna!, now: AGORA });
  assert.equal(resultado.state, "APPLIED");
  if (resultado.state !== "APPLIED") return;
  assert.deepEqual(resultado.results.map(item => [item.status, item.updateKind ?? "article_dna"]), [["adopted", "article_dna"], ["nothing_to_adopt", "links"]]);
  const payload = itemDe(banco, ARTIGO.N).payload as Linha;
  assert.equal(payload.articleDnaVersionId, nV2.versionId);
  assert.deepEqual(payload.arquitetoInternalLinks, RadarItemSchema.shape.arquitetoInternalLinks.parse(relevantEdgesForArticle({ graph: v3, articleDnaVersionId: nV2.versionId })), "o grafo vigente veio junto, pelo caminho do envio");
  assert.equal((loja.eventos[0].payload as Linha).linksGraphVersionId, v3.graphVersionId);
  assert.equal((await previewArchitectUpdatesWithCore(loja, { brandId: MARCA, articleIds: [ARTIGO.N] })).items.length, 0);
});

/* ============================ MCP, rota, tela e catálogo ============================ */

test("links · o núcleo não refaz pesquisa, a rota e o MCP cobrem a classe nova, o catálogo diz o caminho", () => {
  const nucleo = semComentarios(ler("lib/server/radar-architect-adoption.ts"));
  const adotarLinks = nucleo.slice(nucleo.indexOf("async function adotarLinks("));
  assert.ok(adotarLinks.length > 100);
  assert.doesNotMatch(adotarLinks, /writeAnalysisRun|createRadarAnalysisSuccessor|radarAnalysisAdoptionPatch/, "nada da análise");
  assert.match(adotarLinks, /store\.updateRadarItem\(\{ itemId: linha\.id, brandId: input\.brandId, expectedLock: linha\.lock_version, payload: proximo, actorId: input\.actorId \}\)/, "nenhuma coluna da versão transportada");
  assert.match(adotarLinks, /radarItemPayloadAdoptingLinks\(/);
  assert.match(nucleo, /relevantEdgesForArticle\(\{ graph: grafo, articleDnaVersionId: transportada \}\)/, "o MESMO caminho do envio");
  assert.doesNotMatch(nucleo, /"architect"/);

  const rota = semComentarios(ler("app/api/editorial/radar-architect-update/route.ts"));
  assert.match(rota, /linkArticleIds: z\.array/);
  assert.match(rota, /linkArticleIds: input\.linkArticleIds \?\? \[\]/);

  const ferramentas = semComentarios(ler("lib/server/platform-mcp-tools.ts"));
  const inicio = ferramentas.indexOf('server.registerTool("adopt_architect_version"');
  const corpo = ferramentas.slice(inicio, ferramentas.indexOf("server.registerTool(", inicio + 30));
  assert.match(corpo, /kinds: z\.array\(z\.enum\(\["article_dna", "links"\]\)\)/);
  assert.match(corpo, /linkArticleIds: !tipos\.has\("links"\)/);
  assert.match(corpo, /links_changed/);
  assert.equal((corpo.match(/adoptArchitectVersionWithCore\(store/g) || []).length, 1, "um núcleo só");

  const operacao = PLATFORM_OPERATIONS.find(item => item.id === "radar.adopt_architect_version")!;
  const notas = (operacao.notes ?? []).join(" ");
  assert.match(operacao.howOnScreen, /Atualização disponível do Arquiteto · links · grafo vA → vB/);
  assert.match(operacao.howOnScreen, /Adotar os links novos \(k\)/);
  assert.match(notas, /links_changed/);
  assert.match(notas, /decisionHashByKind\.links/);
  assert.match(notas, /também para item finalizado, aprovado ou enviado ao Redator/);
  const links = PLATFORM_OPERATIONS.find(item => item.id === "arquiteto.internal_links");
  assert.ok(links && !(links.notes ?? []).join(" ").includes("até ser reenviado ou adotado"), "o Arquiteto não reenvia: o caminho é a adoção no Radar");

  const estado = semComentarios(ler("lib/server/agent-platform-state.ts"));
  assert.match(estado, /linksUpdate: linksUpdateDe\(row\)/, "get_platform_state mostra a atualização de links");
});
