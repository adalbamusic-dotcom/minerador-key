import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { RADAR_WRITER_MAY_NOT } from "../lib/redator/writer-handoff.ts";
import { buildRadarPortableExportRow, radarPortableExportCsv } from "../lib/radar/portable-export.ts";
import { radarPortableExportRows, radarPortableExportSiloFiles } from "../lib/radar/portable-export-batch.ts";
import { planRadarSiloExport } from "../lib/radar/portable-silo-export.ts";
import {
  RADAR_WRITING_EXPORT_COLUMNS,
  RADAR_WRITING_EXPORT_LIMITS,
  buildRadarWritingExportArticle,
  radarWritingCleanUrl,
  radarWritingDecodeEntities,
  radarWritingExportBatchFilename,
  radarWritingExportCsv,
  radarWritingExportSiloFilename,
  radarWritingShareVisualAvoid,
  radarWritingSpreadsheetSafe,
  radarWritingTitleIsUsable,
  type RadarWritingArticleContext,
  type RadarWritingExportRow,
} from "../lib/radar/portable-writing-export.ts";
import { radarPortableWritingExport } from "../lib/radar/portable-writing-batch.ts";
import {
  RADAR_EXPORT_FILE_BYTES_PER_DOSSIER,
  RADAR_EXPORT_MODES,
  RADAR_EXPORT_WRITING_FILE_BYTES_PER_DOSSIER,
  radarExportModeOf,
  radarSiloExportEstimate,
  radarSiloExportSizeNotice,
} from "../lib/radar/portable-export-estimate.ts";
import { radarSiloExportNotice } from "../lib/radar/portable-silo-scope.ts";
import {
  ARTIGO,
  ARTIGO_AMAZON,
  ARTIGO_NAO_ENVIADO,
  ARTIGO_YOUTUBE,
  EXPORTADO_EM,
  HASH_DO_DNA,
  ID_DO_REGISTRO,
  KEYWORD,
  KEYWORD_SECUNDARIA,
  LEITURA_DAS_LENTES,
  MARCA,
  PUBLICACAO_SEM_POLITICA,
  SILO,
  URL_DE_TERCEIRO,
  UUID_DE_TERCEIRO,
  VERSAO,
  entradaAmazon,
  entradaGoogle,
  entradaGoogleSaude,
  entradaYoutube,
  montadasDoSilo,
  montadasDoSiloSaude,
  planoDoSilo,
} from "./radar-portable-writing-fixtures.mts";

/*
 * ===== O EXPORT "PARA ESCREVER" — 13 colunas, o que é preciso para escrever =====
 *
 * ==================== O PEDIDO ====================
 *
 * "não foi legal a exportação em csv, por que tem muitos dados de banco que
 * não aportam em nada para escrever o artigo (...) só tem que estar lá os dados
 * que são imprescindíveis". O formato novo é o padrão; o de antes continua
 * como "Completo (técnico)", byte a byte igual.
 *
 * ==================== O QUE ESTA SUÍTE GUARDA ====================
 *
 *   A · as 13 colunas fixas, a linha de topo e a ordem do silo;
 *   B · nenhuma coluna técnica, nenhum id, hash, data ISO ou código cru;
 *   C · as guardas: sem FAQ, dado de terceiros é pesquisa;
 *   D · o veredito primeiro, e a contradição DITA (invariante 30);
 *   E · a estrutura é sugestão e a medida é referência (invariante 32);
 *   F · o publicado (AGENTS §11) e o FAQ legado (AGENTS §13);
 *   G · a limpeza: entidades HTML, rastreio de URL, unigrama, fonte de menu;
 *   H · os links pelo silo e as decisões protegidas do Redator;
 *   I · os limites de célula e de artigo, e a célula que o Excel não executa;
 *   J · o modo técnico idêntico ao de antes (saída dourada);
 *   K · a tela e a pureza.
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

const semComentarios = (fonte: string) => fonte.replace(/\r\n/g, "\n").replace(/\{\/\*[\s\S]*?\*\/\}/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"])\/\/[^\n]*/g, "$1 ");

/* ============================ a leitura do CSV ============================ */

function lerCsv(csv: string): string[][] {
  const texto = csv.replace(/^﻿/, "");
  const linhas: string[][] = [];
  let campo = "";
  let linha: string[] = [];
  let aspas = false;
  for (let indice = 0; indice < texto.length; indice += 1) {
    const caractere = texto[indice];
    if (aspas) {
      if (caractere === "\"" && texto[indice + 1] === "\"") { campo += "\""; indice += 1; } else if (caractere === "\"") aspas = false; else campo += caractere;
    } else if (caractere === "\"") aspas = true;
    else if (caractere === ",") { linha.push(campo); campo = ""; } else if (caractere === "\r") { /* CRLF */ } else if (caractere === "\n") { linha.push(campo); linhas.push(linha); linha = []; campo = ""; } else campo += caractere;
  }
  return linhas;
}

const EXPORT_DO_SILO = () => radarPortableWritingExport({ articles: montadasDoSilo(), lenses: LEITURA_DAS_LENTES, plan: planoDoSilo(), today: EXPORTADO_EM });
const EXPORT_DO_SILO_SAUDE = (publicacao = false) => radarPortableWritingExport({
  articles: montadasDoSiloSaude(), lenses: LEITURA_DAS_LENTES, plan: planoDoSilo(), today: EXPORTADO_EM,
  publications: publicacao ? new Map([[ARTIGO, PUBLICACAO_SEM_POLITICA]]) : undefined,
});

const linhasDe = (csv: string) => {
  const [cabecalho, ...dados] = lerCsv(csv);
  return { cabecalho, dados: dados.map(valores => Object.fromEntries(cabecalho.map((coluna, indice) => [coluna, valores[indice] ?? ""])) as RadarWritingExportRow) };
};

const contextoAvulso = (extra: Partial<RadarWritingArticleContext> = {}): RadarWritingArticleContext => ({
  topRowLabel: "Marca", filePosition: 1, silo: null, articleId: ARTIGO, publication: null, ...extra,
});

/* ================================ A ================================ */

test("A · 13 colunas FIXAS, na ordem do desenho, em todo arquivo — com a linha de topo", () => {
  assert.deepEqual([...RADAR_WRITING_EXPORT_COLUMNS], [
    "ordem", "pode_escrever", "artigo", "promessa_e_leitor", "titulo_e_seo", "estrutura",
    "cobrir_e_superar", "serp_resumida", "fontes_e_especialista", "links_internos", "plano_visual", "produtos", "prompt",
  ]);

  const silo = EXPORT_DO_SILO();
  assert.equal(silo.files?.length, 1);
  const { cabecalho, dados } = linhasDe(silo.files![0].csv);
  assert.deepEqual(cabecalho, [...RADAR_WRITING_EXPORT_COLUMNS], "o cabeçalho do arquivo por silo mudou");
  assert.deepEqual(dados.map(linha => linha.ordem), ["Silo", "1 · Pilar", "2 · Suporte", "4 · Suporte"],
    "a linha de topo e depois os artigos, na posição do silo (o 3 ficou fora do arquivo)");
  assert.equal(silo.exported, 3);
  assert.equal(silo.blocked, 2, "Amazon sem produto e YouTube saem bloqueados");

  const avulso = radarPortableWritingExport({ articles: montadasDoSilo(), lenses: LEITURA_DAS_LENTES, plan: null, today: EXPORTADO_EM });
  const lido = linhasDe(avulso.csv || "");
  assert.deepEqual(lido.cabecalho, [...RADAR_WRITING_EXPORT_COLUMNS], "o avulso tem o MESMO cabeçalho");
  assert.deepEqual(lido.dados.map(linha => linha.ordem), ["Marca", "1 · Pilar", "2 · Suporte", "3 · Suporte"]);
  assert.equal(avulso.files, null);

  /* A codificação é a do formato completo: BOM, CRLF entre linhas, tudo entre aspas. */
  const csv = silo.files![0].csv;
  assert.ok(csv.startsWith("﻿\"ordem\",\"pode_escrever\""));
  assert.ok(csv.endsWith("\"\r\n"));
});

test("A · o cabeçalho é fixo: uma linha montada em outra ordem, ou sem uma chave, não muda o arquivo", () => {
  const linha = buildRadarWritingExportArticle(entradaGoogle(), contextoAvulso()).row;
  const invertida = Object.fromEntries(Object.entries(linha).reverse()) as RadarWritingExportRow;
  const semProdutos = { ...linha } as Partial<RadarWritingExportRow>;
  delete semProdutos.produtos;
  const cabecalho = RADAR_WRITING_EXPORT_COLUMNS.map(coluna => `"${coluna}"`).join(",");
  assert.equal(lerCsv(radarWritingExportCsv([invertida]))[0].join(","), RADAR_WRITING_EXPORT_COLUMNS.join(","));
  assert.equal(radarWritingExportCsv([invertida]), radarWritingExportCsv([linha]));
  assert.ok(radarWritingExportCsv([semProdutos as RadarWritingExportRow]).startsWith(`﻿${cabecalho}\r\n`));
  assert.equal(lerCsv(radarWritingExportCsv([semProdutos as RadarWritingExportRow]))[1].length, 13, "a célula ausente sai vazia, na posição dela");
});

test("A · artigo sem silo resolvido: arquivo próprio, linha 'Marca' no topo, sem ordem narrativa inventada", () => {
  const plano = planRadarSiloExport({
    today: EXPORTADO_EM, brandId: MARCA, siloVersions: [],
    items: [{ articleId: ARTIGO, siloId: "", status: "finalized", title: "Skincare facial passo a passo", principalKeyword: "skincare facial", slug: "skincare-facial" }],
  });
  const saida = radarPortableWritingExport({ articles: [montadasDoSilo()[0]], lenses: LEITURA_DAS_LENTES, plan: plano, today: EXPORTADO_EM });
  assert.equal(saida.files?.[0].filename, "sem-silo-para-escrever-2026-09-23.csv");
  const { dados } = linhasDe(saida.files![0].csv);
  assert.deepEqual(dados.map(linha => linha.ordem), ["Marca", "1 · Pilar"]);
  assert.match(dados[0].artigo, /^Artigos sem silo resolvido no Radar: escreva cada um sem pressupor ordem narrativa/);
  assert.equal(/Ordem narrativa/.test(dados[0].artigo), false);
  assert.match(dados[1].prompt, /linha "Marca" deste arquivo/);
});

test("A · a linha de topo do silo: ordem narrativa inteira, faltas ditas uma vez, e só as quatro colunas dela", () => {
  const { dados } = linhasDe(EXPORT_DO_SILO().files![0].csv);
  const topo = dados[0];
  assert.match(topo.artigo, /^Silo: Cuidados com a Pele/);
  assert.match(topo.artigo, /SiloPage: https:\/\/careglow\.com\.br\/cuidados-com-a-pele \(nova, ainda não publicada\)/);
  assert.match(topo.artigo, /3 · Suporte · máscara facial · \/mascara-facial · fora do arquivo \(não enviado ao Radar\)/,
    "o irmão fora do arquivo precisa estar na ordem, para os links resolverem");
  assert.match(topo.pode_escrever, /^Com ressalva: 3 de 4 artigos do Silo estão neste arquivo; 2 com bloqueio \("skin care nivea", "skin care noturno"\)\./);
  assert.match(topo.pode_escrever, /voz da marca, autor e revisor não fazem parte deste arquivo/);
  assert.match(topo.promessa_e_leitor, /^Marca: site careglow\.com\.br\./);
  assert.equal(/Pendente/i.test(topo.promessa_e_leitor), false, "o público 'Pendente de enriquecimento' atravessou");
  for (const coluna of ["titulo_e_seo", "estrutura", "cobrir_e_superar", "serp_resumida", "fontes_e_especialista", "links_internos", "plano_visual", "produtos"] as const) {
    assert.equal(topo[coluna], "", `a linha de topo não usa ${coluna}`);
  }
});

/* ================================ B ================================ */

const IDS_NOSSOS = [MARCA, ARTIGO, ARTIGO_AMAZON, ARTIGO_YOUTUBE, ARTIGO_NAO_ENVIADO, SILO, VERSAO, KEYWORD, KEYWORD_SECUNDARIA, HASH_DO_DNA, ID_DO_REGISTRO];

const PROIBIDO_NA_CELULA: Array<[RegExp, string]> = [
  [/sha256:/i, "hash"],
  [/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i, "UUID"],
  [/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, "instante ISO de coleta ou congelamento"],
  [/\b(GOOGLE|AMAZON|YOUTUBE|PILLAR_TO_SUPPORT|SUPPORT_TO_PILLAR|ARTICLE_TO_SILO_PAGE|TOP_BEST|TOP_VALUE|INFORMATIONAL|OUT_OF_SCOPE|ISOLATED|NAO_CLASSIFICADA|STRONG|MODERATE|DNA_REQUIRED)\b/, "código interno cru"],
  [/\bID\s*·\s*v\d+/, "rótulo de versão"],
  [/\b(versionId|contentHash|bundleHash|bundleId|sourceKey|articleId|keywordId|asin|videoId|collectedAt|frozenAt)\b/, "nome de campo técnico"],
  [/\b(page|concept|question|claim|section):[a-z0-9]/i, "endereço interno"],
  [/Pendente de enriquecimento|Não definido nesta fase|Ainda não definidos nesta fase/i, "texto de preenchimento"],
  [/dataforseo|provider/i, "provider"],
  [/srsltid|utm_|&amp;|&#\d+;|&[a-z]+;/i, "rastreio de URL ou entidade HTML"],
];

test("B · nenhuma coluna técnica: nada de _md, _json, research_profile ou exported_at", () => {
  for (const coluna of RADAR_WRITING_EXPORT_COLUMNS) {
    assert.equal(/_(md|json)$|^research_profile$|^exported_at$|^article_id$|^slug$/.test(coluna), false, `coluna técnica: ${coluna}`);
  }
});

test("B · nenhum id, hash, data ISO, código cru, preenchimento ou rastreio em NENHUMA célula", () => {
  const arquivos = [
    ...EXPORT_DO_SILO().files!.map(arquivo => arquivo.csv),
    ...EXPORT_DO_SILO_SAUDE(true).files!.map(arquivo => arquivo.csv),
    radarPortableWritingExport({ articles: montadasDoSilo(), lenses: LEITURA_DAS_LENTES, plan: null, today: EXPORTADO_EM }).csv || "",
  ];
  for (const csv of arquivos) {
    for (const linha of linhasDe(csv).dados) {
      for (const coluna of RADAR_WRITING_EXPORT_COLUMNS) {
        const celula = linha[coluna];
        for (const id of IDS_NOSSOS) assert.equal(celula.includes(id), false, `id interno em ${linha.ordem}/${coluna}: ${id}`);
        for (const [padrao, oQue] of PROIBIDO_NA_CELULA) {
          const achado = celula.match(padrao);
          assert.equal(achado, null, `${oQue} em ${linha.ordem}/${coluna}: ${achado?.[0]}`);
        }
      }
    }
  }
});

test("B · quando o PACOTE traz endereço interno, instante ISO ou código cru no texto, a célula não os carrega", () => {
  const google = entradaGoogle();
  const modelo = google.articleModel as unknown as { conclusion: Record<string, unknown> };
  const sujo = `Fechar pela resposta (question:c580aef1) do artigo ${ARTIGO}, sha256:${"b".repeat(64)}, observada em 2026-09-20T13:00:00.000Z pela relação PILLAR_TO_SUPPORT e INFORMATIONAL`;
  const linha = buildRadarWritingExportArticle(
    { ...google, articleModel: { ...modelo, conclusion: { ...modelo.conclusion, synthesis: sujo } } as never },
    contextoAvulso(),
  ).row;
  assert.match(linha.promessa_e_leitor, /^Promessa: /);
  assert.match(linha.promessa_e_leitor, /Fechamento: Fechar pela resposta do artigo, observada em pela relação Pilar → Suporte e Informacional\./,
    "o endereço, o UUID, o hash e o instante saem; o código vira rótulo");
  for (const [padrao, oQue] of PROIBIDO_NA_CELULA) {
    for (const coluna of RADAR_WRITING_EXPORT_COLUMNS) assert.equal(linha[coluna].match(padrao), null, `${oQue} em ${coluna}`);
  }
});

test("B · a URL de terceiro perde o rastreio e mantém o caminho — inclusive o UUID dela", () => {
  const limpa = radarWritingCleanUrl(URL_DE_TERCEIRO);
  assert.ok(limpa.includes(UUID_DE_TERCEIRO), "o caminho do concorrente foi alterado");
  assert.equal(/srsltid|utm_|&amp;/.test(limpa), false, limpa);
  assert.equal(radarWritingCleanUrl("https://www.amazon.com.br/dp/B0DBRR5BP4?tag=loja-20&ref=sr_1_1"), "https://www.amazon.com.br/dp/B0DBRR5BP4");
  assert.equal(radarWritingCleanUrl("https://www.youtube.com/watch?v=q40agCwCsdk&pp=ygUY"), "https://www.youtube.com/watch?v=q40agCwCsdk");
  assert.equal(radarWritingDecodeEntities("COMO &Eacute; A PELE OLEOSA? 6 &#8211; Manter &amp;amp; ANTIBI&Oacute;TICOS"), "COMO É A PELE OLEOSA? 6 – Manter & ANTIBIÓTICOS");
});

/* ================================ C ================================ */

test("C · as guardas no topo e em cada artigo: sem FAQ, e dado de terceiros é pesquisa", () => {
  const { dados } = linhasDe(EXPORT_DO_SILO_SAUDE().files![0].csv);
  const [topo, pilar] = dados;
  assert.match(topo.prompt, /^Regras gerais/);
  assert.match(topo.prompt, /Sem seção de perguntas frequentes \(FAQ\)/);
  assert.match(topo.prompt, /Dado de terceiros é pesquisa: não copie frases, títulos, trechos, transcrições nem avaliações/);
  assert.match(topo.prompt, /Conflito entre fonte factual e o que o mercado repete fica escrito dos dois lados/);
  assert.match(pilar.serp_resumida, /^Referência de pesquisa, não conteúdo a copiar/);
  assert.match(pilar.prompt, /sem seção de perguntas frequentes/);
  assert.match(pilar.prompt, /não copie frases nem títulos/);
  assert.match(pilar.prompt, /linha "Silo" deste arquivo/);

  /* As lentes: o cache sai rotulado como fora do pacote; sem leitura, a falta é dita, nunca um consenso inventado. */
  assert.match(pilar.serp_resumida, /Lentes \(cache da marca, fora do pacote, observado a partir de 22\/09\/2026; 2 de 4 observadas\)/);
  const semLentes = buildRadarWritingExportArticle(entradaGoogle(), contextoAvulso()).row;
  assert.match(semLentes.serp_resumida, /^Lentes: não conferidas neste pacote; o topo acima é da coleta principal\.$/m);

  /* Trecho de terceiro: no máximo 160 caracteres, entre aspas tipográficas. */
  for (const trecho of pilar.serp_resumida.matchAll(/“([^”]*)”/g)) {
    assert.ok(trecho[1].length <= RADAR_WRITING_EXPORT_LIMITS.thirdPartyExcerptChars, `trecho de terceiro longo demais: ${trecho[1].length}`);
  }
});

test("C · sem FAQ: a seção de perguntas frequentes do modelo fica de fora, e nada propõe uma", () => {
  const { dados } = linhasDe(EXPORT_DO_SILO_SAUDE().files![0].csv);
  for (const linha of dados.slice(1)) {
    assert.equal(/^#{2,3} .*(perguntas frequentes|\bfaq\b|dúvidas frequentes)/im.test(linha.estrutura), false, `${linha.ordem}: a estrutura propõe FAQ`);
    for (const coluna of RADAR_WRITING_EXPORT_COLUMNS) {
      assert.equal(/(criar|incluir|adicionar|acrescentar) (uma )?(seção de )?(faq|perguntas frequentes)/i.test(linha[coluna]), false, `${linha.ordem}/${coluna} sugere FAQ`);
    }
  }
  assert.match(dados[1].estrutura, /A seção de perguntas frequentes do modelo ficou de fora \(sem FAQ\)/);
  assert.match(dados[1].cobrir_e_superar, /Perguntas a responder dentro das seções \(sem seção de perguntas frequentes\):/);
});

/* ================================ D ================================ */

test("D · o veredito vem logo depois da ordem: Não para o comercial sem produto e para o roteiro de vídeo", () => {
  const { dados } = linhasDe(EXPORT_DO_SILO().files![0].csv);
  const [, pilar, amazon, youtube] = dados;
  assert.equal(RADAR_WRITING_EXPORT_COLUMNS.indexOf("pode_escrever"), 1);
  assert.match(amazon.pode_escrever, /^Não: formato Top melhores produtos · lista comparativa de 6 produtos, mas nenhum produto foi selecionado \(48 observados, 0 compatíveis com o alvo\); não há lista a construir\./);
  assert.match(amazon.produtos, /Produtos selecionados: nenhum produto selecionado/);
  assert.match(amazon.prompt, /^Não escreva este artigo antes de resolver o bloqueio/);
  assert.match(youtube.pode_escrever, /^Não: a investigação deste artigo foi feita para vídeo do YouTube/);
  assert.match(pilar.pode_escrever, /^Com ressalva: título de trabalho do pacote não utilizável/);
  assert.equal(/PRONTO PARA O REDATOR|suficiente: sim|BLOQUEADO PARA O REDATOR/.test(dados.map(linha => linha.pode_escrever).join("\n")), false, "status de pipeline no veredito");
  assert.equal(pilar.produtos, "", "produtos só em formato comercial");
});

test("D · a contradição do pacote é DITA, e não resolvida: YMYL 'baixa' com afirmação sensível sem fonte", () => {
  const pilar = linhasDe(EXPORT_DO_SILO_SAUDE().files![0].csv).dados[1];
  assert.match(pilar.pode_escrever, /^Com ressalva: o pacote registra YMYL baixa e também uma afirmação sensível que pede fonte \("O que causa acne"\); trate como tema sensível até o Radar resolver\./);
  assert.match(pilar.fontes_e_especialista, /^YMYL: baixa/, "o valor gravado continua dito como gravado");
  assert.match(pilar.fontes_e_especialista, /Conflito no pacote: o pacote registra YMYL baixa/);
  assert.match(pilar.fontes_e_especialista, /Não afirmar como fato sem fonte:\n- "O que causa acne" \(3 de 12 páginas tratam; sem fonte adequada\)/);
  assert.match(pilar.estrutura, /Precisa de fonte: a afirmação central \("O que causa acne\?"\) só entra com uma das fontes listadas/);
});

test("D · a contribuição ACEITA do especialista não some: sai com o aviso de que responde outra coisa", () => {
  const pilar = linhasDe(EXPORT_DO_SILO_SAUDE().files![0].csv).dados[1];
  assert.match(pilar.fontes_e_especialista, /E1 · Pergunta: "O que causa acne" · Resposta aprovada: "Todo mundo fala de protetor solar/);
  assert.match(pilar.fontes_e_especialista, /Atenção: aceita, mas a resposta não trata de "O que causa acne"; conferir antes de usar; sem ponto de aplicação definido/);
  assert.match(pilar.pode_escrever, /especialista E1: aceita, mas a resposta não trata|- Também: .*especialista E1/);
});

/* ================================ E ================================ */

test("E · invariante 32: a estrutura é ordem SUGERIDA e a medida dos concorrentes é referência, nunca meta", () => {
  const { dados } = linhasDe(EXPORT_DO_SILO().files![0].csv);
  const pilar = dados[1];
  assert.match(pilar.estrutura, /^Ordem sugerida: a estrutura final e a extensão são decisão do Planejador\./);
  assert.match(pilar.estrutura, /Referência da SERP, não meta: os concorrentes comparáveis têm mediana de [\d.]+ palavras/);
  for (const linha of dados) {
    const tudo = RADAR_WRITING_EXPORT_COLUMNS.map(coluna => linha[coluna]).join("\n");
    assert.equal(/~\s?\d+ palavras|\d+ H2\b|com as extensões indicadas|palavras por seção/i.test(tudo), false, `${linha.ordem}: meta de extensão ou de H2 imposta`);
  }
  assert.match(pilar.prompt, /a estrutura final e a extensão são decisão do Planejador/);
});

test("E · o título gravado sai como foi, ou é omitido com o motivo — nunca reescrito", () => {
  assert.equal(radarWritingTitleIsUsable("Como cuidar de uma pele oleosa: pele oleosa e acne e skincare para pele oleosa: como fazer para controlar brilho e acne", "skincare para pele oleosa"), false);
  assert.equal(radarWritingTitleIsUsable("Skincare facial: o que fazer na prática", "skincare facial"), true);
  assert.equal(radarWritingTitleIsUsable("6 skin care nivea para comparar", "skin care nivea"), true);
  const { dados } = linhasDe(EXPORT_DO_SILO().files![0].csv);
  assert.match(dados[1].titulo_e_seo, /^H1 de trabalho: não definido — formule a partir da promessa e da estrutura/);
  assert.match(dados[1].titulo_e_seo, /Alternativas: Skincare facial: o que fazer na prática/);
  assert.match(dados[2].titulo_e_seo, /^H1 de trabalho: 6 skin care nivea para comparar/);
});

/* ================================ F ================================ */

test("F · artigo publicado: URL, canonical e o estado da principal SEMPRE — o desconhecido também", () => {
  const pilar = linhasDe(EXPORT_DO_SILO_SAUDE(true).files![0].csv).dados[1];
  assert.match(pilar.artigo, /Publicado: https:\/\/careglow\.com\.br\/skincare-facial — preservar URL, slug e canonical/);
  assert.match(pilar.artigo, /Canonical: https:\/\/careglow\.com\.br\/skincare-facial/);
  assert.match(pilar.artigo, /Principal: estado desconhecido — não trocar até decisão humana/);
  assert.match(pilar.artigo, /Não altere: .*a URL publicada\./);
  assert.match(pilar.pode_escrever, /estrutura publicada atual indisponível: trate como atualização, preservando URL, slug, canonical e as seções existentes/);
  /* FAQ legado: a linha do prompt é OBRIGATÓRIA no publicado. */
  assert.match(pilar.prompt, /Mantenha a seção de perguntas existente, se a página tiver uma; não amplie nem remova\./);

  const travada = buildRadarWritingExportArticle(entradaGoogle(), contextoAvulso({ publication: { ...PUBLICACAO_SEM_POLITICA, principalPolicy: "locked" } })).row;
  assert.match(travada.artigo, /Principal: travada — não trocar/);
  assert.equal(/estado desconhecido/.test(travada.artigo + travada.pode_escrever), false);

  const nova = buildRadarWritingExportArticle(entradaGoogle(), contextoAvulso()).row;
  assert.equal(/Publicado:|Principal:|perguntas existente/.test(nova.artigo + nova.prompt), false, "artigo novo não tem aviso de publicado");
});

/* ================================ G ================================ */

test("G · limpeza: pergunta duplicada por caixa e entidade vira uma, isolada e fora do escopo não entram", () => {
  const pilar = linhasDe(EXPORT_DO_SILO_SAUDE().files![0].csv).dados[1];
  const perguntas = pilar.cobrir_e_superar.split("\n").filter(linha => /pele oleosa\?/i.test(linha));
  assert.equal(perguntas.length, 1, `a mesma pergunta saiu duas vezes: ${perguntas.join(" | ")}`);
  assert.equal(/COMO É|&Eacute;|QUAIS SÃO/.test(pilar.cobrir_e_superar), false);
  assert.match(pilar.cobrir_e_superar, /^- Quais são os tipos de acne\?/m, "a pergunta em caixa alta de cabeçalho vira frase");
  assert.equal(/Cabelo virgem/.test(pilar.cobrir_e_superar), false, "pergunta isolada atravessou");
  assert.match(pilar.cobrir_e_superar, /Não cobrir:\n- "As melhores ofertas de skincare": A intenção declarada é Informacional; este assunto pertence a uma intenção comercial\./);
  /* A lacuna de 1 página achada por keyword auxiliar não é instrução. */
  assert.equal(/Manter a pele limpa/.test(pilar.cobrir_e_superar), false);
  assert.match(pilar.cobrir_e_superar, /\[RELATO DA MARCA — preencher\]/);
});

test("G · termos: nunca unigrama cru nem palavra de menu; com menos de cinco válidos, a linha some", () => {
  const pilar = linhasDe(EXPORT_DO_SILO_SAUDE().files![0].csv).dados[1];
  assert.equal(/\bvoce\b|\bnossos\b|\baqui\b/.test(pilar.cobrir_e_superar), false, "palavra de menu virou termo");
  assert.equal(/Termos e temas a nomear/.test(pilar.cobrir_e_superar), false, "a linha de termos saiu com menos de cinco válidos");
});

test("G · fontes: a de menu não classificada fica fora, a científica sai limpa e rotulada como não verificada", () => {
  const pilar = linhasDe(EXPORT_DO_SILO_SAUDE().files![0].csv).dados[1];
  assert.equal(/wa\.me|WhatsApp/.test(pilar.fontes_e_especialista), false);
  assert.match(pilar.fontes_e_especialista, /Citadas pelo mercado, não verificadas \(conferir antes de citar\):\n- pmc\.ncbi\.nlm\.nih\.gov — https:\/\/pmc\.ncbi\.nlm\.nih\.gov\/articles\/PMC9311318\/ \(/);
  assert.match(pilar.fontes_e_especialista, /Fontes verificadas: nenhuma nesta investigação\./);
});

test("G · plano visual: uma capa e até três respiros, e ALT de preenchimento não atravessa", () => {
  const { dados } = linhasDe(EXPORT_DO_SILO().files![0].csv);
  const comPlano = dados.slice(1).filter(linha => linha.plano_visual);
  assert.ok(comPlano.length >= 2, "as linhas que servem para escrever trazem o plano visual");
  for (const linha of comPlano) {
    assert.match(linha.plano_visual, /^Plano visual do pacote \(o Planejador confirma\): uma capa e [0-3] respiro\(s\)\./);
    assert.equal(/ALT: (Ao final|Cobrir com clareza|Reunir o que|Declarar o critério|Capturar a intenção)/.test(linha.plano_visual), false, `${linha.ordem}: ALT de preenchimento`);
    assert.equal(/legenda: (Bloco comercial|Gancho)\b/.test(linha.plano_visual), false);
  }
});

/* ================================ H ================================ */

test("H · links pelo silo: destino pelo slug do irmão, SiloPage, e o rótulo L aparece na seção", () => {
  const pilar = linhasDe(EXPORT_DO_SILO_SAUDE().files![0].csv).dados[1];
  assert.match(pilar.links_internos, /L1 · âncora "skin care noturno" → Suporte "skin care noturno" → \/skin-care-noturno/);
  assert.match(pilar.links_internos, /âncora "produtos nivea para a pele" → Suporte "skin care nivea" → \/skin-care-nivea/);
  assert.match(pilar.links_internos, /âncora "guia de cuidados com a pele" → SiloPage "Cuidados com a Pele" → https:\/\/careglow\.com\.br\/cuidados-com-a-pele/);
  assert.match(pilar.links_internos, /âncora "cuidados com máscara facial" \(ou "máscara facial de skincare"\) → Suporte "máscara facial" → \/mascara-facial/,
    "âncora alternativa é texto, e não lugar");
  assert.equal(/onde: âncoras alternativas/.test(pilar.links_internos), false);
  assert.match(pilar.links_internos, /Pilar → Suporte/);
  assert.match(pilar.estrutura, /## Como montar a rotina de skincare facial no dia a dia\?[\s\S]*?- Links: L1\./);
  assert.equal(/territory|node|article-candidate/.test(pilar.links_internos), false);
});

test("H · as decisões protegidas são as do Redator (RADAR_WRITER_MAY_NOT), todas", () => {
  const pilar = buildRadarWritingExportArticle(entradaGoogle(), contextoAvulso()).row;
  const naoAltere = pilar.artigo.split("\n").find(linha => linha.startsWith("Não altere:")) || "";
  const esperado: Record<string, RegExp> = {
    "trocar a keyword principal": /a keyword principal/,
    "reconfigurar o Silo": /a configuração do Silo/,
    "remover uma cobertura obrigatória": /a cobertura obrigatória/,
    "alterar a intenção declarada do artigo": /a intenção declarada/,
    "alterar slug protegido": /o slug/,
    "alterar canonical protegido": /o canonical/,
    "substituir a composição de secundárias por decisão própria": /a composição de keywords complementares/,
  };
  for (const proibicao of RADAR_WRITER_MAY_NOT) {
    assert.ok(esperado[proibicao], `proibição nova do Redator sem tradução no teste: ${proibicao}`);
    assert.match(naoAltere, esperado[proibicao], `falta no "Não altere": ${proibicao}`);
  }
  assert.match(naoAltere, /o papel no Silo/);
});

/* ================================ I ================================ */

test("I · limites: célula até 6 mil (estrutura até 8 mil), artigo até 20 mil — cortando primeiro a SERP, e dizendo", () => {
  const base = entradaGoogleSaude();
  const modelo = base.articleModel as unknown as { sections: Array<Record<string, unknown>> };
  const secaoLonga = modelo.sections[0];
  const observado = base.googleObserved as unknown as Record<string, unknown> & { internalLinkPlan: Record<string, unknown> };
  const inflado = {
    ...base,
    articleModel: { ...modelo, sections: Array.from({ length: 120 }, (_, indice) => ({ ...secaoLonga, id: `s${indice}`, headingSuggestion: `Seção ${indice} com um cabeçalho comprido o bastante para pesar na célula`, childSections: [] })) } as never,
    googleObserved: {
      ...observado,
      internalLinkPlan: {
        ...observado.internalLinkPlan,
        outgoing: Array.from({ length: 80 }, (_, indice) => ({
          nodeId: `n${indice}`, slug: `destino-${indice}`, approvedAnchorConcepts: [`âncora ${indice}`], relationTypes: ["PILLAR_TO_SUPPORT"], targetRole: "support",
          anchor: { recommendedAnchor: `âncora número ${indice} com texto` }, preferredContexts: [`Contexto ${indice} de aplicação do link, longo o bastante`], distribution: [], reason: "motivo",
        })),
      },
    } as never,
    specialistContext: {
      ...base.specialistContext!,
      items: Array.from({ length: 40 }, () => base.specialistContext!.items[0]),
    },
  };
  inflado.dossierGaps = base.dossierGaps ? { ...base.dossierGaps, observed: inflado.googleObserved as never } : null;
  const linha = buildRadarWritingExportArticle(inflado, contextoAvulso()).row;
  const total = RADAR_WRITING_EXPORT_COLUMNS.reduce((soma, coluna) => soma + linha[coluna].length, 0);
  for (const coluna of RADAR_WRITING_EXPORT_COLUMNS) {
    const limite = coluna === "estrutura" ? RADAR_WRITING_EXPORT_LIMITS.structureChars : RADAR_WRITING_EXPORT_LIMITS.cellChars;
    assert.ok(linha[coluna].length <= limite, `${coluna}: ${linha[coluna].length} > ${limite}`);
  }
  assert.ok(total <= RADAR_WRITING_EXPORT_LIMITS.articleChars, `artigo com ${total} caracteres`);
  assert.match(linha.estrutura, /\[…\] Célula cortada no limite de 8\.000 caracteres\.$/);
  assert.match(linha.serp_resumida, /Cortado para o artigo caber em 20\.000 caracteres\./, "a SERP resumida é a primeira a ser cortada");
  for (const coluna of ["ordem", "pode_escrever", "artigo", "prompt"] as const) {
    assert.equal(/Cortado para o artigo caber/.test(linha[coluna]), false, `${coluna} nunca é cortada`);
  }
  assert.ok(RADAR_WRITING_EXPORT_LIMITS.foundationsBytes >= 24_000, "o teto do artigo é o dos fundamentos do Redator");
});

test("I · nenhuma célula começa com =, +, - ou @: o Excel não a executa como fórmula", () => {
  assert.equal(radarWritingSpreadsheetSafe("- item"), "'- item");
  assert.equal(radarWritingSpreadsheetSafe("=HYPERLINK(\"x\")"), "'=HYPERLINK(\"x\")");
  assert.equal(radarWritingSpreadsheetSafe("@soma"), "'@soma");
  assert.equal(radarWritingSpreadsheetSafe("Keyword principal: x"), "Keyword principal: x");
  const perigosa = buildRadarWritingExportArticle(entradaGoogle({ article: { ...entradaGoogle().article, principalKeyword: "=cmd|' /C calc'!A0" } }), contextoAvulso()).row;
  for (const coluna of RADAR_WRITING_EXPORT_COLUMNS) assert.equal(/^[=+\-@]/.test(perigosa[coluna]), false, `${coluna} começa com fórmula`);
  for (const csv of [...EXPORT_DO_SILO().files!.map(arquivo => arquivo.csv), ...EXPORT_DO_SILO_SAUDE(true).files!.map(arquivo => arquivo.csv)]) {
    for (const linha of lerCsv(csv)) for (const celula of linha) assert.equal(/^[=+\-@]/.test(celula), false, `célula começa com fórmula: ${celula.slice(0, 40)}`);
  }
});

test("I · o tamanho: ~10 mil caracteres por artigo, contra ~60 mil do formato completo na mesma bancada", () => {
  const escrita = EXPORT_DO_SILO().files![0].csv;
  const completo = radarPortableExportSiloFiles({ plan: planoDoSilo(), rowsByArticleId: radarPortableExportRows({ articles: montadasDoSilo(), lenses: LEITURA_DAS_LENTES, plan: planoDoSilo() }) })[0].csv;
  const { dados } = linhasDe(escrita);
  for (const linha of dados.slice(1)) {
    const total = RADAR_WRITING_EXPORT_COLUMNS.reduce((soma, coluna) => soma + linha[coluna].length, 0);
    assert.ok(total <= RADAR_WRITING_EXPORT_LIMITS.articleChars, `${linha.ordem}: ${total}`);
  }
  assert.ok(escrita.length * 5 < completo.length, `o formato para escrever (${escrita.length}) não ficou ao menos 5x menor que o completo (${completo.length})`);
});

/* ================================ J ================================ */

/*
 * A SAÍDA DOURADA DO FORMATO COMPLETO.
 *
 * Os hashes foram medidos na bancada ANTES de o formato "Para escrever"
 * existir (mesmas entradas, mesmo código do formato completo). Qualquer byte
 * diferente no modo técnico quebra aqui.
 */
const DOURADO = {
  avulso: { sha: "85083fd0f5046ff73b94414965c6953a93f0a1d2e4c910519e2258ed3607cdb1", len: 187094, cols: 56 },
  silo: { filename: "radar-silo-cuidados-com-a-pele-2026-09-23-parcial.csv", sha: "c59bf263da8e39b3bc8e2776225cf1c95f99ec5453bc1473fda450b33733160e", len: 197979, silo: "9fc0462897d04838489c2ae0bc4c65e38c57dd077ee26b1304a45d821345ca9f" },
  comProdutos: { sha: "282194de399f07166bbb91940abcdb4d27f31038ce1f0b30d97a572c59b83761", len: 32800 },
};
const sha = (texto: string) => createHash("sha256").update(texto).digest("hex");

test("J · o modo técnico é o de antes, byte a byte (saída dourada)", () => {
  const avulso = radarPortableExportRows({ articles: montadasDoSilo(), lenses: LEITURA_DAS_LENTES, plan: null });
  const csvAvulso = radarPortableExportCsv([...avulso.values()]);
  assert.equal(csvAvulso.length, DOURADO.avulso.len);
  assert.equal(Object.keys([...avulso.values()][0]).length, DOURADO.avulso.cols, "o número de colunas do formato completo mudou");
  assert.equal(sha(csvAvulso), DOURADO.avulso.sha, "o CSV avulso do formato completo mudou");

  const plano = planoDoSilo();
  const arquivos = radarPortableExportSiloFiles({ plan: plano, rowsByArticleId: radarPortableExportRows({ articles: montadasDoSilo(), lenses: LEITURA_DAS_LENTES, plan: plano }) });
  assert.equal(arquivos.length, 1);
  assert.equal(arquivos[0].filename, DOURADO.silo.filename);
  assert.equal(arquivos[0].csv.length, DOURADO.silo.len);
  assert.equal(sha(arquivos[0].csv), DOURADO.silo.sha, "o CSV por silo do formato completo mudou");
  assert.equal(sha(JSON.stringify(arquivos[0].silo)), DOURADO.silo.silo, "o resumo do arquivo por silo mudou");

  const comProdutos = radarPortableExportCsv([buildRadarPortableExportRow(entradaAmazon(true))]);
  assert.equal(sha(comProdutos), DOURADO.comProdutos.sha);
});

test("J · o campo estruturado novo do plano não entra no formato completo", () => {
  const plano = planoDoSilo();
  assert.ok(plano.files[0].writing, "o plano precisa carregar o silo em campos para o formato novo");
  assert.equal(plano.files[0].writing?.members.length, 4);
  const semCampo = { ...plano, files: plano.files.map(arquivo => ({ ...arquivo, writing: undefined })) };
  const linhas = radarPortableExportRows({ articles: montadasDoSilo(), lenses: LEITURA_DAS_LENTES, plan: plano });
  assert.equal(
    radarPortableExportSiloFiles({ plan: semCampo, rowsByArticleId: linhas })[0].csv,
    radarPortableExportSiloFiles({ plan: plano, rowsByArticleId: linhas })[0].csv,
  );
});

test("J · os nomes: 'para-escrever' no novo, e o do completo intocado", () => {
  assert.equal(EXPORT_DO_SILO().files![0].filename, "silo-cuidados-com-a-pele-para-escrever-2026-09-23-parcial.csv");
  assert.equal(radarWritingExportSiloFilename("radar-silo-skincare-2026-09-23.csv"), "silo-skincare-para-escrever-2026-09-23.csv");
  assert.equal(radarWritingExportSiloFilename("radar-sem-silo-2026-09-23.csv"), "sem-silo-para-escrever-2026-09-23.csv");
  assert.equal(radarWritingExportBatchFilename({ articles: [{ slug: "skincare-facial", keyword: null }, { slug: null, keyword: "x" }], today: EXPORTADO_EM }), "artigos-para-escrever-2026-09-23.csv");
  assert.equal(radarWritingExportBatchFilename({ articles: [{ slug: "Sérum: guia/2026", keyword: null }], today: EXPORTADO_EM }), "artigo-serum-guia-2026-para-escrever.csv");
});

/* ================================ K ================================ */

test("K · a rota: 'mode' opcional, padrão completo, e o ramo novo não lê nada a mais", async () => {
  const rota = semComentarios(await readFile(new URL("../app/api/editorial/radar-export/route.ts", import.meta.url), "utf8"));
  assert.match(rota, /mode: z\.enum\(\["writing", "full"\]\)\.optional\(\)/);
  assert.match(rota, /if \(input\.mode === "writing"\) \{/);
  const ramo = rota.slice(rota.indexOf("if (input.mode === \"writing\") {"), rota.indexOf("const linhaPorArtigo ="));
  assert.match(ramo, /radarPortableWritingExport\(\{ articles: montadas, lenses: lentes, plan: plano, publications: publicacoes, today: exportedAt \}\)/);
  assert.equal(/await |Repository\(|lookupSerpCache|supabase|\.from\(/.test(ramo), false, "o ramo 'Para escrever' faz leitura própria");
  assert.equal(/radarPortableExportCsv|buildRadarPortableExportRow/.test(ramo), false, "o ramo novo monta o formato completo");
  /* A página publicada sai do ArticleDNA já lido no laço. */
  assert.match(rota, /publicacoes\.set\(articleId, \{/);
  assert.match(rota, /principalPolicy: texto\(dna\.primaryKeywordPolicy\)/);
});

test("K · a tela: o card 'Exportar para escrever' — escopo em rádio de 14px, 'Exportar CSV' sempre para escrever, o técnico no Avançado fechado", async () => {
  assert.deepEqual(RADAR_EXPORT_MODES.map(modo => modo.mode), ["writing", "full"]);
  assert.equal(RADAR_EXPORT_MODES[0].label, "Para escrever (recomendado)");
  assert.equal(RADAR_EXPORT_MODES[1].label, "Completo (técnico)");
  assert.match(RADAR_EXPORT_MODES[1].helper, /32\.767/, "o técnico avisa o corte de célula do Excel");
  assert.equal(radarExportModeOf("full"), "full");
  for (const valor of [null, undefined, "", "writing", "FULL", 1]) assert.equal(radarExportModeOf(valor), "writing");

  /*
   * 2026-09-23 · O SELETOR "Formato do CSV" SAIU DO TOPO. O dono do produto
   * aprovou o card: a escolha é de ESCOPO, o botão principal é sempre "para
   * escrever", e o formato completo (técnico) mora no "Avançado (auditoria)",
   * fechado. Continuam valendo: rádio fora de role=menu, 14px, tokens.
   */
  const pagina = (await readFile(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
  const barra = semComentarios(pagina.slice(pagina.indexOf("const renderTopbarActions"), pagina.indexOf("const openDetail")));
  const card = barra.slice(barra.indexOf("{menuDeExport && escopoDoSilo ?"), barra.indexOf("onClick={grid.toggleColumns}"));
  assert.ok(card.length > 0, "o card de export não foi encontrado");
  assert.equal(/role="menu"|role="menuitem"/.test(card), false, "o card tem rádio e disclosure: não pode ser um role=menu");
  assert.match(card, /role="dialog"\s+aria-labelledby="radar-export-titulo"/);
  assert.match(card, /id="radar-export-titulo"[^>]*>Exportar para escrever</);
  assert.equal(/Formato do CSV|RADAR_EXPORT_MODES|radarExportModeLabel/.test(card), false, "o seletor de formato voltou ao topo do card");

  /* Um grupo só: o radiogroup, sem fieldset em volta anunciando o mesmo rótulo. */
  assert.equal(/<fieldset|<legend/.test(card), false, "o agrupamento dos rádios é anunciado duas vezes");
  const inicioDoGrupo = card.indexOf('<div role="radiogroup"');
  assert.ok(inicioDoGrupo >= 0, "o radiogroup do escopo não foi encontrado");
  const grupo = card.slice(inicioDoGrupo, card.lastIndexOf("<button", card.indexOf('data-testid="radar-export-csv"')));
  assert.match(grupo, /role="radiogroup" aria-label="O que exportar"/);
  assert.deepEqual([...grupo.matchAll(/type="radio" name="radar-escopo-do-export" value="([a-z]+)"/g)].map(item => item[1]), ["silo", "selecionados"]);
  assert.match(grupo, /Silo completo \(recomendado\)/);
  assert.match(grupo, /Só os artigos selecionados/);
  assert.match(grupo, /Mesmo formato, sem o contexto do Silo\./);
  assert.match(grupo, /Sem seleção: vão todos os artigos prontos do Radar\./, "a regra de quando não há seleção deixou de ser dita");
  assert.equal(/<button/.test(grupo), false);
  assert.equal(/text-xs|#[0-9a-f]{3,6}\b|rgb\(|text-\[1[0-3]px\]/i.test(card), false, "texto abaixo de 14px ou cor fixa no card");

  /* Um botão principal, e ele nunca manda o formato técnico. */
  const antesDoAvancado = card.slice(0, card.indexOf('data-testid="radar-export-avancado-toggle"'));
  assert.match(antesDoAvancado, /void \(escopoDoExport === "silo" \? exportarSilosCompletos\("writing"\) : exportarDossiesFinalizados\("writing"\)\)/);
  assert.equal(/"full"/.test(antesDoAvancado), false, "o formato técnico apareceu fora do Avançado");
  assert.match(antesDoAvancado, /bg-action-accent/, "o botão principal deixou de ser a variante primária");

  /* O Avançado: disclosure fechado, com o técnico e a planilha da tela. */
  const avancado = card.slice(card.indexOf('data-testid="radar-export-avancado-toggle"'));
  assert.match(card, /aria-expanded=\{avancadoDoExport\}\s+aria-controls="radar-export-avancado"/);
  assert.match(avancado, /Avançado \(auditoria\)/);
  assert.match(avancado, /id="radar-export-avancado" hidden=\{!avancadoDoExport\}/);
  assert.match(avancado, /void exportarSilosCompletos\("full"\)/);
  assert.match(avancado, /void exportarDossiesFinalizados\("full"\)/);
  assert.match(avancado, /Não serve para escrever\./);
  assert.match(avancado, /grid\.exportRows\(grid\.queriedRows, "planilha"\)/);
  assert.match(avancado, /RADAR_EXPORT_EXCEL_HINT/);
  assert.equal(/"writing"/.test(avancado), false, "o Avançado mandou o formato para escrever");
  assert.match(barra, /setAvancadoDoExport\(false\); setMenuDeExport\(atual => !atual\)/, "o Avançado não abre fechado a cada vez");

  /*
   * Teclado: Esc fecha logo depois de abrir, com o foco ainda no botão
   * Exportar (o handler fica no wrapper que contém o botão e o card), e toda
   * saída do card devolve o foco ao botão — nos exports assíncronos, também
   * quando o arquivo termina de sair e o botão volta a ficar habilitado.
   */
  assert.match(barra, /<div className="relative shrink-0" onKeyDown=\{evento => \{ if \(evento\.key === "Escape" && menuDeExport\) \{ evento\.stopPropagation\(\); fecharCardDeExport\(false\); \} \}\}>\s*<button\s+ref=\{botaoDoExportRef\}/,
    "Esc só fecha o card com o foco dentro dele");
  assert.equal(/onKeyDown/.test(card), false, "o Esc voltou a morar só no card");
  assert.deepEqual([...card.matchAll(/onClick=\{\(\) => \{ fecharCardDeExport\((true|false)\); ([a-zA-Z.]+)/g)].map(item => `${item[1]} ${item[2]}`),
    ["true void", "true void", "true void", "false grid.exportRows"], "um export assíncrono saiu do card sem devolver o foco");
  const fechar = barra.slice(barra.indexOf("const fecharCardDeExport"), barra.indexOf("return <>", barra.indexOf("const fecharCardDeExport")));
  assert.match(fechar, /if \(aposExportAssincrono\) devolverFocoAposExportRef\.current = true;\s*botaoDoExportRef\.current\?\.focus\(\);/);
  const semNotas = semComentarios(pagina);
  const devolucao = semNotas.slice(semNotas.indexOf("const devolverFocoAposExportRef"), semNotas.indexOf("}, [exportando]);") + 20);
  assert.match(devolucao, /if \(exportando \|\| !devolverFocoAposExportRef\.current\) return;\s*devolverFocoAposExportRef\.current = false;\s*botaoDoExportRef\.current\?\.focus\(\);/,
    "o foco não volta ao botão Exportar quando o export termina");

  const codigo = semComentarios(pagina);
  for (const funcao of ["const exportarSilosCompletos", "const exportarDossiesFinalizados"]) {
    const inicio = codigo.indexOf(funcao);
    const corpo = codigo.slice(inicio, codigo.indexOf("};", codigo.indexOf("finally", inicio)));
    assert.match(codigo.slice(inicio, inicio + 80), /= async \(modo: RadarExportMode\) =>/, `${funcao} não recebe o formato de quem clicou`);
    assert.match(corpo, /mode: modo \}/, `${funcao} não manda o formato de quem clicou`);
  }
  assert.match(codigo, /useState<"silo" \| "selecionados">\("silo"\)/, "o padrão do card é o silo completo");
  /* A preferência de formato gravada pelo card antigo: não se lê, não se grava e não se limpa (AGENTS §10). */
  assert.equal(/RADAR_EXPORT_MODE_STORAGE_KEY|modoDoExport|escolherModoDoExport/.test(codigo), false, "a tela voltou a usar a preferência de formato do navegador");
  assert.equal(/removeItem\(|localStorage\.clear/.test(codigo.slice(codigo.indexOf("const [menuDeExport"), codigo.indexOf("const [menuDeExport") + 3000)), false);
});

test("K · os módulos novos são puros", async () => {
  for (const caminho of ["../lib/radar/portable-writing-export.ts", "../lib/radar/portable-writing-batch.ts"]) {
    const fonte = semComentarios(await readFile(new URL(caminho, import.meta.url), "utf8"));
    assert.equal(/fetch\(|supabase|createClient|localStorage|indexedDB|from "react"|lib\/server|Date\.now\(|new Date\(\)/i.test(fonte), false, `${caminho} deixou de ser puro`);
  }
});

test("PROVIDER_CALLS = 0", () => {
  assert.deepEqual(idasAoServidor, [], `nenhuma rede deveria ter saído; houve: ${idasAoServidor.join(", ")}`);
});

/* As variantes do Amazon e do YouTube isoladas também sobem sem rede. */
test("K · as linhas avulsas do Amazon com produto e do YouTube", () => {
  const amazon = buildRadarWritingExportArticle(entradaAmazon(true), contextoAvulso({ articleId: ARTIGO_AMAZON })).row;
  assert.match(amazon.pode_escrever, /^Com ressalva: o formato pede 6 produtos e só 1 foi\(ram\) selecionado\(s\)/);
  assert.match(amazon.produtos, /1\. NIVEA Q10 Sérum Antissinais Expert Dupla Ação 30ml · R\$\s?89,90 observado na coleta · nota 4,8 \(835 avaliações\) · Escolha da Amazon · https:\/\/www\.amazon\.com\.br\/dp\/B0DBRR5BP4$/m);
  assert.match(amazon.produtos, /Aviso de afiliado: obrigatório antes do primeiro link de produto\./);
  assert.equal(/tag=|ref=/.test(amazon.produtos), false, "tag de afiliado atravessou");
  const youtube = buildRadarWritingExportArticle(entradaYoutube(), contextoAvulso({ articleId: ARTIGO_YOUTUBE })).row;
  assert.match(youtube.pode_escrever, /^Não: a investigação deste artigo foi feita para vídeo do YouTube/);
  assert.match(youtube.artigo, /Formato: Roteiro de vídeo/);
  for (const coluna of ["promessa_e_leitor", "titulo_e_seo", "estrutura", "cobrir_e_superar", "serp_resumida", "fontes_e_especialista", "links_internos", "plano_visual", "produtos"] as const) {
    assert.equal(youtube[coluna], "", `o roteiro de vídeo não serve para escrever o artigo: ${coluna} saiu`);
  }
  assert.equal(/Escreva em português/.test(youtube.prompt), false, "linha bloqueada com instrução de escrever");
});

/* ================================ L · as correções da revisão ================================ */

test("L · artigo do Silo sem plano de links: a falta é dita na célula e no veredito, e nenhum link é inventado", () => {
  const saude = linhasDe(EXPORT_DO_SILO_SAUDE().files![0].csv).dados;
  const suporte = saude[2];
  assert.equal(suporte.ordem, "2 · Suporte");
  assert.equal(suporte.links_internos, "Nenhum link: o pacote não traz plano de links para este artigo (nem para o Pilar, nem para a SiloPage). Não crie links; o plano é do Arquiteto.");
  assert.match(suporte.pode_escrever, /sem links internos no pacote: o artigo sai isolado do Silo \(sem link para o Pilar nem para a SiloPage\) até o Arquiteto definir o plano de links/);
  assert.match(linhasDe(EXPORT_DO_SILO().files![0].csv).dados[2].links_internos, /^Nenhum link: /, "o bloqueado também diz a falta");
  assert.equal(/Nenhum link/.test(saude[1].links_internos), false, "o Pilar tem plano de links");

  const avulso = linhasDe(radarPortableWritingExport({ articles: montadasDoSilo(), lenses: LEITURA_DAS_LENTES, plan: null, today: EXPORTADO_EM }).csv || "").dados[2];
  assert.equal(avulso.links_internos, "", "sem silo não há plano de links a cobrar");
  assert.equal(/sem links internos/.test(avulso.pode_escrever), false);

  const semPagina = buildRadarWritingExportArticle({ ...entradaGoogleSaude(), internalLinks: [] }, {
    topRowLabel: "Silo", filePosition: 1, silo: planoDoSilo().files[0].writing!, articleId: ARTIGO, publication: null,
  }).row;
  assert.match(semPagina.links_internos, /^L1 · /m);
  assert.equal(/Artigo → SiloPage/.test(semPagina.links_internos), false);
  assert.match(semPagina.links_internos, /\nNenhum link para a SiloPage no pacote: não crie um; o plano é do Arquiteto\.$/);
});

test("L · a linha de topo não afirma aprovação da Marca que não leu", () => {
  const topo = linhasDe(EXPORT_DO_SILO().files![0].csv).dados[0];
  assert.equal(/aprovad/i.test(`${topo.promessa_e_leitor}\n${topo.prompt}`), false);
  assert.match(topo.promessa_e_leitor, /Voz, tom, autor e revisor: não fazem parte deste arquivo; cole-os antes de pedir o texto a uma IA\./);
  assert.match(topo.prompt, /1\. Escreva em português do Brasil, na voz da marca\. A voz não faz parte deste arquivo: cole-a junto/);
});

test("L · o que se repetia em cada linha mora uma vez na linha de topo", () => {
  const { dados } = linhasDe(EXPORT_DO_SILO_SAUDE(true).files![0].csv);
  const [topo, ...artigos] = dados;
  assert.match(topo.prompt, /Tom visual: editorial e direto/);
  assert.match(topo.prompt, /Imagens, em todos os artigos deste arquivo — evitar: sem texto sobreposto na imagem/);
  assert.match(topo.prompt, /Links internos: só os indicados em cada artigo \(L1, L2…\)/);
  assert.match(topo.prompt, /\[RELATO DA MARCA — preencher\]/);
  for (const linha of artigos) {
    assert.equal(/Abre com a resposta direta/.test(linha.estrutura), false, `${linha.ordem}: a regra de cada H2 voltou a se repetir`);
    assert.equal(/Tom visual|^Evitar: /m.test(linha.plano_visual), false, `${linha.ordem}: o plano visual repete a regra geral`);
    assert.equal(/Conflito entre fonte e mercado|Afirmação marcada "precisa de fonte"|Marque as imagens/.test(linha.prompt), false, `${linha.ordem}: o prompt repete as regras gerais`);
    assert.ok(linha.prompt.length <= 1_300, `${linha.ordem}: prompt com ${linha.prompt.length} caracteres`);
  }
  const meta = artigos[0].titulo_e_seo.split("\n").find(linha => linha.startsWith("Meta description:")) || "";
  assert.equal((meta.match(/promessa/gi) || []).length, 1, `a meta description repete a promessa: ${meta}`);
});

test("L · a lista 'Evitar' só sobe quando é a mesma em todos os artigos", () => {
  const linha = (plano: string) => ({ ...Object.fromEntries(RADAR_WRITING_EXPORT_COLUMNS.map(coluna => [coluna, ""])), plano_visual: plano } as RadarWritingExportRow);
  const igual = radarWritingShareVisualAvoid([linha("Plano visual: capa\nEvitar: a; b."), linha("Plano visual: capa\nEvitar: a; b."), linha("")]);
  assert.equal(igual.shared, "Evitar: a; b.");
  assert.deepEqual(igual.rows.map(item => item.plano_visual), ["Plano visual: capa", "Plano visual: capa", ""]);
  const diferente = radarWritingShareVisualAvoid([linha("Plano visual: capa\nEvitar: a; b."), linha("Plano visual: capa\nEvitar: c.")]);
  assert.equal(diferente.shared, null);
  assert.deepEqual(diferente.rows.map(item => item.plano_visual), ["Plano visual: capa\nEvitar: a; b.", "Plano visual: capa\nEvitar: c."]);
  assert.equal(radarWritingShareVisualAvoid([linha("Plano visual: capa\nEvitar: a.")]).shared, null, "um artigo só não tem o que compartilhar");
});

test("L · o topo orgânico numera 1, 2, 3… entre os orgânicos, e a posição na página fica como informação", () => {
  const pilar = linhasDe(EXPORT_DO_SILO_SAUDE().files![0].csv).dados[1];
  assert.equal(/\bpos\. \d/.test(pilar.serp_resumida), false);
  const numeros = [...pilar.serp_resumida.matchAll(/^(\d+)\. /gm)].map(item => Number(item[1]));
  assert.ok(numeros.length >= 3);
  assert.deepEqual(numeros, numeros.map((_, indice) => indice + 1));
  assert.match(pilar.serp_resumida, /^1\. .* · posição 7 na página · “/m);
});

test("L · ALT, legenda e prompt que só repetem a pergunta, o cabeçalho ou um ponto de cobertura ficam de fora, com o nome da imagem", () => {
  const pilar = linhasDe(EXPORT_DO_SILO_SAUDE().files![0].csv).dados[1];
  assert.equal(/ALT: (Qual a ordem dos produtos|Como montar a rotina de skincare facial|Skincare facial para pele oleosa)\b/.test(pilar.plano_visual), false);
  assert.equal(/assunto: qual a ordem dos produtos/i.test(pilar.plano_visual), false, "prompt de molde atravessou");
  assert.match(pilar.plano_visual, /A escrever a partir do conteúdo real da seção \(o pacote não trazia texto utilizável\): Capa \([^)]*\); Respiro 1 \(ALT/);
  assert.equal(/ficaram de fora: escreva-os/.test(pilar.plano_visual), false);
});

test("L · o veredito não repete a mesma afirmação e diz o excedente pelo nome", () => {
  const pilar = linhasDe(EXPORT_DO_SILO_SAUDE(true).files![0].csv).dados[1];
  assert.equal((pilar.pode_escrever.match(/O que causa acne/g) || []).length, 1, "a afirmação do conflito voltou como segundo motivo");
  assert.equal(/\(\+\d+ ressalva/.test(pilar.pode_escrever), false, "o excedente voltou a ser só um número");
  assert.match(pilar.pode_escrever, /título de trabalho do pacote não utilizável/);
  assert.match(pilar.pode_escrever, /\n- Também: especialista E1 \(detalhes nas colunas desta linha\)\.$/);
});

test("L · um artigo sem pendência sai 'Sim', e o prompt não traz o bloco 'Neste artigo'", () => {
  const google = entradaGoogle();
  const limpo = buildRadarWritingExportArticle({
    ...google,
    articleModel: { ...(google.articleModel as unknown as Record<string, unknown>), titleSuggestion: "Skincare facial: como montar a rotina passo a passo" } as never,
  }, contextoAvulso());
  assert.equal(limpo.verdict, "Sim");
  assert.equal(limpo.row.pode_escrever, "Sim");
  assert.equal(limpo.firstReason, null);
  assert.match(limpo.row.titulo_e_seo, /^H1 de trabalho: Skincare facial: como montar a rotina passo a passo$/m);
  assert.match(limpo.row.prompt, /^Escreva em português do Brasil o artigo descrito nesta linha/);
  assert.equal(/Neste artigo:|Não escreva/.test(limpo.row.prompt), false);
});

test("L · linha bloqueada: o prompt diz só o bloqueio, sem a instrução de escrever logo depois", () => {
  const amazon = linhasDe(EXPORT_DO_SILO().files![0].csv).dados[2];
  assert.match(amazon.pode_escrever, /^Não: /);
  assert.match(amazon.prompt, /^Não escreva este artigo antes de resolver o bloqueio: .*Depois de resolvido, exporte de novo para receber o prompt de escrita\.$/);
  assert.equal(/Escreva em português|\n/.test(amazon.prompt), false);
  assert.match(amazon.produtos, /nenhum produto selecionado/, "o bloqueio comercial mantém o que explica o bloqueio");
});

test("L · o aviso depois do export por silo diz quantos saíram bloqueados, e isso é atenção", () => {
  const resposta = { exported: 3, files: [{ filename: "silo.csv", silo: { name: "Cuidados com a Pele", partial: false, exported: 3, total: 3, pending: [] } }] };
  const entregue = { filename: "silo.csv", files: 1 };
  const sem = radarSiloExportNotice({ response: resposta, delivered: entregue, titleOf: () => null });
  assert.equal(sem.type, "info");
  assert.equal(/bloqueio/.test(sem.message), false, "o formato completo não envia 'blocked' e nada muda para ele");
  assert.equal(radarSiloExportNotice({ response: { ...resposta, blocked: 0 }, delivered: entregue, titleOf: () => null }).type, "info");
  const com = radarSiloExportNotice({ response: { ...resposta, blocked: 2 }, delivered: entregue, titleOf: () => null });
  assert.equal(com.type, "warning");
  assert.match(com.message, /2 artigo\(s\) com bloqueio para escrever: veja a coluna pode_escrever\./);
});

test("L · o aviso de tamanho cita o arquivo do formato escolhido; a leitura do banco é a mesma", () => {
  const ids = Array.from({ length: 6 }, (_, indice) => `artigo-${indice}`);
  const finalizados = ids.slice(0, 2);
  assert.equal(radarSiloExportEstimate({ articleIds: ids, finalizedArticleIds: finalizados }).fileBytes, 2 * RADAR_EXPORT_FILE_BYTES_PER_DOSSIER);
  assert.equal(radarSiloExportEstimate({ articleIds: ids, finalizedArticleIds: finalizados, exportMode: "writing" }).fileBytes, 2 * RADAR_EXPORT_WRITING_FILE_BYTES_PER_DOSSIER);
  assert.equal(radarSiloExportEstimate({ articleIds: ids, finalizedArticleIds: finalizados, exportMode: "writing" }).readBytes,
    radarSiloExportEstimate({ articleIds: ids, finalizedArticleIds: finalizados }).readBytes);
  const antes = radarSiloExportSizeNotice({ scope: { mode: "all", articleIds: ids }, finalizedArticleIds: finalizados });
  assert.deepEqual(radarSiloExportSizeNotice({ scope: { mode: "all", articleIds: ids }, finalizedArticleIds: finalizados, exportMode: "full" }), antes, "o técnico mantém a frase de antes");
  const escrita = radarSiloExportSizeNotice({ scope: { mode: "all", articleIds: ids }, finalizedArticleIds: finalizados, exportMode: "writing" });
  assert.match(escrita!.message, /^Estimativa de ~33 MB lidos do banco .* e arquivo de ~0,1 MB no formato para escrever, com 2 artigo\(s\) finalizado\(s\)/);
  assert.ok(RADAR_EXPORT_WRITING_FILE_BYTES_PER_DOSSIER * 5 < RADAR_EXPORT_FILE_BYTES_PER_DOSSIER);
});
