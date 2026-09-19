/**
 * ===== A AUTORIDADE ÚNICA DO HANDOFF — RADAR_TO_WRITER_HANDOFF_1 · §5 =====
 *
 * ==================== O DESTINO MUDOU, A ROBUSTEZ NÃO ====================
 *
 * O Planejador deixou de ser etapa operacional. A tentação era trocar a string
 * "planner" por "writer" no serviço antigo e seguir em frente — e isso deixaria
 * os dois destinos vivos no mesmo caminho, com um `if` decidindo para onde o
 * artigo vai. Dois destinos num caminho só é o mesmo defeito que este projeto
 * fechou no PARITY_1, com outro nome.
 *
 * A ORDEM É A MESMA, porque ela não protege o Planejador: ela protege a
 * fronteira.
 *
 *   VALIDAR → RESOLVER DOSSIÊ CANÔNICO → PRONTIDÃO E ELEGIBILIDADE
 *   → REVALIDAR IDENTIDADE → INTEGRIDADE E VÍNCULO DO PACOTE
 *   → CRIAR DOCUMENTO → RELER DESTINO → MOVER ESTEIRA → SUCESSO
 *
 * ==================== O HANDOFF NÃO ESCREVE NO HISTÓRICO ====================
 *
 * Este serviço gravava o recibo como uma VERSÃO NOVA DA ANÁLISE. Entregar um
 * Radar já finalizado criava mais um item num histórico que, medido, chegou a
 * 9,77 MB — e o Postgres cancelou a escrita com 57014, `statement timeout`.
 *
 * Handoff é CONSUMO de estado congelado: ele não investiga, não analisa e não
 * finaliza. O recibo passou a ser o próprio documento do Redator, que já
 * carrega `radarOrigin.evidenceBundleHash` — e a esteira se move gravando
 * apenas a coluna `state`.
 *
 * ==================== FALHA PARCIAL NÃO VIRA SUCESSO ====================
 *
 * Se o documento não puder ser confirmado no readback, a resposta é ERRO.
 * Mentir sucesso ali deixaria um artigo marcado como entregue enquanto o
 * Redator nunca o recebeu.
 *
 * ==================== PROVIDER_CALLS = 0 ====================
 *
 * Consolidar e entregar é ler o que já foi pago.
 */

import { RadarWriterBundleRecordSchema, type RadarAnalysisVersion, type RadarWriterBundleRecord } from "../radar/analysis-contracts.ts";
import { radarFrozenObservedAtOfAnalysis } from "../radar/evidence-bundle-runtime.ts";
import { assertRadarEvidenceBundleIntegrity, radarEvidenceBundleMatchesArticle, type RadarEvidenceBinding, type RadarEvidenceBundle } from "../radar/evidence-bundle.ts";
import type { RadarPlannerHandoffReadiness } from "../radar/planner-handoff.ts";
import { ContentDocumentSchema, type ArticleDNA, type ContentDocument, type SiloDNA, type VersionEnvelope } from "../arquiteto/contracts.ts";
import { buildRadarDocument, radarDocumentId, radarWriterDocumentIdentity, resolveRadarImportEligibility, type RadarImportOutcome } from "../redator/radar-import.ts";
import { RADAR_WRITER_MAY_NOT } from "../redator/writer-handoff.ts";
import { RadarStartError, radarStartPorts } from "./radar-youtube-start.ts";
import { resolveRadarCanonicalDossier } from "./radar-canonical-dossier.ts";
import { RADAR_NO_AUTHORITIES, loadRadarCanonicalAuthorities, type RadarCanonicalAuthorities } from "./radar-canonical-authorities.ts";
import { ArtifactRepository, ContentDocumentRepository, DecisionEventRepository, WorkflowRepository } from "./editorial-repositories.ts";
import { contentHash } from "../arquiteto/versioning.ts";

export class RadarWriterSendError extends Error {
  readonly code: string;
  readonly status: number;
  readonly readiness: RadarPlannerHandoffReadiness | null;
  constructor(code: string, message: string, status = 409, readiness: RadarPlannerHandoffReadiness | null = null) {
    super(message);
    this.name = "RadarWriterSendError";
    this.code = code;
    this.status = status;
    this.readiness = readiness;
  }
}

/** O vocabulário canônico do desfecho, sem inventar estado novo. */
export type RadarWriterHandoffChange =
  | "CREATED"
  | "ALREADY_IMPORTED";

export type RadarWriterSendResult = {
  change: RadarWriterHandoffChange;
  record: RadarWriterBundleRecord;
  analysisVersionId: string;
  bundleBytes: number;
  handoffBytes: number;
  documentId: string;
  outcome: RadarImportOutcome;
  headline: string;
};

/* ============================== as portas ============================== */

type ItemDeWorkflow = {
  id: string;
  marca_id: string;
  article_id: string;
  stage: string;
  state: string;
  lock_version: number;
  payload: unknown;
  source_version_id: string | null;
  source_content_hash: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * ============ AS FALHAS PARCIAIS PRECISAM SER TESTÁVEIS ============
 *
 * "Gravou o recibo e o documento falhou" é o caso que esta ordem existe para
 * fechar, e ele não acontece sozinho num teste contra o banco real.
 */
export type RadarWriterHandoffPorts = {
  loadRadarState: typeof radarStartPorts.loadRadarState;
  loadArticleFoundation: (input: { brandId: string; articleId: string }) => Promise<RadarEvidenceBinding | null>;
  /** O ArticleDNA e o Silo inteiros: a identidade do documento sai deles. */
  loadArticleIdentity: (input: { brandId: string; articleId: string }) => Promise<{ article: VersionEnvelope<ArticleDNA>; silo: VersionEnvelope<SiloDNA> | null } | null>;
  findWorkflowItem: (input: { brandId: string; articleId: string; stage: "radar" }) => Promise<ItemDeWorkflow | null>;
  findDocument: (input: { brandId: string; articleId: string }) => Promise<ContentDocument | null>;
  createDocument: (input: { brandId: string; articleId: string; document: ContentDocument; articleDnaVersionId: string; slug: string; actorId: string }) => Promise<void>;
  /**
   * ===== SÓ O ESTADO VIAJA — §5 =====
   *
   * O payload saiu da assinatura porque ele não muda aqui. Mandá-lo de volta
   * significava reescrever ~9,77 MB de `analysisVersions` para trocar uma
   * palavra — a escrita que o Postgres cancelou com 57014.
   */
  transitionRadar: (input: { id: string; expectedLock: number; actorId: string }) => Promise<void>;
  appendDecision: (input: { brandId: string; workflowItemId: string; articleId: string; fromState: string; actorId: string }) => Promise<void>;
  loadCanonicalAuthorities: (input: { brandId: string; articleId: string; analysis: RadarAnalysisVersion }) => Promise<RadarCanonicalAuthorities>;
};

export const radarWriterHandoffPorts: RadarWriterHandoffPorts = {
  loadRadarState: input => radarStartPorts.loadRadarState(input),

  async loadArticleFoundation({ brandId, articleId }) {
    const artefatos = await new ArtifactRepository().list(brandId);
    const article = artefatos.articles.find(version =>
      version.payload.articleId === articleId && version.payload.brandId === brandId);
    if (!article) return null;
    return {
      brandId,
      articleId,
      articleDnaVersionId: article.versionId,
      articleDnaContentHash: article.contentHash,
    };
  },

  async loadArticleIdentity({ brandId, articleId }) {
    const artefatos = await new ArtifactRepository().list(brandId);
    const article = artefatos.articles.find(version =>
      version.payload.articleId === articleId && version.payload.brandId === brandId);
    if (!article) return null;
    const siloId = article.payload.siloId;
    const silo = siloId
      ? artefatos.silos.filter(version => version.payload.siloId === siloId)
        .sort((esquerda, direita) => direita.versionNumber - esquerda.versionNumber)[0] || null
      : null;
    return { article, silo };
  },

  async findWorkflowItem({ brandId, articleId, stage }) {
    const item = await new WorkflowRepository().findByArticle(brandId, articleId, stage);
    return (item as ItemDeWorkflow | null) || null;
  },

  async findDocument({ brandId, articleId }) {
    const documento = await new ContentDocumentRepository().findByArticle(brandId, articleId);
    return documento;
  },

  async createDocument({ brandId, articleId, document, articleDnaVersionId, slug, actorId }) {
    const hash = await contentHash(document);
    /*
     * PLANO AUSENTE É `null`, e não um id fabricado.
     *
     * A coluna aceita nulo desde a origem. Inventar um `plan:...` que não
     * existe em `editorial_artifact_versions` quebraria a chave estrangeira —
     * e, se não quebrasse, mentiria sobre a existência de um plano.
     */
    await new ContentDocumentRepository().create(brandId, document, articleId, null, articleDnaVersionId, slug, hash, actorId);
  },

  async transitionRadar({ id, expectedLock, actorId }) {
    await new WorkflowRepository().transitionState(id, expectedLock, "sent_writer", actorId);
  },

  async loadCanonicalAuthorities({ brandId, articleId, analysis }) {
    const artefatos = await new ArtifactRepository().list(brandId);
    const article = artefatos.articles.find(version =>
      version.payload.articleId === articleId && version.payload.brandId === brandId);
    if (!article) return RADAR_NO_AUTHORITIES;
    return loadRadarCanonicalAuthorities({ brandId, articleId, article, analysis });
  },

  async appendDecision({ brandId, workflowItemId, articleId, fromState, actorId }) {
    await new DecisionEventRepository().append({
      marcaId: brandId, workflowItemId, articleId,
      eventType: "import_writer", fromState, toState: "sent_writer", actorId,
    });
  },
};

/* ============================== o serviço ============================== */

export async function sendRadarToWriter(entrada: {
  brandId: string;
  articleId: string;
  actorId: string;
  sentAt: string;
  /** A versão que a tela mostrava. Divergiu, a tela está velha. */
  displayedAnalysisVersionId?: string | null;
}, portas: RadarWriterHandoffPorts = radarWriterHandoffPorts): Promise<RadarWriterSendResult> {
  const estado = await portas.loadRadarState({ brandId: entrada.brandId, articleId: entrada.articleId });
  const corrente = estado?.analyses.slice().sort((esquerda, direita) => direita.versionNumber - esquerda.versionNumber)[0] || null;
  if (!estado || !corrente) {
    throw new RadarStartError("radar_item_not_found", "Item Radar não encontrado para este artigo.", 404);
  }

  /*
   * ============ O FUNDAMENTO CORRENTE, LIDO DO ARQUITETO ============
   *
   * A identidade NÃO vem da análise: ela viria envelhecida junto com a
   * evidência, e um dossiê antigo pareceria atual para sempre.
   */
  const article = await portas.loadArticleFoundation(entrada);
  if (!article) {
    throw new RadarWriterSendError("article_dna_not_found", "O ArticleDNA canônico deste artigo não foi encontrado.", 404);
  }

  const radarItem = await portas.findWorkflowItem({ brandId: entrada.brandId, articleId: entrada.articleId, stage: "radar" });
  if (!radarItem) {
    throw new RadarWriterSendError("radar_workflow_item_not_found", "O item do Radar não foi encontrado no fluxo operacional.", 404);
  }

  /*
   * ===== READINESS_FIX_1 · A ESTEIRA NÃO É A AUTORIDADE DE FINALIZAÇÃO =====
   *
   * Aqui existia `if (radarItem.state !== "approved") recusa`. Ela veio
   * copiada do caminho do Planejador, e estava errada nos dois.
   *
   * `editorial_workflow_items.state` é o estado da ESTEIRA, e o fluxo
   * operacional vigente — `START → ANALYZE → FINALIZE` — nunca o move. Uma
   * linha nasce `research_pending` e continua `research_pending` depois de uma
   * investigação inteira finalizada; só o fluxo ANTIGO por abas, com o botão
   * "Aprovar SERP", produzia `approved`.
   *
   * O efeito era o pior desfecho possível: o servidor recusava um artigo
   * finalizado dizendo "aprove o Radar" — mandando a pessoa procurar um botão
   * que o fluxo atual não tem.
   *
   * A autoridade de "esta investigação está concluída" é a prontidão canônica,
   * conferida logo abaixo: perfil resolvido a partir da fotografia congelada,
   * dossiê V3 íntegro e vínculo com o ArticleDNA corrente. Ela não tem segunda
   * opinião — e uma segunda aprovação, aqui, seria pedir ao USER que aprovasse
   * duas vezes a mesma coisa.
   */

  const documentoExistente = await portas.findDocument({ brandId: entrada.brandId, articleId: entrada.articleId });

  const autoridades = await portas.loadCanonicalAuthorities({
    brandId: entrada.brandId, articleId: entrada.articleId, analysis: corrente,
  });

  /*
   * ===== §3 · A AUTORIDADE CANÔNICA CONTINUA SENDO A MESMA =====
   *
   * `loadRadarCanonicalAuthorities → resolveRadarCanonicalDossier` não mudou e
   * não podia mudar: o que este gate troca é ONDE o recibo mora, não a
   * pesquisa. SERP, Blueprint, contexto de keyword, vídeo, especialista e
   * shortlist da Amazon são LIDOS do que já está congelado.
   */
  /*
   * ===== IDEMPOTÊNCIA DE VERDADE: O HASH NÃO PODE DEPENDER DA HORA DO CLIQUE =====
   *
   * `observedAt` entra no hash do dossiê. Resolver com `sentAt` fazia cada
   * clique produzir um pacote "novo", e o segundo envio recusava com "já
   * existe documento com pacote anterior" — sobre uma investigação idêntica.
   *
   * O instante da fotografia é o do congelamento. `sentAt` só entra quando
   * não há congelamento nenhum — e aí a resolução recusa antes por
   * `radar_research_not_finalized`, então o fallback nunca vira hash.
   */
  const observedAt = radarFrozenObservedAtOfAnalysis(corrente.payload) ?? entrada.sentAt;
  const canonico = resolveRadarCanonicalDossier({ analysis: corrente, article, observedAt, authorities: autoridades });
  if (!canonico.ok) {
    throw new RadarWriterSendError(
      canonico.code,
      canonico.code === "radar_research_not_finalized"
        ? "Finalize a investigação antes de enviar ao Redator."
        : canonico.reason,
    );
  }

  const dossie = canonico.dossier;
  const bundle = dossie.bundle;

  /*
   * ============ §8 · A PRONTIDÃO É A DO RADAR, E SÓ ============
   *
   * O gate não pede passagem pelo Planejador nem segunda aprovação: ele pede
   * ArticleDNA válido, investigação finalizada, dossiê canônico e Blueprint
   * íntegros. É o que esta prontidão responde.
   */
  const prontidao = dossie.readiness;

  const identidade = await portas.loadArticleIdentity(entrada);
  if (!identidade) {
    throw new RadarWriterSendError("article_dna_not_found", "O ArticleDNA canônico deste artigo não foi encontrado.", 404);
  }

  /*
   * ===== A ELEGIBILIDADE É A DO DOMÍNIO, não uma segunda política =====
   *
   * `resolveRadarImportEligibility` já decide marca, identidade, prontidão,
   * tela velha e documento existente. Repetir essas regras aqui produziria
   * duas respostas para "este artigo pode entrar no Redator?".
   */
  const elegibilidade = resolveRadarImportEligibility({
    brandId: entrada.brandId,
    dossier: dossie,
    displayedAnalysisVersionId: entrada.displayedAnalysisVersionId ?? null,
    existingDocument: documentoExistente,
  });

  const documentId = radarDocumentId(entrada.brandId, entrada.articleId);

  if (!elegibilidade.eligible && elegibilidade.outcome === "bloqueado") {
    throw new RadarWriterSendError("radar_handoff_blocked", elegibilidade.reason, 409, prontidao);
  }

  /*
   * ===== §6 · O RECIBO É O DOCUMENTO — e é ele que dá idempotência =====
   *
   * Antes, o recibo era gravado como uma VERSÃO NOVA DA ANÁLISE. Entregar um
   * Radar já finalizado criava mais uma versão de um histórico que, medido,
   * chegou a 9,77 MB — e o Postgres cancelou a escrita com 57014.
   *
   * Handoff é CONSUMO de estado congelado. Ele não investiga, não analisa e
   * não finaliza; logo, não tem por que escrever no histórico da investigação.
   *
   * O documento do Redator já carrega `radarOrigin.evidenceBundleHash`: ele
   * identifica exatamente qual pacote foi entregue. Repetir o envio compara
   * esse hash e reconhece a entrega em vez de refazê-la — a mesma pergunta,
   * respondida por quem realmente tem a resposta.
   */
  const entregueAntes = documentoExistente?.schemaVersion === 2 ? documentoExistente.radarOrigin : null;
  const mesmoDossie = entregueAntes?.evidenceBundleHash === bundle.bundleHash;

  const recibo = RadarWriterBundleRecordSchema.parse({
    bundleVersion: bundle.bundleVersion,
    bundleId: bundle.bundleId,
    bundleHash: bundle.bundleHash,
    primaryResearchProfile: bundle.primaryResearchProfile,
    binding: bundle.binding,
    handoffVersion: 1,
    sentAt: entregueAntes?.importedAt || entrada.sentAt,
    sentBy: entregueAntes?.importedBy || entrada.actorId,
    previousBundleHash: null,
    /* §12 · as invariantes viajam com o pacote, não só no documento. */
    writerMayNot: [...RADAR_WRITER_MAY_NOT],
    documentId,
    bundle,
  });

  if (mesmoDossie) {
    return {
      change: "ALREADY_IMPORTED",
      record: recibo,
      analysisVersionId: corrente.versionId,
      bundleBytes: JSON.stringify(bundle).length,
      handoffBytes: JSON.stringify(recibo).length,
      documentId,
      outcome: "ja_existente",
      headline: "O documento deste pacote já existe no Redator.",
    };
  }

  /*
   * ===== §21 · DOCUMENTO ANTERIOR NÃO É SOBRESCRITO =====
   *
   * Alguém pode já ter escrito em cima do pacote anterior. Trocar a base por
   * baixo apagaria esse trabalho sem ninguém pedir — e o Radar não é dono do
   * que o Redator escreveu.
   */
  if (!elegibilidade.eligible && elegibilidade.outcome === "atualizacao_disponivel") {
    throw new RadarWriterSendError("radar_handoff_document_exists", elegibilidade.reason, 409);
  }

  /*
   * ===== §4 · AS GARANTIAS NÃO SAÍRAM COM A ESCRITA =====
   *
   * A integridade e o vínculo eram conferidos no RECIBO RELIDO. Sem a escrita
   * não há releitura — e deixar isso implícito seria trocar uma prova por uma
   * suposição.
   *
   * Aqui eles são conferidos sobre o pacote que vai ser entregue, que é o que
   * interessa: o hash é recalculado sobre o conteúdo, e o vínculo é confrontado
   * com o fundamento corrente do Arquiteto.
   */
  assertRadarEvidenceBundleIntegrity(bundle as RadarEvidenceBundle);
  const vinculo = radarEvidenceBundleMatchesArticle(bundle as RadarEvidenceBundle, article);
  if (!vinculo.matches) {
    throw new RadarWriterSendError("radar_handoff_binding_mismatch", vinculo.reason, 409, prontidao);
  }

  const record = recibo;
  const analysisVersionId = corrente.versionId;
  const change: RadarWriterHandoffChange = "CREATED";

  /* ==================== a revalidação final ==================== */

  /*
   * O FUNDAMENTO PODE TER MUDADO ENTRE MONTAR E ENTREGAR.
   *
   * São duas idas ao banco e uma escrita no meio. Criar um documento sobre
   * pacote stale faria o Redator escrever sobre evidência de um artigo que já
   * é outro — exatamente o que a identidade existe para impedir.
   */
  const fundamentoAgora = await portas.loadArticleFoundation(entrada);
  if (!fundamentoAgora
    || fundamentoAgora.articleDnaVersionId !== article.articleDnaVersionId
    || fundamentoAgora.articleDnaContentHash !== article.articleDnaContentHash) {
    throw new RadarWriterSendError(
      "radar_handoff_blocked_stale",
      "O ArticleDNA mudou durante o envio: o pacote descreve outra versão do artigo e não foi entregue ao Redator.",
    );
  }
  if (record!.bundleHash !== bundle.bundleHash && !mesmoDossie) {
    throw new RadarWriterSendError("radar_handoff_bundle_mismatch", "O pacote gravado não é o que foi montado nesta operação.", 502);
  }

  /* ==================== a criação do documento ==================== */

  const radarAtual = await portas.findWorkflowItem({ brandId: entrada.brandId, articleId: entrada.articleId, stage: "radar" });
  if (!radarAtual) {
    throw new RadarWriterSendError("radar_workflow_item_not_found", "O item do Radar não foi encontrado no fluxo operacional.", 404);
  }

  /*
   * ===== READINESS_FIX_1 · O QUE PRECISA SER RECONFERIDO AQUI =====
   *
   * Entre a leitura inicial e este ponto houve uma escrita e duas idas ao
   * banco. O que pode ter mudado e importa é o FUNDAMENTO — e ele já foi
   * reconferido acima, em `radar_handoff_blocked_stale`.
   *
   * O estado da esteira não entra: ele não descreve a investigação, e conferi-
   * lo de novo só reintroduziria a recusa que este gate existe para remover.
   */

  const partes = radarWriterDocumentIdentity({
    brandId: entrada.brandId, article: identidade.article, silo: identidade.silo,
  });

  const documento = ContentDocumentSchema.parse(buildRadarDocument({
    documentId,
    dossier: dossie,
    radarItemId: radarAtual.id,
    title: partes.title,
    slug: partes.slug,
    brandDnaRef: partes.brandDnaRef,
    siloDnaRef: partes.siloDnaRef,
    keywordDnaRefs: partes.keywordDnaRefs,
    actorUserId: entrada.actorId,
    now: entrada.sentAt,
  }));

  await portas.createDocument({
    brandId: entrada.brandId,
    articleId: entrada.articleId,
    document: documento,
    articleDnaVersionId: article.articleDnaVersionId,
    slug: partes.slug,
    actorId: entrada.actorId,
  });

  /* ================= o readback do DESTINO ================= */

  /*
   * O ÚLTIMO PASSO ANTES DO SUCESSO.
   *
   * Sem ele, "enviado" significaria apenas que a escrita não lançou exceção. O
   * que a pessoa precisa saber é que o Redator TEM o documento — e isso só o
   * destino relido responde.
   */
  const destino = await portas.findDocument({ brandId: entrada.brandId, articleId: entrada.articleId });
  if (!destino) {
    throw new RadarWriterSendError(
      "radar_handoff_destination_readback_failed",
      "O documento não pôde ser confirmado no Redator. O pacote está gravado; repita o envio para completar a entrega.",
      502,
    );
  }
  if (destino.id !== documentId) {
    throw new RadarWriterSendError("radar_handoff_destination_mismatch", "O documento confirmado no Redator é de outro artigo.", 502);
  }
  if (destino.schemaVersion !== 2 || destino.radarOrigin.evidenceBundleHash !== record!.bundleHash) {
    throw new RadarWriterSendError(
      "radar_handoff_destination_mismatch",
      "O documento confirmado no Redator não descreve o pacote desta entrega.",
      502,
    );
  }

  /*
   * ===== READINESS_FIX_1 · A ESTEIRA SEGUE O FATO, não o contrário =====
   *
   * A condição era `state === "approved"`, e por isso a esteira de um artigo
   * finalizado pelo fluxo atual nunca se movia: ela ficava parada em
   * `research_pending` enquanto o documento já existia no Redator — dois
   * lugares contando histórias diferentes sobre o mesmo artigo.
   *
   * Agora ela se move a partir de QUALQUER estado, porque o fato que ela passa
   * a registrar já aconteceu: o documento foi criado e confirmado no readback.
   * Repetir o envio não repete a escrita — quem já está em `sent_writer` não é
   * transicionado de novo.
   */
  if (radarAtual.state !== "sent_writer") {
    await portas.transitionRadar({
      id: radarAtual.id, expectedLock: radarAtual.lock_version, actorId: entrada.actorId,
    });
    await portas.appendDecision({
      brandId: entrada.brandId, workflowItemId: radarAtual.id,
      articleId: entrada.articleId, fromState: radarAtual.state, actorId: entrada.actorId,
    });
  }

  return {
    change,
    record,
    analysisVersionId,
    bundleBytes: JSON.stringify(record.bundle).length,
    handoffBytes: JSON.stringify(record).length,
    documentId,
    outcome: "criado",
    /*
     * "NEW_VERSION" saiu do vocabulário do desfecho porque a entrega deixou de
     * criar versão de coisa nenhuma. O que existe agora é: criou o documento,
     * ou ele já existia com este mesmo pacote.
     */
    headline: "Pacote entregue ao Redator.",
  };
}
