import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  buildRadarExpertBriefContext,
  normalizeRadarExpertBriefQuestion,
  normalizeRadarExpertBriefQuestions,
  questionFromRadarSuggestion,
  radarExpertBriefMatchesContext,
  radarExpertBriefQuestionOriginLabel,
  radarExpertBriefStatusLabel,
} from "../lib/radar/expert-brief.ts";
import type { RadarR6ExpertTopicContext } from "../lib/radar/r6-sequential.ts";

const brandId = "10000000-0000-4000-8000-0000000000a1";
const expertId = "10000000-0000-4000-8000-0000000000a2";
const context = {
  articleId: "article-a",
  brandId,
  articleDnaVersionId: "article-dna-v1",
  articleDnaContentHash: "hash-a",
  articleDna: { principal: "keyword A", intent: "informacional", silo: "Silo A", audience: "paciente", problem: "problema A", desiredResult: "resultado A", requiredTopics: ["tema A"], knownQuestions: ["pergunta conhecida"] },
  keywordDnas: [{ keywordId: "keyword-a", keywordDnaVersionId: "keyword-dna-v1", keyword: "keyword A", role: "principal" }],
  siloDna: null,
  serpNeeds: ["Necessidade observada"],
  openGaps: ["Lacuna ainda aberta"],
  conflicts: [],
  knownQuestions: ["Pergunta observada"],
  approvedReferences: [{ position: 1, title: "Referência aprovada", url: "https://example.com/a", role: "primary" }],
  serpSnapshotId: "snapshot-a",
  serpSnapshotVersion: 1,
  serpReviewed: true,
  analysisVersionId: "analysis-a",
  amazonCriteria: [],
  amazonEvidence: [],
  amazonState: "AMAZON_NOT_APPLICABLE",
  existingContent: "Nenhum material existente do especialista associado.",
  existingContentItems: [],
  provenance: [
    { sourceType: "ArticleDNA", label: "ArticleDNA v1", referenceId: "article-dna-v1", url: null },
    { sourceType: "SERP", label: "Referência aprovada", referenceId: null, url: "https://example.com/a" },
  ],
} satisfies RadarR6ExpertTopicContext;

test("ExpertBrief preserva os status do contrato remoto sem criar enum paralelo", () => {
  assert.equal(radarExpertBriefStatusLabel("draft"), "Rascunho");
  assert.equal(radarExpertBriefStatusLabel("reviewed"), "Pauta revisada");
  assert.equal(radarExpertBriefStatusLabel("unknown"), "Estado não reconhecido");
});

test("perguntas são normalizadas como cópia de trabalho e vazios são rejeitados", () => {
  assert.equal(normalizeRadarExpertBriefQuestion("  Como funciona?  ")?.text, "Como funciona?");
  assert.equal(normalizeRadarExpertBriefQuestion({ text: "Pergunta", origin: "ai_suggestion", need: "Lacuna" }, 2)?.origin, "ai_suggestion");
  assert.equal(normalizeRadarExpertBriefQuestion({ text: "   " }), null);
  assert.equal(normalizeRadarExpertBriefQuestions(["Uma", { question: "Duas" }, null]).length, 2);
  assert.equal(radarExpertBriefQuestionOriginLabel("ai_suggestion"), "Sugestão de IA · revisar");
});

test("sugestão explícita de IA não vira aprovação nem evidência", () => {
  const question = questionFromRadarSuggestion({ text: "O que só este especialista sabe?", origin: "ArticleDNA", origins: ["ArticleDNA"], justification: "Lacuna prática", need: "Necessidade observada", reference: "ArticleDNA v1" }, 0);
  assert.equal(question.origin, "ai_suggestion");
  assert.equal(question.need, "Necessidade observada");
  assert.doesNotMatch(JSON.stringify(question), /approved|evidence/i);
});

test("contexto salvo separa necessidades, lacunas e proveniência aprovada", () => {
  const projected = buildRadarExpertBriefContext(context);
  assert.deepEqual(projected.needs, ["Necessidade observada"]);
  assert.deepEqual(projected.gaps, ["Lacuna ainda aberta"]);
  assert.equal(projected.approvedReferences[0]?.url, "https://example.com/a");
  assert.equal(projected.article.principal, "keyword A");
});

test("brief só pertence ao artigo, versão, especialista e tenant exatos", () => {
  const brief = { brandId, expertId, articleId: "article-a", articleDnaVersionId: "article-dna-v1" };
  assert.equal(radarExpertBriefMatchesContext(brief, { brandId, expertId, articleId: "article-a", articleDnaVersionId: "article-dna-v1" }), true);
  assert.equal(radarExpertBriefMatchesContext(brief, { brandId, expertId, articleId: "article-b", articleDnaVersionId: "article-dna-v1" }), false);
  assert.equal(radarExpertBriefMatchesContext(brief, { brandId, expertId, articleId: "article-a", articleDnaVersionId: "article-dna-v2" }), false);
  assert.equal(radarExpertBriefMatchesContext(brief, { brandId: "20000000-0000-4000-8000-0000000000a1", expertId, articleId: "article-a", articleDnaVersionId: "article-dna-v1" }), false);
  assert.equal(radarExpertBriefMatchesContext(brief, { brandId, expertId: "20000000-0000-4000-8000-0000000000a2", articleId: "article-a", articleDnaVersionId: "article-dna-v1" }), false);
});

test("rota contextualiza leitura e escrita, lê de volta e não dispara Telegram automaticamente", async () => {
  const source = await readFile(new URL("../app/api/editorial/expert-briefs/route.ts", import.meta.url), "utf8");
  assert.match(source, /articleDnaVersionId/);
  assert.match(source, /listExpertBriefsForContext/);
  assert.match(source, /export async function PATCH/);
  assert.match(source, /remote_readback_confirmed/);
  assert.match(source, /status: "draft"/);
  assert.match(source, /notification: "NOT_SENT"/);
  assert.doesNotMatch(source, /sendSharedTelegramMessage|issueBriefSelectionToken/);
});

test("painel real mantém criação distinta de salvamento e bloqueia envio incompleto", async () => {
  const panel = await readFile(new URL("../modules/radar/radar-expert-brief-panel.tsx", import.meta.url), "utf8");
  assert.match(panel, /Selecionar especialista/);
  assert.match(panel, /Criar pauta/);
  assert.match(panel, /Salvar pauta/);
  assert.match(panel, /LACUNAS OBSERVADAS/);
  assert.match(panel, /PERGUNTAS AO ESPECIALISTA/);
  assert.match(panel, /remote_readback_confirmed/);
  assert.match(panel, /Enviar ao especialista/);
  assert.match(panel, /\/api\/editorial\/expert-briefs\/send/);
  assert.match(panel, /projectRadarExpertEvidence/);
  assert.match(panel, /canonicalEvidence/);
  assert.match(panel, /A contribuição remota não vira ExpertEvidence automaticamente/);
  assert.doesNotMatch(panel, /telegramChatId|telegramUserId/);
  assert.doesNotMatch(panel, /ExpertContributionPanel/);
});

test("envio explícito preserva contexto, claim, readback e idempotência sem expor identificador Telegram", async () => {
  const route = await readFile(new URL("../app/api/editorial/expert-briefs/send/route.ts", import.meta.url), "utf8");
  assert.match(route, /claimExpertBriefForSend/);
  assert.match(route, /sendSharedTelegramMessage/);
  assert.match(route, /markExpertBriefSent/);
  assert.match(route, /selectExpertBriefForTelegramBinding/);
  assert.match(route, /remote_readback_confirmed/);
  assert.match(route, /already_confirmed/);
  assert.match(route, /articleDnaVersionId/);
  assert.doesNotMatch(route, /messageId:\s*sent\.messageId/);
  assert.doesNotMatch(route, /telegramChatId.*NextResponse|telegramUserId.*NextResponse/);
});

test("webhook aceita somente brief enviado e reencontra awaiting_review sem escolher a última pauta", async () => {
  const webhook = await readFile(new URL("../lib/server/telegram/webhook.ts", import.meta.url), "utf8");
  const persistence = await readFile(new URL("../lib/server/telegram/persistence.ts", import.meta.url), "utf8");
  assert.match(webhook, /selected\.sentAt/);
  assert.match(webhook, /TELEGRAM_BRIEF_NOT_SENT/);
  assert.match(webhook, /markExpertBriefAwaitingReview/);
  assert.match(persistence, /awaiting_review/);
  assert.match(persistence, /eq\("expert_id", input\.expertId\)/);
  assert.doesNotMatch(webhook, /briefs\[0\]/);
  assert.doesNotMatch(webhook, /last.*brief/i);
});

test("salvar a mesma pauta usa PATCH e não cria uma segunda pauta", async () => {
  const panel = await readFile(new URL("../modules/radar/radar-expert-brief-panel.tsx", import.meta.url), "utf8");
  assert.match(panel, /method: selectedBriefId \? "PATCH" : "POST"/);
  assert.match(panel, /briefId: selectedBriefId/);
  assert.match(panel, /current\.filter\(brief => brief\.id !== persisted\.id\)/);
});

test("detalhe canônico não renderiza mais a fixture médica no artigo real", async () => {
  const source = await readFile(new URL("../modules/radar/radar-analysis-page.tsx", import.meta.url), "utf8");
  assert.match(source, /RadarExpertBriefPanel/);
  assert.doesNotMatch(source, /<ExpertContributionPanel/);
});

test("detalhe só aprova e entrega ExpertEvidence após readback remoto revisado", async () => {
  const source = await readFile(new URL("../modules/radar/radar-analysis-page.tsx", import.meta.url), "utf8");
  assert.match(source, /\/api\/editorial\/expert-briefs\?/);
  assert.match(source, /remoteExpertEvidenceSelectionKey/);
  assert.match(source, /expertEvidenceNeedsReapproval/);
  assert.match(source, /onExpertEvidenceChange=\{refreshRemoteExpertEvidence\}/);
  // A leitura remota continua sendo o insumo do detalhe; o que mudou é onde a
  // REGRA mora. Ela saiu da tela para a autoridade única — o Workbench aplica
  // exatamente a mesma —, então é lá que a frase precisa ser conferida.
  assert.match(source, /approved: remoteExpertEvidence\.evidence/);
  assert.match(source, /pendingCount: remoteExpertEvidence\.pendingCount/);
  const autoridade = await readFile(new URL("../lib/radar/report-approval.ts", import.meta.url), "utf8");
  assert.match(autoridade, /Revise todas as contribuições remotas do especialista antes de aprovar o relatório/);
});

test("Workbench usa o articleId canônico ao hidratar o contexto do ExpertBrief", async () => {
  const source = await readFile(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8");
  assert.match(source, /return buildExpertTopicContext\(row\.articleId, \{/);
  assert.doesNotMatch(source, /return buildExpertTopicContext\(row\.id, \{/);
});
