import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  BACKUP_EXPORT_TYPE,
  BACKUP_RESTORE_CAPABILITY,
  BACKUP_SCHEMA_VERSION,
  BackupContractError,
  parseBackup,
  serializeBackup,
  validateBackupIntegrity,
  type BackupFile,
} from "../lib/arquiteto/backup-contract.ts";
import { buildArquitetoBackup, buildArquitetoBackupFile } from "../lib/arquiteto/backup-export.ts";
import { collectSourceVersionIds, remapReferences } from "../lib/arquiteto/backup-restore.ts";
import {
  EDITORIAL_EXPORT_FORBIDDEN_FIELDS,
  EDITORIAL_EXPORT_HEADER,
  buildArquitetoEditorialExport,
} from "../lib/arquiteto/editorial-export.ts";
import {
  A_CONFIRMAR,
  EDITORIAL_KEYWORD_DNA_HEADER,
  buildArquitetoKeywordDnaExport,
} from "../lib/arquiteto/editorial-keyword-dna-export.ts";
import { ARQUITETO_CSV_BOM, parseCsv } from "../lib/arquiteto/csv.ts";
import { ArquitetoExportError, type ArquitetoExportInput, type ArquitetoExportSilo } from "../lib/arquiteto/export-source.ts";
import { createInternalLinkGraph } from "../lib/arquiteto/internal-link-graph.ts";
import type {
  ArticleDNA,
  InternalLinkGraphEdge,
  InternalLinkGraphNode,
  SiloDNA,
  SiloPage,
  VersionEnvelope,
  VersionReference,
} from "../lib/arquiteto/contracts.ts";

const BRAND = "550e8400-e29b-41d4-a716-446655440000";
const ACTOR = "550e8400-e29b-41d4-a716-446655440001";
const AT = "2026-09-13T12:00:00.000Z";
const sha = (c: string) => `sha256:${c.repeat(64)}`;
const ref = (entityId: string, versionId: string, c: string): VersionReference => ({ entityId, versionId, contentHash: sha(c) as VersionReference["contentHash"] });

const PAGE_REF = ref("silo-page:silo-1", "silo-page-v1", "a");
const DNA_REF = ref("silo-1", "silo-dna-v1", "b");
const ARTICLE_A_REF = ref("article-a", "article-a-v1", "c");
const ARTICLE_B_REF = ref("article-b", "article-b-v1", "d");

function envelope<T>(entityId: string, versionId: string, c: string, payload: T): VersionEnvelope<T> {
  return {
    versionId, entityId, versionNumber: 1, previousVersionId: null,
    contentHash: sha(c) as VersionEnvelope<T>["contentHash"],
    origin: "human", changeReason: "Consolidação humana", createdAt: AT, createdBy: ACTOR, payload,
  };
}

function keywordReference(keywordId: string, role: ArticleDNA["keywordReferences"][number]["role"], keyword: string, metrics: { volume: number | null; results: number | null; kgr: number | null }) {
  return {
    keywordId, keywordDnaVersionId: `legacy:${keywordId}:v1`, keywordDnaContentHash: `legacy:${keywordId}`, role,
    strategicContribution: "Contribuição declarada", coveredIntentions: ["informativa"], requiredTopics: [], excludedTopics: [],
    classificationOrigin: "human" as const, confidence: 0.8, humanConfirmed: true,
    volume: metrics.volume, resultCount: metrics.results, kgrScore: metrics.kgr,
    keywordDnaSnapshot: {
      brandId: BRAND, keywordId, capturedAt: AT, versionReference: ref(keywordId, `legacy:${keywordId}:v1`, "e"),
      payload: {
        schemaVersion: 1 as const, keywordId, searchIntent: "informational" as const, likelyEditorialType: "guide" as const,
        centralEntity: "skincare", modifiers: ["pele oleosa", "rotina"], audience: "Pessoas com pele oleosa",
        perceivedProblem: "Oleosidade e brilho", desiredResult: "Pele equilibrada", awarenessLevel: "consciente do problema",
        journeyStage: "TOFU", objections: [], dominantEmotion: "frustração", commercialPotential: "medium" as const,
        affiliatePotential: "none" as const, reviewCandidate: false, productResearchRequired: false, stampOrigin: "human" as const,
        confidence: 0.8, humanConfirmed: true, volumeSearch: metrics.volume, resultCount: metrics.results, kgrScore: metrics.kgr,
      },
      sourceKeywordSnapshot: { keyword },
    },
  } as ArticleDNA["keywordReferences"][number];
}

function articleDna(articleId: string, principalKeyword: string, hierarchy: ArticleDNA["hierarchy"], slug: string): ArticleDNA {
  return {
    schemaVersion: 1, articleId, brandId: BRAND,
    principalKeywordId: `${articleId}-kw-1`, secondaryKeywordIds: [`${articleId}-kw-2`], narrativeReinforcementIds: [],
    keywordReferences: [
      keywordReference(`${articleId}-kw-1`, "principal", principalKeyword, { volume: 2400, results: 373, kgr: 0.155 }),
      keywordReference(`${articleId}-kw-2`, "secundaria", `${principalKeyword} passo a passo`, { volume: 90, results: 12, kgr: 0.133 }),
    ],
    siloId: "silo-1", hierarchy, suggestedSlug: slug, canonical: null,
    mainIntent: "Aprender o essencial", auxiliaryIntents: [], audience: "Gestores",
    problem: "Dependência de anúncios", desiredResult: "Captação orgânica", journeyStage: "TOFU",
    brandObjective: "Gerar demanda própria", promise: "Uma rotina que funciona", angle: "Rotina simples",
    cta: "Avaliar a rotina", coverage: ["fundamentos", "processo"], excludedSubjects: [],
    antiCannibalizationBoundary: "Não ensinar procedimento clínico", nearbyArticleIds: [], differentiation: [],
    entities: ["skincare"], requiredTopics: ["limpeza"], questions: [], objections: [],
    evidenceNeeded: ["estudo dermatológico"], sourcesNeeded: ["sociedade de dermatologia"],
    internalLinks: [], alerts: [], confidence: 0.82, humanPendingDecisions: [],
  };
}

const siloDna: SiloDNA = {
  schemaVersion: 1, formationStatus: "formed", siloId: "silo-1", brandId: BRAND, name: "Skincare",
  centralEntity: "skincare", objective: "Autoridade orgânica", audience: "Pessoas com pele oleosa",
  macroProblem: "Rotina inadequada", dominantIntent: "Informativo", pillarArticleId: "article-a", supportArticleIds: ["article-b"],
  articleReferences: [
    { articleId: "article-a", articleDnaVersionId: "article-a-v1", articleDnaContentHash: sha("c") as VersionReference["contentHash"], role: "Pilar" },
    { articleId: "article-b", articleDnaVersionId: "article-b-v1", articleDnaContentHash: sha("d") as VersionReference["contentHash"], role: "Suporte" },
  ],
  articleRoles: [], narrativeOrder: ["article-a", "article-b"], linkMap: [], boundary: "Skincare para pele oleosa",
  includedTopics: ["limpeza"], excludedTopics: ["procedimento clínico"], nearbySiloIds: [], possibleConflicts: [],
  gaps: [], nextContents: [], confidence: 0.8, humanPendingDecisions: [], hierarchySignals: [],
};

const siloPage: SiloPage = {
  schemaVersion: 1, formationStatus: "formed", siloPageId: "silo-page:silo-1", brandId: BRAND,
  siloDnaRef: DNA_REF, siloId: "silo-1", slug: "skincare", publicationStatus: "new", publishedUrl: null,
  publicationVerification: { status: "not_applicable", checkedAt: null, requestedUrl: null, resolvedUrl: null, declaredCanonical: null, httpStatus: null, sitemapUrl: null, sitemapMatch: null, message: null },
  h1: "Skincare", seoTitle: "Skincare: o guia", metaDescription: "Rotina de skincare.", canonical: null,
  intro: "Introdução", sections: [], cta: "Fale com a equipe", coverImageBrief: "Rosto", visualBriefing: "Luz natural",
  breadcrumbs: [], pillarArticleId: "article-a", supportArticleIds: ["article-b"], indexationStatus: "index",
  alerts: [], confidence: 0.8, humanPendingDecisions: [],
};

function node(nodeId: string, reference: VersionReference, nodeType: "ARTICLE_DNA" | "SILO_PAGE"): InternalLinkGraphNode {
  return {
    nodeId, brandId: BRAND, nodeType,
    articleDnaVersionRef: nodeType === "ARTICLE_DNA" ? reference : null,
    siloPageVersionRef: nodeType === "SILO_PAGE" ? reference : null,
    // O grafo declara OUTRO de propósito: o papel exportado tem de vir do SiloDNA.
    architecturalRole: "OUTRO",
    snapshot: { label: nodeId, siloId: "silo-1" },
  };
}

function edge(edgeId: string, source: string, target: string, relationType: InternalLinkGraphEdge["relationType"], reason: string, anchors: string[]): InternalLinkGraphEdge {
  return { edgeId, sourceNodeId: source, targetNodeId: target, relationType, reason, priority: "MEDIUM", anchorConcepts: anchors, origin: "human", createdBy: ACTOR, createdAt: AT, provenance: { source: "human-review", references: ["review-1"] } };
}

async function baseInput(): Promise<ArquitetoExportInput> {
  const graph = await createInternalLinkGraph({
    graphId: "arquiteto:internal-links:silo-1", brandId: BRAND, siloId: "silo-1",
    baseSiloDnaVersionRef: DNA_REF, baseSiloPageVersionRef: PAGE_REF,
    participatingArticleDnaVersionRefs: [ARTICLE_A_REF, ARTICLE_B_REF],
    versionNumber: 1, workflowStatus: "approved", createdBy: ACTOR, createdAt: AT, approvedBy: ACTOR, approvedAt: AT,
    nodes: [node("silo-page:silo-1", PAGE_REF, "SILO_PAGE"), node("article:article-a", ARTICLE_A_REF, "ARTICLE_DNA"), node("article:article-b", ARTICLE_B_REF, "ARTICLE_DNA")],
    edges: [
      edge("e-1", "silo-page:silo-1", "article:article-a", "SILO_PAGE_TO_ARTICLE", "A raiz apresenta o Pilar", ["skincare"]),
      edge("e-2", "article:article-a", "article:article-b", "PILLAR_TO_SUPPORT", "O Pilar aponta para o aprofundamento; veja \"o caso\", linha 2\ne a observação", ["rotina noturna", "limpeza"]),
      edge("e-3", "article:article-b", "article:article-a", "SUPPORT_TO_PILLAR", "O suporte devolve ao macro", ["visão geral"]),
    ],
  });
  const silo: ArquitetoExportSilo = {
    siloDna: envelope("silo-1", "silo-dna-v1", "b", siloDna),
    siloPage: envelope("silo-page:silo-1", "silo-page-v1", "a", siloPage),
    territory: { lifecycleStatus: "consolidated", state: "confirmed", consolidated: true },
    graph: { source: "approved", graph },
    approvedGraph: graph,
  };
  return {
    brandId: BRAND, brandLabel: "Care Glow",
    silos: [silo],
    articles: [
      envelope("article-a", "article-a-v1", "c", articleDna("article-a", "skincare para pele oleosa", "Pilar", "para-pele-oleosa")),
      envelope("article-b", "article-b-v1", "d", articleDna("article-b", "skin care noturno", "Suporte", "noturno")),
    ],
    keywordLabelById: new Map(),
    versionStatusOf: versionId => (versionId === "article-a-v1" || versionId === "silo-dna-v1" ? "approved" : "proposed"),
    workflowStatusOf: articleId => (articleId === "article-a" ? "PRONTO_PARA_RADAR" : "CONCLUIDO"),
    articleReadModelOf: () => ({ serpVerdict: "Compatível", serpImpact: "Universo dominado por guias", kgrDecision: "YES", kgrApplicability: "APPLICABLE" }),
    now: new Date("2026-09-13T18:45:00.000Z"),
  };
}

/* ========================= BACKUP_RESTORABLE_V1 ========================= */

test("o backup se declara e é reconhecível pelo sistema", async () => {
  const artifact = buildArquitetoBackup(await baseInput());
  assert.equal(artifact.content.startsWith(ARQUITETO_CSV_BOM), true);
  assert.match(artifact.content, /minekey_export_type;ARQUITETO_BACKUP/);
  assert.match(artifact.content, /schema_version;1/);
  assert.match(artifact.content, /contract;BACKUP_RESTORABLE_V1/);
  assert.match(artifact.content, /record_type;record_key;record_version;status;content_hash;parent_ref;payload_json/);
  assert.match(artifact.fileName, /^arquiteto-backup-care-glow-/);
});

test("cada linha é um artefato real e o payload canônico volta inteiro", async () => {
  const input = await baseInput();
  const file = buildArquitetoBackupFile(input);
  const tipos = file.records.map(record => record.recordType);
  assert.deepEqual([...new Set(tipos)].sort(), ["ARTICLE_DNA", "INTERNAL_LINK_GRAPH", "SILO_DNA", "SILO_PAGE", "WORKFLOW_STATUS"]);
  assert.equal(tipos.filter(type => type === "ARTICLE_DNA").length, 2);

  const roundTrip = parseBackup(serializeBackup(file));
  assert.equal(roundTrip.records.length, file.records.length);
  const articleA = roundTrip.records.find(record => record.recordType === "ARTICLE_DNA" && record.recordKey === "article-a");
  assert.ok(articleA);
  // O payload não foi achatado: ele volta como o envelope canônico completo.
  assert.deepEqual(articleA.payload, JSON.parse(JSON.stringify(input.articles[0])));
  assert.equal(articleA.status, "approved");
  assert.equal(articleA.contentHash, sha("c"));
});

test("a identidade de cada registro é a do artefato, não o id da linha do banco", async () => {
  const file = buildArquitetoBackupFile(await baseInput());
  const chavesDe = (tipo: string) => file.records.filter(record => record.recordType === tipo).map(record => record.recordKey);
  assert.deepEqual(chavesDe("SILO_DNA"), ["silo-1"]);
  assert.deepEqual(chavesDe("SILO_PAGE"), ["silo-page:silo-1"]);
  assert.deepEqual(chavesDe("INTERNAL_LINK_GRAPH"), ["arquiteto:internal-links:silo-1"]);
  assert.deepEqual(chavesDe("ARTICLE_DNA"), ["article-a", "article-b"]);
  assert.deepEqual(chavesDe("WORKFLOW_STATUS"), ["article-a", "article-b"]);
  // Nenhuma chave é o UUID de uma linha do banco.
  assert.equal(file.records.some(record => record.recordKey === record.contentHash), false);
});

test("o importador recusa arquivo que não se declara backup, e recusa versão de formato desconhecida", async () => {
  const editorial = buildArquitetoEditorialExport(await baseInput());
  assert.throws(() => parseBackup(editorial.content), (error: unknown) => error instanceof BackupContractError && error.code === "NOT_A_BACKUP");
  const backup = buildArquitetoBackup(await baseInput()).content;
  assert.throws(
    () => parseBackup(backup.replace("schema_version;1", "schema_version;99")),
    (error: unknown) => error instanceof BackupContractError && error.code === "UNSUPPORTED_SCHEMA_VERSION",
  );
  assert.throws(() => parseBackup(""), (error: unknown) => error instanceof BackupContractError);
});

test("a integridade recusa referência ausente, duplicidade e Brand divergente", async () => {
  const file = buildArquitetoBackupFile(await baseInput());
  assert.deepEqual(validateBackupIntegrity(file).filter(issue => issue.severity === "error"), []);

  const semSilo: BackupFile = { ...file, records: file.records.filter(record => record.recordType !== "SILO_DNA") };
  assert.equal(validateBackupIntegrity(semSilo).some(issue => issue.code === "MISSING_SILO_DNA"), true);

  const duplicado: BackupFile = { ...file, records: [...file.records, file.records[0]] };
  assert.equal(validateBackupIntegrity(duplicado).some(issue => issue.code === "DUPLICATE_RECORD"), true);

  const outraBrand: BackupFile = { ...file, header: { ...file.header, brandId: "outra-brand" } };
  assert.equal(validateBackupIntegrity(outraBrand).some(issue => issue.code === "BRAND_MISMATCH"), true);
});

/* ============================== RESTAURAÇÃO ============================= */

test("todo tipo restaurável tem writer canônico declarado", () => {
  // A auditoria inicial dizia que faltava writer para território, working copy
  // e pareceres. Faltava a LEITURA da auditoria: os stores tipados existem.
  for (const [tipo, capacidade] of Object.entries(BACKUP_RESTORE_CAPABILITY)) {
    assert.equal(capacidade, "canonical", `${tipo} precisa entrar por writer canônico`);
  }
  assert.equal(BACKUP_RESTORE_CAPABILITY.TERRITORY, "canonical");
  assert.equal(BACKUP_RESTORE_CAPABILITY.INTERNAL_LINK_GRAPH, "canonical");
});

test("as referências são religadas por mapa, e não por despejo de UUID antigo", async () => {
  const file = buildArquitetoBackupFile(await baseInput());
  const antigos = collectSourceVersionIds(file);
  assert.equal(antigos.includes("silo-dna-v1"), true);
  assert.equal(antigos.includes("article-a-v1"), true);

  const mapa = new Map([["silo-dna-v1", "silo-dna-restaurada"], ["article-a-v1", "article-a-restaurada"]]);
  const page = file.records.find(record => record.recordType === "SILO_PAGE");
  assert.ok(page);
  const religada = remapReferences(page.payload, mapa) as { payload: { siloDnaRef: { versionId: string; entityId: string } } };
  assert.equal(religada.payload.siloDnaRef.versionId, "silo-dna-restaurada");
  // A identidade da entidade NÃO é um versionId e permanece intacta.
  assert.equal(religada.payload.siloDnaRef.entityId, "silo-1");

  const graph = file.records.find(record => record.recordType === "INTERNAL_LINK_GRAPH");
  assert.ok(graph);
  const grafoReligado = remapReferences(graph.payload, mapa) as { baseSiloDnaVersionRef: { versionId: string }; nodes: Array<{ articleDnaVersionRef: { versionId: string } | null }> };
  assert.equal(grafoReligado.baseSiloDnaVersionRef.versionId, "silo-dna-restaurada");
  assert.equal(grafoReligado.nodes.some(item => item.articleDnaVersionRef?.versionId === "article-a-restaurada"), true);
  // O original não foi mutado: o plano é leitura.
  assert.equal((graph.payload as { baseSiloDnaVersionRef: { versionId: string } }).baseSiloDnaVersionRef.versionId, "silo-dna-v1");
});

/* =========================== EDITORIAL_EXPORT_V1 ======================== */

test("uma linha por ArticleDNA, com os links agregados e não uma linha por aresta", async () => {
  const input = await baseInput();
  const artifact = buildArquitetoEditorialExport(input);
  const rows = parseCsv(artifact.content);
  assert.deepEqual(rows[0], [...EDITORIAL_EXPORT_HEADER]);
  // O grafo tem três arestas; o arquivo editorial tem dois artigos.
  assert.equal(rows.length - 1, 2);
  assert.equal(artifact.rowCount, 2);
  assert.equal(artifact.contract, "EDITORIAL_EXPORT_V1");
  assert.match(artifact.fileName, /^arquiteto-editorial-care-glow-/);
  assert.match(artifact.summary, /^Exportado: 2 artigo\(s\) · 1 Silo\(s\) · 2 com links internos\.$/);
});

test("a linha traz o plano do artigo: Silo, papel, composição, KeywordDNA, SERP e links", async () => {
  const input = await baseInput();
  const rows = parseCsv(buildArquitetoEditorialExport(input).content);
  const header: string[] = rows[0];
  const linha = rows[1];
  const campo = (name: string) => linha[header.indexOf(name)];
  assert.equal(campo("Silo"), "Skincare");
  // O papel vem do SiloDNA, embora o grafo declare OUTRO nos dois nós.
  assert.equal(campo("Papel no Silo"), "Pilar");
  assert.equal(campo("Keyword principal"), "skincare para pele oleosa");
  assert.equal(campo("Slug"), "para-pele-oleosa");
  assert.equal(campo("Volume"), "2400");
  assert.equal(campo("Resultados"), "373");
  assert.equal(campo("KGR"), "0.155");
  assert.equal(campo("Aplicabilidade"), "APPLICABLE");
  assert.equal(campo("Secundárias"), "skincare para pele oleosa passo a passo");
  // Contexto do KeywordDNA já congelado no ArticleDNA.
  assert.equal(campo("Entidade central"), "skincare");
  assert.equal(campo("Modificadores"), "pele oleosa | rotina");
  assert.equal(campo("Público"), "Pessoas com pele oleosa");
  assert.equal(campo("Problema percebido"), "Oleosidade e brilho");
  assert.equal(campo("Tipo editorial"), "Guia");
  assert.equal(campo("Nível de consciência"), "consciente do problema");
  assert.equal(campo("Parecer SERP"), "Compatível");
  assert.equal(campo("Mercado observado"), "Universo dominado por guias");
  assert.equal(campo("Evidências necessárias"), "estudo dermatológico");
  // Links agregados na linha do artigo, com nome editorial em vez de nodeId.
  // A ordem segue a normalização do grafo, que é determinística.
  assert.equal(campo("Recebe links de"), "skin care noturno | Skincare");
  assert.equal(campo("Aponta links para"), "skin care noturno");
  assert.equal(campo("Conceitos de âncora"), "limpeza | rotina noturna");
  assert.match(campo("Relações internas"), /skincare para pele oleosa → skin care noturno \[Pilar → Suporte\]/);
  assert.equal(campo("Status editorial"), "PRONTO_PARA_RADAR");
});

test("o arquivo editorial não carrega nenhum identificador interno", async () => {
  const input = await baseInput();
  const artifact = buildArquitetoEditorialExport(input);
  for (const proibido of EDITORIAL_EXPORT_FORBIDDEN_FIELDS) {
    assert.equal(artifact.content.includes(proibido), false, `o export editorial não pode conter ${proibido}`);
  }
  for (const vazamento of [BRAND, sha("c"), "article-a-v1", "silo-page-v1", "arquiteto:internal-links:silo-1", "silo-page:silo-1", "e-1", "e-2"]) {
    assert.equal(artifact.content.includes(vazamento), false, `o export editorial não pode vazar ${vazamento}`);
  }
  assert.equal(artifact.content.includes("[object Object]"), false);
  assert.equal(artifact.content.includes("undefined"), false);
});

test("a exportação não depende de seleção e não altera os artefatos de entrada", async () => {
  const input = await baseInput();
  const antes = JSON.stringify({ silos: input.silos, articles: input.articles });
  buildArquitetoBackup(input);
  buildArquitetoEditorialExport(input);
  assert.equal(JSON.stringify({ silos: input.silos, articles: input.articles }), antes);

  for (const arquivo of ["backup-contract.ts", "backup-export.ts", "backup-restore.ts", "editorial-export.ts", "export-source.ts"]) {
    const fonte = readFileSync(new URL(`../lib/arquiteto/${arquivo}`, import.meta.url), "utf8");
    for (const proibido of ["selectedIds", "searchQuery", "filterStatus", "filterHierarquia", "fetch(", "supabase", "/api/", "persistArquitetoArtifact"]) {
      assert.equal(fonte.includes(proibido), false, `${arquivo} não pode conter ${proibido}`);
    }
  }
  assert.throws(() => buildArquitetoEditorialExport({ ...input, articles: [] }), (error: unknown) => error instanceof ArquitetoExportError && error.code === "NO_ARTICLES");
});

/* ================================ a mesa =============================== */

test("a barra oferece os dois produtos e mantém Restaurar backup fora do Importar do Minerador", () => {
  const workspace = readFileSync(new URL("../modules/arquiteto/arquiteto-workspace.tsx", import.meta.url), "utf8");
  assert.equal(workspace.includes("Exportação iniciada"), false);
  const menu = workspace.slice(workspace.indexOf("data-arquiteto-export-menu"), workspace.indexOf("Contador da MESA"));
  assert.match(menu, /Backup restaurável/);
  assert.match(menu, /Dados editoriais \/ Produção/);
  assert.match(menu, /Restaurar backup/);
  assert.match(menu, /exportBackup\(\)/);
  assert.match(menu, /exportProduction()/);
  assert.match(menu, /restoreBackupFile\(file\)/);
  // Importar do Minerador continua sendo KeywordDNA da etapa anterior.
  const importar = workspace.slice(workspace.indexOf("title=\"Selecionar keywords aprovadas no Minerador\"") - 700, workspace.indexOf("title=\"Selecionar keywords aprovadas no Minerador\""));
  assert.equal(importar.includes("restoreBackupFile"), false);
  assert.equal(importar.includes("parseBackup"), false);
});

test("importar é duas etapas: prévia primeiro, confirmação humana depois", () => {
  const workspace = readFileSync(new URL("../modules/arquiteto/arquiteto-workspace.tsx", import.meta.url), "utf8");
  const preview = workspace.slice(workspace.indexOf("const handleRestoreBackupFile = async"), workspace.indexOf("const handleConfirmRestore = async"));
  assert.match(preview, /parseBackup\(content\)/);
  assert.match(preview, /callRestoreRoute\("preview", content\)/);
  assert.match(preview, /setRestorePlan\(data\.plan\)/);
  // A prévia não escreve: ela só classifica.
  for (const proibido of ["\"apply\"", "persistArquitetoArtifact", "persistInternalLinkGraph"]) {
    assert.equal(preview.includes(proibido), false, `a prévia não pode conter ${proibido}`);
  }
  // O apply reenvia o MESMO arquivo classificado, e só depois do clique.
  const confirm = workspace.slice(workspace.indexOf("const handleConfirmRestore = async"), workspace.indexOf("// O ref é sincronizado FORA do render"));
  assert.match(confirm, /if \(!restoreSource \|\| !restorePlan\?\.executable\) return;/);
  assert.match(confirm, /callRestoreRoute\("apply", restoreSource\.content\)/);
  assert.match(confirm, /setRestoreReport\(report\)/);

  const dialogo = workspace.slice(workspace.indexOf("data-arquiteto-restore-preview"), workspace.indexOf("</div>\n        </div>\n      )}", workspace.indexOf("data-arquiteto-restore-preview")));
  assert.match(dialogo, /Prévia da restauração/);
  assert.match(dialogo, /handleConfirmRestore\(\)/);
  assert.match(dialogo, /disabled=\{!restorePlan\.executable \|\| backupRestoreBusy\}/);
  // As cinco classificações aparecem na tela, não só no relatório.
  for (const outcome of ["CONFLICT", "BLOCKED", "NO_OP", "REMAP"]) {
    assert.equal(dialogo.includes(outcome), true, `a prévia precisa distinguir ${outcome}`);
  }
});

test("a rota de restauração é a fronteira do formato e separa preview de apply", () => {
  const rota = readFileSync(new URL("../app/api/arquiteto/backup/restore/route.ts", import.meta.url), "utf8");
  assert.match(rota, /mode: z\.enum\(\["preview", "apply"\]\)/);
  assert.match(rota, /parseBackup\(parsed\.backup\)/);
  // Só o apply pede permissão de edição.
  assert.match(rota, /action: parsed\.mode === "apply" \? "edit" : "view"/);
  assert.match(rota, /planArquitetoRestore\(context, file, options\)/);
  assert.match(rota, /applyArquitetoRestore\(context, file, options\)/);
  // Trocar de Brand é decisão explícita, e o default nunca a concede.
  assert.match(rota, /allowCrossBrand: z\.boolean\(\)\.optional\(\)/);
  assert.match(rota, /allowCrossBrand: parsed\.allowCrossBrand === true/);
});

/* ==================== EDITORIAL_EXPORT_V1 · keywords-dna ================= */

function inputComReforco(base: ArquitetoExportInput): ArquitetoExportInput {
  // Um artigo com Principal, secundária e reforço, cada um com DNA PRÓPRIO.
  const article = JSON.parse(JSON.stringify(base.articles[0])) as VersionEnvelope<ArticleDNA>;
  const reforco = keywordReference("article-a-kw-3", "reforco_narrativo", "pele oleosa e acne", { volume: 40, results: 8, kgr: 0.2 });
  const comDna = reforco as unknown as Record<string, unknown>;
  const snapshot = (comDna.keywordDnaSnapshot as Record<string, unknown>).payload as Record<string, unknown>;
  snapshot.centralEntity = "acne";
  snapshot.audience = "Adolescentes com acne";
  snapshot.perceivedProblem = "Cravos e inflamação";
  snapshot.awarenessLevel = "consciente da solução";
  snapshot.likelyEditorialType = "problem_solution";
  snapshot.searchIntent = "commercial_investigation";
  (comDna.keywordDnaSnapshot as Record<string, unknown>).sourceKeywordSnapshot = {
    keyword: "pele oleosa e acne",
    analise_semantica: { kgr_aplicabilidade: "not_applicable", kgr_decisao_origem: "human" },
  };
  comDna.overlapRisk = "high";
  comDna.requiredTopics = ["ácido salicílico"];
  article.payload.narrativeReinforcementIds = ["article-a-kw-3"];
  article.payload.keywordReferences = [...article.payload.keywordReferences, reforco];
  return { ...base, articles: [article, base.articles[1]] };
}

test("KEYWORD_DNA_ROWS = TOTAL_ARTICLE_MEMBER_KEYWORDS e os três papéis saem do ArticleDNA", async () => {
  const input = inputComReforco(await baseInput());
  const artifact = buildArquitetoKeywordDnaExport(input);
  const rows = parseCsv(artifact.content);
  assert.deepEqual(rows[0], [...EDITORIAL_KEYWORD_DNA_HEADER]);

  const totalMembros = input.articles.reduce((total, version) => total + version.payload.keywordReferences.length, 0);
  assert.equal(rows.length - 1, totalMembros);
  assert.equal(artifact.rowCount, totalMembros);

  const header: string[] = rows[0];
  const papel = (keyword: string) => rows.slice(1).find(row => row[header.indexOf("Keyword")] === keyword)?.[header.indexOf("Papel da keyword")];
  assert.equal(papel("skincare para pele oleosa"), "PRINCIPAL");
  assert.equal(papel("skincare para pele oleosa passo a passo"), "SECUNDÁRIA");
  assert.equal(papel("pele oleosa e acne"), "REFORÇO");
  // O papel do ARTIGO vem do SiloDNA, não do campo `hierarchy`.
  assert.equal(rows[1][header.indexOf("Papel do artigo")], "PILAR");
  assert.equal(rows[1][header.indexOf("Silo")], "Skincare");
  assert.equal(rows[1][header.indexOf("Artigo")], "skincare para pele oleosa");
});

test("MEMBER_DNA_IS_NOT_COPIED_FROM_PRINCIPAL · o reforço traz o DNA dele", async () => {
  const input = inputComReforco(await baseInput());
  const rows = parseCsv(buildArquitetoKeywordDnaExport(input).content);
  const header: string[] = rows[0];
  const linha = (keyword: string) => rows.slice(1).find(row => row[header.indexOf("Keyword")] === keyword)!;
  const campo = (keyword: string, coluna: string) => linha(keyword)[header.indexOf(coluna)];

  assert.equal(campo("skincare para pele oleosa", "Entidade central"), "skincare");
  assert.equal(campo("pele oleosa e acne", "Entidade central"), "acne");
  assert.notEqual(campo("pele oleosa e acne", "Público"), campo("skincare para pele oleosa", "Público"));
  assert.equal(campo("pele oleosa e acne", "Público"), "Adolescentes com acne");
  assert.equal(campo("pele oleosa e acne", "Problema percebido"), "Cravos e inflamação");
  assert.equal(campo("pele oleosa e acne", "Nível de consciência"), "consciente da solução");
  assert.equal(campo("pele oleosa e acne", "Tipo editorial"), "Problema e solução");
  assert.equal(campo("pele oleosa e acne", "Intenção principal"), "Comercial investigativa");
  assert.equal(campo("pele oleosa e acne", "Risco de canibalização"), "Alto");
  assert.equal(campo("pele oleosa e acne", "Cobertura/conceitos"), "ácido salicílico");
  // Métricas próprias, não as da Principal.
  assert.equal(campo("pele oleosa e acne", "Volume"), "40");
  assert.equal(campo("skincare para pele oleosa", "Volume"), "2400");
  // A aplicabilidade do KGR é a decisão do Minerador daquela keyword.
  assert.equal(campo("pele oleosa e acne", "Aplicabilidade KGR"), "Não aplicável");
});

test("ausência vira A confirmar e nenhum identificador interno é exportado", async () => {
  const base = await baseInput();
  const semDna = JSON.parse(JSON.stringify(base.articles[0])) as VersionEnvelope<ArticleDNA>;
  for (const reference of semDna.payload.keywordReferences) {
    delete (reference as unknown as Record<string, unknown>).keywordDnaSnapshot;
  }
  const artifact = buildArquitetoKeywordDnaExport({ ...base, articles: [semDna] });
  const rows = parseCsv(artifact.content);
  const header: string[] = rows[0];
  assert.equal(rows[1][header.indexOf("Entidade central")], A_CONFIRMAR);
  assert.equal(rows[1][header.indexOf("Público")], A_CONFIRMAR);
  assert.equal(rows[1][header.indexOf("Aplicabilidade KGR")], A_CONFIRMAR);
  assert.match(artifact.summary, /sem KeywordDNA congelado/);

  const completo = buildArquitetoKeywordDnaExport(inputComReforco(base));
  for (const proibido of EDITORIAL_EXPORT_FORBIDDEN_FIELDS) {
    assert.equal(completo.content.includes(proibido), false, `o CSV de KeywordDNA não pode conter ${proibido}`);
  }
  for (const vazamento of [BRAND, sha("c"), "article-a-v1", "article-a-kw-1", "silo-page:silo-1", "legacy:"]) {
    assert.equal(completo.content.includes(vazamento), false, `o CSV de KeywordDNA não pode vazar ${vazamento}`);
  }
  assert.equal(completo.content.includes("[object Object]"), false);
});

test("o arquivo de artigos continua com os agregados e uma linha por ArticleDNA", async () => {
  const input = inputComReforco(await baseInput());
  const artigos = buildArquitetoEditorialExport(input);
  const rows = parseCsv(artigos.content);
  assert.equal(rows.length - 1, input.articles.length);
  const header: string[] = rows[0];
  assert.equal(rows[1][header.indexOf("Secundárias")], "skincare para pele oleosa passo a passo");
  assert.equal(rows[1][header.indexOf("Reforços")], "pele oleosa e acne");
});

test("o menu Produção oferece os dois arquivos juntos e cada um separado", () => {
  const workspace = readFileSync(new URL("../modules/arquiteto/arquiteto-workspace.tsx", import.meta.url), "utf8");
  const menu = workspace.slice(workspace.indexOf("data-arquiteto-export-menu"), workspace.indexOf("Contador da MESA"));
  assert.match(menu, /exportProduction\(\)/);
  assert.match(menu, /exportArticles\(\)/);
  assert.match(menu, /exportKeywordDna\(\)/);
  assert.match(menu, /KeywordDNA dos artigos/);
  const handler = workspace.slice(workspace.indexOf("const runArquitetoExport = async"), workspace.indexOf("RESTAURAR BACKUP"));
  // Produção baixa os dois de uma vez; o backup segue por outro caminho.
  assert.match(handler, /buildArquitetoEditorialExport\(input\), buildArquitetoKeywordDnaExport\(input\)/);
  assert.match(handler, /buildArquitetoBackup\(input\)/);
});
