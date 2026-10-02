import { buildRadarYoutubeBlueprint, type RadarYoutubeBlueprint } from "./youtube-blueprint.ts";
import type { RadarYoutubeUniverseEntry } from "./youtube-search-model.ts";
import type { RadarYoutubeSearchRun } from "./youtube-search-run.ts";
import type { RadarYoutubeFrozenInvestigation } from "./youtube-evidence.ts";
import { radarTextAdheresToCore, radarUbiquitousStems } from "./intent-adherence.ts";
import { radarSemanticStems } from "./semantic-concept-model.ts";
import type { RadarPortableExportInput } from "./portable-export.ts";
import { radarBrandVoiceAbsence, radarBrandVoiceBySlot, radarBrandVoiceLabel, radarBrandVoiceText, type RadarBrandVoiceState } from "./brand-voice.ts";
import { radarPortableVideoUsageLine } from "./portable-annex-context.ts";
import {
  radarWritingCompareKey,
  radarWritingContentWords,
  radarWritingDate,
  radarWritingDecodeEntities,
  radarWritingOpeningQuestion,
  radarWritingProjections,
  radarWritingRhetoricalQuestion,
  radarWritingSpecialistContributions,
  radarWritingSpreadsheetSafe,
  radarWritingUnsupportedClaims,
  type RadarWritingProjections,
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

const LIMITES = { videos: 10, questions: 12, terms: 18, sources: 6, cellChars: 6_000, titleChars: 90 } as const;

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
  return {
    frozen: Boolean(congelada),
    collectedAt: daFotografia?.provenance.collectedAt ?? congelada?.runRef?.collectedAt ?? null,
    queries: [...new Set((daFotografia?.queries || []).filter(item => item.executed).map(item => item.text))]
      .concat([...new Set(universo.flatMap(item => item.queriesFoundIn).map(id => textoDa.get(id)).filter((valor): valor is string => Boolean(valor)))])
      .filter((valor, indice, lista) => lista.indexOf(valor) === indice),
    videos: [...universo].sort((a, b) => a.bestRank - b.bestRank || b.occurrenceCount - a.occurrenceCount),
    blueprint,
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

/* ============================== as colunas ============================== */

function colunaTema(input: RadarPortableExportInput, p: RadarWritingProjections): string {
  const principal = texto(p.dna.principalKeyword);
  const complementares = unicos([...p.dna.secondaryKeywords, ...p.dna.narrativeReinforcements])
    .filter(item => radarWritingCompareKey(item) !== radarWritingCompareKey(principal));
  const volume = new Map(p.keywords.map(item => [radarWritingCompareKey(item.keyword), item.volume]));
  const comVolume = (keyword: string) => {
    const v = volume.get(radarWritingCompareKey(keyword));
    return typeof v === "number" ? `${keyword} · ${numero(v)}/mês` : keyword;
  };
  return [
    `Tema (keyword principal): ${principal ? comVolume(principal) : "não resolvida no pacote"}`,
    ...(p.assunto ? [`Assunto (tronco): ${p.assunto.phrase}`] : []),
    ...(complementares.length ? ["Termos de busca relacionados (falar naturalmente, sem forçar):", ...complementares.map(item => `- ${comVolume(item)}`)] : []),
    ...(texto(input.article.audience) ? [`Público: ${texto(input.article.audience)}`] : []),
    ...(texto(input.article.promise) ? [`Promessa ao público: ${texto(input.article.promise)}`] : []),
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

function colunaSerpYoutube(p: RadarWritingProjections, youtube: RadarVideoExportYoutube | null): string {
  const linhas: string[] = ["Referência de pesquisa, não conteúdo a copiar: não reproduza títulos, falas nem roteiros de terceiros."];
  if (youtube) {
    const data = radarWritingDate(youtube.collectedAt);
    linhas.push(`Pesquisa do YouTube${youtube.frozen ? " (congelada)" : " (corrida gravada, ainda não congelada)"}${data ? ` · coleta de ${data}` : ""}`);
    if (youtube.queries.length) linhas.push(`Consultas: ${youtube.queries.slice(0, 6).join(" · ")}`);
    if (youtube.videos.length) {
      linhas.push("Vídeos no topo (melhor posição entre as consultas):");
      for (const [indice, video] of youtube.videos.slice(0, LIMITES.videos).entries()) {
        const partes = [
          cortar(radarWritingDecodeEntities(video.title), LIMITES.titleChars),
          video.channelName || null,
          video.isShorts ? "Short" : duracao(video.durationSeconds) || video.durationLabel,
          typeof video.views === "number" ? `${numero(video.views)} visualizações` : null,
          video.publishedAtLabel || radarWritingDate(video.publishedAt),
          video.occurrenceCount > 1 ? `aparece em ${video.occurrenceCount} consultas` : null,
          enderecoDoVideo(video),
        ].filter(Boolean);
        linhas.push(`${indice + 1}. ${partes.join(" · ")}`);
      }
    }
    const bp = youtube.blueprint;
    if (bp) {
      const canais = bp.observed.recurrentChannels.slice(0, 5).map(canal => `${canal.channelName} (${canal.videos} vídeo(s), melhor posição ${canal.bestRank})`);
      if (canais.length) linhas.push(`Canais que dominam: ${canais.join(" · ")}`);
      const padroes = bp.observed.longForm.titlePatterns.filter(item => item.count > 0).slice(0, 5).map(item => `${item.label} (${item.count})`);
      if (padroes.length) linhas.push(`Padrões de título: ${padroes.join(" · ")}`);
      const termos = bp.observed.longForm.recurrentTerms.slice(0, 10).map(item => item.term);
      if (termos.length) linhas.push(`Termos que se repetem nos títulos: ${termos.join(" · ")}`);
      if (bp.recommended.gaps.length) {
        linhas.push("Lacunas no YouTube (onde entrar):");
        for (const lacuna of bp.recommended.gaps.slice(0, 5)) linhas.push(`- ${lacuna.statement} (${lacuna.evidence})`);
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
  return linhas.join("\n");
}

/** As perguntas do público que aderem ao tema — a SERP manda, mas só o que é do assunto. */
function perguntasDoPublico(p: RadarWritingProjections): string[] {
  const nucleo = new Set([p.dna.principalKeyword, ...p.keywords.map(item => item.keyword)].flatMap(valor => radarSemanticStems(texto(valor))));
  const candidatas = [
    ...(p.descoberta?.answerableUnits || []).filter(unidade => unidade.importance === "CORE").map(unidade => unidade.questionOrNeed),
    ...(p.descoberta?.questionCoverageRequirements || []).map(item => item.question),
    ...(p.serpObservada?.peopleAlsoAsk || []).map(item => texto(item.question)),
    ...p.serp.questions.slice().sort((a, b) => b.pages - a.pages).map(item => item.question),
  ].map(item => radarWritingDecodeEntities(texto(item)).replace(/\s+\?/g, "?")).filter(pergunta => pergunta && !radarVideoRhetoricalQuestion(pergunta));
  /* A MESMA régua do export para escrever: raiz da principal que está em toda parte é cenário, não assunto. */
  const daPrincipal = new Set(radarSemanticStems(texto(p.dna.principalKeyword)));
  const onipresentes = new Set([...radarUbiquitousStems(candidatas)].filter(raiz => daPrincipal.has(raiz)));
  const aderentes = nucleo.size ? candidatas.filter(pergunta => radarTextAdheresToCore(pergunta, nucleo, onipresentes)) : candidatas;
  return unicos(aderentes).filter(pergunta => !/\b(faq|perguntas frequentes)\b/i.test(pergunta)).slice(0, LIMITES.questions);
}

/** Pergunta de fecho de concorrente não é dúvida do público: a MESMA régua do export para escrever. */
export const radarVideoRhetoricalQuestion = radarWritingRhetoricalQuestion;

function colunaTermos(p: RadarWritingProjections): string {
  const termos = unicos([
    ...p.serp.concepts.filter(item => item.status !== "ISOLATED" && item.sourceCount >= 2 && !item.label.trim().endsWith("?")).map(item => item.label),
    ...(p.descoberta?.conceptRelations || []).filter(relacao => relacao.basis === "OBSERVED").flatMap(relacao => [relacao.subject, relacao.object]),
    ...(p.serpObservada?.relatedSearches || []).map(item => texto(item.term)),
  ].map(item => radarWritingDecodeEntities(texto(item))).filter(item => item && !item.endsWith("?") && radarWritingContentWords(item).size >= 2)).slice(0, LIMITES.terms);
  const entidades = (p.serpObservada?.diagnostic?.frequentEntities || []).slice(0, 8);
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

function colunaEspecialista(p: RadarWritingProjections): string {
  const contribuicoes = radarWritingSpecialistContributions(p);
  const pendentes = p.especialista.pending;
  if (!contribuicoes.length) {
    return pendentes
      ? `Especialista: ${pendentes} parecer(es) aguardando aceite no Radar; não usar até serem aceitos.`
      : "Especialista: sem contribuição aceita. Se houver alguém que pratica o tema, a fala dele em câmera vale mais que qualquer roteiro.";
  }
  const fechamento = contribuicoes.filter(item => item.tipo === "FECHAMENTO" || item.tipo === "CTA");
  return [
    "A voz de quem pratica (atribuir como fala do especialista, sem inventar nome nem credencial):",
    ...contribuicoes.map(item => `- ${item.rotulo}${item.tipo ? ` (${item.tipo === "FECHAMENTO" ? "fechamento" : item.tipo === "CTA" ? "chamada final" : "diretriz"})` : ""}: ${entreAspas(item.resposta)}`),
    ...(fechamento.length ? [`Use ${fechamento.map(item => item.rotulo).join(", ")} na virada final e no CTA do vídeo.`] : []),
    ...(pendentes ? [`Há ainda ${pendentes} parecer(es) aguardando aceite no Radar.`] : []),
  ].join("\n");
}

function colunaBiblioteca(p: RadarWritingProjections): string {
  /*
   * 2026-10-02 · OS MODOS DE USO VÊM MESMO SEM CASAMENTO (Adendo B, D6).
   *
   * O dono pode marcar um vídeo como Incorporar ou Contexto antes de casar
   * qualquer pauta; a coluna lista esses modos depois do que já dizia. "Não
   * usar" saiu na projeção. Sem modo nenhum, a coluna é a de antes.
   */
  const modos = p.video.selected || [];
  const comModos = (celula: string) => (modos.length
    ? [celula, "Modo de uso escolhido no Radar para os vídeos da marca (decisão do dono):", ...modos.map(item => `- ${radarPortableVideoUsageLine(item)}`)].join("\n")
    : celula);
  if (p.video.state !== "MATCHED") return comModos(p.video.note);
  const linhas = ["Trechos dos vídeos da própria marca (reaproveitar como corte ou referência; conferir no vídeo):"];
  for (const brief of p.video.briefs) {
    for (const trecho of brief.extracts.slice(0, 2)) {
      linhas.push(`- ${entreAspas(trecho.sourceTitle)} ${trecho.startLabel}–${trecho.endLabel} · pauta ${entreAspas(brief.topic)} · ${cortar(texto(trecho.whyRelevant), 160)}${trecho.usageLabel ? ` · modo: ${trecho.usageLabel}` : ""}`);
    }
  }
  return comModos(linhas.join("\n"));
}

function colunaRoteiro(input: RadarPortableExportInput, p: RadarWritingProjections, youtube: RadarVideoExportYoutube | null, abertura: string | null, perguntas: readonly string[]): string {
  const bp = youtube?.blueprint ?? null;
  const contribuicoes = radarWritingSpecialistContributions(p);
  const cta = contribuicoes.find(item => item.tipo === "CTA") || contribuicoes.find(item => item.tipo === "FECHAMENTO") || null;
  const destino = texto(input.article.canonical) || (texto(input.article.slug) ? `/${texto(input.article.slug)}` : "");
  const linhas = [
    `Gancho (primeiros 15 segundos): ${abertura ? `responda ${entreAspas(abertura)} logo de cara, sem apresentação longa` : "diga em uma frase o problema do público e o que ele leva do vídeo"}.`,
    "Promessa clara no título e na thumbnail, a mesma que o vídeo cumpre; sem caça-clique.",
  ];
  if (bp) {
    for (const item of bp.recommended.strategy.slice(0, 5)) linhas.push(`${item.dimension}: ${item.recommendedStrategy} (a SERP mostra: ${item.observedSignal})`);
    if (bp.recommended.script.length) {
      linhas.push("Roteiro recomendado pela SERP do YouTube (blocos, não estrutura copiada):");
      for (const bloco of bp.recommended.script) linhas.push(`- ${bloco.block}: ${bloco.purpose}`);
    }
    if (bp.recommended.titleOpportunities.length) linhas.push(`Oportunidades de título: ${bp.recommended.titleOpportunities.slice(0, 4).join(" · ")}`);
  }
  if (perguntas.length) linhas.push(`Capítulos: use as perguntas do público como marcadores de tempo (${Math.min(perguntas.length, 6)} a cobrir), na ordem em que o público avança.`);
  linhas.push(
    `Fechamento: ${cta ? `a fala ${cta.rotulo} do especialista` : "um próximo passo concreto para o público"}; CTA para ${destino ? `o artigo (${destino})` : "o artigo da marca"}, sem prometer resultado.`,
    "Descrição: resumo em duas linhas, capítulos com tempo, fontes citadas e o link do artigo.",
    "Não inventar depoimento, número, estudo, autor nem credencial. Fala de terceiros só citada e atribuída.",
  );
  if (bp) linhas.push(bp.recommended.scriptDisclaimer);
  return linhas.join("\n");
}

function colunaCortes(youtube: RadarVideoExportYoutube | null, perguntas: readonly string[], p: RadarWritingProjections): string {
  const curtos = youtube?.blueprint?.observed.shorts ?? null;
  const fatos = (p.autoridade?.factualEvidence || []).filter(item => item.supportType === "SUPPORTS").length;
  return [
    curtos && curtos.videoCount
      ? `Shorts na amostra: ${curtos.videoCount}${curtos.durationSeconds.median ? ` · duração mediana ${duracao(curtos.durationSeconds.median)}` : ""}. Existe espaço para cortes do tema.`
      : "Shorts: a amostra não mostra Shorts do tema; cortes podem testar o formato, sem dado de concorrência.",
    "Cortes sugeridos (Shorts, Reels e TikTok, até 60 segundos, uma ideia por corte):",
    ...perguntas.slice(0, 3).map((pergunta, indice) => `${indice + 1}. Pergunta e resposta direta: ${entreAspas(pergunta)}`),
    ...(fatos ? [`${Math.min(perguntas.length, 3) + 1}. Um fato com fonte, dito em uma frase, com a fonte na legenda.`] : []),
    "Legenda na tela (a maioria assiste sem som), gancho no primeiro segundo e convite para o vídeo longo ou o artigo.",
    "Carrossel (Instagram e LinkedIn): as mesmas perguntas, uma por lâmina, com a resposta curta e a fonte.",
  ].join("\n");
}

function colunaPrompt(principal: string): string {
  return [
    `Escreva o roteiro de um vídeo para o YouTube sobre ${entreAspas(principal || "o tema desta linha")}, em português do Brasil, usando SOMENTE os dados desta linha.`,
    "Entregue: 3 opções de título, o gancho dos primeiros 15 segundos, o roteiro falado por blocos com marcação de tempo, os capítulos para a descrição, a descrição com as fontes e o link do artigo, e 3 cortes para Shorts/Reels/TikTok.",
    "Não copie títulos nem falas de concorrentes. Não invente fato, número, estudo, depoimento, autor ou credencial. Fala do especialista só a que está nesta linha, atribuída.",
  ].join("\n");
}

/* ============================== a linha ============================== */

export type RadarVideoExportArticle = { row: RadarVideoExportRow; label: string; hasYoutube: boolean };

export function buildRadarVideoExportArticle(input: RadarPortableExportInput, contexto: { position: number; youtube: RadarVideoExportYoutube | null; brandVoiceActive?: boolean }): RadarVideoExportArticle {
  const p = radarWritingProjections(input);
  const principal = texto(p.dna.principalKeyword);
  const perguntas = perguntasDoPublico(p);
  const daEscrita = radarWritingOpeningQuestion(p);
  const abertura = (daEscrita && !radarVideoRhetoricalQuestion(daEscrita) ? daEscrita : null) || perguntas[0] || null;
  const youtube = contexto.youtube;

  const ressalvas: string[] = [];
  if (!youtube) ressalvas.push("sem pesquisa do YouTube: formato, duração e concorrência em vídeo não foram observados");
  else if (!youtube.frozen) ressalvas.push("a pesquisa do YouTube ainda não foi congelada");
  if (!(p.autoridade?.factualEvidence || []).some(item => item.supportType === "SUPPORTS")) ressalvas.push("nenhum fato com fonte verificada");
  if (p.prontidao?.state === "BLOCKED") ressalvas.push(`a investigação tem bloqueio: ${p.prontidao.reasons.join("; ")}`);
  const pode = ressalvas.length ? `Com ressalva:\n${ressalvas.map(item => `- ${item}.`).join("\n")}` : "Sim.";

  const row: RadarVideoExportRow = {
    ordem: String(contexto.position),
    pode_gravar: pode,
    tema_e_publico: colunaTema(input, p),
    intencao_e_formato: colunaIntencao(input, p, youtube),
    serp_youtube: colunaSerpYoutube(p, youtube),
    perguntas_do_publico: perguntas.length
      ? ["O que o público pergunta (responder com clareza; a primeira abre o vídeo):", ...perguntas.map(item => `- ${item}`)].join("\n")
      : "Sem perguntas do público registradas no pacote.",
    termos_e_entidades: colunaTermos(p),
    fatos_e_fontes: colunaFatos(p),
    especialista: colunaEspecialista(p),
    biblioteca_da_marca: colunaBiblioteca(p),
    diretrizes_de_roteiro: [
      colunaRoteiro(input, p, youtube, abertura, perguntas),
      ...(contexto.brandVoiceActive ? ['Voz da marca: gancho, fala, CTA e descrição seguem a linha "Voz da marca" deste arquivo (vocabulário, o que a marca não faz e a página comercial que ela permite citar).'] : []),
    ].join("\n"),
    cortes_para_redes: colunaCortes(youtube, perguntas, p),
    prompt: colunaPrompt(principal),
  };
  for (const coluna of RADAR_VIDEO_EXPORT_COLUMNS) row[coluna] = celula(row[coluna]);
  return { row, label: principal || texto(input.article.slug) || "artigo sem keyword", hasYoutube: Boolean(youtube) };
}

export const RADAR_VIDEO_GENERAL_RULES = [
  "Este arquivo é para vídeo e redes sociais: não traz estrutura de artigo, e não é para virar texto de blog.",
  "Os dados são pesquisa: não copie títulos, falas, thumbnails nem roteiros de terceiros.",
  "Fato sem fonte verificada não vira afirmação. Tema de saúde, dinheiro ou segurança pede fonte citada na descrição.",
  "A voz do especialista só entra como está na linha, atribuída, sem inventar nome nem credencial.",
  "Cada vídeo leva o público para o artigo da marca (link na descrição e no CTA).",
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
    prompt: celula(["Regras para todos os vídeos deste arquivo:", ...RADAR_VIDEO_GENERAL_RULES.map((regra, indice) => `${indice + 1}. ${regra}`)].join("\n")),
  };
}

/**
 * A LINHA "VOZ DA MARCA" DO CSV DE VÍDEO (Adendo C): a mesma Skill ativa, nas
 * colunas de público, roteiro, fontes, cortes e prompt. Sem Skill ativa, não existe.
 */
export function buildRadarVideoBrandVoiceRow(state: RadarBrandVoiceState | undefined): RadarVideoExportRow | null {
  if (state?.kind !== "available") return null;
  const por = radarBrandVoiceBySlot(state.voice);
  const vazio = Object.fromEntries(RADAR_VIDEO_EXPORT_COLUMNS.map(coluna => [coluna, ""])) as RadarVideoExportRow;
  const row: RadarVideoExportRow = {
    ...vazio,
    ordem: "Voz da marca",
    pode_gravar: `Vale para todos os vídeos deste arquivo: ${radarBrandVoiceLabel(state.voice)}. O tema vem de cada linha; a forma, o CTA e o que a marca não faz vêm desta.`,
    tema_e_publico: radarBrandVoiceText(por.reader),
    intencao_e_formato: radarBrandVoiceText(por.title),
    serp_youtube: radarBrandVoiceText(por.research),
    fatos_e_fontes: radarBrandVoiceText(por.sources),
    diretrizes_de_roteiro: radarBrandVoiceText([...por.structure, ...por.links]),
    cortes_para_redes: radarBrandVoiceText(por.visual),
    prompt: radarBrandVoiceText(por.voice),
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
  articles: ReadonlyArray<{ entrada: RadarPortableExportInput; youtube?: RadarVideoExportYoutube | null }>;
  today: string;
  /** 2026-10-02 · Aditivo: a voz da marca (Adendo C). */
  brandVoice?: RadarBrandVoiceState;
}): { csv: string; filename: string; exported: number; withoutYoutube: number } {
  const ativa = input.brandVoice?.kind === "available";
  const artigos = input.articles.map((artigo, indice) => buildRadarVideoExportArticle(artigo.entrada, { position: indice + 1, youtube: artigo.youtube ?? null, brandVoiceActive: ativa }));
  const voz = buildRadarVideoBrandVoiceRow(input.brandVoice);
  return {
    csv: radarVideoExportCsv([buildRadarVideoTopRow({ articles: artigos, brandVoice: input.brandVoice }), ...(voz ? [voz] : []), ...artigos.map(item => item.row)]),
    filename: radarVideoExportFilename({ keywords: artigos.map(item => item.label), today: input.today }),
    exported: artigos.length,
    withoutYoutube: artigos.filter(item => !item.hasYoutube).length,
  };
}
