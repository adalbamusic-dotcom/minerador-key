import assert from "node:assert/strict";
import test from "node:test";
import {
  RADAR_SPECIALIST_CLASSIFICATIONS,
  RADAR_SPECIALIST_DECISIONS,
  radarContextPreservingReviews,
  radarContextWithSpecialistReview,
  radarSpecialistClassificationOf,
  radarSpecialistDecisionIsActive,
  radarSpecialistDecisionOf,
  radarSpecialistDecisionToProjection,
  radarSpecialistEditorialUse,
  radarSpecialistExtraction,
  radarSpecialistReviewsOf,
  radarSpecialistSuggestedClassification,
  type RadarSpecialistStoredReview,
} from "../lib/radar/specialist-contribution-review.ts";
import {
  RADAR_SPECIALIST_FLOW_STAGES,
  radarSpecialistBriefActionLabel,
  radarSpecialistFlow,
  radarSpecialistNextAction,
  radarSpecialistQuestionControls,
  type RadarSpecialistActionContext,
} from "../lib/radar/specialist-flow.ts";
import {
  buildRadarSpecialistEvidenceLayer,
  radarSpecialistEvidenceCoverage,
  type RadarSpecialistEvidenceSource,
} from "../lib/radar/specialist-evidence.ts";
import { RADAR_SPECIALIST_STATES } from "../lib/radar/specialist-lifecycle.ts";

/*
 * ======  SPECIALIST_3 · A RESPOSTA VIRANDO EVIDÊNCIA  ====================
 *
 * O que este arquivo protege, em uma frase: que NADA seja promovido a
 * evidência sem uma pessoa ter decidido, e que nada do que a pessoa decidiu
 * seja perdido ou reinventado no caminho até o Planejador.
 *
 * Domínio puro. REAL_PROVIDER_CALLS = 0, com sentinela no fim.
 */

const tentativasDeRede: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    tentativasDeRede.push(String((entrada as { url?: string })?.url || entrada));
    return Promise.reject(new Error("REDE PROIBIDA NESTE GATE"));
  },
  writable: true, configurable: true,
});

/* ===================== §5 · a classificação sugerida ==================== */

test("§5 · a organização por IA tem precedência sobre qualquer heurística", () => {
  const sugestao = radarSpecialistSuggestedClassification({
    /* O texto está cheio de marcador de experiência, e mesmo assim perde. */
    text: "Na minha prática eu costumo ver isso com frequência.",
    organizationPayload: { classifications: ["ressalva"] },
    requirementKind: "VERIFY_AND_ADD_EXPERIENCE",
  });
  assert.equal(sugestao.classification, "RESSALVA");
  assert.equal(sugestao.source, "AI_ORGANIZATION");
});

test("§5 · o vocabulário antigo da IA continua legível sem reprocessar nada", () => {
  /*
   * O worker grava minúsculas acentuadas desde antes deste gate. Se a leitura
   * não as reconhecesse, toda contribuição já organizada perderia a
   * classificação e cairia no padrão — silenciosamente.
   */
  assert.equal(radarSpecialistClassificationOf("experiência"), "EXPERIENCIA_PRATICA");
  assert.equal(radarSpecialistClassificationOf("limitacao"), "LIMITACAO");
  assert.equal(radarSpecialistClassificationOf("CRITERIO_DECISAO"), "CRITERIO_DECISAO");
  assert.equal(radarSpecialistClassificationOf("qualquer outra coisa"), null);
  assert.equal(radarSpecialistClassificationOf(""), null);
});

test("§5 · o texto sugere pelo marcador, e o acento não atrapalha", () => {
  const casos: Array<{ texto: string; esperado: string }> = [
    { texto: "Vale para a maioria, desde que a pele não esteja inflamada.", esperado: "RESSALVA" },
    { texto: "Porém, isso muda em pele madura.", esperado: "RESSALVA" },
    { texto: "Não é possível afirmar isso com a evidência atual.", esperado: "LIMITACAO" },
    { texto: "Por exemplo, um paciente que atendi em janeiro.", esperado: "EXEMPLO" },
    { texto: "O protocolo é sempre o mesmo: primeiro passo, limpeza.", esperado: "PROCESSO" },
    { texto: "Meu critério é a espessura da barreira cutânea.", esperado: "CRITERIO_DECISAO" },
    { texto: "Na minha experiência isso aparece mais no verão.", esperado: "EXPERIENCIA_PRATICA" },
  ];
  for (const caso of casos) {
    const sugestao = radarSpecialistSuggestedClassification({ text: caso.texto });
    assert.equal(sugestao.classification, caso.esperado, `texto: ${caso.texto}`);
    assert.equal(sugestao.source, "TEXT_MARKERS", `texto: ${caso.texto}`);
  }
});

test("§5 · experiência vence ressalva quando as duas aparecem na mesma fala", () => {
  /*
   * "Na minha prática eu evito X, exceto quando Y" é experiência COM uma
   * ressalva dentro. Classificar como ressalva jogaria fora justamente o que
   * ela tem de mais raro: ter sido vivido por alguém.
   */
  const sugestao = radarSpecialistSuggestedClassification({ text: "Na minha prática eu evito isso, exceto quando a pele está muito sensibilizada." });
  assert.equal(sugestao.classification, "EXPERIENCIA_PRATICA");
});

test("§5 · sem marcador, o tipo do ponto de revisão decide — e ele é o último com fundamento", () => {
  const semIndicio = "Concordo com o que foi levantado.";
  assert.deepEqual(
    radarSpecialistSuggestedClassification({ text: semIndicio, requirementKind: "RESOLVE_CONFLICT" }),
    { classification: "CRITERIO_DECISAO", source: "REQUIREMENT_KIND" },
  );
  assert.deepEqual(
    radarSpecialistSuggestedClassification({ text: semIndicio, requirementKind: "RESOLVE_FACTUAL_UNCERTAINTY" }),
    { classification: "RESSALVA", source: "REQUIREMENT_KIND" },
  );
  /* Sem texto e sem tipo, o padrão é o menos comprometedor: alguém se pronunciou. */
  assert.deepEqual(
    radarSpecialistSuggestedClassification({ text: semIndicio }),
    { classification: "OPINIAO_PROFISSIONAL", source: "DEFAULT" },
  );
});

test("§5 · a correção humana vence a sugestão, e a origem passa a dizer isso", () => {
  const extraida = radarSpecialistExtraction({
    contributionId: "c1", expertId: "e1", briefId: "b1", requirementId: "specialist:1",
    requirementKind: "VERIFY_AND_ADD_EXPERIENCE",
    sourceType: "TEXT", originalText: "Na minha prática isso é comum.", transcriptText: null,
    receivedAt: "2026-09-13T08:11:57.000Z",
    classification: "LIMITACAO",
  });
  assert.equal(extraida.classification, "LIMITACAO");
  assert.equal(extraida.classificationSource, "HUMAN", "uma releitura não pode devolver a classificação à sugestão");
});

/* =================== §7 e §8 · a contribuição extraída ================== */

const base = {
  contributionId: "c1", expertId: "e1", briefId: "b1",
  requirementId: "specialist:4a13e0cb",
  requirementKind: "RESOLVE_FACTUAL_UNCERTAINTY",
  requirementTopic: "O que causa acne",
  sourceType: "TEXT",
  receivedAt: "2026-09-13T08:11:57.000Z",
  externalUpdateId: "update-1",
  originalAssetUri: null,
  checksum: "sha256:abc",
};

test("§8 · a extração nasce NOT_APPROVED, e nenhum argumento dela a aprova", () => {
  const extraida = radarSpecialistExtraction({ ...base, originalText: "Oleosidade não causa acne sozinha.", transcriptText: null });
  assert.equal(extraida.humanDecision, "NOT_APPROVED");
  assert.equal(radarSpecialistDecisionIsActive(extraida.humanDecision), false);
  /* Organizar é o que mais perto chega de "pronta" — e continua não aprovando. */
  const organizada = radarSpecialistExtraction({
    ...base, originalText: "Oleosidade não causa acne sozinha.", transcriptText: null,
    organizationPayload: { organizedText: "Oleosidade isolada não é causa direta.", classifications: ["ressalva"] },
  });
  assert.equal(organizada.humanDecision, "NOT_APPROVED");
});

test("§7 · o original é preservado inteiro, e a síntese é recorte declarado", () => {
  const longo = `${"Primeira frase que explica o contexto todo. ".repeat(12)}Última frase.`;
  const extraida = radarSpecialistExtraction({ ...base, originalText: longo, transcriptText: null });

  assert.ok(extraida.originalText.includes("Última frase."), "o original não pode ser cortado");
  assert.equal(extraida.summarySource, "VERBATIM_TRIMMED");
  assert.ok(extraida.extractedSummary.length < extraida.originalText.length);
  assert.ok(extraida.extractedSummary.endsWith("…"), "o corte precisa ser visível");
  /* O recorte é do PRÓPRIO texto: nenhuma frase nova entra na síntese. */
  assert.ok(longo.replace(/\s+/g, " ").includes(extraida.extractedSummary.replace("…", "").trim()));
});

test("§7 · texto curto vira síntese sem corte nenhum", () => {
  const curto = "Oleosidade isolada não deve ser tratada como causa direta da acne.";
  const extraida = radarSpecialistExtraction({ ...base, originalText: curto, transcriptText: null });
  assert.equal(extraida.extractedSummary, curto);
  assert.equal(extraida.summarySource, "VERBATIM");
});

test("§7 · a organização revisável é a síntese quando ela existe", () => {
  const extraida = radarSpecialistExtraction({
    ...base, originalText: "texto bruto e longo do especialista", transcriptText: null,
    organizationPayload: { organizedText: "Oleosidade não é causa direta." },
  });
  assert.equal(extraida.extractedSummary, "Oleosidade não é causa direta.");
  assert.equal(extraida.summarySource, "AI_ORGANIZATION");
  assert.equal(extraida.originalText, "texto bruto e longo do especialista", "a organização não substitui o original");
});

test("§7 · a transcrição tem precedência sobre o original quando existe", () => {
  /*
   * Um áudio chega com `original_text` nulo e `transcript_text` preenchido
   * depois. Ler o original primeiro faria a evidência de toda mensagem de voz
   * nascer vazia — e o §6 bloquearia a aceitação de uma resposta que existe.
   */
  const soTranscricao = radarSpecialistExtraction({ ...base, sourceType: "VOICE", originalText: null, transcriptText: "o que ele falou" });
  assert.equal(soTranscricao.originalText, "o que ele falou");
  assert.equal(soTranscricao.provenance.sourceType, "VOICE");

  /*
   * E QUANDO OS DOIS EXISTEM, A TRANSCRIÇÃO GANHA.
   *
   * Um áudio ou documento com legenda chega com `original_text` preenchido
   * pela legenda — três palavras — e `transcript_text` com a fala inteira.
   * Preferir o original ali entregaria a legenda como se fosse a resposta do
   * profissional, e a citação literal sairia da legenda.
   *
   * Sem este caso, trocar a ordem das duas leituras não quebra teste nenhum:
   * foi um sobrevivente da bateria de mutação, não uma hipótese.
   */
  const comOsDois = radarSpecialistExtraction({
    ...base, sourceType: "AUDIO",
    originalText: "Segue minha resposta",
    transcriptText: "Oleosidade isolada não deve ser tratada como causa direta da acne.",
  });
  assert.equal(comOsDois.originalText, "Oleosidade isolada não deve ser tratada como causa direta da acne.");
});

test("§7 · a aplicação editorial vem do ponto, e não é inventada quando não há ponto", () => {
  const comPonto = radarSpecialistExtraction({ ...base, originalText: "x", transcriptText: null });
  assert.equal(comPonto.editorialUse, 'Qualificar o trecho sobre "O que causa acne".');

  const avulsa = radarSpecialistExtraction({
    ...base, requirementId: null, requirementTopic: null, requirementClaim: null, requirementQuestion: null,
    originalText: "x", transcriptText: null,
  });
  assert.match(avulsa.editorialUse, /não nasceu de um ponto preparado/);

  /* Sem tópico, mas com pergunta, a aplicação aponta para a pergunta. */
  assert.match(
    radarSpecialistEditorialUse({ requirementTopic: null, requirementClaim: null, requirementQuestion: "O que pode ser afirmado?" }),
    /^Responder ao ponto: O que pode ser afirmado\?$/,
  );
});

test("§7 · a citação só existe depois de alguém marcar citação literal", () => {
  const texto = "Oleosidade isolada não é causa direta.";
  for (const decision of RADAR_SPECIALIST_DECISIONS) {
    const extraida = radarSpecialistExtraction({ ...base, originalText: texto, transcriptText: null, decision });
    if (decision === "QUOTE_CANDIDATE") assert.equal(extraida.quoteCandidate, texto);
    else assert.equal(extraida.quoteCandidate, null, `decisão ${decision} não pode produzir citação`);
  }
});

test("§8 · a tradução para o enum da projeção canônica é completa e reversível", () => {
  for (const decision of RADAR_SPECIALIST_DECISIONS) {
    const projetada = radarSpecialistDecisionToProjection(decision);
    assert.ok(projetada, `${decision} precisa ter tradução`);
    assert.equal(radarSpecialistDecisionOf(projetada), decision, `${decision} precisa voltar igual`);
  }
  assert.equal(radarSpecialistDecisionOf("inventada"), null);
});

test("§8 · só três decisões são ativas; NOT_APPROVED e REJECTED nunca são", () => {
  const ativas = RADAR_SPECIALIST_DECISIONS.filter(radarSpecialistDecisionIsActive);
  assert.deepEqual([...ativas], ["ACCEPTED_EVIDENCE", "SUPPORT_ONLY", "QUOTE_CANDIDATE"]);
});

/* ================ §13 · a decisão gravada, e preservada ================ */

const revisao = (decision: RadarSpecialistStoredReview["decision"]): RadarSpecialistStoredReview => ({
  decision, classification: "RESSALVA", relatedRequirementId: null,
  decidedAt: "2026-09-13T09:00:00.000Z", decidedBy: "usuario-1",
});

test("§13 · gravar a decisão não apaga a consulta nem a proveniência do ponto", () => {
  const contextoOriginal = {
    specialistRequirement: { requirementId: "specialist:4a13e0cb", kind: "RESOLVE_FACTUAL_UNCERTAINTY" },
    consultation: { consultationId: "consultation|x", requirementId: "specialist:4a13e0cb", invitedBy: "u", invitedAt: "2026-09-13T08:00:00.000Z", origin: "radar_specialist_consultation" },
  };
  const comRevisao = radarContextWithSpecialistReview({
    radarContext: contextoOriginal, contributionId: "c1", review: revisao("ACCEPTED_EVIDENCE"),
  });

  assert.deepEqual(comRevisao.specialistRequirement, contextoOriginal.specialistRequirement);
  assert.deepEqual(comRevisao.consultation, contextoOriginal.consultation);
  assert.equal(radarSpecialistReviewsOf(comRevisao).c1.decision, "ACCEPTED_EVIDENCE");
});

test("§13 · uma segunda decisão não apaga a primeira", () => {
  const um = radarContextWithSpecialistReview({ radarContext: {}, contributionId: "c1", review: revisao("SUPPORT_ONLY") });
  const dois = radarContextWithSpecialistReview({ radarContext: um, contributionId: "c2", review: revisao("REJECTED") });
  const lidas = radarSpecialistReviewsOf(dois);
  assert.equal(lidas.c1.decision, "SUPPORT_ONLY");
  assert.equal(lidas.c2.decision, "REJECTED");
});

test("§13 · a leitura descarta entrada corrompida sem derrubar as outras", () => {
  const lidas = radarSpecialistReviewsOf({
    contributionReviews: {
      boa: { decision: "accepted", classification: "ressalva", decidedAt: "2026-09-13T09:00:00.000Z", decidedBy: "u" },
      semDecisao: { classification: "ressalva" },
      naoObjeto: "accepted",
    },
  });
  assert.deepEqual(Object.keys(lidas), ["boa"]);
  /* O enum antigo da projeção também é aceito na leitura: nada gravado se perde. */
  assert.equal(lidas.boa.decision, "ACCEPTED_EVIDENCE");
  assert.equal(lidas.boa.classification, "RESSALVA");
});

test("§13 · salvar a pauta NÃO pode apagar uma decisão gravada nesse intervalo", () => {
  /*
   * O CASO REAL: uma aba edita o título da pauta com um `radar_context` lido
   * minutos atrás; outra aba aceita a contribuição como evidência. Sem esta
   * guarda, o salvamento devolveria ao banco um contexto sem a decisão.
   */
  const gravado = radarContextWithSpecialistReview({
    radarContext: { specialistRequirement: { requirementId: "specialist:1" } },
    contributionId: "c1", review: revisao("ACCEPTED_EVIDENCE"),
  });
  const doCliente = { specialistRequirement: { requirementId: "specialist:1" }, serpNeeds: ["x"] };

  const preservado = radarContextPreservingReviews({ incoming: doCliente, stored: gravado });
  assert.equal(radarSpecialistReviewsOf(preservado).c1.decision, "ACCEPTED_EVIDENCE");
  assert.deepEqual(preservado.serpNeeds, ["x"], "o resto do que o cliente mandou continua valendo");
});

test("§13 · o cliente não consegue inventar uma decisão pelo salvamento da pauta", () => {
  /*
   * A rota de pauta não é dona da decisão humana. Aceitar `contributionReviews`
   * vindo dela abriria um segundo caminho para promover evidência — um que não
   * passa pela rota de revisão nem pelo readback dela.
   */
  const forjado = { contributionReviews: { c9: { decision: "accepted", decidedAt: "", decidedBy: null, classification: null } } };
  const preservado = radarContextPreservingReviews({ incoming: forjado, stored: {} });
  assert.deepEqual(radarSpecialistReviewsOf(preservado), {});
  assert.equal("contributionReviews" in preservado, false);
});

/* ==================== §1, §2 e §3 · o fluxo na tela ==================== */

test("§1 · todo estado canônico cai em uma etapa do fluxo, e nenhuma sobra", () => {
  const alcancadas = new Set(RADAR_SPECIALIST_STATES.map(state => radarSpecialistFlow(state).stage));
  for (const stage of RADAR_SPECIALIST_FLOW_STAGES) {
    if (stage === "RESPOSTA_RECEBIDA") continue;
    assert.ok(alcancadas.has(stage), `nenhum estado leva a ${stage}`);
  }
});

test("§1 · a régua marca o percorrido e UMA etapa corrente", () => {
  const fluxo = radarSpecialistFlow("WAITING_RESPONSE");
  assert.equal(fluxo.stage, "PEDIDO_ENVIADO");
  assert.equal(fluxo.steps.filter(step => step.current).length, 1);
  assert.deepEqual(
    fluxo.steps.filter(step => step.reached).map(step => step.stage),
    ["PONTO_PREPARADO", "PAUTA_PRONTA", "PEDIDO_ENVIADO"],
  );
  assert.equal(fluxo.interrupted, false);
});

test("§1 · pauta cancelada não desenha progresso nenhum", () => {
  const fluxo = radarSpecialistFlow("CANCELLED");
  assert.equal(fluxo.interrupted, true);
  assert.equal(fluxo.steps.some(step => step.reached), false, "cancelada não pode parecer a caminho");
});

test("§2 · o rótulo da pauta muda com o envio, porque a edição muda", () => {
  assert.equal(radarSpecialistBriefActionLabel({ sentAt: null }), "Editar pauta");
  assert.equal(radarSpecialistBriefActionLabel({ sentAt: "2026-09-13T08:09:08.000Z" }), "Ver pauta");
});

test("§3 · Subir e Descer só existem a partir de duas perguntas", () => {
  assert.deepEqual(radarSpecialistQuestionControls(0), { canReorder: false, canRemove: false });
  assert.deepEqual(radarSpecialistQuestionControls(1), { canReorder: false, canRemove: true });
  assert.deepEqual(radarSpecialistQuestionControls(2), { canReorder: true, canRemove: true });
});

/* ============ a próxima ação, e o motivo de cada bloqueio ============= */

const contexto = (patch: Partial<RadarSpecialistActionContext> = {}): RadarSpecialistActionContext => ({
  state: "CONNECTED", connected: true, inviteState: "USED", hasInviteLink: false,
  botConfigured: true, sentAt: null, approved: false, questionCount: 1,
  pendingReview: false, contributionCount: 0,
  ...patch,
});

test("§1 · toda ação bloqueada declara o motivo — este é o defeito que o runtime encontrou", () => {
  const bloqueios: Array<Partial<RadarSpecialistActionContext>> = [
    { connected: false, botConfigured: false },
    { questionCount: 0 },
    { state: "BLOCKED" },
    { state: "CANCELLED" },
    { sentAt: "2026-09-13T08:09:08.000Z", state: "WAITING_RESPONSE" },
  ];
  for (const patch of bloqueios) {
    const acao = radarSpecialistNextAction(contexto(patch));
    assert.equal(acao.enabled, false, `${JSON.stringify(patch)} deveria estar bloqueado`);
    assert.ok(acao.reason && acao.reason.trim().length > 10, `sem motivo legível: ${JSON.stringify(patch)}`);
  }
});

test("§1 · sem ponto criado, a ação é criar a consulta", () => {
  const acao = radarSpecialistNextAction(contexto({ state: "PREPARED", connected: false }));
  assert.equal(acao.kind, "CREATE_CONSULTATION");
  assert.equal(acao.enabled, true);
  assert.equal(acao.reason, null);
});

test("§1 · sem especialista conectado, a ação é o convite — e ela depende do Bot", () => {
  const semBot = radarSpecialistNextAction(contexto({ state: "INVITED", connected: false, botConfigured: false }));
  assert.equal(semBot.kind, "ISSUE_INVITE");
  assert.equal(semBot.enabled, false);
  assert.match(semBot.reason || "", /username do Bot/);

  const comBot = radarSpecialistNextAction(contexto({ state: "INVITED", connected: false, inviteState: "OPEN" }));
  assert.equal(comBot.enabled, true);
  assert.equal(comBot.label, "Gerar novo link", "com convite aberto, o link novo substitui o anterior");

  const comLink = radarSpecialistNextAction(contexto({ state: "INVITED", connected: false, hasInviteLink: true }));
  assert.equal(comLink.kind, "SHARE_INVITE");
});

test("§1 · conectado e sem aprovação, a ação é aprovar — não um envio inerte", () => {
  /*
   * ESTE É O DEFEITO RELATADO NO RUNTIME.
   *
   * A tela oferecia "Enviar pauta" desabilitado, com o critério — o brief
   * precisa estar aprovado — escondido num editor no fim da coluna. De fora,
   * o botão parecia quebrado.
   */
  const semAprovacao = radarSpecialistNextAction(contexto({ approved: false }));
  assert.equal(semAprovacao.kind, "APPROVE_BRIEF");
  assert.equal(semAprovacao.enabled, true);

  const semPergunta = radarSpecialistNextAction(contexto({ approved: false, questionCount: 0 }));
  assert.equal(semPergunta.kind, "APPROVE_BRIEF");
  assert.equal(semPergunta.enabled, false);
  assert.match(semPergunta.reason || "", /nenhuma pergunta/);

  /*
   * E UMA PAUTA JÁ APROVADA, MAS VAZIA, NÃO VOLTA A PEDIR APROVAÇÃO.
   *
   * O passo dela é o envio; o que falta é a pergunta. Reoferecer "Aprovar"
   * sobre o que já foi aprovado manda a pessoa refazer um ato concluído e
   * esconde o que de fato está faltando.
   */
  const aprovadaVazia = radarSpecialistNextAction(contexto({ approved: true, questionCount: 0 }));
  assert.equal(aprovadaVazia.kind, "SEND_BRIEF");
  assert.equal(aprovadaVazia.enabled, false);
  assert.match(aprovadaVazia.reason || "", /nenhuma pergunta/);

  const aprovada = radarSpecialistNextAction(contexto({ approved: true }));
  assert.equal(aprovada.kind, "SEND_BRIEF");
  assert.equal(aprovada.enabled, true);
});

test("§1 · depois do envio, nenhuma ação volta a ser sobre enviar", () => {
  const enviado = { sentAt: "2026-09-13T08:09:08.000Z" };
  assert.equal(radarSpecialistNextAction(contexto({ ...enviado, state: "WAITING_RESPONSE" })).kind, "AWAIT_RESPONSE");
  assert.equal(radarSpecialistNextAction(contexto({ ...enviado, state: "AWAITING_CONTRIBUTION_REVIEW", pendingReview: true, contributionCount: 1 })).kind, "REVIEW_CONTRIBUTION");
  assert.equal(radarSpecialistNextAction(contexto({ ...enviado, state: "ACCEPTED", contributionCount: 1 })).kind, "DONE");

  /* Nem mesmo uma pauta enviada e NÃO aprovada oferece aprovar de novo. */
  const enviadaSemAprovacao = radarSpecialistNextAction(contexto({ ...enviado, approved: false, state: "WAITING_RESPONSE" }));
  assert.notEqual(enviadaSemAprovacao.kind, "APPROVE_BRIEF");
  assert.notEqual(enviadaSemAprovacao.kind, "SEND_BRIEF");
});

/* ================== §9 e §10 · a camada de especialista ================= */

const fonte = (patch: Partial<RadarSpecialistEvidenceSource> = {}, decisao: RadarSpecialistStoredReview["decision"] = "ACCEPTED_EVIDENCE", id = "c1"): RadarSpecialistEvidenceSource => ({
  extraction: radarSpecialistExtraction({
    ...base, contributionId: id,
    originalText: "Oleosidade isolada não deve ser apresentada como causa direta da acne.",
    transcriptText: null, decision: decisao,
  }),
  requirementQuestion: "O que pode ser afirmado com segurança neste ponto?",
  requirementKind: "RESOLVE_FACTUAL_UNCERTAINTY",
  sentQuestions: ["O que pode ser afirmado com segurança neste ponto?"],
  expertDisplayName: "Adalberto Escalante",
  ...patch,
});

const binding = { brandId: "marca-1", articleId: "artigo-1", articleDnaVersionId: "dna-1", articleDnaContentHash: "hash-1" };

test("§10 · recusada e não decidida NÃO viram evidência ativa — e são contadas", () => {
  const camada = buildRadarSpecialistEvidenceLayer({
    binding, preparedRequirements: 3,
    sources: [
      fonte({}, "ACCEPTED_EVIDENCE", "c1"),
      fonte({}, "REJECTED", "c2"),
      fonte({}, "NOT_APPROVED", "c3"),
      fonte({}, "SUPPORT_ONLY", "c4"),
    ],
  });

  assert.deepEqual(camada.items.map(item => item.contributionId), ["c1", "c4"]);
  assert.equal(camada.rejected, 1);
  assert.equal(camada.notApproved, 1);
  /*
   * A AUSÊNCIA É DECLARADA, NUNCA OMITIDA. Um dossiê que mostra duas
   * evidências e silencia sobre a resposta recusada descreve uma investigação
   * que não aconteceu.
   */
  assert.equal(camada.preparedRequirements, 3);
});

test("§10 · uma contribuição sem ponto de revisão não entra como evidência", () => {
  const avulsa = fonte({
    extraction: radarSpecialistExtraction({
      ...base, requirementId: null, requirementTopic: null,
      originalText: "resposta solta", transcriptText: null, decision: "ACCEPTED_EVIDENCE",
    }),
  });
  const camada = buildRadarSpecialistEvidenceLayer({ binding, preparedRequirements: 1, sources: [avulsa] });
  assert.deepEqual(camada.items, []);
  assert.equal(camada.notApproved, 1, "ela não some: é declarada como não aproveitada");
});

test("§10 · a necessidade original e a pergunta enviada viajam junto da resposta", () => {
  const camada = buildRadarSpecialistEvidenceLayer({ binding, preparedRequirements: 1, sources: [fonte()] });
  const item = camada.items[0];
  assert.equal(item.requirementQuestion, "O que pode ser afirmado com segurança neste ponto?");
  assert.deepEqual(item.sentQuestions, ["O que pode ser afirmado com segurança neste ponto?"]);
  assert.equal(item.expert.displayName, "Adalberto Escalante");
  assert.equal(item.provenance.provider, "telegram");
  assert.equal(item.provenance.checksum, "sha256:abc");
  assert.ok(item.originalText.length > 0, "a resposta original chega inteira ao Planejador");
});

test("§9 · uma citação que não está no original não sai daqui", () => {
  /*
   * A FALHA MAIS CARA POSSÍVEL: o Radar entregaria o nome de um profissional
   * em cima de uma frase que ele não disse.
   */
  const adulterada = fonte({}, "QUOTE_CANDIDATE");
  const corrompida: RadarSpecialistEvidenceSource = {
    ...adulterada,
    extraction: { ...adulterada.extraction, quoteCandidate: "frase que ele nunca falou" },
  };
  assert.throws(
    () => buildRadarSpecialistEvidenceLayer({ binding, preparedRequirements: 1, sources: [corrompida] }),
    /RADAR_SPECIALIST_EVIDENCE_QUOTE_NOT_IN_ORIGINAL/,
  );
});

test("§9 · a camada exige o vínculo com a versão do ArticleDNA", () => {
  for (const campo of ["brandId", "articleId", "articleDnaVersionId"] as const) {
    assert.throws(
      () => buildRadarSpecialistEvidenceLayer({ binding: { ...binding, [campo]: "" }, preparedRequirements: 0, sources: [] }),
      /RADAR_SPECIALIST_EVIDENCE_MISSING/,
      `faltando ${campo}`,
    );
  }
});

test("§10 · a cobertura conta PONTOS respondidos, não contribuições", () => {
  const camada = buildRadarSpecialistEvidenceLayer({
    binding, preparedRequirements: 4,
    sources: [fonte({}, "ACCEPTED_EVIDENCE", "c1"), fonte({}, "QUOTE_CANDIDATE", "c2")],
  });
  /* As duas respondem ao MESMO ponto: é uma necessidade coberta, não duas. */
  assert.deepEqual(radarSpecialistEvidenceCoverage(camada), { requirementsCovered: 1, preparedRequirements: 4, quotes: 1 });
});

test("todas as classificações têm rótulo, e nenhuma sobra sem tradução", () => {
  for (const item of RADAR_SPECIALIST_CLASSIFICATIONS) {
    assert.equal(radarSpecialistClassificationOf(item), item);
  }
});

test("REAL_PROVIDER_CALLS = 0", () => {
  assert.deepEqual(tentativasDeRede, []);
});
