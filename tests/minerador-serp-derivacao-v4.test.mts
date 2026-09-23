import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { pruneSerpBody } from "../lib/editorial/serp-cache.ts";
import {
  SERP_DERIVATION_VERSION,
  classifyOrganicItem,
  deriveSerpSemanticEvidence,
  serpClassificationContext,
  serpResultUrlKey,
  type SerpSemanticEvidence,
} from "../lib/minerador/serp-semantic-evidence.ts";
import {
  SEMANTIC_DERIVATION_VERSION,
  buildKeywordSemanticQualification,
  parseKeywordSemanticQualification,
  repeatsCurrentSemanticQualification,
  type KeywordSemanticQualification,
} from "../lib/minerador/keyword-semantic-qualification.ts";
import { applySerpEvidenceRecord } from "../lib/minerador/serp-evidence-record.ts";
import { APPROVAL_SIGNATURE_SCHEME, applyApproval, approvedPackageDiverged, approvedPackageSignature } from "../lib/minerador/approved-package.ts";
import { buildLogicalOutputContract } from "../lib/minerador/logical-processor.ts";

/**
 * DERIVAÇÃO v4 EM UMA LENTE — adendo `docs/03-minerador/propostas/adendo-
 * derivacao-v4-quatro-lentes-2026-09-23.md`, seção 2.
 *
 * Cada regra tem um caso que ela lê e um que ela recusa. As duas SERPs reais
 * (`tests/fixtures/`) fixam o estado esperado. Não há fixture mobile nem
 * macOS: os itens montados aqui são SINTÉTICOS e dizem isso no nome.
 *
 * REAL_PROVIDER_CALLS_IN_TESTS = 0.
 */

type Item = Record<string, unknown>;

const FACIAL = JSON.parse(readFileSync(new URL("./fixtures/dataforseo-google-skincare-facial-advanced-desktop-windows.json", import.meta.url), "utf8"));
const NOTURNO_CRU = JSON.parse(readFileSync(new URL("./fixtures/dataforseo-google-skin-care-noturno.json", import.meta.url), "utf8"));
// O fixture do noturno guarda só a tarefa: o envelope é o mesmo que o provider devolve.
const NOTURNO = { tasks: [{ id: NOTURNO_CRU.id, result: NOTURNO_CRU.result }] };

function derivar(body: unknown, keyword: string): SerpSemanticEvidence {
  const evidence = deriveSerpSemanticEvidence({
    body,
    keyword,
    locationCode: 2076,
    languageCode: "pt",
    device: "desktop",
    providerRequestId: "task-1",
    operationRequestId: "33333333-3333-4333-8333-333333333333",
    collectedAt: "2026-09-23T09:00:00.000Z",
  });
  assert.ok(evidence, "a SERP precisa produzir evidência");
  return evidence;
}

/** SERP SINTÉTICA: orgânicos na ordem dada, depois os blocos. */
function sintetica(organic: Item[], blocks: Item[] = []): SerpSemanticEvidence {
  return derivar({
    tasks: [{
      id: "task-1",
      result: [{
        keyword: "kw teste",
        items: [
          ...organic.map((item, index) => ({ type: "organic", rank_group: index + 1, domain: `site${index}.com.br`, ...item })),
          ...blocks,
        ],
      }],
    }],
  }, "kw teste");
}

const semContexto = serpClassificationContext([]);
const ler = (item: Item, blocks: Item[] = []) => classifyOrganicItem(item, blocks.length ? serpClassificationContext(blocks) : semContexto);
const mudo = { title: "Página", description: "linha de produtos da marca" };

/* ----------------------------- R1 palavra inteira ----------------------------- */

test("R1 · o termo casa como palavra inteira", () => {
  assert.equal(ler({ title: "O melhor sérum" }).intent, "Comercial");
  assert.equal(ler({ title: "Kit noturno" }).intent, "Transacional", "o antigo \"kit \" continua valendo como palavra");
});

test("R1 · o termo NÃO casa dentro de outra palavra", () => {
  // Na v3, "melhor" casava dentro de "melhorar" e o item virava Comercial.
  const leitura = ler({ title: "Como melhorar a pele" });
  assert.equal(leitura.intent, "Informativa");
  assert.deepEqual(leitura.score.intent, { Informativa: 2 });
  assert.equal(ler({ title: "Kits de tratamento" }).intent, null, "\"kits\" não é \"kit\": ampliar vocabulário é decisão do usuário");
});

test("R1 · plural simples continua casando, como na v3 por substring", () => {
  assert.equal(ler({ title: "Preços do sérum facial" }).intent, "Transacional");
  assert.equal(ler({ title: "Reviews do sérum facial" }).intent, "Comercial");
  assert.equal(ler({ title: "Ofertas de sérum" }).intent, "Transacional");
  assert.equal(ler({ title: "Guias de skincare" }).intent, "Informativa");
  // O plural não abre a palavra: "melhoras" não é "melhor".
  assert.equal(ler({ title: "Melhoras na pele" }).intent, null);
});

/* ------------------------------ R2 placar por campo ------------------------------ */

test("R2 · o título pesa 2 e vence o marcador da descrição", () => {
  const leitura = ler({ title: "Como escolher o sérum", description: "comprar com frete" });
  // Na v3 vencia o primeiro marcador da lista: Transacional.
  assert.equal(leitura.intent, "Informativa");
  assert.deepEqual(leitura.score.intent, { Transacional: 1, Informativa: 2 });
  assert.deepEqual(leitura.score.funnel, { BOFU: 1, TOFU: 2 });
});

test("R2 · empate de placar segue a ordem Local > Transacional > Comercial > Informativa", () => {
  const leitura = ler({ title: "Como comprar sérum" });
  assert.deepEqual(leitura.score.intent, { Transacional: 2, Informativa: 2 });
  assert.equal(leitura.intent, "Transacional");
  assert.equal(leitura.funnel, "BOFU");
});

test("R2 · cada campo vota uma vez por rótulo: repetir termo não compra peso", () => {
  const leitura = ler({ title: "Sérum", description: "comprar, preço, frete, cupom e desconto" });
  assert.deepEqual(leitura.score.intent, { Transacional: 1 });
});

test("R2 · pre_snippet, extended_snippet e snippet pesam 1 cada", () => {
  assert.deepEqual(ler({ title: "Sérum", pre_snippet: "comprar hoje" }).score.intent, { Transacional: 1 });
  assert.deepEqual(ler({ title: "Sérum", extended_snippet: "o melhor da categoria" }).score.intent, { Comercial: 1 });
  assert.deepEqual(ler({ title: "Sérum", snippet: "como usar à noite" }).score.intent, { Informativa: 1 }, "sem descrição, o snippet é lido");
  assert.deepEqual(ler({ title: "Sérum", description: "linha noturna", snippet: "como usar à noite" }).score.intent, {}, "com descrição, o snippet fica de fora, como na v3");
});

test("R2 · o placar decisivo fica gravado no item da amostra", () => {
  const evidence = sintetica([{ title: "Como escolher o sérum", description: "comprar com frete", url: "https://a.com.br/x" }]);
  assert.deepEqual(evidence.sample[0].score, { intent: { Transacional: 1, Informativa: 2 }, funnel: { BOFU: 1, TOFU: 2 } });
  assert.deepEqual(sintetica([{ ...mudo, url: "https://a.com.br/y" }]).sample[0].score, { intent: {}, funnel: {} }, "texto mudo: placar vazio, explícito");
});

/* ------------------------ invariante 13: URL sozinha não decide ------------------------ */

test("invariante 13 · marcador só na URL não promove intenção", () => {
  const leitura = ler({ ...mudo, url: "https://site.com.br/como-comprar-melhor-preco-com-cupom" });
  assert.equal(leitura.intent, null);
  assert.equal(leitura.funnel, null);
  assert.deepEqual(leitura.score, { intent: {}, funnel: {} });
});

test("invariante 13 · o nome do site também não pontua", () => {
  assert.equal(ler({ ...mudo, website_name: "Loja do Preço Promoção" }).intent, null);
});

test("invariante 13 · uma SERP inteira de slugs eloquentes e texto mudo não conclui nada", () => {
  const evidence = sintetica(Array.from({ length: 6 }, (_, index) => ({ ...mudo, url: `https://fabricante${index}.com.br/equipamentos/como-comprar-o-melhor-${index}` })));
  assert.equal(evidence.intent.classified, 0);
  assert.equal(evidence.intent.strength, "insufficient");
});

/*
 * O breadcrumb do desktop, no formato REAL do provider, repete a URL:
 * "https://lista.mercadolivre.com.br › kit-skincare" (fixture facial). Os itens
 * abaixo são SINTÉTICOS nesse formato.
 */

test("invariante 13 · o slug que o breadcrumb repete não pontua", () => {
  const leitura = ler({ ...mudo, url: "https://site.com.br/comprar-serum-com-desconto", breadcrumb: "https://site.com.br › comprar-serum-com-desconto" });
  assert.equal(leitura.intent, null);
  assert.equal(leitura.funnel, null);
  assert.deepEqual(leitura.score, { intent: {}, funnel: {} });
  // Segmento igual a um segmento do caminho, e o truncado que é prefixo dele, também saem.
  const truncado = ler({ ...mudo, url: "https://site.com.br/como/ordem-do-cuidado", breadcrumb: "https://site.com.br › como › ordem..." });
  assert.deepEqual(truncado.score, { intent: {}, funnel: {} }, "\"como\" ali é o caminho da URL, não texto");
  const prefixo = ler({ ...mudo, url: "https://site.com.br/beleza/como-cuidar-da-pele", breadcrumb: "https://site.com.br › beleza › como..." });
  assert.deepEqual(prefixo.score, { intent: {}, funnel: {} }, "\"como...\" é o slug \"como-cuidar-da-pele\" truncado");
  const reticencia = ler({ ...mudo, url: "https://site.com.br/beleza/como-cuidar-da-pele", breadcrumb: "https://site.com.br › beleza › como…" });
  assert.deepEqual(reticencia.score, { intent: {}, funnel: {} }, "a reticência de um caractere também é truncamento");
  assert.deepEqual(ler({ ...mudo, url: "https://site.com.br/x", breadcrumb: "https://site.com.br › melhores-produtos-de-skin..." }).score, { intent: {}, funnel: {} });
});

test("invariante 13 · o host que o breadcrumb repete não vence a raiz do domínio", () => {
  const raiz = ler({ ...mudo, url: "https://www.comprar-skincare.com.br/", breadcrumb: "https://www.comprar-skincare.com.br" });
  assert.equal(raiz.intent, "Navegacional");
  assert.deepEqual(raiz.score, { intent: {}, funnel: {} });
  assert.equal(ler({ ...mudo, url: "https://www.comprar.com.br/", breadcrumb: "https://www.comprar.com.br" }).intent, "Navegacional", "host sem hífen também é endereço");
  assert.equal(ler({ ...mudo, url: "https://melhor-preco.com.br/x", breadcrumb: "www.melhor-preco.com.br › x" }).intent, null);
});

test("invariante 13 · SERP de slugs eloquentes com o breadcrumb real também não conclui", () => {
  const evidence = sintetica(Array.from({ length: 6 }, (_, index) => ({
    ...mudo,
    url: `https://fabricante${index}.com.br/comprar-o-melhor-${index}`,
    breadcrumb: `https://fabricante${index}.com.br › comprar-o-melhor-${index}`,
  })));
  assert.equal(evidence.intent.classified, 0);
  assert.equal(evidence.intent.strength, "insufficient");
  assert.equal(evidence.funnel.strength, "insufficient");
});

test("R2 · o rótulo humano do breadcrumb pontua com peso 1", () => {
  const leitura = ler({ ...mudo, url: "https://www.panvel.com/b/x", breadcrumb: "https://www.panvel.com › Home › Rotina de Beleza" });
  assert.deepEqual(leitura.score, { intent: { Informativa: 1 }, funnel: { TOFU: 1 } });
  assert.equal(leitura.intent, "Informativa");
});

test("invariante 13 · a URL continua valendo pelos sinais estruturais, registrados", () => {
  const leitura = ler({ ...mudo, url: "https://site.com.br/blog/texto" });
  assert.equal(leitura.intent, "Informativa");
  assert.ok(leitura.signals.includes("página editorial"));
  assert.deepEqual(leitura.score, { intent: {}, funnel: {} }, "quem decidiu foi o sinal, não o placar");
});

/* ----------------------------- R4 conteúdo em rede social ----------------------------- */

test("R4 · post em rede social cai na leitura de texto", () => {
  // SINTÉTICO, no formato do item real do noturno (instagram.com/reel/…).
  const reel = ler({ title: "Como montar a rotina noturna", description: "passo a passo", url: "https://www.instagram.com/reel/DJpvU-5MLid/" });
  assert.equal(reel.intent, "Informativa");
  assert.ok(reel.signals.includes("conteúdo em rede social"));
  assert.ok(!reel.signals.includes("perfil em rede social"));

  // O `/p/` de post casava com a URL de produto.
  const post = ler({ ...mudo, url: "https://www.instagram.com/p/ABC123/" });
  assert.equal(post.intent, null, "sem texto, post não é produto nem perfil");
  assert.ok(!post.signals.includes("página de produto"));
  for (const url of ["https://x.com/marca/status/1", "https://www.linkedin.com/pulse/artigo", "https://www.facebook.com/watch?v=1", "https://www.tiktok.com/@marca/video/1"]) {
    assert.ok(ler({ ...mudo, url }).signals.includes("conteúdo em rede social"), url);
  }
});

test("R4 · perfil continua perfil, e `/p/` fora de rede social continua produto", () => {
  const perfil = ler({ ...mudo, url: "https://www.instagram.com/marca/" });
  assert.equal(perfil.intent, "Navegacional");
  assert.equal(perfil.funnel, null);
  assert.ok(perfil.signals.includes("perfil em rede social"));
  const produto = ler({ ...mudo, url: "https://loja.com.br/p/serum-noturno" });
  assert.equal(produto.intent, "Transacional");
  assert.ok(produto.signals.includes("página de produto"));
});

/* --------------------------- R5 varejista no bloco de produtos --------------------------- */

const produtos = (...sellers: string[]): Item => ({ type: "popular_products", items: sellers.map(seller => ({ type: "popular_products_element", title: "Sérum", seller })) });

test("R5 · resultado mudo cujo nome do site É um vendedor do bloco vira Transacional/BOFU", () => {
  const leitura = ler({ ...mudo, domain: "www.paguemenos.com.br", website_name: "Pague Menos", url: "https://www.paguemenos.com.br/dermo-e-beleza/rosto" }, [produtos("Pague Menos")]);
  assert.equal(leitura.intent, "Transacional");
  assert.equal(leitura.funnel, "BOFU");
  assert.ok(leitura.signals.includes("varejista no bloco de produtos: Pague Menos"), "o sinal grava o vendedor que casou");
});

test("R5 · o domínio registrável também casa, com o vendedor escrito como nome ou como domínio", () => {
  const item = { ...mudo, domain: "lista.mercadolivre.com.br", url: "https://lista.mercadolivre.com.br/serum" };
  assert.ok(ler(item, [produtos("Mercado Livre")]).signals.includes("varejista no bloco de produtos: Mercado Livre"));
  assert.ok(ler(item, [produtos("mercadolivre.com.br")]).signals.includes("varejista no bloco de produtos: mercadolivre.com.br"));
});

test("R5 · o website_name casa sozinho, quando o domínio é outro", () => {
  // SINTÉTICO: o nome da loja não é o nome do domínio.
  const item = { ...mudo, domain: "www.drogariasaopaulo.com.br", website_name: "Farmácias São Paulo", url: "https://www.drogariasaopaulo.com.br/rosto" };
  const leitura = ler(item, [produtos("Farmácias São Paulo")]);
  assert.equal(leitura.intent, "Transacional");
  assert.ok(leitura.signals.includes("varejista no bloco de produtos: Farmácias São Paulo"));
  assert.equal(ler({ ...item, website_name: "Outra Loja" }, [produtos("Farmácias São Paulo")]).intent, null);
});

test("R5 · casamento parcial NÃO conta: é igualdade, nunca \"contém\"", () => {
  const belezaNaWeb = { ...mudo, domain: "www.belezanaweb.com.br", website_name: "Beleza na Web", url: "https://www.belezanaweb.com.br/busca" };
  assert.equal(ler(belezaNaWeb, [produtos("Beleza na Web - O Boticário")]).intent, null);
  const amazon = { ...mudo, domain: "www.amazon.com.br", url: "https://www.amazon.com.br/s" };
  assert.equal(ler(amazon, [produtos("Amazon.com.br - Seller")]).intent, null);
});

test("R5 · data, página editorial ou marcador de texto tiram o resultado da regra", () => {
  const base = { ...mudo, domain: "www.paguemenos.com.br", website_name: "Pague Menos", url: "https://www.paguemenos.com.br/rosto" };
  const bloco = [produtos("Pague Menos")];
  assert.equal(ler({ ...base, timestamp: "2024-06-07 00:00:00 +00:00" }, bloco).intent, null, "resultado datado é conteúdo, não vitrine");
  assert.equal(ler({ ...base, date: "2024-06-07" }, bloco).intent, null);
  const editorial = ler({ ...base, url: "https://www.paguemenos.com.br/blog/rotina" }, bloco);
  assert.equal(editorial.intent, "Informativa");
  assert.ok(!editorial.signals.some(signal => signal.startsWith("varejista")));
  const comTexto = ler({ ...base, description: "sua rotina de cuidados" }, bloco);
  assert.equal(comTexto.intent, "Informativa", "o texto decide antes");
  assert.ok(!comTexto.signals.some(signal => signal.startsWith("varejista")));
});

test("R5 · só vale o bloco de produtos da MESMA SERP", () => {
  const item = { ...mudo, domain: "www.paguemenos.com.br", website_name: "Pague Menos", url: "https://www.paguemenos.com.br/rosto" };
  assert.equal(ler(item).intent, null, "sem bloco de produtos, nada casa");
  assert.equal(ler(item, [{ type: "shopping", items: [{ seller: "Pague Menos" }] }]).intent, null, "outro bloco não serve");
  const naSerp = sintetica([item], [produtos("Pague Menos")]);
  const semBloco = sintetica([item]);
  assert.equal(naSerp.sample[0].intent, "Transacional");
  assert.equal(semBloco.sample[0].intent, "indefinido");
});

test("R5 · chave curta demais não casa com nada", () => {
  const item = { ...mudo, domain: "www.ab.com.br", website_name: "AB", url: "https://www.ab.com.br/x" };
  assert.equal(ler(item, [produtos("AB")]).intent, null);
});

/* ------------------------------- R6 títulos de lista ------------------------------- */

test("R6 · título que começa com número e substantivo de lista é Informativa/TOFU", () => {
  // O item real do noturno: nenhum marcador no texto.
  const leitura = ler({ title: "3 passos indispensáveis para acordar com a pele mais bonita", description: "Resumo do skincare noturno" });
  assert.equal(leitura.intent, "Informativa");
  assert.equal(leitura.funnel, "TOFU");
  assert.ok(leitura.signals.includes("título de lista"));
  // "dicas" já era Informativa, mas não era TOFU: a R6 completa o funil.
  const dicas = ler({ title: "10 dicas de skincare" });
  assert.equal(dicas.intent, "Informativa");
  assert.equal(dicas.funnel, "TOFU");
});

test("R6 · a lista só preenche: o texto que já leu continua decidindo", () => {
  const leitura = ler({ title: "5 erros ao comprar sérum" });
  assert.ok(leitura.signals.includes("título de lista"), "o sinal fica registrado");
  assert.equal(leitura.intent, "Transacional");
  assert.equal(leitura.funnel, "BOFU");
});

test("R6 · sem número no começo, ou sem substantivo de lista, não é lista", () => {
  for (const title of ["Passos para a pele", "Os 5 erros do skincare", "3 produtos para a pele", "2026 passos"]) {
    const leitura = ler({ title });
    assert.ok(!leitura.signals.includes("título de lista"), title);
  }
});

/* ------------------------------- R7 pesos de bloco ------------------------------- */

/** SINTÉTICO: 5 Informativa, 3 Transacional, 2 Comercial — 50% sem empate, onde só o reforço ≥ 2 fecha. */
const serie = (quantos: number, titulo: string, host: string) => Array.from({ length: quantos }, (_, index) => ({ title: `${titulo} ${index}`, url: `https://${host}/${index}` }));
const meioAMeio = [...serie(5, "Como usar", "a.com.br"), ...serie(3, "Comprar", "b.com.br"), ...serie(2, "Melhor", "c.com.br")];

test("R7 · vídeos curtos, notícias e artigos acadêmicos reforçam Informativa/TOFU com peso 1", () => {
  const sem = sintetica(meioAMeio);
  assert.equal(sem.intent.dominance, 0.5);
  assert.equal(sem.intent.strength, "mixed", "sem bloco, 50% não fecha");
  assert.equal(sintetica(meioAMeio, [{ type: "short_videos" }]).intent.strength, "mixed", "um bloco de peso 1 não basta");
  const comBlocos = sintetica(meioAMeio, [{ type: "short_videos" }, { type: "top_stories" }]);
  assert.equal(comBlocos.intent.strength, "conclusive");
  assert.equal(comBlocos.intent.value, "Informativa");
  assert.equal(comBlocos.funnel.value, "TOFU");
  for (const type of ["short_videos", "top_stories", "scholarly_articles"]) {
    const evidence = sintetica(meioAMeio, [{ type }]);
    assert.ok(evidence.intent.structuralSignals.some(signal => signal.signal === type && signal.weight === 1), type);
    assert.ok(evidence.funnel.structuralSignals.some(signal => signal.signal === type && signal.weight === 1), type);
  }
});

test("R7 · avaliações, perspectivas e fóruns são registrados com peso 0 e não fecham eixo", () => {
  const tipos = ["google_reviews", "third_party_reviews", "perspectives", "discussions_and_forums"];
  const evidence = sintetica(meioAMeio, tipos.map(type => ({ type })));
  for (const type of tipos) {
    assert.ok(evidence.intent.structuralSignals.some(signal => signal.signal === type && signal.weight === 0), type);
    assert.ok(!evidence.funnel.structuralSignals.some(signal => signal.signal === type), type);
  }
  assert.equal(evidence.intent.strength, "mixed", "peso 0 não é reforço");
});

/* ------------------------------- R8 URL distinta ------------------------------- */

test("R8 · a mesma página com outra query, com www ou com barra final conta uma vez", () => {
  const evidence = sintetica([
    { title: "Como usar sérum", url: "https://www.site.com.br/serum/?srsltid=AAA" },
    { title: "Como usar sérum", url: "https://site.com.br/serum?utm_source=x" },
    { title: "Como usar sérum", url: "https://site.com.br/serum" },
    { title: "O que é retinol", url: "https://outro.com.br/retinol" },
  ]);
  assert.equal(evidence.observedResults, 2);
  assert.equal(evidence.intent.observed, 2);
  assert.equal(evidence.sample.length, 2);
  assert.equal(evidence.sample[0].urlKey, "site.com.br/serum");
  assert.equal(evidence.sample[0].duplicates, 2);
  assert.equal(evidence.sample[0].position, 1, "fica a ocorrência mais bem posicionada");
  assert.equal(evidence.sample[1].duplicates, undefined, "sem variante, sem campo");
  // A variante some também da leitura, não só do denominador.
  assert.equal(evidence.intent.classified, 2);
  assert.deepEqual(evidence.intent.distribution, [{ label: "Informativa", count: 2 }]);
  assert.equal(evidence.intent.coverage, 1);
  assert.equal(evidence.funnel.classified, 2);
});

test("R8 · fora do `/watch` do YouTube e do Facebook, `?v=` é query comum", () => {
  assert.equal(serpResultUrlKey("https://site.com.br/pagina?v=2"), "site.com.br/pagina");
  assert.equal(serpResultUrlKey("https://site.com.br/watch?v=2"), "site.com.br/watch", "outro host: o `v` não é a página");
  assert.equal(serpResultUrlKey("https://www.youtube.com/results?v=2"), "youtube.com/results", "outro caminho: também não");
  assert.equal(serpResultUrlKey("https://www.facebook.com/watch/?v=9"), "facebook.com/watch?v=9");
  const evidence = sintetica([
    { title: "Como usar", url: "https://site.com.br/pagina?v=2" },
    { title: "Como usar", url: "https://site.com.br/pagina?v=3" },
  ]);
  assert.equal(evidence.observedResults, 1);
});

test("R8 · vídeos diferentes são páginas diferentes: em `/watch`, o `v` é a página", () => {
  assert.equal(serpResultUrlKey("https://www.youtube.com/watch?v=n2zBYQyRYCo&t=10"), "youtube.com/watch?v=n2zBYQyRYCo");
  const evidence = sintetica([
    { title: "Como usar", url: "https://www.youtube.com/watch?v=A" },
    { title: "Como usar", url: "https://www.youtube.com/watch?v=B" },
    { title: "Como usar", url: "https://www.youtube.com/watch?v=A&pp=x" },
  ]);
  assert.equal(evidence.observedResults, 2);
  assert.equal(evidence.sample[0].duplicates, 1);
});

test("R8 · caminhos diferentes e resultados sem URL legível nunca se fundem", () => {
  const evidence = sintetica([{ title: "Como a" }, { title: "Como b" }, { title: "Como c", url: "https://s.com.br/a" }, { title: "Como d", url: "https://s.com.br/b" }]);
  assert.equal(evidence.observedResults, 4);
  assert.equal(evidence.sample[0].urlKey, undefined);
});

/* ------------------------------- SERPs reais ------------------------------- */

test("SERP real · skincare facial continua conclusiva nos dois eixos, agora lida inteira", () => {
  const evidence = derivar(FACIAL, "skincare facial");
  // 18 orgânicos distintos: os dois vídeos do YouTube são vídeos diferentes.
  assert.equal(evidence.observedResults, 18);
  assert.equal(evidence.sample.length, 18, "a amostra é o denominador inteiro, não os 12 primeiros");
  assert.equal(evidence.intent.strength, "conclusive");
  assert.equal(evidence.intent.value, "Informativa");
  assert.equal(evidence.intent.classified, 17, "a Pague Menos passou a ser lida (R5)");
  assert.equal(evidence.intent.supporting, 10);
  assert.equal(evidence.funnel.strength, "conclusive");
  assert.equal(evidence.funnel.value, "TOFU");
  assert.equal(evidence.funnel.supporting, 10);
  // 10/17 = 0,588: fecha pelo reforço das perguntas relacionadas, como na v3.
  assert.ok(evidence.intent.dominance < 0.6 && evidence.intent.dominance >= 0.5);
  assert.ok(evidence.intent.structuralSignals.some(signal => signal.signal === "people_also_ask" && signal.weight === 2));
  const pagueMenos = evidence.sample.find(item => item.domain === "www.paguemenos.com.br")!;
  assert.deepEqual(pagueMenos.signals, ["varejista no bloco de produtos: Pague Menos"]);
  const videos = evidence.sample.filter(item => item.domain === "www.youtube.com");
  assert.equal(videos.length, 2);
  assert.notEqual(videos[0].urlKey, videos[1].urlKey);
});

test("SERP real · skin care noturno: intenção sai de mista para conclusiva", () => {
  const evidence = derivar(NOTURNO, "skin care noturno");
  assert.equal(evidence.observedResults, 6);
  assert.equal(evidence.intent.strength, "conclusive");
  assert.equal(evidence.intent.value, "Informativa");
  assert.equal(evidence.intent.dominance, 0.8, "4 de 5 lidos: por dominância");
  assert.equal(evidence.funnel.strength, "conclusive");
  assert.equal(evidence.funnel.value, "TOFU");
  const reel = evidence.sample.find(item => item.domain === "www.instagram.com")!;
  assert.equal(reel.intent, "indefinido", "o reel deixou de ser 'perfil': o texto dele não diz nada");
  assert.ok(reel.signals.includes("conteúdo em rede social"));
  const lista = evidence.sample.find(item => item.domain === "www.minhafarmalar.com.br")!;
  assert.equal(lista.intent, "Informativa");
  assert.ok(lista.signals.includes("título de lista"));
  assert.ok(evidence.intent.structuralSignals.some(signal => signal.signal === "short_videos" && signal.weight === 1));
});

/* ------------------------------- determinismo ------------------------------- */

test("determinismo · a mesma SERP dá a mesma evidência, crua ou podada pelo cache", () => {
  const cru = derivar(FACIAL, "skincare facial");
  assert.deepEqual(derivar(FACIAL, "skincare facial"), cru);
  // A R5 lê vendedor e data; a poda precisa preservá-los, senão o acerto de cache leria outra coisa.
  const podada = derivar(pruneSerpBody(FACIAL), "skincare facial");
  assert.deepEqual(podada, cru);
  assert.ok(podada.sample.some(item => item.signals.some(signal => signal.startsWith("varejista no bloco de produtos"))), "a equivalência não é vazia para a R5");
  const item = { title: "Como escolher", description: "comprar", url: "https://a.com.br/x" };
  assert.deepEqual(classifyOrganicItem(item, semContexto), classifyOrganicItem(structuredClone(item), semContexto));
});

/* ------------------------------- Qualificação ------------------------------- */

async function qualificacaoV4(): Promise<KeywordSemanticQualification> {
  return buildKeywordSemanticQualification({ brandId: "brand-a", keywordId: "kw-1", evidence: derivar(FACIAL, "skincare facial"), createdBy: "user-1" });
}

test("Qualificação · declara a derivação v4 e os limiares de sempre", async () => {
  const qualificacao = await qualificacaoV4();
  assert.equal(SERP_DERIVATION_VERSION, "serp-semantic-derivation-v4");
  assert.equal(SEMANTIC_DERIVATION_VERSION, SERP_DERIVATION_VERSION);
  assert.equal(qualificacao.derivation.derivationVersion, "serp-semantic-derivation-v4");
  assert.equal(qualificacao.derivation.thresholdsVersion, "provisional-heuristic-2026-08-28");
});

test("Qualificação · o parser preserva os campos novos da amostra, e a relida repete a vigente", async () => {
  const montada = await qualificacaoV4();
  const relida = parseKeywordSemanticQualification(JSON.parse(JSON.stringify(montada)));
  assert.ok(relida);
  assert.deepEqual(relida.evidence.sample, montada.evidence.sample);
  assert.ok(relida.evidence.sample.every(item => item.score && item.urlKey));
  // Sem isso, todo acerto de cache viraria versão nova (AGENTS §9).
  assert.equal(repeatsCurrentSemanticQualification(relida, await qualificacaoV4()), true);
});

test("Qualificação · amostra gravada até a v3 continua válida e não ganha campo", () => {
  const legado = {
    schemaVersion: "v1",
    id: "keyword_semantic_qualification:brand-a:kw-1:v1",
    brandId: "brand-a",
    keywordId: "kw-1",
    source: { provider: "dataforseo", operationRequestId: "op", providerRequestId: "task-1", collectedAt: "2026-09-19T10:00:00+00:00" },
    query: { keyword: "skincare facial", locationCode: 2076, languageCode: "pt", device: "desktop" },
    evidence: { observedResults: 1, serpFeatures: [], sample: [{ position: 1, domain: "a.com.br", intent: "Informativa", funnel: "TOFU", signals: ["página editorial"] }], evidenceHash: "sha256:x" },
    intent: { observedValue: null, strength: "insufficient", supporting: 1, observed: 1, classified: 1, coverage: 1, dominance: 1, distribution: [], structuralSignals: [] },
    funnel: { observedValue: null, strength: "insufficient", supporting: 1, observed: 1, classified: 1, coverage: 1, dominance: 1, distribution: [], structuralSignals: [] },
    derivation: { derivationVersion: "serp-semantic-derivation-v3", thresholdsVersion: "provisional-heuristic-2026-08-28", thresholdsStatus: "provisional_heuristic" },
    lifecycle: { version: 1, contentHash: "sha256:y", createdAt: "2026-09-19T10:00:00+00:00", createdBy: "user-1", supersedesVersionId: null },
  };
  const relida = parseKeywordSemanticQualification(legado);
  assert.ok(relida);
  assert.deepEqual(relida.evidence.sample, legado.evidence.sample);
  assert.equal(relida.derivation.derivationVersion, "serp-semantic-derivation-v3", "a versão gravada nunca é reescrita");
});

test("Qualificação · campo novo malformado é descartado, nunca aceito como veio", () => {
  const sujo = JSON.parse(JSON.stringify({ schemaVersion: "v1", id: "q", brandId: "b", keywordId: "k", source: { provider: "dataforseo", operationRequestId: "op", providerRequestId: null, collectedAt: "2026-09-23T09:00:00+00:00" }, query: { keyword: "kw", locationCode: 2076, languageCode: "pt", device: "desktop" }, evidence: { observedResults: 1, serpFeatures: [], sample: [{ position: 1, domain: "a", intent: "Informativa", funnel: "TOFU", signals: [], urlKey: 7, duplicates: -2, score: { intent: { Informativa: "3", Comercial: 1 }, funnel: "x" } }], evidenceHash: "h" }, intent: { strength: "weak" }, funnel: { strength: "weak" }, derivation: {}, lifecycle: {} }));
  const relida = parseKeywordSemanticQualification(sujo);
  assert.ok(relida);
  assert.deepEqual(relida.evidence.sample[0], { position: 1, domain: "a", intent: "Informativa", funnel: "TOFU", signals: [], score: { intent: { Comercial: 1 }, funnel: {} } });
});

/* -------------------------- assinatura do pacote aprovado -------------------------- */

const LOGICA = "Comercial investigativa";
const PACOTE = { keywordId: "kw-1", brandId: "brand-a", keyword: "skincare facial", intent: LOGICA, volumeSearch: 90, resultsAllintitle: 336, kgrScore: 3.7333, listaId: null };

function semanticaLogica(): Record<string, unknown> {
  const semantic: Record<string, unknown> = {
    dna_origem: "logico_deterministico",
    intencao_principal: LOGICA,
    nicho: "Estética",
    funnel: "MOFU",
    volume_measurement: { provider: "google_ads", averageMonthlySearches: 90, measuredAt: "2026-09-19T10:00:00.000Z" },
    allintitle_measurement: { provider: "dataforseo", status: "success", resultsAllintitle: 336, measuredAt: "2026-09-19T10:01:00.000Z" },
    kgr_aplicabilidade: "applicable",
  };
  semantic.logical_output_contract = buildLogicalOutputContract({ semantic, intent: LOGICA, niche: "Estética", funnel: "MOFU" });
  return semantic;
}

/** A vigente v3 como estava gravada: mesma SERP, eixos conclusivos Informativa/TOFU. */
function vigenteV3(v4: KeywordSemanticQualification): KeywordSemanticQualification {
  return {
    ...v4,
    id: "keyword_semantic_qualification:brand-a:kw-1:v1",
    evidence: { ...v4.evidence, sample: v4.evidence.sample.slice(0, 12).map(({ position, domain, intent, funnel, signals }) => ({ position, domain, intent, funnel, signals })) },
    intent: { ...v4.intent, dominance: 9 / 16 },
    funnel: { ...v4.funnel, dominance: 9 / 16 },
    derivation: { ...v4.derivation, derivationVersion: "serp-semantic-derivation-v3" },
    lifecycle: { ...v4.lifecycle, version: 1, contentHash: "sha256:v3" },
  };
}

test("assinatura · a v4 que conclui o mesmo valor não muda a assinatura nem rebaixa a aprovada", async () => {
  const v4 = await qualificacaoV4();
  const aprovadaComV3 = await applyApproval({ ...PACOTE, semantic: applySerpEvidenceRecord(semanticaLogica(), vigenteV3(v4)), approvedAt: "2026-09-20T12:00:00.000Z", approvedBy: "human-1" });
  const comV4 = applySerpEvidenceRecord(aprovadaComV3, { ...v4, id: "keyword_semantic_qualification:brand-a:kw-1:v2", lifecycle: { ...v4.lifecycle, version: 2 } });
  assert.equal(APPROVAL_SIGNATURE_SCHEME, "fnv1a-v3", "o esquema da assinatura não mudou");
  assert.equal(approvedPackageSignature({ ...PACOTE, semantic: comV4 }), approvedPackageSignature({ ...PACOTE, semantic: aprovadaComV3 }));
  assert.equal(approvedPackageDiverged({ ...PACOTE, semantic: comV4 }), false);
});

test("assinatura · a v4 que muda o valor canônico rebaixa, como antes — nunca em silêncio", async () => {
  // skin care noturno: a v3 era mista (o canônico vinha da Lógica); a v4 conclui Informativa.
  const noturno = await buildKeywordSemanticQualification({ brandId: "brand-a", keywordId: "kw-1", evidence: derivar(NOTURNO, "skin care noturno"), createdBy: "user-1" });
  const mistaV3: KeywordSemanticQualification = { ...noturno, intent: { ...noturno.intent, strength: "mixed", observedValue: null }, derivation: { ...noturno.derivation, derivationVersion: "serp-semantic-derivation-v3" } };
  const aprovada = await applyApproval({ ...PACOTE, keyword: "skin care noturno", semantic: applySerpEvidenceRecord(semanticaLogica(), mistaV3), approvedAt: "2026-09-20T12:00:00.000Z", approvedBy: "human-1" });
  const comV4 = applySerpEvidenceRecord(aprovada, noturno);
  assert.equal(approvedPackageDiverged({ ...PACOTE, keyword: "skin care noturno", semantic: comV4 }), true);
});
