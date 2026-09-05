import { z } from "zod";
import {
  SiteIndexabilitySchema,
  SitePageTypeSchema,
  SiteVerificationStatusSchema,
  SiteCatalogImportStatusSchema,
  SiteCatalogOriginSchema,
  SiteSyncStatusSchema,
  SitemapStatusSchema,
  SitemapTypeSchema,
} from "./site-contracts.ts";

/**
 * Contratos da persistência canônica de Site/Sitemap da Marca
 * (SDD 2026-09-02, Fase 1 — domínio puro).
 *
 * Três conceitos que não podem virar um só:
 *   CONFIGURAÇÃO → sitemaps cadastrados (`marcas.site_url` continua canônico e
 *                  não é duplicado aqui)
 *   EXECUÇÃO     → sync runs, append-only, sem lista de URLs dentro
 *   CATÁLOGO     → URLs observadas, com presença e histórico mínimo
 *
 * Sem acesso a banco, sem rede, sem provider. Só forma e regra.
 */

/* ------------------------------ configuração ----------------------------- */

export const BrandSitemapRecordSchema = z.object({
  id: z.string().min(1),
  brandId: z.string().min(1),
  url: z.string().min(1),
  /** Chave canônica derivada; base do UNIQUE por Brand. */
  normalizedUrl: z.string().min(1),
  sitemapType: SitemapTypeSchema,
  parentSitemapId: z.string().min(1).nullable(),
  enabled: z.boolean(),
  status: SitemapStatusSchema,
  lastTestedAt: z.string().min(1).nullable(),
  lastSyncedAt: z.string().min(1).nullable(),
  /** Aponta a última execução que produziu catálogo válido — last-known-good. */
  lastSuccessfulRunId: z.string().min(1).nullable(),
  lockVersion: z.number().int().positive(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
}).strict();
export type BrandSitemapRecord = z.infer<typeof BrandSitemapRecordSchema>;

/* -------------------------------- execução ------------------------------- */

/**
 * Uma execução explícita. NÃO carrega a lista de URLs: URLs vivem no catálogo.
 * Append-only — nunca é editada, nunca é podada nesta fase.
 */
export const SiteSyncRunRecordSchema = z.object({
  id: z.string().min(1),
  brandId: z.string().min(1),
  sitemapId: z.string().min(1),
  status: SiteSyncStatusSchema,
  foundCount: z.number().int().nonnegative(),
  newCount: z.number().int().nonnegative(),
  updatedCount: z.number().int().nonnegative(),
  missingCount: z.number().int().nonnegative(),
  errorCount: z.number().int().nonnegative(),
  durationMs: z.number().int().nonnegative(),
  /** Diagnóstico seguro: mensagem tratada, nunca corpo de resposta externa. */
  errorMessage: z.string().min(1).nullable(),
  startedAt: z.string().min(1),
  completedAt: z.string().min(1).nullable(),
}).strict().superRefine((run, context) => {
  // Espelha brand_site_sync_runs_completion_coherent: terminal exige carimbo.
  if (run.status === "running" && run.completedAt) {
    context.addIssue({ code: "custom", path: ["completedAt"], message: "Execução em andamento não possui conclusão." });
  }
  if (run.status !== "running" && !run.completedAt) {
    context.addIssue({ code: "custom", path: ["completedAt"], message: "Execução terminal precisa registrar a conclusão." });
  }
});
export type SiteSyncRunRecord = z.infer<typeof SiteSyncRunRecordSchema>;

export const SYNC_RUN_TERMINAL_STATUSES = ["completed", "partial", "failed"] as const;
export type SyncRunTerminalStatus = (typeof SYNC_RUN_TERMINAL_STATUSES)[number];

/**
 * Modelo de escrita: a linha nasce `running` ANTES da coleta, para que uma queda
 * no meio deixe evidência em vez de silêncio, e recebe UMA transição terminal.
 * Nada além disso é permitido — o gatilho do banco recusa reescrita de estado
 * terminal, alteração de identidade e DELETE.
 */
export function canTransitionSyncRun(
  from: SiteSyncRunRecord["status"],
  to: SiteSyncRunRecord["status"],
): { allowed: boolean; reason: string | null } {
  if (from !== "running") return { allowed: false, reason: "Execução terminal não é reescrita." };
  if (!SYNC_RUN_TERMINAL_STATUSES.includes(to as SyncRunTerminalStatus)) {
    return { allowed: false, reason: "Só transição para estado terminal é permitida." };
  }
  return { allowed: true, reason: null };
}

/**
 * Política por estado — as três perguntas são independentes:
 *
 *   completed → promove observação · infere ausência · move last-known-good
 *   partial   → promove observação · NÃO infere ausência · NÃO move LKG
 *   failed    → nada
 *   running   → nada
 *
 * O ponto do `partial`: a execução terminou com sitemaps em erro, então o
 * conjunto observado está INCOMPLETO. URL vista é prova de presença; URL não
 * vista não é prova de ausência — pode estar num sitemap que falhou. Por isso
 * ele pode inserir e atualizar o que observou, e não pode marcar nada como
 * `missing` nem virar last-known-good.
 */

/** Pode gravar o que observou: inserir URL nova e atualizar campos observados. */
export const runMayPromoteObservations = (run: Pick<SiteSyncRunRecord, "status">) =>
  run.status === "completed" || run.status === "partial";

/** Pode concluir que uma URL ausente do resultado sumiu do site. Só `completed`. */
export const runMayInferAbsence = (run: Pick<SiteSyncRunRecord, "status">) =>
  run.status === "completed";

/** Pode virar a referência de catálogo íntegro mais recente. Só `completed`. */
export const runMayBecomeLastKnownGood = (run: Pick<SiteSyncRunRecord, "status">) =>
  run.status === "completed";

/**
 * Last-known-good: a execução ÍNTEGRA mais recente. Uma parcial ou uma falha
 * posterior não substituem esta referência.
 */
export function resolveLastKnownGoodRun(runs: readonly SiteSyncRunRecord[]): SiteSyncRunRecord | null {
  return [...runs]
    .filter(runMayBecomeLastKnownGood)
    .sort((left, right) => (left.completedAt || left.startedAt).localeCompare(right.completedAt || right.startedAt))
    .at(-1) || null;
}

/* -------------------------------- catálogo ------------------------------- */

/**
 * Presença é OBSERVAÇÃO, não exclusão. Uma URL que deixa de aparecer num sync
 * fica `missing` e preserva `lastSeenAt`/`lastSeenRunId` — nunca é apagada.
 */
export const CatalogPresenceStateSchema = z.enum(["present", "missing"]);
export type CatalogPresenceState = z.infer<typeof CatalogPresenceStateSchema>;

export const SiteCatalogEntryRecordSchema = z.object({
  id: z.string().min(1),
  brandId: z.string().min(1),

  /** Chave canônica — identidade da linha dentro da Brand. */
  normalizedUrl: z.string().min(1),
  /** Como foi observada. Nunca reescrita. */
  discoveredUrl: z.string().min(1),
  resolvedUrl: z.string().min(1).nullable(),
  declaredCanonicalUrl: z.string().min(1).nullable(),
  normalizedCanonicalUrl: z.string().min(1).nullable(),

  title: z.string().min(1).nullable(),
  h1: z.string().min(1).nullable(),
  metaDescription: z.string().min(1).nullable(),
  pageType: SitePageTypeSchema,
  indexability: SiteIndexabilitySchema,
  verificationStatus: SiteVerificationStatusSchema,

  sourceSitemapId: z.string().min(1).nullable(),
  sitemapLastmod: z.string().min(1).nullable(),

  presenceState: CatalogPresenceStateSchema,
  firstSeenAt: z.string().min(1),
  firstSeenRunId: z.string().min(1).nullable(),
  lastSeenAt: z.string().min(1),
  lastSeenRunId: z.string().min(1).nullable(),
  lastVerifiedAt: z.string().min(1).nullable(),

  /** Decisão humana sobre a URL; sobrevive a qualquer sync posterior. */
  importStatus: SiteCatalogImportStatusSchema,
  origin: SiteCatalogOriginSchema,
  ignoredAt: z.string().min(1).nullable(),
  // Não existe campo de vínculo editorial confirmado. PublicationRecord
  // (uuid), SiloPage e ArticleDNA (entity_id text) têm identidades
  // heterogêneas: não há alvo único de FK, e uma coluna `text` seria referência
  // genérica opaca. Enquanto não houver contrato tipado e discriminado, a
  // reconciliação é DERIVADA por canonical → publishedUrl → site_url + slug.
}).strict();
export type SiteCatalogEntryRecord = z.infer<typeof SiteCatalogEntryRecordSchema>;

/* --------------------------- aplicação de um sync ------------------------ */

export type ObservedSiteUrl = {
  normalizedUrl: string;
  discoveredUrl: string;
  sourceSitemapId: string | null;
  sitemapLastmod: string | null;
};

export type CatalogSyncOutcome = {
  applied: boolean;
  /** `true` só em `completed`: numa parcial a ausência não é inferida. */
  absenceInferred: boolean;
  refusal: "RUN_NOT_PROMOTABLE" | null;
  entries: SiteCatalogEntryRecord[];
  summary: { foundCount: number; newCount: number; updatedCount: number; missingCount: number };
};

/**
 * Aplica uma execução ao catálogo. Função pura e total.
 *
 * Invariantes:
 *   - `failed` e `running` NÃO alteram nada — last-known-good preservado;
 *   - URL nova entra com `firstSeen*` e `lastSeen*` da execução;
 *   - URL reobservada atualiza `lastSeen*` e o que foi observado;
 *   - só `completed` infere ausência: `partial` nunca marca `missing`, porque
 *     seu conjunto observado está incompleto por definição;
 *   - URL ausente vira `missing` e MANTÉM `lastSeen*` — nunca é removida;
 *   - decisão humana (`importStatus`, `ignoredAt`) e
 *     `firstSeen*` jamais são sobrescritos por um sync.
 */
export function applyCatalogSync(input: {
  existing: readonly SiteCatalogEntryRecord[];
  observed: readonly ObservedSiteUrl[];
  run: Pick<SiteSyncRunRecord, "id" | "status" | "completedAt" | "startedAt">;
  /**
   * Brand das linhas novas. Obrigatório na PRIMEIRA sincronização: sem catálogo
   * anterior não há de quem herdar a Brand, e derivá-la de `existing[0]`
   * produzia identidade vazia justamente no caso em que o catálogo nasce.
   */
  brandId?: string;
}): CatalogSyncOutcome {
  const observedAt = input.run.completedAt || input.run.startedAt;

  if (!runMayPromoteObservations(input.run)) {
    return {
      applied: false,
      absenceInferred: false,
      refusal: "RUN_NOT_PROMOTABLE",
      entries: [...input.existing],
      summary: { foundCount: 0, newCount: 0, updatedCount: 0, missingCount: 0 },
    };
  }

  const byKey = new Map(input.existing.map(entry => [entry.normalizedUrl, entry]));
  const observedKeys = new Set<string>();
  let newCount = 0;
  let updatedCount = 0;

  for (const observation of input.observed) {
    observedKeys.add(observation.normalizedUrl);
    const current = byKey.get(observation.normalizedUrl);
    if (!current) {
      newCount += 1;
      byKey.set(observation.normalizedUrl, SiteCatalogEntryRecordSchema.parse({
        id: `catalog:${observation.normalizedUrl}`,
        brandId: input.brandId || input.existing[0]?.brandId || "",
        normalizedUrl: observation.normalizedUrl,
        discoveredUrl: observation.discoveredUrl,
        resolvedUrl: null,
        declaredCanonicalUrl: null,
        normalizedCanonicalUrl: null,
        title: null,
        h1: null,
        metaDescription: null,
        pageType: "unknown",
        indexability: "unknown",
        verificationStatus: "discovered",
        sourceSitemapId: observation.sourceSitemapId,
        sitemapLastmod: observation.sitemapLastmod,
        presenceState: "present",
        firstSeenAt: observedAt,
        firstSeenRunId: input.run.id,
        lastSeenAt: observedAt,
        lastSeenRunId: input.run.id,
        lastVerifiedAt: null,
        importStatus: "not_imported",
        origin: "sitemap",
        ignoredAt: null,
      }));
      continue;
    }
    updatedCount += 1;
    byKey.set(observation.normalizedUrl, {
      ...current,
      // Observação nova: identidade, decisão humana e primeira aparição intactas.
      discoveredUrl: observation.discoveredUrl,
      sourceSitemapId: observation.sourceSitemapId ?? current.sourceSitemapId,
      sitemapLastmod: observation.sitemapLastmod ?? current.sitemapLastmod,
      presenceState: "present",
      lastSeenAt: observedAt,
      lastSeenRunId: input.run.id,
    });
  }

  let missingCount = 0;
  // Ausência só é CONCLUSÃO quando a coleta foi íntegra. Numa parcial, não ter
  // aparecido pode significar apenas que o sitemap que a listava falhou.
  if (runMayInferAbsence(input.run)) {
    for (const [key, entry] of byKey) {
      if (observedKeys.has(key)) continue;
      if (entry.presenceState === "missing") continue;
      missingCount += 1;
      // Ausência é estado observado, nunca exclusão: lastSeen* permanece.
      byKey.set(key, { ...entry, presenceState: "missing" });
    }
  }

  return {
    applied: true,
    absenceInferred: runMayInferAbsence(input.run),
    refusal: null,
    entries: [...byKey.values()].sort((left, right) => left.normalizedUrl.localeCompare(right.normalizedUrl)),
    summary: { foundCount: input.observed.length, newCount, updatedCount, missingCount },
  };
}

/* ------------------- campos observados × campos humanos ------------------ */

/**
 * Separação normativa: o que o crawler observa pode ser reescrito por um sync
 * posterior; o que um humano decidiu, não. `applyCatalogSync` só toca a
 * primeira lista.
 */
export const CRAWLER_OBSERVED_CATALOG_FIELDS = [
  "discoveredUrl",
  "resolvedUrl",
  "declaredCanonicalUrl",
  "normalizedCanonicalUrl",
  "title",
  "h1",
  "metaDescription",
  "pageType",
  "indexability",
  "verificationStatus",
  "sourceSitemapId",
  "sitemapLastmod",
  "presenceState",
  "lastSeenAt",
  "lastSeenRunId",
  "lastVerifiedAt",
] as const;

export const HUMAN_PROTECTED_CATALOG_FIELDS = [
  "importStatus",
  "ignoredAt",
  "firstSeenAt",
  "firstSeenRunId",
  "origin",
] as const;

/**
 * Só execução válida pode mover o ponteiro de last-known-good. Uma falha
 * posterior preserva a referência anterior — inclusive quando não há nenhuma.
 */
export function resolveNextLastSuccessfulRunId(
  current: string | null,
  run: Pick<SiteSyncRunRecord, "id" | "status">,
): string | null {
  return runMayBecomeLastKnownGood(run) ? run.id : current;
}

/* ----------------------------- snapshot lido ----------------------------- */

/**
 * Forma que o Arquiteto consumirá em fase posterior, somente leitura. Declarada
 * aqui para que o contrato exista antes da rota — e para que `freshness` deixe
 * explícito que a leitura devolve o último estado conhecido, nunca uma coleta.
 */
export const BrandSiteSnapshotSchema = z.object({
  brandId: z.string().min(1),
  siteUrl: z.string().min(1).nullable(),
  sitemaps: z.array(BrandSitemapRecordSchema),
  lastSuccessfulRun: SiteSyncRunRecordSchema.nullable(),
  catalog: z.array(SiteCatalogEntryRecordSchema),
  freshness: z.object({
    lastSyncedAt: z.string().min(1).nullable(),
    /** `true` quando nunca houve execução válida. Não dispara coleta. */
    neverSynced: z.boolean(),
  }).strict(),
}).strict();
export type BrandSiteSnapshot = z.infer<typeof BrandSiteSnapshotSchema>;

export function emptyBrandSiteSnapshot(brandId: string, siteUrl: string | null = null): BrandSiteSnapshot {
  return BrandSiteSnapshotSchema.parse({
    brandId,
    siteUrl,
    sitemaps: [],
    lastSuccessfulRun: null,
    catalog: [],
    freshness: { lastSyncedAt: null, neverSynced: true },
  });
}

/* ---------------------------- transição do local ------------------------- */

export const LOCAL_STATE_RECONCILIATION_CODE = "LOCAL_STATE_NEEDS_RECONCILIATION";

export type LocalStateReconciliation = {
  code: typeof LOCAL_STATE_RECONCILIATION_CODE;
  localOnlyUrls: string[];
  remoteOnlyUrls: string[];
  needsHumanDecision: boolean;
};

/**
 * Compara o que existe no navegador com o que existe no remoto. NÃO promove,
 * NÃO apaga e NÃO decide: devolve o que diverge para ação humana explícita.
 */
export function compareLocalAndRemoteCatalog(input: {
  localNormalizedUrls: readonly string[];
  remoteNormalizedUrls: readonly string[];
}): LocalStateReconciliation {
  const remote = new Set(input.remoteNormalizedUrls);
  const local = new Set(input.localNormalizedUrls);
  const localOnlyUrls = [...local].filter(url => !remote.has(url)).sort();
  const remoteOnlyUrls = [...remote].filter(url => !local.has(url)).sort();
  return {
    code: LOCAL_STATE_RECONCILIATION_CODE,
    localOnlyUrls,
    remoteOnlyUrls,
    needsHumanDecision: localOnlyUrls.length > 0,
  };
}
