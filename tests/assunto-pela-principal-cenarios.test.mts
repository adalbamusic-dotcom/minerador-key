import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LinhaUnicaFakeDb, type Row } from "./minerador-linha-unica-fake-db.mts";
import { importDeclaredPlanWithCore } from "../lib/minerador/declared-plan-import-core.ts";
import { convertLegacySubjectsWithCore, CONVERSION_WITHOUT_GROUP } from "../lib/minerador/subject-conversion-core.ts";
import { applyKeywordDecisionEntries, approvalInput, keywordDecisionEntries, readDecisionKeywords, runKeywordLogicWithCore, type DecisionKeywordRow, type KeywordDecisionEntry } from "../lib/server/minerador-keyword-decision-core.ts";
import { APPROVE_AND_SEND_SUBJECT_HELD, applyApproveAndSend, approveAndSendErrorText, describeApproveAndSendResult, previewApproveAndSend, type ApproveAndSendDeps } from "../lib/minerador/approve-and-send-core.ts";
import { SEMANTIC_SNAPSHOT_URL_BUDGET, planSemanticSnapshot } from "../lib/minerador/semantic-snapshot-guard.ts";
import { approvedPackageDiverged, buildApprovedPackage } from "../lib/minerador/approved-package.ts";
import { resolveEffectiveKeywordStatus } from "../lib/minerador/editorial-status.ts";
import { canonicalJson } from "../lib/arquiteto/versioning.ts";
import { KEYWORD_SUBJECT_HISTORY_KEY, PRINCIPAL_SUBJECT_SENTENCES, principalSubjectStanding, readKeywordSubjectBasis, resolveKeywordSubject, SUBJECT_LOW_VOLUME_MAX } from "../lib/minerador/keyword-subject.ts";
import { readSubjectConversion } from "../lib/minerador/subject-conversion.ts";
import { resolveSubjectArticleView } from "../lib/minerador/subject-article-view.ts";
import { declaredPrincipalLock } from "../lib/minerador/declared-plan.ts";
import { readArchitectSubjectStanding } from "../lib/arquiteto/declared-subject.ts";
import { resolveKeywordDnaSignals } from "../lib/arquiteto/keyword-dna-signals.ts";
import { PAGE_BECOMES_SUBJECT_REASON, planArticleImprovements, principalFitsSubject, principalSwapStanding, type ImprovementKeyword, type ImprovementTarget } from "../lib/arquiteto/article-improvement.ts";
import { publishedPageKeywordIdOf } from "../lib/arquiteto/canonical-bootstrap.ts";
import { publishedReinforcementReadbackConfirms } from "../lib/arquiteto/published-reinforcement.ts";

/*
 * CENÁRIOS-OURO DO "ASSUNTO PELA PRINCIPAL E PELO VOLUME" (SDD
 * `docs/compartilhado/sdd-assunto-pela-principal-e-volume-2026-10-18.md` §14, Z1–Z12; APROVADA pelo dono em 18/10).
 *
 * A linha de sempre, de ponta a ponta, com os núcleos reais e I/O simulado (banco em memória, Arquiteto falso com os
 * portões do servidor). Fixtures com as FORMAS do grupo verde da AdalbaPro (SELECT de 18/10): páginas publicadas pelo
 * Vínculo, "sem média no Google Ads" (17 das 21), volume baixo (10), volume ≥ 40 (90), página de Silo, os Assuntos do
 * formato anterior na própria página, e as 16 páginas trocadas no modo antigo (a página como secundária). Nenhuma rede,
 * nenhum banco, nenhuma chamada paga.
 */

globalThis.fetch = (async () => { throw new Error("Rede proibida neste teste."); }) as typeof fetch;

const BRAND = "61d2e019-f44f-4fa3-af2f-d86b95628ab3";
const ACTOR = "d67ebbad-a590-45f8-8bb5-a19c6241ac1b";
const VERDE = "1cbdf7a1-ef42-4e6c-94d6-7a1ea5f55c5e";
const SITE = "https://adalbapro.com.br";
const DIA = 24 * 60 * 60 * 1000;
const RECENTE = () => new Date(Date.now() - DIA).toISOString();
const VENCIDA = () => new Date(Date.now() - 60 * DIA).toISOString();

const ID = {
  semMedia: "aaaa0001-0000-4000-8000-000000000001",      // como-atrair-pacientes-para-clinica-de-estetica (sem média, nunca trocada)
  antigo: "aaaa0001-0000-4000-8000-000000000002",        // b1e61059: Assunto do formato anterior na própria página (sem média)
  baixo: "aaaa0001-0000-4000-8000-000000000003",         // 64e259d6: 10 buscas
  comVolume: "aaaa0001-0000-4000-8000-000000000004",     // ecbca2b4: 90 buscas
  silo: "aaaa0001-0000-4000-8000-000000000005",          // Crescimento de Clínicas (página de Silo, sem média)
  vencida: "aaaa0001-0000-4000-8000-000000000006",       // "sem média" com mais de 30 dias
  solta: "aaaa0001-0000-4000-8000-000000000007",         // keyword solta, sem média, não publicada
  solta2: "aaaa0001-0000-4000-8000-000000000008",        // keyword solta com volume (cadastro manual, caso a)
  titulo: "aaaa0001-0000-4000-8000-000000000009",        // 8bcd8ff3: linha-título do formato anterior, sem grupo
  whatsapp: "aaaa0001-0000-4000-8000-00000000000a",      // a keyword que passa a carregar o Assunto da linha-título
};

const url = (slug: string) => `${SITE}/${slug}`;
const publicada = (slug: string) => ({ site_origin: { publicationStatus: "published", sourceUrl: url(slug), resolvedUrl: url(slug), canonicalUrl: url(slug), urlSituation: "canonical_confirmed", lastCheckedAt: "2026-09-20T10:00:00Z", publicationConfirmedBy: ACTOR, publicationConfirmedAt: "2026-09-20T10:00:00Z" } });
const semMedia = (quando: string) => ({ volume_eligibility: { status: "unavailable", provider: "google_ads", measuredAt: quando, averageMonthlySearches: null } });
const medido = (volume: number) => ({ volume_measurement: { provider: "google_ads", averageMonthlySearches: volume, measuredAt: "2026-10-10T10:00:00+00:00" } });
const legado = (nota: string) => ({ keyword_subject: { declared: true, note: nota, destinationUrl: null, destinationCheck: null }, keyword_subject_actor: ACTOR, keyword_subject_at: "2026-09-25T10:00:00+00:00", keyword_subject_origin: "import" });

function kw(id: string, keyword: string, extra: Row = {}): Row {
  return { id, keyword, brand_id: BRAND, status: "aprovado", intent: null, location: null, volume_search: null, volume_source: null, results_allintitle: null, kgr_score: null, lista_id: null, group_id: VERDE, deleted_at: null, analise_semantica: {}, ...extra };
}

function adalbaPro(): LinhaUnicaFakeDb {
  return new LinhaUnicaFakeDb({
    editorial_groups: [{ id: VERDE, marca_id: BRAND, name: "Verde", color: "verde", origin: "manual", status: "active", plan: null, plan_version: 0, plan_hash: null, silo_id: null, lock_version: 1, updated_at: RECENTE(), created_at: RECENTE() }],
    editorial_group_events: [], editorial_group_articles: [], editorial_workflow_items: [], brand_site_catalog_entries: [], minerador_keyword_lists: [],
    minerador_keywords: [
      kw(ID.semMedia, "como atrair pacientes para clínica de estética", { analise_semantica: { ...publicada("como-atrair-pacientes-para-clinica-de-estetica"), ...semMedia(RECENTE()) } }),
      kw(ID.antigo, "como atrair pacientes sem redes sociais", { analise_semantica: { ...publicada("como-atrair-pacientes-sem-redes-sociais"), ...semMedia(RECENTE()), ...legado("Para clínicas que não querem depender de Instagram.") } }),
      kw(ID.baixo, "como atrair pacientes para consultório odontológico", { volume_search: 10, volume_source: "google_ads", analise_semantica: { ...publicada("como-atrair-pacientes-para-consultorio-odontologico"), ...medido(10) } }),
      kw(ID.comVolume, "marketing para clínica de estética", { volume_search: 90, volume_source: "google_ads", analise_semantica: { ...publicada("marketing-para-clinica-de-estetica"), ...medido(90) } }),
      kw(ID.silo, "crescimento de clínicas", { analise_semantica: { ...publicada("crescimento-de-clinicas"), ...semMedia(RECENTE()), keyword_page_type: "silo" } }),
      kw(ID.vencida, "plano de marketing para clínica de estética", { analise_semantica: { ...publicada("plano-de-marketing-para-clinica-de-estetica"), ...semMedia(VENCIDA()) } }),
      kw(ID.solta, "agenda cheia na clínica", { group_id: null, analise_semantica: { ...semMedia(RECENTE()) } }),
      kw(ID.solta2, "como fidelizar pacientes", { group_id: null, volume_search: 260, volume_source: "google_ads", analise_semantica: { ...medido(260) } }),
      kw(ID.titulo, "Da primeira pesquisa ao agendamento: como organizar a captação", { group_id: null, analise_semantica: { ...legado("Linha-título do formato anterior.") } }),
      kw(ID.whatsapp, "como atrair clientes pelo whatsapp", { group_id: null, volume_search: 140, volume_source: "google_ads", analise_semantica: { ...medido(140) } }),
    ],
  });
}

const client = (db: LinhaUnicaFakeDb) => db as unknown as SupabaseClient;
const porId = (db: LinhaUnicaFakeDb, id: string) => db.rows("minerador_keywords").find(row => row.id === id)!;
const semantica = (row: Row) => (row.analise_semantica || {}) as Row;
const statusNaTela = (row: Row) => resolveEffectiveKeywordStatus({ status: row.status, diverged: approvedPackageDiverged(approvalInput(row as unknown as DecisionKeywordRow)) }).status;
let pedidos = 0;
const novoPedido = () => `6a1c0d2e-0000-4000-8000-${String(++pedidos).padStart(12, "0")}`;

/** O Arquiteto falso: os portões do envio (aprovada, pacote não divergente) e a mesa com o pacote aprovado. */
function arquitetoFalso(db: LinhaUnicaFakeDb) {
  const mesa = new Map<string, Row>();
  const avaliar = async (ids: readonly string[]) => {
    const { rows } = await readDecisionKeywords(BRAND, ids, client(db));
    const ok = rows.filter(row => statusNaTela(row as unknown as Row) === "aprovado");
    return { ok, refused: rows.filter(row => !ok.includes(row)).map(row => ({ keywordId: row.id, reason: "não aprovada" })) };
  };
  return {
    mesa,
    previewSend: async (ids: readonly string[]) => { const a = await avaliar(ids); return { eligibleKeywordIds: a.ok.map(row => row.id), existingKeywordIds: a.ok.filter(row => mesa.has(row.id)).map(row => row.id), refreshKeywordIds: [], refused: a.refused }; },
    send: async (ids: readonly string[]) => {
      const a = await avaliar(ids);
      for (const row of a.ok) mesa.set(row.id, { ...structuredClone(porId(db, row.id)), canonicalWorkflow: { state: "received", payload: { approvedDna: buildApprovedPackage(approvalInput(row)) } } });
      return { importedKeywordIds: a.ok.map(row => row.id), refused: a.refused };
    },
  };
}

/** O MESMO gravador do servidor (`writeSubjectFromVolumeOnServer`): o núcleo do card, destino "Keyword (sem Silo)", origem "zero". */
async function gravarAssuntoDoVolume(db: LinhaUnicaFakeDb, rows: readonly DecisionKeywordRow[]) {
  const out: Array<{ id: string; outcome: "declared" | "unchanged" | "failed"; reason: string | null }> = [];
  for (const row of rows) {
    // Como o servidor (2026-10-19): o erro de uma keyword vira "failed" com o motivo e as outras seguem.
    let r: Awaited<ReturnType<typeof importDeclaredPlanWithCore>>;
    try {
      r = await importDeclaredPlanWithCore({ brandId: BRAND, actorUserId: ACTOR, keywordsClient: client(db), groupsClient: client(db), mode: "apply", plan: { silo: null, articles: [{ order: 1, subject: "", principal: row.keyword, role: "Suporte", scope: "" }] }, group: { mode: "new", name: null, color: "" }, destination: { kind: "keyword", keywordId: row.id, basis: "zero" }, importRequestId: novoPedido() });
    } catch (error) {
      out.push({ id: row.id, outcome: "failed", reason: `o banco recusou agora: ${approveAndSendErrorText(error)}` });
      continue;
    }
    if (!r.ok || r.mode !== "apply") { out.push({ id: row.id, outcome: "failed", reason: r.ok ? "prévia" : r.reason }); continue; }
    out.push({ id: row.id, outcome: r.articles[0].outcome === "declared" ? "declared" : r.articles[0].outcome === "unchanged" ? "unchanged" : "failed", reason: r.articles[0].reason });
  }
  return out;
}

function deps(db: LinhaUnicaFakeDb, arquiteto: ReturnType<typeof arquitetoFalso>): ApproveAndSendDeps<DecisionKeywordRow, KeywordDecisionEntry> {
  return {
    readRows: async ids => { const { rows } = await readDecisionKeywords(BRAND, ids, client(db)); const found = new Set(rows.map(row => row.id)); return { rows, missingIds: [...new Set(ids)].filter(id => !found.has(id)) }; },
    entries: rows => keywordDecisionEntries(rows, "approve"),
    approve: (rows, entries) => applyKeywordDecisionEntries({ brandId: BRAND, actorId: ACTOR, action: "approve", rows, entries, db: client(db) }),
    previewSend: ids => arquiteto.previewSend(ids),
    send: ids => arquiteto.send(ids),
    hash: value => createHash("sha256").update(canonicalJson(value)).digest("hex"),
    subjectByVolume: {
      standing: row => principalSubjectStanding({ volume_search: row.volume_search, volume_source: row.volume_source ?? null, analise_semantica: row.analise_semantica }, new Date()),
      write: rows => gravarAssuntoDoVolume(db, rows),
    },
  };
}

/** O estado de partida do verde: a Lógica rodou e tudo foi aprovado (o modo antigo). */
async function verdeAprovado() {
  const db = adalbaPro();
  const ids = Object.values(ID);
  await runKeywordLogicWithCore({ brandId: BRAND, keywordIds: ids, db: client(db) });
  const { rows } = await readDecisionKeywords(BRAND, ids, client(db));
  const resultado = await applyKeywordDecisionEntries({ brandId: BRAND, actorId: ACTOR, action: "approve", rows, entries: keywordDecisionEntries(rows, "approve"), db: client(db) });
  assert.ok(resultado.every(item => item.outcome === "applied" || item.outcome === "unchanged"), JSON.stringify(resultado));
  for (const id of ids) assert.equal(statusNaTela(porId(db, id)), "aprovado", id);
  return db;
}

/* ================================================================ régua §6.1 */

test("§6.1 · a régua única: zero (medido 0 ou 'sem média' válida) · baixo (1–39) · com volume (40+) · desconhecido · página de Silo fora", () => {
  const agora = new Date();
  const de = (row: Row) => principalSubjectStanding({ volume_search: row.volume_search, volume_source: row.volume_source, analise_semantica: semantica(row) }, agora);
  const db = adalbaPro();
  assert.deepEqual([de(porId(db, ID.semMedia)).volumeState, de(porId(db, ID.semMedia)).subject, de(porId(db, ID.semMedia)).principal], ["zero", "required", "free"], "sem média = volume 0 (dono, 18/10)");
  assert.deepEqual([de(porId(db, ID.baixo)).volumeState, de(porId(db, ID.baixo)).subject, de(porId(db, ID.baixo)).principal], ["low", "optional", "fixed"]);
  assert.deepEqual([de(porId(db, ID.comVolume)).volumeState, de(porId(db, ID.comVolume)).subject], ["with_volume", "manual"], "Z5 · 40 ou mais: como hoje");
  assert.equal(de(porId(db, ID.vencida)).volumeState, "unknown", "Z7 · 'sem média' com mais de 30 dias: desconhecido");
  assert.equal(de(porId(db, ID.vencida)).sentence, PRINCIPAL_SUBJECT_SENTENCES.unknown);
  assert.equal(de(porId(db, ID.silo)).outOfScope, "silo_page", "C12 · página de Silo fora");
  assert.equal(de(kw("x", "y", { volume_search: 0, volume_source: "google_ads" })).volumeState, "zero", "medido 0");
  assert.equal(de(kw("x", "y", { volume_search: SUBJECT_LOW_VOLUME_MAX, volume_source: "google_ads" })).volumeState, "low");
  assert.equal(de(kw("x", "y", { volume_search: SUBJECT_LOW_VOLUME_MAX + 1, volume_source: "google_ads" })).volumeState, "with_volume");
  assert.equal(de(kw("x", "y", { volume_search: 500, volume_source: "semrush" })).volumeState, "unknown", "outro provider: falta medir");
});

/* ======================================================= Z1/Z6 · lado Minerador */

test("Z1/Z6 (Minerador) · 'Aprovar e enviar' nas páginas do verde: as de volume 0 viram o Assunto ANTES de aprovar (título = o texto; a nota antiga vira os detalhes); baixo, ≥40, Silo, vencida e a solta comum ficam como estão; reaprovadas e enviadas com o Assunto no pacote", async () => {
  const db = await verdeAprovado();
  const arquiteto = arquitetoFalso(db);
  const alvo = [ID.semMedia, ID.antigo, ID.baixo, ID.comVolume, ID.silo, ID.vencida, ID.solta];
  const d = deps(db, arquiteto);
  const previa = await previewApproveAndSend({ brandId: BRAND, actorId: ACTOR, keywordIds: alvo, send: true }, d);
  const virar = previa.lines.filter(line => line.subjectFromVolume).map(line => line.id).sort();
  assert.deepEqual(virar, [ID.semMedia, ID.antigo].sort(), JSON.stringify(previa.lines));
  assert.equal(previa.counts.subjectFromVolume, 2, "a prévia diz quantas viram o Assunto");
  assert.equal(previa.lines.find(line => line.id === ID.antigo)!.subjectFromVolume!.details, "Para clínicas que não querem depender de Instagram.", "a nota antiga vira os detalhes");
  assert.equal(previa.lines.find(line => line.id === ID.antigo)!.subjectFromVolume!.legacy, true);
  assert.equal(previa.lines.find(line => line.id === ID.semMedia)!.subjectFromVolume!.title, "como atrair pacientes para clínica de estética", "o título nasce do texto da keyword");
  assert.equal(db.writes("minerador_keywords").length > 0, true);
  const antes = db.writes("minerador_keywords").length;
  // A prévia não grava nada.
  await previewApproveAndSend({ brandId: BRAND, actorId: ACTOR, keywordIds: alvo, send: true }, d);
  assert.equal(db.writes("minerador_keywords").length, antes, "a prévia não grava");

  const resultado = await applyApproveAndSend({ brandId: BRAND, actorId: ACTOR, keywordIds: alvo, send: true, decisionHash: previa.decisionHash }, d);
  assert.deepEqual([...(resultado.subjectFromVolumeIds ?? [])].sort(), [ID.semMedia, ID.antigo].sort());
  assert.match(resultado.notices.join(" "), /2 viram o Assunto do artigo \(volume 0\)/);
  for (const id of [ID.semMedia, ID.antigo]) {
    const row = porId(db, id);
    const assunto = resolveKeywordSubject(semantica(row));
    assert.equal(assunto.declared, true, id);
    assert.ok(assunto.entry, `${id}: Assunto do cadastro (entry)`);
    assert.equal(assunto.plan, null, `${id}: sem plano`);
    assert.deepEqual([readKeywordSubjectBasis(semantica(row))?.kind, readKeywordSubjectBasis(semantica(row))?.volumeState], ["principal_volume", "zero"], `${id}: origem = volume 0`);
    assert.equal(statusNaTela(row), "aprovado", `${id}: reaprovada (o pacote novo assinado)`);
    assert.equal(row.status, "aprovado", `${id}: a coluna da publicada não mudou`);
    assert.equal(JSON.stringify(semantica(row).site_origin), JSON.stringify(semantica(porId(adalbaPro(), id)).site_origin), `${id}: URL, slug e canonical intactos`);
    const standing = readArchitectSubjectStanding(arquiteto.mesa.get(id)!);
    assert.equal(standing.declared, true, `${id}: o Assunto chega ao Arquiteto pelo pacote aprovado`);
  }
  assert.equal(resolveKeywordSubject(semantica(porId(db, ID.antigo))).entry?.details, "Para clínicas que não querem depender de Instagram.");
  for (const id of [ID.baixo, ID.comVolume, ID.silo, ID.vencida, ID.solta]) assert.equal(resolveKeywordSubject(semantica(porId(db, id))).entry, null, `${id}: nada de Assunto automático`);
  assert.equal(resolveKeywordSubject(semantica(porId(db, ID.solta))).declared, false, "a keyword solta comum (não publicada) nunca vira Assunto sozinha");
});

/* ============================================================ Z4 · volume baixo */

test("Z4 (Minerador) · volume baixo: 'Usar como Assunto do artigo' grava o Assunto na própria keyword (origem 'low'); sem plano nem trava; reaprovar só pede a Lógica; 'low' recusado na keyword de volume 0", async () => {
  const db = await verdeAprovado();
  const pedido = { brandId: BRAND, actorUserId: ACTOR, keywordsClient: client(db), groupsClient: client(db), plan: { silo: null, articles: [{ order: 1, subject: "", principal: "como atrair pacientes para consultório odontológico", role: "Suporte" as const, scope: "" }] }, group: { mode: "new" as const, name: null, color: "" } };
  const previa = await importDeclaredPlanWithCore({ ...pedido, mode: "preview", destination: { kind: "keyword", keywordId: ID.baixo, basis: "low" } });
  assert.ok(previa.ok && previa.mode === "preview" && previa.canApply, JSON.stringify(previa));
  const aplicado = await importDeclaredPlanWithCore({ ...pedido, mode: "apply", destination: { kind: "keyword", keywordId: ID.baixo, basis: "low" }, importRequestId: novoPedido() });
  assert.ok(aplicado.ok && aplicado.mode === "apply" && aplicado.failed === 0, JSON.stringify(aplicado));
  const row = porId(db, ID.baixo);
  assert.equal(resolveKeywordSubject(semantica(row)).entry?.title, "como atrair pacientes para consultório odontológico");
  assert.equal(readKeywordSubjectBasis(semantica(row))?.volumeState, "low");
  assert.equal(statusNaTela(row), "em_revisao", "o Assunto entra no pacote: volta a Em revisão");
  const { rows } = await readDecisionKeywords(BRAND, [ID.baixo], client(db));
  const entrada = keywordDecisionEntries(rows, "approve")[0];
  assert.equal(entrada.outcome, "ready", "a publicada com a coluna aprovado é re-assinada (só a Lógica)");
  await applyKeywordDecisionEntries({ brandId: BRAND, actorId: ACTOR, action: "approve", rows, entries: [entrada], db: client(db) });
  assert.equal(statusNaTela(porId(db, ID.baixo)), "aprovado");
  // A régua decide a opção: volume 0 não é "baixo".
  const recusa = await importDeclaredPlanWithCore({ ...pedido, plan: { silo: null, articles: [{ order: 1, subject: "", principal: "como atrair pacientes para clínica de estética", role: "Suporte", scope: "" }] }, mode: "preview", destination: { kind: "keyword", keywordId: ID.semMedia, basis: "low" } });
  assert.ok(recusa.ok && recusa.mode === "preview" && !recusa.canApply, "volume 0 não usa a opção do volume baixo");
});

/* ============================================= Z10 · keyword solta (caso a) */

test("Z10 · keyword solta cadastrada como Assunto (destino 'Keyword (sem Silo)', pelo texto como no card): entry sem plano; o rótulo NÃO diz 'Protegida pela página publicada'", async () => {
  const db = adalbaPro();
  const r = await importDeclaredPlanWithCore({ brandId: BRAND, actorUserId: ACTOR, keywordsClient: client(db), groupsClient: client(db), mode: "apply", plan: { silo: null, articles: [{ order: 1, subject: "Como fidelizar pacientes na clínica de estética", principal: "como fidelizar pacientes", role: "Suporte", scope: "Retenção depois da primeira consulta." }] }, group: { mode: "new", name: null, color: "" }, destination: { kind: "keyword", keyword: "como fidelizar pacientes" }, importRequestId: novoPedido() });
  assert.ok(r.ok && r.mode === "apply" && r.failed === 0, JSON.stringify(r));
  const assunto = resolveKeywordSubject(semantica(porId(db, ID.solta2)));
  assert.deepEqual([assunto.entry?.title, assunto.entry?.details, assunto.plan], ["Como fidelizar pacientes na clínica de estética", "Retenção depois da primeira consulta.", null]);
  assert.equal(readKeywordSubjectBasis(semantica(porId(db, ID.solta2)))?.kind, "cadastro");
  const view = resolveSubjectArticleView({ keywordId: ID.solta2, keyword: "como fidelizar pacientes", semantic: semantica(porId(db, ID.solta2)) });
  assert.ok(view?.kind === "subject" && !/Protegida pela página publicada/.test(view.lock?.label ?? ""), JSON.stringify(view));
  const pub = resolveSubjectArticleView({ keywordId: ID.solta2, keyword: "x", semantic: semantica(porId(db, ID.solta2)), published: true });
  assert.ok(pub?.kind === "subject" && /^Página publicada · URL, slug e canonical ficam; a principal segue o volume$/.test(pub.lock?.label ?? ""));
  // A keyword que não existe na marca é recusada (o destino não cria keyword).
  const nada = await importDeclaredPlanWithCore({ brandId: BRAND, actorUserId: ACTOR, keywordsClient: client(db), groupsClient: client(db), mode: "preview", plan: { silo: null, articles: [{ order: 1, subject: "x", principal: "keyword inexistente", role: "Suporte", scope: "" }] }, group: { mode: "new", name: null, color: "" }, destination: { kind: "keyword", keyword: "keyword inexistente" } });
  assert.ok(nada.ok && nada.mode === "preview" && !nada.canApply);
});

/* ======================================== Z11 · edição do título no painel */

test("Z11 · corrigir o título no painel: prévia antes → depois (nada gravado) → gravar → releitura; o histórico guarda o anterior; volta a Em revisão e o reaprovar só pede a Lógica", async () => {
  const db = await verdeAprovado();
  const arquiteto = arquitetoFalso(db);
  const d = deps(db, arquiteto);
  const previa0 = await previewApproveAndSend({ brandId: BRAND, actorId: ACTOR, keywordIds: [ID.semMedia], send: true }, d);
  await applyApproveAndSend({ brandId: BRAND, actorId: ACTOR, keywordIds: [ID.semMedia], send: true, decisionHash: previa0.decisionHash }, d);
  const pedido = { brandId: BRAND, actorUserId: ACTOR, keywordsClient: client(db), groupsClient: client(db), plan: { silo: null, articles: [{ order: 1, subject: "Como atrair pacientes para a clínica de estética", principal: "como atrair pacientes para clínica de estética", role: "Suporte" as const, scope: "Sem depender de anúncio pago." }] }, group: { mode: "new" as const, name: null, color: "" }, destination: { kind: "keyword" as const, keywordId: ID.semMedia } };
  const escritasAntes = db.writes("minerador_keywords").length;
  const previa = await importDeclaredPlanWithCore({ ...pedido, mode: "preview" });
  assert.ok(previa.ok && previa.mode === "preview" && previa.canApply, JSON.stringify(previa));
  assert.deepEqual(previa.articles[0].before, { title: "como atrair pacientes para clínica de estética", details: null }, "antes");
  assert.equal(previa.articles[0].title, "Como atrair pacientes para a clínica de estética", "depois");
  assert.ok(previa.notices.some(nota => /O título do Assunto passa de/.test(nota)));
  assert.equal(db.writes("minerador_keywords").length, escritasAntes, "a prévia não grava");
  const aplicado = await importDeclaredPlanWithCore({ ...pedido, mode: "apply", importRequestId: novoPedido() });
  assert.ok(aplicado.ok && aplicado.mode === "apply" && aplicado.failed === 0, JSON.stringify(aplicado));
  const row = porId(db, ID.semMedia);
  assert.equal(resolveKeywordSubject(semantica(row)).entry?.title, "Como atrair pacientes para a clínica de estética");
  const historico = semantica(row)[KEYWORD_SUBJECT_HISTORY_KEY] as Array<{ entryTitle?: string }>;
  assert.ok(historico.some(item => item.entryTitle === "como atrair pacientes para clínica de estética") && historico.some(item => item.entryTitle === "Como atrair pacientes para a clínica de estética"), "o histórico guarda o anterior e o novo");
  assert.equal(readKeywordSubjectBasis(semantica(row))?.volumeState, "zero", "a origem continua a do volume 0");
  assert.equal(statusNaTela(row), "em_revisao");
  await runKeywordLogicWithCore({ brandId: BRAND, keywordIds: [ID.semMedia], db: client(db) });
  const { rows } = await readDecisionKeywords(BRAND, [ID.semMedia], client(db));
  await applyKeywordDecisionEntries({ brandId: BRAND, actorId: ACTOR, action: "approve", rows, entries: keywordDecisionEntries(rows, "approve"), db: client(db) });
  assert.equal(statusNaTela(porId(db, ID.semMedia)), "aprovado", "reaprovada");
  // Igual ao gravado: nada é regravado.
  const igual = await importDeclaredPlanWithCore({ ...pedido, mode: "apply", importRequestId: novoPedido() });
  assert.ok(igual.ok && igual.mode === "apply" && igual.articles[0].outcome === "unchanged");
});

/* ================================================= Z8 · conversão "Sem grupo" */

test("Z8 · 'Converter para o formato novo' com 'Sem grupo': a linha-título sem cor passa o Assunto para a keyword escolhida (conversão registrada); a linha-título fica (não vai para a lixeira)", async () => {
  const db = adalbaPro();
  const linha = { fromKeywordId: ID.titulo, articleId: null, order: 1, role: "Suporte" as const, title: "Da primeira pesquisa ao agendamento: como organizar a captação", keyword: "como atrair clientes pelo whatsapp", scope: "Do primeiro contato ao agendamento pelo WhatsApp." };
  const previa = await convertLegacySubjectsWithCore({ brandId: BRAND, actorUserId: ACTOR, keywordsClient: client(db), groupsClient: client(db), mode: "preview", groupId: CONVERSION_WITHOUT_GROUP, rows: [linha] });
  assert.ok(previa.ok && previa.mode === "preview" && previa.preview.canApply, JSON.stringify(previa));
  const aplicado = await convertLegacySubjectsWithCore({ brandId: BRAND, actorUserId: ACTOR, keywordsClient: client(db), groupsClient: client(db), mode: "apply", groupId: CONVERSION_WITHOUT_GROUP, rows: [linha], importRequestId: novoPedido() });
  assert.ok(aplicado.ok && aplicado.mode === "apply" && aplicado.applied.failed === 0, JSON.stringify(aplicado));
  const k = semantica(porId(db, ID.whatsapp));
  assert.equal(resolveKeywordSubject(k).entry?.title, "Da primeira pesquisa ao agendamento: como organizar a captação");
  assert.equal(readSubjectConversion(k)?.fromKeywordId, ID.titulo, "a conversão fica registrada na keyword");
  assert.ok(porId(db, ID.titulo) && !porId(db, ID.titulo).deleted_at, "a linha-título continua (arquivada)");
  // Com cor, "Sem grupo" recusa (o Assunto com cor converte pelo grupo dele).
  const comCor = await convertLegacySubjectsWithCore({ brandId: BRAND, actorUserId: ACTOR, keywordsClient: client(db), groupsClient: client(db), mode: "preview", groupId: CONVERSION_WITHOUT_GROUP, rows: [{ ...linha, fromKeywordId: ID.antigo, keyword: "como atrair pacientes sem redes sociais", title: "x" }] });
  assert.equal(comCor.ok, false);
});

/* ================================================================ Arquiteto */

const TERR = "territory:5e689f8c-8f06-4e65-94c4-b3cd7ac906cc";
const dna = (id: string, text: string, extra: Record<string, unknown> = {}) => resolveKeywordDnaSignals({ keywordId: id, text, semantic: extra });
const kwA = (id: string, keyword: string, volume: number | null, extra: Partial<ImprovementKeyword> = {}): ImprovementKeyword => ({ id, keyword, volume, volumeValidated: Boolean(volume && volume > 0), signals: dna(id, keyword), ownerId: null, published: false, territoryRef: TERR, external: false, ...extra });
/** O alvo publicado com o Assunto na página (o que o servidor monta em `readInputs`). */
function publicado(pagina: string, slug: string, extra: Partial<ImprovementTarget> = {}): ImprovementTarget {
  return { id: pagina, kind: "published", theme: extra.theme ?? slug.replace(/-/g, " "), note: null, primaryId: pagina, post: "free", memberIds: [pagina], territoryRef: TERR, slug, url: url(slug), canonical: url(slug), signals: dna(pagina, slug.replace(/-/g, " ")), principalSubject: { keywordId: pagina, volumeState: "zero" }, currentSubjectKeywordId: null, articleExists: true, ...extra };
}

test("Z1 (Arquiteto) · página sem média nunca trocada: a melhoria propõe a principal nova COM volume que leva o núcleo do slug e cabe no Assunto; a página vira o `subject` (sai das keywords); URL, slug e canonical iguais", () => {
  const pagina = kwA("p1", "como atrair pacientes para clínica de estética", null, { published: true, ownerId: "p1" });
  const t = publicado("p1", "como-atrair-pacientes-para-clinica-de-estetica");
  // 2026-10-19 (spec §48, T15): a principal leva o nicho do Assunto ("para clínica de estética"); a ampla sem ele só reforça.
  const keywords = [pagina, kwA("c1", "atrair pacientes clínica de estética", 720), kwA("c2", "harmonização facial preço", 1300), kwA("c4", "como atrair pacientes", 880)];
  const [p] = planArticleImprovements({ targets: [t], keywords, evidence: [] });
  assert.equal(principalSwapStanding(t, pagina), "swap");
  assert.match(principalFitsSubject(t, keywords[3]) ?? "", /perde o público\/nicho que define o artigo/, "a ampla sem o nicho não é a principal (SUBSTITUI 'a ampla de mesma intenção pode ser a principal')");
  assert.equal(p.status, "ready", JSON.stringify(p.reasons));
  assert.equal(p.principalId, "c1", JSON.stringify(p.reasons));
  assert.equal(p.subjectKeywordId, "p1", "a página é o Assunto");
  assert.ok(!p.memberIds.includes("p1") && p.removeIds.includes("p1"), "a página sai das keywords (continua no artigo como o Assunto)");
  assert.ok(p.reasons.includes(PAGE_BECOMES_SUBJECT_REASON));
  assert.match(p.reasons.join(" "), /Assunto pela principal \(SDD 2026-10-18\): “como atrair pacientes para clínica de estética” tem volume 0; “atrair pacientes clínica de estética” \(720\) assume como principal — leva o núcleo do slug/);
  assert.ok(!p.memberIds.includes("c2"), "nunca a busca do consumidor (preço)");
  assert.deepEqual([t.slug, t.url, t.canonical], ["como-atrair-pacientes-para-clinica-de-estetica", url("como-atrair-pacientes-para-clinica-de-estetica"), url("como-atrair-pacientes-para-clinica-de-estetica")]);
});

test("Z2 · página sem média já trocada no modo antigo, com principal que passa na régua c: a principal atual FICA e a página sai das secundárias para o Assunto", () => {
  const pagina = kwA("p2", "campanhas de marketing para clínica de estética sem anúncios", null, { published: true, ownerId: "p2" });
  const atual = kwA("c480", "campanhas de marketing", 480, { ownerId: "p2" });
  const t = publicado("p2", "campanhas-de-marketing-para-clinica-de-estetica-sem-anuncios", { primaryId: "c480", memberIds: ["p2", "c480"] });
  const [p] = planArticleImprovements({ targets: [t], keywords: [pagina, atual], evidence: [] });
  /*
   * ~~"passa: leva o núcleo (campanha + marketing) e não contradiz o Assunto" → a principal atual FICA~~ — SUBSTITUÍDO em
   * 2026-10-19 (cobrança do dono; spec §48, T15): "campanhas de marketing" perde o nicho e a restrição que definem o
   * artigo; deixa o posto e fica como secundária de contexto; sem candidata, o Assunto fica como o foco.
   */
  assert.match(principalFitsSubject(t, atual) ?? "", /perde o público\/nicho que define o artigo/);
  assert.equal(p.principalId, "p2", JSON.stringify(p.reasons));
  assert.equal(p.subjectKeywordId, "p2");
  assert.ok(p.memberIds.includes("c480") && p.memberIds.includes("p2") && !p.removeIds.length, JSON.stringify(p));
  assert.ok(p.reasons.some(r => r.startsWith("Assunto como foco:")), JSON.stringify(p.reasons));
  assert.equal(p.status, "ready", "o Assunto preso e a principal que deixa o posto são mudança real (versão nova)");
});

test("Z3 · página sem média trocada para principal que contradiz o Assunto (preço do consumidor, grafia quebrada, outro público): proposta de troca pela que passa; sem candidata, a principal fica e a prévia diz por quê; nunca 'harmonização fácial preço'", () => {
  // marketing-harmonizacao-facial · "harmonização fácial preço" é a intenção do consumidor
  const h = publicado("p3", "marketing-harmonizacao-facial", { primaryId: "h1", memberIds: ["p3", "h1", "h2"] });
  const kh = [kwA("p3", "marketing harmonização facial", null, { published: true, ownerId: "p3" }), kwA("h1", "harmonização fácial preço", 1300, { ownerId: "p3" }), kwA("h2", "preço harmonização facial", 880, { ownerId: "p3" }), kwA("h3", "marketing para harmonização facial", 90)];
  assert.match(principalFitsSubject(h, kh[1]) ?? "", /intenção do consumidor/);
  const [ph] = planArticleImprovements({ targets: [h], keywords: kh, evidence: [] });
  assert.equal(ph.principalId, "h3", JSON.stringify(ph.reasons));
  assert.ok(!ph.memberIds.includes("h1") && !ph.memberIds.includes("h2"), "as do consumidor saem (vão para Keywords não agrupadas)");
  assert.ok(ph.removeIds.includes("h1") && ph.removeIds.includes("h2"));
  // como-criar-um-plano… · "plano de e marketing" é grafia quebrada
  const c = publicado("p4", "como-criar-um-plano-de-marketing-para-clinica-de-estetica", { primaryId: "e1", memberIds: ["p4", "e1"] });
  const kc = [kwA("p4", "como criar um plano de marketing para clínica de estética", null, { published: true, ownerId: "p4" }), kwA("e1", "plano de e marketing", 1900, { ownerId: "p4" }), kwA("e2", "plano de marketing para clínica de estética", 70)];
  assert.equal(principalFitsSubject(c, kc[1]), "grafia quebrada");
  assert.equal(planArticleImprovements({ targets: [c], keywords: kc, evidence: [] })[0].principalId, "e2");
  // captacao-de-pacientes-sem-trafego-pago · "captação de pacientes dentista" troca o público; ~~sem outra candidata, fica (R7)~~ — SUBSTITUÍDO em 2026-10-19: sai, e o Assunto fica como o foco (T15)
  const s = publicado("p5", "captacao-de-pacientes-sem-trafego-pago", { primaryId: "d1", memberIds: ["p5", "d1"] });
  const ks = [kwA("p5", "captação de pacientes sem tráfego pago", null, { published: true, ownerId: "p5" }), kwA("d1", "captação de pacientes dentista", 10, { ownerId: "p5" })];
  assert.match(principalFitsSubject(s, ks[1]) ?? "", /outro público/);
  const [ps] = planArticleImprovements({ targets: [s], keywords: ks, evidence: [] });
  assert.equal(ps.principalId, "p5", "sem candidata que passe, o Assunto (a página) fica como o foco; a vaga com volume fica aberta");
  assert.ok(!ps.memberIds.includes("d1") && ps.removeIds.includes("d1"), "a do outro público sai (Keywords não agrupadas)");
  assert.match(ps.reasons.join(" "), /Assunto como foco:/);
});

test("Z4 (Arquiteto) · volume baixo com o Assunto na página: a principal fica fixa, a página é o Assunto E a principal; o Arquiteto só reforça", () => {
  const pagina = kwA("p6", "como atrair pacientes para consultório odontológico", 10, { published: true, ownerId: "p6" });
  const t = publicado("p6", "como-atrair-pacientes-para-consultorio-odontologico", { principalSubject: { keywordId: "p6", volumeState: "low" } });
  const [p] = planArticleImprovements({ targets: [t], keywords: [pagina, kwA("c1", "como atrair pacientes para o consultório odontológico", 50)], evidence: [] });
  assert.equal(principalSwapStanding(t, pagina), "fixed");
  assert.equal(p.principalId, "p6");
  assert.equal(p.subjectKeywordId, "p6", "o Assunto é a própria principal (permitido com volume validado)");
});

test("Z5 · volume ≥ 40 sem Assunto: como hoje (nada de Assunto, a principal com volume fica)", () => {
  const pagina = kwA("p7", "marketing para clínica de estética", 90, { published: true, ownerId: "p7" });
  const t = publicado("p7", "marketing-para-clinica-de-estetica", { principalSubject: null });
  const [p] = planArticleImprovements({ targets: [t], keywords: [pagina, kwA("c1", "marketing para clínicas de estética", 260)], evidence: [] });
  assert.equal(p.principalId, "p7");
  assert.equal(p.subjectKeywordId, undefined);
});

test("Z6 · publicado 'Travado ao slug' de volume 0: o volume 0 libera a principal sozinho (dono, 18/10) — a troca é proposta na prévia; a Travada do PLANO continua nunca trocando", () => {
  const pagina = kwA("p8", "como atrair pacientes para clínica de estética", null, { published: true, ownerId: "p8" });
  const t = publicado("p8", "como-atrair-pacientes-para-clinica-de-estetica", { post: "locked" });
  assert.equal(principalSwapStanding(t, pagina), "swap");
  assert.equal(planArticleImprovements({ targets: [t], keywords: [pagina, kwA("c1", "atrair pacientes clínica de estética", 720)], evidence: [] })[0].principalId, "c1");
  assert.equal(principalSwapStanding({ ...t, kind: "subject", declaredPrincipalId: "p8", principalSubject: null }, pagina), "locked");
});

test("Z7 · 'sem média' vencida (desconhecido): nada é proposto sobre a principal; a prévia diz 'meça no Minerador'", () => {
  const pagina = kwA("p9", "plano de marketing para clínica de estética", null, { published: true, ownerId: "p9", volumeUnknown: true });
  const t = publicado("p9", "plano-de-marketing-para-clinica-de-estetica", { principalSubject: { keywordId: "p9", volumeState: "unknown" } });
  const [p] = planArticleImprovements({ targets: [t], keywords: [pagina, kwA("c1", "plano de marketing clínica", 210)], evidence: [] });
  assert.equal(p.principalId, "p9");
  assert.ok(p.reasons.some(reason => /desconhecido/.test(reason)), JSON.stringify(p.reasons));
});

test("Z9 · artigo duplicado do mesmo Assunto: apontado; nada nasce", { todo: "fora desta entrega (F7/C10, decisão do dono pendente no WhatsApp duplicado, SDD §17 Q11): a régua não aponta ainda dois ArticleDNA vigentes com o mesmo subject.keywordId" }, () => {
  assert.fail("a fazer");
});

test("Z12 · Suporte do plano de volume 0 (amarelo): agora recebe a proposta da FACETA dele com volume (era 'fica'); o pedaço da principal é do Pilar e não assume", () => {
  const entidade = { entidade_central: "quantos mega" };
  const k = kwA("l3", "quantos mega de internet preciso", null, { ownerId: "l3", signals: dna("l3", "quantos mega de internet preciso", entidade) });
  const t: ImprovementTarget = { id: "l3", kind: "subject", theme: "300, 500, 600 Mega ou 1 Giga: quantos Mega você realmente precisa?", note: null, primaryId: "l3", post: "free", memberIds: [], territoryRef: TERR, slug: null, url: null, canonical: null, signals: k.signals, planPrincipalId: "l3", planSlug: "quantos-mega-de-internet-preciso", planRole: "Suporte" };
  const [p] = planArticleImprovements({ targets: [t], keywords: [k, kwA("f1", "quantos mega de internet eu preciso", 90), kwA("f2", "quantos mega preciso", 50)], evidence: [] });
  assert.equal(p.principalId, "f1", JSON.stringify(p.reasons));
  assert.ok(!p.memberIds.includes("l3"), "a keyword do Assunto sai das keywords e fica como o Assunto");
  const [semFaceta] = planArticleImprovements({ targets: [t], keywords: [k, kwA("f2", "quantos mega preciso", 50)], evidence: [] });
  assert.equal(semFaceta.principalId, "l3", "só o pedaço da principal: ela fica");
});

/* ============================================================ R3 · G10 */

test("R3 · a página que virou o `subject` continua sendo a página (publishedPageKeywordIdOf acha pelo Assunto); a principal nova nunca vira 'publicado'", () => {
  const artigo = { articleId: "p1", principalKeywordId: "c1", keywordReferences: [{ keywordId: "c1" }], primaryKeywordDecision: { status: "confirmed", previousKeywordId: "p1", selectedKeywordId: "c1" }, publishedIdentityRef: { publicationStatus: "published_protected", sourceKeywordDnaIds: ["p1"] }, subject: { keywordId: "p1" } };
  assert.equal(publishedPageKeywordIdOf(artigo as never, "p1"), "p1");
});

test("G10 · versão nova do publicado pode tirar a página (vira o Assunto) e a secundária que contradiz (saída confirmada); fora disso, nenhuma a menos", () => {
  const base = { principalKeywordId: "c1", articleId: "p1", brandId: BRAND, suggestedSlug: "s", canonical: "c" };
  const previous = { ...base, principalKeywordId: "p1", keywordReferences: [{ keywordId: "p1" }, { keywordId: "h1" }, { keywordId: "c1" }] };
  const written = { ...base, keywordReferences: [{ keywordId: "c1" }], subject: { keywordId: "p1" } };
  assert.equal(publishedReinforcementReadbackConfirms({ written: written as never, readback: written as never, previous: previous as never, confirmedExits: ["h1"] }), true);
  assert.equal(publishedReinforcementReadbackConfirms({ written: written as never, readback: written as never, previous: previous as never }), false, "sem a saída confirmada, a que sumiu reprova");
});

/* ==================================================== guarda de forma (§14) */

const codigo = (caminho: string) => readFileSync(new URL(`../${caminho}`, import.meta.url), "utf8").replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");

test("forma · um gravador do Assunto (o núcleo do cadastro); o 'Aprovar e enviar' chama o MESMO núcleo com origem 'zero'; o Volume só mede; nenhuma rota nova", () => {
  const servidor = codigo("lib/server/minerador-approve-and-send.ts");
  assert.match(servidor, /importDeclaredPlanWithCore\(/);
  assert.match(servidor, /destination: \{ kind: "keyword", keywordId: row\.id, basis: "zero" \}/);
  assert.match(servidor, /subjectByVolume: \{/);
  assert.match(servidor, /principalSubjectStanding\(/);
  assert.doesNotMatch(servidor, /setKeywordSubject/, "o servidor não grava o Assunto direto");
  assert.doesNotMatch(codigo("lib/server/minerador-volume-measure.ts"), /keyword_subject|setKeywordSubject|importDeclaredPlanWithCore/, "o Volume só mede");
  // O painel e o card falam com a MESMA rota do cadastro.
  assert.match(codigo("modules/minerador/subject-article-editor.tsx"), /\/plans\/import/);
  assert.doesNotMatch(codigo("modules/minerador/subject-article-editor.tsx"), /\/api\/(?!minerador\/marcas\/\$\{encodeURIComponent\(brandId\)\}\/plans\/import)/, "nenhuma outra rota");
  // A régua da troca saiu do portão da identidade: os gates antigos chamam a régua nova.
  const arquiteto = codigo("lib/arquiteto/article-improvement.ts");
  assert.match(arquiteto, /export function identityHoldsPrincipal[\s\S]*?principalSwapStanding\(/);
  assert.match(arquiteto, /export function pilarTrocaPelaCabeca[\s\S]*?principalSwapStanding\(/);
});

test("trava · volume definido fixa no Minerador (G11): Livre à mão com volume > 0 é Travada; sem volume, a manual decide", () => {
  const plan = { declaredPrincipal: { keywordId: "K", phrase: "k" }, lock: "free" as const };
  assert.equal(declaredPrincipalLock(plan, { subjectKeywordId: "K", volume: { validated: true, value: 10 } })?.state, "locked");
  assert.equal(declaredPrincipalLock(plan, { subjectKeywordId: "K", volume: { validated: true, value: 0 } })?.state, "free");
});

/* ============== Z13 · o verde inteiro (25) com o DNA grande das páginas publicadas (defeito de 19/10) */

/*
 * O defeito de 19/10 (AdalbaPro, verde, 25 keywords): o compare-and-swap mandava o DNA inteiro na URL; com as páginas
 * publicadas (17–20 kB de DNA, 24–27 kB na URL) o gateway recusou a 7ª com "400 Bad Request", a rota respondeu 503 e a
 * tela disse "Nada foi gravado" com 6 Assuntos já gravados. O banco de mentira imita o limite (`urlLimit`).
 */
const GATEWAY_URL = 25_000;
const serie = (n: number) => Array.from({ length: n }, (_, i) => ({ measuredAt: `2026-09-${String(10 + (i % 18)).padStart(2, "0")}T10:00:00.000Z`, provider: "dataforseo", keywordDifficulty: 20 + (i % 7), searchIntent: "informational", competition: "MEDIUM", serpItemTypes: ["organic", "people_also_ask", "video", "images"], note: "série de medição da página publicada · coleta histórica do provider" }));
/** O DNA grande das páginas do verde: séries e históricos que passam de 17 kB. */
const dnaGrande = (n = 70) => ({ dataforseo_keyword_overview_history: serie(n), allintitle_measurement_history: serie(Math.round(n / 3)), logical_output_contract: { campos: Array.from({ length: 30 }, (_, i) => `campo_logico_${i}_com_texto_longo_e_acentuação`) } });
const importadoNaoConfirmado = { discovery_import: { source: "google_ads_discovery", lastMeasurement: { volume: 10, volumeSource: "google_ads", volumeStatus: "success", volumeMeasuredAt: "2026-09-22T19:37:52.401+00:00" }, sourceSnapshot: { provider: "google_ads", metrics: { averageMonthlySearches: 10 } } } };

function verde25(): { db: LinhaUnicaFakeDb; ids: string[]; legadoSemConfirmar: string; silos: string[] } {
  const linhas: Row[] = [];
  const id = (n: number) => `bbbb0001-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const nomes = ["agência de marketing para clínica de estética", "agência de marketing para cosméticos", "campanhas de marketing para clínica de estética sem anúncios", "captação de pacientes sem tráfego pago", "checklist de plano de marketing para clínica de estética", "como atrair clientes para consultório", "como atrair pacientes para clínica", "como atrair pacientes para clínica de estética", "como atrair pacientes sem redes sociais", "como criar um plano de marketing para clínica de estética", "instagram não traz pacientes", "marketing harmonização facial", "modelos de campanha para clínica de estética", "plano de marketing estética: exemplos e templates", "plano de marketing para clínica de estética", "promoções para estética", "tráfego pago vs orgânico para clínica de estética"];
  nomes.forEach((nome, i) => {
    const slug = `pagina-${i + 1}`;
    // 7ª (como no verde): o Assunto do formato anterior SEM nota e com o volume importado (10) não confirmado.
    const extra = i === 6 ? { ...legado(""), ...importadoNaoConfirmado } : i === 8 ? legado("Para clínicas que não querem depender de Instagram.") : {};
    linhas.push(kw(id(i + 1), nome, { analise_semantica: { ...publicada(slug), ...semMedia(RECENTE()), ...dnaGrande(60 + i), ...extra } }));
  });
  [["como captar clientes para clínica de estética", 10], ["marketing digital para dentistas", 70], ["marketing para clínica de estética", 90], ["como atrair pacientes para consultório odontológico", 10]].forEach(([nome, volume], i) => {
    linhas.push(kw(id(30 + i), String(nome), { volume_search: Number(volume), volume_source: "google_ads", analise_semantica: { ...publicada(`com-volume-${i}`), ...medido(Number(volume)), ...dnaGrande(70) } }));
  });
  const silos = ["Captação de Pacientes", "Estratégia de Negócios", "Crescimento de Clínicas", "Leads sem Tráfego Pago"].map((nome, i) => {
    linhas.push(kw(id(40 + i), nome, { analise_semantica: { ...publicada(`silo-${i}`), ...semMedia(RECENTE()), keyword_page_type: "silo", ...dnaGrande(50) } }));
    return id(40 + i);
  });
  const db = new LinhaUnicaFakeDb({ editorial_groups: [{ id: VERDE, marca_id: BRAND, name: "Verde", color: "verde", origin: "manual", status: "active", plan: null, plan_version: 0, plan_hash: null, silo_id: null, lock_version: 1, updated_at: RECENTE(), created_at: RECENTE() }], editorial_group_events: [], editorial_group_articles: [], editorial_workflow_items: [], brand_site_catalog_entries: [], minerador_keyword_lists: [], minerador_keywords: linhas });
  return { db, ids: linhas.map(row => String(row.id)), legadoSemConfirmar: id(7), silos };
}

async function verde25Aprovado() {
  const base = verde25();
  await runKeywordLogicWithCore({ brandId: BRAND, keywordIds: base.ids, db: client(base.db) });
  const { rows } = await readDecisionKeywords(BRAND, base.ids, client(base.db));
  const r = await applyKeywordDecisionEntries({ brandId: BRAND, actorId: ACTOR, action: "approve", rows, entries: keywordDecisionEntries(rows, "approve"), db: client(base.db) });
  assert.ok(r.every(item => item.outcome === "applied" || item.outcome === "unchanged"), JSON.stringify(r.filter(item => item.outcome !== "applied")));
  base.db.urlLimit = GATEWAY_URL; // o limite do gateway vale a partir daqui (a partida do verde já estava aprovada)
  return base;
}

test("Z13 · o DNA grande não vai inteiro para a URL: o compare-and-swap por chave cabe no orçamento e cobre todas as chaves (filtro ou releitura); o modo antigo estourava o gateway", async () => {
  const { db, ids } = verde25();
  const grande = semantica(porId(db, ids[6]));
  assert.ok(encodeURIComponent(JSON.stringify(grande)).length > GATEWAY_URL, "a fixture tem o tamanho do verde (passa do limite do gateway inteira)");
  const plano = planSemanticSnapshot(grande);
  assert.ok(plano.urlCost <= SEMANTIC_SNAPSHOT_URL_BUDGET, `cabe no orçamento (${plano.urlCost})`);
  assert.deepEqual([...plano.filters.map(f => f.column.replace("analise_semantica->", "")), ...plano.overflowKeys].sort(), Object.keys(grande).sort(), "toda chave é filtro ou releitura");
  db.urlLimit = GATEWAY_URL;
  const antigo = await db.from("minerador_keywords").update({ analise_semantica: grande }).eq("id", ids[6]).filter("analise_semantica", "eq", JSON.stringify(grande)).select("id");
  assert.equal(antigo.error?.message, "Bad Request", "o defeito: o DNA inteiro na URL volta 400");
});

test("Z13 · 'Aprovar e enviar' no verde inteiro (25, DNA grande): todas concluem; as de volume 0 viram o Assunto e são reaprovadas; o Assunto do formato anterior com volume importado não confirmado NÃO vira (seria Assunto gravado e aprovação recusada) e fica aprovado; Silo e com volume só enviam", async () => {
  const { db, ids, legadoSemConfirmar, silos } = await verde25Aprovado();
  const d = deps(db, arquitetoFalso(db));
  const previa = await previewApproveAndSend({ brandId: BRAND, actorId: ACTOR, keywordIds: ids, send: true }, d);
  const segurada = previa.lines.find(line => line.id === legadoSemConfirmar)!;
  assert.ok(segurada.subjectFromVolumeHeld?.startsWith(APPROVE_AND_SEND_SUBJECT_HELD), JSON.stringify(segurada));
  assert.equal(segurada.subjectFromVolume, undefined);
  assert.equal(previa.counts.subjectFromVolume, 16, "16 das 17 páginas de volume 0 (a 7ª fica como está)");
  const resultado = await applyApproveAndSend({ brandId: BRAND, actorId: ACTOR, keywordIds: ids, send: true, decisionHash: previa.decisionHash }, d);
  assert.equal(resultado.counts.failed, 0, JSON.stringify(resultado.results.filter(line => line.outcome === "failed")));
  assert.equal(resultado.counts.stale + resultado.counts.blocked + resultado.counts.not_sent + resultado.counts.approved_not_sent, 0, JSON.stringify(resultado.results.filter(line => !["approved_and_sent", "sent"].includes(line.outcome))));
  assert.equal(resultado.results.length, 25);
  assert.equal(resultado.subjectFromVolumeIds?.length, 16);
  assert.equal(resultado.readbackConfirmed, true);
  for (const id of ids) assert.equal(statusNaTela(porId(db, id)), "aprovado", id);
  assert.equal(resolveKeywordSubject(semantica(porId(db, legadoSemConfirmar))).entry, null, "a 7ª continua no formato anterior (nada pela metade)");
  for (const id of silos) assert.equal(resolveKeywordSubject(semantica(porId(db, id))).entry, null, "página de Silo fora");
});

test("Z13 · falha injetada depois de 6 gravações (o banco cai): o resultado diz POR KEYWORD o que foi gravado e o que não foi — nunca 'nada foi gravado' quando foi; rodar o MESMO botão de novo continua e conclui as 25", async () => {
  const { db, ids } = await verde25Aprovado();
  const d = deps(db, arquitetoFalso(db));
  const previa = await previewApproveAndSend({ brandId: BRAND, actorId: ACTOR, keywordIds: ids, send: true }, d);
  let gravacoes = 0;
  db.beforeWrite = (table, op) => { if (table === "minerador_keywords" && op === "update" && ++gravacoes > 6) throw new Error("fetch failed"); };
  const parcial = await applyApproveAndSend({ brandId: BRAND, actorId: ACTOR, keywordIds: ids, send: true, decisionHash: previa.decisionHash }, d);
  const gravadas = parcial.subjectFromVolumeIds ?? [];
  assert.equal(gravadas.length, 6, "os 6 primeiros Assuntos foram gravados (e são ditos)");
  for (const id of gravadas) {
    const linha = parcial.results.find(line => line.id === id)!;
    assert.equal(linha.outcome, "failed", id);
    assert.match(linha.reason ?? "", /O Assunto \(volume 0\) FOI gravado; a aprovação não \(fetch failed\)/);
    assert.ok(resolveKeywordSubject(semantica(porId(db, id))).entry, `${id}: o Assunto está no banco`);
  }
  const semAssunto = parcial.results.filter(line => line.outcome === "failed" && !gravadas.includes(line.id) && /Nada foi gravado nesta keyword/.test(line.reason ?? ""));
  assert.equal(semAssunto.length, 10, "as outras 10 de volume 0: nada gravado nelas, e é isso que se diz");
  assert.ok(parcial.results.every(line => line.outcome !== "failed" || /Rode “Aprovar e enviar” de novo/.test(line.reason ?? "")), "cada uma diz como continuar");
  assert.match(describeApproveAndSendResult(parcial), /não concluída\(s\) agora/);
  assert.equal(parcial.readbackConfirmed, false);

  // O banco volta: o MESMO botão (prévia nova + aplicar) continua de onde parou.
  db.beforeWrite = null;
  const previa2 = await previewApproveAndSend({ brandId: BRAND, actorId: ACTOR, keywordIds: ids, send: true }, d);
  for (const id of gravadas) {
    const linha = previa2.lines.find(line => line.id === id)!;
    assert.equal(linha.subjectFromVolume, undefined, `${id}: já tem o Assunto (não grava de novo)`);
    assert.equal(linha.action, "approve_and_send", `${id}: só falta reaprovar e enviar`);
  }
  assert.equal(previa2.counts.subjectFromVolume, 10);
  const escritasAntes = db.writes("minerador_keywords").length;
  const final = await applyApproveAndSend({ brandId: BRAND, actorId: ACTOR, keywordIds: ids, send: true, decisionHash: previa2.decisionHash }, d);
  assert.equal(final.counts.failed + final.counts.stale + final.counts.blocked, 0, JSON.stringify(final.results.filter(line => !["approved_and_sent", "sent"].includes(line.outcome))));
  for (const id of ids) assert.equal(statusNaTela(porId(db, id)), "aprovado", id);
  assert.ok(db.writes("minerador_keywords").length - escritasAntes <= 10 + 16 + 4, "nada é regravado à toa (10 Assuntos + as reaprovações)");
  // Terceira vez: tudo já feito — só envia, nada é gravado no Minerador.
  const previa3 = await previewApproveAndSend({ brandId: BRAND, actorId: ACTOR, keywordIds: ids, send: true }, d);
  assert.equal(previa3.counts.subjectFromVolume ?? 0, 0);
  const antes3 = db.writes("minerador_keywords").length;
  await applyApproveAndSend({ brandId: BRAND, actorId: ACTOR, keywordIds: ids, send: true, decisionHash: previa3.decisionHash }, d);
  assert.equal(db.writes("minerador_keywords").length, antes3, "idempotente: a 3ª rodada não grava nada no Minerador");
});

test("forma · o gravador do Assunto do servidor trata o erro por keyword; a rota loga o requestId e só diz 'nada foi gravado' quando é verdade; o CAS do DNA não manda o DNA inteiro na URL", () => {
  const servidor = codigo("lib/server/minerador-approve-and-send.ts");
  assert.match(servidor, /try \{\s*result = await importDeclaredPlanWithCore\([\s\S]*?\} catch \(error\) \{[\s\S]*?outcome: "failed"/);
  const rota = codigo("app/api/minerador/marcas/[brandId]/keywords/approve-and-send/route.ts");
  assert.match(rota, /console\.error\("\[approve-and-send\]", requestId/);
  assert.match(rota, /nothingWritten/);
  for (const caminho of ["lib/minerador/declared-plan-import-core.ts", "lib/server/minerador-keyword-decision-core.ts"]) {
    assert.doesNotMatch(codigo(caminho), /filter\("analise_semantica", "eq", JSON\.stringify/, `${caminho}: nada de DNA inteiro na URL`);
  }
  const dialogo = codigo("modules/minerador/approve-and-send-dialog.tsx");
  assert.match(dialogo, /refusal\.nothingWritten \? "Nada foi gravado: " : "Não concluído: "/);
});
