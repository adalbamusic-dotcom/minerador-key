import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { montarRadar, React } from "./radar-dom-harness.mts";
import { RadarProfileBlueprintSection } from "../modules/radar/radar-profile-blueprint.tsx";
import { buildRadarEditorialVideoModel, deduplicarLimitacoes } from "../lib/radar/editorial-profile-model.ts";
import { buildDataForSeoAmazonRequest } from "../lib/server/dataforseo-amazon-operation.ts";
import { radarMerchantAmazonLocale, radarProviderLocale, RadarLocaleError } from "../lib/radar/provider-locale.ts";
import { radarResearchPrimaryCollection } from "../lib/radar/research-read-model.ts";
import { radarResearchPlanOfAnalysis, radarSearchModeAvailability } from "../lib/radar/search-mode.ts";
import { compactRadarResearchForRead } from "../lib/radar/research-read-model.ts";
import type { RadarArticleResearchContext } from "../lib/radar/article-research-context.ts";
import type { RadarYoutubeCanonicalBlueprint } from "../lib/radar/competitive-blueprint.ts";

/*
 * ===== PROFILES_2.1 · O QUE A PRIMEIRA CHAMADA REAL DA AMAZON REVELOU =====
 *
 * ==================== O DIAGNÓSTICO QUE ESTAVA ERRADO ====================
 *
 * O gate abriu dizendo que a Amazon mandava `pt-BR` — a grafia do YouTube — e
 * que faltava traduzir para `pt_BR`. A tradução já existia, já era usada e já
 * estava conferida no adapter desde o AMAZON_SEARCH_1.
 *
 * O que a auditoria encontrou foi outra coisa: `DATAFORSEO_LANGUAGE_CODE` não
 * está definida, a configuração canônica cai no padrão `"pt"` — SEM REGIÃO — e a
 * autoridade devolveu `"pt"` fazendo exatamente o que documenta: não inventar um
 * país que ninguém pediu. O Google aceita `pt`. O YouTube aceita `pt`. A
 * Merchant API recusa, e a recusa chega como `40501 · Invalid Field`.
 *
 * A região não era palpite: estava no `location_code` do mesmo pedido.
 *
 * ==================== A CONTRADIÇÃO DO YOUTUBE ====================
 *
 * "3 consultas · 38 vídeos · Finalizado" e "SERP do YouTube · não coletada" na
 * mesma tela. As duas leituras estavam certas sobre fontes diferentes: uma lia a
 * fotografia, a outra lia um campo que a compactação zera depois do freeze.
 *
 * PROVIDER_CALLS = 0, com sentinela no fim.
 */

const idasAoServidor: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    idasAoServidor.push(String((entrada as { url?: string })?.url || entrada));
    return Promise.reject(new Error("REDE PROIBIDA NESTE GATE"));
  },
  writable: true, configurable: true,
});

/* ===================== PARTE A · O BLOQUEIO DA AMAZON ===================== */

const pedido = (languageCode: string, locationCode = 2076) => buildDataForSeoAmazonRequest({
  keyword: "sabonete para pele oleosa",
  locationCode,
  languageCode,
  depth: 20,
  operationRequestId: "artigo-1:q1",
});

test("A · Brazil Merchant → pt_BR, inclusive a partir do padrão sem região", () => {
  /*
   * O CASO REAL: a configuração entrega "pt", e era ele que saía na chamada.
   *
   * Esta asserção é a prova de que o defeito não era o separador: com "pt" a
   * grafia nunca esteve errada, e ainda assim a tarefa era recusada.
   */
  assert.equal(radarProviderLocale("pt", "MERCHANT_AMAZON"), "pt", "a autoridade não inventa país sozinha");
  assert.equal(radarMerchantAmazonLocale("pt", 2076), "pt_BR", "o mercado completa o que o idioma não declara");

  const corpo = pedido("pt").body[0] as Record<string, unknown>;
  assert.equal(corpo.language_code, "pt_BR");
  assert.equal(corpo.location_code, 2076);

  /* E uma entrada que JÁ traz a região continua atravessando igual. */
  for (const entrada of ["pt-br", "pt-BR", "pt_BR"]) {
    assert.equal((pedido(entrada).body[0] as Record<string, unknown>).language_code, "pt_BR", entrada);
  }
});

test("B e C · nem pt-BR nem pt-br atravessam até o provider", () => {
  for (const entrada of ["pt-BR", "pt-br", "pt"]) {
    const enviado = (pedido(entrada).body[0] as Record<string, unknown>).language_code;
    assert.notEqual(enviado, "pt-BR", `${entrada} não pode sair como BCP-47`);
    assert.notEqual(enviado, "pt-br", `${entrada} não pode sair minúsculo`);
    assert.notEqual(enviado, "pt", `${entrada} não pode sair sem região`);
    assert.equal(enviado, "pt_BR");
  }
});

test("A · um mercado desconhecido ERRA antes da rede, em vez de pagar para descobrir", () => {
  /*
   * Mandar "pt" e deixar o provider recusar custaria uma ida à API para
   * descobrir o que este módulo já sabe — e a recusa voltaria com cara de SERP
   * vazia, que é o defeito que o §14 do AMAZON_SEARCH_1 fechou.
   */
  assert.throws(
    () => radarMerchantAmazonLocale("pt", 9999),
    (erro: unknown) => erro instanceof RadarLocaleError && erro.code === "merchant_market_unknown",
  );
  /* E um idioma que já declara região não depende do mercado para nada. */
  assert.equal(radarMerchantAmazonLocale("pt-BR", 9999), "pt_BR");
});

test("D · a regra mora na autoridade, e a rota não conhece convenção de provider", async () => {
  const adapter = await readFile(new URL("../lib/server/dataforseo-amazon-operation.ts", import.meta.url), "utf8");
  const rota = await readFile(new URL("../app/api/editorial/radar-amazon-search/route.ts", import.meta.url), "utf8");

  /*
   * A VARREDURA IGNORA COMENTÁRIOS de propósito: explicar onde a tradução mora
   * é o oposto de fazê-la aqui, e um teste que confundisse os dois empurraria a
   * documentação para fora do arquivo que ela descreve.
   */
  const semComentarios = (fonte: string) =>
    fonte.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

  assert.equal(/replace\(["']-["']/.test(semComentarios(adapter)), false, "nenhuma tradução local no adapter");
  assert.equal(/replace\(["']-["']/.test(semComentarios(rota)), false, "nenhuma tradução local na rota");
  assert.equal(/pt_BR|pt-BR/.test(semComentarios(rota)), false, "a rota não escreve grafia de provider");
  assert.match(rota, /languageCode: deps\.config\.languageCode/, "a rota passa o locale canônico e mais nada");

  /*
   * §19 · UMA PORTA AO PROVIDER, mesmo com duas intenções chegando nela.
   *
   * A coleta monta universo e a resolução mostra candidatos — é a mesma busca
   * de prateleira. Duas chamadas diretas seriam duas políticas de acesso, e a
   * segunda envelheceria sem a tradução de locale ou sem a leitura de recusa.
   */
  assert.equal((rota.match(/executeDataForSeoAmazonQuery\(/g) || []).length, 1, "uma porta ao provider");
  assert.equal((rota.match(/consultarProdutosAmazon\(/g) || []).length, 3, "a coleta, a resolução e a definição da porta");

  /* E o retry da primária passa pelo mesmo caminho — não há segundo montador. */
  assert.equal((adapter.match(/language_code:/g) || []).length, 1, "um único lugar monta o campo");
});

test("E, F e G · a ordem do apoio é a da consequência, e o retry não repaga a primária", async () => {
  const rota = await readFile(new URL("../app/api/editorial/radar-amazon-search/route.ts", import.meta.url), "utf8");

  /*
   * §6 · primária OK → apoio automático, no MESMO pedido. Encadear no
   * navegador faria a coleta paga depender de a aba sobreviver entre as duas.
   */
  assert.match(rota, /const primariaOk = gravada\.run\.state === "COLLECTED"/);
  assert.match(rota, /const apoio = primariaOk\s*\r?\n?\s*\?\s*await collectRadarGoogleSupport/);

  /* F · primária falha → o apoio não roda: contexto de investigação que não existe. */
  const ondeDecide = rota.indexOf("const apoio = primariaOk");
  const ondeChama = rota.indexOf("collectRadarGoogleSupport", ondeDecide);
  assert.ok(ondeChama > ondeDecide, "a chamada do apoio está DENTRO da decisão");

  /*
   * G · O RETRY DO APOIO NÃO REPAGA A AMAZON.
   *
   * A garantia não é "o handler parece não coletar": é que ele declara a
   * INTENÇÃO `retry-support`, e que o servidor trata essa intenção como um
   * caminho próprio. Trocar a intenção por `collect` é a regressão que custaria
   * uma coleta de prateleira inteira para arrumar uma leitura do Google.
   */
  const pagina = await readFile(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8");
  const inicio = pagina.indexOf("const retryAmazonSupport");
  assert.ok(inicio > 0, "o retry só do apoio existe");
  const corpo = pagina.slice(inicio, inicio + 2500);
  assert.match(corpo, /action: "retry-support"/, "AMAZON_REPAID_ON_SUPPORT_RETRY = NO");
  assert.equal(/action: "collect"/.test(corpo), false, "o retry nunca manda a intenção de coletar");

  /* E o servidor separa as duas intenções — não é só o cliente que promete. */
  assert.match(rota, /action: z\.enum\(\["collect", "retry-support", "analyze", "finalize"(, "resolve-product")?\]\)/);
  const ondeRetry = rota.indexOf('input.action === "retry-support"');
  assert.ok(ondeRetry > 0, "o servidor tem um ramo próprio para o retry do apoio");
});

test("H · o rótulo 'em construção' saiu quando o perfil passou a funcionar", async () => {
  const disponibilidade = radarSearchModeAvailability("AMAZON");
  assert.equal(disponibilidade.engine, "available");
  assert.equal(disponibilidade.canStart, true);
  assert.equal(disponibilidade.reason, null, "engine construída não carrega ressalva");

  /*
   * O RÓTULO NÃO FOI APAGADO DA CASCA — ele continua para quem não tem engine.
   *
   * Removê-lo do componente faria um modo futuro entrar sem aviso nenhum, que é
   * o oposto do que o seletor extensível existe para fazer.
   */
  const workbench = await readFile(new URL("../modules/radar/radar-r3-workbench.tsx", import.meta.url), "utf8");
  assert.match(workbench, /disponibilidade\.engine === "planned" && <span[^>]*>em construção<\/span>/,
    "o rótulo segue a engine, e não um modo específico");
});

/* ================= PARTE B · A AUTORIDADE DO ESTADO YOUTUBE ================= */

const congelada = {
  youtubeFrozenInvestigation: {
    runRef: {
      runId: "run-1", runVersion: 1, runFingerprint: "sig", collectedAt: "2026-09-14T10:00:00.000Z",
      provider: "dataforseo", endpoint: "/v3/serp/youtube/organic/live/advanced",
      queriesExecuted: 3, universeSize: 38, selectedVideoIds: [],
    },
  },
};

test("I · FINALIZED 3/38 nunca é lido como 'não coletada'", () => {
  const leitura = radarResearchPrimaryCollection({ payload: congelada, profile: "YOUTUBE" });

  assert.equal(leitura.collected, true, "YOUTUBE_SERP_LABEL_CORRECT");
  assert.equal(leitura.queryCount, 3);
  assert.equal(leitura.resultCount, 38);
  assert.equal(leitura.authority, "FROZEN", "a fotografia respondeu, e ela diz que respondeu");
  assert.equal(leitura.running, false);
  assert.equal(leitura.failed, false);
});

test("J · o transporte compacto não altera estado semântico", () => {
  /*
   * A RECONSTITUIÇÃO EXATA DO DEFEITO.
   *
   * `compactRadarResearchForRead` zera `youtubeSearch` assim que a investigação
   * congela — é decisão de transporte, e §10 é explícito. Antes deste gate, o
   * pacote lia esse campo direto e concluía "não coletada" sobre a MESMA
   * investigação que o cabeçalho chamava de finalizada.
   */
  const completo = {
    ...congelada,
    youtubeSearch: {
      state: "COLLECTED",
      queries: [{ executed: true }, { executed: true }, { executed: true }],
      universe: Array.from({ length: 38 }, (_, indice) => ({ videoId: `v${indice}` })),
    },
  };

  const compacto = compactRadarResearchForRead(completo as Record<string, unknown>);
  assert.equal(compacto.youtubeSearch, null, "o transporte de fato tirou a corrida");
  assert.equal(compacto.researchTransport, "COMPACT");

  const antes = radarResearchPrimaryCollection({ payload: completo, profile: "YOUTUBE" });
  const depois = radarResearchPrimaryCollection({ payload: compacto, profile: "YOUTUBE" });

  assert.deepEqual(depois, antes, "FULL e COMPACT leem a MESMA coleta");
  assert.equal(depois.collected, true);
  assert.equal(depois.resultCount, 38);

  /* E a fonte continua listada como coletada no plano de pesquisa. */
  assert.equal(radarResearchPlanOfAnalysis(compacto).sources.includes("YOUTUBE_SERP"), true);
  assert.equal(radarResearchPlanOfAnalysis(compacto).missingRequiredSource, null);
});

test("J · uma fotografia LEGADA, com a corrida copiada, também responde", () => {
  /*
   * Congelamentos anteriores ao `runRef` guardam a corrida inteira. Lê-los como
   * "não coletada" seria o mesmo defeito, em outra época — e reescrevê-los
   * seria migrar histórico.
   */
  const legado = {
    youtubeFrozenInvestigation: {
      runRef: null,
      run: {
        state: "COLLECTED",
        queries: [{ executed: true }, { executed: true }],
        universe: [{ videoId: "v1" }, { videoId: "v2" }, { videoId: "v3" }],
      },
    },
  };
  const leitura = radarResearchPrimaryCollection({ payload: legado, profile: "YOUTUBE" });
  assert.equal(leitura.collected, true);
  assert.equal(leitura.queryCount, 2);
  assert.equal(leitura.resultCount, 3);
  assert.equal(leitura.authority, "FROZEN");
});

test("I · sem coleta nenhuma, 'não coletada' continua sendo a verdade", () => {
  const vazio = radarResearchPrimaryCollection({ payload: {}, profile: "YOUTUBE" });
  assert.equal(vazio.collected, false);
  assert.equal(vazio.authority, "NONE", "corrigir o falso negativo não pode criar um falso positivo");

  const coletando = radarResearchPrimaryCollection({
    payload: { youtubeSearch: { state: "COLLECTING", queries: [], universe: [] } },
    profile: "YOUTUBE",
  });
  assert.equal(coletando.running, true);
  assert.equal(coletando.collected, false);
  assert.equal(coletando.authority, "RUN");
});

/* ============== PARTE C · O ROTEIRO É DESTE ARTICLEDNA ============== */

const contexto = (patch: Record<string, unknown> = {}): RadarArticleResearchContext => ({
  state: "COMPLETE",
  article: {
    brandId: "marca-1", articleId: "artigo-1",
    articleDnaVersionId: "dna-v1", articleDnaContentHash: "hash",
    promise: "Skin care noturno", mainIntent: "informacional", hierarchy: "Suporte",
    classification: { intent: "INFORMATIONAL", intentLabel: "Informacional", funnel: "TOP", funnelLabel: "Topo", reason: "Fechado pelo Arquiteto." },
  },
  keywords: [{ identity: { keywordId: "kw1", role: "principal", text: "skin care noturno" } }],
  editorialTopics: ["ordem da rotina noturna", "o que fazer em cada etapa", "erros comuns à noite"],
  resolvedKeywordTexts: ["skin care noturno"],
  silo: { siloId: "silo-1", siloName: "skincare", articleRole: "SUPORTE" },
  formationSerp: null, internalLinks: null, limitations: [],
  ...patch,
} as unknown as RadarArticleResearchContext);

const sinal = (id: string, statement: string, evidence: string) => ({
  id, statement, grade: "OBSERVED_SERP" as const, evidence, count: null,
});

/**
 * O ROTEIRO GENÉRICO REAL — é ele que produzia "Bloco 1 · fundamento".
 *
 * A fixture usa os nomes que `radarYoutubeScript` gera de verdade, e não uma
 * versão simpática deles: um teste sobre nomes estruturais que não usasse os
 * nomes estruturais não provaria nada.
 */
const youtube = (patch: Record<string, unknown> = {}): RadarYoutubeCanonicalBlueprint => ({
  schemaVersion: 1,
  profile: "YOUTUBE",
  articleId: "artigo-1",
  articleDnaVersionId: "dna-v1",
  limitations: [
    "Nenhum vídeo foi baixado, assistido ou transcrito.",
    "Nenhuma página foi visitada e nenhum vídeo foi assistido ou transcrito.",
    "A SERP não retornou Shorts para estas consultas.",
  ],
  observed: {
    comparableVideos: 38, longForm: 38, shorts: 0,
    titlePatterns: [sinal("t1", "ROTINA DE SKIN CARE NOTURNO", "13 de 38 títulos")],
    recurrentChannels: [], durationRange: "mediana 9 min", viewsRange: null, recency: null,
    crossQuery: [], googleSupport: [], gaps: [], sufficiency: "Amostra suficiente",
  },
  recommended: {
    format: "ARTICLE_WITH_VIDEO",
    durationDirection: "Entre 8 e 12 minutos",
    titleDirections: [{ id: "d1", statement: "Nomear o resultado no título", objective: "Prender pela promessa", sourceSignal: "13 de 38 títulos" }],
    hookDirection: {
      id: "h1",
      statement: 'Abra contrariando a promessa que a amostra repete ("Rotina"): diga o que muda em relação ao que a pessoa já viu.',
      objective: "justificar a escolha deste vídeo",
      sourceSignal: '13 título(s) comparáveis usam o enquadramento "Rotina".',
    },
    script: [
      { block: "Gancho", objective: "Capturar a intenção nos primeiros segundos.", direction: "Diga o que o vídeo entrega antes de dizer quem você é.", sourceSignal: "A amostra tem 38 concorrentes comparáveis." },
      { block: "Abertura", objective: "Estabelecer para quem é e o que será respondido.", direction: "Delimite o caso coberto.", sourceSignal: "A intenção declarada do artigo delimita o público." },
      { block: "Bloco 1 · fundamento", objective: "Dar o porquê antes do como.", direction: "Explique o mecanismo que faz a recomendação funcionar.", sourceSignal: "O enquadramento dominante é instrucional." },
      { block: "Bloco 2 · aplicação", objective: "Entregar a execução, na ordem.", direction: "Mostre acontecendo.", sourceSignal: "É o formato que a busca reconhece." },
      { block: "CTA", objective: "Encaminhar o próximo passo.", direction: "Aponte o próximo conteúdo.", sourceSignal: "Intenção declarada do artigo." },
    ],
    tone: null, languageDirection: null, technicalLevel: null, authorityDirection: null,
    shorts: [],
    articleApplication: [
      { piece: "VIDEO_HERO", placement: "Topo do artigo, antes do primeiro H2.", role: "Responde a intenção inteira para quem prefere assistir.", sourceSignal: "A busca devolve peça audiovisual." },
    ],
  },
  ...patch,
} as unknown as RadarYoutubeCanonicalBlueprint);

const modelo = (patch: { context?: RadarArticleResearchContext; blueprint?: RadarYoutubeCanonicalBlueprint } = {}) =>
  buildRadarEditorialVideoModel({ context: patch.context || contexto(), blueprint: patch.blueprint || youtube() });

test("K e L · o título é deste ArticleDNA, e nunca 'gancho e abertura'", () => {
  const model = modelo();

  /*
   * O DEFEITO EXATO DA TELA: as facetas do título eram os nomes estruturais dos
   * dois primeiros blocos, e o resultado anunciava a arquitetura do roteiro.
   */
  assert.equal(/gancho|abertura|bloco \d/i.test(model.workingTitle), false, "YOUTUBE_TITLE_SPECIFIC");
  assert.match(model.workingTitle, /skin care noturno/i, "o assunto do artigo está no título");
  assert.match(model.workingTitle, /ordem da rotina|cada etapa/i, "e a necessidade declarada também");

  /* E outro ArticleDNA, com a MESMA evidência, produz outro título. */
  const outro = modelo({
    context: contexto({
      keywords: [{ identity: { keywordId: "kw2", role: "principal", text: "protetor solar facial" } }],
      editorialTopics: ["quantidade certa por aplicação", "reaplicação ao longo do dia"],
    }),
  });
  assert.notEqual(outro.workingTitle, model.workingTitle, "YOUTUBE_BLOCKS_ARTICLE_DNA_BOUND");
  assert.equal(/gancho|abertura|bloco \d/i.test(outro.workingTitle), false);
});

test("M · a promessa diz o que o espectador saberá fazer", () => {
  const model = modelo();

  /* A frase genérica que servia para qualquer vídeo do mundo não volta. */
  assert.notEqual(model.promise, "Ao final, o espectador sai sabendo aplicar o que viu.");
  assert.equal(/sai sabendo aplicar o que viu/i.test(model.promise), false, "YOUTUBE_PROMISE_SPECIFIC");
  assert.match(model.promise, /ordem da rotina|cada etapa|erros/i, "ela nomeia o que será entregue");

  /*
   * SEM NECESSIDADE DECLARADA, a promessa recua para o ASSUNTO e continua
   * prudente — prometer detalhe que a evidência não sustenta seria inventar.
   */
  const semTopicos = modelo({ context: contexto({ editorialTopics: [] }) });
  assert.match(semTopicos.promise, /skin care noturno/i);
  assert.equal(/sai sabendo aplicar o que viu/i.test(semTopicos.promise), false);
});

test("N · o hook é instrução de gravação, não comentário sobre a SERP", () => {
  const model = modelo();

  assert.ok(model.hook, "YOUTUBE_HOOK_EDITORIAL");
  /* A frase real que a tela mostrava não pode sobreviver. */
  assert.equal(/a amostra repete|contrariando a promessa|"Rotina"/i.test(model.hook!), false);
  assert.equal(/\d+ t(í|i)tulos?|13|38|mediana/i.test(model.hook!), false, "nenhuma frequência no gancho");
  assert.match(model.hook!, /ordem da rotina|skin care noturno/i, "e ele é sobre ESTE artigo");

  /*
   * §18 · NADA DE TRANSCRIPT INVENTADO.
   *
   * Nenhum vídeo foi assistido. Um gancho que dissesse o que os concorrentes
   * FALAM afirmaria uma leitura que esta coleta não tem como ter feito.
   */
  assert.equal(/concorrentes? dizem|v(í|i)deos demonstram|hook usado dentro/i.test(model.hook!), false);
});

test("O · os blocos dizem o que o vídeo cobre, e o nome estrutural vira papel", () => {
  const model = modelo();
  const titulos = model.blocks.map(bloco => bloco.heading);

  /* Nenhum bloco continua se chamando pela posição que ocupa. */
  for (const titulo of titulos) {
    assert.equal(/^(bloco \d|gancho|abertura|cta)$/i.test(titulo.trim()), false, `título estrutural: ${titulo}`);
  }
  assert.equal(titulos.some(item => /bloco 1 · fundamento|bloco 2 · aplica/i.test(item)), false);

  /* As necessidades do ArticleDNA viraram o que os blocos cobrem. */
  const corpo = titulos.join(" | ").toLowerCase();
  assert.match(corpo, /ordem da rotina/);
  assert.match(corpo, /cada etapa/);

  /* E o nome estrutural não sumiu: ele é o PAPEL, que tem campo próprio. */
  assert.ok(model.blocks.every(bloco => bloco.function.length > 0));
  assert.ok(model.blocks.every(bloco => bloco.sourceSignal.length > 0), "cada bloco continua com lastro");

  /*
   * §8 · MUST_COVER ≠ MUST_BLOCK — a arquitetura não cresce por decreto.
   *
   * Cinco blocos entraram no roteiro; cinco saem. Um tópico a mais vira ponto
   * de cobertura, nunca um bloco novo.
   */
  assert.equal(model.blocks.length, 5);
  const comExcesso = modelo({
    context: contexto({ editorialTopics: ["ordem da rotina noturna", "o que fazer em cada etapa", "erros comuns à noite", "quando trocar de ativo", "pele sensível à noite"] }),
  });
  assert.equal(comExcesso.blocks.length, 5, "MUST_COVER não cria bloco");
  const cobertura = comExcesso.blocks.flatMap(bloco => bloco.coveragePoints).join(" ").toLowerCase();
  assert.match(cobertura, /trocar de ativo|pele sens/);

  /*
   * A PERGUNTA DO APOIO QUE SOBRA TAMBÉM NÃO PODE SUMIR.
   *
   * O laço de MUST_COVER cobre os tópicos do ArticleDNA e só eles — uma
   * pergunta do apoio do Google que não coubesse em bloco nenhum seria perdida
   * em silêncio, e a coleta que a trouxe foi paga.
   */
  const comPerguntas = modelo({
    context: contexto({ editorialTopics: [] }),
    blueprint: youtube({
      observed: {
        ...youtube().observed,
        googleSupport: [
          sinal("g1", "Qual a ordem correta dos produtos à noite?", "PAA"),
          sinal("g2", "Precisa usar protetor solar à noite?", "PAA"),
          sinal("g3", "Com que frequência esfoliar a pele à noite?", "PAA"),
          sinal("g4", "Quanto tempo esperar entre uma camada e outra?", "PAA"),
        ],
      },
    }),
  });
  const tudo = [
    ...comPerguntas.blocks.map(bloco => bloco.heading),
    ...comPerguntas.blocks.flatMap(bloco => bloco.coveragePoints),
  ].join(" | ").toLowerCase();
  assert.match(tudo, /esfoliar/, "a pergunta que sobrou virou cobertura, não lixo");
  assert.match(tudo, /camada/, "e a última também");
});

test("O · sem necessidade declarada, o bloco fala do assunto — nunca da estrutura", () => {
  const model = modelo({ context: contexto({ editorialTopics: [] }) });

  for (const bloco of model.blocks) {
    assert.equal(/^(bloco \d|gancho|abertura)$/i.test(bloco.heading.trim()), false, bloco.heading);
  }
  assert.match(model.blocks.map(item => item.heading).join(" ").toLowerCase(), /skin care noturno/);
});

test("T · as limitações são deduplicadas sem perder limitação de verdade", () => {
  const model = modelo();

  /* YOUTUBE_LIMITATIONS_BEFORE = 3 (duas dizendo a mesma coisa). */
  assert.equal(youtube().limitations.length, 3);
  assert.equal(model.limitations.length, 2, "YOUTUBE_LIMITATIONS_AFTER");

  /* A que sobrou é a mais curta, e a restrição continua dita. */
  const texto = model.limitations.join(" | ").toLowerCase();
  assert.match(texto, /assistido ou transcrito/);
  assert.match(texto, /shorts/, "a limitação DIFERENTE sobreviveu");

  /*
   * O RISCO DA DEDUPLICAÇÃO é comer um limite de verdade. Duas restrições sem
   * parentesco continuam sendo duas.
   */
  assert.deepEqual(
    deduplicarLimitacoes(["Nenhum vídeo foi assistido.", "A coleta não observou preço de nenhum produto."]),
    ["Nenhum vídeo foi assistido.", "A coleta não observou preço de nenhum produto."],
  );
  /* E frases curtas demais para comparar não são colapsadas por acidente. */
  assert.deepEqual(deduplicarLimitacoes(["Sem Shorts.", "Sem canais."]), ["Sem Shorts.", "Sem canais."]);
});

test("§21 · a aplicação no artigo é operacional, sem enum técnico", () => {
  const model = modelo();

  assert.ok(model.articleApplication.length >= 1);
  for (const item of model.articleApplication) {
    assert.equal(/VIDEO_HERO|GOOGLE_SUPPORT|^SHORT$|^IMAGEM$/.test(item.piece), false, `enum na tela: ${item.piece}`);
    assert.ok(item.placement.length > 0, "onde inserir");
    assert.ok(item.role.length > 0, "que função cumpre");
  }
  assert.match(model.articleApplication.map(item => item.piece).join(" "), /Vídeo principal/);
});

/* ================== PARTE D · A SUPERFÍCIE, NO DOM ================== */

async function montar() {
  const tela = await montarRadar();
  await tela.render(React.createElement(RadarProfileBlueprintSection, { model: modelo() }));
  return tela;
}

test("N e O · a superfície principal mostra o produto, não a telemetria", async () => {
  const tela = await montar();
  const texto = tela.container.textContent || "";

  assert.match(texto, /ordem da rotina/i, "o roteiro está na tela");
  assert.equal(/13 de 38|mediana|percentil|p25/i.test(texto), false, "YOUTUBE_TECHNICAL_IDS_NORMAL_VIEW = 0");
  assert.equal(/a amostra repete/i.test(texto), false);

  tela.destroy();
});

test("P, Q, R e S · uma porta para a evidência, um botão de handoff", async () => {
  const workbench = await readFile(new URL("../modules/radar/radar-r3-workbench.tsx", import.meta.url), "utf8");
  const painel = await readFile(new URL("../modules/radar/radar-youtube-search-panel.tsx", import.meta.url), "utf8");

  /*
   * P e Q · O BLUEPRINT MULTIFORMATO E AS COORTES DESCERAM.
   *
   * A verificação é de CONTENÇÃO, não de existência: os dois continuam
   * renderizando — o que mudou é de onde.
   */
  const porta = painel.indexOf('data-testid="radar-youtube-competitive-evidence"');
  assert.ok(porta > 0, "a porta de evidência existe");
  assert.ok(painel.indexOf("<BlueprintMultiformato", porta) > porta, "LEGACY_MULTIFORMAT_MAIN_VIEW = NO");
  assert.ok(painel.indexOf('data-testid="radar-youtube-cohort-details"', porta) > porta,
    "LEGACY_TECHNICAL_COHORTS_MAIN_VIEW = NO");
  /*
   * S · A CONTENÇÃO É DE VERDADE, não de ordem no arquivo.
   *
   * Um mutante que tirasse `{evidenceExtras}` de dentro do disclosure e o
   * colasse logo DEPOIS do `</details>` continuaria "vindo depois da porta" —
   * e é exatamente essa a regressão que o §25 proíbe. A verificação conta a
   * profundidade de `<details>` até o nó: fora dele, ela zera.
   */
  const ondeExtras = painel.indexOf("{evidenceExtras}", porta);
  assert.ok(ondeExtras > porta, "LOOSE_RESEARCH_DETAILS = 0");
  /* A contagem começa na TAG que abre a porta, não no atributo que a nomeia. */
  const abreAPorta = painel.lastIndexOf("<details", porta);
  const entre = painel.slice(abreAPorta, ondeExtras);
  const profundidade = (entre.match(/<details/g) || []).length - (entre.match(/<\/details>/g) || []).length;
  assert.ok(profundidade >= 1, "o painel legado está DENTRO do disclosure de evidência, não ao lado dele");

  /* Cada um renderiza UMA vez: descer não pode virar duplicar. */
  for (const marca of ["<BlueprintMultiformato", 'data-testid="radar-youtube-cohort-details"', "{evidenceExtras}"]) {
    assert.equal(painel.split(marca).length - 1, 1, `${marca} renderiza uma vez só`);
  }

  /*
   * R · UM HANDOFF. O canônico, e nenhum paralelo.
   *
   * Um botão por perfil daria três fronteiras para a mesma entrega, e o
   * Planejador aprenderia três dialetos da mesma pergunta.
   */
  assert.equal((workbench.match(/<PlannerHandoff tab=/g) || []).length, 2, "os dois ramos do mesmo componente");
  assert.equal((workbench.match(/data-testid="radar-planner-send"/g) || []).length, 1, "DUPLICATE_HANDOFF_BUTTON = NO");
  for (const arquivo of [painel, await readFile(new URL("../modules/radar/radar-amazon-search-panel.tsx", import.meta.url), "utf8"), await readFile(new URL("../modules/radar/radar-profile-blueprint.tsx", import.meta.url), "utf8")]) {
    assert.equal(/Enviar ao Planejador/.test(arquivo), false, "nenhum painel cria a própria fronteira");
  }

  /* S · e o render solto do painel legado acabou. */
  assert.equal(/\{!areaGoogle && evidenceExtras\}/.test(workbench), false, "LOOSE_RESEARCH_DETAILS = 0");
});

test("GOOGLE_CHANGED = NO · o perfil homologado não foi tocado por este gate", async () => {
  const google = await readFile(new URL("../lib/radar/editorial-article-model.ts", import.meta.url), "utf8");

  /*
   * O Google foi homologado e o gate diz NÃO TOCAR. A garantia não é uma
   * promessa no comentário: as funções que o 2.1 mexeu são de OUTRO módulo, e
   * os ajudantes continuam sendo importados de lá em vez de copiados.
   */
  assert.equal(/2\.1 · §1[2-9]|PROFILES_2\.1/.test(google), false, "a síntese do Google não recebeu ajuste deste gate");

  const perfis = await readFile(new URL("../lib/radar/editorial-profile-model.ts", import.meta.url), "utf8");
  assert.match(perfis, /import \{ caixaEditorial, emLista, pareceIdentificador, pontoEditorial \} from "\.\/editorial-article-model\.ts"/,
    "os ajudantes continuam reusados, nunca copiados");
});

test("PROVIDER_CALLS = 0", () => {
  assert.deepEqual(idasAoServidor, [], `nenhuma rede deveria ter saído; houve: ${idasAoServidor.join(", ")}`);
});
