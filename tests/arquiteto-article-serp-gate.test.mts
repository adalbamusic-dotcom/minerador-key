import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildArticleFormationUniverse, type ArticleFormationKeyword } from "../lib/arquiteto/article-formation.ts";
import {
  ARTICLE_SERP_STATE_LABELS,
  resolveArticleFormationSerpState,
  serpAwaitsHuman,
  serpNeedsCollection,
  serpWasExecutedFor,
  articleSerpBaseHash,
  articleSerpBaseOf,
  resolveArticleSerpGate,
  serpVerdictOfAssessment,
  summarizeArticleSerpGate,
} from "../lib/arquiteto/article-serp-gate.ts";

const SILO = "territory:11111111-1111-4111-8111-111111111111";

const kw = (id: string, keyword: string): ArticleFormationKeyword => ({
  keywordId: id, keyword, intent: "informacional", volume: 100, kgr: null,
  entity: null, problem: null, isPublished: false,
});

const KEYWORDS = [
  kw("k1", "skin care para peles oleosas"),
  kw("k2", "skin care pele oleosa masculina"),
  kw("k3", "skin care rosto oleoso"),
];
const INTENTS = new Map(KEYWORDS.map(item => [item.keywordId, item.intent]));

const universo = (groups: { principalKeywordId: string; keywordIds: string[] }[]) =>
  buildArticleFormationUniverse({
    siloRef: SILO, siloLabel: "Skin care", siloSlug: "/skin-care", groups, keywords: KEYWORDS,
  });

const baseDe = (groups: { principalKeywordId: string; keywordIds: string[] }[], index = 0) =>
  articleSerpBaseOf({
    candidate: universo(groups).candidates[index],
    intentByKeywordId: INTENTS,
    siloContext: { centralEntity: "skin care", macroIntent: "informacional" },
  });

/* ------------------- a base descreve a composição exata ------------------ */

test("a mesma composição produz a mesma base", () => {
  const grupos = [{ principalKeywordId: "k1", keywordIds: ["k1", "k2", "k3"] }];
  assert.equal(articleSerpBaseHash(baseDe(grupos)), articleSerpBaseHash(baseDe(grupos)));
});

test("trocar a Principal muda a base", () => {
  const antes = baseDe([{ principalKeywordId: "k1", keywordIds: ["k1", "k2", "k3"] }]);
  const depois = baseDe([{ principalKeywordId: "k2", keywordIds: ["k1", "k2", "k3"] }]);
  assert.notEqual(articleSerpBaseHash(antes), articleSerpBaseHash(depois));
});

test("tirar uma keyword muda a base", () => {
  const antes = baseDe([{ principalKeywordId: "k1", keywordIds: ["k1", "k2", "k3"] }]);
  const depois = baseDe([{ principalKeywordId: "k1", keywordIds: ["k1", "k2"] }]);
  assert.notEqual(articleSerpBaseHash(antes), articleSerpBaseHash(depois));
});

test("o papel entra na base: perguntamos à SERP se cabe como reforço", () => {
  const base = baseDe([{ principalKeywordId: "k1", keywordIds: ["k1", "k2"] }]);
  const comReforco = {
    ...base,
    roles: base.roles.map(item => item.keywordId === "k2" ? { ...item, role: "reforco" as const } : item),
  };
  assert.notEqual(articleSerpBaseHash(base), articleSerpBaseHash(comReforco));
});

test("a ordem das keywords não muda a base", () => {
  const base = baseDe([{ principalKeywordId: "k1", keywordIds: ["k1", "k2", "k3"] }]);
  const invertida = { ...base, roles: [...base.roles].reverse(), intents: [...base.intents].reverse() };
  assert.equal(articleSerpBaseHash(base), articleSerpBaseHash(invertida));
});

test("o contexto do Silo muda a pergunta feita ao mercado", () => {
  const candidate = universo([{ principalKeywordId: "k1", keywordIds: ["k1", "k2"] }]).candidates[0];
  const a = articleSerpBaseOf({ candidate, intentByKeywordId: INTENTS, siloContext: { centralEntity: "skin care" } });
  const b = articleSerpBaseOf({ candidate, intentByKeywordId: INTENTS, siloContext: { centralEntity: "protetor solar" } });
  assert.notEqual(articleSerpBaseHash(a), articleSerpBaseHash(b));
});

/* --------------------------- o gate propriamente ------------------------- */

const gate = (observed: Parameters<typeof resolveArticleSerpGate>[0]["observed"], extra = {}) =>
  resolveArticleSerpGate({ candidateRef: "cand", expectedBaseHash: "serpbase:aaa", observed, ...extra });

test("sem evidência o artigo não conclui", () => {
  const resultado = gate(null);
  assert.equal(resultado.state, "missing");
  assert.equal(resultado.blocksConclusion, true);
});

test("evidência de outra composição é desatualizada, nunca atual", () => {
  const resultado = gate({ formationBaseHash: "serpbase:bbb", verdict: "COMPATIBLE" });
  assert.equal(resultado.state, "stale");
  assert.equal(resultado.blocksConclusion, true);
  assert.match(resultado.reason, /A composição mudou/);
});

test("avaliação anterior ao gate não passa por atual", () => {
  // Ela não declara o que observou; tratá-la como vigente seria autorizar a
  // gravação com base numa evidência que talvez fale de outro artigo.
  const resultado = gate({ formationBaseHash: null, verdict: "COMPATIBLE" });
  assert.equal(resultado.state, "stale");
  assert.match(resultado.reason, /não declara qual composição observou/);
});

test("compatível e vigente libera a conclusão", () => {
  const resultado = gate({ formationBaseHash: "serpbase:aaa", verdict: "COMPATIBLE" });
  assert.equal(resultado.state, "current_supported");
  assert.equal(resultado.blocksConclusion, false);
});

test("divergência bloqueia até um humano decidir", () => {
  const sem = gate({ formationBaseHash: "serpbase:aaa", verdict: "DIVERGENCE" });
  assert.equal(sem.state, "current_divergent_unresolved");
  assert.equal(sem.blocksConclusion, true);
  assert.equal(sem.requiresHumanDecision, true);

  const com = gate({ formationBaseHash: "serpbase:aaa", verdict: "DIVERGENCE", humanDecisionBaseHash: "serpbase:aaa" });
  assert.equal(com.blocksConclusion, false);
});

test("decisão humana de outra composição não vale para esta", () => {
  const resultado = gate({ formationBaseHash: "serpbase:aaa", verdict: "DIVERGENCE", humanDecisionBaseHash: "serpbase:bbb" });
  assert.equal(resultado.blocksConclusion, true);
});

test("evidência insuficiente não vira aprovação silenciosa", () => {
  const resultado = gate({ formationBaseHash: "serpbase:aaa", verdict: "INCONCLUSIVE" });
  assert.equal(resultado.state, "current_inconclusive_unresolved");
  assert.equal(resultado.requiresHumanDecision, true);
  assert.match(resultado.reason, /não confirma nem rejeita/);
});

test("falha de coleta não é dispensa de evidência", () => {
  const resultado = gate({ formationBaseHash: "serpbase:aaa", verdict: "COMPATIBLE" }, { failed: true });
  assert.equal(resultado.state, "failed");
  assert.equal(resultado.blocksConclusion, true);
});

test("nenhum estado do gate se chama 'não necessária'", () => {
  for (const label of Object.values(ARTICLE_SERP_STATE_LABELS)) {
    assert.doesNotMatch(label, /não necessária|nao necessaria/i);
  }
  const source = readFileSync("lib/arquiteto/article-serp-gate.ts", "utf8");
  assert.match(source, /"Não necessária" NÃO existe aqui/);
});

/* ---------------------- o parecer lido da avaliação ---------------------- */

const parecer = (extra: Partial<Parameters<typeof serpVerdictOfAssessment>[0]> = {}) =>
  serpVerdictOfAssessment({
    intentCompatibility: "coerente",
    conflicts: [],
    recommendations: [{ action: "manter_secundaria", confidence: "alta" }],
    ...extra,
  });

test("intenção insuficiente é inconclusiva, não compatível", () => {
  assert.equal(parecer({ intentCompatibility: "insuficiente" }), "INCONCLUSIVE");
});

test("evidência só de confiança inconclusiva não aprova", () => {
  assert.equal(parecer({ recommendations: [{ action: "manter_secundaria", confidence: "inconclusiva" }] }), "INCONCLUSIVE");
});

test("recomendação de separar ou promover é divergência", () => {
  assert.equal(parecer({ recommendations: [{ action: "separar_artigo", confidence: "alta" }] }), "DIVERGENCE");
  assert.equal(parecer({ recommendations: [{ action: "tornar_principal", confidence: "alta" }] }), "DIVERGENCE");
  assert.equal(parecer({ recommendations: [{ action: "retirar_do_artigo", confidence: "media" }] }), "DIVERGENCE");
});

test("separar com confiança alta vence a leitura fraca do grupo", () => {
  // Foi o caso real do lote: intenção geral insuficiente, mas UMA busca com
  // recomendação específica e confiante. Rebaixar isso a inconclusiva
  // esconderia o achado mais acionável.
  assert.equal(parecer({
    intentCompatibility: "insuficiente",
    recommendations: [
      { action: "revisar_humano", confidence: "inconclusiva" },
      { action: "separar_artigo", confidence: "alta" },
    ],
  }), "DIVERGENCE");
});

test("conflito de intenção não declarada não é divergência", () => {
  // O domínio da SERP registra: ausência de cobertura é evidência
  // insuficiente, não conflito. No lote real todo conflito era "intenção
  // esperada (unknown)" — lacuna do Minerador, não discordância do mercado.
  assert.equal(parecer({ conflicts: ["A intenção esperada (unknown) não coincide com a aparente."] }), "INCONCLUSIVE");
});

test("manter tudo, sem conflito e com intenção coerente, é compatível", () => {
  assert.equal(parecer(), "COMPATIBLE");
});

/* --------------------------- leitura do lote ----------------------------- */

test("o resumo diz quem precisa de coleta nova", () => {
  const resumo = summarizeArticleSerpGate([
    resolveArticleSerpGate({ candidateRef: "a", expectedBaseHash: "x", observed: { formationBaseHash: "x", verdict: "COMPATIBLE" } }),
    resolveArticleSerpGate({ candidateRef: "b", expectedBaseHash: "x", observed: null }),
    resolveArticleSerpGate({ candidateRef: "c", expectedBaseHash: "x", observed: { formationBaseHash: "y", verdict: "COMPATIBLE" } }),
    resolveArticleSerpGate({ candidateRef: "d", expectedBaseHash: "x", observed: { formationBaseHash: "x", verdict: "DIVERGENCE" } }),
  ]);
  assert.equal(resumo.total, 4);
  assert.equal(resumo.supported, 1);
  assert.equal(resumo.blocking, 3);
  // Divergência não pede coleta nova: pede decisão humana.
  assert.deepEqual(resumo.needsCollection, ["b", "c"]);
});

/* --------------------------- pureza do domínio --------------------------- */

test("o gate é leitura: não chama provider nem persiste", () => {
  const source = readFileSync("lib/arquiteto/article-serp-gate.ts", "utf8")
    .split("\n")
    .filter(line => {
      const trimmed = line.trimStart();
      return !trimmed.startsWith("*") && !trimmed.startsWith("//") && !trimmed.startsWith("/*");
    })
    .join("\n");
  assert.doesNotMatch(source, /fetch\(|supabase|dataforseo|callStrategicApi|persist/i);
});

/* ---------------- §1/§12 a SERP é gate, não refinamento ------------------ */

const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
const review = readFileSync("modules/arquiteto/article-formation-review.tsx", "utf8");
const panel = readFileSync("modules/arquiteto/article-formation-panel.tsx", "utf8");

test("a tela nunca diz que a SERP é dispensável em Article novo", () => {
  // O rótulo saiu do que a tela RENDERIZA; o comentário que explica a regra
  // continua, e é ele que impede alguém reintroduzir o estado sem perceber.
  // A asserção olha o BLOCO da decisão: os comentários acima citam as duas
  // saídas proibidas de propósito, porque são a regra que eles explicam.
  const bloco = review.slice(review.indexOf("architect-serp-resolution"));
  assert.doesNotMatch(bloco.slice(0, 2000), /Aplicar SERP|Ignorar SERP/i);
  // E ela exige motivo.
  assert.match(review, /serpReason\.trim\(\)\.length < 8/);

  const route = readFileSync("app/api/arquiteto/serp-resolution/route.ts", "utf8");
  assert.match(route, /formationBaseHash: parsed\.data\.formationBaseHash/);
  assert.match(route, /A decisão não voltou na releitura remota/);
});
