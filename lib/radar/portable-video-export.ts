import { buildRadarYoutubeBlueprint, radarYoutubeRange, radarYoutubeTitleOpportunities, radarYoutubeTitlePatterns, type RadarYoutubeBlueprint, type RadarYoutubeCohort } from "./youtube-blueprint.ts";
import { RADAR_YOUTUBE_SIGNAL_LABELS, radarYoutubeCompetitiveSignal, type RadarYoutubeUniverseEntry } from "./youtube-search-model.ts";
import { radarYoutubeShortsNotice, type RadarYoutubeSearchRun } from "./youtube-search-run.ts";
import { radarYoutubeIdFromAnyUrl } from "./serp-features.ts";
import { radarCrossSerpVideoSignal } from "./multimodal-blueprint.ts";
import { radarPortableLensLabel, radarPortableSerpBlockLabel, type RadarPortableFrozenLensesInput } from "./portable-serp-observed.ts";
import { SERP_CACHE_LENSES, serpCacheLensLabel } from "../editorial/serp-cache.ts";
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
  radarBrandVoiceSectionIsArticleDelivery,
  radarBrandVoiceText,
  type RadarBrandVoice,
  type RadarBrandVoiceSection,
  type RadarBrandVoiceState,
} from "./brand-voice.ts";
import { radarPortableVideoUsageLine, type RadarPortableVideoSelected } from "./portable-annex-context.ts";
import {
  RADAR_ABSOLUTE_CLAIM,
  origemDaSecao,
  radarArticleBlueprintVideoSections,
  radarBrandVoiceSectionIsAvoid,
  radarBrandVoiceSectionIsCommercial,
  rotuloDaEvidencia,
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
/* 2026-10-07 · a trava de fonte (item 5) e a leitura competitiva (item 1) moram em módulos próprios do Radar. */
import { radarClaimCommonStems, radarClaimGate, radarClaimGateReason, radarPendingClaims, type RadarClaimGate, type RadarPendingClaim } from "./pending-claims.ts";
import {
  RADAR_VIDEO_PERTINENT,
  RADAR_VIDEO_RELEVANCE_LABELS as RELEVANCIA,
  RADAR_VIDEO_RELEVANCE_SHORT,
  radarGoogleShortVideos,
  radarSocialPieceOf,
  radarVideoAudienceReading as leituraDoPublico,
  radarVideoCohortRange,
  radarVideoCredentialMarker,
  radarVideoPertinentSample,
  radarVideoRelevance as relevanciaDoVideo,
  radarVideoTitleSignals,
  type RadarGoogleShortVideo,
  type RadarSocialPiece,
  type RadarVideoAudienceReading,
  type RadarVideoLensOrganicReading,
  type RadarVideoPertinentSample,
  type RadarVideoRelevance as Relevancia,
} from "./video-competitive.ts";

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
  /*
   * 2026-10-07 · TRÊS COLUNAS DA PESQUISA COMPETITIVA (pedido do dono: os
   * conteúdos derivados competitivos pela SERP, com os estilos de imagem para
   * o storyboard). Entram antes do prompt; as linhas "Marca" e "Voz da marca"
   * as deixam vazias.
   */
  "concorrencia_curtos_e_carrossel",
  "storyboard_visual",
  "cadeia_competitiva",
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
  /**
   * 2026-10-07 · Aditivo: as perguntas das peças SHORT da camada multiformato
   * congelada (`frozen.multimodal`), que já existiam e o CSV não lia. Entram na
   * demanda do corte (item 3): capítulo cuja pergunta é a de um Short
   * recomendado tem demanda. Ausente = sem camada multiformato.
   */
  shortQuestions?: string[];
  /**
   * 2026-10-07 · Aditivo: por que a coorte de Shorts tem zero, quando a corrida
   * mediu (`radarYoutubeShortsNotice`, a mesma frase do painel): o YouTube não
   * marcou Short nenhum, ou marcou e a leitura da coleta perdeu. Ausente =
   * nada a declarar, ou corrida anterior à medição.
   */
  shortsNotice?: string;
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
  const gravado = congelada?.blueprint
    ?? (corrida?.state === "COLLECTED" && corrida.universe.length
      ? buildRadarYoutubeBlueprint({ run: corrida, declaredIntent: input.declaredIntent, editorialTopics: input.editorialTopics, generatedAt: input.generatedAt })
      : null);
  /*
   * 2026-10-02 · OS PADRÕES DE TÍTULO, LIDOS DE NOVO DOS TÍTULOS DA AMOSTRA. A
   * fotografia guarda os padrões do classificador da época: "Problema → solução:
   * nenhum título usa" convivia com "(e o que fazer diferente)" na mesma lista.
   * Na exportação, os padrões e as oportunidades saem do classificador de hoje
   * sobre os MESMOS títulos — nada coletado, nada gravado, a fotografia intacta.
   */
  const titulosLongos = universo.filter(item => item.universeClass === "COMPARABLE_LONG_FORM").map(item => item.title);
  const padroes = titulosLongos.length ? radarYoutubeTitlePatterns(titulosLongos) : null;
  const blueprint = gravado && padroes
    ? {
      ...gravado,
      observed: { ...gravado.observed, longForm: { ...gravado.observed.longForm, titlePatterns: padroes } },
      recommended: { ...gravado.recommended, titleOpportunities: radarYoutubeTitleOpportunities(padroes) },
    }
    : gravado;
  if (!blueprint && !universo.length) return null;
  const textoDa = new Map((daFotografia?.queries || []).map(item => [item.queryId, item.text]));
  const executadas = (daFotografia?.queries || []).filter(item => item.executed).length || (daFotografia?.queries || []).length;
  const perguntasDosShorts = (congelada?.multimodal?.blueprint.recommended.pieces || [])
    .filter(peca => peca.piece === "SHORT" && texto(peca.sourceQuestion))
    .map(peca => texto(peca.sourceQuestion));
  /* 2026-10-07 · o motivo do zero de Shorts saía só no painel: agora viaja para a coluna de curtos. */
  const avisoDosShorts = daFotografia ? radarYoutubeShortsNotice(daFotografia) : null;
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
    ...(perguntasDosShorts.length ? { shortQuestions: perguntasDosShorts } : {}),
    ...(avisoDosShorts ? { shortsNotice: avisoDosShorts } : {}),
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

/*
 * 2026-10-07 (revisão) · D10 NO RÓTULO DA VOZ. `radarBrandVoiceLabel` diz o
 * estado de tela da Skill ("em rascunho", "aguardando aprovação"): certo no
 * CSV para escrever, que não muda, mas espera aberta no CSV de vídeo, que sai
 * concluído. Aqui a versão em uso é dita pelo que ela é — a corrente da Marca,
 * a mesma regra de `resolveBrandSkill` —; a ativa continua dita "ativa".
 */
const rotuloDaVoz = (voz: Pick<RadarBrandVoice, "name" | "version" | "status">) =>
  (voz.status === "active" ? radarBrandVoiceLabel(voz) : `Skill "${voz.name}" v${voz.version} (versão corrente na Marca)`);

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
    origem: `${titulos} da Skill de voz da marca, ${rotuloDaVoz(voz.voice)}`,
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

/*
 * 2026-10-07 · AS ESTATÍSTICAS SÓ COM OS PERTINENTES (pedido do dono: "caprichar
 * na pesquisa competitiva"). O CSV real dizia "10 de 44 só citam a plataforma…
 * mas entram nas estatísticas de duração e formato acima": a mediana de 15min19s
 * e os 43% de tutoriais somavam vídeo fora do tema. Agora formato, duração,
 * faixa e formato recomendado saem da amostra PERTINENTE (mesmo público,
 * público vizinho e tema geral — a mesma régua da lista do topo, lida do
 * universo inteiro), com o que ficou fora da conta dito por motivo.
 *
 * A fotografia não é recalculada nem regravada: a linha "No YouTube" continua
 * a dela, e a decisão de formato curto da sequência continua lida dela. Quando
 * os pertinentes apontam outra coisa, a divergência é DITA, não aplicada. Sem o
 * universo (congelamento que guarda só a referência da corrida), as
 * estatísticas são as da fotografia, e a linha diz que não dá para recalcular.
 */
const duracaoDaCoorte = (rotulo: string, faixa: { median: number | null; p25: number | null; p75: number | null }, comMetade = true) => (faixa.median
  ? [`${rotulo}: mediana ${duracao(faixa.median)}${comMetade && faixa.p25 && faixa.p75 ? ` (metade central entre ${duracao(faixa.p25)} e ${duracao(faixa.p75)})` : ""}`]
  : []);
const apontaDaFaixa = (faixa: { max: number }) => (faixa.max <= 60 ? "a SERP aponta o formato curto (Shorts)" : "a SERP aponta o vídeo longo");

function linhasDaFotografia(bp: RadarYoutubeBlueprint): string[] {
  const formatos = bp.observed.avFormats.slice(0, 4).map(item => `${item.label} (${Math.round(item.share * 100)}%)`);
  return [
    ...(formatos.length ? [`Formatos que dominam: ${formatos.join(" · ")}`] : []),
    ...duracaoDaCoorte("Duração dos longos", bp.observed.longForm.durationSeconds),
    ...duracaoDaCoorte("Duração dos Shorts", bp.observed.shorts.durationSeconds, false),
    ...(bp.recommended.durationSecondsRange
      ? [`Faixa recomendada: ${duracao(bp.recommended.durationSecondsRange.min)} a ${duracao(bp.recommended.durationSecondsRange.max)} — ${apontaDaFaixa(bp.recommended.durationSecondsRange)} (referência, não meta)`]
      : []),
    `Formato recomendado: ${bp.recommended.format}`,
  ];
}

/*
 * 2026-10-07 (revisão) · `inteira` (aditivo): a amostra INTEIRA lida pela MESMA
 * régua de hoje (relevância GERAL para todos). A divergência de formato
 * comparava o formato gravado na fotografia — do classificador de títulos da
 * época — com o dos pertinentes, do classificador de hoje, e atribuía à
 * pertinência uma diferença que era só do classificador, mesmo com nenhum vídeo
 * fora da conta. Agora o formato dos pertinentes é comparado com o da amostra
 * inteira pela mesma régua; a duração continua comparada com a fotografia, que
 * é o que a sequência do vídeo segue.
 */
function linhasPertinentes(bp: RadarYoutubeBlueprint, amostra: RadarVideoPertinentSample, congelada: boolean, inteira: RadarVideoPertinentSample | null = null): string[] {
  const fora = [
    ...(amostra.foraDaConta.FORA ? [`${amostra.foraDaConta.FORA} fora do tema da busca`] : []),
    ...(amostra.foraDaConta.OUTRO ? [`${amostra.foraDaConta.OUTRO} de outro público`] : []),
  ];
  const formatos = amostra.formatos.slice(0, 4).map(item => `${item.label} (${Math.round(item.share * 100)}%)`);
  /* A divergência só existe onde os dois lados têm leitura: sem formato pertinente, não há o que comparar. */
  const daFoto = bp.recommended.durationSecondsRange;
  const formatoDaAmostraInteira = inteira?.formatos.length ? inteira.formato : null;
  const formatoDiverge = Boolean(formatoDaAmostraInteira && amostra.formatos.length) && radarWritingCompareKey(formatoDaAmostraInteira) !== radarWritingCompareKey(amostra.formato);
  const curtoDiverge = Boolean(daFoto && amostra.faixa) && (daFoto!.max <= 60) !== (amostra.faixa!.max <= 60);
  const quem = congelada ? "a fotografia congelada" : "a leitura gravada da pesquisa";
  const formatoDaFaixa = (faixa: { max: number }) => (faixa.max <= 60 ? "o formato curto (Shorts)" : "o vídeo longo");
  const divergencias = [
    ...(formatoDiverge ? [`a amostra inteira aponta o formato ${formatoDaAmostraInteira} e os pertinentes, o formato ${amostra.formato}`] : []),
    ...(curtoDiverge ? [`${quem} aponta ${formatoDaFaixa(daFoto!)} e os pertinentes, ${formatoDaFaixa(amostra.faixa!)}`] : []),
  ];
  return [
    `Amostra pertinente (mesmo público, público vizinho e tema geral; pelo título e pelo canal): ${amostra.longos.coorte.videoCount} de ${amostra.longos.total} longos · ${amostra.curtos.coorte.videoCount} de ${amostra.curtos.total} Shorts.${fora.length ? ` Fora da conta: ${fora.join(" · ")}.` : ""}`,
    ...(formatos.length ? [`Formatos que dominam (pertinentes): ${formatos.join(" · ")}`] : []),
    ...duracaoDaCoorte("Duração dos longos (pertinentes)", amostra.longos.coorte.durationSeconds),
    ...duracaoDaCoorte("Duração dos Shorts (pertinentes)", amostra.curtos.coorte.durationSeconds, false),
    ...(amostra.faixa
      ? [`Faixa recomendada (pertinentes, P25–P75 da coorte que lidera): ${duracao(amostra.faixa.min)} a ${duracao(amostra.faixa.max)} — ${apontaDaFaixa(amostra.faixa)} (referência, não meta)`]
      : []),
    `Formato recomendado (pertinentes): ${amostra.formato}`,
    ...amostra.ressalvas,
    ...(divergencias.length
      ? [`Divergência: ${divergencias.join("; ")}. ${curtoDiverge ? `A sequência do vídeo segue ${quem}; a divergência fica registrada aqui, sem regravar nada.` : "O formato recomendado acima é o dos pertinentes; nada foi regravado."}`]
      : []),
  ];
}

function colunaIntencao(input: RadarPortableExportInput, p: RadarWritingProjections, youtube: RadarVideoExportYoutube | null, pertinentes: RadarVideoPertinentSample | null = null, inteira: RadarVideoPertinentSample | null = null): string {
  const intencao = input.googleObserved?.intent ?? null;
  const bp = youtube?.blueprint ?? null;
  const linhas = [
    `Intenção declarada: ${texto(p.dna.intent) || texto(intencao?.declared) || "não declarada"}${texto(p.dna.funnel) ? ` · funil: ${texto(p.dna.funnel)}` : ""}`,
    ...(intencao?.observedInSerp ? [`Intenção na SERP do Google: ${intencao.observedInSerp}`] : []),
    ...(intencao?.note ? [`Leitura: ${intencao.note}`] : []),
  ];
  if (bp) {
    linhas.push(`No YouTube: ${bp.observed.longForm.videoCount} vídeo(s) longos e ${bp.observed.shorts.videoCount} Shorts comparáveis na amostra.`);
    if (pertinentes) linhas.push(...linhasPertinentes(bp, pertinentes, Boolean(youtube?.frozen), inteira));
    else {
      linhas.push(
        ...(youtube?.frozen ? ["Amostra pertinente: não recalculável — o congelamento guarda só a referência da corrida, e a corrida com esse id não está nesta exportação; as estatísticas abaixo são da amostra inteira."] : []),
        ...linhasDaFotografia(bp),
      );
    }
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
 * 2026-10-07 · A RELEVÂNCIA DE CADA CONCORRENTE (MESMO, PRÓXIMO, GERAL, OUTRO,
 * FORA) e a leitura do público em dois níveis foram para `video-competitive.ts`
 * sem mudar de comportamento: a amostra pertinente da coluna de intenção usa a
 * MESMA régua da lista de vídeos do topo. Os nomes locais (`leituraDoPublico`,
 * `relevanciaDoVideo`, `RELEVANCIA`) seguem por importação.
 */

/*
 * 2026-10-02 · lacunas gravadas com a frase antiga (corrida congelada antes da revisão) saem com a frase de hoje.
 * 2026-10-07 (revisão) · D10: a frase do blueprint ("confira se a coleta traz
 * esse formato antes de tratar como oportunidade") deixava conferência aberta
 * no CSV de vídeo. Aqui sai concluída: não é oportunidade comprovada, e o
 * motivo do zero de Shorts (o YouTube não marcou, ou a leitura perdeu) já está
 * em concorrencia_curtos_e_carrossel. O blueprint e a tela não mudam.
 */
const LACUNA_DE_FORMATO = /^(?:Não há (Shorts|long-form) disputando estas consultas\.|Nenhum (Short|vídeo longo) identificado na amostra coletada: confira se a coleta traz esse formato antes de tratar como oportunidade\.)$/;
function lacunaComFraseAtual(frase: string): string {
  const formato = frase.match(LACUNA_DE_FORMATO);
  if (formato) {
    const curto = formato[1] === "Shorts" || formato[2] === "Short";
    return curto
      ? "Nenhum Short identificado na amostra coletada: não é oportunidade comprovada; o motivo do zero está em concorrencia_curtos_e_carrossel."
      : "Nenhum vídeo longo identificado na amostra coletada: não é oportunidade comprovada.";
  }
  if (/^Pouca autoridade declarada na amostra/.test(frase)) return "Pouca credencial visível no título ou no nome do canal: espaço para mostrar a especialidade de quem fala.";
  return frase;
}

/*
 * ===== 2026-10-07 · O QUE FOI ASSISTIDO, DITO PELO CRUZAMENTO (item 7 do desenho) =====
 *
 * O CSV real dizia "Nenhum vídeo foi assistido ou transcrito" com o 2º do topo
 * transcrito na biblioteca da marca (o dono o selecionou). O vídeo do topo
 * cujo endereço é o de um vídeo selecionado COM transcrição é dito pelo número
 * da lista, com a origem (seleção da marca, não da pesquisa) e o lugar do
 * trecho; os outros continuam não assistidos. A transcrição não entra em
 * estatística nem em cadeia: a linha só aponta onde ela está. Sem cruzamento,
 * a frase de antes.
 */
function avisoDoQueFoiAssistido(p: RadarWritingProjections, youtube: RadarVideoExportYoutube | null): string {
  const doTopo = (youtube?.videos || []).slice(0, LIMITES.videos);
  const transcritos = new Set((p.video.selected || [])
    .filter(item => texto(item.transcriptBody))
    .map(item => radarYoutubeIdFromAnyUrl(item.url))
    .filter((id): id is string => Boolean(id)));
  const numeros = doTopo.flatMap((video, indice) => (transcritos.has(video.videoId) ? [indice + 1] : []));
  if (!numeros.length) return "O Radar lê título, canal, duração, posição e data. Nenhum vídeo foi assistido ou transcrito: nada aqui afirma o que é dito dentro de um vídeo.";
  const outros = doTopo.length - numeros.length;
  const um = numeros.length === 1;
  return `O Radar lê título, canal, duração, posição e data. Do topo, ${numeros.length} ${um ? "tem" : "têm"} transcrição na biblioteca da marca (${um ? "selecionado" : "selecionados"} pela marca, não pela pesquisa): ${numeros.map(numero => `nº ${numero}`).join(", ")} da lista acima — o trecho está em biblioteca_da_marca.${outros ? ` ${outros === 1 ? "O outro não foi assistido nem transcrito" : `Os outros ${outros} não foram assistidos nem transcritos`}: nada aqui afirma o que é dito dentro ${outros === 1 ? "dele" : "deles"}.` : ""}`;
}

function colunaSerpYoutube(p: RadarWritingProjections, youtube: RadarVideoExportYoutube | null, foraDoEscopo: (valor: string | null | undefined) => boolean, publico: string | null = null): string {
  const linhas: string[] = ["Referência de pesquisa, não conteúdo a copiar: não reproduza títulos, falas nem roteiros de terceiros."];
  const doPublico = leituraDoPublico(p, publico, (youtube?.videos || []).map(video => video.title));
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
        const ordem: Relevancia[] = ["MESMO", "PROXIMO", "GERAL", "OUTRO", "FORA"];
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
  linhas.push(avisoDoQueFoiAssistido(p, youtube));
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

/*
 * 2026-10-07 · DE ONDE VEM CADA PERGUNTA (item 2 do desenho): a lista achatava
 * tudo em texto e perdia a contagem. Pela chave exata da pergunta, as origens
 * que o pacote já tem: Pessoas também perguntam, "N de M páginas" da amostra,
 * necessidade central da descoberta (com a recorrência) e pergunta a responder.
 */
function origensDasPerguntas(p: RadarWritingProjections): Map<string, string[]> {
  const saida = new Map<string, string[]>();
  const somar = (pergunta: string | null | undefined, origem: string) => {
    const chave = radarWritingCompareKey(radarWritingDecodeEntities(texto(pergunta)).replace(/\s+\?/g, "?"));
    if (!chave) return;
    const atuais = saida.get(chave) || [];
    if (!atuais.includes(origem)) saida.set(chave, [...atuais, origem]);
  };
  for (const item of p.serpObservada?.peopleAlsoAsk || []) somar(item.question, "Pessoas também perguntam");
  for (const item of p.serp.questions) somar(item.question, `${item.pages} de ${item.sampleSize} páginas`);
  for (const unidade of (p.descoberta?.answerableUnits || []).filter(item => item.importance === "CORE")) {
    const recorrencia = unidade.marketRecurrence?.recurrence;
    somar(unidade.questionOrNeed, `necessidade central${recorrencia ? `, recorrência ${RECORRENCIA[recorrencia] || recorrencia}` : ""}`);
  }
  for (const item of p.descoberta?.questionCoverageRequirements || []) somar(item.question, "pergunta a responder pela descoberta");
  return saida;
}

function colunaPerguntas(p: RadarWritingProjections, perguntas: readonly string[]): string {
  if (!perguntas.length) return "Sem perguntas do público registradas no pacote.";
  const origens = origensDasPerguntas(p);
  return [
    "O que o público pergunta (responder com clareza; as que aderem ao tema entram nos capítulos do roteiro; entre parênteses, de onde a pergunta vem):",
    ...perguntas.map(pergunta => {
      const de = origens.get(radarWritingCompareKey(pergunta)) || [];
      return `- ${pergunta}${de.length ? ` (${de.join(" · ")})` : ""}`;
    }),
  ].join("\n");
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
      /* 2026-10-07 (revisão) · D10: "confirme antes de gravar" deixava espera aberta; o arquivo diz por que o nome veio (o único ativo da aba). */
      ? `Especialista: ${nomes}, ${autores.every(autor => autor.source === "only_active") ? "único especialista ativo da marca (aba Especialista; indicado por ser o único ativo)" : "da aba Especialista"}; sem credencial além do cadastro.`
      : "Especialista: nenhum definido na aba Especialista do Radar; não invente nome nem credencial."
    : null;
  /*
   * 2026-10-07 · D10 (o entregável sai concluído): "N parecer(es) aguardando
   * aceite no Radar" deixava o arquivo de vídeo com espera aberta. O parecer
   * ainda não aceito continua fora da linha — agora dito como regra cumprida.
   */
  if (!contribuicoes.length) {
    if (quem && autores?.length) {
      return [
        quem,
        pendentes
          ? `Contribuição: nenhuma aceita no Radar; ${pendentes} parecer(es) ainda não aceito(s) ficam fora desta linha. A fala de quem pratica, em câmera, vale mais que qualquer roteiro — sem inventar o que ela diria.`
          : "Contribuição: nenhuma aceita no Radar. A fala de quem pratica, em câmera, vale mais que qualquer roteiro — sem inventar o que ela diria.",
      ].join("\n");
    }
    return [
      ...(quem ? [quem] : []),
      pendentes
        ? `Especialista: sem contribuição aceita; ${pendentes} parecer(es) ainda não aceito(s) no Radar ficam fora desta linha.`
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
    ...(pendentes ? [`${pendentes} parecer(es) ainda não aceito(s) no Radar ficam fora desta linha.`] : []),
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

/*
 * 2026-10-02 · O TEMPO APROXIMADO, NÃO A PORCENTAGEM. "Por volta de 23% do
 * vídeo" não se confere; com a duração registrada na biblioteca, a posição do
 * trecho vira um tempo estimado (mm:ss), dito como estimativa a conferir.
 * Aceita "PT8M45S", "8:45", "1:02:10" e segundos.
 */
export function radarVideoDurationSeconds(duracao: string | null | undefined): number | null {
  const valor = texto(duracao);
  if (!valor) return null;
  const iso = valor.match(/^P(?:T)?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/i);
  if (iso && (iso[1] || iso[2] || iso[3])) return Number(iso[1] || 0) * 3600 + Number(iso[2] || 0) * 60 + Math.round(Number(iso[3] || 0));
  if (/^\d+(:\d{1,2}){1,2}$/.test(valor)) return valor.split(":").map(Number).reduce((total, parte) => total * 60 + parte, 0);
  return /^\d+$/.test(valor) ? Number(valor) : null;
}

const mmss = (segundos: number) => `${Math.floor(segundos / 60)}:${String(Math.round(segundos % 60)).padStart(2, "0")}`;

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
    const total = radarVideoDurationSeconds(item.duration);
    const onde = total ? `por volta de ${mmss(Math.round((trecho.position / 100) * total))} (estimado pela posição no texto; conferir no vídeo)` : `por volta de ${trecho.position}% do vídeo (sem duração registrada; achar o tempo no vídeo)`;
    /* 2026-10-07 (revisão) · D10: "falta conferir…" era espera aberta; o estado diz o que é (trecho candidato, tempo estimado) e onde se confere. */
    extras.push(`  Estado: selecionado pela marca · trecho candidato encontrado (o tempo é estimado; tempo e palavras se conferem no vídeo, na edição).`);
    extras.push(`  Trecho candidato (transcrição automática, ${onde}): "${cortar(trecho.text, 420)}"`);
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
  /*
   * 2026-10-02 · O ESTADO SEM CONTRADIÇÃO. "Nenhum vídeo foi selecionado e
   * casado" abria a coluna e logo depois vinham os vídeos selecionados: com
   * seleção, a frase diz que o que falta é o CASAMENTO do trecho com a pauta.
   */
  const comModos = (celula: string) => (modos.length
    ? [
      p.video.state === "MATCHED" ? celula : "Nenhum trecho casado com as pautas ainda (o casamento confere a fala do vídeo contra cada pauta). Os vídeos que a marca selecionou, cada um com o trecho candidato:",
      ...(p.video.state === "MATCHED" ? ["Vídeos selecionados pela marca (modo de uso escolhido no Radar, decisão do dono):"] : []),
      ...modos.map(item => `- ${linhaDoSelecionado(item, artigoModelo, fala)}`),
    ].join("\n")
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
  /** Afirmações que pedem fonte antes de serem ditas: TODOS os links externos da seção (até 2), com a fonte quando a planta a liga. */
  fonte?: string | null;
  /**
   * 2026-10-07 · A demonstração que a planta define (objeto · antes · ajuste ·
   * depois; passos; uma ação) ou a ausência dela: alimenta o "Mostrar na tela"
   * do capítulo, o "Mostrar" do corte e o "Visual" da lâmina — uma régua só.
   */
  demo?: Demonstracao;
  /**
   * 2026-10-07 · A frase PUBLICÁVEL do capítulo depois da trava de fonte
   * (answerFirst não-absoluta e livre, ou a primeira frase livre de explicar):
   * o Apoio da lâmina e a Ideia única do corte. `fonte` é o endereço quando a
   * planta liga a frase a uma fonte do pacote; `daAbertura` diz se ela é a
   * resposta que abre o capítulo.
   */
  publicavel?: { frase: string; fonte: string | null; daAbertura: boolean } | null;
  /** 2026-10-07 · A pergunta do público, quando livre da trava: a provocação da lâmina sem frase publicável. */
  provocacao?: string | null;
  /** 2026-10-07 · As frases travadas que continuam na produção, só como fala delimitada (a linha própria do capítulo). */
  delimitadas?: string[];
  /**
   * 2026-10-07 · As frases do capítulo que a trava tirou do texto publicável, com o motivo (a lista "Fica fora").
   * 2026-10-07 (revisão) · `porta` (aditivo): a trava inteira, para a lista
   * encurtar a afirmação citada quando a célula aperta — sem perder a frase.
   */
  travadas?: Array<{ frase: string; motivo: string; porta?: Extract<RadarClaimGate, { estado: "TRAVADA" }> }>;
  /**
   * 2026-10-07 (revisão) · O "Entregar" curto, para quando a coluna de roteiro
   * encolhe: a mesma instrução sem repetir a pergunta do público (que está na
   * linha logo acima, "Pergunta do público").
   */
  propositoCurto?: string | null;
  /** 2026-10-07 (revisão) · Os links externos da seção em partes (com fonte do pacote e a obter): o "Antes de afirmar" encurta por item. */
  linksDaSecao?: { comEndereco: Array<{ afirmacao: string; onde: string }>; aObter: string[] };
  /**
   * 2026-10-07 (revisão) · Os passos da demonstração que a frase publicável
   * NOMEIA (2 ou mais): o corte mostra esses passos em sequência rápida, em vez
   * de só o primeiro — gancho, ideia e cena falam da mesma coisa (o corte 3 do
   * CSV real: ideia com três táticas e cena com uma).
   */
  passosDaIdeia?: string[];
  /** 2026-10-07 · A resposta que abre o capítulo existia, não era absoluta e a trava a tirou. */
  aberturaTravada?: boolean;
  /** 2026-10-07 · Os ids de evidência que a seção cita (evidence e from): a demanda e a oportunidade do corte. */
  evidencias?: string[];
  /**
   * 2026-10-07 · Só os links com fonte do pacote: a linha "Fonte" do corte. O
   * link pendente não chega ao corte — a frase que ele trava já saiu da ideia
   * e está na lista "Fica fora"; repeti-lo em cada corte só enchia a célula.
   */
  fonteDoCorte?: string | null;
};

/*
 * ===== 2026-10-07 · A DEMONSTRAÇÃO DEFINIDA PELA PLANTA (item 4 do desenho) =====
 *
 * "Mostrar" era a entrega prática crua ou os H3 como assunto, e o corte cortava
 * "A → B → C" em três passos. A regra 20 da planta manda escrever a entrega
 * prática como "antes → o ajuste → depois": é UMA demonstração, não três. A
 * leitura, sem inventar nada:
 *   - "→" com 3 partes ou mais: antes (a primeira), ajuste (o meio), depois (a
 *     última); com 2 partes, antes e ajuste — o depois não está na planta;
 *   - ";" na entrega prática, ou só H3 (2 ou mais): passos, uma tela por passo;
 *   - entrega prática sem separador: uma ação;
 *   - sem entrega prática e sem 2 H3: capítulo explicativo — sem demonstração,
 *     ele não vira corte, e o conceito da imagem é só contexto visual.
 * O objeto são os termos da seção cujas raízes a entrega prática ou os H3
 * nomeiam. A cena segue as regras 9 e 17 da planta: exemplo fictício e
 * identificado, nunca tela fictícia de resultado como prova, nunca antes e
 * depois de paciente ou de resultado como receita.
 */
type Demonstracao =
  | { tipo: "ANTES_DEPOIS"; objeto: string | null; antes: string; ajuste: string; depois: string | null }
  | { tipo: "PASSOS"; objeto: string | null; passos: string[] }
  | { tipo: "ACAO"; objeto: string | null; acao: string }
  | { tipo: "NENHUMA"; contexto: string | null };

/*
 * A régua da cena vai inteira UMA vez por coluna (`REGRA_DAS_CENAS`), depois
 * dos capítulos e dos cortes; cada capítulo leva só o lembrete curto. Repetida
 * em seis capítulos, ela empurrava a coluna de roteiro para o teto da célula.
 */
const REGUA_DA_CENA = "num exemplo fictício identificado como ilustrativo";
const REGRA_DAS_CENAS = "Regra das cenas (regras 9 e 17 da planta): exemplo fictício identificado como ilustrativo; sem métrica, ranking nem resultado fictício como prova; nunca antes e depois de paciente ou de resultado.";

function demonstracaoDaSecao(secao: { practical?: string | null; h3: readonly string[]; terms: readonly string[] }, conceito: string | null): Demonstracao {
  const pratica = texto(secao.practical);
  const passosDosH3 = secao.h3.map(item => semPontoFinal(texto(item))).filter(Boolean);
  const nomeado = new Set(radarSemanticStems(`${pratica} ${passosDosH3.join(" ")}`));
  const termos = secao.terms.map(texto).filter(termo => {
    const raizes = radarSemanticStems(termo).filter(raiz => !RADAR_WRITING_FUNCTION_WORDS.has(raiz));
    return raizes.length > 0 && raizes.every(raiz => nomeado.has(raiz));
  });
  /* Sem termo nomeado, sem objeto: "o que a entrega prática nomeia" não dizia nada e custava espaço na célula. */
  const objeto = termos.length ? termos.slice(0, 2).join(", ") : null;
  if (pratica) {
    const setas = pratica.split(/\s*→\s*/).map(parte => semPontoFinal(parte)).filter(Boolean);
    if (setas.length >= 3) return { tipo: "ANTES_DEPOIS", objeto, antes: setas[0], ajuste: setas.slice(1, -1).join(" → "), depois: setas[setas.length - 1] };
    if (setas.length === 2) return { tipo: "ANTES_DEPOIS", objeto, antes: setas[0], ajuste: setas[1], depois: null };
    const passos = pratica.split(/\s*;\s*/).map(parte => semPontoFinal(parte)).filter(Boolean);
    if (passos.length >= 2) return { tipo: "PASSOS", objeto, passos };
    return { tipo: "ACAO", objeto, acao: semPontoFinal(pratica) };
  }
  if (passosDosH3.length >= 2) return { tipo: "PASSOS", objeto, passos: passosDosH3 };
  return { tipo: "NENHUMA", contexto: conceito };
}

const objetoDa = (demo: Demonstracao) => (demo.tipo !== "NENHUMA" && demo.objeto ? `objeto: ${demo.objeto} · ` : "");

/** O "Mostrar na tela" do capítulo: o que o editor prepara, pela demonstração da planta. */
function mostrarNaTela(demo: Demonstracao): string {
  if (demo.tipo === "ANTES_DEPOIS") {
    return `Mostrar na tela (demonstração da planta): ${objetoDa(demo)}antes: ${demo.antes} · ajuste: ${demo.ajuste} · depois: ${demo.depois ?? "não descrito na planta — mostre o resultado do ajuste na própria tela, sem métrica"} · prepare 3 telas (uma por momento) ${REGUA_DA_CENA}.`;
  }
  if (demo.tipo === "PASSOS") return `Mostrar na tela (demonstração da planta): ${objetoDa(demo)}passos: ${demo.passos.join("; ")} · prepare uma tela por passo ${REGUA_DA_CENA}.`;
  if (demo.tipo === "ACAO") return `Mostrar na tela (demonstração da planta): ${objetoDa(demo)}ação: ${demo.acao} · prepare a tela da ação ${REGUA_DA_CENA}.`;
  return `Mostrar na tela: sem demonstração na planta (capítulo explicativo) — contexto visual: ${demo.contexto ? semPontoFinal(demo.contexto) : "o título do capítulo em destaque"}; este capítulo não vira corte.`;
}

/**
 * O "Mostrar" do corte: UMA demonstração em 60 segundos — o ajuste com o antes e o depois, a ação, ou só o primeiro passo.
 * 2026-10-07 (revisão) · `passosDaIdeia` (aditivo): quando a ideia única nomeia
 * 2+ passos, o corte mostra esses passos, uma tela rápida cada — a correção
 * automática do descompasso entre gancho, ideia e cena (D10), em vez da
 * instrução de "ficar no primeiro passo" que a cena do storyboard desmentia.
 * `limite` (aditivo) encurta cada parte quando a célula aperta.
 */
function mostrarNoCorte(demo: Demonstracao, passosDaIdeia: readonly string[] = [], limite = 0): string {
  const curta = (valor: string) => (limite ? cortar(valor, limite) : valor);
  if (demo.tipo === "ANTES_DEPOIS") {
    return demo.depois
      ? `o ajuste — ${curta(demo.ajuste)} — entre o antes (${curta(demo.antes)}) e o depois (${curta(demo.depois)}), num exemplo fictício identificado como ilustrativo`
      : `o ajuste — ${curta(demo.ajuste)} — a partir do antes (${curta(demo.antes)}), com o resultado do ajuste na própria tela, num exemplo fictício identificado como ilustrativo`;
  }
  if (demo.tipo === "PASSOS" && passosDaIdeia.length >= 2) return `os ${passosDaIdeia.length} passos que a ideia nomeia, uma tela rápida por passo — ${passosDaIdeia.map(curta).join("; ")} — num exemplo fictício identificado como ilustrativo; o detalhe de cada passo fica no vídeo longo`;
  if (demo.tipo === "PASSOS") return `só o primeiro passo — ${curta(demo.passos[0])} — num exemplo fictício identificado como ilustrativo; os outros passos ficam no vídeo longo`;
  if (demo.tipo === "ACAO") return `a ação — ${curta(demo.acao)} — num exemplo fictício identificado como ilustrativo`;
  return "um exemplo concreto, identificado como ilustrativo";
}

/*
 * 2026-10-07 (revisão) · OS PASSOS QUE A FRASE NOMEIA, pela raiz PRÓPRIA de
 * cada passo (o assunto que todos dividem — "o perfil" — não conta): a mesma
 * régua que o alinhamento já usava para dizer "a ideia nomeia 3 passos".
 */
function passosQueAFraseNomeia(frase: string, demo: Demonstracao, comuns: ReadonlySet<string>): string[] {
  if (demo.tipo !== "PASSOS") return [];
  const raizesDe = (valor: string) => palavrasDistintivas(valor, comuns).map(item => item.raiz);
  const daFrase = raizesDe(frase);
  const doPasso = demo.passos.map(passo => raizesDe(passo));
  const proprias = doPasso.map((raizes, i) => raizes.filter(raiz => !doPasso.some((outras, j) => j !== i && nomeia(outras, raiz))));
  const nomeados = demo.passos.filter((_, i) => proprias[i].some(raiz => nomeia(daFrase, raiz)));
  return nomeados.length >= 2 ? nomeados : [];
}

/** O "Visual" da lâmina: a mesma demonstração, no formato do carrossel (passos viram lista). */
function visualDaLaminaPela(demo: Demonstracao): string {
  if (demo.tipo === "ANTES_DEPOIS") return `demonstração: ${demo.antes} → ${demo.ajuste}${demo.depois ? ` → ${demo.depois}` : ""}`;
  if (demo.tipo === "PASSOS") return `os passos em lista: ${demo.passos.join("; ")}`;
  if (demo.tipo === "ACAO") return `demonstração de ${demo.acao}`;
  return demo.contexto ? semPontoFinal(demo.contexto) : "destaque do título";
}

/** 2026-10-07 · A trava de fonte da linha (item 5): as afirmações que pedem fonte e as raízes que não distinguem assunto. */
export type RadarVideoClaimLock = { pendentes: readonly RadarPendingClaim[]; comuns: ReadonlySet<string> };

const travar = (trava: RadarVideoClaimLock | null | undefined, frase: string | null | undefined, secao: number | null): RadarClaimGate =>
  (trava ? radarClaimGate(frase, trava.pendentes, secao, { comuns: trava.comuns }) : { estado: "LIVRE" });
const fonteDa = (porta: RadarClaimGate): string | null => (porta.estado === "COM_FONTE" ? porta.afirmacao.fonte?.url ?? null : null);
const comFonte = (frase: string, fonte: string | null) => (fonte ? `${semPontoFinal(frase)} (fonte: ${fonte})` : frase);
const FALA_DELIMITADA_ROTULO = "Fala delimitada, sem fonte: ";

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
/*
 * 2026-10-02 · A PREMISSA NÃO SE MULTIPLICA (revisão do CSV de vídeo). Frase
 * absoluta da planta ("foi feito para entretenimento", "procuram no Google, não
 * no Instagram") virava capítulo, corte e lâmina — cinco versões do mesmo
 * problema. No vídeo ela não entra: o "Entregar" vira a resposta à pergunta do
 * capítulo pelo que a pesquisa sustenta, e o "Explicar" absoluto sai.
 */
const semAbsoluta = (frase: string | null | undefined): string | null => {
  const limpo = texto(frase);
  return limpo && !RADAR_ABSOLUTE_CLAIM.test(limpo) ? limpo : null;
};

/* Conector de diálogo não abre gancho: "Então como eu posso…?" funciona sozinho como "Como eu posso…?". */
export function radarVideoHookQuestion(pergunta: string): string {
  const sem = pergunta.replace(/^\s*(ent[aã]o|e|mas|agora|ok|bom|beleza)[,\s]+/i, "").trim();
  return sem ? `${sem.charAt(0).toUpperCase()}${sem.slice(1)}` : pergunta;
}

function capitulosDaPlanta(planta: RadarArticleBlueprintPayload, trava: RadarVideoClaimLock | null = null): Capitulo[] {
  const imagens = new Map(planta.blueprint.visual.map(item => [item.slot, item]));
  const fontes = new Map((planta.sources || []).map(fonte => [fonte.id, fonte]));
  const evidencias = new Set((planta.evidence || []).map(item => item.id));
  return planta.blueprint.sections.slice(0, LIMITES.chapters).map((secao, indice) => {
    const imagem = secao.image ? imagens.get(secao.image as never) : null;
    const conceito = texto(imagem?.concept) || null;
    /*
     * 2026-10-02 · MOSTRAR É DEMONSTRAR. A cena da imagem da seção ("profissional
     * gravando stories") é contexto, não mostra o que o capítulo promete.
     * 2026-10-07 · e a demonstração é a que a planta define (antes · ajuste ·
     * depois, passos ou uma ação): `demonstracaoDaSecao`.
     */
    const demo = demonstracaoDaSecao({ practical: secao.practical, h3: secao.h3, terms: secao.terms || [] }, conceito);
    const pergunta = texto(secao.readerQuestion) || null;
    /*
     * 2026-10-07 · "ENTREGAR" NUNCA FICA SEM RESPOSTA (revisão do CSV real). Na
     * ordem: (a) o answerFirst não-absoluto, como antes; (b) a PRIMEIRA frase
     * não-absoluta de explicar, promovida e dita como o que a pesquisa sustenta
     * (ela não se repete na linha Explicar do mesmo capítulo); (c) sem nenhuma,
     * a instrução concluída de abrir pela pergunta e responder em fala
     * delimitada.
     *
     * 2026-10-07 · A TRAVA DE FONTE (item 5 do desenho), ponto único: cada
     * candidata passa pela porta (`radarClaimGate`) ANTES de virar Entregar,
     * Apoio da lâmina ou Ideia do corte. A frase travada não entra no texto
     * publicável; na produção (Explicar), fica como fala delimitada, sem o
     * rótulo "o que a pesquisa sustenta". Com fonte do pacote, ela fica e leva
     * a fonte.
     *
     * 2026-10-07 · D10 (o entregável sai concluído): a linha (c) dizia
     * "PENDÊNCIA: a pesquisa não fecha a resposta…". Virou instrução concluída.
     */
    const resposta = semAbsoluta(secao.answerFirst);
    const portaDaResposta = resposta ? travar(trava, resposta, indice) : null;
    const respostaLivre = resposta && portaDaResposta?.estado !== "TRAVADA" ? resposta : null;
    const explicaveis = secao.explain.map(item => semAbsoluta(item)).filter((item): item is string => Boolean(item))
      .map(frase => ({ frase, porta: travar(trava, frase, indice) }));
    const indiceDaPromovida = respostaLivre ? -1 : explicaveis.findIndex(item => item.porta.estado !== "TRAVADA");
    const promovida = indiceDaPromovida >= 0 ? explicaveis[indiceDaPromovida] : null;
    const proposito = respostaLivre
      ? comFonte(respostaLivre, fonteDa(portaDaResposta!))
      : promovida
        ? `o que a pesquisa sustenta: ${comFonte(semPontoFinal(promovida.frase), fonteDa(promovida.porta))}${pergunta ? `; a resposta completa a ${entreAspas(pergunta)} se delimita na fala` : ""}`
        : `${pergunta ? `abra pela pergunta ${entreAspas(pergunta)}` : "abra pelo título do capítulo"} e responda só com o que esta linha sustenta, em fala delimitada (sem regra universal nem afirmação sem fonte)`;
    /* 2026-10-07 (revisão) · o mesmo Entregar sem repetir a pergunta (ela está na linha acima): o roteiro encolhido usa este. */
    const propositoCurto = respostaLivre
      ? proposito
      : promovida
        ? `o que a pesquisa sustenta: ${comFonte(semPontoFinal(promovida.frase), fonteDa(promovida.porta))}${pergunta ? "; a resposta completa à pergunta se delimita na fala" : ""}`
        : `${pergunta ? "abra pela pergunta do público" : "abra pelo título do capítulo"} e responda só com o que esta linha sustenta, em fala delimitada (sem regra universal nem afirmação sem fonte)`;
    const aberturaTravada = Boolean(resposta && portaDaResposta?.estado === "TRAVADA");
    const restantes = explicaveis.filter((_, posicao) => posicao !== indiceDaPromovida).slice(0, 2);
    const explicar = restantes.filter(item => item.porta.estado !== "TRAVADA").map(item => comFonte(item.frase, fonteDa(item.porta)));
    /*
     * A frase travada continua na produção, numa linha própria de fala
     * delimitada: o prefixo dito uma vez, sem o rótulo "o que a pesquisa
     * sustenta". O teto de dois itens do Explicar vale para as duas linhas
     * juntas, como antes (a lista "Fica fora" tem todas as travadas).
     */
    const delimitadas = [
      ...(aberturaTravada ? [resposta!] : []),
      ...restantes.filter(item => item.porta.estado === "TRAVADA").map(item => item.frase),
    ];
    const portaDaPergunta = pergunta ? travar(trava, pergunta, indice) : null;
    const travadas = [
      ...(aberturaTravada && portaDaResposta?.estado === "TRAVADA" ? [{ frase: resposta!, motivo: portaDaResposta.motivo, porta: portaDaResposta }] : []),
      ...explicaveis.flatMap(item => (item.porta.estado === "TRAVADA" ? [{ frase: item.frase, motivo: item.porta.motivo, porta: item.porta }] : [])),
      ...(portaDaPergunta?.estado === "TRAVADA" ? [{ frase: pergunta!, motivo: portaDaPergunta.motivo, porta: portaDaPergunta }] : []),
    ];
    /*
     * 2026-10-07 · TODOS os links externos da seção (até 2): o vídeo lia só o
     * primeiro. Os que têm fonte do pacote levam o endereço; os pendentes vão
     * juntos, com "fonte a obter" dito uma vez.
     */
    const links = secao.externalLinks.filter(link => texto(link.claim));
    const linksDaSecao = {
      comEndereco: links.filter(link => link.source).map(link => {
        const doPacote = fontes.get(link.source!) ?? null;
        return { afirmacao: semPontoFinal(texto(link.claim)), onde: doPacote ? `fonte: ${doPacote.url}` : "fonte do pacote" };
      }),
      aObter: links.filter(link => !link.source).map(link => semPontoFinal(texto(link.claim))),
    };
    const comEndereco = linksDaSecao.comEndereco.map(item => `${item.afirmacao} (${item.onde})`);
    const fonte = fonteDosLinks(linksDaSecao);
    /* 2026-10-07 (revisão) · os passos que a frase publicável nomeia: o corte mostra esses, não só o primeiro. */
    const frasePublicavel = respostaLivre || promovida?.frase || null;
    const passosDaIdeia = frasePublicavel ? passosQueAFraseNomeia(frasePublicavel, demo, trava?.comuns || new Set<string>()) : [];
    return {
      titulo: secao.h2,
      proposito,
      pergunta,
      daPlanta: true,
      explicar,
      delimitadas,
      fonte,
      demo,
      publicavel: respostaLivre
        ? { frase: respostaLivre, fonte: fonteDa(portaDaResposta!), daAbertura: true }
        : promovida ? { frase: promovida.frase, fonte: fonteDa(promovida.porta), daAbertura: false } : null,
      provocacao: pergunta && portaDaPergunta?.estado !== "TRAVADA" ? pergunta : null,
      travadas,
      aberturaTravada,
      evidencias: [...new Set([...(secao.evidence || []), ...(secao.from || [])])].filter(id => evidencias.has(id)),
      fonteDoCorte: comEndereco.join("; ") || null,
      propositoCurto,
      linksDaSecao,
      passosDaIdeia,
    };
  });
}

/* O "Antes de afirmar" dos links da seção; `limite` (2026-10-07, revisão) encurta cada afirmação quando a célula aperta. */
function fonteDosLinks(links: NonNullable<Capitulo["linksDaSecao"]>, limite = 0): string | null {
  const curta = (valor: string) => (limite ? cortar(valor, limite) : valor);
  const comEndereco = links.comEndereco.map(item => `${curta(item.afirmacao)} (${item.onde})`);
  return [...comEndereco, ...(links.aObter.length ? [`${links.aObter.map(curta).join("; ")} (fonte a obter: oficial ou verificada)`] : [])].join("; ") || null;
}

/*
 * 2026-10-02 · A PREMISSA DO VÍDEO, dita uma vez, antes dos capítulos: a
 * promessa da planta como frase de quem fala ("Mostrar por que…" é instrução ao
 * redator; vira "O vídeo mostra por que…"). Promessa absoluta não vira premissa:
 * aí vale a pergunta da abertura.
 */
const CONJUGA: Readonly<Record<string, string>> = { mostrar: "mostra", explicar: "explica", ensinar: "ensina", ajudar: "ajuda", apresentar: "apresenta", revelar: "revela", responder: "responde", orientar: "orienta" };

/*
 * 2026-10-07 · `trava` (aditivo, item 5): a promessa que afirma sobre plataforma
 * sem fonte não vira premissa — vale a pergunta da abertura, como na promessa
 * absoluta. A tese de quem fala (promessa sem afirmação de plataforma) passa.
 */
export function radarVideoPremise(planta: RadarArticleBlueprintPayload | null, trava: RadarVideoClaimLock | null = null): string | null {
  if (!planta) return null;
  const candidata = semAbsoluta(planta.blueprint.promise);
  const promessa = candidata && travar(trava, candidata, null).estado !== "TRAVADA" ? candidata : null;
  if (promessa) {
    const [primeira, ...resto] = promessa.split(/\s+/);
    const verbo = CONJUGA[radarWritingCompareKey(primeira)];
    return comPonto(verbo ? `O vídeo ${verbo} ${resto.join(" ")}` : promessa);
  }
  const abertura = texto(planta.blueprint.opening.readerQuestion);
  return abertura ? `O vídeo responde ${entreAspas(abertura)} com o que a pesquisa sustenta.` : null;
}

const comPonto = (frase: string) => (/[.!?…]$/.test(frase) ? frase : `${frase}.`);

/*
 * ===== 2026-10-07 (revisão) · O ROTEIRO ENCOLHE EM VEZ DE SER CORTADO =====
 *
 * Com seis capítulos, respostas e explicações longas e as frases travadas,
 * diretrizes_de_roteiro passava do teto da célula, e o corte levava o fim da
 * coluna: o capítulo 6, o Fechamento com o CTA, a Descrição, o "Vídeo × artigo"
 * e o "Não inventar". Como a cadeia e o storyboard, a coluna encolhe por níveis:
 *   1 · o Entregar não repete a pergunta (ela está na linha de cima) e as
 *       frases de Explicar, da fala delimitada e do "Antes de afirmar" encurtam;
 *   2 · encurtam mais, e o "Mostrar na tela" vira a cena curta (a régua da cena
 *       continua dita uma vez, depois dos capítulos);
 *   3 · cada capítulo fica com título, pergunta, Entregar e Mostrar.
 * A coluna diz que encolheu e onde está o resto: o texto inteiro de cada seção
 * na planta do artigo-modelo (CSV para escrever) e as frases sem fonte na lista
 * "Fica fora" de cortes_para_redes. O fim da coluna nunca cai.
 */
const NIVEIS_DO_ROTEIRO = [
  { frase: 0, delimitada: 0, fonte: 0, curto: false, compacto: false, soEssencial: false },
  { frase: 180, delimitada: 110, fonte: 110, curto: true, compacto: false, soEssencial: false },
  { frase: 120, delimitada: 70, fonte: 70, curto: true, compacto: true, soEssencial: false },
  { frase: 0, delimitada: 0, fonte: 0, curto: true, compacto: true, soEssencial: true },
] as const;
type NivelDoRoteiro = typeof NIVEIS_DO_ROTEIRO[number];

/* Encurta a frase sem cortar a fonte que ela leva no fim ("… (fonte: url)"). */
function fraseCurta(valor: string, limite: number): string {
  const limpo = semPontoFinal(valor);
  if (!limite) return limpo;
  const comFonteNoFim = limpo.match(/^([\s\S]*?)( \(fonte: [^)]+\))$/);
  return comFonteNoFim ? `${cortar(comFonteNoFim[1], limite)}${comFonteNoFim[2]}` : cortar(limpo, limite);
}

/* O "Mostrar na tela" curto: a cena (quantas telas e o que cada uma mostra); sem demonstração, o capítulo é explicativo. */
function mostrarNaTelaCurto(demo: Demonstracao): string {
  if (demo.tipo === "NENHUMA") return "Mostrar na tela: sem demonstração na planta (capítulo explicativo); este capítulo não vira corte.";
  return `Mostrar na tela (demonstração da planta): ${cenaDa(demo, 70)}.`;
}

function linhaDoCapituloDaPlanta(capitulo: Capitulo, indice: number, nivel: NivelDoRoteiro = NIVEIS_DO_ROTEIRO[0]): string {
  const entregar = nivel.curto ? capitulo.propositoCurto ?? capitulo.proposito : capitulo.proposito;
  const fonte = capitulo.linksDaSecao ? fonteDosLinks(capitulo.linksDaSecao, nivel.fonte) : capitulo.fonte;
  return [
    `${indice + 1}. ${capitulo.titulo}`,
    ...(capitulo.pergunta ? [`   Pergunta do público: ${entreAspas(capitulo.pergunta)}`] : []),
    ...(entregar ? [`   Entregar: ${entregar}`] : []),
    ...(!nivel.soEssencial && capitulo.explicar?.length ? [`   Explicar: ${capitulo.explicar.map(frase => fraseCurta(frase, nivel.frase)).join("; ")}.`] : []),
    ...(!nivel.soEssencial && capitulo.delimitadas?.length ? [`   ${FALA_DELIMITADA_ROTULO}${capitulo.delimitadas.map(frase => fraseCurta(frase, nivel.delimitada)).join("; ")}.`] : []),
    /* 2026-10-07 · a demonstração da planta diz o que o editor prepara (item 4); sem ela, o capítulo é explicativo e não vira corte. */
    `   ${capitulo.demo ? (nivel.compacto ? mostrarNaTelaCurto(capitulo.demo) : mostrarNaTela(capitulo.demo)) : "Mostrar na tela: um exemplo concreto do ponto, identificado como ilustrativo."}`,
    ...(!nivel.soEssencial && fonte ? [`   Antes de afirmar: ${fonte}; sem fonte, diga de forma delimitada.`] : []),
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
/* A promessa que a pesquisa do YouTube recomenda: a estratégia "Promessa" e, sem ela, o padrão de título que a coorte que lidera não usa. */
function promessaDaPesquisa(bp: RadarYoutubeBlueprint | null): string | null {
  const estrategia = bp?.recommended.strategy.find(item => radarWritingCompareKey(item.dimension) === "promessa") || null;
  if (estrategia) return `${semPontoFinal(estrategia.recommendedStrategy)} (a SERP mostra: ${semPontoFinal(estrategia.observedSignal)})`;
  const tituloLivre = bp?.recommended.titleOpportunities[0] || null;
  return tituloLivre ? semPontoFinal(tituloLivre) : null;
}

/*
 * 2026-10-07 · `promessaDoArtigo` (aditivo, item 5): a promessa do artigo já
 * passou pela trava de fonte — a que afirma sobre plataforma sem fonte não abre
 * o vídeo. Ausente, a promessa do artigo como antes.
 */
function linhaDoGancho(input: RadarPortableExportInput, p: RadarWritingProjections, bp: RadarYoutubeBlueprint | null, abertura: string | null, promessaDoArtigo: string | null = util(input.article.promise)): string {
  const principal = texto(p.dna.principalKeyword);
  const complementar = unicos([...p.dna.secondaryKeywords, ...p.dna.narrativeReinforcements]).find(item => radarWritingCompareKey(item) !== radarWritingCompareKey(principal)) || null;
  const recorte = p.assunto ? `, no recorte ${entreAspas(p.assunto.phrase)}` : complementar ? ` (busca relacionada: ${entreAspas(complementar)})` : "";
  const tema = principal ? `abra pelo próprio tema, ${entreAspas(principal)}${recorte}` : "diga em uma frase o problema do público e o que ele leva do vídeo";
  const pergunta = abertura ? `, respondendo ${entreAspas(abertura)} logo de cara` : "";
  const daPesquisa = promessaDaPesquisa(bp);
  const doGancho = bp?.recommended.script.find(bloco => EH_GANCHO.test(radarWritingCompareKey(bloco.block))) || null;
  const promessa = daPesquisa
    ? ` Promessa (pesquisa do YouTube): ${daPesquisa}.`
    : promessaDoArtigo ? ` Promessa: ${semPontoFinal(promessaDoArtigo)}.` : "";
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
  const endereco = destino || `o endereço ${daUnidade(unidade)} quando publicad${unidade.feminine ? "a" : "o"}`;
  return [
    `Vídeo × ${unidade.noun} (o vídeo faz parte ${daUnidade(unidade)}):`,
    secao
      ? `- Complementa a seção ${entreAspas(secao.h2)} do artigo-modelo da SERP.`
      : "- Complementa a seção: a definir no artigo-modelo (ainda não organizado para este pacote).",
    `- O que o vídeo acrescenta: ${secao && texto(secao.practical) ? `a demonstração de ${entreAspas(texto(secao.practical))}, com exemplo prático` : "demonstração e exemplo prático do que a seção explica"}, sem repetir o texto.`,
    `- Onde fica: incorporado ${naUnidade(unidade)}${destino ? ` (${destino})` : ""}, nessa seção.`,
    `- Na descrição do vídeo: o link ${daUnidade(unidade)} (${endereco}).`,
  ];
}

/**
 * 2026-10-07 · O QUE ABRE O VÍDEO E O CARROSSEL, já pela trava de fonte (item 5):
 * a premissa, a capa e a promessa do gancho. A mesma porta dos capítulos: a
 * frase que afirma sobre plataforma sem fonte sai do texto publicável e vai
 * para a lista "Fica fora", com o motivo; a tese de quem fala passa.
 */
type AberturaPublicavel = {
  premissa: string | null;
  capa: string | null;
  promessaDoArtigo: string | null;
  /** 2026-10-07 (revisão) · `porta` (aditivo): a trava inteira, para a lista "Fica fora" encurtar a afirmação citada quando a célula aperta. */
  fora: Array<{ onde: string; frase: string; motivo: string; porta?: Extract<RadarClaimGate, { estado: "TRAVADA" }> }>;
};

function aberturaPublicavel(input: RadarPortableExportInput, artigoModelo: RadarArticleBlueprintPayload | null, bp: RadarYoutubeBlueprint | null, trava: RadarVideoClaimLock): AberturaPublicavel {
  const fora: AberturaPublicavel["fora"] = [];
  const pela = (onde: string, frase: string | null) => {
    if (!frase) return null;
    const porta = travar(trava, frase, null);
    if (porta.estado !== "TRAVADA") return frase;
    fora.push({ onde, frase, motivo: porta.motivo, porta });
    return null;
  };
  pela("Premissa do vídeo", semAbsoluta(artigoModelo?.blueprint.promise));
  const premissa = radarVideoPremise(artigoModelo, trava);
  /*
   * 2026-10-02 · a capa é chamada para o público: o H1 da planta (a promessa é instrução ao redator).
   * 2026-10-07 (revisão) · com o H1 travado, a capa caía para a premissa — e,
   * com a premissa também travada, a Lâmina 1 publicava a frase de produção "O
   * vídeo responde … com o que a pesquisa sustenta". A reserva agora é a
   * pergunta da abertura da planta, que é do público e passa pela mesma porta;
   * sem ela, a lâmina diz o que pôr, como antes.
   */
  const aberturaDaPlanta = texto(artigoModelo?.blueprint.opening.readerQuestion) || null;
  const capa = pela("Capa do carrossel (lâmina 1)", texto(artigoModelo?.blueprint.title.h1) || null)
    || (aberturaDaPlanta && travar(trava, aberturaDaPlanta, null).estado !== "TRAVADA" ? aberturaDaPlanta : null);
  /* A promessa do artigo só abre o gancho quando a pesquisa do YouTube não recomenda uma: só então ela iria ao texto. */
  const doArtigo = util(input.article.promise);
  const promessaDoArtigo = promessaDaPesquisa(bp) ? doArtigo : pela("Promessa do gancho", doArtigo);
  return { premissa, capa, promessaDoArtigo, fora };
}

function colunaRoteiro(
  input: RadarPortableExportInput,
  p: RadarWritingProjections,
  youtube: RadarVideoExportYoutube | null,
  abertura: string | null,
  sequencia: Sequencia,
  artigoModelo: RadarArticleBlueprintPayload | null,
  publicavel: AberturaPublicavel | null = null,
  /* 2026-10-07 (revisão) · aditivo: o nível de encolhimento dos capítulos da planta (NIVEIS_DO_ROTEIRO); ausente, o texto inteiro. */
  nivel: NivelDoRoteiro = NIVEIS_DO_ROTEIRO[0],
): string {
  const bp = youtube?.blueprint ?? null;
  const contribuicoes = radarWritingSpecialistContributions(p);
  const cta = contribuicoes.find(item => item.tipo === "CTA") || contribuicoes.find(item => item.tipo === "FECHAMENTO") || null;
  const destino = texto(input.article.canonical) || (texto(input.article.slug) ? `/${texto(input.article.slug)}` : "");
  const unidade = radarWritingUnitOf(input);
  const doFecho = bp?.recommended.script.find(bloco => EH_FECHO.test(radarWritingCompareKey(bloco.block))) || null;
  const { capitulos, curto } = sequencia;
  const serieCurta = sequencia.restantes.slice(0, LIMITES.chapters - 1);
  const premissa = publicavel ? publicavel.premissa : radarVideoPremise(artigoModelo);
  const linhas = [
    linhaDoGancho(input, p, bp, abertura, publicavel ? publicavel.promessaDoArtigo : util(input.article.promise)),
    "Promessa clara no título e na thumbnail, a mesma que o vídeo cumpre; sem caça-clique.",
  ];
  if (bp) {
    for (const item of bp.recommended.strategy.filter(estrategia => radarWritingCompareKey(estrategia.dimension) !== "promessa").slice(0, 4)) {
      linhas.push(`${item.dimension}: ${item.recommendedStrategy} (a SERP mostra: ${item.observedSignal})`);
    }
  }
  if (capitulos.length && capitulos[0].daPlanta) {
    const ritmo = (bp?.recommended.script || []).map(bloco => bloco.block).filter(Boolean);
    linhas.push(
      ...(premissa ? [`Premissa do vídeo: ${premissa}`] : []),
      `Capítulos do vídeo principal (${capitulos.length}, da planta do artigo-modelo da SERP; viram os marcadores de tempo da descrição). Ordem sugerida, a do artigo: reorganize se o vídeo render mais abrindo pela demonstração, mantendo assunto, evidências e premissa.`,
      ...capitulos.map((capitulo, indice) => linhaDoCapituloDaPlanta(capitulo, indice, nivel)),
      ...(nivel !== NIVEIS_DO_ROTEIRO[0]
        ? [`(Roteiro encolhido para caber na célula: ${nivel.soEssencial ? "cada capítulo ficou com título, pergunta, Entregar e Mostrar" : "o Entregar não repete a pergunta e as frases de cada capítulo saíram encurtadas"}; o texto inteiro de cada seção está na planta do artigo-modelo, no CSV para escrever, e as frases sem fonte, na lista "Fica fora" de cortes_para_redes.)`]
        : []),
      ...(ritmo.length ? [`Ritmo que a SERP do YouTube sugere (referência, não roteiro): ${ritmo.join(" → ")}.`] : []),
      "Entregar = o que a pessoa leva do capítulo, dito no começo dele. As frases vêm da planta: adapte para a fala.",
      /* 2026-10-07 · a régua da cena das demonstrações (item 4), dita uma vez para todos os capítulos. */
      REGRA_DAS_CENAS,
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
/*
 * ===== 2026-10-07 · CURTOS ESCOLHIDOS PELA UTILIDADE ISOLADA (item 3 do desenho) =====
 *
 * A escolha era posicional (o melhor do início, do meio e do fim) e o "melhor"
 * era só "tem o que mostrar" — que quase todo capítulo tinha. No CSV real, o
 * corte 3 abria com gancho no plural, ideia com três táticas e cena com uma.
 * Agora, por capítulo da planta (fora do formato curto):
 *
 *   - dois PORTÕES eliminam: funciona sozinho (tem pergunta e frase publicável
 *     depois da trava de fonte) e é demonstrável (a planta define a
 *     demonstração; só o conceito da imagem não basta);
 *   - três critérios pontuam, de 0 a 4: demanda (0 a 2: pergunta do "Pessoas
 *     também perguntam" ou da amostra com 2+ páginas, necessidade central com
 *     recorrência forte ou moderada, ou a pergunta de um Short que a pesquisa
 *     recomenda; 1 para outra pergunta ou busca relacionada), uma ação (a
 *     demonstração cabe sem cortar passos) e oportunidade (a seção cita
 *     lacuna, diferencial ou oportunidade da SERP).
 *
 * Saem os três maiores; no empate, a dispersão de antes (início, meio, fim) e
 * depois a ordem. Com menos de três elegíveis, saem menos — nenhum capítulo
 * inelegível completa a conta, e cada capítulo sem corte diz o motivo. Tudo
 * por id da planta: nada se liga por semelhança de texto.
 */
type ContextoDoCorte = {
  evidencia: ReadonlyMap<string, { kind: string; text: string }>;
  /** A recorrência de cada necessidade central da descoberta, pela chave da formulação. */
  necessidades: ReadonlyMap<string, string>;
  /** As perguntas das peças SHORT da camada multiformato congelada, pela chave. */
  curtos: ReadonlySet<string>;
  comuns: ReadonlySet<string>;
};

type Utilidade =
  | { elegivel: false; motivo: string }
  | { elegivel: true; pontos: number; partes: string[]; umaAcao: boolean };

const ROTULO_DA_OPORTUNIDADE: Readonly<Record<string, string>> = { G: "lacuna", D: "diferencial", O: "oportunidade da SERP" };
const RECORRENCIA: Readonly<Record<string, string>> = { STRONG: "forte", MODERATE: "moderada", WEAK: "fraca" };

function utilidadeDoCorte(capitulo: Capitulo, contexto: ContextoDoCorte): Utilidade {
  if (!capitulo.pergunta) return { elegivel: false, motivo: "sem pergunta do público na planta" };
  /* O gancho do corte É a pergunta: pergunta travada pela fonte não abre corte. */
  if (!capitulo.provocacao) return { elegivel: false, motivo: "a pergunta do capítulo pede fonte" };
  if (!capitulo.publicavel) return { elegivel: false, motivo: capitulo.travadas?.length ? "a frase publicável pede fonte" : "sem frase publicável na planta: só afirmação absoluta" };
  const demo = capitulo.demo;
  if (!demo || demo.tipo === "NENHUMA") return { elegivel: false, motivo: "sem demonstração definida na planta" };
  let demanda = 0;
  let origemDaDemanda = "";
  for (const id of capitulo.evidencias || []) {
    const item = contexto.evidencia.get(id);
    if (!item) continue;
    let nivel = 0;
    let rotulo = "";
    if (id.startsWith("P")) {
      const contagem = item.text.match(/\((\d+) de (\d+) páginas\)\s*$/);
      if (item.kind === "Pessoas também perguntam") { nivel = 2; rotulo = `${id}: Pessoas também perguntam`; }
      else if (contagem) { nivel = Number(contagem[1]) >= 2 ? 2 : 1; rotulo = `${id}: ${contagem[1]} de ${contagem[2]} páginas`; }
      else if (item.kind === "necessidade central da busca") {
        const recorrencia = contexto.necessidades.get(radarWritingCompareKey(item.text)) || "";
        nivel = recorrencia === "STRONG" || recorrencia === "MODERATE" ? 2 : 1;
        rotulo = `${id}: necessidade central${recorrencia ? `, recorrência ${RECORRENCIA[recorrencia] || recorrencia}` : ""}`;
      } else { nivel = 1; rotulo = `${id}: ${item.kind}`; }
    } else if (id.startsWith("B")) { nivel = 1; rotulo = `${id}: busca relacionada`; }
    if (nivel > demanda) { demanda = nivel; origemDaDemanda = rotulo; }
  }
  if (demanda < 2 && contexto.curtos.has(radarWritingCompareKey(capitulo.pergunta))) { demanda = 2; origemDaDemanda = "a mesma pergunta de um Short que a pesquisa recomenda"; }
  const umaAcao = demo.tipo === "ANTES_DEPOIS" || demo.tipo === "ACAO";
  const oportunidade = (capitulo.evidencias || []).find(id => /^[GDO]\d+$/.test(id) && contexto.evidencia.has(id)) || null;
  return {
    elegivel: true,
    umaAcao,
    pontos: demanda + (umaAcao ? 1 : 0) + (oportunidade ? 1 : 0),
    partes: [
      demanda === 2 ? `pergunta com demanda (${origemDaDemanda})` : demanda === 1 ? `pergunta citada na pesquisa (${origemDaDemanda})` : "pergunta sem demanda medida na SERP",
      "funciona sozinha",
      /* 2026-10-07 (revisão) · com a ideia nomeando 2+ passos, o corte mostra esses (`passosDaIdeia`), não só o primeiro. */
      umaAcao
        ? "uma ação"
        : capitulo.passosDaIdeia?.length
          ? `${demo.tipo === "PASSOS" ? demo.passos.length : "vários"} passos (o corte mostra os ${capitulo.passosDaIdeia.length} que a ideia nomeia)`
          : `${demo.tipo === "PASSOS" ? demo.passos.length : "vários"} passos (o corte usa o primeiro)`,
      ...(oportunidade ? [`${ROTULO_DA_OPORTUNIDADE[oportunidade[0]]} ${oportunidade}`] : []),
    ],
  };
}

/* No empate, a dispersão de antes: o primeiro de cada faixa (início, meio, fim) entre os empatados, na ordem do vídeo. */
function porDispersao<T>(itens: readonly T[], vagas: number): T[] {
  const faixas = Math.min(vagas, itens.length);
  return Array.from({ length: faixas }, (_, faixa) => itens[Math.floor((itens.length * faixa) / faixas)]);
}

function escolhaPorUtilidade<T extends { numero: number; pontos: number }>(elegiveis: readonly T[], vagas: number): T[] {
  const escolhidos: T[] = [];
  for (const nivel of [...new Set(elegiveis.map(item => item.pontos))].sort((a, b) => b - a)) {
    const restam = vagas - escolhidos.length;
    if (restam <= 0) break;
    const empatados = elegiveis.filter(item => item.pontos === nivel);
    escolhidos.push(...(empatados.length <= restam ? empatados : porDispersao(empatados, restam)));
  }
  return escolhidos.sort((a, b) => a.numero - b.numero);
}

/*
 * Advérbio, auxiliar e quantificador não são assunto: "realmente", "mesmo", "muitos" não dizem do que o gancho fala.
 * 2026-10-07 (revisão) · nem o verbo de uso comum: o alinhamento dizia "a
 * demonstração não nomeia o assunto do gancho ("serve")" e mandava mostrar
 * "serve" e "traz" na cena.
 */
const SEM_ASSUNTO = new Set(radarSemanticStems("realmente mesmo mesma mesmos muito muitos muita muitas posso pode podem deve devem fazer hoje sempre nunca ainda apenas também então agora quais qual quando onde serve servem servir traz trazem trazer usar uso aplicar aplique ter tem têm ficar dar levar ver colocar começar existe existem precisa precisam vale valer"));

/* As palavras do texto, cada uma com a raiz que distingue o assunto (sem palavra de função nem a raiz onipresente da principal). */
function palavrasDistintivas(frase: string, comuns: ReadonlySet<string>): Array<{ palavra: string; raiz: string }> {
  const vistas = new Set<string>();
  return frase.split(/[^\p{L}\p{N}]+/u).flatMap(palavra => {
    const raiz = radarSemanticStems(palavra)[0];
    if (!raiz || RADAR_WRITING_FUNCTION_WORDS.has(raiz) || SEM_ASSUNTO.has(raiz) || comuns.has(raiz) || vistas.has(raiz)) return [];
    vistas.add(raiz);
    return [{ palavra, raiz }];
  });
}
const nomeia = (raizes: readonly string[], raiz: string) => raizes.some(outra => outra === raiz || (Math.min(outra.length, raiz.length) >= 5 && (outra.startsWith(raiz) || raiz.startsWith(outra))));

/*
 * 2026-10-07 · O ALINHAMENTO DO CORTE: gancho, ideia e demonstração falam da
 * mesma coisa? Compara as raízes que distinguem o assunto; só sinaliza e diz o
 * ajuste — não reescreve nada. O caso do CSV real (ideia com três táticas,
 * cena com uma) vira a instrução de ficar no passo que a cena mostra.
 */
function linhaDeAlinhamento(capitulo: Capitulo, demo: Demonstracao, comuns: ReadonlySet<string>): string | null {
  if (!capitulo.pergunta || !capitulo.publicavel || demo.tipo === "NENHUMA") return null;
  const raizesDe = (frase: string) => palavrasDistintivas(frase, comuns).map(item => item.raiz);
  const daIdeia = raizesDe(capitulo.publicavel.frase);
  /*
   * 2026-10-07 (revisão) · D10: a ideia que nomeia 2+ passos era sinalizada
   * ("no corte, a fala e o gancho ficam nesse passo") e a cena do storyboard
   * desmentia. Agora o corte já MOSTRA os passos que a ideia nomeia
   * (`passosDaIdeia`, a mesma régua da raiz própria de cada passo): o
   * alinhamento diz a correção feita, não a que falta fazer.
   */
  const nomeados = capitulo.passosDaIdeia || [];
  if (demo.tipo === "PASSOS" && nomeados.length >= 2) return `   Alinhamento: a ideia única nomeia ${nomeados.length} passos e o corte mostra os ${nomeados.length}, uma tela por passo: gancho, ideia e cena falam dos mesmos passos.`;
  const daDemo = raizesDe(demo.tipo === "PASSOS" ? demo.passos[0] : demo.tipo === "ACAO" ? demo.acao : [demo.antes, demo.ajuste, demo.depois || ""].join(" "));
  const doGancho = palavrasDistintivas(capitulo.pergunta, comuns);
  if (!doGancho.length) return null;
  const nosTres = doGancho.filter(item => nomeia(daIdeia, item.raiz) && nomeia(daDemo, item.raiz));
  if (nosTres.length) return `   Alinhamento: gancho, ideia e demonstração falam de ${entreAspas(nosTres[0].palavra)}.`;
  const comDemo = doGancho.filter(item => nomeia(daDemo, item.raiz));
  const comIdeia = doGancho.filter(item => nomeia(daIdeia, item.raiz));
  const assunto = doGancho.slice(0, 4).map(item => entreAspas(item.palavra)).join(", ");
  if (!comDemo.length) return `   Alinhamento: a demonstração não nomeia o assunto do gancho (${assunto}): ajuste a cena na produção para mostrar esse assunto.`;
  if (!comIdeia.length) return `   Alinhamento: a ideia única não nomeia o assunto do gancho (${assunto}): na fala do corte, ligue a resposta à pergunta.`;
  return `   Alinhamento: gancho e ideia falam de ${entreAspas(comIdeia[0].palavra)}; gancho e demonstração, de ${entreAspas(comDemo[0].palavra)}.`;
}

/*
 * 2026-10-07 · A ORIGEM RECOMENDADA, COM O MOTIVO. "Extrair ou gravar à parte
 * (decida na produção)" deixava a decisão sem critério. Extrair da gravação do
 * capítulo funciona quando o capítulo abre respondendo a mesma pergunta e
 * mostra uma ação só; senão, gravar à parte — e o motivo diz por quê.
 */
function origemRecomendada(capitulo: Capitulo, numero: number, utilidade: Utilidade | null): string {
  const extrair = `extrair da gravação do capítulo ${numero} e reenquadrar na vertical`;
  const aParte = "gravar à parte com fala própria";
  if (!capitulo.daPlanta || !utilidade?.elegivel || !capitulo.publicavel) {
    return capitulo.pergunta
      ? `   Origem recomendada: ${extrair} — motivo: o capítulo abre pela mesma pergunta do gancho. Alternativa: ${aParte}.`
      : `   Origem recomendada: ${aParte} — motivo: o bloco não abre por uma pergunta própria do público. Alternativa: extrair, reeditando a fala.`;
  }
  const motivos = [
    ...(capitulo.demo?.tipo === "PASSOS"
      ? [capitulo.passosDaIdeia?.length
        ? `a demonstração tem ${capitulo.demo.passos.length} passos e o corte mostra ${capitulo.passosDaIdeia.length} em sequência rápida, que a gravação do capítulo detalha um a um`
        : `a demonstração tem ${capitulo.demo.passos.length} passos e o corte usa só o primeiro`]
      : []),
    ...(!capitulo.publicavel.daAbertura ? [capitulo.aberturaTravada ? "a frase de abertura do capítulo pede fonte" : "a ideia única vem do Explicar, não da abertura do capítulo"] : []),
  ];
  return motivos.length
    ? `   Origem recomendada: ${aParte} — motivo: ${motivos.join("; ")}. Alternativa: extrair, reeditando a fala.`
    : `   Origem recomendada: ${extrair} — motivo: o capítulo abre respondendo a mesma pergunta e mostra uma ação só. Alternativa: ${aParte}.`;
}

/* 2026-10-02 · uma mensagem por lâmina: a primeira oração da frase, inteira (cortar no meio deixava a mensagem pela metade). */
function mensagemDaLamina(frase: string): string {
  const primeira = semPontoFinal(frase.split(/;\s*/)[0] || frase);
  const curta = cortar(primeira, 180);
  return /[.!?…]$/.test(curta) ? curta : `${curta}.`;
}

/*
 * 2026-10-07 · A ESCOLHA DOS CORTES NUM LUGAR SÓ (itens 2 e 8 do desenho): a
 * coluna de cortes, a cadeia competitiva e o storyboard dizem o MESMO corte de
 * cada capítulo. O código saiu de dentro de `colunaCortes` sem mudar de
 * comportamento: portões e utilidade com a planta; sem ela, a régua de antes.
 */
type CapituloAvaliado = { capitulo: Capitulo; numero: number; utilidade: Utilidade | null };
type EscolhaDosCortes = {
  contexto: ContextoDoCorte;
  avaliados: CapituloAvaliado[];
  porUtilidade: boolean;
  escolhidos: CapituloAvaliado[];
  /** Número do capítulo → número do corte. */
  numeroDoCorte: Map<number, number>;
};

function escolhaDosCortes(
  youtube: RadarVideoExportYoutube | null,
  sequencia: Sequencia,
  p: RadarWritingProjections,
  artigoModelo: RadarArticleBlueprintPayload | null,
  trava: RadarVideoClaimLock | null,
): EscolhaDosCortes {
  const capitulos = sequencia.curto ? [] : sequencia.capitulos;
  const contexto: ContextoDoCorte = {
    evidencia: new Map((artigoModelo?.evidence || []).map(item => [item.id, { kind: item.kind, text: item.text }])),
    necessidades: new Map((p.descoberta?.answerableUnits || []).filter(necessidade => necessidade.importance === "CORE").map(necessidade => [radarWritingCompareKey(necessidade.questionOrNeed), necessidade.marketRecurrence?.recurrence || ""])),
    curtos: new Set((youtube?.shortQuestions || []).map(pergunta => radarWritingCompareKey(pergunta))),
    comuns: trava?.comuns || new Set<string>(),
  };
  const avaliados: CapituloAvaliado[] = capitulos.map((capitulo, indice) => ({ capitulo, numero: indice + 1, utilidade: capitulo.daPlanta ? utilidadeDoCorte(capitulo, contexto) : null }));
  const porUtilidade = avaliados.length > 0 && avaliados.every(item => item.utilidade);
  let escolhidos: CapituloAvaliado[];
  if (porUtilidade) {
    /* 2026-10-07 · da planta: portões e pontuação (item 3); nenhum inelegível completa a conta. */
    const elegiveis = avaliados.flatMap(item => (item.utilidade?.elegivel ? [{ ...item, pontos: item.utilidade.pontos }] : []));
    escolhidos = escolhaPorUtilidade(elegiveis, LIMITES.cuts);
  } else {
    /*
     * Sem planta, a régua de antes: primeiro o capítulo com pergunta do público,
     * contexto e conclusão por último, espalhado pela sequência (2026-10-07:
     * o melhor do início, do meio e do fim; empate pela ordem).
     */
    const peso = (capitulo: Capitulo) => (capitulo.pergunta ? 0 : /^(contexto|conclus)/.test(radarWritingCompareKey(capitulo.titulo)) ? 2 : 1);
    const faixas = Math.min(LIMITES.cuts, avaliados.length);
    escolhidos = [];
    for (let faixa = 0; faixa < faixas; faixa += 1) {
      const trecho = avaliados.slice(Math.floor((avaliados.length * faixa) / faixas), Math.floor((avaliados.length * (faixa + 1)) / faixas));
      escolhidos.push(trecho.reduce((atual, item) => (peso(item.capitulo) < peso(atual.capitulo) ? item : atual)));
    }
  }
  return { contexto, avaliados, porUtilidade, escolhidos, numeroDoCorte: new Map(escolhidos.map((item, indice) => [item.numero, indice + 1])) };
}

/*
 * 2026-10-07 · `trava` e `publicavel` (aditivos, item 5): a trava de fonte da
 * linha e a abertura já conferida (capa e o que ficou fora); `contexto` (item
 * 3): o que a escolha por utilidade lê da planta, da descoberta e do YouTube.
 * Ausentes, a régua de antes (sem trava, sem lista "Fica fora"). `escolha`
 * (aditivo, item 2): a escolha já feita para a linha, a mesma da cadeia.
 */
function colunaCortes(
  youtube: RadarVideoExportYoutube | null,
  sequencia: Sequencia,
  p: RadarWritingProjections,
  unidade: RadarWritingUnit,
  artigoModelo: RadarArticleBlueprintPayload | null = null,
  destino = "",
  extras: {
    trava?: RadarVideoClaimLock | null;
    publicavel?: AberturaPublicavel | null;
    escolha?: EscolhaDosCortes | null;
    /*
     * 2026-10-07 (revisão) · aditivos: a amostra pertinente da linha (os Shorts
     * do tema, sem o fora do tema) e se a coluna concorrencia_curtos_e_carrossel
     * tem concorrência do curto (curtos pertinentes do Google, Reels, Shorts ou
     * vídeos do TikTok no orgânico) — a abertura dos cortes deixa de dizer "sem
     * dado de concorrência" quando a coluna ao lado tem o dado. E o nível de
     * encolhimento (NIVEIS_DOS_CORTES); ausente, o texto inteiro.
     */
    pertinentes?: RadarVideoPertinentSample | null;
    concorrenciaCurta?: boolean;
    nivel?: NivelDosCortes;
  } = {},
): string {
  const curtos = youtube?.blueprint?.observed.shorts ?? null;
  const nivel = extras.nivel ?? NIVEIS_DOS_CORTES[0];
  const fatos = (p.autoridade?.factualEvidence || []).filter(item => item.supportType === "SUPPORTS").length;
  /* 2026-10-07 · a escolha mora em `escolhaDosCortes` (a mesma da cadeia e do storyboard); sem ela informada, calculada aqui, como antes. */
  const { contexto, avaliados, porUtilidade, escolhidos, numeroDoCorte } = extras.escolha ?? escolhaDosCortes(youtube, sequencia, p, artigoModelo, extras.trava ?? null);
  /*
   * 2026-10-02 · CADA CORTE COM CONTEÚDO PRÓPRIO (revisão do CSV de vídeo): o
   * corte era "a pergunta X e a resposta direta". Agora diz o gancho, a ideia
   * única, o que mostrar, a fonte quando a fala pede e o fechamento. Com a
   * planta, tudo vem da seção; sem ela, o que o capítulo tem.
   *
   * 2026-10-07 · com a planta, a Ideia única é a frase PUBLICÁVEL (depois da
   * trava de fonte), o Mostrar é a demonstração da planta numa cena só, e o
   * corte diz a utilidade, o alinhamento e a origem recomendada com o motivo.
   */
  /* 2026-10-07 · o fechamento diz o destino com endereço quando há — e UM CTA só por corte. */
  const fechamento = `   Fechamento: CTA: ${aUnidade(unidade)}${destino ? ` (${destino})` : ""} ou o vídeo longo quando publicado — um só por corte.`;
  const cortes = escolhidos.map(({ capitulo, numero: posicao, utilidade }, indice) => {
    if (capitulo.daPlanta && utilidade?.elegivel && capitulo.publicavel && capitulo.demo) {
      const alinhamento = nivel.enxuto ? null : linhaDeAlinhamento(capitulo, capitulo.demo, contexto.comuns);
      return [
        `${indice + 1}. Do capítulo ${posicao} (${capitulo.titulo}):`,
        `   Utilidade ${utilidade.pontos} de 4: ${utilidade.partes.join(" · ")}.`,
        `   Gancho: ${entreAspas(radarVideoHookQuestion(capitulo.pergunta!))}`,
        `   Ideia única: ${fraseCurta(comFonte(semPontoFinal(capitulo.publicavel.frase), capitulo.publicavel.fonte), nivel.ideia)}.`,
        `   Mostrar: ${mostrarNoCorte(capitulo.demo, capitulo.passosDaIdeia || [], nivel.parte)}.`,
        ...(alinhamento ? [alinhamento] : []),
        ...(capitulo.fonteDoCorte ? [`   Fonte: ${capitulo.fonteDoCorte}.`] : []),
        origemRecomendada(capitulo, posicao, utilidade),
        fechamento,
      ].join("\n");
    }
    return capitulo.pergunta
      ? [
        `${indice + 1}. Do capítulo ${posicao} (${capitulo.titulo}):`,
        `   Gancho: ${entreAspas(radarVideoHookQuestion(capitulo.pergunta))}`,
        "   Ideia única: a resposta direta à pergunta, em uma frase.",
        "   Mostrar: um exemplo concreto, identificado como ilustrativo.",
        origemRecomendada(capitulo, posicao, null),
        fechamento,
      ].join("\n")
      : [`${indice + 1}. Do capítulo ${posicao} (${capitulo.titulo}): ${semPontoFinal(capitulo.proposito || capitulo.titulo)}.`, origemRecomendada(capitulo, posicao, null), fechamento].join("\n");
  });
  /* 2026-10-07 · cada capítulo da planta sem corte diz o motivo: portão que não passou ou utilidade abaixo dos escolhidos. */
  const semCorte = porUtilidade
    ? avaliados.filter(item => !numeroDoCorte.has(item.numero)).map(item => `${item.numero} (${motivoSemCorte(item, escolhidos)})`)
    : [];
  /*
   * 2026-10-07 (revisão) · o cabeçalho diz a régua que de fato escolheu: com
   * todos os escolhidos em 0 de 4 (nenhuma demanda nem oportunidade medida),
   * "pela utilidade isolada (pergunta com demanda…)" prometia o que não houve —
   * aí quem escolheu foram os portões e a distribuição pelo vídeo.
   */
  const semDemanda = porUtilidade && escolhidos.length > 0 && escolhidos.every(item => item.utilidade?.elegivel && item.utilidade.pontos === 0);
  /*
   * 2026-10-02 · O CARROSSEL COM UMA MENSAGEM POR LÂMINA e a ligação com a
   * próxima. Com a planta: capa pela promessa, uma lâmina por seção com a
   * resposta curta, lâmina final com o CTA. Sem ela, a regra.
   */
  /*
   * 2026-10-07 · CARROSSEL PUBLICÁVEL (revisão do CSV real): a lâmina herdava
   * o proposito cru (com placeholder e pendência) e não tinha orientação
   * visual. Agora cada lâmina sai com Título, Apoio (texto publicável: a frase
   * do capítulo; na pendência, a primeira frase não-absoluta de explicar; sem
   * nada, a pergunta do público como provocação) e a sugestão Visual (derivada
   * do mostrar). Nenhuma lâmina sai com instrução interna ("a resposta a…",
   * "pelo que a pesquisa sustenta", "PENDÊNCIA").
   */
  /*
   * 2026-10-07 · O APOIO É A FRASE PUBLICÁVEL DEPOIS DA TRAVA (item 5): a Lâmina 2
   * do CSV real publicava "O algoritmo prioriza…" que o capítulo 1 marcava como
   * "fonte a obter". Agora vem do mesmo ponto único dos capítulos: a frase
   * livre (com a fonte, quando a planta a liga) ou, sem ela, a pergunta do
   * público como provocação. Frase travada nunca chega à lâmina.
   */
  const apoioDaLamina = (capitulo: Capitulo): string | null => {
    if (capitulo.publicavel) {
      const mensagem = mensagemDaLamina(capitulo.publicavel.frase);
      return capitulo.publicavel.fonte ? `${semPontoFinal(mensagem)} (fonte: ${capitulo.publicavel.fonte}).` : mensagem;
    }
    return capitulo.provocacao ? mensagemDaLamina(capitulo.provocacao) : null;
  };
  /*
   * 2026-10-07 · o Visual sai da mesma demonstração da planta (item 4): passos viram lista, antes e depois viram a sequência.
   * 2026-10-07 (revisão) · com a célula apertada, o Visual encurta (nunca some:
   * o storyboard encolhido aponta para ele, e apontar de volta perderia os dois).
   */
  const visualDaLamina = (capitulo: Capitulo): string => {
    const visual = capitulo.demo ? visualDaLaminaPela(capitulo.demo) : "destaque do título";
    return nivel.visual ? cortar(visual, nivel.visual) : visual;
  };
  const daPlanta = sequencia.capitulos.filter(capitulo => capitulo.daPlanta);
  /* 2026-10-02 · a capa é chamada para o público: o H1 da planta (a promessa é instrução ao redator). 2026-10-07 · já pela trava de fonte. */
  const promessa = extras.publicavel ? extras.publicavel.capa : texto(artigoModelo?.blueprint.title.h1) || radarVideoPremise(artigoModelo) || null;
  /*
   * 2026-10-07 · "FICA FORA DO TEXTO PUBLICÁVEL" é REGRA CONCLUÍDA, não
   * pendência (D10): a frase que pede fonte já saiu da lâmina, da legenda e da
   * ideia do corte; a lista diz qual, de onde e por quê, para ninguém a
   * reintroduzir. Na fala, ela só entra delimitada (o Explicar já a marca).
   */
  /*
   * Uma linha por lugar (capítulo, com a lâmina e o corte dele): a lista inteira cabe na célula mesmo com seis capítulos e dois links em cada.
   * 2026-10-07 (revisão) · com a célula apertada, a frase e a afirmação citada
   * no motivo encurtam (NIVEIS_DOS_CORTES) — a lista nunca é a parte cortada.
   */
  const motivoNoNivel = (item: { motivo: string; porta?: Extract<RadarClaimGate, { estado: "TRAVADA" }> }) => (item.porta ? radarClaimGateReason(item.porta, nivel.motivo) : item.motivo);
  const fora = [
    ...(extras.publicavel?.fora || []).map(item => `- ${item.onde}: ${entreAspas(cortar(item.frase, nivel.fora))} — ${motivoNoNivel(item)}.`),
    ...daPlanta.flatMap((capitulo, indice) => {
      if (!capitulo.travadas?.length) return [];
      const corte = numeroDoCorte.get(indice + 1);
      return [`- Capítulo ${indice + 1} · lâmina ${indice + 2}${corte ? ` · corte ${corte}` : ""}: ${capitulo.travadas.map(item => `${entreAspas(cortar(item.frase, nivel.fora))} — ${motivoNoNivel(item)}`).join("; ")}.`];
    }),
  ];
  const carrossel = daPlanta.length
    ? [
      /* 2026-10-07 (passada de revisão) · o cabeçalho acompanhou a lâmina: prometer "cada uma puxando a próxima" sem o elemento no corpo mandava procurar instrução que não existe mais. */
      `Carrossel (Instagram e LinkedIn), ${daPlanta.length + 2} lâminas, uma mensagem por lâmina (o título de cada lâmina já puxa a seguinte):`,
      `- Lâmina 1 (capa): ${promessa ? mensagemDaLamina(promessa) : "o problema do tema em uma frase."}`,
      /* 2026-10-07 · o "Puxa a próxima" saiu da lâmina: o Título da lâmina seguinte já diz o que vem, e a lâmina só leva o publicável e a sugestão visual. */
      ...daPlanta.map((capitulo, indice) => {
        const apoio = apoioDaLamina(capitulo);
        return `- Lâmina ${indice + 2}: Título: ${semPontoFinal(capitulo.titulo)}${apoio ? ` · Apoio (texto publicável): ${apoio}` : ""} · Visual: ${visualDaLamina(capitulo)}.`;
      }),
      `- Lâmina ${daPlanta.length + 2}: CTA para ${aUnidade(unidade)}${destino ? ` (${destino})` : ""}, sem prometer resultado.`,
      /* 2026-10-07 · a trava já fez a conferência: a regra diz o que foi feito, não o que falta fazer. */
      "Fonte na lâmina: a frase com fonte do pacote leva a fonte entre parênteses; a frase que pede fonte não entra em lâmina.",
    ]
    : ["Carrossel (Instagram e LinkedIn): uma mensagem por lâmina, a resposta curta de cada capítulo, cada lâmina puxando a próxima, a fonte quando a mensagem afirma algo e o CTA na última."];
  /*
   * 2026-10-07 (revisão) · A ABERTURA DOS CORTES E A COLUNA AO LADO DIZEM O
   * MESMO. Ela lia os Shorts da fotografia — a amostra inteira, com o fora do
   * tema na mediana (o defeito que o dono apontou, em outra coluna) — e, sem
   * Shorts no YouTube, dizia "sem dado de concorrência" enquanto
   * concorrencia_curtos_e_carrossel listava Reels, curtos do Google e a
   * duração-alvo. Agora conta os Shorts PERTINENTES (sem universo, a amostra
   * inteira, dita) e aponta para a coluna quando ela tem a concorrência.
   */
  const NA_COLUNA_DE_CURTOS = "a concorrência do curto (curtos que o Google mostra, Reels e Shorts no orgânico, duração-alvo dos cortes) está em concorrencia_curtos_e_carrossel";
  const semConcorrencia = extras.concorrenciaCurta ? NA_COLUNA_DE_CURTOS : "cortes podem testar o formato, sem dado de concorrência";
  const doTema = extras.pertinentes?.curtos ?? null;
  const linhaDosShorts = !youtube
    ? `Shorts: sem pesquisa do YouTube, não há amostra de Shorts do tema; ${semConcorrencia}.`
    : doTema
      ? doTema.coorte.videoCount
        ? `Shorts do tema nesta amostra (pertinentes): ${doTema.coorte.videoCount} de ${doTema.total}${doTema.coorte.durationSeconds.median ? ` · duração mediana ${duracao(doTema.coorte.durationSeconds.median)}` : ""}. Existe espaço para cortes do tema; ${NA_COLUNA_DE_CURTOS}.`
        : `Shorts: nenhum Short do tema nesta amostra${doTema.total ? ` (${doTema.total} Short(s) fora do tema ou de outro público)` : ""}; ${semConcorrencia}.`
      : curtos && curtos.videoCount
        ? `Shorts nesta amostra (amostra inteira: sem a corrida, a pertinência não é recalculável): ${curtos.videoCount}${curtos.durationSeconds.median ? ` · duração mediana ${duracao(curtos.durationSeconds.median)}` : ""}. Existe espaço para cortes do tema; ${NA_COLUNA_DE_CURTOS}.`
        : `Shorts: nenhum Short do tema nesta amostra; ${semConcorrencia}.`;
  return [
    linhaDosShorts,
    ...(sequencia.curto
      /* 2026-10-02 · a SERP aponta Shorts: o vídeo principal já é o corte; cortar de novo não faz sentido. */
      ? ["Formato curto (a SERP aponta Shorts): o próprio vídeo e cada vídeo da série servem a Shorts, Reels e TikTok, cada um funcionando sozinho; ajuste a legenda e o CTA a cada rede."]
      : cortes.length
        /* 2026-10-07 · o rótulo honesto: "um por capítulo" mentia com 3 cortes para 5 capítulos; com a planta, a escolha é pela utilidade isolada (item 3). */
        ? [porUtilidade
          ? semDemanda
            ? `Cortes sugeridos (Shorts, Reels e TikTok): ${cortes.length} ideia(s) escolhida(s) dos capítulos que passam nos portões (pergunta própria, frase publicável e demonstração definida); nenhum tem demanda nem oportunidade medida na SERP, e a escolha os espalha pelo começo, meio e fim do vídeo; cada corte funciona sozinho, com gancho próprio e sem depender do vídeo longo:`
            : `Cortes sugeridos (Shorts, Reels e TikTok): ${cortes.length} ideia(s) escolhida(s) dos capítulos pela utilidade isolada (pergunta com demanda, funciona sozinha, uma demonstração, oportunidade na SERP); cada corte funciona sozinho, com gancho próprio e sem depender do vídeo longo:`
          : `Cortes sugeridos (Shorts, Reels e TikTok): ${cortes.length} ideia(s) escolhida(s) dos capítulos (as que funcionam sozinhas em até 60 segundos); cada corte funciona sozinho, com gancho próprio e sem depender do vídeo longo:`, ...cortes]
        : porUtilidade
          /* 2026-10-07 · nenhum capítulo passa nos portões: nenhum corte inventado para completar a conta. */
          ? ["Cortes (Shorts, Reels e TikTok): nenhum capítulo da planta funciona sozinho como corte (pergunta própria, frase publicável e demonstração definida); os capítulos ficam no vídeo longo."]
          : ["Cortes (Shorts, Reels e TikTok, até 60 segundos): um por bloco do vídeo principal, cada um funcionando sozinho, com gancho próprio."]),
    ...(fatos
      ? [sequencia.curto ? "Um fato com fonte, dito em uma frase e com a fonte na legenda, também rende um vídeo curto." : `${cortes.length + 1}. Um fato com fonte, dito em uma frase, com a fonte na legenda.`]
      : []),
    ...(semCorte.length ? [`Capítulos sem corte: ${semCorte.join(" · ")}.`] : []),
    /* 2026-10-07 · com a planta, as cenas dos cortes e das lâminas seguem a mesma régua das demonstrações do vídeo longo. */
    ...(porUtilidade ? [REGRA_DAS_CENAS] : []),
    `Legenda na tela em todos os cortes, por acessibilidade e compreensão; gancho no primeiro segundo e convite para o vídeo longo ou ${aUnidade(unidade)}.`,
    ...carrossel,
    ...(nivel !== NIVEIS_DOS_CORTES[0]
      ? [`(Cortes, carrossel e a lista "Fica fora" encolhidos para caber na célula: frases encurtadas${nivel.enxuto ? ", sem a linha de alinhamento" : ""}; o texto inteiro de cada seção está na planta do artigo-modelo, no CSV para escrever.)`]
      : []),
    ...(fora.length ? ["Fica fora do texto publicável (sem fonte não entra em lâmina, legenda nem ideia do corte; na fala, só delimitada):", ...fora] : []),
  ].join("\n");
}

/*
 * 2026-10-07 (revisão) · O MOTIVO DO CAPÍTULO SEM CORTE. "Utilidade 3 de 4,
 * abaixo dos escolhidos" saía também para o capítulo EMPATADO com os
 * escolhidos que perdeu no desempate pela distribuição ao longo do vídeo —
 * afirmava uma utilidade menor que não existe.
 */
function motivoSemCorte(item: CapituloAvaliado, escolhidos: readonly CapituloAvaliado[]): string {
  if (!item.utilidade) return "fora da escolha por utilidade";
  if (!item.utilidade.elegivel) return item.utilidade.motivo;
  const menor = Math.min(...escolhidos.map(escolhido => (escolhido.utilidade?.elegivel ? escolhido.utilidade.pontos : Infinity)));
  return item.utilidade.pontos >= menor
    ? `utilidade ${item.utilidade.pontos} de 4, empatada com os escolhidos; ficou fora pela distribuição ao longo do vídeo`
    : `utilidade ${item.utilidade.pontos} de 4, abaixo dos escolhidos`;
}

/*
 * ===== 2026-10-07 (revisão) · OS CORTES E O CARROSSEL ENCOLHEM EM VEZ DE SEREM CORTADOS =====
 *
 * A lista "Fica fora do texto publicável" fica no fim de cortes_para_redes: com
 * seis capítulos, dois links e duas travas em cada, o teto da célula a cortava
 * no meio enquanto pode_gravar dizia "lista em cortes_para_redes". Como a
 * cadeia e o storyboard, a coluna encolhe por níveis — a ideia, a cena, o
 * visual da lâmina e as frases da lista encurtam; no último nível o alinhamento
 * sai — e diz que encolheu. Nenhuma frase da lista some: só encurta. O visual
 * da lâmina nunca some (o storyboard encolhido aponta para ele).
 */
const NIVEIS_DOS_CORTES = [
  { ideia: 0, parte: 0, visual: 0, fora: 100, motivo: 100, enxuto: false },
  { ideia: 160, parte: 90, visual: 110, fora: 70, motivo: 60, enxuto: false },
  { ideia: 110, parte: 60, visual: 60, fora: 50, motivo: 40, enxuto: false },
  { ideia: 90, parte: 45, visual: 40, fora: 40, motivo: 30, enxuto: true },
] as const;
type NivelDosCortes = typeof NIVEIS_DOS_CORTES[number];

/* A primeira versão que cabe na célula, da mais completa à mais curta; a última vale mesmo sem caber (a célula corta e diz). */
function primeiraQueCabe(versoes: ReadonlyArray<() => string>): string {
  let saida = "";
  for (const versao of versoes) {
    saida = versao();
    if (saida.length <= LIMITES.cellChars - 80) return saida;
  }
  return saida;
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
  /*
   * 2026-10-07 · O PROMPT PEDE OS TRÊS PRODUTOS E LIBERA A ORDEM (revisão do
   * CSV real): o prompt antigo não pedia o carrossel e mandava seguir "a
   * sequência de capítulos desta linha", contradizendo a diretriz que permite
   * reorganizar. Agora os três produtos saem nomeados, e a ordem é a dos
   * capítulos OU a que o vídeo render melhor.
   */
  return [
    `Escreva o roteiro de um vídeo para o YouTube, os cortes e o carrossel sobre ${entreAspas(principal || "o tema desta linha")}, em português do Brasil, usando SOMENTE os dados desta linha${opcoes.vozAtiva ? " e da linha \"Voz da marca\"" : ""}.`,
    "Entregue:",
    /* 2026-10-07 (revisão) · o prompt nomeava storyboard_visual e a coluna de curtos, mas não cadeia_competitiva — a coluna que diz por que cada capítulo existe. */
    `1) O vídeo longo: 3 opções de título, o gancho dos primeiros 15 segundos (pelo próprio tema, não por uma pergunta ampla), o roteiro falado na ordem dos capítulos desta linha OU na ordem em que o vídeo render melhor (a diretriz permite reorganizar), mantendo assunto, evidências e premissa e usando em cada capítulo a oportunidade que cadeia_competitiva aponta, com marcação de tempo ESTIMADA (os tempos da descrição se conferem na edição final), os capítulos para a descrição e a descrição com as fontes e o link ${daUnidade(unidade)}.`,
    /*
     * 2026-10-07 · "Os 3 cortes" mentia quando a escolha por utilidade deixa
     * menos (item 3); e a frase listada em "Fica fora do texto publicável" não
     * volta pelo roteiro escrito pela IA (item 5).
     */
    /*
     * 2026-10-07 · item 9 do desenho competitivo: o corte e o carrossel usam o
     * storyboard da linha (storyboard_visual) e a concorrência do formato curto
     * (concorrencia_curtos_e_carrossel) — a cena e o visual saem de lá, não de
     * um estilo inventado.
     */
    "2) Os cortes desta linha (até 3, escolhidos por utilidade) para Shorts/Reels/TikTok, cada um com fala própria, a cena do storyboard (storyboard_visual), a duração-alvo de concorrencia_curtos_e_carrossel e UM CTA.",
    "3) O carrossel desta linha, com o texto publicável de cada lâmina (título e apoio curto) e o visual de storyboard_visual, sem instrução interna no texto da lâmina; frase listada em \"Fica fora do texto publicável\" não entra em lâmina nem legenda, e na fala só entra delimitada.",
    "Estilo visual: só o que storyboard_visual registra como observado e o que quem abrir as referências anotar; não descreva estilo de imagem que ninguém viu.",
    "Não copie títulos nem falas de concorrentes. Não invente fato, número, estudo, depoimento, autor ou credencial. Fala do especialista só a que está nesta linha, atribuída.",
  ].join("\n");
}

/* ============================== a pesquisa competitiva (2026-10-07) ============================== */

/*
 * ===== 2026-10-07 · OS CONTEÚDOS DERIVADOS COMPETITIVOS PELA SERP (pedido do dono) =====
 *
 * "A ideia de poder criar conteúdos derivados do assunto é para utilizar a SERP
 * para fazer desses conteúdos competitivos, incluindo os dados de estilos de
 * imagem que podem ser utilizados para os storyboard; eles podem ser
 * fundamento dos vídeos e dos carrosséis." Três colunas, todas com o que a
 * pesquisa JÁ tem (Parte 1 do desenho, sem coleta nova):
 *
 *   - concorrencia_curtos_e_carrossel (item 6): os curtos que o Google mostra,
 *     os Shorts da pesquisa do YouTube com o motivo do zero, a presença dos
 *     blocos por lente, as redes sociais no orgânico das quatro lentes (a
 *     única leitura nova: o resumo das lentes extras, grátis, só no modo
 *     vídeo), a amostra pertinente de curtos, a duração-alvo e os carrosséis e
 *     posts que ranqueiam;
 *   - storyboard_visual (item 8): o estilo observado SÓ com o que se afirma sem
 *     ver imagem (domínio, presença, padrão de título, contagem das páginas),
 *     as referências para abrir, o checklist para quem abrir anotar, a
 *     ausência da identidade visual na Marca e o storyboard do vídeo, dos
 *     cortes e do carrossel;
 *   - cadeia_competitiva (item 2): referência → observação → oportunidade →
 *     entrega → formato, por id da planta; texto só liga por igualdade exata.
 *
 * Régua de não inventar, para as três: o Radar não vê imagem (nenhum adjetivo
 * de estilo), não assistiu vídeo (nada sobre o que é dito dentro dele), não
 * mede retenção nem alcance, e não liga por semelhança de texto.
 */

type SnapshotDaLinha = NonNullable<NonNullable<RadarPortableExportInput["serpObserved"]>["snapshot"]>;

const LENTE_LEGIVEL = new Map(SERP_CACHE_LENSES.map(lens => [serpCacheLensLabel(lens), radarPortableLensLabel(lens)] as const));
const lenteLegivel = (tecnico: string) => LENTE_LEGIVEL.get(tecnico) || tecnico.replace(/-/g, " · ");
const PLATAFORMA_DO_CURTO: Readonly<Record<string, string>> = { YOUTUBE: "YouTube", INSTAGRAM: "Instagram", TIKTOK: "TikTok" };

/** A lente da SERP que o pacote referencia (a da investigação): é dela que saem os curtos, as imagens e o orgânico canônico. */
function lenteDaInvestigacao(snapshot: SnapshotDaLinha | null): { tecnico: string | null; rotulo: string } {
  if (!snapshot) return { tecnico: null, rotulo: "lente da investigação" };
  const sistema = snapshot.operatingSystem ?? null;
  if (!sistema) return { tecnico: null, rotulo: `${snapshot.device} (sistema não registrado na coleta)` };
  const lens = { device: snapshot.device, operatingSystem: sistema };
  return { tecnico: serpCacheLensLabel(lens), rotulo: radarPortableLensLabel(lens) };
}

type PecaNaLente = { peca: RadarSocialPiece; url: string; titulo: string | null; lente: string; posicao: number | null };
/** 2026-10-07 (revisão) · `extras` (aditivo): as lentes extras lidas do cache, com a data em que o cache as observou. */
type LeituraDasRedes = { lidas: string[]; semLeitura: string[]; pecas: PecaNaLente[]; extrasLidas: boolean; extras: Array<{ rotulo: string; collectedAt: string | null }> };

/*
 * O ORGÂNICO DE REDE SOCIAL NAS LENTES: a da investigação pelo snapshot que o
 * pacote referencia; as três extras pelo resumo gravado no cache (só quando o
 * modo vídeo o leu). A mesma peça em duas lentes é uma peça, em duas lentes.
 */
function redesNoOrganico(snapshot: SnapshotDaLinha | null, resumos: RadarVideoLensOrganicReading | null): LeituraDasRedes {
  const daInvestigacao = lenteDaInvestigacao(snapshot);
  const pecas: PecaNaLente[] = [];
  const lidas: string[] = [];
  const semLeitura: string[] = [];
  const extras: LeituraDasRedes["extras"] = [];
  if (snapshot) {
    lidas.push(daInvestigacao.rotulo);
    for (const item of snapshot.organicResults.slice(0, 10)) {
      const peca = radarSocialPieceOf(item.url);
      if (peca) pecas.push({ peca, url: item.url, titulo: texto(item.title) || null, lente: daInvestigacao.rotulo, posicao: item.position });
    }
  }
  for (const lente of resumos?.lenses || []) {
    if (daInvestigacao.tecnico && lente.lens === daInvestigacao.tecnico) continue;
    const rotulo = lenteLegivel(lente.lens);
    if (!lente.organic) { semLeitura.push(`${rotulo} (${lente.missing || "sem leitura"})`); continue; }
    lidas.push(rotulo);
    extras.push({ rotulo, collectedAt: lente.collectedAt ?? null });
    for (const item of lente.organic.slice(0, 10)) {
      const peca = radarSocialPieceOf(item.url);
      if (peca) pecas.push({ peca, url: item.url, titulo: texto(item.title) || null, lente: rotulo, posicao: item.position });
    }
  }
  return { lidas, semLeitura, pecas, extrasLidas: Boolean(resumos), extras };
}

/*
 * 2026-10-07 (revisão) · DE QUANDO É CADA LENTE. A lente da investigação vem do
 * snapshot que o pacote referencia; as três extras, do resumo do cache no
 * momento da exportação (até 30 dias). Contá-las juntas sem dizer isso fazia de
 * leituras de datas diferentes a "mesma SERP". A linha diz que as extras são
 * observação fora do pacote, a data de cada coleta e se ela é posterior ao
 * congelamento — a mesma regra da coluna serp_lenses.
 */
function linhaDasLentesExtras(redes: LeituraDasRedes, congeladoEm: string | null): string | null {
  if (!redes.extras.length) return null;
  const congelamento = congeladoEm && !Number.isNaN(Date.parse(congeladoEm)) ? Date.parse(congeladoEm) : null;
  const porData = new Map<string, string[]>();
  for (const lente of redes.extras) {
    const data = radarWritingDate(lente.collectedAt);
    const posterior = data && congelamento !== null && Date.parse(lente.collectedAt!) > congelamento;
    const chave = data ? `coleta de ${data}${posterior ? ", posterior ao congelamento" : congelamento !== null ? ", anterior ao congelamento" : ""}` : "data da coleta não lida";
    porData.set(chave, [...(porData.get(chave) || []), lente.rotulo]);
  }
  const datas = [...porData].map(([chave, lentes]) => `${lentes.join(", ")}: ${chave}`).join(" · ");
  return `Lentes extras no orgânico: resumo do cache da marca no momento desta exportação, observação fora do pacote congelado${congelamento !== null ? ` (congelado em ${radarWritingDate(congeladoEm)})` : ""} — ${datas}.`;
}

/** O que a linha lê da concorrência, calculado uma vez e usado pelas três colunas. */
type LeituraCompetitiva = {
  principal: string;
  snapshot: SnapshotDaLinha | null;
  lente: { tecnico: string | null; rotulo: string };
  /** Os vídeos longos pertinentes da pesquisa do YouTube, pela melhor posição. */
  longosPertinentes: RadarYoutubeUniverseEntry[];
  shorts: { total: number; pertinentes: Array<RadarYoutubeUniverseEntry & { relevancia: Relevancia }> };
  curtosDoGoogle: Array<RadarGoogleShortVideo & { relevancia: Relevancia }>;
  redes: LeituraDasRedes;
  lentesCongeladas: RadarPortableFrozenLensesInput | null;
  amostra: RadarVideoPertinentSample | null;
  /** 2026-10-07 (revisão) · Quando o pacote foi congelado: a régua de "posterior ao congelamento" das lentes extras. */
  congeladoEm: string | null;
};

/*
 * 2026-10-07 (revisão) · A coluna de curtos tem a concorrência do curto? Curtos
 * pertinentes (Google ou pesquisa do YouTube) ou Reels, Shorts e vídeos do
 * TikTok no orgânico das lentes lidas. A abertura dos cortes aponta para ela.
 */
function temConcorrenciaCurta(c: LeituraCompetitiva): boolean {
  return amostraDeCurtos(c).length > 0
    || c.redes.pecas.some(item => !item.peca.perfil && (item.peca.tipo === "Reel" || item.peca.tipo === "Short" || (item.peca.rede === "TikTok" && item.peca.tipo === "vídeo")));
}

function leituraCompetitiva(input: {
  p: RadarWritingProjections;
  entrada: RadarPortableExportInput;
  youtube: RadarVideoExportYoutube | null;
  leitura: RadarVideoAudienceReading | null;
  publico: string | null;
  amostra: RadarVideoPertinentSample | null;
  lentesCongeladas: RadarPortableFrozenLensesInput | null;
  resumos: RadarVideoLensOrganicReading | null;
}): LeituraCompetitiva {
  const snapshot = input.entrada.serpObserved?.snapshot ?? null;
  const videos = input.youtube?.videos || [];
  const relevancia = (video: RadarYoutubeUniverseEntry): Relevancia => (input.leitura ? relevanciaDoVideo(video, input.leitura) : "GERAL");
  /*
   * Os curtos do Google passam pela MESMA régua de relevância da lista do topo.
   * Sem pesquisa do YouTube não há amostra para dizer o que "todo título tem":
   * a leitura sai sem raízes onipresentes (seis curtos da mesma busca repetem a
   * própria busca, e isso não é "só citar a plataforma").
   */
  const leituraDosCurtos = input.leitura ?? leituraDoPublico(input.p, input.publico, []);
  const shorts = videos.filter(video => video.universeClass === "COMPARABLE_SHORT").map(video => ({ ...video, relevancia: relevancia(video) }));
  return {
    principal: texto(input.p.dna.principalKeyword),
    snapshot,
    lente: lenteDaInvestigacao(snapshot),
    longosPertinentes: videos.filter(video => video.universeClass === "COMPARABLE_LONG_FORM" && RADAR_VIDEO_PERTINENT.has(relevancia(video))),
    shorts: { total: shorts.length, pertinentes: shorts.filter(video => RADAR_VIDEO_PERTINENT.has(video.relevancia)) },
    curtosDoGoogle: radarGoogleShortVideos(snapshot?.serpFeatures?.videos || [])
      .map(curto => ({ ...curto, relevancia: relevanciaDoVideo({ title: curto.titulo, channelName: curto.autor }, leituraDosCurtos) })),
    redes: redesNoOrganico(snapshot, input.resumos),
    lentesCongeladas: input.lentesCongeladas,
    amostra: input.amostra,
    congeladoEm: input.lentesCongeladas?.frozenAt ?? input.entrada.serpObserved?.frozenAt ?? null,
  };
}

const duracaoCurta = (segundos: number | null | undefined) => (typeof segundos === "number" && segundos > 0 ? mmss(segundos) : null);

/** Os curtos pertinentes do Google e da pesquisa do YouTube, sem repetir o Short que está nos dois. */
function amostraDeCurtos(c: LeituraCompetitiva): Array<{ segundos: number | null; plataforma: string; autor: string | null; titulo: string; origem: "GOOGLE" | "YOUTUBE" }> {
  const doGoogle = c.curtosDoGoogle.filter(curto => curto.curto && RADAR_VIDEO_PERTINENT.has(curto.relevancia));
  const noGoogle = new Set(doGoogle.map(curto => curto.youtubeVideoId).filter(Boolean));
  return [
    ...doGoogle.map(curto => ({ segundos: curto.segundos, plataforma: PLATAFORMA_DO_CURTO[curto.plataforma] || "outra plataforma", autor: curto.autor, titulo: curto.titulo, origem: "GOOGLE" as const })),
    ...c.shorts.pertinentes.filter(video => !noGoogle.has(video.videoId))
      .map(video => ({ segundos: video.durationSeconds, plataforma: "YouTube", autor: video.channelName, titulo: radarWritingDecodeEntities(video.title), origem: "YOUTUBE" as const })),
  ];
}

const contagemPor = (valores: readonly string[]) => {
  const conta = new Map<string, number>();
  for (const valor of valores) conta.set(valor, (conta.get(valor) || 0) + 1);
  return [...conta].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([valor, vezes]) => `${valor} ${vezes}`).join(" · ");
};

/* As peças de carrossel e post que ranqueiam: a mesma peça junta as lentes em que aparece; o carrossel confirmado vem primeiro. */
function postsQueRanqueiam(redes: LeituraDasRedes): Array<{ peca: RadarSocialPiece; url: string; titulo: string | null; onde: string[]; melhor: number }> {
  const porChave = new Map<string, { peca: RadarSocialPiece; url: string; titulo: string | null; onde: string[]; melhor: number }>();
  for (const item of redes.pecas) {
    if (item.peca.perfil || !["post", "carrossel confirmado (img_index)", "post de fotos", "artigo"].includes(item.peca.tipo)) continue;
    const atual = porChave.get(item.peca.chave);
    const onde = `${item.lente}${item.posicao ? ` posição ${item.posicao}` : ""}`;
    if (!atual) { porChave.set(item.peca.chave, { peca: item.peca, url: item.url, titulo: item.titulo, onde: [onde], melhor: item.posicao ?? 99 }); continue; }
    if (!atual.onde.includes(onde)) atual.onde.push(onde);
    atual.melhor = Math.min(atual.melhor, item.posicao ?? 99);
    atual.titulo = atual.titulo || item.titulo;
    /* A URL com img_index confirma o carrossel em qualquer lente em que apareça. */
    if (item.peca.tipo === "carrossel confirmado (img_index)") { atual.peca = item.peca; atual.url = item.url; }
  }
  return [...porChave.values()].sort((a, b) => Number(b.peca.tipo.startsWith("carrossel")) - Number(a.peca.tipo.startsWith("carrossel")) || a.melhor - b.melhor);
}

const BLOCOS_DE_FORMATO = ["short_videos", "video", "images", "perspectives", "discussions_and_forums"] as const;

function colunaConcorrenciaCurta(c: LeituraCompetitiva, youtube: RadarVideoExportYoutube | null): string {
  const linhas = [
    "Concorrência do formato curto e do carrossel — leitura do que o Google e o YouTube já mostraram (não há coleta própria de Reels, TikTok nem carrossel; nada foi assistido; posição e presença dizem o que a busca mostra, não retenção nem alcance).",
  ];
  /* (a) os curtos do Google, sem repetição, com autor, duração do título e relevância pela régua do topo. */
  const features = c.snapshot?.serpFeatures ?? null;
  const daYoutube = new Map((youtube?.videos || []).map(video => [video.videoId, video]));
  if (!c.snapshot) linhas.push("Curtos do Google: o pacote não traz a SERP da investigação nesta exportação.");
  else if (!features) linhas.push("Curtos do Google: a SERP gravada é anterior à leitura dos blocos de vídeo (sem os blocos na coleta).");
  else if (!c.curtosDoGoogle.length) linhas.push(`Curtos e vídeos que o Google mostra para ${entreAspas(c.principal || "o tema")} (${c.lente.rotulo}): nenhum — a SERP da investigação não tem bloco de vídeos curtos nem de vídeos no top 10.`);
  else {
    linhas.push(`Curtos e vídeos que o Google mostra para ${entreAspas(c.principal || "o tema")} (${c.lente.rotulo}; blocos de vídeos curtos e de vídeos, sem repetição; autor = o nome que o Google mostra; duração só quando o título a traz; o vídeo comum do bloco de vídeos fica fora da amostra de curtos):`);
    for (const [indice, curto] of c.curtosDoGoogle.slice(0, 9).entries()) {
      const noYoutube = curto.youtubeVideoId ? daYoutube.get(curto.youtubeVideoId) : null;
      const partes = [
        PLATAFORMA_DO_CURTO[curto.plataforma] || "outra plataforma",
        /* 2026-10-07 (revisão) · o "não é curto" saía só do bloco, sem a duração: o que se sabe é que o Google não o marcou como curto. */
        curto.curto ? (curto.peca && !curto.peca.perfil ? curto.peca.tipo : "vídeo curto") : "vídeo do bloco de vídeos (o Google não o marca como curto)",
        curto.autor,
        duracaoCurta(curto.segundos),
        entreAspas(cortar(curto.titulo, 70)),
        `relevância: ${RADAR_VIDEO_RELEVANCE_SHORT[curto.relevancia]}`,
        noYoutube ? `também na pesquisa do YouTube (posição ${noYoutube.bestRank})` : null,
      ].filter(Boolean);
      linhas.push(`${indice + 1}. ${partes.join(" · ")} — ${curto.url}`);
    }
  }
  /* (b) os Shorts da pesquisa do YouTube, pela régua de relevância, e o motivo do zero quando a corrida mediu. */
  if (!youtube) linhas.push("Shorts da pesquisa do YouTube: o artigo não tem pesquisa do YouTube.");
  else {
    const aviso = youtube.shortsNotice
      ?? (c.shorts.total ? null : "A corrida não registrou quantos Shorts o YouTube marcou: não dá para dizer se o zero é do YouTube ou da leitura da coleta.");
    linhas.push(`Shorts da pesquisa do YouTube: ${c.shorts.pertinentes.length} pertinente(s) de ${c.shorts.total} (Short pelo selo do YouTube ou pela duração).${aviso ? ` ${aviso}` : ""}`);
    for (const video of c.shorts.pertinentes.slice(0, 3)) {
      linhas.push(`- ${entreAspas(cortar(radarWritingDecodeEntities(video.title), 70))}${video.channelName ? ` · ${video.channelName}` : ""}${duracao(video.durationSeconds) ? ` · ${duracao(video.durationSeconds)}` : ""} · relevância: ${RADAR_VIDEO_RELEVANCE_SHORT[video.relevancia]} — ${enderecoDoVideo(video)}`);
    }
  }
  /* (c) a presença dos blocos por lente, pela cópia das quatro lentes congelada no pacote. */
  const bloco = c.lentesCongeladas?.block ?? null;
  const observadas = (bloco?.lenses || []).filter(lente => lente.status === "observed");
  if (observadas.length) {
    const presenca = BLOCOS_DE_FORMATO.map(tipo => {
      const com = observadas.filter(lente => lente.itemTypes.includes(tipo)).map(lente => lenteLegivel(lente.lens));
      return `${radarPortableSerpBlockLabel(tipo)}: ${com.length ? `${com.join(", ")} (${com.length} de ${observadas.length})` : `nenhuma das ${observadas.length}`}`;
    });
    linhas.push(`Presença dos blocos por lente (cópia das lentes congelada no pacote): ${presenca.join(" · ")}.`);
  } else if (features) {
    const presentes = BLOCOS_DE_FORMATO.map(tipo => `${radarPortableSerpBlockLabel(tipo)} ${features.itemTypes.includes(tipo) ? "sim" : "não"}`);
    linhas.push(`Presença dos blocos: o pacote não congelou as quatro lentes; na lente da investigação (${c.lente.rotulo}): ${presentes.join(" · ")}.`);
  }
  /* (d) as redes sociais no orgânico das lentes lidas, por tipo de peça, sem contar perfil. */
  const pecas = c.redes.pecas.filter(item => !item.peca.perfil);
  const distintas = new Map(pecas.map(item => [item.peca.chave, item.peca] as const));
  const perfis = new Set(c.redes.pecas.filter(item => item.peca.perfil).map(item => item.peca.chave)).size;
  const origemDasLentes = `top 10; ${c.redes.lidas.length ? c.redes.lidas.join(", ") : "nenhuma lente lida"}${c.redes.extrasLidas ? "" : "; as lentes extras não foram lidas nesta exportação"}`;
  if (!c.redes.lidas.length) linhas.push(`Redes sociais no orgânico: sem lente lida nesta exportação.${c.redes.semLeitura.length ? ` Sem leitura: ${c.redes.semLeitura.join("; ")}.` : ""}`);
  else if (!distintas.size) linhas.push(`Redes sociais no orgânico (${origemDasLentes}): nenhum Reel, post, carrossel, TikTok, Short nem LinkedIn.${perfis ? ` Perfis (fora da conta): ${perfis}.` : ""}`);
  else {
    const porRede = ["Instagram", "TikTok", "YouTube", "LinkedIn"].flatMap(rede => {
      const daRede = [...distintas.values()].filter(peca => peca.rede === rede);
      return daRede.length ? [`${rede} ${daRede.length} (${contagemPor(daRede.map(peca => peca.tipo))})`] : [];
    });
    const porLente = c.redes.lidas.map(lente => `${lente} ${new Set(pecas.filter(item => item.lente === lente).map(item => item.peca.chave)).size}`);
    linhas.push(`Redes sociais no orgânico (${origemDasLentes}): ${porRede.join(" · ")}${perfis ? ` · perfis (fora da conta): ${perfis}` : ""}. Por lente: ${porLente.join(" · ")}.`);
  }
  const dasExtras = linhaDasLentesExtras(c.redes, c.congeladoEm);
  if (dasExtras) linhas.push(dasExtras);
  if (c.redes.lidas.length && c.redes.semLeitura.length) linhas.push(`Lentes sem leitura do orgânico nesta exportação: ${c.redes.semLeitura.join("; ")}.`);
  /* A leitura da amostra pertinente de curtos e a duração-alvo dos cortes. */
  const amostra = amostraDeCurtos(c);
  const comDuracao = amostra.map(item => item.segundos).filter((valor): valor is number => typeof valor === "number" && valor > 0);
  if (!amostra.length) {
    linhas.push("Leitura da amostra pertinente de curtos: nenhum curto pertinente (mesmo público, público vizinho ou tema geral) no Google nem na pesquisa do YouTube.");
  } else {
    const faixa = radarYoutubeRange(comDuracao);
    const credenciados = amostra.filter(item => radarVideoCredentialMarker(item.autor)).length;
    const padroes = radarYoutubeTitlePatterns(amostra.map(item => item.titulo)).slice(0, 4).map(item => `${item.label} (${item.count})`);
    const doGoogle = amostra.filter(item => item.origem === "GOOGLE").length;
    linhas.push([
      `Leitura da amostra pertinente de curtos (${amostra.length}: ${doGoogle} do Google, ${amostra.length - doGoogle} da pesquisa do YouTube): `,
      faixa.median ? `duração mediana ${mmss(faixa.median)}${faixa.p25 && faixa.p75 && comDuracao.length >= 2 ? ` (metade central entre ${mmss(faixa.p25)} e ${mmss(faixa.p75)})` : ""}, ${comDuracao.length} com duração; ` : "sem duração no título nem na coleta; ",
      `plataformas: ${contagemPor(amostra.map(item => item.plataforma))}; `,
      `autor com credencial no nome: ${credenciados} de ${amostra.length}`,
      padroes.length ? `; padrões de título: ${padroes.join(" · ")}` : "",
      amostra.length < 4 ? ". Abaixo de 4 curtos, a leitura descreve casos, não mercado." : ".",
    ].join(""));
  }
  const p75 = comDuracao.length ? radarYoutubeRange(comDuracao).p75 : null;
  linhas.push(p75
    ? `Duração-alvo dos cortes: até ${mmss(p75)} (P75 dos ${comDuracao.length} curto(s) pertinente(s) com duração${comDuracao.length < 4 ? "; abaixo de 4, descreve casos, não mercado" : ""}; referência, não meta).`
    : "Duração-alvo dos cortes: até 60 segundos (sem curto pertinente com duração na amostra: a régua de 60 segundos dos cortes, sem referência de concorrência).");
  /* Os carrosséis e posts que ranqueiam: o cache não diz quantas lâminas nem o visual — quem abre anota. */
  const posts = postsQueRanqueiam(c.redes);
  if (posts.length) {
    linhas.push("Carrossel e posts que ranqueiam (abrir e anotar; o cache não diz quantas lâminas nem o visual):");
    for (const post of posts.slice(0, 8)) linhas.push(`- ${post.peca.rede} · ${post.peca.tipo} · ${post.onde.join(", ")} — ${post.url}${post.titulo ? ` — ${entreAspas(cortar(radarWritingDecodeEntities(post.titulo), 90))}` : ""}`);
  } else if (c.redes.lidas.length) {
    /* 2026-10-07 (revisão) · "nesta SERP" generalizava das lentes lidas para todas. */
    linhas.push(`Carrossel: nenhum post de Instagram, TikTok ou LinkedIn no top 10 das lentes lidas (${c.redes.lidas.join(", ")}); sem referência de carrossel nas lentes lidas.`);
  }
  const doInstagram = (features?.visualOpportunities || []).filter(imagem => /(^|\.)instagram\.com$/.test(imagem.sourceDomain || "")).length;
  /* 2026-10-07 (revisão) · só o domínio foi guardado: "post do Instagram" era inferência dita como fato. */
  if (doInstagram) linhas.push(`No bloco de imagens do Google (${c.lente.rotulo}), ${doInstagram} de ${features!.visualOpportunities.length} imagem(ns) vêm do instagram.com: imagem de uma página do instagram.com (o cache guarda o domínio, não o endereço da página).`);
  return linhas.join("\n");
}

/* ------------------------------ o storyboard ------------------------------ */

/*
 * A cena da demonstração, curta: o storyboard diz quantas telas e o que cada
 * uma mostra. `limite` (aditivo) encurta cada parte quando a célula aperta; a
 * demonstração inteira continua no "Mostrar na tela" de diretrizes_de_roteiro.
 */
function cenaDa(demo: Demonstracao | undefined, limite = 0): string {
  const curta = (valor: string) => (limite ? cortar(valor, limite) : valor);
  if (!demo) return "um exemplo do ponto, identificado como ilustrativo";
  if (demo.tipo === "ANTES_DEPOIS") return `${demo.objeto ? `${demo.objeto} — ` : ""}3 telas: antes ${entreAspas(curta(demo.antes))} · ajuste ${entreAspas(curta(demo.ajuste))} · depois ${demo.depois ? entreAspas(curta(demo.depois)) : "o resultado do ajuste na própria tela"}`;
  if (demo.tipo === "PASSOS") return `${demo.objeto ? `${demo.objeto} — ` : ""}${demo.passos.length} telas, uma por passo: ${demo.passos.map(curta).join("; ")}`;
  if (demo.tipo === "ACAO") return `${demo.objeto ? `${demo.objeto} — ` : ""}1 tela: ${curta(demo.acao)}`;
  return `capítulo explicativo (sem demonstração): ${demo.contexto ? curta(semPontoFinal(demo.contexto)) : "o título do capítulo em destaque"}`;
}

/* A ação única do corte, curta: a tela 2 do storyboard vertical. */
/* 2026-10-07 (revisão) · `passosDaIdeia` (aditivo): o corte que mostra os passos que a ideia nomeia tem uma tela por passo — a mesma cena da coluna de cortes. */
function acaoDoCorte(demo: Demonstracao | undefined, limite = 0, passosDaIdeia: readonly string[] = []): string {
  const curta = (valor: string) => (limite ? cortar(valor, limite) : valor);
  if (!demo || demo.tipo === "NENHUMA") return "tela 2: um exemplo identificado como ilustrativo";
  if (demo.tipo === "ANTES_DEPOIS") return `tela 2: o ajuste ${entreAspas(curta(demo.ajuste))} a partir do antes ${entreAspas(curta(demo.antes))}`;
  if (demo.tipo === "PASSOS" && passosDaIdeia.length >= 2) return `telas 2 a ${passosDaIdeia.length + 1}: os ${passosDaIdeia.length} passos que a ideia nomeia, um por tela — ${passosDaIdeia.map(passo => entreAspas(curta(passo))).join("; ")}`;
  if (demo.tipo === "PASSOS") return `tela 2: o primeiro passo ${entreAspas(curta(demo.passos[0]))}`;
  return `tela 2: a ação ${entreAspas(curta(demo.acao))}`;
}

/* O que cada nível de encolhimento corta em cada parte da cena e no título (0 = nada). */
const LIMITE_DA_PARTE = [0, 90, 50] as const;

/*
 * A REFERÊNCIA OBSERVADA DA MESMA PERGUNTA: um curto ou vídeo pertinente cujo
 * título divide 2+ raízes que distinguem o assunto da pergunta do capítulo.
 * Só o título foi lido — a referência é para abrir, não para afirmar o que diz.
 */
function referenciaDaPergunta(pergunta: string | null, c: LeituraCompetitiva, comuns: ReadonlySet<string>): string | null {
  if (!pergunta) return null;
  const daPergunta = palavrasDistintivas(pergunta, comuns).map(item => item.raiz);
  if (daPergunta.length < 2) return null;
  const casa = (titulo: string) => {
    const doTitulo = palavrasDistintivas(titulo, comuns).map(item => item.raiz);
    return daPergunta.filter(raiz => nomeia(doTitulo, raiz)).length >= 2;
  };
  const curto = c.curtosDoGoogle.find(item => RADAR_VIDEO_PERTINENT.has(item.relevancia) && casa(item.titulo));
  if (curto) return curto.url;
  const longo = c.longosPertinentes.find(video => casa(radarWritingDecodeEntities(video.title)));
  return longo ? enderecoDoVideo(longo) : null;
}

type EntradaDoStoryboard = {
  c: LeituraCompetitiva;
  p: RadarWritingProjections;
  entrada: RadarPortableExportInput;
  youtube: RadarVideoExportYoutube | null;
  sequencia: Sequencia;
  escolha: EscolhaDosCortes;
  artigoModelo: RadarArticleBlueprintPayload | null;
  publicavel: AberturaPublicavel;
  comuns: ReadonlySet<string>;
  unidade: RadarWritingUnit;
  destino: string;
};

/*
 * O teto da célula vale aqui também: com seis capítulos, nove referências e
 * endereços longos, o storyboard encolhe por igual — primeiro as referências
 * (uma de cada tipo), depois o visual de cada lâmina (que já está em
 * cortes_para_redes) — em vez de o corte da célula levar o carrossel.
 */
function colunaStoryboard(input: EntradaDoStoryboard): string {
  for (const nivel of [0, 1] as const) {
    const saida = storyboardNoNivel(input, nivel);
    if (saida.length <= LIMITES.cellChars - 80) return saida;
  }
  return storyboardNoNivel(input, 2);
}

function storyboardNoNivel(input: EntradaDoStoryboard, nivel: 0 | 1 | 2): string {
  const { c, p, sequencia, escolha } = input;
  const porTipo = nivel >= 1 ? 1 : 3;
  const parte = (valor: string) => (LIMITE_DA_PARTE[nivel] ? cortar(valor, LIMITE_DA_PARTE[nivel] + 40) : valor);
  const features = c.snapshot?.serpFeatures ?? null;
  const linhas = ["Estilo visual observado na SERP (só o que dá para afirmar sem ver as imagens: o Radar não vê imagem — lê endereço, domínio, título e contagem):"];
  /* O bloco de imagens do Google: quantas, de que domínio (inferência) e em quantas lentes. */
  const imagens = features?.visualOpportunities || [];
  const observadas = (c.lentesCongeladas?.block?.lenses || []).filter(lente => lente.status === "observed");
  const comImagens = observadas.filter(lente => lente.itemTypes.includes("images")).map(lente => lenteLegivel(lente.lens));
  const presenca = observadas.length ? `; o bloco aparece em ${comImagens.length} de ${observadas.length} lentes${comImagens.length ? ` (${comImagens.join(", ")})` : ""}` : "";
  if (imagens.length) {
    linhas.push(`- Google, bloco de imagens (${c.lente.rotulo}): ${imagens.length} imagem(ns) — origem pelo domínio (inferência, não estilo): ${contagemPor(imagens.map(imagem => (imagem.sourceDomain || "domínio não registrado").replace(/^www\./, "")))}${presenca}. O texto alternativo é o título da página de origem e não descreve a imagem: não define estilo.`);
  } else if (features || observadas.length) {
    linhas.push(`- Google, bloco de imagens: nenhuma imagem com texto alternativo na ${c.lente.rotulo}${presenca}.`);
  }
  /* Os títulos dos vídeos longos pertinentes: o padrão é do título, a thumbnail não foi vista. */
  const sinais = radarVideoTitleSignals(c.longosPertinentes.map(video => ({ title: radarWritingDecodeEntities(video.title), channelName: video.channelName })));
  if (sinais.total) {
    linhas.push(`- Títulos dos ${sinais.total} vídeos longos pertinentes do YouTube: caixa alta em ${sinais.caixaAlta} · número em ${sinais.numero} · pergunta em ${sinais.pergunta} · emoji em ${sinais.emoji} · credencial no título ou no canal em ${sinais.credencial}. A thumbnail não foi vista: o padrão é do título.`);
  } else {
    linhas.push(input.youtube ? "- YouTube: nenhum vídeo longo pertinente na amostra; sem padrão de título para seguir." : "- YouTube: sem pesquisa do YouTube; sem padrão de título observado.");
  }
  const curtos = c.curtosDoGoogle.filter(curto => curto.curto && RADAR_VIDEO_PERTINENT.has(curto.relevancia));
  if (curtos.length) {
    linhas.push(`- Curtos pertinentes do Google (${curtos.length}): autor com credencial no nome em ${curtos.filter(curto => radarVideoCredentialMarker(curto.autor)).length}; ${contagemPor(curtos.map(curto => PLATAFORMA_DO_CURTO[curto.plataforma] || "outra plataforma"))}.`);
  }
  /* As páginas concorrentes lidas: presença de imagem, lista e tabela, e a mediana de imagens (contagem do HTML). */
  const padrao = (rotulo: string) => p.serp.structuralPatterns.find(item => radarWritingCompareKey(item.label) === radarWritingCompareKey(rotulo)) || null;
  const usaImagens = padrao("Usa imagens");
  const usaListas = padrao("Usa listas");
  const usaTabelas = padrao("Usa tabelas");
  const medianaDeImagens = input.artigoModelo?.measures.serp.images ?? null;
  const dasPaginas = [
    ...(usaImagens ? [`usam imagens em ${usaImagens.present} de ${usaImagens.sampleSize}${typeof medianaDeImagens === "number" ? ` (mediana de ${medianaDeImagens} por página, contadas no HTML com logo e ícones)` : ""}`] : []),
    ...(usaListas ? [`listas em ${usaListas.present} de ${usaListas.sampleSize}`] : []),
    ...(usaTabelas ? [`tabelas em ${usaTabelas.present} de ${usaTabelas.sampleSize}`] : []),
  ];
  if (dasPaginas.length) linhas.push(`- Páginas concorrentes lidas: ${dasPaginas.join(" · ")}.`);

  /* As referências para abrir: thumbnails dos pertinentes, curtos e posts — abrir e anotar, nunca copiar. */
  const referencias = [
    ...c.longosPertinentes.filter(video => texto(video.thumbnailUrl)).slice(0, porTipo).map(video => `- thumbnail: ${entreAspas(cortar(radarWritingDecodeEntities(video.title), 60))} — ${video.thumbnailUrl}`),
    ...curtos.slice(0, porTipo).map(curto => `- curto: ${PLATAFORMA_DO_CURTO[curto.plataforma] || "outra plataforma"}${curto.autor ? ` · ${curto.autor}` : ""} — ${curto.url}`),
    ...postsQueRanqueiam(c.redes).slice(0, porTipo).map(post => `- ${post.peca.tipo}: ${post.peca.rede} — ${post.url}`),
    ...(nivel >= 1 ? ["- (referências encolhidas para caber na célula: as outras estão em concorrencia_curtos_e_carrossel e em serp_youtube)"] : []),
  ];
  linhas.push("Referências para olhar (abrir, anotar o estilo e não copiar):", ...(referencias.length ? referencias : ["- nenhuma referência visual com endereço nesta pesquisa."]));
  linhas.push("Anote ao abrir (o Radar não classifica imagem; quem abre registra): rosto em close? texto grande na imagem? antes e depois? tela de aplicativo? produto em destaque? cor dominante? quantas lâminas tem o carrossel?");
  linhas.push("Identidade visual da marca: a Marca não guarda paleta, tipografia nem logo (o cadastro da Marca não tem campo visual) — defina antes de produzir; vale para o vídeo, os cortes e o carrossel.");

  /* O storyboard do vídeo longo: uma cena por capítulo, e a cena é a demonstração da planta. */
  const daPlanta = sequencia.capitulos.filter(capitulo => capitulo.daPlanta);
  if (daPlanta.length) {
    linhas.push("Storyboard do vídeo longo (uma cena por capítulo; a cena é a demonstração da planta):");
    for (const [indice, capitulo] of daPlanta.entries()) {
      const referencia = referenciaDaPergunta(capitulo.provocacao ?? null, c, input.comuns);
      linhas.push(`- Cena ${indice + 1} · ${parte(capitulo.titulo)}: ${capitulo.provocacao ? `texto na tela: ${entreAspas(parte(capitulo.provocacao))} · ` : ""}imagem: ${cenaDa(capitulo.demo, LIMITE_DA_PARTE[nivel])} · ${referencia ? `referência observada (mesma pergunta, pelo título; não assistida): ${referencia}` : "sem referência observada da mesma pergunta"}.`);
    }
    linhas.push("Em toda cena: exemplo fictício identificado como ilustrativo; sem métrica, ranking nem resultado fictício como prova.");
  } else if (sequencia.capitulos.length) {
    linhas.push("Storyboard do vídeo longo: uma cena por capítulo — o título do capítulo na tela e um exemplo identificado como ilustrativo (a demonstração de cada capítulo vem com o artigo-modelo da SERP).");
  }
  const autores = input.entrada.authors ?? null;
  const quemFala = autores?.length ? `aba Especialista: ${autores.map(autor => autor.name).join(" e ")}` : "nenhum especialista definido na aba Especialista: sem rosto de terceiro";
  linhas.push(`- Thumbnail: a promessa do título em poucas palavras${sinais.total ? `; nos títulos pertinentes, número em ${sinais.numero} de ${sinais.total} e pergunta em ${sinais.pergunta} de ${sinais.total}` : ""}; rosto só de quem fala de fato (${quemFala}).`);

  /* Os cortes, na vertical: o gancho escrito no primeiro segundo, a ação única, o CTA. */
  if (sequencia.curto) {
    linhas.push("Storyboard dos curtos (vertical 9:16): o próprio vídeo é curto — primeiro segundo com o gancho escrito na tela, uma ação por vídeo, legenda o tempo todo.");
  } else if (escolha.escolhidos.length) {
    linhas.push("Storyboard dos cortes (vertical 9:16; a duração-alvo está em concorrencia_curtos_e_carrossel): primeiro segundo = o gancho escrito na tela; cena = a ação única do corte; legenda o tempo todo.");
    for (const [indice, { capitulo, numero }] of escolha.escolhidos.entries()) {
      if (!capitulo.daPlanta || !capitulo.pergunta) continue;
      linhas.push(`- Corte ${indice + 1} (capítulo ${numero}): tela 1: ${entreAspas(parte(radarVideoHookQuestion(capitulo.pergunta)))} · ${acaoDoCorte(capitulo.demo, LIMITE_DA_PARTE[nivel], capitulo.passosDaIdeia || [])} · tela final: o CTA do corte.`);
    }
  }

  /* O carrossel leva texto na imagem: a regra do plano visual do artigo não vale aqui. */
  if (daPlanta.length) {
    /*
     * 2026-10-07 (revisão) · a capa recomendava "pergunta ou número em destaque,
     * como os títulos pertinentes" ao lado de contagens que mostravam o padrão
     * RARO (pergunta em 1 de 29). Com pergunta e número em menos de um quarto
     * dos pertinentes, a frase diz que eles quase não usam — diferenciar.
     */
    const titulosPertinentes = sinais.total ? ` (nos títulos pertinentes: pergunta em ${sinais.pergunta} de ${sinais.total}, número em ${sinais.numero} de ${sinais.total})` : "";
    const raros = sinais.total >= 4 && sinais.pergunta * 4 < sinais.total && sinais.numero * 4 < sinais.total;
    linhas.push(`Storyboard do carrossel (o carrossel leva texto na imagem: a regra "sem texto legível" do plano visual do artigo não vale aqui; ${daPlanta.length + 2} lâminas, o texto de cada uma em cortes_para_redes):`);
    linhas.push(`- Lâmina 1 (capa): texto = ${input.publicavel.capa ? entreAspas(mensagemDaLamina(input.publicavel.capa)) : "o problema do tema em uma frase"} · estrutura: pergunta ou número em destaque${raros ? `, para diferenciar: os títulos pertinentes quase não usam${titulosPertinentes}` : titulosPertinentes}.`);
    const listas = padrao("Usa listas");
    for (const [indice, capitulo] of daPlanta.entries()) {
      const emLista = capitulo.demo?.tipo === "PASSOS";
      const visual = nivel >= 1 ? `o Visual da Lâmina ${indice + 2} em cortes_para_redes` : capitulo.demo ? visualDaLaminaPela(capitulo.demo) : "destaque do título";
      linhas.push(`- Lâmina ${indice + 2}: texto = o título ${entreAspas(parte(capitulo.titulo))} e o Apoio publicável · visual = ${visual}${emLista && listas ? ` (lista, como em ${listas.present} de ${listas.sampleSize} páginas concorrentes)` : ""}.`);
    }
    linhas.push(`- Lâmina ${daPlanta.length + 2}: texto = o CTA para ${aUnidade(input.unidade)}${input.destino ? ` (${input.destino})` : ""} · visual = o endereço legível na lâmina.`);
  } else {
    linhas.push("Storyboard do carrossel: capa com a promessa, uma lâmina por capítulo (título e a resposta curta, com texto na imagem) e o CTA na última.");
  }
  return linhas.join("\n");
}

/* ------------------------------ a cadeia competitiva ------------------------------ */

/* "assunto (N de M páginas cobrem)" → "assunto": a chave que liga a evidência à leitura do Google, por igualdade. */
const semContagem = (valor: string) => valor.replace(/\s*\((?:\d+ de \d+ páginas(?: cobrem)?|\d+ páginas? cobrem)\)\s*$/, "").trim();

/*
 * AS PÁGINAS QUE TRATAM UMA LACUNA, UM DIFERENCIAL OU UMA PERGUNTA: só pela
 * igualdade exata da chave (a régua de `editorial-blueprint.ts`). Sem
 * casamento, a linha diz "não ligadas" — nunca a página parecida.
 */
function paginasQueTratam(id: string, evidencia: { text: string } | undefined, observado: RadarPortableExportInput["googleObserved"], maxUrls = 2): string | null {
  if (!evidencia || !observado || !/^[GDP]\d+$/.test(id)) return null;
  const chave = radarWritingCompareKey(radarWritingDecodeEntities(semContagem(evidencia.text)));
  if (!chave) return null;
  const mesma = (valor: string) => radarWritingCompareKey(radarWritingDecodeEntities(valor)) === chave;
  const urls = id.startsWith("G")
    ? observado.gaps.find(item => mesma(item.subject))?.sources.map(fonte => fonte.url)
    : id.startsWith("D")
      ? observado.differentiations.find(item => mesma(item.subject))?.sources.map(fonte => fonte.url)
      : observado.questions.find(item => mesma(item.canonicalQuestion))?.sourceUrls;
  if (!urls) return id.startsWith("P") ? null : `páginas que tratam ${id}: não ligadas (o rótulo não casou com a leitura do Google)`;
  const unicas = [...new Set(urls)].slice(0, maxUrls);
  return unicas.length ? `páginas que tratam ${id}: ${unicas.join("; ")}` : null;
}

/*
 * O TETO DA CÉLULA (RADAR_VIDEO_EXPORT_CELL_CHARS): seis capítulos com seis
 * evidências cada e endereços longos passam de 10 mil caracteres. Em vez de o
 * corte da célula levar os últimos capítulos, cada elo encolhe por igual —
 * até 4 itens e 2 endereços; depois 2 e 1; por fim 1 item e nenhum endereço —
 * e a linha diz que encolheu e onde está o resto.
 */
const NIVEIS_DA_CADEIA = [{ itens: 4, urls: 2, parte: 0 }, { itens: 2, urls: 1, parte: 90 }, { itens: 1, urls: 0, parte: 50 }] as const;

function colunaCadeia(input: {
  c: LeituraCompetitiva;
  p: RadarWritingProjections;
  entrada: RadarPortableExportInput;
  youtube: RadarVideoExportYoutube | null;
  sequencia: Sequencia;
  escolha: EscolhaDosCortes;
  artigoModelo: RadarArticleBlueprintPayload | null;
  publicavel: AberturaPublicavel;
  foraDoEscopo: (valor: string | null | undefined) => boolean;
}): string {
  const { c, youtube, sequencia, escolha, artigoModelo } = input;
  const bp = youtube?.blueprint ?? null;
  const linhas = ["Cadeia competitiva de cada peça (referência → observação → oportunidade → entrega → formato; ids da planta do artigo-modelo da SERP; URL só quando o id ou o rótulo exato liga):"];
  /* O vídeo inteiro: os pertinentes do YouTube, o cruzamento com o Google e a premissa. */
  const topo = c.longosPertinentes.slice(0, 3).map(video => `${entreAspas(cortar(radarWritingDecodeEntities(video.title), 70))} — ${enderecoDoVideo(video)}`);
  const cruzados = youtube && c.snapshot?.serpFeatures
    ? radarCrossSerpVideoSignal({ features: c.snapshot.serpFeatures, youtubeUniverse: youtube.videos }).filter(item => item.signal === "CROSS_PLATFORM").slice(0, 2)
    : [];
  const padroes = (c.amostra?.longos.coorte.titlePatterns || bp?.observed.longForm.titlePatterns || []).filter(item => item.count > 0).slice(0, 4).map(item => `${item.label} (${item.count})`);
  /*
   * 2026-10-07 (revisão) · A FAIXA DO FORMATO QUE A SEQUÊNCIA SEGUE. A faixa era
   * a da coorte pertinente que LIDERA: com os pertinentes liderados por Shorts
   * e a sequência longa (que segue a fotografia), a linha dizia "vídeo longo,
   * faixa 25s a 45s". Agora é a dos longos pertinentes no vídeo longo (a dos
   * Shorts pertinentes no formato curto); quando os pertinentes lideram pelo
   * outro formato, a linha diz e aponta para a divergência registrada.
   */
  const coorteDoFormato: RadarYoutubeCohort | null = c.amostra ? (sequencia.curto ? c.amostra.curtos.coorte : c.amostra.longos.coorte) : null;
  const faixaDoFormato = coorteDoFormato ? radarVideoCohortRange(coorteDoFormato) : null;
  const faixa = faixaDoFormato ?? bp?.recommended.durationSecondsRange ?? null;
  const rotuloDaFaixa = faixaDoFormato ? (sequencia.curto ? "Shorts pertinentes" : "longos pertinentes") : "amostra inteira";
  const lideraOutro = Boolean(c.amostra && faixaDoFormato && (c.amostra.lider === "SHORTS") !== sequencia.curto);
  /* A lacuna de formato ausente é limite da amostra (o motivo do zero de Shorts está em concorrencia_curtos_e_carrossel), não assunto a disputar. */
  const lacunas = (bp?.recommended.gaps || []).filter(lacuna => lacuna.kind !== "FORMATO_AUSENTE" && !input.foraDoEscopo(lacuna.statement)).slice(0, 2).map(lacuna => `${lacunaComFraseAtual(lacuna.statement)} (${lacuna.evidence})`);
  linhas.push(
    "Vídeo inteiro",
    `- Referência: ${!youtube ? "sem pesquisa do YouTube" : topo.length ? `pertinentes mais bem posicionados no YouTube: ${topo.join(" · ")}` : "nenhum vídeo longo pertinente na pesquisa do YouTube"}${cruzados.length ? `; atravessa as duas buscas: ${cruzados.map(item => `${entreAspas(cortar(radarWritingDecodeEntities(item.title), 70))} (posição ${item.youtubeBestRank} no YouTube e no bloco de ${item.googleBlock === "SHORT_VIDEOS" ? "vídeos curtos" : "vídeos"} do Google)`).join(" · ")}` : ""}`,
    `- Observação: ${[
      ...(padroes.length ? [`padrões de título ${c.amostra ? "dos pertinentes" : "da amostra"}: ${padroes.join(" · ")}`] : []),
      ...(faixa ? [`faixa ${duracao(faixa.min)} a ${duracao(faixa.max)} (${rotuloDaFaixa})`] : []),
      ...(lideraOutro ? [`os pertinentes lideram por ${c.amostra!.lider === "SHORTS" ? "Shorts" : "vídeos longos"} (divergência registrada em intencao_e_formato)`] : []),
    ].join("; ") || "sem leitura do YouTube para observar"}`,
    `- Oportunidade: ${[...lacunas, ...(bp?.recommended.titleOpportunities.length ? [`título: ${semPontoFinal(bp.recommended.titleOpportunities[0])}`] : [])].join("; ") || "nenhuma lacuna registrada na pesquisa do YouTube"}`,
    `- Entrega: ${input.publicavel.premissa ? `premissa — ${input.publicavel.premissa}` : "a resposta às perguntas do público desta linha, na ordem dos capítulos"}`,
    `- Formato: ${sequencia.curto ? "formato curto (a SERP aponta Shorts) — cada pergunta, um vídeo" : `vídeo longo${faixa ? `, faixa ${duracao(faixa.min)} a ${duracao(faixa.max)} (${rotuloDaFaixa})` : ""}, ${sequencia.capitulos.length} capítulo(s)`}`,
  );
  const daPlanta = sequencia.capitulos.filter(capitulo => capitulo.daPlanta);
  if (!artigoModelo || !daPlanta.length) {
    linhas.push("Cadeia por capítulo: só com o artigo-modelo da SERP; a origem de cada pergunta está em perguntas_do_publico.");
    return linhas.join("\n");
  }
  const evidencias = new Map((artigoModelo.evidence || []).map(item => [item.id, item]));
  const porNumero = new Map(escolha.avaliados.map(item => [item.numero, item]));
  const cabecalho = linhas.join("\n");
  for (const [nivel, teto] of NIVEIS_DA_CADEIA.entries()) {
    const blocos = capitulosDaCadeia(teto);
    const encolheu = nivel > 0 ? [`(Cadeia encolhida para caber na célula: até ${teto.itens} item(ns) por elo${teto.urls ? ` e ${teto.urls} endereço(s) por lacuna ou pergunta` : ", sem os endereços das páginas"}; as outras evidências de cada seção estão na planta do artigo-modelo, no CSV para escrever.)`] : [];
    const tudo = [cabecalho, ...blocos, ...encolheu].join("\n");
    if (tudo.length <= LIMITES.cellChars - 80 || nivel === NIVEIS_DA_CADEIA.length - 1) return tudo;
  }
  return cabecalho;

  function capitulosDaCadeia(teto: { itens: number; urls: number; parte: number }): string[] {
    const saida: string[] = [];
    for (const [indice, capitulo] of daPlanta.entries()) {
      const secao = artigoModelo!.blueprint.sections[indice];
      if (!secao) continue;
      saida.push(...linhasDoCapitulo(capitulo, secao, indice, teto));
    }
    return saida;
  }

  function linhasDoCapitulo(capitulo: Capitulo, secao: RadarArticleBlueprintPayload["blueprint"]["sections"][number], indice: number, teto: { itens: number; urls: number; parte: number }): string[] {
    const ids = [...new Set([...(secao.evidence || []), ...(secao.from || [])])].filter(id => evidencias.has(id));
    const doTipo = (prefixos: RegExp) => ids.filter(id => prefixos.test(id));
    const referencias = rotuloDaEvidencia(artigoModelo!, doTipo(/^[SY]\d+$/)).slice(0, teto.itens);
    const ligacoes = teto.urls ? ids.map(id => paginasQueTratam(id, evidencias.get(id), input.entrada.googleObserved, teto.urls)).filter((item): item is string => Boolean(item)).slice(0, teto.itens) : [];
    const observacoes = [...rotuloDaEvidencia(artigoModelo!, doTipo(/^[PCBAFL]\d+$/)), ...origemDaSecao(artigoModelo!, { from: secao.from, evidence: secao.evidence || [] }).map(item => item.replace(/^- /, ""))].slice(0, teto.itens);
    const oportunidades = rotuloDaEvidencia(artigoModelo!, doTipo(/^[GDO]\d+$/)).slice(0, teto.itens);
    const avaliado = porNumero.get(indice + 1);
    const corte = escolha.numeroDoCorte.get(indice + 1);
    /* 2026-10-07 (revisão) · o mesmo motivo da coluna de cortes (empate dito como empate). */
    const semCorte = avaliado ? motivoSemCorte(avaliado, escolha.escolhidos) : "fora da escolha por utilidade";
    const entrega = capitulo.publicavel
      ? comFonte(semPontoFinal(capitulo.publicavel.frase), capitulo.publicavel.fonte)
      : capitulo.provocacao ? `a pergunta do público como provocação: ${entreAspas(capitulo.provocacao)}` : "fala delimitada (a frase do capítulo pede fonte)";
    return [
      `Capítulo ${indice + 1} · ${capitulo.titulo}`,
      `- Referência: ${[...referencias, ...ligacoes].join(" · ") || "nenhum resultado ou vídeo da SERP citado pela seção"}`,
      `- Observação: ${observacoes.join(" · ") || "nenhuma pergunta, conceito ou tema da SERP citado pela seção"}`,
      `- Oportunidade: ${oportunidades.join(" · ") || "nenhuma lacuna ou diferencial ligado a este capítulo — a disputa é pela execução (demonstração e clareza), não por assunto novo"}`,
      `- Entrega: ${teto.parte ? cortar(entrega, teto.parte + 60) : entrega} · demonstração: ${cenaDa(capitulo.demo, teto.parte)}`,
      `- Formato: capítulo ${indice + 1} do vídeo longo · ${corte ? `corte ${corte}${avaliado?.utilidade?.elegivel ? ` (utilidade ${avaliado.utilidade.pontos} de 4)` : ""}` : `sem corte: ${semCorte}`} · lâmina ${indice + 2} do carrossel`,
    ];
  }
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
  /**
   * 2026-10-07 · Aditivos (item 6 do desenho competitivo): as quatro lentes
   * congeladas no pacote (presença dos blocos por lente) e o orgânico das
   * lentes extras lido do resumo do cache (só no modo vídeo da rota). Ausentes,
   * a coluna de curtos diz o que não foi lido.
   */
  lentesCongeladas?: RadarPortableFrozenLensesInput | null;
  lensDigests?: RadarVideoLensOrganicReading | null;
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
  /*
   * 2026-10-07 · A TRAVA DE FONTE DA LINHA (item 5): as afirmações que pedem
   * fonte (planta, mercado sem fonte, mercado × fonte) e as raízes que não
   * distinguem assunto. Ela passa por TODO texto publicável: capítulos (Apoio da
   * lâmina, Ideia única do corte), premissa, capa e promessa do gancho.
   */
  const trava: RadarVideoClaimLock = { pendentes: radarPendingClaims(p, artigoModelo), comuns: radarClaimCommonStems(p, artigoModelo) };
  const publicavel = aberturaPublicavel(input, artigoModelo, youtube?.blueprint ?? null, trava);
  /* 2026-10-02 · com planta (e fora do formato curto), os capítulos são as seções dela. */
  const sequencia: Sequencia = artigoModelo && !daSerp.curto && artigoModelo.blueprint.sections.length
    ? { capitulos: capitulosDaPlanta(artigoModelo, trava), curto: false, restantes: [] }
    : daSerp;
  const vozAtiva = contexto.brandVoiceActive ?? contexto.brandVoice?.kind === "available";

  const ressalvas: string[] = [];
  if (!youtube) ressalvas.push("sem pesquisa do YouTube: formato, duração e concorrência em vídeo não foram observados");
  else if (!youtube.frozen) ressalvas.push("a pesquisa do YouTube ainda não foi congelada");
  if (!(p.autoridade?.factualEvidence || []).some(item => item.supportType === "SUPPORTS")) ressalvas.push("nenhum fato com fonte verificada");
  /* 2026-10-07 · a correção automática é dita: quantas frases a trava tirou do texto publicável, e onde está a lista. */
  const foraDoPublicavel = publicavel.fora.length + sequencia.capitulos.reduce((soma, capitulo) => soma + (capitulo.travadas?.length || 0), 0);
  if (foraDoPublicavel) ressalvas.push(`${foraDoPublicavel} frase(s) que pedem fonte saíram do texto publicável (lista em cortes_para_redes)`);
  /* 2026-10-02 · com bloqueio, "Não" e o prompt condiciona o roteiro à resolução (como no CSV para escrever). */
  const bloqueio = p.prontidao?.state === "BLOCKED"
    ? `${p.prontidao.reasons.join("; ")}${p.prontidao.actions.length ? ` (${p.prontidao.actions.join("; ")})` : ""}`
    : null;
  const pode = bloqueio
    ? `Não, até resolver o bloqueio:\n- a investigação tem bloqueio: ${bloqueio}.${ressalvas.length ? `\n${ressalvas.map(item => `- ${item}.`).join("\n")}` : ""}`
    : ressalvas.length ? `Com ressalva:\n${ressalvas.map(item => `- ${item}.`).join("\n")}` : "Sim.";

  /*
   * 2026-10-07 · A AMOSTRA PERTINENTE: a relevância (a mesma régua da lista de
   * vídeos do topo) lida do UNIVERSO INTEIRO — não só dos 10 listados. As
   * estatísticas da coluna de intenção saem só dos pertinentes; sem universo
   * (congelamento só com a referência da corrida), a coluna diz que não dá.
   */
  const publico = publicoDoVideo(input, contexto.brandVoice);
  /* 2026-10-07 · a leitura do público é uma só para a linha: a amostra pertinente e as três colunas competitivas usam a mesma. */
  const leitura = youtube?.videos.length ? leituraDoPublico(p, publico, youtube.videos.map(video => video.title)) : null;
  const pertinentes = youtube?.videos.length && leitura
    ? radarVideoPertinentSample({ videos: youtube.videos, relevancia: video => relevanciaDoVideo(video, leitura), collectedAt: youtube.collectedAt })
    : null;
  /* 2026-10-07 (revisão) · a amostra inteira pela MESMA régua de hoje: a divergência de formato compara os pertinentes com ela, não com o classificador da fotografia. */
  const inteira = pertinentes && youtube
    ? radarVideoPertinentSample({ videos: youtube.videos, relevancia: () => "GERAL", collectedAt: youtube.collectedAt })
    : null;
  /*
   * 2026-10-07 · A PESQUISA COMPETITIVA DA LINHA (itens 2, 6 e 8): calculada uma
   * vez; a escolha dos cortes também, para a coluna de cortes, a cadeia e o
   * storyboard dizerem o mesmo corte de cada capítulo.
   */
  const destino = texto(input.article.canonical) || (texto(input.article.slug) ? `/${texto(input.article.slug)}` : "");
  const competitiva = leituraCompetitiva({ p, entrada: input, youtube, leitura, publico, amostra: pertinentes, lentesCongeladas: contexto.lentesCongeladas ?? null, resumos: contexto.lensDigests ?? null });
  const escolha = escolhaDosCortes(youtube, sequencia, p, artigoModelo, trava);
  /*
   * 2026-10-07 (revisão) · roteiro e cortes encolhem por níveis (NIVEIS_DO_ROTEIRO
   * e NIVEIS_DOS_CORTES) em vez de o teto da célula cortar o fim deles — onde
   * ficam o CTA, as regras e a lista "Fica fora do texto publicável".
   */
  const linhaDaVoz = vozAtiva ? ['Voz da marca: gancho, fala, CTA e descrição seguem a linha "Voz da marca" deste arquivo (vocabulário, o que a marca não faz e a página comercial que ela permite citar).'] : [];
  const roteiro = primeiraQueCabe(NIVEIS_DO_ROTEIRO.map(nivel => () => [colunaRoteiro(input, p, youtube, abertura, sequencia, artigoModelo, publicavel, nivel), ...linhaDaVoz].join("\n")));
  const concorrenciaCurta = temConcorrenciaCurta(competitiva);
  const cortesDaLinha = primeiraQueCabe(NIVEIS_DOS_CORTES.map(nivel => () => colunaCortes(youtube, sequencia, p, unidade, artigoModelo, destino, { trava, publicavel, escolha, pertinentes, concorrenciaCurta, nivel })));
  const row: RadarVideoExportRow = {
    ordem: String(contexto.position),
    pode_gravar: pode,
    tema_e_publico: colunaTema(input, p, contexto.brandVoice),
    intencao_e_formato: colunaIntencao(input, p, youtube, pertinentes, inteira),
    serp_youtube: colunaSerpYoutube(p, youtube, foraDoEscopo, publico),
    /* 2026-10-07 · cada pergunta diz de onde vem (Pessoas também perguntam, N de M páginas, necessidade central). */
    perguntas_do_publico: colunaPerguntas(p, perguntas),
    termos_e_entidades: colunaTermos(p, foraDoEscopo),
    fatos_e_fontes: colunaFatos(p),
    especialista: colunaEspecialista(input, p),
    biblioteca_da_marca: colunaBiblioteca(p, artigoModelo, {
      /* 2026-10-02 · o trecho da fala ligado ao tema: as raízes da principal, das complementares e dos capítulos. */
      raizes: new Set(radarSemanticStems([principal, ...p.dna.secondaryKeywords, ...p.dna.narrativeReinforcements, ...sequencia.capitulos.map(capitulo => capitulo.titulo)].join(" "))),
      capitulos: sequencia.capitulos,
    }),
    diretrizes_de_roteiro: roteiro,
    cortes_para_redes: cortesDaLinha,
    concorrencia_curtos_e_carrossel: colunaConcorrenciaCurta(competitiva, youtube),
    storyboard_visual: colunaStoryboard({ c: competitiva, p, entrada: input, youtube, sequencia, escolha, artigoModelo, publicavel, comuns: trava.comuns, unidade, destino }),
    cadeia_competitiva: colunaCadeia({ c: competitiva, p, entrada: input, youtube, sequencia, escolha, artigoModelo, publicavel, foraDoEscopo }),
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

const APRESENTADOR_E_IDENTIDADE = "Apresentador e identidade visual: em storyboard_visual de cada linha (rosto só de quem fala de fato, pela aba Especialista; a Marca não guarda paleta, tipografia nem logo).";

export function buildRadarVideoTopRow(input: { articles: readonly RadarVideoExportArticle[]; brandVoice?: RadarBrandVoiceState }): RadarVideoExportRow {
  const semYoutube = input.articles.filter(item => !item.hasYoutube);
  const vazio = Object.fromEntries(RADAR_VIDEO_EXPORT_COLUMNS.map(coluna => [coluna, ""])) as RadarVideoExportRow;
  return {
    ...vazio,
    ordem: "Marca",
    pode_gravar: celula([
      `${input.articles.length} tema(s) neste arquivo.`,
      ...(semYoutube.length ? [`- ${semYoutube.length} sem pesquisa do YouTube: ${semYoutube.slice(0, 5).map(item => entreAspas(item.label)).join(", ")}. Rode a pesquisa do YouTube no Radar para ter os dados de vídeo.`] : []),
      /*
       * 2026-10-07 (revisão) · "Apresentador e identidade visual não fazem parte
       * deste arquivo" contradizia o storyboard_visual de cada linha, que diz o
       * rosto da thumbnail pela aba Especialista e que a Marca não guarda
       * identidade visual. A linha de topo agora aponta para lá.
       */
      input.brandVoice?.kind === "available"
        ? `- Voz da marca: linha "Voz da marca" logo abaixo (${rotuloDaVoz(input.brandVoice.voice)}). ${APRESENTADOR_E_IDENTIDADE}`
        : input.brandVoice
          ? `- ${radarBrandVoiceAbsence(input.brandVoice)} ${APRESENTADOR_E_IDENTIDADE}`
          : `- Voz da marca: não informada nesta exportação. ${APRESENTADOR_E_IDENTIDADE}`,
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
 *
 * 2026-10-07 · Sai também a seção de ENTREGA DE ARTIGO (entrega e revisão
 * final, instrução para o teste): mandava entregar H1, SEO title, meta
 * description e corpo do artigo dentro do arquivo de vídeo.
 */
export function buildRadarVideoBrandVoiceRow(state: RadarBrandVoiceState | undefined): RadarVideoExportRow | null {
  if (state?.kind !== "available") return null;
  const por = radarBrandVoiceBySlot(state.voice);
  const evitar = state.voice.sections.filter(secao => secao.body.trim() && radarBrandVoiceSectionIsAvoid(secao.heading));
  const ehEvitar = new Set(evitar);
  /*
   * 2026-10-07 · ENTREGA DE ARTIGO FORA DA LINHA DE VOZ (revisão do CSV real).
   * A seção que manda entregar H1, SEO title, meta description e corpo do
   * artigo — e a instrução que manda ESCREVER O ARTIGO — conflitam com a
   * finalidade deste arquivo: saem de TODAS as colunas da linha de voz e são
   * nomeadas no "Fica fora". O que a marca não faz tem prioridade (seção de
   * evitar nunca é tratada como entrega), e o CSV para escrever não muda.
   */
  const entregaDoArtigo = state.voice.sections.filter(secao => secao.body.trim() && !ehEvitar.has(secao) && radarBrandVoiceSectionIsArticleDelivery(secao));
  const ehEntrega = new Set(entregaDoArtigo);
  const fora = (lista: readonly RadarBrandVoiceSection[]) => lista.filter(secao => !ehEvitar.has(secao) && !ehEntrega.has(secao));
  const comercial = fora([...por.structure, ...por.reader]).filter(secao => radarBrandVoiceSectionIsCommercial(secao.heading));
  const ehComercial = new Set(comercial);
  const soDoArtigo = [...fora(por.title), ...fora(por.structure).filter(secao => !ehComercial.has(secao)), ...fora(por.links), ...fora(por.visual), ...entregaDoArtigo];
  const paginas = radarBrandVoiceOwnUrls(state.voice, null);
  const titulo = (secao: RadarBrandVoiceSection) => secao.heading.replace(/^\d+[.)]\s*/, "");
  const vazio = Object.fromEntries(RADAR_VIDEO_EXPORT_COLUMNS.map(coluna => [coluna, ""])) as RadarVideoExportRow;
  const row: RadarVideoExportRow = {
    ...vazio,
    ordem: "Voz da marca",
    pode_gravar: [
      `Vale para todos os vídeos deste arquivo: ${rotuloDaVoz(state.voice)}. O tema vem de cada linha; o público, a voz, o CTA e o que a marca não faz vêm desta.`,
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
  articles: ReadonlyArray<{
    articleId?: string;
    entrada: RadarPortableExportInput;
    youtube?: RadarVideoExportYoutube | null;
    blueprint?: RadarArticleBlueprintPayload | null;
    /** 2026-10-07 · Aditivos (item 6): as lentes congeladas do pacote e o orgânico das lentes extras (só no modo vídeo da rota). */
    lentesCongeladas?: RadarPortableFrozenLensesInput | null;
    lensDigests?: RadarVideoLensOrganicReading | null;
  }>;
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
    lentesCongeladas: artigo.lentesCongeladas ?? null,
    lensDigests: artigo.lensDigests ?? null,
  }));
  const voz = buildRadarVideoBrandVoiceRow(input.brandVoice);
  return {
    csv: radarVideoExportCsv([buildRadarVideoTopRow({ articles: artigos, brandVoice: input.brandVoice }), ...(voz ? [voz] : []), ...artigos.map(item => item.row)]),
    filename: radarVideoExportFilename({ keywords: artigos.map(item => item.label), today: input.today }),
    exported: artigos.length,
    withoutYoutube: artigos.filter(item => !item.hasYoutube).length,
  };
}
