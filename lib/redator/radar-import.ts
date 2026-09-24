import type { ArticleDNA, ContentDocument, ContentDocumentV2, RadarDocumentOrigin, RadarWriterDossier, SiloDNA, VersionEnvelope, VersionReference } from "../arquiteto/contracts.ts";
import { legacyVersionReference, toVersionReference } from "../arquiteto/versioning.ts";
import { radarWriterMayNotFor } from "./writer-handoff.ts";
import { radarWriterSubjectOf, radarWriterSubjectTurnLines } from "./radar-subject-turn.ts";
import type { RadarCanonicalDossier } from "../server/radar-canonical-dossier.ts";

/**
 * ===== ENTRADA DIRETA RADAR → REDATOR — decisão, sem transporte =====
 *
 * Domínio puro: sem storage, sem fetch, sem IA, sem SERP. Decide o que
 * acontece com cada artigo de um lote e monta o documento; quem grava e relê é
 * o serviço do servidor.
 *
 * ==================== POR QUE SEM CONTENTPLAN ====================
 *
 * O Radar já resolve tudo que o Redator precisa: análise, blueprint, dossiê com
 * hash, contexto de keywords, fundamentos do artigo. Exigir um ContentPlan no
 * meio obrigava a criar um artefato que ninguém pediu, só para satisfazer a
 * assinatura de `startWriting`.
 *
 * O plano não deixou de existir — deixou de ser requisito. Documento v1 segue
 * nascendo dele, e este caminho não toca em `plannerItems`.
 *
 * ==================== O QUE ESTE MÓDULO NÃO FAZ ====================
 *
 * Não inventa título, evidência ou URL. Não resolve pendência. Não substitui
 * documento existente. Não marca o Radar como "enviado ao Planejador" — o envio
 * ao Redator é outro fato, e registrá-lo com o nome errado apagaria a diferença.
 */

/* ------------------------------- desfechos ------------------------------- */

export const RADAR_IMPORT_OUTCOMES = [
  "criado",
  "ja_existente",
  "atualizacao_disponivel",
  "bloqueado",
  "falha",
] as const;
export type RadarImportOutcome = (typeof RADAR_IMPORT_OUTCOMES)[number];

export const RADAR_IMPORT_BLOCK_CODES = [
  "PACOTE_INEXISTENTE",
  "PACOTE_NAO_FINALIZADO",
  "PACOTE_DESATUALIZADO",
  "IDENTIDADE_INCONSISTENTE",
  "OUTRA_MARCA",
  "NAO_AUTORIZADO",
] as const;
export type RadarImportBlockCode = (typeof RADAR_IMPORT_BLOCK_CODES)[number];

export type RadarImportItemResult = {
  articleId: string;
  outcome: RadarImportOutcome;
  /** Nomeia o registro: sem isto "bloqueado" não diz de quem se fala. */
  label: string;
  code: RadarImportBlockCode | null;
  reason: string | null;
  documentId: string | null;
};

/* ------------------------------ elegibilidade ---------------------------- */

export type RadarImportEligibilityInput = {
  brandId: string;
  dossier: RadarCanonicalDossier;
  /** A versão que a tela mostrava. Divergiu, a tela está velha. */
  displayedAnalysisVersionId?: string | null;
  /** Documento já existente para este artigo, de qualquer versão. */
  existingDocument?: Pick<ContentDocument, "id" | "schemaVersion"> & {
    radarOrigin?: RadarDocumentOrigin;
  } | null;
};

export type RadarImportEligibility =
  | { eligible: true; outcome: "criado" }
  | { eligible: false; outcome: Exclude<RadarImportOutcome, "criado">; code: RadarImportBlockCode | null; reason: string };

/**
 * O QUE ACONTECE COM ESTE ARTIGO — antes de qualquer escrita.
 *
 * A ordem das verificações importa. Identidade e marca vêm primeiro porque um
 * pacote de outra marca não deve nem ser descrito como "desatualizado": ele não
 * deveria ter chegado até aqui.
 */
export function resolveRadarImportEligibility(input: RadarImportEligibilityInput): RadarImportEligibility {
  const { dossier } = input;
  const article = dossier.article;

  if (article.brandId !== input.brandId) {
    return {
      eligible: false, outcome: "bloqueado", code: "OUTRA_MARCA",
      reason: `O pacote pertence à marca ${article.brandId}.`,
    };
  }

  if (!article.articleDnaVersionId || !article.articleDnaContentHash) {
    return {
      eligible: false, outcome: "bloqueado", code: "IDENTIDADE_INCONSISTENTE",
      reason: "O fundamento do artigo não traz versão e hash do ArticleDNA.",
    };
  }

  if (dossier.analysis.payload.articleId !== article.articleId) {
    return {
      eligible: false, outcome: "bloqueado", code: "IDENTIDADE_INCONSISTENTE",
      reason: `A análise é do artigo ${dossier.analysis.payload.articleId}, não de ${article.articleId}.`,
    };
  }

  /*
   * A PRONTIDÃO É A CANÔNICA, não o texto da tela.
   *
   * `radarPlannerHandoffReadiness` é a mesma regra que o Planejador usa. Ler
   * "Finalizado" na interface e confiar seria aceitar como prova aquilo que a
   * própria tela pode estar mostrando errado.
   */
  if (!dossier.readiness.ready) {
    return {
      eligible: false, outcome: "bloqueado", code: "PACOTE_NAO_FINALIZADO",
      reason: dossier.readiness.blocks.length
        ? dossier.readiness.blocks.map(block => block.message || block.code).join(" · ")
        : dossier.readiness.headline,
    };
  }

  const exibida = input.displayedAnalysisVersionId;
  if (exibida && exibida !== dossier.analysis.versionId) {
    return {
      eligible: false, outcome: "bloqueado", code: "PACOTE_DESATUALIZADO",
      reason: `A tela mostrava ${exibida} e a análise atual é ${dossier.analysis.versionId}.`,
    };
  }

  /*
   * DOCUMENTO EXISTENTE É PRESERVADO — inclusive legado.
   *
   * Origem diferente vira aviso, não substituição: alguém pode já ter escrito
   * em cima do pacote anterior, e trocar a base por baixo apagaria esse
   * trabalho sem ninguém pedir.
   */
  const existente = input.existingDocument;
  if (existente) {
    const mesmoPacote = existente.schemaVersion === 2
      && existente.radarOrigin?.evidenceBundleHash === dossier.bundle.bundleHash;
    if (mesmoPacote) {
      return { eligible: false, outcome: "ja_existente", code: null, reason: "O documento deste pacote já existe." };
    }
    return {
      eligible: false, outcome: "atualizacao_disponivel", code: null,
      reason: existente.schemaVersion === 1
        ? "Já existe documento deste artigo vindo de plano editorial. A base não é substituída aqui."
        : "Já existe documento deste artigo com pacote anterior. A base não é substituída aqui.",
    };
  }

  return { eligible: true, outcome: "criado" };
}

/* -------------------------------- montagem ------------------------------- */

export type BuildRadarDocumentInput = {
  documentId: string;
  dossier: RadarCanonicalDossier;
  /**
   * Vem do RadarItem, nao do dossie.
   *
   * O dossie nao carrega `radarItemId`, titulo nem slug — o `profile` dele e
   * a camada de pesquisa (YOUTUBE/AMAZON/GOOGLE), nao um perfil editorial.
   * Derivar titulo dali produziria "GOOGLE" como titulo do artigo.
   */
  radarItemId: string;
  title: string;
  slug: string;
  brandDnaRef: ContentDocumentV2["brandDnaRef"];
  siloDnaRef: ContentDocumentV2["siloDnaRef"];
  keywordDnaRefs: ContentDocumentV2["keywordDnaRefs"];
  actorUserId: string;
  now: string;
  /**
   * ===== O ASSUNTO DO ArticleDNA FIXADO — SDD do Assunto, F4.1 =====
   *
   * `ArticleDNA.subject` da MESMA versão que o documento fixa (quem envia o
   * lê junto da identidade). Opcional: sem ele, o documento sai byte a byte
   * como antes — `writerMayNot` de sempre e `editorialContext` vazio.
   */
  subject?: ArticleDNA["subject"] | null;
};

/**
 * ===== §9 · A IDENTIDADE DO DOCUMENTO VEM DO ARTICLEDNA, NÃO DO DOSSIÊ =====
 *
 * Mesma resolução que o ContentPlan fazia. Escrevê-la de novo aqui, com outro
 * critério, criaria duas leituras de "qual é a keyword deste artigo" — e a
 * divergência apareceria num artigo escrito, não num teste.
 *
 * `legacyVersionReference` é o caminho declarado para quando a versão real não
 * existe: referência determinística e reconhecível como tal, em vez de id
 * inventado que se confunde com versão de verdade.
 */
export function radarWriterDocumentIdentity(input: {
  brandId: string;
  article: VersionEnvelope<ArticleDNA>;
  silo: VersionEnvelope<SiloDNA> | null;
}): {
  title: string;
  slug: string;
  brandDnaRef: VersionReference;
  siloDnaRef: VersionReference;
  keywordDnaRefs: VersionReference[];
} {
  const referencias = input.article.payload.keywordReferences.map(referencia => ({
    entityId: referencia.keywordId,
    versionId: referencia.keywordDnaVersionId,
    contentHash: referencia.keywordDnaContentHash,
  }));

  return {
    title: input.article.payload.promise,
    slug: input.article.payload.suggestedSlug,
    brandDnaRef: legacyVersionReference(`brand:${input.brandId}`, { brandId: input.brandId }),
    siloDnaRef: input.silo
      ? toVersionReference(input.silo)
      : legacyVersionReference(`silo:${input.article.payload.siloId || input.article.payload.articleId}`, { brandId: input.brandId }),
    keywordDnaRefs: referencias.length
      ? referencias
      : [legacyVersionReference(`keyword:${input.article.payload.articleId}`, { brandId: input.brandId, editorialUnitId: input.article.payload.articleId })],
  };
}

/**
 * ===== §9 · A ESTRUTURA CANÔNICA QUE VIAJA DENTRO DO DOCUMENTO =====
 *
 * O dossiê INTEIRO, não um resumo dele e não o markdown. O markdown continua
 * existindo como read model portátil; ele serve para colar em outra
 * ferramenta, e não para ser a única coisa que o Redator interno recebe.
 */
export function radarWriterDossierOf(dossier: RadarCanonicalDossier, subject?: unknown): RadarWriterDossier {
  return {
    bundleId: dossier.bundle.bundleId,
    bundleHash: dossier.bundle.bundleHash,
    researchProfile: dossier.profile,
    keywordContext: {
      principal: dossier.keywordContext.principal,
      secondary: [...dossier.keywordContext.secondary],
      narrativeReinforcements: [...dossier.keywordContext.narrativeReinforcements],
      resolution: dossier.keywordContext.resolution,
    },
    /*
     * SDD do Assunto, F4.1 · com Assunto, a proibição "trocar ou remover o
     * Assunto declarado" é GRAVADA aqui, e todas as ferramentas do Redator
     * (fundamentos, material por seção, fatias, briefing, painel) leem a
     * mesma lista. Sem Assunto, a lista de sempre, com o mesmo hash.
     */
    writerMayNot: [...radarWriterMayNotFor(radarWriterSubjectOf(subject))],
    bundle: dossier.bundle as unknown as Record<string, unknown>,
  };
}

/**
 * O DOCUMENTO, MONTADO DO QUE JÁ EXISTE.
 *
 * Nasce em `planejado` — rascunho. Nenhuma aprovação, nenhuma publicação
 * automática. Título vem da identidade do pacote; nada é redigido aqui.
 */
export function buildRadarDocument(input: BuildRadarDocumentInput): ContentDocumentV2 {
  const { dossier } = input;
  const article = dossier.article;

  return {
    schemaVersion: 2,
    id: input.documentId,
    title: input.title.trim() || article.articleId,
    status: "planejado",
    brandDnaRef: input.brandDnaRef,
    keywordDnaRefs: input.keywordDnaRefs,
    siloDnaRef: input.siloDnaRef,
    articleDnaRef: {
      entityId: article.articleId,
      versionId: article.articleDnaVersionId,
      contentHash: article.articleDnaContentHash!,
    },
    serpSnapshotRefs: [],
    evidenceRefs: [],
    sourceIds: [],
    linkMap: [],
    instructions: [],
    blocks: [],
    editorContent: null,
    radarOrigin: {
      radarItemId: input.radarItemId,
      articleId: article.articleId,
      analysisVersionId: dossier.analysis.versionId,
      analysisVersionNumber: dossier.analysis.versionNumber,
      evidenceBundleHash: dossier.bundle.bundleHash,
      articleDnaVersionId: article.articleDnaVersionId,
      articleDnaContentHash: article.articleDnaContentHash!,
      siloDnaVersionId: input.siloDnaRef.versionId || null,
      importedAt: input.now,
      importedBy: input.actorUserId,
    },
    importedContext: {
      source: "radar",
      capturedAt: input.now,
      /*
       * §9 · O DOSSIÊ CANÔNICO CHEGA AQUI.
       *
       * Sem ele o documento seria um ponteiro: hash, id de análise e nada que
       * sustente uma frase. Quem escreve teria de voltar ao Radar para saber o
       * que a SERP observou — e quem não voltasse escreveria sem evidência.
       */
      dossier: radarWriterDossierOf(dossier, input.subject),
      /*
       * SDD do Assunto, F4.1 · ONDE VIRAR E A DIREÇÃO DO H1.
       *
       * A sugestão do Radar mora no artigo-modelo, que não viaja no dossiê
       * (o bundle é `.strict()` e tem hash). Vão só linhas curtas, derivadas
       * dele e do Assunto do ArticleDNA fixado — o dossiê continua lido, não
       * copiado (invariante 78). Sem Assunto, `[]`, como sempre foi.
       */
      editorialContext: radarWriterSubjectTurnLines({
        subject: input.subject,
        turn: dossier.authorities?.google?.articleModel?.declaredSubject ?? null,
        principal: dossier.keywordContext.principal,
      }),
      visualGuidance: [],
      pendingDecisions: [],
    },
    metadata: {
      slug: input.slug.trim(),
      principalKeyword: dossier.keywordContext.principal || "",
      metaTitle: "", metaDescription: "", socialTitle: "", socialDescription: "",
      canonical: null, indexationStatus: "noindex", plannedImages: [],
    },
  };
}

/* ------------------------------- pendências ------------------------------ */

/**
 * PENDÊNCIA BLOQUEANTE IMPEDE APROVAR — não impede escrever.
 *
 * Foi decisão explícita permitir o rascunho com pendências declaradas. O que
 * elas bloqueiam é a aprovação final e a transferência como conteúdo aprovado
 * para Publicações. Confundir as duas coisas travaria o trabalho para proteger
 * uma etapa que ainda está longe.
 */
export function radarDocumentApprovalBlocks(document: ContentDocument): string[] {
  if (document.schemaVersion !== 2) return [];
  return document.importedContext.pendingDecisions
    .filter(pending => pending.blocking)
    .map(pending => `${pending.label}: ${pending.reason}`);
}

export const radarDocumentCanBeApproved = (document: ContentDocument): boolean =>
  radarDocumentApprovalBlocks(document).length === 0;

/**
 * Identidade determinística do documento por marca e artigo.
 *
 * É o que dá idempotência: repetir a importação do mesmo artigo não cria um
 * segundo documento, porque o id não é sorteado.
 */
export const radarDocumentId = (brandId: string, articleId: string): string =>
  `redator:${brandId}:${articleId}`;
