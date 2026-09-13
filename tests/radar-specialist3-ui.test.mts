import assert from "node:assert/strict";
import test from "node:test";
import type { RadarFrozenSpecialistRequirement } from "../lib/radar/specialist-lifecycle.ts";
import type { RadarR6ExpertTopicContext } from "../lib/radar/r6-sequential.ts";
import { montarRadar, comProductShell, React } from "./radar-dom-harness.mts";

/**
 * A TELA DO ESPECIALISTA, EXERCIDA — SPECIALIST_3.
 *
 * O que este arquivo persegue são as três confusões que o runtime relatou, e
 * elas só aparecem clicando:
 *
 *   1. dois cards com o MESMO título e dois botões concorrentes
 *   2. "Enviar pauta" inerte, sem nenhum critério visível para o bloqueio
 *   3. um select de classificação vazio e outro cheio de id de concorrente
 *
 * Nenhuma chamada real: `fetch` é controlado aqui, e toda escrita é observada.
 */

const brandId = "b0000000-0000-4000-8000-0000000000a1";
const expertId = "b0000000-0000-4000-8000-0000000000a2";
const briefId = "b0000000-0000-4000-8000-0000000000a3";
const contributionId = "b0000000-0000-4000-8000-0000000000a4";
const articleId = "artigo-specialist3";
const articleDnaVersionId = "dna-specialist3";

const requisito: RadarFrozenSpecialistRequirement = {
  requirementId: "specialist:4a13e0cb",
  claimId: "claim:acne",
  kind: "RESOLVE_FACTUAL_UNCERTAINTY",
  priority: "MEDIUM",
  topic: "O que causa acne",
  specificQuestion: "3 de 10 concorrentes tratam do tema. Não encontramos fonte adequada. O que pode ser afirmado com segurança neste ponto, e o que precisa ser qualificado ou omitido?",
  whyReviewIsNeeded: "Não encontramos fonte adequada que sustente esta afirmação.",
};

/**
 * O CONTEXTO COM O LIXO INTERNO DENTRO — de propósito.
 *
 * `openGaps` e `serpNeeds` são exatamente o que alimentava o select
 * "Relacionar à necessidade" no runtime: ids de concorrente em base64 e
 * resultados de benchmark. O teste precisa deles presentes para poder provar
 * que a tela NÃO os oferece mais (§12).
 */
const contexto = {
  articleId, brandId, articleDnaVersionId,
  articleDnaContentHash: "hash-s3",
  articleDna: { principal: "acne", intent: "informacional", silo: "Pele", audience: "paciente", problem: "acne", desiredResult: "entender", requiredTopics: [], knownQuestions: [] },
  keywordDnas: [], siloDna: null,
  serpNeeds: ["O que causa acne"],
  openGaps: [
    "competitor:aHR0cHM6Ly93d3cuZXhlbXBsby5jb20: marketplace / success",
    "competitor:aHR0cHM6Ly9vdXRybw: article_editorial / success",
  ],
  conflicts: [], knownQuestions: [],
  approvedReferences: [], serpSnapshotId: null, serpSnapshotVersion: null, serpReviewed: true, analysisVersionId: null,
  amazonCriteria: [], amazonEvidence: [], amazonState: "AMAZON_NOT_APPLICABLE",
  existingContent: "", existingContentItems: [], provenance: [],
} satisfies RadarR6ExpertTopicContext;

const especialista = { id: expertId, brandId, displayName: "Adalberto Escalante", specialty: null, status: "active", createdAt: "2026-01-01T00:00:00Z" };

const pauta = (patch: Record<string, unknown> = {}) => ({
  id: briefId, brandId, expertId, articleId, articleDnaVersionId,
  title: "O que causa acne",
  questions: [{ id: "q1", text: "O que pode ser afirmado com segurança neste ponto?", origin: "radar", need: null, reference: null, justification: null }],
  status: "draft",
  radarContext: {
    specialistRequirement: { requirementId: requisito.requirementId },
    consultation: { consultationId: "consultation|x", requirementId: requisito.requirementId, invitedBy: "u", invitedAt: "2026-09-13T08:00:00Z", origin: "radar_specialist_consultation" },
  },
  createdAt: "2026-09-13T08:00:00Z", updatedAt: "2026-09-13T08:00:00Z",
  sentAt: null, completedAt: null,
  ...patch,
});

const contribuicao = (patch: Record<string, unknown> = {}) => ({
  id: contributionId, brandId, expertId, briefId,
  sourceType: "TEXT",
  originalText: "Oleosidade isolada não deve ser tratada como causa direta da acne, desde que a barreira cutânea esteja íntegra.",
  transcriptText: null, organizationPayload: null,
  processingStatus: "RECEIVED", receivedAt: "2026-09-13T08:11:57Z",
  evidence: { externalUpdateId: "update-1", originalAssetUri: null, checksum: null },
  ...patch,
});

const consulta = (patch: Record<string, unknown> = {}) => ({
  requirementId: requisito.requirementId,
  consultationId: "consultation|x",
  participant: { id: expertId, displayName: "Adalberto Escalante", provisional: false },
  briefId, status: "draft", sentAt: null, connected: true,
  invite: { state: "USED", expiresAt: null },
  ...patch,
});

/** O servidor da área, com o que cada rota devolve e o registro do que foi pedido. */
function servidor(estadoInicial: {
  briefs?: unknown[];
  contributions?: unknown[];
  consultations?: unknown[];
  bindings?: unknown[];
} = {}) {
  const estado = {
    briefs: estadoInicial.briefs ?? [pauta()],
    contributions: estadoInicial.contributions ?? [],
    consultations: estadoInicial.consultations ?? [consulta()],
    bindings: estadoInicial.bindings ?? [{ expertId, status: "active" }],
  };
  const escritas: Array<{ url: string; body: Record<string, unknown> }> = [];
  const original = globalThis.fetch;

  globalThis.fetch = (async (entrada: unknown, init?: { method?: string; body?: string }) => {
    const url = String(entrada);
    const method = init?.method || "GET";
    const json = (valor: unknown) => ({ ok: true, status: 200, json: async () => valor });

    if (method === "GET" && url.includes("/api/editorial/expert-briefs")) {
      return json({ experts: [especialista], bindings: estado.bindings, briefs: estado.briefs, contributions: estado.contributions });
    }
    if (method === "GET" && url.includes("/api/editorial/expert-consultations")) {
      return json({ consultations: estado.consultations, botUsername: "minekeybot" });
    }

    const body = init?.body ? JSON.parse(init.body) as Record<string, unknown> : {};
    escritas.push({ url, body });

    if (url.includes("/api/editorial/expert-contributions/review")) {
      /*
       * O SERVIDOR GRAVA NO `radar_context` DA PAUTA — como a rota real faz.
       *
       * Devolver um brief sem a decisão dentro faria o teste medir o otimismo
       * da tela em vez do readback, que é justamente o que o §13 exige.
       */
      const atual = estado.briefs[0] as Record<string, unknown>;
      const radarContext = atual.radarContext as Record<string, unknown>;
      const revisoes = (radarContext.contributionReviews || {}) as Record<string, unknown>;
      const atualizada = {
        ...atual,
        radarContext: {
          ...radarContext,
          contributionReviews: {
            ...revisoes,
            [String(body.contributionId)]: {
              decision: body.decision,
              classification: body.classification ?? null,
              relatedRequirementId: body.relatedRequirementId ?? null,
              decidedAt: "2026-09-13T09:00:00Z",
              decidedBy: "u",
            },
          },
        },
      };
      estado.briefs = [atualizada];
      return json({ brief: atualizada, persistence: "remote_readback_confirmed" });
    }

    if (url.includes("/api/editorial/expert-briefs/send")) {
      /*
       * A PAUTA VOLTA ENVIADA; A PROJEÇÃO DA CONSULTA, NÃO — e é de propósito.
       *
       * Em runtime é exatamente assim: o readback do envio devolve a PAUTA, que
       * entra no overlay na hora, enquanto a projeção da consulta só muda na
       * próxima releitura da área — que o coalescing pode adiar. Atualizar as
       * duas aqui fecharia a janela em que o defeito vive, e a ordem de leitura
       * entre pauta e consulta deixaria de importar para o teste.
       */
      const enviada = { ...(estado.briefs[0] as Record<string, unknown>), status: "awaiting_expert", sentAt: "2026-09-13T08:09:08Z" };
      estado.briefs = [enviada];
      return json({ brief: enviada, persistence: "remote_readback_confirmed", send: "confirmed" });
    }

    if (url.includes("/api/editorial/expert-briefs")) {
      const aprovada = { ...(estado.briefs[0] as Record<string, unknown>), status: String(body.status || "draft") };
      estado.briefs = [aprovada];
      estado.consultations = [consulta({ status: String(body.status || "draft") })];
      return json({ brief: aprovada, persistence: "remote_readback_confirmed" });
    }

    return json({});
  }) as unknown as typeof globalThis.fetch;

  return { escritas, estado, restaurar: () => { globalThis.fetch = original; } };
}

/**
 * O QUE A TELA MOSTRA SEM NINGUÉM ABRIR NADA.
 *
 * `textContent` enxerga dentro de um `<details>` fechado, e o §12 não pede
 * que o dado técnico desapareça — pede que ele saia da VISÃO NORMAL. Medir o
 * texto inteiro condenaria a proveniência recolhida, que é o lugar certo dele.
 */
function textoNormal(elemento: HTMLElement): string {
  const copia = elemento.cloneNode(true) as HTMLElement;
  for (const detalhe of [...copia.querySelectorAll("details")]) detalhe.remove();
  return copia.textContent || "";
}

async function montarPainel() {
  const { RadarExpertBriefPanel } = await import("../modules/radar/radar-expert-brief-panel.tsx");
  const tela = await montarRadar();
  await tela.render(comProductShell(React.createElement(RadarExpertBriefPanel, {
    brandId, articleId, articleDnaVersionId,
    articleTitle: "Skincare para pele oleosa",
    articleVersion: "v1", articleRole: "Suporte",
    context: contexto,
    requirements: [requisito],
  })));
  return tela;
}

/* ========================== §1 · a duplicação ========================== */

test("§1 · o título do ponto aparece UMA vez, num card que evolui", async () => {
  const rede = servidor();
  const tela = await montarPainel();
  try {
    /*
     * O DEFEITO RELATADO: "PONTOS PARA REVISÃO" e "PAUTAS / PEDIDOS" mostravam
     * o mesmo título, em dois cards, com botões diferentes. A leitura natural
     * era que havia dois pedidos a enviar.
     */
    assert.equal(tela.all("radar-specialist-review-point").length, 1);
    assert.equal(tela.all("radar-specialist-brief-row").length, 0, "a pauta do ponto não pode ser listada uma segunda vez");
    assert.equal(tela.text().includes("PAUTAS / PEDIDOS"), false);

    const fluxo = tela.get("radar-specialist-flow");
    for (const etapa of ["Ponto preparado", "Pauta pronta", "Pedido enviado", "Resposta recebida", "Contribuição a revisar", "Evidência decidida"]) {
      assert.ok(fluxo.textContent?.includes(etapa), `a régua precisa mostrar "${etapa}"`);
    }
    assert.equal(tela.get("radar-specialist-flow-current").textContent, "Pauta pronta");
  } finally {
    tela.destroy();
    rede.restaurar();
  }
});

/* ===================== a ação única, e o seu motivo ==================== */

test("§1 · conectado e sem aprovação, a tela oferece APROVAR — e não um envio inerte", async () => {
  const rede = servidor();
  const tela = await montarPainel();
  try {
    const acao = tela.get("radar-specialist-next-action");
    assert.equal(acao.textContent, "Aprovar pauta para envio");
    assert.equal((acao as HTMLButtonElement).disabled, false, "a ação possível não pode chegar desabilitada");
    assert.equal(tela.query("radar-specialist-next-action-reason"), null, "ação possível não precisa de motivo");

    await tela.click(acao);
    const aprovacao = rede.escritas.find(item => item.url.includes("/api/editorial/expert-briefs") && item.body.status === "reviewed");
    assert.ok(aprovacao, "aprovar precisa gravar no servidor");

    /* Aprovada, a próxima ação passa a ser o envio — no mesmo lugar da tela. */
    assert.equal(tela.get("radar-specialist-next-action").textContent, "Enviar pedido ao especialista");
  } finally {
    tela.destroy();
    rede.restaurar();
  }
});

test("§1 · a ação bloqueada DIZ o que falta — o critério deixa de ser invisível", async () => {
  /* Pauta sem pergunta nenhuma: aprovar é impossível, e o porquê aparece. */
  const rede = servidor({ briefs: [pauta({ questions: [] })] });
  const tela = await montarPainel();
  try {
    const acao = tela.get("radar-specialist-next-action") as HTMLButtonElement;
    assert.equal(acao.disabled, true);
    assert.match(tela.get("radar-specialist-next-action-reason").textContent || "", /nenhuma pergunta/);
  } finally {
    tela.destroy();
    rede.restaurar();
  }
});

test("§2 · o rótulo da pauta muda de Editar para Ver depois do envio", async () => {
  const rede = servidor();
  const tela = await montarPainel();
  try {
    assert.equal(tela.get("radar-specialist-open-brief").textContent, "Editar pauta");
    await tela.click("radar-specialist-next-action");
    await tela.click("radar-specialist-next-action");
    assert.equal(tela.get("radar-specialist-open-brief").textContent, "Ver pauta");

    /*
     * E A PRÓXIMA AÇÃO PARA DE OFERECER ENVIO — no MESMO instante.
     *
     * A pauta acabou de voltar enviada; a projeção da consulta ainda não. Ler
     * a consulta primeiro faria o card oferecer "Enviar pedido" de novo, sobre
     * um pedido que já saiu.
     */
    assert.equal(tela.get("radar-specialist-next-action").textContent, "Aguardando o especialista");
  } finally {
    tela.destroy();
    rede.restaurar();
  }
});

/* ================= §5, §11 e §12 · o card da resposta ================== */

async function telaComResposta() {
  const rede = servidor({
    briefs: [pauta({ status: "awaiting_review", sentAt: "2026-09-13T08:09:08Z" })],
    contributions: [contribuicao()],
    consultations: [consulta({ status: "awaiting_review", sentAt: "2026-09-13T08:09:08Z" })],
  });
  const tela = await montarPainel();
  return { rede, tela };
}

test("§5 · a classificação chega SUGERIDA, com a origem declarada — sem select vazio", async () => {
  const { rede, tela } = await telaComResposta();
  try {
    /* "desde que" no texto do especialista: a sugestão é Ressalva, pelo texto. */
    assert.equal(tela.get("radar-specialist-classification").textContent, "Ressalva");
    assert.match(tela.get("radar-specialist-classification-source").textContent || "", /sugerida pelo texto/);
    assert.equal(tela.text().includes("Selecionar classificação"), false, "nenhum select vazio como primeira ação");

    /* Corrigir é possível, e só aparece quando alguém pede. */
    await tela.click("radar-specialist-change-classification");
    const select = tela.container.querySelector('select[aria-label="Classificação da contribuição"]') as HTMLSelectElement;
    assert.ok(select, "o select de correção aparece ao clicar em Alterar");
    assert.ok(select.textContent?.includes("Vale, mas sob esta condição."), "cada opção explica o que significa");

    /*
     * E CORRIGIR PRECISA CHEGAR AO SERVIDOR.
     *
     * Uma correção que só existe na tela volta à sugestão na próxima leitura, e
     * a pessoa corrige de novo sem entender por quê. Foi um sobrevivente da
     * bateria de mutação: o teste abria o select e nunca escolhia nada.
     */
    await tela.select(select, "LIMITACAO");
    const escrita = rede.escritas.find(item => item.url.includes("/expert-contributions/review"));
    assert.ok(escrita, "corrigir a classificação precisa gravar no servidor");
    assert.equal(escrita.body.classification, "LIMITACAO");
    assert.equal(escrita.body.decision, "NOT_APPROVED", "corrigir a classificação NÃO decide nada — §8");

    assert.equal(tela.get("radar-specialist-classification").textContent, "Limitação");
    assert.match(tela.get("radar-specialist-classification-source").textContent || "", /definida por você/);
  } finally {
    tela.destroy();
    rede.restaurar();
  }
});

test("§4 e §12 · ids de concorrente e benchmark somem da visão normal", async () => {
  const { rede, tela } = await telaComResposta();
  try {
    /* O select antigo some por inteiro — inclusive dos detalhes avançados. */
    assert.equal(tela.text().includes("Relacionar à necessidade"), false);

    const visivel = textoNormal(tela.container);
    assert.equal(visivel.includes("competitor:"), false, "id de concorrente não é vocabulário de quem revisa");
    assert.equal(visivel.includes("marketplace / success"), false);
    assert.equal(visivel.includes("article_editorial / success"), false);
    assert.equal(visivel.includes(contributionId), false, "ids técnicos saem da visão normal");
    assert.equal(visivel.includes(requisito.requirementId), false);

    /* A relação vem derivada do ponto, escrita para gente. */
    assert.equal(tela.get("radar-specialist-editorial-use").textContent, 'Qualificar o trecho sobre "O que causa acne".');

    /* Os ids continuam existindo — um nível abaixo, na proveniência (§12). */
    const avancado = tela.get("radar-specialist-contribution-advanced");
    assert.ok(avancado.textContent?.includes(contributionId));
    assert.ok(avancado.textContent?.includes(requisito.requirementId));

    /*
     * E A ASSOCIAÇÃO MANUAL, QUE SOBROU NO AVANÇADO, OFERECE PONTOS.
     *
     * Esconder o select antigo dentro do disclosure não resolveria nada: ele
     * continuaria listando `competitor:aHR0…` para quem abrisse. As opções
     * passam a ser os pontos de revisão deste artigo, com o título que uma
     * pessoa lê — e isto foi um sobrevivente da bateria de mutação.
     */
    const manual = tela.container.querySelector('select[aria-label="Relacionar a outro ponto de revisão"]') as HTMLSelectElement;
    assert.ok(manual, "a associação manual continua disponível para a pauta avulsa");
    const opcoes = [...manual.querySelectorAll("option")].map(item => item.textContent || "");
    assert.deepEqual(opcoes, ["Vínculo automático da pauta", "O que causa acne"]);
    assert.equal(opcoes.some(item => item.includes("competitor:")), false);
  } finally {
    tela.destroy();
    rede.restaurar();
  }
});

test("§11 · o card é compacto: o original fica recolhido, a síntese aparece", async () => {
  const { rede, tela } = await telaComResposta();
  try {
    const original = tela.get("radar-specialist-original-text");
    assert.equal(original.tagName, "DETAILS");
    assert.equal((original as HTMLDetailsElement).open, false, "a resposta original não pode ocupar a tela por padrão");
    assert.ok(original.textContent?.includes("Ver texto completo"));

    assert.ok(tela.get("radar-specialist-extracted-summary").textContent?.includes("Oleosidade isolada"));
    /* Três colunas com o mesmo texto — Original, Transcrição, Extraída — saíram. */
    assert.equal(tela.text().includes("Transcrição fiel"), true, "a transcrição continua consultável");
    assert.equal(tela.get("radar-specialist-contribution-advanced").textContent?.includes("Transcrição fiel"), true, "e ela mora nos detalhes");
  } finally {
    tela.destroy();
    rede.restaurar();
  }
});

/* ================= §6, §8 e §13 · a decisão é remota ================== */

test("§6 e §13 · aceitar como evidência GRAVA no servidor e volta pelo readback", async () => {
  const { rede, tela } = await telaComResposta();
  try {
    assert.equal(tela.get("radar-specialist-decision-state").textContent, "Aguardando sua decisão");

    await tela.click("radar-specialist-decision-ACCEPTED_EVIDENCE");

    const escrita = rede.escritas.find(item => item.url.includes("/expert-contributions/review"));
    assert.ok(escrita, "a decisão precisa ir ao servidor — localStorage não sobrevive à troca de máquina");
    assert.equal(escrita.body.decision, "ACCEPTED_EVIDENCE");
    assert.equal(escrita.body.contributionId, contributionId);
    assert.equal(escrita.body.briefId, briefId);

    /* O estado na tela vem do que o servidor devolveu, não do clique. */
    assert.equal(tela.get("radar-specialist-decision-state").textContent, "Aceita como evidência");
  } finally {
    tela.destroy();
    rede.restaurar();
  }
});

test("§13 · a decisão sobrevive à remontagem inteira do painel", async () => {
  const { rede, tela } = await telaComResposta();
  /*
   * DESMONTAR É OBRIGAÇÃO DO `finally`, mesmo aqui.
   *
   * O painel mantém o tique do fallback vivo enquanto estiver montado. Uma
   * asserção que falhasse antes do `destroy()` deixaria o `setInterval` de pé,
   * e o processo do `node --test` nunca terminaria: a suíte PENDURA em vez de
   * falhar. Aconteceu na bateria de mutação, e "morreu por timeout" não é
   * prova de nada.
   */
  let outra: Awaited<ReturnType<typeof montarPainel>> | null = null;
  try {
    await tela.click("radar-specialist-decision-SUPPORT_ONLY");
    assert.equal(tela.get("radar-specialist-decision-state").textContent, "Usada como apoio");
    tela.destroy();

    /*
     * F5 SEM F5: o painel é destruído e montado outra vez, e a decisão volta
     * da leitura remota. Se ela morasse no navegador, este teste passaria do
     * mesmo jeito — por isso o teste anterior verifica a ESCRITA.
     */
    outra = await montarPainel();
    assert.equal(outra.get("radar-specialist-decision-state").textContent, "Usada como apoio");
  } finally {
    outra?.destroy();
    tela.destroy();
    rede.restaurar();
  }
});

test("§13 · sem confirmação remota, a tela NÃO muda a decisão", async () => {
  /*
   * O CASO QUE SEPARA "gravou" DE "respondeu 200".
   *
   * Uma resposta sem `remote_readback_confirmed` significa que o servidor não
   * conferiu o que gravou. Mostrar "Aceita como evidência" ali seria a tela
   * afirmando uma decisão que ninguém garante estar no banco — e ela seguiria
   * para o Planejador como evidência aceita.
   */
  const rede = servidor({
    briefs: [pauta({ status: "awaiting_review", sentAt: "2026-09-13T08:09:08Z" })],
    contributions: [contribuicao()],
    consultations: [consulta({ status: "awaiting_review", sentAt: "2026-09-13T08:09:08Z" })],
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (entrada: unknown, init?: { method?: string; body?: string }) => {
    if (String(entrada).includes("/expert-contributions/review")) {
      return { ok: true, status: 200, json: async () => ({ brief: pauta(), persistence: "optimistic" }) };
    }
    return originalFetch(entrada as never, init as never);
  }) as unknown as typeof globalThis.fetch;

  const tela = await montarPainel();
  try {
    await tela.click("radar-specialist-decision-ACCEPTED_EVIDENCE");
    assert.equal(tela.get("radar-specialist-decision-state").textContent, "Aguardando sua decisão");
    assert.match(tela.text(), /não retornou confirmação remota/);
  } finally {
    tela.destroy();
    globalThis.fetch = originalFetch;
    rede.restaurar();
  }
});

test("§8 · nenhuma decisão é tomada sozinha: a extração existe e continua NOT_APPROVED", async () => {
  const { rede, tela } = await telaComResposta();
  try {
    /* A contribuição está extraída, classificada e com aplicação editorial… */
    assert.ok(tela.get("radar-specialist-extracted-summary").textContent);
    assert.equal(tela.get("radar-specialist-classification").textContent, "Ressalva");
    /* …e mesmo assim nada foi aprovado, e nenhuma escrita aconteceu. */
    assert.equal(tela.get("radar-specialist-decision-state").textContent, "Aguardando sua decisão");
    assert.deepEqual(rede.escritas, []);
  } finally {
    tela.destroy();
    rede.restaurar();
  }
});

test("§7 · marcar citação literal preserva o trecho original, palavra por palavra", async () => {
  const { rede, tela } = await telaComResposta();
  try {
    await tela.click("radar-specialist-decision-QUOTE_CANDIDATE");
    const citacao = tela.get("radar-specialist-quote").textContent || "";
    assert.ok(citacao.includes("Oleosidade isolada não deve ser tratada como causa direta da acne"));
  } finally {
    tela.destroy();
    rede.restaurar();
  }
});

/* ===================== §3 · os controles da pauta ====================== */

test("§3 · com uma pergunta só, Subir e Descer não aparecem", async () => {
  const rede = servidor();
  const tela = await montarPainel();
  try {
    await tela.click("radar-specialist-open-brief");
    const controles = tela.get("radar-specialist-question-controls");
    assert.equal(controles.textContent, "Remover", "dois botões inertes para sempre não são controle");

    assert.equal(tela.text().includes("A IA só é chamada por esta ação"), false, "a explicação da IA não ocupa espaço permanente");
    const sugestoes = tela.get("radar-specialist-generate-suggestions");
    assert.equal(sugestoes.textContent, "Sugestões por IA");
    assert.match(sugestoes.getAttribute("title") || "", /A IA só é chamada por esta ação/);
  } finally {
    tela.destroy();
    rede.restaurar();
  }
});

test("§3 · com duas perguntas, Subir e Descer voltam", async () => {
  const rede = servidor({
    briefs: [pauta({ questions: [
      { id: "q1", text: "Primeira pergunta?", origin: "radar", need: null, reference: null, justification: null },
      { id: "q2", text: "Segunda pergunta?", origin: "human", need: null, reference: null, justification: null },
    ] })],
  });
  const tela = await montarPainel();
  try {
    await tela.click("radar-specialist-open-brief");
    const controles = tela.all("radar-specialist-question-controls");
    assert.equal(controles.length, 2);
    assert.ok(controles[0].textContent?.includes("Subir"));
    assert.ok(controles[0].textContent?.includes("Descer"));
  } finally {
    tela.destroy();
    rede.restaurar();
  }
});
