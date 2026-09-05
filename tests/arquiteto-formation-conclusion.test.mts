import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildArticleFormationConfirmationPlan } from "../lib/arquiteto/article-formation-confirmation.ts";
import { planKeywordRole } from "../lib/arquiteto/article-formation-editing.ts";
import { buildArticleFormationUniverse, type ArticleFormationKeyword } from "../lib/arquiteto/article-formation.ts";
import {
  compareMaterializedArticle,
  observedFromArticleDna,
  readbackMaterializedArticles,
  type MaterializedArticleExpectation,
} from "../lib/arquiteto/article-materialization-readback.ts";

const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
const panel = readFileSync("modules/arquiteto/article-formation-panel.tsx", "utf8");
const review = readFileSync("modules/arquiteto/article-formation-review.tsx", "utf8");
const workbench = readFileSync("modules/arquiteto/arquiteto-workbench.tsx", "utf8");

const SILO = "territory:11111111-1111-4111-8111-111111111111";

const kw = (id: string, keyword: string): ArticleFormationKeyword => ({
  keywordId: id, keyword, intent: "informacional", volume: 100, kgr: null,
  entity: null, problem: null, isPublished: false,
});

/* ------------- §0/§1 concluir consome o cenário, não reagrupa ------------ */

test("concluir não reexecuta o formador nem os motores", () => {
  const trecho = workspace.slice(workspace.indexOf("const confirmArticleFormation"));
  const corpo = trecho.slice(0, trecho.indexOf("\n  }, ["));
  // A fonte é o cenário corrente, já com as decisões humanas dentro dele.
  assert.match(corpo, /buildArticleFormationConfirmationPlan\(\{ universes: articleFormationUniverses \}\)/);
  // E nada de reagrupar, medir SERP ou chamar IA no caminho da escrita.
  assert.doesNotMatch(corpo, /buildProvisionalGroups|buildSiloScopedProvisionalGroups|confirmSerpValidation|runKeywordReview/);
});

test("o plano leva a composição COM os papéis do cenário", () => {
  const keywords = [
    kw("k1", "skin care para peles oleosas"),
    kw("k2", "skin care pele oleosa masculina"),
    kw("k3", "mascara facial argila verde"),
  ];
  const universe = buildArticleFormationUniverse({
    siloRef: SILO, siloLabel: "Skin care", siloSlug: "/skin-care",
    groups: [{ principalKeywordId: "k1", keywordIds: ["k1", "k2", "k3"] }],
    keywords,
  });
  const plano = buildArticleFormationConfirmationPlan({ universes: [universe] });
  const entrada = plano.approved[0];
  assert.ok(entrada, "o candidato precisa entrar no plano");
  assert.deepEqual(
    entrada.keywords.map(item => item.keywordId).sort(),
    entrada.keywordIds.slice().sort(),
    "a composição com papéis cobre exatamente as mesmas keywords",
  );
  assert.equal(entrada.keywords.filter(item => item.role === "principal").length, 1);
  // O papel de cada uma vem do cenário, não de um default.
  assert.deepEqual(
    new Set(entrada.keywords.map(item => item.role)),
    new Set(universe.candidates[0].keywords.map(item => item.role)),
  );
});

test("o reforço do cenário chega ao payload como reforço narrativo", () => {
  const trecho = workspace.slice(workspace.indexOf("const materializeApprovedArticleDnas"));
  const corpo = trecho.slice(0, trecho.indexOf("\n  }, ["));
  assert.match(corpo, /roles: Object\.fromEntries\(aprovado\.keywords\.map/);
  assert.match(corpo, /item\.role === "reforco" \? "reforco_narrativo"/);
  // Achatar tudo em secundária apagava a decisão humana na hora de gravar.
  assert.doesNotMatch(corpo, /aprovado\.principalKeywordId \? "principal" : "secundaria"/);
});

/* ------------------------ §3 pai explícito no DNA ------------------------ */

test("o ArticleDNA novo nasce com o pai declarado", () => {
  const trecho = workspace.slice(workspace.indexOf("const materializeApprovedArticleDnas"));
  const corpo = trecho.slice(0, trecho.indexOf("\n  }, ["));
  assert.match(corpo, /territoryRef: aprovado\.siloRef/);
  const adapters = readFileSync("lib/arquiteto/adapters.ts", "utf8");
  assert.match(adapters, /\.\.\.\(group\.territoryRef \? \{ territoryRef: group\.territoryRef \} : \{\}\)/);
});

/* ---------------------------- §6 readback -------------------------------- */

const esperado = (extra: Partial<MaterializedArticleExpectation> = {}): MaterializedArticleExpectation => ({
  articleId: "article-candidate:a",
  territoryRef: SILO,
  principalKeywordId: "k1",
  secondaryKeywordIds: ["k2"],
  narrativeReinforcementIds: ["k3"],
  slug: "skin-care-para-peles-oleosas",
  versionNumber: 4,
  contentHash: "sha256:abc",
  ...extra,
});

test("o remoto confirmando exatamente a composição é sucesso", () => {
  const resultado = compareMaterializedArticle(esperado(), esperado());
  assert.equal(resultado.ok, true);
  assert.deepEqual(resultado.mismatches, []);
});

test("a ordem das secundárias não reprova uma escrita correta", () => {
  const resultado = compareMaterializedArticle(
    esperado({ secondaryKeywordIds: ["k2", "k9"] }),
    esperado({ secondaryKeywordIds: ["k9", "k2"] }),
  );
  assert.equal(resultado.ok, true);
});

test("secundária virada reforço no remoto NÃO é sucesso parcial", () => {
  // Mesmo versionNumber, mesmas keywords, outro artigo.
  const resultado = compareMaterializedArticle(
    esperado(),
    esperado({ secondaryKeywordIds: ["k2", "k3"], narrativeReinforcementIds: [] }),
  );
  assert.equal(resultado.ok, false);
  assert.deepEqual(
    resultado.mismatches.map(item => item.field).sort(),
    ["narrativeReinforcementIds", "secondaryKeywordIds"],
  );
});

test("ArticleDNA ausente no remoto é divergência, não silêncio", () => {
  const resultado = compareMaterializedArticle(esperado(), null);
  assert.equal(resultado.ok, false);
  assert.equal(resultado.mismatches[0].field, "presence");
  assert.equal(resultado.mismatches[0].observed, "ausente");
});

test("pai divergente no remoto reprova o artigo", () => {
  const resultado = compareMaterializedArticle(
    esperado(),
    esperado({ territoryRef: null }),
  );
  assert.equal(resultado.ok, false);
  assert.equal(resultado.mismatches[0].field, "territoryRef");
});

test("o lote só é sucesso quando o remoto confirma todos", () => {
  const leitura = readbackMaterializedArticles({
    expectations: [esperado(), esperado({ articleId: "article-candidate:b", contentHash: "sha256:def" })],
    observedByArticleId: new Map([
      ["article-candidate:a", esperado()],
      ["article-candidate:b", esperado({ articleId: "article-candidate:b", contentHash: "sha256:outro" })],
    ]),
  });
  assert.equal(leitura.ok, false);
  assert.equal(leitura.confirmed.length, 1);
  assert.equal(leitura.rejected.length, 1);
  // O relatório nomeia o campo, não só o fracasso.
  assert.match(leitura.summary, /contentHash/);
  assert.match(leitura.summary, /1 de 2/);
});

test("a leitura do remoto usa os mesmos campos do payload canônico", () => {
  const observado = observedFromArticleDna({
    versionNumber: 3,
    contentHash: "sha256:xyz",
    payload: {
      articleId: "article-candidate:a",
      territoryRef: SILO,
      principalKeywordId: "k1",
      secondaryKeywordIds: ["k2"],
      narrativeReinforcementIds: ["k3"],
      suggestedSlug: "skin-care",
    },
  });
  assert.equal(observado.territoryRef, SILO);
  assert.equal(observado.slug, "skin-care");
  assert.equal(observado.versionNumber, 3);
});

test("o clique de concluir lê o remoto antes de anunciar sucesso", () => {
  const trecho = workspace.slice(workspace.indexOf("const confirmArticleFormation"));
  const corpo = trecho.slice(0, trecho.indexOf("\n  }, ["));
  const escrita = corpo.indexOf("materializeApprovedArticleDnas");
  const leitura = corpo.indexOf("readbackMaterializedArticles");
  const sucesso = corpo.indexOf('showNotification("success"');
  assert.ok(escrita > -1 && leitura > -1 && sucesso > -1);
  assert.ok(escrita < leitura, "o readback vem DEPOIS da escrita");
  assert.ok(leitura < sucesso, "o sucesso vem DEPOIS do readback");
  // Divergência não vira "aplicado parcialmente" otimista.
  assert.match(corpo, /if \(leitura\.rejected\.length\) \{/);
  assert.match(corpo, /showNotification\("error", `\$\{leitura\.summary\}/);
  // E o marcador guarda o que o remoto confirmou.
  assert.match(corpo, /confirmedArticleCount: criadosConfirmados\.length/);
});

/* -------------------------- §4 legado intocado --------------------------- */

test("concluir não reescreve nem recicla o acervo antigo", () => {
  const trecho = workspace.slice(workspace.indexOf("const materializeApprovedArticleDnas"));
  const corpo = trecho.slice(0, trecho.indexOf("\n  }, ["));
  // Sucessão de versão: a anterior é preservada, nunca sobrescrita.
  assert.match(corpo, /versionNumber: \(vigente\?\.versionNumber \|\| 0\) \+ 1/);
  assert.match(corpo, /previousVersionId: vigente\?\.versionId \|\| null/);
  assert.doesNotMatch(corpo, /DELETE|deleteArtifact|overwrite/i);
});

/* ------------------------- §8/§9/§10/§11 leitura ------------------------- */

test("a banda da mesa nomeia a SiloPage, não um rótulo genérico", () => {
  assert.doesNotMatch(workspace, /"Artigos em formação"/);
  // O nome do grupo é decidido UMA vez, no agrupamento. O cabeçalho só o
  // mostra: quando ele voltava a exigir `siloId` canônico, três Silos
  // confirmados apareciam como "ARTIGOS SEM SILO" na aba Links.
  assert.match(workspace, /<span className=\{`text-sm font-semibold \$\{siloColor\.headerText\}`\}>\s*\{group\.siloName\}/);
});

test("o painel de revisão sobrevive à conclusão e diz o que ficou gravado", () => {
  assert.match(review, /data-testid="architect-review-materialized"/);
  assert.match(review, /Formação concluída/);
  assert.match(review, /ArticleDNA v\{materialized\.versionNumber\}/);
  assert.match(review, /Evidências usadas/);
  // Nova mudança não edita o aprovado em silêncio.
  assert.match(review, /ela cria a próxima, com a anterior preservada/);
});

test("os chips do mapa se declaram como visão, não como processo", () => {
  assert.match(workbench, /data-testid="architect-map-scenarios-title"/);
  assert.match(workbench, /Visão do mapa/);
  assert.match(workbench, /aria-label="Visão do mapa"/);
});

test("o painel separa Article formado de candidato", () => {
  for (const rotulo of ["SiloPages", "Articles formados", "Articles candidatos"]) {
    assert.ok(panel.includes(rotulo), `falta o campo ${rotulo}`);
  }
  assert.match(workspace, /articles: articleSiloSummary\.articles/);
  assert.match(workspace, /candidates: articleSiloSummary\.candidates/);
});

/* -------------------- §5.B papel editorial chega ao DNA ------------------ */

test("secundária → reforço é gravada, não só anunciada na tela", () => {
  const keywords = [kw("k1", "skin care para peles oleosas"), kw("k2", "skin care neutrogena")];
  const universe = buildArticleFormationUniverse({
    siloRef: SILO, siloLabel: "Skin care", siloSlug: "/skin-care",
    groups: [{ principalKeywordId: "k1", keywordIds: ["k1", "k2"] }],
    keywords,
  });
  const plano = planKeywordRole({
    universe,
    keywords: [
      { keywordId: "k1", workflowItemId: "w1", lockVersion: 2 },
      { keywordId: "k2", workflowItemId: "w2", lockVersion: 5 },
    ],
    candidateRef: universe.candidates[0].candidateRef,
    keywordId: "k2",
    role: "reforco",
    mintUuid: "aaaaaaaa-1111-4111-8111-111111111111",
    decidedAt: "2026-09-04T12:00:00.000Z",
  });

  assert.deepEqual(plano.refusals, []);
  // O artigo inteiro passa a ter identidade revisada: deixar as outras para
  // trás faria metade dele voltar a ser reagrupado pela lógica.
  assert.equal(plano.patches.length, 2);
  const alvo = plano.patches.find(patch => patch.keywordId === "k2")!;
  assert.equal(alvo.assignment.articleFormationDecision.role, "reforco");
  assert.equal(alvo.assignment.articleFormationDecision.operation, "role");
  assert.equal(alvo.expectedLock, 5, "grava com o lock que leu");
  // A Principal continua Principal.
  assert.equal(plano.patches.find(patch => patch.keywordId === "k1")!.assignment.articleFormationDecision.role, "principal");
});

test("a Principal não vira reforço pela porta do papel", () => {
  const keywords = [kw("k1", "skin care para peles oleosas"), kw("k2", "skin care neutrogena")];
  const universe = buildArticleFormationUniverse({
    siloRef: SILO, siloLabel: "Skin care", siloSlug: "/skin-care",
    groups: [{ principalKeywordId: "k1", keywordIds: ["k1", "k2"] }],
    keywords,
  });
  const plano = planKeywordRole({
    universe,
    keywords: [{ keywordId: "k1", workflowItemId: "w1", lockVersion: 1 }],
    candidateRef: universe.candidates[0].candidateRef,
    keywordId: "k1",
    role: "reforco",
    mintUuid: "aaaaaaaa-1111-4111-8111-111111111111",
    decidedAt: "2026-09-04T12:00:00.000Z",
  });
  assert.equal(plano.patches.length, 0);
  assert.equal(plano.refusals[0].code, "PRINCIPAL_NOT_IN_CANDIDATE");
});

test("trocar a Principal preserva quem já era reforço narrativo", () => {
  const editing = readFileSync("lib/arquiteto/article-formation-editing.ts", "utf8");
  const trecho = editing.slice(editing.indexOf("export function planPrincipalChange"));
  const corpo = trecho.slice(0, trecho.indexOf("\n}\n"));
  assert.match(corpo, /const papelAtual = new Map\(candidato\.keywords\.map/);
  assert.match(corpo, /anterior === "reforco" \? "reforco" : "secundaria"/);
});

test("o painel manda a troca de papel para o writer, não para uma notificação", () => {
  const trecho = workspace.slice(workspace.indexOf("const applyPendingScenarioChange"));
  const corpo = trecho.slice(0, trecho.indexOf("\n  }, ["));
  assert.match(corpo, /change\.kind === "set_role"\) await changeKeywordRole\(/);
  assert.doesNotMatch(corpo, /Papel editorial registrado no cenário/);
  assert.match(workspace, /planKeywordRole\(\{/);
});

/* ------------------- §7/§8 a linha concorda com o acervo ----------------- */

test("a linha exibe a Principal do cenário, não a de um papel manual antigo", () => {
  const inicio = workspace.indexOf("const principalSugerida = c.principalKeywordId");
  const corpo = workspace.slice(inicio, workspace.indexOf("const supportKeywords", inicio));
  const posFormacao = corpo.indexOf("|| principalSugerida");
  const posManual = corpo.indexOf('manualKeywordRoleFor(keyword) === "principal"');
  assert.ok(posFormacao > -1 && posManual > -1);
  // A formação vira ArticleDNA; deixar o papel manual antigo na frente fazia a
  // mesa discordar do acervo sobre o mesmo artigo.
  assert.ok(posFormacao < posManual, "a formação precisa ter precedência sobre o papel manual");
});

test("o vocabulário da conclusão é o mesmo em toda a fase", () => {
  assert.match(panel, /Concluir formação/);
  assert.match(panel, /Formação concluída\./);
  assert.doesNotMatch(panel, /Formação confirmada/);
});

/* ------------- FECHAMENTO: quem é dono da SERP e quem só valida ---------- */

test("reprocessar é dono da SERP; concluir apenas valida", () => {
  const reprocessar = workspace.slice(workspace.indexOf("const processArticleFormation"));
  const corpoReprocessar = reprocessar.slice(0, reprocessar.indexOf("\n  }, ["));
  // Agrupa, confere o gate e só chama o provider para o que falta.
  assert.match(corpoReprocessar, /articleSerpGateSummary\.needsCollection/);
  assert.match(corpoReprocessar, /await confirmSerpValidation\(pendentes\)/);
  assert.match(corpoReprocessar, /if \(!pendentes\.length\)/);

  const concluir = workspace.slice(workspace.indexOf("const confirmArticleFormation"));
  const corpoConcluir = concluir.slice(0, concluir.indexOf("\n  }, ["));
  // Concluir não reagrupa, não coleta e não fala com provider nenhum.
  assert.doesNotMatch(corpoConcluir, /buildProvisionalGroups|buildSiloScopedProvisionalGroups/);
  assert.doesNotMatch(corpoConcluir, /confirmSerpValidation|serpGroupsForCandidates|callStrategicApi/);
  // Ele lê o cenário vigente, passa pela portaria e materializa.
  assert.match(corpoConcluir, /buildArticleFormationConfirmationPlan\(\{ universes: articleFormationUniverses \}\)/);
  assert.match(corpoConcluir, /validateFormationConclusion\(/);
  assert.match(corpoConcluir, /materializeApprovedArticleDnas\(plano\.approved\)/);
});

test("SiloPage projetada não é SiloPage canônica", () => {
  const view = readFileSync("lib/arquiteto/article-silo-view.ts", "utf8");
  // A projeção declara quando o artefato existe de verdade; alegar o contrário
  // prometeria uma página publicável que ninguém criou.
  assert.match(view, /canonical: boolean/);
  assert.match(workspace, /const canonicais = new Set\(Object\.values\(acceptedSiloPages\)/);
  // E a fase Links exige o par canônico — não aceita a projeção.
  assert.match(workspace, /Nenhum par SiloDNA \+ SiloPage disponível para formar o contexto do grafo/);
});
