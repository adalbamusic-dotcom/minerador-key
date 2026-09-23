/**
 * E1 · fixtures dos documentos da mesa — válidas no `ContentDocumentSchema`
 * VIGENTE, e não montadas com `as unknown`: o teste de paridade compara com o
 * `parse` real, e uma fixture fora do contrato provaria outra coisa.
 *
 * O bundle carrega um marcador único e um enchimento, para a forma da listagem
 * poder ser conferida por ausência (nenhum byte do bundle sai na listagem) e
 * por tamanho.
 */

export const MARCADOR_DO_BUNDLE = "MARCADOR-UNICO-DO-BUNDLE-E1";
const HASH = (letra: string) => `sha256:${letra.repeat(64)}`;

const referencia = (entidade: string, letra = "a") => ({ entityId: entidade, versionId: `${entidade}-v1`, contentHash: HASH(letra) });

export function bundleDoRadar(enchimento = 20_000) {
  return {
    bundleVersion: 3, bundleId: "bundle:e1", bundleHash: "bundle-hash:e1",
    binding: { brandId: "marca-a", articleId: "artigo-e1", articleDnaVersionId: "dna-1", articleDnaContentHash: HASH("b") },
    observedAt: "2026-09-14T23:49:44.887Z",
    primaryResearchProfile: "GOOGLE",
    researchSources: ["GOOGLE_SERP"],
    research: { google: { role: "PRIMARY", counts: { queries: 2, items: 10 } }, youtube: null, amazon: null },
    editorialOutputs: [{ output: "ARTICLE", objective: "Cobrir a intenção.", reason: "A SERP é de texto.", sourceSignals: ["10 resultados orgânicos"] }],
    limitations: ["Nenhum vídeo foi assistido."],
    marcador: MARCADOR_DO_BUNDLE,
    /* O peso real do bundle mora em amostras, extrações e cópias de página. */
    paginas: Array.from({ length: 4 }, (_, indice) => ({ url: `https://concorrente.test/${indice}`, corpo: "x".repeat(Math.ceil(enchimento / 4)), nulo: null })),
  };
}

const base = {
  title: "Rotina de skin care noturno",
  brandDnaRef: referencia("brand"),
  keywordDnaRefs: [referencia("kw-1"), referencia("kw-2", "c")],
  siloDnaRef: referencia("silo"),
  articleDnaRef: referencia("artigo-e1"),
  serpSnapshotRefs: [{ artifactId: "serp-1", artifactType: "serp_snapshot" as const, contentHash: HASH("d") }],
  evidenceRefs: [], sourceIds: ["fonte-1"], linkMap: [{ targetArticleId: "artigo-2", anchor: "rotina matinal" }],
  instructions: ["Não trocar a principal."],
  blocks: [
    { id: "b1", type: "heading" as const, level: 2, text: "Passo a passo", provenance: { keywordDnaRefs: [], evidenceRefs: [], sourceIds: [] } },
    { id: "b2", type: "paragraph" as const, text: "Primeiro, limpe a pele.", provenance: { keywordDnaRefs: [], evidenceRefs: [], sourceIds: [] } },
  ],
  editorContent: { type: "doc" as const, content: [{ type: "paragraph", content: [{ type: "text", text: "Primeiro, limpe a pele." }] }] },
  metadata: {
    slug: "skin-care-noturno", principalKeyword: "skin care noturno", metaTitle: "Skin care noturno", metaDescription: "",
    socialTitle: "", socialDescription: "", canonical: null, indexationStatus: "noindex" as const, plannedImages: [],
  },
};

/** v2 com dossiê: é o único que a listagem devolve parcial. */
export function documentoV2ComDossie(id = "doc-e1", bundle: Record<string, unknown> = bundleDoRadar()) {
  return {
    ...base, id, schemaVersion: 2 as const, status: "escrevendo" as const,
    radarOrigin: {
      radarItemId: "radar-1", articleId: "artigo-e1", analysisVersionId: "analise-3", analysisVersionNumber: 3,
      evidenceBundleHash: "bundle-hash:e1", articleDnaVersionId: "artigo-e1-v1", articleDnaContentHash: HASH("a"),
      siloDnaVersionId: null, importedAt: "2026-09-19T03:20:09.000Z", importedBy: "ator-1",
    },
    importedContext: {
      source: "radar" as const, capturedAt: "2026-09-19T03:20:09.000Z",
      dossier: {
        bundleId: "bundle:e1", bundleHash: "bundle-hash:e1", researchProfile: "GOOGLE" as const,
        keywordContext: { principal: "skin care noturno", secondary: ["rotina noturna"], narrativeReinforcements: [], resolution: "resolvida" },
        writerMayNot: ["Trocar a keyword principal."],
        bundle,
      },
      editorialContext: ["Contexto editorial."], visualGuidance: [],
      pendingDecisions: [{ id: "p1", label: "Imagem de capa", blocking: false, reason: "Sem banco de imagens." }],
    },
  };
}

/** v2 sem dossiê (anterior ao gate): nada a omitir. */
export function documentoV2SemDossie(id = "doc-sem-dossie") {
  const doc = documentoV2ComDossie(id);
  return { ...doc, importedContext: { ...doc.importedContext, dossier: null } };
}

/** v1 do Planejador, sem `writingBrief` (chave AUSENTE no payload). */
export function documentoV1(id = "doc-v1") {
  return {
    ...base, id, schemaVersion: 1 as const, status: "planejado" as const, editorContent: null,
    contentPlanRef: referencia("plano"),
  };
}
