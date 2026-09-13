/**
 * AUTORIDADE E EVIDÊNCIA — o que o artigo vai precisar sustentar, e como.
 *
 * Esta camada junta o que a busca mostrou com o que a evidência factual
 * permite afirmar, e prepara o ponto em que um profissional entra.
 *
 * TRÊS DECISÕES DE MÉTODO, TODAS DELIBERADAS:
 *
 *   1. NÃO EXISTE NOTA DE E-E-A-T. Ninguém sabe calcular a nota que o Google
 *      dá, e fingir que sabe produz número bonito e falso. O que existe são
 *      SINAIS OBSERVÁVEIS, e cada um vem com o que foi visto e onde.
 *
 *   2. RECORRÊNCIA E VERDADE SÃO EIXOS SEPARADOS. Doze concorrentes repetirem
 *      uma afirmação é evidência forte sobre o MERCADO e nenhuma sobre o FATO.
 *      Os dois convivem, e quando divergem isso vira conflito registrado — não
 *      um dos lados apagado.
 *
 *   3. A SERP NÃO É CORRIGIDA. Se a fonte primária contradiz nove
 *      concorrentes, os nove continuam lá: "o mercado faz X" permanece
 *      verdadeiro como observação. O que muda é o que NÓS podemos afirmar como
 *      fato — e essa diferença é a oportunidade competitiva.
 *
 * O especialista não é ornamento. Cada ponto de revisão preparado aqui existe
 * porque há uma dúvida factual real, um conflito, ou experiência prática que a
 * amostra não oferece. "Especialista necessário" para pôr nome no artigo seria
 * usar a credencial de alguém como enfeite.
 *
 * Domínio puro: sem fetch, sem storage, sem provider.
 */

import { assertRadarEvidenceAuthority, resolveRadarEvidencePrecedence, radarSerpEvidenceStanding, type RadarEvidenceResolution, type RadarSerpStanding } from "./evidence-authority.ts";
import { radarClaimNeedsFactualSupport, RADAR_CLAIM_TYPE_LABEL, type RadarEvidenceClaim } from "./claim-evidence.ts";
import { radarSourceCanSupportFact, RADAR_SOURCE_AUTHORITY_LABEL, type RadarFactualEvidence, type RadarSourceClassification } from "./source-authority.ts";

import type { RadarExtractionPage } from "./analysis-contracts.ts";
import type { RadarYmylAssessment } from "./editorial-policy.ts";

/* ================================ E-E-A-T =============================== */

/**
 * O estado de um sinal — e por que não existe um número aqui.
 *
 * `DECLARED` é "a página diz que tem"; `SUPPORTED` é "há algo além da própria
 * afirmação"; `UNVERIFIED` é "escrito e não conferido"; `ABSENT` é "não
 * apareceu". Um crachá escrito na página não vira credencial só por estar
 * escrito, e nenhuma soma desses estados produz nota.
 */
export type RadarEeatSignalState = "SUPPORTED" | "DECLARED" | "UNVERIFIED" | "ABSENT";

export type RadarEeatDimension = "EXPERIENCE" | "EXPERTISE" | "AUTHORITATIVENESS" | "TRUST";

export type RadarEeatSignal = {
  dimension: RadarEeatDimension;
  key: string;
  label: string;
  state: RadarEeatSignalState;
  /** Em quantas páginas comparáveis o sinal foi observado. */
  pages: number;
  sampleSize: number;
  observation: string;
  provenance: string;
};

/* Sinais textuais de EXPERIÊNCIA vivida — relato, teste, método aplicado. */
const EXPERIENCIA = /\b(testamos|testei|usei|usamos|na pratica|na prática|em consultorio|em consultório|nossa experiencia|nossa experiência|acompanhamos|caso real|antes e depois|resultado observado)\b/i;
/*
 * Sinais de QUALIFICAÇÃO declarada — crachá escrito, não conferido.
 *
 * As abreviações terminam em ponto, e um `\b` depois do ponto não casa com
 * "Dra. Ana": limite de palavra exige caractere de palavra do outro lado, e ali
 * há espaço. Por isso elas ficam num grupo próprio, sem a âncora final.
 */
const CREDENCIAL = /(\b(dermatolog|medic|médic|nutricion|farmaceut|farmacêut|biomedic|enfermeir|especialista em)|\b(dr|dra)\.|\b(crm|crn|crf)\s*\d)/i;

/**
 * Os sinais que a amostra realmente mostrou.
 *
 * Contagem sobre o que a extração observou. Onde a extração não guarda o
 * suficiente para afirmar, o estado é `UNVERIFIED` e a limitação é declarada —
 * nunca `ABSENT` por falta de dado, que confundiria "não tem" com "não vimos".
 */
export function readRadarEeatSignalSet(input: {
  pages: readonly RadarExtractionPage[];
}): RadarEeatSignal[] {
  const pages = [...input.pages];
  const amostra = pages.length;
  const sinal = (
    dimension: RadarEeatDimension,
    key: string,
    label: string,
    quais: RadarExtractionPage[],
    state: RadarEeatSignalState,
    observation: string,
  ): RadarEeatSignal => ({
    dimension, key, label,
    state: quais.length ? state : "ABSENT",
    pages: quais.length,
    sampleSize: amostra,
    observation: quais.length ? observation : `Nenhuma das ${amostra} página(s) comparável(is) apresenta este sinal.`,
    provenance: quais.length ? `Observado na extração de ${quais.map(page => page.id).slice(0, 5).join(", ")}${quais.length > 5 ? "…" : ""}.` : "Ausência observada na amostra.",
  });

  const comRelato = pages.filter(page => EXPERIENCIA.test(`${page.introText} ${page.closingText} ${page.h2.join(" ")}`));
  const comCredencial = pages.filter(page => CREDENCIAL.test(`${page.author || ""} ${page.title} ${page.introText}`));
  const comAutoria = pages.filter(page => Boolean(page.author && page.author.trim()));
  const comOrganizacao = pages.filter(page => page.structuredDataTypes.some(tipo => /organization|medical|ngo/i.test(tipo)));
  const comFontes = pages.filter(page => page.externalLinkCount > 0);
  const comData = pages.filter(page => page.hasDates);
  const comPatrocinio = pages.filter(page => page.observedLinks.some(link => link.rel.includes("sponsored") || link.rel.includes("nofollow")));

  return [
    sinal("EXPERIENCE", "FIRSTHAND_ACCOUNT", "Relato de uso, teste ou prática", comRelato, "DECLARED",
      `${comRelato.length} de ${amostra} página(s) relatam prática, teste ou caso observado. Relato declarado — o Radar não verifica se aconteceu.`),
    sinal("EXPERTISE", "DECLARED_CREDENTIAL", "Credencial declarada", comCredencial, "DECLARED",
      `${comCredencial.length} de ${amostra} página(s) declaram credencial ou especialidade. Escrita na página, não conferida.`),
    sinal("EXPERTISE", "NAMED_AUTHOR", "Autoria identificada", comAutoria, "DECLARED",
      `${comAutoria.length} de ${amostra} página(s) identificam quem escreveu.`),
    sinal("AUTHORITATIVENESS", "RESPONSIBLE_ENTITY", "Entidade responsável em dados estruturados", comOrganizacao, "SUPPORTED",
      `${comOrganizacao.length} de ${amostra} página(s) declaram entidade responsável em dados estruturados.`),
    sinal("TRUST", "CITES_SOURCES", "Cita fontes externas", comFontes, "SUPPORTED",
      `${comFontes.length} de ${amostra} página(s) citam fonte externa.`),
    sinal("TRUST", "SHOWS_DATES", "Data de publicação ou atualização", comData, "SUPPORTED",
      `${comData.length} de ${amostra} página(s) expõem data.`),
    sinal("TRUST", "SPONSORED_DISCLOSURE", "Link patrocinado ou de afiliado sinalizado", comPatrocinio, "SUPPORTED",
      `${comPatrocinio.length} de ${amostra} página(s) marcam links como patrocinado ou nofollow. Sinal observado, não julgamento de intenção.`),
  ];
}

/* =========================== conflito mercado × fato ==================== */

export type RadarMarketVsFactConflict = {
  claimId: string;
  canonicalClaim: string;
  conflictType: "MARKET_VS_FACTUAL_EVIDENCE";
  marketObservation: string;
  factualPosition: string;
  /** A resolução pela hierarquia canônica — com os dois lados preservados. */
  resolution: RadarEvidenceResolution;
  impact: string;
};

/* ======================= preparação do especialista ===================== */

export type RadarSpecialistReviewKind =
  | "RESOLVE_FACTUAL_UNCERTAINTY"
  | "RESOLVE_CONFLICT"
  | "VERIFY_AND_ADD_EXPERIENCE";

export type RadarSpecialistReviewRequirement = {
  requirementId: string;
  claimId: string;
  topic: string;
  claim: string;
  kind: RadarSpecialistReviewKind;
  whyReviewIsNeeded: string;
  ymylRelevance: RadarEvidenceClaim["ymyl"]["relevance"];
  marketObservation: string;
  factualEvidence: string;
  conflict: string | null;
  /** A pergunta que chega ao profissional. Contexto, nunca folha em branco. */
  specificQuestion: string;
  sourceCandidates: string[];
  priority: "HIGH" | "MEDIUM" | "LOW";
  provenance: string;
};

/* =============================== a camada ============================== */

export type RadarAuthorityEvidence = {
  ymylAssessment: RadarYmylAssessment;
  claims: RadarEvidenceClaim[];
  sources: RadarSourceClassification[];
  factualEvidence: RadarFactualEvidence[];
  marketVsFactConflicts: RadarMarketVsFactConflict[];
  eeatSignals: RadarEeatSignal[];
  specialistReviewRequirements: RadarSpecialistReviewRequirement[];
  serpStanding: RadarSerpStanding;
  summary: {
    claimsNeedingSupport: number;
    claimsWellSupported: number;
    claimsWithEvidenceGap: number;
    sourcesByType: Array<{ type: string; label: string; count: number }>;
  };
  limitations: string[];
};

function assinatura(valor: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < valor.length; index += 1) {
    hash ^= valor.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * A PERGUNTA QUE O PROFISSIONAL RECEBE.
 *
 * "O que você acha sobre pele oleosa?" desperdiça o tempo de quem responde e
 * devolve nada aproveitável. A pergunta precisa carregar o que já sabemos: o
 * que o mercado afirma, o que a evidência mostra, e exatamente onde está a
 * dúvida. Quem responde então acrescenta o que só ele tem.
 */
function formularPergunta(input: {
  claim: RadarEvidenceClaim;
  kind: RadarSpecialistReviewKind;
  conflito: RadarMarketVsFactConflict | null;
  evidencias: RadarFactualEvidence[];
}): string {
  const assunto = input.claim.canonicalClaim;
  const mercado = input.claim.market.statement;

  if (input.kind === "RESOLVE_CONFLICT" && input.conflito) {
    return `${mercado} A evidência factual encontrada diz outra coisa: ${input.conflito.factualPosition} Na sua prática, como esta explicação deve ser apresentada ao leitor sem reproduzir a versão do mercado como se fosse consenso, e sem alarmar quem lê?`;
  }
  if (input.kind === "RESOLVE_FACTUAL_UNCERTAINTY") {
    return `${mercado} Não encontramos fonte adequada que sustente esta afirmação sobre "${assunto}". O que pode ser afirmado com segurança neste ponto, e o que precisa ser qualificado ou omitido?`;
  }
  const fonte = input.evidencias[0];
  return `${mercado} A evidência encontrada${fonte ? ` em ${fonte.sourceDomain}` : ""} sustenta a afirmação. Você confirma esta leitura para "${assunto}" e há algo da sua prática — nuance, exceção, erro comum de quem lê — que valha acrescentar?`;
}

export function buildRadarAuthorityEvidence(input: {
  ymyl: RadarYmylAssessment;
  claims: readonly RadarEvidenceClaim[];
  pages: readonly RadarExtractionPage[];
  sources?: readonly RadarSourceClassification[];
  factualEvidence?: readonly RadarFactualEvidence[];
  serp: { current: boolean; sufficient: boolean; valid: boolean };
}): RadarAuthorityEvidence {
  const claims = [...input.claims];
  const sources = [...(input.sources || [])];
  const factualEvidence = [...(input.factualEvidence || [])];
  const limitations: string[] = [];
  const serpStanding = radarSerpEvidenceStanding(input.serp);

  const porClaim = new Map<string, RadarFactualEvidence[]>();
  for (const evidencia of factualEvidence) {
    porClaim.set(evidencia.claimId, [...(porClaim.get(evidencia.claimId) || []), evidencia]);
  }

  /* ---------------------- conflito mercado × fato ------------------------ */

  const marketVsFactConflicts: RadarMarketVsFactConflict[] = [];
  for (const claim of claims) {
    const evidencias = porClaim.get(claim.claimId) || [];
    const contraria = evidencias.find(item => item.supportType === "CONTRADICTS" || item.supportType === "QUALIFIES");
    if (!contraria) continue;

    /*
     * A HIERARQUIA CANÔNICA DECIDE, E ELA NÃO APAGA NINGUÉM.
     *
     * Sobre VERDADE FACTUAL, fonte primária e especialista prevalecem sobre a
     * recorrência do mercado. Os nove concorrentes continuam registrados: o
     * que muda é o que podemos afirmar como fato, não o que o mercado faz.
     */
    const resolution = resolveRadarEvidencePrecedence({
      domain: "FACTUAL",
      claims: [
        { source: "CURRENT_SUFFICIENT_SERP", claim: claim.market.statement, provenance: claim.provenance },
        {
          source: radarSourceCanSupportFact(contraria.sourceType) ? "PRIMARY_FACTUAL_EVIDENCE" : "OTHER_RADAR_EVIDENCE",
          claim: contraria.evidenceSummary || `A fonte ${contraria.sourceDomain} ${contraria.supportType === "CONTRADICTS" ? "contradiz" : "condiciona"} a afirmação.`,
          provenance: contraria.provenance,
        },
      ],
    });
    assertRadarEvidenceAuthority(resolution);

    marketVsFactConflicts.push({
      claimId: claim.claimId,
      canonicalClaim: claim.canonicalClaim,
      conflictType: "MARKET_VS_FACTUAL_EVIDENCE",
      marketObservation: claim.market.statement,
      factualPosition: contraria.evidenceSummary || `${RADAR_SOURCE_AUTHORITY_LABEL[contraria.sourceType]} ${contraria.supportType === "CONTRADICTS" ? "contradiz" : "condiciona"} a afirmação.`,
      resolution,
      impact: contraria.supportType === "CONTRADICTS"
        ? "A afirmação recorrente no mercado não deve ser reproduzida como fato. A observação do mercado permanece — ela descreve o que os concorrentes fazem, não o que é verdade."
        : "A afirmação só se sustenta sob a condição que a fonte estabelece. Reproduzi-la sem a condição induziria o leitor ao erro.",
    });
  }

  /* ------------------- preparação do especialista ------------------------ */

  const specialistReviewRequirements: RadarSpecialistReviewRequirement[] = [];
  for (const claim of claims) {
    const evidencias = porClaim.get(claim.claimId) || [];
    const conflito = marketVsFactConflicts.find(item => item.claimId === claim.claimId) || null;
    const sustentada = evidencias.some(item => item.supportType === "SUPPORTS" && radarSourceCanSupportFact(item.sourceType));
    const exigeSustentacao = radarClaimNeedsFactualSupport(claim);

    /*
     * O ESPECIALISTA NÃO É ORNAMENTO.
     *
     * Só entra quem tem razão editorial: conflito a resolver, dúvida factual
     * real, ou uma afirmação sustentada que a prática pode qualificar. Criar
     * ponto de revisão para pôr nome no artigo seria usar a credencial de
     * alguém como enfeite.
     */
    let kind: RadarSpecialistReviewKind | null = null;
    let porque = "";
    if (conflito) {
      kind = "RESOLVE_CONFLICT";
      porque = "O mercado afirma uma coisa e a evidência factual encontrada diz outra. A decisão de como apresentar isso ao leitor exige julgamento profissional.";
    } else if (exigeSustentacao && !sustentada) {
      kind = "RESOLVE_FACTUAL_UNCERTAINTY";
      porque = `Afirmação de relevância ${claim.ymyl.relevance.toLowerCase()} com recorrência ${claim.market.recurrence.toLowerCase()} no mercado e sem fonte adequada que a sustente.`;
    } else if (exigeSustentacao && sustentada) {
      kind = "VERIFY_AND_ADD_EXPERIENCE";
      porque = "A afirmação tem sustentação factual. O que falta é a leitura prática: nuance, exceção e o erro comum de quem lê.";
    }
    if (!kind) continue;

    specialistReviewRequirements.push({
      requirementId: `specialist:${assinatura(`${claim.claimId}|${kind}`)}`,
      claimId: claim.claimId,
      topic: claim.canonicalClaim,
      claim: `${RADAR_CLAIM_TYPE_LABEL[claim.claimType]}: ${claim.canonicalClaim}`,
      kind,
      whyReviewIsNeeded: porque,
      ymylRelevance: claim.ymyl.relevance,
      marketObservation: claim.market.statement,
      factualEvidence: evidencias.length
        ? evidencias.map(item => `${item.sourceDomain} (${RADAR_SOURCE_AUTHORITY_LABEL[item.sourceType]}): ${item.supportType.toLowerCase()}`).join(" · ")
        : "Nenhuma fonte factual adequada foi encontrada para esta afirmação.",
      conflict: conflito ? `${conflito.marketObservation} ${conflito.factualPosition}` : null,
      specificQuestion: formularPergunta({ claim, kind, conflito, evidencias }),
      sourceCandidates: [...new Set([...claim.observedSourceDomains, ...evidencias.map(item => item.sourceDomain)])],
      priority: conflito || claim.ymyl.relevance === "HIGH" ? "HIGH" : claim.ymyl.relevance === "MATERIAL" ? "MEDIUM" : "LOW",
      provenance: `${claim.provenance} ${evidencias.length ? `Evidência factual de ${evidencias.length} fonte(s).` : "Sem evidência factual registrada."}`,
    });
  }

  /* ---------------------------- as limitações ---------------------------- */

  const exigemSustentacao = claims.filter(radarClaimNeedsFactualSupport);
  const semFonte = exigemSustentacao.filter(claim => !(porClaim.get(claim.claimId) || []).some(item => item.supportType === "SUPPORTS"));
  const naoVerificadas = sources.filter(item => !item.verified).length;
  const indeterminadas = sources.filter(item => item.type === "UNKNOWN").length;

  if (semFonte.length) limitations.push(`${semFonte.length} afirmação(ões) de relevância material ou alta não têm fonte adequada que as sustente nesta investigação.`);
  if (naoVerificadas) limitations.push(`${naoVerificadas} fonte(s) foram classificadas apenas pelo endereço, sem verificação do conteúdo.`);
  if (indeterminadas) limitations.push(`${indeterminadas} fonte(s) permanecem com natureza indeterminada: recorrência na amostra não as classifica.`);
  if (!factualEvidence.length && exigemSustentacao.length) limitations.push("Nenhuma fonte foi verificada nesta rodada: a sustentação factual das afirmações sensíveis não pôde ser avaliada.");
  if (!serpStanding.authoritative) limitations.push(serpStanding.reason);
  const semData = factualEvidence.filter(item => !item.hasDates).length;
  if (semData) limitations.push(`${semData} fonte(s) verificada(s) não expõem data de publicação ou atualização.`);
  const semAutoria = factualEvidence.filter(item => !item.author).length;
  if (semAutoria) limitations.push(`${semAutoria} fonte(s) verificada(s) não identificam autoria.`);

  /* ------------------------------ o resumo ------------------------------- */

  const porTipo = new Map<string, number>();
  for (const source of sources) porTipo.set(source.type, (porTipo.get(source.type) || 0) + 1);

  return {
    ymylAssessment: input.ymyl,
    claims,
    sources,
    factualEvidence,
    marketVsFactConflicts,
    eeatSignals: readRadarEeatSignalSet({ pages: input.pages }),
    specialistReviewRequirements,
    serpStanding,
    summary: {
      claimsNeedingSupport: exigemSustentacao.length,
      claimsWellSupported: exigemSustentacao.length - semFonte.length,
      claimsWithEvidenceGap: semFonte.length,
      sourcesByType: [...porTipo.entries()]
        .map(([type, count]) => ({ type, label: RADAR_SOURCE_AUTHORITY_LABEL[type as keyof typeof RADAR_SOURCE_AUTHORITY_LABEL] || type, count }))
        .sort((left, right) => right.count - left.count),
    },
    limitations,
  };
}
