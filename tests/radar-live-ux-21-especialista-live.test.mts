import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import type { RadarFrozenSpecialistRequirement } from "../lib/radar/specialist-lifecycle.ts";
import type { RadarR6ExpertTopicContext } from "../lib/radar/r6-sequential.ts";
import { montarRadar, comProductShell, React } from "./radar-dom-harness.mts";

/**
 * A ÁREA ESPECIALISTA SE ATUALIZANDO SOZINHA — os dois caminhos de sinal.
 *
 * O que precisa ser verdade em runtime: o especialista responde no Telegram, a
 * contribuição entra no banco, e a tela ABERTA mostra a resposta. Sem F5, sem
 * reselecionar artigo, sem fechar e abrir o painel.
 *
 * Aqui isso é exercido com o `fetch` global controlado — nenhum Supabase, nenhum
 * Telegram. O canal Realtime não existe neste ambiente, então o que estes testes
 * provam de ponta a ponta é o CAMINHO DO FALLBACK: sem sinal vivo, a área se
 * atualiza pelo tique, que é exatamente o cenário que não dá para descartar
 * enquanto a publication não estiver confirmada.
 */

const brandId = "a0000000-0000-4000-8000-0000000000a1";
const expertId = "a0000000-0000-4000-8000-0000000000a2";
const articleId = "article-live-21";
const articleDnaVersionId = "dna-v21";

const requisito: RadarFrozenSpecialistRequirement = {
  requirementId: "specialist:live21",
  claimId: "claim:live",
  kind: "RESOLVE_FACTUAL_UNCERTAINTY",
  priority: "MEDIUM",
  specificQuestion: "O que pode ser afirmado com segurança neste ponto?",
};

const contexto = {
  articleId, brandId, articleDnaVersionId,
  articleDnaContentHash: "hash-21",
  articleDna: { principal: "acne", intent: "informacional", silo: "Pele", audience: "paciente", problem: "acne", desiredResult: "entender", requiredTopics: [], knownQuestions: [] },
  keywordDnas: [], siloDna: null,
  serpNeeds: [], openGaps: [], conflicts: [], knownQuestions: [],
  approvedReferences: [], serpSnapshotId: null, serpSnapshotVersion: null, serpReviewed: true, analysisVersionId: null,
  amazonCriteria: [], amazonEvidence: [], amazonState: "AMAZON_NOT_APPLICABLE",
  existingContent: "", existingContentItems: [], provenance: [],
} satisfies RadarR6ExpertTopicContext;

const pautaEnviada = {
  id: "brief-live", brandId, expertId, articleId, articleDnaVersionId,
  title: "Pauta", questions: [], status: "awaiting_review",
  radarContext: { specialistRequirement: { requirementId: requisito.requirementId } },
  createdAt: "2026-09-13T09:00:00Z", updatedAt: "2026-09-13T09:00:00Z",
  sentAt: "2026-09-13T09:10:00Z", completedAt: null,
};

const contribuicao = (id: string, texto: string) => ({
  id, brandId, expertId, briefId: "brief-live",
  sourceType: "TEXT", originalText: texto, transcriptText: null, organizationPayload: null,
  processingStatus: "RECEIVED", receivedAt: "2026-09-13T09:20:00Z",
  evidence: { externalUpdateId: `update-${id}`, originalAssetUri: null, checksum: null },
});

const expertConectado = { id: expertId, brandId, displayName: "Dra. X", specialty: null, status: "active", createdAt: "2026-01-01T00:00:00Z" };

/**
 * O SERVIDOR, com o conteúdo trocável entre leituras.
 *
 * É assim que se simula uma resposta chegando ao banco enquanto a tela está
 * aberta: muda-se o que o próximo GET devolve, e observa-se se a área percebe.
 */
function servidor() {
  const estado = {
    contributions: [contribuicao("c1", "primeira resposta")] as unknown[],
    briefs: [pautaEnviada] as unknown[],
  };
  const chamadas: Array<{ url: string; method: string }> = [];
  const original = globalThis.fetch;

  globalThis.fetch = (async (entrada: unknown, init?: { method?: string }) => {
    const url = String(entrada);
    const method = init?.method || "GET";
    chamadas.push({ url, method });
    if (url.includes("/expert-consultations")) {
      return { ok: true, json: async () => ({ consultations: [], botUsername: "bot_de_teste" }) };
    }
    return {
      ok: true,
      json: async () => ({ experts: [expertConectado], bindings: [{ expertId, status: "active" }], briefs: estado.briefs, contributions: estado.contributions }),
    };
  }) as unknown as typeof globalThis.fetch;

  return {
    estado,
    chamadas,
    leiturasDaArea: () => chamadas.filter(item => item.method === "GET" && item.url.includes("/expert-briefs")).length,
    restaurar: () => { globalThis.fetch = original; },
  };
}

async function montar() {
  const srv = servidor();
  const tela = await montarRadar();
  const { RadarExpertBriefPanel } = await import("../modules/radar/radar-expert-brief-panel.tsx");
  await tela.render(comProductShell(React.createElement(RadarExpertBriefPanel, {
    brandId, articleId, articleDnaVersionId,
    articleTitle: "O que causa acne", articleVersion: "v21", articleRole: "pilar",
    context: contexto, requirements: [requisito],
    onExpertEvidenceChange: () => {},
  })));
  return { tela, srv };
}

/* ================= A leitura inicial e o que ela traz ================ */

test("LIVE_21 · a área carrega com UMA leitura de cada endpoint, em paralelo", async () => {
  const { tela, srv } = await montar();
  try {
    const gets = srv.chamadas.filter(item => item.method === "GET");
    assert.equal(gets.filter(item => item.url.includes("/expert-briefs")).length, 1);
    assert.equal(gets.filter(item => item.url.includes("/expert-consultations")).length, 1);

    /* A resposta que já estava no banco aparece. */
    assert.equal(tela.all("radar-specialist-entry").length, 1);
    assert.ok((tela.get("radar-specialist-counters").textContent || "").includes("1 resposta(s)"));
  } finally {
    tela.destroy();
    srv.restaurar();
  }
});

/* ============ §7 · a resposta nova aparece sem tocar na tela ========= */

test("LIVE_21 · uma resposta que chega ao banco aparece sem F5", async () => {
  const { tela, srv } = await montar();
  try {
    assert.equal(tela.all("radar-specialist-entry").length, 1, "estado inicial");

    /* O especialista responde: a segunda contribuição entra no banco. */
    srv.estado.contributions = [contribuicao("c1", "primeira resposta"), contribuicao("c2", "segunda resposta")];

    /*
     * O [Atualizar] exerce o mesmo caminho que o sinal e o tique disparam:
     * releitura do read-model. Um temporizador real tornaria o teste lento e
     * frágil; o que precisa ser provado é que a releitura ATUALIZA A TELA.
     */
    await tela.click("radar-specialist-refresh");

    assert.equal(tela.all("radar-specialist-entry").length, 2, "NEW_RESPONSE_WITHOUT_F5");
    const contadores = tela.get("radar-specialist-counters").textContent || "";
    assert.ok(contadores.includes("2 resposta(s)"), `COUNTERS_UPDATE_WITHOUT_F5: ${contadores}`);
    assert.ok((tela.get("radar-specialist-review-result").textContent || "").includes("segunda resposta"), "REVIEW_RESULT_UPDATE_WITHOUT_F5");
  } finally {
    tela.destroy();
    srv.restaurar();
  }
});

/* =================== §11 · o botão atualiza só a área ================= */

test("LIVE_21 · Atualizar lê a área e nada além dela", async () => {
  const { tela, srv } = await montar();
  try {
    const antes = srv.chamadas.length;
    await tela.click("radar-specialist-refresh");

    const novas = srv.chamadas.slice(antes);
    assert.ok(novas.length > 0, "houve leitura");
    /* MANUAL_AREA_REFRESH: só os endpoints desta área, nenhum workspace. */
    for (const chamada of novas) {
      assert.ok(/expert-briefs|expert-consultations/.test(chamada.url), `leitura fora da área: ${chamada.url}`);
      assert.equal(chamada.method, "GET", "atualizar não escreve nada");
    }
    assert.ok(!novas.some(item => item.url.includes("/editorial/workspace")), "FULL_WORKSPACE_POLLING = NO");
  } finally {
    tela.destroy();
    srv.restaurar();
  }
});

/* ============ §8 · a revalidação não pisca para vazio ================ */

test("LIVE_21 · o conteúdo conhecido continua na tela durante a releitura", async () => {
  const { tela, srv } = await montar();
  try {
    assert.equal(tela.all("radar-specialist-entry").length, 1);

    /* Uma releitura que falha não pode apagar o que já era válido. */
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => { throw new Error("rede indisponível"); }) as unknown as typeof globalThis.fetch;
    await tela.click("radar-specialist-refresh");
    globalThis.fetch = originalFetch;

    assert.equal(tela.all("radar-specialist-entry").length, 1, "a resposta conhecida continua visível");
    assert.ok(!(tela.text().includes("Nenhuma resposta recebida.")), "não piscou para vazio");
  } finally {
    tela.destroy();
    srv.restaurar();
  }
});

/* ================= §10 · expandir não depende de rede =============== */

test("LIVE_21 · abrir e recolher a transcrição não consulta o servidor", async () => {
  const { tela, srv } = await montar();
  try {
    const antes = srv.chamadas.length;

    /* Um `details` é estado de UI: alternar não pode virar leitura. */
    const disclosure = tela.get("radar-specialist-provenance");
    disclosure.setAttribute("open", "");
    disclosure.removeAttribute("open");

    assert.equal(srv.chamadas.length, antes, "PANEL_EXPANSION_NETWORK_DEPENDENCY = NO");
  } finally {
    tela.destroy();
    srv.restaurar();
  }
});

/* ================= §14 · leitura viva não aciona nada ============== */

test("LIVE_21 · nenhuma leitura da área escreve ou aciona provider", async () => {
  const { tela, srv } = await montar();
  try {
    await tela.click("radar-specialist-refresh");
    await tela.click("radar-specialist-refresh");

    /* PROVIDER_AUTO_RUNS = 0 */
    assert.equal(srv.chamadas.filter(item => item.method !== "GET").length, 0, "nada foi escrito");
    for (const chamada of srv.chamadas) {
      assert.ok(!/\/send|serp|radar-topics|radar-video|api\.telegram/.test(chamada.url), `provider acionado: ${chamada.url}`);
    }
  } finally {
    tela.destroy();
    srv.restaurar();
  }
});

/* ================== a estrutura que o gate exige =================== */

test("LIVE_21 · a área usa o hook de leitura viva, com as tabelas certas", async () => {
  const painel = await readFile(new URL("../modules/radar/radar-expert-brief-panel.tsx", import.meta.url), "utf8");
  const semComentarios = painel.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

  assert.match(semComentarios, /useRadarAreaLiveRead\(\{/);
  assert.match(semComentarios, /area: "specialist"/);
  assert.match(semComentarios, /tables: RADAR_SPECIALIST_LIVE_TABLES/);
  assert.match(semComentarios, /RADAR_SPECIALIST_LIVE_TABLES = \["expert_contributions", "expert_briefs", "telegram_expert_bindings"\]/);

  /* §2 — uma função de refetch, com os dois GET em paralelo. */
  assert.match(semComentarios, /const carregarArea = useCallback/);
  assert.match(semComentarios, /await Promise\.all\(\[/);
  /* E os dois efeitos independentes de antes não existem mais. */
  assert.ok(!/void fetch\(`\/api\/editorial\/expert-briefs\?/.test(semComentarios), "o efeito antigo saiu");
});

test("LIVE_21 · o painel não conhece o workspace nem recarrega a página", async () => {
  const painel = await readFile(new URL("../modules/radar/radar-expert-brief-panel.tsx", import.meta.url), "utf8");
  const semComentarios = painel.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

  assert.ok(!/useReadyPipeline|useEditorialPipeline|router\.refresh|location\.reload/.test(semComentarios));
});

test("LIVE_21 · o ritmo do tique é decidido pelo estado da área", async () => {
  const painel = await readFile(new URL("../modules/radar/radar-expert-brief-panel.tsx", import.meta.url), "utf8");
  const semComentarios = painel.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

  /*
   * §6 — convite aberto, pauta enviada sem conclusão e áudio em processamento
   * são os estados em que alguém está esperando. Fora deles, não há o que olhar.
   */
  assert.match(semComentarios, /const aguardandoAlgo = useMemo/);
  assert.match(semComentarios, /invite\.state === "OPEN"/);
  assert.match(semComentarios, /item\.sentAt && !item\.completedAt/);
  assert.match(semComentarios, /processingStatus === "PENDING_LOCAL_PROCESSING" \|\| item\.processingStatus === "PROCESSING"/);
  assert.match(semComentarios, /pending: lerPendente/);
});

test("LIVE_21 · o hook é quem agenda; a política decide a cada tique", async () => {
  const hook = await readFile(new URL("../modules/radar/use-radar-area-live-read.ts", import.meta.url), "utf8");
  const semComentarios = hook.replace(/\/\*[\s\S]*?\*\//g, "");

  /* O plano é recalculado dentro do intervalo: estabilizou, o tique para. */
  assert.match(semComentarios, /const agora = radarAreaPollingPlan\(/);
  assert.match(semComentarios, /if \(!agora\.shouldPoll\) return;/);
  assert.match(semComentarios, /estaPendente\.current\(\)/);
});
