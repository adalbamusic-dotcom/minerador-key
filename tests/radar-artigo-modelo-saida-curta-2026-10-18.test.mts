import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  RADAR_ARTICLE_BLUEPRINT_LIMITS,
  RADAR_ARTICLE_BLUEPRINT_SHORT_LIMITS,
  RadarArticleBlueprintAiSchema,
  buildRadarArticleBlueprintBrief,
  radarArticleBlueprintPrompt,
  radarArticleBlueprintShortOutputRule,
} from "../lib/radar/article-blueprint.ts";
import { RADAR_COMPETITIVE_READING_LIMITS } from "../lib/radar/competitive-reading.ts";
import { RADAR_HUMAN_VOICE_H2, RADAR_HUMAN_VOICE_TITLE_OPTIONS } from "../lib/radar/human-voice-guideline.ts";
import { requestRadarArticleBlueprintAi } from "../lib/server/radar-article-blueprint.ts";
import { OPENROUTER_REASONING_HEADROOM } from "../lib/server/openrouter-provider.ts";
import { ARTIGO, entradaGoogle, planoDoSilo } from "./radar-portable-writing-fixtures.mts";

/*
 * ===== 2026-10-18 · A SAÍDA CURTA CABE NO TETO (teste real local, WifiConecta) =====
 *
 * O Pilar "planos de internet residencial" (22 blocos propostos, 48
 * necessidades, 95 fontes, 18 páginas comparáveis) finalizou a investigação,
 * e o artigo-modelo falhou com 502: "A resposta da IA veio cortada (passou do
 * tamanho máximo), mesmo depois de 1 nova tentativa com saída mais curta".
 *
 * A causa: o pedido não diz o tamanho de nenhum texto, e a saída curta só
 * encolhia seções, H3, explain, alternativas e a análise competitiva. O resto
 * seguia nos tetos do ESQUEMA, que só cortam depois de a IA escrever. Aqui se
 * monta a MAIOR resposta que cada versão do pedido curto permite e se mede:
 * a de antes passava do teto; a de agora cabe com folga. Também se prova que o
 * esquema não corta nada do que a saída curta permite, que o pedido diz cada
 * número, que a nova tentativa vai com ela, e que os botões de sempre chegam a
 * esta linha (nenhuma porta nova).
 *
 * Estimativa de tokens: caracteres do JSON / 3,5 (JSON com português do
 * Brasil; o lado conservador da faixa de 3,5 a 4). PROVIDER_CALLS = 0.
 */

const idasAoServidor: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    idasAoServidor.push(String((entrada as { url?: string })?.url || entrada));
    return Promise.reject(new Error("REDE PROIBIDA NESTE GATE"));
  },
  writable: true, configurable: true,
});

const L = RADAR_ARTICLE_BLUEPRINT_LIMITS;
const C = RADAR_ARTICLE_BLUEPRINT_SHORT_LIMITS;
const CARACTERES_POR_TOKEN = 3.5;
/* A keyword é copiada do pacote (não tem teto no pedido): a cauda longa real fica abaixo disto. */
const KEYWORD_LONGA = 60;

type Tetos = {
  head: number; sentence: number; competitive: number; term: number; anchor: number; reason: number; seoTitle: number; meta: number; imagePrompt: number;
  sections: number; h3: number; explain: number; bold: number; terms: number; ids: number; internal: number; external: number; practical: number;
  complementary: number; alternatives: number; variants: number; discarded: number; perBlock: number; seenIn: number; kept: number; dropped: number;
  method: number; localSignals: number; visual: number; eeat: number; warnings: number; turnAndCta: boolean;
};

/* A saída curta de agora, pelos tetos que o pedido diz. */
const CURTA_AGORA: Tetos = {
  head: C.headingChars, sentence: C.sentenceChars, competitive: C.competitiveChars, term: C.termChars, anchor: C.anchorChars, reason: C.reasonChars,
  seoTitle: C.seoTitleChars, meta: C.metaChars, imagePrompt: C.imagePromptChars,
  sections: C.sections, h3: C.h3, explain: C.explain, bold: C.bold, terms: C.terms, ids: C.ids, internal: C.internalLinks, external: C.externalLinks,
  practical: C.practicalSections, complementary: C.complementary, alternatives: RADAR_HUMAN_VOICE_TITLE_OPTIONS - 1, variants: C.semanticVariants,
  discarded: C.discarded, perBlock: C.competitivePerBlock, seenIn: C.seenIn, kept: C.questionsKept, dropped: 0,
  method: C.method, localSignals: C.localSignals, visual: 1 + C.respiros, eeat: C.eeat, warnings: C.warnings, turnAndCta: false,
};

/* A saída curta de antes: os números que ela dizia; o resto, nos tetos do esquema (o pedido não dizia tamanho). */
const CURTA_ANTES: Tetos = {
  head: L.shortChars, sentence: L.textChars, competitive: L.textChars, term: L.termChars, anchor: L.shortChars, reason: L.shortChars,
  seoTitle: L.shortChars, meta: L.metaChars, imagePrompt: 250,
  sections: 5, h3: 2, explain: 2, bold: L.bold, terms: L.terms, ids: L.from, internal: L.internalLinks, external: L.externalLinks,
  practical: 5, complementary: L.complementary, alternatives: 0, variants: 12, discarded: L.discarded, perBlock: 2, seenIn: 4,
  kept: RADAR_COMPETITIVE_READING_LIMITS.questionsKept, dropped: 0, method: 1, localSignals: 2, visual: 4, eeat: L.eeat, warnings: L.warnings, turnAndCta: true,
};

const texto = (n: number) => "a".repeat(n);
const varios = <T,>(n: number, item: (indice: number) => T): T[] => Array.from({ length: n }, (_, indice) => item(indice));
const ids = (n: number, prefixo = "P") => varios(n, indice => `${prefixo}${indice + 10}`);

/** A maior resposta que os tetos permitem, campo por campo, na forma do esquema. */
function maiorResposta(b: Tetos, opcoes: { publishedH2?: number; publishedH2Chars?: number } = {}) {
  const secao = (indice: number) => ({
    h2: texto(b.head), readerQuestion: texto(b.head), answerFirst: texto(b.sentence), from: ids(b.ids, "M"),
    h3: varios(b.h3, () => texto(b.head)), explain: varios(b.explain, () => texto(b.sentence)), paragraphs: 3,
    bold: varios(b.bold, () => texto(b.term)), terms: varios(b.terms, () => texto(b.term)), evidence: ids(b.ids),
    specialist: "E1", video: "V1",
    internalLinks: varios(b.internal, () => ({ candidate: "K12", anchor: texto(b.anchor), reason: texto(b.reason) })),
    externalLinks: varios(b.external, () => ({ claim: texto(b.sentence), sourceType: texto(b.term), source: "X12" })),
    image: "R1", practical: indice < b.practical ? texto(b.sentence) : null,
  });
  return {
    keywordPlan: {
      reading: texto(b.sentence), principalPlacement: varios(3, () => texto(b.term)),
      complementary: varios(b.complementary, () => ({ keyword: texto(KEYWORD_LONGA), placement: texto(b.reason), reason: texto(b.reason) })), slugNote: null,
    },
    reader: texto(b.sentence), promise: texto(b.sentence), angle: { statement: texto(b.sentence), evidence: ids(b.ids, "G") },
    title: { principalNatural: texto(KEYWORD_LONGA), h1: texto(b.head), alternatives: varios(b.alternatives, () => texto(b.head)), seoTitle: texto(b.seoTitle), metaDescription: texto(b.meta) },
    semanticVariants: varios(b.variants, () => ({ term: texto(b.term), evidence: ids(1, "C") })),
    opening: { readerQuestion: texto(b.head), direction: texto(b.sentence), evidence: ids(b.ids) },
    sections: varios(b.sections, secao),
    discarded: varios(b.discarded, () => ({ id: "M12", reason: texto(b.reason) })),
    ...(opcoes.publishedH2 ? { publishedMap: varios(opcoes.publishedH2, () => ({ current: texto(opcoes.publishedH2Chars ?? b.head), section: 3, reason: texto(b.reason) })) } : {}),
    closing: {
      pain: texto(b.sentence), structureShift: texto(b.sentence), ease: texto(b.sentence), diagnosis: texto(b.sentence), specialist: "E1",
      turn: b.turnAndCta ? texto(b.sentence) : "", cta: b.turnAndCta ? texto(b.sentence) : "", nextStep: null,
    },
    competitive: {
      consensus: varios(b.perBlock, () => ({ topic: texto(b.head), sites: 7, evidence: ids(b.ids, "T"), howWeCover: texto(b.competitive) })),
      bestOnly: varios(b.perBlock, () => ({ practice: texto(b.head), evidence: ids(b.ids, "M+"), doBetter: texto(b.competitive) })),
      gains: varios(b.perBlock, () => ({ gap: texto(b.head), kind: "experiencia", giver: "especialista", evidence: ids(b.ids, "N"), section: texto(b.head) })),
      oldSeo: varios(b.perBlock, () => ({ pattern: texto(b.head), seenIn: varios(b.seenIn, () => texto(b.term)), evidence: ids(b.ids, "U"), instead: texto(b.competitive) })),
      angle: texto(b.sentence),
      questionsKept: varios(b.kept, () => ({ question: texto(b.head), valueAnswer: texto(b.competitive), section: texto(b.head), evidence: ids(b.ids) })),
      questionsDropped: varios(b.dropped, () => ({ question: texto(b.head), reason: texto(b.reason) })),
    },
    brandEdge: {
      method: varios(b.method, () => ({ deliverable: texto(b.head), methodName: texto(b.term), section: texto(b.head) })),
      vsGeneric: texto(b.sentence),
      localSignals: varios(b.localSignals, () => ({ signal: texto(b.head), section: texto(b.head) })),
      bottomFunnel: texto(b.sentence),
    },
    visual: varios(b.visual, indice => ({ slot: indice ? `R${indice}` : "CAPA", section: texto(b.head), concept: texto(b.head), prompt: texto(b.imagePrompt), alt: texto(b.head), caption: texto(b.head) })),
    eeat: varios(b.eeat, () => texto(b.sentence)),
    warnings: varios(b.warnings, () => texto(b.sentence)),
  };
}

const tokens = (resposta: unknown, porToken = CARACTERES_POR_TOKEN) => Math.ceil(JSON.stringify(resposta).length / porToken);

/** O que a entrada diz está, igual, na saída do esquema (a saída pode ter mais: o que o servidor completa). */
function contido(entrada: unknown, saida: unknown, caminho: string, ignorar: ReadonlySet<string>): string[] {
  if (ignorar.has(caminho)) return [];
  if (Array.isArray(entrada)) {
    if (!Array.isArray(saida) || saida.length !== entrada.length) return [`${caminho}: ${entrada.length} item(ns) viraram ${Array.isArray(saida) ? saida.length : "nada"}`];
    return entrada.flatMap((item, indice) => contido(item, saida[indice], `${caminho}[${indice}]`, ignorar));
  }
  if (entrada && typeof entrada === "object") {
    if (!saida || typeof saida !== "object") return [`${caminho}: o objeto sumiu`];
    return Object.entries(entrada as Record<string, unknown>).flatMap(([chave, valor]) => contido(valor, (saida as Record<string, unknown>)[chave], caminho ? `${caminho}.${chave}` : chave, ignorar));
  }
  return Object.is(entrada, saida) ? [] : [`${caminho}: ${String(JSON.stringify(entrada)).slice(0, 30)} virou ${String(JSON.stringify(saida)).slice(0, 30)}`];
}

/* closing.turn e closing.cta vazios: o esquema os monta dos 4 campos (o servidor, não a IA). */
const MONTADOS_PELO_SERVIDOR = new Set(["closing.turn", "closing.cta"]);

/* ============================== o tamanho ============================== */

test("antes: a maior resposta que a saída curta permitia passava do teto de tokens da chamada", () => {
  const antes = tokens(maiorResposta(CURTA_ANTES));
  assert.ok(antes > L.maxTokens, `a curta de antes permitia ~${antes} tokens (teto ${L.maxTokens}): o defeito do teste real`);
  assert.ok(antes > 2 * tokens(maiorResposta(CURTA_AGORA)), "a de agora é menos da metade da de antes");
});

test("agora: a maior resposta que a saída curta permite cabe no teto com folga (até 75%)", () => {
  const agora = tokens(maiorResposta(CURTA_AGORA));
  assert.ok(agora <= 0.75 * L.maxTokens, `a curta permite ~${agora} tokens (teto ${L.maxTokens})`);
  /* Mesmo contando 3 caracteres por token (o lado pessimista), não passa do teto. */
  assert.ok(tokens(maiorResposta(CURTA_AGORA), 3) <= L.maxTokens, "a 3 caracteres por token também cabe");
});

test("agora: com a página publicada no teto (20 H2 de 160 caracteres no mapa), ainda cabe (até 90%)", () => {
  const comMapa = tokens(maiorResposta(CURTA_AGORA, { publishedH2: L.publishedH2, publishedH2Chars: L.shortChars }));
  assert.ok(comMapa <= 0.9 * L.maxTokens, `com o mapa da página publicada, ~${comMapa} tokens (teto ${L.maxTokens})`);
});

test("o esquema não corta nada do que a saída curta permite (cada teto dela fica abaixo do teto do esquema)", () => {
  const entrada = maiorResposta(CURTA_AGORA, { publishedH2: L.publishedH2, publishedH2Chars: L.shortChars });
  const saida = RadarArticleBlueprintAiSchema.parse(JSON.parse(JSON.stringify(entrada)));
  assert.deepEqual(contido(entrada, saida, "", MONTADOS_PELO_SERVIDOR), [], "a resposta que segue os tetos sai inteira do esquema");
  /* A conta cobre todo campo da resposta: campo novo no esquema sem teto na saída curta derruba este teste. */
  const campos = Object.keys((RadarArticleBlueprintAiSchema as unknown as { shape: Record<string, unknown> }).shape);
  assert.deepEqual(campos.filter(campo => !(campo in entrada)), [], "todo campo do esquema está na conta do pior caso");
  assert.ok(C.sections >= RADAR_HUMAN_VOICE_H2.min && C.sections <= RADAR_HUMAN_VOICE_H2.max, "a curta respeita a faixa de H2 da regra 16");
  assert.ok(C.respiros >= 2, "a capa e ao menos 2 respiros (regra 9)");
});

/* ============================== o pedido ============================== */

const brief = () => buildRadarArticleBlueprintBrief({ entrada: entradaGoogle(), silo: planoDoSilo().files[0].writing!, articleId: ARTIGO, publication: null });

test("o pedido curto diz cada número; o normal e a passada de correção ficam como eram", () => {
  const regra = radarArticleBlueprintShortOutputRule();
  const curto = radarArticleBlueprintPrompt(brief(), { short: true }).system;
  const normal = radarArticleBlueprintPrompt(brief()).system;
  const correcao = radarArticleBlueprintPrompt(brief(), { fix: { previous: {}, pending: ["confira"] } }).system;
  assert.ok(curto.endsWith(regra), "a regra da saída curta fecha o pedido de sistema");
  assert.equal(curto, `${normal}\n${regra}`, "fora a regra da saída curta, o pedido é o mesmo");
  assert.doesNotMatch(normal, /SAÍDA CURTA/);
  assert.doesNotMatch(correcao, /SAÍDA CURTA/);
  assert.doesNotMatch(regra, /\n/, "uma linha só");
  assert.doesNotMatch(regra, /sem alternatives/, "SUBSTITUÍDO: as alternatives voltam (a regra 28 pede 3 opções de título)");
  for (const trecho of [
    "SAÍDA CURTA (a resposta anterior veio cortada ou fora do formato)",
    `de ${RADAR_HUMAN_VOICE_H2.min} a ${C.sections} seções`,
    `até ${C.h3} H3, ${C.explain} itens em explain, ${C.bold} em bold, ${C.terms} em terms, ${C.ids} ids em from e ${C.ids} em evidence, ${C.internalLinks} internalLinks e ${C.externalLinks} externalLinks`,
    `practical só em até ${C.practicalSections} seções`,
    `caption até ${C.headingChars} caracteres`,
    `eeat e warnings até ${C.sentenceChars}`,
    `valueAnswer até ${C.competitiveChars}`,
    `methodName até ${C.termChars}`,
    `anchor até ${C.anchorChars}`,
    `reason e placement até ${C.reasonChars}`,
    `seoTitle até ${C.seoTitleChars}`,
    `metaDescription até ${C.metaChars}`,
    `prompt de imagem até ${C.imagePromptChars}`,
    `keywordPlan.complementary até ${C.complementary} itens`,
    `semanticVariants com ${C.semanticVariants}`,
    `discarded até ${C.discarded}`,
    `até ${C.competitivePerBlock} itens em consensus, bestOnly, gains e oldSeo (seenIn até ${C.seenIn})`,
    `até ${C.questionsKept} questionsKept e questionsDropped vazio ([])`,
    `brandEdge com ${C.method} method e ${C.localSignals} localSignals`,
    `visual com a CAPA e ${C.respiros} respiros`,
    `eeat até ${C.eeat} itens; warnings até ${C.warnings}`,
    "publishedMap (quando pedido) com todos os H2 atuais e reason só quando section = null",
    "closing: turn e cta vazios (\"\") e nextStep null",
    "Feche o JSON.",
  ]) assert.ok(regra.includes(trecho), `a regra diz: ${trecho}`);
});

/* ============================== a chamada ============================== */

const envelope = (content: string, finishReason = "stop") =>
  new Response(JSON.stringify({ choices: [{ finish_reason: finishReason, message: { content } }], usage: { completion_tokens: 1200 } }), { status: 200, headers: { "content-type": "application/json" } });

function provedorFalso(respostas: Array<() => Response>) {
  const pedidos: Array<Record<string, unknown>> = [];
  const fetchImpl = (async (_url: unknown, init?: RequestInit) => {
    pedidos.push(JSON.parse(String(init?.body)));
    const proxima = respostas.shift();
    if (!proxima) throw new Error("chamada a mais do que o teste previu");
    return proxima();
  }) as typeof fetch;
  return { pedidos, fetchImpl };
}

async function calado<T>(trabalho: () => Promise<T>): Promise<T> {
  const aviso = console.warn;
  const erro = console.error;
  console.warn = () => {};
  console.error = () => {};
  try {
    return await trabalho();
  } finally {
    console.warn = aviso;
    console.error = erro;
  }
}

const sistema = (pedido: Record<string, unknown>) => String((pedido.messages as Array<{ role: string; content: string }>)[0].content);

test("cortada a primeira, a nova tentativa vai com a saída curta, o mesmo teto, e a maior resposta curta é aceita (DeepSeek)", async () => {
  const PROVEDOR = { provider: "deepseek" as const, apiKey: "fixture-sem-valor", apiUrl: "https://api.deepseek.com/chat/completions" as const, model: "deepseek-v4-pro" as const, extraHeaders: {}, thinkingMode: "provider_default" as const };
  const maior = JSON.stringify(maiorResposta(CURTA_AGORA));
  const { pedidos, fetchImpl } = provedorFalso([() => envelope(maior.slice(0, 500), "length"), () => envelope(maior)]);
  const resultado = await calado(() => requestRadarArticleBlueprintAi({ provider: PROVEDOR, brief: brief(), articleId: "pilar-grande", fetchImpl }));
  assert.equal(resultado.calls, 2, "no máximo 2 chamadas, como sempre");
  assert.equal(pedidos.length, 2);
  assert.doesNotMatch(sistema(pedidos[0]), /SAÍDA CURTA/, "a primeira chamada é o pedido de sempre");
  assert.ok(sistema(pedidos[1]).endsWith(radarArticleBlueprintShortOutputRule()), "a segunda leva a saída curta com os tetos");
  for (const pedido of pedidos) {
    assert.equal(pedido.max_tokens, L.maxTokens);
    assert.deepEqual(pedido.thinking, { type: "disabled" });
  }
  assert.equal(resultado.ai.sections.length, C.sections);
});

/*
 * 2026-10-18 (teste real, segundo clique) · SUBSTITUÍDO: o pedido ia com 8000 + 8000 e
 * `effort: "low"`; o Haiku gastou 12.274 de 16.000 tokens raciocinando e a resposta
 * saiu cortada nas duas tentativas. Agora o "disabled" desliga lá (`effort: "none"`).
 */
test("na OpenRouter o pedido vai com 8000 e o raciocínio desligado (effort none) no Claude Haiku", async () => {
  const PROVEDOR = { provider: "openrouter" as const, apiKey: "fixture-openrouter-sem-valor", apiUrl: "https://openrouter.ai/api/v1/chat/completions", model: "anthropic/claude-haiku-5.5", extraHeaders: {}, thinkingMode: "provider_default" as const };
  const maior = JSON.stringify(maiorResposta(CURTA_AGORA));
  const { pedidos, fetchImpl } = provedorFalso([() => envelope(maior.slice(0, 500), "length"), () => envelope(maior)]);
  const resultado = await calado(() => requestRadarArticleBlueprintAi({ provider: PROVEDOR, brief: brief(), fetchImpl }));
  assert.equal(resultado.calls, 2);
  for (const pedido of pedidos) {
    assert.equal(pedido.max_tokens, L.maxTokens + OPENROUTER_REASONING_HEADROOM.none, "o teto inteiro é da resposta");
    assert.equal(OPENROUTER_REASONING_HEADROOM.none, 0);
    assert.deepEqual(pedido.reasoning, { effort: "none" });
    assert.equal("thinking" in pedido, false);
  }
  assert.ok(sistema(pedidos[1]).endsWith(radarArticleBlueprintShortOutputRule()));
});

/* ============================== os botões de sempre ============================== */

const semComentarios = (fonte: string) => fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const fonte = (caminho: string) => semComentarios(readFileSync(new URL(`../${caminho}`, import.meta.url), "utf8"));

test("os botões de sempre chegam a esta linha: nenhuma porta nova", () => {
  const pagina = fonte("modules/radar/radar-page.tsx");
  const painel = fonte("modules/radar/radar-article-blueprint-panel.tsx");
  const rota = fonte("app/api/editorial/radar-article-blueprint/route.ts");
  const servidor = fonte("lib/server/radar-article-blueprint.ts");
  /* "Pesquisar e finalizar (N artigos)" (que desde 2026-10-18 organiza também o artigo-modelo que falta dos finalizados), finalizar, o envio e o export que parou: todos pela função do painel. */
  assert.match(pagina, /const pesquisarEFinalizarEmLote = async/);
  assert.ok((pagina.match(/organize: articleId => postRadarArticleBlueprintOrganize\(/g) || []).length >= 3, "o encadeamento do finalizar e os lotes organizam pela mesma função");
  assert.doesNotMatch(pagina, /\/api\/editorial\/radar-article-blueprint/, "a página não chama a rota por fora do painel");
  /* O painel do artigo ("Organizar … (IA)" / "Organizar de novo (IA)") e a função do lote: a mesma rota, a mesma ação. */
  assert.match(painel, /export const RADAR_ARTICLE_BLUEPRINT_ROUTE = "\/api\/editorial\/radar-article-blueprint";/);
  assert.match(painel, /action: "generate", brandId: input\.brandId, articleId: input\.articleId, confirmPaid: true/);
  assert.match(rota, /entrada\.action === "generate"\s*\?\s*await generateRadarArticleBlueprint\(/);
  /* 2026-10-18 · âncora trocada sem afrouxar: a chamada leva também o registro do livro de uso (`recordCall`). */
  assert.match(servidor, /const resposta = await requestRadarArticleBlueprintAi\(\{ provider, brief, articleId: input\.articleId, deadlineAt: prazo, recordCall \}\);/);
  assert.match(servidor, /radarArticleBlueprintPrompt\(input\.brief, \{ short: curta \}\)/);
  assert.match(servidor, /const segunda = await tentar\(true, tetoDaSegunda\);/);
  assert.equal((servidor.match(/radarArticleBlueprintPrompt\(/g) || []).length, 2, "o pedido sai de um lugar só (organizar/nova tentativa e a passada de correção)");
});

test("PROVIDER_CALLS_IN_TESTS = 0", () => {
  assert.deepEqual(idasAoServidor, []);
});
