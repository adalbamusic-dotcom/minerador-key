import { radarSemanticStems } from "./semantic-concept-model.ts";
import { radarUbiquitousStems } from "./intent-adherence.ts";
import {
  RADAR_WRITING_FUNCTION_WORDS,
  radarWritingCompareKey,
  radarWritingDecodeEntities,
  radarWritingUnsupportedClaims,
  type RadarWritingProjections,
} from "./portable-writing-export.ts";
import type { RadarArticleBlueprintPayload } from "./article-blueprint.ts";

/**
 * ===== 2026-10-07 · A TRAVA DE FONTE EM TODO TEXTO PUBLICÁVEL (pedido do dono) =====
 *
 * O CSV real de vídeo publicava na Lâmina 2 "O algoritmo prioriza conteúdo que
 * gera interação…" enquanto o capítulo 1 marcava a MESMA afirmação como "fonte
 * a obter". Seis réguas diferentes sabiam que a frase pedia fonte; nenhuma
 * conferia o texto que vai para a lâmina, a legenda e a ideia do corte.
 *
 * Aqui fica a régua única, com duas funções:
 *
 *   - `radarPendingClaims` junta as afirmações que pedem fonte: (a) os links
 *     externos da planta do artigo-modelo (até 2 por seção; `source` nulo é
 *     fonte a obter, `X` é fonte do pacote); (b) o que o mercado repete sem
 *     fonte (`radarWritingUnsupportedClaims`, usada como está — ela tem outros
 *     consumidores); (c) o que a fonte contradiz no mercado.
 *   - `radarClaimGate` diz, para UMA frase, se ela está livre, se tem fonte ou
 *     se fica travada — e por quê. Além das afirmações listadas, (d) um
 *     detector da regra 17 da planta: frase afirmativa sobre plataforma,
 *     algoritmo ou recurso, sem fonte.
 *
 * A trava só tira a frase do texto PUBLICÁVEL e diz o motivo; nos campos de
 * produção ela continua, como fala delimitada. Não apaga nada, não reescreve e
 * não censura a tese de quem fala: frase sem afirmação de plataforma passa.
 *
 * Limite declarado: afirmação sobre comportamento do público sem link externo
 * na planta ("consumido de passagem") não é pega por nenhuma das quatro.
 *
 * Domínio puro: sem fetch, sem storage, sem provider.
 */

export type RadarPendingClaimOrigin =
  /** Link externo da planta do artigo-modelo. */
  | "PLANTA"
  /** Afirmação que o mercado repete e o pacote não sustenta. */
  | "MERCADO_SEM_FONTE"
  /** Afirmação que o mercado repete e a fonte contradiz ou condiciona. */
  | "MERCADO_X_FONTE";

export type RadarPendingClaim = {
  texto: string;
  origem: RadarPendingClaimOrigin;
  /** A fonte do pacote (id X da planta) quando a planta a ligou; `null` = fonte a obter. */
  fonte: { id: string; url: string; titulo: string } | null;
  /** O índice da seção da planta (0 = primeira) quando a afirmação veio de um link externo dela. */
  secao: number | null;
};

export type RadarClaimGate =
  | { estado: "LIVRE" }
  | { estado: "COM_FONTE"; afirmacao: RadarPendingClaim }
  | { estado: "TRAVADA"; afirmacao: RadarPendingClaim | null; motivo: string };

const texto = (valor: unknown): string => (typeof valor === "string" ? radarWritingDecodeEntities(valor.trim()).replace(/\s+/g, " ") : "");

export function radarPendingClaims(p: RadarWritingProjections, planta: RadarArticleBlueprintPayload | null): RadarPendingClaim[] {
  const saida: RadarPendingClaim[] = [];
  const fontes = new Map((planta?.sources || []).map(fonte => [fonte.id, fonte]));
  /* (a) todos os links externos de todas as seções — o vídeo lia só o primeiro (`externalLinks[0]`). */
  for (const [indice, secao] of (planta?.blueprint.sections || []).entries()) {
    for (const link of secao.externalLinks || []) {
      const afirmacao = texto(link.claim);
      if (!afirmacao) continue;
      const fonte = link.source ? fontes.get(link.source) ?? null : null;
      saida.push({ texto: afirmacao, origem: "PLANTA", fonte: fonte ? { id: fonte.id, url: fonte.url, titulo: fonte.title } : null, secao: indice });
    }
  }
  /*
   * (b) a MESMA régua do CSV para escrever: só afirmação que pede fonte, e só a que não tem.
   * 2026-10-07 (revisão) · a afirmação que a fonte CONTRADIZ também sai dessa
   * régua (ela só conta SUPPORTS): ela é dita uma vez, em (c), com o motivo
   * certo — "sem fonte" era falso para quem tem fonte contrária.
   */
  const emConflito = new Set((p.autoridade?.marketVsFactConflicts || []).map(conflito => radarWritingCompareKey(texto(conflito.canonicalClaim))));
  for (const item of radarWritingUnsupportedClaims(p.autoridade, p.serp)) {
    const afirmacao = texto(item.afirmacao);
    if (afirmacao && !emConflito.has(radarWritingCompareKey(afirmacao))) saida.push({ texto: afirmacao, origem: "MERCADO_SEM_FONTE", fonte: null, secao: null });
  }
  /* (c) o que a fonte contradiz ou condiciona: o mercado repete, e reproduzir induz ao erro. */
  for (const conflito of p.autoridade?.marketVsFactConflicts || []) {
    const afirmacao = texto(conflito.canonicalClaim);
    if (afirmacao) saida.push({ texto: afirmacao, origem: "MERCADO_X_FONTE", fonte: null, secao: null });
  }
  return saida;
}

/*
 * As raízes que a afirmação e a frase dividem precisam DISTINGUIR o assunto:
 * palavra de função, auxiliar e pronome não contam, e a raiz da principal que
 * aparece em quase toda seção da planta ("instagram" num artigo sobre
 * Instagram) também não — senão toda frase do artigo "casaria" com toda
 * afirmação.
 */
const GENERICAS: ReadonlySet<string> = new Set([
  "pode", "podem", "deve", "devem", "esta", "estao", "voce", "voces", "cada", "todo", "toda", "todos", "todas",
  "ainda", "mesmo", "mesma", "entre", "quem", "hoje", "aqui", "tambem", "apenas", "fazer", "sendo", "seja", "isso",
]);

/** O radical não é uniforme ("prioriza" → "prioriz", "priorizam" → "priorizam"): mesma raiz quando uma começa pela outra. */
const mesmaRaiz = (a: string, b: string) => a === b || (Math.min(a.length, b.length) >= 5 && (a.startsWith(b) || b.startsWith(a)));

const raizesDistintivas = (frase: string, comuns: ReadonlySet<string>): string[] =>
  radarSemanticStems(texto(frase)).filter(raiz => !RADAR_WRITING_FUNCTION_WORDS.has(raiz) && !GENERICAS.has(raiz) && !comuns.has(raiz));

const emComum = (da: readonly string[], com: readonly string[]) => da.filter(raiz => com.some(outra => mesmaRaiz(raiz, outra)));

/**
 * As raízes da principal que estão em metade ou mais das seções da planta:
 * cenário do artigo, não assunto de uma afirmação. Sem planta, as da própria
 * principal — o export sem planta só confere a promessa e as afirmações do
 * mercado, e "instagram" sozinho não liga uma à outra.
 */
export function radarClaimCommonStems(p: RadarWritingProjections, planta: RadarArticleBlueprintPayload | null): ReadonlySet<string> {
  const daPrincipal = new Set(radarSemanticStems(texto(p.dna.principalKeyword)));
  const secoes = (planta?.blueprint.sections || []).map(secao => [secao.h2, secao.readerQuestion, secao.answerFirst, ...secao.explain].map(texto).join(" "));
  if (secoes.length < 2) return daPrincipal;
  return new Set([...radarUbiquitousStems(secoes, 0.5, 2)].filter(raiz => daPrincipal.has(raiz)));
}

/*
 * (d) O DETECTOR DA REGRA 17 DA PLANTA: "se for afirmação sobre plataforma,
 * algoritmo ou comportamento do público, ponha um link externo com fonte a
 * obter". Pega a frase que AFIRMA um efeito de um mecanismo da plataforma
 * ("Hashtags e geolocalização ajudam a ser encontrado") ou de conversão ("Um
 * site otimizado converte visitantes em agendamentos"). A recomendação que só
 * NOMEIA o recurso ("Aplique táticas como … uso de hashtags relevantes") não
 * afirma efeito nenhum e passa — o detector pede mecanismo E efeito.
 *
 * 2026-10-07 (revisão) · três buracos do detector:
 *   - a PLATAFORMA como sujeito de um verbo de ordenar, entregar ou punir não
 *     contava como mecanismo: "O Instagram prioriza vídeos curtos", "O
 *     Instagram penaliza links na legenda" e "O Instagram mostra seu conteúdo
 *     primeiro para quem…" passavam. "Mostra" só conta com o "primeiro", "antes"
 *     ou "para quem" de quem ordena — "O Instagram mostra os bastidores da
 *     clínica" é uso da plataforma, não afirmação sobre ela;
 *   - "têm mais alcance" e "o alcance caiu" não tinham verbo da lista;
 *   - preço, recurso e funcionalidade travavam sem plataforma nenhuma na frase
 *     ("O preço da consulta aparece no site da clínica"): agora só com ela.
 * E o motivo da conversão é o dela: "converte visitantes em agendamentos" é
 * afirmação sobre o comportamento do público, não sobre plataforma.
 */
const MECANISMO = /\b(algoritm\w*|engajament\w*|hashtags?|geolocaliza\w*|anuncios?|impulsionament\w*|entrega (?:de|do|dos|das|da) (?:conteud|post|public|stor|reel)\w*|entrega organica)\b|(?<!\bao )\balcance\b/;
const RECURSO = /\b(funcionalidades?|recursos?|precos?)\b/;
const PLATAFORMA = /\b(instagram|tiktok|youtube|google|facebook|linkedin|whatsapp|reels?|stories|feed)\b/;
const EFEITO = /\b(prioriz\w*|favorec\w*|ajud\w*|aument\w*|ampli\w*|reduz\w*|diminu\w*|penaliz\w*|entreg(?:a|am)|mostr(?:a|am)|garant\w*|ger(?:a|am)|melhor(?:a|am)|impulsion(?:a|am)|derrub\w*|limit(?:a|am)|distribu\w*|recomend(?:a|am)|privilegi\w*|valoriz\w*|alcanc(?:a|am)|aparec\w*|cust(?:a|am)|cobr(?:a|am)|permit\w*|liber(?:a|am)|disponive\w*|oferec\w*|funcion(?:a|am)|dobr(?:a|am)|multiplic\w*|cresc\w*|caem?|sobem?|cai|caiu|cairam|tem (?:mais|menos))\b/;
/* O que a plataforma FAZ com o conteúdo (ordenar, entregar, punir), dito com ela como sujeito, até duas palavras antes do verbo. */
const PLATAFORMA_ORDENA = /\b(?:instagram|tiktok|youtube|google|facebook|linkedin|reels?|stories|feed)(?:\s+\S+){0,2}?\s+(?:prioriz\w*|favorec\w*|penaliz\w*|privilegi\w*|valoriz\w*|distribu\w*|recomend(?:a|am)|impulsion(?:a|am)|derrub\w*|limit(?:a|am)|reduz\w*|diminu\w*|aument\w*|ampli\w*|alcanc(?:a|am)|entreg(?:a|am)|tem (?:mais|menos)|caiu|cairam|mostr(?:a|am)(?:\s+\S+){0,3}?\s+(?:primeiro|antes|para quem))\b/;
const CONVERSAO = /\bconvert(?:e|em)\s+[a-z]/;

const normal = (valor: string) => texto(valor).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** 2026-10-07 (revisão) · O que o detector da regra 17 acusa: afirmação sobre plataforma, sobre conversão do público, ou nada. */
export type RadarPlatformClaimKind = "PLATAFORMA" | "CONVERSAO";

export function radarPlatformClaimKind(frase: string): RadarPlatformClaimKind | null {
  const limpa = normal(frase);
  if (!limpa || limpa.endsWith("?")) return null;
  const mecanismo = MECANISMO.test(limpa) || (RECURSO.test(limpa) && PLATAFORMA.test(limpa));
  if ((mecanismo && EFEITO.test(limpa)) || PLATAFORMA_ORDENA.test(limpa)) return "PLATAFORMA";
  return CONVERSAO.test(limpa) ? "CONVERSAO" : null;
}

export function radarPlatformClaimWithoutSource(frase: string): boolean {
  return radarPlatformClaimKind(frase) !== null;
}

/*
 * 2026-10-07 (revisão) · A POLARIDADE NAS AFIRMAÇÕES DO MERCADO. A porta casava
 * só raízes: "Mostrar por que o Instagram, sozinho, não enche a agenda" — a
 * tese do dono, do lado da fonte — era travada como se repetisse "O Instagram
 * enche a agenda da clínica", que o mercado repete e a fonte contradiz. Frase
 * que NEGA a afirmação do mercado não a reproduz: em (b) e (c) ela fica livre e
 * ainda passa pelo detector da regra 17, que pega afirmação de plataforma sem
 * fonte nos dois sentidos. O link externo da planta (a) não muda: ali é o
 * ASSUNTO que pede fonte, afirmado ou negado. Limite declarado: negação que não
 * toca a afirmação ("enche a agenda, não importa o nicho") também libera.
 */
const NEGACAO = /\b(nao|nunca|nem|jamais|nenhum|nenhuma|sem|ilusao|mito|falso|engano)\b/;
const nega = (valor: string) => NEGACAO.test(normal(valor));

const cortar = (valor: string, limite: number) => (valor.length > limite ? `${valor.slice(0, limite - 1).trimEnd()}…` : valor);
const semPontoFinal = (valor: string) => valor.trim().replace(/[.;:\s]+$/, "");

/*
 * Curto: o motivo vai numa lista que divide a célula com cortes e carrossel
 * (teto RADAR_VIDEO_EXPORT_CELL_CHARS). 2026-10-07 (revisão) · `limite`
 * (aditivo): quando a célula aperta, quem lista encurta a afirmação citada.
 */
function motivoDe(afirmacao: RadarPendingClaim, limite = 100): string {
  const dita = `"${cortar(semPontoFinal(afirmacao.texto), limite)}"`;
  if (afirmacao.origem === "PLANTA") return `a planta pede fonte: ${dita} (fonte a obter: oficial ou verificada)`;
  if (afirmacao.origem === "MERCADO_SEM_FONTE") return `o mercado repete sem fonte: ${dita}`;
  return `a fonte contradiz ou condiciona o que o mercado repete: ${dita}`;
}

export const RADAR_PLATFORM_CLAIM_REASON = "afirmação sobre plataforma sem fonte (regra 17 da planta)";
export const RADAR_CONVERSION_CLAIM_REASON = "afirmação sobre conversão do público sem fonte (regra 17 da planta)";

/** 2026-10-07 (revisão) · O motivo da trava com a afirmação citada até `limite` caracteres: a lista "Fica fora" encolhe por ele. */
export function radarClaimGateReason(porta: Extract<RadarClaimGate, { estado: "TRAVADA" }>, limite = 100): string {
  if (porta.afirmacao) return motivoDe(porta.afirmacao, limite);
  return porta.motivo;
}

/**
 * A PORTA: a frase está livre, tem fonte ou fica travada.
 *
 *   - (a) link externo da MESMA seção: divide 2 ou mais raízes distintivas com
 *     a frase (a seção já disse que aquela afirmação é dela);
 *   - (b) e (c), ou link de outra seção: a frase cobre 60% ou mais das raízes
 *     da afirmação, com pelo menos 2;
 *   - (d) o detector da regra 17, quando nenhuma fonte do pacote cobre a frase.
 *
 * A afirmação pendente vence a com fonte: frase que junta duas afirmações e só
 * uma tem fonte continua pedindo fonte. Pergunta não passa pelo detector — ela
 * não afirma —, mas passa pelas afirmações listadas.
 */
export function radarClaimGate(
  frase: string | null | undefined,
  pendentes: readonly RadarPendingClaim[],
  secao: number | null,
  opcoes: { comuns?: ReadonlySet<string> } = {},
): RadarClaimGate {
  const limpa = texto(frase);
  if (!limpa) return { estado: "LIVRE" };
  const comuns = opcoes.comuns || new Set<string>();
  const daFrase = raizesDistintivas(limpa, comuns);
  const mesmaSecao = (afirmacao: RadarPendingClaim) => afirmacao.secao !== null && secao !== null && afirmacao.secao === secao;
  const cobre = (afirmacao: RadarPendingClaim) => {
    const daAfirmacao = raizesDistintivas(afirmacao.texto, comuns);
    const divididas = emComum(daAfirmacao, daFrase).length;
    if (mesmaSecao(afirmacao)) return divididas >= 2;
    return divididas >= 2 && daAfirmacao.length > 0 && divididas / daAfirmacao.length >= 0.6;
  };
  /* 2026-10-07 (revisão) · a frase que NEGA o que o mercado repete não o reproduz (a polaridade, acima); o link da planta trava nos dois sentidos. */
  const reproduz = (afirmacao: RadarPendingClaim) => afirmacao.origem === "PLANTA" || nega(limpa) === nega(afirmacao.texto);
  /* A afirmação da própria seção vem primeiro: o motivo cita o link que a seção escreveu, não o parecido de outra. */
  const ordenadas = [...pendentes.filter(mesmaSecao), ...pendentes.filter(afirmacao => !mesmaSecao(afirmacao))];
  const pendente = ordenadas.find(afirmacao => !afirmacao.fonte && cobre(afirmacao) && reproduz(afirmacao));
  if (pendente) return { estado: "TRAVADA", afirmacao: pendente, motivo: motivoDe(pendente) };
  const comFonte = ordenadas.find(afirmacao => afirmacao.fonte && cobre(afirmacao));
  if (comFonte) return { estado: "COM_FONTE", afirmacao: comFonte };
  const regra = radarPlatformClaimKind(limpa);
  if (regra) return { estado: "TRAVADA", afirmacao: null, motivo: regra === "CONVERSAO" ? RADAR_CONVERSION_CLAIM_REASON : RADAR_PLATFORM_CLAIM_REASON };
  return { estado: "LIVRE" };
}
