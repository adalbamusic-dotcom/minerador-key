import { RADAR_KEYWORD_RULES_VERSION } from "./human-voice-guideline.ts";
import {
  radarWritingMaterialClosingOf,
  radarWritingMaterialCompetitiveBlock,
  radarWritingMaterialQuestions,
  type RadarWritingMaterial,
} from "./portable-writing-material.ts";
import { radarVideoTitleSignals } from "./video-competitive.ts";

/**
 * ===== 2026-10-14 · F6 · O VÍDEO EM 4 PARTES, PELO MESMO NÚCLEO (pedido do dono) =====
 *
 * SDD `docs/compartilhado/sdd-silo-interligado-seo-semantico-2026-10-14.md` §10 e
 * §18.1 (F6). Frase do dono (2026-10-14): "sobre a saída do vídeo, eu estava
 * pensando em 4 partes: tem um vídeo maior, tudo de acordo com as coletas no
 * YouTube como fonte de inspiração e formação do gabarito assim como faz nos
 * artigos; ele fica um vídeo maior com várias partes ou o assunto dividido em
 * capítulos, e deixar as diretrizes para storytelling; mas também ter versões
 * fatiadas, vídeos curtos para as redes sociais de ~15 segundos cada, fatiados
 * por seções/micro-assuntos do mesmo tema; e eles mesmos podem servir para criar
 * os slides ou carrossel… hoje o vídeo está bom mas pode melhorar."
 *
 * Estas réguas puras alimentam as colunas de SEMPRE do CSV de vídeo
 * (`portable-video-export.ts`): o gabarito do YouTube e o storytelling do vídeo
 * longo (diretrizes_de_roteiro), os curtos de ~15 s por micro-assunto e os
 * carrosséis derivados deles (cortes_para_redes). O material do artigo (ângulo,
 * ganho de informação, perguntas, fechamento em 4 tempos, fontes de autoridade)
 * vem da MESMA linha do CSV "Para escrever" (`radarWritingMaterialOf`). Nada de
 * coleta nova, IA ou provider: só o que o YouTube e o Radar já gravaram.
 *
 * Domínio puro: sem banco, sem rede, sem IA.
 */

export const RADAR_VIDEO_PRODUCTION_VERSION = "2026-10-14";

/** A duração-alvo de cada curto quando a concorrência não dá dado (pedido do dono: ~15 s). */
export const RADAR_VIDEO_SHORT_DEFAULT_SECONDS = 15;
/** A duração do vídeo longo para os marcadores de tempo, sem a mediana dos longos pertinentes. */
export const RADAR_VIDEO_LONG_DEFAULT_SECONDS = 8 * 60;
/** Quantos micro-assuntos (curtos) cada capítulo pode render. */
export const RADAR_VIDEO_MICRO_PER_CHAPTER = 3;

const mmss = (segundos: number) => `${Math.floor(segundos / 60)}:${String(Math.round(segundos % 60)).padStart(2, "0")}`;
const minutos = (segundos: number) => (segundos >= 90 ? `~${Math.round(segundos / 60)} min` : `~${Math.round(segundos)} s`);
const semPonto = (valor: string) => valor.trim().replace(/[.;:\s]+$/, "");
const mediana = (valores: readonly number[]): number | null => {
  const lista = [...valores].filter(valor => Number.isFinite(valor) && valor > 0).sort((a, b) => a - b);
  if (!lista.length) return null;
  const meio = Math.floor(lista.length / 2);
  return lista.length % 2 ? lista[meio] : Math.round((lista[meio - 1] + lista[meio]) / 2);
};

/** Um vídeo longo pertinente, como a pesquisa do YouTube o guardou. */
export type RadarVideoTemplateVideo = { title: string; channelName?: string | null; bestRank: number; durationSeconds?: number | null };

/* O que o título do YouTube "antigo" repete, lido pela forma (sem ver a thumbnail). */
const LISTICLE = /\b\d+\s+(?:dicas?|truques?|segredos?|erros?|passos?|formas?|maneiras?|estrat[eé]gias?|ideias?)\b/i;
const ISCA = /n[aã]o vai acreditar|ningu[eé]m (?:te )?conta|segredo|o que ningu[eé]m|chocante|urgente|pare (?:agora|de)|nunca mais|isso muda tudo/i;
const SEPARADOR_DE_KEYWORD = /\s[|│]\s.*\s[|│]\s|#\w+.*#\w+/;

/**
 * O GABARITO DO YOUTUBE PARA O VÍDEO LONGO: a duração dos longos pertinentes, o
 * que os mais bem posicionados fazem (top 3 × os demais) e o "SEO de YouTube
 * antigo" que não se copia — a mesma lógica da análise competitiva dos artigos,
 * sobre os vídeos já coletados. Referência, não meta.
 */
export function radarVideoLongTemplate(videos: readonly RadarVideoTemplateVideo[]): { lines: string[]; targetSeconds: number | null } {
  if (!videos.length) {
    return {
      lines: ["Gabarito do YouTube: nenhum vídeo longo pertinente na pesquisa do YouTube deste artigo; a duração e a estrutura saem dos capítulos da planta (nada a copiar do topo)."],
      targetSeconds: null,
    };
  }
  const ordenados = [...videos].sort((a, b) => a.bestRank - b.bestRank);
  const duracoes = ordenados.map(video => video.durationSeconds ?? 0);
  const alvo = mediana(duracoes);
  const linhas = [
    `Gabarito do YouTube (${ordenados.length} vídeo(s) longo(s) pertinente(s) já coletado(s); referência, não meta): ${alvo ? `duração mediana ${mmss(alvo)}` : "duração não registrada"}.`,
  ];
  if (ordenados.length >= 5) {
    const topo = ordenados.slice(0, 3);
    const resto = ordenados.slice(3);
    const sinaisTopo = radarVideoTitleSignals(topo);
    const sinaisResto = radarVideoTitleSignals(resto);
    const dTopo = mediana(topo.map(video => video.durationSeconds ?? 0));
    const dResto = mediana(resto.map(video => video.durationSeconds ?? 0));
    linhas.push(`O que os 3 mais bem posicionados fazem (× os outros ${resto.length}): ${dTopo && dResto ? `duração mediana ${mmss(dTopo)} × ${mmss(dResto)}; ` : ""}pergunta no título em ${sinaisTopo.pergunta} de 3 × ${sinaisResto.pergunta} de ${resto.length}; credencial no título ou no canal em ${sinaisTopo.credencial} de 3 × ${sinaisResto.credencial} de ${resto.length}. Faça igual onde eles acertam e melhor com a demonstração da planta.`);
  }
  const conta = (teste: RegExp) => ordenados.filter(video => teste.test(video.title)).length;
  const sinais = radarVideoTitleSignals(ordenados);
  const antigo = [
    ...(conta(LISTICLE) ? [`listicle "N dicas" em ${conta(LISTICLE)}`] : []),
    ...(conta(ISCA) ? [`título-isca em ${conta(ISCA)}`] : []),
    ...(sinais.caixaAlta ? [`caixa alta em ${sinais.caixaAlta}`] : []),
    ...(sinais.emoji ? [`emoji em ${sinais.emoji}`] : []),
    ...(conta(SEPARADOR_DE_KEYWORD) ? [`keyword empilhada com "|" ou hashtags em ${conta(SEPARADOR_DE_KEYWORD)}`] : []),
  ];
  linhas.push(antigo.length
    ? `SEO de YouTube antigo que não se copia (nos títulos pertinentes): ${antigo.join(" · ")} — no lugar, uma promessa delimitada pela marca, um ângulo por título, sem isca nem número sem fonte.`
    : "SEO de YouTube antigo: nenhum padrão de isca, listicle ou keyword empilhada nos títulos pertinentes.");
  linhas.push("Capítulos dos concorrentes: a coleta do YouTube não lê a descrição nem os capítulos dos vídeos; a estrutura do vídeo longo é a dos capítulos abaixo (as seções do artigo-modelo).");
  return { lines: linhas, targetSeconds: alvo };
}

/**
 * OS MARCADORES DE TEMPO ESTIMADOS: gancho, capítulos (pela soma igual do meio)
 * e fechamento, sobre a duração-alvo (a mediana dos longos pertinentes ou 8 min).
 */
export function radarVideoTimeMarkers(capitulos: readonly string[], alvoSegundos: number | null): string {
  const total = alvoSegundos && alvoSegundos >= 120 ? alvoSegundos : RADAR_VIDEO_LONG_DEFAULT_SECONDS;
  const gancho = 15;
  const fechamento = Math.min(60, Math.round(total * 0.08));
  const meio = Math.max(capitulos.length, 1);
  const porCapitulo = (total - gancho - fechamento) / meio;
  const marcas = [
    "0:00 Gancho",
    ...capitulos.map((titulo, indice) => `${mmss(gancho + indice * porCapitulo)} ${indice + 1}. ${titulo}`),
    `${mmss(total - fechamento)} Fechamento (o diagnóstico)`,
  ];
  return `Marcadores de tempo estimados (vídeo de ${minutos(total)}, ${alvoSegundos && alvoSegundos >= 120 ? "pela mediana dos longos pertinentes" : "padrão sem mediana dos longos pertinentes"}; conferir na edição): ${marcas.join(" · ")}.`;
}

/**
 * O ARCO DO STORYTELLING DO VÍDEO LONGO: gancho → tensão (a dor) → virada (a
 * mudança para a estrutura) → prova (as demonstrações dos capítulos, as fontes
 * de autoridade) → resolução (a facilidade: a marca faz) → CTA único (o
 * diagnóstico). O caso é ilustrativo e marcado; caso real só pelo especialista.
 */
export function radarVideoStorytelling(input: {
  material: RadarWritingMaterial | null;
  gancho: string | null;
  perguntas: ReadonlyArray<string | null>;
  especialista?: string | null;
}): string[] {
  const fechamento = radarWritingMaterialClosingOf(input.material);
  const ou = (valor: string | null | undefined, padrao: string) => (valor ? semPonto(valor) : padrao);
  const virada = fechamento?.structureShift ?? null;
  const linhas = [
    "Storytelling (arco do vídeo longo; um CTA só, o diagnóstico):",
    `1. Gancho (0:00–0:15): ${ou(input.gancho, "o gancho acima, pelo próprio tema")}.`,
    `2. Tensão (o problema, a dor que a pessoa já sentiu): ${ou(fechamento?.pain, fechamento?.turn ? `como a virada gravada da planta a diz (os três primeiros tempos estão nela) — ${semPonto(fechamento.turn)}` : "a receita pronta que não funcionou")}.`,
    `3. Virada (a mudança para a estrutura própria): ${ou(virada, fechamento?.turn ? "a mudança que a virada gravada diz, explicada sem sigla" : "a estrutura própria, explicada sem sigla")}${input.especialista ? `; a fala ${input.especialista} do especialista entra aqui e na resolução, na voz dele` : ""}.`,
    "4. Prova e demonstração: os capítulos abaixo, cada um com o seu \"Mostrar na tela\"; as fontes de autoridade citadas pelo nome da entidade.",
    `5. Resolução (a facilidade: quem faz é a marca): ${ou(fechamento?.ease, fechamento?.turn ? "a facilidade que a virada gravada diz, com a marca fazendo; a pessoa só contribui com o que sabe" : "a marca faz; a pessoa só contribui com o que sabe")}.`,
    `6. CTA único — o diagnóstico: ${ou(fechamento?.cta, "a verificação concreta que a marca faz, com uma chamada só")}${fechamento?.offer ? ` (oferta da Skill: ${semPonto(fechamento.offer)})` : ""}.`,
    "Personagem: um caso ilustrativo, dito como ilustrativo na fala e na tela (\"exemplo ilustrativo\"); caso real só com o relato aprovado do especialista; nunca paciente, cliente, número ou depoimento inventado.",
  ];
  const proximas = input.perguntas.map((pergunta, indice) => (indice > 0 && pergunta ? `${indice}→${indice + 1} "${semPonto(pergunta).replace(/\?$/, "")}?"` : null)).filter(Boolean);
  if (proximas.length) linhas.push(`Ganchos de retenção entre capítulos (ao fechar um capítulo, anuncie a pergunta do próximo): ${proximas.join(" · ")}.`);
  return linhas;
}

/**
 * O MATERIAL DO ARTIGO NO ROTEIRO: o ângulo, o ganho de informação (o que o
 * vídeo mostra que o topo não mostra), as perguntas que valem resposta e o SEO
 * antigo do topo que não se copia — da coluna cobrir_e_superar do CSV para
 * escrever. Até 4 itens por bloco.
 */
export function radarVideoArticleMaterialLines(material: RadarWritingMaterial | null): string[] {
  if (!material) return [];
  const ganhos = radarWritingMaterialCompetitiveBlock(material, 3).slice(0, 4);
  const perguntas = radarWritingMaterialQuestions(material).slice(0, 4);
  const antigo = radarWritingMaterialCompetitiveBlock(material, 4).slice(0, 4);
  return [
    ...(material.angle ? [`Ângulo do vídeo (o mesmo do artigo): ${semPonto(material.angle)}.`] : []),
    ...(ganhos.length ? [`Ganho de informação (o que o vídeo mostra que o topo não mostra): ${ganhos.map(semPonto).join("; ")}.`] : []),
    ...(perguntas.length ? [`Perguntas que valem resposta (responda com valor, dentro do capítulo; nunca bloco de perguntas frequentes): ${perguntas.map(semPonto).join("; ")}.`] : []),
    ...(antigo.length ? [`O que o topo faz e o vídeo não copia: ${antigo.map(semPonto).join("; ")}.`] : []),
  ];
}

/**
 * AS FONTES DE AUTORIDADE NO VÍDEO: citadas pelo NOME DA ENTIDADE na fala e na
 * tela (o endereço vai na descrição e na legenda); a afirmação de saúde sem fonte
 * verificada não vira fato. Da coluna fontes_e_especialista do CSV para escrever.
 */
export function radarVideoAuthorityLines(material: RadarWritingMaterial | null): string[] {
  if (!material) return [];
  const fontes = material.authority.map(item => `${item.id} ${item.label ?? "fonte"}${item.url ? ` (${item.url})` : ""}`);
  return [
    ...(fontes.length ? [`Fontes de autoridade (cite pelo nome da entidade na fala e na tela, ex.: "segundo o Ministério da Saúde"; o endereço vai na descrição e na legenda): ${fontes.join("; ")}.`] : []),
    ...material.ymylWithoutSource.map(linha => `${semPonto(linha)} — no vídeo, nos curtos e nas lâminas também.`),
  ];
}

/** A REGRA DO TÍTULO NO VÍDEO (K2/K3 da F1, com a boa prática do YouTube: a principal nas primeiras ~60 letras). */
export function radarVideoTitleRule(partida: string | null, oportunidades: readonly string[] = []): string {
  return `Título do vídeo (regras de keyword ${RADAR_KEYWORD_RULES_VERSION}, K2/K3): 3 opções com ângulos diferentes — (a) dor → saída; (b) contraste com o que os vídeos do topo prometem; (c) diagnóstico ou decisão —; a principal, na forma natural, uma vez em cada, dentro das primeiras ~60 letras (boa prática do YouTube), abrindo no máximo 1 das 3 (nunca prefixo fixo); nunca "dicas", "guia" nem marca de processo${partida ? `; parta do título da planta (${partida})` : ""}${oportunidades.length ? `; padrões de título que os vídeos pertinentes não usam (espaço para diferenciar): ${oportunidades.join(" · ")}` : ""}.`;
}

/** A regra do título de cada curto (a mesma K3, para o formato curto). */
export const RADAR_VIDEO_SHORT_TITLE_RULE = "Títulos de cada curto: 3 opções com ângulos diferentes — dor → saída; contraste com o que os curtos do topo prometem; diagnóstico —; a principal, natural, abre no máximo 1 delas (nunca prefixo fixo); sem \"dicas\" nem isca.";

/** A duração-alvo de cada curto: a mediana dos Shorts pertinentes quando ela cabe em 10–30 s; senão, ~15 s. */
export function radarVideoShortTarget(medianaObservada: number | null | undefined): { seconds: number; line: string } {
  if (typeof medianaObservada === "number" && medianaObservada >= 10 && medianaObservada <= 30) {
    return { seconds: Math.round(medianaObservada), line: `~${Math.round(medianaObservada)} s (mediana dos Shorts pertinentes)` };
  }
  return {
    seconds: RADAR_VIDEO_SHORT_DEFAULT_SECONDS,
    line: `~${RADAR_VIDEO_SHORT_DEFAULT_SECONDS} s${typeof medianaObservada === "number" && medianaObservada > 0 ? ` (padrão; os Shorts pertinentes têm mediana de ${mmss(medianaObservada)})` : " (padrão; sem dado de Shorts pertinentes)"}`,
  };
}

/** O CTA de cada curto e de cada carrossel: o diagnóstico (um só), com o link do artigo na legenda. */
export function radarVideoShortCta(material: RadarWritingMaterial | null, destino: string): string {
  const cta = radarWritingMaterialClosingOf(material)?.cta ?? null;
  return `${cta ? `o diagnóstico — ${semPonto(cta)}` : "o diagnóstico da marca, uma chamada só"}${destino ? `; link do artigo na legenda (${destino})` : ""}`;
}

/*
 * ===== 2026-10-14 · F5 (SDD silo interligado; pendência da F6) · UM CARROSSEL POR CURTO, UMA RÉGUA SÓ =====
 *
 * A F6 pôs no CSV de vídeo "um carrossel por curto" (capa = o gancho, uma ideia
 * por lâmina, a última com o CTA); o Redator ainda semeava um carrossel só, uma
 * lâmina por capítulo. A régua das lâminas mora aqui, e o CSV de vídeo e a
 * semeadura do Redator leem dela: as mesmas lâminas, na mesma ordem, sem montagem
 * paralela. Autorização do dono (2026-10-14): "pode concluir as pendências".
 */

/** O curto como a série de micro-assuntos o traz (o mesmo de `cortes_para_redes` e do plano do vídeo). */
export type RadarVideoShortForCarousel = { rotulo: string; gancho: string; tela: string; ideia: string; ideiaMaior?: boolean; cena?: string };
/** O papel de cada lâmina do carrossel de um curto. */
export type RadarVideoCarouselSlideRole = "capa" | "texto" | "ideia" | "cta";
export type RadarVideoShortCarousel = { rotulo: string; laminas: Array<{ papel: RadarVideoCarouselSlideRole; texto: string }> };

export const RADAR_VIDEO_CAROUSEL_SLIDE_LABELS: Readonly<Record<RadarVideoCarouselSlideRole, string>> = Object.freeze({
  capa: "capa = o gancho do curto",
  texto: "o texto na tela dele",
  ideia: "a ideia inteira do curto (maior que o texto na tela ou com fonte)",
  cta: "o CTA (o diagnóstico)",
});

/**
 * AS LÂMINAS DO CARROSSEL DE UM CURTO: a capa (o gancho), o texto na tela, a
 * ideia inteira quando ela é maior que o texto na tela (ou leva fonte) e, por
 * último, o CTA único. O visual de cada lâmina é a cena do curto.
 */
export function radarVideoShortCarousel(curto: RadarVideoShortForCarousel, cta: string): RadarVideoShortCarousel {
  return {
    rotulo: curto.rotulo,
    laminas: [
      { papel: "capa", texto: curto.gancho },
      { papel: "texto", texto: curto.tela },
      ...(curto.ideiaMaior ? [{ papel: "ideia" as const, texto: curto.ideia }] : []),
      { papel: "cta", texto: cta },
    ],
  };
}

/** A série de carrosséis: um por curto, na ordem da série. */
export function radarVideoShortCarousels(curtos: readonly RadarVideoShortForCarousel[], cta: string): RadarVideoShortCarousel[] {
  return curtos.map(curto => radarVideoShortCarousel(curto, cta));
}

/** A regra das lâminas, dita uma vez para a série no CSV de vídeo (o texto que a coluna cortes_para_redes já escrevia na F6). */
export function radarVideoShortCarouselRuleLines(serie: ReadonlyArray<Pick<RadarVideoShortForCarousel, "rotulo" | "ideiaMaior">>): string[] {
  const comIdeiaInteira = serie.filter(micro => micro.ideiaMaior).map(micro => micro.rotulo);
  return [
    `- Lâmina 1 (capa) = o gancho do curto · Lâmina 2 = o texto na tela dele · ${comIdeiaInteira.length ? `Lâmina 3 = a ideia inteira do curto (nos curtos ${comIdeiaInteira.join(", ")}, em que ela é maior que o texto na tela ou leva fonte) · ` : ""}última lâmina = o CTA (o diagnóstico) · visual de cada lâmina = a cena do curto.`,
    `- Carrosséis: ${serie.map(micro => micro.rotulo).join(", ")} (um por curto, na ordem da série).`,
  ];
}

/*
 * ===== 2026-10-14 · F5 (SDD silo interligado §10; pendência da F6) · A ESTRUTURA E AS ENTIDADES DOS CONCORRENTES NO GABARITO =====
 *
 * "Entram também, sem coleta nova: … os temas H2/H3 dos concorrentes
 * (`competitorOutlines`); as entidades do modelo observado" (§10). O gabarito do
 * vídeo longo passa a dizer o que os concorrentes da SERP cobrem (os temas dos
 * H2/H3 já lidos, pela MESMA régua dos temas do CSV "Para escrever",
 * `radarWritingCompetitorTopicsOf`) e o que não se copia da estrutura deles, e as
 * entidades que eles citam. Referência, nunca roteiro: os capítulos continuam os
 * da planta. Os capítulos dos vídeos concorrentes do YouTube não são coletados
 * (a coleta não lê a descrição): coletá-los seria coleta paga nova, fora daqui.
 */
export type RadarVideoCompetitorTopic = { label: string; pages: number; headings: readonly string[] };
export const RADAR_VIDEO_COMPETITOR_TOPICS = 6;
export const RADAR_VIDEO_COMPETITOR_ENTITIES = 8;

const NUMERADO = /^\s*(?:\d+|[ivx]+)\s*[.)º°:\-–]\s*\S/i;

export function radarVideoCompetitorReferenceLines(input: {
  topics: readonly RadarVideoCompetitorTopic[];
  /** Quantas páginas comparáveis os temas leram (o "de M"). */
  sampleSize: number;
  /** A keyword principal e as complementares: H2 que abre por uma delas é SEO antigo. */
  keywords: readonly string[];
  entities?: { shared?: ReadonlyArray<{ label: string; pages: number }>; marketOnly?: ReadonlyArray<{ label: string; pages: number }> } | null;
  /** Abre pela keyword (a régua da F1, `radarHeadingStartsWithKeyword`). */
  startsWithKeyword: (titulo: string, keyword: string) => boolean;
  /** A célula apertada (o roteiro encolhendo): metade dos temas e das entidades, sem exemplo. */
  compact?: boolean;
}): string[] {
  const recorrentes = input.topics.filter(item => item.pages >= 2);
  const teto = input.compact ? Math.ceil(RADAR_VIDEO_COMPETITOR_TOPICS / 2) : RADAR_VIDEO_COMPETITOR_TOPICS;
  const temas = (recorrentes.length ? recorrentes : input.topics).slice(0, teto);
  const linhas: string[] = [];
  if (temas.length) {
    linhas.push(`Estrutura de títulos dos concorrentes da SERP (H2/H3 já lidos de ${input.sampleSize} página(s) comparável(is); referência para o gabarito, nunca roteiro — o que cobrem): ${temas.map(item => `${semPonto(item.label)} (${item.pages} site(s)${item.headings[0] && !input.compact ? `; ex.: "${semPonto(item.headings[0])}"` : ""})`).join(" · ")}. Diga a base em poucas frases, dentro do capítulo que trata dela; os capítulos continuam os da planta.`);
    const exemplos = input.topics.flatMap(item => item.headings);
    const numerados = exemplos.filter(titulo => NUMERADO.test(titulo)).length;
    const pelaKeyword = exemplos.filter(titulo => input.keywords.some(keyword => keyword && input.startsWithKeyword(titulo, keyword))).length;
    const naoCopiar = [
      "a ordem e os títulos deles (o vídeo segue os capítulos da planta)",
      ...(numerados ? [`H2 numerado de listicle (${numerados} nos exemplos lidos)`] : []),
      ...(pelaKeyword ? [`H2 que abre pela keyword (${pelaKeyword} nos exemplos lidos)`] : []),
    ];
    linhas.push(`O que não copiar da estrutura deles: ${naoCopiar.join("; ")}.`);
  }
  const rotulos = (lista: ReadonlyArray<{ label: string; pages: number }> | undefined) =>
    [...(lista || [])].sort((a, b) => b.pages - a.pages).slice(0, input.compact ? Math.ceil(RADAR_VIDEO_COMPETITOR_ENTITIES / 2) : RADAR_VIDEO_COMPETITOR_ENTITIES).map(item => `${semPonto(item.label)} (${item.pages})`);
  const comuns = rotulos(input.entities?.shared);
  const soDoMercado = rotulos(input.entities?.marketOnly);
  if (comuns.length || soDoMercado.length) {
    linhas.push(`Entidades que os concorrentes citam (varie a fala e o texto na tela com elas, sem repetir a keyword; entre parênteses, em quantas páginas): ${[
      ...(comuns.length ? [`as mesmas do artigo — ${comuns.join(", ")}`] : []),
      ...(soDoMercado.length ? [`só o mercado cita — ${soDoMercado.join(", ")} (cite quando o capítulo tratar; não é obrigação)`] : []),
    ].join("; ")}.`);
  }
  return linhas;
}
