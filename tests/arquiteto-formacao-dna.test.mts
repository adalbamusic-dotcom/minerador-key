import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  articleFormationBaseHash,
  sameArticleAffinity,
  type ArticleFormationKeyword,
} from "../lib/arquiteto/article-formation.ts";
import { intentIsKnown, resolveKeywordDnaSignals } from "../lib/arquiteto/keyword-dna-signals.ts";

/**
 * A FORMAÇÃO DE ARTIGOS CONSOME O KEYWORDDNA.
 *
 * O audit de 2026-09-08 encontrou o motor decidindo por `intent`, `volume` e
 * `kgr` — e o `intent` vinha de `minerador_keywords.intent`, que na Brand real
 * está "Pendente" nas nove keywords enquanto o KeywordDNA já diz "Informativa".
 *
 * Duas consequências, as duas erradas: a intenção canônica era ignorada, e
 * duas keywords "Pendente" contavam como "mesma intenção principal" — ganhando
 * convergência por um campo que ninguém preencheu.
 */

const membro = (over: Partial<ArticleFormationKeyword> & { keywordId: string; keyword: string }): ArticleFormationKeyword => ({
  intent: "Informativa",
  volume: 500,
  kgr: 0.4,
  entity: "skincare",
  problem: null,
  semanticState: "conclusive",
  modifiers: [],
  confidence: "alta",
  dnaVersionId: `keyword_semantic_qualification:brand:${over.keywordId}:v1`,
  dnaContentHash: `sha256:${over.keywordId}`,
  isPublished: false,
  ...over,
});

/* ============================ §12 · Teste A ============================= */

test("A — 'Pendente' na coluna do Minerador não vira intenção da formação", () => {
  /*
   * A leitura canônica: `semanticQualification.intent` manda, e o marcador
   * operacional some. É a MESMA função que a fase Silos usa.
   */
  const sinais = resolveKeywordDnaSignals({
    keywordId: "kw-1",
    text: "skin care noturno",
    semanticQualification: { intent: "Informativa", semanticState: "conclusive" },
    semantic: { intencao_principal: "Pendente" },
  });
  assert.equal(sinais.intent, "Informativa");
  assert.equal(intentIsKnown("Pendente"), false);

  /*
   * E o efeito no motor: duas keywords pendentes NÃO podem contar como "mesma
   * intenção principal". Sem isso, a formação ganhava 0.2 de convergência por
   * um campo vazio, nas nove keywords da Brand real.
   */
  const pendenteA = membro({ keywordId: "a", keyword: "retinol para o rosto", intent: null, entity: null });
  const pendenteB = membro({ keywordId: "b", keyword: "protetor solar facial", intent: null, entity: null });
  const semIntencao = sameArticleAffinity(pendenteA, pendenteB);
  assert.equal(
    semIntencao.reasons.includes("mesma intenção principal"),
    false,
    "duas ausências de intenção viraram convergência",
  );

  // A mesa alimenta o motor com o DNA, não com a coluna.
  const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
  assert.ok(workspace.includes("intent: dna?.intent ?? null,"), "a formação voltou a ler a coluna");
  assert.equal(
    workspace.includes("intent: keyword.analise_semantica?.intencao_principal || keyword.intent || null,"),
    false,
    "a leitura própria da formação voltou",
  );
});

/* ============================ §12 · Teste B ============================= */

test("B — texto próximo, intenção incompatível: não agrupa", () => {
  /*
   * "skincare vitamina c" e "comprar vitamina c skincare" compartilham quase
   * tudo lexicalmente. O DNA diz que uma é Informativa e a outra Transacional
   * — pedem conteúdos diferentes.
   */
  const informativa = membro({ keywordId: "a", keyword: "skincare vitamina c", intent: "Informativa" });
  const transacional = membro({ keywordId: "b", keyword: "comprar skincare vitamina c", intent: "Transacional" });

  const veredito = sameArticleAffinity(informativa, transacional);
  assert.equal(veredito.affinity, 0, "o conflito de intenção não bloqueou");
  assert.match(veredito.reasons.join(" "), /intenções principais diferentes/);

  // Prova de que o veto veio do DNA: mesma dupla, intenções alinhadas.
  const alinhada = sameArticleAffinity(informativa, { ...transacional, intent: "Informativa" });
  assert.ok(alinhada.affinity > 0, "com intenção alinhada as duas deveriam convergir");
});

/* ============================ §12 · Teste C ============================= */

test("C — texto menos parecido, DNA alinhado: o DNA sustenta a formação", () => {
  /*
   * "oleosidade no rosto" e "acne em pele mista" não compartilham token. O que
   * as aproxima é o KeywordDNA: mesma entidade central e modificadores em
   * comum, os dois vindos de qualificação conclusiva.
   */
  const esquerda = membro({
    keywordId: "a", keyword: "oleosidade no rosto",
    entity: "pele oleosa", modifiers: ["controle de oleosidade"],
  });
  const direita = membro({
    keywordId: "b", keyword: "acne em pele mista",
    entity: "pele oleosa", modifiers: ["controle de oleosidade"],
  });

  const comDna = sameArticleAffinity(esquerda, direita);
  assert.ok(comDna.affinity > 0, "o DNA precisa poder sustentar convergência");
  assert.match(comDna.reasons.join(" "), /entidade central \(KeywordDNA conclusivo\)/);
  assert.match(comDna.reasons.join(" "), /modificadores em comum/);

  /*
   * §3/§6 — mas só vindo de DNA CONCLUSIVO. Entidade extraída de qualificação
   * que o próprio Minerador marcou como incerta não sustenta agrupamento.
   */
  const incerto = sameArticleAffinity(
    { ...esquerda, semanticState: "non_conclusive" },
    { ...direita, semanticState: "non_conclusive" },
  );
  assert.equal(
    incerto.reasons.some(motivo => motivo.includes("entidade central")),
    false,
    "entidade de DNA não conclusivo sustentou a formação",
  );
});

test("§3 — funil NÃO é identidade temática", () => {
  const fonte = readFileSync("lib/arquiteto/article-formation.ts", "utf8");
  // O contrato nem carrega funil para a afinidade: TOFU/MOFU explica estágio.
  assert.equal(fonte.includes("funnel"), false, "o funil entrou na formação");
});

/* ============================ §12 · Teste D ============================= */

test("D — mudou o KeywordDNA de um membro, mudou o formationBaseHash", () => {
  const base = {
    siloRefs: ["territory:skincare"],
    keywordIds: ["kw-1", "kw-2"],
    publishedArticlePaths: [] as string[],
    keywordDna: [
      { keywordId: "kw-1", dnaVersionId: "v1", dnaContentHash: "sha256:aaa" },
      { keywordId: "kw-2", dnaVersionId: "v1", dnaContentHash: "sha256:bbb" },
    ],
  };
  const antes = articleFormationBaseHash(base);

  // Mesmo Silo, mesmas keywords, mesmas páginas — só o DNA mudou.
  const depois = articleFormationBaseHash({
    ...base,
    keywordDna: [
      { keywordId: "kw-1", dnaVersionId: "v2", dnaContentHash: "sha256:ccc" },
      { keywordId: "kw-2", dnaVersionId: "v1", dnaContentHash: "sha256:bbb" },
    ],
  });
  assert.notEqual(antes, depois, "o parecer SERP antigo seguiria REUSED sobre outra base");

  // E é estável quando nada muda: ordem não conta.
  const reordenado = articleFormationBaseHash({
    ...base,
    keywordDna: [...base.keywordDna].reverse(),
  });
  assert.equal(antes, reordenado);
});

test("§5 — a mesa passa a proveniência do DNA para o hash", () => {
  const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
  assert.ok(workspace.includes("keywordDna: articleFormationUniverses"));
  assert.ok(workspace.includes("dnaContentHash: dna?.dnaContentHash ?? null,"));
});

/* ======================== §1 · autoridade única ========================= */

test("§1 — Silos e Artigos leem o KeywordDNA pela MESMA função", () => {
  const formacao = readFileSync("lib/arquiteto/article-formation.ts", "utf8");
  const proposta = readFileSync("lib/arquiteto/architecture-working-proposal.ts", "utf8");

  // Nenhum dos dois tem normalização própria de intenção.
  assert.ok(formacao.includes('from "./keyword-dna-signals'));
  assert.ok(proposta.includes('from "./keyword-dna-signals'));
  assert.equal(
    formacao.includes('(value || "").trim().toLowerCase() || null'),
    false,
    "a normalização própria da formação voltou",
  );
  assert.equal(proposta.includes("const MARCADORES_SEM_INTENCAO"), false, "a cópia da lista voltou");

  const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
  // Uma extração só, consumida pelas duas fases.
  assert.equal(
    (workspace.match(/resolveKeywordDnaSignals\(\{/g) || []).length,
    1,
    "apareceu uma segunda extração de KeywordDNA",
  );
});
