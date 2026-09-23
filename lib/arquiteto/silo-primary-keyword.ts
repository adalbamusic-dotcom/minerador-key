/**
 * QUEM É A KEYWORD OFICIAL DO SILO — E POR QUAL EVIDÊNCIA.
 *
 * O Território sabia dizer o NOME do universo (`centralEntity`, texto livre) e
 * não sabia dizer sua IDENTIDADE. Este módulo elege a keyword primária, e elege
 * de um jeito diferente por origem, porque os conceitos de escolha são
 * diferentes:
 *
 *   ORIGEM 2 · publicado    a página já existe. O [Vínculo] DECLARA que ela é
 *                           Silo, e traz endereço e canonical. Não há o que
 *                           escolher — há o que ler.
 *   ORIGEM 1 · lista nova   nenhuma página existe. Quem decide é a SERP: entre
 *                           as candidatas, vence a que realmente compete.
 *   ORIGEM 3 · manual       a pessoa elege, e o motivo dela fica registrado.
 *
 * A hierarquia do produto manda aqui: a SERP está acima da lógica e da IA, mas
 * abaixo do FATO. Uma página publicada é fato observado; a SERP é evidência
 * sobre o que ainda não existe. Por isso a declaração vence a eleição por SERP
 * quando as duas existem — e isso é dito, não escondido.
 *
 * O que este módulo NÃO faz:
 *   - não inventa primária quando falta evidência: devolve recusa com motivo;
 *   - não promove keyword fraca por falta de concorrente melhor;
 *   - não chama provider: recebe a evidência já coletada;
 *   - não grava primária: a eleição por SERP sai como PROPOSTA pendente
 *     (`proposeSiloPrimaryFromSerp`) e só vira primária pelo aceite humano.
 *
 * Domínio puro: sem React, sem storage, sem rede.
 */

import type { EditorialUnitDeclaration, PrimaryKeywordDecision } from "./contracts.ts";
import { SERP_LENS_DATES_DIVERGE_DAYS, SERP_LENS_LABELS, collectedAtSpreadDays } from "./serp-lens-plan.ts";
import type { TerritoryPrimaryKeyword } from "./territory.ts";
import type { SerpPrimaryAcceptance, SerpPrimaryEvidence, SerpPrimaryTerritoryOrigin } from "./silo-primary-acceptance.ts";
import { serpPrimaryOriginRefusal } from "./silo-primary-acceptance.ts";
import { DEFAULT_SUBSTITUTION } from "./primary-substitution.ts";

/* ------------------------------ a evidência ------------------------------ */

/** O que a SERP de UMA keyword, num dispositivo, disse sobre concorrência. */
export type SerpCompetitiveObservation = {
  keywordId: string;
  /** `desktop-windows`, `mobile-android`… — a lente daquela observação. */
  lens: string;
  /** Domínios do top orgânico. É por eles que a concorrência é comparada. */
  competitorDomains: readonly string[];
  /** Quantos resultados orgânicos a SERP devolveu. */
  organicCount: number;
  /** Blocos que o Google entregou: vídeo, produto, AI Overview… */
  itemTypes: readonly string[];
  /** Perguntas do People Also Ask — cobertura esperada do universo. */
  questions: readonly string[];
  /** A SERP mostrou produto/preço? Sinal de intenção transacional. */
  commercialSignals: boolean;
  /**
   * SÓ os domínios citados pela resposta de IA do Google (AI Overview) — a
   * visibilidade nas IAs. Opcional e aditivo (2026-09-23): a observação do
   * cache já os trazia e a SERP por keyword os descartava. NÃO é somado de
   * novo a `competitorDomains`, que continua orgânicos + citados; separar os
   * dois muda a afinidade e fica para decisão própria (D5 do adendo das 4
   * lentes do Arquiteto).
   */
  aiOverviewDomains?: readonly string[];
  /** As buscas relacionadas que a SERP devolveu. Opcional e aditivo. */
  relatedSearches?: readonly string[];
  /**
   * Quando esta lente foi observada. Opcional e aditivo (2026-09-23): lentes
   * da MESMA keyword com mais de `SERP_LENS_DATES_DIVERGE_DAYS` dias de
   * diferença não medem divergência entre dispositivos — medem o tempo — e a
   * divergência entre elas deixa de contar em dobro.
   */
  collectedAt?: string;
};

/**
 * A maior diferença, em dias, entre as lentes de uma MESMA keyword. Datas de
 * keywords diferentes não se comparam: cada busca tem a sua coleta.
 */
export function lensDatesSpreadDays(observations: readonly SerpCompetitiveObservation[]): number {
  const porKeyword = new Map<string, string[]>();
  for (const item of observations) {
    if (!item.collectedAt) continue;
    porKeyword.set(item.keywordId, [...(porKeyword.get(item.keywordId) || []), item.collectedAt]);
  }
  let maior = 0;
  for (const datas of porKeyword.values()) maior = Math.max(maior, collectedAtSpreadDays(datas));
  return maior;
}

export type SiloStrengthThresholds = {
  /** Domínios em comum com as demais candidatas para contar como universo. */
  minCompetitorOverlap: number;
  /** Em quantas lentes a keyword precisa se sustentar. */
  minDevicesAgreeing: number;
  /** Resultados orgânicos mínimos para a evidência valer. */
  minOrganicCount: number;
  /**
   * A partir de que divergência as lentes são consideradas universos distintos.
   *
   * Metade do universo diferente entre dois dispositivos não é ruído de
   * coleta: é o Google dizendo que a mesma pergunta pede respostas diferentes
   * ali. Acima disto, sustentar-se numa lente vale como evidência de robustez.
   */
  minLensDivergenceToCount: number;
  /**
   * Quantas lentes observadas são precisas para a divergência contar em dobro.
   * Ausente = `MIN_LENSES_FOR_DIVERGENCE_CREDIT`.
   */
  minLensesForDivergenceCredit?: number;
};

/**
 * A DOBRA DA CONCORDÂNCIA SÓ COM PELO MENOS 3 LENTES OBSERVADAS.
 *
 * A regra de 2026-09-20 conta em dobro a lente que sustenta a keyword quando
 * o universo muda entre dispositivos. Com só 2 lentes observadas, UMA lente
 * concordante já atingia o mínimo de duas: uma lente decidia sozinha. A dobra
 * continua existindo — ela só passa a exigir lentes bastantes para que a
 * concordância seja de fato entre dispositivos (A7.4 do adendo das 4 lentes
 * do Arquiteto). Medido no provider em 2026-09-20, a divergência real foi 0,061
 * e 0,174, abaixo do limiar de 0,5: a trava vale para quando a dobra disparar.
 */
export const MIN_LENSES_FOR_DIVERGENCE_CREDIT = 3;

/**
 * Os limiares iniciais, VISÍVEIS e ajustáveis.
 *
 * Eles não vêm de teoria: são o menor conjunto que recusa um agrupamento sem
 * evidência. Ficam aqui, nomeados, para serem calibrados contra a homologação
 * em vez de virarem números mágicos espalhados pelo motor.
 */
export const DEFAULT_SILO_STRENGTH: SiloStrengthThresholds = {
  minCompetitorOverlap: 2,
  minDevicesAgreeing: 2,
  minOrganicCount: 3,
  minLensDivergenceToCount: 0.5,
};

/* --------------------------- a força de cada uma -------------------------- */

export type KeywordCompetitiveStrength = {
  keywordId: string;
  /** Domínios que esta keyword divide com as demais candidatas do Silo. */
  competitorOverlap: number;
  devicesObserved: number;
  devicesAgreeing: number;
  /**
   * Quanto as lentes DISCORDAM entre si sobre o universo desta keyword.
   *
   * 0 = as quatro lentes devolvem o mesmo universo; 1 = nenhuma devolve o que
   * a outra devolveu. Não é defeito da coleta: é característica da busca.
   */
  lensDivergence: number;
  /**
   * Lentes em que a keyword se sustenta APESAR de o universo mudar ali.
   *
   * Este é o sinal de robustez: manter sobreposição numa lente que diverge das
   * demais é evidência mais forte do que repetir a mesma SERP quatro vezes.
   */
  divergentLensesHolding: number;
  /** Amplitude: quantos blocos distintos o Google entrega. */
  featureBreadth: number;
  questions: string[];
  commercial: boolean;
  /** A nota que ordena. Determinística e explicável, nunca um peso oculto. */
  score: number;
  strong: boolean;
  reasons: string[];
  /** O que a divergência entre dispositivos diz, em uma frase, para a mesa. */
  lensNote: string;
  /** Maior diferença de datas entre as lentes desta keyword (0 sem datas). */
  lensDatesSpreadDays?: number;
};

const unico = <T>(values: readonly T[]) => [...new Set(values)];

/**
 * A DIVERGÊNCIA ENTRE AS LENTES, MEDIDA — não descartada.
 *
 * Uma leitura só para as quatro lentes, e a discordância entra como sinal em
 * vez de ser aplainada numa média. Quando o desktop e o mobile devolvem
 * universos diferentes, isso é fato sobre a busca: o Google entende que a
 * mesma pergunta pede respostas diferentes ali. Agrupar por dispositivo
 * separaria o mesmo universo em quatro; ignorar a diferença apagaria a
 * informação. Aqui ela é medida e dita.
 *
 * Distância de Jaccard média entre os pares de lentes: 0 quando todas devolvem
 * o mesmo conjunto de domínios, 1 quando não dividem nenhum.
 */
export function lensDivergenceOf(observations: readonly SerpCompetitiveObservation[]): number {
  const porLente = new Map<string, Set<string>>();
  for (const item of observations) {
    const atual = porLente.get(item.lens) || new Set<string>();
    for (const domain of item.competitorDomains) atual.add(domain);
    porLente.set(item.lens, atual);
  }
  const lentes = [...porLente.values()].filter(conjunto => conjunto.size > 0);
  if (lentes.length < 2) return 0;

  const distancias: number[] = [];
  for (let esquerda = 0; esquerda < lentes.length; esquerda += 1) {
    for (let direita = esquerda + 1; direita < lentes.length; direita += 1) {
      const a = lentes[esquerda];
      const b = lentes[direita];
      const comuns = [...a].filter(domain => b.has(domain)).length;
      const uniao = new Set([...a, ...b]).size;
      distancias.push(uniao ? 1 - comuns / uniao : 0);
    }
  }
  return distancias.reduce((total, item) => total + item, 0) / distancias.length;
}

/**
 * Mede a força competitiva de cada candidata, comparando-as ENTRE SI.
 *
 * "Compete de verdade" não é uma propriedade isolada: é a keyword cujo top
 * orgânico se sobrepõe ao das outras — ou seja, a que disputa o mesmo universo
 * — e que se sustenta em mais de uma lente. Keyword que só aparece forte num
 * dispositivo é evidência fraca, e o produto pediu explicitamente para não
 * formar grupos fracos.
 */
export function measureCompetitiveStrength(input: {
  observations: readonly SerpCompetitiveObservation[];
  thresholds?: SiloStrengthThresholds;
}): KeywordCompetitiveStrength[] {
  const limiares = input.thresholds || DEFAULT_SILO_STRENGTH;
  const porKeyword = new Map<string, SerpCompetitiveObservation[]>();
  for (const observation of input.observations) {
    porKeyword.set(observation.keywordId, [...(porKeyword.get(observation.keywordId) || []), observation]);
  }

  const dominiosDe = (keywordId: string) => unico(
    (porKeyword.get(keywordId) || []).flatMap(item => item.competitorDomains),
  );
  const todos = [...porKeyword.keys()];

  return todos.map(keywordId => {
    const observacoes = porKeyword.get(keywordId) || [];
    const meus = dominiosDe(keywordId);
    /*
     * Sobreposição contra as OUTRAS candidatas, não contra si mesma: é ela que
     * diz "estas duas keywords disputam o mesmo universo".
     */
    const alheios = new Set(todos.filter(outro => outro !== keywordId).flatMap(dominiosDe));
    const competitorOverlap = meus.filter(domain => alheios.has(domain)).length;

    const devicesObserved = unico(observacoes.map(item => item.lens)).length;
    const lentesQueSustentam = unico(
      observacoes
        .filter(item => item.organicCount >= limiares.minOrganicCount
          && item.competitorDomains.some(domain => alheios.has(domain)))
        .map(item => item.lens),
    );
    const devicesAgreeing = lentesQueSustentam.length;

    const lensDivergence = lensDivergenceOf(observacoes);
    /*
     * Lente que sustenta a keyword ENQUANTO devolve um universo diferente das
     * outras. É o caso do mobile que troca o top por vídeo e mesmo assim
     * mantém os mesmos concorrentes: a disputa sobreviveu à mudança de
     * contexto, o que é mais forte do que repetir a mesma SERP quatro vezes.
     */
    const lentesParaDobra = limiares.minLensesForDivergenceCredit ?? MIN_LENSES_FOR_DIVERGENCE_CREDIT;
    /*
     * Lentes de DATAS DIFERENTES (mais de 7 dias) não provam que o universo
     * muda entre dispositivos: a diferença pode ser só o tempo. A divergência
     * delas não conta em dobro, e isso é dito na nota.
     */
    const datasDasLentes = lensDatesSpreadDays(observacoes);
    const datasDivergem = datasDasLentes > SERP_LENS_DATES_DIVERGE_DAYS;
    const creditoDaDivergencia = lensDivergence >= limiares.minLensDivergenceToCount && devicesObserved >= lentesParaDobra && !datasDivergem;
    const divergentLensesHolding = creditoDaDivergencia ? devicesAgreeing : 0;

    const featureBreadth = unico(observacoes.flatMap(item => item.itemTypes)).length;
    const questions = unico(observacoes.flatMap(item => item.questions));
    const commercial = observacoes.some(item => item.commercialSignals);

    /*
     * A CONCORDÂNCIA EFETIVA — uma leitura só para as quatro lentes.
     *
     * Exigir que duas lentes concordem quando o próprio Google entrega
     * universos diferentes em cada dispositivo seria exigir o impossível, e
     * reprovaria justamente as buscas mais sensíveis a contexto. Quando a
     * divergência é alta, sustentar-se numa lente divergente conta como a
     * evidência que é. Agrupar por dispositivo partiria o mesmo universo em
     * quatro; isto mantém um universo só e registra a diferença.
     */
    const effectiveAgreement = devicesAgreeing + divergentLensesHolding;

    const reasons: string[] = [];
    if (competitorOverlap < limiares.minCompetitorOverlap) {
      reasons.push(`divide só ${competitorOverlap} domínio(s) com as demais candidatas; o mínimo é ${limiares.minCompetitorOverlap}.`);
    }
    if (effectiveAgreement < limiares.minDevicesAgreeing) {
      reasons.push(`se sustenta em ${devicesAgreeing} de ${devicesObserved} lente(s) observada(s); o mínimo é ${limiares.minDevicesAgreeing}.`);
    }
    if (!observacoes.length) reasons.push("nenhuma SERP observada para esta keyword.");

    /*
     * A nota é soma declarada, não peso oculto: sobreposição pesa mais porque
     * é ela que prova disputa pelo mesmo universo; concordância entre lentes
     * confirma que a disputa não é acidente de um dispositivo; sustentar-se em
     * lente divergente é robustez; amplitude de blocos indica universo rico o
     * bastante para virar Silo.
     */
    const score = competitorOverlap * 3 + devicesAgreeing * 2 + divergentLensesHolding * 2 + featureBreadth;

    return {
      keywordId, competitorOverlap, devicesObserved, devicesAgreeing,
      lensDivergence, divergentLensesHolding,
      featureBreadth, questions, commercial, score,
      strong: reasons.length === 0,
      reasons,
      lensNote: devicesObserved < 2
        ? "Uma lente só observada: não há como saber se o universo muda entre dispositivos."
        : lensDivergence >= limiares.minLensDivergenceToCount
          ? `O universo MUDA entre dispositivos (divergência ${lensDivergence.toFixed(2)}); a keyword se sustenta em ${devicesAgreeing} de ${devicesObserved} lente(s) mesmo assim.${creditoDaDivergencia
            ? ""
            : datasDivergem
              ? ` Lentes de datas diferentes (${datasDasLentes} dias): a divergência pode ser só o tempo e não conta em dobro.`
              : ` Com ${devicesObserved} lentes observadas a divergência não conta em dobro: o mínimo é ${lentesParaDobra}.`}`
          : `As ${devicesObserved} lentes devolvem praticamente o mesmo universo (divergência ${lensDivergence.toFixed(2)}).${datasDivergem ? ` Lentes de datas diferentes (${datasDasLentes} dias).` : ""}`,
      lensDatesSpreadDays: datasDasLentes,
    };
  }).sort((esquerda, direita) => direita.score - esquerda.score || esquerda.keywordId.localeCompare(direita.keywordId));
}

/* ------------------------------- a eleição ------------------------------- */

export type PrimaryKeywordElection =
  | {
      state: "ELECTED";
      primary: TerritoryPrimaryKeyword;
      reason: string;
      /**
       * Outra origem apontou para uma keyword DIFERENTE — e isso não some.
       *
       * O fato publicado vence a evidência de SERP, mas a discordância é
       * informação: é ela que vira proposta de substituição da primária, para
       * uma pessoa decidir. Descartá-la em silêncio esconderia justamente o
       * caso que o produto pediu para enxergar.
       */
      dissent?: { electedBy: TerritoryPrimaryKeyword["electedBy"]; keywordId: string; note: string };
    }
  | { state: "REFUSED"; reason: string; blockers: string[] };

export type PublishedSiloDeclaration =
  | {
      state: "FOUND";
      keywordId: string;
      label: string;
      declaration: Extract<EditorialUnitDeclaration, { source: "published" }>;
    }
  | { state: "REFUSED"; reason: string; blockers: string[] };

/**
 * ORIGEM 2 — QUEM a declaração aponta como Silo. Sem carimbo de tempo.
 *
 * O "quem" está separado do "quando" de propósito. A proposta operacional é
 * DERIVADA: recalcular o mesmo cenário precisa dar exatamente a mesma
 * proposta, e um `electedAt` recalculado a cada render faria a mesma proposta
 * parecer diferente de si mesma. Aqui fica a decisão; o carimbo é dado na
 * materialização, que é onde existe escrita.
 *
 * Nenhuma chamada de provider, nenhuma heurística: a keyword publicada cujo
 * [Vínculo] diz `unit: "silo"` É a primária. Se nenhuma declara Silo, isto
 * RECUSA em vez de escolher a "mais parecida".
 */
export function selectPublishedSiloDeclaration(
  keywords: readonly { keywordId: string; declaration?: EditorialUnitDeclaration; label?: string }[],
): PublishedSiloDeclaration {
  const publicadas = keywords.filter(item => item.declaration?.source === "published");
  const silos = publicadas.filter(item => item.declaration?.source === "published" && item.declaration.unit === "silo");

  if (!silos.length) {
    return {
      state: "REFUSED",
      reason: publicadas.length
        ? "Nenhuma das keywords publicadas foi declarada como Silo pelo Minerador."
        : "Nenhuma keyword publicada neste conjunto: não há declaração a ler.",
      blockers: ["NO_PUBLISHED_SILO_DECLARATION"],
    };
  }
  if (silos.length > 1) {
    /*
     * Duas páginas publicadas declaradas como Silo são DOIS Silos, não uma
     * ambiguidade a resolver aqui. Cada uma tem endereço próprio, e fundi-las
     * num território só apagaria uma estrutura que já está no ar.
     */
    return {
      state: "REFUSED",
      reason: `${silos.length} páginas publicadas declaram ser Silo: cada uma é um Silo próprio, com seu endereço.`,
      blockers: silos.map(item => `MULTIPLE_PUBLISHED_SILOS:${item.keywordId}`),
    };
  }

  const eleita = silos[0];
  return {
    state: "FOUND",
    keywordId: eleita.keywordId,
    label: eleita.label || eleita.keywordId,
    declaration: eleita.declaration as Extract<EditorialUnitDeclaration, { source: "published" }>,
  };
}

/** O carimbo de QUANDO, aplicado sobre a declaração já selecionada. */
export function stampPublishedPrimary(
  found: Extract<PublishedSiloDeclaration, { state: "FOUND" }>,
  electedAt: string,
): TerritoryPrimaryKeyword {
  return {
    electedBy: "published_declaration",
    keywordId: found.keywordId,
    url: found.declaration.url,
    canonical: found.declaration.canonical,
    electedAt,
  };
}

/**
 * ORIGEM 2 — a declaração já decidiu; isto só lê e carimba.
 *
 * Uma autoridade só: quem decide é `selectPublishedSiloDeclaration`. Esta
 * função existe para quem precisa da eleição pronta, com hora.
 */
export function electPrimaryFromPublishedDeclaration(input: {
  keywords: readonly { keywordId: string; declaration?: EditorialUnitDeclaration; label?: string }[];
  electedAt: string;
}): PrimaryKeywordElection {
  const selecionada = selectPublishedSiloDeclaration(input.keywords);
  if (selecionada.state === "REFUSED") {
    return { state: "REFUSED", reason: selecionada.reason, blockers: selecionada.blockers };
  }
  return {
    state: "ELECTED",
    primary: stampPublishedPrimary(selecionada, input.electedAt),
    reason: `"${selecionada.label}" já está publicada e o Minerador a declarou como Silo.`,
  };
}

/**
 * ORIGEM 1 — a SERP elege entre as candidatas.
 *
 * Vence a de maior força competitiva, desde que ela seja FORTE pelos limiares.
 * Sem candidata forte, isto recusa e diz o que faltou em cada uma — porque o
 * produto pediu para não formar Silo sem evidência, e uma eleição por falta de
 * concorrente melhor é exatamente isso.
 */
export function electPrimaryFromSerp(input: {
  strengths: readonly KeywordCompetitiveStrength[];
  labels?: ReadonlyMap<string, string>;
  electedAt: string;
}): PrimaryKeywordElection {
  const fortes = input.strengths.filter(item => item.strong);
  if (!fortes.length) {
    return {
      state: "REFUSED",
      reason: "Nenhuma candidata tem evidência de SERP suficiente para liderar o Silo.",
      blockers: input.strengths.map(item =>
        `${input.labels?.get(item.keywordId) || item.keywordId}: ${item.reasons.join(" ")}`),
    };
  }

  const vencedora = fortes[0];
  const segunda = fortes[1];
  const nome = input.labels?.get(vencedora.keywordId) || vencedora.keywordId;
  return {
    state: "ELECTED",
    primary: {
      electedBy: "serp",
      keywordId: vencedora.keywordId,
      evidence: {
        competitorOverlap: vencedora.competitorOverlap,
        devicesAgreeing: vencedora.devicesAgreeing,
        devicesObserved: vencedora.devicesObserved,
        score: vencedora.score,
      },
      electedAt: input.electedAt,
    },
    reason: segunda
      ? `"${nome}" lidera: divide ${vencedora.competitorOverlap} domínio(s) do universo e se sustenta em ${vencedora.devicesAgreeing}/${vencedora.devicesObserved} lente(s) — à frente da segunda colocada.`
      : `"${nome}" é a única candidata com evidência de SERP suficiente para liderar o Silo.`,
  };
}

/** ORIGEM 3 — a pessoa elege, e o motivo dela fica no acervo. */
export function electPrimaryByHuman(input: {
  keywordId: string;
  actorUserId: string;
  reason: string;
  electedAt: string;
}): PrimaryKeywordElection {
  if (!input.keywordId.trim() || !input.actorUserId.trim() || !input.reason.trim()) {
    return {
      state: "REFUSED",
      reason: "A eleição manual exige keyword, ator e motivo: sem os três não há decisão registrável.",
      blockers: ["INCOMPLETE_HUMAN_ELECTION"],
    };
  }
  return {
    state: "ELECTED",
    primary: {
      electedBy: "human",
      keywordId: input.keywordId,
      actorUserId: input.actorUserId,
      reason: input.reason,
      electedAt: input.electedAt,
    },
    reason: "Primária do Silo eleita por decisão humana.",
  };
}

/**
 * A primária do Silo em uma frase, com a ORIGEM sempre dita.
 *
 * Quem lê a mesa precisa saber se aquela identidade veio de uma página no ar,
 * de evidência de SERP ou de uma decisão humana: as três valem, e valem por
 * motivos diferentes. Esconder a origem faria as três parecerem a mesma coisa.
 */
export function describeSiloPrimaryKeyword(
  primary: TerritoryPrimaryKeyword | null | undefined,
  label?: string | null,
): string {
  if (!primary) return "Este Silo ainda não tem keyword primária eleita.";
  const nome = label?.trim() || primary.keywordId;
  if (primary.electedBy === "published_declaration") {
    return `Primária "${nome}" — declarada Silo pelo site${primary.url ? ` (${primary.url})` : ""}.`;
  }
  if (primary.electedBy === "serp") {
    // A proposta aceita diz que foi aceita: a SERP propôs, uma pessoa decidiu.
    const aceite = primary.confirmedBy ? " Proposta aceita por decisão humana." : "";
    return `Primária "${nome}" — eleita pela SERP: ${primary.evidence.competitorOverlap} domínio(s) do universo em ${primary.evidence.devicesAgreeing}/${primary.evidence.devicesObserved} lente(s).${aceite}`;
  }
  return `Primária "${nome}" — decisão humana: ${primary.reason}`;
}

/**
 * A DECLARAÇÃO VENCE A SERP — e a precedência é dita, não escondida.
 *
 * Quando há página publicada declarada como Silo, ela é fato observado no site;
 * a SERP é evidência sobre o que ainda não existe. Eleger por SERP por cima de
 * uma estrutura no ar criaria um segundo Silo para o mesmo universo.
 */
export function electSiloPrimaryKeyword(input: {
  published: PrimaryKeywordElection | null;
  serp: PrimaryKeywordElection | null;
  human: PrimaryKeywordElection | null;
}): PrimaryKeywordElection {
  const ordem = [input.human, input.published, input.serp];
  const vencedora = ordem.find(item => item?.state === "ELECTED");

  if (vencedora?.state === "ELECTED") {
    /*
     * A primeira origem eleita vence; as outras que apontaram para keyword
     * DIFERENTE viram discordância registrada. É daqui que nasce a proposta de
     * trocar a primária de uma página publicada — com a pessoa decidindo.
     */
    const discordante = ordem.find(item =>
      item?.state === "ELECTED" && item !== vencedora && item.primary.keywordId !== vencedora.primary.keywordId);

    if (discordante?.state === "ELECTED") {
      return {
        ...vencedora,
        dissent: {
          electedBy: discordante.primary.electedBy,
          keywordId: discordante.primary.keywordId,
          note: discordante.reason,
        },
      };
    }
    return vencedora;
  }
  const recusas = ordem
    .filter((item): item is Extract<PrimaryKeywordElection, { state: "REFUSED" }> => item?.state === "REFUSED");
  return {
    state: "REFUSED",
    reason: recusas.length
      ? recusas.map(item => item.reason).join(" ")
      : "Nenhuma origem apresentou evidência para eleger a primária do Silo.",
    blockers: recusas.flatMap(item => item.blockers),
  };
}

/* ------------------ ORIGEM 1 · a proposta da SERP (A9) -------------------- */

/**
 * Onde a proposta da SERP está diante do que o Silo já tem.
 *
 *   PROPOSED      a SERP elegeu e não há primária humana nem publicada à
 *                 frente: a pessoa pode aceitar.
 *   CONCURS       a SERP elegeu a mesma keyword que já é a primária.
 *   DISSENT_ONLY  a SERP elegeu outra keyword, mas a primária atual é humana
 *                 ou publicada: a discordância fica visível e nada se aplica
 *                 por aqui (humano > publicado > SERP; AGENTS §11).
 *   REFUSED       nenhuma candidata compete de verdade: nada é proposto.
 *   NO_EVIDENCE   nenhuma SERP das candidatas foi lida ainda.
 *   OUT_OF_ORIGIN o Silo não é lista nova (publicado, existente ou de origem
 *                 desconhecida): a leitura da SERP aparece, nenhuma decisão
 *                 é aberta e nada pode ser aceito por aqui.
 */
export type SiloPrimarySerpProposalState = "PROPOSED" | "CONCURS" | "DISSENT_ONLY" | "REFUSED" | "NO_EVIDENCE" | "OUT_OF_ORIGIN";

export type SiloPrimarySerpProposal = {
  state: SiloPrimarySerpProposalState;
  /**
   * SEMPRE pendente quando há o que decidir. Esta função nunca devolve uma
   * decisão confirmada: quem confirma é uma pessoa, pela porta do aceite.
   */
  decision: PrimaryKeywordDecision | null;
  /** A keyword que a SERP propõe, com a evidência. Não é uma primária: não tem carimbo. */
  proposed: { keywordId: string; label: string; evidence: SerpPrimaryEvidence } | null;
  current: { keywordId: string; label: string; electedBy: TerritoryPrimaryKeyword["electedBy"] } | null;
  /** Só `PROPOSED` pode ser aceita — e só por uma pessoa. */
  canAccept: boolean;
  blockers: string[];
  reason: string;
  /** Uma linha para a mesa: lentes, sustentação da proposta e datas. */
  summary: string;
  strengths: KeywordCompetitiveStrength[];
  /** A ordem das candidatas pela nota, com o texto de cada uma, para a mesa. */
  ranking: { keywordId: string; label: string; score: number; strong: boolean; devicesAgreeing: number; devicesObserved: number }[];
  lenses: {
    /** Lentes observadas nas candidatas, na ordem do produto. */
    observed: string[];
    requested: number;
    /** Candidatas sem nenhuma SERP lida: não entram na eleição. */
    candidatesWithoutSerp: string[];
    /** Maior diferença de datas entre as lentes de uma mesma candidata. */
    spreadDays: number;
    datesDiverge: boolean;
  };
};

/** A proposta é derivada: nenhuma hora entra nela. O carimbo nasce no aceite. */
const PROPOSTA_SEM_CARIMBO = "proposta-sem-carimbo";

const ordemDaLente = (lens: string) => {
  const indice = (SERP_LENS_LABELS as readonly string[]).indexOf(lens);
  return indice < 0 ? SERP_LENS_LABELS.length : indice;
};

/**
 * ORIGEM 1 · LISTA NOVA — a SERP das quatro lentes PROPÕE a primária do Silo.
 *
 * Mede a força competitiva das candidatas entre si (`measureCompetitiveStrength`)
 * com as observações das lentes que o cache já tem, elege pela mesma regra de
 * sempre (`electPrimaryFromSerp`) e passa a eleição pela precedência
 * (`electSiloPrimaryKeyword`): humano > publicado > SERP.
 *
 * O resultado é PROPOSTA. Nada aqui grava `primaryKeyword`: a proposta não tem
 * carimbo de tempo nem ator, e o território só a recebe pelo aceite explícito
 * (`acceptSerpPrimaryProposal`, no servidor). Sem candidata forte, a recusa diz
 * o que faltou em cada uma — nada é eleito por falta de concorrente melhor.
 */
export function proposeSiloPrimaryFromSerp(input: {
  current: TerritoryPrimaryKeyword | null | undefined;
  /** `volumeSearch` só pesa contra primária publicada (folga de volume). */
  candidates: readonly { keywordId: string; label?: string | null; volumeSearch?: number | null }[];
  observations: readonly SerpCompetitiveObservation[];
  /**
   * O posto da keyword primária atual no Minerador (`locked`, `revisable`…).
   * Só pesa quando a primária atual é publicada: travada, a proposta é
   * mostrada com o bloqueio dito.
   */
  currentPolicy?: string | null;
  /**
   * A origem do Silo (publicado? existente?), do território gravado. A
   * eleição pela SERP é da lista nova: fora dela a SERP só informa. `null`
   * (não se sabe) fecha, como no servidor, que relê a linha no aceite.
   */
  territory: SerpPrimaryTerritoryOrigin | null;
  /** Folga de volume exigida do desafiante de primária publicada (padrão 1,5x). */
  minVolumeRatio?: number;
  requestedLenses?: number;
  thresholds?: SiloStrengthThresholds;
}): SiloPrimarySerpProposal {
  const rotulos = new Map<string, string>();
  const volumes = new Map<string, number | null>();
  for (const candidata of input.candidates) {
    rotulos.set(candidata.keywordId, candidata.label?.trim() || candidata.keywordId);
    volumes.set(candidata.keywordId, typeof candidata.volumeSearch === "number" && Number.isFinite(candidata.volumeSearch) ? candidata.volumeSearch : null);
  }
  const atual = input.current ?? null;
  const rotuloDe = (keywordId: string) => rotulos.get(keywordId) || keywordId;

  // Só as candidatas DESTE Silo entram: observação de fora não vota.
  const observacoes = input.observations.filter(item => rotulos.has(item.keywordId));
  const strengths = measureCompetitiveStrength({ observations: observacoes, thresholds: input.thresholds });
  const comSerp = new Set(observacoes.map(item => item.keywordId));
  const spreadDays = lensDatesSpreadDays(observacoes);
  const lenses = {
    observed: unico(observacoes.map(item => item.lens)).sort((a, b) => ordemDaLente(a) - ordemDaLente(b)),
    requested: input.requestedLenses ?? SERP_LENS_LABELS.length,
    candidatesWithoutSerp: [...rotulos.keys()].filter(keywordId => !comSerp.has(keywordId)).map(rotuloDe),
    spreadDays,
    datesDiverge: spreadDays > SERP_LENS_DATES_DIVERGE_DAYS,
  };
  const current = atual ? { keywordId: atual.keywordId, label: rotuloDe(atual.keywordId), electedBy: atual.electedBy } : null;

  const lentesTexto = lenses.observed.length >= lenses.requested
    ? `SERP · ${lenses.requested} lentes`
    : `SERP · ${lenses.observed.length} de ${lenses.requested} lentes`;
  const datasTexto = lenses.datesDiverge ? ` · lentes de datas diferentes (${spreadDays} dias)` : "";
  const semSerpTexto = lenses.candidatesWithoutSerp.length
    ? ` ${lenses.candidatesWithoutSerp.length} candidata(s) sem SERP lida não entram na eleição: ${lenses.candidatesWithoutSerp.map(item => `"${item}"`).join(", ")}.`
    : "";
  const ranking = strengths.map(forca => ({
    keywordId: forca.keywordId,
    label: rotuloDe(forca.keywordId),
    score: forca.score,
    strong: forca.strong,
    devicesAgreeing: forca.devicesAgreeing,
    devicesObserved: forca.devicesObserved,
  }));
  const base = { strengths, ranking, lenses, current };

  if (!observacoes.length) {
    return {
      ...base,
      state: "NO_EVIDENCE",
      decision: null,
      proposed: null,
      canAccept: false,
      blockers: ["NO_SERP_OBSERVATIONS"],
      reason: "Nenhuma SERP das candidatas deste Silo foi lida ainda: sem ela, a eleição seria palpite.",
      summary: `SERP · 0 de ${lenses.requested} lentes`,
    };
  }

  const eleicao = electPrimaryFromSerp({ strengths, labels: rotulos, electedAt: PROPOSTA_SEM_CARIMBO });
  if (eleicao.state === "REFUSED") {
    return {
      ...base,
      state: "REFUSED",
      decision: null,
      proposed: null,
      canAccept: false,
      blockers: eleicao.blockers,
      reason: `${eleicao.reason}${current ? ` A primária atual ("${current.label}") continua como está.` : " Nenhuma primária é eleita por falta de concorrente melhor."}${semSerpTexto}`,
      summary: `${lentesTexto}${datasTexto}`,
    };
  }

  const eleita = eleicao.primary;
  const evidence: SerpPrimaryEvidence = eleita.electedBy === "serp"
    ? eleita.evidence
    : { competitorOverlap: 0, devicesAgreeing: 0, devicesObserved: 0, score: 0 };
  const proposed = { keywordId: eleita.keywordId, label: rotuloDe(eleita.keywordId), evidence };
  const summary = `${lentesTexto} · "${proposed.label}" se sustenta em ${evidence.devicesAgreeing}/${evidence.devicesObserved} lente(s)${datasTexto}`;

  /*
   * A PRECEDÊNCIA É A DE SEMPRE — uma autoridade só.
   *
   * A primária atual entra na origem dela: humana como humana, publicada como
   * publicada. Uma primária de SERP já aceita não vai para a disputa: ela é o
   * `previousKeywordId` da proposta nova, que também só vale com aceite.
   */
  const comoEleicao = (primaria: TerritoryPrimaryKeyword): PrimaryKeywordElection => ({
    state: "ELECTED",
    primary: primaria,
    reason: describeSiloPrimaryKeyword(primaria, rotuloDe(primaria.keywordId)),
  });
  const vencedora = electSiloPrimaryKeyword({
    human: atual?.electedBy === "human" ? comoEleicao(atual) : null,
    published: atual?.electedBy === "published_declaration" ? comoEleicao(atual) : null,
    serp: eleicao,
  });

  if (atual && atual.keywordId === proposed.keywordId) {
    return {
      ...base,
      state: "CONCURS",
      decision: null,
      proposed,
      canAccept: false,
      blockers: [],
      reason: `A SERP confirma a primária atual: "${proposed.label}" lidera as candidatas.${semSerpTexto}`,
      summary,
    };
  }

  const decisao = (reason: string): PrimaryKeywordDecision => ({
    status: "pending",
    ...(atual ? { previousKeywordId: atual.keywordId } : {}),
    selectedKeywordId: proposed.keywordId,
    reason,
  });

  if (vencedora.state === "ELECTED" && vencedora.primary.electedBy !== "serp") {
    const publicada = vencedora.primary.electedBy === "published_declaration";
    const travada = publicada && input.currentPolicy === "locked";
    if (publicada) {
      /*
       * DESAFIANTE DE PÁGINA PUBLICADA — a regra aprovada em 2026-09-20.
       *
       * Liderar a SERP das candidatas é a primeira exigência; a segunda é o
       * volume superar a primária publicada com a folga declarada
       * (`DEFAULT_SUBSTITUTION.minVolumeRatio`, a mesma de primary-substitution).
       * Sem as duas não há desafiante: a leitura aparece, nenhuma decisão abre.
       * Volume ausente não vira zero.
       */
      const razao = input.minVolumeRatio ?? DEFAULT_SUBSTITUTION.minVolumeRatio;
      const volumeAtual = current ? volumes.get(current.keywordId) ?? null : null;
      const volumeProposto = volumes.get(proposed.keywordId) ?? null;
      const semVolume = volumeAtual === null || volumeProposto === null;
      const semFolga = !semVolume && volumeProposto! < volumeAtual! * razao;
      if (semVolume || semFolga) {
        const motivo = semVolume
          ? `A SERP aponta "${proposed.label}", mas sem o volume das duas keywords não há como comparar com a primária publicada "${current?.label}": a primária publicada permanece e nenhuma decisão é aberta.`
          : `A SERP aponta "${proposed.label}", mas o volume (${volumeProposto}) não supera o de "${current?.label}" (${volumeAtual}) com a folga de ${razao}x exigida para mexer em página publicada: a primária publicada permanece e nenhuma decisão é aberta.`;
        return {
          ...base,
          state: "DISSENT_ONLY",
          decision: null,
          proposed,
          canAccept: false,
          blockers: [
            "PUBLISHED_PRIMARY_PREVAILS",
            semVolume ? "SUBSTITUTION_VOLUME_MISSING" : "SUBSTITUTION_VOLUME_NOT_MET",
            ...(travada ? ["PRIMARY_POLICY_LOCKED"] : []),
          ],
          reason: `${motivo}${semSerpTexto}`,
          summary,
        };
      }
    }
    const motivo = publicada
      ? `A SERP aponta "${proposed.label}", mas a primária "${current?.label}" vem da página publicada: a discordância fica registrada para decisão humana e nada é trocado por aqui.`
      : `A SERP aponta "${proposed.label}", mas a primária "${current?.label}" foi eleita por decisão humana registrada: a discordância fica visível e a decisão humana prevalece.`;
    return {
      ...base,
      state: "DISSENT_ONLY",
      decision: decisao(motivo),
      proposed,
      canAccept: false,
      blockers: [
        publicada ? "PUBLISHED_PRIMARY_PREVAILS" : "HUMAN_PRIMARY_PREVAILS",
        ...(travada ? ["PRIMARY_POLICY_LOCKED"] : []),
      ],
      reason: `${motivo}${semSerpTexto}`,
      summary,
    };
  }

  /*
   * SÓ A LISTA NOVA ELEGE PELA SERP.
   *
   * Sem primária humana nem publicada à frente, um Silo publicado, existente
   * ou de origem desconhecida ainda não é lista nova: a primária dele vem da
   * declaração ou do Silo canônico. A leitura da SERP aparece, sem decisão.
   */
  const foraDaOrigem = serpPrimaryOriginRefusal(input.territory);
  if (foraDaOrigem) {
    return {
      ...base,
      state: "OUT_OF_ORIGIN",
      decision: null,
      proposed,
      canAccept: false,
      blockers: [foraDaOrigem.code],
      reason: `A SERP aponta "${proposed.label}". ${foraDaOrigem.reason}${semSerpTexto}`,
      summary,
    };
  }

  const motivo = current
    ? `A SERP das candidatas propõe "${proposed.label}" no lugar de "${current.label}". A troca só acontece se você aceitar. ${eleicao.reason}`
    : `A SERP das candidatas propõe "${proposed.label}" como primária do Silo. Ela só vira primária se você aceitar. ${eleicao.reason}`;
  return {
    ...base,
    state: "PROPOSED",
    decision: decisao(motivo),
    proposed,
    canAccept: true,
    blockers: [],
    reason: `${motivo}${semSerpTexto}`,
    summary,
  };
}

/**
 * O que o navegador manda ao aceitar — só quando a proposta pode ser aceita.
 *
 * Sem ator e sem hora: os dois são do servidor. A primária atual vai junto
 * para o servidor recusar o aceite se ela mudou desde a proposta.
 */
export function serpPrimaryAcceptanceOf(proposal: SiloPrimarySerpProposal): SerpPrimaryAcceptance | null {
  if (!proposal.canAccept || proposal.state !== "PROPOSED" || !proposal.proposed) return null;
  return {
    keywordId: proposal.proposed.keywordId,
    previousKeywordId: proposal.current?.keywordId ?? null,
    evidence: proposal.proposed.evidence,
  };
}
