import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  RADAR_SPECIALIST_PROVISIONAL_NAME,
  radarSpecialistConsultationContext,
  radarSpecialistInviteState,
} from "../lib/radar/specialist-consultation.ts";
import type { RadarFrozenSpecialistRequirement } from "../lib/radar/specialist-lifecycle.ts";
import type { RadarR6ExpertTopicContext } from "../lib/radar/r6-sequential.ts";
import { montarRadar, comProductShell, React } from "./radar-dom-harness.mts";

/* ============================== o cenário =============================== */

const brandId = "50000000-0000-4000-8000-0000000000e1";
const expertId = "50000000-0000-4000-8000-0000000000e2";
const articleId = "article-specialist-211";
const articleDnaVersionId = "article-dna-v12";

const requisito: RadarFrozenSpecialistRequirement = {
  requirementId: "specialist:4a13e0cb",
  claimId: "claim:o-que-causa-acne",
  kind: "RESOLVE_FACTUAL_UNCERTAINTY",
  priority: "MEDIUM",
  specificQuestion: "Não encontramos fonte adequada que sustente esta afirmação. O que pode ser afirmado com segurança?",
};

const escopo = { brandId, articleId, articleDnaVersionId, requirementId: requisito.requirementId };

const contexto = {
  articleId, brandId, articleDnaVersionId,
  articleDnaContentHash: "hash-211",
  articleDna: { principal: "acne", intent: "informacional", silo: "Pele", audience: "paciente", problem: "acne", desiredResult: "entender", requiredTopics: [], knownQuestions: [] },
  keywordDnas: [], siloDna: null,
  serpNeeds: [], openGaps: [], conflicts: [], knownQuestions: [],
  approvedReferences: [], serpSnapshotId: null, serpSnapshotVersion: null, serpReviewed: true, analysisVersionId: null,
  amazonCriteria: [], amazonEvidence: [], amazonState: "AMAZON_NOT_APPLICABLE",
  existingContent: "", existingContentItems: [], provenance: [],
} satisfies RadarR6ExpertTopicContext;

/* ==================== o estado do convite, no domínio ================== */

const convite = (parcial: Partial<{ createdAt: string; expiresAt: string; usedAt: string | null; revokedAt: string | null }> = {}) => ({
  createdAt: "2026-09-13T08:00:00Z",
  expiresAt: "2026-09-14T08:00:00Z",
  usedAt: null,
  revokedAt: null,
  ...parcial,
});

const agora = new Date("2026-09-13T12:00:00Z");

test("SPECIALIST_2.1.1 · o estado do convite distingue aberto, expirado e revogado", () => {
  assert.equal(radarSpecialistInviteState({ tokens: [], connected: false, now: agora }), "NONE");
  assert.equal(radarSpecialistInviteState({ tokens: [convite()], connected: false, now: agora }), "OPEN");
  assert.equal(radarSpecialistInviteState({ tokens: [convite({ expiresAt: "2026-09-13T09:00:00Z" })], connected: false, now: agora }), "EXPIRED");
  assert.equal(radarSpecialistInviteState({ tokens: [convite({ revokedAt: "2026-09-13T10:00:00Z" })], connected: false, now: agora }), "REVOKED");
  assert.equal(radarSpecialistInviteState({ tokens: [convite({ usedAt: "2026-09-13T10:00:00Z" })], connected: false, now: agora }), "USED");
});

test("SPECIALIST_2.1.1 · quem já entrou não depende mais de convite nenhum", () => {
  /* O vínculo ativo responde por si: convite expirado não desconecta ninguém. */
  assert.equal(radarSpecialistInviteState({ tokens: [convite({ expiresAt: "2026-09-13T09:00:00Z" })], connected: true, now: agora }), "USED");
  assert.equal(radarSpecialistInviteState({ tokens: [], connected: true, now: agora }), "USED");
});

test("SPECIALIST_2.1.1 · um convite aberto entre revogados ainda vale", () => {
  const tokens = [
    convite({ createdAt: "2026-09-13T07:00:00Z", revokedAt: "2026-09-13T08:00:00Z" }),
    convite({ createdAt: "2026-09-13T08:00:00Z" }),
  ];
  assert.equal(radarSpecialistInviteState({ tokens, connected: false, now: agora }), "OPEN");
  /* E se TODOS forem revogados, o estado não pode virar "expirado". */
  assert.equal(radarSpecialistInviteState({ tokens: tokens.map(item => ({ ...item, revokedAt: "2026-09-13T08:00:00Z" })), connected: false, now: agora }), "REVOKED");
});

/* ===================== o F5: a tela sem memória ======================= */

type RespostaFalsa = { experts?: unknown[]; bindings?: unknown[]; briefs?: unknown[]; contributions?: unknown[]; consultations?: unknown[] };

function servidorFalso(dados: RespostaFalsa) {
  const chamadas: Array<{ url: string; method: string; body: Record<string, unknown> | null }> = [];
  const original = globalThis.fetch;

  globalThis.fetch = (async (entrada: unknown, init?: { method?: string; body?: string }) => {
    const url = String(entrada);
    const method = init?.method || "GET";
    chamadas.push({ url, method, body: init?.body ? JSON.parse(init.body) as Record<string, unknown> : null });
    if (method === "GET") {
      return url.includes("/expert-consultations")
        ? { ok: true, json: async () => ({ consultations: dados.consultations || [], botUsername: "minekey_bot" }) }
        : { ok: true, json: async () => ({ experts: dados.experts || [], bindings: dados.bindings || [], briefs: dados.briefs || [], contributions: dados.contributions || [] }) };
    }
    return { ok: true, json: async () => ({ brief: dados.briefs?.[0] || null, persistence: "remote_readback_confirmed", send: "confirmed", notification: "NOT_SENT" }) };
  }) as unknown as typeof globalThis.fetch;

  return { chamadas, restaurar: () => { globalThis.fetch = original; } };
}

/**
 * O F5 É A MONTAGEM SEM POST NENHUM.
 *
 * Uma tela recém-carregada não tem memória do que criou: ela só tem o que os
 * GET devolvem. Montar o painel com a projeção já no servidor — e sem clicar em
 * nada — é exatamente o que o navegador faz ao recarregar, e é o cenário em que
 * o defeito de runtime do SPECIALIST_2.1.1 aparecia.
 */
async function montarAposF5(dados: RespostaFalsa) {
  const servidor = servidorFalso(dados);
  const tela = await montarRadar();
  const { RadarExpertBriefPanel } = await import("../modules/radar/radar-expert-brief-panel.tsx");
  await tela.render(comProductShell(React.createElement(RadarExpertBriefPanel, {
    brandId, articleId, articleDnaVersionId,
    articleTitle: "O que causa acne", articleVersion: "v12", articleRole: "pilar",
    context: contexto, requirements: [requisito],
    onExpertEvidenceChange: () => {},
  })));
  return { tela, servidor };
}

/** O texto que uma pessoa lê ao abrir a tela: `details` fechado não conta. */
function textoVisivel(raiz: HTMLElement): string {
  const copia = raiz.cloneNode(true) as HTMLElement;
  for (const detalhe of [...copia.querySelectorAll("details")]) {
    if (!detalhe.hasAttribute("open")) detalhe.textContent = detalhe.querySelector("summary")?.textContent || "";
  }
  return copia.textContent || "";
}

const pautaRemota = {
  id: "brief-remota", brandId, expertId, articleId, articleDnaVersionId,
  title: "Pauta", questions: [], status: "reviewed",
  radarContext: {
    specialistRequirement: { requirementId: requisito.requirementId },
    consultation: radarSpecialistConsultationContext({ ...escopo, invitedBy: "user-1", invitedAt: "2026-09-13T08:56:05Z" }),
  },
  createdAt: "2026-09-13T08:56:05Z", updatedAt: "2026-09-13T08:56:05Z", sentAt: null, completedAt: null,
};

const aguardando = {
  requirementId: requisito.requirementId,
  consultationId: "consultation|x",
  participant: { id: expertId, displayName: RADAR_SPECIALIST_PROVISIONAL_NAME, provisional: true },
  briefId: "brief-remota", status: "reviewed", sentAt: null, connected: false,
  invite: { state: "OPEN", expiresAt: "2026-09-14T08:56:05Z" },
};

test("SPECIALIST_2.1.1 · depois do F5 a consulta aparece sem nenhum POST", async () => {
  const { tela, servidor } = await montarAposF5({ consultations: [aguardando], briefs: [pautaRemota] });
  try {
    assert.equal(servidor.chamadas.filter(item => item.method === "POST").length, 0, "montar não cria nada");
    assert.ok(servidor.chamadas.some(item => item.url.includes("/expert-consultations")), "CONSULTATION_AUTHORITY = REMOTE_DB");

    const texto = tela.get("radar-specialist-consultation").textContent || "";
    /* F5_PRESERVES_PARTICIPANT / BRIEF / CONSULTATION */
    assert.ok(texto.includes("Especialista convidado"), `participante: ${texto}`);
    assert.ok(texto.includes("Pauta aprovada para envio"), `pauta: ${texto}`);
    assert.ok(texto.includes("Convite aberto"), `convite: ${texto}`);
  } finally {
    tela.destroy();
    servidor.restaurar();
  }
});

test("SPECIALIST_2.1.1 · o seletor manual saiu da visão normal", async () => {
  const participante = { id: expertId, brandId, displayName: RADAR_SPECIALIST_PROVISIONAL_NAME, specialty: null, status: "active", createdAt: "2026-09-13T08:56:04Z" };
  const { tela, servidor } = await montarAposF5({ consultations: [aguardando], briefs: [pautaRemota], experts: [participante] });
  try {
    const visivel = textoVisivel(tela.container);

    /* MANUAL_EXPERT_SELECTOR_REQUIRED = NO — era o que o print mostrava. */
    assert.ok(!visivel.includes("Selecionar especialista"), "OLD_EXPERT_SELECTOR_REMOVED_FROM_NORMAL_FLOW");
    assert.ok(!visivel.includes("Selecione um especialista"));
    assert.ok(!visivel.includes("Canal Telegram"));

    /* Mas não foi apagado: continua atrás do disclosure de avançadas (§10). */
    const avancadas = tela.get("radar-specialist-advanced");
    assert.equal(avancadas.tagName, "DETAILS");
    assert.equal(avancadas.hasAttribute("open"), false);
    assert.ok((avancadas.textContent || "").includes("Selecionar especialista"));
    assert.ok(!visivel.includes("Criar pauta avulsa"), "a pauta avulsa não compete com a consulta");
  } finally {
    tela.destroy();
    servidor.restaurar();
  }
});

test("SPECIALIST_2.1.1 · o link não volta do banco, e o caminho de saída é explícito", async () => {
  const { tela, servidor } = await montarAposF5({ consultations: [aguardando], briefs: [pautaRemota] });
  try {
    /*
     * COPY_LINK_SURVIVES_F5 = NO, e isso é correto: só o hash é persistido.
     * OR_SAFE_REISSUE_FLOW_EXISTS = YES — o botão não some, ele muda de função.
     */
    assert.equal(tela.query("radar-specialist-copy-link"), null, "o token não pode ser remontado");
    assert.equal((tela.get("radar-specialist-reissue-link") as HTMLButtonElement).disabled, false);
    assert.ok((tela.get("radar-specialist-consultation").textContent || "").includes("O link anterior continua válido até ser substituído."));

    await tela.click("radar-specialist-reissue-link");
    const posts = servidor.chamadas.filter(item => item.method === "POST");
    assert.equal(posts.length, 1);
    assert.equal((posts[0].body as Record<string, unknown>).action, "reissue");
    assert.ok(posts[0].url.includes("/expert-consultations"));
  } finally {
    tela.destroy();
    servidor.restaurar();
  }
});

test("SPECIALIST_2.1.1 · gerar novo link revoga o anterior no servidor", async () => {
  const rota = await readFile(new URL("../app/api/editorial/expert-consultations/route.ts", import.meta.url), "utf8");
  const semComentarios = rota.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  const revoga = semComentarios.indexOf("revokeOpenTelegramOnboardingTokens(");
  const emite = semComentarios.indexOf("issueTelegramOnboardingToken(");
  assert.ok(revoga > 0 && emite > revoga, "revoga ANTES de emitir: dois links válidos não é uso único");
  assert.match(semComentarios, /input\.action === "reissue"/);

  const persistencia = await readFile(new URL("../lib/server/telegram/persistence.ts", import.meta.url), "utf8");
  const semComentariosPersist = persistencia.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  /* Só os abertos: revogar um consumido apagaria o registro de quem entrou. */
  assert.match(semComentariosPersist, /revokeOpenTelegramOnboardingTokens[\s\S]{0,700}\.is\("used_at", null\)/);
  assert.match(semComentariosPersist, /revokeOpenTelegramOnboardingTokens[\s\S]{0,700}\.is\("revoked_at", null\)/);
});

test("SPECIALIST_2.1.1 · conectado troca o convite pelo envio", async () => {
  const conectada = { ...aguardando, connected: true, participant: { id: expertId, displayName: "Helena Braga", provisional: false }, invite: { state: "USED", expiresAt: null } };
  const { tela, servidor } = await montarAposF5({ consultations: [conectada], briefs: [pautaRemota], bindings: [{ expertId, status: "active" }] });
  try {
    const texto = tela.get("radar-specialist-consultation").textContent || "";
    assert.ok(texto.includes("Helena Braga · Telegram conectado"), `estado: ${texto}`);

    /* §6 — o convite sai de cena quando já não serve para nada. */
    assert.equal(tela.query("radar-specialist-copy-link"), null);
    assert.equal(tela.query("radar-specialist-reissue-link"), null);

    /* SEND_ENABLED_AFTER_ACTIVE_BINDING = YES */
    assert.equal((tela.get("radar-specialist-send-brief") as HTMLButtonElement).disabled, false);
    await tela.click("radar-specialist-send-brief");

    const posts = servidor.chamadas.filter(item => item.method === "POST");
    assert.equal(posts.length, 1);
    assert.ok(posts[0].url.includes("/expert-briefs/send"), `rota de envio: ${posts[0].url}`);
    assert.equal((posts[0].body as Record<string, unknown>).briefId, "brief-remota");
    assert.equal((posts[0].body as Record<string, unknown>).expertId, expertId);
  } finally {
    tela.destroy();
    servidor.restaurar();
  }
});

test("SPECIALIST_2.1.1 · SEND_DISABLED_BEFORE_BINDING = YES", async () => {
  const { tela, servidor } = await montarAposF5({ consultations: [aguardando], briefs: [pautaRemota] });
  try {
    /* Sem `chat_id` não há para onde mandar: o botão nem existe. */
    assert.equal(tela.query("radar-specialist-send-brief"), null);
  } finally {
    tela.destroy();
    servidor.restaurar();
  }
});

test("SPECIALIST_2.1.1 · pauta não aprovada bloqueia o envio mesmo conectado", async () => {
  const rascunho = { ...aguardando, status: "draft", connected: true, invite: { state: "USED", expiresAt: null } };
  const { tela, servidor } = await montarAposF5({ consultations: [rascunho], briefs: [{ ...pautaRemota, status: "draft" }], bindings: [{ expertId, status: "active" }] });
  try {
    assert.equal((tela.get("radar-specialist-send-brief") as HTMLButtonElement).disabled, true);
    assert.ok((tela.get("radar-specialist-consultation").textContent || "").includes("Aprove a pauta para envio"));
  } finally {
    tela.destroy();
    servidor.restaurar();
  }
});

test("SPECIALIST_2.1.1 · pauta já enviada mostra a data e não reoferece envio", async () => {
  const enviada = { ...aguardando, connected: true, sentAt: "2026-09-13T11:00:00Z", invite: { state: "USED", expiresAt: null } };
  const { tela, servidor } = await montarAposF5({ consultations: [enviada], briefs: [{ ...pautaRemota, sentAt: "2026-09-13T11:00:00Z", status: "awaiting_expert" }], bindings: [{ expertId, status: "active" }] });
  try {
    const texto = tela.get("radar-specialist-consultation").textContent || "";
    assert.ok(texto.includes("Pedido enviado"), `estado: ${texto}`);
    assert.ok(texto.includes("Enviado em"));
    assert.equal(tela.query("radar-specialist-send-brief"), null);
  } finally {
    tela.destroy();
    servidor.restaurar();
  }
});

test("SPECIALIST_2.1.1 · o F5 não cria participante, pauta, consulta nem token", async () => {
  const { tela, servidor } = await montarAposF5({ consultations: [aguardando], briefs: [pautaRemota] });
  try {
    /* DUPLICATE_PARTICIPANT_AFTER_F5 = NO · DUPLICATE_BRIEF_AFTER_F5 = NO */
    assert.equal(servidor.chamadas.filter(item => item.method === "POST").length, 0);
    assert.equal(servidor.chamadas.filter(item => item.method === "PATCH").length, 0);
    assert.equal(tela.all("radar-specialist-consultation").length, 1, "uma consulta, não duas");
    assert.equal(tela.query("radar-specialist-create-consultation"), null, "o ponto com consulta não reoferece criar");
  } finally {
    tela.destroy();
    servidor.restaurar();
  }
});

/* ======================== a projeção canônica ======================== */

test("SPECIALIST_2.1.1 · a consulta é lida do banco, não remontada na tela", async () => {
  const rota = await readFile(new URL("../app/api/editorial/expert-consultations/route.ts", import.meta.url), "utf8");
  const painel = await readFile(new URL("../modules/radar/radar-expert-brief-panel.tsx", import.meta.url), "utf8");

  /* O GET devolve participante, pauta, convite e vínculo numa projeção só. */
  assert.match(rota, /export async function GET/);
  assert.match(rota, /consultations = doConvite\.map/);
  assert.match(rota, /listTelegramOnboardingTokens\(/);
  assert.match(rota, /radarSpecialistInviteState\(/);

  /*
   * SÓ PAUTA DE CONSULTA VIRA CONSULTA.
   *
   * Grepar `doConvite.map` passava com `doConvite = pautas`, que devolveria
   * pautas avulsas como se fossem convites — cada uma com `consultationId`
   * nulo e um participante que ninguém convidou. Provado por mutação.
   */
  assert.match(rota, /doConvite = pautas\.filter\([^)]*radarSpecialistConsultationOf/, "o filtro da consulta é o predicado, não a lista inteira");
  /* O token bruto nunca sai do servidor numa leitura. */
  assert.ok(!/token: token\.token[\s\S]{0,200}export async function GET/.test(rota));

  /* REACT_STATE_REQUIRED = NO: a tela busca a projeção ao montar. */
  assert.match(painel, /\/api\/editorial\/expert-consultations\?/);
  assert.match(painel, /setConsultations\(/);
  /*
   * E RELÊ DEPOIS DE CADA AÇÃO QUE MUDA A CONSULTA.
   *
   * Criar e reemitir compartilham a mesma função; enviar é a outra. Sem a
   * recarga, a tela voltaria a acreditar na própria memória — que é o defeito
   * que este gate consertou.
   */
  assert.ok((painel.match(/recarregarConsultas\(\)/g) || []).length >= 2, "a recarga acontece nas ações que mudam a consulta");
  assert.match(painel, /const createConsultationFromRequirement[\s\S]{0,3000}recarregarConsultas\(\)/, "criar e reemitir releem");
  assert.match(painel, /const enviarPauta[\s\S]{0,2500}recarregarConsultas\(\)/, "o envio relê");
});

test("SPECIALIST_2.1.1 · nenhuma migration foi criada para consertar o readback", async () => {
  const { readdir } = await import("node:fs/promises");
  const migrations = await readdir(new URL("../supabase/migrations/", import.meta.url));
  assert.deepEqual(migrations.filter(nome => /specialist|consultation|expert/i.test(nome)), ["20260825150000_telegram_expert_contribution_platform_foundation.sql"]);
});

/* ========= SPECIALIST_2.1.2 · o @username vem da plataforma ========= */

test("SPECIALIST_2.1.2 · com o bot confirmado, a tela não acusa a plataforma", async () => {
  /*
   * O DEFEITO: a tela deduzia "o bot está confirmado?" de `invite.link` ter
   * vindo nulo num POST anterior. Depois de confirmar o Bot no Admin, o Radar
   * seguia repetindo o aviso — lendo o resultado de uma AÇÃO velha, não o
   * ESTADO atual da integração.
   */
  const { tela, servidor } = await montarAposF5({ consultations: [aguardando], briefs: [pautaRemota] });
  try {
    assert.equal(tela.query("radar-specialist-bot-missing"), null, "o bot está confirmado no GET");
    assert.equal((tela.get("radar-specialist-reissue-link") as HTMLButtonElement).disabled, false);
  } finally {
    tela.destroy();
    servidor.restaurar();
  }
});

test("SPECIALIST_2.1.2 · sem bot confirmado, o aviso aparece e o botão não mente", async () => {
  const servidor = servidorFalso({ consultations: [aguardando], briefs: [pautaRemota] });
  /* O GET da plataforma passa a dizer que o bot não foi confirmado. */
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (entrada: unknown, init?: { method?: string; body?: string }) => {
    const resposta = await (originalFetch as unknown as (a: unknown, b?: unknown) => Promise<{ ok: boolean; json: () => Promise<Record<string, unknown>> }>)(entrada, init);
    const url = String(entrada);
    if ((init?.method || "GET") === "GET" && url.includes("/expert-consultations")) {
      const payload = await resposta.json();
      return { ok: true, json: async () => ({ ...payload, botUsername: null }) };
    }
    return resposta;
  }) as unknown as typeof globalThis.fetch;

  const tela = await montarRadar();
  try {
    const { RadarExpertBriefPanel } = await import("../modules/radar/radar-expert-brief-panel.tsx");
    await tela.render(comProductShell(React.createElement(RadarExpertBriefPanel, {
      brandId, articleId, articleDnaVersionId,
      articleTitle: "O que causa acne", articleVersion: "v12", articleRole: "pilar",
      context: contexto, requirements: [requisito],
      onExpertEvidenceChange: () => {},
    })));

    assert.ok(tela.get("radar-specialist-bot-missing").textContent?.includes("não foi confirmado no Admin"));
    /* Sem bot não há link a gerar: oferecer o botão habilitado seria mentir. */
    assert.equal((tela.get("radar-specialist-reissue-link") as HTMLButtonElement).disabled, true);
  } finally {
    tela.destroy();
    servidor.restaurar();
  }
});

test("SPECIALIST_2.1.2 · a autoridade do @username é a mesma do Admin", async () => {
  const painelRadar = await readFile(new URL("../modules/radar/radar-expert-brief-panel.tsx", import.meta.url), "utf8");
  const rotaConsulta = await readFile(new URL("../app/api/editorial/expert-consultations/route.ts", import.meta.url), "utf8");
  const canonical = await readFile(new URL("../lib/server/telegram/canonical.ts", import.meta.url), "utf8");

  /* A tela LÊ o estado da plataforma em vez de deduzi-lo de um POST. */
  assert.match(painelRadar, /setBotUsername\(optionalRecordValue\(payload\.botUsername\)\)/);
  assert.match(painelRadar, /\{!botUsername && !consulta\.connected &&/);

  /* E a rota o resolve pela função canônica, a mesma que o Admin usa. */
  assert.match(rotaConsulta, /botUsername: await telegramPlatformBotUsername\(client\)/);
  assert.match(semComentariosDe(canonical), /telegram\.bot_username/);

  /* OLD_HEALTH_CHECK_USERNAME_DEPENDENCY: o legado é só fallback, nunca a preferência. */
  const limpo = semComentariosDe(canonical);
  assert.ok(limpo.indexOf("telegram.bot_username") < limpo.indexOf("details.botUsername"));

  /* E nenhum username fixo em lugar nenhum do caminho do Radar. */
  for (const fonte of [painelRadar, rotaConsulta, canonical]) {
    assert.ok(!/minekeybot/i.test(fonte), "nenhum bot hardcodado");
  }
});

function semComentariosDe(fonte: string) {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, "");
}
