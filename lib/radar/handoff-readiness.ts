import { contentHash } from "../arquiteto/versioning.ts";
import type { RadarCompetitiveReport } from "./competitive-report.ts";
import { RadarPlannerHandoffSchema, type RadarEvidencePackage, type RadarExpertEvidence, type RadarPlannerHandoff, type RadarPlannerHandoffDecision, type RadarProductEvidence } from "./analysis-contracts.ts";
import type { InternalLinkGraphRef } from "../arquiteto/contracts.ts";
import { assertRadarEvidenceBundleIntegrity, radarEvidenceBundleMatchesArticle, type RadarEvidenceBundle } from "./evidence-bundle.ts";
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

export async function buildRadarApprovedPackage(input: HandoffInput): Promise<RadarPlannerHandoff> {
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

export function isRadarApprovedPackage(value: unknown): value is RadarPlannerHandoff {
  return RadarPlannerHandoffSchema.safeParse(value).success;
}

/**
 * A PRONTIDÃO DE ENTREGA DO RADAR.
 *
 *   ArticleDNA aprovado          o que deve ser escrito        (do Arquiteto)
 *   + RadarEvidenceBundle        o que a investigação provou   (do Radar)
 *   = RadarApprovedPackage       o que o Redator consome
 *
 * Desde 2026-10-01 (Planejador aposentado) o envelope V3 de entrega ao
 * Planejador não existe mais. Fica aqui só a pergunta "dá para entregar?",
 * respondida num lugar só para o Relatório e para o envio ao Redator.
 *
 * O QUE ELE NÃO FAZ: pesquisar, interpretar, recalcular modelo, resolver
 * conflito de novo, tocar no ArticleDNA, tocar no bundle, chamar provider.
 */

/* ============================ o que bloqueia ============================ */

export type RadarHandoffBlockCode =
  | "NOT_FINALIZED"
  | "STALE"
  | "BRAND_MISMATCH"
  | "ARTICLE_MISMATCH"
  | "ARTICLE_VERSION_MISMATCH"
  | "ARTICLE_HASH_MISMATCH"
  | "BUNDLE_MUTATED"
  | "DOSSIER_DIVERGES"
  /* 2026-10-09 · o artigo-modelo obrigatório: a investigação está pronta, mas a planta concluída dela não existe. */
  | "ARTICLE_BLUEPRINT_MISSING";

/**
 * Um impedimento, com a frase de quem opera e o detalhe de quem investiga.
 *
 * A separação é a mesma do Gate 15.1: a primeira camada diz o que aconteceu em
 * linguagem de trabalho; hash, versão e código ficam no expansível. Ninguém
 * decide nada olhando para `RADAR_FROZEN_BUNDLE_MUTATED`.
 */
export type RadarHandoffBlock = {
  code: RadarHandoffBlockCode;
  message: string;
  detail: string;
};

export type RadarHandoffReadiness = {
  ready: boolean;
  headline: string;
  blocks: RadarHandoffBlock[];
};

/**
 * ===== 2026-10-09 · O ARTIGO-MODELO É OBRIGATÓRIO NA ENTREGA (regra do dono) =====
 *
 * "Tudo que é de processos antigos tem que ser substituído pelos novos
 * processos dos pilotos." O envio ao Redator, os CSVs e o MCP passam a exigir
 * a planta CONCLUÍDA (APPROVED) da investigação congelada e do ArticleDNA
 * vigentes — a mesma que `radarArticleBlueprintPick` escolhe. Sem ela, nada é
 * montado pelo modelo editorial antigo: a operação para e oferece organizar
 * (o custo dito no botão antes do clique).
 *
 * A planta não entra no pacote nem no hash (congelamento é sagrado): quem sabe
 * dela informa a prontidão (`articleBlueprint`). Sem a informação, a regra é a
 * de antes, byte a byte — o dossiê canônico não muda.
 */
export type RadarArticleBlueprintDeliveryState = "APPROVED" | "MISSING";

/** O código da recusa do envio por falta de planta: o servidor o devolve; a tela e o MCP o reconhecem. */
export const RADAR_HANDOFF_ARTICLE_BLUEPRINT_MISSING = "radar_handoff_article_blueprint_missing";

/** O bloqueio da planta ausente, com a mesma frase no Relatório, no envio e na rota. */
export function radarArticleBlueprintMissingBlock(): RadarHandoffBlock {
  return {
    code: "ARTICLE_BLUEPRINT_MISSING",
    message: "O envio ao Redator leva o artigo-modelo concluído desta investigação: organize o artigo-modelo da SERP (Pesquisa → Artigo-modelo da SERP).",
    detail: "Nenhuma versão concluída do artigo-modelo vale para o congelamento e o ArticleDNA vigentes (regra de radarArticleBlueprintPick).",
  };
}

/** O fundamento do artigo, como o handoff precisa recebê-lo. */
export type RadarArticleFoundation = {
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
export function radarHandoffReadiness(input: {
  article: RadarArticleFoundation;
  /** A investigação congelada. Sem ela não há contrato — §2. */
  frozen: RadarFrozenEvidenceBundle | null;
  /** O dossiê vivo com a fotografia inteira, quando existir. */
  dossier?: RadarEvidenceBundle | null;
  /** Os fundamentos mudaram depois da investigação? */
  stale?: boolean;
  /**
   * 2026-10-09 · Aditivo: a planta concluída da investigação vigente, quando
   * quem chama a conhece (o Relatório, pelo painel). "MISSING" vira o bloqueio
   * `ARTICLE_BLUEPRINT_MISSING` depois das conferências da investigação.
   * Ausente ou nulo: a prontidão de antes (o dossiê canônico não a passa).
   */
  articleBlueprint?: RadarArticleBlueprintDeliveryState | null;
}): RadarHandoffReadiness {
  const blocks: RadarHandoffBlock[] = [];
  const bloquear = (code: RadarHandoffBlockCode, message: string, detail: string) =>
    blocks.push({ code, message, detail });
  /* 2026-10-09 · a investigação conferida; a planta ausente bloqueia por último (é o passo que falta, não divergência). */
  const fechar = (): RadarHandoffReadiness => {
    if (input.articleBlueprint === "MISSING") blocks.push(radarArticleBlueprintMissingBlock());
    return blocks.length
      ? { ready: false, headline: "Pacote para o Redator bloqueado", blocks }
      : { ready: true, headline: "Pacote para o Redator pronto", blocks: [] };
  };

  /*
   * ============ §17 · O CONGELADO DO GOOGLE DEIXOU DE SER OBRIGATÓRIO ============
   *
   * Ele é a autoridade canônica DAQUELE pipeline, e continua sendo. O que
   * mudou é que YouTube e Amazon congelam em outro lugar: exigir
   * `RadarFrozenEvidenceBundle` deles obrigaria a fabricar um snapshot do
   * Google — que é exatamente o que este gate proíbe.
   *
   * O que passou a ser exigido dos três é o mesmo: um dossiê V3 íntegro, com
   * camada primária, amarrado ao fundamento corrente.
   */
  const dossieV3 = input.dossier || null;
  const frozen = input.frozen;

  /*
   * §3 · CADA PERFIL TEM A PRÓPRIA AUTORIDADE CANÔNICA.
   *
   * No GOOGLE ela é o `finalizedBundle`, e continua obrigatória: um dossiê de
   * páginas sem o congelado daquele pipeline descreveria uma leitura viva,
   * recalculável, sob a aparência de fotografia.
   *
   * No YouTube e na Amazon a fotografia mora em outro campo — e exigir o
   * congelado do Google deles obrigaria a fabricar um snapshot, que é o que
   * §17 proíbe.
   */
  const perfilDoDossie = dossieV3?.primaryResearchProfile ?? "GOOGLE";
  const exigeCongeladoDoGoogle = perfilDoDossie === "GOOGLE";

  if (!frozen && (exigeCongeladoDoGoogle || !dossieV3)) {
    bloquear("NOT_FINALIZED", "Finalize a pesquisa antes de preparar o pacote.", "Nenhum RadarFrozenEvidenceBundle foi encontrado para este artigo.");
    return { ready: false, headline: "Pacote para o Redator bloqueado", blocks };
  }

  if (!frozen && dossieV3) {
    /* O caminho dos perfis que não passam pelo pipeline do Google. */
    try {
      assertRadarEvidenceBundleIntegrity(dossieV3);
    } catch (erro) {
      bloquear("BUNDLE_MUTATED", "O pacote de evidências falhou na verificação de integridade.", erro instanceof Error ? erro.message : String(erro));
      return { ready: false, headline: "Pacote para o Redator bloqueado", blocks };
    }

    if (dossieV3.binding.brandId !== input.article.brandId) {
      bloquear("BRAND_MISMATCH", "A investigação pertence a outra marca.", `Consolidada para ${dossieV3.binding.brandId}; o artigo corrente é de ${input.article.brandId}.`);
    }

    /* §2 · identidade conferida nos três campos, sem adaptação silenciosa. */
    const vinculoV3 = radarEvidenceBundleMatchesArticle(dossieV3, input.article);
    if (!vinculoV3.matches) {
      const code: RadarHandoffBlockCode = dossieV3.binding.articleId !== input.article.articleId
        ? "ARTICLE_MISMATCH"
        : dossieV3.binding.articleDnaVersionId !== input.article.articleDnaVersionId
          ? "ARTICLE_VERSION_MISMATCH"
          : "ARTICLE_HASH_MISMATCH";
      bloquear(code, "A investigação não corresponde mais à versão atual do Article.", vinculoV3.reason);
    }

    if (input.stale) {
      bloquear("STALE", "A investigação não corresponde mais à versão atual do Article.", "Os fundamentos mudaram depois desta investigação; a leitura descreve outra versão do artigo.");
    }

    return fechar();
  }

  /* Daqui para baixo é o caminho do GOOGLE, com o congelado dele em mãos. */
  if (!frozen) return { ready: false, headline: "Pacote para o Redator bloqueado", blocks };

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
    return { ready: false, headline: "Pacote para o Redator bloqueado", blocks };
  }

  if (frozen.binding.brandId !== input.article.brandId) {
    bloquear("BRAND_MISMATCH", "A investigação pertence a outra marca.", `Congelada para ${frozen.binding.brandId}; o artigo corrente é de ${input.article.brandId}.`);
  }

  const vinculo = radarFrozenBundleMatchesArticle(frozen, input.article);
  if (!vinculo.matches) {
    const code: RadarHandoffBlockCode = frozen.binding.articleId !== input.article.articleId
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

  return fechar();
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

  /*
   * ============ A COMPARAÇÃO É DO PERFIL GOOGLE ============
   *
   * O congelado do Google guarda contagens de PÁGINAS. Num artigo de vídeo ou
   * de produto não existe nem o congelado nem a fotografia — e comparar
   * ausência com ausência produziria divergência inventada, bloqueando um
   * handoff legítimo.
   */
  if (!observado) return divergencias;

  divergencias.push(...radarObservedDivergesFromFrozen(observado, frozen));
  return divergencias;
}

/**
 * A fotografia do Google ainda é a que foi congelada?
 *
 * A mesma régua de `radarDossierDivergesFromFrozen`, sem o vínculo do dossiê:
 * o dossiê de YouTube ou de Amazon a usa para decidir se a fotografia do
 * Google finalizado pode viajar como apoio (SDD "SERP no artigo e KGR
 * opcional", R3). Divergiu? Ela não viaja; a leitura de hoje não recebe o
 * carimbo de ontem.
 */
export function radarObservedDivergesFromFrozen(observado: NonNullable<RadarEvidenceBundle["observed"]>, frozen: RadarFrozenEvidenceBundle): string[] {
  const divergencias: string[] = [];
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

/*
 * O envelope V3 de entrega ao Planejador (RadarPlannerHandoffV3, identidade,
 * serialização) saiu com a aposentadoria do Planejador em 2026-10-01. A entrega
 * do dossiê é do Redator (`lib/server/radar-writer-send.ts`).
 */
