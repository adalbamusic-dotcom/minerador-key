/**
 * QUE FONTE É ESTA — e o que ela pode sustentar.
 *
 * O Gate 11 observou destinos: quem os concorrentes citam, com que âncora, em
 * que seção. Aqui a pergunta muda de "quem é citado" para "isso é fonte de
 * quê" — e a diferença decide se uma afirmação sobre saúde pode ser
 * reproduzida.
 *
 * DUAS COISAS QUE ESTE MÓDULO SE RECUSA A FAZER:
 *
 *   1. DEDUZIR AUTORIDADE DE RECORRÊNCIA. Seis concorrentes citarem o mesmo
 *      domínio é sinal competitivo forte e não diz nada sobre a natureza da
 *      fonte. Um blog comercial citado dez vezes continua sendo um blog
 *      comercial; virar "organização profissional" exigiria base para isso.
 *
 *   2. DEDUZIR AUTORIDADE DE APARÊNCIA. `.org` não classifica: qualquer um
 *      registra um. Sem sinal verificado, a resposta é `UNKNOWN`, e `UNKNOWN`
 *      é uma resposta honesta — não um buraco a preencher com palpite.
 *
 * A verificação de uma fonte é NAVEGAÇÃO EXTERNA, e ela só acontece dentro do
 * ANALYZE acionado pela pessoa. O destino nunca vem do cliente: ele é
 * resolvido no servidor a partir da candidata persistida, pela mesma regra que
 * protege a extração de concorrentes.
 *
 * Domínio puro: sem fetch, sem storage, sem provider. Quem busca é o servidor,
 * e recebe daqui apenas a lista do que vale buscar.
 */

import { radarNormalizedUrl } from "./research-reference.ts";

import type { RadarExtractionPage } from "./analysis-contracts.ts";
import type { RadarExternalEvidenceCandidate } from "./link-and-source-research.ts";
import type { RadarEvidenceClaim } from "./claim-evidence.ts";

/* ========================== a natureza da fonte ========================== */

export type RadarSourceAuthorityType =
  | "OFFICIAL_GOVERNMENT"
  | "REGULATOR"
  | "PRIMARY_SCIENTIFIC"
  | "SYSTEMATIC_REVIEW"
  | "CLINICAL_GUIDELINE"
  | "PROFESSIONAL_ORGANIZATION"
  | "ACADEMIC_INSTITUTION"
  | "QUALIFIED_EXPERT"
  | "MANUFACTURER"
  | "EDITORIAL_SECONDARY"
  | "COMMERCIAL"
  | "MARKETPLACE"
  | "SOCIAL"
  | "UNKNOWN";

export const RADAR_SOURCE_AUTHORITY_LABEL: Record<RadarSourceAuthorityType, string> = {
  OFFICIAL_GOVERNMENT: "Governo ou órgão oficial",
  REGULATOR: "Agência reguladora",
  PRIMARY_SCIENTIFIC: "Literatura científica primária",
  SYSTEMATIC_REVIEW: "Revisão sistemática",
  CLINICAL_GUIDELINE: "Diretriz clínica",
  PROFESSIONAL_ORGANIZATION: "Organização profissional",
  ACADEMIC_INSTITUTION: "Instituição acadêmica",
  QUALIFIED_EXPERT: "Especialista qualificado",
  MANUFACTURER: "Fabricante",
  EDITORIAL_SECONDARY: "Publicação editorial secundária",
  COMMERCIAL: "Página comercial",
  MARKETPLACE: "Marketplace",
  SOCIAL: "Rede social",
  UNKNOWN: "Natureza não determinada",
};

/** As que podem sustentar uma afirmação factual sensível. */
const FACTUAIS: readonly RadarSourceAuthorityType[] = [
  "OFFICIAL_GOVERNMENT", "REGULATOR", "PRIMARY_SCIENTIFIC",
  "SYSTEMATIC_REVIEW", "CLINICAL_GUIDELINE", "PROFESSIONAL_ORGANIZATION",
  "ACADEMIC_INSTITUTION", "QUALIFIED_EXPERT",
];

export const radarSourceCanSupportFact = (type: RadarSourceAuthorityType) => FACTUAIS.includes(type);

/* --------------------------- os sinais do domínio ------------------------ */

const GOVERNO = /(^|\.)gov(\.|$)|(^|\.)mil(\.|$)/i;
const REGULADOR = /(anvisa|inmetro|fda\.gov|ema\.europa|who\.int|paho\.org|opas|cfm\.org|cff\.org)/i;
const CIENTIFICA = /(pubmed|ncbi\.nlm\.nih\.gov|doi\.org|nature\.com|sciencedirect|springer|wiley|thelancet|nejm\.org|jamanetwork|bmj\.com|scielo|plos\.org|frontiersin)/i;
const REVISAO = /(cochrane|systematic[-_]?review|metanalis|meta-analysis)/i;
const DIRETRIZ = /(guideline|diretriz|consenso|protocolo[-_]clinico|clinical[-_]practice)/i;
/*
 * O TLD É CONFERIDO NO DOMÍNIO, NÃO NA CONCATENAÇÃO.
 *
 * `(^|\.)edu(\.|$)` contra "www.harvard.edu /pesquisa" falha: o `$` ancora no
 * fim da string inteira, e ali há um caminho depois. Harvard saía como fonte
 * indeterminada por causa de um espaço. O sufixo vai contra o domínio; as
 * palavras, contra domínio e caminho.
 */
const ACADEMICA_TLD = /(^|\.)edu(\.|$)/i;
const ACADEMICA_TEXTO = /(universidade|university|faculdade|instituto[-_]federal)/i;
const MARKETPLACE = /(^|\.)(mercadolivre|mercadolibre|amazon|shopee|magazineluiza|magalu|americanas|aliexpress|shopify)\./i;
const SOCIAL = /(^|\.)(instagram|facebook|twitter|x|linkedin|pinterest|tiktok|youtube|youtu|whatsapp|telegram|threads)\.(com|be|me|net)$/i;
const COMERCIAL_CAMINHO = /\/(produto|product|comprar|buy|loja|shop|checkout|assinar|planos)(\/|$)/i;

export type RadarSourceClassification = {
  domain: string;
  url: string | null;
  type: RadarSourceAuthorityType;
  /** Por que caiu nesta classe — auditável, não opaco. */
  classificationReason: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  /** Os sinais observados que sustentam a leitura. */
  signals: string[];
  /** A classificação usou conteúdo verificado, ou só a URL? */
  verified: boolean;
  provenance: string;
};

/**
 * A natureza da fonte, pelos sinais que existem — e `UNKNOWN` quando não há.
 *
 * `verifiedPage` só chega quando a fonte foi realmente buscada dentro do
 * ANALYZE. Sem ela, a leitura fica no que a URL permite afirmar, e isso é
 * declarado em `verified: false`. A diferença importa: `.org` sem verificação
 * é `UNKNOWN`; `.org` com dados estruturados de organização e autoria é outra
 * conversa.
 */
export function classifyRadarSourceAuthority(input: {
  domain: string;
  url?: string | null;
  verifiedPage?: RadarExtractionPage | null;
}): RadarSourceClassification {
  const domain = input.domain.toLowerCase();
  const url = input.url || null;
  const caminho = (() => {
    try { return url ? new URL(url).pathname : ""; } catch { return ""; }
  })();
  const alvo = `${domain} ${caminho}`;
  const signals: string[] = [];
  const verificada = input.verifiedPage || null;
  const provenance = verificada
    ? `Classificada com o conteúdo verificado de ${verificada.url}.`
    : `Classificada apenas pelos sinais do endereço ${url || domain}; a fonte não foi verificada nesta investigação.`;

  const responder = (type: RadarSourceAuthorityType, reason: string, confidence: RadarSourceClassification["confidence"]) =>
    ({ domain, url, type, classificationReason: reason, confidence, signals, verified: Boolean(verificada), provenance });

  if (REVISAO.test(alvo)) { signals.push("revisão sistemática ou metanálise no endereço"); return responder("SYSTEMATIC_REVIEW", "O endereço identifica revisão sistemática ou metanálise.", "HIGH"); }
  if (CIENTIFICA.test(alvo)) { signals.push("base de literatura científica"); return responder("PRIMARY_SCIENTIFIC", "Domínio de base científica ou identificador de publicação.", "HIGH"); }
  if (REGULADOR.test(alvo)) { signals.push("agência reguladora ou órgão sanitário"); return responder("REGULATOR", "Domínio de agência reguladora reconhecida pelo endereço.", "HIGH"); }
  if (GOVERNO.test(domain)) { signals.push("domínio governamental"); return responder("OFFICIAL_GOVERNMENT", "Domínio governamental.", "HIGH"); }
  if (DIRETRIZ.test(alvo)) { signals.push("diretriz, consenso ou protocolo no endereço"); return responder("CLINICAL_GUIDELINE", "O endereço identifica diretriz, consenso ou protocolo clínico.", "MEDIUM"); }
  if (ACADEMICA_TLD.test(domain) || ACADEMICA_TEXTO.test(alvo)) { signals.push("domínio acadêmico"); return responder("ACADEMIC_INSTITUTION", "Domínio de instituição de ensino ou pesquisa.", "HIGH"); }
  if (SOCIAL.test(domain)) { signals.push("rede social"); return responder("SOCIAL", "Perfil ou publicação em rede social: não é fonte factual.", "HIGH"); }
  if (MARKETPLACE.test(domain)) { signals.push("marketplace"); return responder("MARKETPLACE", "Marketplace: destino comercial, não fonte.", "HIGH"); }
  if (COMERCIAL_CAMINHO.test(caminho)) { signals.push("caminho de produto ou compra"); return responder("COMMERCIAL", "O endereço aponta para página de produto ou compra.", "MEDIUM"); }

  /*
   * ORGANIZAÇÃO PROFISSIONAL EXIGE BASE, NÃO TLD.
   *
   * `aad.org` citado por seis concorrentes continua sendo um domínio `.org`
   * até que algo o classifique. Com a página verificada declarando
   * organização e autoria, há base; sem isso, `UNKNOWN` é a resposta certa.
   */
  const pareceOrganizacao = /(^|\.)org(\.|$)/i.test(domain);
  if (pareceOrganizacao && verificada) {
    const declaraOrganizacao = verificada.structuredDataTypes.some(tipo => /organization|ngo|medicalorganization/i.test(tipo));
    if (declaraOrganizacao) {
      signals.push("dados estruturados de organização na página verificada");
      return responder("PROFESSIONAL_ORGANIZATION", "A página verificada declara-se organização em dados estruturados.", "MEDIUM");
    }
  }
  if (pareceOrganizacao) {
    signals.push("TLD .org, sem verificação");
    return responder("UNKNOWN", "TLD .org não classifica sozinho a natureza da fonte: qualquer entidade pode registrar um. Sem verificação, a natureza permanece indeterminada.", "LOW");
  }

  if (verificada?.author && verificada.author.trim()) {
    signals.push(`autoria declarada: ${verificada.author.trim()}`);
    return responder("QUALIFIED_EXPERT", "A página verificada declara autoria nominal — credencial declarada, não verificada.", "LOW");
  }

  if (verificada) {
    signals.push("página verificada sem sinal institucional");
    return responder("EDITORIAL_SECONDARY", "Conteúdo editorial sem sinal de fonte primária, órgão oficial ou instituição.", "MEDIUM");
  }

  signals.push("apenas o endereço");
  return responder("UNKNOWN", "Sem sinal suficiente no endereço e sem verificação: a natureza da fonte não foi determinada.", "LOW");
}

/**
 * A fonte verificada, de volta do que ficou gravado.
 *
 * O registro persistido é achatado de propósito — ele viaja no payload da
 * análise. Aqui ele volta a ser a classificação que o resto da leitura espera,
 * sem que a regra de classificação seja reescrita no caminho.
 */
export function radarSourceClassificationFromRecord(record: {
  domain: string;
  url: string;
  sourceType: string;
  classificationReason: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  signals: string[];
  provenance: string;
}): RadarSourceClassification {
  return {
    domain: record.domain,
    url: record.url,
    type: (RADAR_SOURCE_AUTHORITY_LABEL[record.sourceType as RadarSourceAuthorityType] ? record.sourceType : "UNKNOWN") as RadarSourceAuthorityType,
    classificationReason: record.classificationReason,
    confidence: record.confidence,
    signals: [...record.signals],
    /* Se está gravada como verificada, é porque a página foi lida. */
    verified: true,
    provenance: record.provenance,
  };
}

/* ===================== o que vale a pena verificar ====================== */

export type RadarSourceVerificationTarget = {
  /**
   * A identidade da fonte — por URL, não por domínio.
   *
   * O Gate 11 estabeleceu que duas URLs do mesmo domínio são fontes distintas:
   * `aad.org/oily-skin` e `aad.org/everyday-care` dizem coisas diferentes.
   * Endereçar o pedido por domínio faria uma delas sumir sem que ninguém visse.
   */
  sourceId: string;
  candidateUrl: string;
  domain: string;
  /** Por que esta fonte entrou na fila. */
  reason: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  /** As afirmações que dependem dela. */
  claimIds: string[];
};

/** Identidade estável a partir da URL normalizada — a mesma régua das referências. */
export function radarSourceId(url: string): string {
  const chave = radarNormalizedUrl(url);
  let hash = 0x811c9dc5;
  for (let index = 0; index < chave.length; index += 1) {
    hash ^= chave.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `source:${hash.toString(16).padStart(8, "0")}`;
}

/**
 * A FILA DE VERIFICAÇÃO — prioridade, não varredura.
 *
 * Buscar todo link citado seria caro e inútil: a maior parte é navegação,
 * rede social e vitrine. O que precisa ser verificado é o que sustenta
 * afirmação de consequência — e o que aparece em vários concorrentes, porque
 * ali a leitura do mercado se apoia.
 *
 * Sem teto artificial: quem define o tamanho é a evidência. O que existe é
 * deduplicação por destino, porque buscar duas vezes a mesma URL não acrescenta.
 */
export function buildRadarSourceVerificationPlan(input: {
  candidates: readonly RadarExternalEvidenceCandidate[];
  claims: readonly RadarEvidenceClaim[];
}): RadarSourceVerificationTarget[] {
  const porDominio = new Map<string, RadarEvidenceClaim[]>();
  for (const claim of input.claims) {
    for (const dominio of claim.observedSourceDomains) {
      porDominio.set(dominio, [...(porDominio.get(dominio) || []), claim]);
    }
  }

  const alvos = new Map<string, RadarSourceVerificationTarget>();
  for (const candidata of input.candidates) {
    if (!candidata.destinationUrl) continue;
    const chave = radarNormalizedUrl(candidata.destinationUrl);
    if (!chave || alvos.has(chave)) continue;

    const doDominio = porDominio.get(candidata.domain) || [];
    const sensiveis = doDominio.filter(claim => claim.ymyl.relevance === "MATERIAL" || claim.ymyl.relevance === "HIGH");
    const classificacao = classifyRadarSourceAuthority({ domain: candidata.domain, url: candidata.destinationUrl });
    const potencialFonte = radarSourceCanSupportFact(classificacao.type) || classificacao.type === "UNKNOWN";
    const recorrente = candidata.competitorsUsingIt > 1;

    if (!sensiveis.length && !recorrente && !radarSourceCanSupportFact(classificacao.type)) continue;
    if (classificacao.type === "SOCIAL" || classificacao.type === "MARKETPLACE") continue;

    alvos.set(chave, {
      sourceId: radarSourceId(candidata.destinationUrl),
      candidateUrl: candidata.destinationUrl,
      domain: candidata.domain,
      reason: sensiveis.length
        ? `Sustenta ${sensiveis.length} afirmação(ões) de relevância ${sensiveis[0].ymyl.relevance.toLowerCase()}.`
        : recorrente
          ? `Citada por ${candidata.competitorsUsingIt} concorrentes: a leitura do mercado se apoia nela.`
          : `Potencial fonte factual (${RADAR_SOURCE_AUTHORITY_LABEL[classificacao.type]}).`,
      priority: sensiveis.length ? "HIGH" : potencialFonte && recorrente ? "MEDIUM" : "LOW",
      claimIds: doDominio.map(claim => claim.claimId),
    });
  }

  const ordem = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  return [...alvos.values()].sort((left, right) => ordem[left.priority] - ordem[right.priority] || left.domain.localeCompare(right.domain));
}

/**
 * O SERVIDOR RESOLVE O DESTINO — o cliente não escolhe URL.
 *
 * A mesma regra que protege a extração de concorrentes: o pedido carrega o
 * identificador da candidata, e o endereço sai da candidata PERSISTIDA. Um id
 * desconhecido é recusado; uma URL enviada pelo cliente é ignorada, porque
 * não existe campo para ela.
 */
export function radarSourceVerificationTargets(input: {
  plan: readonly RadarSourceVerificationTarget[];
  requestedSourceIds: readonly string[];
}): { targets: RadarSourceVerificationTarget[]; refused: Array<{ sourceId: string; code: "SOURCE_UNKNOWN" }> } {
  const porId = new Map(input.plan.map(item => [item.sourceId, item]));
  const targets: RadarSourceVerificationTarget[] = [];
  const refused: Array<{ sourceId: string; code: "SOURCE_UNKNOWN" }> = [];

  for (const sourceId of input.requestedSourceIds) {
    const alvo = porId.get(sourceId);
    if (!alvo) refused.push({ sourceId, code: "SOURCE_UNKNOWN" });
    else if (!targets.some(item => item.sourceId === sourceId)) targets.push(alvo);
  }
  return { targets, refused };
}

/* ========================== a evidência factual ========================= */

export type RadarFactualSupportType = "SUPPORTS" | "CONTRADICTS" | "QUALIFIES" | "INSUFFICIENT" | "NOT_APPLICABLE";

export type RadarFactualEvidence = {
  claimId: string;
  sourceUrl: string;
  sourceDomain: string;
  sourceType: RadarSourceAuthorityType;
  supportType: RadarFactualSupportType;
  /** Resumo factual compacto. Nunca o artigo inteiro da fonte. */
  evidenceSummary: string;
  sourceTitle: string;
  author: string | null;
  hasDates: boolean;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  provenance: string;
  limitations: string[];
};

/** Quanto do texto da fonte é guardado. Resumo, não cópia. */
const MAX_RESUMO = 400;

/**
 * A evidência que uma fonte verificada oferece a uma afirmação.
 *
 * `supportType` NÃO é inferido do conteúdo — inferir "contradiz" a partir de
 * texto seria o Radar produzindo verdade factual sem base. Ele é recebido de
 * quem leu: a IA que resumiu com procedência, ou o especialista. Sem isso, o
 * que sai é `INSUFFICIENT`, que é o estado honesto de "a fonte existe e ainda
 * não sabemos o que ela diz sobre esta afirmação".
 */
export function buildRadarFactualEvidence(input: {
  claim: RadarEvidenceClaim;
  page: RadarExtractionPage;
  classification: RadarSourceClassification;
  /** A leitura de quem interpretou a fonte, com procedência. */
  reading?: { supportType: RadarFactualSupportType; summary: string; readBy: string } | null;
}): RadarFactualEvidence {
  const limitations: string[] = [];
  if (!input.page.author || !input.page.author.trim()) limitations.push("A fonte não identifica autoria.");
  if (!input.page.hasDates) limitations.push("A fonte não expõe data de publicação ou atualização.");
  if (!input.classification.verified) limitations.push("A natureza da fonte foi lida apenas pelo endereço.");
  if (!input.reading) limitations.push("A fonte foi verificada, mas ninguém interpretou o que ela diz sobre esta afirmação.");
  if (input.classification.type === "UNKNOWN") limitations.push("A natureza da fonte permanece indeterminada.");

  const resumo = input.reading?.summary
    || input.page.metaDescription
    || input.page.introText;

  return {
    claimId: input.claim.claimId,
    sourceUrl: input.page.url,
    sourceDomain: input.classification.domain,
    sourceType: input.classification.type,
    supportType: input.reading?.supportType || "INSUFFICIENT",
    evidenceSummary: (resumo || "").slice(0, MAX_RESUMO),
    sourceTitle: input.page.title || input.page.url,
    author: input.page.author,
    hasDates: input.page.hasDates,
    confidence: input.reading && radarSourceCanSupportFact(input.classification.type)
      ? "HIGH"
      : input.reading ? "MEDIUM" : "LOW",
    provenance: input.reading
      ? `${input.page.url} · verificada e interpretada por ${input.reading.readBy}.`
      : `${input.page.url} · verificada, sem interpretação registrada.`,
    limitations,
  };
}
