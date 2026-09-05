import assert from "node:assert/strict";
import test from "node:test";
import { buildSiloScopedProvisionalGroups } from "../lib/arquiteto/article-formation-scope.ts";
import { buildArticleFormationUniverse, type ArticleFormationKeyword } from "../lib/arquiteto/article-formation.ts";

const SILO = "territory:11111111-1111-4111-8111-111111111111";

const SKINCARE = [
  "skin care pele oleosa", "skin care para peles oleosas", "skin care rosto",
  "creme skin care", "cremes skin care", "skin care neutrogena",
  "skin care loreal", "skin care principia", "skin care caseiro",
  "mantecorp skin care", "skin care mascara", "skin care barato",
  "natura skin care", "skin care coreano", "skin care sephora",
];

/**
 * A leitura precisa descrever EXATAMENTE o que o formador decidiu.
 *
 * Um candidato a mais ou a menos entre o engine e a view significa que existe
 * uma segunda autoridade escondida — foi assim que a fase quebrou antes.
 */
test("o número de candidatos é igual ao número de grupos do formador", () => {
  const antigas = SKINCARE.map((keyword, index) => ({
    id: `k${index}`, keyword, intent: "informacional", volume_search: 100,
    lista_id: "silo", silo_id: "silo", isPublished: false, status: "novo",
  })) as never[];

  const escopo = buildSiloScopedProvisionalGroups({
    silos: [{ siloRef: SILO, siloLabel: "Skin care para peles oleosas", siloSlug: "/skin-care-para-peles-oleosas" }],
    keywordsBySiloRef: new Map([[SILO, antigas]]),
  });
  const grupos = escopo[0].groups;

  const keywords: ArticleFormationKeyword[] = SKINCARE.map((keyword, index) => ({
    keywordId: `k${index}`, keyword, intent: "informacional",
    volume: 100, kgr: null, entity: null, problem: null, isPublished: false,
  }));

  const universo = buildArticleFormationUniverse({
    siloRef: SILO,
    siloLabel: "Skin care para peles oleosas",
    siloSlug: "/skin-care-para-peles-oleosas",
    groups: grupos.map(group => ({
      principalKeywordId: String(group.principalSuggestion.keywordId),
      keywordIds: group.keywords.map((keyword: { id: string }) => String(keyword.id)),
    })),
    keywords,
    publishedArticles: [],
  });

  assert.equal(
    universo.candidates.length,
    grupos.length,
    `formador produziu ${grupos.length} grupos e a leitura mostrou ${universo.candidates.length} candidatos`,
  );

  // Nenhum candidato pode nascer vazio: cada um descreve um grupo real.
  for (const candidate of universo.candidates) {
    assert.ok(candidate.keywords.length > 0, "candidato sem keyword não descreve grupo nenhum");
  }

  // E toda keyword formável aparece exatamente uma vez.
  const vistas = universo.candidates.flatMap(candidate => candidate.keywords.map(item => item.keywordId));
  assert.equal(new Set(vistas).size, vistas.length, "keyword repetida em dois candidatos");
  assert.equal(vistas.length + universo.ungroupedKeywordIds.length, SKINCARE.length);
});

test("keyword com decisão humana não reaparece no grupo do formador", () => {
  const keywords: ArticleFormationKeyword[] = [
    // As duas foram revisadas por um humano e formam o artigo dele.
    { keywordId: "k1", keyword: "creme skin care", intent: "informacional", volume: 100, kgr: null, entity: null, problem: null, isPublished: false, humanFormationRef: "article-formation:humano", humanRole: "principal" },
    { keywordId: "k2", keyword: "cremes skin care", intent: "informacional", volume: 100, kgr: null, entity: null, problem: null, isPublished: false, humanFormationRef: "article-formation:humano", humanRole: "secundaria" },
    { keywordId: "k3", keyword: "skin care rosto", intent: "informacional", volume: 100, kgr: null, entity: null, problem: null, isPublished: false },
  ];

  const universo = buildArticleFormationUniverse({
    siloRef: SILO,
    siloLabel: "Skin care",
    siloSlug: "/skin-care",
    // O formador ainda enxerga as três juntas; a revisão humana é mais forte.
    groups: [{ principalKeywordId: "k1", keywordIds: ["k1", "k2", "k3"] }],
    keywords,
    publishedArticles: [],
  });

  const vistas = universo.candidates.flatMap(c => c.keywords.map(item => item.keywordId));
  assert.equal(new Set(vistas).size, vistas.length, "keyword duplicada entre dois artigos");
  assert.equal(vistas.length, 3);

  const humano = universo.candidates.find(c => c.candidateRef === "article-formation:humano")!;
  assert.equal(humano.keywords.length, 2);
  // O que sobrou do grupo do formador continua existindo, sem as revisadas.
  const doFormador = universo.candidates.find(c => c.candidateRef !== "article-formation:humano")!;
  assert.deepEqual(doFormador.keywords.map(i => i.keywordId), ["k3"]);
});
