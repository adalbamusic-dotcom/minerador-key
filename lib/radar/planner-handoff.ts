import { contentHash } from "../arquiteto/versioning.ts";
import type { RadarCompetitiveReport } from "./competitive-report.ts";
import { RadarPlannerHandoffSchema, type RadarAnalysisPayload, type RadarEvidencePackage, type RadarExpertEvidence, type RadarPlannerHandoff, type RadarPlannerHandoffDecision, type RadarProductEvidence } from "./analysis-contracts.ts";
import type { InternalLinkGraphRef } from "../arquiteto/contracts.ts";
import { assertRadarEvidenceProvenance, type RadarEvidenceBundle } from "./evidence-bundle.ts";
import type { RadarEditorialBlueprint } from "./editorial-blueprint.ts";
import { assertRadarFrozenBundleIntegrity, radarFrozenBundleMatchesArticle, type RadarFrozenEvidenceBundle } from "./investigation-finalization.ts";

type HandoffInput = {
  packageData: RadarEvidencePackage;
  approvedReport: RadarCompetitiveReport;
  brandId: string;
  radarItemId: string;
  articleId: string;
  articleDnaVersionId: string;
  articleDnaContentHash?: string | null;
  siloDnaVersionId?: string | null;
  sourceAnalysisVersionId: string;
  sourceAnalysisVersionNumber: number;
  selectedBy: string;
  humanDecisions?: RadarPlannerHandoffDecision[];
  expertEvidence?: RadarExpertEvidence[];
  productEvidence?: RadarProductEvidence[];
  internalLinkGraphRef?: InternalLinkGraphRef | null;
  previousHandoffId?: string | null;
  now?: string;
};

function assertIdentity(input: HandoffInput) {
  if (input.packageData.brandId !== input.brandId || input.approvedReport.brandId !== input.brandId) throw new Error("RADAR_HANDOFF_BRAND_MISMATCH");
  if (input.packageData.radarItemId !== input.radarItemId || input.approvedReport.radarItemId !== input.radarItemId) throw new Error("RADAR_HANDOFF_ITEM_MISMATCH");
  if (input.packageData.articleId !== input.articleId || input.approvedReport.articleId !== input.articleId) throw new Error("RADAR_HANDOFF_ARTICLE_MISMATCH");
  if (input.packageData.articleDnaId !== input.articleDnaVersionId || input.approvedReport.articleDnaVersionId !== input.articleDnaVersionId) throw new Error("RADAR_HANDOFF_ARTICLE_DNA_MISMATCH");
  if (input.approvedReport.status !== "approved") throw new Error("RADAR_HANDOFF_REPORT_NOT_APPROVED");
  if (input.internalLinkGraphRef && (input.internalLinkGraphRef.brandId !== input.brandId || input.internalLinkGraphRef.workflowStatus !== "approved")) throw new Error("RADAR_HANDOFF_GRAPH_REF_NOT_APPROVED");
}

function decisionsForReport(input: HandoffInput) {
  return input.humanDecisions || [
    {
      id: `report:${input.approvedReport.id}`,
      target: "radar_report",
      decision: "approved",
      actorId: input.approvedReport.approvedBy || input.selectedBy,
      decidedAt: input.approvedReport.approvedAt || input.now || new Date().toISOString(),
      note: input.approvedReport.summary.text,
    },
  ];
}

function serpReferences(input: HandoffInput) {
  const included = new Map(input.packageData.includedOrganicResults.map(item => [item.key, item]));
  return input.approvedReport.competitors.map(competitor => {
    const key = `organic:${competitor.serpPosition}`;
    const decision = included.get(key);
    const role = !decision ? "excluded" as const : /formato|video|vídeo/i.test(decision.reason) ? "format" as const : /apoio|support|complementar/i.test(decision.reason) ? "support" as const : "primary" as const;
    return { position: competitor.serpPosition, title: competitor.title, url: competitor.url, role };
  });
}

export async function buildRadarPlannerHandoff(input: HandoffInput): Promise<RadarPlannerHandoff> {
  assertIdentity(input);
  const now = input.now || new Date().toISOString();
  const humanDecisions = decisionsForReport(input);
  const base = {
    schemaVersion: 2 as const,
    packageType: "radar_planner_handoff" as const,
    id: `radar-planner-handoff:${input.sourceAnalysisVersionId}`,
    brandId: input.brandId,
    radarItemId: input.radarItemId,
    articleId: input.articleId,
    articleDnaVersionId: input.articleDnaVersionId,
    siloDnaVersionId: input.siloDnaVersionId || null,
    status: "APPROVED" as const,
    sourceAnalysisVersionId: input.sourceAnalysisVersionId,
    sourceAnalysisVersionNumber: input.sourceAnalysisVersionNumber,
    approvedReport: {
      reportId: input.approvedReport.id,
      version: input.approvedReport.version,
      hash: input.approvedReport.contentHash,
      status: "APPROVED" as const,
      summary: input.approvedReport.summary.text,
      limitations: input.approvedReport.summary.limitations,
      needs: input.approvedReport.needs.map(need => ({ id: need.id, title: need.title, decision: need.humanDecision, note: need.note })),
      recommendations: input.approvedReport.needs.filter(need => ["send_planner", "opportunity"].includes(need.humanDecision)).map(need => need.title),
      humanDecisions,
    },
    evidencePackage: input.packageData,
    serp: { ...input.packageData.serp, provider: input.packageData.serp.provider, references: serpReferences(input) },
    expertEvidence: input.expertEvidence || [],
    productEvidence: input.productEvidence || [],
    humanDecisions,
    internalLinkGraphRef: input.internalLinkGraphRef || null,
    provenance: {
      source: "radar" as const,
      provider: input.packageData.serp.provider,
      articleDnaVersionId: input.articleDnaVersionId,
      articleDnaContentHash: input.articleDnaContentHash || null,
      siloDnaVersionId: input.siloDnaVersionId || null,
      analysisVersionId: input.sourceAnalysisVersionId,
      serpSnapshotId: input.packageData.serp.snapshotId,
      serpSnapshotVersion: input.packageData.serp.version,
      serpSnapshotHash: input.packageData.serp.hash,
      expertContributionIds: (input.expertEvidence || []).map(evidence => evidence.contributionId),
      productEvidenceIds: (input.productEvidence || []).map(evidence => evidence.id),
      capturedAt: now,
    },
    version: input.sourceAnalysisVersionNumber,
    previousHandoffId: input.previousHandoffId || null,
  };
  return RadarPlannerHandoffSchema.parse({ ...base, hash: await contentHash(base) });
}

export function isRadarPlannerHandoff(value: unknown): value is RadarPlannerHandoff {
  return RadarPlannerHandoffSchema.safeParse(value).success;
}

export function radarHandoffToContentPlanInput(handoff: RadarPlannerHandoff) {
  const packageData = handoff.evidencePackage;
  return {
    analysisMode: packageData.analysisMode.mode,
    analysisEnforcement: packageData.analysisMode.mode === "competitive_full" ? "required" as const : "advisory" as const,
    requirements: handoff.approvedReport.needs.filter(need => need.decision === "send_planner").map(need => need.title),
    recommendations: handoff.approvedReport.recommendations,
    observedData: [handoff.approvedReport.summary, ...handoff.approvedReport.limitations],
    humanDecisions: handoff.humanDecisions.map(decision => `${decision.target}: ${decision.decision}${decision.note ? ` — ${decision.note}` : ""}`),
    evidencePackage: handoff,
  };
}

export function radarPlannerPackageToContentPlanInput(value: RadarAnalysisPayload["plannerPackage"]) {
  if (!value) return null;
  if (isRadarPlannerHandoff(value)) return radarHandoffToContentPlanInput(value);
  if ("packageType" in value && value.packageType === "radar_evidence") {
    return {
      analysisMode: value.analysisMode.mode,
      analysisEnforcement: "advisory" as const,
      requirements: [],
      recommendations: [],
      observedData: [`SERP: ${value.serp.query}`, `Resultados incluídos: ${value.includedOrganicResults.length}`, `Amostra estrutural: ${value.observedStructure.sampleSize}`],
      humanDecisions: [],
      evidencePackage: value,
    };
  }
  return {
    analysisMode: value.mode,
    analysisEnforcement: value.enforcement,
    requirements: value.requirements,
    recommendations: value.recommendations,
    observedData: value.observedData,
    humanDecisions: value.keywordDecisions.map(decision => `${decision.keywordId}: ${decision.decision}${decision.note ? ` — ${decision.note}` : ""}`),
    evidencePackage: null,
  };
}

/* ======================================================================== */
/* ==========  GATE 16 · O HANDOFF CANÔNICO PARA O PLANEJADOR  =========== */
/* ======================================================================== */

/**
 * A FRONTEIRA, FINALMENTE FORMALIZADA.
 *
 *   ArticleDNA aprovado          o que deve ser escrito        (do Arquiteto)
 *   + RadarEvidenceBundle        o que a investigação provou   (do Radar)
 *   = PlannerHandoff             o que o Planejador consome
 *
 * POR QUE ISTO NÃO É UM CONTRATO NOVO.
 *
 * O handoff v2 acima continua inteiro e continua lendo o que já foi gravado.
 * Mas ele NASCE de um lugar que este gate proíbe: do relatório competitivo
 * aprovado pelo fluxo antigo (`approvedReport.status === "approved"`), o mesmo
 * fluxo que o Gate 15.3 tirou da superfície. Um contrato cuja origem deixou de
 * existir não é reutilizável — é um envelope esperando por um remetente morto.
 *
 * O que muda aqui é a FONTE, não a casa: mesma autoridade, mesmo módulo,
 * versão 3 do contrato. As peças já existiam e são reaproveitadas inteiras:
 *
 *   `RadarEvidenceBundle`         o dossiê vivo com a fotografia completa
 *   `RadarFrozenEvidenceBundle`   a rodada congelada, com identidade própria
 *   `assertRadarEvidenceProvenance`, `assertRadarFrozenBundleIntegrity`,
 *   `radarFrozenBundleMatchesArticle`
 *
 * TRÊS IDENTIDADES, NUNCA CONFUNDIDAS.
 *
 *   hash do ArticleDNA    responde "qual artigo, em que versão?"
 *   hash do bundle        responde "quais evidências foram congeladas?"
 *   hash do handoff       responde "qual entrega, sob qual contrato?"
 *
 * Duas investigações do mesmo artigo têm o mesmo hash de fundamento e
 * evidências completamente diferentes. Dois contratos sobre a mesma
 * investigação têm o mesmo bundle e entregas diferentes. Colapsar qualquer par
 * destes torna impossível responder depois "o que exatamente o Planejador
 * usou?" — que é a única pergunta que este módulo existe para responder.
 *
 * O QUE ELE NÃO FAZ: pesquisar, interpretar, recalcular modelo, resolver
 * conflito de novo, tocar no ArticleDNA, tocar no bundle, chamar provider.
 * Transformação e validação determinísticas, e nada além disso.
 */

/* ============================ o que bloqueia ============================ */

export type RadarPlannerHandoffBlockCode =
  | "NOT_FINALIZED"
  | "STALE"
  | "BRAND_MISMATCH"
  | "ARTICLE_MISMATCH"
  | "ARTICLE_VERSION_MISMATCH"
  | "ARTICLE_HASH_MISMATCH"
  | "BUNDLE_MUTATED"
  | "DOSSIER_DIVERGES";

/**
 * Um impedimento, com a frase de quem opera e o detalhe de quem investiga.
 *
 * A separação é a mesma do Gate 15.1: a primeira camada diz o que aconteceu em
 * linguagem de trabalho; hash, versão e código ficam no expansível. Ninguém
 * decide nada olhando para `RADAR_FROZEN_BUNDLE_MUTATED`.
 */
export type RadarPlannerHandoffBlock = {
  code: RadarPlannerHandoffBlockCode;
  message: string;
  detail: string;
};

export type RadarPlannerHandoffReadiness = {
  ready: boolean;
  headline: string;
  blocks: RadarPlannerHandoffBlock[];
};

/** O fundamento do artigo, como o handoff precisa recebê-lo. */
export type RadarPlannerArticleFoundation = {
  brandId: string;
  articleId: string;
  articleDnaVersionId: string;
  articleDnaContentHash: string | null;
};

/**
 * A PRONTIDÃO, EM UM LUGAR SÓ.
 *
 * O construtor do handoff e o Relatório fazem a MESMA pergunta e precisam da
 * MESMA resposta. Duplicar a regra em React foi como a tela passou a dizer
 * "pronto" ao lado de um pacote que o domínio recusaria — e ninguém descobre
 * isso até a hora de entregar.
 *
 * Nada aqui conserta nada: cada divergência vira bloqueio nomeado. Um handoff
 * que se "ajusta" sozinho ao fundamento corrente é um handoff que entrega
 * evidência de uma investigação para um artigo que já é outro.
 */
export function radarPlannerHandoffReadiness(input: {
  article: RadarPlannerArticleFoundation;
  /** A investigação congelada. Sem ela não há contrato — §2. */
  frozen: RadarFrozenEvidenceBundle | null;
  /** O dossiê vivo com a fotografia inteira, quando existir. */
  dossier?: RadarEvidenceBundle | null;
  /** Os fundamentos mudaram depois da investigação? */
  stale?: boolean;
}): RadarPlannerHandoffReadiness {
  const blocks: RadarPlannerHandoffBlock[] = [];
  const bloquear = (code: RadarPlannerHandoffBlockCode, message: string, detail: string) =>
    blocks.push({ code, message, detail });

  const frozen = input.frozen;
  if (!frozen) {
    bloquear("NOT_FINALIZED", "Finalize a pesquisa antes de preparar o pacote.", "Nenhum RadarFrozenEvidenceBundle foi encontrado para este artigo.");
    return { ready: false, headline: "Pacote para planejamento bloqueado", blocks };
  }

  /*
   * A INTEGRIDADE VEM ANTES DE QUALQUER COMPARAÇÃO.
   *
   * Comparar campos de um bundle adulterado é comparar com o que o adulterador
   * escreveu. O hash é recalculado sobre o conteúdo: se ele não bate, nenhum
   * outro campo merece crédito.
   */
  try {
    assertRadarFrozenBundleIntegrity(frozen);
  } catch (erro) {
    bloquear("BUNDLE_MUTATED", "O pacote de evidências falhou na verificação de integridade.", erro instanceof Error ? erro.message : String(erro));
    return { ready: false, headline: "Pacote para planejamento bloqueado", blocks };
  }

  if (frozen.binding.brandId !== input.article.brandId) {
    bloquear("BRAND_MISMATCH", "A investigação pertence a outra marca.", `Congelada para ${frozen.binding.brandId}; o artigo corrente é de ${input.article.brandId}.`);
  }

  const vinculo = radarFrozenBundleMatchesArticle(frozen, input.article);
  if (!vinculo.matches) {
    const code: RadarPlannerHandoffBlockCode = frozen.binding.articleId !== input.article.articleId
      ? "ARTICLE_MISMATCH"
      : frozen.binding.articleDnaVersionId !== input.article.articleDnaVersionId
        ? "ARTICLE_VERSION_MISMATCH"
        : "ARTICLE_HASH_MISMATCH";
    bloquear(code, "A investigação não corresponde mais à versão atual do Article.", vinculo.reason);
  }

  if (input.stale) {
    bloquear("STALE", "A investigação não corresponde mais à versão atual do Article.", "Os fundamentos mudaram depois desta investigação; a leitura descreve outra versão do artigo.");
  }

  /*
   * O DOSSIÊ PRECISA SER O DA RODADA CONGELADA — não o de hoje.
   *
   * §8 exige transportar a fotografia INTEIRA, e o congelado guarda dela um
   * resumo verificável: contagens, ids de conceito, ids de extração. É por isso
   * que ele guarda: para que alguém, depois, possa provar que o material
   * completo em mãos é o mesmo que foi congelado.
   *
   * Divergiu? Bloqueia. Enviar a leitura viva sob a identidade do congelado
   * seria a fraude silenciosa que todo este gate existe para impedir.
   */
  const dossier = input.dossier;
  if (dossier) {
    const divergencias = radarDossierDivergesFromFrozen(dossier, frozen);
    for (const divergencia of divergencias) {
      bloquear("DOSSIER_DIVERGES", "O pacote de evidências falhou na verificação de integridade.", divergencia);
    }
  }

  return blocks.length
    ? { ready: false, headline: "Pacote para planejamento bloqueado", blocks }
    : { ready: true, headline: "Pacote para planejamento pronto", blocks: [] };
}

/**
 * O dossiê vivo ainda descreve a rodada que foi congelada?
 *
 * Compara o que o congelado guardou para exatamente esta pergunta. Não
 * reinterpreta e não escolhe vencedor: devolve as diferenças encontradas.
 */
export function radarDossierDivergesFromFrozen(dossier: RadarEvidenceBundle, frozen: RadarFrozenEvidenceBundle): string[] {
  const divergencias: string[] = [];
  const observado = dossier.observed;

  if (dossier.binding.articleId !== frozen.binding.articleId) {
    divergencias.push(`O dossiê é do artigo ${dossier.binding.articleId} e o congelado é do artigo ${frozen.binding.articleId}.`);
  }
  if (dossier.binding.articleDnaVersionId !== frozen.binding.articleDnaVersionId) {
    divergencias.push(`O dossiê descreve a versão ${dossier.binding.articleDnaVersionId} e o congelado a versão ${frozen.binding.articleDnaVersionId}.`);
  }

  const amostra = observado.sample;
  if (amostra.analyzedSuccess !== frozen.sample.analyzedSuccess) {
    divergencias.push(`Páginas lidas: ${amostra.analyzedSuccess} no dossiê, ${frozen.sample.analyzedSuccess} no congelado.`);
  }
  if (amostra.comparablePages !== frozen.sample.comparablePages) {
    divergencias.push(`Páginas comparáveis: ${amostra.comparablePages} no dossiê, ${frozen.sample.comparablePages} no congelado.`);
  }
  if (amostra.failedFinal !== frozen.sample.failedFinal) {
    divergencias.push(`Páginas sem acesso: ${amostra.failedFinal} no dossiê, ${frozen.sample.failedFinal} no congelado.`);
  }

  const conceitosCongelados = [...frozen.model.conceptIds].sort().join("|");
  const conceitosDoDossie = observado.concepts.all.map(item => item.id).sort().join("|");
  if (conceitosCongelados !== conceitosDoDossie) {
    divergencias.push("Os conceitos observados no dossiê não são os mesmos que foram congelados.");
  }

  if (observado.internalLinkPlan.totalRecommendedLinks !== frozen.links.totalRecommendedLinks) {
    divergencias.push(`Links recomendados: ${observado.internalLinkPlan.totalRecommendedLinks} no dossiê, ${frozen.links.totalRecommendedLinks} no congelado.`);
  }
  if (observado.authorityEvidence.claims.length !== frozen.authority.claims.length) {
    divergencias.push(`Afirmações a sustentar: ${observado.authorityEvidence.claims.length} no dossiê, ${frozen.authority.claims.length} no congelado.`);
  }

  return divergencias;
}

/* =========================== o que é entregue ========================== */

/**
 * O estado real de cada motor de pesquisa — §21.
 *
 * O contrato precisa nascer extensível sem fingir que YouTube e Amazon
 * rodaram. `NOT_EXECUTED` é resposta legítima e diferente de `UNAVAILABLE`:
 * uma diz que ninguém pediu, a outra que não havia como pedir.
 */
export type RadarPlannerChannelState = "FINALIZED" | "NOT_EXECUTED" | "UNAVAILABLE";

/** §19 e §20 — áreas sem engine declaram estado, nunca evidência inventada. */
export type RadarPlannerAreaState = "NOT_USED" | "NOT_STARTED" | "NOT_REQUIRED" | "REQUIREMENTS_PREPARED";

export const RADAR_PLANNER_CONTRACT_VERSION = 3;

/**
 * AS INVARIANTES QUE VIAJAM COM O PACOTE — §22.
 *
 * Escritas no contrato, e não só na documentação, porque quem as vai violar é
 * quem não leu a documentação. Elas chegam ao Planejador junto da evidência.
 */
export const RADAR_PLANNER_MAY_NOT = [
  "consultar a SERP novamente",
  "escolher outros concorrentes",
  "alterar a composição do Article",
  "redefinir a keyword principal",
  "redefinir o Silo",
  "refazer o modelo semântico",
  "decidir que a SERP não importa",
] as const;

export type RadarPlannerHandoffV3 = {
  contractVersion: typeof RADAR_PLANNER_CONTRACT_VERSION;
  /** Identidade PRÓPRIA. Não é a do ArticleDNA nem a do bundle. */
  handoffId: string;
  handoffHash: string;
  handoffVersion: number;
  /** O instante da preparação. Fora do hash, de propósito — veja o hash. */
  preparedAt: string;
  preparedBy: string;
  binding: RadarPlannerArticleFoundation;
  /** A rodada congelada, verbatim. O que dá identidade à evidência. */
  frozen: RadarFrozenEvidenceBundle;
  /** A fotografia inteira da rodada congelada. O que o Planejador consome. */
  dossier: RadarEvidenceBundle;
  /** §21 — o estado real de cada motor, sem evidência fabricada. */
  channels: { web: RadarPlannerChannelState; youtube: RadarPlannerChannelState; amazon: RadarPlannerChannelState };
  /** §19 e §20 — áreas ainda sem engine, declaradas como estão. */
  areas: { videos: RadarPlannerAreaState; specialist: RadarPlannerAreaState };
  /** §18 — a insuficiência que o operador assumiu ao encerrar, quando houve. */
  acknowledgedInsufficiency: string | null;
  sufficiency: string;
  /** §17 — toda limitação finalizada viaja. Pacote limpo demais é pacote falso. */
  limitations: string[];
  /** §22 — o que o Planejador não pode fazer com isto. */
  plannerMayNot: readonly string[];
  /*
   * O DOSSIÊ EDITORIAL, DIRETO NO CONTRATO.
   *
   * A evidência bruta continua viajando inteira no dossiê — o blueprint não a
   * substitui. O que ele evita é obrigar o Planejador a remontar de cabeça 3
   * conceitos, 13 perguntas, 45 diferenciações e 19 fontes para descobrir quais
   * blocos narrativos a investigação sustenta.
   *
   * É PROJEÇÃO, NÃO AUTORIDADE NOVA: tudo aqui já foi concluído pelas camadas
   * anteriores, e cada item aponta para a evidência que o sustenta.
   */
  editorialBlueprint: RadarEditorialBlueprint;
  previousHandoffId: string | null;
};

/* ============================== a identidade ============================ */

function assinaturaHandoff(valor: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < valor.length; index += 1) {
    hash ^= valor.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * A IDENTIDADE DO CONTRATO — determinística, e cega ao relógio.
 *
 * `preparedAt` e `preparedBy` ficam de fora: preparar o mesmo pacote duas
 * vezes, em momentos diferentes, tem que produzir a MESMA identidade — é isso
 * que §25 chama de idempotência, e é o que impede o Planejador de receber duas
 * entregas idênticas com nomes diferentes.
 *
 * `handoffVersion` também fica de fora, porque ela conta repetições, não
 * conteúdo: o que muda a identidade é o bundle mudar (§26).
 */
export function radarPlannerHandoffIdentity(input: {
  article: RadarPlannerArticleFoundation;
  bundleId: string;
  bundleHash: string;
  contractVersion?: number;
}): { handoffId: string; handoffHash: string } {
  const contrato = input.contractVersion ?? RADAR_PLANNER_CONTRACT_VERSION;
  const canonico = [
    `contract:${contrato}`,
    `brand:${input.article.brandId}`,
    `article:${input.article.articleId}`,
    `articleDnaVersion:${input.article.articleDnaVersionId}`,
    `articleDnaHash:${input.article.articleDnaContentHash ?? "null"}`,
    `bundle:${input.bundleId}`,
    `bundleHash:${input.bundleHash}`,
  ].join("\n");
  const assinatura = assinaturaHandoff(canonico);
  return { handoffId: `handoff:${assinatura}`, handoffHash: `handoff-hash:${assinatura}` };
}

/* ============================== a montagem ============================= */

export type RadarPlannerHandoffResult =
  | { ok: true; handoff: RadarPlannerHandoffV3; change: "CREATED" | "REUSE" | "NEW_VERSION" }
  | { ok: false; readiness: RadarPlannerHandoffReadiness };

/**
 * O PACOTE, MONTADO SEM UMA ÚNICA DECISÃO EDITORIAL.
 *
 * Tudo o que sai daqui já existia: o fundamento veio do Arquiteto, a evidência
 * veio da investigação congelada, as limitações vieram da rodada. Este módulo
 * amarra, verifica e nomeia — e recusa quando não fecha.
 */
export function buildRadarPlannerEvidenceHandoff(input: {
  article: RadarPlannerArticleFoundation;
  frozen: RadarFrozenEvidenceBundle | null;
  dossier: RadarEvidenceBundle;
  /** O dossiê editorial da mesma rodada. Projeção, nunca recalculada aqui. */
  blueprint: RadarEditorialBlueprint;
  stale?: boolean;
  preparedBy: string;
  preparedAt: string;
  channels?: Partial<RadarPlannerHandoffV3["channels"]>;
  areas?: Partial<RadarPlannerHandoffV3["areas"]>;
  /** A entrega anterior deste artigo, quando houver — §25 e §26. */
  previous?: Pick<RadarPlannerHandoffV3, "handoffId" | "handoffHash" | "handoffVersion"> | null;
}): RadarPlannerHandoffResult {
  const readiness = radarPlannerHandoffReadiness({
    article: input.article, frozen: input.frozen, dossier: input.dossier, stale: input.stale,
  });
  if (!readiness.ready || !input.frozen) return { ok: false, readiness };
  const frozen = input.frozen;

  const identidade = radarPlannerHandoffIdentity({
    article: input.article, bundleId: frozen.bundleId, bundleHash: frozen.bundleHash,
  });

  /*
   * REPETIR NÃO CRIA OUTRA ENTREGA; INVESTIGAR DE NOVO CRIA — §25 e §26.
   *
   * Mesma identidade: é a mesma entrega, e a versão não anda. Identidade
   * diferente com entrega anterior existente: houve nova investigação, e a
   * versão sobe. O anterior fica referenciado, nunca sobrescrito em silêncio.
   */
  const anterior = input.previous || null;
  const change: "CREATED" | "REUSE" | "NEW_VERSION" = !anterior
    ? "CREATED"
    : anterior.handoffId === identidade.handoffId ? "REUSE" : "NEW_VERSION";
  const handoffVersion = change === "CREATED" ? 1 : change === "REUSE" ? anterior!.handoffVersion : anterior!.handoffVersion + 1;

  /*
   * §19, §20 e §21 — O QUE NÃO RODOU É DECLARADO COMO NÃO RODADO.
   *
   * O padrão nunca inventa: um motor sem execução é `NOT_EXECUTED`, uma área
   * sem material é `NOT_USED`. Especialista é a única com leitura automática,
   * e mesmo ela só distingue "há requisitos preparados" de "não é exigido" —
   * jamais "revisado" ou "contribuído", que não aconteceram.
   */
  const requisitos = input.dossier.observed.authorityEvidence.specialistReviewRequirements;
  const handoff: RadarPlannerHandoffV3 = {
    contractVersion: RADAR_PLANNER_CONTRACT_VERSION,
    handoffId: identidade.handoffId,
    handoffHash: identidade.handoffHash,
    handoffVersion,
    preparedAt: input.preparedAt,
    preparedBy: input.preparedBy,
    binding: { ...input.article },
    frozen,
    dossier: input.dossier,
    channels: {
      web: input.channels?.web ?? (frozen.search.mode === "WEB" ? "FINALIZED" : "NOT_EXECUTED"),
      youtube: input.channels?.youtube ?? "NOT_EXECUTED",
      amazon: input.channels?.amazon ?? "NOT_EXECUTED",
    },
    areas: {
      videos: input.areas?.videos ?? "NOT_USED",
      specialist: input.areas?.specialist ?? (requisitos.length ? "REQUIREMENTS_PREPARED" : "NOT_REQUIRED"),
    },
    editorialBlueprint: input.blueprint,
    acknowledgedInsufficiency: frozen.acknowledgedInsufficiency,
    sufficiency: frozen.model.sufficiency,
    /*
     * §17 — as duas listas de limitação, sem deduplicar por conveniência.
     * A do congelado descreve a rodada; a do dossiê descreve a fotografia.
     */
    limitations: [...new Set([...frozen.limitations, ...input.dossier.limitations])],
    plannerMayNot: RADAR_PLANNER_MAY_NOT,
    previousHandoffId: anterior && change === "NEW_VERSION" ? anterior.handoffId : null,
  };

  assertRadarPlannerHandoffIntegrity(handoff);
  return { ok: true, handoff, change };
}

/**
 * O contrato ainda é o que diz ser?
 *
 * Recalcula a identidade sobre os vínculos declarados e revalida as duas
 * camadas que ele transporta. É o que torna o round-trip de §24 uma prova e
 * não uma esperança.
 */
export function assertRadarPlannerHandoffIntegrity(handoff: RadarPlannerHandoffV3): void {
  assertRadarFrozenBundleIntegrity(handoff.frozen);
  assertRadarEvidenceProvenance(handoff.dossier);

  if (handoff.dossier.binding.articleId !== handoff.binding.articleId) throw new Error("RADAR_PLANNER_HANDOFF_DOSSIER_ARTICLE_MISMATCH");
  if (handoff.frozen.binding.articleId !== handoff.binding.articleId) throw new Error("RADAR_PLANNER_HANDOFF_BUNDLE_ARTICLE_MISMATCH");

  const esperada = radarPlannerHandoffIdentity({
    article: handoff.binding,
    bundleId: handoff.frozen.bundleId,
    bundleHash: handoff.frozen.bundleHash,
    contractVersion: handoff.contractVersion,
  });
  if (esperada.handoffId !== handoff.handoffId) throw new Error("RADAR_PLANNER_HANDOFF_ID_MUTATED");
  if (esperada.handoffHash !== handoff.handoffHash) throw new Error("RADAR_PLANNER_HANDOFF_MUTATED");
}

/**
 * §24 — serializar, ler de volta e continuar sendo a mesma entrega.
 *
 * Sem funções, sem Map, sem Set, sem Date solta: o que sai daqui é JSON e
 * volta idêntico. A validação no retorno é a mesma da montagem — um pacote que
 * atravessou a rede e chegou diferente não passa por aqui calado.
 */
export function serializeRadarPlannerHandoff(handoff: RadarPlannerHandoffV3): string {
  return JSON.stringify(handoff);
}

export function parseRadarPlannerHandoff(texto: string): RadarPlannerHandoffV3 {
  const valor = JSON.parse(texto) as RadarPlannerHandoffV3;
  if (valor.contractVersion !== RADAR_PLANNER_CONTRACT_VERSION) throw new Error("RADAR_PLANNER_HANDOFF_CONTRACT_VERSION");
  assertRadarPlannerHandoffIntegrity(valor);
  return valor;
}
