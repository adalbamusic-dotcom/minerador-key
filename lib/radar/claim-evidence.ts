/**
 * O QUE O ARTIGO VAI PRECISAR SUSTENTAR — afirmação por afirmação.
 *
 * Classificar o Article inteiro como YMYL resolve pouco. Um mesmo artigo de
 * skincare contém "qual textura é mais agradável" e "este ácido pode ser usado
 * na gravidez?" — a primeira é preferência, a segunda é decisão de saúde de uma
 * população sensível. Tratar as duas com a mesma régua obriga a escolher entre
 * exigir fonte primária para textura ou dispensá-la para gravidez.
 *
 * Por isso a granularidade é por AFIRMAÇÃO.
 *
 * E a régua não é o nicho. "Skincare" não torna nada YMYL; o que torna é a
 * CONSEQUÊNCIA do que se afirma: recomendar conduta, falar de segurança, de
 * risco, de uso, de população vulnerável. Uma definição sobre saúde exige menos
 * do que uma recomendação sobre saúde — e é isso que a classificação lê.
 *
 * Nenhuma afirmação aqui é copiada dos concorrentes: o que entra é o conceito
 * já agrupado e normalizado, não o parágrafo alheio.
 *
 * Domínio puro: sem fetch, sem storage, sem provider.
 */

import { radarSemanticNormalize } from "./semantic-concept-model.ts";
import { RadarYmylRelevanceSchema, type RadarYmylAssessment, type RadarYmylRelevance } from "./editorial-policy.ts";

import type { RadarSemanticConcept, RadarSemanticConceptModel } from "./semantic-concept-model.ts";

/* ============================ tipo de afirmação ========================== */

export type RadarClaimType =
  | "DEFINITION"
  | "FACT"
  | "CAUSE"
  | "EFFECT"
  | "SAFETY"
  | "RISK"
  | "RECOMMENDATION"
  | "USAGE"
  | "COMPARISON"
  | "BENEFIT"
  | "LIMITATION"
  | "EXPERT_OPINION";

export const RADAR_CLAIM_TYPE_LABEL: Record<RadarClaimType, string> = {
  DEFINITION: "Definição",
  FACT: "Fato",
  CAUSE: "Causa",
  EFFECT: "Efeito",
  SAFETY: "Segurança",
  RISK: "Risco",
  RECOMMENDATION: "Recomendação",
  USAGE: "Uso",
  COMPARISON: "Comparação",
  BENEFIT: "Benefício",
  LIMITATION: "Limitação",
  EXPERT_OPINION: "Opinião de especialista",
};

/*
 * A ORDEM PERGUNTA PRIMEIRO O QUE TEM MAIOR CONSEQUÊNCIA.
 *
 * "É seguro usar durante a gravidez?" é uso E segurança. Ler como uso apenas
 * rebaixaria a exigência de evidência de uma frase que decide conduta de uma
 * gestante. Segurança e risco vêm antes por isso, não por gosto de ordenação.
 */
const TIPOS: Array<{ type: RadarClaimType; pattern: RegExp }> = [
  { type: "SAFETY", pattern: /\b(seguro|segura|seguranca|pode usar|pode-se usar|e permitido|contraindicac|contra-indicac|gravidez|gestante|amamentac|lactante|crianca|bebe|infantil)\b/ },
  { type: "RISK", pattern: /\b(risco|riscos|perigo|efeito colateral|efeitos colaterais|reacao adversa|toxic|intoxicac|dano|prejudic|piora|agrava)\b/ },
  { type: "RECOMMENDATION", pattern: /\b(deve|deve-se|recomenda|recomendado|recomendac|indicado|ideal e|melhor opcao|evite|nao use|procure|consulte)\b/ },
  { type: "USAGE", pattern: /\b(como usar|como aplicar|modo de uso|frequencia|dosagem|quantidade|quantas vezes|passo a passo|aplicac)\b/ },
  { type: "LIMITATION", pattern: /\b(nao substitui|limitac|nem sempre|nao funciona|nao resolve|excec|apenas quando|somente se)\b/ },
  { type: "EXPERT_OPINION", pattern: /\b(segundo (o|a) (dermatolog|medic|especialista|nutricion)|de acordo com (o|a) (dermatolog|medic|especialista)|opiniao (do|da) especialista)\b/ },
  { type: "CAUSE", pattern: /\b(causa|causas|por que|porque|motivo|origem|provoca|desencadeia|leva a)\b/ },
  { type: "EFFECT", pattern: /\b(efeito|efeitos|resultado|resultados|consequenc|impacto|melhora|reduz|aumenta|diminui)\b/ },
  { type: "COMPARISON", pattern: /\b(versus|vs|diferenca entre|comparativo|melhor que|qual e melhor|ou )\b/ },
  { type: "BENEFIT", pattern: /\b(beneficio|beneficios|vantagem|vantagens|para que serve|serve para|ajuda a)\b/ },
  { type: "DEFINITION", pattern: /\b(o que e|o que sao|definic|significa|conceito de|caracteristica|sinais|tipos de)\b/ },
];

export function radarClaimType(text: string): { type: RadarClaimType; term: string | null } {
  const normalizado = radarSemanticNormalize(text);
  for (const item of TIPOS) {
    const encontrado = item.pattern.exec(normalizado);
    if (encontrado) return { type: item.type, term: encontrado[0] };
  }
  return { type: "FACT", term: null };
}

/* ======================= a consequência do que se diz ==================== */

/**
 * O QUE ACONTECE COM QUEM LÊ E ACREDITA.
 *
 * Uma definição errada desinforma. Uma recomendação de conduta errada muda o
 * que a pessoa faz com o próprio corpo, dinheiro ou segurança. A escada de
 * exigência sobe com a consequência, não com o assunto.
 */
const CONSEQUENCIA: Record<RadarClaimType, "HIGH" | "MEDIUM" | "LOW"> = {
  SAFETY: "HIGH",
  RISK: "HIGH",
  RECOMMENDATION: "HIGH",
  USAGE: "HIGH",
  EFFECT: "MEDIUM",
  CAUSE: "MEDIUM",
  LIMITATION: "MEDIUM",
  EXPERT_OPINION: "MEDIUM",
  DEFINITION: "LOW",
  FACT: "LOW",
  COMPARISON: "LOW",
  BENEFIT: "LOW",
};

/*
 * O DOMÍNIO DA DECISÃO — não o nicho do artigo.
 *
 * Estas listas descrevem áreas em que uma informação errada custa saúde,
 * dinheiro ou segurança. Elas não dizem "skincare é YMYL"; dizem "quando a
 * frase fala de medicamento, dosagem ou gravidez, a exigência sobe". A lista é
 * declarada de propósito: quando errar, dá para apontar a palavra e corrigir.
 */
const SAUDE = /\b(saude|doenc|sintoma|diagnostic|tratament|medicament|remedio|dosagem|efeito colateral|dermatit|acne|alergi|inflamac|infecc|cicatriz|hormon|imunolog|cancer|diabetes|gravidez|gestac|amamentac)\b/;
const FINANCEIRO = /\b(investiment|financiament|emprestim|credito|divida|imposto|tributar|aposentadoria|juros|rendiment|criptomoeda|seguro)\b/;
const SEGURANCA_JURIDICA = /\b(seguranc|juridic|advogad|lei |legislac|contrato|direito do consumidor|regulament|norma tecnica)\b/;
const POPULACAO_SENSIVEL = /\b(gravidez|gestante|grávida|amamentac|lactante|crianca|bebe|recem-nascido|idoso|imunossuprimid|diabetic|hipertens)\b/;

export type RadarClaimYmylAssessment = {
  relevance: RadarYmylRelevance;
  claimType: RadarClaimType;
  /** Os sinais que sustentam a classificação. Nada de veredicto sem prova. */
  signals: string[];
  reason: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  /** Público sensível mencionado eleva a exigência um degrau. */
  sensitivePopulation: boolean;
};

const ESCADA: RadarYmylRelevance[] = ["NONE", "LOW", "MATERIAL", "HIGH"];
const subirUmDegrau = (nivel: RadarYmylRelevance): RadarYmylRelevance =>
  ESCADA[Math.min(ESCADA.indexOf(nivel) + 1, ESCADA.length - 1)];

/**
 * A relevância YMYL DESTA afirmação.
 *
 * O artigo dá contexto, não veredito: um Article classificado como MATERIAL
 * não torna MATERIAL a frase sobre qual textura é mais agradável. O que decide
 * é o par (domínio da decisão × consequência da afirmação).
 */
export function assessRadarClaimYmyl(input: {
  text: string;
  articleYmyl?: RadarYmylAssessment | null;
}): RadarClaimYmylAssessment {
  const normalizado = radarSemanticNormalize(input.text);
  const { type } = radarClaimType(input.text);
  const consequencia = CONSEQUENCIA[type];

  const signals: string[] = [];
  if (SAUDE.test(normalizado)) signals.push("decisão sobre saúde ou corpo");
  if (FINANCEIRO.test(normalizado)) signals.push("decisão financeira");
  if (SEGURANCA_JURIDICA.test(normalizado)) signals.push("segurança, direito ou norma");
  const sensitivePopulation = POPULACAO_SENSIVEL.test(normalizado);

  /*
   * SEM DOMÍNIO DE DECISÃO, NÃO HÁ YMYL — por mais imperativa que seja a frase.
   *
   * "Qual textura é mais agradável" é comparação de preferência. Ela não deixa
   * de ser preferência porque o artigo em volta fala de pele.
   */
  if (!signals.length) {
    return {
      relevance: "NONE",
      claimType: type,
      signals: [],
      reason: `${RADAR_CLAIM_TYPE_LABEL[type]} sem domínio de decisão sensível: informação editorial, não decisão sobre saúde, dinheiro ou segurança.`,
      confidence: "MEDIUM",
      sensitivePopulation: false,
    };
  }

  const base: RadarYmylRelevance = consequencia === "HIGH" ? "HIGH" : consequencia === "MEDIUM" ? "MATERIAL" : "LOW";
  const relevance = sensitivePopulation ? subirUmDegrau(base) : base;
  if (sensitivePopulation) signals.push("população sensível mencionada");

  return {
    relevance,
    claimType: type,
    signals,
    reason: `${RADAR_CLAIM_TYPE_LABEL[type]} em ${signals[0]}${sensitivePopulation ? ", com população sensível" : ""}: ${consequencia === "HIGH" ? "a afirmação orienta conduta" : consequencia === "MEDIUM" ? "a afirmação explica mecanismo ou efeito" : "a afirmação descreve"}.`,
    /* Domínio e forma explícitos sustentam mais do que só um dos dois. */
    confidence: signals.length >= 2 || (signals.length === 1 && consequencia === "HIGH") ? "HIGH" : "MEDIUM",
    sensitivePopulation,
  };
}

/* ============================== a afirmação ============================== */

export type RadarClaimMarketObservation = {
  /** Quantas páginas comparáveis sustentam a afirmação. */
  competitors: number;
  sampleSize: number;
  recurrence: "STRONG" | "MODERATE" | "WEAK";
  queryCoverage: number;
  /** As páginas que a sustentam — procedência, não estatística solta. */
  supportingCompetitors: Array<{ pageId: string; url: string; heading: string }>;
  statement: string;
};

export type RadarEvidenceClaim = {
  claimId: string;
  /** A afirmação normalizada. Não é o parágrafo do concorrente. */
  canonicalClaim: string;
  conceptId: string;
  claimType: RadarClaimType;
  ymyl: RadarClaimYmylAssessment;
  market: RadarClaimMarketObservation;
  /** As fontes que os concorrentes citaram nas seções deste conceito. */
  observedSourceDomains: string[];
  confidence: "HIGH" | "MEDIUM" | "LOW";
  provenance: string;
};

const maioria = (amostra: number) => Math.max(2, Math.ceil(amostra / 2));

/** Identidade estável: o mesmo conceito produz a mesma afirmação entre execuções. */
function assinatura(valor: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < valor.length; index += 1) {
    hash ^= valor.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * Normalizar a afirmação, não reproduzi-la.
 *
 * O rótulo do conceito é um heading curto e já agrupado; tirar a interrogação
 * e a pontuação basta para virar uma afirmação legível. Nada de trecho longo,
 * nada de frase do concorrente copiada para dentro do nosso pacote.
 */
export function radarCanonicalClaim(text: string): string {
  return text.replace(/\s*[?!.:;]+\s*$/, "").trim();
}

export function buildRadarEvidenceClaims(input: {
  semantic: RadarSemanticConceptModel | null;
  articleYmyl?: RadarYmylAssessment | null;
  /** Domínios citados por página, quando o Gate 11 os observou. */
  sourcesByPage?: ReadonlyMap<string, string[]>;
}): RadarEvidenceClaim[] {
  const conceitos = input.semantic?.concepts || [];

  return conceitos
    /*
     * NEM TODO CONCEITO VIRA AFIRMAÇÃO.
     *
     * Um conceito visto numa página só não descreve o que o mercado afirma —
     * descreve o que uma página disse. Exigir sustentação factual dele geraria
     * trabalho de especialista sobre ruído.
     */
    .filter(concept => concept.sourceCount >= 2)
    .map((concept: RadarSemanticConcept): RadarEvidenceClaim => {
      const canonicalClaim = radarCanonicalClaim(concept.canonicalLabel);
      const ymyl = assessRadarClaimYmyl({ text: concept.canonicalLabel, articleYmyl: input.articleYmyl });
      const paginas = concept.supportingObservations.map(item => ({ pageId: item.pageId, url: item.url, heading: item.text }));
      const distintas = [...new Map(paginas.map(item => [item.pageId, item])).values()];
      const recurrence = concept.sourceCount >= maioria(concept.sampleSize)
        ? "STRONG" as const
        : concept.sourceCount > 2 ? "MODERATE" as const : "WEAK" as const;

      const dominios = [...new Set(distintas.flatMap(item => input.sourcesByPage?.get(item.pageId) || []))];

      return {
        claimId: `claim:${assinatura(`${concept.id}|${canonicalClaim}`)}`,
        canonicalClaim,
        conceptId: concept.id,
        claimType: ymyl.claimType,
        ymyl,
        market: {
          competitors: concept.sourceCount,
          sampleSize: concept.sampleSize,
          recurrence,
          queryCoverage: concept.queryCoverage,
          supportingCompetitors: distintas,
          statement: `${concept.sourceCount} de ${concept.sampleSize} concorrentes tratam de "${canonicalClaim}"${concept.queryCoverage > 1 ? `, encontrados por ${concept.queryCoverage} consultas` : ""}.`,
        },
        observedSourceDomains: dominios,
        confidence: concept.confidence,
        provenance: `Conceito ${concept.id} do modelo semântico, sustentado por ${distintas.length} página(s) comparável(is).`,
      };
    })
    .sort((left, right) => ESCADA.indexOf(right.ymyl.relevance) - ESCADA.indexOf(left.ymyl.relevance)
      || right.market.competitors - left.market.competitors);
}

/** As afirmações que exigem sustentação factual antes de serem reproduzidas. */
export const radarClaimNeedsFactualSupport = (claim: RadarEvidenceClaim) =>
  claim.ymyl.relevance === "MATERIAL" || claim.ymyl.relevance === "HIGH";

export const RadarClaimRelevanceSchema = RadarYmylRelevanceSchema;
