import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  RADAR_SPECIALIST_PROVISIONAL_NAME,
  radarSpecialistConsultationContext,
  radarSpecialistConsultationId,
  radarSpecialistConsultationOf,
  radarSpecialistInviteLink,
  radarSpecialistInviteMessage,
  radarSpecialistIsProvisionalName,
  radarSpecialistTelegramDisplayName,
} from "../lib/radar/specialist-consultation.ts";
import {
  radarSpecialistCounters,
  radarSpecialistStateFromBrief,
  radarSpecialistStateLabel,
  type RadarFrozenSpecialistRequirement,
  type RadarSpecialistBriefReading,
} from "../lib/radar/specialist-lifecycle.ts";
import { extractTelegramInbound } from "../lib/server/telegram/contracts.ts";
import type { RadarR6ExpertTopicContext } from "../lib/radar/r6-sequential.ts";
import { montarRadar, comProductShell, React } from "./radar-dom-harness.mts";

/* ============================== o cenário =============================== */

const brandId = "40000000-0000-4000-8000-0000000000d1";
const expertId = "40000000-0000-4000-8000-0000000000d2";
const articleId = "article-specialist-21";
const articleDnaVersionId = "article-dna-v11";

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
  articleDnaContentHash: "hash-21",
  articleDna: { principal: "acne", intent: "informacional", silo: "Pele", audience: "paciente", problem: "acne", desiredResult: "entender", requiredTopics: [], knownQuestions: [] },
  keywordDnas: [], siloDna: null,
  serpNeeds: ["Explicar as causas reais"], openGaps: [], conflicts: [], knownQuestions: [],
  approvedReferences: [], serpSnapshotId: null, serpSnapshotVersion: null, serpReviewed: true, analysisVersionId: null,
  amazonCriteria: [], amazonEvidence: [], amazonState: "AMAZON_NOT_APPLICABLE",
  existingContent: "", existingContentItems: [], provenance: [],
} satisfies RadarR6ExpertTopicContext;

const pauta = (parcial: Partial<RadarSpecialistBriefReading> = {}): RadarSpecialistBriefReading => ({
  id: "brief-1", expertId, status: "draft", sentAt: null,
  requirementId: requisito.requirementId, contributionIds: [], acceptedContributionIds: [],
  ...parcial,
});

/* ================= §2 · o participante provisório ==================== */

test("SPECIALIST_2.1 · o convidado nasce sem identidade inventada", () => {
  assert.equal(RADAR_SPECIALIST_PROVISIONAL_NAME, "Especialista convidado");
  assert.equal(radarSpecialistIsProvisionalName("Especialista convidado"), true);
  assert.equal(radarSpecialistIsProvisionalName("  especialista CONVIDADO "), true);
  assert.equal(radarSpecialistIsProvisionalName("Dra. Helena Braga"), false);
  assert.equal(radarSpecialistIsProvisionalName(null), false);
});

test("SPECIALIST_2.1 · o nome do Telegram é opcional de verdade", () => {
  assert.equal(radarSpecialistTelegramDisplayName({ firstName: "Helena", lastName: "Braga" }), "Helena Braga");
  assert.equal(radarSpecialistTelegramDisplayName({ firstName: "Helena" }), "Helena");
  /* Sem nome, o @username serve; sem nenhum dos dois, ninguém é identificado. */
  assert.equal(radarSpecialistTelegramDisplayName({ username: "helena_b" }), "@helena_b");
  assert.equal(radarSpecialistTelegramDisplayName({ username: "@helena_b" }), "@helena_b");
  assert.equal(radarSpecialistTelegramDisplayName({}), null);
  assert.equal(radarSpecialistTelegramDisplayName({ firstName: "   ", username: "  " }), null);
});

test("SPECIALIST_2.1 · nome digitado por uma pessoa não é sobrescrito pelo Telegram", async () => {
  const persistencia = await readFile(new URL("../lib/server/telegram/persistence.ts", import.meta.url), "utf8");
  const semComentarios = persistencia.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  /* A guarda inteira é o WHERE display_name = <provisório>. */
  assert.match(semComentarios, /renameProvisionalBrandExpert/);
  assert.match(semComentarios, /\.eq\("display_name", input\.provisionalName\)/);
});

/* ==================== §2 e §7 · a identidade da consulta ============== */

test("SPECIALIST_2.1 · a consulta tem identidade própria e determinística", () => {
  const consulta = radarSpecialistConsultationContext({ ...escopo, invitedBy: "user-1", invitedAt: "2026-09-13T10:00:00Z" });

  assert.equal(consulta.consultationId, radarSpecialistConsultationId(escopo));
  assert.equal(consulta.requirementId, requisito.requirementId);
  assert.equal(consulta.origin, "radar_specialist_consultation");
  /* Marca, artigo, versão e requisito distinguem consultas diferentes. */
  assert.notEqual(radarSpecialistConsultationId({ ...escopo, articleDnaVersionId: "outra" }), consulta.consultationId);
  assert.notEqual(radarSpecialistConsultationId({ ...escopo, requirementId: "specialist:outro" }), consulta.consultationId);
});

test("SPECIALIST_2.1 · a consulta é lida de volta do contexto da pauta", () => {
  const consulta = radarSpecialistConsultationContext({ ...escopo, invitedBy: "user-1", invitedAt: "2026-09-13T10:00:00Z" });

  assert.deepEqual(radarSpecialistConsultationOf({ consultation: consulta }), consulta);
  assert.equal(radarSpecialistConsultationOf({}), null);
  assert.equal(radarSpecialistConsultationOf(null), null);
  assert.equal(radarSpecialistConsultationOf({ consultation: { requirementId: "x" } }), null, "sem consultationId não é consulta");
  assert.equal(radarSpecialistConsultationOf({ consultation: [consulta] }), null);
});

/* ========================== §3 e §4 · o link ========================== */

test("SPECIALIST_2.1 · o deep link carrega só o token", () => {
  const link = radarSpecialistInviteLink({ botUsername: "minekey_bot", token: "tok-abc" });
  assert.equal(link, "https://t.me/minekey_bot?start=tok-abc");
  assert.equal(radarSpecialistInviteLink({ botUsername: "@minekey_bot", token: "tok-abc" }), link);

  /* Sem o username confirmado no Admin não há link — e isso não é um erro. */
  assert.equal(radarSpecialistInviteLink({ botUsername: null, token: "tok-abc" }), null);
  assert.equal(radarSpecialistInviteLink({ botUsername: "minekey_bot", token: "  " }), null);

  /* Nada sensível viaja no parâmetro: nem marca, nem artigo, nem pauta. */
  assert.ok(!link?.includes(brandId));
  assert.ok(!link?.includes(articleId));
  assert.ok(!link?.includes(requisito.requirementId));
});

test("SPECIALIST_2.1 · a mensagem de convite é curta e não promete o que não sabe", () => {
  const link = "https://t.me/minekey_bot?start=tok-abc";
  const mensagem = radarSpecialistInviteMessage({ link });

  assert.ok(mensagem.includes(link));
  assert.match(mensagem, /contribuição profissional/);
  assert.match(mensagem, /pelo Telegram/);
  /* Quem recebe ainda não aceitou nada: o conteúdo não é descrito. */
  assert.ok(!mensagem.includes(articleId));
  assert.ok(!mensagem.includes("acne"));
  assert.ok(mensagem.length < 400, `mensagem com ${mensagem.length} caracteres`);
  assert.match(radarSpecialistInviteMessage({ link: null }), /link indisponível/);
});

/* ======================= §7 · os estados novos ======================= */

test("SPECIALIST_2.1 · convidado e conectado são estados, e nenhum deles é envio", () => {
  const base = { status: "draft", sentAt: null, contributions: 0 };

  assert.equal(radarSpecialistStateFromBrief(base), "DRAFT");
  assert.equal(radarSpecialistStateFromBrief({ ...base, invited: true }), "INVITED");
  assert.equal(radarSpecialistStateFromBrief({ ...base, invited: true, connected: true }), "CONNECTED");
  assert.equal(radarSpecialistStateLabel("INVITED"), "Consulta criada · aguardando especialista");
  assert.equal(radarSpecialistStateLabel("CONNECTED"), "Especialista conectado");

  /* CREATING_CONSULTATION_COUNTS_AS_SENT = NO */
  assert.notEqual(radarSpecialistStateFromBrief({ ...base, invited: true }), "SENT");
  assert.notEqual(radarSpecialistStateFromBrief({ ...base, invited: true, connected: true }), "SENT");
  /* E `sent_at` continua mandando em tudo. */
  assert.equal(radarSpecialistStateFromBrief({ ...base, sentAt: "2026-09-13T10:00:00Z", invited: true, connected: true }), "WAITING_RESPONSE");
  /* A aprovação pendente do operador vem antes do fato do especialista. */
  assert.equal(radarSpecialistStateFromBrief({ ...base, status: "reviewed", connected: true }), "APPROVED_TO_SEND");
});

test("SPECIALIST_2.1 · consulta criada e especialista conectado continuam contando como rascunho", () => {
  const contadores = radarSpecialistCounters({
    requirements: [requisito],
    briefs: [pauta({ invited: true }), pauta({ id: "brief-2", invited: true, connected: true })],
  });

  assert.equal(contadores.drafts, 2);
  assert.equal(contadores.sent, 0, "nenhum pedido foi enviado");
  assert.equal(contadores.waiting, 0);
  assert.equal(contadores.responded, 0);
});

/* ================== §5 · o /start reaproveitado ==================== */

test("SPECIALIST_2.1 · o inbound passa a carregar a identidade, e ela fica fora do log", async () => {
  const inbound = extractTelegramInbound({
    update_id: 991,
    message: { message_id: 5, chat: { id: 777 }, from: { id: 42, first_name: "Helena", last_name: "Braga", username: "helena_b" }, text: "/start tok-abc" },
  } as never);

  assert.equal(inbound.firstName, "Helena");
  assert.equal(inbound.lastName, "Braga");
  assert.equal(inbound.username, "helena_b");
  assert.equal(inbound.command?.name, "start");
  assert.equal(inbound.command?.argument, "tok-abc");
  assert.equal(radarSpecialistTelegramDisplayName(inbound), "Helena Braga");

  /*
   * NOME DE PESSOA NÃO PERTENCE AO LOG TÉCNICO DE ENTREGA.
   *
   * O que é gravado em `telegram_inbound_updates.metadata` é o retorno de
   * `sanitizeTelegramUpdateMetadata` — medir `inbound.metadata` deixava passar
   * um vazamento acrescentado lá. Provado por mutação.
   */
  const { sanitizeTelegramUpdateMetadata } = await import("../lib/server/telegram/contracts.ts");
  const registrado = JSON.stringify(sanitizeTelegramUpdateMetadata(inbound));
  assert.ok(!registrado.includes("Helena"), `o log não guarda nome: ${registrado}`);
  assert.ok(!registrado.includes("helena_b"), `o log não guarda @username: ${registrado}`);
  assert.ok(registrado.includes("42"), "o id técnico continua no log");
});

test("SPECIALIST_2.1 · o /start reusa o webhook e não cria um segundo participante", async () => {
  const webhook = await readFile(new URL("../lib/server/telegram/webhook.ts", import.meta.url), "utf8");
  const semComentarios = webhook.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  /* START_RESOLVES_PARTICIPANT + START_CREATES_BINDING, pelo caminho que já existia. */
  assert.match(semComentarios, /consumeTelegramOnboardingToken/);
  /*
   * O NOME VEM DO INBOUND. Só grepar a chamada passava com `const nomeReal =
   * null`, que a mantinha no arquivo e morta. Provado por mutação.
   */
  assert.match(semComentarios, /const nomeReal = radarSpecialistTelegramDisplayName\(input\.inbound\)/);
  assert.match(semComentarios, /if \(nomeReal\)[\s\S]{0,240}renameProvisionalBrandExpert/);
  assert.match(semComentarios, /displayName: nomeReal/);
  /* DUPLICATE_PARTICIPANT_CREATED = NO */
  assert.ok(!semComentarios.includes("createBrandExpert"), "o webhook nunca cria participante");

  /* §6 — a seleção de pauta continua explícita, sem heurística de "última". */
  assert.match(semComentarios, /sendBriefSelection/);
  assert.match(semComentarios, /TELEGRAM_BRIEF_SELECTION_REQUIRED/);
  assert.ok(!semComentarios.includes("briefs[0]"));
});

/* ====================== §1 e §9 · a rota da consulta ================== */

test("SPECIALIST_2.1 · a rota cria participante, pauta e convite — e não envia nada", async () => {
  const rota = await readFile(new URL("../app/api/editorial/expert-consultations/route.ts", import.meta.url), "utf8");
  const semComentarios = rota.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  /* BRAND_EXPERT_AUTO_CREATED = YES, com o rótulo provisório do domínio. */
  assert.match(semComentarios, /createBrandExpert\(/);
  assert.match(semComentarios, /RADAR_SPECIALIST_PROVISIONAL_NAME/);
  /* ONBOARDING_TOKEN_REUSED = YES */
  assert.match(semComentarios, /issueTelegramOnboardingToken\(/);
  assert.match(semComentarios, /radarSpecialistInviteLink\(/);

  /* A permissão é editorial: convidar não exige gestão da Marca. */
  assert.match(semComentarios, /assertEditorialPermission\(profile, input\.brandId, "radar", "edit"\)/);

  /* CREATING_CONSULTATION_COUNTS_AS_SENT = NO */
  assert.match(semComentarios, /status: "draft"/);
  assert.match(semComentarios, /notification: "NOT_SENT"/);
  assert.ok(!semComentarios.includes("sendSharedTelegramMessage"), "a rota não envia Telegram");
  assert.ok(!semComentarios.includes("markExpertBriefSent"), "a rota não escreve sent_at");

  /* DUPLICATE_PARTICIPANT_CREATED = NO — a pauta gêmea reusa o participante. */
  const guarda = semComentarios.indexOf("radarSpecialistDuplicateDraft(");
  const criacao = semComentarios.indexOf("createBrandExpert(");
  assert.ok(guarda > 0 && criacao > guarda, "a gêmea é procurada ANTES de criar participante");
  assert.match(semComentarios, /gemea\?\.expertId \|\|/);

  /*
   * JÁ CONECTADO NÃO GANHA TOKEN NOVO — e a prova é a ORDEM, não a string.
   *
   * Grepar `connected: true` passava mesmo com a guarda trocada por `if (false)`:
   * o texto continua no arquivo. Provado por mutação.
   */
  const consultaVinculo = semComentarios.indexOf("listActiveTelegramBindingsForExpert(");
  const emiteToken = semComentarios.indexOf("issueTelegramOnboardingToken(");
  assert.ok(consultaVinculo > 0 && emiteToken > consultaVinculo, "o vínculo é consultado ANTES de emitir token");
  const entreOsDois = semComentarios.slice(consultaVinculo, emiteToken);
  assert.match(entreOsDois, /if \(vinculos\.length\)/, "a guarda existe entre a consulta e a emissão");
  assert.match(entreOsDois, /invite: null/, "e ela sai da rota sem convite");
});

test("SPECIALIST_2.1 · MIGRATION_CREATED = NO", async () => {
  const { readdir } = await import("node:fs/promises");
  const migrations = await readdir(new URL("../supabase/migrations/", import.meta.url));
  const especialista = migrations.filter(nome => /specialist|consultation|expert/i.test(nome));

  /* A única migration de especialista continua sendo a fundação de 2026-08-25. */
  assert.deepEqual(especialista, ["20260825150000_telegram_expert_contribution_platform_foundation.sql"]);
});

/* ========================= §4 · a UI do convite ======================= */

type RespostaFalsa = { experts?: unknown[]; bindings?: unknown[]; briefs?: unknown[]; contributions?: unknown[]; consultations?: unknown[] };

function servidorFalso(dados: RespostaFalsa, invite: unknown = { link: "https://t.me/minekey_bot?start=tok-abc", message: "Olá.\n\nhttps://t.me/minekey_bot?start=tok-abc", botUsername: "minekey_bot", expiresAt: "2026-09-14T10:00:00Z" }) {
  const chamadas: Array<{ url: string; method: string; body: Record<string, unknown> | null }> = [];
  const original = globalThis.fetch;

  /*
   * A PROJEÇÃO REMOTA DA CONSULTA — o que o F5 relê.
   *
   * O painel faz DOIS GET: `/expert-briefs` (experts, pautas, contribuições) e
   * `/expert-consultations` (a consulta canônica). O segundo é o que sobrevive
   * ao recarregamento; o servidor falso precisa responder aos dois, senão o
   * teste estaria medindo só o que o POST devolveu — o defeito do 2.1.1.
   */
  const projecao = () => (dados.consultations || []);

  globalThis.fetch = (async (entrada: unknown, init?: { method?: string; body?: string }) => {
    const url = String(entrada);
    const method = init?.method || "GET";
    chamadas.push({ url, method, body: init?.body ? JSON.parse(init.body) as Record<string, unknown> : null });
    if (method === "GET") {
      return url.includes("/expert-consultations")
        /*
         * O @username SEGUE O CENÁRIO, não uma constante.
         *
         * Depois do SPECIALIST_2.1.2, a tela lê o estado do bot deste GET em vez
         * de deduzi-lo do POST. Um cenário sem link só é coerente se o bot
         * também não estiver confirmado — senão o teste montaria um mundo que
         * não existe: bot pronto e link impossível.
         */
        ? { ok: true, json: async () => ({ consultations: projecao(), botUsername: (invite as { link?: string | null } | null)?.link ? "minekey_bot" : null }) }
        : { ok: true, json: async () => ({ experts: dados.experts || [], bindings: dados.bindings || [], briefs: dados.briefs || [], contributions: dados.contributions || [] }) };
    }
    /* Criado o convite, a projeção passa a existir: é o que a recarga relê. */
    const corpo = init?.body ? JSON.parse(init.body) as Record<string, unknown> : {};
    const requisitoEnviado = (corpo.requirement || {}) as Record<string, unknown>;
    dados.consultations = [{
      requirementId: requisitoEnviado.requirementId || requisito.requirementId,
      consultationId: "consultation|x",
      participant: { id: expertId, displayName: RADAR_SPECIALIST_PROVISIONAL_NAME, provisional: true },
      briefId: "brief-criada", status: "draft", sentAt: null,
      connected: !invite,
      invite: { state: invite ? "OPEN" : "USED", expiresAt: "2026-09-14T10:00:00Z" },
    }];
    return {
      ok: true,
      json: async () => ({
        /*
         * A PAUTA VOLTA COM A PROVENIÊNCIA DO PONTO — como a rota real devolve.
         *
         * `radarContext: {}` era uma fixture imprecisa: a rota grava
         * `specialistRequirement` e `consultation` no contexto antes do
         * readback. Sem eles, a pauta criada não se liga ao ponto que a
         * originou, e a tela continuaria oferecendo "Criar consulta" para um
         * ponto que já tem uma.
         */
        brief: { id: "brief-criada", brandId, expertId, articleId, articleDnaVersionId, title: "Pauta", radarContext: { specialistRequirement: { requirementId: requisitoEnviado.requirementId || requisito.requirementId }, consultation: { consultationId: "consultation|x", requirementId: requisitoEnviado.requirementId || requisito.requirementId, invitedBy: "u", invitedAt: "2026-09-13T10:00:00Z", origin: "radar_specialist_consultation" } }, questions: [{ id: "q1", text: "O que pode ser afirmado com segurança?", origin: "radar", need: null, reference: null, justification: null }], status: "draft", createdAt: "2026-09-13T10:00:00Z", updatedAt: "2026-09-13T10:00:00Z", sentAt: null, completedAt: null },
        expertId, connected: !invite, invite, notification: "NOT_SENT",
      }),
    };
  }) as unknown as typeof globalThis.fetch;

  return { chamadas, restaurar: () => { globalThis.fetch = original; } };
}

/** A área de transferência do navegador, observável e restaurável. */
function areaDeTransferencia() {
  const alvo = globalThis.navigator as unknown as Record<string, unknown>;
  const anterior = Object.getOwnPropertyDescriptor(alvo, "clipboard");
  const copiado: string[] = [];
  Object.defineProperty(alvo, "clipboard", {
    value: { writeText: async (valor: string) => { copiado.push(valor); } },
    configurable: true, writable: true,
  });
  return {
    copiado,
    restaurar: () => {
      if (anterior) Object.defineProperty(alvo, "clipboard", anterior);
      else delete alvo.clipboard;
    },
  };
}

async function montarPainel(dados: RespostaFalsa, invite?: unknown) {
  const servidor = servidorFalso(dados, invite === undefined ? undefined : invite);
  const tela = await montarRadar();
  const { RadarExpertBriefPanel } = await import("../modules/radar/radar-expert-brief-panel.tsx");
  await tela.render(comProductShell(React.createElement(RadarExpertBriefPanel, {
    brandId, articleId, articleDnaVersionId,
    articleTitle: "O que causa acne", articleVersion: "v11", articleRole: "pilar",
    context: contexto, requirements: [requisito],
    onExpertEvidenceChange: () => {},
  })));
  return { tela, servidor };
}

test("SPECIALIST_2.1 · criar consulta não exige cadastro e devolve link para copiar", async () => {
  const { tela, servidor } = await montarPainel({});
  const area = areaDeTransferencia();
  try {
    /* MANUAL_EXPERT_REGISTRATION_REQUIRED = NO: sem especialista nenhum na marca. */
    const botao = tela.get("radar-specialist-next-action") as HTMLButtonElement;
    assert.equal(botao.textContent, "Criar consulta");
    assert.equal(botao.disabled, false);

    await tela.click("radar-specialist-next-action");

    const posts = servidor.chamadas.filter(item => item.method === "POST");
    assert.equal(posts.length, 1);
    assert.equal(posts[0].url, "/api/editorial/expert-consultations");
    assert.equal((posts[0].body as Record<string, unknown>).expertId, undefined);

    const consulta = tela.get("radar-specialist-consultation");
    assert.ok((consulta.textContent || "").includes("Especialista convidado"), `participante: ${consulta.textContent}`);

    /* Criada a consulta, a PRÓXIMA AÇÃO do ponto passa a ser compartilhar o link. */
    assert.equal(tela.get("radar-specialist-next-action").textContent, "Copiar link do convite");
    await tela.click("radar-specialist-next-action");
    assert.deepEqual(area.copiado, ["https://t.me/minekey_bot?start=tok-abc"], "COPY_LINK_BUTTON = YES");
    assert.ok((tela.get("radar-specialist-consultation").textContent || "").includes("Link copiado"));

    await tela.click("radar-specialist-copy-message");
    assert.equal(area.copiado.length, 2, "COPY_MESSAGE_BUTTON = YES");
    /*
     * MENSAGEM != LINK. Só conferir que ela CONTÉM o link passava quando o botão
     * copiava o link cru — o link contém a si mesmo. Provado por mutação.
     */
    assert.notEqual(area.copiado[1], area.copiado[0], "copiar mensagem não copia só o link");
    assert.ok(area.copiado[1].includes("https://t.me/minekey_bot?start=tok-abc"));
    assert.match(area.copiado[1], /Olá/, "a mensagem tem texto de convite");
    assert.ok((tela.get("radar-specialist-consultation").textContent || "").includes("Mensagem copiada"));

    /* Não abrir Telegram, não enviar nada. */
    assert.equal(servidor.chamadas.some(item => item.url.includes("api.telegram.org") || item.url.includes("/send")), false);
  } finally {
    area.restaurar();
    tela.destroy();
    servidor.restaurar();
  }
});

test("SPECIALIST_2.1 · sem username do Bot, a consulta existe e a tela diz o que falta", async () => {
  const { tela, servidor } = await montarPainel({}, { link: null, message: "Olá.\n\n(link indisponível)", botUsername: null, expiresAt: "2026-09-14T10:00:00Z" });
  try {
    await tela.click("radar-specialist-next-action");
    const consulta = tela.get("radar-specialist-consultation");

    const acao = tela.get("radar-specialist-next-action") as HTMLButtonElement;
    /* O convite ficou ABERTO na projeção; sem Bot, o que se oferece é outro link. */
    assert.equal(acao.textContent, "Gerar novo link", "não há link para copiar");
    assert.equal(acao.disabled, true, "sem Bot confirmado o botão mentiria");
    assert.ok((consulta.textContent || "").includes("username do Bot ainda não foi confirmado no Admin"));
    /*
     * E O CAMINHO DE SAÍDA CONTINUA EXPLÍCITO — agora como motivo escrito.
     *
     * O SPECIALIST_3 trocou o botão inerte sem explicação por um botão inerte
     * COM o critério ao lado. Foi essa a leitura do runtime: inativo sem
     * motivo é indistinguível de quebrado.
     */
    assert.match(tela.get("radar-specialist-next-action-reason").textContent || "", /username do Bot/);
  } finally {
    tela.destroy();
    servidor.restaurar();
  }
});

test("SPECIALIST_2.1 · especialista já conectado não recebe link novo", async () => {
  const { tela, servidor } = await montarPainel({}, null);
  try {
    await tela.click("radar-specialist-next-action");
    const consulta = tela.get("radar-specialist-consultation");

    assert.ok((consulta.textContent || "").includes("Telegram conectado"), `estado: ${consulta.textContent}`);
    /* Quem entrou não precisa de link: a próxima ação já é sobre a pauta. */
    const acao = tela.get("radar-specialist-next-action").textContent || "";
    assert.equal(acao.includes("link"), false, `emitir outro token criaria um convite órfão: ${acao}`);
    assert.equal(acao.includes("convite"), false, `quem entrou não precisa de convite: ${acao}`);
  } finally {
    tela.destroy();
    servidor.restaurar();
  }
});

test("SPECIALIST_2.1 · pauta conectada aparece como CONECTADO, não como enviada", async () => {
  const pautaRemota = {
    id: "brief-remota", brandId, expertId, articleId, articleDnaVersionId,
    title: "Pauta", questions: [], status: "draft",
    radarContext: {
      specialistRequirement: { requirementId: requisito.requirementId },
      consultation: radarSpecialistConsultationContext({ ...escopo, invitedBy: "user-1", invitedAt: "2026-09-13T10:00:00Z" }),
    },
    createdAt: "2026-09-13T10:00:00Z", updatedAt: "2026-09-13T10:00:00Z", sentAt: null, completedAt: null,
  };
  const expertProvisorio = { id: expertId, brandId, displayName: RADAR_SPECIALIST_PROVISIONAL_NAME, specialty: null, status: "active", createdAt: "2026-09-13T10:00:00Z" };

  const { tela, servidor } = await montarPainel({ experts: [expertProvisorio], briefs: [pautaRemota], bindings: [{ expertId, status: "active" }] });
  try {
    const ponto = tela.get("radar-specialist-review-point").textContent || "";
    assert.ok(ponto.includes("Especialista conectado"), `estado do ponto: ${ponto}`);
    /*
     * A RÉGUA DO SPECIALIST_3 desenha o caminho INTEIRO, com as etapas futuras
     * apagadas — então "Pedido enviado" aparece como texto mesmo num ponto que
     * ninguém enviou. O que diz onde este ponto ESTÁ é a etapa corrente, e é
     * nela que a invariante mora.
     */
    assert.equal(tela.get("radar-specialist-flow-current").textContent, "Pauta pronta", "conectado não é enviado");

    const contadores = tela.get("radar-specialist-counters").textContent || "";
    assert.ok(contadores.includes("0 enviado(s)"), `CREATING_CONSULTATION_COUNTS_AS_SENT = NO: ${contadores}`);
  } finally {
    tela.destroy();
    servidor.restaurar();
  }
});

test("SPECIALIST_2.1 · sem vínculo, a consulta criada aparece como aguardando", async () => {
  const pautaRemota = {
    id: "brief-remota", brandId, expertId, articleId, articleDnaVersionId,
    title: "Pauta", questions: [], status: "draft",
    radarContext: {
      specialistRequirement: { requirementId: requisito.requirementId },
      consultation: radarSpecialistConsultationContext({ ...escopo, invitedBy: "user-1", invitedAt: "2026-09-13T10:00:00Z" }),
    },
    createdAt: "2026-09-13T10:00:00Z", updatedAt: "2026-09-13T10:00:00Z", sentAt: null, completedAt: null,
  };

  const { tela, servidor } = await montarPainel({ briefs: [pautaRemota], bindings: [] });
  try {
    assert.ok((tela.get("radar-specialist-review-point").textContent || "").includes("Consulta criada · aguardando especialista"));
  } finally {
    tela.destroy();
    servidor.restaurar();
  }
});

/* ========================== §9 e §10 · limites ======================== */

test("SPECIALIST_2.1 · e-mail não foi implementado e as dívidas estão registradas", async () => {
  const dominio = await readFile(new URL("../lib/radar/specialist-consultation.ts", import.meta.url), "utf8");
  const rota = await readFile(new URL("../app/api/editorial/expert-consultations/route.ts", import.meta.url), "utf8");

  /* EMAIL_CHANNEL_IMPLEMENTED = NO */
  for (const fonte of [dominio, rota]) {
    assert.ok(!/sendEmail|nodemailer|resend|smtp/i.test(fonte), "nenhum canal de e-mail neste gate");
  }

  const backlog = await readFile(new URL("../docs/05-radar/backlog.md", import.meta.url), "utf8");
  assert.match(backlog, /EMAIL_OUTBOUND/);
  assert.match(backlog, /EMAIL_INBOUND_WEBHOOK/);
  assert.match(backlog, /uq_telegram_binding_active_user/, "P1 multi-marca registrado");
  assert.match(backlog, /slice\(0, 8\)|8 pautas/, "P1 do truncamento registrado");
});

test("SPECIALIST_2.1 · o gate não tocou worker, áudio nem biblioteca de vídeos", async () => {
  const rota = await readFile(new URL("../app/api/editorial/expert-consultations/route.ts", import.meta.url), "utf8");
  const dominio = await readFile(new URL("../lib/radar/specialist-consultation.ts", import.meta.url), "utf8");

  for (const fonte of [rota, dominio]) {
    assert.ok(!/speech|transcri|external_processing_jobs|video_source/i.test(fonte));
  }
  /* E o domínio da consulta continua puro. */
  const semComentarios = dominio.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.ok(!/fetch\(|createClient|supabase|localStorage/i.test(semComentarios));
});
