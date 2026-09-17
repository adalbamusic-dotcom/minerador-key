import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  RADAR_EXPORT_BLUEPRINT_TYPE,
  buildRadarPortableExportRow,
  radarPortableExportCsv,
  radarPortableExportFilename,
  type RadarPortableExportRow,
} from "../lib/radar/portable-export.ts";
import { resolveRadarCanonicalDossier } from "../lib/server/radar-canonical-dossier.ts";
import type { RadarEditorialProfileModel } from "../lib/radar/editorial-profile-model.ts";

/*
 * ===== RADAR_PORTABLE_EXPORT_1 · O ARQUIVO QUE SAI DO RADAR =====
 *
 * ==================== O QUE ESTA SUÍTE GUARDA ====================
 *
 * As invariantes de TRANSPORTE e de AUTORIDADE: um artigo não finalizado não
 * produz dossiê, o lote não duplica, o CSV sobrevive ao que carrega, nenhum
 * segredo atravessa, o Radar não cria tag de afiliado, e o dossiê exportado sai
 * da mesma resolução que o envio ao Planejador.
 *
 * O CONTEÚDO editorial do dossiê — colunas, radiografia, brief, outline — é do
 * 1.1, e vive em `radar-portable-export-11.test.mts`.
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

/* ============================== as fixtures ============================== */

const FUNDAMENTO = {
  brandId: "marca-1",
  articleId: "artigo-1",
  articleDnaVersionId: "dna-v7",
  articleDnaContentHash: "sha256:fundamento",
};

const modeloComercial = (patch: Partial<RadarEditorialProfileModel> = {}): RadarEditorialProfileModel => ({
  kind: "COMMERCIAL",
  profile: "AMAZON",
  articleIdentity: {
    articleId: "artigo-1", articleDnaVersionId: "dna-v7",
    principalKeyword: "sérum nivea", intentLabel: "Investigação comercial", siloRole: "SUPORTE",
  },
  editorialOutput: "TOP_VALUE",
  workingTitle: "Os 6 sérum nivea com melhor custo-benefício",
  alternateTitleDirections: ["Sérum nivea: o que compensa em cada faixa de preço"],
  objective: "Dar critério de escolha",
  promise: "Ao final, o leitor sabe o que se ganha em cada faixa.",
  hook: null,
  blocks: [{
    id: "b1", order: 1, heading: "Como avaliamos custo-benefício",
    objective: "Explicar a relação preço/reputação.",
    coveragePoints: ["relação entre preço e nota"],
    function: "Bloco comercial", evidenceStrength: "MODERATE",
    mustCoverReasons: ['O ArticleDNA declara "tipos de sérum".'],
    sourceNeeded: null, specialistRequired: null, visualOpportunity: null,
    sourceSignal: "Bandas derivadas do universo observado.",
  }],
  conclusion: "Fechar indicando o que compensa em cada faixa.",
  cta: "Levar o leitor a comparar antes de decidir",
  derived: [{ id: "c1", label: "1. NIVEA Q10 Sérum", detail: "Nota 4,8 com 835 avaliações.", sourceSignal: "Selecionado por custo-benefício." }],
  derivedLabel: "Candidatos selecionados",
  articleApplication: [],
  seoApplication: ["Cobrir as buscas relacionadas na seção comercial"],
  evidenceNeeds: [],
  specialistNeeds: [],
  limitations: ["Benefícios e atributos do PDP não foram lidos nesta investigação."],
  readiness: { state: "READY", label: "Pronto para o Planejador", reasons: [] },
  promotionLinks: [{
    asin: "B0DBRR5BP4", productName: "NIVEA Q10 Sérum Antissinais Expert Dupla Ação 30ml, Previne e Reduz Rugas",
    amazonUrl: "https://www.amazon.com.br/dp/B0DBRR5BP4",
    suggestedAnchor: "NIVEA Q10 Sérum Antissinais Expert Dupla Ação 30ml",
    suggestedButtonLabel: "Ver preço na Amazon",
    placement: "Na posição 1 da lista.", linkFormat: "BUTTON",
    affiliateReady: true, relPolicy: "sponsored nofollow",
  }],
  affiliateDisclosureRequired: true,
  comparisonCriteria: ["Faixa de preço", "Nota de avaliação"],
  shortlistStatus: { state: "OK", desired: 6, available: 6, message: null, fixHint: null },
  ...patch,
} as RadarEditorialProfileModel);

const artigoDoExport = (patch: Record<string, unknown> = {}) => ({
  principalKeyword: "sérum nivea",
  secondaryKeywords: ["sérum antissinais", "sérum facial nivea"],
  narrativeReinforcements: [],
  intent: "Investigação comercial",
  funnel: "Meio",
  siloName: "skincare",
  articleRole: "SUPORTE",
  slug: "serum-nivea",
  mustCover: ["tipos de sérum", "como escolher por necessidade"],
  ...patch,
});

const comercialDoExport = () => ({
  setup: null,
  counts: { observed: 59, eligible: 9, shortlist: 6 },
  products: modeloComercial().promotionLinks.map(item => ({ asin: item.asin, productName: item.productName })),
  links: modeloComercial().promotionLinks,
  comparisonCriteria: ["Faixa de preço", "Nota de avaliação"],
  disclosureRequired: true,
  shortlistStatus: { state: "OK" as const, desired: 6, available: 6, message: null, fixHint: null },
});

const linhaComercial = (patch: Record<string, unknown> = {}): RadarPortableExportRow =>
  buildRadarPortableExportRow({
    profile: "AMAZON",
    blueprintView: { blueprint: null, sample: { label: "produto(s)", count: 59 } } as never,
    exportedAt: "2026-09-17T12:00:00.000Z",
    article: artigoDoExport(),
    profileModel: modeloComercial(),
    commercial: comercialDoExport(),
    internalLinks: ["/skincare/o-que-e-serum"],
    researchLimitations: ["A coleta da prateleira não traz texto de avaliação."],
    ...patch,
  });

/* ================================ A ================================ */

test("A · artigo não finalizado não produz dossiê", () => {
  /*
   * §2 · a mesma pergunta que o envio ao Planejador faz.
   *
   * `radarPrimaryProfileOfAnalysis` responde `null` quando não há fotografia —
   * uma coleta paga e não congelada NÃO é investigação finalizada.
   */
  const semFotografia = resolveRadarCanonicalDossier({
    analysis: { versionId: "v1", versionNumber: 1, payload: { amazonSearch: { universe: [] } } } as never,
    article: FUNDAMENTO,
    observedAt: "2026-09-17T10:00:00.000Z",
  });

  assert.equal(semFotografia.ok, false);
  if (semFotografia.ok) return;
  assert.equal(semFotografia.code, "radar_research_not_finalized");
});

/* ============================== B, C e R ============================== */

/**
 * OS ARTIGOS DO ARQUIVO, LIDOS COMO O EXCEL LERIA.
 *
 * Contar o slug no texto cru não serve: ele também aparece dentro do
 * `article_dna_compact_json`. Só um parser distingue a CÉLULA do conteúdo dela.
 */
function slugsDoCsv(csv: string): string[] {
  const linhas = lerCsv(csv);
  const coluna = linhas[0].indexOf("slug");
  assert.notEqual(coluna, -1, "o arquivo identifica o artigo pelo slug");
  return linhas.slice(1).map(linha => linha[coluna]);
}

test("B, C e R · uma linha por artigo, e o lote não duplica", () => {
  const uma = slugsDoCsv(radarPortableExportCsv([linhaComercial()]));
  assert.deepEqual(uma, ["serum-nivea"], "B · um artigo finalizado, uma linha");

  const tres = slugsDoCsv(radarPortableExportCsv([
    linhaComercial({ article: artigoDoExport({ slug: "artigo-1" }) }),
    linhaComercial({ article: artigoDoExport({ slug: "artigo-2" }) }),
    linhaComercial({ article: artigoDoExport({ slug: "artigo-3" }) }),
  ]));
  assert.deepEqual(tres, ["artigo-1", "artigo-2", "artigo-3"], "C · três selecionados, três linhas");
  assert.equal(new Set(tres).size, tres.length, "R · o lote não duplica artigo");
});

/* ================================ §16 ================================ */

test("§16 · a paridade é estrutural — envio e export usam a mesma resolução", async () => {
  const envio = await readFile(new URL("../lib/server/radar-planner-send.ts", import.meta.url), "utf8");

  /*
   * Isto é o que torna §16 impossível de quebrar por descuido: não há duas
   * cadeias para comparar. Um `observedAt` diferente já bastaria para o hash
   * divergir, e o artigo chegaria ao Redator com evidência de outra rodada.
   */
  assert.match(envio, /resolveRadarCanonicalDossier\(\{/);
  assert.equal(/buildRadarEvidenceBundleFromAnalysis\(\{/.test(envio), false, "o envio não remonta o dossiê");
  assert.equal(/radarCompetitiveBlueprintViewOfAnalysis\(\{/.test(envio), false, "nem o blueprint");

  /*
   * E O INSTANTE É O DA OPERAÇÃO, não `new Date()` no meio da resolução.
   *
   * `observedAt` entra no conteúdo consolidado, e o hash do dossiê sai dele.
   * Um relógio lido dentro da resolução produziria um bundleHash diferente a
   * cada chamada — e o mesmo artigo, enviado e exportado, chegaria ao Redator
   * com duas identidades de evidência.
   */
  assert.match(envio, /resolveRadarCanonicalDossier\(\{ analysis: corrente, article, observedAt: entrada\.sentAt, authorities: autoridades \}\)/);

  /*
   * PARITY_1 · §2 · E AS AUTORIDADES SÃO AS MESMAS QUE O EXPORT LÊ.
   *
   * O envio passou a carregar a fotografia do Google, a biblioteca de vídeos e
   * o especialista. Antes disso, o mesmo artigo saía completo num CSV que vai
   * para FORA da plataforma e incompleto no pacote que alimenta o módulo
   * seguinte DELA.
   */
  assert.match(envio, /portas\.loadCanonicalAuthorities\(\{/);

  const canonico = await readFile(new URL("../lib/server/radar-canonical-dossier.ts", import.meta.url), "utf8");
  const semComentarios = canonico.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
  assert.equal(/new Date\(\)/.test(semComentarios), false, "a resolução lê o relógio e o hash deixa de ser estável");
  assert.match(semComentarios, /observedAt: entrada\.observedAt/, "o instante vem de quem chamou");
});

/* ============================== F, G e H ============================== */

test("F, G e H · o brief carrega MUST_COVER, limitações e dependências", () => {
  const brief = linhaComercial().writer_brief_md;

  /* F · MUST_COVER é o contrato do Arquiteto e ele viaja inteiro. */
  assert.match(brief, /Obrigatório cobrir:/);
  for (const topico of ["tipos de sérum", "como escolher por necessidade"]) {
    assert.ok(brief.includes(topico), `F · MUST_COVER perdido: ${topico}`);
  }

  /* G · as limitações da coleta e do modelo, juntas. */
  assert.match(brief, /# LIMITAÇÕES/);
  assert.ok(brief.includes("não traz texto de avaliação"), "G · limitação da coleta");
  assert.ok(brief.includes("PDP não foram lidos"), "G · limitação do modelo");

  /* H · e as dependências de evidência aparecem por seção. */
  const comDependencia = linhaComercial({
    profileModel: modeloComercial({
      blocks: [{
        ...modeloComercial().blocks[0],
        sourceNeeded: "Fonte institucional sobre concentração de Q10.",
        specialistRequired: "Revisão dermatológica antes de publicar.",
      }],
      evidenceNeeds: ["Fonte institucional sobre concentração de Q10."],
      specialistNeeds: ["Revisão dermatológica antes de publicar."],
    }),
  }).writer_brief_md;

  assert.match(comDependencia, /# FONTES E EVIDÊNCIAS/);
  assert.ok(comDependencia.includes("Fonte institucional sobre concentração de Q10"), "H · a dependência aparece no brief");
  assert.ok(comDependencia.includes("Revisão dermatológica antes de publicar"));

  /* E as regras de redação fecham o contrato. */
  assert.match(brief, /# REGRAS PARA O REDATOR/);
  assert.ok(brief.includes("não inventar evidência"));
  assert.ok(brief.includes("cumprir tudo o que está em MUST_COVER"));
});

/* ============================== I, J, K, L e M ============================== */

test("I, J e K · cada perfil exporta o blueprint dele", () => {
  assert.equal(RADAR_EXPORT_BLUEPRINT_TYPE.GOOGLE, "EDITORIAL");
  assert.equal(RADAR_EXPORT_BLUEPRINT_TYPE.YOUTUBE, "AUDIOVISUAL");
  assert.equal(RADAR_EXPORT_BLUEPRINT_TYPE.AMAZON, "COMMERCIAL");

  /* K · o comercial traz as colunas comerciais. */
  const amazon = linhaComercial();
  assert.ok("promotion_links_json" in amazon);
  assert.ok("commercial_plan_md" in amazon);

  /* J · o audiovisual traz as dele, e nenhuma coluna comercial. */
  const youtube = buildRadarPortableExportRow({
    profile: "YOUTUBE",
    blueprintView: { blueprint: null, sample: { label: "vídeo(s)", count: 38 } } as never,
    exportedAt: "2026-09-17T12:00:00.000Z",
    article: artigoDoExport(),
    profileModel: modeloComercial({ kind: "VIDEO", profile: "YOUTUBE", promotionLinks: [], affiliateDisclosureRequired: false, hook: "Abra pela dúvida" }),
  });
  assert.equal(youtube.research_profile, "YOUTUBE");
  assert.equal("promotion_links_json" in youtube, false, "coluna comercial num artigo de vídeo");
  assert.equal("commercial_plan_md" in youtube, false);
});

test("L e M · shortlist 6 vira 6 links, e nenhuma tag de afiliado aparece", () => {
  const seis = Array.from({ length: 6 }, (_, indice) => ({
    ...modeloComercial().promotionLinks[0],
    asin: `B0TESTE${indice}0`,
    productName: `Produto ${indice + 1}`,
  }));
  const linha = linhaComercial({
    profileModel: modeloComercial({ promotionLinks: seis }),
    commercial: { ...comercialDoExport(), links: seis, products: seis.map(item => ({ asin: item.asin, productName: item.productName })) },
  });

  /* L · o número dos links é o da shortlist. */
  assert.equal(JSON.parse(linha.promotion_links_json).length, 6);
  assert.equal(JSON.parse(linha.selected_products_json).length, 6);
  assert.match(linha.commercial_plan_md, /6 entraram no artigo/);

  /*
   * M · O RADAR NÃO CRIA TAG DE AFILIADO — nem no CSV.
   *
   * O export é o lugar mais fácil de "ajudar" acrescentando a tag na URL. Quem
   * troca o endereço é a publicação, e o ASIN atravessa a troca intacto.
   */
  const inteiro = radarPortableExportCsv([linha]);
  for (const marca of ["tag=", "linkCode", "ascsubtag", "associate-"]) {
    assert.equal(inteiro.includes(marca), false, `M · ${marca} apareceu no CSV`);
  }
  assert.match(linha.promotion_links_json, /sponsored nofollow/);
  assert.match(linha.commercial_plan_md, /aviso de afiliado é obrigatório/);
});

/* ============================== N e §10 ============================== */

test("N · nada de payload cru do provider no CSV", () => {
  const csv = radarPortableExportCsv([linhaComercial()]);

  /*
   * O CSV é dossiê de escrita, não backup. Um universo de 59 produtos, HTML de
   * página ou resposta de provider fariam o arquivo pesar e o leitor se perder
   * — e a evidência crua continua na proveniência, onde ela é auditada.
   */
  for (const proibido of ["status_code", "<html", "se_results_count", "sspa/click", "dib=", "items_count", "check_url"]) {
    assert.equal(csv.includes(proibido), false, `N · payload cru no CSV: ${proibido}`);
  }

  /* E o que DEVE estar continua lá. */
  assert.ok(csv.includes("writer_brief_md"));
  assert.ok(csv.includes("sérum nivea"), "o acento sobrevive");
});

/* ================================ O e P ================================ */

test("O · o CSV sobrevive a quebra de linha, aspas, vírgula e JSON", () => {
  const dificil: RadarPortableExportRow = {
    simples: "sem nada de especial",
    com_virgula: "a, b, c",
    com_aspas: 'ele disse "isso aqui"',
    com_quebra: "linha 1\nlinha 2\r\nlinha 3",
    com_json: JSON.stringify([{ heading: 'Seção "difícil", com vírgula', pontos: ["um", "dois"] }]),
    markdown: "# Título\n\n- item\n- outro\n",
  };

  const csv = radarPortableExportCsv([dificil]);

  /* Tudo citado: não há caso especial para esquecer. */
  assert.match(csv, /^﻿"simples","com_virgula"/);
  assert.ok(csv.includes('"ele disse ""isso aqui"""'), "aspas internas duplicadas");
  assert.ok(csv.includes("linha 1\nlinha 2"), "a quebra de linha vive dentro da célula");

  /*
   * A PROVA REAL É A VOLTA: um parser de CSV honesto precisa devolver
   * exatamente o que entrou. Contar aspas não prova nada.
   */
  const volta = lerCsv(csv);
  assert.equal(volta.length, 2, "cabeçalho e uma linha");
  assert.deepEqual(volta[0], Object.keys(dificil));
  assert.deepEqual(volta[1], Object.values(dificil));

  /* E o JSON continua sendo JSON depois do round-trip. */
  const indice = volta[0].indexOf("com_json");
  assert.deepEqual(JSON.parse(volta[1][indice]), JSON.parse(dificil.com_json));
});

test("§18 · um lote com perfis diferentes não perde as colunas de nenhum", () => {
  /*
   * O CASO QUE UM ARQUIVO SÓ PRECISA SUPORTAR.
   *
   * Um lote real mistura Google, YouTube e Amazon. Usar as colunas da PRIMEIRA
   * linha deixaria as comerciais de fora do arquivo inteiro quando o primeiro
   * artigo fosse de texto — e os links de produto sumiriam sem erro nenhum.
   */
  const google = buildRadarPortableExportRow({
    profile: "GOOGLE",
    blueprintView: { blueprint: null, sample: { label: "página(s)", count: 11 } } as never,
    exportedAt: "2026-09-17T12:00:00.000Z",
    article: artigoDoExport({ slug: "artigo-google" }),
  });
  const amazon = linhaComercial();

  const csv = radarPortableExportCsv([google, amazon]);
  const cabecalho = lerCsv(csv)[0];

  for (const coluna of ["outline_md", "promotion_links_json", "commercial_plan_md", "selected_products_json"]) {
    assert.ok(cabecalho.includes(coluna), `§18 · coluna perdida no lote misto: ${coluna}`);
  }

  /* E cada linha preenche só o que lhe cabe — sem inventar o resto. */
  const linhas = lerCsv(csv);
  const daAmazon = linhas[2][cabecalho.indexOf("promotion_links_json")];
  const doGoogle = linhas[1][cabecalho.indexOf("promotion_links_json")];
  assert.ok(daAmazon.length > 2, "o artigo comercial traz os links");
  assert.equal(doGoogle, "", "e o artigo de texto deixa a coluna vazia, não fabricada");
});

test("P · UTF-8 com BOM preserva acento", () => {
  const csv = radarPortableExportCsv([{ titulo: "Sérum antissinais · manutenção diária", nota: "ação" }]);
  assert.equal(csv.startsWith("﻿"), true, "o BOM abre o arquivo");
  assert.ok(csv.includes("Sérum antissinais · manutenção diária"));
  assert.ok(csv.includes("ação"));
});

/** Um leitor de CSV mínimo e honesto — RFC 4180. */
function lerCsv(texto: string): string[][] {
  const corpo = texto.replace(/^﻿/, "");
  const linhas: string[][] = [];
  let campo = "";
  let linha: string[] = [];
  let aspas = false;

  for (let indice = 0; indice < corpo.length; indice += 1) {
    const caractere = corpo[indice];
    if (aspas) {
      if (caractere === '"') {
        if (corpo[indice + 1] === '"') { campo += '"'; indice += 1; continue; }
        aspas = false; continue;
      }
      campo += caractere; continue;
    }
    if (caractere === '"') { aspas = true; continue; }
    if (caractere === ",") { linha.push(campo); campo = ""; continue; }
    if (caractere === "\r" && corpo[indice + 1] === "\n") {
      linha.push(campo); linhas.push(linha); linha = []; campo = ""; indice += 1; continue;
    }
    campo += caractere;
  }
  if (campo || linha.length) { linha.push(campo); linhas.push(linha); }
  return linhas;
}

/* ================================ §21 ================================ */

test("§21 · o nome do arquivo é sanitizado", () => {
  assert.equal(
    radarPortableExportFilename({ articles: [{ slug: "serum-nivea", keyword: null }], today: "2026-09-17" }),
    "radar-serum-nivea-dossie.csv",
  );

  /* Sem slug, a keyword serve — com acento e espaço tratados. */
  assert.equal(
    radarPortableExportFilename({ articles: [{ slug: null, keyword: "Sérum Nivea: qual escolher?" }], today: "2026-09-17" }),
    "radar-serum-nivea-qual-escolher-dossie.csv",
  );

  /* Vários artigos viram um arquivo datado. */
  assert.equal(
    radarPortableExportFilename({ articles: [{ slug: "a", keyword: null }, { slug: "b", keyword: null }], today: "2026-09-17T12:00:00.000Z" }),
    "radar-dossies-2026-09-17.csv",
  );
});

/* ================================ S ================================ */

test("S · o ArticleDNA não é mutado por nada deste caminho", async () => {
  const arquiteto = await readFile(new URL("../lib/arquiteto/contracts.ts", import.meta.url), "utf8");
  assert.equal(/writer_brief_md|portable-export/.test(arquiteto), false, "ARTICLE_DNA_MUTATED = NO");

  /* E o export não reconstrói campos do fundamento a partir de outra coisa. */
  const fonte = await readFile(new URL("../lib/radar/portable-read-model.ts", import.meta.url), "utf8");
  const semComentarios = fonte.replace(/\/\*[\s\S]*?\*\//g, " ");
  assert.equal(/requiredTopics:|principalKeywordId:|keywordReferences/.test(semComentarios), false,
    "S · o export remonta campos do ArticleDNA em vez de recebê-los resolvidos");
});

/* ============================== §17 e Q ============================== */

test("Q e §17 · nem o módulo nem a resolução chamam provider", async () => {
  for (const caminho of [
    "../lib/radar/portable-export.ts",
    "../lib/radar/portable-read-model.ts",
    "../lib/radar/portable-radiography.ts",
    "../lib/server/radar-canonical-dossier.ts",
  ]) {
    const fonte = await readFile(new URL(caminho, import.meta.url), "utf8");
    const semComentarios = fonte.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
    assert.equal(/fetch\(|dataforseo|executeDataForSeo/i.test(semComentarios), false, `${caminho} fala com provider`);
  }

  /* §17 · e cem artigos são cem leituras, não cem coletas. */
  const lote = Array.from({ length: 100 }, (_, indice) =>
    linhaComercial({ article: artigoDoExport({ slug: `artigo-${indice}` }) }));
  const slugs = slugsDoCsv(radarPortableExportCsv(lote));
  assert.equal(slugs.length, 100, "cem artigos, cem linhas");
  assert.equal(new Set(slugs).size, 100, "e nenhum repetido");
  assert.deepEqual(idasAoServidor, [], "nenhuma rede saiu montando o lote");
});

/* ================================ §20 ================================ */

test("§20 · nenhum segredo atravessa para o arquivo", () => {
  const csv = radarPortableExportCsv([linhaComercial()]);
  for (const segredo of ["SUPABASE_SERVICE_ROLE", "apikey", "Authorization", "Bearer ", "DATAFORSEO_LOGIN", "DATAFORSEO_PASSWORD", "telegram"]) {
    assert.equal(csv.toLowerCase().includes(segredo.toLowerCase()), false, `§20 · segredo no CSV: ${segredo}`);
  }
});

/* ============================== §3 · a UI ============================== */

test("§3 e §17 · sem seleção o escopo é a visão; com seleção, o selecionado", async () => {
  const pagina = await readFile(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8");
  const inicio = pagina.indexOf("const exportarDossiesFinalizados");
  const corpo = pagina.slice(inicio, inicio + 2000);

  assert.match(corpo, /const selecionados = \[\.\.\.selectedArticleIds\]/);
  assert.match(corpo, /selecionados\.length[\s\S]{0,80}pipeline\.radarItems/);
  assert.match(corpo, /"\/api\/editorial\/radar-export"/);
});

test("§1 · a rota resolve pelo caminho canônico e não chama provider", async () => {
  const rota = await readFile(new URL("../app/api/editorial/radar-export/route.ts", import.meta.url), "utf8");
  const semComentarios = rota.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

  assert.match(semComentarios, /resolveRadarCanonicalDossier\(\{/);
  assert.equal(/executeDataForSeo|collectDataForSeo|collectRadarGoogleSupport/.test(semComentarios), false,
    "Q · a exportação chama provider");

  /* §2 · e a recusa é por artigo, não por lote. */
  assert.match(semComentarios, /recusados\.push\(\{ articleId, code: canonico\.code/);
  assert.match(semComentarios, /\[\.\.\.new Set\(input\.articleIds\)\]/, "R · o mesmo artigo pedido duas vezes é um artigo");
});

test("PROVIDER_CALLS_ON_EXPORT = 0", () => {
  assert.deepEqual(idasAoServidor, [], `nenhuma rede deveria ter saído; houve: ${idasAoServidor.join(", ")}`);
});
