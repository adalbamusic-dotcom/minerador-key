/**
 * A SERP VALIDA FRONTEIRA — ELA NÃO SALVA AGRUPAMENTO CEGO.
 *
 * A formação já entrega candidatos com núcleo temático próprio. O que a SERP
 * responde é outra pergunta, e só ela pode responder: o MERCADO trata estes
 * dois candidatos como o mesmo conteúdo?
 *
 * O sinal forte é URL repetida — o Google devolveu literalmente a mesma página
 * para as duas buscas. Domínio repetido é sinal fraco: o mesmo site responde
 * necessidades diferentes em páginas diferentes, e tratar isso como
 * convergência juntaria conteúdos que o mercado separa. É a mesma leitura que
 * `pairwiseOverlap` já faz entre duas keywords; aqui ela sobe para o par de
 * CANDIDATOS, que é a unidade que vira ArticleDNA.
 *
 * Nada é chamado de novo: os sinais vêm dos snapshots que a coleta já
 * persistiu no acervo. Provider irrelevante não é acionado só por existir;
 * sinal já disponível não é desperdiçado.
 *
 * Domínio puro: sem React, sem storage, sem rede, sem provider.
 */

export const SERP_OVERLAP_LEVELS = ["SERP_OVERLAP_HIGH", "SERP_OVERLAP_MEDIUM", "SERP_OVERLAP_LOW"] as const;
export type SerpOverlapLevel = (typeof SERP_OVERLAP_LEVELS)[number];

export const SERP_BOUNDARY_VERDICTS = ["MERGE", "KEEP_SEPARATE", "REFINE"] as const;
export type SerpBoundaryVerdict = (typeof SERP_BOUNDARY_VERDICTS)[number];

/** O que a coleta já gravou por candidato. Nada aqui é buscado de novo. */
export type CandidateSerpEvidence = {
  candidateRef: string;
  label: string;
  /** Intenção editorial declarada do candidato, do KeywordDNA. */
  declaredIntent: string | null;
  /** Intenção OBSERVADA pela SERP, quando a avaliação a registrou. */
  observedIntent: string | null;
  /** URLs orgânicas do topo, na ordem em que o provider devolveu. */
  urls: readonly string[];
  /** Domínios das mesmas posições. Sinal fraco, contado à parte. */
  domains: readonly string[];
  /** A avaliação descreve a composição ATUAL do candidato? */
  current: boolean;
};

export type CandidateSerpBoundary = {
  left: string;
  right: string;
  level: SerpOverlapLevel;
  verdict: SerpBoundaryVerdict;
  /** 0–1: fração das posições comparadas em que a mesma URL aparece. */
  urlOverlap: number;
  domainOverlap: number;
  sharedUrls: number;
  /** Os sinais que sustentaram o veredito, para a tela e para o replay. */
  reasons: string[];
};

/**
 * §11 — os limiares, e por que são estes.
 *
 * Ancorados em `pairwiseOverlap`, que já vale entre keywords neste projeto:
 * lá, três URLs repetidas no topo é "forte" e uma é "parcial". Aqui a medida é
 * proporcional em vez de absoluta, para que dois candidatos com 5 resultados
 * cada não sejam comparados com a mesma régua de dois com 10.
 *
 * HIGH = 0,4: quase metade do topo é literalmente a mesma página. Nesse
 * patamar, dois artigos disputam as mesmas posições — é canibalização
 * observada, não suspeita.
 *
 * LOW = 0,15: abaixo disso o encontro é incidental (um agregador, uma
 * enciclopédia) e não descreve o mesmo conteúdo.
 *
 * Entre os dois fica MEDIUM, que não decide sozinho: é o caso em que a
 * intenção observada desempata.
 */
export const SERP_OVERLAP_HIGH_FLOOR = 0.4;
export const SERP_OVERLAP_LOW_CEILING = 0.15;

const normalizarUrl = (value: string) => value
  .trim()
  .toLowerCase()
  .replace(/^https?:\/\//, "")
  .replace(/^www\./, "")
  .replace(/[?#].*$/, "")
  .replace(/\/+$/, "");

const intersecao = (left: readonly string[], right: readonly string[]) => {
  const direita = new Set(right);
  return [...new Set(left)].filter(item => direita.has(item));
};

/**
 * §9/§11 — o par de candidatos, confrontado com o que o mercado devolveu.
 *
 * Evidência ausente ou desatualizada NÃO vira veredito: ela vira `REFINE` com
 * o motivo dito. Inferir MERGE de um snapshot que descreve outra composição
 * seria gravar como contrato uma leitura que ninguém fez.
 */
export function resolveCandidateSerpBoundary(
  left: CandidateSerpEvidence,
  right: CandidateSerpEvidence,
): CandidateSerpBoundary {
  const reasons: string[] = [];

  if (!left.current || !right.current || !left.urls.length || !right.urls.length) {
    const faltando = [!left.current || !left.urls.length ? left.label : null, !right.current || !right.urls.length ? right.label : null]
      .filter(Boolean)
      .join(" e ");
    return {
      left: left.candidateRef,
      right: right.candidateRef,
      level: "SERP_OVERLAP_LOW",
      verdict: "REFINE",
      urlOverlap: 0,
      domainOverlap: 0,
      sharedUrls: 0,
      reasons: [`sem evidência de SERP vigente para ${faltando}: a fronteira não foi confrontada`],
    };
  }

  const urlsE = [...new Set(left.urls.map(normalizarUrl))].filter(Boolean);
  const urlsD = [...new Set(right.urls.map(normalizarUrl))].filter(Boolean);
  const comuns = intersecao(urlsE, urlsD);
  // O denominador é o MENOR dos dois topos: comparar contra a união puniria
  // um candidato que o provider devolveu com menos resultados.
  const base = Math.min(urlsE.length, urlsD.length) || 1;
  const urlOverlap = comuns.length / base;

  const dominiosE = [...new Set(left.domains.map(item => item.trim().toLowerCase()).filter(Boolean))];
  const dominiosD = [...new Set(right.domains.map(item => item.trim().toLowerCase()).filter(Boolean))];
  const dominiosComuns = intersecao(dominiosE, dominiosD);
  const domainOverlap = dominiosComuns.length / (Math.min(dominiosE.length, dominiosD.length) || 1);

  const level: SerpOverlapLevel = urlOverlap >= SERP_OVERLAP_HIGH_FLOOR
    ? "SERP_OVERLAP_HIGH"
    : urlOverlap <= SERP_OVERLAP_LOW_CEILING
      ? "SERP_OVERLAP_LOW"
      : "SERP_OVERLAP_MEDIUM";

  reasons.push(`${comuns.length} resultado(s) idêntico(s) no topo das duas buscas`);
  if (dominiosComuns.length) reasons.push(`${dominiosComuns.length} domínio(s) em comum`);

  const intencaoE = left.observedIntent || left.declaredIntent;
  const intencaoD = right.observedIntent || right.declaredIntent;
  const mesmaIntencao = Boolean(intencaoE && intencaoD && intencaoE === intencaoD);
  const intencaoDiverge = Boolean(intencaoE && intencaoD && intencaoE !== intencaoD);
  if (mesmaIntencao) reasons.push(`mesma intenção (${intencaoE})`);
  if (intencaoDiverge) reasons.push(`intenções diferentes (${intencaoE} × ${intencaoD})`);

  /*
   * O veredito.
   *
   * HIGH + mesma intenção é o caso em que separar seria canibalizar: mesmo
   * conteúdo, mesma necessidade. HIGH com intenções divergentes não funde
   * sozinho — o mercado pode estar servindo mal as duas, e isso é decisão
   * editorial, não aritmética: fica REFINE.
   *
   * LOW com foco ou intenção distintos confirma o que a formação já propôs.
   */
  let verdict: SerpBoundaryVerdict;
  if (level === "SERP_OVERLAP_HIGH" && !intencaoDiverge) {
    verdict = "MERGE";
    reasons.push("o mercado devolve o mesmo conteúdo para as duas: um artigo só");
  } else if (level === "SERP_OVERLAP_LOW") {
    verdict = "KEEP_SEPARATE";
    reasons.push("o mercado separa as duas buscas: cada uma sustenta artigo próprio");
  } else if (level === "SERP_OVERLAP_MEDIUM" && intencaoDiverge) {
    verdict = "KEEP_SEPARATE";
    reasons.push("sobreposição parcial, mas as intenções observadas divergem");
  } else {
    verdict = "REFINE";
    reasons.push("a evidência não decide sozinha: a fronteira precisa ser ajustada");
  }

  return {
    left: left.candidateRef,
    right: right.candidateRef,
    level,
    verdict,
    urlOverlap,
    domainOverlap,
    sharedUrls: comuns.length,
    reasons,
  };
}

/**
 * §9 — só os pares que valem a pergunta.
 *
 * Confrontar todos contra todos gastaria leitura em candidatos que a formação
 * já separou por temas distintos. O par entra quando a formação o marcou como
 * vizinho — é ela quem sabe quem ficou perto de quem.
 */
export function resolveCandidateBoundaries(input: {
  evidence: readonly CandidateSerpEvidence[];
  /** Pares vizinhos, vindos da formação. */
  pairs: readonly { left: string; right: string }[];
}): CandidateSerpBoundary[] {
  const porRef = new Map(input.evidence.map(item => [item.candidateRef, item]));
  const vistos = new Set<string>();
  const fronteiras: CandidateSerpBoundary[] = [];
  for (const par of input.pairs) {
    const chave = [par.left, par.right].sort().join("::");
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    const esquerda = porRef.get(par.left);
    const direita = porRef.get(par.right);
    if (!esquerda || !direita) continue;
    fronteiras.push(resolveCandidateSerpBoundary(esquerda, direita));
  }
  return fronteiras;
}
