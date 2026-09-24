/**
 * Fixtures do Assunto no painel e na semeadura do Redator (SDD do Assunto, F4.2).
 *
 * O documento tem a forma real de um envio do Radar (v2 com dossiê). As linhas
 * do Assunto saem da função que o envio usa (`radarWriterSubjectTurnLines`),
 * nunca escritas à mão: se o texto do envio mudar, o teste vê.
 */

import { RADAR_WRITER_MAY_NOT, radarWriterMayNotFor } from "../lib/redator/writer-handoff.ts";
import { radarWriterSubjectTurnLines } from "../lib/redator/radar-subject-turn.ts";
import type { ContentDocument } from "../lib/arquiteto/contracts.ts";
import { documentoV2ComDossie } from "./editorial-documento-e1-fixtures.mts";
import type { RadarEditorialSubjectTurn } from "../lib/radar/editorial-article-model.ts";

const sinal = (statement: string, count: number | null = null) => ({ id: `s:${statement.slice(0, 8)}`, statement, grade: "OBSERVED_SERP", evidence: "amostra", count });

export const bundleDoPainel = () => ({
  bundleVersion: 3, bundleId: "bundle:assunto", bundleHash: "bundle-hash:assunto",
  binding: { brandId: "marca-1", articleId: "artigo-a", articleDnaVersionId: "dna-1", articleDnaContentHash: "sha256:x" },
  observedAt: "2026-09-20T12:00:00.000Z",
  primaryResearchProfile: "YOUTUBE",
  researchSources: ["YOUTUBE_SERP"],
  research: {
    google: null,
    youtube: { role: "PRIMARY", frozenAt: "2026-09-20T12:00:00.000Z", refs: [], counts: { queries: 2, items: 20 }, limitations: ["Nenhum vídeo foi transcrito."] },
    amazon: null,
  },
  competitiveBlueprint: {
    profile: "YOUTUBE",
    observed: {
      comparableVideos: 20, longForm: 18, shorts: 2,
      titlePatterns: [sinal("Títulos usam \"rotina\".", 8)], recurrentChannels: [], durationRange: "Entre 300s e 700s.",
      viewsRange: null, recency: null, crossQuery: [], googleSupport: [], gaps: [sinal("Ninguém fala de pele sensível.")], sufficiency: "ok",
    },
    recommended: {
      format: "Rotina", durationDirection: null, titleDirections: [], hookDirection: null,
      script: [{ block: "Gancho", objective: "Capturar.", direction: "Diga o que entrega.", sourceSignal: "20" }],
      tone: "Didático.", languageDirection: null, technicalLevel: "Intermediário", authorityDirection: null, shorts: [], articleApplication: [],
      mustAnswer: ["Qual a ordem da rotina?"], mustCover: ["Protetor solar"],
    },
  },
  crossSerp: null,
  editorialOutputs: [{ output: "ARTICLE", objective: "Cobrir a intenção.", reason: "Texto disputa.", sourceSignals: [] }],
  observed: null,
  serpStanding: { authoritative: true, current: true, sufficient: true, valid: true, reason: "SERP vigente." },
  conflicts: [],
  limitations: ["Nenhum vídeo foi transcrito."],
  video: null,
  specialist: null,
});

export const ASSUNTO = { phrase: "sérum de vitamina C", note: "o produto da casa que fecha a rotina", destinationUrl: "https://loja.exemplo/serum-c" };
export const PRINCIPAL = "rotina de skincare";

const viradaBase = (turnSection: RadarEditorialSubjectTurn["turnSection"]): RadarEditorialSubjectTurn => ({
  ...ASSUNTO,
  criterion: "STEMS" as never,
  criterionLabel: "raízes",
  stems: ["serum", "vitamina"],
  turnSection,
  suggestedPosition: null,
  suggestedPositionLabel: "",
  h1Complement: { suggested: true, complement: "com sérum de vitamina C", titlePages: 3, headingPages: 2, sampleSize: 8, label: "" },
  sampleLabel: "aparece em 2 de 8 páginas",
  alert: "Só 2 de 8 páginas tocam o Assunto: a sustentação é fraca.",
  ctaDirection: null,
});

/** Seção sintética: o título é de trabalho do Radar. */
export const viradaSintetica = (): RadarEditorialSubjectTurn => viradaBase({
  id: "sec-virada", heading: "Virada para sérum de vitamina C", source: "SYNTHETIC", pages: 0, sampleSize: 8,
  placement: "H3", hostSectionId: "sec-2", hostHeading: "Passo a passo da rotina", mustCoverReason: "exigida pelo ArticleDNA",
});

/** Seção observada: um bloco da amostra já trata o Assunto. */
export const viradaObservada = (): RadarEditorialSubjectTurn => viradaBase({
  id: "sec-obs", heading: "Onde entra o sérum", source: "OBSERVED_GROUP", pages: 2, sampleSize: 8,
  placement: "H2", hostSectionId: null, hostHeading: null, mustCoverReason: "bloco observado",
});

export const linhasDoAssunto = (turn: RadarEditorialSubjectTurn | null = viradaSintetica()) =>
  radarWriterSubjectTurnLines({ subject: ASSUNTO, turn, principal: PRINCIPAL });

/**
 * O documento do envio, completo e válido no contrato (a base é a fixture da
 * E1). `editorialContext` ausente reproduz o documento anterior à F4.1; `[]`
 * é o envio sem Assunto; com linhas, o envio com Assunto.
 */
export const documentoDoPainel = (editorialContext?: string[]): ContentDocument => {
  const base = documentoV2ComDossie("doc-assunto", bundleDoPainel()) as unknown as Record<string, unknown> & { importedContext: Record<string, unknown> };
  const importedContext: Record<string, unknown> = {
    ...base.importedContext,
    dossier: {
      bundleId: "bundle:assunto", bundleHash: "bundle-hash:assunto", researchProfile: "YOUTUBE",
      keywordContext: { principal: PRINCIPAL, secondary: ["skincare noturno"], narrativeReinforcements: ["pele descansada"], resolution: "resolvida" },
      writerMayNot: editorialContext?.length ? [...radarWriterMayNotFor(ASSUNTO)] : [...RADAR_WRITER_MAY_NOT],
      bundle: bundleDoPainel(),
    },
    pendingDecisions: [],
  };
  delete importedContext.editorialContext;
  if (editorialContext) importedContext.editorialContext = editorialContext;
  return {
    ...base, title: "rotina de skincare", blocks: [], status: "planejado",
    radarOrigin: { ...(base.radarOrigin as Record<string, unknown>), evidenceBundleHash: "bundle-hash:assunto" },
    importedContext,
  } as unknown as ContentDocument;
};
