import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildSiloScopedProvisionalGroups,
  countCrossSiloGroups,
  summarizeScopedGroups,
} from "../lib/arquiteto/article-formation-scope.ts";
import { buildArticleFormationUniverse, type ArticleFormationKeyword } from "../lib/arquiteto/article-formation.ts";

const SILO_A = "territory:11111111-1111-4111-8111-111111111111";
const SILO_B = "territory:22222222-2222-4222-8222-222222222222";

/** Keyword no formato que o engine canônico consome. */
const antiga = (id: string, keyword: string, siloId: string) => ({
  id, keyword, intent: "informacional", volume_search: 100,
  lista_id: siloId, silo_id: siloId, isPublished: false, status: "novo",
}) as never;

/** As 15 keywords reais do Silo grande de Care Glow. */
const SKINCARE = [
  "skin care pele oleosa", "skin care para peles oleosas", "skin care rosto",
  "creme skin care", "cremes skin care", "skin care neutrogena",
  "skin care loreal", "skin care principia", "skin care caseiro",
  "mantecorp skin care", "skin care mascara", "skin care barato",
  "natura skin care", "skin care coreano", "skin care sephora",
];

/* ------------------- §1 uma única autoridade de formação ----------------- */

test("o formador canônico é quem agrupa — e ele agrupa de verdade", () => {
  const keywords = SKINCARE.map((termo, index) => antiga(`k${index}`, termo, "silo-oleosa"));
  const escopo = buildSiloScopedProvisionalGroups({
    silos: [{ siloRef: SILO_A, siloLabel: "Skin care para peles oleosas", siloSlug: "/skin-care-para-peles-oleosas" }],
    keywordsBySiloRef: new Map([[SILO_A, keywords]]),
  });

  const resumo = summarizeScopedGroups(escopo);
  assert.equal(resumo.keywords, 15);
  // O agrupador que eu havia inventado produzia 13 grupos com 11 singletons.
  assert.ok(resumo.groups < 13, `esperado agrupamento útil, veio ${resumo.groups} grupos`);
  assert.ok(resumo.multiKeyword > 0, "o formador precisa reunir buscas, não só listá-las");
  assert.ok(resumo.singletons < 11);
});

test("o módulo de escopo só particiona e delega: não reimplementa nada", () => {
  const source = readFileSync("lib/arquiteto/article-formation-scope.ts", "utf8")
    .split("\n")
    .filter(line => {
      const trimmed = line.trimStart();
      return !trimmed.startsWith("*") && !trimmed.startsWith("//") && !trimmed.startsWith("/*");
    })
    .join("\n");

  assert.match(source, /buildProvisionalGroups/);
  // Nenhuma comparação, principal, papel ou teto próprios.
  assert.doesNotMatch(source, /affinity|threshold|principalSuggestion =|MAX_ARTICLE_KEYWORDS/);
  assert.doesNotMatch(source, /fetch\(|supabase/);
});

test("a leitura descreve o que o formador decidiu, sem reagrupar", () => {
  const keywords: ArticleFormationKeyword[] = SKINCARE.slice(0, 4).map((termo, index) => ({
    keywordId: `k${index}`, keyword: termo, intent: "informacional",
    volume: 100, kgr: null, entity: null, problem: null, isPublished: false,
  }));

  const universo = buildArticleFormationUniverse({
    siloRef: SILO_A,
    siloLabel: "Skin care para peles oleosas",
    siloSlug: "/skin-care-para-peles-oleosas",
    // O formador diz: estas quatro são UM artigo.
    groups: [{ principalKeywordId: "k0", keywordIds: ["k0", "k1", "k2", "k3"] }],
    keywords,
    publishedArticles: [],
  });

  assert.equal(universo.candidates.length, 1, "a leitura não pode quebrar o grupo do formador");
  assert.equal(universo.candidates[0].keywords.length, 4);
  assert.equal(universo.candidates[0].principalKeywordId, "k0");
  assert.match(universo.candidates[0].reason, /formador canônico/);
});

/* ------------------------- §2/§3 a cerca de Silo ------------------------- */

test("cada Silo entra sozinho no formador", () => {
  const escopo = buildSiloScopedProvisionalGroups({
    silos: [
      { siloRef: SILO_A, siloLabel: "A", siloSlug: "/a" },
      { siloRef: SILO_B, siloLabel: "B", siloSlug: "/b" },
    ],
    keywordsBySiloRef: new Map([
      [SILO_A, [antiga("k1", "creme skin care", "silo-a"), antiga("k2", "cremes skin care", "silo-a")]],
      [SILO_B, [antiga("k3", "protetor solar toque seco", "silo-b")]],
    ]),
  });

  assert.equal(escopo.length, 2);
  assert.equal(countCrossSiloGroups(escopo), 0);
  // Nenhuma keyword de um Silo aparece nos grupos do outro.
  const doB = escopo[1].groups.flatMap(g => g.keywords.map((k: { id: string }) => k.id));
  assert.deepEqual(doB, ["k3"]);
});

test("Silo sem keyword não produz grupo fantasma", () => {
  const escopo = buildSiloScopedProvisionalGroups({
    silos: [{ siloRef: SILO_A, siloLabel: "A", siloSlug: "/a" }],
    keywordsBySiloRef: new Map(),
  });
  assert.equal(escopo[0].groups.length, 0);
  assert.equal(summarizeScopedGroups(escopo).groups, 0);
});

test("o tema do Silo NÃO é descontado antes da comparação", () => {
  // Foi esse desconto que transformou 15 keywords em 13 artigos singleton.
  const scope = readFileSync("lib/arquiteto/article-formation-scope.ts", "utf8");
  assert.doesNotMatch(scope, /siloThemeTokens|semSilo|descontar o tema/);

  const engine = readFileSync("lib/arquiteto/engine.ts", "utf8");
  // No engine, estar no mesmo Silo PESA A FAVOR da proximidade.
  assert.match(engine, /const combined = lexical \* 0\.5 \+ intent \* 0\.2 \+ entities \* 0\.2 \+ silo \* 0\.1/);
});

/* --------------------------- §2 fronteira dura --------------------------- */

test("o workspace nunca chama o formador com a marca inteira", () => {
  const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
  assert.match(workspace, /buildSiloScopedProvisionalGroups\(\{/);
  // A entrada é sempre um mapa por Silo, nunca a lista inteira.
  assert.match(workspace, /keywordsBySiloRef: porSilo/);
  assert.doesNotMatch(workspace, /buildProvisionalGroups\(masterList/);
});

test("o universo recebe os grupos do formador, não os inventa", () => {
  const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
  assert.match(workspace, /groups: \(escopo\?\.groups \|\| \[\]\)\.map/);
  assert.match(workspace, /principalKeywordId: String\(group\.principalSuggestion\.keywordId\)/);
});
