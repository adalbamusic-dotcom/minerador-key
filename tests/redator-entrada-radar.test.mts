import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRadarDocument,
  radarDocumentApprovalBlocks,
  radarDocumentCanBeApproved,
  radarDocumentId,
  resolveRadarImportEligibility,
} from "../lib/redator/radar-import.ts";
import {
  ContentDocumentSchema,
  ContentDocumentV2Schema,
  documentContentPlanRef,
  documentWritingBrief,
  isRadarOriginDocument,
} from "../lib/arquiteto/contracts.ts";
import { OperationalPublicationSchema } from "../lib/editorial/operational-flow.ts";
import type { RadarCanonicalDossier } from "../lib/server/radar-canonical-dossier.ts";

/**
 * ENTRADA DIRETA RADAR → REDATOR.
 *
 * O documento nasce do pacote canônico do Radar, sem ContentPlan e sem passar
 * pelo Planejador.
 */

const BRAND = "brand-1";
const ARTICLE = "article-1";
const HASH = `sha256:${"a".repeat(64)}`;

const ref = (entityId: string, versionId: string) => ({ entityId, versionId, contentHash: HASH });

const dossie = (overrides: Record<string, unknown> = {}): RadarCanonicalDossier => ({
  analysis: {
    versionId: "analysis-v3",
    versionNumber: 3,
    payload: { articleId: ARTICLE },
  },
  article: {
    brandId: BRAND,
    articleId: ARTICLE,
    articleDnaVersionId: "art-v2",
    articleDnaContentHash: HASH,
  },
  profile: "GOOGLE",
  blueprintView: {},
  bundle: { bundleId: "bundle-id-1", bundleHash: "bundle-hash-1" },
  authorities: null,
  keywordContext: { principal: "serum facial", secondary: [], narrativeReinforcements: [], resolution: "ARTICLE_DNA_HYDRATION" },
  readiness: { ready: true, headline: "Pronto", blocks: [] },
  ...overrides,
} as never);

const montar = (over: Record<string, unknown> = {}) => buildRadarDocument({
  documentId: radarDocumentId(BRAND, ARTICLE),
  dossier: dossie(),
  radarItemId: "radar:1",
  title: "Serum facial para principiantes",
  slug: "serum-facial-principiantes",
  brandDnaRef: ref("brand-dna", "brand-v1"),
  siloDnaRef: ref("silo-1", "silo-v1"),
  keywordDnaRefs: [ref("kw-1", "kw-v1")],
  actorUserId: "user-1",
  now: "2026-09-17T12:00:00.000Z",
  ...over,
} as never);

/* ---- 1 · sem ContentPlan, sem Planejador ------------------------------- */

test("01 · o documento v2 nasce sem ContentPlan e o schema RECUSA a chave", () => {
  const documento = montar();
  assert.equal(documento.schemaVersion, 2);
  assert.equal(ContentDocumentV2Schema.safeParse(documento).success, true);

  // Nem opcional, nem id fictício: a chave é recusada.
  const comPlano = { ...documento, contentPlanRef: ref("plan", "plan-v1") };
  assert.equal(ContentDocumentV2Schema.safeParse(comPlano).success, false,
    "um documento de origem Radar não pode carregar referência de plano");
});

test("02 · o acessor devolve null para v2 e o plano real para v1", () => {
  const v2 = montar();
  assert.equal(documentContentPlanRef(v2), null);
  assert.equal(documentWritingBrief(v2), undefined, "v2 não tem briefing de plano");
  assert.equal(isRadarOriginDocument(v2), true);
});

test("03 · a procedência amarra o documento ao pacote DAQUELA rodada", () => {
  const documento = montar();
  assert.equal(documento.radarOrigin.analysisVersionId, "analysis-v3");
  assert.equal(documento.radarOrigin.analysisVersionNumber, 3);
  assert.equal(documento.radarOrigin.evidenceBundleHash, "bundle-hash-1");
  assert.equal(documento.radarOrigin.articleDnaVersionId, "art-v2");
  assert.equal(documento.radarOrigin.importedBy, "user-1");
});

test("04 · nasce em rascunho, sem aprovação nem publicação automática", () => {
  assert.equal(montar().status, "planejado");
});

test("05 · nada é inventado: título e slug vêm do RadarItem, não do perfil", () => {
  // `profile` do dossiê é a camada de pesquisa (GOOGLE/YOUTUBE/AMAZON).
  // Derivar título dali produziria "GOOGLE" como título do artigo.
  const documento = montar();
  assert.equal(documento.title, "Serum facial para principiantes");
  assert.equal(documento.metadata.slug, "serum-facial-principiantes");
  assert.equal(documento.metadata.principalKeyword, "serum facial");
  // Sem evidência ou URL fabricada.
  assert.deepEqual(documento.evidenceRefs, []);
  assert.equal(documento.metadata.canonical, null);
  // Título vazio cai no articleId, não numa invenção.
  assert.equal(montar({ title: "   " }).title, ARTICLE);
});

/* ---- 2 · elegibilidade -------------------------------------------------- */

test("06 · pacote finalizado e artigo novo: criado", () => {
  const resultado = resolveRadarImportEligibility({ brandId: BRAND, dossier: dossie() });
  assert.deepEqual(resultado, { eligible: true, outcome: "criado" });
});

test("07 · pacote não finalizado é recusado pela prontidão CANÔNICA", () => {
  const resultado = resolveRadarImportEligibility({
    brandId: BRAND,
    dossier: dossie({
      readiness: { ready: false, headline: "Falta revisar", blocks: [{ code: "SERP", message: "SERP sem revisão", detail: "" }] },
    }),
  });
  assert.equal(resultado.eligible, false);
  if (resultado.eligible) return;
  assert.equal(resultado.code, "PACOTE_NAO_FINALIZADO");
  assert.match(resultado.reason, /SERP sem revisão/, "o motivo nomeia o bloqueio");
});

test("08 · versão exibida diferente da atual é recusa, não sobrescrita", () => {
  const resultado = resolveRadarImportEligibility({
    brandId: BRAND, dossier: dossie(), displayedAnalysisVersionId: "analysis-v2",
  });
  assert.equal(resultado.eligible, false);
  if (resultado.eligible) return;
  assert.equal(resultado.code, "PACOTE_DESATUALIZADO");
  assert.match(resultado.reason, /analysis-v2.*analysis-v3/);
});

test("09 · pacote de outra marca não é sequer descrito como desatualizado", () => {
  const resultado = resolveRadarImportEligibility({ brandId: "outra-brand", dossier: dossie() });
  assert.equal(resultado.eligible, false);
  if (resultado.eligible) return;
  assert.equal(resultado.code, "OUTRA_MARCA");
});

test("10 · identidade inconsistente bloqueia antes de qualquer escrita", () => {
  const semHash = resolveRadarImportEligibility({
    brandId: BRAND,
    dossier: dossie({ article: { brandId: BRAND, articleId: ARTICLE, articleDnaVersionId: "art-v2", articleDnaContentHash: null } }),
  });
  assert.equal(semHash.eligible, false);
  if (!semHash.eligible) assert.equal(semHash.code, "IDENTIDADE_INCONSISTENTE");

  const outroArtigo = resolveRadarImportEligibility({
    brandId: BRAND,
    dossier: dossie({ analysis: { versionId: "analysis-v3", versionNumber: 3, payload: { articleId: "outro" } } }),
  });
  assert.equal(outroArtigo.eligible, false);
  if (!outroArtigo.eligible) assert.equal(outroArtigo.code, "IDENTIDADE_INCONSISTENTE");
});

/* ---- 3 · idempotência e preservação ------------------------------------ */

test("11 · repetir o mesmo pacote devolve já existente, sem duplicar", () => {
  const documento = montar();
  const resultado = resolveRadarImportEligibility({
    brandId: BRAND, dossier: dossie(),
    existingDocument: { id: documento.id, schemaVersion: 2, radarOrigin: documento.radarOrigin },
  });
  assert.equal(resultado.eligible, false);
  if (resultado.eligible) return;
  assert.equal(resultado.outcome, "ja_existente");
  assert.equal(resultado.code, null, "não é bloqueio: é o mesmo trabalho já feito");
  // O id é determinístico — é ele que impede o segundo documento.
  assert.equal(radarDocumentId(BRAND, ARTICLE), radarDocumentId(BRAND, ARTICLE));
  assert.notEqual(radarDocumentId(BRAND, ARTICLE), radarDocumentId(BRAND, "outro"));
});

test("12 · pacote novo sobre documento existente avisa, NÃO substitui", () => {
  const anterior = montar();
  const resultado = resolveRadarImportEligibility({
    brandId: BRAND,
    dossier: dossie({ bundle: { bundleHash: "bundle-hash-2" } }),
    existingDocument: { id: anterior.id, schemaVersion: 2, radarOrigin: anterior.radarOrigin },
  });
  assert.equal(resultado.eligible, false);
  if (resultado.eligible) return;
  assert.equal(resultado.outcome, "atualizacao_disponivel");
  assert.match(resultado.reason, /não é substituída/);
});

test("13 · documento legado v1 é preservado diante de pacote do Radar", () => {
  const resultado = resolveRadarImportEligibility({
    brandId: BRAND, dossier: dossie(),
    existingDocument: { id: "doc-legado", schemaVersion: 1 },
  });
  assert.equal(resultado.eligible, false);
  if (resultado.eligible) return;
  assert.equal(resultado.outcome, "atualizacao_disponivel");
  assert.match(resultado.reason, /plano editorial/, "o motivo diz que a origem anterior era plano");
});

/* ---- 4 · pendências: escrever sim, aprovar não ------------------------- */

test("14 · rascunho com pendências é permitido; aprovação é que trava", () => {
  const comPendencia = {
    ...montar(),
    importedContext: {
      source: "radar" as const,
      capturedAt: "2026-09-17T12:00:00.000Z",
      dossier: montar().importedContext.dossier,
      editorialContext: [],
      visualGuidance: [],
      pendingDecisions: [
        { id: "p1", label: "Concorrente sem veredito", blocking: true, reason: "Falta decisão humana." },
        { id: "p2", label: "Imagem sugerida", blocking: false, reason: "Opcional." },
      ],
    },
  };

  // O documento com pendência é VÁLIDO — dá para escrever e salvar.
  assert.equal(ContentDocumentV2Schema.safeParse(comPendencia).success, true);
  // Mas a aprovação fica bloqueada, e o bloqueio é nomeado.
  assert.equal(radarDocumentCanBeApproved(comPendencia), false);
  const bloqueios = radarDocumentApprovalBlocks(comPendencia);
  assert.equal(bloqueios.length, 1, "só a bloqueante trava");
  assert.match(bloqueios[0], /Concorrente sem veredito/);
});

test("15 · pendência não bloqueante não impede aprovar", () => {
  const documento = {
    ...montar(),
    importedContext: {
      source: "radar" as const, capturedAt: "2026-09-17T12:00:00.000Z",
      dossier: montar().importedContext.dossier,
      editorialContext: [], visualGuidance: [],
      pendingDecisions: [{ id: "p2", label: "Imagem", blocking: false, reason: "Opcional." }],
    },
  };
  assert.equal(radarDocumentCanBeApproved(documento), true);
});

test("16 · pendência viaja COMO pendência, nunca como resolvida", () => {
  // Não existe campo que marque resolvido neste corte — resolver é no módulo
  // proprietário, e um botão local que "considera resolvida" seria mentira.
  const documento = montar();
  const chaves = Object.keys(documento.importedContext);
  assert.deepEqual(chaves.sort(), ["capturedAt", "dossier", "editorialContext", "pendingDecisions", "source", "visualGuidance"]);
  assert.ok(!chaves.includes("resolved"), "não há como marcar resolvido aqui");
});

test("16b · o dossiê canônico viaja PREENCHIDO, não como null", () => {
  /*
   * Sem esta asserção, trocar `dossier: radarWriterDossierOf(dossier)` por
   * `dossier: null` passaria nos outros testes deste arquivo: o schema aceita
   * null (é aditivo, de propósito) e a lista de chaves continua idêntica.
   * O documento viraria um ponteiro — hash e id de análise sem nada que
   * sustente uma frase — e só a suíte de handoff perceberia.
   */
  const dossierDoDocumento = montar().importedContext.dossier;
  assert.notEqual(dossierDoDocumento, null, "o dossiê não pode chegar vazio ao Redator");
  assert.equal(dossierDoDocumento!.bundleId, "bundle-id-1");
  assert.equal(dossierDoDocumento!.bundleHash, "bundle-hash-1");
  assert.equal(dossierDoDocumento!.researchProfile, "GOOGLE");
  assert.equal(dossierDoDocumento!.keywordContext.principal, "serum facial");
  assert.equal(dossierDoDocumento!.keywordContext.resolution, "ARTICLE_DNA_HYDRATION");
  // §12 · as invariantes viajam com o pacote, e não são reinventadas aqui.
  assert.ok(dossierDoDocumento!.writerMayNot.length > 0, "o que o Redator não pode redefinir viaja junto");
});

test("17 · contexto importado fica FORA do texto escrito", () => {
  const documento = montar();
  // Se o contexto entrasse em blocks/editorContent, o autosave gravaria
  // evidência como se fosse redação.
  assert.deepEqual(documento.blocks, []);
  assert.equal(documento.editorContent, null);
  assert.equal(documento.importedContext.source, "radar");
});

/* ---- 5 · compatibilidade ----------------------------------------------- */

test("18 · documento v1 continua válido, intocado", () => {
  const v1 = {
    schemaVersion: 1 as const,
    id: "doc-v1", title: "Antigo", status: "escrevendo" as const,
    contentPlanRef: ref("plan", "plan-v1"),
    brandDnaRef: ref("brand-dna", "brand-v1"),
    keywordDnaRefs: [ref("kw-1", "kw-v1")],
    siloDnaRef: ref("silo-1", "silo-v1"),
    articleDnaRef: ref(ARTICLE, "art-v1"),
    serpSnapshotRefs: [], evidenceRefs: [], sourceIds: [], linkMap: [], instructions: [], blocks: [],
    editorContent: null,
    metadata: { slug: "antigo", principalKeyword: "x", metaTitle: "", metaDescription: "", socialTitle: "", socialDescription: "", canonical: null, indexationStatus: "noindex" as const, plannedImages: [] },
  };
  const parsed = ContentDocumentSchema.safeParse(v1);
  assert.equal(parsed.success, true, parsed.success ? "" : JSON.stringify(parsed.error.issues));
  assert.equal(documentContentPlanRef(v1 as never)?.versionId, "plan-v1");
  assert.equal(isRadarOriginDocument(v1 as never), false);
});

test("19 · Publicações aceita origem Radar sem plano, e exige ALGUMA origem", () => {
  const base = {
    id: "pub-1", brandId: BRAND, articleId: ARTICLE, documentId: "doc-1",
    title: "Artigo", slug: "artigo", siloId: "silo-1", hierarchy: "Pilar", state: "draft",
    responsible: null, destination: null,
    createdAt: "2026-09-17T12:00:00.000Z", updatedAt: "2026-09-17T12:00:00.000Z",
    origin: "local",
  };

  // Origem Radar, sem plano: aceito.
  const comRadar = OperationalPublicationSchema.safeParse({
    ...base, radarOrigin: { analysisVersionId: "analysis-v3", evidenceBundleHash: "bundle-hash-1" },
  });
  assert.equal(comRadar.success, true, comRadar.success ? "" : JSON.stringify(comRadar.error.issues));
  if (comRadar.success) assert.equal(comRadar.data.contentPlanVersionId, null);

  // Origem plano, como antes: aceito.
  assert.equal(OperationalPublicationSchema.safeParse({
    ...base, plannerItemId: "planner-1", contentPlanVersionId: "plan-v1",
  }).success, true);

  // NENHUMA origem: recusado. É isto que substitui a obrigatoriedade do plano.
  const semOrigem = OperationalPublicationSchema.safeParse(base);
  assert.equal(semOrigem.success, false, "registro sem origem é órfão");
  if (!semOrigem.success) {
    assert.match(semOrigem.error.issues.map(i => i.message).join(" "), /origem/i);
  }
});
