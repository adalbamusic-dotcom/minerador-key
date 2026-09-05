import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  ARTICLE_FORMATION_MARKER_CONTRACT_VERSION,
  ARTICLE_FORMATION_MARKER_SUBJECT_TYPE,
  ARTICLE_FORMATION_SCENARIO_LABELS,
  buildArticleFormationMarkerRow,
  parseArticleFormationMarkerRow,
  resolveArticleFormationScenarioState,
  type ArticleFormationMarkerPayload,
} from "../lib/arquiteto/article-formation-marker.ts";
import { articleFormationBaseHash } from "../lib/arquiteto/article-formation.ts";
import { articleSelectionIdForCandidate, articleSelectionIdForWorkingArticle } from "../lib/arquiteto/article-selection.ts";

const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
const panel = readFileSync("modules/arquiteto/article-formation-panel.tsx", "utf8");

const marker = (overrides: Partial<ArticleFormationMarkerPayload["confirmation"]> = {}): ArticleFormationMarkerPayload => ({
  contractVersion: ARTICLE_FORMATION_MARKER_CONTRACT_VERSION,
  baseHash: "artbase:abc",
  processedAt: "2026-09-04T10:00:00.000Z",
  confirmation: {
    status: "none",
    confirmedAt: null,
    confirmedArticleCount: 0,
    coveredKeywordCount: 0,
    pendingSiloCount: 0,
    failedCount: 0,
    ...overrides,
  },
});

/* ---------------------- 1 keyword deixou de ser 1 artigo ------------------ */

test("a tabela não projeta mais um artigo por keyword elegível", () => {
  // O agrupamento passa a ser a composição do candidato, não o id da keyword.
  assert.match(workspace, /const clusterKey = candidato \? candidato\.candidateRef : workingArticleId;/);
  assert.match(workspace, /if \(!kw\.isPublished && !candidato\) return;/);
});

test("sem formação processada, nenhuma keyword vira artigo", () => {
  // O índice fica vazio até existir marcador: é o que impede o legado voltar.
  assert.match(workspace, /if \(!articleFormationMarker\) return indice;/);
});

test("keyword sem artigo continua visível como pendente", () => {
  assert.match(workspace, /keywordIdsInArticles: new Set\(articlesList\.flatMap/);
  const pipeline = readFileSync("lib/arquiteto/article-pipeline.ts", "utf8");
  assert.match(pipeline, /aguardando processar artigos/);
});

test("patrimônio publicado nunca depende da formação para aparecer", () => {
  assert.match(workspace, /const candidato = kw\.isPublished \? null : formationCandidateByKeyword\.get/);
});

/* ------------------------------- marcador -------------------------------- */

test("o marcador guarda o fato humano, não os candidatos", () => {
  const row = buildArticleFormationMarkerRow(marker());
  assert.equal(row.subjectType, ARTICLE_FORMATION_MARKER_SUBJECT_TYPE);
  assert.equal(row.state, "processed");
  assert.equal(row.articleId, null, "confirmar formação não materializa Article");
  assert.equal(JSON.stringify(row.payload).includes("candidateRef"), false);
});

test("o estado da linha acompanha a confirmação", () => {
  assert.equal(buildArticleFormationMarkerRow(marker({ status: "confirmed", confirmedAt: "2026-09-04T11:00:00.000Z" })).state, "confirmed");
  assert.equal(buildArticleFormationMarkerRow(marker({ status: "partial", confirmedAt: "2026-09-04T11:00:00.000Z" })).state, "partial");
});

test("linha remota inconsistente é recusada, não normalizada", () => {
  const base = buildArticleFormationMarkerRow(marker());
  assert.equal(parseArticleFormationMarkerRow(base).ok, true);

  const comArticle = parseArticleFormationMarkerRow({ ...base, articleId: "article-1" });
  assert.equal(comArticle.ok, false);
  assert.deepEqual(comArticle.issues, ["ARTICLE_ID_PRESENT"]);

  const estadoErrado = parseArticleFormationMarkerRow({ ...base, state: "confirmed" });
  assert.equal(estadoErrado.ok, false);
  assert.deepEqual(estadoErrado.issues, ["STATE_DOES_NOT_MATCH_PAYLOAD"]);

  const tipoErrado = parseArticleFormationMarkerRow({ ...base, subjectType: "territory" });
  assert.equal(tipoErrado.ok, false);
  assert.ok(tipoErrado.issues.includes("SUBJECT_TYPE_MISMATCH"));
});

/* ------------------------------- cenário --------------------------------- */

test("o cenário sobrevive ao F5 e sabe quando envelheceu", () => {
  assert.equal(resolveArticleFormationScenarioState({ marker: null, currentBaseHash: "artbase:abc" }), "not_processed");
  assert.equal(resolveArticleFormationScenarioState({ marker: marker(), currentBaseHash: "artbase:abc" }), "processed");
  assert.equal(
    resolveArticleFormationScenarioState({ marker: marker({ status: "confirmed", confirmedAt: "x" }), currentBaseHash: "artbase:abc" }),
    "confirmed",
  );
  assert.equal(
    resolveArticleFormationScenarioState({ marker: marker({ status: "partial", confirmedAt: "x" }), currentBaseHash: "artbase:abc" }),
    "partially_confirmed",
  );
  // Confirmada antes, o lote mudou depois: a tela precisa dizer isso.
  assert.equal(
    resolveArticleFormationScenarioState({ marker: marker({ status: "confirmed", confirmedAt: "x" }), currentBaseHash: "artbase:outro" }),
    "stale",
  );
  assert.equal(Object.keys(ARTICLE_FORMATION_SCENARIO_LABELS).length, 5);
});

test("o hash muda com o lote e não com a ordem", () => {
  const base = { siloRefs: ["s1", "s2"], keywordIds: ["k1", "k2"], publishedArticlePaths: ["/a"] };
  const invertido = { siloRefs: ["s2", "s1"], keywordIds: ["k2", "k1"], publishedArticlePaths: ["/a"] };
  assert.equal(articleFormationBaseHash(base), articleFormationBaseHash(invertido));
  assert.notEqual(articleFormationBaseHash(base), articleFormationBaseHash({ ...base, keywordIds: ["k1", "k2", "k3"] }));
  assert.notEqual(articleFormationBaseHash(base), articleFormationBaseHash({ ...base, publishedArticlePaths: [] }));
});

/* -------------------------------- painel --------------------------------- */

test("o painel nasce com os dois botões da operação", () => {
  assert.match(panel, /data-testid="architect-process-articles"/);
  assert.match(panel, /data-testid="architect-confirm-formation"/);
  assert.match(panel, /Processar artigos/);
  assert.match(panel, /Concluir formação/);
  // Confirmar só depois de processar.
  assert.match(panel, /disabled=\{busy \|\| !processed\}/);
});

test("o painel traz os gráficos e as pontuações do candidato", () => {
  assert.match(panel, /data-testid="architect-chart-keyword-destination"/);
  assert.match(panel, /data-testid="architect-chart-composition"/);
  assert.match(panel, /data-testid="architect-chart-state"/);
  for (const rotulo of ["Coerência", "Intenção", "Centralidade", "Sobreposição"]) {
    assert.ok(panel.includes(rotulo), `falta a pontuação ${rotulo}`);
  }
});

test("o singleton explica por que ficou sozinho, não só que tem 1 keyword", () => {
  assert.match(panel, /data-testid="architect-candidate-singleton"/);
  assert.match(panel, /Mantido como candidato independente/);
  assert.match(panel, /SINGLETON_CLASSIFICATION_LABELS/);
});

test("o painel mostra os papéis das keywords do candidato", () => {
  assert.match(panel, /data-testid="architect-candidate-keywords"/);
  for (const papel of ["Principal", "Secundária", "Reforço"]) {
    assert.ok(panel.includes(papel), `falta o papel ${papel}`);
  }
});

/* ---------------------------- contrato do corte -------------------------- */

test("este corte é determinístico: sem SERP e sem IA na formação", () => {
  const dominio = readFileSync("lib/arquiteto/article-formation.ts", "utf8");
  assert.doesNotMatch(dominio, /fetch\(|serp|ai_|deepseek|dataforseo/i);
  // O painel CONTA quantas formações pediriam SERP (§13); ele não a executa.
  // Nomear a evidência é leitura; chamar o provider é que era proibido.
  assert.doesNotMatch(panel, /fetch\(|IA territorial/);
  assert.doesNotMatch(panel, /onSerp|runSerp|confirmSerpValidation/);
});

test("nenhum nome de provider aparece no painel", () => {
  for (const proibido of ["DeepSeek", "DataForSEO", "provider", "Connection", "token", "credit", "API key"]) {
    assert.equal(panel.toLowerCase().includes(proibido.toLowerCase()), false, `\`${proibido}\` não pode aparecer na interface`);
  }
});

test("confirmar formação materializa ArticleDNA pelo plano, não às cegas", () => {
  const trecho = workspace.slice(workspace.indexOf("const confirmArticleFormation"));
  const corpo = trecho.slice(0, trecho.indexOf("\n  }, ["));
  // O plano é quem decide quem entra; confirmar não varre a lista inteira.
  assert.match(corpo, /buildArticleFormationConfirmationPlan/);
  assert.match(corpo, /materializeApprovedArticleDnas\(plano\.approved\)/);
  assert.match(corpo, /persistArticleFormationMarker/);
});

test("a materialização usa o writer canônico, sem endpoint novo", () => {
  const trecho = workspace.slice(workspace.indexOf("const materializeApprovedArticleDnas"));
  const corpo = trecho.slice(0, trecho.indexOf("\n  }, ["));
  assert.match(corpo, /artifactType: "article_dna"/);
  assert.match(corpo, /persistArquitetoArtifact/);
  assert.match(corpo, /deterministicArticleDnaPayload/);
  // Contrato atual: nada de ArticleDNAV2 nem de rota própria.
  assert.doesNotMatch(corpo, /ArticleDNAV2|\/api\/arquiteto\/article-formation-dna/);
  // Nenhum provider no momento da confirmação.
  assert.doesNotMatch(corpo, /dataforseo|deepseek|\/serp/i);
});

test("uma falha de escrita não é contada como artigo criado", () => {
  const trecho = workspace.slice(workspace.indexOf("const materializeApprovedArticleDnas"));
  const corpo = trecho.slice(0, trecho.indexOf("\n  }, ["));
  // O writer não é transacional: só entra em `criados` o que passou.
  assert.match(corpo, /criados\.push/);
  assert.match(corpo, /catch \(error\)/);
  const posPush = corpo.indexOf("criados.push");
  const posCatch = corpo.indexOf("catch (error)");
  assert.ok(posPush < posCatch, "o push precisa estar dentro do try, antes do catch");
});

/* ------------------------- identidade da linha --------------------------- */

test("dois artigos do mesmo grupo do Minerador não compartilham a chave", () => {
  // Várias keywords carregam o MESMO `workingArticleId`; depois que a formação
  // passou a agrupar por convergência elas podem cair em artigos diferentes.
  const compartilhado = "working-article:c28e5a33-11e0-4039-b72f-63cea63c673d";
  assert.equal(
    articleSelectionIdForWorkingArticle(compartilhado),
    articleSelectionIdForWorkingArticle(compartilhado),
    "o id antigo é o mesmo para os dois — por isso ele não pode mais identificar a linha",
  );

  const primeiro = articleSelectionIdForCandidate("article-candidate:territory:t1:k1");
  const segundo = articleSelectionIdForCandidate("article-candidate:territory:t1:k2");
  assert.notEqual(primeiro, segundo);
  assert.equal(primeiro, "article-candidate:article-candidate%3Aterritory%3At1%3Ak1");
  assert.equal(articleSelectionIdForCandidate(""), null);
  assert.equal(articleSelectionIdForCandidate(null), null);
});

test("a linha de formação prefere a identidade do candidato", () => {
  assert.match(workspace, /id: \(c\.candidateRef && articleSelectionIdForCandidate\(c\.candidateRef\)\)/);
  // Publicado, sem candidato, mantém a identidade antiga.
  assert.match(workspace, /\|\| articleSelectionIdForWorkingArticle\(c\.workingArticleId\)/);
});

test("o slug validado chega ao ArticleDNA, não o do Minerador", () => {
  const trecho = workspace.slice(workspace.indexOf("const materializeApprovedArticleDnas"));
  const corpo = trecho.slice(0, trecho.indexOf("\n  }, ["));
  // Sem isto o adapter recalcularia o slug de `slug_sugerido`, que é
  // compartilhado entre keywords do mesmo cluster do Minerador.
  assert.match(corpo, /slug_sugerido: aprovado\.slug/);
  assert.match(corpo, /computedSlug: aprovado\.slug/);
  // A troca acontece só na principal: é dela que o adapter lê o endereço.
  assert.match(corpo, /String\(item\.id\) === aprovado\.principalKeywordId/);
});
