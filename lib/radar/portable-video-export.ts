import { buildRadarYoutubeBlueprint, type RadarYoutubeBlueprint } from "./youtube-blueprint.ts";
import { RADAR_YOUTUBE_SIGNAL_LABELS, radarYoutubeCompetitiveSignal, type RadarYoutubeUniverseEntry } from "./youtube-search-model.ts";
import type { RadarYoutubeSearchRun } from "./youtube-search-run.ts";
import type { RadarYoutubeFrozenInvestigation } from "./youtube-evidence.ts";
import { RADAR_YOUTUBE_FRAMING_STARTS } from "./youtube-search-queries.ts";
import { radarTextAdheresToCore, radarUbiquitousStems } from "./intent-adherence.ts";
import { radarSemanticStems } from "./semantic-concept-model.ts";
import type { RadarPortableExportInput } from "./portable-export.ts";
import type { RadarSiloExportPlan } from "./portable-silo-export.ts";
import {
  radarBrandVoiceAbsence,
  radarBrandVoiceBySlot,
  radarBrandVoiceLabel,
  radarBrandVoiceOwnUrls,
  radarBrandVoiceText,
  type RadarBrandVoiceSection,
  type RadarBrandVoiceState,
} from "./brand-voice.ts";
import { radarPortableVideoUsageLine, type RadarPortableVideoSelected } from "./portable-annex-context.ts";
import {
  radarArticleBlueprintVideoSections,
  radarBrandVoiceSectionIsAvoid,
  radarBrandVoiceSectionIsCommercial,
  type RadarArticleBlueprintPayload,
} from "./article-blueprint.ts";
import {
  RADAR_WRITING_FUNCTION_WORDS,
  radarWritingCompareKey,
  radarWritingContentWords,
  radarWritingDate,
  radarWritingDecodeEntities,
  radarWritingOpeningQuestion,
  radarWritingOutOfScope,
  radarWritingProjections,
  radarWritingRhetoricalQuestion,
  radarWritingSpecialistContributions,
  radarWritingSpreadsheetSafe,
  radarWritingUnitOf,
  radarWritingUnsupportedClaims,
  type RadarWritingProjections,
  type RadarWritingUnit,
} from "./portable-writing-export.ts";

/**
 * ===== O EXPORT "PARA VÍDEO E REDES SOCIAIS" (pedido do dono, 2026-10-02) =====
 *
 * O CSV "para escrever" entrega a estrutura do ARTIGO. Quem grava vídeo precisa
 * de outra coisa: o que a busca do YouTube mostra, o que o público pergunta, os
 * fatos com fonte, a voz do especialista e as diretrizes de roteiro. Este
 * formato NÃO traz estrutura de artigo — nem H1, nem H2, nem plano de links,
 * nem plano visual de capa e respiros.
 *
 * As mesmas fontes do export para escrever (o pacote congelado, o dossiê e a
 * corrida do YouTube já gravada), outra projeção. Nenhuma leitura de banco,
 * nenhuma coleta, nenhum provider: o que a rota não leu não existe aqui.
 *
 * O roteiro continua sendo de quem grava: o Radar não assiste nem transcreve
 * vídeo de concorrente, e o que sai daqui é RECOMENDAÇÃO derivada da SERP.
 *
 * ===== 2026-10-02 · CAPRICHADO: O VÍDEO DO MESMO ASSUNTO DO ARTIGO (pedido do dono) =====
 *
 * "Caprichar para criar os vídeos com o mesmo assunto dos artigos, e esses
 * vídeos podem fazer parte do artigo." O teste real abriu o gancho numa
 * pergunta ampla demais, listou capítulos de assuntos misturados, deixou um
 * termo fora do escopo passar e chamou de público o texto de preenchimento do
 * DNA. As regras novas, para QUALQUER tema, marca e tipo de página:
 *
 *   - o gancho abre pelo próprio tema (principal e Assunto) e pela promessa da
 *     pesquisa do YouTube; pergunta só se ela fala da principal;
 *   - os capítulos são uma sequência numerada e escolhida (até 6): os blocos do
 *     roteiro do YouTube e, neles, as perguntas do público que aderem ao tema,
 *     pelos mesmos filtros do CSV para escrever (retórica e "não cobrir" fora);
 *   - os cortes saem dos capítulos, cada um funcionando sozinho;
 *   - o "não cobrir" vale também para termos, entidades e lacunas (régua única,
 *     `out-of-scope.ts`);
 *   - público de preenchimento cede ao trecho de público da Skill de voz;
 *   - o volume diz de onde vem (Google, Minerador);
 *   - o especialista leva a limitação de APOIO e o nome da aba Especialista;
 *   - cada vídeo do topo diz por que entrou e por qual consulta;
 *   - a linha diz em que seção do artigo o vídeo entra e o que acrescenta.
 *
 * Domínio puro: sem fetch, sem storage, sem provider, sem React.
 */

export const RADAR_VIDEO_EXPORT_COLUMNS = [
  "ordem",
  "pode_gravar",
  "tema_e_publico",
  "intencao_e_formato",
  "serp_youtube",
  "perguntas_do_publico",
  "termos_e_entidades",
  "fatos_e_fontes",
  "especialista",
  "biblioteca_da_marca",
  "diretrizes_de_roteiro",
  "cortes_para_redes",
  "prompt",
] as const;

export type RadarVideoExportColumn = typeof RADAR_VIDEO_EXPORT_COLUMNS[number];
export type RadarVideoExportRow = Record<RadarVideoExportColumn, string>;

/*
 * 2026-10-02 · `chapters`: a sequência do vídeo principal tem no máximo 6 capítulos; `cuts`: 3 cortes.
 * 2026-10-02 · `cellChars` 6 → 10 mil: com os capítulos da planta (o que entregar,
 * mostrar e a fonte de cada um) e a relevância de cada concorrente, roteiro e SERP
 * passavam de 6 mil e o corte levava o "Vídeo × artigo" e vídeos do topo. Segue
 * longe dos 32.767 por célula do Excel.
 */
export const RADAR_VIDEO_EXPORT_CELL_CHARS = 10_000;
const LIMITES = { videos: 10, questions: 12, terms: 18, sources: 6, cellChars: RADAR_VIDEO_EXPORT_CELL_CHARS, titleChars: 90, chapters: 6, cuts: 3, audienceChars: 500 } as const;

/* ============================== a pesquisa do YouTube ============================== */

/**
 * A PESQUISA DO YOUTUBE DO ARTIGO, como a rota já a leu.
 *
 * Vale para qualquer perfil: no artigo de perfil Google, a pesquisa do YouTube
 * é o complemento opcional que o dono roda para converter o artigo em vídeo.
 */
export type RadarVideoExportYoutube = {
  /** A investigação do YouTube foi congelada (fotografia), ou é a corrida viva. */
  frozen: boolean;
  collectedAt: string | null;
  queries: string[];
  /** Os vídeos comparáveis (long-form e Shorts), na ordem da melhor posição. */
  videos: RadarYoutubeUniverseEntry[];
  blueprint: RadarYoutubeBlueprint | null;
  /**
   * 2026-10-02 · Aditivo: o texto de cada consulta pelo id, para cada vídeo do
   * topo dizer por qual consulta foi encontrado. Ausente = não se sabe.
   */
  queryTextById?: Record<string, string>;
  /** 2026-10-02 · Aditivo: quantas consultas foram executadas (a base do sinal competitivo). */
  executedQueries?: number;
};

/**
 * Fotografia primeiro (a investigação congelada vence a corrida viva). Sem
 * fotografia, a corrida coletada vira blueprint pelo MESMO builder da tela.
 */
export function radarVideoExportYoutubeOf(input: {
  run: RadarYoutubeSearchRun | null | undefined;
  frozen: RadarYoutubeFrozenInvestigation | null | undefined;
  declaredIntent: string | null;
  editorialTopics: readonly string[];
  generatedAt: string;
}): RadarVideoExportYoutube | null {
  const congelada = input.frozen ?? null;
  const corrida = input.run ?? null;
  const daFotografia = congelada?.run ?? (corrida && (!congelada || congelada.runRef?.runId === corrida.runId) ? corrida : null);
  const universo = (daFotografia?.universe || []).filter(item => item.universeClass === "COMPARABLE_LONG_FORM" || item.universeClass === "COMPARABLE_SHORT");
  const blueprint = congelada?.blueprint
    ?? (corrida?.state === "COLLECTED" && corrida.universe.length
      ? buildRadarYoutubeBlueprint({ run: corrida, declaredIntent: input.declaredIntent, editorialTopics: input.editorialTopics, generatedAt: input.generatedAt })
      : null);
  if (!blueprint && !universo.length) return null;
  const textoDa = new Map((daFotografia?.queries || []).map(item => [item.queryId, item.text]));
  const executadas = (daFotografia?.queries || []).filter(item => item.executed).length || (daFotografia?.queries || []).length;
  return {
    frozen: Boolean(congelada),
    collectedAt: daFotografia?.provenance.collectedAt ?? congelada?.runRef?.collectedAt ?? null,
    queries: [...new Set((daFotografia?.queries || []).filter(item => item.executed).map(item => item.text))]
      .concat([...new Set(universo.flatMap(item => item.queriesFoundIn).map(id => textoDa.get(id)).filter((valor): valor is string => Boolean(valor)))])
      .filter((valor, indice, lista) => lista.indexOf(valor) === indice),
    videos: [...universo].sort((a, b) => a.bestRank - b.bestRank || b.occurrenceCount - a.occurrenceCount),
    blueprint,
    ...(textoDa.size ? { queryTextById: Object.fromEntries(textoDa) } : {}),
    ...(executadas ? { executedQueries: executadas } : {}),
  };
}

/* ============================== utilidades ============================== */

const texto = (valor: unknown): string => (typeof valor === "string" ? valor.trim() : "");
const cortar = (valor: string, limite: number) => (valor.length > limite ? `${valor.slice(0, limite - 1).trimEnd()}…` : valor);
const numero = (valor: number) => new Intl.NumberFormat("pt-BR").format(valor);
const unicos = (valores: readonly string[]): string[] => {
  const vistos = new Set<string>();
  return valores.filter(valor => {
    const chave = radarWritingCompareKey(valor);
    if (!chave || vistos.has(chave)) return false;
    vistos.add(chave);
    return true;
  });
};
const semPontoFinal = (valor: string) => valor.trim().replace(/[.;:\s]+$/, "");
const entreAspas = (valor: string) => `"${valor.trim().replace(/^["“]|["”]$/g, "").replace(/[.;:\s]+$/, "")}"`;
const duracao = (segundos: number | null | undefined): string | null => {
  if (typeof segundos !== "number" || segundos <= 0) return null;
  const minutos = Math.floor(segundos / 60);
  const resto = Math.round(segundos % 60);
  return minutos ? `${minutos}min${resto ? `${String(resto).padStart(2, "0")}s` : ""}` : `${resto}s`;
};
/* O endereço canônico pelo id: a coleta traz a versão de celular com rastreio (`m.youtube.com…&pp=`). */
const enderecoDoVideo = (video: Pick<RadarYoutubeUniverseEntry, "videoId" | "url" | "isShorts">): string =>
  /^[\w-]{6,}$/.test(video.videoId)
    ? `https://www.youtube.com/${video.isShorts ? `shorts/${video.videoId}` : `watch?v=${video.videoId}`}`
    : video.url;
const celula = (valor: string) => {
  const limpo = radarWritingSpreadsheetSafe(valor.replace(/\r\n?/g, "\n").trim());
  return limpo.length > LIMITES.cellChars ? `${limpo.slice(0, LIMITES.cellChars - 60).trimEnd()}\n[cortado no limite da célula]` : limpo;
};
const semAcento = (valor: string) => valor.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/*
 * 2026-10-02 · O QUE O DNA ESCREVE QUANDO O CAMPO NÃO FOI PREENCHIDO não é
 * conteúdo: "Pendente de enriquecimento e revisão humana" virava "Público:" no
 * CSV de vídeo. A mesma família de frases que o CSV para escrever ignora.
 */
const PREENCHIMENTO = /^pendente\b|pendente de enriquecimento|n[aã]o definid[oa]|ainda n[aã]o definid|^a definir\b|^cobrir com clareza o tema/i;
const util = (valor: unknown): string | null => {
  const limpo = texto(valor);
  return limpo && !PREENCHIMENTO.test(limpo) ? limpo : null;
};

/* 2026-10-02 · "o artigo" ou "a landing page": o destino do vídeo é a página que a linha descreve, de qualquer tipo. */
const aUnidade = (unidade: RadarWritingUnit) => `${unidade.feminine ? "a" : "o"} ${unidade.noun}`;
const daUnidade = (unidade: RadarWritingUnit) => `${unidade.feminine ? "da" : "do"} ${unidade.noun}`;
const naUnidade = (unidade: RadarWritingUnit) => `${unidade.feminine ? "na" : "no"} ${unidade.noun}`;

/* ============================== as colunas ============================== */

/**
 * 2026-10-02 · O PÚBLICO DA SKILL DE VOZ, quando o do artigo é preenchimento.
 * O trecho do assunto "leitor" (`radarBrandVoiceBySlot`) cujo título fala de
 * público, leitor ou persona; sem título assim, o assunto inteiro. Curto.
 */
/** 2026-10-02 · O público que o vídeo atende: o do artigo ou, sem ele, o da Skill de voz (a mesma régua da coluna de tema). */
function publicoDoVideo(input: RadarPortableExportInput, voz: RadarBrandVoiceState | undefined): string | null {
  return util(input.article.audience) || publicoDaVoz(voz)?.texto || null;
}

function publicoDaVoz(voz: RadarBrandVoiceState | undefined): { texto: string; origem: string } | null {
  if (voz?.kind !== "available") return null;
  const doLeitor = radarBrandVoiceBySlot(voz.voice).reader;
  const doPublico = doLeitor.filter(secao => /publico|leitor|leitora|persona|cliente ideal/.test(semAcento(secao.heading)));
  const secoes = doPublico.length ? doPublico : doLeitor;
  if (!secoes.length) return null;
  const titulos = secoes.map(secao => entreAspas(secao.heading.replace(/^\d+[.)]\s*/, ""))).join(", ");
  return {
    texto: cortar(secoes.map(secao => secao.body.trim()).join(" ").replace(/\s*\n+\s*/g, " "), LIMITES.audienceChars),
    origem: `${titulos} da Skill de voz da marca, ${radarBrandVoiceLabel(voz.voice)}`,
  };
}

function colunaTema(input: RadarPortableExportInput, p: RadarWritingProjections, voz: RadarBrandVoiceState | undefined): string {
  const principal = texto(p.dna.principalKeyword);
  const complementares = unicos([...p.dna.secondaryKeywords, ...p.dna.narrativeReinforcements])
    .filter(item => radarWritingCompareKey(item) !== radarWritingCompareKey(principal));
  const volume = new Map(p.keywords.map(item => [radarWritingCompareKey(item.keyword), item.volume]));
  /* 2026-10-02 · o volume é de busca no GOOGLE, medido pelo Minerador: não é audiência do YouTube. */
  const comVolume = (keyword: string) => {
    const v = volume.get(radarWritingCompareKey(keyword));
    return typeof v === "number" ? `${keyword} · ${numero(v)}/mês no Google` : keyword;
  };
  const algumVolume = [principal, ...complementares].some(keyword => typeof volume.get(radarWritingCompareKey(keyword)) === "number");
  /* 2026-10-02 · público de preenchimento do DNA não é público: vale o trecho de público da Skill de voz, com a origem dita. */
  const doArtigo = util(input.article.audience);
  const daVoz = doArtigo ? null : publicoDaVoz(voz);
  const publico = doArtigo
    ? `Público: ${doArtigo}`
    : daVoz
      ? `Público: ${daVoz.texto}\nOrigem do público: o artigo não define; vem do trecho ${daVoz.origem}.`
      : "Público: a definir (o artigo não define público e a marca não tem Skill de voz com o público).";
  return [
    `Tema (keyword principal): ${principal ? comVolume(principal) : "não resolvida no pacote"}`,
    ...(p.assunto ? [`Assunto (tronco): ${p.assunto.phrase}`] : []),
    ...(complementares.length ? ["Termos de busca relacionados (falar naturalmente, sem forçar):", ...complementares.map(item => `- ${comVolume(item)}`)] : []),
    ...(algumVolume ? ["Volume: buscas mensais no Google, do Minerador (não é audiência nem busca do YouTube)."] : []),
    publico,
    ...(util(input.article.promise) ? [`Promessa ao público: ${util(input.article.promise)}`] : []),
    ...(texto(input.article.siloName) ? [`Tema maior (Silo): ${texto(input.article.siloName)}`] : []),
  ].join("\n");
}

function colunaIntencao(input: RadarPortableExportInput, p: RadarWritingProjections, youtube: RadarVideoExportYoutube | null): string {
  const intencao = input.googleObserved?.intent ?? null;
  const bp = youtube?.blueprint ?? null;
  const linhas = [
    `Intenção declarada: ${texto(p.dna.intent) || texto(intencao?.declared) || "não declarada"}${texto(p.dna.funnel) ? ` · funil: ${texto(p.dna.funnel)}` : ""}`,
    ...(intencao?.observedInSerp ? [`Intenção na SERP do Google: ${intencao.observedInSerp}`] : []),
    ...(intencao?.note ? [`Leitura: ${intencao.note}`] : []),
  ];
  if (bp) {
    const longos = bp.observed.longForm;
    const curtos = bp.observed.shorts;
    const formatos = bp.observed.avFormats.slice(0, 4).map(item => `${item.label} (${Math.round(item.share * 100)}%)`);
    linhas.push(
      `No YouTube: ${longos.videoCount} vídeo(s) longos e ${curtos.videoCount} Shorts comparáveis na amostra.`,
      ...(formatos.length ? [`Formatos que dominam: ${formatos.join(" · ")}`] : []),
      ...(longos.durationSeconds.median ? [`Duração dos longos: mediana ${duracao(longos.durationSeconds.median)}${longos.durationSeconds.p25 && longos.durationSeconds.p75 ? ` (metade central entre ${duracao(longos.durationSeconds.p25)} e ${duracao(longos.durationSeconds.p75)})` : ""}`] : []),
      ...(curtos.durationSeconds.median ? [`Duração dos Shorts: mediana ${duracao(curtos.durationSeconds.median)}`] : []),
      ...(bp.recommended.durationSecondsRange
        ? [`Faixa recomendada: ${duracao(bp.recommended.durationSecondsRange.min)} a ${duracao(bp.recommended.durationSecondsRange.max)} — ${bp.recommended.durationSecondsRange.max <= 60 ? "a SERP aponta o formato curto (Shorts)" : "a SERP aponta o vídeo longo"} (referência, não meta)`]
        : []),
      `Formato recomendado: ${bp.recommended.format}`,
    );
  } else {
    linhas.push("YouTube: este artigo não tem pesquisa do YouTube gravada. Rode a pesquisa do YouTube no Radar para ter formato, duração e concorrência em vídeo.");
  }
  return linhas.join("\n");
}

/*
 * 2026-10-02 · POR QUE CADA VÍDEO DO TOPO ESTÁ AQUI — pela SERP, nunca pelo
 * conteúdo. A classe (long-form ou Short comparável) com o motivo do universo,
 * o sinal competitivo pela mesma função da tela (posição, consultas, recência)
 * e a consulta que o encontrou. As visualizações já estão na linha do vídeo.
 */
const CLASSE: Record<string, string> = { COMPARABLE_LONG_FORM: "vídeo longo comparável", COMPARABLE_SHORT: "Short comparável" };

/*
 * 2026-10-02 · REVISÃO: CURTO, PARA A LISTA CABER NA CÉLULA. Com dez vídeos e
 * várias consultas, o "por quê" repetia o motivo inteiro da classe e as
 * consultas por extenso em cada vídeo, e `serp_youtube` passava do teto da
 * célula — o corte levava canais, lacunas e o aviso final. Agora:
 *
 *   - o motivo da classe (`universeReason`) é dito UMA vez por classe, numa
 *     legenda antes da lista; o vídeo diz só a classe e, quando o motivo dele é
 *     outro (o Short pelo selo e o Short pela duração), o motivo próprio;
 *   - do sinal, o nível e até dois motivos (posição e data): visualizações e
 *     recorrência já estão na linha do vídeo e no número das consultas;
 *   - as consultas, pelo número da linha "Consultas:".
 */
/* Motivo "igual" ignora os números: "Short (45s)" e "Short (30s)" são o mesmo motivo. */
const chaveDoMotivo = (motivo: string) => radarWritingCompareKey(motivo).replace(/\d+/g, "#");
const emLista = (itens: readonly string[]) => (itens.length > 1 ? `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}` : itens[0] || "");

type LeituraDaLista = { motivoDaClasse: ReadonlyMap<string, string>; numeroDaConsulta: ReadonlyMap<string, number> };

function legendaDasClasses(videos: readonly RadarYoutubeUniverseEntry[]): { linha: string | null; motivoDaClasse: Map<string, string> } {
  const motivoDaClasse = new Map<string, string>();
  for (const video of videos) {
    if (!motivoDaClasse.has(video.universeClass) && texto(video.universeReason)) motivoDaClasse.set(video.universeClass, semPontoFinal(video.universeReason));
  }
  const partes = [...motivoDaClasse].map(([classe, motivo]) => `${CLASSE[classe] || classe} — ${cortar(motivo, 120)}`);
  return { linha: partes.length ? `Classe de cada vídeo (motivo do universo, pela SERP): ${partes.join("; ")}.` : null, motivoDaClasse };
}

function porQueEntrou(video: RadarYoutubeUniverseEntry, youtube: RadarVideoExportYoutube, leitura: LeituraDaLista): string {
  const sinal = radarYoutubeCompetitiveSignal({ entry: video, totalQueries: youtube.executedQueries || youtube.queries.length || 1, collectedAt: youtube.collectedAt });
  /* Visualizações e recorrência já estão na linha do vídeo e nas consultas: ficam posição e data. */
  const motivos = sinal.reasons.filter(motivo => !/visualiza|^Apareceu em /i.test(motivo)).map(semPontoFinal).slice(0, 2);
  const daLegenda = leitura.motivoDaClasse.get(video.universeClass) || "";
  const proprio = texto(video.universeReason) && chaveDoMotivo(video.universeReason) !== chaveDoMotivo(daLegenda)
    ? ` (${cortar(semPontoFinal(video.universeReason), 90)})`
    : "";
  const consultas = unicos(video.queriesFoundIn.map(id => youtube.queryTextById?.[id] || "").filter(Boolean));
  const numeros = consultas.map(consulta => leitura.numeroDaConsulta.get(radarWritingCompareKey(consulta)) ?? null);
  /* Consulta fora da linha "Consultas:" (mais de seis) vai por extenso, curta. */
  const referencias = [
    ...numeros.filter((valor): valor is number => valor !== null).sort((a, b) => a - b).map(String),
    ...consultas.filter((_, indice) => numeros[indice] === null).map(consulta => entreAspas(cortar(consulta, 60))),
  ].slice(0, 4);
  return [
    `   Por que está aqui: ${CLASSE[video.universeClass] || video.universeClass}${proprio}`,
    `${RADAR_YOUTUBE_SIGNAL_LABELS[sinal.level].toLowerCase()}${motivos.length ? `: ${motivos.join("; ")}` : ""}`,
    ...(referencias.length ? [`${referencias.length > 1 ? "consultas" : "consulta"} ${emLista(referencias)}`] : []),
  ].join(" · ");
}

/*
 * 2026-10-02 · REVISÃO: A LISTA DE VÍDEOS CABE NO QUE SOBRA DA CÉLULA. Ela é a
 * única parte que cresce com a amostra; o resto da coluna (consultas, canais,
 * padrões, termos, lacunas, os vídeos da SERP do Google e o aviso de que nada
 * foi assistido) tem tamanho limitado e nunca é cortado por ela. Vídeo que não
 * cabe sai da célula com a contagem dita — nunca o fim da coluna.
 */
const RESERVA_DA_CELULA = 20;
const RESERVA_DO_AVISO = 160;

function listaQueCabe(itens: readonly string[], folga: number): string[] {
  if (itens.reduce((soma, item) => soma + item.length + 1, 0) <= folga) return [...itens];
  const cabem: string[] = [];
  let usado = RESERVA_DO_AVISO;
  for (const item of itens) {
    if (usado + item.length + 1 > folga) break;
    cabem.push(item);
    usado += item.length + 1;
  }
  return cabem;
}

/*
 * ===== 2026-10-02 · CONSULTAS QUE REPETEM OUTRA (revisão do CSV de vídeo) =====
 *
 * O plano antigo gerava "como como atrair…" e "rotina como atrair…" sobre uma
 * principal já enquadrada (o gerador foi corrigido; corridas gravadas antes
 * continuam com elas). Um vídeo achado nas três não foi achado em três
 * perspectivas: a linha das consultas diz qual repete qual, e a contagem de
 * "aparece em N consultas" conta perspectivas distintas.
 */
function semPalavraRepetida(chave: string): string {
  return chave.replace(/\b(\S+)(?: \1\b)+/g, "$1");
}

function consultasRepetidas(consultas: readonly string[]): Map<number, { base: number; motivo: string }> {
  const chaves = consultas.map(consulta => radarWritingCompareKey(consulta));
  const saida = new Map<number, { base: number; motivo: string }>();
  for (const [indice, chave] of chaves.entries()) {
    const limpa = semPalavraRepetida(chave);
    const igual = chaves.findIndex((outra, j) => j < indice && semPalavraRepetida(outra) === limpa);
    if (igual >= 0 && limpa !== chave) { saida.set(indice, { base: igual, motivo: "palavra duplicada" }); continue; }
    const prefixo = RADAR_YOUTUBE_FRAMING_STARTS.find(inicio => limpa.startsWith(`${inicio} `));
    const resto = prefixo ? limpa.slice(prefixo.length + 1) : "";
    const jaEnquadrada = resto && RADAR_YOUTUBE_FRAMING_STARTS.some(inicio => resto.startsWith(`${inicio} `));
    const base = jaEnquadrada ? chaves.findIndex((outra, j) => j !== indice && semPalavraRepetida(outra) === resto) : -1;
    if (base >= 0) saida.set(indice, { base, motivo: `prefixo "${prefixo}" sobre uma busca já enquadrada` });
  }
  return saida;
}

/*
 * ===== 2026-10-02 · A RELEVÂNCIA DE CADA CONCORRENTE PARA O PÚBLICO =====
 *
 * Posição e visualizações não dizem se o vídeo fala com o mesmo público. Um de
 * estética, um de advocacia e um genérico entravam iguais. Pelo título e pelo
 * canal (nada foi assistido):
 *   - MESMO público: nomeia o público da marca (a primeira frase do público);
 *   - OUTRO público: "clientes de advocacia", "pacientes para contabilidade"…;
 *   - PRÓXIMO: fala do termo da busca relacionada (ex.: "pacientes");
 *   - GERAL: o resto, referência de formato.
 */
type Relevancia = "MESMO" | "PROXIMO" | "GERAL" | "OUTRO";
const RELEVANCIA: Record<Relevancia, string> = {
  MESMO: "mesmo público: referência principal",
  PROXIMO: "público próximo: referência de abordagem",
  GERAL: "tema geral: referência de formato e apresentação",
  OUTRO: "outro público: inspiração pontual, sem transportar recomendação",
};
const GENERICAS_DO_PUBLICO = new Set(radarSemanticStems("profissionais profissional pessoas que atendem atende outras especialidades entram quando o artigo tiver esse público explicitamente definido trabalham"));

type LeituraDoPublico = { publico: ReadonlySet<string>; busca: ReadonlySet<string>; nucleo: ReadonlySet<string> };

function leituraDoPublico(p: RadarWritingProjections, publico: string | null): LeituraDoPublico {
  const principal = new Set(radarSemanticStems(texto(p.dna.principalKeyword)));
  const complementares = unicos([...p.dna.secondaryKeywords, ...p.dna.narrativeReinforcements]).flatMap(item => radarSemanticStems(item));
  const nucleo = new Set([...principal, ...complementares]);
  const primeiraFrase = (publico || "").split(/(?<=[.!?])\s+/)[0] || "";
  return {
    publico: new Set(radarSemanticStems(primeiraFrase).filter(raiz => !GENERICAS_DO_PUBLICO.has(raiz) && !nucleo.has(raiz))),
    busca: new Set(complementares.filter(raiz => !principal.has(raiz))),
    nucleo,
  };
}

/* O radical não é uniforme ("pacientes" → "pacient", "paciente" → "paciente"): mesma raiz quando uma começa pela outra. */
const mesmaRaiz = (a: string, b: string) => a === b || (Math.min(a.length, b.length) >= 5 && (a.startsWith(b) || b.startsWith(a)));

function relevanciaDoVideo(video: RadarYoutubeUniverseEntry, leitura: LeituraDoPublico): Relevancia {
  const raizes = radarSemanticStems(`${radarWritingDecodeEntities(video.title)} ${video.channelName || ""}`);
  const tem = (conjunto: ReadonlySet<string>) => raizes.some(raiz => [...conjunto].some(outra => mesmaRaiz(raiz, outra)));
  if (tem(leitura.publico)) return "MESMO";
  const outro = radarWritingCompareKey(radarWritingDecodeEntities(video.title)).match(/\b(?:clientes?|pacientes?|alunos?|negocios?)\s+(?:de|para|da|do|na|no)\s+([a-z]{4,})/);
  const raizDoOutro = outro ? radarSemanticStems(outro[1])[0] : null;
  if (raizDoOutro && !leitura.nucleo.has(raizDoOutro) && !leitura.publico.has(raizDoOutro)) return "OUTRO";
  if (tem(leitura.busca)) return "PROXIMO";
  return "GERAL";
}

/* 2026-10-02 · lacunas gravadas com a frase antiga (corrida congelada antes da revisão) saem com a frase de hoje. */
function lacunaComFraseAtual(frase: string): string {
  const formato = frase.match(/^Não há (Shorts|long-form) disputando estas consultas\.$/);
  if (formato) return `Nenhum ${formato[1] === "Shorts" ? "Short" : "vídeo longo"} identificado na amostra coletada: confira se a coleta traz esse formato antes de tratar como oportunidade.`;
  if (/^Pouca autoridade declarada na amostra/.test(frase)) return "Pouca credencial visível no título ou no nome do canal: espaço para mostrar a especialidade de quem fala.";
  return frase;
}

function colunaSerpYoutube(p: RadarWritingProjections, youtube: RadarVideoExportYoutube | null, foraDoEscopo: (valor: string | null | undefined) => boolean, publico: string | null = null): string {
  const linhas: string[] = ["Referência de pesquisa, não conteúdo a copiar: não reproduza títulos, falas nem roteiros de terceiros."];
  const doPublico = leituraDoPublico(p, publico);
  const porRelevancia = new Map<Relevancia, number>();
  /* 2026-10-02 · revisão: cada vídeo do topo (linha + porquê) é um item; a lista entra depois, no espaço que sobra. */
  const lista: string[] = [];
  let posicaoDaLista = -1;
  if (youtube) {
    const data = radarWritingDate(youtube.collectedAt);
    linhas.push(`Pesquisa do YouTube${youtube.frozen ? " (congelada)" : " (corrida gravada, ainda não congelada)"}${data ? ` · coleta de ${data}` : ""}`);
    /* 2026-10-02 · revisão: numeradas, para cada vídeo citar a consulta pelo número. */
    const consultas = youtube.queries.slice(0, 6);
    const repetidas = consultasRepetidas(consultas);
    if (consultas.length) {
      linhas.push(`Consultas: ${consultas.map((consulta, indice) => {
        const repete = repetidas.get(indice);
        return `${indice + 1}) ${consulta}${repete ? ` (repete a ${repete.base + 1}: ${repete.motivo})` : ""}`;
      }).join(" · ")}`);
      if (repetidas.size) {
        linhas.push(`Consultas que repetem outra (${[...repetidas.keys()].map(indice => indice + 1).join(", ")}): vieram do plano antigo, que a próxima coleta não repete; vídeo achado nelas e na consulta de origem conta como uma perspectiva só.`);
      }
    }
    const numeroDaConsulta = new Map<string, number>();
    for (const [indice, consulta] of consultas.entries()) if (!numeroDaConsulta.has(radarWritingCompareKey(consulta))) numeroDaConsulta.set(radarWritingCompareKey(consulta), indice + 1);
    /* Número da consulta → número da consulta de origem (ela mesma, quando não repete outra). */
    const origemDaConsulta = (numero: number) => (repetidas.get(numero - 1)?.base ?? numero - 1) + 1;
    if (youtube.videos.length) {
      const doTopo = youtube.videos.slice(0, LIMITES.videos);
      const legenda = legendaDasClasses(doTopo);
      linhas.push("Vídeos no topo (melhor posição entre as consultas; o motivo é da leitura da SERP — formato, posição, consultas e data —, não do conteúdo, que não foi assistido):");
      if (legenda.linha) linhas.push(legenda.linha);
      posicaoDaLista = linhas.length;
      for (const [indice, video] of doTopo.entries()) {
        /* 2026-10-02 · perspectivas distintas: consulta que repete outra conta como a de origem. */
        const numeros = unicos(video.queriesFoundIn.map(id => youtube.queryTextById?.[id] || ""))
          .map(consulta => numeroDaConsulta.get(radarWritingCompareKey(consulta)))
          .filter((valor): valor is number => typeof valor === "number");
        const distintas = numeros.length ? new Set(numeros.map(origemDaConsulta)).size : video.occurrenceCount;
        const relevancia = relevanciaDoVideo(video, doPublico);
        porRelevancia.set(relevancia, (porRelevancia.get(relevancia) || 0) + 1);
        const partes = [
          cortar(radarWritingDecodeEntities(video.title), LIMITES.titleChars),
          video.channelName || null,
          video.isShorts ? "Short" : duracao(video.durationSeconds) || video.durationLabel,
          typeof video.views === "number" ? `${numero(video.views)} visualizações` : null,
          video.publishedAtLabel || radarWritingDate(video.publishedAt),
          distintas > 1 ? `aparece em ${distintas} consultas distintas` : null,
          enderecoDoVideo(video),
        ].filter(Boolean);
        lista.push(`${indice + 1}. ${partes.join(" · ")}\n${porQueEntrou(video, youtube, { motivoDaClasse: legenda.motivoDaClasse, numeroDaConsulta })} · relevância: ${RELEVANCIA[relevancia]}`);
      }
      if (porRelevancia.size) {
        const ordem: Relevancia[] = ["MESMO", "PROXIMO", "GERAL", "OUTRO"];
        linhas.splice(posicaoDaLista, 0, `Relevância para o público (pelo título e pelo canal; posição e visualizações não medem retenção nem contatos): ${ordem.filter(item => porRelevancia.get(item)).map(item => `${porRelevancia.get(item)} ${RELEVANCIA[item]}`).join(" · ")}.`);
        posicaoDaLista += 1;
      }
    }
    const bp = youtube.blueprint;
    if (bp) {
      const canais = bp.observed.recurrentChannels.slice(0, 5).map(canal => `${canal.channelName} (${canal.videos} vídeo(s), melhor posição ${canal.bestRank})`);
      if (canais.length) linhas.push(`Canais que dominam: ${canais.join(" · ")}`);
      /* 2026-10-02 · padrões e termos são da coorte dos vídeos longos: a linha diz, para não brigar com as oportunidades da coorte que lidera. */
      const padroes = bp.observed.longForm.titlePatterns.filter(item => item.count > 0).slice(0, 5).map(item => `${item.label} (${item.count})`);
      if (padroes.length) linhas.push(`Padrões de título (vídeos longos): ${padroes.join(" · ")}`);
      /* 2026-10-02 · o "não cobrir" vale também para os termos e as lacunas que a SERP do YouTube sugere. */
      const termos = bp.observed.longForm.recurrentTerms.map(item => item.term).filter(termo => !foraDoEscopo(termo)).slice(0, 10);
      if (termos.length) linhas.push(`Termos que se repetem nos títulos (vídeos longos): ${termos.join(" · ")}`);
      const lacunas = bp.recommended.gaps.filter(lacuna => !foraDoEscopo(lacuna.statement)).slice(0, 5);
      if (lacunas.length) {
        linhas.push("Lacunas no YouTube (onde entrar):");
        for (const lacuna of lacunas) linhas.push(`- ${lacunaComFraseAtual(lacuna.statement)} (${lacuna.evidence})`);
      }
    }
  } else {
    linhas.push("Pesquisa do YouTube: não há neste artigo.");
  }
  const naGoogle = p.serpObservada?.features?.videos || [];
  if (naGoogle.length) {
    linhas.push("Vídeos que a SERP do Google mostra para o tema:");
    for (const video of naGoogle.slice(0, 5)) linhas.push(`- ${cortar(radarWritingDecodeEntities(video.title || "sem título"), LIMITES.titleChars)} · ${video.platform}${video.format ? ` · ${video.format}` : ""} — ${video.url}`);
  }
  linhas.push("O Radar lê título, canal, duração, posição e data. Nenhum vídeo foi assistido ou transcrito: nada aqui afirma o que é dito dentro de um vídeo.");
  if (posicaoDaLista < 0) return linhas.join("\n");
  const folga = LIMITES.cellChars - RESERVA_DA_CELULA - linhas.join("\n").length;
  const cabem = listaQueCabe(lista, folga);
  const fora = lista.length - cabem.length;
  return [
    ...linhas.slice(0, posicaoDaLista),
    ...cabem,
    ...(fora ? [`(+${fora} vídeo(s) do topo não couberam nesta célula; a lista inteira está na pesquisa do YouTube, no Radar.)`] : []),
    ...linhas.slice(posicaoDaLista),
  ].join("\n");
}

/** As perguntas do público que aderem ao tema — a SERP manda, mas só o que é do assunto. */
function perguntasDoPublico(p: RadarWritingProjections, foraDoEscopo: (valor: string | null | undefined) => boolean): string[] {
  const nucleo = new Set([p.dna.principalKeyword, ...p.keywords.map(item => item.keyword)].flatMap(valor => radarSemanticStems(texto(valor))));
  /* 2026-10-02 · a MESMA régua do "não cobrir" do export para escrever: pergunta que toca assunto fora do escopo não vira capítulo. */
  const candidatas = [
    ...(p.descoberta?.answerableUnits || []).filter(unidade => unidade.importance === "CORE").map(unidade => unidade.questionOrNeed),
    ...(p.descoberta?.questionCoverageRequirements || []).map(item => item.question),
    ...(p.serpObservada?.peopleAlsoAsk || []).map(item => texto(item.question)),
    ...p.serp.questions.slice().sort((a, b) => b.pages - a.pages).map(item => item.question),
  ].map(item => radarWritingDecodeEntities(texto(item)).replace(/\s+\?/g, "?")).filter(pergunta => pergunta && !radarVideoRhetoricalQuestion(pergunta) && !foraDoEscopo(pergunta));
  /* A MESMA régua do export para escrever: raiz da principal que está em toda parte é cenário, não assunto. */
  const daPrincipal = new Set(radarSemanticStems(texto(p.dna.principalKeyword)));
  const onipresentes = new Set([...radarUbiquitousStems(candidatas)].filter(raiz => daPrincipal.has(raiz)));
  const aderentes = nucleo.size ? candidatas.filter(pergunta => radarTextAdheresToCore(pergunta, nucleo, onipresentes)) : candidatas;
  return unicos(aderentes).filter(pergunta => !/\b(faq|perguntas frequentes)\b/i.test(pergunta)).slice(0, LIMITES.questions);
}

/** Pergunta de fecho de concorrente não é dúvida do público: a MESMA régua do export para escrever. */
export const radarVideoRhetoricalQuestion = radarWritingRhetoricalQuestion;

function colunaTermos(p: RadarWritingProjections, foraDoEscopo: (valor: string | null | undefined) => boolean): string {
  const termos = unicos([
    ...p.serp.concepts.filter(item => item.status !== "ISOLATED" && item.sourceCount >= 2 && !item.label.trim().endsWith("?")).map(item => item.label),
    ...(p.descoberta?.conceptRelations || []).filter(relacao => relacao.basis === "OBSERVED").flatMap(relacao => [relacao.subject, relacao.object]),
    ...(p.serpObservada?.relatedSearches || []).map(item => texto(item.term)),
  ].map(item => radarWritingDecodeEntities(texto(item))).filter(item => item && !item.endsWith("?") && radarWritingContentWords(item).size >= 2 && !foraDoEscopo(item))).slice(0, LIMITES.terms);
  /* 2026-10-02 · o "não cobrir" vale também para as entidades: um termo fora do escopo não volta por aqui. */
  const entidades = (p.serpObservada?.diagnostic?.frequentEntities || []).filter(entidade => !foraDoEscopo(entidade)).slice(0, 8);
  return [
    ...(termos.length ? ["Termos e temas que a busca associa ao assunto (citar falando, sem lista decorada):", termos.join(" · ")] : ["Sem termos recorrentes registrados no pacote."]),
    ...(entidades.length ? [`Entidades frequentes: ${entidades.join(" · ")}`] : []),
  ].join("\n");
}

function colunaFatos(p: RadarWritingProjections): string {
  const linhas: string[] = [];
  const ymyl = p.autoridade?.ymylAssessment || null;
  if (ymyl && (ymyl.relevance === "MATERIAL" || ymyl.relevance === "HIGH")) {
    linhas.push("Tema sensível (YMYL): toda afirmação de saúde, dinheiro ou segurança precisa de fonte citada no vídeo e na descrição; nada de promessa de resultado.");
  }
  const afirmacao = new Map((p.autoridade?.claims || []).map(claim => [claim.claimId, claim.canonicalClaim]));
  const verificadas = (p.autoridade?.factualEvidence || []).filter(item => item.supportType === "SUPPORTS");
  if (verificadas.length) {
    linhas.push("Fatos com fonte verificada (pode afirmar, citando a fonte na descrição):");
    const vistas = new Set<string>();
    for (const fonte of verificadas) {
      const chave = `${fonte.sourceUrl}|${fonte.claimId}`;
      if (vistas.has(chave)) continue;
      vistas.add(chave);
      linhas.push(`- ${entreAspas(afirmacao.get(fonte.claimId) || "afirmação registrada")} — ${cortar(fonte.sourceTitle || fonte.sourceDomain, 80)} — ${fonte.sourceUrl}`);
      if (vistas.size >= LIMITES.sources) break;
    }
  } else {
    linhas.push("Fatos com fonte verificada: nenhum nesta investigação. Não afirme número, estudo nem dado técnico sem fonte.");
  }
  /* A MESMA régua do export para escrever: só afirmação que pede fonte, e só a que não tem. */
  const semFonte = unicos(radarWritingUnsupportedClaims(p.autoridade, p.serp).map(item => radarWritingDecodeEntities(item.afirmacao))).slice(0, 5);
  if (semFonte.length) {
    linhas.push("O mercado repete, mas sem fonte (não afirmar como fato):");
    for (const afirmacao of semFonte) linhas.push(`- ${entreAspas(afirmacao)}`);
  }
  const conflitos = p.autoridade?.marketVsFactConflicts || [];
  for (const conflito of conflitos.slice(0, 3)) {
    linhas.push(`Mercado × fonte: ${entreAspas(conflito.canonicalClaim)} — o mercado diz ${entreAspas(cortar(conflito.marketObservation, 140))}; a fonte diz ${entreAspas(cortar(conflito.factualPosition, 140))}. Bom gancho de vídeo: esclarecer o equívoco.`);
  }
  return linhas.join("\n");
}

/*
 * 2026-10-02 · O ESPECIALISTA NO VÍDEO.
 *
 * Quem é: o nome da aba Especialista (`input.authors`), sem credencial além do
 * cadastro; sem autoria lida, a frase de antes. A fala pode ser adaptada para
 * linguagem falada, com o MESMO sentido. E a limitação que o CSV para escrever
 * mostra viaja junto: contribuição marcada como APOIO orienta, não prova.
 */
function colunaEspecialista(input: RadarPortableExportInput, p: RadarWritingProjections): string {
  const contribuicoes = radarWritingSpecialistContributions(p);
  const pendentes = p.especialista.pending;
  const autores = input.authors ?? null;
  const nomes = autores?.map(autor => `${autor.name}${autor.specialty ? ` (${autor.specialty})` : ""}`).join(" e ") || "";
  const quem = autores
    ? autores.length
      ? `Especialista: ${nomes}, ${autores.every(autor => autor.source === "only_active") ? "único especialista ativo da marca (aba Especialista; confirme antes de gravar)" : "da aba Especialista"}; sem credencial além do cadastro.`
      : "Especialista: nenhum definido na aba Especialista do Radar; não invente nome nem credencial."
    : null;
  if (!contribuicoes.length) {
    if (quem && autores?.length) {
      return [
        quem,
        pendentes
          ? `Contribuição: ${pendentes} parecer(es) aguardando aceite no Radar; não usar até serem aceitos.`
          : "Contribuição: nenhuma aceita no Radar. A fala de quem pratica, em câmera, vale mais que qualquer roteiro — sem inventar o que ela diria.",
      ].join("\n");
    }
    return [
      ...(quem ? [quem] : []),
      pendentes
        ? `Especialista: ${pendentes} parecer(es) aguardando aceite no Radar; não usar até serem aceitos.`
        : "Especialista: sem contribuição aceita. Se houver alguém que pratica o tema, a fala dele em câmera vale mais que qualquer roteiro.",
    ].join("\n");
  }
  const fechamento = contribuicoes.filter(item => item.tipo === "FECHAMENTO" || item.tipo === "CTA");
  /* No vídeo não há "seção do artigo": o aviso de ponto de aplicação é do texto. O resto do aviso viaja inteiro. */
  const atencao = (aviso: string | null) => {
    const partes = (aviso || "").split("; ").map(item => item.trim()).filter(item => item && !/ponto de aplica/i.test(item));
    if (!partes.length) return "";
    const apoio = partes.some(item => /\bAPOIO\b/.test(item));
    return ` — Atenção: ${partes.join("; ")}${apoio ? ". No vídeo, orienta a fala; não prova fato" : ""}`;
  };
  return [
    ...(quem ? [quem] : []),
    `A voz de quem pratica (atribuir como fala do especialista${autores?.length ? "" : ", sem inventar nome nem credencial"}; pode adaptar para linguagem falada, preservando o sentido e sem acrescentar afirmação):`,
    ...contribuicoes.map(item => `- ${item.rotulo}${item.tipo ? ` (${item.tipo === "FECHAMENTO" ? "fechamento" : item.tipo === "CTA" ? "chamada final" : "diretriz"})` : ""}: ${entreAspas(item.resposta)}${atencao(item.aviso)}`),
    ...(fechamento.length ? [`Use ${fechamento.map(item => item.rotulo).join(", ")} na virada final e no CTA do vídeo.`] : []),
    ...(pendentes ? [`Há ainda ${pendentes} parecer(es) aguardando aceite no Radar.`] : []),
  ].join("\n");
}

/*
 * 2026-10-02 · UM VÍDEO SELECIONADO PELA MARCA, NA LINHA DO VÍDEO. A frase do
 * CSV para escrever (canal, trecho com tempo em Apoio e Citação, seção em
 * Incorporar) e, quando a biblioteca tem transcrição, o começo da fala — em
 * qualquer modo: quem grava precisa saber do que cada vídeo trata. A seção do
 * Incorporar é a do artigo-modelo APROVADO quando há (a mesma regra do CSV
 * para escrever).
 */
/*
 * ===== 2026-10-02 · O TRECHO DA FALA LIGADO AO TEMA (revisão do CSV de vídeo) =====
 *
 * O começo da transcrição era saudação ("olá pessoal, sejam todos bem vindos").
 * Do corpo (com teto, lido só dos vídeos com modo), a janela de ~55 palavras
 * que mais nomeia o tema e os capítulos; o capítulo mais próximo vira o ponto a
 * explicar. A transcrição automática não tem tempo por trecho aqui: a posição
 * é aproximada e o tempo exato se acha no vídeo. Idioma por palavras comuns:
 * fala em inglês pede tradução e revisão antes de virar citação.
 */
const PALAVRAS_EN = new Set(["the", "and", "you", "your", "it's", "is", "to", "of", "this", "that", "with", "for", "are", "but", "what", "they"]);
const PALAVRAS_PT = new Set(["que", "não", "nao", "de", "para", "você", "voce", "com", "uma", "um", "os", "as", "do", "da", "no", "na", "mas", "por"]);

export function radarVideoTranscriptLanguage(fala: string): "pt" | "en" | null {
  const palavras = fala.toLowerCase().split(/[^a-zà-ú']+/).filter(Boolean).slice(0, 400);
  const en = palavras.filter(palavra => PALAVRAS_EN.has(palavra)).length;
  const pt = palavras.filter(palavra => PALAVRAS_PT.has(palavra)).length;
  if (en + pt < 8) return null;
  return en > pt * 1.5 ? "en" : "pt";
}

export function radarVideoTranscriptPassage(corpo: string, raizes: ReadonlySet<string>): { text: string; position: number } | null {
  const palavras = corpo.split(/\s+/).filter(Boolean);
  if (!palavras.length || !raizes.size) return null;
  const JANELA = 55;
  const PASSO = 20;
  let melhor: { inicio: number; pontos: number } | null = null;
  /* A abertura do vídeo (saudação, apresentação do canal) perde um ponto: o trecho útil costuma vir depois. */
  const SAUDACAO = /^(ol[aá]|oi|fala|e a[ií]|bom dia|boa tarde|boa noite|sejam?|seja bem|hello|hi|hey|welcome)\b/i;
  const inicioDoVideo = Math.max(JANELA, Math.round(palavras.length * 0.08));
  for (let inicio = 0; inicio < palavras.length; inicio += PASSO) {
    const janela = palavras.slice(inicio, inicio + JANELA).join(" ");
    const raizesDaJanela = new Set(radarSemanticStems(janela));
    const pontos = [...raizes].filter(raiz => raizesDaJanela.has(raiz)).length
      - (inicio < inicioDoVideo && (inicio === 0 || SAUDACAO.test(janela)) ? 1 : 0);
    if (!melhor || pontos > melhor.pontos) melhor = { inicio, pontos };
    if (inicio + JANELA >= palavras.length) break;
  }
  if (!melhor || melhor.pontos < 2) return null;
  return { text: palavras.slice(melhor.inicio, melhor.inicio + JANELA).join(" "), position: Math.round((melhor.inicio / palavras.length) * 100) };
}

type LeituraDaFala = { raizes: ReadonlySet<string>; capitulos: readonly Capitulo[] };

function pontoDoTrecho(trecho: string, capitulos: readonly Capitulo[]): string | null {
  const doTrecho = new Set(radarSemanticStems(trecho));
  let melhor: { titulo: string; pontos: number } | null = null;
  for (const capitulo of capitulos) {
    const pontos = radarSemanticStems(`${capitulo.titulo} ${capitulo.pergunta || ""}`).filter(raiz => doTrecho.has(raiz)).length;
    if (pontos > 0 && (!melhor || pontos > melhor.pontos)) melhor = { titulo: capitulo.titulo, pontos };
  }
  return melhor?.titulo ?? null;
}

function linhaDoSelecionado(item: RadarPortableVideoSelected, artigoModelo: RadarArticleBlueprintPayload | null, fala: LeituraDaFala | null = null): string {
  const secoesDoPlano = artigoModelo ? radarArticleBlueprintVideoSections(artigoModelo, { title: item.title, url: item.url }) : null;
  const base = radarPortableVideoUsageLine(item, secoesDoPlano);
  const corpo = item.transcriptBody || item.transcriptStart || "";
  const idioma = corpo ? radarVideoTranscriptLanguage(corpo) : null;
  const trecho = fala && item.transcriptBody ? radarVideoTranscriptPassage(item.transcriptBody, fala.raizes) : null;
  const extras: string[] = [];
  if (trecho) {
    const ponto = pontoDoTrecho(trecho.text, fala!.capitulos);
    extras.push(`  Trecho ligado ao tema (transcrição automática, por volta de ${trecho.position}% do vídeo; ache o tempo exato antes de usar): "${cortar(trecho.text, 420)}"`);
    extras.push(`  Ponto a explicar: ${ponto ? `capítulo ${entreAspas(ponto)}` : "o capítulo que o trecho sustentar"} · uso: ${item.usageLabel}, atribuído ao canal.`);
  } else if (item.transcriptStart && item.summarySource !== "TRANSCRIPT") {
    extras.push(item.transcriptBody
      ? `  Começo da transcrição (nenhum trecho do tema achado no texto lido; conferir no vídeo): "${item.transcriptStart}"`
      : `  Começo da transcrição (fala do vídeo, conferir antes de usar): "${item.transcriptStart}"`);
  }
  if (idioma === "en") extras.push("  Fala em inglês: traduza e revise antes de usar; citação só traduzida e atribuída ao canal.");
  else if (corpo) extras.push("  Transcrição automática: confira as palavras no vídeo antes de citar (o reconhecimento erra nomes e termos).");
  return extras.length ? [base, ...extras].join("\n") : base;
}

function colunaBiblioteca(p: RadarWritingProjections, artigoModelo: RadarArticleBlueprintPayload | null, fala: LeituraDaFala | null = null): string {
  /*
   * 2026-10-02 · OS MODOS DE USO VÊM MESMO SEM CASAMENTO (Adendo B, D6).
   *
   * O dono pode marcar um vídeo como Incorporar ou Contexto antes de casar
   * qualquer pauta; a coluna lista esses modos depois do que já dizia. "Não
   * usar" saiu na projeção. Sem modo nenhum, a coluna é a de antes.
   */
  /*
   * 2026-10-02 · "VÍDEOS SELECIONADOS PELA MARCA", E O CANAL DE CADA UM. O
   * vídeo escolhido na biblioteca pode ser de outro canal: "reaproveitar como
   * corte" só vale para vídeo da própria marca; o de terceiro é referência
   * citada e atribuída ao canal.
   */
  const modos = p.video.selected || [];
  const comModos = (celula: string) => (modos.length
    ? [celula, "Vídeos selecionados pela marca (modo de uso escolhido no Radar, decisão do dono):", ...modos.map(item => `- ${linhaDoSelecionado(item, artigoModelo, fala)}`)].join("\n")
    : celula);
  if (p.video.state !== "MATCHED") return comModos(p.video.note);
  const linhas = ["Trechos dos vídeos selecionados pela marca (corte só de vídeo da própria marca; de outro canal, referência citada e atribuída; conferir no vídeo):"];
  for (const brief of p.video.briefs) {
    for (const trecho of brief.extracts.slice(0, 2)) {
      linhas.push(`- ${entreAspas(trecho.sourceTitle)}${texto(trecho.sourceChannel) ? ` · canal: ${texto(trecho.sourceChannel)}` : ""} ${trecho.startLabel}–${trecho.endLabel} · pauta ${entreAspas(brief.topic)} · ${cortar(texto(trecho.whyRelevant), 160)}${trecho.usageLabel ? ` · modo: ${trecho.usageLabel}` : ""}`);
    }
  }
  return comModos(linhas.join("\n"));
}

/* ============================== o roteiro ============================== */

/**
 * 2026-10-02 · UM CAPÍTULO DO VÍDEO PRINCIPAL: um bloco do roteiro que a SERP
 * do YouTube recomenda e, quando cabe, a pergunta do público que ele responde;
 * sem roteiro do YouTube, a própria pergunta.
 */
type Capitulo = {
  titulo: string;
  proposito: string | null;
  pergunta: string | null;
  /** 2026-10-02 · Aditivo: o capítulo veio da planta do artigo-modelo (seção = capítulo). */
  daPlanta?: boolean;
  /** O que explicar (até dois itens da seção). */
  explicar?: string[];
  /** O que mostrar na tela: a entrega prática da seção ou o conceito da imagem dela. */
  mostrar?: string | null;
  /** Afirmação que pede fonte antes de ser dita. */
  fonte?: string | null;
};

/*
 * ===== 2026-10-02 · OS CAPÍTULOS SAEM DA PLANTA DO ARTIGO-MODELO =====
 *
 * Revisão do CSV de vídeo: "O fundamento principal do tema", "A aplicação
 * prática do fundamento" organizavam um formulário, não diziam o que gravar. O
 * vídeo é do MESMO assunto do artigo, e a planta da SERP já tem, por seção, a
 * pergunta do leitor, a resposta que abre, o que explicar, a entrega prática, a
 * imagem e a afirmação que pede fonte. Cada seção vira um capítulo com o que
 * entregar; os blocos da SERP do YouTube ficam como referência de ritmo.
 * Sem planta (ou no formato curto), a sequência de antes.
 */
function capitulosDaPlanta(planta: RadarArticleBlueprintPayload): Capitulo[] {
  const imagens = new Map(planta.blueprint.visual.map(item => [item.slot, item]));
  return planta.blueprint.sections.slice(0, LIMITES.chapters).map(secao => {
    const imagem = secao.image ? imagens.get(secao.image as never) : null;
    const externo = secao.externalLinks[0] || null;
    return {
      titulo: secao.h2,
      proposito: texto(secao.answerFirst) || null,
      pergunta: texto(secao.readerQuestion) || null,
      daPlanta: true,
      explicar: secao.explain.map(item => texto(item)).filter(Boolean).slice(0, 2),
      mostrar: texto(secao.practical) || texto(imagem?.concept) || null,
      fonte: externo ? `${semPontoFinal(texto(externo.claim))} (${externo.source ? "fonte do pacote" : "fonte a obter: oficial ou verificada"})` : null,
    };
  });
}

function linhaDoCapituloDaPlanta(capitulo: Capitulo, indice: number): string {
  return [
    `${indice + 1}. ${capitulo.titulo}`,
    ...(capitulo.pergunta ? [`   Pergunta do público: ${entreAspas(capitulo.pergunta)}`] : []),
    ...(capitulo.proposito ? [`   Entregar: ${capitulo.proposito}`] : []),
    ...(capitulo.explicar?.length ? [`   Explicar: ${capitulo.explicar.map(semPontoFinal).join("; ")}.`] : []),
    `   Mostrar na tela: ${capitulo.mostrar ? semPontoFinal(capitulo.mostrar) : "um exemplo concreto do ponto, identificado como ilustrativo"}.`,
    ...(capitulo.fonte ? [`   Antes de afirmar: ${capitulo.fonte}; sem fonte, diga de forma delimitada.`] : []),
  ].join("\n");
}

const EH_GANCHO = /^(hook|gancho)$/;
const EH_FECHO = /^(cta|corte)$/;
const RECEBE_PERGUNTA = /^(bloco|entrega)\b/;

/**
 * A SEQUÊNCIA DO VÍDEO PRINCIPAL (2026-10-02): numerada, escolhida, até 6.
 *
 * Os blocos do roteiro recomendado pela SERP do YouTube vêm primeiro, na ordem
 * dele; o gancho e o fecho têm linha própria e não são capítulo. Os blocos de
 * conteúdo ("BLOCO 1…", "ENTREGA") recebem, em ordem, as perguntas do público
 * que aderem ao tema; sobrando vaga, as perguntas restantes viram capítulo. No
 * formato curto (a SERP aponta Shorts) não há capítulo de pergunta a mais.
 */
type Sequencia = { capitulos: Capitulo[]; curto: boolean; restantes: string[] };

function capitulosDoVideo(bp: RadarYoutubeBlueprint | null, perguntas: readonly string[], principal: string): Sequencia {
  const curto = Boolean(bp?.recommended.durationSecondsRange && bp.recommended.durationSecondsRange.max <= 60);
  /*
   * A pergunta que fala da PRINCIPAL vem antes da que só adere por uma
   * complementar ("Como captar clientes pela internet?" num vídeo sobre atrair
   * clientes pelo Instagram): o fundamento do vídeo é o tema dele. Entre iguais,
   * a ordem da SERP (mais páginas primeiro).
   */
  const fila = [...perguntas].map((pergunta, indice) => ({ pergunta, indice, peso: falaDaPrincipal(pergunta, principal) ? 0 : 1 }))
    .sort((a, b) => a.peso - b.peso || a.indice - b.indice)
    .map(item => item.pergunta);
  const capitulos: Capitulo[] = [];
  for (const bloco of bp?.recommended.script || []) {
    const nome = radarWritingCompareKey(bloco.block);
    if (EH_GANCHO.test(nome) || EH_FECHO.test(nome)) continue;
    if (capitulos.length >= LIMITES.chapters) break;
    capitulos.push({ titulo: bloco.block, proposito: texto(bloco.purpose) || null, pergunta: RECEBE_PERGUNTA.test(nome) ? fila.shift() ?? null : null });
  }
  if (!curto) {
    while (capitulos.length < LIMITES.chapters && fila.length) capitulos.push({ titulo: "Pergunta do público", proposito: null, pergunta: fila.shift()! });
  }
  return { capitulos, curto, restantes: fila };
}

const linhaDoCapitulo = (capitulo: Capitulo, indice: number) => (capitulo.proposito
  ? `${indice + 1}. ${capitulo.titulo} — ${semPontoFinal(capitulo.proposito)}${capitulo.pergunta ? `. Pergunta do público a responder aqui: ${entreAspas(capitulo.pergunta)}` : ""}`
  : `${indice + 1}. ${capitulo.titulo}: ${entreAspas(capitulo.pergunta || "")}`);

/*
 * 2026-10-02 · A PERGUNTA SÓ ABRE O VÍDEO SE FALA DA PRINCIPAL. A régua do
 * servidor para a abertura do artigo-modelo: a pergunta tem ao menos duas
 * raízes da keyword principal (ou todas, se ela tiver menos). "Como captar
 * clientes pela internet?" num vídeo sobre atrair clientes pelo Instagram é
 * ampla demais para o gancho, por mais que seja uma busca relacionada.
 */
function falaDaPrincipal(pergunta: string, principal: string): boolean {
  /* 2026-10-02 · "pelo" não é raiz do tema: "Como captar clientes pelo WhatsApp?" passava por "clientes" + "pelo". */
  const daPrincipal = radarSemanticStems(principal).filter(raiz => !RADAR_WRITING_FUNCTION_WORDS.has(raiz));
  if (!daPrincipal.length) return false;
  const daPergunta = new Set(radarSemanticStems(pergunta));
  return daPrincipal.filter(raiz => daPergunta.has(raiz)).length >= Math.min(2, daPrincipal.length);
}

/**
 * 2026-10-02 · O GANCHO PELO PRÓPRIO TEMA.
 *
 * Abre pela keyword principal, no recorte do Assunto declarado (ou, sem ele,
 * nomeando a busca relacionada mais próxima), e pela promessa que a pesquisa do
 * YouTube recomenda (estratégia "Promessa" e o padrão de título livre na
 * amostra). A pergunta de abertura do CSV para escrever só entra se falar da
 * principal. Sem pesquisa do YouTube, vale a promessa do artigo, se houver.
 */
function linhaDoGancho(input: RadarPortableExportInput, p: RadarWritingProjections, bp: RadarYoutubeBlueprint | null, abertura: string | null): string {
  const principal = texto(p.dna.principalKeyword);
  const complementar = unicos([...p.dna.secondaryKeywords, ...p.dna.narrativeReinforcements]).find(item => radarWritingCompareKey(item) !== radarWritingCompareKey(principal)) || null;
  const recorte = p.assunto ? `, no recorte ${entreAspas(p.assunto.phrase)}` : complementar ? ` (busca relacionada: ${entreAspas(complementar)})` : "";
  const tema = principal ? `abra pelo próprio tema, ${entreAspas(principal)}${recorte}` : "diga em uma frase o problema do público e o que ele leva do vídeo";
  const pergunta = abertura ? `, respondendo ${entreAspas(abertura)} logo de cara` : "";
  const estrategia = bp?.recommended.strategy.find(item => radarWritingCompareKey(item.dimension) === "promessa") || null;
  /* Sem a estratégia de promessa, o padrão de título que a coorte que lidera não usa. */
  const tituloLivre = !estrategia ? bp?.recommended.titleOpportunities[0] || null : null;
  const doGancho = bp?.recommended.script.find(bloco => EH_GANCHO.test(radarWritingCompareKey(bloco.block))) || null;
  const promessa = estrategia
    ? ` Promessa (pesquisa do YouTube): ${semPontoFinal(estrategia.recommendedStrategy)} (a SERP mostra: ${semPontoFinal(estrategia.observedSignal)}).`
    : tituloLivre
      ? ` Promessa (pesquisa do YouTube): ${semPontoFinal(tituloLivre)}.`
      : util(input.article.promise) ? ` Promessa: ${semPontoFinal(util(input.article.promise)!)}.` : "";
  return `Gancho (primeiros 15 segundos): ${tema}${pergunta}, sem apresentação longa.${promessa}${doGancho ? ` A SERP do YouTube pede para o gancho: ${semPontoFinal(doGancho.purpose)}.` : ""}`;
}

/**
 * 2026-10-02 · VÍDEO × ARTIGO: o vídeo faz parte da página.
 *
 * A seção é a do artigo-modelo quando ele existe (aprovado ou proposta, dito):
 * a que tem entrega prática, que é onde a demonstração rende; sem ela, a
 * primeira. Sem artigo-modelo, "a definir no artigo-modelo". O endereço é o
 * canonical ou o caminho do slug; o vídeo acrescenta o que o texto não mostra.
 */
function linhasDoVideoNoArtigo(unidade: RadarWritingUnit, artigoModelo: RadarArticleBlueprintPayload | null, destino: string): string[] {
  const secoes = artigoModelo?.blueprint.sections || [];
  const secao = secoes.find(item => texto(item.practical)) || secoes[0] || null;
  const estado = artigoModelo?.approval === "DRAFT" ? "proposta da IA, ainda sem aprovação" : "aprovado";
  const endereco = destino || `o endereço ${daUnidade(unidade)} quando publicad${unidade.feminine ? "a" : "o"}`;
  return [
    `Vídeo × ${unidade.noun} (o vídeo faz parte ${daUnidade(unidade)}):`,
    secao
      ? `- Complementa a seção ${entreAspas(secao.h2)} do artigo-modelo (${estado}).`
      : "- Complementa a seção: a definir no artigo-modelo (ainda não organizado para este pacote).",
    `- O que o vídeo acrescenta: ${secao && texto(secao.practical) ? `a demonstração de ${entreAspas(texto(secao.practical))}, com exemplo prático` : "demonstração e exemplo prático do que a seção explica"}, sem repetir o texto.`,
    `- Onde fica: incorporado ${naUnidade(unidade)}${destino ? ` (${destino})` : ""}, nessa seção.`,
    `- Na descrição do vídeo: o link ${daUnidade(unidade)} (${endereco}).`,
  ];
}

function colunaRoteiro(
  input: RadarPortableExportInput,
  p: RadarWritingProjections,
  youtube: RadarVideoExportYoutube | null,
  abertura: string | null,
  sequencia: Sequencia,
  artigoModelo: RadarArticleBlueprintPayload | null,
): string {
  const bp = youtube?.blueprint ?? null;
  const contribuicoes = radarWritingSpecialistContributions(p);
  const cta = contribuicoes.find(item => item.tipo === "CTA") || contribuicoes.find(item => item.tipo === "FECHAMENTO") || null;
  const destino = texto(input.article.canonical) || (texto(input.article.slug) ? `/${texto(input.article.slug)}` : "");
  const unidade = radarWritingUnitOf(input);
  const doFecho = bp?.recommended.script.find(bloco => EH_FECHO.test(radarWritingCompareKey(bloco.block))) || null;
  const { capitulos, curto } = sequencia;
  const serieCurta = sequencia.restantes.slice(0, LIMITES.chapters - 1);
  const linhas = [
    linhaDoGancho(input, p, bp, abertura),
    "Promessa clara no título e na thumbnail, a mesma que o vídeo cumpre; sem caça-clique.",
  ];
  if (bp) {
    for (const item of bp.recommended.strategy.filter(estrategia => radarWritingCompareKey(estrategia.dimension) !== "promessa").slice(0, 4)) {
      linhas.push(`${item.dimension}: ${item.recommendedStrategy} (a SERP mostra: ${item.observedSignal})`);
    }
  }
  if (capitulos.length && capitulos[0].daPlanta) {
    const estado = artigoModelo?.approval === "DRAFT" ? "proposta da IA, ainda sem aprovação: confira antes de gravar" : "aprovado";
    const ritmo = (bp?.recommended.script || []).map(bloco => bloco.block).filter(Boolean);
    linhas.push(
      `Capítulos do vídeo principal (${capitulos.length}, da planta do artigo-modelo da SERP, ${estado}; viram os marcadores de tempo da descrição). O vídeo demonstra o que o artigo explica, na mesma ordem:`,
      ...capitulos.map(linhaDoCapituloDaPlanta),
      ...(ritmo.length ? [`Ritmo que a SERP do YouTube sugere (referência, não roteiro): ${ritmo.join(" → ")}.`] : []),
      "Entregar = o que a pessoa leva do capítulo, dito no começo dele. As frases são da planta: reescreva para a fala, sem tornar regra o que a pesquisa não sustenta.",
    );
  } else if (capitulos.length) {
    linhas.push(
      curto
        ? `Sequência do vídeo (${capitulos.length} bloco(s), nesta ordem; formato curto, sem capítulos na descrição):`
        : `Capítulos do vídeo principal (${capitulos.length}, nesta ordem; viram os marcadores de tempo da descrição):`,
      ...capitulos.map(linhaDoCapitulo),
      bp?.recommended.script.length
        ? "(Blocos recomendados pela SERP do YouTube, não estrutura copiada; as perguntas são as do público que aderem ao tema, sem retórica de concorrente nem assunto fora do escopo.)"
        : "(Perguntas do público que aderem ao tema, sem retórica de concorrente nem assunto fora do escopo; ordene como o público avança.)",
    );
  } else {
    linhas.push("Capítulos: sem roteiro do YouTube nem perguntas do público aderentes no pacote; monte a sequência a partir do tema, um ponto por capítulo.");
  }
  /*
   * 2026-10-02 · NO FORMATO CURTO, UMA PERGUNTA POR VÍDEO. Quando a SERP aponta
   * Shorts, o vídeo principal responde uma pergunta só; as outras perguntas
   * aderentes viram a série, cada uma com a mesma sequência de blocos.
   */
  if (curto && serieCurta.length) {
    linhas.push(`Série no formato curto (um vídeo por pergunta do público que adere ao tema, com a mesma sequência): ${serieCurta.map(entreAspas).join("; ")}.`);
  }
  if (bp?.recommended.titleOpportunities.length) {
    const lider = bp.observed.shorts.videoCount > bp.observed.longForm.videoCount ? "Shorts" : "vídeos longos";
    linhas.push(`Oportunidades de título (coorte que lidera a amostra: ${lider}): ${bp.recommended.titleOpportunities.slice(0, 4).join(" · ")}`);
  }
  linhas.push(
    `Fechamento: ${cta ? `a fala ${cta.rotulo} do especialista` : "um próximo passo concreto para o público"}; CTA para ${destino ? `${aUnidade(unidade)} (${destino})` : `${aUnidade(unidade)} da marca`}, sem prometer resultado.${doFecho ? ` A SERP do YouTube pede para o fecho: ${semPontoFinal(doFecho.purpose)}.` : ""}`,
    `Descrição: resumo em duas linhas, ${curto || !capitulos.length ? "os capítulos com tempo" : `os ${capitulos.length} capítulos com tempo`}, fontes citadas e o link ${daUnidade(unidade)}${destino ? ` (${destino})` : ""}.`,
    ...linhasDoVideoNoArtigo(unidade, artigoModelo, destino),
    "Não inventar depoimento, número, estudo, autor nem credencial. Fala de terceiros só citada e atribuída.",
  );
  if (bp) linhas.push(bp.recommended.scriptDisclaimer);
  return linhas.join("\n");
}

/**
 * 2026-10-02 · OS CORTES SAEM DOS CAPÍTULOS do vídeo principal — não da lista
 * de perguntas. Até 3: primeiro os capítulos com pergunta do público, depois os
 * de conteúdo, e só então contexto e conclusão; na ordem do vídeo. Legenda por
 * acessibilidade e compreensão (sem afirmar como o público assiste), e a
 * ausência de Shorts é da amostra, não do mundo.
 */
/* 2026-10-02 · uma mensagem por lâmina: a primeira oração da frase, inteira (cortar no meio deixava a mensagem pela metade). */
function mensagemDaLamina(frase: string): string {
  const primeira = semPontoFinal(frase.split(/;\s*/)[0] || frase);
  const curta = cortar(primeira, 180);
  return /[.!?…]$/.test(curta) ? curta : `${curta}.`;
}

function colunaCortes(youtube: RadarVideoExportYoutube | null, sequencia: Sequencia, p: RadarWritingProjections, unidade: RadarWritingUnit, artigoModelo: RadarArticleBlueprintPayload | null = null, destino = ""): string {
  const curtos = youtube?.blueprint?.observed.shorts ?? null;
  const capitulos = sequencia.curto ? [] : sequencia.capitulos;
  const fatos = (p.autoridade?.factualEvidence || []).filter(item => item.supportType === "SUPPORTS").length;
  /* 2026-10-02 · da planta, primeiro o capítulo que tem o que mostrar: é o que rende um corte que se sustenta sozinho. */
  const peso = (capitulo: Capitulo) => (capitulo.daPlanta
    ? (capitulo.mostrar ? 0 : 1)
    : capitulo.pergunta ? 0 : /^(contexto|conclus)/.test(radarWritingCompareKey(capitulo.titulo)) ? 2 : 1);
  const escolhidos = capitulos.map((capitulo, indice) => ({ capitulo, numero: indice + 1 }))
    .sort((a, b) => peso(a.capitulo) - peso(b.capitulo) || a.numero - b.numero)
    .slice(0, LIMITES.cuts)
    .sort((a, b) => a.numero - b.numero);
  /*
   * 2026-10-02 · CADA CORTE COM CONTEÚDO PRÓPRIO (revisão do CSV de vídeo): o
   * corte era "a pergunta X e a resposta direta". Agora diz o gancho, a ideia
   * única, o que mostrar, a fonte quando a fala pede e o fechamento. Com a
   * planta, tudo vem da seção; sem ela, o que o capítulo tem.
   */
  const fechamento = `convite para o vídeo longo ou ${aUnidade(unidade)}`;
  const cortes = escolhidos.map(({ capitulo, numero: posicao }, indice) => (capitulo.daPlanta || capitulo.pergunta
    ? [
      `${indice + 1}. Do capítulo ${posicao} (${capitulo.titulo}):`,
      `   Gancho: ${capitulo.pergunta ? entreAspas(capitulo.pergunta) : `o problema do capítulo em uma frase`}`,
      `   Ideia única: ${capitulo.daPlanta && capitulo.proposito ? semPontoFinal(capitulo.proposito) : "a resposta direta à pergunta, em uma frase"}.`,
      `   Mostrar: ${capitulo.mostrar ? semPontoFinal(capitulo.mostrar) : "um exemplo concreto, identificado como ilustrativo"}.`,
      ...(capitulo.fonte ? [`   Fonte: ${capitulo.fonte}.`] : []),
      `   Fechamento: ${fechamento}.`,
    ].join("\n")
    : `${indice + 1}. Do capítulo ${posicao} (${capitulo.titulo}): ${semPontoFinal(capitulo.proposito || capitulo.titulo)}.`));
  /*
   * 2026-10-02 · O CARROSSEL COM UMA MENSAGEM POR LÂMINA e a ligação com a
   * próxima. Com a planta: capa pela promessa, uma lâmina por seção com a
   * resposta curta, lâmina final com o CTA. Sem ela, a regra.
   */
  const daPlanta = sequencia.capitulos.filter(capitulo => capitulo.daPlanta);
  const promessa = texto(artigoModelo?.blueprint.promise) || texto(artigoModelo?.blueprint.title.h1) || null;
  const carrossel = daPlanta.length
    ? [
      `Carrossel (Instagram e LinkedIn), ${daPlanta.length + 2} lâminas, uma mensagem por lâmina e cada uma puxando a próxima:`,
      `- Lâmina 1 (capa): ${promessa ? mensagemDaLamina(promessa) : "o problema do tema em uma frase."}`,
      ...daPlanta.map((capitulo, indice) => `- Lâmina ${indice + 2}: ${capitulo.titulo} — ${mensagemDaLamina(capitulo.proposito || capitulo.pergunta || capitulo.titulo)}${indice < daPlanta.length - 1 ? ` Puxa a próxima: ${entreAspas(daPlanta[indice + 1].titulo)}.` : ""}`),
      `- Lâmina ${daPlanta.length + 2}: CTA para ${aUnidade(unidade)}${destino ? ` (${destino})` : ""}, sem prometer resultado.`,
      "Fonte na lâmina quando a mensagem afirma algo que pede fonte; sem fonte, a mensagem fica delimitada.",
    ]
    : ["Carrossel (Instagram e LinkedIn): uma mensagem por lâmina, a resposta curta de cada capítulo, cada lâmina puxando a próxima, a fonte quando a mensagem afirma algo e o CTA na última."];
  return [
    !youtube
      ? "Shorts: sem pesquisa do YouTube, não há amostra de Shorts do tema; cortes podem testar o formato, sem dado de concorrência."
      : curtos && curtos.videoCount
        ? `Shorts nesta amostra: ${curtos.videoCount}${curtos.durationSeconds.median ? ` · duração mediana ${duracao(curtos.durationSeconds.median)}` : ""}. Existe espaço para cortes do tema.`
        : "Shorts: nenhum Short do tema nesta amostra; cortes podem testar o formato, sem dado de concorrência.",
    ...(sequencia.curto
      /* 2026-10-02 · a SERP aponta Shorts: o vídeo principal já é o corte; cortar de novo não faz sentido. */
      ? ["Formato curto (a SERP aponta Shorts): o próprio vídeo e cada vídeo da série servem a Shorts, Reels e TikTok, cada um funcionando sozinho; ajuste a legenda e o CTA a cada rede."]
      : cortes.length
        ? ["Cortes sugeridos (Shorts, Reels e TikTok, até 60 segundos), um por capítulo do vídeo principal; cada corte funciona sozinho, com gancho próprio e sem depender do vídeo longo:", ...cortes]
        : ["Cortes (Shorts, Reels e TikTok, até 60 segundos): um por bloco do vídeo principal, cada um funcionando sozinho, com gancho próprio."]),
    ...(fatos
      ? [sequencia.curto ? "Um fato com fonte, dito em uma frase e com a fonte na legenda, também rende um vídeo curto." : `${cortes.length + 1}. Um fato com fonte, dito em uma frase, com a fonte na legenda.`]
      : []),
    `Legenda na tela em todos os cortes, por acessibilidade e compreensão; gancho no primeiro segundo e convite para o vídeo longo ou ${aUnidade(unidade)}.`,
    ...carrossel,
  ].join("\n");
}

/*
 * 2026-10-02 · O PROMPT. Com a linha "Voz da marca" no arquivo, os dados são os
 * desta linha E os daquela. Com bloqueio na investigação, como no CSV para
 * escrever: nada de roteiro antes de resolver.
 */
function colunaPrompt(principal: string, unidade: RadarWritingUnit, opcoes: { vozAtiva: boolean; bloqueio: string | null }): string {
  if (opcoes.bloqueio) {
    return `Não escreva o roteiro deste vídeo antes de resolver o bloqueio da investigação: ${semPontoFinal(opcoes.bloqueio)}. Depois de resolvido no Radar, exporte de novo para receber o prompt do roteiro.`;
  }
  return [
    `Escreva o roteiro de um vídeo para o YouTube sobre ${entreAspas(principal || "o tema desta linha")}, em português do Brasil, usando SOMENTE os dados desta linha${opcoes.vozAtiva ? " e da linha \"Voz da marca\"" : ""}.`,
    `Entregue: 3 opções de título, o gancho dos primeiros 15 segundos (pelo próprio tema, não por uma pergunta ampla), o roteiro falado na sequência de capítulos desta linha com marcação de tempo, os capítulos para a descrição, a descrição com as fontes e o link ${daUnidade(unidade)}, e 3 cortes para Shorts/Reels/TikTok tirados dos capítulos, cada um funcionando sozinho.`,
    "Não copie títulos nem falas de concorrentes. Não invente fato, número, estudo, depoimento, autor ou credencial. Fala do especialista só a que está nesta linha, atribuída.",
  ].join("\n");
}

/* ============================== a linha ============================== */

/** `unitNoun` (2026-10-02, aditivo) só existe quando a unidade não é artigo: a linha de topo fala de "artigo ou página". */
export type RadarVideoExportArticle = { row: RadarVideoExportRow; label: string; hasYoutube: boolean; unitNoun?: string };

/**
 * 2026-10-02 · `brandVoice` e `blueprint` são aditivos: a voz (para o público
 * quando o do artigo é preenchimento) e o artigo-modelo do pacote vigente
 * (para dizer em que seção o vídeo entra). Sem eles, a linha diz o que falta.
 */
export function buildRadarVideoExportArticle(input: RadarPortableExportInput, contexto: {
  position: number;
  youtube: RadarVideoExportYoutube | null;
  brandVoiceActive?: boolean;
  brandVoice?: RadarBrandVoiceState;
  blueprint?: RadarArticleBlueprintPayload | null;
  /**
   * 2026-10-02 · Aditivo (revisão): os tópicos que o Silo do artigo exclui —
   * os MESMOS que o CSV para escrever e o artigo-modelo somam ao "não cobrir".
   * Ausente = artigo sem Silo resolvido nesta exportação, como antes.
   */
  siloExcludedTopics?: readonly string[];
}): RadarVideoExportArticle {
  const p = radarWritingProjections(input);
  const principal = texto(p.dna.principalKeyword);
  const unidade = radarWritingUnitOf(input);
  /*
   * 2026-10-02 · uma régua só de "não cobrir" para perguntas, termos, entidades e
   * lacunas (`out-of-scope.ts`). Revisão: com os rótulos do pacote E os tópicos
   * que o Silo exclui, como no CSV para escrever — antes, só os do pacote.
   */
  const foraDoEscopo = radarWritingOutOfScope(p, contexto.siloExcludedTopics || []);
  const perguntas = perguntasDoPublico(p, foraDoEscopo);
  /* 2026-10-02 · a abertura da planta vem primeiro (vídeo e artigo abrem pela mesma dúvida); depois a do CSV para escrever. */
  const daPlanta = texto(contexto.blueprint?.blueprint.opening.readerQuestion) || null;
  const daEscrita = radarWritingOpeningQuestion(p, foraDoEscopo);
  /* 2026-10-02 · a pergunta só abre o vídeo se fala da principal; senão, o gancho é o próprio tema. */
  /*
   * Com planta, só a abertura dela (e só se fala da principal): a pergunta mais
   * buscada da amostra levava ao gancho "…com mídia paga" num vídeo cujos
   * capítulos são outros. Sem planta, a do CSV para escrever.
   */
  const candidatas = contexto.blueprint ? [daPlanta] : [daEscrita];
  const abertura = candidatas.find(pergunta => pergunta && !radarVideoRhetoricalQuestion(pergunta) && falaDaPrincipal(pergunta, principal)) || null;
  const youtube = contexto.youtube;
  const artigoModelo = contexto.blueprint ?? null;
  const daSerp = capitulosDoVideo(youtube?.blueprint ?? null, perguntas, principal);
  /* 2026-10-02 · com planta (e fora do formato curto), os capítulos são as seções dela. */
  const sequencia: Sequencia = artigoModelo && !daSerp.curto && artigoModelo.blueprint.sections.length
    ? { capitulos: capitulosDaPlanta(artigoModelo), curto: false, restantes: [] }
    : daSerp;
  const vozAtiva = contexto.brandVoiceActive ?? contexto.brandVoice?.kind === "available";

  const ressalvas: string[] = [];
  if (!youtube) ressalvas.push("sem pesquisa do YouTube: formato, duração e concorrência em vídeo não foram observados");
  else if (!youtube.frozen) ressalvas.push("a pesquisa do YouTube ainda não foi congelada");
  if (!(p.autoridade?.factualEvidence || []).some(item => item.supportType === "SUPPORTS")) ressalvas.push("nenhum fato com fonte verificada");
  /* 2026-10-02 · com bloqueio, "Não" e o prompt condiciona o roteiro à resolução (como no CSV para escrever). */
  const bloqueio = p.prontidao?.state === "BLOCKED"
    ? `${p.prontidao.reasons.join("; ")}${p.prontidao.actions.length ? ` (${p.prontidao.actions.join("; ")})` : ""}`
    : null;
  const pode = bloqueio
    ? `Não, até resolver o bloqueio:\n- a investigação tem bloqueio: ${bloqueio}.${ressalvas.length ? `\n${ressalvas.map(item => `- ${item}.`).join("\n")}` : ""}`
    : ressalvas.length ? `Com ressalva:\n${ressalvas.map(item => `- ${item}.`).join("\n")}` : "Sim.";

  const row: RadarVideoExportRow = {
    ordem: String(contexto.position),
    pode_gravar: pode,
    tema_e_publico: colunaTema(input, p, contexto.brandVoice),
    intencao_e_formato: colunaIntencao(input, p, youtube),
    serp_youtube: colunaSerpYoutube(p, youtube, foraDoEscopo, publicoDoVideo(input, contexto.brandVoice)),
    perguntas_do_publico: perguntas.length
      ? ["O que o público pergunta (responder com clareza; as que aderem ao tema entram nos capítulos do roteiro):", ...perguntas.map(item => `- ${item}`)].join("\n")
      : "Sem perguntas do público registradas no pacote.",
    termos_e_entidades: colunaTermos(p, foraDoEscopo),
    fatos_e_fontes: colunaFatos(p),
    especialista: colunaEspecialista(input, p),
    biblioteca_da_marca: colunaBiblioteca(p, artigoModelo, {
      /* 2026-10-02 · o trecho da fala ligado ao tema: as raízes da principal, das complementares e dos capítulos. */
      raizes: new Set(radarSemanticStems([principal, ...p.dna.secondaryKeywords, ...p.dna.narrativeReinforcements, ...sequencia.capitulos.map(capitulo => capitulo.titulo)].join(" "))),
      capitulos: sequencia.capitulos,
    }),
    diretrizes_de_roteiro: [
      colunaRoteiro(input, p, youtube, abertura, sequencia, artigoModelo),
      ...(vozAtiva ? ['Voz da marca: gancho, fala, CTA e descrição seguem a linha "Voz da marca" deste arquivo (vocabulário, o que a marca não faz e a página comercial que ela permite citar).'] : []),
    ].join("\n"),
    cortes_para_redes: colunaCortes(youtube, sequencia, p, unidade, artigoModelo, texto(input.article.canonical) || (texto(input.article.slug) ? `/${texto(input.article.slug)}` : "")),
    prompt: colunaPrompt(principal, unidade, { vozAtiva, bloqueio }),
  };
  for (const coluna of RADAR_VIDEO_EXPORT_COLUMNS) row[coluna] = celula(row[coluna]);
  return {
    row,
    label: principal || texto(input.article.slug) || "artigo sem keyword",
    hasYoutube: Boolean(youtube),
    ...(unidade.kind !== "article" ? { unitNoun: unidade.noun } : {}),
  };
}

export const RADAR_VIDEO_GENERAL_RULES = [
  "Este arquivo é para vídeo e redes sociais: não traz estrutura de artigo, e não é para virar texto de blog.",
  "Os dados são pesquisa: não copie títulos, falas, thumbnails nem roteiros de terceiros.",
  "Fato sem fonte verificada não vira afirmação. Tema de saúde, dinheiro ou segurança pede fonte citada na descrição.",
  "A voz do especialista só entra como está na linha, atribuída, sem inventar nome nem credencial.",
  "Cada vídeo leva o público para o artigo da marca (link na descrição e no CTA).",
  /* 2026-10-02 · o vídeo do mesmo assunto também entra na página (pedido do dono). */
  "O vídeo pode fazer parte do artigo: incorporado na seção indicada em cada linha (Vídeo × artigo).",
];

export function buildRadarVideoTopRow(input: { articles: readonly RadarVideoExportArticle[]; brandVoice?: RadarBrandVoiceState }): RadarVideoExportRow {
  const semYoutube = input.articles.filter(item => !item.hasYoutube);
  const vazio = Object.fromEntries(RADAR_VIDEO_EXPORT_COLUMNS.map(coluna => [coluna, ""])) as RadarVideoExportRow;
  return {
    ...vazio,
    ordem: "Marca",
    pode_gravar: celula([
      `${input.articles.length} tema(s) neste arquivo.`,
      ...(semYoutube.length ? [`- ${semYoutube.length} sem pesquisa do YouTube: ${semYoutube.slice(0, 5).map(item => entreAspas(item.label)).join(", ")}. Rode a pesquisa do YouTube no Radar para ter os dados de vídeo.`] : []),
      input.brandVoice?.kind === "available"
        ? `- Voz da marca: linha "Voz da marca" logo abaixo (${radarBrandVoiceLabel(input.brandVoice.voice)}). Apresentador e identidade visual não fazem parte deste arquivo.`
        : input.brandVoice
          ? `- ${radarBrandVoiceAbsence(input.brandVoice)}`
          : "- Voz da marca, apresentador e identidade visual não fazem parte deste arquivo: defina-os antes de gravar.",
    ].join("\n")),
    tema_e_publico: celula(["Temas neste arquivo:", ...input.articles.map((item, indice) => `${indice + 1} · ${item.label}`)].join("\n")),
    /* 2026-10-02 · com landing page ou página de serviço no arquivo, o destino do vídeo é "o artigo ou a página". */
    prompt: celula(["Regras para todos os vídeos deste arquivo:", ...RADAR_VIDEO_GENERAL_RULES.map((regra, indice) => `${indice + 1}. ${
      input.articles.some(item => item.unitNoun)
        ? regra.replace(/\bo artigo da marca\b/, "o artigo ou a página da marca").replace(/\bdo artigo\b/g, "do artigo ou da página").replace(/\(Vídeo × artigo\)/, "(Vídeo × artigo ou página)")
        : regra
    }`)].join("\n")),
  };
}

/**
 * A LINHA "VOZ DA MARCA" DO CSV DE VÍDEO (Adendo C): a mesma Skill ativa, nas
 * colunas de público, roteiro, fontes, cortes e prompt. Sem Skill ativa, não existe.
 *
 * 2026-10-02 · SÓ O QUE SERVE AO VÍDEO (pedido do dono). Título, H1 e meta
 * ("title"), plano visual de capa e respiros ("visual"), links do artigo
 * ("links") e a estrutura do artigo que não é comercial (FAQ, dados
 * estruturados) valem para o artigo, não para o vídeo: saem das colunas e são
 * nomeadas numa frase. Ficam o público e a missão, a voz e o vocabulário, o que
 * a marca não faz e a transição comercial/CTA — com a página comercial do
 * próprio site que a Skill cita, para o CTA e a descrição.
 */
export function buildRadarVideoBrandVoiceRow(state: RadarBrandVoiceState | undefined): RadarVideoExportRow | null {
  if (state?.kind !== "available") return null;
  const por = radarBrandVoiceBySlot(state.voice);
  const evitar = state.voice.sections.filter(secao => secao.body.trim() && radarBrandVoiceSectionIsAvoid(secao.heading));
  const ehEvitar = new Set(evitar);
  const fora = (lista: readonly RadarBrandVoiceSection[]) => lista.filter(secao => !ehEvitar.has(secao));
  const comercial = fora([...por.structure, ...por.reader]).filter(secao => radarBrandVoiceSectionIsCommercial(secao.heading));
  const ehComercial = new Set(comercial);
  const soDoArtigo = [...fora(por.title), ...fora(por.structure).filter(secao => !ehComercial.has(secao)), ...fora(por.links), ...fora(por.visual)];
  const paginas = radarBrandVoiceOwnUrls(state.voice, null);
  const titulo = (secao: RadarBrandVoiceSection) => secao.heading.replace(/^\d+[.)]\s*/, "");
  const vazio = Object.fromEntries(RADAR_VIDEO_EXPORT_COLUMNS.map(coluna => [coluna, ""])) as RadarVideoExportRow;
  const row: RadarVideoExportRow = {
    ...vazio,
    ordem: "Voz da marca",
    pode_gravar: [
      `Vale para todos os vídeos deste arquivo: ${radarBrandVoiceLabel(state.voice)}. O tema vem de cada linha; o público, a voz, o CTA e o que a marca não faz vêm desta.`,
      ...(soDoArtigo.length ? [`Fica fora desta linha (vale para o artigo, não para o vídeo): ${soDoArtigo.map(titulo).join("; ")}.`] : []),
    ].join("\n"),
    tema_e_publico: radarBrandVoiceText(fora(por.reader).filter(secao => !ehComercial.has(secao))),
    serp_youtube: radarBrandVoiceText(fora(por.research)),
    fatos_e_fontes: radarBrandVoiceText(fora(por.sources)),
    diretrizes_de_roteiro: [
      ...(comercial.length ? ["CTA, oferta e transição comercial (Skill de voz):", radarBrandVoiceText(comercial)] : []),
      ...(paginas.length ? [`Página da marca citada na Skill (pode ir no CTA e na descrição do vídeo): ${paginas.join(" · ")}`] : []),
      ...(evitar.length ? ["", "O que a marca não faz (vale para o vídeo, o corte e a descrição):", radarBrandVoiceText(evitar)] : []),
    ].join("\n").trim(),
    prompt: radarBrandVoiceText(fora(por.voice)),
  };
  for (const coluna of RADAR_VIDEO_EXPORT_COLUMNS) row[coluna] = celula(row[coluna]);
  return row;
}

export function radarVideoExportCsv(rows: readonly RadarVideoExportRow[]): string {
  const campo = (valor: string) => `"${valor.replace(/"/g, "\"\"")}"`;
  return `﻿${[
    RADAR_VIDEO_EXPORT_COLUMNS.map(campo).join(","),
    ...rows.map(row => RADAR_VIDEO_EXPORT_COLUMNS.map(coluna => campo(row[coluna] ?? "")).join(",")),
  ].join("\r\n")}\r\n`;
}

export function radarVideoExportFilename(input: { keywords: ReadonlyArray<string | null>; today: string }): string {
  const data = texto(input.today).slice(0, 10);
  const primeira = input.keywords.map(texto).find(Boolean) || "temas";
  const nome = primeira.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50).replace(/-+$/, "") || "temas";
  return `radar-video-${nome}${input.keywords.length > 1 ? `-e-mais-${input.keywords.length - 1}` : ""}-${data}.csv`;
}

/** O lote: uma linha de topo e uma linha por artigo, na ordem pedida. */
export function radarPortableVideoExport(input: {
  /**
   * 2026-10-02 · `blueprint` aditivo: o artigo-modelo do pacote vigente que a montagem já leu.
   * `articleId` (aditivo, revisão): o endereço interno para casar a linha com o
   * plano do Silo; a montagem já o traz e ele nunca vai para o arquivo.
   */
  articles: ReadonlyArray<{ articleId?: string; entrada: RadarPortableExportInput; youtube?: RadarVideoExportYoutube | null; blueprint?: RadarArticleBlueprintPayload | null }>;
  today: string;
  /** 2026-10-02 · Aditivo: a voz da marca (Adendo C). */
  brandVoice?: RadarBrandVoiceState;
  /**
   * 2026-10-02 · Aditivo (revisão): o plano por Silo dos SELECIONADOS, o MESMO
   * que o CSV para escrever recebe (`selectionPlan` de `radarPortableWritingExport`).
   * Dele só sai o que o Silo de cada artigo exclui, para o "não cobrir" do vídeo
   * ser o do CSV para escrever. Sem plano, como antes: só os rótulos do pacote.
   */
  selectionPlan?: Pick<RadarSiloExportPlan, "files"> | null;
}): { csv: string; filename: string; exported: number; withoutYoutube: number } {
  const ativa = input.brandVoice?.kind === "available";
  const excluidosDoSilo = new Map<string, string[]>();
  for (const arquivo of input.selectionPlan?.files || []) {
    if (!arquivo.writing) continue;
    for (const articleId of arquivo.articleIds) excluidosDoSilo.set(articleId, arquivo.writing.excludedTopics);
  }
  const artigos = input.articles.map((artigo, indice) => buildRadarVideoExportArticle(artigo.entrada, {
    position: indice + 1,
    youtube: artigo.youtube ?? null,
    brandVoiceActive: ativa,
    brandVoice: input.brandVoice,
    blueprint: artigo.blueprint ?? null,
    ...(artigo.articleId && excluidosDoSilo.has(artigo.articleId) ? { siloExcludedTopics: excluidosDoSilo.get(artigo.articleId) } : {}),
  }));
  const voz = buildRadarVideoBrandVoiceRow(input.brandVoice);
  return {
    csv: radarVideoExportCsv([buildRadarVideoTopRow({ articles: artigos, brandVoice: input.brandVoice }), ...(voz ? [voz] : []), ...artigos.map(item => item.row)]),
    filename: radarVideoExportFilename({ keywords: artigos.map(item => item.label), today: input.today }),
    exported: artigos.length,
    withoutYoutube: artigos.filter(item => !item.hasYoutube).length,
  };
}
