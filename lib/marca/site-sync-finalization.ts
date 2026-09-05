import { z } from "zod";

/**
 * Contrato da finalização atômica do sync de Site
 * (SDD 2026-09-02, adendo A1 — domínio puro).
 *
 * O runtime acessa Postgres só por PostgREST: cada requisição é sua própria
 * transação e o supabase-js não expõe BEGIN/COMMIT. Promover `completed` exige
 * quatro escritas coerentes entre si, então a finalização acontece numa função
 * do banco chamada por RPC — o mesmo padrão de `persist_silo_pair_atomic`.
 *
 * Este módulo NÃO fala com o banco. Ele decide o status terminal e monta os
 * argumentos exatos da chamada, para que a decisão seja testável sem rede.
 */

export const FINALIZE_SYNC_RPC = "finalize_brand_site_sync";

export const SyncTerminalStatusSchema = z.enum(["completed", "partial", "failed"]);
export type SyncTerminalStatus = z.infer<typeof SyncTerminalStatusSchema>;

export type SyncOutcomeInput = {
  /** URLs canônicas que a coleta observou E que a ingestão já persistiu. */
  persistedObservedUrls: readonly string[];
  /** Sitemaps/URLs que falharam durante a coleta. */
  crawlErrorCount: number;
  /** `false` quando a ingestão foi interrompida antes de gravar tudo. */
  ingestionComplete: boolean;
};

export type SyncOutcome = {
  status: SyncTerminalStatus;
  reason: string;
  /** Só `completed` conclui ausência e move o last-known-good. */
  infersAbsence: boolean;
  promotesLastKnownGood: boolean;
};

/**
 * Decide o status terminal a partir do que realmente aconteceu.
 *
 * A regra que importa: se houve material válido observado e persistido, mas a
 * execução não terminou íntegra, o resultado honesto é `partial` — nunca
 * `failed`. `failed` significa que nada foi promovido, e o banco recusa a
 * finalização `failed` se encontrar qualquer observação carimbada pela execução.
 */
export function resolveSyncOutcome(input: SyncOutcomeInput): SyncOutcome {
  const persisted = new Set(input.persistedObservedUrls).size;

  if (!persisted) {
    return input.crawlErrorCount > 0 || !input.ingestionComplete
      ? { status: "failed", reason: "Nenhuma URL observada foi persistida.", infersAbsence: false, promotesLastKnownGood: false }
      : { status: "completed", reason: "Coleta íntegra; o sitemap não listou nenhuma URL.", infersAbsence: true, promotesLastKnownGood: true };
  }

  if (input.crawlErrorCount > 0 || !input.ingestionComplete) {
    return {
      status: "partial",
      reason: "Houve observação válida, mas a execução não terminou íntegra; ausência não é inferida.",
      infersAbsence: false,
      promotesLastKnownGood: false,
    };
  }

  return {
    status: "completed",
    reason: "Coleta e ingestão íntegras.",
    infersAbsence: true,
    promotesLastKnownGood: true,
  };
}

export const FinalizeSyncArgsSchema = z.object({
  p_marca_id: z.string().uuid(),
  p_actor_user_id: z.string().uuid(),
  p_run_id: z.string().uuid(),
  p_status: SyncTerminalStatusSchema,
  p_observed_urls: z.array(z.string().min(1)),
  p_found_count: z.number().int().nonnegative(),
  p_new_count: z.number().int().nonnegative(),
  p_updated_count: z.number().int().nonnegative(),
  p_error_count: z.number().int().nonnegative(),
  p_duration_ms: z.number().int().nonnegative(),
  p_error_message: z.string().min(1).nullable(),
}).strict();
export type FinalizeSyncArgs = z.infer<typeof FinalizeSyncArgsSchema>;

/**
 * `missing_count` NÃO é argumento: quem conta as ausências é o banco, dentro da
 * transação, porque é lá que a inferência acontece. Enviá-lo daqui seria
 * declarar um resultado antes de ele existir.
 */
export function buildFinalizeSyncArgs(input: {
  brandId: string;
  actorUserId: string;
  runId: string;
  outcome: SyncOutcome;
  persistedObservedUrls: readonly string[];
  foundCount: number;
  newCount: number;
  updatedCount: number;
  durationMs: number;
  crawlErrorCount: number;
  errorMessage: string | null;
}): FinalizeSyncArgs {
  const observed = [...new Set(input.persistedObservedUrls)].sort();
  return FinalizeSyncArgsSchema.parse({
    p_marca_id: input.brandId,
    p_actor_user_id: input.actorUserId,
    p_run_id: input.runId,
    p_status: input.outcome.status,
    // `failed` não carrega observação: se houvesse, o status seria `partial`.
    p_observed_urls: input.outcome.status === "failed" ? [] : observed,
    p_found_count: Math.max(0, Math.trunc(input.foundCount)),
    p_new_count: Math.max(0, Math.trunc(input.newCount)),
    p_updated_count: Math.max(0, Math.trunc(input.updatedCount)),
    p_error_count: Math.max(0, Math.trunc(input.crawlErrorCount)),
    p_duration_ms: Math.max(0, Math.trunc(input.durationMs)),
    p_error_message: input.errorMessage?.trim() ? input.errorMessage.trim() : null,
  });
}

/* --------------------- espelho do fingerprint canônico -------------------- */

/**
 * Espelho, em TypeScript, da identidade de conjunto definida por
 * `public.brand_site_observed_set_fingerprint`.
 *
 * O POSTGRES É A AUTORIDADE: é ele que grava `observed_count`/`observed_set_hash`
 * dentro da transação. Este espelho existe para (a) provar as propriedades do
 * algoritmo sem um banco e (b) permitir que o chamador confira o readback.
 *
 * Regra idêntica à do SQL: a identidade de cada URL são os seus BYTES UTF-8, e é
 * sobre eles que acontecem a deduplicação e a ordenação — nunca sobre texto, que
 * numa collation não-determinística pode igualar bytes diferentes. O hex entra
 * apenas na serialização; como usa só [0-9a-f], nenhum elemento pode conter o
 * separador, e por isso `["a\nb", "c"]` e `["a", "b\nc"]` não colapsam.
 */
export const OBSERVED_SET_SEPARATOR = ":";

export function canonicalObservedSetPayload(urls: readonly string[]): { count: number; payload: string } {
  // DISTINCT bytewise: a chave do Map é o hex, que é bijetivo com os bytes.
  const unique = new Map<string, Buffer>();
  for (const url of urls) {
    const bytes = Buffer.from(url, "utf8");
    unique.set(bytes.toString("hex"), bytes);
  }
  // ORDER BY bytewise, espelhando a ordenação de `bytea` no Postgres.
  const encoded = [...unique.values()].sort(Buffer.compare).map(bytes => bytes.toString("hex"));
  return { count: encoded.length, payload: `${encoded.length}${OBSERVED_SET_SEPARATOR}${encoded.join(OBSERVED_SET_SEPARATOR)}` };
}

export const FINALIZE_SYNC_ERROR_CODES = [
  "OBSERVED_SET_MISMATCH",
  "OBSERVED_SET_INVALID_VALUE",
  "FINALIZATION_STATE_CONFLICT",
  "FINALIZATION_REPLAY_CONFLICT",
] as const;
export type FinalizeSyncErrorCode = (typeof FINALIZE_SYNC_ERROR_CODES)[number];

/**
 * Classifica a falha devolvida pela RPC. Conflito de retry NÃO é retry válido:
 * quem chama precisa distinguir "já finalizado igual" de "já finalizado
 * diferente" para não reenviar um resultado divergente.
 */
export function classifyFinalizeSyncError(message: string | null | undefined): FinalizeSyncErrorCode | null {
  const text = message || "";
  return FINALIZE_SYNC_ERROR_CODES.find(code => text.includes(code)) || null;
}

export const FinalizeSyncResultSchema = z.object({
  atomicity: z.literal("TRANSACTIONAL_RPC"),
  /** `true` quando a execução já estava terminal e nada foi mutado de novo. */
  idempotentReplay: z.boolean(),
  status: SyncTerminalStatusSchema,
  observedCount: z.number().int().nonnegative(),
  /** Fingerprint imutável do conjunto observado, gravado na finalização. */
  observedSetHash: z.string().regex(/^[0-9a-f]{64}$/),
  missingCount: z.number().int().nonnegative(),
  /** EVENTO: esta finalização promoveu o last-known-good quando ocorreu. */
  lastKnownGoodPromoted: z.boolean(),
  /** ESTADO: um sync mais novo pode já ter assumido o posto. */
  isCurrentLastKnownGood: z.boolean(),
  run: z.record(z.string(), z.unknown()),
  sitemap: z.record(z.string(), z.unknown()),
}).strict();
export type FinalizeSyncResult = z.infer<typeof FinalizeSyncResultSchema>;

/** Readback obrigatório: sucesso só existe depois que o banco devolve o estado. */
export function parseFinalizeSyncResult(value: unknown): FinalizeSyncResult {
  const parsed = FinalizeSyncResultSchema.parse(value);
  // EVENTO histórico: promover o last-known-good é consequência determinística
  // do status terminal, e continua verdadeiro num replay posterior.
  if (parsed.lastKnownGoodPromoted !== (parsed.status === "completed")) {
    throw new Error("Readback incoerente: promoção de last-known-good fora de `completed`.");
  }
  // ESTADO corrente: só quem promoveu pode ainda ser o last-known-good vigente.
  if (parsed.isCurrentLastKnownGood && !parsed.lastKnownGoodPromoted) {
    throw new Error("Readback incoerente: execução vigente sem ter promovido o last-known-good.");
  }
  if (parsed.status !== "completed" && parsed.missingCount > 0) {
    throw new Error("Readback incoerente: ausência inferida fora de `completed`.");
  }
  return parsed;
}
