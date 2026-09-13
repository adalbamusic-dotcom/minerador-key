import {
  radarSpecialistDecisionIsActive,
  type RadarSpecialistClassification,
  type RadarSpecialistDecision,
  type RadarSpecialistExtraction,
} from "./specialist-contribution-review.ts";

/**
 * A CAMADA DE ESPECIALISTA DO DOSSIÊ — SPECIALIST_3 · §9, §10 e §14.
 *
 * ===================== ONDE ELA VIVE, E POR QUE NÃO NO DNA =====================
 *
 * A resposta de um profissional NÃO entra no ArticleDNA. O Arquiteto aprovou um
 * contrato editorial; o Radar acrescenta evidência amarrada àquela versão dele.
 * Copiar a contribuição para dentro do DNA faria o Radar reescrever o que o
 * Arquiteto aprovou — e a estrutura do artigo mudaria porque um especialista
 * mandou um áudio. `ARTICLE_DNA_MUTATED = NO` é consequência de onde isto mora,
 * não de uma promessa escrita em algum lugar.
 *
 * É a mesma decisão já tomada para a camada de vídeo, pelo mesmo motivo.
 *
 * ========================= O QUE CHEGA AO PLANEJADOR =========================
 *
 * Por item: a necessidade original, a pergunta que foi enviada, quem respondeu,
 * a resposta ORIGINAL, a contribuição extraída, a classificação, a decisão
 * humana, a citação quando marcada, e a proveniência. O Planejador não precisa
 * voltar ao banco para entender de onde cada frase saiu.
 *
 * ==================== O QUE NÃO CHEGA, E É DECLARADO ====================
 *
 * `NOT_APPROVED` e `REJECTED` não viram evidência ativa — §10. Mas o número
 * delas viaja: um dossiê que mostra duas evidências e silencia sobre as três
 * respostas recusadas descreve uma investigação que não aconteceu. Ausência
 * declarada, nunca ausência omitida — é a regra do bundle inteiro.
 *
 * Domínio puro: sem fetch, sem storage, sem React, sem provider.
 */

/* ============================== o vínculo ============================== */

export type RadarSpecialistEvidenceBinding = {
  brandId: string;
  articleId: string;
  articleDnaVersionId: string;
  articleDnaContentHash: string | null;
};

/* =============================== um item ============================== */

export type RadarSpecialistEvidenceItem = {
  /** O ponto de revisão que originou tudo isto. */
  requirementId: string;
  /** A NECESSIDADE ORIGINAL, verbatim do congelamento. */
  requirementQuestion: string;
  requirementKind: string;
  /** As PERGUNTAS ENVIADAS, na ordem em que o especialista as recebeu. */
  sentQuestions: string[];
  expert: { id: string; displayName: string | null };
  briefId: string;
  contributionId: string;
  /** A RESPOSTA ORIGINAL. Autoridade de fidelidade; nunca substituída. */
  originalText: string;
  /** A CONTRIBUIÇÃO EXTRAÍDA — recorte declarado, jamais texto inventado. */
  extractedSummary: string;
  summarySource: RadarSpecialistExtraction["summarySource"];
  classification: RadarSpecialistClassification;
  humanDecision: RadarSpecialistDecision;
  editorialUse: string;
  /** Só quando uma pessoa marcou citação literal. */
  quote: string | null;
  provenance: RadarSpecialistExtraction["provenance"];
};

export type RadarSpecialistEvidenceLayer = {
  binding: RadarSpecialistEvidenceBinding;
  /** Quantos pontos a investigação preparou. O denominador da leitura. */
  preparedRequirements: number;
  /** Só decisões ativas. Recusada e não decidida não entram — §10. */
  items: RadarSpecialistEvidenceItem[];
  /** A ausência, declarada: o que voltou e não virou evidência ativa. */
  notApproved: number;
  rejected: number;
};

/* ============================ as invariantes ============================ */

/**
 * NADA SAI DAQUI SEM DECISÃO HUMANA ATIVA, NEM SEM ORIGEM.
 *
 * Este erro acontece na montagem do dossiê — cedo — e não quando o Planejador
 * já estiver compondo um artigo em cima de uma contribuição que ninguém leu.
 */
export function assertRadarSpecialistEvidenceLayer(layer: RadarSpecialistEvidenceLayer): void {
  if (!layer.binding.brandId.trim()) throw new Error("RADAR_SPECIALIST_EVIDENCE_MISSING_BRAND");
  if (!layer.binding.articleId.trim()) throw new Error("RADAR_SPECIALIST_EVIDENCE_MISSING_ARTICLE");
  if (!layer.binding.articleDnaVersionId.trim()) throw new Error("RADAR_SPECIALIST_EVIDENCE_MISSING_ARTICLE_DNA_VERSION");

  for (const item of layer.items) {
    if (!radarSpecialistDecisionIsActive(item.humanDecision)) throw new Error("RADAR_SPECIALIST_EVIDENCE_WITHOUT_HUMAN_DECISION");
    if (!item.originalText.trim()) throw new Error("RADAR_SPECIALIST_EVIDENCE_WITHOUT_ORIGINAL");
    if (!item.requirementId.trim()) throw new Error("RADAR_SPECIALIST_EVIDENCE_WITHOUT_REQUIREMENT");
    if (!item.provenance.receivedAt.trim()) throw new Error("RADAR_SPECIALIST_EVIDENCE_WITHOUT_PROVENANCE");
    /*
     * CITAÇÃO MARCADA PRECISA ESTAR NO ORIGINAL, LITERALMENTE.
     *
     * Uma citação que não aparece na resposta é a falha mais cara possível:
     * ela sai do Radar com o nome de um profissional em cima de uma frase que
     * ele não disse. A checagem é literal de propósito.
     */
    if (item.quote && !item.originalText.includes(item.quote)) throw new Error("RADAR_SPECIALIST_EVIDENCE_QUOTE_NOT_IN_ORIGINAL");
  }
}

/* ============================== a montagem ============================== */

export type RadarSpecialistEvidenceSource = {
  extraction: RadarSpecialistExtraction;
  requirementQuestion: string;
  requirementKind: string;
  sentQuestions: readonly string[];
  expertDisplayName: string | null;
};

/**
 * A CAMADA, PROJETADA DO QUE JÁ FOI DECIDIDO — sem recalcular decisão nenhuma.
 *
 * Cada fonte traz uma extração pronta, com a decisão humana que está gravada.
 * Esta função separa, conta e amarra ao fundamento; ela não classifica, não
 * resume e não aceita. Se ela pudesse, montar o dossiê promoveria evidência.
 *
 * SEM PONTO DE REVISÃO, FORA. Uma pauta avulsa não responde a necessidade
 * nenhuma do artigo, e o §10 pede que o Planejador receba a necessidade junto
 * da resposta. Contribuição sem requisito não some: ela continua no banco e na
 * tela — só não entra como evidência de um ponto que não existe.
 */
export function buildRadarSpecialistEvidenceLayer(input: {
  binding: RadarSpecialistEvidenceBinding;
  preparedRequirements: number;
  sources: readonly RadarSpecialistEvidenceSource[];
}): RadarSpecialistEvidenceLayer {
  const items: RadarSpecialistEvidenceItem[] = [];
  let notApproved = 0;
  let rejected = 0;

  for (const fonte of input.sources) {
    const { extraction } = fonte;
    if (extraction.humanDecision === "REJECTED") { rejected += 1; continue; }
    if (!radarSpecialistDecisionIsActive(extraction.humanDecision)) { notApproved += 1; continue; }
    if (!extraction.requirementId || !extraction.originalText.trim()) { notApproved += 1; continue; }

    items.push({
      requirementId: extraction.requirementId,
      requirementQuestion: fonte.requirementQuestion,
      requirementKind: fonte.requirementKind,
      sentQuestions: [...fonte.sentQuestions],
      expert: { id: extraction.expertId, displayName: fonte.expertDisplayName },
      briefId: extraction.provenance.briefId,
      contributionId: extraction.contributionId,
      originalText: extraction.originalText,
      extractedSummary: extraction.extractedSummary,
      summarySource: extraction.summarySource,
      classification: extraction.classification,
      humanDecision: extraction.humanDecision,
      editorialUse: extraction.editorialUse,
      quote: extraction.quoteCandidate,
      provenance: extraction.provenance,
    });
  }

  const layer: RadarSpecialistEvidenceLayer = {
    binding: input.binding,
    preparedRequirements: input.preparedRequirements,
    items,
    notApproved,
    rejected,
  };
  assertRadarSpecialistEvidenceLayer(layer);
  return layer;
}

/**
 * A LEITURA CURTA PARA QUEM DECIDE ENTREGAR — quantos pontos foram respondidos.
 *
 * Não é o número de itens: duas contribuições aceitas do mesmo ponto são uma
 * necessidade coberta, não duas. Contar itens faria um ponto bem respondido
 * parecer dois pontos resolvidos.
 */
export function radarSpecialistEvidenceCoverage(layer: RadarSpecialistEvidenceLayer): {
  requirementsCovered: number;
  preparedRequirements: number;
  quotes: number;
} {
  return {
    requirementsCovered: new Set(layer.items.map(item => item.requirementId)).size,
    preparedRequirements: layer.preparedRequirements,
    quotes: layer.items.filter(item => Boolean(item.quote)).length,
  };
}
