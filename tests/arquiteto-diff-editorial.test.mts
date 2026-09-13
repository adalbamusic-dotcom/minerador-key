import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { ArticleDNA } from "../lib/arquiteto/contracts.ts";
import { EDITORIAL_DECISION_FIELDS, articleEditorialDiff } from "../lib/arquiteto/article-editorial-diff.ts";

/**
 * SUCESSORA SÓ NASCE DE DECISÃO EDITORIAL.
 *
 * `skin care principia` foi de v10 a v17 sem nenhuma diferença editorial: só
 * `confirmedAt` novo a cada clique. E cada proposta redundante ainda escondia
 * a versão aprovada na tela.
 */

const artigo = (overrides: Partial<ArticleDNA> = {}): ArticleDNA => ({
  schemaVersion: 1,
  articleId: "article-formation:1",
  brandId: "brand-1",
  principalKeywordId: "kw-a",
  secondaryKeywordIds: ["kw-b"],
  narrativeReinforcementIds: [],
  keywordReferences: [
    { keywordId: "kw-a", role: "principal" },
    { keywordId: "kw-b", role: "secundaria" },
  ],
  territoryRef: "territory:1",
  siloId: "working-silo:2",
  suggestedSlug: "principia",
  canonical: null,
  architectureStatus: "architecture_confirmed",
  primaryKeywordPolicy: "locked",
  classification: { intent: "TRANSACTIONAL", funnel: "TOP" },
  unitClassification: { type: "article", status: "human_confirmed", source: "manual", confirmedAt: "2026-09-07T22:45:42.344Z", confirmedBy: "user-1" },
  unitPurpose: { unitType: "article" },
  serpAssessmentRef: { entityId: "serp:1", versionId: "serp:1:base", contentHash: "sha256:serp" },
  kgrIdentity: { isKgrArticle: true, bindingStatus: "confirmed", boundSlug: "principia", confirmedAt: "2026-09-07T22:45:42.344Z", confirmedBy: "user-1" },
  publishedIdentityRef: undefined,
  alerts: ["Arquitetura confirmada por decisão humana; identidade publicada preservada."],
  humanPendingDecisions: [],
  ...overrides,
} as unknown as ArticleDNA);

/* ===================== o no-op é reconhecido como tal =================== */

test("só o carimbo mudou: NÃO é revisão", () => {
  const canonical = artigo();
  const candidate = artigo({
    unitClassification: { type: "article", status: "human_confirmed", source: "manual", confirmedAt: "2026-09-07T23:57:11.800Z", confirmedBy: "user-1" },
    kgrIdentity: { isKgrArticle: true, bindingStatus: "confirmed", boundSlug: "principia", confirmedAt: "2026-09-07T23:57:11.800Z", confirmedBy: "user-1" },
  } as unknown as Partial<ArticleDNA>);

  const diff = articleEditorialDiff({ canonical, candidate });
  assert.equal(diff.substantive, false);
  assert.deepEqual(diff.changedFields, []);
  assert.equal(diff.reason, "O ArticleDNA aprovado já representa esta formação. Nenhuma nova versão foi necessária.");
});

test("alerta acrescentado a cada confirmação não conta como decisão", () => {
  const diff = articleEditorialDiff({
    canonical: artigo(),
    candidate: artigo({ alerts: ["Arquitetura confirmada por decisão humana; identidade publicada preservada.", "Arquitetura confirmada por decisão humana; identidade publicada preservada."] }),
  });
  assert.equal(diff.substantive, false, "`alerts` é registro do processo, não decisão");
});

/* ======================= revisão real vira sucessora ==================== */

const revisoes: Array<[string, Partial<ArticleDNA>]> = [
  ["principalKeywordId", { principalKeywordId: "kw-b" }],
  ["secondaryKeywordIds", { secondaryKeywordIds: ["kw-b", "kw-c"] }],
  ["siloId", { siloId: "working-silo:9" }],
  ["territoryRef", { territoryRef: "territory:9" }],
  ["suggestedSlug", { suggestedSlug: "outro-slug" }],
  ["classification", { classification: { intent: "INFORMATIONAL", funnel: "TOP" } } as unknown as Partial<ArticleDNA>],
  ["serpAssessmentRef", { serpAssessmentRef: { entityId: "serp:2", versionId: "serp:2:base", contentHash: "sha256:outro" } } as unknown as Partial<ArticleDNA>],
  ["unitClassification", { unitClassification: { type: "landing_page", status: "human_confirmed", source: "manual" } } as unknown as Partial<ArticleDNA>],
  ["publishedIdentityRef", { publishedIdentityRef: { publishedUrl: "https://exemplo.com/x" } } as unknown as Partial<ArticleDNA>],
];

for (const [campo, mudanca] of revisoes) {
  test(`mudar ${campo} é revisão real`, () => {
    const diff = articleEditorialDiff({ canonical: artigo(), candidate: artigo(mudanca) });
    assert.equal(diff.substantive, true);
    assert.ok(diff.changedFields.includes(campo), `${campo} precisa aparecer entre os campos alterados`);
    assert.match(diff.reason, /Revisão real/);
  });
}

test("trocar o PAPEL de uma keyword é revisão real", () => {
  const diff = articleEditorialDiff({
    canonical: artigo(),
    candidate: artigo({
      keywordReferences: [
        { keywordId: "kw-a", role: "principal" },
        { keywordId: "kw-b", role: "reforco_narrativo" },
      ],
    } as unknown as Partial<ArticleDNA>),
  });
  assert.equal(diff.substantive, true);
  assert.ok(diff.changedFields.includes("keywordReferences.role"));
});

test("sem versão aprovada anterior, a primeira é sempre substantiva", () => {
  const diff = articleEditorialDiff({ canonical: null, candidate: artigo() });
  assert.equal(diff.substantive, true);
  assert.match(diff.reason, /Primeira versão aprovada/);
});

test("a lista de decisões cobre os fatos que o Planejador nomeou", () => {
  for (const campo of ["principalKeywordId", "secondaryKeywordIds", "narrativeReinforcementIds", "siloId",
    "classification", "serpAssessmentRef", "suggestedSlug", "primaryKeywordPolicy", "publishedIdentityRef"]) {
    assert.ok((EDITORIAL_DECISION_FIELDS as readonly string[]).includes(campo), `falta ${campo} na lista de decisões`);
  }
});

/* ============== a conclusão consulta o diff ANTES de gravar ============= */

test("Concluir formação não cria sucessora sem diff editorial", () => {
  const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
  const materializacao = workspace.slice(workspace.indexOf("const materializeApprovedArticleDnas"));
  const corpo = materializacao.slice(0, materializacao.indexOf("const confirmArticleFormation"));

  assert.match(corpo, /const diffEditorial = articleEditorialDiff\(\{ canonical: canonicaAprovada\?\.payload \?\? null, candidate: payload \}\)/);
  assert.match(corpo, /if \(!diffEditorial\.substantive\) \{/);
  // A comparação é contra a CANÔNICA aprovada, não contra a última gravada.
  assert.match(corpo, /articleVersionAuthorities\.get\(articleId\)\?\.canonical/);
  // E ela roda ANTES da escrita.
  assert.ok(
    corpo.indexOf("articleEditorialDiff") < corpo.indexOf("await persistArquitetoArtifact"),
    "comparar depois de gravar não impediria a versão à toa",
  );
  // O no-op é resultado, não silêncio.
  assert.match(corpo, /semDiff\.push\(\{ articleId, reason: diffEditorial\.reason \}\)/);
  assert.match(corpo, /já representados pelo ArticleDNA aprovado/);
});

test("a auditoria e a mesa usam a MESMA autoridade de diff", () => {
  const script = readFileSync("scripts/arquiteto-audit-version-diff.mts", "utf8");
  assert.match(script, /import \{ articleEditorialDiff \} from "\.\.\/lib\/arquiteto\/article-editorial-diff\.ts"/);
  assert.match(script, /CONCLUIR_FORMACAO_CRIARIA_SUCESSORA/);
});
