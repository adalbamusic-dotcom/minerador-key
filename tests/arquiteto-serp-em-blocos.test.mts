/**
 * Blocos em sequência no Arquiteto (pedido do dono, 2026-09-25).
 *
 * Cenário: ~200 keywords importadas — 4 Silos publicados, 21 artigos
 * publicados e 130 livres. As rotas têm teto por pedido (20 artigos na SERP
 * da formação, 10 dúvidas na SERP dos silos, 6 dúvidas e N keywords na IA dos
 * silos) e o cliente mandava tudo de uma vez: acima do teto, 400 e nada
 * processado. A leitura das versões parava em 1000 linhas e perdia as mais
 * novas.
 *
 * O que este arquivo prova, com fixtures e `fetch` falso (nenhuma chamada
 * paga, nenhum banco):
 *  - os blocos cabem no teto e não perdem nem duplicam artigo;
 *  - o plano de todos vem primeiro, a confirmação é UMA, com a soma;
 *  - cada bloco executa com o número do plano DELE (orçamento por pedido);
 *  - falha de um bloco não para os outros; cancelar não executa nada;
 *  - o andamento diz "bloco N de M · faltam R";
 *  - a IA dos silos recebe só o escopo aberto da dúvida;
 *  - a leitura de versões pagina e devolve as acima de 1000.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import test from "node:test";

register("./integrations-runtime-loader.mjs", import.meta.url);

const {
  FORMATION_SERP_BLOCK_SIZE,
  TERRITORIAL_AI_KEYWORD_LIMIT,
  choiceForSerpBlock,
  executePaidSerpBlocks,
  formatSerpBlockProgress,
  planPaidSerpBlocks,
  runPaidSerpBlocks,
  splitFormationSerpBlocks,
  splitTerritorialAiQuestions,
  territorialAiKeywordScope,
  territorialAiQuestionOverflow,
  TERRITORIAL_AI_QUESTION_LIMITS,
} = await import("../lib/arquiteto/serp-blocks.ts");
const { mergeSerpPaidPlans, serpPaidPlanOptions } = await import("../lib/arquiteto/serp-lens-plan.ts");
const { ArtifactVersionRepository, ARTIFACT_VERSION_PAGE_SIZE } = await import("../lib/server/pipeline-repositories.ts");

type Plan = ReturnType<typeof mergeSerpPaidPlans>;

/* ------------------------------- fixtures -------------------------------- */

type Keyword = { id: string; keyword: string; territoryRef: string | null; published: boolean };
type Group = { id: string; publishedAnchorId: string | null; keywordIds: string[]; principalSuggestion: { keywordId: string } };

const SILOS = ["silo-cabelo", "silo-pele", "silo-unhas", "silo-corpo"];

/** 4 Silos publicados, 21 artigos publicados (distribuídos nos Silos) e 130 livres. */
function cenarioDoDono() {
  const keywords: Keyword[] = [];
  SILOS.forEach(silo => keywords.push({ id: `kw-${silo}`, keyword: `cabeça ${silo}`, territoryRef: silo, published: true }));
  for (let index = 0; index < 21; index += 1) {
    keywords.push({ id: `kw-pub-${index}`, keyword: `publicada ${index}`, territoryRef: SILOS[index % 4], published: true });
  }
  for (let index = 0; index < 130; index += 1) {
    keywords.push({ id: `kw-livre-${index}`, keyword: `livre ${index}`, territoryRef: index < 90 ? SILOS[index % 4] : null, published: false });
  }
  // 21 artigos publicados (um por publicada) + livres agrupadas de 3 em 3.
  const groups: Group[] = [];
  for (let index = 0; index < 21; index += 1) {
    groups.push({ id: `art-pub-${index}`, publishedAnchorId: `pub-${index}`, keywordIds: [`kw-pub-${index}`], principalSuggestion: { keywordId: `kw-pub-${index}` } });
  }
  for (let index = 0; index < 130; index += 3) {
    const ids = [index, index + 1, index + 2].filter(n => n < 130).map(n => `kw-livre-${n}`);
    groups.push({ id: `art-livre-${index}`, publishedAnchorId: null, keywordIds: ids, principalSuggestion: { keywordId: ids[0] } });
  }
  const siloCandidates = SILOS.map(silo => ({ id: `kw-${silo}`, keyword: `cabeça ${silo}` }));
  return { keywords, groups, siloCandidates };
}

const articleIdOf = (group: Group) => group.publishedAnchorId || group.id;

function plano(paid: number, primary = paid, recollectable = 0): Plan {
  return {
    lenses: ["desktop-windows", "desktop-macos", "mobile-android", "mobile-ios"],
    perLens: [{ lens: "desktop-windows", hits: 0, misses: paid, conditionalMisses: 0, unpaidMisses: 0, staleByDate: 0 }],
    paidQueries: paid,
    primaryPaidQueries: primary,
    extraPaidQueries: paid - primary,
    conditionalPaidQueries: 0,
    recollectableQueries: recollectable,
    estimatedCostUsd: { min: paid * 0.001, max: paid * 0.002 },
    collectedAtSpreadDays: 0,
    datesDiverge: false,
    payMissingExtraLenses: true,
    recollectStaleLenses: false,
    digestChecked: false,
  };
}

/**
 * Rota SERP da formação, falsa: mesmo teto (20/20) e a mesma regra de
 * autorização da real — autorizado menor que o plano não paga nada (409).
 * Cache: as keywords publicadas já estão lá; cada livre falta em 1 lente
 * principal + 3 extras.
 */
function rotaFalsaDaFormacao(options: { falharBloco?: (groups: Group[]) => boolean } = {}) {
  const chamadas: { mode: string; groups: number; siloCandidates: number; authorized?: number }[] = [];
  let pagas = 0;
  const planoDe = (groups: Group[]) => {
    const livres = groups.flatMap(group => group.keywordIds).filter(id => id.startsWith("kw-livre-")).length;
    return plano(livres * 4, livres);
  };
  const fetchFalso = async (_url: string, init: { body: string }) => {
    const pedido = JSON.parse(init.body);
    chamadas.push({ mode: pedido.mode, groups: pedido.groups.length, siloCandidates: pedido.siloCandidates.length, authorized: pedido.authorizedPaidQueries });
    if (pedido.groups.length < 1 || pedido.groups.length > 20 || pedido.siloCandidates.length > 20) {
      return { ok: false, status: 400, json: async () => ({ success: false, error: "Pedido de SERP inválido." }) };
    }
    const plan = planoDe(pedido.groups);
    if (pedido.mode === "plan") return { ok: true, status: 200, json: async () => ({ success: true, data: { plan } }) };
    if (options.falharBloco?.(pedido.groups)) {
      return { ok: false, status: 502, json: async () => ({ success: false, error: "provedor fora do ar" }) };
    }
    if ((pedido.authorizedPaidQueries ?? 0) < plan.paidQueries) {
      return { ok: false, status: 409, json: async () => ({ success: false, error: "O plano mudou" }) };
    }
    pagas += plan.paidQueries;
    return {
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { assessments: pedido.groups.map((group: Group) => ({ articleId: articleIdOf(group) })), failures: [], queryCount: pedido.groups.length, paidQueries: plan.paidQueries } }),
    };
  };
  const chamar = async (body: Record<string, unknown>) => {
    const resposta = await fetchFalso("/api/arquiteto/serp", { body: JSON.stringify(body) });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const corpo = (await resposta.json()) as { success: boolean; error?: string; data?: any };
    if (!resposta.ok || !corpo.success) throw new Error(corpo.error);
    return corpo.data;
  };
  return { chamadas, chamar, get pagas() { return pagas; } };
}

/* -------------------------------- blocos --------------------------------- */

test("o cenário do dono cabe em blocos de até 20, sem perder nem duplicar artigo", () => {
  const { groups, siloCandidates } = cenarioDoDono();
  assert.equal(groups.length, 65, "21 publicados + 44 grupos de livres");
  const { blocks, leftoverSiloCandidates } = splitFormationSerpBlocks(groups, siloCandidates);
  assert.equal(blocks.length, 4);
  for (const block of blocks) {
    assert.ok(block.groups.length >= 1 && block.groups.length <= FORMATION_SERP_BLOCK_SIZE, `bloco ${block.index} com ${block.groups.length}`);
    assert.ok(block.siloCandidates.length <= FORMATION_SERP_BLOCK_SIZE);
  }
  assert.deepEqual(blocks.flatMap(block => block.groups).map(articleIdOf), groups.map(articleIdOf), "a ordem e o conjunto se preservam");
  assert.deepEqual(blocks.flatMap(block => block.siloCandidates).map(item => item.id), siloCandidates.map(item => item.id));
  assert.deepEqual(leftoverSiloCandidates, []);
});

test("com um bloco só, o pedido é o de antes", () => {
  const { groups, siloCandidates } = cenarioDoDono();
  const { blocks } = splitFormationSerpBlocks(groups.slice(0, 20), siloCandidates);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].groups.length, 20);
  assert.equal(blocks[0].siloCandidates.length, 4);
});

test("candidatas a Silo demais espalham os artigos em mais blocos; o que sobra volta nomeado", () => {
  const candidatas = Array.from({ length: 45 }, (_, index) => ({ id: `cand-${index}` }));
  const cinco = Array.from({ length: 5 }, (_, index) => ({ id: `g-${index}` }));
  const espalhado = splitFormationSerpBlocks(cinco, candidatas);
  assert.equal(espalhado.blocks.length, 3, "45 candidatas pedem 3 blocos, e 5 artigos bastam");
  assert.deepEqual(espalhado.leftoverSiloCandidates, []);
  const umArtigo = splitFormationSerpBlocks([{ id: "g-0" }], candidatas);
  assert.equal(umArtigo.blocks.length, 1);
  assert.equal(umArtigo.leftoverSiloCandidates.length, 25, "o que não coube é devolvido, nunca descartado em silêncio");
  assert.deepEqual(splitFormationSerpBlocks([], candidatas).blocks, []);
});

test("cada bloco paga o número do plano DELE, na opção escolhida; a soma é o que a pessoa viu", () => {
  const planos = [plano(40, 10, 3), plano(12, 3, 0), plano(0, 0, 2)];
  const soma = mergeSerpPaidPlans(planos);
  for (const opcao of serpPaidPlanOptions(soma)) {
    const porBloco = planos.map(item => choiceForSerpBlock(opcao.choice, item));
    assert.equal(porBloco.reduce((total, item) => total + item.authorizedPaidQueries, 0), opcao.choice.authorizedPaidQueries, `opção ${opcao.id}`);
    for (const item of porBloco) {
      assert.equal(item.payMissingExtraLenses, opcao.choice.payMissingExtraLenses);
      assert.equal(item.recollectStaleLenses, opcao.choice.recollectStaleLenses);
    }
  }
});

/* -------------------------------- runner --------------------------------- */

test("Processar artigos: plano de todos, UMA confirmação com a soma, blocos em sequência", async () => {
  const { groups, siloCandidates } = cenarioDoDono();
  const rota = rotaFalsaDaFormacao();
  const { blocks } = splitFormationSerpBlocks(groups, siloCandidates);
  const perguntas: Plan[] = [];
  const andamento: string[] = [];
  const run = await runPaidSerpBlocks({
    label: "SERP de Processar artigos",
    blocks,
    itemIdsOf: block => block.groups.map(articleIdOf),
    plan: async block => (await rota.chamar({ groups: block.groups, siloCandidates: block.siloCandidates, mode: "plan" })).plan,
    ask: async merged => { perguntas.push(merged); return serpPaidPlanOptions(merged)[0].choice; },
    execute: async (block, choice) => {
      const data = await rota.chamar({ groups: block.groups, siloCandidates: block.siloCandidates, mode: "execute", ...choice });
      const avaliados = new Set(data.assessments.map((item: { articleId: string }) => item.articleId));
      return { result: data, outcomes: block.groups.map(articleIdOf).map(id => ({ id, status: avaliados.has(id) ? "succeeded" as const : "failed" as const })) };
    },
    onProgress: snapshot => andamento.push(formatSerpBlockProgress(snapshot)),
    yieldToUi: async () => undefined,
  });

  assert.equal(run.status, "ran");
  if (run.status !== "ran") return;
  assert.equal(perguntas.length, 1, "uma confirmação só");
  assert.equal(perguntas[0].paidQueries, 130 * 4, "a soma: 130 livres × 4 lentes; as publicadas vêm do cache");
  assert.equal(rota.pagas, perguntas[0].paidQueries, "pagou exatamente o que foi confirmado");
  // Plano de todos antes de qualquer execução.
  const modos = rota.chamadas.map(item => item.mode);
  assert.deepEqual(modos, ["plan", "plan", "plan", "plan", "execute", "execute", "execute", "execute"]);
  assert.ok(rota.chamadas.every(item => item.groups <= 20 && item.siloCandidates <= 20), "nenhum pedido passa do teto");
  assert.equal(run.snapshot.succeeded, 65);
  assert.equal(run.snapshot.failed, 0);
  assert.ok(andamento.includes("bloco 1 de 4 · faltam 65"));
  assert.ok(andamento.includes("bloco 4 de 4 · faltam 16"), andamento.join(" | "));
  assert.equal(andamento.at(-1), "Concluído: 65 ok, 0 com falha");
});

test("falha de um bloco não para os outros e nomeia os artigos dele", async () => {
  const { groups, siloCandidates } = cenarioDoDono();
  const rota = rotaFalsaDaFormacao({ falharBloco: blocoGroups => blocoGroups.some(group => group.id === "art-pub-0") });
  const { blocks } = splitFormationSerpBlocks(groups, siloCandidates);
  const planning = await planPaidSerpBlocks({
    blocks,
    itemIdsOf: block => block.groups.map(articleIdOf),
    plan: async block => (await rota.chamar({ groups: block.groups, siloCandidates: block.siloCandidates, mode: "plan" })).plan,
  });
  const execucao = await executePaidSerpBlocks({
    label: "SERP",
    planning,
    choice: serpPaidPlanOptions(planning.merged)[0].choice,
    execute: async (block, choice) => ({
      result: await rota.chamar({ groups: block.groups, siloCandidates: block.siloCandidates, mode: "execute", ...choice }),
      outcomes: block.groups.map(articleIdOf).map(id => ({ id, status: "succeeded" as const })),
    }),
    yieldToUi: async () => undefined,
  });
  assert.equal(execucao.results.length, 3, "os outros três blocos rodaram");
  assert.equal(execucao.blockFailures.length, 1);
  assert.equal(execucao.blockFailures[0].blockIndex, 0);
  assert.equal(execucao.blockFailures[0].stage, "execute");
  assert.match(execucao.blockFailures[0].reason, /provedor fora do ar/);
  assert.deepEqual(execucao.blockFailures[0].itemIds, blocks[0].groups.map(articleIdOf));
  assert.equal(execucao.snapshot.status, "partial");
  assert.equal(execucao.snapshot.failed, blocks[0].groups.length);
  assert.equal(execucao.snapshot.done, 65);
});

test("cancelar a confirmação não executa bloco nenhum", async () => {
  const { groups, siloCandidates } = cenarioDoDono();
  const rota = rotaFalsaDaFormacao();
  const { blocks } = splitFormationSerpBlocks(groups, siloCandidates);
  const run = await runPaidSerpBlocks({
    label: "SERP",
    blocks,
    itemIdsOf: block => block.groups.map(articleIdOf),
    plan: async block => (await rota.chamar({ groups: block.groups, siloCandidates: block.siloCandidates, mode: "plan" })).plan,
    ask: async () => null,
    execute: async () => { throw new Error("não deveria executar"); },
  });
  assert.equal(run.status, "cancelled");
  assert.ok(rota.chamadas.every(item => item.mode === "plan"));
  assert.equal(rota.pagas, 0);
});

test("com um bloco, falha do plano sobe como antes; com vários, só o bloco dele fica de fora", async () => {
  await assert.rejects(planPaidSerpBlocks({ blocks: ["a"], itemIdsOf: () => ["a"], plan: async () => { throw new Error("plano recusado"); } }), /plano recusado/);
  const planning = await planPaidSerpBlocks({
    blocks: ["a", "b"],
    itemIdsOf: block => [block],
    plan: async block => { if (block === "a") throw new Error("plano recusado"); return plano(2); },
  });
  assert.deepEqual(planning.plans.map(item => item?.paidQueries ?? null), [null, 2]);
  assert.equal(planning.merged.paidQueries, 2, "a confirmação só soma o que pode ser executado");
  assert.equal(planning.planFailures[0].stage, "plan");
  await assert.rejects(planPaidSerpBlocks({ blocks: ["a", "b"], itemIdsOf: block => [block], plan: async () => { throw new Error("todos"); } }), /todos/);
});

/* ------------------------------ IA dos silos ------------------------------ */

test("IA dos silos: só as keywords do escopo aberto, não a mesa inteira", () => {
  const { keywords } = cenarioDoDono();
  const escopo = territorialAiKeywordScope({
    territoryRef: "silo-pele",
    keywords: keywords.map(keyword => ({ id: keyword.id, territoryRef: keyword.territoryRef })),
    hypothesisKeywordIds: ["kw-livre-120", "kw-livre-121"],
  });
  assert.ok(escopo.length < keywords.length);
  assert.ok(escopo.includes("kw-silo-pele"));
  assert.ok(escopo.includes("kw-livre-120"), "a hipótese da lógica entra: a IA a vê nos fatos");
  assert.ok(!escopo.includes("kw-silo-cabelo"), "outro Silo fica fora");
  assert.equal(new Set(escopo).size, escopo.length);
  const comparado = territorialAiKeywordScope({ territoryRef: "silo-pele", comparedTerritoryRef: "silo-cabelo", keywords: keywords.map(keyword => ({ id: keyword.id, territoryRef: keyword.territoryRef })) });
  assert.ok(comparado.includes("kw-silo-cabelo"), "na dúvida entre dois Silos, os dois entram");
  assert.ok(keywords.length > 150 && escopo.length <= 200);
});

test("IA dos silos: todas as dúvidas em blocos de 6; a que passa do teto é nomeada, não cortada", () => {
  const perguntas = Array.from({ length: 14 }, (_, index) => ({ questionId: `q-${index}`, knownKeywordIds: index === 13 ? Array.from({ length: TERRITORIAL_AI_KEYWORD_LIMIT + 1 }, (_, n) => `k-${n}`) : ["k-1"] }));
  const { blocks, oversized } = splitTerritorialAiQuestions(perguntas);
  assert.deepEqual(blocks.map(block => block.length), [6, 6, 1]);
  assert.deepEqual(oversized.map(question => question.questionId), ["q-13"]);
});

test("IA dos silos: estouro de fatos ou hipóteses também é dito pelo nome, antes do envio", () => {
  const perguntas = [
    { questionId: "q-ok", knownKeywordIds: ["k-1"], logicFacts: ["h"], architectureFacts: ["a"] },
    { questionId: "q-hipoteses", knownKeywordIds: ["k-1"], logicFacts: Array.from({ length: TERRITORIAL_AI_QUESTION_LIMITS.logicFacts + 1 }, (_, n) => `h-${n}`) },
    { questionId: "q-fatos", knownKeywordIds: ["k-1"], architectureFacts: Array.from({ length: TERRITORIAL_AI_QUESTION_LIMITS.architectureFacts + 2 }, (_, n) => `a-${n}`) },
  ];
  const { blocks, overflow } = splitTerritorialAiQuestions(perguntas);
  assert.deepEqual(blocks.map(block => block.map(question => question.questionId)), [["q-ok"]]);
  assert.deepEqual(overflow.map(item => [item.question.questionId, item.lists]), [
    ["q-hipoteses", [`logicFacts ${TERRITORIAL_AI_QUESTION_LIMITS.logicFacts + 1}/${TERRITORIAL_AI_QUESTION_LIMITS.logicFacts}`]],
    ["q-fatos", [`architectureFacts ${TERRITORIAL_AI_QUESTION_LIMITS.architectureFacts + 2}/${TERRITORIAL_AI_QUESTION_LIMITS.architectureFacts}`]],
  ]);
  assert.deepEqual(territorialAiQuestionOverflow({ knownKeywordIds: ["k"] }), []);
});

/* ------------------------------ fiação na mesa ------------------------------ */

function semComentarios(caminho: string) {
  return readFileSync(caminho, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
}

test("a mesa anda em blocos nos três processos e não corta mais em silêncio", () => {
  const mesa = semComentarios("modules/arquiteto/arquiteto-workspace.tsx");
  const trecho = (inicio: string, fim: string) => mesa.slice(mesa.indexOf(inicio), mesa.indexOf(fim, mesa.indexOf(inicio)));
  const serp = trecho("const confirmSerpValidation = async", "const handleSerpRecommendationDecision");
  assert.match(serp, /splitFormationSerpBlocks\(requestedGroups, siloCandidateKeywords\)/);
  assert.match(serp, /planPaidSerpBlocks\(/);
  assert.match(serp, /executePaidSerpBlocks</);
  assert.ok(serp.indexOf("await askSerpPaidPlan(") < serp.indexOf("executePaidSerpBlocks<"), "a confirmação vem antes de qualquer execução");
  assert.match(serp, /leftoverSiloCandidates\.length/);

  const territorial = trecho("const validateTerritorialSerp = async", "const validateTerritorialSerpRef = ");
  assert.doesNotMatch(territorial, /territorialSerpQuestions\.slice\(0, 10\)/);
  assert.match(territorial, /TERRITORIAL_SERP_BLOCK_SIZE/);
  assert.match(territorial, /executePaidSerpBlocks</);

  const ia = trecho("const reviewTerritorialWithAi = async", "const reviewTerritorialWithAiRef");
  assert.doesNotMatch(ia, /ready\.slice\(0, 6\)/);
  assert.doesNotMatch(ia, /knownKeywordIds: masterList\.map/);
  assert.match(ia, /territorialAiKeywordScope\(/);
  assert.match(ia, /runProgressiveBatch\(/);
  // A dúvida que estoura qualquer teto da rota é dita pelo nome, com a lista.
  assert.match(ia, /overflow\.length/);
  assert.match(ia, /item\.lists\.join\(/);

  // O andamento aparece nos dois modos da mesa.
  assert.match(mesa, /serpBlockProgress\?\.process === "formation_serp"/);
  assert.match(mesa, /serpBlockProgress\?\.process === "territorial_serp"/);
  assert.match(mesa, /serpBlockProgress\?\.process === "territorial_ai"/);
});

test("a rota da IA dos silos aceita o escopo de um Silo real (acima de 80 fatos e 40 hipóteses)", () => {
  const rota = semComentarios("app/api/arquiteto/territorial-ai/route.ts");
  // Cliente e rota medem com a mesma régua: TERRITORIAL_AI_QUESTION_LIMITS.
  for (const lista of ["architectureFacts", "logicFacts", "knownTargetRefs", "knownKeywordIds", "publishedIdentity", "serpFacts"]) {
    assert.match(rota, new RegExp(`${lista}: z\\.array\\([^\\n]*\\.max\\(TERRITORIAL_AI_QUESTION_LIMITS\\.${lista}\\)`), lista);
  }
  assert.equal(TERRITORIAL_AI_QUESTION_LIMITS.architectureFacts, TERRITORIAL_AI_KEYWORD_LIMIT + 20);
  assert.equal(TERRITORIAL_AI_QUESTION_LIMITS.logicFacts, TERRITORIAL_AI_KEYWORD_LIMIT);
  assert.equal(TERRITORIAL_AI_QUESTION_LIMITS.knownKeywordIds, TERRITORIAL_AI_KEYWORD_LIMIT);
  // O teto de dúvidas por pedido continua 6: o cliente é que anda em blocos.
  assert.match(rota, /questions: z\.array\(ContextSchema\)\.min\(1\)\.max\(6\)/);
});

/* --------------------------- leitura paginada ---------------------------- */

const BRAND = "550e8400-e29b-41d4-a716-446655440001";
const OUTRA = "550e8400-e29b-41d4-a716-446655440002";

/** Driver falso com `range`, e com o corte de `max_rows` do PostgREST. */
function clienteComRange(rows: Record<string, unknown>[]) {
  const ranges: [number, number][] = [];
  const client = {
    ranges,
    from() {
      const filtros: ((row: Record<string, unknown>) => boolean)[] = [];
      const ordens: [string, boolean][] = [];
      let intervalo: [number, number] | null = null;
      const query = {
        select() { return query; },
        eq(column: string, value: unknown) { filtros.push(row => row[column] === value); return query; },
        in(column: string, values: unknown[]) { filtros.push(row => values.includes(row[column])); return query; },
        order(column: string, options: { ascending: boolean }) { ordens.push([column, options.ascending]); return query; },
        range(from: number, to: number) { intervalo = [from, to]; ranges.push([from, to]); return query; },
        then(resolve: (value: unknown) => void) {
          let data = rows.filter(row => filtros.every(filtro => filtro(row)));
          data = [...data].sort((a, b) => {
            for (const [column, asc] of ordens) {
              const left = a[column] as string | number;
              const right = b[column] as string | number;
              if (left < right) return asc ? -1 : 1;
              if (left > right) return asc ? 1 : -1;
            }
            return 0;
          });
          const [from, to] = intervalo ?? [0, Number.MAX_SAFE_INTEGER];
          // max_rows = 1000: o PostgREST nunca devolve mais que isso por resposta.
          resolve({ data: data.slice(from, Math.min(to + 1, from + 1000)), error: null });
        },
      };
      return query;
    },
  };
  return client;
}

test("a leitura de versões pagina: as mais novas acima de 1000 voltam, sem duplicar e só da marca", async () => {
  assert.equal(ARTIFACT_VERSION_PAGE_SIZE, 1000);
  const rows: Record<string, unknown>[] = [];
  for (let index = 0; index < 2500; index += 1) {
    rows.push({ version_id: `v-${String(index).padStart(5, "0")}`, marca_id: BRAND, entity_id: `e-${index % 300}`, artifact_type: "article_dna", version_number: 1 + Math.floor(index / 300) });
  }
  rows.push({ version_id: "v-outra", marca_id: OUTRA, entity_id: "e-x", artifact_type: "article_dna", version_number: 99 });
  const client = clienteComRange(rows);
  const repository = new ArtifactVersionRepository({ actorUserId: "u", brandId: BRAND, supabase: client as never });
  const result = await repository.list(undefined, undefined, ["article_dna"]);
  assert.equal(result.status, "READY");
  const lidas = result.data ?? [];
  assert.equal(lidas.length, 2500, "nada acima de 1000 fica de fora");
  assert.equal(new Set(lidas.map(row => row.version_id)).size, 2500, "nenhuma linha duplicada entre páginas");
  assert.ok(lidas.some(row => row.version_number === 9), "a versão mais nova volta");
  assert.ok(lidas.every(row => row.marca_id === BRAND), "o filtro de marca continua em cada página");
  assert.deepEqual(client.ranges, [[0, 999], [1000, 1999], [2000, 2999]]);
});

test("marca com menos de 1000 versões: uma página só, como antes", async () => {
  const rows = Array.from({ length: 10 }, (_, index) => ({ version_id: `v-${index}`, marca_id: BRAND, entity_id: "e", artifact_type: "silo_dna", version_number: index + 1 }));
  const client = clienteComRange(rows);
  const repository = new ArtifactVersionRepository({ actorUserId: "u", brandId: BRAND, supabase: client as never });
  const result = await repository.list("e", "silo_dna");
  assert.equal(result.data?.length, 10);
  assert.deepEqual(client.ranges, [[0, 999]]);
  const vazio = await new ArtifactVersionRepository({ actorUserId: "u", brandId: OUTRA, supabase: clienteComRange([]) as never }).list();
  assert.equal(vazio.status, "NO_DATA");
});
