import assert from "node:assert/strict";
import test from "node:test";
import { decodeDeclaredPlanFile, isKeywordShapedLine, normalizeDeclaredArticleSlug, parseDeclaredPlanText } from "../lib/minerador/declared-plan.ts";
import { looksLikeSiloPlanText } from "../lib/minerador/plan-text-detector.ts";
import { PLANO_EM_BLOCOS_DO_DONO, PLANO_EM_BLOCOS_ESPERADO } from "./minerador-plano-blocos-fixture.mts";
import { COLUNAS_IGNORADAS_DO_CSV, PLANEJAMENTO_CSV_BYTES, PLANEJAMENTO_CSV_DO_DONO, SILO_PLANOS_ESPERADO, SILO_WIFI_ESPERADO, TRECHOS_DAS_COLUNAS_IGNORADAS } from "./minerador-plano-csv-fixture.mts";

/*
 * 2026-10-16 · O LEITOR TOLERANTE — UM SÓ (`parseDeclaredPlanText`).
 *
 * O dono, ao cadastrar uma lista nova no Minerador: "ele perdeu a capacidade
 * de se adaptar e autopreencher… Ele tem que poder reconhecer todo tipo de
 * organização desses dados". Cada formato novo tem o seu teste; os formatos de
 * antes continuam em `minerador-plano-declarado.test.mts` (regressão). Sem
 * rede, sem banco, sem custo.
 */

const TAB = String.fromCharCode(9);
const tsv = (linhas: string[][]) => linhas.map(celulas => celulas.join(TAB)).join("\n");
const resumo = (texto: string) => parseDeclaredPlanText(texto).articles.map(article => ({ order: article.order, role: article.role, subject: article.subject, principal: article.principal, slug: article.slug ?? null, scope: article.scope }));
const codigos = (texto: string) => parseDeclaredPlanText(texto).refusals.map(refusal => refusal.code);

test("blocos do dono (Silo/Pilar/Suporte sem rótulo, slug por artigo): Silo \"Planos e contratação\" + 8 artigos na ordem, com Assunto, keyword, slug e detalhes", () => {
  const lido = parseDeclaredPlanText(PLANO_EM_BLOCOS_DO_DONO);
  assert.equal(lido.format, "blocos");
  assert.deepEqual(lido.unparsed, [], "nada fica de fora");
  assert.deepEqual(lido.refusals, []);
  assert.equal(lido.silo.name, "Planos e contratação");
  assert.equal(lido.silo.slug, "planos-de-internet");
  assert.equal(lido.silo.rawSlug, "/planos-de-internet/");
  assert.deepEqual(resumo(PLANO_EM_BLOCOS_DO_DONO), PLANO_EM_BLOCOS_ESPERADO.map(item => ({ ...item })));
  assert.equal(lido.articles.filter(article => article.role === "Pilar").length, 1);
  assert.ok(lido.articles.every(article => article.slugPath === `planos-de-internet/${article.slug}`), "o caminho inteiro fica dentro do slug do Silo");
  assert.ok(!lido.notices.some(notice => /não fica dentro do slug do Silo/.test(notice)));
  // O mesmo texto com CRLF e com espaço inquebrável (colado do Docs/planilha) dá o mesmo resultado.
  assert.deepEqual(resumo(PLANO_EM_BLOCOS_DO_DONO.replace(/\n/g, "\r\n")), PLANO_EM_BLOCOS_ESPERADO.map(item => ({ ...item })));
  assert.deepEqual(resumo(PLANO_EM_BLOCOS_DO_DONO.replace(/Pilar\n/, `Pilar${String.fromCharCode(160)}\n`)), PLANO_EM_BLOCOS_ESPERADO.map(item => ({ ...item })));
});

test("blocos com rótulo (qualquer caixa): \"SILO\", \"Artigo pilar\", \"ARTIGO DE SUPORTE\", \"Suporte: Título\"; o rótulo manda (Título, Assunto, Keyword, Palavra-chave, URL, Canonical, Descrição, Detalhes, Trava)", () => {
  const texto = [
    "SILO",
    "Nome: Velocidade e Wi-Fi",
    "URL: /velocidade/",
    "Objetivo: Explicar a velocidade.",
    "",
    "Artigo pilar",
    "Título: Quantos mega eu preciso?",
    "Keyword: quantos mega eu preciso",
    "URL: https://site.com.br/velocidade/quantos-mega/",
    "Descrição: Perfis de uso.",
    "",
    "ARTIGO DE SUPORTE",
    "Assunto: Wi-Fi lento em casa",
    "Palavra-chave: Wi-Fi lento",
    "Canonical: /velocidade/wi-fi-lento/",
    "Detalhes: Causas e soluções.",
    "Trava: travada",
    "",
    "suporte",
    "Teste de velocidade: como fazer",
    "teste de velocidade",
    "/velocidade/teste-de-velocidade/",
    "Como medir.",
    "",
    "Suporte: Fibra ou rádio?",
    "fibra ou rádio",
    "/velocidade/fibra-ou-radio/",
    "Comparar.",
  ].join("\n");
  const lido = parseDeclaredPlanText(texto);
  assert.deepEqual(lido.unparsed, []);
  assert.deepEqual(lido.refusals, []);
  assert.equal(lido.silo.name, "Velocidade e Wi-Fi");
  assert.equal(lido.silo.slug, "velocidade");
  assert.equal(lido.silo.objective, "Explicar a velocidade.");
  assert.deepEqual(resumo(texto), [
    { order: 1, role: "Pilar", subject: "Quantos mega eu preciso?", principal: "quantos mega eu preciso", slug: "quantos-mega", scope: "Perfis de uso." },
    { order: 2, role: "Suporte", subject: "Wi-Fi lento em casa", principal: "Wi-Fi lento", slug: "wi-fi-lento", scope: "Causas e soluções." },
    { order: 3, role: "Suporte", subject: "Teste de velocidade: como fazer", principal: "teste de velocidade", slug: "teste-de-velocidade", scope: "Como medir." },
    { order: 4, role: "Suporte", subject: "Fibra ou rádio?", principal: "fibra ou rádio", slug: "fibra-ou-radio", scope: "Comparar." },
  ]);
  assert.equal(lido.articles[1].lock, "locked");
});

test("blocos sem linha em branco entre eles: cada \"Pilar\"/\"Suporte\" abre o artigo seguinte; no Silo, a 1ª linha é o nome e o endereço é o slug", () => {
  const texto = [
    "Silo",
    "Planos e contratação",
    "/planos-de-internet/",
    "Pilar",
    "Como escolher um plano",
    "como escolher plano de internet",
    "/planos-de-internet/como-escolher/",
    "Cobertura, uso e custo.",
    "Suporte",
    "Internet barata: o que comparar",
    "internet residencial barata",
    "/planos-de-internet/internet-barata/",
    "Preço, multa e taxa.",
  ].join("\n");
  const lido = parseDeclaredPlanText(texto);
  assert.deepEqual(lido.unparsed, []);
  assert.equal(lido.silo.name, "Planos e contratação");
  assert.equal(lido.silo.slug, "planos-de-internet");
  assert.deepEqual(resumo(texto).map(article => [article.order, article.role, article.principal, article.slug]), [
    [1, "Pilar", "como escolher plano de internet", "como-escolher"],
    [2, "Suporte", "internet residencial barata", "internet-barata"],
  ]);
});

test("no bloco, a keyword pode vir antes do título (pela forma: minúsculas, sem pontuação)", () => {
  const texto = ["Pilar", "internet residencial barata", "Internet residencial barata: o que comparar", "/planos/internet-barata/", "Comparar preço, multa e taxa."].join("\n");
  assert.deepEqual(resumo(texto), [{ order: 1, role: "Pilar", subject: "Internet residencial barata: o que comparar", principal: "internet residencial barata", slug: "internet-barata", scope: "Comparar preço, multa e taxa." }]);
});

test("numerado sem \"Palavra-chave:\": a keyword vem na linha de baixo, pela forma (e o \"Pilar\" antes do número vale para o artigo)", () => {
  const texto = [
    "Nome: Velocidade",
    "Slug: /velocidade/",
    "Pilar",
    "1. Quantos mega eu preciso?",
    "quantos mega eu preciso",
    "/velocidade/quantos-mega/",
    "Perfis de uso, com exemplos.",
    "",
    "Suporte",
    "2. Wi-Fi lento em casa: causas",
    "Wi-Fi lento",
    "Causas comuns, interferência e roteador.",
    "Mais uma linha de detalhes.",
    "3. Teste de velocidade",
    "Explicar como medir a conexão.",
    "Artigo 4",
    "Fibra ou rádio: qual escolher",
    "fibra ou rádio",
    "Comparar as tecnologias.",
  ].join("\n");
  const lido = parseDeclaredPlanText(texto);
  assert.equal(lido.format, "lista");
  assert.deepEqual(lido.unparsed, []);
  assert.deepEqual(resumo(texto), [
    { order: 1, role: "Pilar", subject: "Quantos mega eu preciso?", principal: "quantos mega eu preciso", slug: "quantos-mega", scope: "Perfis de uso, com exemplos." },
    { order: 2, role: "Suporte", subject: "Wi-Fi lento em casa: causas", principal: "Wi-Fi lento", slug: null, scope: "Causas comuns, interferência e roteador. Mais uma linha de detalhes." },
    { order: 3, role: "Suporte", subject: "Teste de velocidade", principal: null, slug: null, scope: "Explicar como medir a conexão." },
    { order: 4, role: "Suporte", subject: "Fibra ou rádio: qual escolher", principal: "fibra ou rádio", slug: null, scope: "Comparar as tecnologias." },
  ]);
  assert.ok(lido.notices.some(notice => /Artigo 3 sem "Palavra-chave:"/.test(notice)), "sem keyword pela forma, o aviso de sempre (nada é chutado)");
});

test("planilha colada (TAB) com cabeçalho em qualquer ordem, sem coluna de ordem (= sequência), a linha do Silo e célula entre aspas com quebra de linha", () => {
  const texto = tsv([
    ["Slug", "Keyword", "Papel", "Assunto (título)", "Descrição"],
    ["/planos-de-internet/", "", "Silo", "Planos e contratação", "Atrair quem compara planos."],
    ["/planos-de-internet/como-escolher/", "como escolher plano de internet", "Pilar", "Como escolher um plano", "\"Cobertura, uso\ne custo\""],
    ["/planos-de-internet/internet-barata/", "internet residencial barata", "Suporte", "Internet barata: o que comparar", "Preço e multa."],
    ["/planos-de-internet/no-meu-cep/", "internet no meu cep", "suporte", "Operadoras no meu CEP", "CEP e endereço."],
  ]);
  const lido = parseDeclaredPlanText(texto);
  assert.equal(lido.format, "planilha");
  assert.deepEqual(lido.unparsed, []);
  assert.equal(lido.silo.name, "Planos e contratação");
  assert.equal(lido.silo.slug, "planos-de-internet");
  assert.equal(lido.silo.objective, "Atrair quem compara planos.");
  assert.deepEqual(resumo(texto), [
    { order: 1, role: "Pilar", subject: "Como escolher um plano", principal: "como escolher plano de internet", slug: "como-escolher", scope: "Cobertura, uso e custo" },
    { order: 2, role: "Suporte", subject: "Internet barata: o que comparar", principal: "internet residencial barata", slug: "internet-barata", scope: "Preço e multa." },
    { order: 3, role: "Suporte", subject: "Operadoras no meu CEP", principal: "internet no meu cep", slug: "no-meu-cep", scope: "CEP e endereço." },
  ]);
  // Sem cabeçalho, só com o papel numa célula: as células pela forma, como um bloco.
  const semCabecalho = tsv([
    ["Pilar", "Como escolher um plano", "como escolher plano de internet", "/planos/como-escolher/", "Cobertura e uso."],
    ["Suporte", "Internet barata: o que comparar", "internet residencial barata", "/planos/internet-barata/", "Preço e multa."],
  ]);
  assert.equal(parseDeclaredPlanText(semCabecalho).format, "planilha");
  assert.deepEqual(resumo(semCabecalho).map(article => [article.order, article.role, article.subject, article.principal, article.slug]), [
    [1, "Pilar", "Como escolher um plano", "como escolher plano de internet", "como-escolher"],
    [2, "Suporte", "Internet barata: o que comparar", "internet residencial barata", "internet-barata"],
  ]);
});

test("CSV com cabeçalho (\";\" ou \",\"), aspas com o separador dentro, coluna de ordem, e o cabeçalho do Silo antes da tabela", () => {
  const pontoEVirgula = [
    "Nome: Planos",
    "Slug: /planos/",
    "Ordem;Papel;Título;Palavra-chave;URL;Detalhes",
    "2;Suporte;Internet barata: o que comparar;internet residencial barata;/planos/internet-barata/;Preço, multa e taxa",
    "1;Pilar;Como escolher um plano;como escolher plano de internet;/planos/como-escolher/;\"Cobertura; uso; custo\"",
  ].join("\n");
  const lido = parseDeclaredPlanText(pontoEVirgula);
  assert.equal(lido.format, "csv");
  assert.deepEqual(lido.unparsed, []);
  assert.equal(lido.silo.name, "Planos");
  assert.equal(lido.silo.slug, "planos");
  assert.deepEqual(resumo(pontoEVirgula), [
    { order: 2, role: "Suporte", subject: "Internet barata: o que comparar", principal: "internet residencial barata", slug: "internet-barata", scope: "Preço, multa e taxa" },
    { order: 1, role: "Pilar", subject: "Como escolher um plano", principal: "como escolher plano de internet", slug: "como-escolher", scope: "Cobertura; uso; custo" },
  ]);
  const virgula = [
    "Papel,Assunto,Keyword,Slug,Descrição",
    "Pilar,\"Como escolher, de verdade, um plano\",como escolher plano de internet,/planos/como-escolher/,\"Cobertura, uso e custo\"",
    "Suporte,Internet barata,internet residencial barata,/planos/internet-barata/,Preço e multa",
  ].join("\n");
  assert.equal(parseDeclaredPlanText(virgula).format, "csv");
  assert.deepEqual(resumo(virgula).map(article => [article.order, article.subject, article.scope]), [
    [1, "Como escolher, de verdade, um plano", "Cobertura, uso e custo"],
    [2, "Internet barata", "Preço e multa"],
  ]);
});

test("tabela markdown com cabeçalho em qualquer ordem e SEM número de ordem (= sequência)", () => {
  const texto = [
    "Nome: Planos",
    "| Papel | Slug | Assunto | Keyword | Descrição |",
    "|---|---|---|---|---|",
    "| Pilar | /planos/como-escolher/ | Como escolher um plano | como escolher plano | Cobertura e uso |",
    "| Suporte | /planos/internet-barata/ | Internet barata | internet barata | Preço |",
  ].join("\n");
  const lido = parseDeclaredPlanText(texto);
  assert.equal(lido.format, "tabela");
  assert.deepEqual(lido.unparsed, []);
  assert.deepEqual(resumo(texto), [
    { order: 1, role: "Pilar", subject: "Como escolher um plano", principal: "como escolher plano", slug: "como-escolher", scope: "Cobertura e uso" },
    { order: 2, role: "Suporte", subject: "Internet barata", principal: "internet barata", slug: "internet-barata", scope: "Preço" },
  ]);
});

test("ambíguo vai para \"não entendidas\" com o motivo — nunca é chutado em silêncio", () => {
  const doisEnderecos = parseDeclaredPlanText(["Pilar", "Como escolher", "como escolher plano", "/planos/a/", "/planos/b/", "Cobertura."].join("\n"));
  assert.equal(doisEnderecos.articles[0].slug, "a");
  assert.equal(doisEnderecos.unparsed.length, 1);
  assert.match(doisEnderecos.unparsed[0].reason, /já tem o slug/);
  const siloComSobra = parseDeclaredPlanText(["Silo", "Keyword: Planos", "uma frase solta no bloco do Silo", "", "Pilar", "A", "a", "Escopo, com vírgula."].join("\n"));
  assert.equal(siloComSobra.silo.name, "Planos");
  assert.match(siloComSobra.unparsed[0].reason, /bloco do Silo sem rótulo/);
  const vazio = parseDeclaredPlanText(["Nome: X", "", "Suporte", "", "Pilar", "A", "a", "Escopo, com vírgula."].join("\n"));
  assert.equal(vazio.articles.length, 1);
  assert.match(vazio.unparsed[0].reason, /Bloco sem título, keyword, slug nem detalhes/);
  const papelDesconhecido = parseDeclaredPlanText(tsv([["Papel", "Assunto", "Keyword", "Descrição"], ["Satélite", "A", "a", "E."]]));
  assert.equal(papelDesconhecido.articles[0].role, "Suporte");
  assert.ok(papelDesconhecido.notices.some(notice => /papel "Satélite" não reconhecido/.test(notice)), "o papel não reconhecido é dito na prévia");
  // 2026-10-16 · dois blocos "Silo": o leitor agrupa; sem a escolha, a recusa diz os Silos (um Silo por cadastro).
  const doisSilos = ["Silo", "Keyword: Planos", "", "Pilar", "A", "a", "E, f.", "", "Silo", "Keyword: Outro Silo", "", "Suporte", "B", "b", "G, h."].join("\n");
  assert.ok(codigos(doisSilos).includes("SILO_REPEATED"), "um Silo por cadastro");
  assert.match(parseDeclaredPlanText(doisSilos).refusals[0].message, /Este texto tem 2 Silos: Planos \(1\) · Outro Silo \(1\) — escolha qual cadastrar agora/);
  assert.deepEqual(parseDeclaredPlanText(doisSilos, { siloName: "Planos" }).articles.map(article => [article.order, article.role, article.subject]), [[1, "Pilar", "A"]]);
  assert.deepEqual(parseDeclaredPlanText(doisSilos, { siloName: "outro silo" }).articles.map(article => [article.order, article.role, article.subject]), [[1, "Suporte", "B"]], "a ordem é a sequência DENTRO do Silo");
});

/* ============ 2026-10-16 · o CSV de planejamento do dono (2 Silos, cabeçalho por sinônimo) ============ */

const linhaDoArtigo = (article: { order: number; role: string; subject: string; principal: string | null; slug?: string | null; scope: string }) => ({ order: article.order, role: article.role, subject: article.subject, principal: article.principal, slug: article.slug ?? null, scope: article.scope });

test("CSV de planejamento do dono (fixture real: BOM, CRLF, \";\", aspas com \"\"): sem a escolha, recusa listando os 2 Silos com a contagem, o slug de cada um tirado do começo comum dos endereços, e as 4 colunas extras numa linha só", () => {
  assert.equal(PLANEJAMENTO_CSV_DO_DONO.charCodeAt(0), 0xfeff, "a fixture é o arquivo como veio (com BOM)");
  const lido = parseDeclaredPlanText(PLANEJAMENTO_CSV_DO_DONO);
  assert.equal(lido.format, "csv");
  assert.deepEqual(lido.unparsed, [], "nada fica de fora");
  assert.deepEqual(lido.refusals.map(refusal => refusal.code), ["SILO_REPEATED"]);
  assert.equal(lido.refusals[0].message, "Este texto tem 2 Silos: Planos e contratação (8) · Wi-Fi e fibra óptica (7) — escolha qual cadastrar agora (um Silo por cadastro).");
  assert.deepEqual(lido.silos, [
    { name: "Planos e contratação", slug: "planos-de-internet", rawSlug: "/planos-de-internet/", slugDerived: true, articleCount: 8, pillarCount: 1 },
    { name: "Wi-Fi e fibra óptica", slug: "wifi-e-fibra", rawSlug: "/wifi-e-fibra/", slugDerived: true, articleCount: 7, pillarCount: 1 },
  ]);
  assert.equal(lido.chosenSilo, null);
  assert.deepEqual(lido.ignoredColumns, [...COLUNAS_IGNORADAS_DO_CSV]);
  assert.deepEqual(lido.notices, [`Colunas ignoradas: ${COLUNAS_IGNORADAS_DO_CSV.join(", ")}.`], "UMA linha informativa, sem recusa por coluna");
  assert.equal(lido.articles.length, 15, "sem a escolha, os 15 vão juntos (só a recusa da escolha fala)");
  assert.equal(looksLikeSiloPlanText(PLANEJAMENTO_CSV_DO_DONO), true, "colar o CSV em qualquer campo do card dispara o preenchimento");
});

test("CSV de planejamento: escolhido o Silo (siloName, sem caixa nem acento), o MESMO leitor devolve só ele — Silo 1 com 8 artigos (Pilar 1) e Silo 2 com 7 (Pilar 9): Assunto, keyword, slug, detalhes, papel e ordem; nada das colunas ignoradas", () => {
  const planos = parseDeclaredPlanText(PLANEJAMENTO_CSV_DO_DONO, { siloName: "Planos e contratação" });
  assert.deepEqual(planos.refusals, []);
  assert.equal(planos.chosenSilo, "Planos e contratação");
  assert.deepEqual(planos.silo, { heading: null, name: "Planos e contratação", slug: "planos-de-internet", rawSlug: "/planos-de-internet/", objective: null, slugDerived: true });
  assert.deepEqual(planos.articles.map(linhaDoArtigo), SILO_PLANOS_ESPERADO.map(item => ({ ...item })));
  assert.ok(planos.articles.every(article => article.slugPath === `planos-de-internet/${article.slug}`));
  assert.ok(planos.notices.some(notice => /O texto não trouxe o slug do Silo: \/planos-de-internet\/ saiu do começo comum dos slugs dos artigos/.test(notice)));
  assert.equal(planos.silos?.length, 2, "a lista dos Silos continua no resultado (o outro segue disponível)");

  const wifi = parseDeclaredPlanText(PLANEJAMENTO_CSV_DO_DONO, { siloName: "wi-fi e FIBRA optica" });
  assert.deepEqual(wifi.refusals, []);
  assert.equal(wifi.chosenSilo, "Wi-Fi e fibra óptica");
  assert.equal(wifi.silo.slug, "wifi-e-fibra");
  assert.deepEqual(wifi.articles.map(linhaDoArtigo), SILO_WIFI_ESPERADO.map(item => ({ ...item })));
  assert.equal(wifi.articles.find(article => article.role === "Pilar")?.order, 9);

  const tudo = JSON.stringify([planos, wifi]);
  for (const trecho of TRECHOS_DAS_COLUNAS_IGNORADAS) assert.ok(!tudo.includes(trecho), `"${trecho}" (coluna ignorada) não entra no plano`);
  const fora = parseDeclaredPlanText(PLANEJAMENTO_CSV_DO_DONO, { siloName: "Velocidade" });
  assert.deepEqual(fora.refusals.map(refusal => refusal.code), ["SILO_NOT_IN_TEXT"]);
  assert.match(fora.refusals[0].message, /O Silo "Velocidade" não está no texto\. O texto tem 2 Silos: Planos e contratação \(8\) · Wi-Fi e fibra óptica \(7\)/);
});

test("cabeçalho por sinônimo e por token, em qualquer ordem, com acento, \"_\" e caixa; coluna desconhecida ou repetida vai para \"Colunas ignoradas\" (nunca some calada nem rouba a keyword)", () => {
  const texto = [
    "Volume;Intenção de busca;URL_do_artigo;Keywords secundárias;Palavra-Chave;Título H1;Role;Nº;Cluster;Observações",
    "1000;Comparar planos;/planos/como-escolher/;plano barato, plano bom;como escolher plano;Como escolher um plano;Pilar;1;Planos;nota solta",
    "500;Preço e multa;/planos/internet-barata/;;internet barata;Internet barata: o que comparar;Suporte;2;Planos;",
  ].join("\r\n");
  const lido = parseDeclaredPlanText(texto);
  assert.equal(lido.format, "csv");
  assert.deepEqual(lido.refusals, []);
  assert.equal(lido.silo.name, "Planos");
  assert.equal(lido.silo.slug, "planos", "o slug do Silo sai do começo comum dos endereços");
  assert.deepEqual(lido.articles.map(linhaDoArtigo), [
    { order: 1, role: "Pilar", subject: "Como escolher um plano", principal: "como escolher plano", slug: "como-escolher", scope: "Comparar planos" },
    { order: 2, role: "Suporte", subject: "Internet barata: o que comparar", principal: "internet barata", slug: "internet-barata", scope: "Preço e multa" },
  ]);
  assert.deepEqual(lido.ignoredColumns, ["Volume", "Keywords secundárias", "Observações"]);
  assert.equal(lido.notices.filter(notice => /^Colunas ignoradas:/.test(notice)).length, 1);
  // Os formatos de antes continuam: o cabeçalho exato de sempre não ganha aviso.
  assert.equal(parseDeclaredPlanText("Papel,Assunto,Keyword,Slug,Descrição\nPilar,A,a,/x/a/,E\nSuporte,B,b,/x/b/,F").ignoredColumns, undefined);
  // Sem a coluna do Assunto (nem keyword com papel) não é plano: lista de keyword com métrica segue para a Descoberta.
  assert.equal(looksLikeSiloPlanText("Keyword;Volume;Intenção\ninternet fibra;1000;comercial\nwi-fi lento;200;informacional"), false);
});

test("vários Silos também na lista (\"Silo 2 — …\" logo depois do último artigo) e nos blocos; o slug do Silo só é tirado dos endereços quando todos ficam no mesmo caminho", () => {
  const lista = [
    "Silo 1 — Planos", "Slug: /planos/",
    "1. Como escolher um plano", "Artigo pilar • Palavra-chave: como escolher plano", "Cobertura e uso.",
    "2. Internet barata", "Palavra-chave: internet barata", "Preço e multa.",
    "Silo 2 — Wi-Fi e fibra", "Nome: Wi-Fi e fibra óptica",
    "9. Wi-Fi lento", "Artigo pilar • Palavra-chave: wi-fi lento", "/wifi-e-fibra/wi-fi-lento/", "Causas.",
    "10. Teste de velocidade", "Palavra-chave: teste de velocidade", "/wifi-e-fibra/teste/", "Como medir.",
  ].join("\n");
  const semEscolha = parseDeclaredPlanText(lista);
  assert.deepEqual(semEscolha.silos?.map(silo => [silo.name, silo.articleCount, silo.rawSlug, silo.slugDerived]), [["Planos", 2, "/planos/", false], ["Wi-Fi e fibra óptica", 2, "/wifi-e-fibra/", true]]);
  const segundo = parseDeclaredPlanText(lista, { siloName: "Wi-Fi e fibra óptica" });
  assert.deepEqual(segundo.refusals, []);
  assert.deepEqual(segundo.articles.map(article => [article.order, article.role, article.principal, article.scope]), [[9, "Pilar", "wi-fi lento", "Causas."], [10, "Suporte", "teste de velocidade", "Como medir."]]);
  assert.equal(segundo.silo.heading, "Wi-Fi e fibra");
  // Caminhos diferentes: nada é derivado, e o aviso de sempre fica.
  const misturado = parseDeclaredPlanText(["Nome: Planos", "1. A", "Artigo pilar • Palavra-chave: a", "/planos/a/", "Escopo A.", "2. B", "Palavra-chave: b", "/outro/b/", "Escopo B."].join("\n"));
  assert.equal(misturado.silo.rawSlug, null);
  assert.ok(misturado.notices.some(notice => /Sem “Slug:”/.test(notice)));
});

test("o .csv aberto no card: UTF-8 com BOM (a fixture), Windows-1252 (Excel em português), UTF-8 com acento quebrado (\"Ã§\") e UTF-16 viram o mesmo texto", () => {
  const doArquivo = decodeDeclaredPlanFile(PLANEJAMENTO_CSV_BYTES);
  assert.equal(doArquivo.encoding, "utf-8-bom");
  assert.equal(doArquivo.repaired, false);
  assert.equal(doArquivo.text, PLANEJAMENTO_CSV_DO_DONO.slice(1), "o BOM sai; o resto é o arquivo");
  assert.deepEqual(parseDeclaredPlanText(doArquivo.text, { siloName: "Planos e contratação" }).articles.map(linhaDoArtigo), SILO_PLANOS_ESPERADO.map(item => ({ ...item })));
  // Windows-1252: "Título;ação" com um byte por letra acentuada.
  const ansi = decodeDeclaredPlanFile(Uint8Array.from([0x54, 0xed, 0x74, 0x75, 0x6c, 0x6f, 0x3b, 0x61, 0xe7, 0xe3, 0x6f]));
  assert.deepEqual(ansi, { text: "Título;ação", encoding: "windows-1252", repaired: false });
  // UTF-8 que já foi lido como Windows-1252 e regravado: "contrataÃ§Ã£o" volta a "contratação".
  // (o "Ó" passa por um caractere especial do Windows-1252: o byte 0x93 vira “.)
  const quebrado = "contrata" + String.fromCharCode(0xc3, 0xa7, 0xc3, 0xa3) + "o; " + String.fromCharCode(0xc3, 0x201c) + "TIMO";
  assert.deepEqual(decodeDeclaredPlanFile(new TextEncoder().encode(quebrado)), { text: "contratação; ÓTIMO", encoding: "utf-8", repaired: true });
  // Texto certo com "Ã" de verdade (SÃO PAULO) não é "consertado".
  assert.deepEqual(decodeDeclaredPlanFile(new TextEncoder().encode("SÃO PAULO;ação")), { text: "SÃO PAULO;ação", encoding: "utf-8", repaired: false });
  const utf16 = new Uint8Array([0xff, 0xfe, ...[..."Título"].flatMap(letra => [letra.charCodeAt(0), 0])]);
  assert.deepEqual(decodeDeclaredPlanFile(utf16), { text: "Título", encoding: "utf-16le", repaired: false });
});

test("o slug do artigo: inválido recusa, repetido recusa, o do próprio Silo recusa; fora do caminho do Silo é aviso", () => {
  const plano = (slugDoSegundo: string) => ["Silo", "Nome: Planos", "Slug: /planos/", "", "Pilar", "Título A", "kw a", "/planos/a/", "Desc, A.", "", "Suporte", "Título B", "kw b", slugDoSegundo, "Desc, B."].join("\n");
  assert.deepEqual(codigos(plano("/planos/b/")), []);
  assert.ok(codigos(plano("/planos/!!!/")).includes("ARTICLE_SLUG_INVALID"));
  assert.match(parseDeclaredPlanText(plano("/planos/!!!/")).refusals.find(refusal => refusal.code === "ARTICLE_SLUG_INVALID")!.message, /artigo 2 \("\/planos\/!!!\/"\) não é válido/);
  assert.ok(codigos(plano("/planos/a/")).includes("ARTICLE_SLUG_REPEATED"));
  assert.ok(codigos(plano("/planos/")).includes("ARTICLE_SLUG_REPEATED"), "o slug do artigo não pode ser o do Silo");
  const fora = parseDeclaredPlanText(plano("/outro-silo/b/"));
  assert.deepEqual(fora.refusals, []);
  assert.ok(fora.notices.some(notice => /não fica dentro do slug do Silo/.test(notice)));
  assert.equal(fora.articles[1].slug, "b");
});

test("normalização do slug do artigo: caminho, URL, domínio sem protocolo, acento e espaço; endereço sem caminho é inválido", () => {
  assert.deepEqual(normalizeDeclaredArticleSlug("/planos-de-internet/como-escolher-plano-internet-residencial/"), { slug: "como-escolher-plano-internet-residencial", path: "planos-de-internet/como-escolher-plano-internet-residencial" });
  assert.deepEqual(normalizeDeclaredArticleSlug("https://www.site.com.br/planos/Instalação Rápida/?utm=1"), { slug: "instalacao-rapida", path: "planos/instalacao-rapida" });
  assert.deepEqual(normalizeDeclaredArticleSlug("site.com.br/planos/x"), { slug: "x", path: "planos/x" });
  assert.deepEqual(normalizeDeclaredArticleSlug("internet-barata"), { slug: "internet-barata", path: "internet-barata" });
  assert.equal(normalizeDeclaredArticleSlug("/"), null);
  assert.equal(normalizeDeclaredArticleSlug("https://site.com/"), null);
  assert.equal(normalizeDeclaredArticleSlug(""), null);
  assert.equal(isKeywordShapedLine("internet residencial barata"), true);
  assert.equal(isKeywordShapedLine("wi-fi 2.4 ghz"), true);
  assert.equal(isKeywordShapedLine("Internet residencial barata"), false);
  assert.equal(isKeywordShapedLine("cobertura, uso e custo"), false);
});

test("detector: reconhece todos os formatos do leitor (blocos sem rótulo, planilha, CSV, tabela, numerado sem rótulo) e nunca confunde lista de keywords com plano", () => {
  assert.equal(looksLikeSiloPlanText(PLANO_EM_BLOCOS_DO_DONO), true);
  assert.equal(looksLikeSiloPlanText(PLANO_EM_BLOCOS_DO_DONO.replace(/\n/g, "\r\n")), true);
  const semRotuloNenhum = PLANO_EM_BLOCOS_DO_DONO.split("\n").slice(4).join("\n");
  assert.ok(semRotuloNenhum.startsWith("Pilar\n") && !/^(?:keyword|slug)\s*:/im.test(semRotuloNenhum), "a fixture sem o bloco do Silo não tem rótulo");
  assert.equal(looksLikeSiloPlanText(semRotuloNenhum), true, "só os blocos Pilar/Suporte, sem rótulo nenhum");
  assert.equal(looksLikeSiloPlanText(tsv([["Papel", "Assunto", "Keyword", "Slug", "Descrição"], ["Pilar", "Como escolher", "como escolher plano", "/planos/a/", "Cobertura."]])), true);
  assert.equal(looksLikeSiloPlanText("Papel,Assunto,Keyword,Descrição\nPilar,Como escolher,como escolher plano,Cobertura"), true);
  assert.equal(looksLikeSiloPlanText("| Papel | Assunto | Keyword | Descrição |\n|---|---|---|---|\n| Pilar | Como escolher | como escolher plano | Cobertura |"), true);
  assert.equal(looksLikeSiloPlanText("1. Quantos mega eu preciso?\nquantos mega eu preciso\nPerfis de uso, com exemplos."), true, "numerado sem rótulo");
  // Lista de keywords (uma por linha), em qualquer arrumação comum: nunca é plano.
  assert.equal(looksLikeSiloPlanText("internet fibra óptica\nwi-fi lento\nteste de velocidade da internet"), false);
  assert.equal(looksLikeSiloPlanText("internet fibra óptica\n\nwi-fi lento\n\nteste de velocidade"), false);
  assert.equal(looksLikeSiloPlanText("1. internet fibra óptica\n2. wi-fi lento\n3. teste de velocidade"), false, "lista numerada de keywords");
  assert.equal(looksLikeSiloPlanText("suporte\nwi-fi lento\nteste de velocidade"), false, "\"suporte\" como keyword não abre plano");
  assert.equal(looksLikeSiloPlanText(tsv([["keyword", "volume"], ["internet fibra", "1000"], ["wi-fi lento", "200"]])), false, "planilha de keyword com métrica");
  assert.equal(looksLikeSiloPlanText("Keyword: internet fibra"), false, "um rótulo solto sem plano");
  assert.equal(looksLikeSiloPlanText("palavra chave seo\nnome de domínio barato\nslug amigável"), false);
});
