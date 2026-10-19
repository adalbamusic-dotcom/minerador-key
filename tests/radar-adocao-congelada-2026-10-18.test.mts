import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ARTIGO, MARCA, semearBanco, type Banco, type Linha } from "./radar-export-leitura-fixtures.mts";
import { VersionedArticleDNASchema, type ArticleDNA, type VersionEnvelope } from "../lib/arquiteto/contracts.ts";
import { contentHash } from "../lib/arquiteto/versioning.ts";
import type { CanonicalApprovalIndex } from "../lib/arquiteto/operational-status.ts";
import { radarArchitectAdoptionRefusal } from "../lib/radar/architect-update.ts";
import { rebaseRadarDeepResearch, RadarDeepResearchRecordSchema, type RadarDeepResearchRecord } from "../lib/radar/deep-research.ts";
import { radarResearchResumption } from "../lib/radar/research-resumption.ts";
import { planRadarResearchBatch, runRadarResearchBatch } from "../lib/radar/research-batch.ts";
import {
  adoptArchitectVersionWithCore,
  previewArchitectUpdatesWithCore,
  type RadarAdoptionItemRow,
  type RadarArchitectAdoptionStore,
} from "../lib/server/radar-architect-adoption.ts";

/*
 * ===== 2026-10-18 · ADOTAR A VERSÃO NOVA SOBRE A INVESTIGAÇÃO CONGELADA (defeito do teste real) =====
 *
 * WifiConecta, amarelo: "Melhorar publicados…" acrescentou duas keywords ao
 * Suporte "Instalação…" (v2 → v3, principal igual). O Radar mostrava a
 * atualização e recusava ("A investigação está congelada (Google)… esta fase
 * ainda não faz sozinha"), com "Adotar a versão nova (0)" desligado: o artigo
 * finalizado nunca recebia a melhoria e ia ao Redator com a composição velha.
 *
 * Agora, na tela ("Ver e adotar"), a mesma confirmação: (1) leva o item à
 * versão nova; (2) reaproveita o que foi coletado das keywords que ficaram e
 * coleta só a SERP das novas; (3) congela de novo pelo "Finalizar" de sempre;
 * (4) organiza o artigo-modelo; (5) relê. A fotografia antiga fica no
 * histórico. Pelo MCP a recusa é a de antes. Principal nova continua recusada.
 * Bancada do export, sem provider nem IA.
 */

const ATOR = "6b1e0099-2c3d-4e5f-8a9b-000000000099";
const AGORA = "2026-10-18T12:00:00.000Z";
const semComentarios = (fonte: string) => fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const ler = (arquivo: string) => readFileSync(new URL(`../${arquivo}`, import.meta.url), "utf8");

type Envelope = VersionEnvelope<ArticleDNA>;
const linhaDoDna = (banco: Banco, articleId: string) => banco.editorial_artifact_versions
  .find(linha => linha.artifact_type === "article_dna" && ((linha.payload as Linha).payload as Linha).articleId === articleId)!;
const envelopeV1 = (banco: Banco, articleId: string) => VersionedArticleDNASchema.parse(linhaDoDna(banco, articleId).payload) as Envelope;

async function versaoNova(banco: Banco, articleId: string, mudar: (payload: ArticleDNA) => ArticleDNA): Promise<Envelope> {
  const v1 = envelopeV1(banco, articleId);
  const payload = mudar(structuredClone(v1.payload));
  const envelope = VersionedArticleDNASchema.parse({
    ...v1, versionId: `${articleId}-v2`, versionNumber: 2, previousVersionId: v1.versionId,
    contentHash: await contentHash(payload), changeReason: "Melhorar publicados", createdAt: "2026-10-18T09:00:00.000Z", payload,
  }) as Envelope;
  banco.editorial_artifact_versions.push({
    ...linhaDoDna(banco, articleId), payload: envelope, version_id: envelope.versionId, version_number: 2,
    previous_version_id: v1.versionId, content_hash: envelope.contentHash, created_at: envelope.createdAt,
  });
  return envelope;
}

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
    async readInternalLinkGraphs() { return []; },
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

const itemDe = (banco: Banco, articleId: string) => banco.editorial_workflow_items.find(linha => linha.article_id === articleId)!;
const versoesDe = (banco: Banco, articleId: string) => (itemDe(banco, articleId).payload as Linha).analysisVersions as Linha[];

const evidencia = (snapshotId: string) => ({ serpClass: "auxiliary" as const, snapshotId, collectedAt: "2026-10-01T10:00:00.000Z", contentHash: `sha256:${snapshotId}`, resultCount: 10, observedIntent: null, results: [] });
const consulta = (keywordId: string, role: "principal" | "secundaria", comEvidencia: boolean) => ({
  queryId: `q:${keywordId}`, keywordId, keyword: keywordId, role, disposition: "EXECUTE" as const,
  execution: comEvidencia ? "EXECUTED" as const : "PLANNED" as const, serpClass: role === "principal" ? "canonical" as const : "auxiliary" as const,
  evidence: comEvidencia ? { ...evidencia(`snap-${keywordId}`), serpClass: role === "principal" ? "canonical" as const : "auxiliary" as const } : null,
  reason: comEvidencia ? "coletada" : "planejada",
});
const registroCongelado = (principal: string, secundaria: string): RadarDeepResearchRecord => RadarDeepResearchRecordSchema.parse({
  startedAt: "2026-10-01T10:00:00.000Z", startedBy: ATOR, primarySearchMode: "WEB",
  fingerprint: { articleDnaVersionId: "antiga", articleDnaContentHash: null, keywordRefs: [], siloDnaVersionId: null, siloPageId: null, formationAssessmentId: null, formationBaseHash: null, internalLinkGraphVersionId: null, value: "antiga||" },
  queries: [consulta(principal, "principal", true), consulta(secundaria, "secundaria", true)],
  summary: null, researchCuration: null, finalizedAt: "2026-10-02T10:00:00.000Z", finalizedBy: ATOR, conclusion: "SUFFICIENT",
});

/** A bancada do defeito: F congelado no Google, com a investigação gravada (principal e secundária com SERP). */
async function cenario(mudar: (payload: ArticleDNA) => ArticleDNA, opcoes: { estado?: string } = {}) {
  const banco = semearBanco();
  const loja = armazem(banco);
  const v1 = envelopeV1(banco, ARTIGO.F);
  const principal = v1.payload.principalKeywordId;
  const secundaria = v1.payload.keywordReferences.find(reference => reference.role === "secundaria")!.keywordId;
  for (const versao of versoesDe(banco, ARTIGO.F)) (versao.payload as Linha).deepResearch = registroCongelado(principal, secundaria);
  if (opcoes.estado) itemDe(banco, ARTIGO.F).state = opcoes.estado;
  const v2 = await versaoNova(banco, ARTIGO.F, mudar);
  loja.aprovadas.add(v2.versionId);
  return { banco, loja, v1, v2, principal, secundaria };
}

/** "Melhorar publicados…": duas keywords novas como secundárias, principal e slug iguais. */
const duasNovas = (payload: ArticleDNA): ArticleDNA => {
  const base = payload.keywordReferences.find(reference => reference.role === "secundaria")!;
  const novas = ["kw-internet-instalacao", "kw-instalacao-de-internet"].map(keywordId => ({ ...base, keywordId, keywordDnaVersionId: `kwdna-${keywordId}` }));
  return { ...payload, secondaryKeywordIds: [...payload.secondaryKeywordIds, ...novas.map(item => item.keywordId)], keywordReferences: [...payload.keywordReferences, ...novas] };
};

/* ============================ a prévia ============================ */

test("congelada · pelo MCP (sem a tela) a recusa é a de antes; pela tela a prévia diz o que é reaproveitado, coletado, a IA e o teto", async () => {
  const { loja } = await cenario(duasNovas);
  const mcp = await previewArchitectUpdatesWithCore(loja, { brandId: MARCA, articleIds: [ARTIGO.F] });
  assert.equal(mcp.items[0].adoptable, false);
  assert.equal(mcp.items[0].refusal?.code, "frozen_investigation");
  assert.match(mcp.items[0].refusal!.reason, /tela do Radar/, "a recusa diz onde a adoção com congelamento novo é feita");

  const tela = await previewArchitectUpdatesWithCore(loja, { brandId: MARCA, articleIds: [ARTIGO.F], continueOnScreen: true });
  assert.deepEqual(loja.escritas, [], "a prévia não grava");
  const f = tela.items[0];
  assert.equal(f.classification, "composition_changed");
  assert.equal(f.adoptable, true);
  assert.equal(f.refusal, null);
  assert.deepEqual(f.plan.refreeze, {
    newKeywords: ["kw-internet-instalacao", "kw-instalacao-de-internet"], queriesToCollect: 2, serpCallsCeiling: 8, aiCallsCeiling: 2, sentToWriter: false,
  }, "só as duas keywords novas vão à coleta: a principal e a secundária que ficou já têm SERP");
  assert.ok(f.plan.keeps.some(texto => /Reaproveitado, sem nova cobrança: a SERP da principal/.test(texto)));
  assert.ok(f.plan.keeps.some(texto => /SERP auxiliar de 1 keyword\(s\) que ficaram/.test(texto)));
  assert.ok(f.plan.keeps.some(texto => /ficam no histórico; nada é apagado/.test(texto)));
  assert.deepEqual(f.plan.redo.map(texto => texto.slice(0, 2)), ["1.", "2.", "3.", "4.", "5."], "os passos, em ordem");
  assert.match(f.plan.redo[1], /coleta só o que falta: a SERP das keywords novas \(kw-internet-instalacao, kw-instalacao-de-internet\)/);
  assert.match(f.plan.redo[2], /congelada de novo sobre a v2, pelo mesmo "Finalizar" de sempre/);
  assert.match(f.plan.redo[3], /artigo-modelo/);
  assert.match(f.plan.costs[0], /no máximo 8 chamada\(s\) \(2 consulta\(s\) × 4 lentes\); cache primeiro/);
  assert.match(f.plan.costs[1], /IA: até 2 chamada\(s\)/);
  assert.ok(!f.plan.costs.some(texto => /não chama provider nem IA/.test(texto)), "o custo da adoção com congelamento novo não se diz grátis");
  assert.notEqual(tela.decisionHash, mcp.decisionHash);
});

test("congelada · principal nova continua recusada (a pesquisa da principal recomeça, decisão do artigo)", async () => {
  const { loja } = await cenario(payload => {
    const secundaria = payload.keywordReferences.find(reference => reference.role === "secundaria")!;
    const principal = payload.keywordReferences.find(reference => reference.role === "principal")!;
    return { ...payload, principalKeywordId: secundaria.keywordId, secondaryKeywordIds: [principal.keywordId], keywordReferences: [{ ...secundaria, role: "principal" }, { ...principal, role: "secundaria" }] };
  });
  const tela = await previewArchitectUpdatesWithCore(loja, { brandId: MARCA, articleIds: [ARTIGO.F], continueOnScreen: true });
  assert.equal(tela.items[0].classification, "principal_changed");
  assert.equal(tela.items[0].adoptable, false);
  assert.equal(tela.items[0].refusal?.code, "frozen_investigation");
  assert.match(tela.items[0].refusal!.reason, /esta fase ainda não faz sozinha/, "a regra de antes, intacta");
});

test("congelada · enviada ao Redator: adotável na tela; o documento de lá não muda e o reenvio mostra 'Atualização disponível'", async () => {
  const { loja } = await cenario(duasNovas, { estado: "sent_writer" });
  const mcp = await previewArchitectUpdatesWithCore(loja, { brandId: MARCA, articleIds: [ARTIGO.F] });
  assert.equal(mcp.items[0].refusal?.code, "sent_to_writer");
  const tela = await previewArchitectUpdatesWithCore(loja, { brandId: MARCA, articleIds: [ARTIGO.F], continueOnScreen: true });
  assert.equal(tela.items[0].adoptable, true);
  assert.equal(tela.items[0].plan.refreeze?.sentToWriter, true);
  assert.ok(tela.items[0].plan.keeps.some(texto => /documento do Redator não muda.*'Atualização disponível'/.test(texto)));
  const v1 = (await cenario(duasNovas)).v1.payload;
  assert.equal(radarArchitectAdoptionRefusal({ state: "approved", analysis: { finalizedBundle: {} as never }, from: v1, to: duasNovas(structuredClone(v1)), allowRefreeze: true })?.code, "approved_package", "pacote aprovado continua recusado");
});

/* ============================ adotar ============================ */

test("congelada · adotar: o item vai à v2, a investigação é reaberta numa versão nova da análise, a fotografia antiga fica no histórico, releitura e evento", async () => {
  const { banco, loja, v2 } = await cenario(duasNovas);
  const antes = structuredClone(versoesDe(banco, ARTIGO.F));
  const previa = await previewArchitectUpdatesWithCore(loja, { brandId: MARCA, articleIds: [ARTIGO.F], continueOnScreen: true });
  const semTela = await adoptArchitectVersionWithCore(loja, { brandId: MARCA, actorId: ATOR, articleIds: [ARTIGO.F], decisionHash: previa.decisionHash!, now: AGORA });
  assert.equal(semTela.state, "REFUSED", "o hash da prévia da tela não vale para quem não continua o congelamento");
  assert.deepEqual(loja.escritas, []);

  const resultado = await adoptArchitectVersionWithCore(loja, { brandId: MARCA, actorId: ATOR, articleIds: [ARTIGO.F], decisionHash: previa.decisionHash!, now: AGORA, continueOnScreen: true });
  assert.equal(resultado.state, "APPLIED");
  if (resultado.state !== "APPLIED") return;
  const desfecho = resultado.results[0];
  assert.equal(desfecho.status, "adopted");
  assert.equal(desfecho.status === "adopted" && "refreeze" in desfecho && desfecho.refreeze, true, "a tela recebe quem continua no congelamento novo");
  assert.equal(resultado.readbackConfirmed, true);

  const item = itemDe(banco, ARTIGO.F);
  const payload = item.payload as Linha;
  assert.equal(payload.articleDnaVersionId, v2.versionId);
  assert.equal(item.source_version_id, v2.versionId);
  assert.equal(payload.slug, v2.payload.suggestedSlug, "o slug é o de sempre (a principal e o slug não mudam)");
  assert.equal(payload.principalKeywordId, v2.payload.principalKeywordId);
  const versoes = versoesDe(banco, ARTIGO.F);
  assert.equal(versoes.length, antes.length + 1);
  assert.deepEqual(versoes.slice(0, -1), antes, "as versões anteriores — com a fotografia congelada — ficam no histórico");
  assert.ok(antes.some(versao => (versao.payload as Linha).finalizedBundle), "a fotografia antiga continua lá");
  const nova = versoes.at(-1)!.payload as Linha;
  assert.equal(nova.finalizedBundle, null, "a versão nova está reaberta");
  const pesquisa = nova.deepResearch as Linha;
  assert.equal(pesquisa.finalizedAt, null);
  assert.equal(pesquisa.conclusion, null);
  assert.equal(((pesquisa.queries as Linha[]).filter(query => query.evidence)).length, 2, "o que foi coletado fica para a pesquisa reaproveitar");
  assert.equal(nova.articleDnaVersionId, v2.versionId);
  assert.match(String(versoes.at(-1)!.changeReason), /reaberta para o congelamento novo/);
  assert.equal((loja.eventos[0].payload as Linha).refreeze, true);
  assert.deepEqual((loja.escritas as string[]).map(escrita => escrita.split(":")[0]).filter(tipo => tipo !== "run"), ["item", "evento"], "a corrida (se houver) vai antes; depois o item e o evento");
});

/* ======================== o congelamento novo, em ordem ======================== */

test("congelada · o 'Refazer Pesquisa Google' rebaseado carrega a evidência do que ficou e só pede as keywords novas", () => {
  const anterior = registroCongelado("kw-principal", "kw-secundaria");
  const plano = RadarDeepResearchRecordSchema.parse({
    ...anterior, startedAt: AGORA, finalizedAt: null, finalizedBy: null, conclusion: null,
    fingerprint: { ...anterior.fingerprint, articleDnaVersionId: "nova", value: "nova||" },
    queries: [consulta("kw-principal", "principal", false), consulta("kw-secundaria", "secundaria", false), consulta("kw-internet-instalacao", "secundaria", false)],
  });
  const { record, carried, canonicalCarried } = rebaseRadarDeepResearch({ previous: anterior, next: plano });
  assert.equal(canonicalCarried, true);
  assert.equal(carried, 2);
  assert.equal(record.fingerprint.value, "nova||", "a impressão é a nova: a investigação deixa de estar desatualizada");
  const retomada = radarResearchResumption({ record });
  assert.equal(retomada.canonicalComplete, true);
  assert.deepEqual(retomada.auxiliaryToCollect.map(query => query.keywordId), ["kw-internet-instalacao"], "só a keyword nova vai ao provider");
});

test("congelada · a tela segue pelo MESMO 'Pesquisar e finalizar': Refazer (só o que falta) → analisar → finalizado, com o teto da prévia", async () => {
  const plano = planRadarResearchBatch([{
    articleId: "f", title: "Instalação", finalized: false, mode: "WEB",
    phase1: { id: "START_RESEARCH", enabled: true, label: "Refazer Pesquisa Google", blockedReason: null, hint: "O fundamento do artigo mudou depois desta investigação." },
    canonicalReusable: true, auxiliaryToRun: 2, articleBlueprint: null,
  }]);
  assert.equal(plano.run.length, 1);
  assert.equal(plano.serpCallsCeiling, 8, "o mesmo teto que a prévia da adoção disse");
  assert.equal(plano.aiCallsCeiling, 2);
  const fases = [
    { finalized: false, phase1: { id: "START_RESEARCH" as const, enabled: true, label: "Refazer Pesquisa Google", blockedReason: null, hint: null } },
    { finalized: false, phase1: { id: "ANALYZE_COMPETITION" as const, enabled: true, label: "Analisar concorrência · e finaliza", blockedReason: null, hint: null } },
    { finalized: true, phase1: null },
  ];
  let fase = 0;
  const passos: string[] = [];
  const resultado = await runRadarResearchBatch({
    plan: plano, confirmed: true, open: async () => true, read: () => fases[fase],
    run: async (_id, passo) => { passos.push(passo); fase += 1; },
  });
  assert.deepEqual(passos, ["START", "ANALYZE"]);
  assert.equal(resultado.items[0].status, "FINALIZED");
});

test("congelada · a tela liga as pontas: prévia e adoção com continueOnScreen, START rebaseado e o lote de sempre depois da releitura", () => {
  const painel = semComentarios(ler("modules/radar/radar-architect-update-panel.tsx"));
  assert.match(painel, /continueOnScreen=1/);
  assert.match(painel, /continueOnScreen: true/);
  assert.match(painel, /<InfoHint title=\{RADAR_ARCHITECT_ADOPT_BUTTON\}/, "o botão tocado ganhou o 'i'");
  const pagina = semComentarios(ler("modules/radar/radar-page.tsx"));
  assert.match(pagina, /rebaseRadarDeepResearch\(\{ previous: registroAnterior, next: novoRegistro\(\) \}\)/);
  assert.match(pagina, /const congelarDeNovoDepoisDaAdocao = async[\s\S]*?planRadarResearchBatch\([\s\S]*?await pesquisarEFinalizarEmLote\(plano\)/, "o congelamento novo é o MESMO lote de sempre");
  assert.doesNotMatch(pagina, /\/api\/editorial\/radar-architect-update[^"]*refreeze/, "nenhuma rota nova");
  const rota = semComentarios(ler("app/api/editorial/radar-architect-update/route.ts"));
  assert.match(rota, /continueOnScreen: input\.continueOnScreen/);
});
