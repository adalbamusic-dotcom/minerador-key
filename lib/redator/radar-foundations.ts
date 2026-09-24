/**
 * ===== FUNDAMENTOS DO RADAR — REDATOR_DOSSIER_SURFACE_1 =====
 *
 * ==================== O DOSSIÊ CHEGAVA E NINGUÉM O VIA ====================
 *
 * O Radar entrega ao Redator o pacote inteiro — `importedContext.dossier`
 * carrega o `RadarEvidenceBundle` V3 com a fotografia congelada, o blueprint,
 * as limitações e o que o Redator não pode redefinir. Nenhuma tela lia isso.
 * O roteiro nascia vazio ao lado de 38 vídeos observados, e a pessoa abria o
 * Radar em outra aba para copiar à mão.
 *
 * ==================== UMA PROJEÇÃO, TRÊS AMBIENTES ====================
 *
 * Artigo, roteiro e carrossel leem a MESMA projeção. Três leituras do mesmo
 * dossiê divergiriam na primeira correção feita só de um lado — o defeito que
 * o Radar já fechou uma vez com "uma pergunta, uma resposta".
 *
 * ==================== É LEITURA, NÃO CÓPIA ====================
 *
 * Nada daqui é gravado no `writer_deliverable.payload`. O entregável continua
 * sendo só o produto derivado (cenas, gancho, CTA, âncoras de mídia). O dossiê
 * mora no documento, e esta projeção o lê de lá toda vez.
 *
 * O bundle viaja no contrato como `record<string, unknown>` — por isso toda
 * leitura aqui é defensiva. Campo ausente vira lista vazia ou `null`, nunca
 * exceção: um dossiê antigo ou parcial ainda mostra o que tem.
 */

import type { ContentDocument } from "../arquiteto/contracts.ts";
import { RADAR_EDITORIAL_OUTPUT_LABELS } from "../radar/multimodal-blueprint.ts";
import { RADAR_AMAZON_EDITORIAL_OUTPUT_LABELS } from "../radar/competitive-blueprint.ts";
import { radarResearchProfileLabel, type RadarResearchProfile } from "../radar/research-profile.ts";
import { RADAR_WRITER_SUBJECT_LINE_PREFIXES } from "./radar-subject-turn.ts";

export type RadarFoundationsRecommendation = {
  output: string;
  label: string;
  objective: string | null;
  reason: string | null;
  sourceSignals: string[];
};

export type RadarFoundationsResearchLayer = {
  source: "google" | "youtube" | "amazon";
  label: string;
  role: "PRIMARY" | "SUPPORT";
  queries: number;
  items: number;
  frozenAt: string | null;
  limitations: string[];
};

export type RadarFoundationsDirection = { statement: string; sourceSignal: string | null };

export type RadarFoundationsYoutube = {
  comparableVideos: number;
  longForm: number;
  shorts: number;
  durationRange: string | null;
  recurrentChannels: string[];
  titlePatterns: string[];
  gaps: string[];
  format: string | null;
  hookDirection: RadarFoundationsDirection | null;
  titleDirections: RadarFoundationsDirection[];
  script: Array<{ block: string; objective: string; direction: string }>;
  tone: string | null;
  languageDirection: string | null;
};

export type RadarFoundationsMultimodal = {
  youtubeLongForm: number;
  youtubeShorts: number;
  crossSerp: Array<{ signal: string; count: number }>;
  sources: string[];
};

export type RadarFoundations = {
  profile: RadarResearchProfile;
  profileLabel: string;
  observedAt: string | null;
  bundleId: string | null;
  bundleHash: string | null;
  keyword: { principal: string | null; secondary: string[]; reinforcements: string[]; resolution: string | null };
  /** `editorialOutput` é RECOMENDAÇÃO. Nenhum formato derivado é bloqueado por ela. */
  recommendations: RadarFoundationsRecommendation[];
  research: RadarFoundationsResearchLayer[];
  youtube: RadarFoundationsYoutube | null;
  multimodal: RadarFoundationsMultimodal | null;
  evidence: {
    sources: string[];
    serpStanding: string | null;
    videoLibrary: { briefs: number; supported: number; partial: number; notFound: number } | null;
    specialist: boolean;
    observedPages: number | null;
  };
  mustAnswer: string[];
  mustCover: string[];
  limitations: string[];
  writerMayNot: string[];
  /**
   * SDD do Assunto, F4.2 · as linhas curtas que o envio grava em
   * `importedContext.editorialContext` quando o artigo tem Assunto (tronco,
   * virada, seção da virada, direção do H1, destino, alerta —
   * `lib/redator/radar-subject-turn.ts`). Moram FORA do dossiê; entram aqui
   * para que painel, roteiro e carrossel as leiam pela MESMA projeção.
   * Ausente quando não há linha: sem Assunto, a projeção sai idêntica.
   */
  editorialContext?: string[];
};

/* ============================== leitura defensiva ============================== */

const objeto = (valor: unknown): Record<string, unknown> | null =>
  valor && typeof valor === "object" && !Array.isArray(valor) ? (valor as Record<string, unknown>) : null;
const lista = (valor: unknown): unknown[] => (Array.isArray(valor) ? valor : []);
const texto = (valor: unknown): string | null => (typeof valor === "string" && valor.trim() ? valor : null);
const numero = (valor: unknown): number => (typeof valor === "number" && Number.isFinite(valor) ? valor : 0);
const textos = (valor: unknown): string[] => lista(valor).map(texto).filter((item): item is string => Boolean(item));
/** Sinal ou recomendação do blueprint: o que interessa é a frase. */
const frases = (valor: unknown): string[] =>
  lista(valor).map(item => texto(objeto(item)?.statement)).filter((item): item is string => Boolean(item));
const direcao = (valor: unknown): RadarFoundationsDirection | null => {
  const item = objeto(valor);
  const statement = texto(item?.statement);
  return statement ? { statement, sourceSignal: texto(item?.sourceSignal) } : null;
};
const direcoes = (valor: unknown): RadarFoundationsDirection[] =>
  lista(valor).map(direcao).filter((item): item is RadarFoundationsDirection => Boolean(item));

const ROTULO_DE_SAIDA: Record<string, string> = { ...RADAR_EDITORIAL_OUTPUT_LABELS, ...RADAR_AMAZON_EDITORIAL_OUTPUT_LABELS };
export const radarEditorialOutputLabel = (output: string): string => ROTULO_DE_SAIDA[output] || output;

const PERFIS: readonly RadarResearchProfile[] = ["GOOGLE", "YOUTUBE", "AMAZON"];

/** O dossiê do documento, se ele veio do Radar com o contrato V2. */
export function radarWriterDossierOfDocument(document: ContentDocument | null | undefined): Record<string, unknown> | null {
  if (!document || document.schemaVersion !== 2) return null;
  return objeto(document.importedContext.dossier);
}

/**
 * ===== O QUE ESTA PROJEÇÃO LÊ DO BUNDLE — E NADA MAIS =====
 *
 * Fase 0 do leitor de evidências (docs/07-redator/propostas/
 * sdd-leitor-evidencias-redator-2026-09-23.md §8): a semeadura da IA interna
 * lê do banco só estes caminhos do bundle, e não o documento inteiro. Medido
 * em 2026-09-23 no documento GOOGLE: 74.877 B contra 4.502.936 B.
 *
 * A lista mora AQUI, ao lado de quem lê, para as duas evoluírem juntas. Um
 * teste percorre `radarFoundationsOfDossier` com um Proxy e reprova qualquer
 * leitura do bundle que não esteja coberta por um destes caminhos.
 *
 * Os campos do dossiê FORA do bundle (bundleId, bundleHash, researchProfile,
 * keywordContext, writerMayNot) não entram: quem lê pelo banco os traz
 * inteiros e os valida com `RadarWriterDossierSchema`. Por isso também ficam
 * de fora `bundle.bundleId`, `bundle.bundleHash` e
 * `bundle.primaryResearchProfile` — são reserva para um dossiê sem os campos
 * próprios, e o contrato do dossiê os exige.
 */
export const RADAR_FOUNDATIONS_BUNDLE_PATHS: readonly (readonly string[])[] = [
  ["research"],
  ["competitiveBlueprint"],
  ["crossSerp"],
  ["editorialOutputs"],
  ["observed", "questions"],
  ["observed", "concepts", "recurrent"],
  ["observed", "sample"],
  ["video", "summary"],
  ["specialist"],
  ["observedAt"],
  ["researchSources"],
  ["serpStanding"],
  ["limitations"],
];

export function radarFoundationsOf(document: ContentDocument | null | undefined): RadarFoundations | null {
  const dossier = radarWriterDossierOfDocument(document);
  const editorialContext = dossier && document?.schemaVersion === 2 ? document.importedContext.editorialContext : undefined;
  return radarFoundationsOfDossier(dossier, { editorialContext });
}

/** O que a projeção lê do documento FORA do dossiê. Hoje, só as linhas do envio (F4.2). */
export type RadarFoundationsDocumentContext = { editorialContext?: unknown };

/**
 * A mesma projeção, a partir do dossiê em si. Existe para quem não tem o
 * documento inteiro na mão: a semeadura monta um dossiê só com os caminhos de
 * `RADAR_FOUNDATIONS_BUNDLE_PATHS` e chega aqui sem baixar o pacote do Radar.
 *
 * `contexto` traz o que mora no documento fora do dossiê (as linhas do envio,
 * F4.2); a semeadura o lê pelo mesmo cabeçalho estreito.
 */
export function radarFoundationsOfDossier(valor: unknown, contexto: RadarFoundationsDocumentContext = {}): RadarFoundations | null {
  const dossier = objeto(valor);
  if (!dossier) return null;
  const bundle = objeto(dossier.bundle) || {};

  const perfilDeclarado = texto(dossier.researchProfile) || texto(bundle.primaryResearchProfile);
  const profile = PERFIS.find(item => item === perfilDeclarado) || "GOOGLE";

  const keyword = objeto(dossier.keywordContext);
  const pesquisa = objeto(bundle.research) || {};
  const research: RadarFoundationsResearchLayer[] = [];
  for (const source of ["google", "youtube", "amazon"] as const) {
    const camada = objeto(pesquisa[source]);
    if (!camada) continue;
    const counts = objeto(camada.counts);
    research.push({
      source,
      label: radarResearchProfileLabel(source.toUpperCase() as RadarResearchProfile),
      role: camada.role === "SUPPORT" ? "SUPPORT" : "PRIMARY",
      queries: numero(counts?.queries),
      items: numero(counts?.items),
      frozenAt: texto(camada.frozenAt),
      limitations: textos(camada.limitations),
    });
  }
  /* A primária primeiro: é ela que descreve como este artigo foi investigado. */
  research.sort((esquerda, direita) => Number(direita.role === "PRIMARY") - Number(esquerda.role === "PRIMARY"));

  const blueprint = objeto(bundle.competitiveBlueprint);
  const observadoBlueprint = objeto(blueprint?.observed);
  const recomendadoBlueprint = objeto(blueprint?.recommended);

  const youtube: RadarFoundationsYoutube | null = blueprint?.profile === "YOUTUBE" && observadoBlueprint
    ? {
      comparableVideos: numero(observadoBlueprint.comparableVideos),
      longForm: numero(observadoBlueprint.longForm),
      shorts: numero(observadoBlueprint.shorts),
      durationRange: texto(observadoBlueprint.durationRange),
      recurrentChannels: frases(observadoBlueprint.recurrentChannels),
      titlePatterns: frases(observadoBlueprint.titlePatterns),
      gaps: frases(observadoBlueprint.gaps),
      format: texto(recomendadoBlueprint?.format),
      hookDirection: direcao(recomendadoBlueprint?.hookDirection),
      titleDirections: direcoes(recomendadoBlueprint?.titleDirections),
      script: lista(recomendadoBlueprint?.script).map(objeto).filter((item): item is Record<string, unknown> => Boolean(item))
        .map(item => ({ block: texto(item.block) || "Bloco", objective: texto(item.objective) || "", direction: texto(item.direction) || "" }))
        .filter(item => item.direction),
      tone: texto(recomendadoBlueprint?.tone),
      languageDirection: texto(recomendadoBlueprint?.languageDirection),
    }
    : null;

  const cruzamento = objeto(bundle.crossSerp);
  const multimodal: RadarFoundationsMultimodal | null = youtube || cruzamento
    ? {
      youtubeLongForm: youtube?.longForm ?? 0,
      youtubeShorts: youtube?.shorts ?? 0,
      crossSerp: lista(cruzamento?.signals).map(objeto).filter((item): item is Record<string, unknown> => Boolean(item))
        .map(item => ({ signal: texto(item.signal) || "", count: numero(item.count) })).filter(item => item.signal),
      sources: textos(cruzamento?.sources),
    }
    : null;

  const recommendations: RadarFoundationsRecommendation[] = lista(bundle.editorialOutputs).map(objeto)
    .filter((item): item is Record<string, unknown> => Boolean(item && texto(item.output)))
    .map(item => ({
      output: texto(item.output)!,
      label: radarEditorialOutputLabel(texto(item.output)!),
      objective: texto(item.objective),
      reason: texto(item.reason),
      sourceSignals: textos(item.sourceSignals),
    }));

  /*
   * PERGUNTAS E COBERTURA — quando existirem.
   *
   * O multimodal declara `mustAnswer`/`mustCover` e o modelo observado do
   * Google traz perguntas canônicas e conceitos recorrentes. O bundle carrega
   * um ou outro conforme o perfil; a projeção lê o que houver.
   */
  const observado = objeto(bundle.observed);
  const mustAnswer = textos(recomendadoBlueprint?.mustAnswer);
  const perguntasObservadas = lista(observado?.questions).map(item => texto(objeto(item)?.canonicalQuestion))
    .filter((item): item is string => Boolean(item));
  const mustCover = textos(recomendadoBlueprint?.mustCover);
  const conceitos = objeto(observado?.concepts);
  const conceitosRecorrentes = lista(conceitos?.recurrent).map(item => texto(objeto(item)?.canonicalLabel))
    .filter((item): item is string => Boolean(item));

  const video = objeto(bundle.video);
  const resumoDeVideo = objeto(video?.summary);
  const amostra = objeto(observado?.sample);

  const fundamentos: RadarFoundations = {
    profile,
    profileLabel: radarResearchProfileLabel(profile),
    observedAt: texto(bundle.observedAt),
    bundleId: texto(dossier.bundleId) || texto(bundle.bundleId),
    bundleHash: texto(dossier.bundleHash) || texto(bundle.bundleHash),
    keyword: {
      principal: texto(keyword?.principal),
      secondary: textos(keyword?.secondary),
      reinforcements: textos(keyword?.narrativeReinforcements),
      resolution: texto(keyword?.resolution),
    },
    recommendations,
    research,
    youtube,
    multimodal,
    evidence: {
      sources: textos(bundle.researchSources),
      serpStanding: texto(objeto(bundle.serpStanding)?.reason),
      videoLibrary: resumoDeVideo
        ? { briefs: numero(resumoDeVideo.briefs), supported: numero(resumoDeVideo.supported), partial: numero(resumoDeVideo.partial), notFound: numero(resumoDeVideo.notFound) }
        : null,
      specialist: Boolean(objeto(bundle.specialist)),
      observedPages: amostra ? numero(amostra.comparablePages ?? amostra.observedResults) : null,
    },
    mustAnswer: mustAnswer.length ? mustAnswer : perguntasObservadas,
    mustCover: mustCover.length ? mustCover : conceitosRecorrentes,
    /* Sem repetição literal — a mesma frase chega pela camada e pelo bundle. */
    limitations: [...new Set([...textos(bundle.limitations), ...research.flatMap(camada => camada.limitations)])],
    writerMayNot: textos(dossier.writerMayNot),
  };
  /* A chave só nasce com linha: sem Assunto, o objeto é o mesmo de antes, chave por chave. */
  const linhasDoEnvio = textos(contexto.editorialContext);
  return linhasDoEnvio.length ? { ...fundamentos, editorialContext: linhasDoEnvio } : fundamentos;
}

/* ================= o Assunto, lido das linhas da projeção ================= */

/**
 * ===== O ASSUNTO NO PAINEL — SDD do Assunto, F4.2 =====
 *
 * A mesma projeção, arrumada para a tela: cada linha do envio vai para o seu
 * lugar pelo prefixo que `radarWriterSubjectTurnLines` escreveu. Não há
 * segunda fonte: o texto mostrado é o texto da linha, sem o prefixo.
 *
 * Linha que nenhum prefixo reconhece não some: vai para `others`, na ordem.
 * Sem a linha do tronco não há Assunto a mostrar: `null`, e o painel fica
 * como era (o envio só grava linhas com Assunto, e sempre começa pelo tronco).
 */
export type RadarFoundationsSubject = {
  /** A frase do Assunto, como o envio a gravou. */
  phrase: string | null;
  note: string | null;
  turn: string | null;
  section: string | null;
  /** A seção da virada é título de trabalho do Radar (sem página na amostra): reescrever para o leitor. */
  sectionIsWorkingTitle: boolean;
  h1: string | null;
  destination: string | null;
  alert: string | null;
  others: string[];
};

/** O texto que a linha sintética da seção da virada carrega (`radar-subject-turn.ts`). */
const TITULO_DE_TRABALHO = /o título é de trabalho do Radar/i;

const semPrefixo = (linha: string, prefixo: string): string | null =>
  linha.startsWith(prefixo) ? linha.slice(prefixo.length).trim() || null : null;

export function radarFoundationsSubjectOf(fundamentos: Pick<RadarFoundations, "editorialContext"> | null | undefined): RadarFoundationsSubject | null {
  const linhas = fundamentos?.editorialContext ?? [];
  if (!linhas.length) return null;
  const P = RADAR_WRITER_SUBJECT_LINE_PREFIXES;
  const assunto: RadarFoundationsSubject = {
    phrase: null, note: null, turn: null, section: null, sectionIsWorkingTitle: false, h1: null, destination: null, alert: null, others: [],
  };
  let tronco: string | null = null;
  for (const linha of linhas) {
    const doTronco = semPrefixo(linha, P.trunk);
    if (doTronco !== null && tronco === null) { tronco = doTronco; continue; }
    const virada = semPrefixo(linha, P.turn);
    if (virada !== null && assunto.turn === null) { assunto.turn = virada; continue; }
    const secao = semPrefixo(linha, P.section);
    if (secao !== null && assunto.section === null) {
      assunto.section = secao;
      assunto.sectionIsWorkingTitle = TITULO_DE_TRABALHO.test(secao);
      continue;
    }
    if (assunto.h1 === null && P.h1.some(prefixo => linha.startsWith(prefixo))) {
      assunto.h1 = semPrefixo(linha, P.h1[0]) ?? linha;
      continue;
    }
    const destino = semPrefixo(linha, P.destination);
    if (destino !== null && assunto.destination === null) { assunto.destination = destino; continue; }
    const alerta = semPrefixo(linha, P.alert);
    if (alerta !== null && assunto.alert === null) { assunto.alert = alerta; continue; }
    assunto.others.push(linha);
  }
  if (tronco === null) return null;
  const { frase, nota } = fraseENotaDoTronco(tronco, assunto.turn);
  assunto.phrase = frase;
  assunto.note = nota;
  return assunto;
}

/**
 * "frase — nota." A linha do tronco não marca onde a frase acaba, e tanto a
 * frase quanto a nota podem ter travessão. A linha da virada termina em
 * "a <frase>." ou "a <frase>; destino: ...": o corte certo é o que deixa à
 * esquerda uma frase que a virada repete. Sem virada ou sem casamento, vale
 * o primeiro travessão (a frase costuma ser curta; a nota é texto livre).
 */
function fraseENotaDoTronco(tronco: string, virada: string | null): { frase: string; nota: string | null } {
  const cortes: number[] = [];
  for (let indice = tronco.indexOf(" — "); indice >= 0; indice = tronco.indexOf(" — ", indice + 1)) cortes.push(indice);
  /* Sem nota, o ponto final é o acabamento da linha, não da frase. */
  if (!cortes.length) return { frase: tronco.replace(/\.$/, "").trim() || tronco, nota: null };
  const repetidaNaVirada = (frase: string) =>
    Boolean(virada && frase && (virada.endsWith(` a ${frase}.`) || virada.includes(` a ${frase}; destino: `)));
  const corte = cortes.find(indice => repetidaNaVirada(tronco.slice(0, indice).trim())) ?? cortes[0];
  return { frase: tronco.slice(0, corte).trim() || tronco, nota: tronco.slice(corte + 3).trim() || null };
}
