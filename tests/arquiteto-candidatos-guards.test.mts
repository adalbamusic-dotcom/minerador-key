import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  detectCandidateOverlap,
  detectSlugCollisions,
  reservedForSiloPage,
  slugKey,
  unresolvedCannibalization,
  type CandidateOverlapInput,
} from "../lib/arquiteto/article-candidate-guards.ts";
import {
  buildArticleFormationConfirmationPlan,
  validateFormationConclusion,
} from "../lib/arquiteto/article-formation-confirmation.ts";
import { buildArticleFormationUniverse, type ArticleFormationKeyword } from "../lib/arquiteto/article-formation.ts";

const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");

/**
 * O CASO REAL DA HOMOLOGAÇÃO — §11.
 *
 * Brand care-glow, 2026-09-08. Silo `skincare` confirmado, SiloPage `/skincare`,
 * nove keywords. O agrupador provisório produziu três candidatos e dois
 * estragos de SEO:
 *
 *   1. `skincare` — a identidade da SiloPage — virou Principal de um Article
 *      com slug `skincare`;
 *   2. `skin care para peles oleosas` e `skin care pele oleosa` viraram dois
 *      artigos sobre o mesmo assunto.
 */

const SILO_PAGE = { slug: "/skincare", centralEntity: "skincare", name: "skincare" };

const KEYWORDS = [
  { keywordId: "kw-1", text: "skincare" },
  { keywordId: "kw-2", text: "skincare vitamina c" },
  { keywordId: "kw-3", text: "skincare para pele oleosa" },
  { keywordId: "kw-4", text: "skin care noturno" },
  { keywordId: "kw-5", text: "skin care nivea" },
  { keywordId: "kw-6", text: "skin care pele oleosa" },
  { keywordId: "kw-7", text: "skin care para peles oleosas" },
  { keywordId: "kw-8", text: "mascara facial skin care" },
  { keywordId: "kw-9", text: "pele oleosa e acne" },
];

/* ===================== §1/§2/§10 · a SiloPage é reservada ============== */

test("§1 — a keyword que É a SiloPage não entra como Principal de Article", () => {
  const reservadas = reservedForSiloPage({ siloPage: SILO_PAGE, keywords: KEYWORDS });
  assert.ok(reservadas.has("kw-1"), "`skincare` precisa ficar reservada para a SiloPage");

  /*
   * §2 — reservar não é apagar. As outras oito continuam elegíveis; o que a
   * reserva impede é a página do Silo competir com um artigo do próprio Silo.
   */
  assert.equal(reservadas.size, 1);
  for (const outra of ["kw-2", "kw-3", "kw-4", "kw-9"]) {
    assert.equal(reservadas.has(outra), false, `${outra} foi reservada indevidamente`);
  }
});

test("§1 — a reserva reconhece grafia e barra, não exige texto idêntico", () => {
  const porSlug = reservedForSiloPage({
    siloPage: { slug: "/skin-care", centralEntity: null, name: null },
    keywords: [{ keywordId: "a", text: "skin care" }, { keywordId: "b", text: "skin care noturno" }],
  });
  assert.deepEqual([...porSlug], ["a"]);

  // Sem identidade declarada não há reserva: o silêncio não reserva nada.
  const semIdentidade = reservedForSiloPage({
    siloPage: { slug: null, centralEntity: null, name: null },
    keywords: KEYWORDS,
  });
  assert.equal(semIdentidade.size, 0);
});

/* ========================= §6 · colisão de endereço ==================== */

test("§6 — slug igual ao da SiloPage é bloqueio, não aviso", () => {
  const colisoes = detectSlugCollisions({
    siloPage: SILO_PAGE,
    candidates: [
      { candidateRef: "cand-a", slug: "skincare", label: "skincare" },
      { candidateRef: "cand-b", slug: "skin-care-noturno", label: "skin care noturno" },
    ],
  });
  assert.equal(colisoes.length, 1);
  assert.equal(colisoes[0].kind, "EXACT_SLUG_COLLISION");
  assert.equal(colisoes[0].candidateRef, "cand-a");
  assert.match(colisoes[0].detail, /mesmo endereço da SiloPage/);
});

test("§6 — dois candidatos disputando o mesmo endereço também é colisão", () => {
  const colisoes = detectSlugCollisions({
    siloPage: SILO_PAGE,
    candidates: [
      { candidateRef: "cand-a", slug: "skin-care-pele-oleosa", label: "skin care pele oleosa" },
      { candidateRef: "cand-b", slug: "/skin-care-pele-oleosa/", label: "skin care pele oleosa (2)" },
    ],
  });
  assert.equal(colisoes.length, 1);
  assert.match(colisoes[0].detail, /disputam o mesmo endereço/);

  // E contra ArticleDNA já aprovado do mesmo Silo.
  const contraAprovado = detectSlugCollisions({
    siloPage: SILO_PAGE,
    candidates: [{ candidateRef: "cand-a", slug: "skin-care-noturno", label: "skin care noturno" }],
    approvedSlugs: ["/skin-care-noturno"],
  });
  assert.equal(contraAprovado.length, 1);
  assert.match(contraAprovado[0].against, /ArticleDNA aprovado/);
});

test("slugKey normaliza barra, acento e ruído", () => {
  assert.equal(slugKey("/Skin Care Pele Oleosa/"), "skin-care-pele-oleosa");
  assert.equal(slugKey("máscara facial"), "mascara-facial");
  assert.equal(slugKey(null), "");
});

/* ==================== §3/§4/§5 · sobreposição e SERP =================== */

const membro = (
  keywordId: string,
  text: string,
  over: Partial<CandidateOverlapInput["members"][number]> = {},
): CandidateOverlapInput["members"][number] => ({
  keywordId,
  text,
  intent: "Informativa",
  centralEntity: "pele oleosa",
  modifiers: ["pele oleosa"],
  semanticState: "conclusive",
  ...over,
});

const OLEOSA_A: CandidateOverlapInput = {
  candidateRef: "cand-a",
  label: "skin care para peles oleosas",
  slug: "skin-care-para-peles-oleosas",
  members: [
    membro("kw-7", "skin care para peles oleosas"),
    membro("kw-3", "skincare para pele oleosa"),
  ],
};

const OLEOSA_B: CandidateOverlapInput = {
  candidateRef: "cand-b",
  label: "skin care pele oleosa",
  slug: "skin-care-pele-oleosa",
  members: [membro("kw-6", "skin care pele oleosa"), membro("kw-9", "pele oleosa e acne")],
};

test("§3 — os dois candidatos de pele oleosa são marcados como risco", () => {
  const riscos = detectCandidateOverlap({ candidates: [OLEOSA_A, OLEOSA_B] });
  assert.equal(riscos.length, 1, "a sobreposição real não foi detectada");
  const risco = riscos[0];
  assert.ok(risco.score >= 0.5);
  assert.match(risco.reasons.join(" · "), /núcleo|entidade central/);
  // Sem intenções divergentes, a hipótese padrão é que são o mesmo assunto.
  assert.equal(risco.intentsDiverge, false);
});

test("§4 — intenções declaradas diferentes dão lastro para separar", () => {
  const comercial: CandidateOverlapInput = {
    ...OLEOSA_B,
    members: OLEOSA_B.members.map(item => ({ ...item, intent: "Transacional" })),
  };
  const riscos = detectCandidateOverlap({ candidates: [OLEOSA_A, comercial] });
  assert.equal(riscos.length, 1, "o risco continua existindo: quem decide é a SERP");
  assert.equal(riscos[0].intentsDiverge, true);
  assert.match(riscos[0].reasons.join(" "), /intenções declaradas diferentes/);
});

test("§3 — candidatos de assuntos diferentes não viram risco", () => {
  const protetor: CandidateOverlapInput = {
    candidateRef: "cand-c",
    label: "protetor solar facial",
    slug: "protetor-solar-facial",
    members: [membro("kw-x", "protetor solar facial", { centralEntity: "protetor solar", modifiers: ["fps"] })],
  };
  assert.deepEqual(detectCandidateOverlap({ candidates: [OLEOSA_A, protetor] }), []);
});

/**
 * A FALSIFICAÇÃO — o detector precisa ERRAR pouco, não só acertar o caso fácil.
 *
 * Comparados crus, "skin care noturno" e "skin care nivea" dividem `skin`,
 * `care` e `skincare`: 0,43 de sobreposição léxica, mais a entidade central do
 * Silo, e a portaria acusaria canibalização entre uma rotina noturna e uma
 * marca. Dentro de um Silo, o termo do Silo não distingue ninguém — e este
 * teste é o que impede a detecção de virar ruído sobre o Silo inteiro.
 */
test("§3 — o termo do Silo não é evidência de sobreposição entre seus artigos", () => {
  const noturno: CandidateOverlapInput = {
    candidateRef: "cand-noturno",
    label: "skin care noturno",
    slug: "skin-care-noturno",
    members: [membro("kw-4", "skin care noturno", { centralEntity: "skincare", modifiers: ["noturno"] })],
  };
  const nivea: CandidateOverlapInput = {
    candidateRef: "cand-nivea",
    label: "skin care nivea",
    slug: "skin-care-nivea",
    members: [membro("kw-5", "skin care nivea", { centralEntity: "skincare", modifiers: ["nivea"] })],
  };

  assert.deepEqual(
    detectCandidateOverlap({ candidates: [noturno, nivea], siloPage: SILO_PAGE }),
    [],
    "rotina noturna e marca não são o mesmo artigo",
  );

  // E o par que É o mesmo assunto continua sendo acusado com o Silo descontado.
  const riscos = detectCandidateOverlap({ candidates: [OLEOSA_A, OLEOSA_B], siloPage: SILO_PAGE });
  assert.equal(riscos.length, 1, "descontar o Silo não pode apagar a canibalização real");
  assert.ok(riscos[0].score >= 0.5);
});

test("§3 — singular e plural são o mesmo assunto", () => {
  const plural: CandidateOverlapInput = {
    candidateRef: "cand-plural",
    label: "skin care para peles oleosas",
    slug: "skin-care-para-peles-oleosas",
    members: [membro("kw-7", "skin care para peles oleosas")],
  };
  const singularCand: CandidateOverlapInput = {
    candidateRef: "cand-singular",
    label: "skin care pele oleosa",
    slug: "skin-care-pele-oleosa",
    members: [membro("kw-6", "skin care pele oleosa")],
  };
  const riscos = detectCandidateOverlap({ candidates: [plural, singularCand], siloPage: SILO_PAGE });
  assert.equal(riscos.length, 1, "'peles oleosas' e 'pele oleosa' são a mesma busca dita de dois jeitos");
});

test("§5 — o risco só é resolvido depois do confronto de SERP", () => {
  const riscos = detectCandidateOverlap({ candidates: [OLEOSA_A, OLEOSA_B] });
  assert.equal(unresolvedCannibalization({ risks: riscos }).length, 1);

  // Confrontado pela SERP, sai da pendência — em qualquer ordem do par.
  const resolvido = unresolvedCannibalization({
    risks: riscos,
    resolvedPairs: [{ left: "cand-b", right: "cand-a" }],
  });
  assert.deepEqual(resolvido, []);
});

/* =============== §11 · a fiação, não só o domínio ===================== */

test("§11 — a reserva da SiloPage chega ao universo de formação", () => {
  /*
   * O guard sozinho não protege nada: quem decide se uma keyword vira linha
   * de artigo é `reservedSiloHeadIds`, e ele vinha SÓ da heurística de
   * cluster, que não conhece a SiloPage confirmada. Era por isso que
   * `skincare` virava Principal de um artigo dentro do Silo `/skincare`.
   */
  const trecho = workspace.slice(workspace.indexOf("const reservedSiloHeadIds"));
  const corpo = trecho.slice(0, trecho.indexOf("\n  }, ["));
  assert.match(corpo, /reservedForSiloPage\(\{/);
  assert.match(corpo, /siloIsHumanDecided\(item\.territory\.lifecycleStatus\)/);
  // A identidade vem do território confirmado, não de um campo do artigo.
  assert.match(corpo, /slugState\?\.confirmed/);
  assert.match(corpo, /centralEntity/);
  // E a linha de artigo continua consultando essa reserva.
  assert.match(workspace, /if \(reservedSiloHeadIds\.has\(String\(kw\.id\)\)\) return;/);
});

test("§12 — o risco aparece na tela antes de processar, e diz quem decide", () => {
  assert.match(workspace, /data-testid="architect-candidate-overlap-risk"/);
  assert.match(workspace, /data-testid="architect-candidate-slug-collision"/);
  // A tela não pede decisão agora: ela nomeia quem vai decidir.
  assert.match(workspace, /Será validado pela SERP em Processar artigos/);
  // E o Silo é DESCONTADO da comparação; sem isso todo par do Silo acende.
  const guards = workspace.slice(workspace.indexOf("const candidateGuards"));
  assert.match(guards.slice(0, guards.indexOf("\n  }, [")), /detectCandidateOverlap\(\{ candidates: candidatos, siloPage \}\)/);
});

/* ================= §5 · a portaria de Concluir formação ================ */

const SILO_REF = "territory:22222222-2222-4222-8222-222222222222";

const kwFormacao = (id: string, keyword: string): ArticleFormationKeyword => ({
  keywordId: id, keyword, intent: "informacional", volume: 100, kgr: null,
  entity: null, problem: null, isPublished: false,
});

const cenarioDeDoisCandidatos = () => {
  const universe = buildArticleFormationUniverse({
    siloRef: SILO_REF, siloLabel: "Skincare", siloSlug: "/skincare",
    groups: [
      { principalKeywordId: "k1", keywordIds: ["k1"] },
      { principalKeywordId: "k2", keywordIds: ["k2"] },
    ],
    keywords: [
      kwFormacao("k1", "skin care para peles oleosas"),
      kwFormacao("k2", "skin care pele oleosa"),
    ],
  });
  const plan = buildArticleFormationConfirmationPlan({ universes: [universe] });
  // A SERP passa: o que se está isolando aqui é a canibalização, não a coleta.
  const serpGates = new Map(plan.approved.map(entry => [entry.candidateRef, {
    state: "current_supported", blocksConclusion: false, requiresHumanDecision: false, reason: "",
  }]));
  return { universe, plan, serpGates };
};

test("§5 — dois candidatos do mesmo Silo sobre o mesmo assunto barram a conclusão", () => {
  const { universe, plan, serpGates } = cenarioDeDoisCandidatos();
  assert.equal(plan.approved.length, 2, "os dois candidatos precisam estar prontos para gravar");

  const comum = {
    universes: [universe],
    plan,
    keywordSiloRef: new Map([["k1", SILO_REF], ["k2", SILO_REF]]),
    ceiling: 6,
    serpGates,
  };

  const semRisco = validateFormationConclusion(comum);
  assert.equal(semRisco.ok, true, "sem par aberto, a conclusão passa");

  const comRisco = validateFormationConclusion({
    ...comum,
    unresolvedCannibalization: [{
      left: plan.approved[0].candidateRef,
      right: plan.approved[1].candidateRef,
      leftLabel: "skin care para peles oleosas",
      rightLabel: "skin care pele oleosa",
      reasons: ["mesma entidade central no KeywordDNA"],
    }],
  });
  assert.equal(comRisco.ok, false, "gravar os dois seria carimbar a canibalização no acervo");
  const gate = comRisco.gates.find(item => item.code === "NO_UNRESOLVED_CANNIBALIZATION");
  assert.ok(gate && !gate.ok);
  // A recusa nomeia os dois e diz a saída: um beco sem saída não é portaria.
  assert.match(gate.detail, /skin care para peles oleosas/);
  assert.match(gate.detail, /skin care pele oleosa/);
  assert.match(gate.detail, /Una os dois num só artigo ou diferencie a composição/);
});

test("§5 — par com um lado fora do lote não trava quem estava pronto", () => {
  const { universe, plan, serpGates } = cenarioDeDoisCandidatos();
  const veredito = validateFormationConclusion({
    universes: [universe],
    plan,
    keywordSiloRef: new Map([["k1", SILO_REF], ["k2", SILO_REF]]),
    ceiling: 6,
    serpGates,
    // O outro lado nem vai ser escrito: a canibalização não chega ao acervo.
    unresolvedCannibalization: [{
      left: plan.approved[0].candidateRef,
      right: "candidate:fora-do-lote",
      reasons: ["mesma entidade central no KeywordDNA"],
    }],
  });
  assert.equal(veredito.ok, true);
  assert.equal(veredito.gates.find(item => item.code === "NO_UNRESOLVED_CANNIBALIZATION")?.ok, true);
});

test("§5 — a portaria da tela recebe os pares detectados", () => {
  const trecho = workspace.slice(workspace.indexOf("const confirmArticleFormation"));
  const corpo = trecho.slice(0, trecho.indexOf("\n  }, ["));
  assert.match(corpo, /unresolvedCannibalization: unresolvedCannibalization\(\{ risks: candidateGuards\.pares \}\)/);
  // Com nome, não com ref: a pessoa precisa saber QUAIS artigos são.
  assert.match(corpo, /leftLabel: candidateGuards\.rotuloDoCandidato\.get\(par\.left\)/);
});

test("§6 — endereço quase igual é sinalizado, sem virar bloqueio", () => {
  const colisoes = detectSlugCollisions({
    siloPage: SILO_PAGE,
    candidates: [
      { candidateRef: "cand-a", slug: "skin-care-pele-oleosa", label: "skin care pele oleosa" },
      { candidateRef: "cand-b", slug: "skin-care-para-peles-oleosas", label: "skin care para peles oleosas" },
    ],
  });
  assert.equal(colisoes.length, 1);
  assert.equal(colisoes[0].kind, "NEAR_TOPIC_COLLISION", "não é o mesmo endereço, é o mesmo endereço reescrito");
  assert.match(colisoes[0].detail, /mesmo endereço com outra formulação/);

  // E o par que só divide o Silo continua livre.
  assert.deepEqual(detectSlugCollisions({
    siloPage: SILO_PAGE,
    candidates: [
      { candidateRef: "cand-c", slug: "skin-care-noturno", label: "skin care noturno" },
      { candidateRef: "cand-d", slug: "skin-care-nivea", label: "skin care nivea" },
    ],
  }), []);
});
