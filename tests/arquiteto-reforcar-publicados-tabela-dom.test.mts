/**
 * REFORÇAR PUBLICADOS · A TABELA ÚNICA RENDERIZADA (pedido do dono, 2026-09-28).
 *
 * "Não notei nenhuma diferença, e não está claro como reforçar." O teste
 * estrutural lê o fonte; este RENDERIZA a tabela (react-dom/server, sem
 * navegador e sem rede) e confere o que o dono vê: a frase da regra, um botão
 * só ("Gravar reforços (N)"), uma linha por publicado e Assunto, as caixinhas
 * marcadas certas (Forte de qualquer Silo sim, Provável não), a mesma keyword
 * num publicado só, o volume antes → depois e, depois de gravar, o total novo.
 *
 * Roda com o loader que transpila TSX (`test:arquiteto:dom`).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { AnchorSerpDiagnosis } from "../lib/arquiteto/serp-subject-diagnosis.ts";
import { serpSubjectCardView, type SerpSubjectCardView } from "../modules/arquiteto/serp-subject-model.ts";
import {
  PUBLISHED_REINFORCEMENT_TABLE_LINE,
  reinforcementDefaultPicks,
  reinforcementDefaultSearchPicks,
  reinforcementSuggestionOwners,
  reinforcementTableRows,
  sortReinforcementRows,
} from "../modules/arquiteto/published-reinforcement-model.ts";
import { PublishedReinforcementTable } from "../modules/arquiteto/published-reinforcement-panel.tsx";
import type { PublishedReinforcementController } from "../modules/arquiteto/use-published-reinforcement.ts";

let chamadasDeRede = 0;
globalThis.fetch = (async () => {
  chamadasDeRede += 1;
  throw new Error("rede proibida nos testes");
}) as typeof fetch;

const sugestao = (keywordId: string, keyword: string, level: "strong" | "probable", over: Record<string, unknown> = {}) => ({
  keywordId, keyword, volume: 20, level, basis: level === "strong" ? "pages" as const : "two_pages" as const, sharedPageCount: level === "strong" ? 7 : 2, sharedDomainCount: 0,
  reason: "", warning: null, where: "leftover" as const, whereLabel: "Keywords não agrupadas",
  siloRef: "silo-1", siloLabel: "Captação", inArticlePrincipalKeywordId: null, preselected: level === "strong", ...over,
});

function diagnostico(over: Partial<AnchorSerpDiagnosis> & { anchorKeywordId: string; anchorLabel: string }): AnchorSerpDiagnosis {
  return {
    kind: "published", siloRef: "silo-1", siloLabel: "Captação", principalKeywordId: over.anchorKeywordId, state: "suggestions_available",
    headline: "", details: [], members: [{ keywordId: over.anchorKeywordId, keyword: over.anchorLabel, basis: "anchor", sharedPageCount: null, reason: "" }],
    slotsLeft: 5, serpEvidence: "complete", swap: null, crossSilo: [], pairsElsewhere: [], blockedByDna: [], publishedOverlaps: [], actions: [], suggestions: [],
    ...over,
  } as AnchorSerpDiagnosis;
}

const VOLUMES: Record<string, { keyword: string; volume: number | null }> = {
  "pub-c": { keyword: "como atrair pacientes para clínica", volume: 10 },
  "pub-o": { keyword: "como atrair clientes para consultório", volume: 40 },
  "kw-a": { keyword: "como atrair pacientes", volume: 20 },
  "kw-b": { keyword: "como atrair mais pacientes", volume: 20 },
  "kw-x": { keyword: "captação de pacientes sem anúncio", volume: 30 },
};

function cartoes(gravado: boolean): SerpSubjectCardView[] {
  const clinica = gravado
    ? serpSubjectCardView(diagnostico({ anchorKeywordId: "pub-c", anchorLabel: VOLUMES["pub-c"].keyword, state: "reinforced", members: [
      { keywordId: "pub-c", keyword: VOLUMES["pub-c"].keyword, basis: "anchor", sharedPageCount: null, reason: "" },
      { keywordId: "kw-a", keyword: VOLUMES["kw-a"].keyword, basis: "serp", sharedPageCount: 7, reason: "" },
      { keywordId: "kw-x", keyword: VOLUMES["kw-x"].keyword, basis: "serp", sharedPageCount: 4, reason: "" },
    ] }), { post: "locked", articleKeywordIds: new Set(["pub-c", "kw-a", "kw-x"]), articlePrincipalKeywordId: "pub-c" })
    : serpSubjectCardView(diagnostico({ anchorKeywordId: "pub-c", anchorLabel: VOLUMES["pub-c"].keyword, suggestions: [
      sugestao("kw-a", VOLUMES["kw-a"].keyword, "strong"),
      sugestao("kw-b", VOLUMES["kw-b"].keyword, "probable"),
      sugestao("kw-x", VOLUMES["kw-x"].keyword, "strong", { volume: 30, sharedPageCount: 4, where: "other_silo", whereLabel: "Silo \"Leads\"", siloRef: "silo-2", siloLabel: "Leads", preselected: false }),
    ] }), { post: "locked", articleKeywordIds: new Set(["pub-c"]), articlePrincipalKeywordId: "pub-c" });
  const consultorio = serpSubjectCardView(diagnostico({ anchorKeywordId: "pub-o", anchorLabel: VOLUMES["pub-o"].keyword, suggestions: [
    sugestao("kw-a", VOLUMES["kw-a"].keyword, "strong", { sharedPageCount: 5 }),
  ] }), { post: "locked", articleKeywordIds: new Set(["pub-o"]) });
  const assunto = serpSubjectCardView(diagnostico({ kind: "subject", anchorKeywordId: "assunto-1", anchorLabel: "estética", suggestions: [sugestao("kw-e", "marketing para estética", "strong")] }), {});
  return [clinica, consultorio, assunto];
}

function controlador(cards: SerpSubjectCardView[], written: ReadonlySet<string>): PublishedReinforcementController {
  const owners = reinforcementSuggestionOwners(cards);
  const aberturas: unknown[] = [];
  return {
    busy: false,
    dialog: { open: false, status: "idle", requested: [], excluded: [], data: null, error: null, notices: [], left: [] },
    search: { status: "idle", plan: null, run: null, error: null, message: null, retryOperationId: null },
    results: new Map(),
    owners,
    outcome: null,
    writtenPageIds: written,
    suggestionPicksOf: (card: SerpSubjectCardView) => reinforcementDefaultPicks(card, owners),
    toggleSuggestion: () => undefined,
    searchPicksOf: (pageId: string) => reinforcementDefaultSearchPicks(pageId, null, owners),
    toggleSearchPick: () => undefined,
    swapAccepted: () => false,
    toggleSwap: () => undefined,
    openReinforcement: async (...args: unknown[]) => { aberturas.push(args); },
    toggleDialogPage: async () => undefined,
    toggleDialogSwap: async () => undefined,
    closeReinforcement: () => undefined,
    applyReinforcement: async () => undefined,
    planSearch: async () => undefined,
    cancelSearch: () => undefined,
    runSearchConfirmed: async () => undefined,
    retrySearch: async () => undefined,
    dismissOutcome: () => undefined,
  } as unknown as PublishedReinforcementController;
}

function renderizar(gravado: boolean) {
  const cards = cartoes(gravado);
  const written = new Set(gravado ? ["pub-c"] : []);
  const controller = controlador(cards, written);
  const linhas = reinforcementTableRows({
    cards,
    keywordOf: id => VOLUMES[id] ?? null,
    suggestionPicksOf: controller.suggestionPicksOf,
    searchPicksOf: controller.searchPicksOf,
    swapAccepted: controller.swapAccepted,
    writtenPageIds: written,
    owners: controller.owners,
  });
  return renderToStaticMarkup(createElement(PublishedReinforcementTable, {
    controller,
    cards,
    rows: sortReinforcementRows(linhas),
    allRows: linhas,
    busy: false,
    renderDetail: () => null,
    onApplySubject: () => undefined,
    buttonClassName: "btn",
    primaryButtonClassName: "btn-primario",
  }));
}

const linhasDaTabela = (html: string) => html.split("data-testid=\"architect-reinforcement-row\"").slice(1);
const texto = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&quot;/g, "\"").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();

test("a tabela renderizada: a regra no topo, um botão só com a conta, cinco colunas e uma linha por publicado e Assunto", () => {
  const html = renderizar(false);
  assert.ok(texto(html).includes(PUBLISHED_REINFORCEMENT_TABLE_LINE));
  assert.equal((html.match(/<table\b/g) || []).length, 1);
  assert.deepEqual([...html.matchAll(/<th scope="col"[^>]*>([^<]+)<\/th>/g)].map(item => item[1]), ["Publicado ou Assunto", "Principal atual", "Keywords sugeridas", "Volume somado", "Estado"]);
  assert.equal(linhasDaTabela(html).length, 3);
  const botao = html.match(/<button[^>]*data-testid="architect-reinforcement-open"[^>]*>([^<]+)<\/button>/);
  assert.ok(botao, "o botão Gravar reforços existe");
  assert.equal(botao[1], "Gravar reforços (1)", "só a clínica tem o que gravar: o consultório já tem o ArticleDNA e a keyword dele ficou com a clínica");
  assert.doesNotMatch(botao[0], /disabled=""/);
  assert.match(texto(html), /1 artigo publicado com algo a gravar \(2 keywords entram\)\. A confirmação mostra, por artigo, o que muda\./);
  assert.equal(chamadasDeRede, 0);
});

test("a tabela renderizada: Forte do mesmo Silo e de outro Silo marcadas, Provável desmarcada; a keyword disputada aparece só na clínica; o volume antes → depois", () => {
  const html = renderizar(false);
  const linhas = linhasDaTabela(html);
  const achar = (nome: string) => linhas.find(linha => linha.includes(`text-keyword">${nome}</span>`))!;
  const [clinica, consultorio, assunto] = [achar("como atrair pacientes para clínica"), achar("como atrair clientes para consultório"), achar("estética")];
  assert.ok(linhas.indexOf(clinica) === 0, "quem tem algo a gravar vem primeiro");
  const caixas = [...clinica.matchAll(/(<input id="[^"]+" type="checkbox"[^>]*\/>)\s*<label[^>]*><span class="font-medium text-keyword">([^<]+)<\/span>/g)].map(item => [item[2], /checked=""/.test(item[1])]);
  assert.deepEqual(caixas, [["como atrair pacientes", true], ["como atrair mais pacientes", false], ["captação de pacientes sem anúncio", true]]);
  assert.match(texto(clinica), /Silo "Leads" \(muda para o deste artigo\)/);
  assert.match(texto(clinica), /1 → 3 keywords volume 10 → 60/);
  assert.match(texto(clinica), /Grava \+2/);
  assert.doesNotMatch(consultorio, /type="checkbox"/, "\"como atrair pacientes\" ficou com a clínica (7 páginas contra 5)");
  assert.match(texto(consultorio), /"como atrair pacientes" está na linha de "como atrair pacientes para clínica"/);
  assert.match(texto(assunto), /Aplicar no Assunto \(1\)/);
});

test("depois de gravar e reler: a linha mostra 'Gravado e relido agora' e o total novo do ArticleDNA", () => {
  const html = renderizar(true);
  const clinica = linhasDaTabela(html).find(linha => linha.includes("como atrair pacientes para clínica"))!;
  assert.match(texto(clinica), /Gravado e relido agora/);
  assert.match(texto(clinica), /3 keywords \(gravado agora\) volume 60/, "o total NOVO do ArticleDNA, não 3 → 3");
  assert.doesNotMatch(texto(clinica), /3 → 3/);
  assert.match(html, /data-pending="false"[^>]*>[\s\S]*Gravado e relido agora/);
  assert.equal(chamadasDeRede, 0);
});
