import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createCanonicalServiceClient } from "@/lib/server/canonical-authorization";
import { createOpaqueTelegramToken, hashTelegramToken, TELEGRAM_BOT_KEY, type TelegramInboundSource } from "./contracts";
import type { ExpertBriefStatus } from "../expert-contribution-contracts";

export type PersistenceClient = Pick<SupabaseClient, "from">;

export type BrandExpertRecord = {
  id: string;
  brandId: string;
  displayName: string;
  specialty: string | null;
  status: "active" | "suspended" | "revoked";
  createdAt: string;
};

export type TelegramBindingRecord = {
  id: string;
  brandId: string;
  expertId: string;
  telegramUserId: string;
  telegramChatId: string;
  status: "active" | "revoked" | "suspended";
  selectedBriefId: string | null;
  lastInteractionAt: string | null;
};

export type ExpertBriefRecord = {
  id: string;
  brandId: string;
  expertId: string;
  articleId: string | null;
  articleDnaVersionId: string | null;
  title: string;
  radarContext: Record<string, unknown>;
  questions: unknown[];
  status: string;
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
  completedAt: string | null;
};

const EXPERT_BRIEF_SELECT = "id,brand_id,expert_id,article_id,article_dna_version_id,title,radar_context,questions,status,created_at,updated_at,sent_at,completed_at";

function clientOrDefault(client?: PersistenceClient) {
  return client || createCanonicalServiceClient();
}

function fail(result: { error: { code?: string; message?: string } | null }, message: string): never | void {
  if (!result.error) return;
  const error = new Error(message);
  Object.assign(error, { code: result.error.code || "REMOTE_ERROR" });
  throw error;
}

function mapExpert(row: Record<string, unknown>): BrandExpertRecord {
  return {
    id: String(row.id),
    brandId: String(row.brand_id),
    displayName: String(row.display_name),
    specialty: typeof row.specialty === "string" ? row.specialty : null,
    status: row.status === "suspended" || row.status === "revoked" ? row.status : "active",
    createdAt: String(row.created_at),
  };
}

function mapBinding(row: Record<string, unknown>): TelegramBindingRecord {
  return {
    id: String(row.id),
    brandId: String(row.brand_id),
    expertId: String(row.expert_id),
    telegramUserId: String(row.telegram_user_id),
    telegramChatId: String(row.telegram_chat_id),
    status: row.status === "revoked" || row.status === "suspended" ? row.status : "active",
    selectedBriefId: typeof row.selected_brief_id === "string" ? row.selected_brief_id : null,
    lastInteractionAt: typeof row.last_interaction_at === "string" ? row.last_interaction_at : null,
  };
}

function mapBrief(row: Record<string, unknown>): ExpertBriefRecord {
  return {
    id: String(row.id),
    brandId: String(row.brand_id),
    expertId: String(row.expert_id),
    articleId: typeof row.article_id === "string" ? row.article_id : null,
    articleDnaVersionId: typeof row.article_dna_version_id === "string" ? row.article_dna_version_id : null,
    title: String(row.title),
    radarContext: row.radar_context && typeof row.radar_context === "object" && !Array.isArray(row.radar_context) ? row.radar_context as Record<string, unknown> : {},
    questions: Array.isArray(row.questions) ? row.questions : [],
    status: String(row.status),
    createdAt: String(row.created_at),
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : String(row.created_at),
    sentAt: typeof row.sent_at === "string" ? row.sent_at : null,
    completedAt: typeof row.completed_at === "string" ? row.completed_at : null,
  };
}

export async function listBrandExperts(brandId: string, client?: PersistenceClient) {
  const result = await clientOrDefault(client).from("brand_experts").select("id,brand_id,display_name,specialty,status,created_at").eq("brand_id", brandId).order("display_name");
  fail(result, "Não foi possível listar os especialistas da Marca.");
  return ((result.data || []) as Array<Record<string, unknown>>).map(mapExpert);
}

export async function listActiveBrandExperts(brandId: string, client?: PersistenceClient) {
  const result = await clientOrDefault(client).from("brand_experts").select("id,brand_id,display_name,specialty,status,created_at").eq("brand_id", brandId).eq("status", "active").order("display_name");
  fail(result, "Não foi possível listar os especialistas utilizáveis da Marca.");
  return ((result.data || []) as Array<Record<string, unknown>>).map(mapExpert);
}

export async function createBrandExpert(input: { brandId: string; displayName: string; specialty?: string | null; createdBy: string }, client?: PersistenceClient) {
  const result = await clientOrDefault(client).from("brand_experts").insert({ brand_id: input.brandId, display_name: input.displayName.trim(), specialty: input.specialty?.trim() || null, created_by: input.createdBy }).select("id,brand_id,display_name,specialty,status,created_at").single();
  fail(result, "Não foi possível criar o especialista da Marca.");
  return mapExpert(result.data as Record<string, unknown>);
}

export async function listBrandExpertBindings(brandId: string, client?: PersistenceClient) {
  const result = await clientOrDefault(client).from("telegram_expert_bindings").select("id,brand_id,expert_id,telegram_user_id,telegram_chat_id,status,selected_brief_id,last_interaction_at").eq("brand_id", brandId).order("created_at", { ascending: false });
  fail(result, "Não foi possível listar os vínculos Telegram da Marca.");
  return ((result.data || []) as Array<Record<string, unknown>>).map(mapBinding);
}

export async function issueTelegramOnboardingToken(input: { brandId: string; expertId: string; createdBy: string; expiresAt?: string }, client?: PersistenceClient) {
  const { token, tokenHash } = createOpaqueTelegramToken();
  const expiresAt = input.expiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const result = await clientOrDefault(client).from("telegram_onboarding_tokens").insert({ brand_id: input.brandId, expert_id: input.expertId, token_hash: tokenHash, created_by: input.createdBy, expires_at: expiresAt }).select("id,expires_at").single();
  fail(result, "Não foi possível criar o token de onboarding Telegram.");
  if (!result.data) throw new Error("TELEGRAM_ONBOARDING_TOKEN_NOT_CREATED");
  return { id: String(result.data.id), token, expiresAt: String(result.data.expires_at) };
}

export async function revokeTelegramBinding(bindingId: string, brandId: string, client?: PersistenceClient) {
  const result = await clientOrDefault(client).from("telegram_expert_bindings").update({ status: "revoked", updated_at: new Date().toISOString() }).eq("id", bindingId).eq("brand_id", brandId).eq("status", "active");
  fail(result, "Não foi possível revogar o vínculo Telegram.");
}

export async function claimTelegramInboundUpdate(input: { updateId: string; payloadHash: string; userId: string | null; chatId: string | null; metadata: Record<string, unknown> }, client?: PersistenceClient) {
  const result = await clientOrDefault(client).from("telegram_inbound_updates").insert({ bot_key: TELEGRAM_BOT_KEY, external_update_id: input.updateId, payload_hash: input.payloadHash, telegram_user_id: input.userId, telegram_chat_id: input.chatId, metadata: input.metadata }).select("bot_key,external_update_id,status").single();
  if (result.error?.code === "23505") return { duplicate: true as const };
  fail(result, "Não foi possível registrar a atualização Telegram.");
  return { duplicate: false as const };
}

export async function finishTelegramInboundUpdate(updateId: string, status: "PROCESSED" | "IGNORED" | "FAILED", input: { bindingId?: string | null; briefId?: string | null; errorCode?: string | null } = {}, client?: PersistenceClient) {
  const result = await clientOrDefault(client).from("telegram_inbound_updates").update({ status, binding_id: input.bindingId || null, brief_id: input.briefId || null, error_code: input.errorCode || null, processed_at: new Date().toISOString() }).eq("bot_key", TELEGRAM_BOT_KEY).eq("external_update_id", updateId);
  fail(result, "Não foi possível finalizar o estado da atualização Telegram.");
}

export async function findActiveTelegramBinding(input: { telegramUserId?: string | null; telegramChatId?: string | null }, client?: PersistenceClient) {
  const db = clientOrDefault(client);
  const select = "id,brand_id,expert_id,telegram_user_id,telegram_chat_id,status,selected_brief_id,last_interaction_at";
  const byUser = input.telegramUserId ? await db.from("telegram_expert_bindings").select(select).eq("bot_key", TELEGRAM_BOT_KEY).eq("telegram_user_id", input.telegramUserId).eq("status", "active").maybeSingle() : { data: null, error: null };
  fail(byUser, "Não foi possível consultar o vínculo Telegram.");
  const byChat = input.telegramChatId ? await db.from("telegram_expert_bindings").select(select).eq("bot_key", TELEGRAM_BOT_KEY).eq("telegram_chat_id", input.telegramChatId).eq("status", "active").maybeSingle() : { data: null, error: null };
  fail(byChat, "Não foi possível consultar o vínculo Telegram.");
  if (byUser.data && byChat.data && byUser.data.id !== byChat.data.id) return null;
  const row = byUser.data || byChat.data;
  return row ? mapBinding(row as Record<string, unknown>) : null;
}

export async function listActiveTelegramBindingsForExpert(input: { brandId: string; expertId: string }, client?: PersistenceClient) {
  const result = await clientOrDefault(client).from("telegram_expert_bindings").select("id,brand_id,expert_id,telegram_user_id,telegram_chat_id,status,selected_brief_id,last_interaction_at").eq("brand_id", input.brandId).eq("expert_id", input.expertId).eq("status", "active");
  fail(result, "Não foi possível consultar os vínculos Telegram do especialista.");
  return ((result.data || []) as Array<Record<string, unknown>>).map(mapBinding);
}

export async function consumeTelegramOnboardingToken(input: { token: string; telegramUserId: string; telegramChatId: string }, client?: PersistenceClient) {
  const db = clientOrDefault(client);
  const tokenHash = hashTelegramToken(input.token);
  const tokenResult = await db.from("telegram_onboarding_tokens").select("id,brand_id,expert_id,expires_at,used_at,revoked_at").eq("token_hash", tokenHash).is("used_at", null).is("revoked_at", null).gt("expires_at", new Date().toISOString()).maybeSingle();
  fail(tokenResult, "Não foi possível validar o token de onboarding Telegram.");
  if (!tokenResult.data) return null;
  const used = await db.from("telegram_onboarding_tokens").update({ used_at: new Date().toISOString() }).eq("id", tokenResult.data.id).is("used_at", null).is("revoked_at", null);
  fail(used, "Não foi possível consumir o token de onboarding Telegram.");
  const binding = await db.from("telegram_expert_bindings").insert({ brand_id: tokenResult.data.brand_id, expert_id: tokenResult.data.expert_id, bot_key: TELEGRAM_BOT_KEY, telegram_user_id: input.telegramUserId, telegram_chat_id: input.telegramChatId, verified_at: new Date().toISOString(), last_interaction_at: new Date().toISOString() }).select("id,brand_id,expert_id,telegram_user_id,telegram_chat_id,status,selected_brief_id,last_interaction_at").single();
  if (binding.error?.code === "23505") throw new Error("TELEGRAM_BINDING_ALREADY_EXISTS");
  fail(binding, "Não foi possível concluir o vínculo Telegram.");
  return mapBinding(binding.data as Record<string, unknown>);
}

export async function listOpenExpertBriefs(binding: TelegramBindingRecord, client?: PersistenceClient) {
  const result = await clientOrDefault(client).from("expert_briefs").select(EXPERT_BRIEF_SELECT).eq("brand_id", binding.brandId).eq("expert_id", binding.expertId).in("status", ["ready_to_send", "awaiting_expert", "receiving", "awaiting_review"]).order("updated_at", { ascending: false });
  fail(result, "Não foi possível listar os briefs abertos do especialista.");
  return ((result.data || []) as Array<Record<string, unknown>>).map(mapBrief);
}

export async function createExpertBrief(input: { brandId: string; expertId: string; articleId?: string | null; articleDnaVersionId?: string | null; title: string; radarContext?: Record<string, unknown>; questions?: unknown[]; status?: ExpertBriefStatus; createdBy: string }, client?: PersistenceClient) {
  const result = await clientOrDefault(client).from("expert_briefs").insert({ brand_id: input.brandId, expert_id: input.expertId, article_id: input.articleId || null, article_dna_version_id: input.articleDnaVersionId || null, title: input.title.trim(), radar_context: input.radarContext || {}, questions: input.questions || [], status: input.status || "ready_to_send", created_by: input.createdBy }).select(EXPERT_BRIEF_SELECT).single();
  fail(result, "Não foi possível criar o brief do especialista.");
  if (!result.data) throw new Error("EXPERT_BRIEF_NOT_CREATED");
  return mapBrief(result.data as Record<string, unknown>);
}

export async function listExpertBriefs(brandId: string, client?: PersistenceClient) {
  const result = await clientOrDefault(client).from("expert_briefs").select(EXPERT_BRIEF_SELECT).eq("brand_id", brandId).order("updated_at", { ascending: false });
  fail(result, "Não foi possível listar os briefs dos especialistas.");
  return ((result.data || []) as Array<Record<string, unknown>>).map(mapBrief);
}

export async function listExpertBriefsForContext(input: { brandId: string; expertId?: string; articleId?: string | null; articleDnaVersionId?: string | null }, client?: PersistenceClient) {
  let query = clientOrDefault(client).from("expert_briefs").select(EXPERT_BRIEF_SELECT).eq("brand_id", input.brandId);
  if (input.expertId) query = query.eq("expert_id", input.expertId);
  if (input.articleId !== undefined) query = input.articleId === null ? query.is("article_id", null) : query.eq("article_id", input.articleId);
  if (input.articleDnaVersionId !== undefined) query = input.articleDnaVersionId === null ? query.is("article_dna_version_id", null) : query.eq("article_dna_version_id", input.articleDnaVersionId);
  const result = await query.order("updated_at", { ascending: false });
  fail(result, "Não foi possível listar os briefs do contexto do artigo.");
  return ((result.data || []) as Array<Record<string, unknown>>).map(mapBrief);
}

export async function getExpertBrief(input: { brandId: string; briefId: string; expertId?: string; articleId?: string | null; articleDnaVersionId?: string | null }, client?: PersistenceClient) {
  let query = clientOrDefault(client).from("expert_briefs").select(EXPERT_BRIEF_SELECT).eq("brand_id", input.brandId).eq("id", input.briefId);
  if (input.expertId) query = query.eq("expert_id", input.expertId);
  if (input.articleId !== undefined) query = input.articleId === null ? query.is("article_id", null) : query.eq("article_id", input.articleId);
  if (input.articleDnaVersionId !== undefined) query = input.articleDnaVersionId === null ? query.is("article_dna_version_id", null) : query.eq("article_dna_version_id", input.articleDnaVersionId);
  const result = await query.maybeSingle();
  fail(result, "Não foi possível ler o brief do especialista.");
  return result.data ? mapBrief(result.data as Record<string, unknown>) : null;
}

export async function updateExpertBrief(input: { brandId: string; expertId: string; briefId: string; articleId: string; articleDnaVersionId: string; title: string; radarContext?: Record<string, unknown>; questions?: unknown[]; status?: ExpertBriefStatus }, client?: PersistenceClient) {
  const result = await clientOrDefault(client)
    .from("expert_briefs")
    .update({ title: input.title.trim(), article_id: input.articleId, article_dna_version_id: input.articleDnaVersionId, radar_context: input.radarContext || {}, questions: input.questions || [], ...(input.status ? { status: input.status } : {}), updated_at: new Date().toISOString() })
    .eq("brand_id", input.brandId)
    .eq("id", input.briefId)
    .eq("expert_id", input.expertId)
    .eq("article_id", input.articleId)
    .eq("article_dna_version_id", input.articleDnaVersionId)
    .select(EXPERT_BRIEF_SELECT)
    .maybeSingle();
  fail(result, "Não foi possível salvar o brief do especialista.");
  return result.data ? mapBrief(result.data as Record<string, unknown>) : null;
}

const EXPERT_CONTRIBUTION_SELECT = "id,brand_id,expert_id,brief_id,provider,source_type,original_text,transcript_text,organization_payload,external_update_id,original_asset_uri,original_checksum,processing_status,received_at";

function mapContribution(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    brandId: String(row.brand_id),
    expertId: String(row.expert_id),
    briefId: String(row.brief_id),
    provider: "telegram" as const,
    sourceType: String(row.source_type),
    originalText: typeof row.original_text === "string" ? row.original_text : null,
    transcriptText: typeof row.transcript_text === "string" ? row.transcript_text : null,
    organizationPayload: row.organization_payload && typeof row.organization_payload === "object" && !Array.isArray(row.organization_payload) ? row.organization_payload : null,
    evidence: { sourceType: String(row.source_type), provider: "telegram" as const, externalUpdateId: String(row.external_update_id), originalAssetUri: typeof row.original_asset_uri === "string" ? row.original_asset_uri : null, checksum: typeof row.original_checksum === "string" ? row.original_checksum : null },
    processingStatus: String(row.processing_status),
    receivedAt: String(row.received_at),
  };
}

export async function listExpertContributions(brandId: string, client?: PersistenceClient) {
  const result = await clientOrDefault(client).from("expert_contributions").select(EXPERT_CONTRIBUTION_SELECT).eq("brand_id", brandId).order("received_at", { ascending: false });
  fail(result, "Não foi possível listar as contribuições dos especialistas.");
  return (result.data || []).map((row) => mapContribution(row as Record<string, unknown>));
}

export async function listExpertContributionsForBrief(input: { brandId: string; expertId: string; briefId: string }, client?: PersistenceClient) {
  const result = await clientOrDefault(client).from("expert_contributions").select(EXPERT_CONTRIBUTION_SELECT).eq("brand_id", input.brandId).eq("expert_id", input.expertId).eq("brief_id", input.briefId).order("received_at", { ascending: true });
  fail(result, "Não foi possível ler as contribuições deste ExpertBrief.");
  return (result.data || []).map((row) => mapContribution(row as Record<string, unknown>));
}

export async function getExpertContribution(input: { brandId: string; expertId?: string; briefId?: string; contributionId: string }, client?: PersistenceClient) {
  let query = clientOrDefault(client).from("expert_contributions").select(EXPERT_CONTRIBUTION_SELECT).eq("brand_id", input.brandId).eq("id", input.contributionId);
  if (input.expertId) query = query.eq("expert_id", input.expertId);
  if (input.briefId) query = query.eq("brief_id", input.briefId);
  const result = await query.maybeSingle();
  fail(result, "Não foi possível ler a contribuição do especialista.");
  return result.data ? mapContribution(result.data as Record<string, unknown>) : null;
}

export async function markExpertBriefAwaitingReview(input: { brandId: string; expertId: string; briefId: string }, client?: PersistenceClient) {
  const now = new Date().toISOString();
  const result = await clientOrDefault(client)
    .from("expert_briefs")
    .update({ status: "awaiting_review", updated_at: now })
    .eq("brand_id", input.brandId)
    .eq("expert_id", input.expertId)
    .eq("id", input.briefId)
    .in("status", ["awaiting_expert", "receiving"])
    .select(EXPERT_BRIEF_SELECT)
    .maybeSingle();
  fail(result, "Não foi possível atualizar o estado do ExpertBrief após a contribuição.");
  if (result.data) return mapBrief(result.data as Record<string, unknown>);
  const current = await getExpertBrief({ brandId: input.brandId, briefId: input.briefId, expertId: input.expertId }, client);
  return current?.status === "awaiting_review" ? current : null;
}

export async function issueBriefSelectionToken(input: { bindingId: string; brandId: string; briefId: string }, client?: PersistenceClient) {
  const { token, tokenHash } = createOpaqueTelegramToken();
  const result = await clientOrDefault(client).from("telegram_brief_selection_tokens").insert({ brand_id: input.brandId, binding_id: input.bindingId, brief_id: input.briefId, token_hash: tokenHash, expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() }).select("id").single();
  fail(result, "Não foi possível criar o seletor do brief Telegram.");
  if (!result.data) throw new Error("TELEGRAM_BRIEF_SELECTOR_NOT_CREATED");
  return { id: String(result.data.id), token };
}

export async function selectTelegramBrief(input: { token: string; bindingId: string }, client?: PersistenceClient) {
  const db = clientOrDefault(client);
  const result = await db.from("telegram_brief_selection_tokens").select("id,brand_id,binding_id,brief_id").eq("token_hash", hashTelegramToken(input.token)).eq("binding_id", input.bindingId).is("used_at", null).gt("expires_at", new Date().toISOString()).maybeSingle();
  fail(result, "Não foi possível validar o seletor do brief Telegram.");
  if (!result.data) return null;
  const used = await db.from("telegram_brief_selection_tokens").update({ used_at: new Date().toISOString() }).eq("id", result.data.id).is("used_at", null);
  fail(used, "Não foi possível consumir o seletor do brief Telegram.");
  const binding = await db.from("telegram_expert_bindings").update({ selected_brief_id: result.data.brief_id, last_interaction_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", input.bindingId).eq("brand_id", result.data.brand_id).eq("status", "active").select("id,brand_id,expert_id,telegram_user_id,telegram_chat_id,status,selected_brief_id,last_interaction_at").single();
  fail(binding, "Não foi possível selecionar o brief Telegram.");
  return { binding: mapBinding(binding.data as Record<string, unknown>), briefId: String(result.data.brief_id) };
}

export async function insertTelegramContribution(input: { binding: TelegramBindingRecord; briefId: string; inbound: TelegramInboundSource; payloadHash: string }, client?: PersistenceClient) {
  const db = clientOrDefault(client);
  const result = await db.from("expert_contributions").insert({ brand_id: input.binding.brandId, expert_id: input.binding.expertId, brief_id: input.briefId, provider: "telegram", bot_key: TELEGRAM_BOT_KEY, external_update_id: input.inbound.updateId, external_message_id: input.inbound.messageId, source_type: input.inbound.sourceType, original_text: input.inbound.originalText, telegram_file_id: input.inbound.telegramFileId, telegram_file_unique_id: input.inbound.telegramFileUniqueId, original_file_name: input.inbound.fileName, original_content_type: input.inbound.contentType, original_file_size: input.inbound.fileSize, original_duration_seconds: input.inbound.durationSeconds, original_checksum: input.payloadHash, original_metadata: input.inbound.metadata, processing_status: input.inbound.sourceType === "TEXT" ? "RECEIVED" : "PENDING_LOCAL_PROCESSING" }).select("id,processing_status").single();
  if (result.error?.code === "23505") return { duplicate: true as const, contributionId: null };
  fail(result, "Não foi possível persistir a contribuição original do especialista.");
  if (!result.data) throw new Error("TELEGRAM_CONTRIBUTION_NOT_CREATED");
  return { duplicate: false as const, contributionId: String(result.data.id) };
}

export async function enqueueExternalProcessingJob(input: { brandId: string; briefId: string; contributionId: string; jobKind: "telegram_media_preservation" | "speech_transcription" | "document_extraction"; payload?: Record<string, unknown> }, client?: PersistenceClient) {
  const result = await clientOrDefault(client).from("external_processing_jobs").insert({ brand_id: input.brandId, brief_id: input.briefId, contribution_id: input.contributionId, job_kind: input.jobKind, status: "PENDING_LOCAL_PROCESSING", payload: input.payload || {} }).select("id,status").single();
  if (result.error?.code === "23505") return { duplicate: true as const, jobId: null };
  fail(result, "Não foi possível enfileirar o processamento local.");
  if (!result.data) throw new Error("EXTERNAL_PROCESSING_JOB_NOT_CREATED");
  return { duplicate: false as const, jobId: String(result.data.id) };
}

export async function markExpertContributionProcessing(input: { brandId: string; expertId: string; briefId: string; contributionId: string }, client?: PersistenceClient) {
  const result = await clientOrDefault(client)
    .from("expert_contributions")
    .update({ processing_status: "PROCESSING" })
    .eq("brand_id", input.brandId)
    .eq("expert_id", input.expertId)
    .eq("brief_id", input.briefId)
    .eq("id", input.contributionId)
    .in("processing_status", ["RECEIVED", "PENDING_LOCAL_PROCESSING", "FAILED_RETRYABLE"])
    .select("id,processing_status")
    .maybeSingle();
  fail(result, "Não foi possível marcar a contribuição como em processamento.");
  if (!result.data) {
    const current = await getExpertContribution({ brandId: input.brandId, expertId: input.expertId, briefId: input.briefId, contributionId: input.contributionId }, client);
    if (!current) throw new Error("EXPERT_CONTRIBUTION_NOT_FOUND");
    if (current.processingStatus !== "PROCESSING" && current.processingStatus !== "EXTRACTED") throw new Error("EXPERT_CONTRIBUTION_PROCESSING_STATE_CONFLICT");
  }
}

export async function persistExpertContributionTranscript(input: { brandId: string; expertId: string; briefId: string; contributionId: string; transcriptText: string; extractionPayload?: Record<string, unknown> | null }, client?: PersistenceClient) {
  const transcriptText = input.transcriptText.trim();
  if (!transcriptText) throw new Error("EXPERT_TRANSCRIPT_EMPTY");
  const result = await clientOrDefault(client)
    .from("expert_contributions")
    .update({ transcript_text: transcriptText, ...(input.extractionPayload ? { extraction_payload: input.extractionPayload } : {}), processing_status: "EXTRACTED", processed_at: new Date().toISOString() })
    .eq("brand_id", input.brandId)
    .eq("expert_id", input.expertId)
    .eq("brief_id", input.briefId)
    .eq("id", input.contributionId)
    .select("id,transcript_text,processing_status")
    .maybeSingle();
  fail(result, "Não foi possível gravar a transcrição fiel da contribuição.");
  if (!result.data) throw new Error("EXPERT_CONTRIBUTION_TRANSCRIPT_WRITEBACK_NOT_FOUND");
  return result.data;
}

export async function persistExpertContributionOrganization(input: { brandId: string; expertId: string; briefId: string; contributionId: string; organizationPayload: Record<string, unknown> }, client?: PersistenceClient) {
  const result = await clientOrDefault(client)
    .from("expert_contributions")
    .update({ organization_payload: input.organizationPayload, processing_status: "EXTRACTED", processed_at: new Date().toISOString() })
    .eq("brand_id", input.brandId)
    .eq("expert_id", input.expertId)
    .eq("brief_id", input.briefId)
    .eq("id", input.contributionId)
    .select("id,transcript_text,organization_payload,processing_status")
    .maybeSingle();
  fail(result, "Não foi possível gravar a organização da contribuição.");
  if (!result.data) throw new Error("EXPERT_CONTRIBUTION_ORGANIZATION_WRITEBACK_NOT_FOUND");
  return result.data;
}

export async function markBindingInteraction(bindingId: string, brandId: string, client?: PersistenceClient) {
  const result = await clientOrDefault(client).from("telegram_expert_bindings").update({ last_interaction_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", bindingId).eq("brand_id", brandId).eq("status", "active");
  fail(result, "Não foi possível atualizar a interação do vínculo Telegram.");
}

export async function selectExpertBriefForTelegramBinding(input: { bindingId: string; brandId: string; expertId: string; briefId: string }, client?: PersistenceClient) {
  const now = new Date().toISOString();
  const result = await clientOrDefault(client)
    .from("telegram_expert_bindings")
    .update({ selected_brief_id: input.briefId, last_interaction_at: now, updated_at: now })
    .eq("id", input.bindingId)
    .eq("brand_id", input.brandId)
    .eq("expert_id", input.expertId)
    .eq("status", "active")
    .select("id,brand_id,expert_id,telegram_user_id,telegram_chat_id,status,selected_brief_id,last_interaction_at")
    .maybeSingle();
  fail(result, "Não foi possível associar o brief ao vínculo Telegram.");
  return result.data ? mapBinding(result.data as Record<string, unknown>) : null;
}

/**
 * Marks an already delivered brief as awaiting the expert. The send action
 * calls this only after Telegram confirms the message. Repeated UI attempts
 * read the existing sent state and do not call Telegram again.
 */
export async function markExpertBriefSent(input: { brandId: string; expertId: string; briefId: string; sentAt?: string }, client?: PersistenceClient) {
  const sentAt = input.sentAt || new Date().toISOString();
  const result = await clientOrDefault(client)
    .from("expert_briefs")
    .update({ status: "awaiting_expert", sent_at: sentAt, updated_at: sentAt })
    .eq("brand_id", input.brandId)
    .eq("expert_id", input.expertId)
    .eq("id", input.briefId)
    .eq("status", "ready_to_send")
    .is("sent_at", null)
    .select(EXPERT_BRIEF_SELECT)
    .maybeSingle();
  fail(result, "Não foi possível registrar o envio do ExpertBrief.");
  return result.data ? mapBrief(result.data as Record<string, unknown>) : null;
}

/** Claims the canonical ready_to_send transition so concurrent UI clicks do
 * not both enter the outbound provider call. A crashed process can still
 * leave this state for manual reconciliation; it is never guessed as sent. */
export async function claimExpertBriefForSend(input: { brandId: string; expertId: string; briefId: string }, client?: PersistenceClient) {
  const now = new Date().toISOString();
  const result = await clientOrDefault(client)
    .from("expert_briefs")
    .update({ status: "ready_to_send", updated_at: now })
    .eq("brand_id", input.brandId)
    .eq("expert_id", input.expertId)
    .eq("id", input.briefId)
    .eq("status", "reviewed")
    .is("sent_at", null)
    .select(EXPERT_BRIEF_SELECT)
    .maybeSingle();
  fail(result, "Não foi possível reservar o envio do ExpertBrief.");
  return result.data ? mapBrief(result.data as Record<string, unknown>) : null;
}

export async function restoreExpertBriefAfterSendFailure(input: { brandId: string; expertId: string; briefId: string }, client?: PersistenceClient) {
  const now = new Date().toISOString();
  const result = await clientOrDefault(client)
    .from("expert_briefs")
    .update({ status: "reviewed", updated_at: now })
    .eq("brand_id", input.brandId)
    .eq("expert_id", input.expertId)
    .eq("id", input.briefId)
    .eq("status", "ready_to_send")
    .is("sent_at", null);
  fail(result, "Não foi possível restaurar a pauta após a falha de envio.");
}
