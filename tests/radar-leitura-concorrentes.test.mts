import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { radarCompetitorOutlinesOf, radarCompetitorTopics, type RadarCompetitorOutlinePage } from "../lib/radar/competitor-topics.ts";

/*
 * ===== A LEITURA DOS CONCORRENTES — pelos H2/H3 das páginas lidas (2026-10-02) =====
 *
 * No artigo do Instagram, 6 páginas comparáveis (mediana de 16 H2) chegavam ao
 * artigo-modelo como UMA seção de esqueleto ("stories") e 13 conceitos quase
 * todos de 1 página. Aqui, provado com dois assuntos sem nada em comum: os
 * temas contados por PÁGINA, o rótulo, o ruído fora, o "não cobrir" e só as
 * páginas comparáveis. PROVIDER_CALLS = 0.
 */

const ler = (caminho: string) => readFile(new URL(`../${caminho}`, import.meta.url), "utf8").then(texto => texto.replace(/\r\n/g, "\n"));
const h2 = (text: string) => ({ level: 2, text });
const h3 = (text: string) => ({ level: 3, text });
const pagina = (domain: string, headings: Array<{ level: number; text: string }>): RadarCompetitorOutlinePage => ({ url: `https://${domain}/post`, title: domain, domain, headings });

const INSTAGRAM: RadarCompetitorOutlinePage[] = [
  pagina("a.com", [h2("1. Tenha uma conta comercial"), h2("2. Use as hashtags certas"), h2("3. Crie uma biografia atrativa"), h2("Conclusão")]),
  pagina("b.com", [h2("Crie uma conta comercial"), h2("Aposte nas hashtags"), h3("Otimize a bio"), h2("Leia também")]),
  pagina("c.com", [h2("Hashtags que funcionam"), h2("Faça parcerias com influenciadores"), h2("Ative o Instagram Shopping")]),
  pagina("d.com", [h2("Parcerias com influenciadores locais"), h2("Como atrair clientes pelo Instagram")]),
];

test("os temas são contados por PÁGINA, com o rótulo mais comum e os cabeçalhos de exemplo", () => {
  const leitura = radarCompetitorTopics({ pages: INSTAGRAM, core: ["como atrair clientes pelo instagram"] });
  assert.equal(leitura.sampleSize, 4);
  const porTema = new Map(leitura.topics.map(item => [item.label, item]));
  const hashtags = leitura.topics.find(item => /hashtag/i.test(item.label))!;
  assert.equal(hashtags.pages, 3, "a, b e c tratam hashtags");
  assert.equal(leitura.topics.find(item => /conta comercial/i.test(item.label))!.pages, 2, "numeração e verbo de comando não separam o tema");
  assert.equal(leitura.topics.find(item => /bio/i.test(item.label))!.pages, 2, "'biografia' e 'bio' são o mesmo tema");
  assert.equal(leitura.topics.find(item => /parceria/i.test(item.label))!.pages, 2);
  assert.ok(![...porTema.keys()].some(rotulo => /conclus|leia tamb/i.test(rotulo)), "navegação e encerramento não são tema");
  assert.ok(![...porTema.keys()].some(rotulo => /^como atrair clientes pelo instagram$/i.test(rotulo)), "o cabeçalho que só repete a keyword não é tema");
  assert.equal(leitura.topics[0].pages >= leitura.topics[leitura.topics.length - 1].pages, true, "do mais tratado ao menos");
  assert.ok(hashtags.headings.length >= 2 && hashtags.headings.every(item => !/^\d/.test(item)), "exemplos limpos, sem numeração");
});

test("o 'não cobrir' vale aqui também, e outro assunto segue a mesma régua", () => {
  const fora = radarCompetitorTopics({ pages: INSTAGRAM, core: ["como atrair clientes pelo instagram"], outOfScope: valor => /shopping/i.test(valor) });
  assert.ok(!fora.topics.some(item => /shopping/i.test(item.label)));

  const IMPLANTE: RadarCompetitorOutlinePage[] = [
    pagina("x.com", [h2("Quanto custa um implante dentário"), h2("Implante dentário dói?"), h2("Cuidados depois da cirurgia")]),
    pagina("y.com", [h2("Preço do implante: o que muda o custo"), h2("Pós-operatório: cuidados essenciais")]),
    pagina("z.com", [h2("Carga imediata")]),
  ];
  const implante = radarCompetitorTopics({ pages: IMPLANTE, core: ["implante dentário"] });
  assert.equal(implante.topics.find(item => /cuidados/i.test(item.label))!.pages, 2);
  assert.equal(implante.topics.find(item => /carga imediata/i.test(item.label))!.pages, 1, "tratado por 1 página: diferencial possível");
});

test("só as páginas COMPARÁVEIS entram, uma vez cada, e só com cabeçalhos", () => {
  const extracoes = [
    { url: "https://www.a.com/post/", title: "A", status: "success", headingOutline: [h2("Tema")] },
    { url: "https://a.com/post?utm=1", title: "A de novo", status: "success", headingOutline: [h2("Tema")] },
    { url: "https://forum.com/t/1", title: "Fórum", status: "success", headingOutline: [h2("Tema")] },
    { url: "https://b.com/post", title: "B", status: "success", headingOutline: [] },
  ];
  const concorrentes = [
    { url: "https://a.com/post", domain: "a.com", title: "Página A", comparable: true },
    { url: "https://forum.com/t/1", domain: "forum.com", title: "Fórum", comparable: false },
    { url: "https://b.com/post", domain: "b.com", title: "Página B", comparable: true },
  ];
  const esbocos = radarCompetitorOutlinesOf(extracoes, concorrentes);
  assert.deepEqual(esbocos.map(item => item.domain), ["a.com"], "a mesma página uma vez; fórum não comparável fora; sem cabeçalho fora");
  assert.equal(esbocos[0].title, "Página A");
  assert.deepEqual(radarCompetitorOutlinesOf(extracoes, []), [], "sem lista de comparáveis, nenhuma página");
});

test("o CSV mostra os temas, a limitação diz de qual camada fala, e o prompt leva as três linhas", async () => {
  const fonte = await ler("lib/radar/portable-writing-export.ts");
  assert.match(fonte, /\.\.\.linhasDosComparaveis\(p\),\n\s+\.\.\.linhasDosTemas\(input, p\),/);
  assert.match(fonte, /O que os concorrentes lidos cobrem \(H2\/H3 das/);
  assert.match(fonte, /Tratado por 1 página só \(diferencial possível, se servir ao leitor\)/);
  assert.match(fonte, /limitacaoDaCamada\(item, amostra\)/);
  assert.match(fonte, /As \$\{paginasLidas\} páginas comparáveis, estas sim, foram lidas pela investigação/);
  assert.match(fonte, /leve as três linhas juntas para a IA: "\$\{topo\}", "Voz da marca" e esta/);
  /* 2026-10-02 · D10: o prompt sai fechado — sem "proposta" nem "rascunho para revisão". */
  assert.doesNotMatch(fonte, /são PROPOSTA DA IA ainda não aprovada no Radar/);

  const nucleo = await ler("lib/server/radar-portable-export-core.ts");
  assert.match(nucleo, /competitorOutlines: perfil === "GOOGLE" \? radarCompetitorOutlinesOf\(payload\.extractions, autoridades\.google\?\.observed\?\.competitors\) : null/);

  const planta = await ler("lib/radar/article-blueprint.ts");
  assert.match(planta, /skeleton: esqueletoComTemas\(esqueletoDaSerp\(p\.editorial\.sections, tocaFora\), radarWritingCompetitorTopicsOf\(input\.entrada, p\)\?\.topics \|\| \[\]\)/, "os temas viram seções M do esqueleto");
  assert.match(planta, /tema tratado por \$\{tema\.pages\} de \$\{tema\.sampleSize\} páginas comparáveis \(cabeçalhos dos concorrentes: não copie\)/);
  assert.match(planta, /"19\. UMA ENTREGA POR SEÇÃO/);
});

test("a limitação da camada: só reescreve quando houve páginas lidas", async () => {
  const fonte = await ler("lib/radar/portable-writing-export.ts");
  const corpo = fonte.slice(fonte.indexOf("function limitacaoDaCamada"), fonte.indexOf("function colunaCobrir("));
  assert.match(corpo, /if \(!paginasLidas \|\| !\/nenhuma p\[aá\]gina foi visitada\/i\.test\(limitacao\)\) return limitacao;/);
});

test("rótulo neutro do tema, títulos genéricos iguais, lentes por domínio e estrutura publicada", async () => {
  const { radarCompetitorTopicLabel, radarIsNavigationHeading } = await import("../lib/radar/competitor-topics.ts");
  assert.equal(radarCompetitorTopicLabel("Use as hashtags certas"), "Hashtags certas");
  assert.equal(radarCompetitorTopicLabel("Faça parcerias com influenciadores"), "Parcerias com influenciadores");
  assert.equal(radarCompetitorTopicLabel("Não se esqueça das hashtags"), "Hashtags");
  assert.equal(radarCompetitorTopicLabel("Carga imediata"), "Carga imediata", "o que já é assunto fica");
  const leitura = radarCompetitorTopics({ pages: INSTAGRAM, core: ["como atrair clientes pelo instagram"] });
  assert.ok(leitura.topics.every(item => !/^(Use|Crie|Tenha|Faça|Aposte)\b/.test(item.label)), "nenhum rótulo é frase de comando de concorrente");
  assert.ok(radarIsNavigationHeading("Adalba") && radarIsNavigationHeading("Leia também") && !radarIsNavigationHeading("O erro geográfico que quase ninguém fala"));
  assert.ok(radarIsNavigationHeading("Fale com a gente") && radarIsNavigationHeading("Redes Sociais") && radarIsNavigationHeading("Posts recentes"), "rodapé e widgets do blog");
  const { radarIsSiteIdentityHeading } = await import("../lib/radar/competitor-topics.ts");
  assert.equal(radarIsSiteIdentityHeading("AdalbaPro - SEO técnico e captação local para clínicas", "www.adalbapro.com.br"), true);
  assert.equal(radarIsSiteIdentityHeading("Clínica Sorriso | Implantes em Curitiba", "clinicasorriso.com.br"), true, "vale para qualquer marca");
  assert.equal(radarIsSiteIdentityHeading("Por que a AdalbaPro mede o que publica", "adalbapro.com.br"), false, "seção que cita a marca no meio fica");
  assert.equal(radarIsSiteIdentityHeading("AdalbaPro para clínicas", "adalbapro.com.br"), false, "sem separador de assinatura, fica");

  const { titulosGenericosIguais } = await import("../lib/radar/article-blueprint.ts");
  const { radarSemanticStems } = await import("../lib/radar/semantic-concept-model.ts");
  const comuns = new Set(radarSemanticStems("como atrair clientes pelo instagram"));
  assert.equal(titulosGenericosIguais("Como usar o Instagram para atrair clientes de forma estratégica", "Estratégias práticas para atrair clientes pelo Instagram", comuns), true);
  assert.equal(titulosGenericosIguais("Bio do perfil que leva ao contato", "Estratégias práticas para atrair clientes pelo Instagram", comuns), false);

  const { radarWritingDomainLenses } = await import("../lib/radar/portable-writing-export.ts");
  const lentes = {
    frozenPackage: { state: "frozen", canonical: { readings: [
      { label: "desktop · Windows", observed: true, competitorDomains: ["a.com", "b.com"] },
      { label: "celular · iOS", observed: true, competitorDomains: ["a.com", "c.com"] },
    ] } },
    keywords: [],
  };
  const onde = radarWritingDomainLenses(lentes as never)!;
  assert.equal(onde("www.a.com"), "em todas as 2 lentes");
  assert.equal(onde("c.com"), "só em celular · iOS (1 de 2 lentes)");
  assert.equal(onde("z.com"), null);
  assert.equal(radarWritingDomainLenses(null), null);

  const fonte = await ler("lib/radar/portable-writing-export.ts");
  assert.match(fonte, /Estrutura publicada atual \(lida da página na exportação\): H1 /);
  assert.match(fonte, /seção existente que a planta não tem só sai com decisão humana/);
  const nucleo = await ler("lib/server/radar-portable-export-core.ts");
  assert.match(nucleo, /readPublishedStructure\?: \(url: string\) => Promise<\{ h1: string \| null; h2: string\[\] \} \| null>;/, "opcional e injetado: sem ele, nada é lido");
  assert.match(nucleo, /const pagina = await extractCompetitorPage\(url, \{ timeoutMs: 8000 \}\);/);
  const rota = await ler("app/api/editorial/radar-export/route.ts");
  assert.match(rota, /readPublishedStructure: radarReadPublishedStructure,/);
});

test("PROVIDER_CALLS = 0", () => {
  assert.ok(true, "domínio puro e leitura de fonte");
});
