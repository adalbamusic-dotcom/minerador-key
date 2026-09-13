import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { radarConclusiveIntent, radarIntentConflict, radarObservedGapsForArticle } from "../lib/radar/editorial-identity.ts";

/*
 * ======  GATE 18.5 · O ÚLTIMO RESÍDUO DO SENTINELA  ====================
 *
 * A rodada real final passou em tudo — SOURCE_UNKNOWN interno zero, nenhum
 * conflito de lock, write e readback finais confirmados, ArticleDNA
 * Informacional · Topo, blueprint e pautas gerados — e sobrou uma frase:
 *
 *   "A intenção esperada (unknown) não coincide claramente com a intenção
 *    aparente (informacional)."
 *
 * Ela fala sobre o Radar não ter lido o fundamento, não sobre o artigo. E era o
 * TERCEIRO leitor a cair no mesmo sentinela: a faixa do Article (18.2), a
 * coleta auxiliar (18.4) e agora a coleta CANÔNICA, que passava
 * `article.payload.mainIntent` cru ao provider.
 *
 * Duas correções, porque o defeito tem duas pontas: quem PRODUZ a frase e quem
 * a LÊ de volta do snapshot — o diagnóstico é gravado na coleta e não muda
 * depois, então corrigir só o produtor deixaria a frase antiga na tela para
 * sempre.
 *
 * REAL_PROVIDER_CALLS = 0.
 */

const tentativasDeRede: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    tentativasDeRede.push(String((entrada as { url?: string })?.url || entrada));
    return Promise.reject(new Error("REDE PROIBIDA NESTE GATE"));
  },
  writable: true, configurable: true,
});

/* ==========  A · INFORMACIONAL × INFORMACIONAL  ==================== */

test("GATE 18.5 · A — intenção declarada igual à observada não produz lacuna", () => {
  const leitura = radarIntentConflict({ expected: "Informacional", observed: "informacional" });

  assert.equal(leitura.conflicting, false, "zero intent gap");
  assert.equal(leitura.expected, "Informacional");
  assert.equal(leitura.observed, "informacional");
  assert.match(leitura.reason, /coincide/);

  /*
   * As duas pontas escrevem diferente de propósito nesta fixture: o fundamento
   * capitaliza e a SERP devolve minúsculo, às vezes em inglês. Exigir igualdade
   * literal inventaria divergência de grafia.
   */
  for (const observada of ["informacional", "INFORMACIONAL", "informational", "informativo"]) {
    assert.equal(
      radarIntentConflict({ expected: "Informacional", observed: observada }).conflicting,
      false,
      `"${observada}" não pode divergir de "Informacional"`,
    );
  }
});

/* ==========  B · unknown NÃO INVENTA CONFLITO  ===================== */

test("GATE 18.5 · B — o sentinela não é uma intenção, dos dois lados", () => {
  assert.equal(radarConclusiveIntent("unknown"), null);
  assert.equal(radarConclusiveIntent("UNKNOWN"), null);
  assert.equal(radarConclusiveIntent("  unknown  "), null);
  assert.equal(radarConclusiveIntent(""), null);
  assert.equal(radarConclusiveIntent(null), null);
  assert.equal(radarConclusiveIntent(undefined), null);
  assert.equal(radarConclusiveIntent("Informacional"), "Informacional");

  /* A frase exata do smoke não pode mais nascer. */
  const comoNoSmoke = radarIntentConflict({ expected: "unknown", observed: "informacional" });
  assert.equal(comoNoSmoke.conflicting, false, "não inventa conflito");
  assert.doesNotMatch(comoNoSmoke.reason, /não coincide/);
  assert.match(comoNoSmoke.reason, /não declara intenção conclusiva/);

  /* E o inverso também: sem leitura da SERP, não há divergência a declarar. */
  const semObservada = radarIntentConflict({ expected: "Informacional", observed: null });
  assert.equal(semObservada.conflicting, false);
  assert.match(semObservada.reason, /não permitiu observar/);
});

/* ==========  C · CONFLITO REAL CONTINUA  ========================== */

test("GATE 18.5 · C — divergência real entre dois valores conclusivos é preservada", () => {
  /*
   * A CORREÇÃO NÃO PODE CALAR O QUE IMPORTA.
   *
   * Um artigo declarado comercial cuja SERP responde informacional é um achado
   * editorial de verdade: o mercado responde outra pergunta. Essa frase precisa
   * continuar chegando a quem planeja.
   */
  const real = radarIntentConflict({ expected: "Comercial", observed: "informacional" });
  assert.equal(real.conflicting, true, "conflito real preservado");
  assert.match(real.reason, /A intenção esperada \(Comercial\) não coincide claramente com a intenção aparente \(informacional\)/);

  const transacional = radarIntentConflict({ expected: "Transacional", observed: "informacional" });
  assert.equal(transacional.conflicting, true);
});

/* ==========  D e E · A LACUNA PERSISTIDA  ========================= */

const LACUNA_DO_SMOKE = "A intenção esperada (unknown) não coincide claramente com a intenção aparente (informacional).";
const LACUNA_REAL = "A intenção esperada (Comercial) não coincide claramente com a intenção aparente (informacional).";
const OUTRAS = [
  "Tópicos do ArticleDNA sem ocorrência textual nos snippets: skin care pele oleosa.",
  "Formatos parciais ou não editoriais permanecem visíveis, mas não entram no benchmark.",
];

test("GATE 18.5 · D e E — a lacuna gravada é conferida contra o fundamento de hoje", () => {
  /*
   * O diagnóstico da SERP é gravado NA COLETA e não muda depois. Com o
   * ArticleDNA declarando Informacional e a SERP respondendo informacional, a
   * frase do smoke descreve uma leitura que o Radar já não faz.
   */
  const hoje = radarObservedGapsForArticle({
    persistedConflicts: [LACUNA_DO_SMOKE, ...OUTRAS],
    articleIntent: "Informacional",
    observedIntent: "informacional",
  });

  assert.ok(!hoje.includes(LACUNA_DO_SMOKE), "a lacuna falsa não sobrevive à conferência");
  for (const outra of OUTRAS) assert.ok(hoje.includes(outra), "e nenhuma outra lacuna é tocada");
  assert.equal(hoje.length, OUTRAS.length);

  /*
   * ISTO NÃO É ESCONDER NA UI: com fundamento comercial, a MESMA frase
   * persistida continua passando, porque aí a autoridade atual a sustenta.
   */
  const comConflitoReal = radarObservedGapsForArticle({
    persistedConflicts: [LACUNA_REAL, ...OUTRAS],
    articleIntent: "Comercial",
    observedIntent: "informacional",
  });
  assert.ok(comConflitoReal.includes(LACUNA_REAL), "conflito real continua visível");
  assert.equal(comConflitoReal.length, OUTRAS.length + 1);

  /* E sem fundamento conclusivo, a frase de intenção também não se sustenta. */
  const semFundamento = radarObservedGapsForArticle({
    persistedConflicts: [LACUNA_DO_SMOKE, ...OUTRAS],
    articleIntent: null,
    observedIntent: "informacional",
  });
  assert.ok(!semFundamento.includes(LACUNA_DO_SMOKE));
});

test("GATE 18.5 · D — a pauta do especialista não carrega a lacuna falsa", () => {
  const pagina = readFileSync(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8");

  /*
   * `openGaps` alimenta o contexto do especialista (LACUNAS OBSERVADAS) e, por
   * ele, a pauta. Filtrar na origem da projeção resolve as duas superfícies de
   * uma vez, sem nenhuma delas precisar conhecer a regra.
   */
  assert.match(pagina, /radarObservedGapsForArticle\(\{/, "a projeção passa pela autoridade");
  assert.ok(
    !/openGaps: \[\.\.\.\(report\?\.profile\.limitations \|\| \[\]\), \.\.\.\(data\.view\?\.diagnostic\?\.possibleConflicts \|\| \[\]\)\]/.test(pagina),
    "a leitura crua do diagnóstico não sobreviveu",
  );
  assert.match(
    pagina,
    /articleIntent: radarDeclaredArticleIntent\(data\.researchContext\?\.article\)/,
    "e pergunta à autoridade em vez de escrever a ordem de novo",
  );
});

/* ==========  O TERCEIRO LEITOR, FECHADO  ========================= */

test("GATE 18.5 · os dois caminhos de coleta filtram a intenção antes de enviá-la", () => {
  const rota = readFileSync(new URL("../app/api/editorial/serp/route.ts", import.meta.url), "utf8");

  /*
   * O caminho AUXILIAR foi corrigido no Gate 18.4; o CANÔNICO — que é o que
   * grava o diagnóstico que a tela lê — passava `mainIntent` cru e ficou de
   * fora. É ele que produziu a frase da rodada final.
   */
  assert.ok(
    !/expectedIntent: article\.payload\.mainIntent\b/.test(rota),
    "nenhum caminho envia a intenção crua ao provider",
  );
  /* GATE 18.6: a cadeia que estava aqui é a mesma do caminho auxiliar — foi para a autoridade. */
  assert.match(rota, /const intencaoCanonica = radarDeclaredArticleIntent\(article\.payload\)/);
  assert.match(rota, /expectedIntent: intencaoCanonica/);
  assert.match(rota, /expectedIntent: intencao,/, "e o auxiliar continua filtrado");

  /* Uma autoridade só: o provider não decide conflito por conta própria. */
  const provider = readFileSync(new URL("../lib/radar/serper-provider-core.ts", import.meta.url), "utf8");
  assert.match(provider, /const leituraDeIntencao = radarIntentConflict\(/);
  assert.match(provider, /if \(leituraDeIntencao\.conflicting\) conflicts\.push\(leituraDeIntencao\.reason\)/);
  assert.ok(
    !/!dominantIntent\.includes\(input\.expectedIntent\.toLowerCase\(\)\.split\("_"\)\[0\]\)/.test(provider.replace(/if \(false\)[\s\S]*?;\n/, "")),
    "a comparação por substring não decide mais nada",
  );
});

/* ==========  G · NADA A MONTANTE É TOCADO  ======================= */

test("GATE 18.5 · G — as funções são puras e não alcançam a investigação real", () => {
  const conflitos = [LACUNA_DO_SMOKE, ...OUTRAS];
  const antes = JSON.stringify(conflitos);

  radarObservedGapsForArticle({ persistedConflicts: conflitos, articleIntent: "Informacional", observedIntent: "informacional" });
  radarIntentConflict({ expected: "Informacional", observed: "informacional" });

  assert.equal(JSON.stringify(conflitos), antes, "a lista de entrada não é mutada");

  /*
   * E o filtro é de LEITURA: ele não reescreve o snapshot. O diagnóstico
   * gravado continua lá, com o registro do que foi observado naquela coleta.
   */
  const identidade = readFileSync(new URL("../lib/radar/editorial-identity.ts", import.meta.url), "utf8");
  const codigo = identidade.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  for (const proibido of ["fetch", "await ", "possibleConflicts ="]) {
    assert.ok(!codigo.includes(proibido), `o módulo não faz "${proibido}"`);
  }
});

/* ==============  F · ZERO PROVIDER  ============================== */

test("GATE 18.5 · F — nenhuma chamada de rede saiu desta suíte", () => {
  assert.deepEqual(tentativasDeRede, [], `REAL_PROVIDER_CALLS deveria ser 0; houve: ${tentativasDeRede.join(", ")}`);
});
