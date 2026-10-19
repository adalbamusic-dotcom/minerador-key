import assert from "node:assert/strict";
import test from "node:test";
import { comProductShell, montarRadar, React, type RadarDomScreen } from "./radar-dom-harness.mts";

/*
 * O ASSUNTO PELA PRINCIPAL NOS BOTÕES DE SEMPRE (DOM, happy-dom) — SDD
 * `docs/compartilhado/sdd-assunto-pela-principal-e-volume-2026-10-18.md` §14 ("DOM pelos botões") e AGENTS.md §0.3
 * ("teste real é pelos botões que o humano usa"):
 *
 *   - "Aprovar e enviar ao Arquiteto": a prévia mostra a linha "vira o Assunto do artigo (volume 0)" e o resumo; o
 *     clique em "Aprovar e enviar N" manda o MESMO decisionHash;
 *   - o painel do KeywordDNA, bloco "Assunto deste artigo": "Editar Assunto" → "Revisar mudança" (antes → depois, nada
 *     gravado) → "Gravar" (o MESMO pedido com importRequestId) → releitura → "Reaprovar (só a Lógica)";
 *   - volume baixo: "Usar como Assunto do artigo" manda o destino "Keyword (sem Silo)" com a origem "low";
 *   - volume 0 sem Assunto: o painel diz que ele vira o Assunto no "Aprovar e enviar" (não grava nada por aqui).
 *
 * As rotas são simuladas pelo `fetch` do teste (o corpo de cada pedido é conferido). Nada pago, nenhum banco.
 */

const { ApproveAndSendDialog } = await import("../modules/minerador/approve-and-send-dialog.tsx");
const { SubjectArticleEditor, SUBJECT_EDITOR_TEXTS } = await import("../modules/minerador/subject-article-editor.tsx");
const { resolveSubjectArticleView } = await import("../lib/minerador/subject-article-view.ts");

const BRAND = "61d2e019-f44f-4fa3-af2f-d86b95628ab3";
const KW = "aaaa0001-0000-4000-8000-000000000001";
let tela: RadarDomScreen;
let pedidos: Array<{ url: string; body: Record<string, unknown> }>;
let respostas: Array<(body: Record<string, unknown>) => Record<string, unknown>>;
const settle = async (vezes = 15) => { for (let i = 0; i < vezes; i += 1) await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); }); };
const botao = (texto: string) => [...tela.container.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent?.trim() === texto || b.textContent?.trim().endsWith(texto));

test.beforeEach(async () => {
  tela = await montarRadar();
  pedidos = [];
  respostas = [];
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    pedidos.push({ url: String(url), body });
    const proxima = respostas.shift();
    if (!proxima) throw new Error(`pedido inesperado: ${String(url)}`);
    return new Response(JSON.stringify({ success: true, ...proxima(body) }));
  }) as typeof fetch;
});
test.afterEach(() => tela.destroy());

/* ============================================ "Aprovar e enviar ao Arquiteto" */

const PREVIA = {
  send: true,
  lines: [
    { id: KW, keyword: "como atrair pacientes para clínica de estética", currentStatus: "aprovado", action: "approve_and_send", alreadyInArquiteto: true, refreshInArquiteto: true, missing: [], reasons: [], subjectFromVolume: { title: "como atrair pacientes para clínica de estética", details: null, legacy: false } },
    { id: "b", keyword: "como atrair pacientes sem redes sociais", currentStatus: "aprovado", action: "approve_and_send", alreadyInArquiteto: true, refreshInArquiteto: true, missing: [], reasons: [], subjectFromVolume: { title: "como atrair pacientes sem redes sociais", details: "Para clínicas que não querem depender de Instagram.", legacy: true } },
    { id: "c", keyword: "marketing para clínica de estética", currentStatus: "aprovado", action: "unchanged", alreadyInArquiteto: true, missing: [], reasons: [] },
  ],
  counts: { approveAndSend: 2, sendOnly: 0, approveOnly: 0, unchanged: 1, blocked: 0, subjectFromVolume: 2 },
  blockedGroups: [], blockedSummary: "", missingIds: [], decisionHash: "d".repeat(64),
};

test("'Aprovar e enviar': a prévia diz quais viram o Assunto (volume 0), com o título e a nota antiga; confirmar manda o MESMO decisionHash e o resultado diz quantas viraram", async () => {
  respostas.push(() => PREVIA);
  respostas.push(() => ({ send: true, results: [{ id: KW, keyword: "como atrair pacientes para clínica de estética", outcome: "approved_and_sent", reason: null }, { id: "b", keyword: "como atrair pacientes sem redes sociais", outcome: "approved_and_sent", reason: null }], counts: { approved_and_sent: 2, sent: 0, approved: 0, unchanged: 0, approved_not_sent: 0, not_sent: 0, blocked: 0, excluded: 0, stale: 0 }, readbackConfirmed: true, decisionHash: "d".repeat(64), notices: ["2 viram o Assunto do artigo (volume 0): o título nasce do texto da keyword (editável no painel do KeywordDNA); no Arquiteto a principal fica livre para uma com volume, por decisão sua na prévia. URL, slug e canonical não mudam."], subjectFromVolumeIds: [KW, "b"] }));
  let relidas: string[] = [];
  await tela.render(comProductShell(React.createElement(ApproveAndSendDialog, { brandId: BRAND, keywordIds: [KW, "b", "c"], scopeLabel: "cor Verde · 3 keywords", onClose: () => undefined, onApplied: async (ids: string[]) => { relidas = ids; return true; } })));
  await settle();
  assert.equal(pedidos[0].body.mode, "preview");
  const linhas = [...tela.container.querySelectorAll("[data-approve-and-send-subject]")].map(el => el.textContent);
  assert.equal(linhas.length, 2, "as duas linhas de volume 0");
  assert.match(linhas[0] ?? "", /vira o Assunto do artigo \(volume 0\): “como atrair pacientes para clínica de estética”/);
  assert.match(linhas[1] ?? "", /detalhes: Para clínicas que não querem depender de Instagram\. · o Assunto do formato anterior ganha o título/);
  assert.match(tela.container.querySelector("[data-approve-and-send-subject-summary]")?.textContent ?? "", /^2 viram o Assunto do artigo \(volume 0\)/);
  await tela.click(botao("Aprovar e enviar 2")!);
  await settle();
  assert.deepEqual([pedidos[1].body.mode, pedidos[1].body.decisionHash], ["apply", "d".repeat(64)], "o MESMO decisionHash da prévia");
  assert.deepEqual(relidas.sort(), [KW, "b"].sort(), "relê as tocadas");
  assert.match(tela.text(), /2 viram o Assunto do artigo \(volume 0\)/);
  assert.match(tela.text(), /conferido na releitura/);
});

/* ===================== 2026-10-19 · parou no meio: a tela nunca diz "nada foi gravado" quando foi */

function fetchComStatus(fila: Array<{ status: number; body: Record<string, unknown> }>) {
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    pedidos.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : {} });
    const proxima = fila.shift();
    if (!proxima) throw new Error(`pedido inesperado: ${String(url)}`);
    return new Response(JSON.stringify(proxima.body), { status: proxima.status });
  }) as typeof fetch;
}

const PREVIA_SEGURADA = { ...PREVIA, lines: [...PREVIA.lines, { id: "d", keyword: "como atrair pacientes para clínica", currentStatus: "aprovado", action: "send_only", alreadyInArquiteto: true, missing: [], reasons: [], subjectFromVolumeHeld: "não vira o Assunto agora: com o Assunto cadastrado ela deixaria de poder ser aprovada (Aprovar exige Volume.). Fica como está; meça no Volume e rode de novo." }], counts: { ...PREVIA.counts, sendOnly: 1 } };

test("'Aprovar e enviar' parou no meio (503 com nothingWritten: false): a tela diz 'Não concluído', relê TODAS as pedidas e oferece a prévia de novo; a linha segurada diz por que não vira o Assunto", async () => {
  fetchComStatus([
    { status: 200, body: { success: true, ...PREVIA_SEGURADA } },
    { status: 503, body: { success: false, code: "APPROVE_AND_SEND_FAILED", nothingWritten: false, message: "Aprovar e enviar parou no meio. Parte pode ter sido gravada: releia o Minerador para ver cada keyword. Rode “Aprovar e enviar” de novo: continua de onde parou (o que já foi gravado não se repete).", diagnostic: { requestId: "r" } } },
    { status: 200, body: { success: true, ...PREVIA_SEGURADA } },
  ]);
  const relidas: Array<{ ids: string[]; result: unknown }> = [];
  await tela.render(comProductShell(React.createElement(ApproveAndSendDialog, { brandId: BRAND, keywordIds: [KW, "b", "c", "d"], scopeLabel: "cor Verde · 4 keywords", onClose: () => undefined, onApplied: async (ids: string[], result: unknown) => { relidas.push({ ids, result }); return true; } })));
  await settle();
  assert.match(tela.container.querySelector("[data-approve-and-send-subject-held]")?.textContent ?? "", /^não vira o Assunto agora: com o Assunto cadastrado ela deixaria de poder ser aprovada/);
  await tela.click(botao("Aprovar e enviar 3")!);
  await settle();
  const alerta = tela.container.querySelector("[data-approve-and-send-refusal]")?.textContent ?? "";
  assert.match(alerta, /^Não concluído: Aprovar e enviar parou no meio/);
  assert.doesNotMatch(alerta, /Nada foi gravado/, "nunca 'nada foi gravado' quando parte pode ter sido");
  assert.deepEqual(relidas.map(item => [[...item.ids].sort(), item.result]), [[[KW, "b", "c", "d"].sort(), null]], "a planilha relê todas as pedidas");
  await tela.click(botao("Gerar a prévia de novo")!);
  await settle();
  assert.equal(pedidos.at(-1)?.body.mode, "preview", "o MESMO botão continua: prévia nova");
});

test("'Aprovar e enviar' com a prévia vencida (409, antes de gravar): aí sim 'Nada foi gravado'", async () => {
  fetchComStatus([
    { status: 200, body: { success: true, ...PREVIA } },
    { status: 409, body: { success: false, code: "APPROVE_AND_SEND_STALE", nothingWritten: true, message: "O estado das keywords mudou desde a prévia. Gere uma nova prévia antes de aplicar; nada foi gravado.", diagnostic: { requestId: "r" } } },
  ]);
  let relidas = 0;
  await tela.render(comProductShell(React.createElement(ApproveAndSendDialog, { brandId: BRAND, keywordIds: [KW, "b", "c"], scopeLabel: "cor Verde · 3 keywords", onClose: () => undefined, onApplied: async () => { relidas += 1; return true; } })));
  await settle();
  await tela.click(botao("Aprovar e enviar 2")!);
  await settle();
  assert.match(tela.container.querySelector("[data-approve-and-send-refusal]")?.textContent ?? "", /^Nada foi gravado: O estado das keywords mudou/);
  assert.equal(relidas, 0, "nada a reler");
});

/* ================================= painel do KeywordDNA · "Assunto deste artigo" */

const semMedia = { volume_eligibility: { status: "unavailable", provider: "google_ads", measuredAt: new Date(Date.now() - 86400000).toISOString(), averageMonthlySearches: null } };
const comAssunto = { ...semMedia, keyword_subject: { declared: true, note: null, destinationUrl: null, destinationCheck: null, entry: { title: "como atrair pacientes para clínica de estética", source: "cadastro" } }, keyword_subject_basis: { kind: "principal_volume", volumeState: "zero", measuredAt: null, decidedBy: "u", at: "2026-10-18T10:00:00Z" } };
const previaDoCadastro = (antes: string | null, depois: string) => ({ mode: "preview", destination: { kind: "keyword", url: null, publishedKeyword: null }, silo: { heading: null, name: null, slug: null, rawSlug: null, objective: null }, siloPlan: null, unparsed: [], refusals: [], notices: antes ? [`O título do Assunto passa de “${antes}” para “${depois}”.`] : [], group: { mode: "new", name: "", color: null }, articles: [{ order: 1, role: "Suporte", scope: "Sem depender de anúncio pago.", line: 1, title: depois, shape: "cadastro", change: "changed", subject: { phrase: depois, state: "existing_subject", label: "", keywordId: KW, status: "aprovado", groupId: null }, principal: { phrase: "x", state: "same_as_subject", label: "", keywordId: KW, status: "aprovado", volumeValidated: false, volume: null, groupId: null }, lock: null, problems: [], approvedToReview: 1, before: antes ? { title: antes, details: null } : null }], keptArticles: [], leftovers: [], supports: { total: 0, withoutGroup: 0, inOtherGroup: 0 }, approvedToReview: 1, blockers: [], canApply: true, planHash: null });

function editor(semantic: Record<string, unknown>, extra: Record<string, unknown> = {}, onApplied: (ids: string[]) => void = () => undefined) {
  const keyword = { id: KW, keyword: "como atrair pacientes para clínica de estética", status: "aprovado", volume_search: null, volume_source: null, analise_semantica: semantic, ...extra };
  const view = resolveSubjectArticleView({ keywordId: KW, keyword: keyword.keyword, semantic, published: true });
  return comProductShell(React.createElement(SubjectArticleEditor, { brandId: BRAND, keyword, view, onApplied: async (ids: string[]) => { onApplied(ids); } }));
}

test("painel · 'Editar Assunto' → 'Revisar mudança' (antes → depois, nada gravado) → 'Gravar' (o mesmo pedido, com importRequestId) → releitura → 'Reaprovar (só a Lógica)'", async () => {
  let relidas: string[] = [];
  await tela.render(editor(comAssunto, {}, ids => { relidas = ids; }));
  assert.match(tela.text(), /Volume 0 \(ou sem média no Google Ads\)/);
  assert.match(tela.text(), /Origem: Assunto pelo volume 0 da principal/);
  await tela.click(botao(SUBJECT_EDITOR_TEXTS.edit)!);
  const titulo = tela.container.querySelector("[data-subject-article-title-input]") as HTMLInputElement;
  assert.equal(titulo.value, "como atrair pacientes para clínica de estética", "o campo abre com o título gravado");
  await tela.type(titulo, "Como atrair pacientes para a clínica de estética");
  await tela.type(tela.container.querySelector("[data-subject-article-details-input]") as HTMLInputElement, "Sem depender de anúncio pago.");
  respostas.push(() => previaDoCadastro("como atrair pacientes para clínica de estética", "Como atrair pacientes para a clínica de estética"));
  await tela.click(botao(SUBJECT_EDITOR_TEXTS.review)!);
  await settle();
  assert.deepEqual([pedidos[0].body.mode, (pedidos[0].body.destination as Record<string, unknown>).kind, (pedidos[0].body.destination as Record<string, unknown>).keywordId], ["preview", "keyword", KW]);
  assert.match(pedidos[0].url, /\/plans\/import$/, "o MESMO núcleo do card");
  assert.match(tela.container.querySelector("[data-subject-article-before-after]")?.textContent ?? "", /Antes: “como atrair pacientes para clínica de estética” → Depois: “Como atrair pacientes para a clínica de estética”/);
  respostas.push(() => ({ mode: "apply", failed: 0, articles: [{ order: 1, outcome: "declared" }] }));
  await tela.click(botao(SUBJECT_EDITOR_TEXTS.save)!);
  await settle();
  assert.equal(pedidos[1].body.mode, "apply");
  assert.ok(typeof pedidos[1].body.importRequestId === "string");
  assert.deepEqual(pedidos[1].body.plan, pedidos[0].body.plan, "grava o MESMO pedido da prévia");
  assert.deepEqual(relidas, [KW], "relê a linha antes de dizer que gravou");
  assert.ok(tela.container.querySelector("[data-subject-article-saved]"), "sucesso só depois da releitura");
  respostas.push(() => ({ results: [{ id: KW, keyword: "k", outcome: "applied" }] }));
  await tela.click(botao(SUBJECT_EDITOR_TEXTS.reapprove)!);
  await settle();
  assert.match(pedidos[2].url, /\/plans\/reapprove$/, "o follow-up de sempre");
  assert.match(tela.text(), /1 reaprovada\(s\)/);
});

test("painel · volume baixo sem Assunto: 'Usar como Assunto do artigo' manda o destino 'Keyword (sem Silo)' com a origem 'low'; volume 0 sem Assunto só avisa que vira no 'Aprovar e enviar'", async () => {
  await tela.render(editor({ volume_measurement: { provider: "google_ads", averageMonthlySearches: 10, measuredAt: "2026-10-10T10:00:00Z" } }, { volume_search: 10, volume_source: "google_ads" }));
  assert.ok(botao(SUBJECT_EDITOR_TEXTS.useLow), "a opção do volume baixo");
  assert.equal(botao(SUBJECT_EDITOR_TEXTS.edit), undefined);
  await tela.click(botao(SUBJECT_EDITOR_TEXTS.useLow)!);
  respostas.push(() => previaDoCadastro(null, "como atrair pacientes para clínica de estética"));
  await tela.click(botao(SUBJECT_EDITOR_TEXTS.review)!);
  await settle();
  assert.deepEqual(pedidos[0].body.destination, { kind: "keyword", keywordId: KW, basis: "low" });
  tela.destroy();
  tela = await montarRadar();
  await tela.render(editor(semMedia));
  assert.ok(tela.container.querySelector("[data-subject-article-zero-waits]"), "volume 0: vira no Aprovar e enviar");
  assert.equal(botao(SUBJECT_EDITOR_TEXTS.useLow), undefined, "volume 0 não é a opção do baixo");
  assert.equal(pedidos.length, 1, "o aviso não chama o servidor");
});
