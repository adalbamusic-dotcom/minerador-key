import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  ArchitectureScenarioSchema,
  SCENARIO_TYPES,
  buildScenarioUniverse,
  deriveArchitectureScenarioDiff,
  normalizeArchitectureScenario,
  validateArchitectureScenario,
  type ArchitectureScenario,
  type ArticleArchitectureScenario,
  type ArticleScenario,
  type ScenarioIssueCode,
  type ScenarioStructuralRole,
} from "../lib/arquiteto/architecture-scenario.ts";
import { MAX_KEYWORDS_PER_ARTICLE } from "../lib/arquiteto/domain-rules.ts";

const BRAND = "brand-1";

const article = (
  articleRef: string,
  keywords: Array<[string, ScenarioStructuralRole]>,
  overrides: Partial<ArticleScenario> = {},
): ArticleScenario => ({
  articleRef,
  publishedAnchorId: null,
  principalKeywordId: keywords.find(([, role]) => role === "principal")?.[0] || keywords[0][0],
  keywords: keywords.map(([keywordId, role]) => ({ keywordId, role })),
  protections: { principalPolicy: null, publishedUrl: null },
  ...overrides,
});

async function scenario(input: {
  scenarioType?: ArchitectureScenario["scenarioType"];
  capability?: ArchitectureScenario["capability"];
  articles: ArticleScenario[];
  ungroupedKeywordIds?: string[];
  universeKeywordIds?: string[];
  brandId?: string;
  sourceRefs?: ArchitectureScenario["sourceRefs"];
}): Promise<ArticleArchitectureScenario> {
  const grouped = input.articles.flatMap(item => item.keywords.map(keyword => keyword.keywordId));
  const ungroupedKeywordIds = input.ungroupedKeywordIds || [];
  return {
    schemaVersion: 1,
    // `level` passou a ser obrigatório no domínio (SDD Silo-first, emenda C1).
    level: "article",
    scenarioId: `scenario-${input.scenarioType || "logic"}`,
    brandId: input.brandId || BRAND,
    scenarioType: input.scenarioType || "logic",
    capability: input.capability || "complete",
    universe: await buildScenarioUniverse(input.universeKeywordIds || [...grouped, ...ungroupedKeywordIds]),
    baseRef: null,
    sourceRefs: input.sourceRefs || [{ sourceType: "engine", entityId: BRAND }],
    articles: input.articles,
    ungroupedKeywordIds,
    provenance: { producedBy: "engine", adoptedFromScenarioType: null, humanAdjustmentCount: 0, note: null },
  };
}

const codes = (issues: Array<{ code: ScenarioIssueCode }>) => issues.map(issue => issue.code);
const types = (entries: Array<{ type: string }>) => entries.map(entry => entry.type).sort();

/* ------------------------------- contrato ------------------------------- */

test("A · partição completa com cada keyword exatamente uma vez é válida", async () => {
  const base = await scenario({
    articles: [
      article("art-a", [["kw-1", "principal"], ["kw-2", "secundaria"]]),
      article("art-b", [["kw-3", "principal"]]),
    ],
    ungroupedKeywordIds: ["kw-4"],
  });

  assert.equal(ArchitectureScenarioSchema.safeParse(base).success, true);
  const validation = validateArchitectureScenario(base, { brandId: BRAND, expectedUniverse: base.universe });
  assert.deepEqual(validation, { valid: true, issues: [] });
});

test("B · keyword em dois Articles é inválida", async () => {
  const invalid = await scenario({
    articles: [
      article("art-a", [["kw-1", "principal"], ["kw-2", "secundaria"]]),
      article("art-b", [["kw-2", "principal"]]),
    ],
  });

  assert.ok(codes(validateArchitectureScenario(invalid).issues).includes("DUPLICATE_KEYWORD"));
});

test("C · keyword agrupada e não agrupada ao mesmo tempo é inválida", async () => {
  const invalid = await scenario({
    articles: [article("art-a", [["kw-1", "principal"], ["kw-2", "secundaria"]])],
    ungroupedKeywordIds: ["kw-2"],
  });

  assert.ok(codes(validateArchitectureScenario(invalid).issues).includes("KEYWORD_BOTH_GROUPED_AND_UNGROUPED"));
});

test("D · keyword do universo ausente em cenário complete é inválida", async () => {
  const invalid = await scenario({
    articles: [article("art-a", [["kw-1", "principal"]])],
    universeKeywordIds: ["kw-1", "kw-2"],
  });

  assert.ok(codes(validateArchitectureScenario(invalid).issues).includes("KEYWORD_MISSING_FROM_COMPLETE_SCENARIO"));
});

test("E/F/G · Principal ausente, duplicada ou fora do Article é inválida", async () => {
  const semPrincipal = await scenario({ articles: [article("art-a", [["kw-1", "secundaria"]])] });
  assert.ok(codes(validateArchitectureScenario(semPrincipal).issues).includes("ARTICLE_WITHOUT_PRINCIPAL"));

  const duasPrincipais = await scenario({ articles: [article("art-a", [["kw-1", "principal"], ["kw-2", "principal"]])] });
  assert.ok(codes(validateArchitectureScenario(duasPrincipais).issues).includes("MULTIPLE_PRINCIPALS"));

  const foraDoArtigo = await scenario({
    articles: [article("art-a", [["kw-1", "principal"]], { principalKeywordId: "kw-99" })],
  });
  assert.ok(codes(validateArchitectureScenario(foraDoArtigo).issues).includes("PRINCIPAL_NOT_MEMBER"));
});

test("H · Article acima do teto de keywords é inválido", async () => {
  const excedente = Array.from({ length: MAX_KEYWORDS_PER_ARTICLE + 1 }, (_, index) =>
    [`kw-${index}`, index === 0 ? "principal" : "secundaria"] as [string, ScenarioStructuralRole]);
  const invalid = await scenario({ articles: [article("art-a", excedente)] });

  assert.ok(codes(validateArchitectureScenario(invalid).issues).includes("ARTICLE_OVER_KEYWORD_LIMIT"));
});

test("articleRef duplicado e cross-brand são inválidos", async () => {
  const duplicado = await scenario({
    articles: [article("art-a", [["kw-1", "principal"]]), article("art-a", [["kw-2", "principal"]])],
  });
  assert.ok(codes(validateArchitectureScenario(duplicado).issues).includes("DUPLICATE_ARTICLE_KEY"));

  const outraBrand = await scenario({ articles: [article("art-a", [["kw-1", "principal"]])], brandId: "brand-2" });
  assert.ok(codes(validateArchitectureScenario(outraBrand, { brandId: BRAND }).issues).includes("CROSS_BRAND"));
});

test("I · o hash do universo muda quando o conjunto de keywords muda", async () => {
  const tres = await buildScenarioUniverse(["kw-1", "kw-2", "kw-3"]);
  const quatro = await buildScenarioUniverse(["kw-1", "kw-2", "kw-3", "kw-4"]);
  const reordenado = await buildScenarioUniverse(["kw-3", "kw-1", "kw-2"]);
  const duplicado = await buildScenarioUniverse(["kw-1", "kw-1", "kw-2", "kw-3"]);

  assert.notEqual(tres.contentHash, quatro.contentHash);
  assert.equal(tres.contentHash, reordenado.contentHash, "ordem de entrada não muda o hash");
  assert.equal(tres.contentHash, duplicado.contentHash, "duplicata não muda o hash");
  assert.deepEqual(tres.keywordIds, ["kw-1", "kw-2", "kw-3"]);
});

test("J · normalização é determinística e não conserta arquitetura inválida", async () => {
  const bagunçado = await scenario({
    articles: [
      article("art-b", [["kw-9", "principal"], ["kw-3", "secundaria"]]),
      article("art-a", [["kw-3", "principal"]]),
    ],
    ungroupedKeywordIds: ["kw-7", "kw-2", "kw-7"],
  });

  const primeira = normalizeArchitectureScenario(bagunçado);
  const segunda = normalizeArchitectureScenario(primeira);

  assert.deepEqual(primeira, segunda, "normalizar duas vezes dá o mesmo resultado");
  assert.deepEqual(primeira.articles.map(item => item.articleRef), ["art-a", "art-b"]);
  assert.deepEqual(primeira.articles[1].keywords.map(item => item.keywordId), ["kw-3", "kw-9"]);
  assert.deepEqual(primeira.ungroupedKeywordIds, ["kw-2", "kw-7"]);
  // kw-3 continua em dois Articles: normalizar não transforma erro em sucesso.
  assert.ok(codes(validateArchitectureScenario(primeira).issues).includes("DUPLICATE_KEYWORD"));
});

test("V · cenário partial declara ausência sem inventar keyword", async () => {
  const parcial = await scenario({
    capability: "partial",
    scenarioType: "serp",
    articles: [article("art-a", [["kw-1", "principal"]])],
    universeKeywordIds: ["kw-1", "kw-2", "kw-3"],
  });

  const validation = validateArchitectureScenario(parcial, { brandId: BRAND });

  assert.equal(validation.valid, true, "partial não exige partição completa");
  assert.equal(parcial.articles.flatMap(item => item.keywords).length, 1);
  assert.equal(parcial.ungroupedKeywordIds.length, 0, "ausência continua ausência explícita");
  // Mas o que está declarado continua tendo de ser consistente.
  const parcialInconsistente = { ...parcial, articles: [article("art-a", [["kw-1", "principal"], ["kw-1", "secundaria"]])] };
  assert.ok(codes(validateArchitectureScenario(parcialInconsistente).issues).includes("DUPLICATE_KEYWORD"));
});

test("W · proveniência suporta múltiplas fontes", async () => {
  const serp = await scenario({
    scenarioType: "serp",
    articles: [article("art-a", [["kw-1", "principal"]])],
    sourceRefs: [
      { sourceType: "serp_assessment", entityId: "art-a", versionId: "serp-a:v2", versionNumber: 2, contentHash: `sha256:${"a".repeat(64)}` },
      { sourceType: "serp_assessment", entityId: "art-b", versionId: "serp-b:v1", versionNumber: 1, contentHash: `sha256:${"b".repeat(64)}` },
    ],
  });

  assert.equal(ArchitectureScenarioSchema.safeParse(serp).success, true);
  assert.equal(serp.sourceRefs.length, 2);
  assert.deepEqual(normalizeArchitectureScenario(serp).sourceRefs.map(ref => ref.entityId), ["art-a", "art-b"]);
});

/* --------------------------------- diff --------------------------------- */

const twoArticles = () => [
  article("art-a", [["kw-1", "principal"], ["kw-2", "secundaria"], ["kw-3", "secundaria"]]),
  article("art-b", [["kw-4", "principal"]]),
];

test("K · cenários idênticos não produzem diff", async () => {
  const reference = await scenario({ articles: twoArticles() });
  const candidate = await scenario({ articles: twoArticles() });

  const diff = deriveArchitectureScenarioDiff(reference, candidate);

  assert.equal(diff.comparable, true);
  assert.deepEqual(diff.entries, []);
  assert.equal(Object.values(diff.summary).reduce((total, value) => total + value, 0), 0);
});

test("L/M/N · movimento, desagrupamento e agrupamento de keyword", async () => {
  const reference = await scenario({ articles: twoArticles(), ungroupedKeywordIds: ["kw-5"] });
  const candidate = await scenario({
    articles: [
      article("art-a", [["kw-1", "principal"], ["kw-3", "secundaria"], ["kw-5", "secundaria"]]),
      article("art-b", [["kw-4", "principal"], ["kw-2", "secundaria"]]),
    ],
  });

  const diff = deriveArchitectureScenarioDiff(reference, candidate);

  const movida = diff.entries.find(entry => entry.type === "KEYWORD_MOVED");
  assert.equal(movida?.keywordId, "kw-2");
  assert.equal(movida?.fromArticleRef, "art-a");
  assert.equal(movida?.toArticleRef, "art-b");
  const agrupada = diff.entries.find(entry => entry.type === "KEYWORD_GROUPED");
  assert.equal(agrupada?.keywordId, "kw-5");
  assert.equal(agrupada?.toArticleRef, "art-a");
  assert.equal(diff.summary.keywordMovedCount, 1);
  assert.equal(diff.summary.keywordGroupedCount, 1);

  const desagrupada = deriveArchitectureScenarioDiff(reference, await scenario({
    articles: [article("art-a", [["kw-1", "principal"], ["kw-3", "secundaria"]]), article("art-b", [["kw-4", "principal"]])],
    ungroupedKeywordIds: ["kw-2", "kw-5"],
  }));
  const solta = desagrupada.entries.find(entry => entry.type === "KEYWORD_UNGROUPED");
  assert.equal(solta?.keywordId, "kw-2");
  assert.equal(solta?.toArticleRef, null);
  assert.equal(desagrupada.summary.keywordUngroupedCount, 1);
});

test("O/P · troca de Principal não vira ROLE_CHANGED duplicado", async () => {
  const reference = await scenario({ articles: twoArticles() });
  const candidate = await scenario({
    articles: [
      article("art-a", [["kw-1", "secundaria"], ["kw-2", "principal"], ["kw-3", "reforco_narrativo"]], { principalKeywordId: "kw-2" }),
      article("art-b", [["kw-4", "principal"]]),
    ],
  });

  const diff = deriveArchitectureScenarioDiff(reference, candidate);

  const principal = diff.entries.find(entry => entry.type === "PRINCIPAL_CHANGED");
  assert.equal(principal?.fromKeywordId, "kw-1");
  assert.equal(principal?.toKeywordId, "kw-2");
  assert.equal(diff.summary.principalChangedCount, 1);
  // kw-1 e kw-2 são as duas pontas da troca: não contam de novo como papel.
  const papeis = diff.entries.filter(entry => entry.type === "ROLE_CHANGED");
  assert.deepEqual(papeis.map(entry => entry.keywordId), ["kw-3"]);
  assert.equal(papeis[0].fromRole, "secundaria");
  assert.equal(papeis[0].toRole, "reforco_narrativo");
  assert.equal(diff.summary.roleChangedCount, 1);
});

test("Q/R · Article criado e removido", async () => {
  const reference = await scenario({ articles: twoArticles() });
  const candidate = await scenario({
    articles: [
      article("art-a", [["kw-1", "principal"], ["kw-2", "secundaria"], ["kw-3", "secundaria"]]),
      article("art-novo", [["kw-4", "principal"]]),
    ],
  });

  const diff = deriveArchitectureScenarioDiff(reference, candidate);

  assert.ok(types(diff.entries).includes("ARTICLE_CREATED"));
  assert.ok(types(diff.entries).includes("ARTICLE_REMOVED"));
  assert.equal(diff.summary.articleCreatedCount, 1);
  assert.equal(diff.summary.articleRemovedCount, 1);
  assert.equal(diff.entries.find(entry => entry.type === "ARTICLE_CREATED")?.articleRef, "art-novo");
  assert.equal(diff.entries.find(entry => entry.type === "ARTICLE_REMOVED")?.articleRef, "art-b");
});

test("S · divisão material vira ARTICLE_SPLIT", async () => {
  const reference = await scenario({
    articles: [article("art-a", [["kw-1", "principal"], ["kw-2", "secundaria"], ["kw-3", "secundaria"], ["kw-4", "secundaria"]])],
  });
  const candidate = await scenario({
    articles: [
      article("art-a", [["kw-1", "principal"], ["kw-2", "secundaria"]]),
      article("art-novo", [["kw-3", "principal"], ["kw-4", "secundaria"]]),
    ],
  });

  const diff = deriveArchitectureScenarioDiff(reference, candidate);

  const split = diff.entries.find(entry => entry.type === "ARTICLE_SPLIT");
  assert.equal(split?.articleRef, "art-a");
  assert.deepEqual(split?.relatedArticleRefs, ["art-a", "art-novo"]);
  assert.equal(diff.summary.splitCount, 1);
});

test("T · junção material vira ARTICLE_MERGED", async () => {
  const reference = await scenario({
    articles: [
      article("art-a", [["kw-1", "principal"], ["kw-2", "secundaria"]]),
      article("art-b", [["kw-3", "principal"], ["kw-4", "secundaria"]]),
    ],
  });
  const candidate = await scenario({
    articles: [article("art-a", [["kw-1", "principal"], ["kw-2", "secundaria"], ["kw-3", "secundaria"], ["kw-4", "secundaria"]])],
  });

  const diff = deriveArchitectureScenarioDiff(reference, candidate);

  const merge = diff.entries.find(entry => entry.type === "ARTICLE_MERGED");
  assert.equal(merge?.articleRef, "art-a");
  assert.deepEqual(merge?.relatedArticleRefs, ["art-a", "art-b"]);
  assert.equal(diff.summary.mergeCount, 1);
});

test("U · movimento de uma keyword não vira split nem merge", async () => {
  const reference = await scenario({ articles: twoArticles() });
  const candidate = await scenario({
    articles: [
      article("art-a", [["kw-1", "principal"], ["kw-3", "secundaria"]]),
      article("art-b", [["kw-4", "principal"], ["kw-2", "secundaria"]]),
    ],
  });

  const diff = deriveArchitectureScenarioDiff(reference, candidate);

  assert.equal(diff.summary.keywordMovedCount, 1);
  assert.equal(diff.summary.splitCount, 0, "uma keyword saindo é MOVE, nunca SPLIT");
  assert.equal(diff.summary.mergeCount, 0, "uma keyword chegando é MOVE, nunca MERGE");
});

test("universos diferentes não são comparáveis", async () => {
  const reference = await scenario({ articles: [article("art-a", [["kw-1", "principal"], ["kw-2", "secundaria"], ["kw-3", "secundaria"]])] });
  const candidate = await scenario({
    articles: [article("art-a", [["kw-1", "principal"], ["kw-2", "secundaria"], ["kw-3", "secundaria"], ["kw-4", "secundaria"]])],
  });

  const diff = deriveArchitectureScenarioDiff(reference, candidate);

  assert.equal(diff.universeMatch, false);
  assert.equal(diff.comparable, false);
  assert.deepEqual(diff.entries, [], "sem universo comum não existe diff silencioso");
  // O validador também recusa a comparação explicitamente.
  assert.ok(codes(validateArchitectureScenario(candidate, { expectedUniverse: reference.universe }).issues)
    .includes("UNIVERSE_HASH_MISMATCH"));
});

/* -------------------------- limites desta fase -------------------------- */

test("current existe no read-model, mas esta fase não cria storage de CURRENT", () => {
  assert.ok(SCENARIO_TYPES.includes("current"));

  const modulo = readFileSync("lib/arquiteto/architecture-scenario.ts", "utf8");
  // Nenhum artifact_type, persistência ou chamada de provider nesta fase.
  assert.doesNotMatch(modulo, /artifact_type|ARTIFACT_TYPE|persistArquiteto|current_architecture_scenario/);
  assert.doesNotMatch(modulo, /fetch\(|supabase|migration/i);
  const migrations = readFileSync("supabase/migrations/20260829120000_article_architecture_ai_review_artifact.sql", "utf8");
  assert.doesNotMatch(migrations, /current_architecture_scenario|serp_architecture_scenario/);
});
