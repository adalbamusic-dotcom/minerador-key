/**
 * ===== 2026-10-14 · F3 · A LEITURA COMPETITIVA DA SERP JÁ COLETADA (pré-cálculo, sem IA) =====
 *
 * SDD `docs/compartilhado/sdd-silo-interligado-seo-semantico-2026-10-14.md` §8.1
 * (item 3; D11, D12 e D13, decididas pelo dono em 2026-10-14 pela recomendação).
 * Pedido do dono: "se a gente está raspando as publicações dos nossos
 * concorrentes, é porque queremos ver como eles estão fazendo e só tomar para
 * nós os pontos mais importantes e tentar não replicar… Estamos gastando
 * coletando muitos dados e ainda não estamos aproveitando".
 *
 * SÓ DADOS JÁ COLETADOS (zero SERP nova, zero chamada paga, nenhuma IA). A
 * leitura sai do pacote congelado e vai ao pedido do artigo-modelo (a MESMA
 * chamada de IA de sempre escreve os quatro blocos sobre ela) e à coluna
 * `cobrir_e_superar` do CSV (a planta gravada sem os blocos lê daqui, D6):
 *
 *   - AMOSTRA RELEVANTE (D11): sai da conta quem está fora do leitor (outra
 *     profissão), fora do território (área vizinha, loja ou consumo) ou com
 *     medida fora da curva (mais de 3× ou menos de 1/3 da mediana de palavras,
 *     a régua de `competitive-model.ts`). MARCADO, nunca escondido: o CSV diz
 *     quem saiu e por quê. A mesma régua marca a coluna `relevancia_d11` da
 *     SERP crua (`serp-raw-export.ts`), por `radarCompetitiveRelevanceReasons`;
 *   - MEDIDAS COMO FAIXA DE REFERÊNCIA (D12): "o top relevante tem 1.800–2.400
 *     palavras", nunca meta de parágrafos;
 *   - (a) T · a base que todos cobrem (conceito × sites da amostra relevante);
 *   - (b) M+ · o que só os melhores fazem: o cruzamento, NUNCA FEITO ANTES, da
 *     melhor posição de cada página (`ranks`) com o que ela cobre — presente no
 *     top 3 relevante e raro do 4º em diante;
 *   - (c) N · ganho de informação: a pergunta do "Pessoas também perguntam" cuja
 *     resposta coletada (`answer`, que nada usava) falta, é rasa ou vem de fora
 *     do leitor; a entidade que só o mercado cita; a fonte que o resumo de IA cita
 *     e nenhum orgânico cita; o tema pouco coberto;
 *   - (d) U · o SEO antigo a não copiar (o "V" da SDD; V já é o vídeo da marca no
 *     pedido): listicle "N dicas", título-isca, keyword em quase todo H2, H2
 *     numerados, FAQ despejado, fechamento genérico, "o que é" com resposta de IA
 *     no topo (zero-click), página rasa com muitos H2.
 *
 * Detectores de palavras sobre dados já extraídos, não de sentido.
 * Módulo puro: sem fetch, sem banco, sem relógio, sem IA.
 */
import {
  radarResearchNeighborArea,
  radarResearchOtherProfession,
  radarResearchStoreNoise,
  radarRegistrableDomain,
  type RadarResearchNoiseContext,
} from "./research-noise.ts";
import { radarKeywordOccurrences } from "./human-voice-guideline.ts";
import type { RadarPortableExportInput } from "./portable-export.ts";
import type { RadarPortableSerpObserved } from "./portable-serp-observed.ts";
import type { RadarSampleBasis } from "./sample-basis.ts";

/** A versão da leitura. Mudou um detector ou um teto, muda a data. */
export const RADAR_COMPETITIVE_READING_VERSION = "2026-10-14b";

/** Os tetos: até 6 itens por bloco no pacote (SDD §17), até 4 perguntas que valem resposta no CSV (D13). */
export const RADAR_COMPETITIVE_READING_LIMITS = Object.freeze({
  perBlock: 6,
  /** O que a IA devolve por bloco (cabe nas 2 chamadas de sempre). */
  perBlockInPlan: 4,
  questionsKept: 4,
  questionsDropped: 8,
  topRelevant: 3,
  /** O fator do outlier de medida (a régua de `competitive-model.ts`). */
  outlierFactor: 3,
  /** A resposta do "Pessoas também perguntam" com menos caracteres que isto é rasa. */
  shallowAnswerChars: 140,
});

/* ============================== a régua D11 (uma só: leitura competitiva e SERP crua) ============================== */

/**
 * D11 · POR QUE UMA PÁGINA SAI DA AMOSTRA RELEVANTE (lista vazia = relevante):
 * outra profissão fora do público (psicólogo num artigo de dentista), área
 * vizinha (gestão de pessoas, tributário), loja ou consumo fora do artigo, ou
 * medida fora da curva (mais de 3× ou menos de 1/3 da mediana de palavras).
 * `palavras` null = página não medida (o outlier não se aplica).
 */
export function radarCompetitiveRelevanceReasons(
  conteudo: string,
  palavras: number | null,
  contexto: RadarResearchNoiseContext,
  mediana: number | null,
): string[] {
  const motivos: string[] = [];
  if (radarResearchOtherProfession(conteudo, contexto)) motivos.push("fora do leitor: outra profissão, fora do público do artigo");
  const area = radarResearchNeighborArea(conteudo, contexto);
  if (area) motivos.push(`fora do território: ${area}`);
  if (radarResearchStoreNoise(conteudo, contexto)) motivos.push("fora do território: loja ou consumo, fora do artigo");
  const fator = RADAR_COMPETITIVE_READING_LIMITS.outlierFactor;
  if (palavras !== null && palavras > 0 && mediana && (palavras > mediana * fator || palavras < mediana / fator)) {
    motivos.push(`outlier de medida: ${palavras} palavras (mediana das páginas lidas: ${mediana})`);
  }
  return motivos;
}

/* ============================== a entrada (o que já foi coletado) ============================== */

export type RadarCompetitiveReadingPage = {
  url: string;
  domain: string;
  title: string;
  /** Melhor posição nas lentes (`ranks`); null = sem posição. */
  bestPosition: number | null;
  words: number | null;
  h2: number | null;
  /** Os conceitos que a página cobre (rótulos do modelo observado). */
  concepts: readonly string[];
  /** Os H2/H3 lidos da página (das extrações gravadas), sem o texto. */
  headings: readonly string[];
};

export type RadarCompetitiveReadingInput = {
  principal: string;
  /** Principal, complementares, reforços e Assunto: o núcleo do artigo. */
  core: readonly string[];
  audience: string | null;
  /** O resultado orgânico da SERP canônica (título e trecho). */
  organic: ReadonlyArray<{ position: number; title: string | null; url: string; domain: string; snippet: string | null }>;
  /** As páginas comparáveis lidas (a base única do modelo). */
  pages: readonly RadarCompetitiveReadingPage[];
  /** Os conceitos observados (rótulo, quantas páginas, situação). */
  concepts: ReadonlyArray<{ label: string; sourceCount: number; sampleSize: number; status: string }>;
  /** "Pessoas também perguntam": a pergunta e a resposta que o Google mostrou (trecho de terceiro). */
  peopleAlsoAsk: ReadonlyArray<{ question: string | null; answer: string | null; sourceUrl: string | null }>;
  aiOverview: { shown: boolean; citedSources: ReadonlyArray<{ domain: string; url: string | null; title: string | null }> } | null;
  /** Os padrões de título que o diagnóstico da SERP leu ("10 dicas…", "guia completo"). */
  titlePatterns: readonly string[];
  /** As entidades que só o mercado cita (o artigo ainda não). */
  marketOnlyEntities: ReadonlyArray<{ label: string; pages: number }>;
  /** O ângulo e o diferencial que o Radar já recomendava (blueprint competitivo), nunca usados até aqui. */
  recommendedAngle: string | null;
  recommendedDifferentiation: readonly string[];
};

/* ============================== a saída ============================== */

export type RadarCompetitiveReadingItem = { id: string; text: string };

export type RadarCompetitiveReading = {
  version: string;
  /** D11 · a amostra relevante, com quem saiu e por quê (marcado, nunca escondido). */
  sample: {
    total: number;
    relevant: number;
    excluded: Array<{ url: string; domain: string; title: string; reasons: string[] }>;
  };
  /** D12 · a faixa de referência da amostra relevante (sem outlier). */
  reference: { pages: number; words: { min: number; max: number; median: number } | null; h2: { min: number; max: number } | null };
  /** (a) T · a base que todos cobrem. */
  consensus: Array<RadarCompetitiveReadingItem & { topic: string; sites: number; of: number }>;
  /** (b) M+ · o que só os melhores fazem. */
  bestOnly: Array<RadarCompetitiveReadingItem & { practice: string; top: number; topSize: number; rest: number; restSize: number; domains: string[] }>;
  /** (c) N · ganho de informação (o que a SERP não dá e a marca pode dar). */
  gains: Array<RadarCompetitiveReadingItem & { gap: string; kind: "pergunta" | "entidade" | "fonte_oficial" | "tema" }>;
  /** (d) U · o SEO antigo que não se copia. */
  oldSeo: Array<RadarCompetitiveReadingItem & { pattern: string; seenIn: string[]; instead: string }>;
  /** As respostas do "Pessoas também perguntam", com a qualidade lida (para escolher até 4 que valem resposta, D13). */
  questions: Array<{ question: string; answer: string | null; quality: "sem resposta" | "rasa" | "de fora do leitor" | "com resposta"; sourceDomain: string | null }>;
  /** O ângulo recomendado pelo Radar (blueprint competitivo). */
  angle: string | null;
  /** Há resposta de IA no topo da SERP (a definição vira 1 ou 2 frases da abertura). */
  aiOverview: boolean;
};

/* ============================== utilidades ============================== */

const texto = (valor: unknown): string => (typeof valor === "string" ? valor.replace(/\s+/g, " ").trim() : "");
const semAcento = (valor: string) => valor.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const chaveDaUrl = (url: string | null | undefined) => texto(url).toLowerCase().replace(/^https?:\/\/(?:www\.)?/, "").replace(/[?#].*$/, "").replace(/\/+$/, "");
const chave = (valor: string) => semAcento(valor).replace(/[^a-z0-9]+/g, " ").trim();
const dominio = (valor: string | null | undefined) => radarRegistrableDomain(texto(valor)) || texto(valor).replace(/^www\./, "");

function mediana(valores: readonly number[]): number | null {
  if (!valores.length) return null;
  const ordem = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ordem.length / 2);
  return ordem.length % 2 ? ordem[meio] : Math.round((ordem[meio - 1] + ordem[meio]) / 2);
}
function percentil(valores: readonly number[], p: number): number | null {
  if (!valores.length) return null;
  const ordem = [...valores].sort((a, b) => a - b);
  return ordem[Math.min(ordem.length - 1, Math.max(0, Math.round((ordem.length - 1) * p)))];
}

/* ============================== (d) os detectores do SEO antigo ============================== */

const LISTICLE = /^\s*\d+\s+\p{L}|\b\d+\s+(?:dicas|estrategias|formas|maneiras|passos|ideias|tecnicas|erros|segredos|motivos|razoes|truques|acoes|metodos)\b|\bdicas de ouro\b/u;
const ISCA = /\bsem gastar\b|\br\$\s?\d|\bgarantid\w*|\binfalive\w*|\bsegredo\w*\b|\bdefinitiv\w*|\btudo sobre\b|\bguia completo\b|\bem \d+ dias\b|\b\d+\s+(?:pacientes|clientes|leads|vendas)\s+por\s+(?:dia|semana|mes)\b|\bexplodir\b|\bmilagr\w*/;
const H2_NUMERADO = /^\s*\d{1,2}\s*[.)\-–:]\s*\S|^\s*\d{1,2}\s+\p{L}/u;
const FAQ = /\b(?:perguntas frequentes|faq|duvidas frequentes)\b/;
const FECHO_GENERICO = /^(?:conclusao|consideracoes finais|para finalizar|finalizando|em resumo|resumindo|gostou|esperamos)\b/;
const O_QUE_E = /^(?:o que (?:e|sao)|qual (?:e )?(?:a )?definicao)\b/;

type Detector = { pattern: string; instead: string; seenIn: Set<string> };

/* ============================== a leitura ============================== */

export function buildRadarCompetitiveReading(input: RadarCompetitiveReadingInput): RadarCompetitiveReading {
  const L = RADAR_COMPETITIVE_READING_LIMITS;
  const principal = texto(input.principal);
  const contexto: RadarResearchNoiseContext = { core: [principal, ...input.core], audience: input.audience };
  const trechoDaUrl = new Map(input.organic.map(item => [chaveDaUrl(item.url), texto(item.snippet)]));

  /* ---- D11 · a amostra relevante (marcada, nunca escondida) ---- */
  const paginas = input.pages.filter(pagina => texto(pagina.url));
  const doLeitor = paginas.filter(pagina => !radarCompetitiveRelevanceReasons(conteudoDe(pagina), null, contexto, null).length);
  /* O outlier de medida mede contra a mediana das páginas DO LEITOR (as de outra profissão não puxam a régua); com menos de 3 medidas, não há outlier. */
  const medidasDoLeitor = doLeitor.map(pagina => pagina.words ?? 0).filter(valor => valor > 0);
  const medianaDoLeitor = medidasDoLeitor.length >= 3 ? mediana(medidasDoLeitor) : null;
  const lidas = paginas.map(pagina => ({ pagina, motivos: radarCompetitiveRelevanceReasons(conteudoDe(pagina), pagina.words, contexto, medianaDoLeitor) }));
  const relevantes = lidas.filter(item => !item.motivos.length).map(item => item.pagina);
  function conteudoDe(pagina: RadarCompetitiveReadingPage): string {
    return [texto(pagina.title), trechoDaUrl.get(chaveDaUrl(pagina.url)) || "", ...pagina.headings.slice(0, 4).map(texto)].filter(Boolean).join(" · ");
  }
  const foraDoLeitor = new Set(lidas.filter(item => item.motivos.some(motivo => !motivo.startsWith("outlier"))).map(item => dominio(item.pagina.domain || item.pagina.url)));

  /* ---- D12 · a faixa de referência (amostra relevante, sem outlier) ---- */
  const palavras = relevantes.map(pagina => pagina.words ?? 0).filter(valor => valor > 0);
  const h2s = relevantes.map(pagina => pagina.h2 ?? 0).filter(valor => valor > 0);
  const faixa = (valores: number[]) => (valores.length >= 4 ? [percentil(valores, 0.25)!, percentil(valores, 0.75)!] : [Math.min(...valores), Math.max(...valores)]);
  const reference = {
    pages: relevantes.length,
    words: palavras.length ? { min: faixa(palavras)[0], max: faixa(palavras)[1], median: mediana(palavras)! } : null,
    h2: h2s.length ? { min: faixa(h2s)[0], max: faixa(h2s)[1] } : null,
  };

  /* ---- (a) T · a base que todos cobrem ---- */
  const sitesDe = (rotulo: string, lista: readonly RadarCompetitiveReadingPage[]) =>
    new Set(lista.filter(pagina => pagina.concepts.some(conceito => chave(conceito) === chave(rotulo))).map(pagina => dominio(pagina.domain || pagina.url))).size;
  const comConceitos = relevantes.some(pagina => pagina.concepts.length);
  const sitesRelevantes = new Set(relevantes.map(pagina => dominio(pagina.domain || pagina.url))).size;
  const pisoDaBase = Math.max(2, Math.ceil(sitesRelevantes / 4));
  const conceitosUnicos = [...new Map(input.concepts.filter(item => texto(item.label) && item.status !== "ISOLATED").map(item => [chave(item.label), item])).values()];

  /* ---- (b) M+ · o que só os melhores fazem: posição × cobertura ---- */
  const ordenadas = relevantes.filter(pagina => pagina.bestPosition !== null).sort((a, b) => (a.bestPosition! - b.bestPosition!));
  const topo = ordenadas.slice(0, L.topRelevant);
  const resto = ordenadas.slice(L.topRelevant);
  const melhores: RadarCompetitiveReading["bestOnly"] = [];
  if (topo.length === L.topRelevant && resto.length >= 2) {
    const presenca = (lista: readonly RadarCompetitiveReadingPage[], tem: (pagina: RadarCompetitiveReadingPage) => boolean) => lista.filter(tem).length;
    const candidatas: Array<{ practice: string; tem: (pagina: RadarCompetitiveReadingPage) => boolean }> = [
      ...conceitosUnicos.map(item => ({ practice: texto(item.label), tem: (pagina: RadarCompetitiveReadingPage) => pagina.concepts.some(conceito => chave(conceito) === chave(item.label)) })),
      { practice: "seções escritas como a pergunta do leitor", tem: pagina => pagina.headings.filter(cabecalho => /\?\s*$/.test(texto(cabecalho))).length >= 2 },
    ];
    for (const candidata of candidatas) {
      const noTopo = presenca(topo, candidata.tem);
      const noResto = presenca(resto, candidata.tem);
      if (noTopo >= 2 && noResto <= Math.floor(resto.length / 3)) {
        melhores.push({
          id: `M+${melhores.length + 1}`,
          practice: candidata.practice, top: noTopo, topSize: topo.length, rest: noResto, restSize: resto.length,
          domains: topo.filter(candidata.tem).map(pagina => dominio(pagina.domain || pagina.url)),
          text: `${candidata.practice} (top ${topo.length} relevante: ${noTopo} de ${topo.length}; do ${L.topRelevant + 1}º em diante: ${noResto} de ${resto.length})`,
        });
      }
      if (melhores.length >= L.perBlock) break;
    }
  }

  /* (a) T · a base, calculada depois de (b): o que só os melhores fazem não é "base que todos cobrem" (fica no bloco b). */
  const base = conceitosUnicos
    .map(item => ({ topic: texto(item.label), sites: comConceitos ? sitesDe(item.label, relevantes) : item.sourceCount, of: comConceitos ? sitesRelevantes : item.sampleSize }))
    .filter(item => item.sites >= pisoDaBase && !/\?$/.test(item.topic) && !melhores.some(melhor => chave(melhor.practice) === chave(item.topic)))
    .sort((a, b) => b.sites - a.sites || a.topic.localeCompare(b.topic))
    .slice(0, L.perBlock)
    .map((item, indice) => ({ id: `T${indice + 1}`, text: `${item.topic} (${item.sites} de ${item.of} sites da amostra relevante)`, ...item }));

  /* ---- as perguntas do "Pessoas também perguntam", com a resposta coletada ---- */
  const questions: RadarCompetitiveReading["questions"] = [];
  for (const item of input.peopleAlsoAsk) {
    const pergunta = texto(item.question);
    if (!pergunta || questions.some(outra => chave(outra.question) === chave(pergunta))) continue;
    const resposta = texto(item.answer) || null;
    const fonte = item.sourceUrl ? dominio(item.sourceUrl) : null;
    const quality = !resposta ? "sem resposta" as const
      : fonte && foraDoLeitor.has(fonte) ? "de fora do leitor" as const
        : resposta.length < L.shallowAnswerChars ? "rasa" as const : "com resposta" as const;
    questions.push({ question: pergunta, answer: resposta, quality, sourceDomain: fonte });
  }

  /* ---- (c) N · ganho de informação ---- */
  const gains: RadarCompetitiveReading["gains"] = [];
  const ganho = (gap: string, kind: RadarCompetitiveReading["gains"][number]["kind"], porque: string) => {
    if (gains.length >= L.perBlock || gains.some(item => chave(item.gap) === chave(gap))) return;
    gains.push({ id: `N${gains.length + 1}`, gap, kind, text: `${gap} — ${porque}` });
  };
  /* A ordem é a do valor: a fonte oficial que só o resumo de IA cita, a pergunta sem resposta, o tema pouco coberto, a resposta rasa ou de fora do leitor, a entidade. */
  const organicos = new Set(input.organic.map(item => dominio(item.domain || item.url)));
  for (const fonte of input.aiOverview?.shown ? input.aiOverview.citedSources : []) {
    const site = dominio(fonte.domain || fonte.url);
    if (!site || organicos.has(site)) continue;
    ganho(`${texto(fonte.title) || site} (${site})`, "fonte_oficial", "o resumo de IA cita, nenhum orgânico cita (a verificar)");
  }
  for (const item of questions.filter(pergunta => pergunta.quality === "sem resposta")) ganho(item.question, "pergunta", "sem resposta na SERP");
  for (const item of input.concepts.filter(conceito => conceito.status === "UNDERCOVERED").slice(0, 2)) {
    ganho(texto(item.label), "tema", `pouco coberto (${item.sourceCount} de ${item.sampleSize} páginas)`);
  }
  for (const item of questions.filter(pergunta => pergunta.quality === "rasa" || pergunta.quality === "de fora do leitor")) {
    ganho(item.question, "pergunta", item.quality === "rasa" ? "resposta rasa na SERP" : `resposta de fora do leitor (${item.sourceDomain})`);
  }
  for (const item of input.marketOnlyEntities.slice(0, 2)) {
    if (texto(item.label)) ganho(texto(item.label), "entidade", `o mercado cita (${item.pages} página${item.pages === 1 ? "" : "s"}) e o artigo ainda não trata`);
  }

  /* ---- (d) U · o SEO antigo que não se copia ---- */
  const detectores = new Map<string, Detector>();
  const marcar = (pattern: string, instead: string, onde: string) => {
    const atual = detectores.get(pattern) ?? { pattern, instead, seenIn: new Set<string>() };
    if (onde) atual.seenIn.add(onde);
    detectores.set(pattern, atual);
  };
  const LISTA = "listicle \"N dicas\"";
  const ISCA_ROTULO = "título-isca sem dado";
  for (const item of input.organic) {
    const titulo = semAcento(texto(item.title));
    const site = dominio(item.domain || item.url);
    if (LISTICLE.test(titulo)) marcar(LISTA, "um caminho com critério e ordem, não N dicas", site);
    if (ISCA.test(titulo)) marcar(ISCA_ROTULO, "a promessa delimitada pela marca, sem número sem fonte", site);
  }
  for (const padrao of input.titlePatterns) {
    const lido = semAcento(texto(padrao));
    if (LISTICLE.test(lido) || /\bdicas?\b|\blista\b|\bnumer/.test(lido)) marcar(LISTA, "um caminho com critério e ordem, não N dicas", "");
    if (ISCA.test(lido)) marcar(ISCA_ROTULO, "a promessa delimitada pela marca, sem número sem fonte", "");
  }
  const medianaH2 = mediana(h2s);
  for (const pagina of paginas) {
    const site = dominio(pagina.domain || pagina.url);
    const cabecalhos = pagina.headings.map(texto).filter(Boolean);
    const lidos = cabecalhos.map(semAcento);
    if (principal && cabecalhos.length >= 3 && cabecalhos.filter(cabecalho => radarKeywordOccurrences(cabecalho, principal) > 0).length >= Math.ceil(cabecalhos.length / 2)) {
      marcar("a keyword principal em quase todo H2 (repetição)", "a principal 1× no H1 e no title; H2 pelo subtema (K2, K6)", site);
    }
    if (lidos.filter(cabecalho => H2_NUMERADO.test(cabecalho)).length >= 2) marcar("H2 numerados (a lista virou estrutura)", "H2 pela pergunta do leitor", site);
    if (lidos.some(cabecalho => FAQ.test(cabecalho))) marcar("FAQ despejado no fim", "as perguntas dentro das seções", site);
    if (lidos.some(cabecalho => FECHO_GENERICO.test(cabecalho))) marcar("fechamento genérico (\"Conclusão\", \"Considerações finais\")", "os 4 tempos, com o diagnóstico como CTA único", site);
    if (input.aiOverview?.shown && lidos.some(cabecalho => O_QUE_E.test(cabecalho))) marcar("seção \"o que é\" com resposta de IA no topo (zero-click)", "a definição em 1 ou 2 frases da abertura", site);
    if (reference.words && medianaH2 && pagina.words && pagina.h2 && pagina.words < reference.words.median / 2 && pagina.h2 >= medianaH2) {
      marcar("página rasa com muitos H2", "profundidade útil por seção, não mais H2", site);
    }
  }
  const oldSeo = [...detectores.values()].slice(0, L.perBlock).map((item, indice) => ({
    id: `U${indice + 1}`,
    pattern: item.pattern,
    seenIn: [...item.seenIn].slice(0, 4),
    instead: item.instead,
    text: `${item.pattern}${item.seenIn.size ? ` (visto em ${[...item.seenIn].slice(0, 4).join(", ")})` : ""}`,
  }));

  return {
    version: RADAR_COMPETITIVE_READING_VERSION,
    sample: {
      total: paginas.length,
      relevant: relevantes.length,
      excluded: lidas.filter(item => item.motivos.length).map(item => ({ url: item.pagina.url, domain: dominio(item.pagina.domain || item.pagina.url), title: texto(item.pagina.title), reasons: item.motivos })),
    },
    reference,
    consensus: base,
    bestOnly: melhores,
    gains,
    oldSeo,
    questions: questions.slice(0, L.questionsKept + L.questionsDropped),
    angle: texto(input.recommendedAngle) || null,
    aiOverview: Boolean(input.aiOverview?.shown),
  };
}

/** A linha "Amostra relevante: N de M páginas (fora: …)" (serp_resumida e pedido), ou null sem amostra. */
export function radarCompetitiveSampleLine(leitura: Pick<RadarCompetitiveReading, "sample"> | null | undefined): string | null {
  if (!leitura?.sample.total) return null;
  const fora = leitura.sample.excluded.map(item => `${item.domain} (${item.reasons.map(motivo => motivo.replace(/:.*$/, "")).join("; ")})`);
  return `Amostra relevante (D11): ${leitura.sample.relevant} de ${leitura.sample.total} páginas comparáveis${fora.length ? ` (fora, marcadas e não escondidas: ${fora.join(", ")})` : ""}.`;
}

/** D12 · A faixa de referência, dita como referência (nunca meta de parágrafos), ou null. */
export function radarCompetitiveReferenceLine(leitura: Pick<RadarCompetitiveReading, "reference"> | null | undefined): string | null {
  const r = leitura?.reference;
  if (!r?.words) return null;
  return `Faixa de referência (amostra relevante, ${r.pages} página${r.pages === 1 ? "" : "s"}, sem outlier): ${r.words.min === r.words.max ? `${r.words.min}` : `${r.words.min}–${r.words.max}`} palavras${r.h2 ? `, ${r.h2.min === r.h2.max ? r.h2.min : `${r.h2.min}–${r.h2.max}`} H2` : ""}; não é meta (D12).`;
}

/* ============================== a ponte do pacote do export (o que já está gravado) ============================== */

/**
 * A ENTRADA DA LEITURA A PARTIR DO PACOTE DO EXPORT (o mesmo que o pedido do
 * artigo-modelo e o CSV leem): a SERP canônica do snapshot (orgânicos, "Pessoas
 * também perguntam" com a resposta, resumo de IA, padrões de título), a base única
 * das páginas comparáveis (posição e medidas), os conceitos de cada página e os
 * H2/H3 lidos (das extrações gravadas), as entidades e o ângulo que o Radar
 * recomendava. Nada é coletado.
 */
export function radarCompetitiveReadingInputOf(
  entrada: Pick<RadarPortableExportInput, "article" | "googleObserved" | "competitorOutlines" | "serpRawPages" | "blueprintView">,
  extra: { serpObserved: RadarPortableSerpObserved | null; base: RadarSampleBasis | null; subject?: string | null },
): RadarCompetitiveReadingInput {
  const observado = entrada.googleObserved ?? null;
  const conceitosDaUrl = new Map((observado?.competitors || []).map(item => [chaveDaUrl(item.url), item.conceptsCovered || []]));
  const cabecalhosDaUrl = new Map<string, string[]>();
  for (const pagina of entrada.competitorOutlines || []) {
    cabecalhosDaUrl.set(chaveDaUrl(pagina.url), (pagina.headings || []).filter(item => item.level === 2 || item.level === 3).map(item => texto(item.text)).filter(Boolean));
  }
  for (const pagina of entrada.serpRawPages || []) {
    if (!cabecalhosDaUrl.has(chaveDaUrl(pagina.url))) cabecalhosDaUrl.set(chaveDaUrl(pagina.url), (pagina.h2 || []).map(texto).filter(Boolean));
  }
  const melhor = (ranks: ReadonlyArray<{ rank: number }> | null | undefined) => {
    const validas = (ranks || []).map(item => item.rank).filter(rank => typeof rank === "number" && Number.isFinite(rank));
    return validas.length ? Math.min(...validas) : null;
  };
  const paginas: RadarCompetitiveReadingPage[] = extra.base
    ? extra.base.pages.map(pagina => ({
      url: pagina.url, domain: pagina.domain, title: pagina.title, bestPosition: pagina.bestPosition,
      words: pagina.structure?.words ?? null, h2: pagina.structure?.h2 ?? null,
      concepts: conceitosDaUrl.get(chaveDaUrl(pagina.url)) || [],
      headings: cabecalhosDaUrl.get(chaveDaUrl(pagina.url)) || [],
    }))
    : (observado?.competitors || []).filter(item => item.comparable).map(item => ({
      url: item.url, domain: item.domain, title: item.title, bestPosition: melhor(item.ranks),
      words: item.structure?.words ?? null, h2: item.structure?.h2 ?? null,
      concepts: item.conceptsCovered || [], headings: cabecalhosDaUrl.get(chaveDaUrl(item.url)) || [],
    }));
  const serp = extra.serpObserved;
  const recomendado = entrada.blueprintView?.blueprint?.profile === "GOOGLE" ? entrada.blueprintView.blueprint.recommended : null;
  return {
    principal: texto(entrada.article.principalKeyword),
    core: [...(entrada.article.secondaryKeywords || []), ...(entrada.article.narrativeReinforcements || []), texto(extra.subject)].filter(Boolean),
    audience: texto(entrada.article.audience) || null,
    organic: (serp?.organic || []).map(item => ({ position: item.position, title: item.title, url: item.url, domain: item.domain, snippet: item.snippet?.thirdPartyExcerpt ?? null })),
    pages: paginas,
    concepts: (observado?.concepts.all || []).map(item => ({ label: item.canonicalLabel, sourceCount: item.sourceCount, sampleSize: item.sampleSize, status: item.status })),
    peopleAlsoAsk: (serp?.peopleAlsoAsk || []).map(item => ({ question: item.question, answer: item.answer?.thirdPartyExcerpt ?? null, sourceUrl: item.sourceUrl })),
    aiOverview: serp?.features ? { shown: serp.features.aiOverview.shown, citedSources: serp.features.aiOverview.citedSources } : null,
    titlePatterns: serp?.diagnostic?.titlePatterns || [],
    marketOnlyEntities: (observado?.entities.marketOnly || []).map(item => ({ label: item.label, pages: item.pages })),
    recommendedAngle: recomendado?.editorialAngle?.statement ?? null,
    recommendedDifferentiation: (recomendado?.differentiation || []).map(item => item.statement),
  };
}

/**
 * A LEITURA DE UM ARTIGO, UMA REGRA SÓ (o pedido do artigo-modelo e o CSV "Para
 * escrever" chamam esta): só no perfil Google e só com SERP, base ou concorrente
 * lido; senão, null (o pedido e a coluna são os de antes).
 */
export function radarCompetitiveReadingOf(
  entrada: Pick<RadarPortableExportInput, "profile" | "article" | "googleObserved" | "competitorOutlines" | "serpRawPages" | "blueprintView">,
  extra: { serpObserved: RadarPortableSerpObserved | null; base: RadarSampleBasis | null; subject?: string | null },
): RadarCompetitiveReading | null {
  if (entrada.profile !== "GOOGLE") return null;
  if (!extra.serpObserved?.organic.length && !extra.base?.pages.length && !entrada.googleObserved?.competitors.length) return null;
  return buildRadarCompetitiveReading(radarCompetitiveReadingInputOf(entrada, extra));
}
