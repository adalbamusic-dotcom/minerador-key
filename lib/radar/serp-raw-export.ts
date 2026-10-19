/**
 * ===== 2026-10-14 · A SERP CRUA POR ARTIGO, PARA CONFERÊNCIA EXTERNA =====
 *
 * SDD `docs/compartilhado/sdd-silo-interligado-seo-semantico-2026-10-14.md` §16.1
 * (item novo, decidido pelo dono em 2026-10-14: "sim, pode sim, e do MCP também
 * é uma boa ideia, pode implementar"). Ao lado do CSV "Para escrever" de um
 * artigo (`<NN>-<papel>-<slug>-para-escrever.csv`) sai `<NN>-<papel>-<slug>-serp.csv`,
 * com o mesmo prefixo, para o dono (ou outra IA) conferir a SERP fora da plataforma.
 *
 * SÓ DADOS JÁ COLETADOS. Nenhuma coleta nova, nada pago, nenhuma IA:
 *   - lente canônica (desktop · Windows): o snapshot da SERP que o pacote
 *     referencia (orgânicos com título, URL, trecho e data; "Pessoas também
 *     perguntam" com a resposta exibida e a fonte; buscas relacionadas; o resumo
 *     de IA e as fontes que ele cita);
 *   - as outras três lentes: o resumo orgânico já gravado no cache (a mesma
 *     leitura grátis do CSV de vídeo) e a observação compacta da lente (perguntas,
 *     buscas relacionadas, resumo de IA); lente sem leitura sai declarada;
 *   - a estrutura de títulos (H1/H2) e os sinais (data visível, autor) das
 *     páginas que a investigação leu (`payload.extractions`).
 *
 * NUNCA O TEXTO INTEGRAL DAS PÁGINAS: só título, trecho, estrutura de títulos e
 * URL (evita cópia e mantém leve). O trecho de terceiro é cortado.
 *
 * D11 (amostra relevante): o concorrente fora do leitor (outra profissão), fora
 * do território (área vizinha, loja ou consumo) ou com medida fora da curva
 * (outlier de palavras) é MARCADO na coluna `relevancia_d11`, nunca escondido.
 *
 * Uma função só monta o arquivo para a tela (rota de export) e para o MCP
 * (`get_article_serp_raw`): o mesmo núcleo, o mesmo texto.
 *
 * Módulo puro: sem fetch, sem banco, sem relógio.
 */
import { RADAR_SERP_LENS_LABELS, type RadarSerpLensLabel } from "./serp/lens-set.ts";
import type { RadarFrozenSerpLens } from "./serp/frozen-lenses.ts";
import type { RadarPortableSerpLensLookup, RadarPortableSerpObservedInput } from "./portable-serp-observed.ts";
import type { RadarVideoLensOrganicReading } from "./video-competitive.ts";
import { serpCacheLensLabel } from "../editorial/serp-cache.ts";
import {
  radarReaderQuestionNoiseReason,
  type RadarResearchNoiseContext,
} from "./research-noise.ts";
import { radarCompetitiveRelevanceReasons } from "./competitive-reading.ts";
import { radarWritingExportBatchFilename } from "./portable-writing-export.ts";
import type { RadarSiloExportPlan } from "./portable-silo-export.ts";
import { radarCompetitorCitedSources, type RadarCompetitorCitedSource } from "./authority-sources.ts";
import { RADAR_AUTHORITY_KIND_LABEL, RADAR_AUTHORITY_ORIGIN_LABEL, type RadarAuthoritySourcesRecord } from "./authority-sources-contract.ts";
import type { RadarExtractionPage } from "./analysis-contracts.ts";
import type { BrandSerpTerritory } from "../marca/brand-serp-location.ts";

/** A versão do formato do arquivo. Mudou coluna ou regra de linha, muda a data. */
export const RADAR_SERP_RAW_VERSION = "2026-10-14";

/** As colunas, na ordem (o cabeçalho do CSV). */
export const RADAR_SERP_RAW_COLUMNS = [
  "tipo",
  "lente",
  "posicao",
  "posicao_na_pagina",
  "url",
  "dominio",
  "coletado_em",
  "titulo",
  "descricao",
  "estrutura_h1_h2",
  "sinais",
  "relevancia_d11",
] as const;
export type RadarSerpRawColumn = (typeof RADAR_SERP_RAW_COLUMNS)[number];
export type RadarSerpRawRow = Record<RadarSerpRawColumn, string>;

/** Os tetos que mantêm o arquivo leve (o trecho de terceiro como no CSV de escrita). */
export const RADAR_SERP_RAW_LIMITS = Object.freeze({ excerptChars: 300, h2: 15, headingChars: 120, titleChars: 200 });

/** Os tipos de linha, ditos iguais à tela e ao MCP. */
export const RADAR_SERP_RAW_KINDS = Object.freeze({
  about: "sobre o arquivo",
  organic: "orgânico",
  question: "pessoas também perguntam",
  related: "busca relacionada",
  aiSource: "fonte citada pelo resumo de IA",
  /* 2026-10-14 · Fontes externas de autoridade (SDD do Silo interligado §16.2, Fase A). */
  citedSource: "fonte citada pelos concorrentes",
  verifiedSource: "fonte verificada",
  unverifiedSource: "fonte não conferida",
});

/**
 * 2026-10-14 · AS FONTES DO ARTIGO, PARA O ARQUIVO (Fase A das fontes de autoridade):
 * as que os concorrentes citam (das extrações gravadas, sem verificação) e o
 * registro da conferência gravado na análise (`payload.authoritySources`).
 */
export type RadarSerpRawSources = {
  cited: readonly RadarCompetitorCitedSource[];
  authority: RadarAuthoritySourcesRecord | null;
};

/** As fontes na forma que o arquivo lê, a partir do payload gravado da análise. */
export function radarSerpRawSourcesOf(payload: { extractions?: readonly RadarExtractionPage[] | null; authoritySources?: RadarAuthoritySourcesRecord | null } | null | undefined): RadarSerpRawSources {
  return { cited: radarCompetitorCitedSources(payload?.extractions || []), authority: payload?.authoritySources ?? null };
}

/** Uma página que a investigação leu (das extrações gravadas), só o que o arquivo usa. */
export type RadarSerpRawPage = {
  url: string;
  status: string;
  h1: readonly string[];
  h2: readonly string[];
  hasDates: boolean;
  author: string | null;
  wordCount: number;
};

/** As extrações gravadas na forma que este arquivo lê (sem texto de página). */
export function radarSerpRawPagesOf(extractions: ReadonlyArray<{ url: string; status?: string; h1?: readonly string[]; h2?: readonly string[]; hasDates?: boolean; author?: string | null; wordCount?: number }> | null | undefined): RadarSerpRawPage[] {
  return (extractions || []).filter(item => item && typeof item.url === "string").map(item => ({
    url: item.url,
    status: String(item.status || ""),
    h1: (item.h1 || []).filter(Boolean),
    h2: (item.h2 || []).filter(Boolean),
    hasDates: Boolean(item.hasDates),
    author: item.author ?? null,
    wordCount: Number.isFinite(item.wordCount) ? Number(item.wordCount) : 0,
  }));
}

/** O que o arquivo de UM artigo lê. */
export type RadarSerpRawArticleInput = {
  article: {
    principalKeyword: string | null;
    secondaryKeywords?: readonly string[];
    narrativeReinforcements?: readonly string[];
    audience?: string | null;
  };
  serpObserved?: RadarPortableSerpObservedInput | null;
  pages?: readonly RadarSerpRawPage[] | null;
  /** O resumo orgânico das lentes extras (cache, grátis). */
  lensDigests?: RadarVideoLensOrganicReading | null;
  /** A observação compacta das lentes da principal no cache (perguntas, relacionadas, resumo de IA). */
  lensLookups?: readonly RadarPortableSerpLensLookup[];
  /** As lentes congeladas no pacote (perguntas e resumo de IA por lente, quando o cache não tem). */
  frozenLenses?: readonly RadarFrozenSerpLens[] | null;
  /** 2026-10-14 · "Fontes citadas pelos concorrentes" e "Fontes verificadas". Ausente = o arquivo de antes. */
  sources?: RadarSerpRawSources | null;
  /**
   * 2026-10-18 · L3 (SDD `sdd-localidade-serp-por-marca-2026-10-18.md`) · o território da
   * marca com cidade: o orgânico de outra cidade ou UF sai em `relevancia_d11` como
   * "fora do território: outra localidade". Ausente = marca nacional, o arquivo de antes.
   */
  territory?: BrandSerpTerritory | null;
};

const ROTULO_DA_LENTE: Record<RadarSerpLensLabel, string> = {
  "desktop-windows": "desktop · Windows",
  "desktop-macos": "desktop · macOS",
  "mobile-android": "celular · Android",
  "mobile-ios": "celular · iOS",
};
const CANONICA: RadarSerpLensLabel = RADAR_SERP_LENS_LABELS[0];

const texto = (valor: unknown): string => (typeof valor === "string" ? valor.replace(/\s+/g, " ").trim() : "");
const cortar = (valor: string, limite: number) => (valor.length > limite ? `${valor.slice(0, limite - 1).trimEnd()}…` : valor);
const dataDe = (valor: string | null | undefined): string => {
  const lido = texto(valor);
  if (!lido) return "";
  const instante = new Date(lido);
  return Number.isNaN(instante.getTime()) ? lido : instante.toISOString().slice(0, 10);
};
const dominioDe = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};
/** A mesma página em dois endereços: sem protocolo, "www.", consulta, âncora e barra final. */
const chaveDaUrl = (url: string | null | undefined) => texto(url).toLowerCase().replace(/^https?:\/\/(?:www\.)?/, "").replace(/[?#].*$/, "").replace(/\/+$/, "");
const chaveDoTexto = (valor: string) => valor.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const rotuloDaLente = (lente: string) => ROTULO_DA_LENTE[lente as RadarSerpLensLabel] ?? lente;

const linha = (campos: Partial<RadarSerpRawRow>): RadarSerpRawRow =>
  Object.fromEntries(RADAR_SERP_RAW_COLUMNS.map(coluna => [coluna, campos[coluna] ?? ""])) as RadarSerpRawRow;

/** H1/H2 da página lida, cortados (a estrutura, nunca o texto). */
function estruturaDe(pagina: RadarSerpRawPage | undefined): string {
  if (!pagina) return "";
  const h1 = pagina.h1.map(item => cortar(texto(item), RADAR_SERP_RAW_LIMITS.headingChars)).filter(Boolean);
  const h2 = pagina.h2.map(item => cortar(texto(item), RADAR_SERP_RAW_LIMITS.headingChars)).filter(Boolean);
  const partes = [
    ...(h1.length ? [`H1: ${h1.join(" | ")}`] : []),
    ...(h2.length ? [`H2: ${h2.slice(0, RADAR_SERP_RAW_LIMITS.h2).join(" | ")}${h2.length > RADAR_SERP_RAW_LIMITS.h2 ? ` | … (+${h2.length - RADAR_SERP_RAW_LIMITS.h2} H2)` : ""}`] : []),
  ];
  return partes.join("\n");
}

const PAGINA_LIDA = new Set(["success", "partial"]);

/**
 * D11 · A RELEVÂNCIA DE UMA PÁGINA PARA ESTE LEITOR, marcada (nunca escondida):
 * outra profissão fora do público (psicólogo num artigo de dentista), área vizinha
 * (gestão de pessoas, tributário), loja ou consumo fora do artigo, ou medida fora
 * da curva (mais de 3× ou menos de 1/3 da mediana de palavras das páginas lidas,
 * a mesma régua de `competitive-model.ts`).
 */
/* 2026-10-14 · F3 · a régua é UMA SÓ: a mesma da amostra relevante da leitura competitiva (`competitive-reading.ts`). */
function relevanciaDe(conteudo: string, pagina: RadarSerpRawPage | undefined, contexto: RadarResearchNoiseContext, mediana: number | null, url?: string | null): string {
  const palavras = pagina && PAGINA_LIDA.has(pagina.status) && pagina.wordCount > 0 ? pagina.wordCount : null;
  /* 2026-10-18 · L3 · o endereço e os 4 primeiros H2 entram só no D11 geográfico (com o território da marca). */
  const motivos = radarCompetitiveRelevanceReasons(conteudo, palavras, contexto, mediana, { url, headings: pagina && PAGINA_LIDA.has(pagina.status) ? pagina.h2 : [] });
  return motivos.length ? `irrelevante (D11): ${motivos.join("; ")}` : "relevante";
}

function medianaDePalavras(paginas: readonly RadarSerpRawPage[]): number | null {
  const valores = paginas.filter(item => PAGINA_LIDA.has(item.status) && item.wordCount > 0).map(item => item.wordCount).sort((a, b) => a - b);
  if (valores.length < 3) return null;
  const meio = Math.floor(valores.length / 2);
  return valores.length % 2 ? valores[meio] : Math.round((valores[meio - 1] + valores[meio]) / 2);
}

/** As linhas do arquivo de um artigo, na ordem: sobre, orgânicos por lente, perguntas, buscas relacionadas, fontes do resumo de IA. */
export function radarSerpRawRows(input: RadarSerpRawArticleInput): RadarSerpRawRow[] {
  const snapshot = input.serpObserved?.snapshot ?? null;
  const paginas = input.pages || [];
  const paginaDe = new Map(paginas.map(item => [chaveDaUrl(item.url), item]));
  const mediana = medianaDePalavras(paginas);
  const principal = texto(input.article.principalKeyword);
  const contexto: RadarResearchNoiseContext = {
    core: [principal, ...(input.article.secondaryKeywords || []), ...(input.article.narrativeReinforcements || [])],
    audience: input.article.audience ?? null,
    ...(input.territory ? { location: input.territory } : {}),
  };
  const linhas: RadarSerpRawRow[] = [];
  const lenteCanonica = snapshot ? `${snapshot.device}-${snapshot.operatingSystem || "windows"}` : CANONICA;
  const coletaCanonica = dataDe(snapshot?.collectedAt);

  /* A observação de cada lente extra: o cache (lido agora) e, sem ele, a cópia congelada no pacote. */
  const observacao = new Map<string, { questions: string[]; related: string[]; ai: boolean | null; collectedAt: string }>();
  for (const consulta of input.lensLookups || []) {
    const lente = serpCacheLensLabel(consulta.request.query.lens);
    const vista = consulta.hit?.observation;
    if (!vista || observacao.has(lente)) continue;
    observacao.set(lente, {
      questions: vista.questions.map(texto).filter(Boolean),
      related: vista.relatedSearches.map(texto).filter(Boolean),
      ai: vista.aiOverviewDomains.length > 0 || vista.itemTypes.includes("ai_overview"),
      collectedAt: dataDe(consulta.hit?.meta.collectedAt),
    });
  }
  for (const congelada of input.frozenLenses || []) {
    if (observacao.has(congelada.lens) || congelada.status !== "observed") continue;
    observacao.set(congelada.lens, {
      questions: congelada.questions.map(texto).filter(Boolean),
      related: [],
      ai: congelada.aiOverviewDomains.length > 0 || congelada.itemTypes.includes("ai_overview"),
      collectedAt: dataDe(congelada.collectedAt),
    });
  }
  const iaNaCanonica = snapshot ? Boolean(snapshot.serpFeatures?.aiOverview.present || snapshot.serpFeatures?.itemTypes?.includes("ai_overview")) : null;
  const sinalDaIa = (presente: boolean | null) => (presente === null ? "resumo de IA no topo da SERP: não registrado" : `resumo de IA no topo da SERP: ${presente ? "sim" : "não"}`);

  linhas.push(linha({
    tipo: RADAR_SERP_RAW_KINDS.about,
    titulo: `SERP crua de "${principal || "artigo"}" (formato ${RADAR_SERP_RAW_VERSION})`,
    descricao: [
      "Dados já coletados pelo Radar: nenhuma coleta nova, nada pago, nenhuma IA.",
      "Uma linha por resultado orgânico por lente (as 4 lentes), mais \"Pessoas também perguntam\" (com a resposta exibida pelo Google e a fonte, quando a lente a guarda), buscas relacionadas e as fontes citadas pelo resumo de IA.",
      "Sem o texto integral das páginas: só título, trecho, estrutura de títulos (H1/H2) e URL. Referência para conferir, não para copiar.",
      "A coluna relevancia_d11 marca, sem esconder, o concorrente fora do leitor, fora do território ou com medida fora da curva (D11).",
      ...(input.territory ? [`A marca atende ${input.territory.label}: o resultado que cita outra cidade ou UF (e não a da marca) sai marcado como "fora do território: outra localidade".`] : []),
      ...(input.sources ? ["No fim, as fontes citadas pelos concorrentes (sem verificação) e as fontes de autoridade verificadas no Radar (id X, com o trecho e a afirmação que sustentam) ou não conferidas (com o motivo)."] : []),
    ].join(" "),
    sinais: snapshot ? `consulta: ${texto(snapshot.query)} · ${[texto(snapshot.location), texto(snapshot.language)].filter(Boolean).join(" · ")}` : "sem SERP canônica gravada no pacote",
  }));

  /* ---------- os orgânicos, lente a lente ---------- */
  const organicoDaPagina = (lente: string, ordem: number, item: { position: number | null; url: string; title: string | null; snippet: string | null; date: string | null }, coletadoEm: string, ia: boolean | null) => {
    const pagina = paginaDe.get(chaveDaUrl(item.url));
    const sinais = [
      ...(item.date ? [`data na SERP: ${texto(item.date)}`] : []),
      ...(pagina && PAGINA_LIDA.has(pagina.status) ? [`data visível na página: ${pagina.hasDates ? "sim" : "não"}`, `autor: ${texto(pagina.author) || "não identificado"}`] : [pagina ? `página não lida (${pagina.status || "sem situação"})` : "página não lida pela investigação"]),
      sinalDaIa(ia),
    ];
    const conteudo = [texto(item.title), texto(item.snippet), ...(pagina?.h1 || [])].join(" · ");
    return linha({
      tipo: RADAR_SERP_RAW_KINDS.organic,
      lente: rotuloDaLente(lente),
      posicao: String(ordem),
      posicao_na_pagina: typeof item.position === "number" ? String(item.position) : "",
      url: item.url,
      dominio: dominioDe(item.url),
      coletado_em: coletadoEm,
      titulo: cortar(texto(item.title), RADAR_SERP_RAW_LIMITS.titleChars),
      descricao: cortar(texto(item.snippet), RADAR_SERP_RAW_LIMITS.excerptChars),
      estrutura_h1_h2: estruturaDe(pagina && PAGINA_LIDA.has(pagina.status) ? pagina : undefined),
      sinais: sinais.join("; "),
      relevancia_d11: relevanciaDe(conteudo, pagina, contexto, mediana, item.url),
    });
  };

  if (snapshot) {
    [...snapshot.organicResults].sort((a, b) => a.position - b.position).forEach((item, indice) => {
      linhas.push(organicoDaPagina(lenteCanonica, indice + 1, { position: item.position, url: item.url, title: item.title, snippet: item.snippet, date: item.date }, coletaCanonica, iaNaCanonica));
    });
  } else {
    linhas.push(linha({ tipo: RADAR_SERP_RAW_KINDS.organic, lente: rotuloDaLente(CANONICA), descricao: texto(input.serpObserved?.unavailableReason) || "A SERP canônica não está gravada no pacote deste artigo." }));
  }
  const extras = RADAR_SERP_LENS_LABELS.filter(lente => lente !== lenteCanonica);
  for (const lente of extras) {
    const resumo = input.lensDigests?.lenses.find(item => item.lens === lente) ?? null;
    const vista = observacao.get(lente) ?? null;
    if (!resumo?.organic) {
      linhas.push(linha({
        tipo: RADAR_SERP_RAW_KINDS.organic,
        lente: rotuloDaLente(lente),
        coletado_em: vista?.collectedAt ?? "",
        descricao: `Sem os resultados orgânicos desta lente: ${resumo?.missing || "o resumo orgânico não foi lido nesta exportação"}. Nada foi coletado de novo.`,
        sinais: sinalDaIa(vista?.ai ?? null),
      }));
      continue;
    }
    resumo.organic.forEach((item, indice) => {
      linhas.push(organicoDaPagina(lente, indice + 1, { position: item.position, url: item.url, title: item.title, snippet: item.snippet ?? null, date: item.date ?? null }, dataDe(resumo.collectedAt) || vista?.collectedAt || "", vista?.ai ?? null));
    });
  }

  /* ---------- "Pessoas também perguntam" ---------- */
  const perguntasVistas = new Set<string>();
  for (const item of [...(snapshot?.peopleAlsoAsk || [])].sort((a, b) => a.position - b.position)) {
    const pergunta = texto(item.question);
    if (!pergunta) continue;
    perguntasVistas.add(chaveDoTexto(pergunta));
    const ruido = radarReaderQuestionNoiseReason(pergunta, contexto);
    linhas.push(linha({
      tipo: RADAR_SERP_RAW_KINDS.question,
      lente: rotuloDaLente(lenteCanonica),
      posicao: String(item.position),
      url: texto(item.sourceUrl),
      dominio: item.sourceUrl ? dominioDe(item.sourceUrl) : "",
      coletado_em: coletaCanonica,
      titulo: pergunta,
      descricao: item.answer ? cortar(texto(item.answer), RADAR_SERP_RAW_LIMITS.excerptChars) : "o Google não exibiu resposta nesta coleta",
      sinais: item.sourceTitle ? `fonte da resposta: ${cortar(texto(item.sourceTitle), RADAR_SERP_RAW_LIMITS.headingChars)}` : "",
      relevancia_d11: ruido ? `irrelevante (D11): ${ruido}` : "relevante",
    }));
  }
  for (const lente of extras) {
    const vista = observacao.get(lente);
    for (const [indice, pergunta] of (vista?.questions || []).entries()) {
      const chave = chaveDoTexto(pergunta);
      if (!chave || perguntasVistas.has(chave)) continue;
      perguntasVistas.add(chave);
      const ruido = radarReaderQuestionNoiseReason(pergunta, contexto);
      linhas.push(linha({
        tipo: RADAR_SERP_RAW_KINDS.question,
        lente: rotuloDaLente(lente),
        posicao: String(indice + 1),
        coletado_em: vista?.collectedAt ?? "",
        titulo: pergunta,
        descricao: "só nesta lente; a resposta não é guardada fora da lente canônica",
        relevancia_d11: ruido ? `irrelevante (D11): ${ruido}` : "relevante",
      }));
    }
  }

  /* ---------- buscas relacionadas ---------- */
  const relacionadasVistas = new Set<string>();
  for (const [indice, item] of (snapshot?.relatedSearches || []).entries()) {
    const termo = texto(item.term);
    if (!termo) continue;
    relacionadasVistas.add(chaveDoTexto(termo));
    const ruido = radarReaderQuestionNoiseReason(termo, contexto);
    linhas.push(linha({ tipo: RADAR_SERP_RAW_KINDS.related, lente: rotuloDaLente(lenteCanonica), posicao: String(indice + 1), coletado_em: coletaCanonica, titulo: termo, relevancia_d11: ruido ? `irrelevante (D11): ${ruido}` : "relevante" }));
  }
  for (const lente of extras) {
    const vista = observacao.get(lente);
    for (const [indice, termo] of (vista?.related || []).entries()) {
      const chave = chaveDoTexto(termo);
      if (!chave || relacionadasVistas.has(chave)) continue;
      relacionadasVistas.add(chave);
      const ruido = radarReaderQuestionNoiseReason(termo, contexto);
      linhas.push(linha({ tipo: RADAR_SERP_RAW_KINDS.related, lente: rotuloDaLente(lente), posicao: String(indice + 1), coletado_em: vista?.collectedAt ?? "", titulo: termo, descricao: "só nesta lente", relevancia_d11: ruido ? `irrelevante (D11): ${ruido}` : "relevante" }));
    }
  }

  /* ---------- as fontes que o resumo de IA cita (lente canônica) ---------- */
  for (const [indice, fonte] of (snapshot?.serpFeatures?.aiOverview.references || []).entries()) {
    linhas.push(linha({
      tipo: RADAR_SERP_RAW_KINDS.aiSource,
      lente: rotuloDaLente(lenteCanonica),
      posicao: String(indice + 1),
      url: texto(fonte.url),
      dominio: texto(fonte.domain),
      coletado_em: coletaCanonica,
      titulo: cortar(texto(fonte.title), RADAR_SERP_RAW_LIMITS.titleChars),
      sinais: "citada pelo resumo de IA no topo da SERP (o texto do resumo não é guardado)",
    }));
  }
  if (input.sources) linhas.push(...linhasDasFontes(input.sources));
  return linhas;
}

/**
 * 2026-10-14 · "FONTES CITADAS PELOS CONCORRENTES" E "FONTES VERIFICADAS" (§16.2, Fase A).
 *
 * As citadas: todo link externo de conteúdo das páginas lidas, sem verificação (o
 * retrato). As verificadas: as que a conferência do ANALYZE abriu, com a entidade, o
 * trecho que sustenta a afirmação (id X) e a data; as que falharam saem com o motivo.
 * Investigação anterior à conferência sai declarada, nunca vazia em silêncio.
 */
function linhasDasFontes(fontes: RadarSerpRawSources): RadarSerpRawRow[] {
  const linhas: RadarSerpRawRow[] = [];
  if (!fontes.cited.length) {
    linhas.push(linha({ tipo: RADAR_SERP_RAW_KINDS.citedSource, descricao: "Nenhuma fonte externa de conteúdo foi citada nas páginas concorrentes lidas." }));
  }
  fontes.cited.forEach((fonte, indice) => {
    const contexto = [
      ...(fonte.anchors.length ? [`âncora: ${fonte.anchors.map(item => `"${cortar(texto(item), 80)}"`).join(", ")}`] : []),
      ...(fonte.sections.length ? [`seção: ${fonte.sections.map(item => `"${cortar(texto(item), 80)}"`).join(", ")}`] : []),
    ].join("; ");
    linhas.push(linha({
      tipo: RADAR_SERP_RAW_KINDS.citedSource,
      posicao: String(indice + 1),
      url: fonte.url,
      dominio: fonte.domain,
      titulo: fonte.entity ? cortar(fonte.entity, RADAR_SERP_RAW_LIMITS.titleChars) : "",
      descricao: cortar(contexto, RADAR_SERP_RAW_LIMITS.excerptChars),
      sinais: `citada por ${fonte.citedByCompetitors} página(s) concorrente(s) lida(s); tipo: ${RADAR_AUTHORITY_KIND_LABEL[fonte.kind]}; não verificada nesta linha`,
    }));
  });

  const registro = fontes.authority;
  if (!registro) {
    linhas.push(linha({ tipo: RADAR_SERP_RAW_KINDS.verifiedSource, descricao: "A conferência de fontes externas de autoridade não rodou nesta investigação (ela é anterior a 2026-10-14). Roda no próximo \"Analisar concorrência · e finaliza\"." }));
    return linhas;
  }
  if (registro.status === "UNAVAILABLE") {
    linhas.push(linha({ tipo: RADAR_SERP_RAW_KINDS.verifiedSource, coletado_em: dataDe(registro.checkedAt), descricao: cortar(`As fontes externas não foram conferidas: ${registro.unavailableReason || "motivo não registrado"}.`, RADAR_SERP_RAW_LIMITS.excerptChars) }));
    return linhas;
  }
  if (!registro.verified.length) {
    linhas.push(linha({
      tipo: RADAR_SERP_RAW_KINDS.verifiedSource,
      coletado_em: dataDe(registro.checkedAt),
      descricao: `Nenhuma fonte de autoridade sustenta afirmação do artigo: ${registro.checked} de ${registro.candidates} candidata(s) conferida(s), ${registro.failures.length} falharam.`,
    }));
  }
  for (const fonte of registro.verified) {
    linhas.push(linha({
      tipo: RADAR_SERP_RAW_KINDS.verifiedSource,
      posicao: fonte.id,
      url: fonte.url,
      dominio: fonte.domain,
      coletado_em: dataDe(fonte.checkedAt),
      titulo: cortar([fonte.entity, texto(fonte.title)].filter(Boolean).join(" — "), RADAR_SERP_RAW_LIMITS.titleChars),
      descricao: cortar(texto(fonte.excerpt), RADAR_SERP_RAW_LIMITS.excerptChars),
      sinais: [
        `sustenta: ${fonte.claim}`,
        `tipo: ${RADAR_AUTHORITY_KIND_LABEL[fonte.kind]}`,
        `origem: ${RADAR_AUTHORITY_ORIGIN_LABEL[fonte.origin]}`,
        fonte.ymyl ? "YMYL: afirmação de saúde que exige fonte" : "YMYL: não",
        ...(fonte.publishedAt ? [`data na página: ${fonte.publishedAt}`] : ["data na página: não declarada"]),
      ].join("; "),
    }));
  }
  for (const falha of registro.failures) {
    linhas.push(linha({
      tipo: RADAR_SERP_RAW_KINDS.unverifiedSource,
      url: falha.url,
      dominio: falha.domain,
      coletado_em: dataDe(registro.checkedAt),
      titulo: cortar(falha.entity, RADAR_SERP_RAW_LIMITS.titleChars),
      descricao: cortar(falha.reason, RADAR_SERP_RAW_LIMITS.excerptChars),
      sinais: `tipo: ${RADAR_AUTHORITY_KIND_LABEL[falha.kind]}; origem: ${RADAR_AUTHORITY_ORIGIN_LABEL[falha.origin]}`,
    }));
  }
  return linhas;
}

/** O CSV: BOM UTF-8, cabeçalho e todas as células entre aspas, como o CSV "Para escrever". */
export function radarSerpRawCsv(linhas: readonly RadarSerpRawRow[]): string {
  const celula = (valor: string) => `"${valor.replaceAll("\"", "\"\"")}"`;
  const todas = [RADAR_SERP_RAW_COLUMNS.map(celula).join(","), ...linhas.map(item => RADAR_SERP_RAW_COLUMNS.map(coluna => celula(item[coluna] ?? "")).join(","))];
  return `﻿${todas.join("\r\n")}\r\n`;
}

/** O nome do arquivo: o mesmo prefixo do CSV "Para escrever" do artigo, com "-serp.csv". */
export function radarSerpRawFilename(input: { slug: string | null; keyword: string | null; position?: number | null; role?: string | null; today: string }): string {
  return radarWritingExportBatchFilename({ articles: [input], today: input.today }).replace(/-para-escrever\.csv$/, "-serp.csv");
}

/** O .zip da exportação "para escrever" com a SERP crua: um artigo, o prefixo dele; vários, a data. */
export function radarSerpRawArchiveFilename(input: { writingFilename: string | null; articles: number; today: string }): string {
  if (input.articles === 1 && input.writingFilename && /-para-escrever\.csv$/.test(input.writingFilename)) return input.writingFilename.replace(/-para-escrever\.csv$/, ".zip");
  return `artigos-para-escrever-e-serp-${input.today.slice(0, 10)}.zip`;
}

/** Um artigo do lote, na forma que a montagem do export entrega. */
export type RadarSerpRawAssembled = {
  articleId: string;
  entrada: { article: RadarSerpRawArticleInput["article"] & { slug?: string | null }; serpObserved?: RadarPortableSerpObservedInput | null; serpRawPages?: readonly RadarSerpRawPage[] | null; serpRawSources?: RadarSerpRawSources | null; serpTerritory?: BrandSerpTerritory | null };
  lentes: ReadonlyArray<{ keyword: string; role: string }>;
  lensDigests?: RadarVideoLensOrganicReading | null;
  lentesCongeladas?: { block: { lenses: readonly RadarFrozenSerpLens[] } | null } | null;
};

export type RadarSerpRawFile = { articleId: string; filename: string; csv: string; rows: number };

/** A posição e o papel do artigo no Silo, pelo plano da seleção (o mesmo do nome do CSV "Para escrever"). */
export function radarSerpRawPositionOf(plano: Pick<RadarSiloExportPlan, "files"> | null | undefined): (articleId: string) => { position: number | null; role: string | null } | null {
  return articleId => {
    for (const arquivo of plano?.files || []) {
      const membro = arquivo.writing?.members.find(item => item.articleId === articleId);
      if (membro) return { position: membro.position ?? null, role: membro.role ?? null };
    }
    return null;
  };
}

/**
 * O ARQUIVO DE CADA ARTIGO DO LOTE, pela montagem do export: a mesma função para
 * a rota (tela) e para o MCP. `positionOf` dá a posição e o papel no Silo (o
 * mesmo prefixo do CSV "Para escrever").
 */
export function radarSerpRawExport(input: {
  articles: readonly RadarSerpRawAssembled[];
  lookups: readonly RadarPortableSerpLensLookup[];
  today: string;
  positionOf?: (articleId: string) => { position: number | null; role: string | null } | null;
}): RadarSerpRawFile[] {
  const chave = (valor: string) => valor.trim().toLocaleLowerCase("pt-BR");
  return input.articles.map(artigo => {
    const principal = artigo.lentes.find(item => item.role === "principal")?.keyword ?? artigo.entrada.article.principalKeyword ?? "";
    const linhas = radarSerpRawRows({
      article: artigo.entrada.article,
      serpObserved: artigo.entrada.serpObserved ?? null,
      pages: artigo.entrada.serpRawPages ?? null,
      lensDigests: artigo.lensDigests ?? null,
      lensLookups: principal ? input.lookups.filter(item => chave(item.request.query.keyword) === chave(principal)) : [],
      frozenLenses: artigo.lentesCongeladas?.block?.lenses ?? null,
      sources: artigo.entrada.serpRawSources ?? null,
      /* 2026-10-18 · L3 · o território da marca com cidade, posto pela montagem do export. */
      territory: artigo.entrada.serpTerritory ?? null,
    });
    const lugar = input.positionOf?.(artigo.articleId) ?? null;
    return {
      articleId: artigo.articleId,
      filename: radarSerpRawFilename({ slug: artigo.entrada.article.slug ?? null, keyword: artigo.entrada.article.principalKeyword, position: lugar?.position ?? null, role: lugar?.role ?? null, today: input.today }),
      csv: radarSerpRawCsv(linhas),
      rows: linhas.length,
    };
  });
}
