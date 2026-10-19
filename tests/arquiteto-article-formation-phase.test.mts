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
  // O corte que quebrou o ciclo Silo/Article passou a congelar as formacoes
  // concluidas aqui; este marcador nao concluiu nenhuma.
  concludedFormations: [],
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

test("sem formação processada, nenhuma keyword vira artigo sozinha", () => {
  /*
   * A GUARDA MUDOU DE LUGAR, NÃO DE PROPÓSITO.
   *
   * Ela era "o índice fica vazio até existir marcador", e isso criou um
   * deadlock circular na homologação de 2026-09-08: a tabela só teria linha
   * depois de processar, e processar exigia selecionar uma linha.
   *
   * O que a guarda protege continua valendo: uma KEYWORD não vira Artigo por
   * projeção. A linha existe porque a FORMAÇÃO agrupou — ela nasce de um
   * `candidateRef`, e enquanto não é processada se declara CANDIDATO, sem
   * ArticleDNA e sem SERP.
   */
  assert.match(workspace, /const candidato = formationCandidateByKeyword\.get\(String\(kw\.id\)\) \?\? null;/);
  assert.match(workspace, /if \(!kw\.isPublished && !candidato\) return;/);
  assert.match(workspace, /isFormationCandidate: Boolean\(c\.candidateRef\) && !articleFormationMarker/);
  // E o índice não volta a depender do marcador.
  assert.doesNotMatch(workspace, /if \(!articleFormationMarker\) return indice;/);
});

test("keyword sem artigo continua visível como pendente", () => {
  // 2026-10-18 · também quem está num ArticleDNA vigente (a keyword nova incorporada pela confirmação) não é pendente.
  assert.match(workspace, /keywordIdsInArticles: new Set\(\[\.\.\.articlesList\.flatMap/);
  assert.match(workspace, /\.\.\.keywordIdsInArticleDnas\(Object\.values\(acceptedArticleDnas\)/);
  const pipeline = readFileSync("lib/arquiteto/article-pipeline.ts", "utf8");
  assert.match(pipeline, /aguardando processar artigos/);
});

test("patrimônio publicado nunca depende da formação para aparecer", () => {
  assert.match(workspace, /const candidato = formationCandidateByKeyword\.get\(String\(kw\.id\)\) \?\? null;/);
  assert.match(workspace, /if \(!kw\.isPublished && !candidato\) return;/);
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

/*
 * 2026-10-16 · os dois botões da operação são só os da barra de sempre
 * (`articles-formation-bar.tsx`), no topo de "Detalhes técnicos": o painel de
 * formação perdeu a cópia opcional (código morto desde a restauração), e com
 * ela a contagem de seleção repetida. O escopo continua vindo da autoridade
 * única (`formationSelectionScope`), agora lido pela barra.
 */
test("os dois botões da operação são os da barra de sempre, com o escopo da autoridade única", () => {
  const barra = readFileSync("modules/arquiteto/articles-formation-bar.tsx", "utf8");
  assert.match(barra, /data-testid="architect-articles-top-process"/);
  assert.match(barra, /data-testid="architect-articles-top-confirm"/);
  assert.match(barra, /"Processar artigos"/);
  assert.match(barra, /Concluir formação/);
  assert.doesNotMatch(panel, /architect-process-articles|architect-confirm-formation|architect-formation-selection-count/);
  /*
   * 2026-10-17 (noite) · as MESMAS travas, agora em sequência (dono: "tem que ser sequencial"): ocupado (processando ou
   * prévia aberta) → seleção (a autoridade única) → o passo anterior. Para os artigos de sempre, "processou" é o marcador.
   */
  assert.match(barra, /const processou = total > 0 && \(plano \? plano\.processed : true\) && \(regulares \? processed : true\);/);
  assert.match(barra, /const motivoProcessar = ocupado \?\? semSelecao;/);
  assert.match(barra, /const motivoConcluir = ocupado \?\? semSelecao \?\? \(processou \? null : /);
  assert.match(barra, /disabled=\{Boolean\(motivoConcluir\)\}/);
  assert.match(barra, /disabled=\{Boolean\(motivoProcessar\)\}/);
  assert.match(barra, /data-testid="architect-articles-selection-count"/);
});

/*
 * 2026-10-16 · os gráficos de contagem do lote (destino das keywords,
 * composição, estado) saíram do painel — pedido do dono: "mostra só o que é
 * útil para o user". As pontuações do candidato aberto ficam: elas explicam a
 * decisão que a pessoa toma ali.
 */
test("o painel traz as pontuações do candidato aberto, sem os gráficos de contagem do lote", () => {
  for (const fora of ["architect-chart-keyword-destination", "architect-chart-composition", "architect-chart-state"]) {
    assert.ok(!panel.includes(fora), `${fora} saiu do painel`);
  }
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

/**
 * Comentário não é chamada.
 *
 * A asserção casava com a PALAVRA "serp" em qualquer lugar do arquivo —
 * inclusive num comentário explicando por que o hash da base precisa mudar
 * quando o KeywordDNA muda, senão o parecer antigo seria reaproveitado sobre
 * outra formação. O que este teste guarda é que o domínio não CHAME provider
 * nenhum; explicar a regra em prosa é o oposto de violá-la.
 */
const semComentarios = (fonte: string) => fonte
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

test("este corte é determinístico: sem SERP e sem IA na formação", () => {
  const dominio = semComentarios(readFileSync("lib/arquiteto/article-formation.ts", "utf8"));
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
  assert.match(corpo, /materializeApprovedArticleDnas\(\s*plano\.approved,\s*"CANONICAL_REQUIRED",\s*automatic \? "system" : "human"/);
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
