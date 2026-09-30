import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

/*
 * `next/server` não resolve no ESM do Node sem extensão, e a rota só usa
 * `NextResponse.json`: um dublê mínimo, com a mesma forma de resposta. A rota
 * é importada DEPOIS do registro, por import dinâmico.
 */
register(`data:text/javascript,${encodeURIComponent(
  "export async function resolve(especificador, contexto, proximo) {"
  + " if (especificador === 'next/server') return { shortCircuit: true, url: 'data:text/javascript,' + encodeURIComponent("
  + "\"export const NextResponse = { json: (corpo, opcoes) => new Response(JSON.stringify(corpo), { status: (opcoes && opcoes.status) || 200, headers: { 'Content-Type': 'application/json' } }) };\") };"
  + " return proximo(especificador, contexto); }",
)}`);

/**
 * DESFAZER SILO SUGERIDO, NO SERVIDOR — a rota do workspace executada de
 * verdade (`PATCH` com `territoryUndos`), com o contexto autorizado passado
 * direto e um banco em memória com a forma do `postgrest-js`. Nenhuma rede,
 * nenhum banco remoto.
 *
 * Prova: o território vira `rejected` com ator e motivo, cada keyword volta
 * para "sem Silo" pela decisão de Silo, nada é apagado, e as recusas
 * (endereço publicado, ArticleDNA aprovado, SiloDNA aprovado, keyword
 * publicada, lock vencido) acontecem ANTES de qualquer escrita.
 */

delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const { handleArchitectWorkspacePatch } = await import("../lib/server/arquiteto-workspace-http.ts");
const { manualSiloCandidateDraft } = await import("../lib/arquiteto/silo-assignment.ts");
const { TERRITORY_UNDO_KEYWORD_REASON } = await import("../lib/arquiteto/territory-undo.ts");

const MARCA = "61d2e019-f44f-4fa3-af2f-d86b95628ab3";
const OUTRA_MARCA = "09762023-d0d4-4c24-b34e-d0fdfd43f891";
const ATOR = "11111111-1111-4111-8111-111111111111";
const REF = "territory:33333333-3333-4333-8333-333333333333";
const KW_A = "aaaaaaaa-0000-4000-8000-000000000001";
const KW_B = "aaaaaaaa-0000-4000-8000-000000000002";
const KW_FORA = "aaaaaaaa-0000-4000-8000-000000000003";
const ITEM_A = "bbbbbbbb-0000-4000-8000-000000000001";
const ITEM_B = "bbbbbbbb-0000-4000-8000-000000000002";
const ITEM_FORA = "bbbbbbbb-0000-4000-8000-000000000003";
const ITEM_SILO = "cccccccc-0000-4000-8000-000000000001";

/* ------------------------------ banco em memória ----------------------------- */

type Row = Record<string, unknown>;
type Filtro = { coluna: string; tipo: "eq" | "in" | "is"; valor: unknown };

function caminho(linha: Row, expressao: string): unknown {
  const partes = expressao.split(/->>?/);
  let valor: unknown = linha;
  for (const parte of partes) valor = valor && typeof valor === "object" ? (valor as Row)[parte] : undefined;
  if (expressao.includes("->>") && valor !== undefined && valor !== null) valor = String(valor);
  return valor;
}

function projetar(linha: Row, colunas: string): Row {
  if (colunas === "*") return structuredClone(linha);
  return Object.fromEntries(colunas.split(",").map(item => {
    const [apelido, expressao] = item.includes(":") ? item.split(":") : [item, item];
    const valor = caminho(linha, expressao);
    return [apelido, valor === undefined ? null : structuredClone(valor)];
  }));
}

class Consulta {
  op: "select" | "update" = "select";
  colunas = "*";
  filtros: Filtro[] = [];
  valores: Row | null = null;
  unica = false;
  faixa: [number, number] | null = null;
  readonly banco: Banco;
  readonly tabela: string;
  constructor(banco: Banco, tabela: string) { this.banco = banco; this.tabela = tabela; }
  select(colunas = "*") { this.colunas = colunas; return this; }
  eq(coluna: string, valor: unknown) { this.filtros.push({ coluna, tipo: "eq", valor }); return this; }
  in(coluna: string, valor: unknown[]) { this.filtros.push({ coluna, tipo: "in", valor: [...valor] }); return this; }
  is(coluna: string, valor: unknown) { this.filtros.push({ coluna, tipo: "is", valor }); return this; }
  order() { return this; }
  range(de: number, ate: number) { this.faixa = [de, ate]; return this; }
  update(valores: Row) { this.op = "update"; this.valores = valores; return this; }
  maybeSingle() { this.unica = true; return this; }
  single() { this.unica = true; return this; }
  then<A, B = never>(resolve: (valor: { data: unknown; error: unknown }) => A, reject?: (motivo: unknown) => B) {
    return Promise.resolve().then(() => this.banco.executar(this)).then(resolve, reject);
  }
}

class Banco {
  tabelas: Record<string, Row[]> = {};
  escritas: Array<{ tabela: string; id: unknown }> = [];
  from(tabela: string) { return new Consulta(this, tabela); }
  linhas(tabela: string) { return (this.tabelas[tabela] ||= []); }
  executar(consulta: Consulta) {
    const alvo = this.linhas(consulta.tabela).filter(linha => consulta.filtros.every(({ coluna, tipo, valor }) => {
      const atual = coluna.includes("->") ? caminho(linha, coluna) : linha[coluna];
      if (tipo === "eq") return atual === valor;
      if (tipo === "is") return (atual ?? null) === valor;
      return (valor as unknown[]).some(item => String(item).toLowerCase() === String(atual).toLowerCase());
    }));
    if (consulta.op === "update") {
      for (const linha of alvo) {
        Object.assign(linha, structuredClone(consulta.valores!), { lock_version: Number(linha.lock_version) + 1 });
        this.escritas.push({ tabela: consulta.tabela, id: linha.id });
      }
    }
    let projetadas = alvo.map(linha => projetar(linha, consulta.colunas));
    if (consulta.faixa) projetadas = projetadas.slice(consulta.faixa[0], consulta.faixa[1] + 1);
    return { data: consulta.unica ? projetadas[0] ?? null : projetadas, error: null };
  }
}

/* ---------------------------------- cenário ---------------------------------- */

function territorio(extra: Record<string, unknown> = {}) {
  return {
    ...manualSiloCandidateDraft({ name: "limpeza de pele com peeling", slug: "limpeza-de-pele" }),
    territoryRef: REF,
    brandId: MARCA,
    lifecycleStatus: "confirmed",
    decisionState: "confirmed",
    ...extra,
  };
}

function itemKeyword(id: string, keywordId: string, territoryRef: string | null, marca = MARCA): Row {
  return {
    id, marca_id: marca, subject_type: "keyword", subject_id: keywordId, article_id: null, stage: "architect", state: "received",
    source_entity_id: keywordId, lock_version: 3, created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z",
    payload: { territoryRef, territoryAssignment: territoryRef ? { state: "existing_silo_match", reason: "Proposta confirmada.", source: "human", decidedAt: "2026-09-01T00:00:00Z" } : null },
  };
}

function montar(opcoes: { territorio?: Record<string, unknown>; artigos?: Row[]; silos?: Row[]; statusB?: string; estadoB?: string } = {}) {
  const banco = new Banco();
  const t = territorio(opcoes.territorio);
  banco.tabelas.editorial_workflow_items = [
    {
      id: ITEM_SILO, marca_id: MARCA, subject_type: "territory", subject_id: REF, article_id: null, stage: "architect",
      state: t.lifecycleStatus, source_entity_id: REF, lock_version: 7, created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z",
      payload: { contractVersion: "territory-record-v1", territory: t },
    },
    itemKeyword(ITEM_A, KW_A, REF),
    { ...itemKeyword(ITEM_B, KW_B, REF), state: opcoes.estadoB ?? "received" },
    itemKeyword(ITEM_FORA, KW_FORA, null),
    // Mesma ref, OUTRA marca: nunca é lida nem escrita.
    itemKeyword("bbbbbbbb-0000-4000-8000-000000000009", KW_A, REF, OUTRA_MARCA),
  ];
  banco.tabelas.minerador_keywords = [
    { id: KW_A, brand_id: MARCA, keyword: "limpeza de pele", status: "aprovado" },
    { id: KW_B, brand_id: MARCA, keyword: "peeling facial", status: opcoes.statusB ?? "aprovado" },
    { id: KW_FORA, brand_id: MARCA, keyword: "botox", status: "aprovado" },
  ];
  banco.tabelas.editorial_artifact_versions = [...(opcoes.artigos || []), ...(opcoes.silos || [])];
  const context = {
    actorUserId: ATOR, brandId: MARCA, module: "arquiteto", action: "edit", permissions: ["arquiteto:edit"] as const,
    authorizationSource: "canonical_actor_rpc" as const, supabase: banco as never,
  };
  return { banco, context };
}

async function patch(context: unknown, corpo: Record<string, unknown>) {
  const resposta = await handleArchitectWorkspacePatch(
    new Request("http://local/api/arquiteto/workspace", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ brandId: MARCA, ...corpo }) }),
    context as never,
  );
  return { status: resposta.status, corpo: await resposta.json() as Record<string, unknown> };
}

const linha = (banco: Banco, id: string) => banco.linhas("editorial_workflow_items").find(item => item.id === id)!;

/* ----------------------------------- testes ---------------------------------- */

test("desfaz o Silo sugerido: território rejeitado com ator e motivo, keywords em sem Silo, nada apagado", async () => {
  const { banco, context } = montar();
  const antes = banco.linhas("editorial_workflow_items").length;
  const { status, corpo } = await patch(context, { territoryUndos: [{ territoryRef: REF, expectedLock: 7 }] });
  assert.equal(status, 200, JSON.stringify(corpo));

  const silo = linha(banco, ITEM_SILO);
  const gravado = (silo.payload as { territory: Record<string, unknown> }).territory;
  assert.equal(silo.state, "rejected");
  assert.equal(gravado.lifecycleStatus, "rejected");
  assert.equal(gravado.decisionState, "rejected");
  assert.equal(silo.lock_version, 8);
  assert.equal(silo.updated_by, ATOR);
  assert.match(String((gravado.reasons as string[]).at(-1)), new RegExp(`ator ${ATOR}.*Nada foi apagado; 2 keyword`));
  // Primária, slug e nome continuam como estavam: só o lifecycle mudou.
  assert.equal(gravado.name, "limpeza de pele com peeling");

  for (const id of [ITEM_A, ITEM_B]) {
    const item = linha(banco, id);
    const payload = item.payload as Record<string, unknown>;
    assert.equal(payload.territoryRef, null);
    assert.deepEqual({ ...(payload.territoryAssignment as Record<string, unknown>), decidedAt: "-" }, { state: "unassigned", reason: TERRITORY_UNDO_KEYWORD_REASON, source: "human", decidedAt: "-" });
    assert.equal(payload.manualEdit, true);
    assert.equal(item.lock_version, 4);
    assert.equal(item.updated_by, ATOR);
  }
  assert.equal(linha(banco, ITEM_FORA).lock_version, 3, "keyword fora do Silo não é tocada");
  assert.equal(linha(banco, "bbbbbbbb-0000-4000-8000-000000000009").lock_version, 3, "a outra marca não é tocada");
  assert.equal(banco.linhas("editorial_workflow_items").length, antes, "nenhuma linha some");

  const territorios = (corpo.data as { territories: Array<{ territory: { lifecycleStatus: string } }> }).territories;
  assert.equal(territorios[0].territory.lifecycleStatus, "rejected");
});

const semEscrita = (banco: Banco) => assert.deepEqual(banco.escritas, [], "a recusa acontece antes de qualquer escrita");

test("recusa Silo com endereço publicado, sem escrever nada", async () => {
  const { banco, context } = montar({ territorio: {
    publicationProtection: "protected",
    slugState: { proposals: [], confirmed: null, publishedSlug: "/estetica/limpeza-de-pele", publishedCanonical: null },
  } });
  const { status, corpo } = await patch(context, { territoryUndos: [{ territoryRef: REF, expectedLock: 7 }] });
  assert.equal(status, 409);
  assert.match(String(corpo.error), /endereço publicado/);
  semEscrita(banco);
});

test("recusa quando há ArticleDNA aprovado com keyword do Silo", async () => {
  const { banco, context } = montar({ artigos: [{
    version_id: "v-1", marca_id: MARCA, artifact_type: "article_dna", status: "approved",
    payload: { articleId: "art-1", suggestedSlug: "limpeza-de-pele-profunda", principalKeywordId: KW_B, secondaryKeywordIds: [], narrativeReinforcementIds: [] },
  }, {
    // Proposto (não aprovado) e de outra marca: não bloqueiam.
    version_id: "v-2", marca_id: MARCA, artifact_type: "article_dna", status: "proposed",
    payload: { articleId: "art-2", principalKeywordId: KW_A, secondaryKeywordIds: [], narrativeReinforcementIds: [] },
  }] });
  const { status, corpo } = await patch(context, { territoryUndos: [{ territoryRef: REF, expectedLock: 7 }] });
  assert.equal(status, 409);
  assert.match(String(corpo.error), /1 artigo\(s\) aprovado\(s\).*limpeza-de-pele-profunda/);
  semEscrita(banco);
});

test("ArticleDNA aprovado de outra marca ou só proposto não bloqueia", async () => {
  const { context } = montar({ artigos: [{
    version_id: "v-3", marca_id: OUTRA_MARCA, artifact_type: "article_dna", status: "approved",
    payload: { articleId: "art-3", principalKeywordId: KW_A, secondaryKeywordIds: [], narrativeReinforcementIds: [] },
  }] });
  const { status } = await patch(context, { territoryUndos: [{ territoryRef: REF, expectedLock: 7 }] });
  assert.equal(status, 200);
});

test("recusa quando o Silo já tem SiloDNA aprovado", async () => {
  const { banco, context } = montar({ silos: [{
    version_id: "s-1", marca_id: MARCA, artifact_type: "silo_dna", status: "approved", payload: { territoryRef: REF, siloId: "silo-1" },
  }] });
  const { status, corpo } = await patch(context, { territoryUndos: [{ territoryRef: REF, expectedLock: 7 }] });
  assert.equal(status, 409);
  assert.match(String(corpo.error), /SiloDNA aprovado/);
  semEscrita(banco);
});

test("recusa quando uma keyword do Silo é publicada", async () => {
  const { banco, context } = montar({ statusB: "publicado" });
  const { status, corpo } = await patch(context, { territoryUndos: [{ territoryRef: REF, expectedLock: 7 }] });
  assert.equal(status, 409);
  assert.match(String(corpo.error), /publicada/);
  semEscrita(banco);
});

test("recusa quando uma keyword do Silo não está editável no Arquiteto, sem escrever nada", async () => {
  const { banco, context } = montar({ estadoB: "sent" });
  const { status, corpo } = await patch(context, { territoryUndos: [{ territoryRef: REF, expectedLock: 7 }] });
  assert.equal(status, 409);
  assert.match(String(corpo.error), /1 keyword\(s\) deste Silo não estão editáveis no Arquiteto agora \(peeling facial\)/);
  semEscrita(banco);
});

test("ArticleDNA aprovado no envelope legado (payload.payload) também recusa", async () => {
  const { banco, context } = montar({ artigos: [{
    version_id: "v-4", marca_id: MARCA, artifact_type: "article_dna", status: "approved",
    payload: { payload: { articleId: "art-4", suggestedSlug: "peeling-envelope", principalKeywordId: KW_A, secondaryKeywordIds: [], narrativeReinforcementIds: [] } },
  }] });
  const { status, corpo } = await patch(context, { territoryUndos: [{ territoryRef: REF, expectedLock: 7 }] });
  assert.equal(status, 409);
  assert.match(String(corpo.error), /1 artigo\(s\) aprovado\(s\).*peeling-envelope/);
  semEscrita(banco);
});

test("SiloDNA aprovado no envelope legado também recusa; o de outro território não", async () => {
  const envelope = montar({ silos: [{
    version_id: "s-2", marca_id: MARCA, artifact_type: "silo_dna", status: "approved", payload: { payload: { territoryRef: REF, siloId: "silo-2" } },
  }] });
  const recusa = await patch(envelope.context, { territoryUndos: [{ territoryRef: REF, expectedLock: 7 }] });
  assert.equal(recusa.status, 409);
  assert.match(String(recusa.corpo.error), /SiloDNA aprovado/);
  semEscrita(envelope.banco);

  const outro = montar({ silos: [{
    version_id: "s-3", marca_id: MARCA, artifact_type: "silo_dna", status: "approved", payload: { territoryRef: "territory:44444444-4444-4444-8444-444444444444" },
  }] });
  assert.equal((await patch(outro.context, { territoryUndos: [{ territoryRef: REF, expectedLock: 7 }] })).status, 200);
});

test("lock vencido recusa antes de tirar qualquer keyword", async () => {
  const { banco, context } = montar();
  const { status, corpo } = await patch(context, { territoryUndos: [{ territoryRef: REF, expectedLock: 6 }] });
  assert.equal(status, 409);
  assert.match(String(corpo.error), /mudou desde a leitura/);
  semEscrita(banco);
});

test("Silo já desfeito não é desfeito de novo", async () => {
  const { banco, context } = montar({ territorio: { lifecycleStatus: "rejected", decisionState: "rejected" } });
  const { status, corpo } = await patch(context, { territoryUndos: [{ territoryRef: REF, expectedLock: 7 }] });
  assert.equal(status, 409);
  assert.match(String(corpo.error), /já foi desfeito/);
  semEscrita(banco);
});

test("a edição genérica do território não rejeita Silo por fora do Desfazer", async () => {
  const { banco, context } = montar();
  const { status, corpo } = await patch(context, { territoryUpdates: [{
    territoryRef: REF, expectedLock: 7, territory: { ...territorio(), lifecycleStatus: "rejected", decisionState: "rejected" },
  }] });
  assert.equal(status, 409);
  assert.match(String(corpo.error), /Desfazer Silo/);
  semEscrita(banco);
});

test("o corpo só leva ref e lock: ator, motivo e keywords não entram pela requisição", async () => {
  const { banco, context } = montar();
  const { status } = await patch(context, { territoryUndos: [{ territoryRef: REF, expectedLock: 7, actorUserId: "outro" }] });
  assert.equal(status, 400);
  semEscrita(banco);
});
