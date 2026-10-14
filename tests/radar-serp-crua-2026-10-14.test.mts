import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import test from "node:test";

/*
 * ===== 2026-10-14 · F-S · A SERP CRUA POR ARTIGO (SDD silo interligado §16.1) =====
 *
 * Item novo, decidido pelo dono em 2026-10-14 ("sim, pode sim, e do MCP também é
 * uma boa ideia, pode implementar"): ao lado do `<NN>-<papel>-<slug>-para-escrever.csv`
 * sai `<NN>-<papel>-<slug>-serp.csv`, só com dados já coletados, na tela (.zip da
 * exportação por artigo) e no MCP (`get_article_serp_raw`), pelo MESMO núcleo.
 *
 * Provas: a função pura sobre a SERP do caso real (4 lentes, PAA com resposta,
 * buscas relacionadas, H1/H2 e sinais, D11 marcado e não escondido, sem texto de
 * página); a montagem real sobre o PostgREST simulado da bancada do export
 * (`radarMcpSerpRawForArticle`), sem nada sair para fora do banco; a rota, a tela e
 * a ferramenta apontando para a mesma função.
 */

const { HOST_DO_BANCO, ARTIGO: ARTIGO_DO_BANCO, MARCA: MARCA_DO_BANCO, instalarPostgrestSimulado, semearBanco } = await import("./radar-export-leitura-fixtures.mts");
process.env.NEXT_PUBLIC_SUPABASE_URL = `http://${HOST_DO_BANCO}`;
process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-de-teste-sem-rede";
const flagsDoProcesso = [...process.execArgv, String(process.env.NODE_OPTIONS || "")].join(" ");
if (!flagsDoProcesso.includes("integrations-runtime-loader")) register("./integrations-runtime-loader.mjs", import.meta.url);
const STUBS: Record<string, string> = {
  "@/lib/server/authz": [
    "export class AuthzError extends Error { constructor(status, message) { super(message); this.status = status; } }",
    "export function authzErrorResponse(error) { return { status: (error && error.status) || 500, message: String((error && error.message) || error) }; }",
    "export async function requireCanonicalSessionProfile() { throw new Error('sessão não usada neste teste'); }",
  ].join("\n"),
  "@/lib/server/editorial-authorization": "export async function assertEditorialPermission() {}",
};
const HOOKS = `
const STUBS = ${JSON.stringify(STUBS)};
export async function resolve(specifier, context, next) {
  if (Object.prototype.hasOwnProperty.call(STUBS, specifier)) {
    return { url: "data:text/javascript," + encodeURIComponent(STUBS[specifier]), shortCircuit: true };
  }
  if (specifier === "next/server") return next("next/server.js", context);
  return next(specifier, context);
}
`;
register("data:text/javascript," + encodeURIComponent(HOOKS), import.meta.url);
const banco = semearBanco();
const { foraDoBanco } = instalarPostgrestSimulado(() => banco);

const {
  RADAR_SERP_RAW_COLUMNS,
  RADAR_SERP_RAW_KINDS,
  radarSerpRawArchiveFilename,
  radarSerpRawCsv,
  radarSerpRawExport,
  radarSerpRawFilename,
  radarSerpRawRows,
} = await import("../lib/radar/serp-raw-export.ts");
const { sliceWritingCsv } = await import("../lib/agent/platform-tool-projections.ts");
const { radarMcpSerpRawForArticle, radarMcpSerpRawOf } = await import("../lib/server/radar-mcp-material.ts");
const { createCanonicalServiceClient } = await import("../lib/server/canonical-authorization.ts");
const { PLATFORM_OPERATIONS } = await import("../lib/agent/platform-catalog.ts");

/* ============================== a SERP do caso real (só o que já foi coletado) ============================== */

const AUDIENCIA = "Dentistas e donos de consultório odontológico que querem captar pacientes sem depender de anúncio pago.";
const PRINCIPAL = "captação de pacientes dentista";
const organico = (position: number, title: string, url: string, snippet: string, date: string | null = null) =>
  ({ position, title, url, domain: new URL(url).hostname.replace(/^www\./, ""), snippet, sitelinks: [], date, inferredType: "article", confidence: "high", manualType: null, notes: "" });
const TRECHO_LONGO = `14 de jul. de 2026 — 10 estratégias para captação de pacientes na odontologia · ${"1. Conheça bem seu público-alvo · 2. Marque presença nas redes sociais · ".repeat(8)}`;
const SNAPSHOT = {
  query: PRINCIPAL, country: "BR", language: "pt-BR", location: "São Paulo", device: "desktop", operatingSystem: "windows",
  collectedAt: "2026-09-30T12:00:00.000Z", status: "approved",
  organicResults: [
    organico(3, "10 estratégias para captação de pacientes na odontologia", "https://blog.capim.com.br/artigo/captacao-de-pacientes", TRECHO_LONGO, "14 de jul. de 2026"),
    organico(4, "Dicas de Ouro para Captação de Pacientes na Odontologia", "https://www.cemoi.com.br/dicas-de-ouro-para-captacao-de-pacientes-na-odontologia/", "1. Tenha uma Presença Digital Forte e Profissional · 2. Atendimento de Excelência"),
    organico(6, "Você, psicólogo, quer fazer parte da Psitto terapia online?", "https://www.psitto.com.br/sou-psicologo/", "Cadastre-se como psicólogo e atenda online."),
    organico(7, "Zenklub: Terapia online com psicólogos disponíveis 24h por dia", "https://zenklub.com.br/", "Encontre psicólogos para terapia online."),
    organico(8, "Como captar pacientes: estratégias para psicólogos", "https://www.amplimed.com.br/blog/como-captar-pacientes-na-psicologia/", "Estratégias para psicólogos captarem pacientes."),
    organico(9, "como atrair mais pacientes para o seu consultório", "https://www.idealodonto.com.br/blog/captacao-de-pacientes-odontologia/", "Existem várias formas de captar pacientes, incluindo marketing digital."),
    organico(10, "Prospecta Odonto | Marketing e Captação para Dentistas", "https://www.prospectaodonto.com.br/", "Somos a 1ª agência de marketing odontológico especializada em captação de pacientes."),
  ],
  peopleAlsoAsk: [
    { position: 1, question: "Como fazer captação de pacientes em odontologia?", answer: "A captação começa pelo perfil da clínica no Google e por um site que responde às dúvidas de quem procura tratamento.", sourceTitle: "Blog de odontologia", sourceUrl: "https://blog.capim.com.br/artigo/captacao-de-pacientes", classification: null, notes: "" },
    { position: 2, question: "O que o CRO não permite postar?", answer: null, sourceTitle: null, sourceUrl: null, classification: null, notes: "" },
  ],
  relatedSearches: [{ term: "captação de pacientes odontologia", classification: null, notes: "" }, { term: "empresa de captação de pacientes", classification: null, notes: "" }],
  knowledgeGraph: null,
  diagnostic: null,
  serpFeatures: { aiOverview: { present: true, markdownLength: 820, references: [{ domain: "cfo.org.br", title: "Código de ética odontológica", url: "https://website.cfo.org.br/codigo-de-etica/" }] }, itemTypes: ["ai_overview", "organic", "people_also_ask"] },
};
const pagina = (url: string, h1: string[], h2: string[], wordCount: number, hasDates: boolean, author: string | null) => ({ url, status: "success", h1, h2, hasDates, author, wordCount });
const PAGINAS = [
  pagina("https://blog.capim.com.br/artigo/captacao-de-pacientes", ["10 estratégias para captação de pacientes na odontologia"], ["1. Conheça bem seu público-alvo", "2. Marque presença nas redes sociais", "3. Ofereça uma experiência marcante"], 2100, true, "Equipe Capim"),
  pagina("https://www.cemoi.com.br/dicas-de-ouro-para-captacao-de-pacientes-na-odontologia/", ["Dicas de Ouro para Captação de Pacientes na Odontologia"], ["Tenha uma Presença Digital Forte e Profissional", "Atendimento de Excelência Começa no Primeiro Contato"], 1900, true, null),
  pagina("https://www.psitto.com.br/sou-psicologo/", ["Você, psicólogo"], ["Como funciona", "Planos"], 800, false, null),
  pagina("https://www.idealodonto.com.br/blog/captacao-de-pacientes-odontologia/", ["Captação de pacientes na odontologia"], ["Marketing digital", "Referências e parcerias"], 2400, true, "Ideal Odonto"),
  pagina("https://www.prospectaodonto.com.br/", ["Prospecta Odonto"], ["Captação de pacientes", "Clientes"], 15944, false, null),
];
const lente = (rotulo: string, organic: Array<{ url: string; title: string; position: number; snippet?: string; date?: string }> | null, missing: string | null = null) =>
  ({ lens: rotulo, organic, missing, collectedAt: organic ? "2026-09-30T12:05:00.000Z" : null });
const RESUMOS = {
  readFailed: false,
  lenses: [
    lente("desktop-macos", [{ url: "https://www.idealodonto.com.br/blog/captacao-de-pacientes-odontologia/", title: "como atrair mais pacientes para o seu consultório", position: 1, snippet: "Existem várias formas de captar pacientes." }]),
    lente("mobile-android", [{ url: "https://zenklub.com.br/", title: "Zenklub: Terapia online", position: 1 }, { url: "https://www.idealodonto.com.br/blog/captacao-de-pacientes-odontologia/", title: "como atrair mais pacientes", position: 2, date: "24 de nov. de 2025" }]),
    lente("mobile-ios", null, "sem coleta válida no cache (vencida)"),
  ],
};
const consulta = (os: string, device: string, questions: string[], relatedSearches: string[]) => ({
  request: { query: { keyword: PRINCIPAL, lens: { device, operatingSystem: os } } },
  hit: { meta: { collectedAt: "2026-09-30T12:05:00.000Z" }, observation: { lens: `${device}-${os}`, depth: 10, competitorDomains: [], organicCount: 10, itemTypes: ["organic"], questions, relatedSearches, aiOverviewDomains: [], commercialSignals: false } },
  missReason: null,
});
const CONSULTAS = [
  consulta("macos", "desktop", ["Como fazer captação de pacientes em odontologia?", "Como criar um script para captar pacientes?"], ["marketing odontológico"]),
  consulta("android", "mobile", [], ["captação de pacientes odontologia", "agência de marketing odontológico"]),
];
const entradaDaSerp = () => ({
  article: { principalKeyword: PRINCIPAL, secondaryKeywords: ["captação de pacientes sem tráfego pago", "tráfego orgânico como fazer", "empresa de captação de pacientes"], narrativeReinforcements: [], audience: AUDIENCIA, slug: "captacao-de-pacientes-sem-trafego-pago" },
  serpObserved: { snapshot: SNAPSHOT as never },
  serpRawPages: PAGINAS,
});
const linhasDoCaso = () => radarSerpRawRows({ ...entradaDaSerp(), pages: PAGINAS, lensDigests: RESUMOS as never, lensLookups: CONSULTAS as never });

const idasAoServidor: string[] = [];

/* ============================== a função pura ============================== */

test("F-S · o arquivo: BOM UTF-8, cabeçalho claro com as 12 colunas e todas as células entre aspas, como o CSV 'Para escrever'", () => {
  const csv = radarSerpRawCsv(linhasDoCaso());
  assert.ok(csv.startsWith("﻿\"tipo\",\"lente\",\"posicao\",\"posicao_na_pagina\",\"url\",\"dominio\",\"coletado_em\",\"titulo\",\"descricao\",\"estrutura_h1_h2\",\"sinais\",\"relevancia_d11\"\r\n"));
  assert.deepEqual([...RADAR_SERP_RAW_COLUMNS], ["tipo", "lente", "posicao", "posicao_na_pagina", "url", "dominio", "coletado_em", "titulo", "descricao", "estrutura_h1_h2", "sinais", "relevancia_d11"]);
  assert.ok(csv.endsWith("\r\n"));
  const sobre = linhasDoCaso()[0];
  assert.equal(sobre.tipo, RADAR_SERP_RAW_KINDS.about);
  assert.match(sobre.descricao, /nenhuma coleta nova, nada pago, nenhuma IA/);
  assert.match(sobre.descricao, /Sem o texto integral das páginas/);
});

test("F-S · uma linha por orgânico por lente nas 4 lentes; a lente sem leitura sai declarada, nunca recoletada", () => {
  const organicos = linhasDoCaso().filter(item => item.tipo === RADAR_SERP_RAW_KINDS.organic);
  const porLente = (rotulo: string) => organicos.filter(item => item.lente === rotulo);
  assert.equal(porLente("desktop · Windows").length, SNAPSHOT.organicResults.length);
  assert.equal(porLente("desktop · macOS").length, 1);
  assert.equal(porLente("celular · Android").length, 2);
  const ios = porLente("celular · iOS");
  assert.equal(ios.length, 1);
  assert.match(ios[0].descricao, /^Sem os resultados orgânicos desta lente: sem coleta válida no cache \(vencida\)\. Nada foi coletado de novo\.$/);
  const capim = porLente("desktop · Windows")[0];
  assert.deepEqual([capim.posicao, capim.posicao_na_pagina, capim.dominio, capim.coletado_em], ["1", "3", "blog.capim.com.br", "2026-09-30"]);
  assert.match(capim.estrutura_h1_h2, /^H1: 10 estratégias para captação de pacientes na odontologia\nH2: 1\. Conheça bem seu público-alvo \| 2\. Marque presença/);
  assert.match(capim.sinais, /data na SERP: 14 de jul\. de 2026; data visível na página: sim; autor: Equipe Capim; resumo de IA no topo da SERP: sim/);
  assert.ok(capim.descricao.length <= 300 && capim.descricao.endsWith("…"), "o trecho de terceiro é cortado");
  const android = porLente("celular · Android");
  assert.equal(android[1].sinais.includes("data na SERP: 24 de nov. de 2025"), true);
  assert.equal(android[1].estrutura_h1_h2, "H1: Captação de pacientes na odontologia\nH2: Marketing digital | Referências e parcerias", "a mesma página tem a mesma estrutura em toda lente");
});

test("F-S · D11 marcado, não escondido: outra profissão (psicologia) e o outlier de medida ficam na lista com o motivo", () => {
  const organicos = linhasDoCaso().filter(item => item.tipo === RADAR_SERP_RAW_KINDS.organic && item.lente === "desktop · Windows");
  const por = (dominio: string) => organicos.find(item => item.dominio === dominio)!;
  for (const dominio of ["psitto.com.br", "zenklub.com.br", "amplimed.com.br"]) {
    assert.match(por(dominio).relevancia_d11, /^irrelevante \(D11\): fora do leitor: outra profissão, fora do público do artigo/, dominio);
  }
  assert.match(por("prospectaodonto.com.br").relevancia_d11, /outlier de medida: 15944 palavras \(mediana das páginas lidas: 2100\)/);
  for (const dominio of ["blog.capim.com.br", "cemoi.com.br", "idealodonto.com.br"]) assert.equal(por(dominio).relevancia_d11, "relevante", dominio);
  assert.equal(organicos.length, 7, "nenhum concorrente sumiu");
});

test("F-S · 'Pessoas também perguntam' com a resposta exibida e a fonte; buscas relacionadas; fontes do resumo de IA; sem duplicar o que a canônica já tem", () => {
  const linhas = linhasDoCaso();
  const perguntas = linhas.filter(item => item.tipo === RADAR_SERP_RAW_KINDS.question);
  assert.equal(perguntas[0].titulo, "Como fazer captação de pacientes em odontologia?");
  assert.match(perguntas[0].descricao, /^A captação começa pelo perfil da clínica no Google/);
  assert.equal(perguntas[0].url, "https://blog.capim.com.br/artigo/captacao-de-pacientes");
  assert.equal(perguntas[0].sinais, "fonte da resposta: Blog de odontologia");
  assert.equal(perguntas[1].descricao, "o Google não exibiu resposta nesta coleta");
  const soNoMac = perguntas.filter(item => item.lente === "desktop · macOS");
  assert.deepEqual(soNoMac.map(item => item.titulo), ["Como criar um script para captar pacientes?"], "a pergunta que a canônica já tem não repete");
  const relacionadas = linhas.filter(item => item.tipo === RADAR_SERP_RAW_KINDS.related);
  assert.deepEqual(relacionadas.map(item => `${item.lente} · ${item.titulo}`), [
    "desktop · Windows · captação de pacientes odontologia",
    "desktop · Windows · empresa de captação de pacientes",
    "desktop · macOS · marketing odontológico",
    "celular · Android · agência de marketing odontológico",
  ]);
  const ia = linhas.filter(item => item.tipo === RADAR_SERP_RAW_KINDS.aiSource);
  assert.deepEqual(ia.map(item => [item.dominio, item.url]), [["cfo.org.br", "https://website.cfo.org.br/codigo-de-etica/"]]);
});

test("F-S · nunca o texto integral das páginas: o arquivo só tem título, trecho cortado, H1/H2 e URL", () => {
  const csv = radarSerpRawCsv(linhasDoCaso());
  for (const linha of linhasDoCaso()) assert.ok(linha.descricao.length <= 300 || linha.tipo === RADAR_SERP_RAW_KINDS.about, `${linha.tipo}: descrição longa`);
  assert.doesNotMatch(csv, /introText|closingText|paragraph/i);
});

test("F-S · o nome: o mesmo prefixo do CSV 'Para escrever' (posição e papel no Silo), com '-serp.csv'; o .zip do artigo pelo mesmo prefixo", () => {
  assert.equal(radarSerpRawFilename({ slug: "captacao-de-pacientes-sem-trafego-pago", keyword: PRINCIPAL, position: 3, role: "Suporte", today: "2026-10-14T00:00:00.000Z" }), "03-suporte-captacao-de-pacientes-sem-trafego-pago-serp.csv");
  assert.equal(radarSerpRawFilename({ slug: "skincare-facial", keyword: "skincare facial", today: "2026-10-14T00:00:00.000Z" }), "artigo-skincare-facial-serp.csv");
  assert.equal(radarSerpRawArchiveFilename({ writingFilename: "03-suporte-captacao-de-pacientes-sem-trafego-pago-para-escrever.csv", articles: 1, today: "2026-10-14T00:00:00.000Z" }), "03-suporte-captacao-de-pacientes-sem-trafego-pago.zip");
  assert.equal(radarSerpRawArchiveFilename({ writingFilename: "artigos-para-escrever-2026-10-14.csv", articles: 2, today: "2026-10-14T00:00:00.000Z" }), "artigos-para-escrever-e-serp-2026-10-14.zip");
});

test("F-S · o lote: um arquivo por artigo, com o Silo da seleção; a função do MCP devolve o mesmo arquivo da rota", () => {
  const montada = { articleId: "artigo-3", entrada: entradaDaSerp(), lentes: [{ keyword: PRINCIPAL, role: "principal" }], lensDigests: RESUMOS as never };
  const posicao = () => ({ position: 3, role: "Suporte" });
  const [arquivo] = radarSerpRawExport({ articles: [montada as never], lookups: CONSULTAS as never, today: "2026-10-14T00:00:00.000Z", positionOf: posicao });
  assert.equal(arquivo.filename, "03-suporte-captacao-de-pacientes-sem-trafego-pago-serp.csv");
  assert.equal(arquivo.csv, radarSerpRawCsv(linhasDoCaso()));
  const plano = { files: [{ writing: { members: [{ articleId: "artigo-3", position: 3, role: "Suporte" }] } }] };
  const doMcp = radarMcpSerpRawOf({ exportedAt: "2026-10-14T00:00:00.000Z", montadas: [montada as never], recusados: [], lentes: { lookups: CONSULTAS as never, readFailed: false }, planoDaSelecao: plano as never });
  assert.equal(doMcp.status, "ready");
  if (doMcp.status === "ready") {
    assert.equal(doMcp.csv, arquivo.csv, "o MCP entrega o mesmo arquivo da tela");
    assert.equal(doMcp.filename, arquivo.filename);
    /* As partes juntas voltam ao arquivo, como o CSV de escrita. */
    const primeira = sliceWritingCsv(doMcp.csv, 1, 2_000);
    const partes = Array.from({ length: primeira.parts }, (_, indice) => sliceWritingCsv(doMcp.csv, indice + 1, 2_000).csv);
    assert.equal(partes.join(""), doMcp.csv);
  }
  const vazio = radarMcpSerpRawOf({ exportedAt: "2026-10-14T00:00:00.000Z", montadas: [], recusados: [{ articleId: "x", code: "radar_not_finalized", reason: "Investigação não finalizada." }] as never, lentes: { lookups: [], readFailed: false }, planoDaSelecao: null });
  assert.deepEqual(vazio, { status: "refused", code: "radar_not_finalized", reason: "Investigação não finalizada." });
});

/* ============================== a montagem real (bancada do export, PostgREST simulado) ============================== */

test("F-S · ponta a ponta pela montagem real: a SERP crua sai do que o banco já tem, sem artigo-modelo, e nada sai para fora do banco", async () => {
  const material = await radarMcpSerpRawForArticle({ brandId: MARCA_DO_BANCO, articleId: ARTIGO_DO_BANCO.F, supabase: createCanonicalServiceClient() as never, actorUserId: "ator-de-teste" });
  assert.equal(material.status, "ready", JSON.stringify(material).slice(0, 300));
  if (material.status !== "ready") return;
  assert.match(material.filename, /-serp\.csv$/);
  assert.ok(material.csv.startsWith("﻿\"tipo\""));
  assert.ok(material.rows >= 2, "ao menos a linha 'sobre' e as lentes declaradas");
  assert.match(material.csv, /"orgânico","desktop · Windows"/);
  assert.deepEqual(foraDoBanco, [], "PROVIDER_CALLS = 0: nada saiu para fora do banco simulado");
});

/* ============================== a rota, a tela, a ferramenta e o catálogo ============================== */

const semComentarios = (fonte: string) => fonte.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
const ler = (arquivo: string) => semComentarios(readFileSync(new URL(`../${arquivo}`, import.meta.url), "utf8"));

test("F-S · a rota, a tela e a ferramenta usam a mesma função; get_article_for_writing fica como era", () => {
  const rota = ler("app/api/editorial/radar-export/route.ts");
  assert.match(rota, /serpRaw: z\.boolean\(\)\.optional\(\),/);
  assert.match(rota, /const comSerpCrua = input\.mode === "writing" && !input\.groupBy && input\.serpRaw === true;/);
  assert.match(rota, /\.\.\.\(comSerpCrua \? \{ videoLensDigests: true, serpRawPages: true \} : \{\}\),/);
  assert.match(rota, /radarSerpRawExport\(\{ articles: montadas, lookups: lentes\.lookups, today: exportedAt, positionOf: radarSerpRawPositionOf\(planoDaSelecao\) \}\)/);
  const material = ler("lib/server/radar-mcp-material.ts");
  assert.match(material, /radarSerpRawExport\(\{ articles: montagem\.montadas, lookups: montagem\.lentes\.lookups, today: montagem\.exportedAt, positionOf: radarSerpRawPositionOf\(montagem\.planoDaSelecao\) \}\)/);
  const ferramentas = ler("lib/server/platform-mcp-tools.ts");
  assert.match(ferramentas, /server\.registerTool\("get_article_serp_raw"/);
  assert.match(ferramentas, /call\("get_article_serp_raw", "platform\.read", \{ brandId \}, \[\{ module: "radar", action: "view" \}\]/);
  assert.match(ferramentas, /radarMcpSerpRawForArticle\(\{ brandId: access\.brandId, articleId, supabase: getOperationalClient\(\), actorUserId: principal\.actorId \}\)/);
  /* get_article_for_writing continua só com o CSV de escrita (o E0 trava a fonte dele). */
  const escrita = ferramentas.slice(ferramentas.indexOf('server.registerTool("get_article_for_writing"'), ferramentas.indexOf('server.registerTool("get_video_material"'));
  assert.doesNotMatch(escrita, /serp|Serp/);
  const tela = ler("modules/radar/radar-page.tsx");
  assert.match(tela, /\.\.\.\(modo === "writing" \? \{ serpRaw: true \} : \{\}\), mode: modo \}/);
  assert.match(tela, /radarStoredZipOfTexts\(\[\{ name: corpo\.filename, text: corpo\.csv \}, \.\.\.serpCrua\.map/);
  assert.match(tela, /useState<"silo" \| "selecionados">\("selecionados"\)/, "a exportação por artigo é o padrão da tela");
});

test("F-S · catálogo (AGENTS §17.1): a operação radar.serp_raw com get_article_serp_raw, grátis, e a prática por artigo dita na exportação", () => {
  const operacao = PLATFORM_OPERATIONS.find(item => item.id === "radar.serp_raw")!;
  assert.ok(operacao);
  assert.deepEqual(operacao.tools, ["get_article_serp_raw"]);
  assert.equal(operacao.cost, "free");
  assert.equal(operacao.access, "tool");
  assert.deepEqual([...operacao.routes], ["/api/editorial/radar-export"]);
  assert.match(operacao.notes!.join(" "), /Nunca o texto integral das páginas/);
  const escrita = PLATFORM_OPERATIONS.find(item => item.id === "radar.export_for_writing")!;
  assert.ok(escrita.notes!.some(nota => /^Exportação por artigo \(2026-10-14, prática recomendada do dono, não regra\)/.test(nota)));
  assert.deepEqual(escrita.tools, ["get_article_for_writing"]);
  assert.deepEqual(idasAoServidor, []);
});
