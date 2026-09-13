import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  RADAR_SPECIALIST_STATES,
  radarSpecialistCounters,
  radarSpecialistDraftFromRequirement,
  radarSpecialistDraftIdentity,
  radarSpecialistDuplicateDraft,
  radarSpecialistRequirementIdOf,
  radarSpecialistReviewPoints,
  radarSpecialistStateFromBrief,
  radarSpecialistStateLabel,
  type RadarFrozenSpecialistRequirement,
  type RadarSpecialistBriefReading,
} from "../lib/radar/specialist-lifecycle.ts";
import { RadarFrozenEvidenceBundleSchema } from "../lib/radar/investigation-finalization.ts";
import type { RadarR6ExpertTopicContext } from "../lib/radar/r6-sequential.ts";
import { montarRadar, comProductShell, React } from "./radar-dom-harness.mts";

/* ============================== o cenário =============================== */

const brandId = "20000000-0000-4000-8000-0000000000b1";
const expertId = "20000000-0000-4000-8000-0000000000b2";
const outroExpertId = "20000000-0000-4000-8000-0000000000b3";
const articleId = "article-specialist-1";
const articleDnaVersionId = "article-dna-v7";

const requisito: RadarFrozenSpecialistRequirement = {
  requirementId: "specialist:aa11bb22",
  claimId: "claim:excesso-de-sebo",
  kind: "RESOLVE_CONFLICT",
  priority: "HIGH",
  specificQuestion: "Excesso de sebo é causa de acne ou apenas um fator agravante?",
  topic: "Excesso de sebo como causa de acne",
  claim: "Causa: excesso de sebo provoca acne",
  whyReviewIsNeeded: "O mercado afirma uma coisa e a evidência factual encontrada diz outra.",
  ymylRelevance: "HIGH",
  marketObservation: "Nove das dez páginas tratam sebo como causa direta.",
  factualEvidence: "ncbi.nlm.nih.gov (fonte primária): contradiz parcialmente.",
  conflict: "O mercado diz causa; a literatura descreve um entre quatro fatores.",
  sourceCandidates: ["ncbi.nlm.nih.gov", "sbd.org.br"],
  provenance: "Observado em 10 páginas. Evidência factual de 2 fonte(s).",
};

const requisitoEstreito: RadarFrozenSpecialistRequirement = {
  requirementId: "specialist:cc33dd44",
  claimId: "claim:pele-oleosa",
  kind: "VERIFY_AND_ADD_EXPERIENCE",
  priority: "MEDIUM",
  specificQuestion: "Na sua prática, o que mais piora a oleosidade do rosto?",
};

const pauta = (parcial: Partial<RadarSpecialistBriefReading> = {}): RadarSpecialistBriefReading => ({
  id: "brief-1",
  expertId,
  status: "draft",
  sentAt: null,
  requirementId: requisito.requirementId,
  contributionIds: [],
  acceptedContributionIds: [],
  ...parcial,
});

const contexto = {
  articleId,
  brandId,
  articleDnaVersionId,
  articleDnaContentHash: "hash-specialist-1",
  articleDna: { principal: "acne", intent: "informacional", silo: "Pele", audience: "paciente", problem: "acne persistente", desiredResult: "entender a causa", requiredTopics: ["causas"], knownQuestions: ["o que causa acne?"] },
  keywordDnas: [{ keywordId: "keyword-acne", keywordDnaVersionId: "keyword-dna-v1", keyword: "acne", role: "principal" }],
  siloDna: null,
  serpNeeds: ["Explicar as causas reais"],
  openGaps: ["Ninguém separa causa de fator agravante"],
  conflicts: [],
  knownQuestions: ["O que causa acne?"],
  approvedReferences: [{ position: 1, title: "Referência", url: "https://example.com/a", role: "primary" }],
  serpSnapshotId: "snapshot-1",
  serpSnapshotVersion: 1,
  serpReviewed: true,
  analysisVersionId: "analysis-1",
  amazonCriteria: [],
  amazonEvidence: [],
  amazonState: "AMAZON_NOT_APPLICABLE",
  existingContent: "Nenhum material existente do especialista associado.",
  existingContentItems: [],
  provenance: [{ sourceType: "ArticleDNA", label: "ArticleDNA v7", referenceId: articleDnaVersionId, url: null }],
} satisfies RadarR6ExpertTopicContext;

/* ===================== §6 · o vocabulário canônico ===================== */

test("SPECIALIST_1 · §6 — `reviewed` sem envio é APROVADA PARA ENVIO, nunca enviada", () => {
  assert.equal(radarSpecialistStateFromBrief({ status: "draft", sentAt: null, contributions: 0 }), "DRAFT");
  assert.equal(radarSpecialistStateFromBrief({ status: "ready_to_send", sentAt: null, contributions: 0 }), "READY_TO_SEND");

  /* A fronteira inteira do gate: aprovar não é enviar. */
  assert.equal(radarSpecialistStateFromBrief({ status: "reviewed", sentAt: null, contributions: 0 }), "APPROVED_TO_SEND");
  assert.notEqual(radarSpecialistStateFromBrief({ status: "reviewed", sentAt: null, contributions: 0 }), "SENT");

  /* E `sent_at` tem precedência sobre qualquer rótulo da coluna. */
  assert.equal(radarSpecialistStateFromBrief({ status: "reviewed", sentAt: "2026-09-13T10:00:00Z", contributions: 0 }), "WAITING_RESPONSE");
  assert.equal(radarSpecialistStateFromBrief({ status: "draft", sentAt: "2026-09-13T10:00:00Z", contributions: 0 }), "WAITING_RESPONSE");
});

test("SPECIALIST_1 · §6 — a segunda revisão do enum legado não vira a primeira", () => {
  /* `awaiting_review` é contribuição a revisar, e só existe com resposta. */
  assert.equal(radarSpecialistStateFromBrief({ status: "awaiting_review", sentAt: "2026-09-13T10:00:00Z", contributions: 1 }), "AWAITING_CONTRIBUTION_REVIEW");
  assert.equal(radarSpecialistStateFromBrief({ status: "awaiting_review", sentAt: "2026-09-13T10:00:00Z", contributions: 1, acceptedContributions: 1 }), "ACCEPTED");
  assert.equal(radarSpecialistStateFromBrief({ status: "awaiting_review", sentAt: "2026-09-13T10:00:00Z", contributions: 1, reviewedContributions: 1, acceptedContributions: 0 }), "REJECTED");
  assert.equal(radarSpecialistStateFromBrief({ status: "cancelled", sentAt: null, contributions: 0 }), "CANCELLED");
  assert.equal(radarSpecialistStateFromBrief({ status: "blocked", sentAt: null, contributions: 0 }), "BLOCKED");
});

test("SPECIALIST_1 · §6 — a tela nunca recebe o rótulo cru do banco", async () => {
  const painel = await readFile(new URL("../modules/radar/radar-expert-brief-panel.tsx", import.meta.url), "utf8");
  const semComentarios = painel.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  /* A projeção canônica é a única fonte de estado exibido. */
  assert.match(semComentarios, /radarSpecialistStateLabel\(/);
  assert.doesNotMatch(semComentarios, /radarExpertBriefStatusLabel/);
  assert.ok(RADAR_SPECIALIST_STATES.includes("APPROVED_TO_SEND"));
  assert.equal(radarSpecialistStateLabel("APPROVED_TO_SEND"), "Aprovada para envio");

  /*
   * A fixture local tem um `status` próprio e não lê `expert_briefs`.
   * Ela continua trancada atrás do modo de teste explícito — se passasse a
   * ser renderizada no artigo real, o rótulo dela voltaria a valer como estado.
   */
  const area = await readFile(new URL("../modules/radar/radar-r3-specialist-panel.tsx", import.meta.url), "utf8");
  assert.match(area, /showLocalFixture \? <details/);
});

/* ====================== §5 · os contadores reais ======================= */

test("SPECIALIST_1 · §5 — rascunho jamais conta como pedido enviado", () => {
  const contadores = radarSpecialistCounters({
    requirements: [requisito, requisitoEstreito],
    briefs: [
      pauta({ id: "brief-draft", status: "draft", sentAt: null }),
      pauta({ id: "brief-aprovada", status: "reviewed", sentAt: null, requirementId: requisitoEstreito.requirementId }),
    ],
  });

  assert.equal(contadores.prepared, 2);
  assert.equal(contadores.drafts, 2);
  assert.equal(contadores.sent, 0, "sem `sent_at` nenhum pedido foi enviado");
  assert.equal(contadores.waiting, 0);
  assert.equal(contadores.responded, 0);
  assert.equal(contadores.accepted, 0);
});

test("SPECIALIST_1 · §5 — enviado, aguardando, respondido e aceito são contados separadamente", () => {
  const contadores = radarSpecialistCounters({
    requirements: [requisito, requisitoEstreito],
    briefs: [
      pauta({ id: "brief-aguardando", sentAt: "2026-09-13T09:00:00Z", status: "awaiting_expert" }),
      pauta({ id: "brief-respondida", sentAt: "2026-09-13T09:00:00Z", status: "awaiting_review", contributionIds: ["c1", "c2"], acceptedContributionIds: ["c1"] }),
      pauta({ id: "brief-rascunho", status: "draft", sentAt: null }),
    ],
  });

  assert.equal(contadores.prepared, 2);
  assert.equal(contadores.sent, 2, "só as duas com `sent_at`");
  assert.equal(contadores.waiting, 1, "enviada e ainda sem resposta");
  assert.equal(contadores.responded, 1, "uma pauta recebeu contribuição");
  assert.equal(contadores.accepted, 1, "uma contribuição foi aceita como evidência");
  assert.equal(contadores.drafts, 1);
});

test("SPECIALIST_1 · §5 — a página lê os contadores do banco e não tem mais zero fixo", async () => {
  const pagina = await readFile(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8");
  const semComentarios = pagina.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  assert.doesNotMatch(semComentarios, /requestsSent: 0/, "REQUESTS_SENT_HARDCODED = NO");
  assert.match(semComentarios, /requestsSent: expertSummary\?\.counters\.sent \|\| 0/);
  /* Duas leituras: a linha de atividade e a projeção que alimenta a planilha. */
  assert.equal((semComentarios.match(/requestsSent: expertSummary\?\.counters\.sent \|\| 0/g) || []).length, 2);
  assert.match(semComentarios, /counters: summary\.counters/);
});

/* ================== §2 e §3 · o requisito vira pauta ================== */

test("SPECIALIST_1 · §3 — a pergunta enviada é a que a investigação escreveu", () => {
  const rascunho = radarSpecialistDraftFromRequirement({ requirement: requisito, brandId, articleId, articleDnaVersionId, expertId });

  assert.equal(rascunho.title, "Excesso de sebo como causa de acne");
  assert.equal(rascunho.questions.length, 1);
  assert.equal(rascunho.questions[0].text, requisito.specificQuestion);
  assert.equal(rascunho.questions[0].origin, "radar");
  assert.equal(rascunho.questions[0].justification, requisito.conflict);
  assert.equal(rascunho.radarContext.requirementId, requisito.requirementId);
  assert.equal(rascunho.radarContext.origin, "radar_specialist_requirement");
  assert.deepEqual(rascunho.radarContext.sourceCandidates, ["ncbi.nlm.nih.gov", "sbd.org.br"]);
});

test("SPECIALIST_1 · §3 — snapshot estreito ainda produz pauta utilizável", () => {
  const rascunho = radarSpecialistDraftFromRequirement({ requirement: requisitoEstreito, brandId, articleId, articleDnaVersionId, expertId });

  /*
   * Sem `topic` nem `claim`, o título cai na PERGUNTA — nunca vazio, e nunca
   * um identificador interno (SPECIALIST_1.1 tirou ids da visão operacional).
   */
  assert.equal(rascunho.title, requisitoEstreito.specificQuestion);
  assert.ok(!rascunho.title.includes(requisitoEstreito.requirementId));
  assert.equal(rascunho.questions[0].text, requisitoEstreito.specificQuestion);
  assert.equal(rascunho.radarContext.topic, null);
  assert.equal(rascunho.radarContext.conflict, null);
  assert.deepEqual(rascunho.radarContext.sourceCandidates, []);
});

test("SPECIALIST_1 · §2 — a identidade da pauta é marca, artigo, versão, requisito e especialista", () => {
  const base = { brandId, articleId, articleDnaVersionId, requirementId: requisito.requirementId, expertId };
  const identidade = radarSpecialistDraftIdentity(base);

  assert.equal(radarSpecialistDraftIdentity({ ...base }), identidade);
  assert.notEqual(radarSpecialistDraftIdentity({ ...base, expertId: outroExpertId }), identidade);
  assert.notEqual(radarSpecialistDraftIdentity({ ...base, articleDnaVersionId: "article-dna-v8" }), identidade);
  assert.notEqual(radarSpecialistDraftIdentity({ ...base, requirementId: requisitoEstreito.requirementId }), identidade);
});

test("SPECIALIST_1 · §2 — a guarda encontra a pauta gêmea pelo requisito, não pelo título", () => {
  const existentes = [
    { id: "brief-avulsa", radarContext: { article: "x" } },
    { id: "brief-do-ponto", radarContext: { specialistRequirement: { requirementId: requisito.requirementId } } },
  ];

  assert.equal(radarSpecialistDuplicateDraft({ requirementId: requisito.requirementId, briefs: existentes })?.id, "brief-do-ponto");
  assert.equal(radarSpecialistDuplicateDraft({ requirementId: requisitoEstreito.requirementId, briefs: existentes }), null);
  /* Pauta avulsa não tem identidade a proteger: uma pessoa decidiu criá-la. */
  assert.equal(radarSpecialistDuplicateDraft({ requirementId: null, briefs: existentes }), null);
});

test("SPECIALIST_1 · §2 — a proveniência é lida do contexto, aninhada ou achatada", () => {
  assert.equal(radarSpecialistRequirementIdOf({ specialistRequirement: { requirementId: "specialist:x" } }), "specialist:x");
  assert.equal(radarSpecialistRequirementIdOf({ requirementId: "specialist:y" }), "specialist:y");
  assert.equal(radarSpecialistRequirementIdOf({ specialistRequirement: { requirementId: "  " }, requirementId: "specialist:z" }), "specialist:z");
  assert.equal(radarSpecialistRequirementIdOf({}), null);
  assert.equal(radarSpecialistRequirementIdOf(null), null);
  assert.equal(radarSpecialistRequirementIdOf([{ requirementId: "specialist:w" }]), null);
});

test("SPECIALIST_1 · §2 — a rota recusa a duplicata antes de inserir e não envia nada", async () => {
  const rota = await readFile(new URL("../app/api/editorial/expert-briefs/route.ts", import.meta.url), "utf8");
  const semComentarios = rota.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  /*
   * A POSIÇÃO DA CHAMADA, não a do import.
   *
   * Medir `radarSpecialistDuplicateDraft` cru encontrava a linha de import, que
   * fica no topo do arquivo por construção — e a ordem "guarda antes da
   * inserção" passaria mesmo com a guarda depois. Provado por mutação.
   */
  const guarda = semComentarios.indexOf("radarSpecialistDuplicateDraft({");
  const insercao = semComentarios.indexOf("createExpertBrief(");
  assert.ok(guarda > 0, "a guarda é chamada");
  assert.ok(insercao > 0, "a inserção existe");
  assert.ok(guarda < insercao, "a guarda roda ANTES da inserção");
  assert.equal((semComentarios.match(/createExpertBrief\(/g) || []).length, 1, "há uma única inserção");

  assert.match(semComentarios, /creation: "already_exists"/);
  assert.match(semComentarios, /status: "draft"/, "CREATING_DRAFT_SETS_SENT_AT = NO");
  assert.doesNotMatch(semComentarios, /sent_at|sentAt:/, "a criação não escreve data de envio");
  assert.doesNotMatch(semComentarios, /sendSharedTelegramMessage|markExpertBriefSent/, "CREATING_DRAFT_SENDS_TELEGRAM = NO");
});

/* =============== §7 · os pontos e o que aconteceu com eles ============= */

test("SPECIALIST_1 · §7 — ponto sem pauta é PREPARED e só ele oferece criar", () => {
  const pontos = radarSpecialistReviewPoints({
    requirements: [requisito, requisitoEstreito],
    briefs: [pauta({ id: "brief-1", sentAt: "2026-09-13T09:00:00Z", status: "awaiting_expert" })],
  });

  const [comPauta, semPauta] = pontos;
  assert.equal(comPauta.state, "WAITING_RESPONSE");
  assert.equal(comPauta.canCreateDraft, false);
  assert.equal(comPauta.briefId, "brief-1");
  assert.equal(comPauta.expertId, expertId);

  assert.equal(semPauta.state, "PREPARED");
  assert.equal(semPauta.canCreateDraft, true);
  assert.equal(semPauta.briefId, null);
  assert.equal(semPauta.title, requisitoEstreito.specificQuestion);
  assert.equal(semPauta.stateLabel, "Ponto preparado");
});

test("SPECIALIST_1 · §7 — a pauta de outro ponto não empresta estado a este", () => {
  const pontos = radarSpecialistReviewPoints({
    requirements: [requisito, requisitoEstreito],
    briefs: [pauta({ id: "brief-outro", requirementId: requisitoEstreito.requirementId, sentAt: "2026-09-13T09:00:00Z", status: "awaiting_review", contributionIds: ["c9"] })],
  });

  assert.equal(pontos[0].state, "PREPARED");
  assert.deepEqual(pontos[0].contributionIds, []);
  assert.equal(pontos[1].state, "AWAITING_CONTRIBUTION_REVIEW");
  assert.deepEqual(pontos[1].contributionIds, ["c9"]);
});

/* ================ §4 · o congelamento mais largo, sem quebrar ========== */

/** A forma de UM requisito dentro do bundle congelado — o alvo do §4. */
const formaDoRequisito = RadarFrozenEvidenceBundleSchema.shape.authority.shape.specialistRequirements.element;

test("SPECIALIST_1 · §4 — o snapshot estreito de um bundle antigo continua legível", () => {
  const forma = formaDoRequisito;

  const antigo = forma.safeParse({
    requirementId: "specialist:antigo",
    claimId: "claim:antigo",
    kind: "RESOLVE_CONFLICT",
    priority: "HIGH",
    specificQuestion: "A pergunta congelada antes do alargamento.",
  });
  assert.equal(antigo.success, true, "CURRENT_FROZEN_BUNDLE_MUTATED = NO");
});

test("SPECIALIST_1 · §4 — o snapshot novo preserva o contexto editorial inteiro", () => {
  const forma = formaDoRequisito;

  const novo = forma.safeParse(requisito);
  assert.equal(novo.success, true);
  assert.equal(novo.data?.topic, requisito.topic);
  assert.equal(novo.data?.conflict, requisito.conflict);
  assert.deepEqual(novo.data?.sourceCandidates, requisito.sourceCandidates);

  /* Alargar não é afrouxar: campo desconhecido continua recusado. */
  assert.equal(forma.safeParse({ ...requisito, inventado: "x" }).success, false);
});

test("SPECIALIST_1 · §4 — o congelamento popula os campos novos a partir da autoridade viva", async () => {
  const fonte = await readFile(new URL("../lib/radar/investigation-finalization.ts", import.meta.url), "utf8");
  const semComentarios = fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  for (const campo of ["topic: item.topic", "claim: item.claim", "whyReviewIsNeeded: item.whyReviewIsNeeded", "conflict: item.conflict", "provenance: item.provenance"]) {
    assert.ok(semComentarios.includes(campo), `o congelamento carrega ${campo}`);
  }
  assert.ok(semComentarios.includes("sourceCandidates: [...item.sourceCandidates]"));
  assert.ok(RadarFrozenEvidenceBundleSchema, "o schema exportado é o mesmo do congelamento");
});

/* ================= §7, §8 e §9 · o layout, no DOM real ================= */

type RespostaFalsa = { experts?: unknown[]; bindings?: unknown[]; briefs?: unknown[]; contributions?: unknown[] };

function servidorFalso(dados: RespostaFalsa) {
  const chamadas: Array<{ url: string; method: string; body: Record<string, unknown> | null }> = [];
  const original = globalThis.fetch;
  const criadas: Record<string, unknown>[] = [];

  globalThis.fetch = (async (entrada: unknown, init?: { method?: string; body?: string }) => {
    const url = String(entrada);
    const method = init?.method || "GET";
    const body = init?.body ? JSON.parse(init.body) as Record<string, unknown> : null;
    chamadas.push({ url, method, body });

    if (method === "GET") {
      return { ok: true, json: async () => ({ experts: dados.experts || [], bindings: dados.bindings || [], briefs: dados.briefs || [], contributions: dados.contributions || [] }) };
    }
    const criada = {
      id: `brief-criada-${criadas.length + 1}`,
      brandId, expertId,
      articleId, articleDnaVersionId,
      title: String(body?.title || ""),
      radarContext: body?.radarContext || {},
      questions: Array.isArray(body?.questions) ? body.questions : [],
      status: "draft",
      createdAt: "2026-09-13T10:00:00Z",
      updatedAt: "2026-09-13T10:00:00Z",
      sentAt: null,
      completedAt: null,
    };
    criadas.push(criada);
    /* A rota de consulta devolve o convite junto; a de pauta, só o readback. */
    return url.includes("/expert-consultations")
      ? { ok: true, json: async () => ({ brief: criada, expertId, connected: false, notification: "NOT_SENT", invite: { link: "https://t.me/bot_de_teste?start=tok-123", message: "Olá. …\n\nhttps://t.me/bot_de_teste?start=tok-123", botUsername: "bot_de_teste", expiresAt: "2026-09-14T10:00:00Z" } }) }
      : { ok: true, json: async () => ({ brief: criada, persistence: "remote_readback_confirmed", notification: "NOT_SENT", creation: "created" }) };
  }) as typeof globalThis.fetch;

  return { chamadas, criadas, restaurar: () => { globalThis.fetch = original; } };
}

const expertAtivo = { id: expertId, brandId, displayName: "Dra. X", specialty: "Dermatologia", status: "active", createdAt: "2026-01-01T00:00:00Z" };

async function montarPainel(dados: RespostaFalsa, requirements: RadarFrozenSpecialistRequirement[]) {
  const servidor = servidorFalso(dados);
  const tela = await montarRadar();
  const { RadarExpertBriefPanel } = await import("../modules/radar/radar-expert-brief-panel.tsx");
  await tela.render(comProductShell(React.createElement(RadarExpertBriefPanel, {
    brandId, articleId, articleDnaVersionId,
    articleTitle: "O que causa acne",
    articleVersion: "v7",
    articleRole: "pilar",
    context: contexto,
    requirements,
    onExpertEvidenceChange: () => {},
  })));
  return { tela, servidor };
}

test("SPECIALIST_1 · §7 e §9 — entradas à esquerda, pontos à direita, resultado em largura inteira", async () => {
  const { tela, servidor } = await montarPainel({ experts: [expertAtivo] }, [requisito]);
  try {
    /* Uma grade só: duas apagariam a diferença entre dentro e fora dela. */
    assert.equal(tela.all("radar-specialist-operational-grid").length, 1);
    const grade = tela.get("radar-specialist-operational-grid");
    assert.match(grade.className, /lg:grid-cols-\[minmax\(0,2fr\)_minmax\(0,1fr\)\]/, "duas colunas no desktop");
    assert.doesNotMatch(grade.className, /^grid-cols-2|\sgrid-cols-2/, "MOBILE_ORDER_CORRECT: coluna única no mobile");

    const entradas = tela.get("radar-specialist-entries-column");
    const pontos = tela.get("radar-specialist-review-points-column");
    const resultado = tela.get("radar-specialist-review-result");

    assert.equal(entradas.parentElement, grade, "ENTRIES_LEFT");
    assert.equal(pontos.parentElement, grade, "REVIEW_POINTS_RIGHT");
    assert.equal(pontos.tagName, "ASIDE");
    /* Descendente, não filho direto: aninhar numa camada a mais não vale. */
    assert.equal(grade.contains(resultado), false, "RESULT_FULL_WIDTH: o resultado não está dentro da grade");

    /* A ordem do DOM é a ordem que o mobile empilha. */
    const ordem = [...tela.container.querySelectorAll("[data-testid]")].map(item => item.getAttribute("data-testid"));
    assert.ok(ordem.indexOf("radar-specialist-entries-column") < ordem.indexOf("radar-specialist-review-points-column"));
    assert.ok(ordem.indexOf("radar-specialist-review-points-column") < ordem.indexOf("radar-specialist-review-result"));
  } finally {
    tela.destroy();
    servidor.restaurar();
  }
});

test("SPECIALIST_1 · §7 — a coluna direita mostra o ponto preparado com pergunta, motivo e prioridade", async () => {
  const { tela, servidor } = await montarPainel({ experts: [expertAtivo] }, [requisito]);
  try {
    const coluna = tela.get("radar-specialist-review-points-column");
    const texto = coluna.textContent || "";
    assert.ok(texto.includes("Excesso de sebo como causa de acne"));
    assert.ok(texto.includes(requisito.specificQuestion));
    assert.ok(texto.includes("O mercado afirma uma coisa"));
    assert.ok(texto.includes("ALTA"), `a prioridade, curta: ${texto}`);
    assert.ok(texto.includes("Ponto preparado"), "o estado real, no vocabulário canônico");
    assert.equal(tela.all("radar-specialist-review-point").length, 1);
  } finally {
    tela.destroy();
    servidor.restaurar();
  }
});

test("SPECIALIST_1 · §8 — áudio transcrito aparece como texto consultável e recolhido", async () => {
  const pautaRemota = {
    id: "brief-remota", brandId, expertId, articleId, articleDnaVersionId,
    title: "Pauta do ponto", radarContext: { specialistRequirement: { requirementId: requisito.requirementId } },
    questions: [], status: "awaiting_review", createdAt: "2026-09-13T09:00:00Z", updatedAt: "2026-09-13T09:30:00Z",
    sentAt: "2026-09-13T09:10:00Z", completedAt: null,
  };
  const contribuicao = {
    id: "contrib-1", brandId, expertId, briefId: "brief-remota",
    sourceType: "VOICE", originalText: null, transcriptText: "Sebo é um entre quatro fatores, não a causa isolada.",
    organizationPayload: { text: "Ressalva: sebo é fator, não causa.", durationSeconds: 226 },
    processingStatus: "EXTRACTED", receivedAt: "2026-09-13T09:20:00Z",
    evidence: { externalUpdateId: "update-1", originalAssetUri: null, checksum: null },
  };

  const { tela, servidor } = await montarPainel({ experts: [expertAtivo], briefs: [pautaRemota], contributions: [contribuicao] }, [requisito]);
  try {
    const entrada = tela.all("radar-specialist-entry");
    assert.equal(entrada.length, 1);
    assert.ok((entrada[0].textContent || "").includes("Dra. X · Mensagem de voz"));
    assert.ok((entrada[0].textContent || "").includes("3:46"), "a duração aparece quando o provider a informou");
    assert.ok((entrada[0].textContent || "").includes("Responde ao ponto: Excesso de sebo"));

    const transcricao = tela.get("radar-specialist-entry-transcript");
    assert.equal(transcricao.tagName, "DETAILS");
    assert.equal(transcricao.hasAttribute("open"), false, "RAW_TRANSCRIPTS_COLLAPSED = YES");

    /* E o resultado se organiza pelo ponto, não por uma lista solta. */
    const resultado = tela.get("radar-specialist-result-point");
    assert.ok((resultado.textContent || "").includes("Excesso de sebo como causa de acne"));
    assert.ok((resultado.textContent || "").includes("Contribuição a revisar"));
    assert.ok((resultado.textContent || "").includes("Ressalva: sebo é fator, não causa."));
    assert.equal(tela.query("radar-specialist-result-unassigned"), null);
  } finally {
    tela.destroy();
    servidor.restaurar();
  }
});

test("SPECIALIST_1 · §8 — resposta de pauta avulsa é mostrada como ainda não associada", async () => {
  const pautaAvulsa = {
    id: "brief-avulsa", brandId, expertId, articleId, articleDnaVersionId,
    title: "Pauta avulsa", radarContext: {}, questions: [], status: "awaiting_review",
    createdAt: "2026-09-13T09:00:00Z", updatedAt: "2026-09-13T09:30:00Z", sentAt: "2026-09-13T09:10:00Z", completedAt: null,
  };
  const contribuicao = {
    id: "contrib-2", brandId, expertId, briefId: "brief-avulsa",
    sourceType: "TEXT", originalText: "Resposta em texto.", transcriptText: null, organizationPayload: null,
    processingStatus: "RECEIVED", receivedAt: "2026-09-13T09:20:00Z",
    evidence: { externalUpdateId: "update-2", originalAssetUri: null, checksum: null },
  };

  const { tela, servidor } = await montarPainel({ experts: [expertAtivo], briefs: [pautaAvulsa], contributions: [contribuicao] }, [requisito]);
  try {
    assert.ok(tela.get("radar-specialist-entry").textContent?.includes("Contribuição ainda não associada a um ponto de revisão."));
    assert.ok(tela.get("radar-specialist-result-unassigned").textContent?.includes("não é feita automaticamente sem evidência suficiente"));
    /* O ponto continua preparado: a resposta avulsa não o resolve. */
    assert.ok(tela.get("radar-specialist-review-point").textContent?.includes("Ponto preparado"));
  } finally {
    tela.destroy();
    servidor.restaurar();
  }
});

/* ============== §2 · o clique que cria — e o que ele não faz ========== */

test("SPECIALIST_1 · §2 — criar a consulta é ação humana explícita e leva a proveniência do ponto", async () => {
  /*
   * O SPECIALIST_2.1 tirou a exigência de escolher um especialista antes: a
   * rota de consulta cria o participante. O que este teste protege continua
   * sendo o mesmo — o clique é de uma pessoa, e ele não envia nada.
   */
  const { tela, servidor } = await montarPainel({ experts: [expertAtivo] }, [requisito]);
  try {
    const botao = tela.get("radar-specialist-create-consultation") as HTMLButtonElement;
    assert.equal(botao.disabled, false, "não é preciso cadastrar ninguém antes");
    assert.equal(servidor.chamadas.filter(item => item.method === "POST").length, 0, "montar a tela não cria consulta nenhuma");

    await tela.click("radar-specialist-create-consultation");

    const posts = servidor.chamadas.filter(item => item.method === "POST");
    assert.equal(posts.length, 1, "REQUIREMENT_CAN_CREATE_DRAFT = YES");
    assert.equal(posts[0].url, "/api/editorial/expert-consultations");

    const corpo = posts[0].body as Record<string, unknown>;
    const enviado = corpo.requirement as Record<string, unknown>;
    assert.equal(enviado.requirementId, requisito.requirementId, "DRAFT_PROVENANCE_HAS_REQUIREMENT_ID = YES");
    assert.equal(enviado.specificQuestion, requisito.specificQuestion);
    assert.equal(corpo.expertId, undefined, "nenhum especialista é escolhido no cliente");

    /* PREPARED != SENT, do lado de cá do clique. */
    assert.equal(corpo.status, undefined, "a criação não declara estado aprovado");
    assert.equal(corpo.sentAt, undefined, "CREATING_DRAFT_SETS_SENT_AT = NO");
    assert.equal(servidor.chamadas.some(item => item.url.includes("/send")), false, "CREATING_DRAFT_SENDS_TELEGRAM = NO");
  } finally {
    tela.destroy();
    servidor.restaurar();
  }
});

test("SPECIALIST_1 · §2 — dois cliques seguidos não abrem dois pedidos", async () => {
  const { tela, servidor } = await montarPainel({ experts: [expertAtivo] }, [requisito]);
  try {
    await tela.doubleClick("radar-specialist-create-consultation");

    assert.equal(servidor.chamadas.filter(item => item.method === "POST").length, 1, "DUPLICATE_DRAFT_PROTECTED = YES");
  } finally {
    tela.destroy();
    servidor.restaurar();
  }
});

test("SPECIALIST_1 · §5 — a tela mostra pedidos enviados lidos do banco, não um zero", async () => {
  const enviada = {
    id: "brief-enviada", brandId, expertId, articleId, articleDnaVersionId,
    title: "Pauta enviada", radarContext: { specialistRequirement: { requirementId: requisito.requirementId } },
    questions: [], status: "awaiting_expert", createdAt: "2026-09-13T09:00:00Z", updatedAt: "2026-09-13T09:00:00Z",
    sentAt: "2026-09-13T09:10:00Z", completedAt: null,
  };
  const rascunho = {
    id: "brief-rascunho", brandId, expertId, articleId, articleDnaVersionId,
    title: "Pauta em rascunho", radarContext: { specialistRequirement: { requirementId: requisitoEstreito.requirementId } },
    questions: [], status: "draft", createdAt: "2026-09-13T09:00:00Z", updatedAt: "2026-09-13T09:00:00Z",
    sentAt: null, completedAt: null,
  };

  const { tela, servidor } = await montarPainel({ experts: [expertAtivo], briefs: [enviada, rascunho] }, [requisito, requisitoEstreito]);
  try {
    const contadores = tela.get("radar-specialist-counters").textContent || "";
    assert.ok(contadores.includes("2 ponto(s) preparado(s)"), `pontos preparados: ${contadores}`);
    assert.ok(contadores.includes("1 enviado(s)"), `um pedido enviado, não dois: ${contadores}`);
    assert.ok(contadores.includes("0 resposta(s)"));
    assert.ok(contadores.includes("0 aceita(s)"));

    const pautas = tela.all("radar-specialist-brief-row").map(item => item.textContent || "");
    assert.ok(pautas.some(texto => texto.includes("Aguardando o especialista")));
    assert.ok(pautas.some(texto => texto.includes("Pauta em rascunho")));
    assert.ok(!pautas.some(texto => texto.includes("Pauta revisada")), "o rótulo legado não chega à tela");
  } finally {
    tela.destroy();
    servidor.restaurar();
  }
});

/* ==================== §10 e §12 · o que não mudou ==================== */

test("SPECIALIST_1 · §10 — webhook, bot, mídia e worker do Telegram não foram tocados", async () => {
  const webhook = await readFile(new URL("../lib/server/telegram/webhook.ts", import.meta.url), "utf8");
  const envio = await readFile(new URL("../app/api/editorial/expert-briefs/send/route.ts", import.meta.url), "utf8");

  /* O gate usa o que já existe: a ponte não reescreve nenhuma dessas peças. */
  assert.match(webhook, /markExpertBriefAwaitingReview/);
  assert.match(envio, /markExpertBriefSent/);
  assert.doesNotMatch(webhook, /radarSpecialistDraftFromRequirement|radarSpecialistCounters/);
  assert.doesNotMatch(envio, /radarSpecialistDraftFromRequirement/);

  /* Comentários citam Telegram porque explicam o legado; o CÓDIGO não o toca. */
  const dominio = (await readFile(new URL("../lib/radar/specialist-lifecycle.ts", import.meta.url), "utf8"))
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(dominio, /fetch\(|createClient|supabase|localStorage|sendSharedTelegramMessage/i, "o domínio é puro");
});

test("SPECIALIST_1 · §1 — a ponte não escreve dentro do ArticleDNA", async () => {
  const dominio = await readFile(new URL("../lib/radar/specialist-lifecycle.ts", import.meta.url), "utf8");
  const painel = await readFile(new URL("../modules/radar/radar-expert-brief-panel.tsx", import.meta.url), "utf8");

  for (const fonte of [dominio, painel]) {
    assert.doesNotMatch(fonte, /articleDna\s*[:=]\s*\{|createArticleVersion|updateArticleDna/, "ARTICLE_DNA_MUTATED = NO");
  }
});

test("SPECIALIST_1 · §11 — nenhuma suíte de especialista/Telegram fica fora dos scripts", async () => {
  const { readdir } = await import("node:fs/promises");
  const pacote = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")) as { scripts: Record<string, string> };
  const scripts = Object.entries(pacote.scripts).filter(([nome]) => nome.startsWith("test")).map(([, valor]) => valor).join(" ");

  const arquivos = (await readdir(new URL("../tests/", import.meta.url))).filter(nome => nome.endsWith(".test.mts"));
  const relevantes = arquivos.filter(nome => /telegram|expert|specialist/i.test(nome));
  assert.ok(relevantes.length >= 10, `há suítes relevantes para cobrir: ${relevantes.length}`);

  const orfas = relevantes.filter(nome => {
    /* `test:radar` cobre por glob; o resto precisa estar nomeado. */
    if (nome.startsWith("radar-") && scripts.includes('"tests/radar-*.test.mts"')) return false;
    return !scripts.includes(`tests/${nome}`);
  });
  assert.deepEqual(orfas, [], "ORPHAN_SPECIALIST_TESTS = 0");

  /* E o script dedicado nomeia explicitamente as que estavam órfãs. */
  const dedicado = pacote.scripts["test:specialist"] || "";
  for (const nome of ["telegram-foundation", "telegram-admin-brand", "telegram-configuration-flow", "expert-contribution-contracts"]) {
    assert.ok(dedicado.includes(`tests/${nome}.test.mts`), `test:specialist inclui ${nome}`);
  }
});

test("SPECIALIST_1 · nenhuma chamada de rede real saiu desta suíte", () => {
  /* O `fetch` global volta ao original depois de cada montagem. */
  assert.equal(typeof globalThis.fetch, "function");
  assert.doesNotMatch(String(globalThis.fetch), /servidorFalso|chamadas\.push/, "PROVIDER_CALLS = 0");
});
