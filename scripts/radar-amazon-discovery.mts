/**
 * ===== DESCOBERTA DO PAYLOAD DA AMAZON — AMAZON_SEARCH_0 =====
 *
 * ===================== O QUE ESTE SCRIPT É =====================
 *
 * Uma inspeção do que o provider REALMENTE entrega no endpoint de Amazon. Ele
 * não normaliza, não grava, não cria investigação e não toca o Radar. Lê,
 * inventaria e salva uma fixture sanitizada.
 *
 * ============ A DESCOBERTA QUE VEIO ANTES DA CHAMADA ============
 *
 * A Amazon vive na Merchant API, que é um produto separado dentro da
 * DataForSEO. A página de documentação de `task_post` sugere um fluxo
 * task-based — postar, esperar, buscar —, e concluir por ela seria concluir
 * cedo demais.
 *
 * O CATÁLOGO DA PRÓPRIA CONTA diz outra coisa. `price.merchant.amazon.products`
 * expõe `live`, `task_post` e `task_get`: existe endpoint SÍNCRONO, a
 * US$ 0,0033 por requisição. Então o START da Amazon pode ser uma chamada só,
 * como o do YouTube — sem estado "aguardando o provider".
 *
 * A lição é de método: a documentação descreve o produto; o catálogo da conta
 * descreve o que ESTA conta pode chamar. Quando divergem, o catálogo manda.
 *
 * ============ E O QUE ELE NÃO VAI ENTREGAR ============
 *
 * `price.merchant.reviews` existe e só tem `task_post`/`task_get` — sem live.
 * Texto de avaliação é OUTRO endpoint, OUTRO custo e OUTRO fluxo. A SERP de
 * produtos não traz review escrito, e nenhuma tela pode prometer isso.
 *
 * ================== PASSO 0 ANTES DE GASTAR ==================
 *
 * A Merchant API é um produto separado dentro da DataForSEO. Antes de postar
 * uma tarefa paga, este script pergunta ao endpoint GRATUITO de conta se ela
 * está disponível e qual é o saldo. Postar primeiro e descobrir depois que a
 * conta não tem acesso seria gastar para aprender o que uma leitura responde.
 *
 * ===================== EXECUÇÃO MANUAL =====================
 *
 *   pnpm run amazon:discovery
 *   pnpm run amazon:discovery "outra keyword"
 *
 * Nada aqui roda em teste, em CI ou por efeito de tela.
 *
 * NENHUMA CREDENCIAL É IMPRESSA. O script confere que existem e usa; os
 * valores não aparecem em log, em erro nem na fixture.
 */

import { mkdir, writeFile } from "node:fs/promises";

const BASE = "https://api.dataforseo.com";

/* Confirmado na documentação do provider ANTES da chamada — §2. */
const ENDPOINT_LIVE = "/v3/merchant/amazon/products/live/advanced";
const ENDPOINT_CONTA = "/v3/appendix/user_data";

/**
 * A KEYWORD — e por que não é a sugerida.
 *
 * O gate sugeriu "skincare nivea" e pediu motivo documentado para trocar.
 *
 * "skincare nivea" é MARCA + categoria: a SERP volta dominada por uma marca só.
 * Para descoberta isso é o pior caso — não dá para observar diversidade de
 * marca, faixa de preço nem critério de escolha, que são exatamente as
 * capacidades que o §15 manda classificar.
 *
 * "protetor solar facial" é comercial, do mesmo nicho das investigações já
 * feitas (pele oleosa, skin care noturno), e disputada por muitas marcas em
 * faixas de preço diferentes. É a busca que mais revela sobre o payload.
 */
const KEYWORD_PADRAO = "protetor solar facial";

/**
 * ============ O IDIOMA DA MERCHANT API USA UNDERSCORE ============
 *
 * A primeira chamada foi recusada com `Invalid Field: language_code` — custo
 * zero, porque a guarda do §5 leu o status da TAREFA e não o HTTP 200.
 *
 * O catálogo `/v3/merchant/amazon/languages` lista 27 idiomas, e o do Brasil é
 * `pt_BR`. Não `pt-BR`, que é o da SERP do YouTube, nem `pt-br`, que é como a
 * configuração canônica do Radar guarda.
 *
 * São TRÊS convenções para o mesmo idioma, e cada adapter precisa da sua. Foi
 * exatamente esse tipo de divergência que fez o YouTube voltar vazio no 2.1.
 */
const LOCATION_CODE = 2076;
const LANGUAGE_CODE = "pt_BR";

const linha = (rotulo: string, valor: unknown) => console.log(`${rotulo.padEnd(26)} ${String(valor)}`);
const titulo = (texto: string) => { console.log(""); console.log("=".repeat(72)); console.log(texto); console.log("=".repeat(72)); };

function credenciais() {
  const login = process.env.DATAFORSEO_LOGIN?.trim();
  const password = process.env.DATAFORSEO_PASSWORD?.trim();
  if (!login || !password) {
    throw new Error("DATAFORSEO_LOGIN e DATAFORSEO_PASSWORD precisam estar no ambiente. Nenhum valor é impresso por este script.");
  }
  return Buffer.from(`${login}:${password}`).toString("base64");
}

async function chamar(caminho: string, corpo?: unknown) {
  const resposta = await fetch(`${BASE}${caminho}`, {
    method: corpo ? "POST" : "GET",
    headers: {
      Authorization: `Basic ${credenciais()}`,
      ...(corpo ? { "Content-Type": "application/json" } : {}),
    },
    ...(corpo ? { body: JSON.stringify(corpo) } : {}),
  });
  const json = await resposta.json().catch(() => null);
  return { http: resposta.status, json } as { http: number; json: Record<string, unknown> | null };
}

const objeto = (valor: unknown) =>
  valor && typeof valor === "object" && !Array.isArray(valor) ? valor as Record<string, unknown> : null;

/**
 * O INVENTÁRIO DE UM ITEM — campos presentes, nulos e aninhados.
 *
 * O §6 pede isso explicitamente: descobrir o que existe, e declarar AUSENTE o
 * que não existe, em vez de fabricar equivalência.
 */
function inventariar(itens: unknown[]) {
  const porTipo = new Map<string, { count: number; campos: Map<string, { presente: number; nulo: number; tipos: Set<string> }> }>();

  for (const bruto of itens) {
    const item = objeto(bruto);
    if (!item) continue;
    const tipo = typeof item.type === "string" ? item.type : "(sem type)";
    if (!porTipo.has(tipo)) porTipo.set(tipo, { count: 0, campos: new Map() });
    const registro = porTipo.get(tipo)!;
    registro.count += 1;

    for (const [campo, valor] of Object.entries(item)) {
      if (!registro.campos.has(campo)) registro.campos.set(campo, { presente: 0, nulo: 0, tipos: new Set() });
      const conta = registro.campos.get(campo)!;
      conta.presente += 1;
      if (valor === null) conta.nulo += 1;
      else conta.tipos.add(Array.isArray(valor) ? "array" : typeof valor);
    }
  }
  return porTipo;
}

/**
 * A FIXTURE SANITIZADA — §4.
 *
 * Sai o que identifica a conta; fica a estrutura. Nada é renomeado nem
 * convertido: alterar semanticamente o campo tornaria a fixture inútil para
 * validar o normalizador depois.
 */
function sanitizar(corpo: Record<string, unknown>) {
  const tarefas = Array.isArray(corpo.tasks) ? corpo.tasks : [];
  return {
    _fixture: "AMAZON_SEARCH_0 · payload real sanitizado. Credenciais e identificadores de conta removidos; estrutura preservada.",
    status_code: corpo.status_code,
    status_message: corpo.status_message,
    tasks: tarefas.map(bruta => {
      const tarefa = objeto(bruta) || {};
      const { cost: _custo, ...resto } = tarefa;
      void _custo;
      return {
        ...resto,
        id: "TASK_ID_REMOVIDO",
        data: { ...(objeto(tarefa.data) || {}), tag: "TAG_REMOVIDA" },
      };
    }),
  };
}

async function main() {
  const keyword = process.argv.slice(2).join(" ").trim() || KEYWORD_PADRAO;

  titulo("AMAZON_SEARCH_0 · DESCOBERTA DO PAYLOAD REAL");
  linha("endpoint", ENDPOINT_LIVE);
  linha("keyword", keyword);
  linha("location_code", LOCATION_CODE);
  linha("language_code", LANGUAGE_CODE);
  linha("credenciais", "presentes (valores nunca impressos)");

  /* ---------- PASSO 0 · a conta tem Merchant API? (gratuito) ---------- */
  titulo("PASSO 0 · ACESSO E SALDO (chamada gratuita)");
  const conta = await chamar(ENDPOINT_CONTA);
  linha("HTTP", conta.http);

  linha("status_code", conta.json?.status_code);
  linha("status_message", conta.json?.status_message);

  /*
   * `result` É ARRAY, e ler como objeto devolve null.
   *
   * A primeira versão deste script fazia isso e imprimiu "Merchant API NÃO
   * ENCONTRADA" sobre uma conta que tem acesso. Um defeito de leitura virando
   * conclusão sobre o plano do usuário: o saldo vazio ao lado era a denúncia.
   */
  const raiz = objeto((objeto((conta.json?.tasks as unknown[])?.[0])?.result as unknown[])?.[0]);

  const saldo = objeto(raiz?.money);
  linha("saldo", saldo ? String(saldo.balance) : "(não informado)");

  const merchant = objeto(objeto(raiz?.price)?.merchant);
  const produtos = objeto(objeto(merchant?.amazon)?.products);
  const custoLive = objeto(objeto(objeto(produtos?.live)?.advanced)?.priority_normal as never);
  const temLive = Boolean(produtos?.live);

  linha("merchant.amazon", merchant?.amazon ? "disponível" : "AUSENTE");
  linha("amazon.products.live", temLive ? "disponível" : "AUSENTE");
  linha("custo por requisição", (Array.isArray((objeto(objeto(produtos?.live)?.advanced) || {}).priority_normal)
    ? ((objeto(objeto(produtos?.live)?.advanced) as Record<string, Array<{ cost: number }>>).priority_normal[0]?.cost ?? "?")
    : "?"));
  void custoLive;

  /*
   * §8 e §18 · TEXTO DE AVALIAÇÃO É OUTRO ENDPOINT.
   *
   * `merchant.reviews` tem task_post/task_get e nenhum live. Descobrir isso
   * aqui, antes de qualquer tela, é o que impede prometer "Reviews e objeções"
   * sobre matéria-prima que esta SERP não entrega.
   */
  const reviews = objeto(merchant?.reviews);
  linha("merchant.reviews", reviews ? `existe · modos: ${Object.keys(reviews).join(", ")}` : "AUSENTE");

  if (!temLive) {
    console.log("");
    console.log("GATE = BLOCKED · a conta não expõe o endpoint live de produtos da Amazon.");
    console.log("Nenhuma chamada paga foi feita.");
    return;
  }

  /* ---------- PASSO 1 · A CHAMADA PAGA, UMA SÓ ---------- */
  titulo("PASSO 1 · LIVE/ADVANCED (a chamada paga · uma requisição)");
  const pedido = [{
    keyword,
    location_code: LOCATION_CODE,
    language_code: LANGUAGE_CODE,
    /*
     * PROFUNDIDADE MODESTA NA DESCOBERTA.
     *
     * O padrão do provider é 100 e o teto é 700. Para inventariar tipos e
     * campos, os primeiros resultados bastam — e a lição do YouTube (114 itens
     * cuja cauda era derivação lateral do assunto) vale aqui antes de custar.
     */
    depth: 20,
    tag: `amazon-discovery:${Date.now()}`,
  }];
  console.log(JSON.stringify(pedido, null, 2));

  const chamada = await chamar(ENDPOINT_LIVE, pedido);
  linha("HTTP", chamada.http);
  linha("status_code", chamada.json?.status_code);
  linha("status_message", chamada.json?.status_message);

  const tarefa = objeto((chamada.json?.tasks as unknown[])?.[0]);
  linha("task.status_code", tarefa?.status_code);
  linha("task.status_message", tarefa?.status_message);
  linha("task.cost", tarefa?.cost);

  /*
   * §5 · HTTP 200 NÃO É SUCESSO DA TAREFA.
   *
   * A lição do YouTube, verbatim: a DataForSEO responde 200 e reporta a recusa
   * dentro do corpo. Tratar isso como "SERP vazia" esconderia a recusa atrás
   * de uma tela que parece correta.
   */
  if (Number(tarefa?.status_code) !== 20000) {
    console.log("");
    console.log("GATE = BLOCKED · a tarefa não teve sucesso no provider.");
    console.log("Isto NÃO é SERP vazia: é recusa, e o motivo está em task.status_message acima.");
    return;
  }

  const resultado = chamada.json as Record<string, unknown>;

  /* ---------- PASSO 3 · o inventário ---------- */
  titulo("PASSO 3 · INVENTÁRIO DO PAYLOAD REAL");
  const tarefaFinal = objeto((resultado.tasks as unknown[])?.[0]);
  const resultados = Array.isArray(tarefaFinal?.result) ? tarefaFinal.result : [];
  linha("result count", resultados.length);

  const primeiro = objeto(resultados[0]);
  linha("se_domain", primeiro?.se_domain);
  linha("check_url", primeiro?.check_url ? "(presente)" : "(ausente)");
  linha("items_count", primeiro?.items_count);
  linha("item_types", JSON.stringify(primeiro?.item_types));

  const itens = Array.isArray(primeiro?.items) ? primeiro.items : [];
  linha("items.length", itens.length);

  const inventario = inventariar(itens);
  for (const [tipo, registro] of inventario) {
    console.log("");
    console.log(`--- item type: ${tipo} · count = ${registro.count}`);
    for (const [campo, conta] of [...registro.campos].sort()) {
      const tipos = [...conta.tipos].join("|") || "sempre null";
      console.log(`    ${campo.padEnd(28)} presente ${conta.presente}/${registro.count} · nulo ${conta.nulo} · ${tipos}`);
    }
  }

  /* Um exemplar de cada tipo, inteiro, para conferência à mão. */
  titulo("PASSO 3b · UM EXEMPLAR DE CADA TIPO");
  const vistos = new Set<string>();
  for (const bruto of itens) {
    const item = objeto(bruto);
    const tipo = typeof item?.type === "string" ? item.type : null;
    if (!tipo || vistos.has(tipo)) continue;
    vistos.add(tipo);
    console.log("");
    console.log(`--- ${tipo}`);
    console.log(JSON.stringify(item, null, 2));
  }

  /* ---------- PASSO 4 · a fixture ---------- */
  const destino = new URL("../tests/fixtures/dataforseo-amazon-discovery.json", import.meta.url);
  await mkdir(new URL("../tests/fixtures/", import.meta.url), { recursive: true });
  await writeFile(destino, JSON.stringify(sanitizar(resultado), null, 2), "utf8");

  titulo("PASSO 4 · FIXTURE SALVA");
  linha("arquivo", "tests/fixtures/dataforseo-amazon-discovery.json");
  linha("credenciais na fixture", "nenhuma");
  linha("task id na fixture", "removido");
}

main().catch(erro => {
  /* O erro pode carregar a URL; nunca as credenciais, que só existem no header. */
  console.error("");
  console.error("FALHA:", erro instanceof Error ? erro.message : erro);
  process.exitCode = 1;
});
