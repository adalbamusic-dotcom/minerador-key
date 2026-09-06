import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  detectExactPublishedRootDuplicates,
  resolveSupersedeReadiness,
  territoryRefsOutOfCompetition,
  type TerritoryIdentity,
} from "../lib/arquiteto/territory-duplicate.ts";

/**
 * DUPLICATA POR IDENTIDADE ESTRUTURAL — §11.
 *
 * O caso real: dois "Anti-idade e Retinol" nasceram da mesma entrada do
 * catálogo com 47 segundos de diferença. O candidato de campos vazios chegou
 * a levar uma busca de um ArticleDNA aprovado, porque competia por score de
 * igual para igual com o consolidado.
 */

const RAIZ = { catalogEntryId: "49c4cda7", normalizedUrl: "careglow.com.br/anti-idade-e-retinol" };

const canonico: TerritoryIdentity = {
  territoryRef: "territory:cdd03d6c",
  name: "Anti-idade e Retinol",
  lifecycleStatus: "consolidated",
  publishedStructureRef: RAIZ,
  hasCanonicalSilo: true,
};
const duplicado: TerritoryIdentity = {
  territoryRef: "territory:17a6da12",
  name: "Anti-idade e Retinol",
  lifecycleStatus: "candidate",
  publishedStructureRef: RAIZ,
  hasCanonicalSilo: false,
};

/* ------------------- A) duplicata exata é detectada --------------------- */

test("A) mesma entrada de catálogo caracteriza duplicata exata", () => {
  const pares = detectExactPublishedRootDuplicates([canonico, duplicado]);
  assert.equal(pares.length, 1);
  assert.equal(pares[0].canonicalTerritoryRef, "territory:cdd03d6c");
  assert.equal(pares[0].duplicateTerritoryRef, "territory:17a6da12");
  assert.equal(pares[0].catalogEntryId, "49c4cda7");
  assert.match(pares[0].reason, /mesma raiz publicada/);
});

/* ---- G) nome parecido SEM identidade publicada não é duplicata --------- */

test("G) mesmo nome sem a mesma raiz publicada NÃO é duplicata", () => {
  const outro: TerritoryIdentity = {
    ...duplicado,
    territoryRef: "territory:outro",
    publishedStructureRef: { catalogEntryId: "outra-entrada", normalizedUrl: "careglow.com.br/retinol-avancado" },
  };
  assert.deepEqual(detectExactPublishedRootDuplicates([canonico, outro]), []);
});

test("candidato sem raiz publicada nenhuma não vira duplicata por dedução", () => {
  const semRaiz: TerritoryIdentity = { ...duplicado, territoryRef: "territory:sem-raiz", publishedStructureRef: null };
  assert.deepEqual(detectExactPublishedRootDuplicates([canonico, semRaiz]), []);
});

test("sem Silo canônico ninguém é a identidade sobrevivente", () => {
  // Dois candidatos com a mesma raiz: nenhum tem estrutura para vencer.
  const outroCandidato: TerritoryIdentity = { ...duplicado, territoryRef: "territory:b" };
  const semCanonico: TerritoryIdentity = { ...canonico, hasCanonicalSilo: false, lifecycleStatus: "candidate" };
  assert.deepEqual(detectExactPublishedRootDuplicates([semCanonico, outroCandidato]), []);
});

/* ------------- B/C) marcar como substituído tem pré-condição ------------ */

test("B) duplicata com busca atribuída NÃO pode ser marcada", () => {
  const pares = detectExactPublishedRootDuplicates([canonico, duplicado]);
  const veredito = resolveSupersedeReadiness({ duplicate: pares[0], assignedKeywordCount: 1 });
  assert.equal(veredito.state, "blocked");
  if (veredito.state !== "blocked") return;
  assert.match(veredito.reason, /Restaure-as ao Silo canônico antes/);
});

test("C) sem buscas atribuídas, marcar é permitido", () => {
  const pares = detectExactPublishedRootDuplicates([canonico, duplicado]);
  const veredito = resolveSupersedeReadiness({ duplicate: pares[0], assignedKeywordCount: 0 });
  assert.equal(veredito.state, "ready");
  if (veredito.state !== "ready") return;
  assert.equal(veredito.canonicalTerritoryRef, "territory:cdd03d6c");
});

test("o que não é duplicata comprovada nunca fica pronto para substituir", () => {
  const veredito = resolveSupersedeReadiness({ duplicate: null, assignedKeywordCount: 0 });
  assert.equal(veredito.state, "blocked");
});

/* --------- D/E/F) o já substituído sai; o canônico permanece ------------ */

test("D/E) território substituído sai da disputa e não recebe atribuição", () => {
  const jaSubstituido: TerritoryIdentity = { ...duplicado, lifecycleStatus: "superseded" };
  assert.deepEqual(detectExactPublishedRootDuplicates([canonico, jaSubstituido]), []);
  assert.equal(territoryRefsOutOfCompetition([canonico, jaSubstituido]).size, 0);
});

test("F) o consolidado equivalente permanece elegível", () => {
  const fora = territoryRefsOutOfCompetition([canonico, duplicado]);
  assert.equal(fora.has("territory:17a6da12"), true, "o duplicado sai da disputa");
  assert.equal(fora.has("territory:cdd03d6c"), false, "o canônico permanece");
});

/* --------- §10 a regressão que faltou: o audit é a aplicação ------------ */

test("os audits reproduzem o pipeline da tela, com a decisão humana junto", () => {
  /*
   * Meu próprio audit reagrupou por similaridade porque omitiu
   * `humanFormationRef`, e relatou 6/8 de drift global que não existia.
   * `articleFormationRef` é o ponteiro que faz a revisão humana sobreviver ao
   * reprocessamento — um audit sem ele descreve outro sistema.
   */
  for (const arquivo of ["scripts/arquiteto-audit-drift.mts", "scripts/arquiteto-audit-formation-base.mts"]) {
    const fonte = readFileSync(arquivo, "utf8");
    assert.match(fonte, /resolveArticleFormationState/, `${arquivo} precisa ler a decisão humana`);
    assert.match(fonte, /humanFormationRef/, `${arquivo} precisa passar humanFormationRef`);
    assert.match(fonte, /humanRole/, `${arquivo} precisa passar humanRole`);
    // E precisa passar pelo universo canônico, não por agrupamento próprio.
    assert.match(fonte, /buildArticleFormationUniverse/, `${arquivo} precisa usar o universo canônico`);
  }
});

test("o universo canônico continua honrando o agrupamento humano", () => {
  // Se esta leitura sumir, todo audit volta a inventar cenário.
  const formacao = readFileSync("lib/arquiteto/article-formation.ts", "utf8");
  assert.match(formacao, /humanFormationRef\?: string \| null;/);
  assert.match(formacao, /const ref = keyword\.humanFormationRef;/);
});

/* ----------------- §8 o guarda chega até a análise --------------------- */

test("a análise territorial exclui a duplicata da disputa por score", () => {
  const analise = readFileSync("lib/arquiteto/architecture-analysis.ts", "utf8");
  const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");

  // A exclusão é determinística e vem de fora; nenhuma pontuação mudou.
  assert.match(analise, /outOfCompetitionTerritoryRefs\?: ReadonlySet<string>;/);
  assert.match(analise, /\.filter\(territory => !foraDaDisputa\.has\(territory\.territoryRef\)\)/);
  assert.doesNotMatch(analise, /scoreSiloFit[\s\S]{0,80}lifecycleStatus === "consolidated"/);

  assert.match(workspace, /outOfCompetitionTerritoryRefs: territoryRefsOutOfCompetition\(territoryIdentities\)/);
  assert.match(workspace, /hasCanonicalSilo: Object\.values\(acceptedSiloDnas\)/);
});

test("a duplicata é visível na fase Silos, com a pré-condição dita", () => {
  const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
  assert.match(workspace, /data-testid="architect-duplicate-territories"/);
  assert.match(workspace, /const duplicateReadiness = useMemo/);
  // A pré-condição é contada a partir das buscas realmente atribuídas.
  assert.match(workspace, /resolveSupersedeReadiness\(\{ duplicate: duplicata, assignedKeywordCount: atribuidas\.length \}\)/);
  // E as buscas presas são nomeadas: "restaure antes" sem dizer o quê é mudo.
  assert.match(workspace, /Buscas presas/);
});
