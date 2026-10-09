import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

/*
 * ====== 2026-10-08 · TODAS AS CANDIDATAS FALHAM E A AMOSTRA ESTÁ VAZIA — NA TELA INTEIRA ======
 *
 * O dono: "Analisar concorrência · e finaliza (+ 1 chamada de IA)" parava e
 * mandava "revisar", sem dizer onde. A revisão achou o caso mais duro: nenhuma
 * página na amostra e TODAS as candidatas da rodada recusadas (403, PDF…). A
 * análise lançava antes de gravar qualquer coisa — as falhas não chegavam ao
 * banco, as referências continuavam pendentes e cada clique relia tudo para
 * terminar na mesma frase.
 *
 * Aqui o RadarPage real é montado (marca, sessão e mesa por fixture, como em
 * `radar-tela-render-dom.test.mts`), o botão da Fase 1 é clicado e a rota de
 * extração responde 403 para cada candidata. O que precisa acontecer:
 *
 *   · a versão da amostra é gravada com TODAS as falhas, sem carimbo;
 *   · nada é consolidado (nenhuma verificação de fonte, nenhuma 2ª escrita);
 *   · a frase diz o motivo, a área e o botão que a Fase 1 relida oferece.
 *
 * Nenhuma rede: só a rota de extração responde (com recusa); o resto é
 * recusado. PROVIDER_CALLS = 0.
 */

register("./stubs/radar-tela-hooks.mjs", import.meta.url, { data: { stubs: ["navegacao", "mesa"] } });

type Corpo = { candidates?: Array<{ key?: string; url?: string; source?: string; referenceId?: string }>; analysis?: { payload?: { deepResearch?: { researchCuration?: { references?: Array<{ referenceId: string; url: string }> } } } } };
const chamadas: string[] = [];
const extracoes: Array<{ key: string; url: string }> = [];
Object.defineProperty(globalThis, "fetch", {
  value: async (entrada: unknown, init?: { body?: unknown }) => {
    const alvo = String(entrada);
    chamadas.push(alvo);
    if (alvo !== "/api/editorial/radar-analysis/extract") throw new Error("REDE PROIBIDA");
    /* A "autoridade do servidor": a URL de cada referência sai da curadoria gravada, como na rota real. */
    const corpo = JSON.parse(String(init?.body || "{}")) as Corpo;
    const referencias = corpo.analysis?.payload?.deepResearch?.researchCuration?.references || [];
    const errors = (corpo.candidates || []).map(candidata => {
      const key = candidata.source === "research" ? candidata.referenceId || "" : candidata.key || "";
      const url = candidata.source === "research" ? referencias.find(ref => ref.referenceId === candidata.referenceId)?.url || "" : candidata.url || "";
      extracoes.push({ key, url });
      return { key, error: { url, code: "access_blocked", message: "Acesso negado (403)", status: 403 } };
    });
    return new Response(JSON.stringify({ pages: [], errors }), { status: 200, headers: { "content-type": "application/json" } });
  },
  writable: true, configurable: true,
});

const harness = await import("./radar-dom-harness.mts");
const React = harness.React;
const { montarMesa, MARCA } = await import("./radar-tela-render-fixtures.mts");

/* Um artigo com a pesquisa feita e a curadoria automática confirmada, e NENHUMA página na amostra. */
const mesa = montarMesa({ total: 2, analisados: 1, soSerp: 0 });
type Item = Record<string, unknown> & { articleId: string; analysisVersions: Array<{ versionNumber: number; payload: Record<string, unknown> }> };
const itemVazio = (() => {
  const item = mesa.radarItems[0] as Item;
  return { ...item, analysisVersions: item.analysisVersions.filter(versao => versao.versionNumber === 1) };
})();
assert.equal((itemVazio.analysisVersions[0].payload.extractions as unknown[]).length, 0, "fixture: amostra vazia");

const ATOR = "11111111-2222-4333-8444-555555555555";
const brandRef = `adalbapro--${MARCA}`;
type Mesa = Record<string, unknown> & { radarItems: Item[] };
let pipeline: Mesa;
const ouvintes = new Set<() => void>();
const store = {
  get: () => pipeline,
  subscribe: (ouvinte: () => void) => { ouvintes.add(ouvinte); return () => { ouvintes.delete(ouvinte); }; },
  set: (mudanca: Partial<Mesa>) => { pipeline = { ...pipeline, ...mudanca } as Mesa; ouvintes.forEach(ouvinte => ouvinte()); },
};
const nada = () => undefined;
const nadaAsync = async () => undefined;
const gravadas: Array<{ versionNumber: number; payload: Record<string, unknown> }> = [];
const itemDe = (articleId: string) => pipeline.radarItems.find(item => item.articleId === articleId)!;
pipeline = {
  radarItems: [itemVazio, mesa.radarItems[1] as Item], serpRecords: mesa.serpRecords, serpReviews: [], serpMergeConflicts: [],
  articleVersions: mesa.articleVersions, siloVersions: mesa.siloVersions, siloPageVersions: {}, versionEvents: [],
  operationalPublications: [], publications: [], productEvidence: [], documents: {}, documentLocks: {}, invitations: [], backgroundTasks: [], moduleState: {},
  snapshot: { keywords: mesa.keywords, silos: mesa.silos, marca: { id: MARCA } },
  loading: false, error: null, localRecoveryWarning: null, serpReviewReadbackSnapshotIds: [],
  loadDiagnostics: { state: "complete", loadedCount: 2, incompatible: [] }, persistenceMode: "server", serpPersistenceMode: "server",
  reload: nadaAsync, reloadOperational: nadaAsync, reloadRadarAnalysis: nadaAsync, reloadSerpReview: nadaAsync,
  restoreOperationalSnapshot: nada,
  /* A gravação confirma com readback, como o servidor real faria — e a mesa recebe a versão. */
  saveRadarAnalysis: async (articleId: string, versao: { versionNumber: number; payload: Record<string, unknown> }) => {
    gravadas.push(versao);
    store.set({ radarItems: pipeline.radarItems.map(item => item.articleId === articleId ? { ...item, analysisVersions: [...item.analysisVersions, versao] } : item) });
    return { persistenceMode: "remote", readbackConfirmed: true };
  },
  readRemoteRadarAnalyses: async (articleId: string) => ({ available: true, analyses: itemDe(articleId).analysisVersions, lockVersion: 4, reason: null }),
  updateRadarState: nadaAsync, reviewSerp: nadaAsync, recoverSerp: nadaAsync, importApprovedToRadar: nadaAsync, collectSerp: nadaAsync, collectAuxiliarySerp: nadaAsync,
};
(globalThis as Record<string, unknown>).__radarTela = {
  React, store,
  pathname: `/${brandRef}/radar`,
  brand: { selectedBrandId: MARCA, setSelectedBrandId: nada, brands: [], refreshBrands: nadaAsync, activeBrand: null, activeBrandRef: brandRef, loading: false, userRole: "owner", profileLoading: false },
  session: { data: { user: { id: ATOR, email: "dono@exemplo.test", name: "Dono", image: null } }, status: "authenticated", actorUserId: ATOR, sessionEpoch: 1, setPresentationOverride: nada, signOut: nadaAsync },
};

const { RadarPage } = await import("../modules/radar/radar-page.tsx");
const { GlobalNoticeProvider, useNoticeCenter } = await import("../components/global-notice-center.tsx");
const { GlobalTopbarControlsProvider } = await import("../components/global-topbar.tsx");

let avisos: string[] = [];
function LeitorDeAvisos() {
  const { notices } = useNoticeCenter();
  avisos = notices.map(aviso => aviso.message);
  return null;
}
const tela = await harness.montarRadar();
const arvore = harness.comProductShell(
  React.createElement(GlobalNoticeProvider, null,
    React.createElement(GlobalTopbarControlsProvider, null,
      React.createElement(LeitorDeAvisos),
      React.createElement(RadarPage, { brandRef }))));
const act = (fazer: () => void | Promise<void>) => React.act(async () => { await fazer(); });
const esperar = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

test("amostra vazia e todas as candidatas recusadas: as falhas são gravadas, nada é consolidado, e a frase diz onde continuar", async () => {
  await tela.render(arvore);
  await act(() => esperar(30));
  const linha = tela.container.querySelector(`section[aria-label='Planilha radar'] tbody tr[tabindex]`) as HTMLElement;
  await act(() => { (linha.querySelector("td:nth-child(4)") as HTMLElement).click(); });

  const botao = tela.get("radar-deep-research-button");
  assert.equal(botao.getAttribute("data-action-id"), "ANALYZE_COMPETITION");
  /* 2026-10-09 (correção) · o teto real do custo no rótulo. */
  assert.equal(botao.textContent, "Analisar concorrência · e finaliza (+ até 2 chamadas de IA)");

  await act(() => { botao.click(); });
  for (let espera = 0; espera < 100 && !avisos.some(aviso => aviso.startsWith("Não finalizou sozinha")) && !avisos.some(aviso => /Nenhuma das/.test(aviso)); espera += 1) {
    await act(() => esperar(50));
  }

  const selecionadas = new Set(extracoes.map(item => item.url)).size;
  assert.ok(selecionadas > 0, "a análise não chegou a pedir nenhuma página");

  /* 1 · A amostra foi gravada com TODAS as falhas, sem carimbo — antes a rodada lançava e nada chegava ao banco. */
  assert.equal(gravadas.length, 1, `esperava 1 gravação (a da amostra com as falhas), vieram ${gravadas.length}`);
  const versao = gravadas[0].payload as { extractions: unknown[]; extractionFailures: Array<{ url: string; code: string }>; analysisCompletedAt: string | null };
  assert.equal(versao.extractions.length, 0);
  assert.equal(versao.extractionFailures.length, selecionadas, "cada candidata recusada é uma limitação declarada");
  assert.ok(versao.extractionFailures.every(falha => falha.code === "access_blocked"));
  assert.equal(versao.analysisCompletedAt, null, "sem página, nada é consolidado nem carimbado");

  /* 2 · Nada é consolidado: nenhuma verificação de fonte, nenhuma escrita de autoridade. */
  assert.equal(chamadas.some(alvo => alvo.includes("verify-sources")), false);

  /* 3 · A frase: o motivo, a área e o botão que a Fase 1 relida oferece — que é o que a tela mostra agora. */
  const frase = avisos.find(aviso => aviso.startsWith("Não finalizou sozinha"));
  assert.ok(frase, `a frase de parada não apareceu: ${JSON.stringify(avisos)}`);
  assert.match(frase, new RegExp(`nenhuma das ${selecionadas} página\\(s\\) pendente\\(s\\) pôde ser analisada`));
  assert.match(frase, /Para continuar, na área Pesquisa, botão "Refazer Pesquisa Google"\.$/);
  await act(() => esperar(30));
  const depois = tela.get("radar-deep-research-button");
  assert.equal(depois.textContent, "Refazer Pesquisa Google", "o botão nomeado é o que a tela mostra");

  /* 4 · A referência deixou de ser pendente: um novo clique não repete a mesma leitura em laço. */
  assert.notEqual(depois.getAttribute("data-action-id"), "ANALYZE_COMPETITION");
});

test("nenhuma chamada a provider: a rede só viu a rota de extração e leituras recusadas da própria API", () => {
  for (const alvo of chamadas) assert.match(alvo, /^\/api\//, `rede fora da API local: ${alvo}`);
  tela.destroy();
});
