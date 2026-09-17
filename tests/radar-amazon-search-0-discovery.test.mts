import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

/*
 * ===== AMAZON_SEARCH_0 · O QUE O PROVIDER REALMENTE ENTREGA =====
 *
 * Esta suíte não normaliza nada e não propõe contrato. Ela trava o que foi
 * OBSERVADO numa chamada real, para que AMAZON_SEARCH_1 seja construído sobre
 * o payload e não sobre a documentação.
 *
 * A distinção importa: a página de docs de `task_post` sugere um fluxo
 * assíncrono, e o catálogo da conta mostra endpoint LIVE. Onde os dois
 * divergem, vale o que a conta pode chamar.
 *
 * PROVIDER_CALLS = 0 nesta suíte. A chamada real foi feita uma vez, à mão, e o
 * que sobrou dela é a fixture.
 */

const tentativasDeRede: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    tentativasDeRede.push(String((entrada as { url?: string })?.url || entrada));
    return Promise.reject(new Error("REDE PROIBIDA NESTE GATE"));
  },
  writable: true, configurable: true,
});

const payload = JSON.parse(
  await readFile(new URL("./fixtures/dataforseo-amazon-discovery.json", import.meta.url), "utf8"),
);

const tarefa = payload.tasks[0];
const resultado = tarefa.result[0];
const itens: Array<Record<string, unknown>> = resultado.items;
const organicos = itens.filter(item => item.type === "amazon_serp");
const pagos = itens.filter(item => item.type === "amazon_paid");

/* ==================== §5 · o status da TAREFA ==================== */

test("§5 · a tarefa teve sucesso — e o status lido é o DELA, não o HTTP", () => {
  /*
   * A primeira chamada deste gate voltou HTTP 200 com
   * `task.status_code = 40501 · Invalid Field: 'language_code'` e custo ZERO.
   *
   * Tratar 200 como sucesso teria produzido "SERP vazia" sobre uma recusa — e
   * é exatamente o defeito que o YouTube 2.1 já tinha pago para aprender.
   */
  assert.equal(payload.status_code, 20000);
  assert.equal(tarefa.status_code, 20000);
  assert.equal(tarefa.status_message, "Ok.");
});

test("§2 · o pedido que o provider ACEITOU, verbatim", () => {
  /*
   * `pt_BR` com UNDERSCORE. Não `pt-BR`, que é o da SERP do YouTube, nem
   * `pt-br`, que é como a configuração canônica do Radar guarda. Três
   * convenções para o mesmo idioma, uma por adapter.
   */
  assert.equal(tarefa.data.language_code, "pt_BR");
  assert.equal(tarefa.data.location_code, 2076);
  assert.equal(resultado.se_domain, "amazon.com.br");
  assert.equal(resultado.language_code, "pt_BR");
});

/* ==================== §6 · o inventário real ==================== */

test("§6 · três tipos de item, e só três", () => {
  assert.deepEqual(resultado.item_types, ["amazon_serp", "amazon_paid", "related_searches"]);
  assert.equal(resultado.items_count, 56);
  assert.equal(itens.length, 56);
  assert.equal(organicos.length, 53);
  assert.equal(pagos.length, 2);
  assert.equal(itens.filter(item => item.type === "related_searches").length, 1);
});

test("§6 · os campos AUSENTES, declarados — nenhuma equivalência fabricada", () => {
  /*
   * Esta é a metade do §6 que mais importa. O contrato canônico da Amazon foi
   * escrito antes desta chamada e presumiu marca, atributos e percepção de
   * comprador. A SERP de produtos não entrega nada disso.
   */
  for (const campo of ["brand", "seller", "description", "snippet", "attributes", "reviews", "review_text", "category", "variation", "is_sponsored", "prime", "discount", "original_price"]) {
    assert.equal(organicos.some(item => campo in item), false, `campo presumido existe no payload: ${campo}`);
  }

  /* E o que existe sempre vem nulo também é ausência. */
  assert.ok(organicos.every(item => item.labels === null), "labels chega sempre null");
  assert.ok(organicos.every(item => item.price_to === null), "price_to chega sempre null");
  assert.equal(resultado.categories, null, "a SERP não devolveu categorias");
});

/* ============ §9 · identidade ============ */

test("§9 · a identidade confiável é o ASIN — presente em 100% dos itens", () => {
  for (const item of [...organicos, ...pagos]) {
    assert.equal(typeof item.data_asin, "string");
    assert.ok((item.data_asin as string).length >= 10, `ASIN curto demais: ${item.data_asin}`);
  }
  /*
   * A URL NÃO SERVE COMO CHAVE: ela carrega `crid`, `qid` e um blob `dib` que
   * mudam a cada coleta. Deduplicar por URL faria o mesmo produto contar duas
   * vezes entre duas consultas.
   */
  const url = String(organicos[0].url);
  assert.match(url, /crid=|qid=/, "a URL carrega parâmetros de sessão");
  assert.ok(url.includes(String(organicos[0].data_asin)), "o ASIN aparece dentro da URL — dela se extrai, nela não se confia");
});

/* ============ §10 · patrocinado × orgânico ============ */

test("§10 · o sinal de patrocínio é o TIPO do item, não um booleano", () => {
  assert.equal(organicos.some(item => "is_sponsored" in item), false);
  assert.ok(pagos.length > 0, "a amostra real tem itens pagos");

  /* Os dois tipos carregam exatamente os mesmos campos. */
  const camposOrganico = new Set(Object.keys(organicos[0]));
  const camposPago = new Set(Object.keys(pagos[0]));
  assert.deepEqual([...camposPago].sort(), [...camposOrganico].sort());

  /*
   * Misturar os dois inflaria a leitura de recorrência com anúncio comprado —
   * e "esta marca domina a categoria" passaria a descrever quem pagou mais.
   */
  assert.ok(pagos.every(item => item.type === "amazon_paid"));
});

/* ============ §11 · ranking ============ */

test("§11 · rank_group e rank_absolute existem; block_rank e position não", () => {
  for (const item of organicos) {
    assert.equal(typeof item.rank_group, "number");
    assert.equal(typeof item.rank_absolute, "number");
  }
  assert.equal(organicos.some(item => "block_rank" in item), false);
  assert.equal(organicos.some(item => "position" in item), false, "position existe só em related_searches");

  const relacionadas = itens.find(item => item.type === "related_searches")!;
  assert.equal(typeof relacionadas.position, "string");
});

/* ============ §7 · preço ============ */

test("§7 · há preço ATUAL e nada mais — sem preço anterior nem desconto estruturado", () => {
  const comPreco = organicos.filter(item => typeof item.price_from === "number");
  assert.equal(comPreco.length, 52, "52 de 53 têm preço");
  assert.ok(organicos.every(item => item.currency === "BRL" || item.currency === null));

  /*
   * `price_to` SEMPRE NULO nesta busca. Ele existe no contrato do provider para
   * faixas ("de X a Y"), e nesta categoria nenhum item usou. Presumir faixa a
   * partir dele produziria intervalo inventado.
   */
  assert.ok(organicos.every(item => item.price_to === null));

  /*
   * O DESCONTO VEM COMO TEXTO SOLTO: `["R$ 10,00", "off"]`. Não é número, não
   * é percentual e não é par estruturado. Lê-lo como desconto exigiria parsear
   * moeda em string — e o valor anterior do produto continua não existindo.
   */
  const ofertas = organicos.map(item => item.special_offers).filter(Boolean) as string[][];
  assert.ok(ofertas.length > 0);
  for (const oferta of ofertas) {
    assert.ok(Array.isArray(oferta));
    assert.ok(oferta.every(parte => typeof parte === "string"), "special_offers é array de STRING");
  }
  assert.equal(organicos.some(item => "original_price" in item || "discount" in item), false);
});

/* ============ §8 e §18 · a decisão sobre reviews ============ */

test("§8 e §18 · a SERP entrega agregado de avaliação, e NENHUM texto", () => {
  const avaliacoes = organicos.map(item => item.rating as Record<string, unknown>);
  assert.equal(avaliacoes.length, 53);

  /* O agregado é completo: nota, total de votos e escala. */
  for (const avaliacao of avaliacoes) {
    assert.equal(typeof avaliacao.value, "number");
    assert.equal(typeof avaliacao.votes_count, "number");
    assert.equal(avaliacao.rating_max, 5);
  }
  assert.deepEqual(
    [...new Set(avaliacoes.flatMap(item => Object.keys(item)))].sort(),
    ["position", "rating_max", "rating_type", "type", "value", "votes_count"],
  );

  /*
   * ============ A DECISÃO QUE ESTE TESTE EXISTE PARA TRAVAR ============
   *
   * Não há texto de avaliação. Não há elogio recorrente, reclamação recorrente
   * nem expectativa frustrada — nada disso é derivável de uma nota e uma
   * contagem de votos.
   *
   * Um card chamado "Reviews e objeções" sustentado só por estrelas prometeria
   * matéria-prima que esta fonte não tem. O texto exige `merchant.reviews`, que
   * é OUTRO endpoint, sem variante live, com custo próprio.
   */
  assert.equal(
    [...new Set(avaliacoes.flatMap(item => Object.keys(item)))].some(chave => /text|content|body|comment|review_title/.test(chave)),
    false,
    "nenhuma chave de texto no agregado de avaliação",
  );
  assert.equal(JSON.stringify(payload).includes("review_text"), false);
});

/* ============ §12 e §13 · refinamentos, categorias, imagens ============ */

test("§12 · related_searches existe; categorias, filtros e breadcrumbs não", () => {
  const relacionadas = itens.find(item => item.type === "related_searches") as Record<string, unknown>;
  const termos = relacionadas.items as Array<Record<string, unknown>>;
  assert.ok(termos.length > 0);
  for (const termo of termos) {
    assert.equal(termo.type, "related_searches_element");
    assert.equal(typeof termo.title, "string");
  }

  /* O que NÃO veio, declarado: */
  assert.equal(resultado.categories, null);
  for (const campo of ["refinements", "filters", "departments", "breadcrumb", "brands_filter", "price_filter", "rating_filter"]) {
    assert.equal(campo in resultado, false, `campo presumido existe: ${campo}`);
  }
});

test("§13 · uma imagem por item, sem galeria e sem vídeo", () => {
  for (const item of organicos) {
    assert.equal(typeof item.image_url, "string");
    assert.match(String(item.image_url), /^https:\/\/m\.media-amazon\.com\//);
  }
  assert.equal(organicos.some(item => "images" in item || "gallery" in item || "video_url" in item), false);
});

test("§13 · os selos que existem são três booleanos e uma contagem", () => {
  /*
   * `labels` chega sempre null; os selos reais são campos próprios. Ler
   * `labels` como badge devolveria uma lista vazia para sempre.
   */
  assert.equal(organicos.filter(item => item.is_amazon_choice === true).length, 1);
  assert.equal(organicos.filter(item => item.is_best_seller === true).length, 2);
  assert.equal(organicos.filter(item => item.bought_past_month !== null).length, 52);

  /*
   * `delivery_info` traz MENSAGEM em português e `delivery_price` sempre nulo.
   * É frase para humano, não dado estruturado: "Entrega GRÁTIS: sex., 23 de
   * out." não vira prazo nem frete sem parsear língua natural.
   */
  const entregas = organicos.map(item => item.delivery_info).filter(Boolean) as Array<Record<string, unknown>>;
  assert.ok(entregas.every(item => typeof item.delivery_message === "string"));
  assert.ok(entregas.every(item => item.delivery_price === null), "delivery_price nunca veio preenchido");
});

/* ============ §4 · a fixture ============ */

test("§4 · a fixture é sanitizada e preserva a estrutura", () => {
  assert.equal(tarefa.id, "TASK_ID_REMOVIDO");
  assert.equal(tarefa.data.tag, "TAG_REMOVIDA");
  assert.equal("cost" in tarefa, false, "o custo da conta não entra na fixture");

  const texto = JSON.stringify(payload);
  assert.equal(/login|password|Basic |authorization/i.test(texto), false, "nenhuma credencial na fixture");

  /* E nada foi renomeado: os campos do provider seguem com o nome dele. */
  assert.ok(["keyword", "se_domain", "item_types", "items_count", "items"].every(chave => chave in resultado));
});

test("PROVIDER_CALLS = 0 nesta suíte", () => {
  assert.deepEqual(tentativasDeRede, []);
});
