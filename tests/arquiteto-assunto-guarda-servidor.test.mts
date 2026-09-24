/**
 * A GUARDA DO ASSUNTO NO SERVIDOR (SDD 2026-09-24, F2 fase B).
 *
 * O writer de ArticleDNA e SiloDNA e a edição da cópia de trabalho conferem o
 * Assunto novo ou alterado: ator da requisição, keyword viva da mesma marca,
 * declarada no pacote aprovado, e snapshot igual ao do pacote. Leitura
 * estreita, por id, e nenhuma leitura nova sem Assunto.
 *
 * Roda com `--conditions=react-server` e o registro de TS. O banco é um
 * cliente em memória com a forma do `postgrest-js`; nenhuma rede.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { appendArquitetoArtifact, persistSiloPairAtomic, pipelineArtifactErrorResponse } from "../lib/server/arquiteto-persistence.ts";
import {
  assertConsolidatedSiloSubject,
  assertWorkingSubjectAnchorAssignment,
  SUBJECT_GUARD_KEYWORD_COLUMNS,
  SUBJECT_GUARD_PREVIOUS_COLUMNS,
  SUBJECT_GUARD_WORKFLOW_COLUMNS,
  SubjectWriteRefusedError,
} from "../lib/server/arquiteto-subject-guard.ts";
import { ArticleDNASchema, SiloDNASchema, type ArticleDNA, type DeclaredSubject, type SiloDNA, type VersionEnvelope } from "../lib/arquiteto/contracts.ts";
import { planSubjectAttachment } from "../lib/arquiteto/declared-subject.ts";
import { createVersionEnvelope } from "../lib/arquiteto/versioning.ts";
import { deterministicSiloDnaPayload, deterministicSiloPagePayload } from "../lib/arquiteto/adapters.ts";
import { declarado, linhaDaMesa, logica, VOLUME_VALIDADO } from "./arquiteto-assunto-fixtures.mts";

const fetchOriginal = globalThis.fetch;
let chamadasDeRede = 0;
globalThis.fetch = (async () => { chamadasDeRede += 1; throw new Error("rede proibida no teste"); }) as typeof fetch;
test.after(() => { globalThis.fetch = fetchOriginal; });

const MARCA = "5b0e7c1a-2d3f-4a5b-8c9d-0e1f2a3b4c5d";
const OUTRA_MARCA = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const ATOR = "0f1e2d3c-4b5a-4968-8776-655443322110";
const ASSUNTO = "3a2b1c0d-9e8f-4a7b-8c6d-5e4f3a2b1c0d";
const PRINCIPAL = "4b3c2d1e-0f9a-4b8c-9d7e-6f5a4b3c2d1e";
const FRASE = "SEO para clínicas";
const ATTACHED_AT = "2026-09-24T12:00:00+00:00";

/* ------------------------------ banco em memória ----------------------------- */

type Reply = { data: unknown; error: { code?: string; message?: string } | null };
type Logged = { table: string; op: string; columns: string; filters: Array<[string, unknown]> };
type Handler = (call: Logged) => Reply;

class Query {
  op = "select";
  columns = "*";
  filters: Array<[string, unknown]> = [];
  readonly db: FakeDb;
  readonly table: string;
  constructor(db: FakeDb, table: string) {
    this.db = db;
    this.table = table;
  }
  select(columns?: string) { if (this.op === "select") this.columns = columns ?? "*"; return this; }
  eq(column: string, value: unknown) { this.filters.push([column, value]); return this; }
  is(column: string, value: unknown) { this.filters.push([column, value]); return this; }
  in(column: string, value: unknown) { this.filters.push([column, value]); return this; }
  order() { return this; }
  limit() { return this; }
  insert(payload: unknown) { this.op = "insert"; this.db.inserted.push({ table: this.table, payload }); return this; }
  single() { return this.resolve(); }
  maybeSingle() { return this.resolve(); }
  then<A = Reply, B = never>(ok?: ((value: Reply) => A | PromiseLike<A>) | null, fail?: ((reason: unknown) => B | PromiseLike<B>) | null) {
    return this.resolve().then(ok, fail);
  }
  resolve() {
    const call = { table: this.table, op: this.op, columns: this.columns, filters: this.filters };
    this.db.calls.push(call);
    return Promise.resolve(this.db.handler(call));
  }
}

class FakeDb {
  readonly calls: Logged[] = [];
  readonly inserted: Array<{ table: string; payload: unknown }> = [];
  readonly rpcs: string[] = [];
  handler: Handler;
  rpcReply: Reply = { data: null, error: null };
  constructor(handler: Handler) {
    this.handler = handler;
  }
  from(table: string) { return new Query(this, table); }
  rpc(name: string) { this.rpcs.push(name); return Promise.resolve(this.rpcReply); }
}

function context(db: FakeDb, actorUserId = ATOR) {
  return {
    actorUserId,
    brandId: MARCA,
    module: "arquiteto",
    action: "edit",
    permissions: ["arquiteto:edit"] as readonly [string],
    authorizationSource: "canonical_actor_rpc" as const,
    supabase: db as unknown as SupabaseClient,
  };
}

/* --------------------------------- fixtures --------------------------------- */

function linhaDoAssunto(input: { brandId?: string; semantic?: Record<string, unknown>; semPacote?: boolean } = {}) {
  return linhaDaMesa({
    id: ASSUNTO,
    keyword: FRASE,
    brandId: input.brandId ?? MARCA,
    semantic: input.semantic ?? { ...logica({ entity: "marketing para clínicas" }), ...declarado() },
    semPacote: input.semPacote,
  });
}

function subjectDoPacote(linha = linhaDoAssunto(), ator = ATOR): DeclaredSubject {
  const plano = planSubjectAttachment({ brandId: MARCA, keyword: linha, actorUserId: ator, attachedAt: ATTACHED_AT });
  assert.ok(plano.ok, plano.ok ? "" : plano.reason);
  return plano.subject;
}

type Banco = {
  keyword?: Record<string, unknown> | null;
  workflow?: Record<string, unknown> | null;
  previousSubject?: DeclaredSubject | null;
  previousPrincipal?: string | null;
  siloPage?: boolean;
  appendLatest?: Record<string, unknown> | null;
};

/** O banco responde pela tabela e pelas colunas pedidas; o que não conhece é erro do teste. */
function banco(estado: Banco): FakeDb {
  const db: FakeDb = new FakeDb(call => {
    if (call.op === "insert") {
      const payload = db.inserted.at(-1)?.payload as Record<string, unknown>;
      return { data: { ...payload, created_at: "2026-09-24T12:30:00+00:00" }, error: null };
    }
    if (call.table === "minerador_keywords" && call.columns === SUBJECT_GUARD_KEYWORD_COLUMNS) {
      return { data: estado.keyword ?? null, error: null };
    }
    if (call.table === "editorial_workflow_items" && call.columns === SUBJECT_GUARD_WORKFLOW_COLUMNS) {
      return { data: estado.workflow ?? null, error: null };
    }
    if (call.table === "editorial_artifact_versions" && call.columns === SUBJECT_GUARD_PREVIOUS_COLUMNS) {
      if (estado.previousSubject === undefined && estado.previousPrincipal === undefined) return { data: null, error: null };
      return { data: { version_id: "v-anterior", subject: estado.previousSubject ?? null, principalKeywordId: estado.previousPrincipal ?? null }, error: null };
    }
    if (call.table === "editorial_artifact_versions" && call.columns === "version_id") {
      return { data: estado.siloPage ? { version_id: "page-v1" } : null, error: null };
    }
    if (call.table === "editorial_artifact_versions" && call.columns === "*") {
      return { data: estado.appendLatest ?? null, error: null };
    }
    throw new Error(`leitura inesperada: ${call.table} ${call.columns}`);
  });
  return db;
}

/** Linha do Minerador e item de workflow, como o banco os devolve para a guarda. */
function bancoDoAssunto(linha = linhaDoAssunto(), extra: Banco = {}): Banco {
  const workflow = linha.canonicalWorkflow as { state: string; payload: { approvedDna?: unknown } } | undefined;
  return {
    keyword: { id: linha.id, brand_id: linha.brand_id, keyword: linha.keyword, deleted_at: null },
    workflow: workflow ? { state: workflow.state, approvedDna: workflow.payload.approvedDna ?? null } : null,
    ...extra,
  };
}

function artigo(subject?: DeclaredSubject, principal = PRINCIPAL): ArticleDNA {
  return ArticleDNASchema.parse({
    schemaVersion: 1,
    articleId: "article-marketing-clinicas",
    brandId: MARCA,
    principalKeywordId: principal,
    secondaryKeywordIds: [],
    narrativeReinforcementIds: [],
    keywordReferences: [{
      keywordId: principal,
      keywordDnaVersionId: `legacy:dna-${principal}:v1`,
      keywordDnaContentHash: `legacy:dna-${principal}`,
      role: "principal",
      strategicContribution: "Âncora de busca do artigo.",
      coveredIntentions: ["informacional"],
      requiredTopics: [],
      excludedTopics: [],
      classificationOrigin: "human",
      confidence: 0.8,
      humanConfirmed: true,
      volume: 880,
      resultCount: 40,
      kgrScore: 0.18,
    }],
    siloId: null,
    hierarchy: "Suporte",
    suggestedSlug: "marketing-para-clinicas",
    canonical: null,
    mainIntent: "informacional",
    auxiliaryIntents: [],
    audience: "Gestores de clínicas",
    problem: "Poucos pacientes",
    desiredResult: "Agenda previsível",
    journeyStage: "TOFU",
    brandObjective: "Levar à oferta",
    promise: "Cobrir o tema",
    angle: "Do anúncio ao orgânico",
    cta: "Conhecer o serviço",
    coverage: ["canais de aquisição"],
    excludedSubjects: [],
    antiCannibalizationBoundary: "Não trata de finanças.",
    nearbyArticleIds: [],
    differentiation: [],
    entities: [],
    requiredTopics: [],
    questions: [],
    objections: [],
    evidenceNeeded: [],
    sourcesNeeded: [],
    internalLinks: [],
    alerts: [],
    confidence: 0.7,
    humanPendingDecisions: [],
    ...(subject ? { subject } : {}),
  });
}

function silo(subject?: DeclaredSubject): SiloDNA {
  const base = deterministicSiloDnaPayload("silo-clinicas", "Marketing para clínicas", [], { brandId: MARCA });
  return SiloDNASchema.parse({ ...base, ...(subject ? { subject } : {}) });
}

const envelope = <T extends ArticleDNA | SiloDNA>(entityId: string, payload: T, origin: "human" | "ai" = "human") =>
  createVersionEnvelope({ entityId, versionNumber: 2, previousVersionId: null, origin, changeReason: "teste", createdBy: ATOR, payload }) as Promise<VersionEnvelope<T>>;

async function recusa(promessa: Promise<unknown>, subjectCode: string, status: number) {
  await assert.rejects(promessa, (error: unknown) => {
    assert.ok(error instanceof SubjectWriteRefusedError, String(error));
    assert.equal(error.subjectCode, subjectCode);
    assert.equal(error.status, status);
    assert.match(error.message, new RegExp(`Assunto recusado \\(${subjectCode}\\)`));
    return true;
  });
}

/* ------------------------------ ArticleDNA e SiloDNA ------------------------------ */

test("humano válido: grava, com leitura estreita por id", async () => {
  const db = banco(bancoDoAssunto());
  const version = await envelope("article-marketing-clinicas", artigo(subjectDoPacote()));
  const persisted = await appendArquitetoArtifact(context(db), "article_dna", version);
  assert.equal(persisted.status, "PERSISTED");
  assert.equal(db.inserted.length, 1);
  const leituras = db.calls.filter(call => call.op === "select").map(call => `${call.table}|${call.columns}`);
  assert.deepEqual(leituras.slice(0, 3), [
    `editorial_artifact_versions|${SUBJECT_GUARD_PREVIOUS_COLUMNS}`,
    `minerador_keywords|${SUBJECT_GUARD_KEYWORD_COLUMNS}`,
    `editorial_workflow_items|${SUBJECT_GUARD_WORKFLOW_COLUMNS}`,
  ]);
  assert.equal(SUBJECT_GUARD_WORKFLOW_COLUMNS.includes("payload->approvedDna"), true, "só o pacote, não o payload inteiro");
  assert.equal(SUBJECT_GUARD_PREVIOUS_COLUMNS.includes("payload->subject"), true, "só o Assunto da versão anterior");
  const keywordRead = db.calls.find(call => call.table === "minerador_keywords");
  assert.deepEqual(keywordRead?.filters, [["id", ASSUNTO]]);
  const workflowRead = db.calls.find(call => call.table === "editorial_workflow_items");
  assert.deepEqual(workflowRead?.filters, [["marca_id", MARCA], ["subject_type", "keyword"], ["stage", "architect"], ["subject_id", ASSUNTO]]);
});

test("IA como attachedBy: recusada, nada gravado", async () => {
  const db = banco(bancoDoAssunto());
  const version = await envelope("article-marketing-clinicas", artigo({ ...subjectDoPacote(), attachedBy: "deepseek" }), "ai");
  await recusa(appendArquitetoArtifact(context(db), "article_dna", version), "SUBJECT_ACTOR_MISMATCH", 403);
  assert.equal(db.inserted.length, 0);
});

test("attachedBy de outra pessoa que não o ator da requisição: recusado", async () => {
  const db = banco(bancoDoAssunto());
  const version = await envelope("article-marketing-clinicas", artigo(subjectDoPacote()));
  await recusa(appendArquitetoArtifact(context(db, "7c6b5a49-3827-4165-9403-f2e1d0c9b8a7"), "article_dna", version), "SUBJECT_ACTOR_MISMATCH", 403);
  assert.equal(db.inserted.length, 0);
});

test("keyword de outra marca: recusada sem ler o pacote dela", async () => {
  const db = banco(bancoDoAssunto(linhaDoAssunto({ brandId: OUTRA_MARCA })));
  const version = await envelope("article-marketing-clinicas", artigo(subjectDoPacote()));
  await recusa(appendArquitetoArtifact(context(db), "article_dna", version), "SUBJECT_CROSS_BRAND", 403);
  assert.equal(db.calls.some(call => call.table === "editorial_workflow_items"), false);
  assert.equal(db.inserted.length, 0);
});

test("keyword que o pacote não declara Assunto: recusada", async () => {
  const db = banco(bancoDoAssunto(linhaDoAssunto({ semantic: logica({ entity: "x" }) })));
  const version = await envelope("article-marketing-clinicas", artigo(subjectDoPacote()));
  await recusa(appendArquitetoArtifact(context(db), "article_dna", version), "SUBJECT_NOT_DECLARED", 409);
  assert.equal(db.inserted.length, 0);
});

test("snapshot divergente do pacote: recusado", async () => {
  const db = banco(bancoDoAssunto());
  const version = await envelope("article-marketing-clinicas", artigo({ ...subjectDoPacote(), phrase: "SEO para dentistas" }));
  await recusa(appendArquitetoArtifact(context(db), "article_dna", version), "SUBJECT_PACKAGE_MISMATCH", 409);
  assert.equal(db.inserted.length, 0);
});

test("subject igual ao da versão anterior: grava sem conferir a keyword (quem carrega não prende de novo)", async () => {
  const anterior = subjectDoPacote(linhaDoAssunto(), "7c6b5a49-3827-4165-9403-f2e1d0c9b8a7");
  const db = banco({ previousSubject: JSON.parse(JSON.stringify(anterior)) });
  const version = await envelope("article-marketing-clinicas", artigo(anterior));
  const persisted = await appendArquitetoArtifact(context(db), "article_dna", version);
  assert.equal(persisted.status, "PERSISTED");
  assert.equal(db.calls.some(call => call.table === "minerador_keywords" || call.table === "editorial_workflow_items"), false);
});

test("sem Assunto: nenhuma leitura nova, a gravação é a de antes", async () => {
  const db = banco({});
  const version = await envelope("article-marketing-clinicas", artigo());
  await appendArquitetoArtifact(context(db), "article_dna", version);
  assert.deepEqual(db.calls.map(call => `${call.table}|${call.op}|${call.columns}`), [
    "editorial_artifact_versions|select|*",
    "editorial_artifact_versions|insert|*",
  ]);
});

test("restauração: o autor gravado é o humano de então; IA continua recusada", async () => {
  const deOutro = subjectDoPacote(linhaDoAssunto(), "7c6b5a49-3827-4165-9403-f2e1d0c9b8a7");
  const db = banco(bancoDoAssunto());
  const version = await envelope("article-marketing-clinicas", artigo(deOutro));
  const persisted = await appendArquitetoArtifact(context(db), "article_dna", version, "approved", { subjectActor: "restored" });
  assert.equal(persisted.status, "PERSISTED");
  const ia = await envelope("article-marketing-clinicas", artigo({ ...deOutro, attachedBy: "deepseek" }));
  await recusa(appendArquitetoArtifact(context(banco(bancoDoAssunto())), "article_dna", ia, "approved", { subjectActor: "restored" }), "SUBJECT_ACTOR_MISMATCH", 403);
});

test("SiloDNA: Assunto novo num Silo SEM página grava; COM página é recusado com motivo claro", async () => {
  const semPagina = banco(bancoDoAssunto());
  await appendArquitetoArtifact(context(semPagina), "silo_dna", await envelope("silo-clinicas", silo(subjectDoPacote())));
  assert.equal(semPagina.inserted.length, 1);

  const comPagina = banco(bancoDoAssunto(linhaDoAssunto(), { siloPage: true }));
  await recusa(appendArquitetoArtifact(context(comPagina), "silo_dna", await envelope("silo-clinicas", silo(subjectDoPacote()))), "SUBJECT_SILO_PAGE_BOUND", 409);
  assert.equal(comPagina.inserted.length, 0);
});

test("par SiloDNA + SiloPage (consolidação): o Assunto carregado da versão anterior passa; o novo é conferido", async () => {
  const subject = subjectDoPacote();
  const dnaVersion = await envelope("silo-clinicas", silo(subject));
  const page = await createVersionEnvelope({ entityId: "silo-page:silo-clinicas", versionNumber: 1, origin: "human", changeReason: "t", createdBy: ATOR, payload: deterministicSiloPagePayload(dnaVersion, MARCA, "marketing-para-clinicas") });

  const carregado = banco({ previousSubject: subject });
  await assert.rejects(persistSiloPairAtomic(context(carregado), dnaVersion, page, { siloDna: "approved", siloPage: "approved" }), (error: unknown) => !(error instanceof SubjectWriteRefusedError));
  assert.deepEqual(carregado.rpcs, ["persist_silo_pair_atomic"], "a guarda deixou passar até a transação");
  assert.equal(carregado.calls.some(call => call.table === "minerador_keywords"), false);

  const ia = await envelope("silo-clinicas", silo({ ...subject, attachedBy: "deepseek" }));
  const pageIa = await createVersionEnvelope({ entityId: "silo-page:silo-clinicas", versionNumber: 1, origin: "human", changeReason: "t", createdBy: ATOR, payload: deterministicSiloPagePayload(ia, MARCA, "marketing-para-clinicas") });
  const novo = banco(bancoDoAssunto());
  await recusa(persistSiloPairAtomic(context(novo), ia, pageIa, { siloDna: "approved", siloPage: "approved" }), "SUBJECT_ACTOR_MISMATCH", 403);
  assert.deepEqual(novo.rpcs, []);
});

test("a resposta de erro carrega o código do Assunto, aditivo ao contrato", () => {
  const mapped = pipelineArtifactErrorResponse(new SubjectWriteRefusedError("SUBJECT_CROSS_BRAND", "outra marca"));
  assert.equal(mapped.status, 403);
  assert.deepEqual(mapped.body, { success: false, error: "Assunto recusado (SUBJECT_CROSS_BRAND): outra marca", code: "NOT_AUTHORIZED", subjectCode: "SUBJECT_CROSS_BRAND" });
});

/* ------------------------- vínculo na cópia de trabalho ------------------------- */

const anchor = (extra: Record<string, unknown> = {}) => ({ candidateRef: "article-formation:f1", subjectKeywordId: ASSUNTO, attachedBy: ATOR, attachedAt: ATTACHED_AT, ...extra });

test("vínculo da cópia de trabalho: humano válido aceito; IA, outra marca e não declarado recusados", async () => {
  await assertWorkingSubjectAnchorAssignment(context(banco(bancoDoAssunto())), {}, { articleSubjectAnchor: anchor() });
  await recusa(assertWorkingSubjectAnchorAssignment(context(banco(bancoDoAssunto())), {}, { articleSubjectAnchor: anchor({ attachedBy: "deepseek" }) }), "SUBJECT_ACTOR_MISMATCH", 403);
  await recusa(assertWorkingSubjectAnchorAssignment(context(banco(bancoDoAssunto(linhaDoAssunto({ brandId: OUTRA_MARCA })))), {}, { articleSubjectAnchor: anchor() }), "SUBJECT_CROSS_BRAND", 403);
  await recusa(assertWorkingSubjectAnchorAssignment(context(banco(bancoDoAssunto(linhaDoAssunto({ semantic: logica({ entity: "x" }) })))), {}, { articleSubjectAnchor: anchor() }), "SUBJECT_NOT_DECLARED", 409);
  await recusa(assertWorkingSubjectAnchorAssignment(context(banco(bancoDoAssunto(linhaDoAssunto({ semPacote: true })))), {}, { articleSubjectAnchor: anchor() }), "SUBJECT_NO_APPROVED_PACKAGE", 409);
});

test("vínculo igual ao gravado, soltar ou atribuição sem o campo: nenhuma leitura", async () => {
  for (const [atual, atribuicao] of [
    [{ articleSubjectAnchor: anchor({ attachedBy: "7c6b5a49-3827-4165-9403-f2e1d0c9b8a7" }) }, { articleSubjectAnchor: anchor({ attachedBy: "7c6b5a49-3827-4165-9403-f2e1d0c9b8a7" }) }],
    [{ articleSubjectAnchor: anchor() }, { articleSubjectAnchor: null }],
    [{}, { articleFormationRef: "article-formation:f1" }],
  ] as Array<[Record<string, unknown>, Record<string, unknown>]>) {
    const db = banco({});
    await assertWorkingSubjectAnchorAssignment(context(db), atual, atribuicao);
    assert.equal(db.calls.length, 0);
  }
});

test("a rota da cópia de trabalho aceita o campo opcional e confere antes de gravar", () => {
  const rota = readFileSync("app/api/arquiteto/workspace/route.ts", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  assert.match(rota, /articleSubjectAnchor: WorkingSubjectAnchorSchema\.nullable\(\)\.optional\(\),/);
  const patch = rota.slice(rota.indexOf("export async function PATCH"));
  const guarda = patch.indexOf("await assertWorkingSubjectAnchorAssignment(context, currentPayload, update.assignment);");
  assert.ok(guarda > 0, "a rota chama a guarda");
  assert.ok(guarda < patch.indexOf("await repository.update("), "a guarda roda antes de gravar");
});

/* ---------------------- Q7 para quem carrega o Assunto ---------------------- */

const OUTRO_HUMANO = "7c6b5a49-3827-4165-9403-f2e1d0c9b8a7";

test("Q7: subject igual ao anterior, mas a principal vira o próprio Assunto sem Volume validado: recusado", async () => {
  const anterior = subjectDoPacote(linhaDoAssunto(), OUTRO_HUMANO);
  const db = banco(bancoDoAssunto(linhaDoAssunto(), { previousSubject: JSON.parse(JSON.stringify(anterior)), previousPrincipal: PRINCIPAL }));
  const version = await envelope("article-marketing-clinicas", artigo(anterior, ASSUNTO));
  await recusa(appendArquitetoArtifact(context(db), "article_dna", version), "SUBJECT_PRINCIPAL_WITHOUT_VOLUME", 409);
  assert.equal(db.inserted.length, 0);
  const keywordRead = db.calls.find(call => call.table === "minerador_keywords");
  assert.deepEqual(keywordRead?.filters, [["id", ASSUNTO]], "leitura estreita, por id");
});

test("Q7: com Volume validado no pacote, carregar o Assunto como principal grava", async () => {
  const linha = linhaDoAssunto({ semantic: { ...logica({ entity: "marketing para clínicas" }), ...declarado(), ...VOLUME_VALIDADO } });
  const anterior = subjectDoPacote(linha, OUTRO_HUMANO);
  const db = banco(bancoDoAssunto(linha, { previousSubject: anterior, previousPrincipal: PRINCIPAL }));
  const persisted = await appendArquitetoArtifact(context(db), "article_dna", await envelope("article-marketing-clinicas", artigo(anterior, ASSUNTO)));
  assert.equal(persisted.status, "PERSISTED");
});

test("Q7: a versão anterior já tinha o Assunto como principal, nada é relido", async () => {
  const anterior = subjectDoPacote(linhaDoAssunto(), OUTRO_HUMANO);
  const db = banco({ previousSubject: anterior, previousPrincipal: ASSUNTO });
  const persisted = await appendArquitetoArtifact(context(db), "article_dna", await envelope("article-marketing-clinicas", artigo(anterior, ASSUNTO)));
  assert.equal(persisted.status, "PERSISTED");
  assert.equal(db.calls.some(call => call.table === "minerador_keywords" || call.table === "editorial_workflow_items"), false);
});

/* ------------------ consolidação canônica do Silo (RPC A) ------------------ */

const consolida = (db: FakeDb, subject: DeclaredSubject | undefined, ator = ATOR) =>
  assertConsolidatedSiloSubject(context(db, ator), { entityId: "silo-clinicas", subject });

test("consolidação: IA, outro ator, outra marca, não declarado e pacote divergente são recusados", async () => {
  await recusa(consolida(banco(bancoDoAssunto()), { ...subjectDoPacote(), attachedBy: "deepseek" }), "SUBJECT_ACTOR_MISMATCH", 403);
  await recusa(consolida(banco(bancoDoAssunto()), subjectDoPacote(), OUTRO_HUMANO), "SUBJECT_ACTOR_MISMATCH", 403);
  const outraMarca = banco(bancoDoAssunto(linhaDoAssunto({ brandId: OUTRA_MARCA })));
  await recusa(consolida(outraMarca, subjectDoPacote()), "SUBJECT_CROSS_BRAND", 403);
  assert.equal(outraMarca.calls.some(call => call.table === "editorial_workflow_items"), false, "o pacote de outra marca não é lido");
  await recusa(consolida(banco(bancoDoAssunto(linhaDoAssunto({ semantic: logica({ entity: "x" }) }))), subjectDoPacote()), "SUBJECT_NOT_DECLARED", 409);
  await recusa(consolida(banco(bancoDoAssunto()), { ...subjectDoPacote(), phrase: "SEO para dentistas" }), "SUBJECT_PACKAGE_MISMATCH", 409);
});

test("consolidação: Assunto carregado igual ao vigente passa sem ler a keyword; novo válido passa sem a trava da página", async () => {
  const anterior = subjectDoPacote(linhaDoAssunto(), OUTRO_HUMANO);
  const carregado = banco({ previousSubject: JSON.parse(JSON.stringify(anterior)) });
  await consolida(carregado, anterior);
  assert.deepEqual(carregado.calls.map(call => `${call.table}|${call.columns}`), [`editorial_artifact_versions|${SUBJECT_GUARD_PREVIOUS_COLUMNS}`]);

  const novo = banco(bancoDoAssunto(linhaDoAssunto(), { siloPage: true }));
  await consolida(novo, subjectDoPacote());
  assert.equal(novo.calls.some(call => call.columns === "version_id"), false, "o par versiona a página junto");
});

test("consolidação: sem Assunto, só a leitura estreita da versão vigente; perder o Assunto é recusado", async () => {
  const semAssunto = banco({});
  await consolida(semAssunto, undefined);
  assert.deepEqual(semAssunto.calls.map(call => `${call.table}|${call.op}|${call.columns}`), [
    `editorial_artifact_versions|select|${SUBJECT_GUARD_PREVIOUS_COLUMNS}`,
  ]);
  assert.deepEqual(semAssunto.calls[0].filters, [["marca_id", MARCA], ["entity_id", "silo-clinicas"], ["artifact_type", "silo_dna"]]);

  const perdeu = banco({ previousSubject: subjectDoPacote() });
  await recusa(consolida(perdeu, undefined), "SUBJECT_DROPPED", 409);
  assert.equal(perdeu.calls.some(call => call.table === "minerador_keywords"), false);
});

test("o adaptador da consolidação confere o Assunto depois dos gates e antes da RPC", () => {
  const adapter = readFileSync("lib/server/arquiteto-silo-consolidation-adapter.ts", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  const guarda = adapter.indexOf("await assertConsolidatedSiloSubject(context, {");
  const rpc = adapter.indexOf('.rpc("persist_silo_from_working_copy_atomic"');
  assert.ok(guarda > 0, "o adaptador chama a guarda");
  assert.ok(guarda < rpc, "a guarda roda antes da RPC");
  assert.ok(adapter.indexOf("refuseStatusEscalation({") < guarda, "depois dos gates de binding");
  assert.match(adapter, /entityId: request\.siloDna\.entityId,\s*subject: request\.siloDna\.payload\.subject,/);
});

test("nenhuma chamada de rede", () => {
  assert.equal(chamadasDeRede, 0);
});
