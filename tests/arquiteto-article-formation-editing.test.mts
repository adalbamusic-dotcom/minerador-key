import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  newFormationRef,
  planMergeCandidates,
  planMoveKeyword,
  planPrincipalChange,
  planSplitKeyword,
  type FormationKeywordLike,
} from "../lib/arquiteto/article-formation-editing.ts";
import {
  articleFormationDecisionIsStale,
  isArticleFormationRef,
  resolveArticleFormationState,
} from "../lib/arquiteto/article-formation-decision.ts";
import {
  buildArticleFormationUniverse,
  type ArticleFormationKeyword,
} from "../lib/arquiteto/article-formation.ts";

const SILO = "territory:11111111-1111-4111-8111-111111111111";
const AGORA = "2026-09-04T12:00:00.000Z";

const kw = (id: string, keyword: string, overrides: Partial<ArticleFormationKeyword> = {}): ArticleFormationKeyword => ({
  keywordId: id,
  keyword,
  intent: "informacional",
  volume: 100,
  kgr: null,
  entity: null,
  problem: null,
  isPublished: false,
  ...overrides,
});

const itens = (ids: string[]): FormationKeywordLike[] =>
  ids.map((id, index) => ({ keywordId: id, workflowItemId: `item-${id}`, lockVersion: index + 1 }));

const universo = (keywords: ArticleFormationKeyword[]) =>
  buildArticleFormationUniverse({
    siloRef: SILO,
    siloLabel: "Skin care para peles oleosas",
    siloSlug: "/skin-care-para-peles-oleosas",
    keywords,
    publishedArticles: [],
  });

/* --------------------------- forma da decisão ---------------------------- */

test("a decisão mora ao lado do ponteiro, sem repeti-lo", () => {
  const ref = newFormationRef("aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa");
  assert.ok(isArticleFormationRef(ref));
  assert.equal(isArticleFormationRef("territory:abc"), false);

  const plano = planMoveKeyword({
    universe: universo([kw("k1", "mascara facial argila"), kw("k2", "protetor solar toque seco")]),
    keywords: itens(["k1", "k2"]),
    keywordId: "k1",
    targetCandidateRef: universo([kw("k1", "mascara facial argila"), kw("k2", "protetor solar toque seco")])
      .candidates.find(candidate => candidate.principalKeywordId === "k2")!.candidateRef,
    mintUuid: "dddddddd-4444-4444-8444-dddddddddddd",
    decidedAt: AGORA,
  });

  assert.equal(plano.refusals.length, 0);
  const decisao = plano.patches[0].assignment.articleFormationDecision;
  assert.equal(decisao.source, "human");
  assert.equal(decisao.operation, "move");
  assert.equal(JSON.stringify(decisao).includes("article-formation:"), false, "a decisão não repete o ponteiro");
});

test("payload legado é `unaddressed`, não decisão vazia", () => {
  assert.equal(resolveArticleFormationState({}).state, "unaddressed");
  assert.equal(resolveArticleFormationState({ siloId: "x" }).state, "unaddressed");
});

test("estado incoerente é recusado, nunca normalizado", () => {
  const soRef = resolveArticleFormationState({ articleFormationRef: "article-formation:abc" });
  assert.equal(soRef.state, "incoherent");
  assert.deepEqual(soRef.issues, ["REF_WITHOUT_DECISION"]);

  const soDecisao = resolveArticleFormationState({
    articleFormationDecision: { operation: "move", role: "principal", reason: "x", source: "human", decidedAt: AGORA },
  });
  assert.equal(soDecisao.state, "incoherent");
  assert.deepEqual(soDecisao.issues, ["DECISION_WITHOUT_REF"]);

  const refRuim = resolveArticleFormationState({
    articleFormationRef: "territory:abc",
    articleFormationDecision: { operation: "move", role: "principal", reason: "x", source: "human", decidedAt: AGORA },
  });
  assert.equal(refRuim.state, "incoherent");
  assert.ok(refRuim.issues.includes("REF_INVALID"));
});

test("decisão coerente volta legível", () => {
  const resolvido = resolveArticleFormationState({
    articleFormationRef: "article-formation:abc",
    articleFormationDecision: { operation: "merge", role: "secundaria", reason: "x", source: "human", decidedAt: AGORA },
  });
  assert.equal(resolvido.state, "decided");
  assert.equal(resolvido.formationRef, "article-formation:abc");
  assert.equal(resolvido.decision?.operation, "merge");
});

/* ------------------------------- §23 juntar ------------------------------ */

test("juntar dois candidatos aponta as duas composições para um só", () => {
  const resultado = universo([kw("k1", "mascara facial argila"), kw("k2", "protetor solar toque seco")]);
  const [esquerda, direita] = resultado.candidates;

  const plano = planMergeCandidates({
    universe: resultado,
    keywords: itens(["k1", "k2"]),
    leftCandidateRef: esquerda.candidateRef,
    rightCandidateRef: direita.candidateRef,
    mintUuid: "dddddddd-4444-4444-8444-dddddddddddd",
    decidedAt: AGORA,
  });

  assert.equal(plano.refusals.length, 0);
  assert.equal(plano.patches.length, 2);
  // As duas passam a apontar para a MESMA identidade, e ela é estável: o ref
  // calculado embute a principal e mudaria junto com a próxima decisão.
  const refs = new Set(plano.patches.map(patch => patch.assignment.articleFormationRef));
  assert.equal(refs.size, 1);
  const [refUnico] = [...refs];
  assert.ok(isArticleFormationRef(refUnico));
  assert.equal(refUnico.includes(esquerda.principalKeywordId), false, "a identidade não pode depender da principal");
  // A esquerda também recebe decisão: sem isso o reprocessamento desfaria.
  const principais = plano.patches.filter(patch => patch.assignment.articleFormationDecision.role === "principal");
  assert.equal(principais.length, 1);
  assert.equal(principais[0].keywordId, esquerda.principalKeywordId);
});

test("juntar acima do teto é recusado com motivo", () => {
  const seis = Array.from({ length: 6 }, (_, index) =>
    kw(`a${index}`, `creme skin care ${["", "bom", "top", "novo", "ideal", "leve"][index]}`.trim(),
      { entity: "creme", problem: "escolher creme" }));
  const resultado = universo([...seis, kw("b1", "protetor solar toque seco")]);
  const cheio = resultado.candidates.find(candidate => candidate.keywords.length === 6)!;
  const outro = resultado.candidates.find(candidate => candidate.candidateRef !== cheio.candidateRef)!;

  const plano = planMergeCandidates({
    universe: resultado,
    keywords: itens([...seis.map(item => item.keywordId), "b1"]),
    leftCandidateRef: cheio.candidateRef,
    rightCandidateRef: outro.candidateRef,
    mintUuid: "dddddddd-4444-4444-8444-dddddddddddd",
    decidedAt: AGORA,
  });

  assert.equal(plano.patches.length, 0);
  assert.equal(plano.refusals[0].code, "MERGE_EXCEEDS_CEILING");
});

/* ------------------------------ §24 separar ------------------------------ */

test("separar tira a keyword e mantém quem fica com decisão explícita", () => {
  const resultado = universo([
    kw("k1", "creme skin care", { entity: "creme", problem: "escolher creme" }),
    kw("k2", "cremes skin care", { entity: "creme", problem: "escolher creme" }),
  ]);
  const candidato = resultado.candidates[0];
  const novoRef = newFormationRef("bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb");

  const plano = planSplitKeyword({
    universe: resultado,
    keywords: itens(["k1", "k2"]),
    candidateRef: candidato.candidateRef,
    keywordId: "k2",
    newFormationRef: novoRef,
    mintUuid: "dddddddd-4444-4444-8444-dddddddddddd",
    decidedAt: AGORA,
  });

  assert.equal(plano.refusals.length, 0);
  assert.equal(plano.patches.length, 2);
  const saiu = plano.patches.find(patch => patch.keywordId === "k2")!;
  assert.equal(saiu.assignment.articleFormationRef, novoRef);
  assert.equal(saiu.assignment.articleFormationDecision.role, "principal");
  // Quem ficou também precisa da decisão, senão o reprocessamento reagrupa —
  // e com identidade estável, não com o ref calculado que embute a principal.
  const ficou = plano.patches.find(patch => patch.keywordId === "k1")!;
  assert.ok(isArticleFormationRef(ficou.assignment.articleFormationRef));
  assert.notEqual(ficou.assignment.articleFormationRef, novoRef, "quem fica não vai junto com quem saiu");
  assert.notEqual(ficou.assignment.articleFormationRef, candidato.candidateRef);
});

test("separar a única keyword é recusado", () => {
  const resultado = universo([kw("k1", "mascara facial argila")]);
  const plano = planSplitKeyword({
    universe: resultado,
    keywords: itens(["k1"]),
    candidateRef: resultado.candidates[0].candidateRef,
    keywordId: "k1",
    newFormationRef: newFormationRef("cccccccc-3333-4333-8333-cccccccccccc"),
    mintUuid: "dddddddd-4444-4444-8444-dddddddddddd",
    decidedAt: AGORA,
  });
  assert.equal(plano.refusals[0].code, "SPLIT_LEAVES_CANDIDATE_EMPTY");
});

/* -------------------------- §22 trocar principal ------------------------- */

test("trocar a principal reescreve os papéis do artigo inteiro", () => {
  const resultado = universo([
    kw("k1", "creme skin care", { entity: "creme", problem: "escolher creme" }),
    kw("k2", "cremes skin care", { entity: "creme", problem: "escolher creme" }),
  ]);
  const candidato = resultado.candidates[0];
  const outra = candidato.keywords.find(item => item.keywordId !== candidato.principalKeywordId)!.keywordId;

  const plano = planPrincipalChange({
    universe: resultado,
    keywords: itens(["k1", "k2"]),
    candidateRef: candidato.candidateRef,
    keywordId: outra,
    mintUuid: "dddddddd-4444-4444-8444-dddddddddddd",
    decidedAt: AGORA,
  });

  assert.equal(plano.refusals.length, 0);
  assert.equal(plano.patches.length, 2);
  const principais = plano.patches.filter(patch => patch.assignment.articleFormationDecision.role === "principal");
  assert.equal(principais.length, 1);
  assert.equal(principais[0].keywordId, outra);
});

test("a âncora publicada não perde a liderança", () => {
  const resultado = universo([
    kw("k1", "creme skin care", { isPublished: true, entity: "creme", problem: "escolher creme" }),
    kw("k2", "cremes skin care", { entity: "creme", problem: "escolher creme" }),
  ]);
  const candidato = resultado.candidates[0];

  const plano = planPrincipalChange({
    universe: resultado,
    keywords: itens(["k1", "k2"]),
    candidateRef: candidato.candidateRef,
    keywordId: "k2",
    publishedKeywordIds: new Set(["k1"]),
    mintUuid: "dddddddd-4444-4444-8444-dddddddddddd",
    decidedAt: AGORA,
  });

  assert.equal(plano.patches.length, 0);
  assert.equal(plano.refusals[0].code, "PUBLISHED_KEYWORD_IS_PROTECTED");
});

/* --------- §25 reprocessar não apaga decisão humana em silêncio ---------- */

test("keyword com decisão humana não é reagrupada pela lógica", () => {
  // Sem decisão, estas duas convergiriam num artigo só.
  const juntas = universo([
    kw("k1", "creme skin care", { entity: "creme", problem: "escolher creme" }),
    kw("k2", "cremes skin care", { entity: "creme", problem: "escolher creme" }),
  ]);
  assert.equal(juntas.candidates.length, 1);

  // Com a separação revisada, o reprocessamento respeita os dois artigos.
  const separadas = universo([
    kw("k1", "creme skin care", { entity: "creme", problem: "escolher creme", humanFormationRef: "article-formation:a", humanRole: "principal" }),
    kw("k2", "cremes skin care", { entity: "creme", problem: "escolher creme", humanFormationRef: "article-formation:b", humanRole: "principal" }),
  ]);
  assert.equal(separadas.candidates.length, 2, "reprocessar não pode desfazer a separação revisada");
  assert.ok(separadas.candidates.every(candidate => candidate.origin === "human"));
});

test("agrupamento humano sobrevive mesmo sem convergência lógica", () => {
  const resultado = universo([
    kw("k1", "mascara facial argila", { humanFormationRef: "article-formation:x", humanRole: "principal" }),
    kw("k2", "protetor solar toque seco", { humanFormationRef: "article-formation:x", humanRole: "secundaria" }),
  ]);

  assert.equal(resultado.candidates.length, 1);
  assert.equal(resultado.candidates[0].candidateRef, "article-formation:x");
  assert.equal(resultado.candidates[0].principalKeywordId, "k1");
  assert.equal(resultado.candidates[0].origin, "human");
  // A pontuação continua dizendo o que a lógica enxerga, sem desautorizar.
  assert.match(resultado.candidates[0].scores.intent.reasons.join(" "), /mesma intenção|intenções diferentes/);
});

test("decisão fica stale quando a keyword sai do lote", () => {
  assert.equal(articleFormationDecisionIsStale({
    decidedKeywordIds: ["k1", "k2"],
    currentKeywordIds: new Set(["k1", "k2"]),
  }), false);
  assert.equal(articleFormationDecisionIsStale({
    decidedKeywordIds: ["k1", "k2"],
    currentKeywordIds: new Set(["k1"]),
  }), true);
});

/* ---------------------------- contrato do corte -------------------------- */

test("o planejador não persiste nem cria ArticleDNA", () => {
  // Os comentários explicam o contrato citando o que NÃO se faz aqui; a
  // asserção precisa olhar o código, não a explicação dele.
  const source = readFileSync("lib/arquiteto/article-formation-editing.ts", "utf8")
    .split("\n")
    .filter(line => {
      const trimmed = line.trimStart();
      return !trimmed.startsWith("*") && !trimmed.startsWith("//") && !trimmed.startsWith("/*");
    })
    .join("\n");
  assert.doesNotMatch(source, /fetch\(|supabase|ArticleDNA|persistArquitetoArtifact|createVersionEnvelope/);
  // Escreve pelo writer que já existe: nenhuma persistência paralela.
  assert.match(source, /expectedLock/);
});

test("nenhum subject_type novo é criado para a revisão", () => {
  const decision = readFileSync("lib/arquiteto/article-formation-decision.ts", "utf8");
  assert.doesNotMatch(decision, /SUBJECT_TYPE/);
  assert.match(decision, /payload jsonb do item de workflow/);
});

/* ------------------- identidade estável da decisão ----------------------- */

test("a identidade da decisão não muda quando a principal muda", () => {
  const resultado = universo([
    kw("k1", "creme skin care", { entity: "creme", problem: "escolher creme" }),
    kw("k2", "cremes skin care", { entity: "creme", problem: "escolher creme" }),
  ]);
  const candidato = resultado.candidates[0];
  const outra = candidato.keywords.find(item => item.keywordId !== candidato.principalKeywordId)!.keywordId;

  // O ref calculado embute a principal: usá-lo faria o ponteiro apontar para
  // um candidato que deixa de existir no instante da própria decisão.
  assert.ok(candidato.candidateRef.includes(candidato.principalKeywordId));

  const plano = planPrincipalChange({
    universe: resultado,
    keywords: itens(["k1", "k2"]),
    candidateRef: candidato.candidateRef,
    keywordId: outra,
    mintUuid: "eeeeeeee-5555-4555-8555-eeeeeeeeeeee",
    decidedAt: AGORA,
  });

  const refs = new Set(plano.patches.map(patch => patch.assignment.articleFormationRef));
  assert.equal(refs.size, 1);
  const [ref] = [...refs];
  assert.ok(isArticleFormationRef(ref));
  assert.equal(ref.includes(candidato.principalKeywordId), false);
  assert.equal(ref.includes(outra), false);
});

test("candidato já revisado mantém a identidade que tem", () => {
  const resultado = universo([
    kw("k1", "creme skin care", { humanFormationRef: "article-formation:ja-existe", humanRole: "principal" }),
    kw("k2", "cremes skin care", { humanFormationRef: "article-formation:ja-existe", humanRole: "secundaria" }),
  ]);
  const candidato = resultado.candidates[0];
  assert.equal(candidato.candidateRef, "article-formation:ja-existe");

  const plano = planPrincipalChange({
    universe: resultado,
    keywords: itens(["k1", "k2"]),
    candidateRef: candidato.candidateRef,
    keywordId: "k2",
    mintUuid: "ffffffff-6666-4666-8666-ffffffffffff",
    decidedAt: AGORA,
  });

  // Trocar a principal de novo não pode renomear o artigo revisado.
  assert.ok(plano.patches.every(patch => patch.assignment.articleFormationRef === "article-formation:ja-existe"));
});

test("mover para um candidato calculado converte o destino inteiro", () => {
  const resultado = universo([
    kw("k1", "creme skin care", { entity: "creme", problem: "escolher creme" }),
    kw("k2", "cremes skin care", { entity: "creme", problem: "escolher creme" }),
    kw("k3", "mascara facial argila"),
  ]);
  const destino = resultado.candidates.find(candidate => candidate.keywords.length === 2)!;

  const plano = planMoveKeyword({
    universe: resultado,
    keywords: itens(["k1", "k2", "k3"]),
    keywordId: "k3",
    targetCandidateRef: destino.candidateRef,
    mintUuid: "99999999-7777-4777-8777-999999999999",
    decidedAt: AGORA,
  });

  // Só a keyword movida receberia o ref novo; o resto do destino continuaria
  // agrupado pela lógica e o artigo se partiria em dois.
  assert.equal(plano.patches.length, 3);
  const refs = new Set(plano.patches.map(patch => patch.assignment.articleFormationRef));
  assert.equal(refs.size, 1);
});
