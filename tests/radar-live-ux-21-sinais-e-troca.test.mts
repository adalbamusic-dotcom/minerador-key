import assert from "node:assert/strict";
import test from "node:test";
import type { RadarFrozenSpecialistRequirement } from "../lib/radar/specialist-lifecycle.ts";
import type { RadarR6ExpertTopicContext } from "../lib/radar/r6-sequential.ts";
import { montarRadar, comProductShell, React } from "./radar-dom-harness.mts";

/**
 * OS CASOS QUE SÓ O DOM PROVA — §9, e §15 C/E/F.
 *
 * A entrega anterior verificou estes pontos por leitura do código: dá para
 * afirmar que a guarda de chave existe, não que ela SEGURA. A diferença aparece
 * exatamente no caso que o §9 chama de crítico — trocar de artigo com uma
 * leitura em voo — porque ali o erro não é de escrita, é de ordem no tempo.
 */

const brandId = "b0000000-0000-4000-8000-0000000000a1";
const expertId = "b0000000-0000-4000-8000-0000000000a2";
const articleDnaVersionId = "dna-troca";

const requisito: RadarFrozenSpecialistRequirement = {
  requirementId: "specialist:troca",
  claimId: "claim:troca",
  kind: "RESOLVE_FACTUAL_UNCERTAINTY",
  priority: "MEDIUM",
  specificQuestion: "O que pode ser afirmado com segurança?",
};

const contextoDe = (articleId: string) => ({
  articleId, brandId, articleDnaVersionId,
  articleDnaContentHash: "hash",
  articleDna: { principal: "acne", intent: "informacional", silo: "Pele", audience: "paciente", problem: "acne", desiredResult: "entender", requiredTopics: [], knownQuestions: [] },
  keywordDnas: [], siloDna: null,
  serpNeeds: [], openGaps: [], conflicts: [], knownQuestions: [],
  approvedReferences: [], serpSnapshotId: null, serpSnapshotVersion: null, serpReviewed: true, analysisVersionId: null,
  amazonCriteria: [], amazonEvidence: [], amazonState: "AMAZON_NOT_APPLICABLE",
  existingContent: "", existingContentItems: [], provenance: [],
} satisfies RadarR6ExpertTopicContext);

const expert = { id: expertId, brandId, displayName: "Dra. X", specialty: null, status: "active", createdAt: "2026-01-01T00:00:00Z" };

const pautaDe = (articleId: string) => ({
  id: `brief-${articleId}`, brandId, expertId, articleId, articleDnaVersionId,
  title: "Pauta", questions: [], status: "awaiting_review",
  radarContext: { specialistRequirement: { requirementId: requisito.requirementId } },
  createdAt: "2026-09-13T09:00:00Z", updatedAt: "2026-09-13T09:00:00Z",
  sentAt: "2026-09-13T09:10:00Z", completedAt: null,
});

const contribuicaoDe = (articleId: string, texto: string) => ({
  id: `c-${articleId}`, brandId, expertId, briefId: `brief-${articleId}`,
  sourceType: "TEXT", originalText: texto, transcriptText: null, organizationPayload: null,
  processingStatus: "RECEIVED", receivedAt: "2026-09-13T09:20:00Z",
  evidence: { externalUpdateId: `u-${articleId}`, originalAssetUri: null, checksum: null },
});

/**
 * UM SERVIDOR QUE SEGURA A RESPOSTA ATÉ MANDARMOS SOLTAR.
 *
 * É o que permite reproduzir "leitura de A em voo enquanto o usuário vai para
 * B". Com respostas imediatas, a janela do defeito nunca se abre e o teste
 * passaria sem exercer nada.
 */
function servidorControlado() {
  const pendentes: Array<{ url: string; soltar: () => void }> = [];
  const chamadas: Array<{ url: string; method: string }> = [];
  const original = globalThis.fetch;
  let segurar = false;

  const corpoPara = (url: string) => {
    const artigo = new URL(url, "http://local").searchParams.get("articleId") || "";
    if (url.includes("/expert-consultations")) return { consultations: [], botUsername: "bot" };
    return {
      experts: [expert],
      bindings: [{ expertId, status: "active" }],
      briefs: [pautaDe(artigo)],
      contributions: [contribuicaoDe(artigo, `resposta do ${artigo}`)],
    };
  };

  globalThis.fetch = (async (entrada: unknown, init?: { method?: string }) => {
    const url = String(entrada);
    chamadas.push({ url, method: init?.method || "GET" });
    const resposta = { ok: true, json: async () => corpoPara(url) };
    if (!segurar) return resposta;
    return new Promise(resolve => { pendentes.push({ url, soltar: () => resolve(resposta) }); });
  }) as unknown as typeof globalThis.fetch;

  return {
    chamadas,
    pendentes,
    segurarRespostas: () => { segurar = true; },
    liberarRespostas: () => { segurar = false; },
    soltarTodas: async () => {
      const lista = [...pendentes];
      pendentes.length = 0;
      for (const item of lista) item.soltar();
      await new Promise(resolve => setTimeout(resolve, 0));
    },
    leiturasDe: (articleId: string) => chamadas.filter(item => item.url.includes(`articleId=${articleId}`)).length,
    restaurar: () => { globalThis.fetch = original; },
  };
}

async function montarCom(articleId: string) {
  const srv = servidorControlado();
  const tela = await montarRadar();
  const { RadarExpertBriefPanel } = await import("../modules/radar/radar-expert-brief-panel.tsx");
  const pintar = async (artigo: string) => {
    await tela.render(comProductShell(React.createElement(RadarExpertBriefPanel, {
      brandId, articleId: artigo, articleDnaVersionId,
      articleTitle: `Artigo ${artigo}`, articleVersion: "v1", articleRole: "pilar",
      context: contextoDe(artigo), requirements: [requisito],
      onExpertEvidenceChange: () => {},
    })));
  };
  await pintar(articleId);
  return { tela, srv, pintar };
}

/* ============ §9 · o caso crítico: troca com leitura em voo ========= */

test("LIVE_21 · resposta tardia do artigo A não aparece no artigo B", async () => {
  const { tela, srv, pintar } = await montarCom("artigo-A");
  try {
    assert.ok(tela.text().includes("resposta do artigo-A"), "A carregou");

    /* A leitura de A fica presa no ar. */
    srv.segurarRespostas();
    await tela.click("radar-specialist-refresh");
    assert.ok(srv.pendentes.length > 0, "há leitura de A em voo");

    /* O usuário troca para B, e B responde normalmente. */
    srv.liberarRespostas();
    await pintar("artigo-B");
    assert.ok(tela.text().includes("resposta do artigo-B"), "B carregou");

    /* Só então a leitura de A chega — atrasada, e para o artigo errado. */
    await srv.soltarTodas();
    await tela.render(comProductShell(React.createElement(
      (await import("../modules/radar/radar-expert-brief-panel.tsx")).RadarExpertBriefPanel,
      { brandId, articleId: "artigo-B", articleDnaVersionId, articleTitle: "Artigo artigo-B", articleVersion: "v1", articleRole: "pilar", context: contextoDe("artigo-B"), requirements: [requisito], onExpertEvidenceChange: () => {} },
    )));

    /* ARTICLE_SWITCH_STALE_RESPONSE_PROTECTED — o teste que faltava. */
    assert.ok(!tela.text().includes("resposta do artigo-A"), "a resposta de A foi descartada");
    assert.ok(tela.text().includes("resposta do artigo-B"), "B continua íntegro");
  } finally {
    tela.destroy();
    srv.restaurar();
  }
});

test("LIVE_21 · voltar ao artigo A mostra o cache de A, não o de B", async () => {
  const { tela, srv, pintar } = await montarCom("artigo-A");
  try {
    await pintar("artigo-B");
    assert.ok(tela.text().includes("resposta do artigo-B"));

    await pintar("artigo-A");
    /* O cache por chave responde na hora, e responde pelo artigo certo. */
    assert.ok(tela.text().includes("resposta do artigo-A"));
    assert.ok(!tela.text().includes("resposta do artigo-B"), "nada do outro artigo sobra");
  } finally {
    tela.destroy();
    srv.restaurar();
  }
});

test("LIVE_21 · o cache pinta ANTES da rede responder", async () => {
  /*
   * O TESTE QUE FALTAVA — §3, "usar cache conhecido imediatamente".
   *
   * Com o servidor respondendo na hora, a área aparece de qualquer jeito: o
   * cache e a rede chegam juntos, e um teste assim passa mesmo sem cache
   * nenhum. Provado por mutação — apagar a leitura do cache não quebrava nada.
   *
   * Segurando a resposta, só o cache pode pintar. Se ele não existisse, a área
   * voltaria vazia enquanto a leitura estivesse em voo.
   */
  const { tela, srv, pintar } = await montarCom("artigo-A");
  try {
    await pintar("artigo-B");
    assert.ok(tela.text().includes("resposta do artigo-B"));

    /* Nada mais volta da rede a partir daqui. */
    srv.segurarRespostas();
    await pintar("artigo-A");

    assert.ok(srv.pendentes.length > 0, "a revalidação está em voo, sem ter respondido");
    assert.ok(tela.text().includes("resposta do artigo-A"), "o cache pintou sem esperar a rede");
    assert.ok(!tela.text().includes("Nenhuma resposta recebida."), "não piscou para vazio");

    /*
     * E NÃO É "CARREGANDO" — é revalidação.
     *
     * Voltar para uma área já conhecida com a tela dizendo "Carregando…" é a
     * mesma experiência de não ter cache nenhum. A distinção entre primeira
     * leitura e releitura é o que faz o cache valer alguma coisa para quem olha,
     * e era o que a mutação de `guardado` apagava sem quebrar mais nada.
     */
    assert.ok(!tela.text().includes("Carregando especialistas"), "com cache, a área não volta ao estado de carga");
  } finally {
    srv.liberarRespostas();
    tela.destroy();
    srv.restaurar();
  }
});

/* ============== §15 C · dois sinais próximos, uma leitura ========== */

test("LIVE_21 · dois pedidos de releitura seguidos não viram duas leituras", async () => {
  const { tela, srv } = await montarCom("artigo-A");
  try {
    const antes = srv.leiturasDe("artigo-A");

    /*
     * `doubleClick` dispara os dois dentro do mesmo tique — que é como os
     * eventos do Realtime chegam quando uma contribuição de áudio entra: a
     * contribuição, a mudança de estado da pauta e o job, em sequência.
     */
    await tela.doubleClick("radar-specialist-refresh");

    const novas = srv.leiturasDe("artigo-A") - antes;
    /* Cada releitura são 2 GET (briefs + consultations); uma só releitura. */
    assert.equal(novas, 2, `esperava uma releitura coalescida, houve ${novas / 2}`);
  } finally {
    tela.destroy();
    srv.restaurar();
  }
});

/* ============== §15 E/F · a aba escondida e a volta =============== */

function definirVisibilidade(valor: "visible" | "hidden") {
  const doc = (globalThis as unknown as { document: Document }).document;
  Object.defineProperty(doc, "visibilityState", { value: valor, configurable: true });
  doc.dispatchEvent(new (globalThis as unknown as { Event: typeof Event }).Event("visibilitychange"));
}

test("LIVE_21 · voltar para a aba dispara uma revalidação da área", async () => {
  const { tela, srv } = await montarCom("artigo-A");
  try {
    const antes = srv.leiturasDe("artigo-A");

    definirVisibilidade("hidden");
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(srv.leiturasDe("artigo-A"), antes, "escondida não lê nada");

    definirVisibilidade("visible");
    await new Promise(resolve => setTimeout(resolve, 20));

    /*
     * UMA revalidação, não várias. Alternar a aba não pode acumular leituras —
     * nem multiplicar temporizadores, que é o que o §12 proíbe.
     */
    const depois = srv.leiturasDe("artigo-A") - antes;
    assert.equal(depois, 2, `esperava uma revalidação (2 GET), houve ${depois / 2}`);
  } finally {
    definirVisibilidade("visible");
    tela.destroy();
    srv.restaurar();
  }
});

test("LIVE_21 · alternar a aba várias vezes não acumula leituras por alternância", async () => {
  const { tela, srv } = await montarCom("artigo-A");
  try {
    const antes = srv.leiturasDe("artigo-A");

    for (let volta = 0; volta < 3; volta += 1) {
      definirVisibilidade("hidden");
      await new Promise(resolve => setTimeout(resolve, 0));
      definirVisibilidade("visible");
      await new Promise(resolve => setTimeout(resolve, 20));
    }

    /* Três voltas, três revalidações — nunca mais do que isso. */
    const leituras = (srv.leiturasDe("artigo-A") - antes) / 2;
    assert.ok(leituras <= 3, `alternar acumulou leituras: ${leituras}`);
  } finally {
    definirVisibilidade("visible");
    tela.destroy();
    srv.restaurar();
  }
});

/* ================ §13 · o banco continua sendo a autoridade ========= */

test("LIVE_21 · remontar do zero reconstrói o mesmo estado pelo read-model", async () => {
  const { tela, srv } = await montarCom("artigo-A");
  try {
    const antesDoF5 = tela.all("radar-specialist-entry").length;
    assert.equal(antesDoF5, 1);

    /* Desmontar e montar de novo é o que o F5 faz com o componente. */
    tela.destroy();
    const segunda = await montarRadar();
    const { RadarExpertBriefPanel } = await import("../modules/radar/radar-expert-brief-panel.tsx");
    await segunda.render(comProductShell(React.createElement(RadarExpertBriefPanel, {
      brandId, articleId: "artigo-A", articleDnaVersionId,
      articleTitle: "Artigo A", articleVersion: "v1", articleRole: "pilar",
      context: contextoDe("artigo-A"), requirements: [requisito],
      onExpertEvidenceChange: () => {},
    })));

    assert.equal(segunda.all("radar-specialist-entry").length, antesDoF5, "o mesmo estado, vindo do read-model");
    assert.ok(segunda.text().includes("resposta do artigo-A"));
    segunda.destroy();
  } finally {
    srv.restaurar();
  }
});
