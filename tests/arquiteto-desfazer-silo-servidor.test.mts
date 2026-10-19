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
type Filtro = { coluna: string; tipo: "eq" | "in" | "is" | "not_is"; valor: unknown };

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
  op: "select" | "update" | "delete" = "select";
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
  // 2026-10-18 · `not(col, "is", null)` (a lista dos planos) e `limit` (as leituras do grupo).
  not(coluna: string, _operador: string, valor: unknown) { this.filtros.push({ coluna, tipo: "not_is", valor }); return this; }
  limit(n: number) { this.faixa = [0, n - 1]; return this; }
  order() { return this; }
  range(de: number, ate: number) { this.faixa = [de, ate]; return this; }
  update(valores: Row) { this.op = "update"; this.valores = valores; return this; }
  delete() { this.op = "delete"; return this; }
  maybeSingle() { this.unica = true; return this; }
  single() { this.unica = true; return this; }
  then<A, B = never>(resolve: (valor: { data: unknown; error: unknown }) => A, reject?: (motivo: unknown) => B) {
    return Promise.resolve().then(() => this.banco.executar(this)).then(resolve, reject);
  }
}

class Banco {
  tabelas: Record<string, Row[]> = {};
  escritas: Array<{ tabela: string; id: unknown }> = [];
  /** A permissão de aprovar no Arquiteto (a RPC canônica `canonical_actor_can_use_brand_action`). */
  aprova = true;
  /** Banco sem as tabelas dos grupos (o de antes): a leitura dos grupos falha como "tabela ausente". */
  semGrupos = true;
  from(tabela: string) { return new Consulta(this, tabela); }
  async rpc(nome: string, args: Row) {
    if (nome === "canonical_actor_can_use_brand_action" && args.requested_action === "approve") return { data: this.aprova, error: null };
    return { data: null, error: { code: "PGRST202", message: `Could not find the function public.${nome}` } };
  }
  linhas(tabela: string) { return (this.tabelas[tabela] ||= []); }
  executar(consulta: Consulta) {
    if (this.semGrupos && consulta.tabela.startsWith("editorial_group")) return { data: null, error: { code: "42P01", message: "relation \"public.editorial_groups\" does not exist" } };
    const alvo = this.linhas(consulta.tabela).filter(linha => consulta.filtros.every(({ coluna, tipo, valor }) => {
      const atual = coluna.includes("->") ? caminho(linha, coluna) : linha[coluna];
      if (tipo === "eq") return atual === valor;
      if (tipo === "is") return (atual ?? null) === valor;
      if (tipo === "not_is") return (atual ?? null) !== valor;
      return (valor as unknown[]).some(item => String(item).toLowerCase() === String(atual).toLowerCase());
    }));
    if (consulta.op === "delete") {
      this.tabelas[consulta.tabela] = this.linhas(consulta.tabela).filter(linha => !alvo.includes(linha));
      for (const linha of alvo) this.escritas.push({ tabela: consulta.tabela, id: linha.id ?? linha.article_id });
      return { data: null, error: null };
    }
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

async function patch(context: unknown, corpo: Record<string, unknown>, deps?: Parameters<typeof handleArchitectWorkspacePatch>[2]) {
  const resposta = await handleArchitectWorkspacePatch(
    new Request("http://local/api/arquiteto/workspace", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ brandId: MARCA, ...corpo }) }),
    context as never,
    deps,
  );
  return { status: resposta.status, corpo: await resposta.json() as Record<string, unknown> };
}

/** O writer do evento de status (o de "Retirar artigo do Silo"), gravando no banco em memória. */
const eventosNoBanco = (banco: Banco) => ({
  territoryUndo: {
    appendEvents: async (eventos: Array<{ eventId: string; versionId: string; status: string; reason: string; occurredAt: string }>) => {
      for (const evento of eventos) {
        if (banco.linhas("editorial_version_status_events").some(linha => linha.id === evento.eventId)) continue;
        banco.linhas("editorial_version_status_events").push({ id: evento.eventId, version_id: evento.versionId, status: evento.status, reason: evento.reason, actor_id: ATOR, occurred_at: evento.occurredAt });
        banco.escritas.push({ tabela: "editorial_version_status_events", id: evento.eventId });
      }
    },
  },
});

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

/*
 * 2026-10-18 (decisão do dono, literal: "tem que poder apagar sim não interessa qual seja o estado … e alerta falando o
 * que está apagando") · SUBSTITUI "recusa Silo com endereço publicado": ele sai inteiro, com a prévia dizendo que o site
 * não muda, e só com a confirmação forte.
 */
test("Silo com endereço publicado é o Silo inteiro: a prévia diz que o site não muda; sem a confirmação forte, 409 e nada escrito", async () => {
  const { banco, context } = montar({ territorio: {
    publicationProtection: "protected",
    slugState: { proposals: [], confirmed: null, publishedSlug: "/estetica/limpeza-de-pele", publishedCanonical: null },
  } });
  const { status, corpo } = await patch(context, { territoryUndos: [{ territoryRef: REF, expectedLock: 7 }] });
  assert.equal(status, 409);
  assert.match(String(corpo.error), /tira o Silo inteiro/);
  const previa = await patch(context, { territoryUndos: [{ territoryRef: REF, expectedLock: 7, mode: "preview" }] });
  assert.equal(previa.status, 200, JSON.stringify(previa.corpo));
  assert.match(JSON.stringify(previa.corpo), /Publicado: o Silo tem endereço no site \(\/estetica\/limpeza-de-pele\)\. A página no site, a URL, o slug e o canonical não mudam/);
  semEscrita(banco);
});

/*
 * 2026-10-18 (decisão do dono "Manter em duas etapas") · SUBSTITUI "recusa quando há ArticleDNA aprovado com keyword do
 * Silo" (APPROVED_ARTICLE_DNA, "Desfaça ou refaça o artigo antes"): o Silo com artigo aprovado é o Silo INTEIRO — sai pelo
 * mesmo "Desfazer Silo", só com a prévia vigente e o nome digitado. Sem eles, 409 e nada escrito.
 */
test("Silo com ArticleDNA aprovado é o Silo inteiro: sem a prévia e o nome digitado, 409 e nada escrito; a prévia lista o aprovado e o proposto", async () => {
  const { banco, context } = montar({ artigos: [{
    version_id: "v-1", entity_id: "art-1", version_number: 1, marca_id: MARCA, artifact_type: "article_dna", status: "approved",
    payload: { articleId: "art-1", suggestedSlug: "limpeza-de-pele-profunda", principalKeywordId: KW_B, secondaryKeywordIds: [], narrativeReinforcementIds: [] },
  }, {
    // Proposto (não aprovado): não faz o Silo inteiro sozinho, mas sai junto quando ele sai.
    version_id: "v-2", entity_id: "art-2", version_number: 1, marca_id: MARCA, artifact_type: "article_dna", status: "proposed",
    payload: { articleId: "art-2", principalKeywordId: KW_A, secondaryKeywordIds: [], narrativeReinforcementIds: [] },
  }] });
  const { status, corpo } = await patch(context, { territoryUndos: [{ territoryRef: REF, expectedLock: 7 }] });
  assert.equal(status, 409);
  assert.match(String(corpo.error), /tira o Silo inteiro \(2 artigo\(s\), o par e o grafo\): abra a prévia, confira e digite o nome do Silo/);
  semEscrita(banco);
  const previa = await patch(context, { territoryUndos: [{ territoryRef: REF, expectedLock: 7, mode: "preview" }] });
  assert.equal(previa.status, 200, JSON.stringify(previa.corpo));
  const silo = ((previa.corpo.data as { territoryUndoPreviews: Array<{ scope: string; wholeSilo: { articles: Array<{ label: string }> } }> }).territoryUndoPreviews)[0];
  assert.equal(silo.scope, "whole_silo");
  assert.deepEqual(silo.wholeSilo.articles.map(article => article.label).sort(), ["art-2", "limpeza-de-pele-profunda"]);
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

test("Silo com SiloDNA aprovado é o Silo inteiro: sem a confirmação forte, 409 e nada escrito (SUBSTITUI 'Silo aprovado não se desfaz por aqui')", async () => {
  const { banco, context } = montar({ silos: [{
    version_id: "s-1", entity_id: "silo-1", version_number: 1, marca_id: MARCA, artifact_type: "silo_dna", status: "approved", payload: { territoryRef: REF, siloId: "silo-1" },
  }] });
  const { status, corpo } = await patch(context, { territoryUndos: [{ territoryRef: REF, expectedLock: 7 }] });
  assert.equal(status, 409);
  assert.match(String(corpo.error), /tira o Silo inteiro/);
  semEscrita(banco);
});

// 2026-10-18 · SUBSTITUI "recusa quando uma keyword do Silo é publicada": o Silo inteiro, com o alerta da publicada.
test("Silo com keyword publicada é o Silo inteiro: a prévia diz que URL, slug e canonical não mudam; sem a confirmação forte, nada escrito", async () => {
  const { banco, context } = montar({ statusB: "publicado" });
  const { status, corpo } = await patch(context, { territoryUndos: [{ territoryRef: REF, expectedLock: 7 }] });
  assert.equal(status, 409);
  assert.match(String(corpo.error), /tira o Silo inteiro/);
  const previa = await patch(context, { territoryUndos: [{ territoryRef: REF, expectedLock: 7, mode: "preview" }] });
  assert.match(JSON.stringify(previa.corpo), /Publicada: 1 keyword\(s\) \(“peeling facial”\) saem do Silo no Arquiteto; URL, slug e canonical não mudam/);
  semEscrita(banco);
});

// 2026-10-18 · SUBSTITUI "recusa quando uma keyword do Silo não está editável": ela fica como está (o alerta diz), o resto sai.
test("keyword fora da etapa do Arquiteto fica como está; o Silo sugerido se desfaz com as outras", async () => {
  const { banco, context } = montar({ estadoB: "sent" });
  const { status, corpo } = await patch(context, { territoryUndos: [{ territoryRef: REF, expectedLock: 7 }] });
  assert.equal(status, 200, JSON.stringify(corpo));
  assert.equal((linha(banco, ITEM_A).payload as Record<string, unknown>).territoryRef, null, "a editável sai do Silo");
  assert.equal(linha(banco, ITEM_B).lock_version, 3, "a de fora da etapa não é tocada");
  assert.equal(linha(banco, ITEM_SILO).state, "rejected");
});

test("ArticleDNA aprovado no envelope legado (payload.payload) também é lido: o Silo inteiro, com o artigo na prévia", async () => {
  const { banco, context } = montar({ artigos: [{
    version_id: "v-4", entity_id: "art-4", version_number: 1, marca_id: MARCA, artifact_type: "article_dna", status: "approved",
    payload: { payload: { articleId: "art-4", suggestedSlug: "peeling-envelope", principalKeywordId: KW_A, secondaryKeywordIds: [], narrativeReinforcementIds: [] } },
  }] });
  const { status, corpo } = await patch(context, { territoryUndos: [{ territoryRef: REF, expectedLock: 7 }] });
  assert.equal(status, 409);
  assert.match(String(corpo.error), /tira o Silo inteiro \(1 artigo\(s\)/);
  const previa = await patch(context, { territoryUndos: [{ territoryRef: REF, expectedLock: 7, mode: "preview" }] });
  assert.match(JSON.stringify(previa.corpo), /peeling-envelope/);
  semEscrita(banco);
});

test("SiloDNA aprovado no envelope legado também faz o Silo inteiro; o de outro território não", async () => {
  const envelope = montar({ silos: [{
    version_id: "s-2", entity_id: "silo-2", version_number: 1, marca_id: MARCA, artifact_type: "silo_dna", status: "approved", payload: { payload: { territoryRef: REF, siloId: "silo-2" } },
  }] });
  const recusa = await patch(envelope.context, { territoryUndos: [{ territoryRef: REF, expectedLock: 7 }] });
  assert.equal(recusa.status, 409);
  assert.match(String(recusa.corpo.error), /tira o Silo inteiro/);
  semEscrita(envelope.banco);

  const outro = montar({ silos: [{
    version_id: "s-3", marca_id: MARCA, artifact_type: "silo_dna", status: "approved", payload: { territoryRef: "territory:44444444-4444-4444-8444-444444444444" },
  }] });
  assert.equal((await patch(outro.context, { territoryUndos: [{ territoryRef: REF, expectedLock: 7 }] })).status, 200);
});

/*
 * 2026-10-14 (caso WifiConecta, azul): o lote "Desfazer os Silos sugeridos"
 * desfez o Silo do plano declarado. Sem a leitura dos grupos (este banco não tem
 * `editorial_groups`), a marca do plano no próprio território basta — fecha para
 * o lado seguro. 2026-10-18 (decisão do dono "Manter em duas etapas") · SUBSTITUI
 * a recusa DECLARED_PLAN_SILO ("Tirar do plano / Substituir o plano no Minerador"):
 * o Silo do plano sai pelo mesmo "Desfazer Silo", como o Silo inteiro — nunca sem a
 * prévia e o nome digitado (o lote da tela nunca o leva).
 */
test("Silo do plano declarado é o Silo inteiro: sem a prévia e o nome digitado, 409 e nada escrito", async () => {
  const { banco, context } = montar({ territorio: {
    name: "Wi-Fi e fibra óptica",
    reasons: ["Silo do plano declarado: Wi-Fi e fibra óptica."],
    provenance: { producedBy: "human", adoptedFromScenarioType: null, humanAdjustmentCount: 1, note: "Plano declarado no cadastro: grupo Azul (Wi-Fi e fibra óptica), plano v1, por u1 em 2026-10-14." },
  } });
  const { status, corpo } = await patch(context, { territoryUndos: [{ territoryRef: REF, expectedLock: 7 }] });
  assert.equal(status, 409);
  assert.match(String(corpo.error), /Desfazer “Wi-Fi e fibra óptica” tira o Silo inteiro/);
  assert.doesNotMatch(String(corpo.error), /Tirar do plano/);
  semEscrita(banco);
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

/* ======================================================================== */
/* 2026-10-18 · O SILO INTEIRO — decisões do dono "Manter em duas etapas" e   */
/* "tem que poder apagar … não interessa qual seja o estado". O azul da       */
/* WifiConecta: Silo do plano "Wi-Fi e fibra óptica", consolidado (SiloDNA/   */
/* SiloPage v2), Pilar + 6 Suportes, o grupo ligado e o grafo aprovado.       */
/* ======================================================================== */

const AZUL = "territory:5e689f8c-8f06-4e65-94c4-b3cd7ac906cc";
const GRUPO_AZUL = "07fec332-4b0a-43cb-af19-cedfd9b24897";
const DNA_V1 = "dddddddd-0000-4000-8000-000000000001";
const DNA_V2 = "dddddddd-0000-4000-8000-000000000002";
const PAGE_V2 = "eeeeeeee-0000-4000-8000-000000000002";
const HASH = `sha256:${"a".repeat(64)}`;
const ARTIGOS_AZUL: Array<[string, string]> = [
  ["pilar", "diferença entre internet e wi-fi"], ["s1", "wi-fi 6 vale a pena"], ["s2", "roteador wi-fi"], ["s3", "fibra óptica"],
  ["s4", "repetidor wi-fi"], ["s5", "internet cai à noite"], ["s6", "wi-fi mesh"],
];
const indiceAzul = (id: string) => String(ARTIGOS_AZUL.findIndex(([chave]) => chave === id)).padStart(2, "0");
const kwAzul = (id: string) => `aaaaaaaa-0000-4000-8000-0000000001${indiceAzul(id)}`;
const itemAzul = (id: string) => `bbbbbbbb-0000-4000-8000-0000000001${indiceAzul(id)}`;
const ITEM_RADAR = "ffffffff-0000-4000-8000-000000000001";

function montarAzul(opcoes: { etapa?: { artigo: string; stage: string }; publicado?: string; paginaPublicada?: boolean } = {}) {
  const banco = new Banco();
  banco.semGrupos = false;
  const territorioAzul = {
    ...manualSiloCandidateDraft({ name: "Wi-Fi e fibra óptica", slug: "wifi-e-fibra-optica" }),
    territoryRef: AZUL, brandId: MARCA, lifecycleStatus: "consolidated", decisionState: "confirmed",
    reasons: ["Silo do plano declarado: Wi-Fi e fibra óptica."],
    provenance: { producedBy: "human", adoptedFromScenarioType: null, humanAdjustmentCount: 1, note: "Plano declarado no cadastro: grupo Azul (Wi-Fi e fibra óptica), plano v1." },
    consolidation: {
      siloId: AZUL,
      siloDnaVersionRef: { entityId: AZUL, versionId: DNA_V2, contentHash: HASH, versionNumber: 2 },
      siloPageVersionRef: { entityId: `silo-page:${AZUL}`, versionId: PAGE_V2, contentHash: HASH, versionNumber: 2 },
      consolidatedAt: "2026-10-17T12:00:00.000Z",
    },
  };
  banco.tabelas.editorial_workflow_items = [
    { id: ITEM_SILO, marca_id: MARCA, subject_type: "territory", subject_id: AZUL, article_id: null, stage: "architect", state: "consolidated", source_entity_id: AZUL, lock_version: 7, created_at: "2026-10-14T00:00:00Z", updated_at: "2026-10-17T00:00:00Z", payload: { contractVersion: "territory-record-v1", territory: territorioAzul } },
    ...ARTIGOS_AZUL.map(([id]) => itemKeyword(itemAzul(id), kwAzul(id), AZUL)),
    itemKeyword(ITEM_FORA, KW_FORA, null),
    ...(opcoes.etapa ? [{ id: ITEM_RADAR, marca_id: MARCA, subject_type: "article", subject_id: `art-${opcoes.etapa.artigo}`, article_id: `art-${opcoes.etapa.artigo}`, stage: opcoes.etapa.stage, state: "awaiting_approval", lock_version: 4, payload: { analysisVersions: [{ versionNumber: 1, note: "investigação" }] } }] : []),
  ];
  banco.tabelas.minerador_keywords = [
    ...ARTIGOS_AZUL.map(([id, frase]) => ({ id: kwAzul(id), brand_id: MARCA, keyword: frase, status: "aprovado" })),
    { id: KW_FORA, brand_id: MARCA, keyword: "botox", status: "aprovado" },
  ];
  const artigo = (id: string, frase: string, versao: number) => ({
    version_id: `v${versao}-${id}`, entity_id: `art-${id}`, version_number: versao, marca_id: MARCA, artifact_type: "article_dna", status: "approved",
    payload: {
      articleId: `art-${id}`, brandId: MARCA, territoryRef: AZUL, siloId: AZUL, suggestedSlug: frase.replace(/\s+/g, "-"),
      principalKeywordId: kwAzul(id), secondaryKeywordIds: [], narrativeReinforcementIds: [],
      subject: { keywordId: kwAzul(id), phrase: frase },
      ...(opcoes.publicado === id ? { publishedIdentityRef: { url: "https://wifi.example/x" } } : {}),
    },
  });
  banco.tabelas.editorial_artifact_versions = [
    // A v1 do Pilar é histórico: só a vigente (v2) recebe o evento.
    artigo("pilar", "diferença entre internet e wi-fi", 1),
    ...ARTIGOS_AZUL.map(([id, frase]) => artigo(id, frase, 2)),
    { version_id: DNA_V1, entity_id: AZUL, version_number: 1, marca_id: MARCA, artifact_type: "silo_dna", status: "approved", payload: { siloId: AZUL, territoryRef: AZUL, brandId: MARCA, pillarArticleId: "art-pilar", supportArticleIds: [] } },
    { version_id: DNA_V2, entity_id: AZUL, version_number: 2, marca_id: MARCA, artifact_type: "silo_dna", status: "approved", payload: { siloId: AZUL, territoryRef: AZUL, brandId: MARCA, pillarArticleId: "art-pilar", supportArticleIds: ARTIGOS_AZUL.slice(1).map(([id]) => `art-${id}`), articleReferences: ARTIGOS_AZUL.map(([id]) => ({ articleId: `art-${id}` })) } },
    { version_id: PAGE_V2, entity_id: `silo-page:${AZUL}`, version_number: 2, marca_id: MARCA, artifact_type: "silo_page", status: "approved", payload: { siloId: AZUL, territoryRef: AZUL, brandId: MARCA, publicationStatus: opcoes.paginaPublicada ? "published" : "new" } },
  ];
  banco.tabelas.editorial_version_status_events = [];
  banco.tabelas.editorial_groups = [{
    id: GRUPO_AZUL, marca_id: MARCA, name: "Wi-Fi e fibra óptica", color: "azul", origin: "declared_plan", status: "active",
    plan: { siloName: "Wi-Fi e fibra óptica", siloSlug: "wifi-e-fibra-optica", objective: null, articleCount: 7 }, plan_version: 1, plan_hash: "h", silo_id: AZUL, lock_version: 3,
  }];
  banco.tabelas.editorial_group_articles = ARTIGOS_AZUL.map(([id]) => ({ marca_id: MARCA, article_id: `art-${id}`, group_id: GRUPO_AZUL, origin: "inherited" }));
  banco.tabelas.internal_link_graphs = [{ graph_version_id: "g-1", graph_id: `arquiteto:internal-links:${AZUL}`, marca_id: MARCA, silo_id: AZUL, version_number: 1, workflow_status: "approved" }];
  const context = {
    actorUserId: ATOR, brandId: MARCA, module: "arquiteto", action: "edit", permissions: ["arquiteto:edit"] as const,
    authorizationSource: "canonical_actor_rpc" as const, supabase: banco as never,
  };
  return { banco, context };
}

type PreviaAzul = { scope: string; label: string; memberCount: number; wholeSilo: { decisionHash: string; confirmationName: string; lines: string[]; notices: string[]; articles: Array<{ articleId: string; versionId: string; role: string | null; downstreamStages: string[] }>; pair: Array<{ kind: string; versionId: string }>; linkGraphs: Array<{ graphVersionId: string }>; group: { groupId: string } | null } };
async function previaAzul(context: unknown, lock = 7): Promise<PreviaAzul> {
  const { status, corpo } = await patch(context, { territoryUndos: [{ territoryRef: AZUL, expectedLock: lock, mode: "preview" }] });
  assert.equal(status, 200, JSON.stringify(corpo));
  return (corpo.data as { territoryUndoPreviews: PreviaAzul[] }).territoryUndoPreviews[0];
}

test("Silo inteiro · prévia: o que sai (7 artigos com o Pilar, o par v2, o grafo, o território, o grupo), sem custo e sem escrita", async () => {
  const { banco, context } = montarAzul();
  const previa = await previaAzul(context);
  assert.equal(previa.scope, "whole_silo");
  assert.equal(previa.label, "Wi-Fi e fibra óptica");
  assert.equal(previa.memberCount, 7);
  const silo = previa.wholeSilo;
  assert.equal(silo.confirmationName, "Wi-Fi e fibra óptica");
  assert.equal(silo.articles.length, 7);
  assert.deepEqual(silo.articles[0], { articleId: "art-pilar", versionId: "v2-pilar", versionNumber: 2, label: "diferença entre internet e wi-fi", role: "Pilar", published: false, downstreamStages: [] }, "o Pilar, na versão vigente (v2), sai junto");
  assert.deepEqual(silo.pair.map(item => item.versionId), [DNA_V2, PAGE_V2], "só as versões vigentes do par");
  assert.deepEqual(silo.linkGraphs.map(graph => graph.graphVersionId), ["g-1"]);
  assert.equal(silo.group?.groupId, GRUPO_AZUL);
  assert.ok(silo.lines.includes("Custo: nenhum (nada é pago)."));
  assert.match(silo.decisionHash, /^[a-f0-9]{64}$/);
  semEscrita(banco);
  // Prévia com outra alteração junto: recusa (a prévia vai sozinha).
  const misturada = await patch(context, { territoryUndos: [{ territoryRef: AZUL, expectedLock: 7, mode: "preview" }], updates: [{ workflowItemId: ITEM_FORA, expectedLock: 3, assignment: { territoryRef: null } }] });
  assert.equal(misturada.status, 400);
  semEscrita(banco);
});

test("Silo inteiro · gravação: sem o nome digitado, com o nome errado, com a prévia vencida ou sem a permissão de aprovar — nada escrito", async () => {
  const { banco, context } = montarAzul();
  const previa = await previaAzul(context);
  const gravar = (extra: Record<string, unknown>) => patch(context, { territoryUndos: [{ territoryRef: AZUL, expectedLock: 7, ...extra }] }, eventosNoBanco(banco));
  let r = await gravar({});
  assert.equal(r.status, 409);
  assert.match(String(r.corpo.error), /abra a prévia, confira e digite o nome do Silo/);
  r = await gravar({ decisionHash: previa.wholeSilo.decisionHash, typedName: "wi-fi" });
  assert.equal(r.status, 409);
  assert.match(String(r.corpo.error), /falta digitar o nome do Silo \(“Wi-Fi e fibra óptica”\)/);
  r = await gravar({ decisionHash: "0".repeat(64), typedName: "Wi-Fi e fibra óptica" });
  assert.equal(r.status, 409);
  assert.match(String(r.corpo.error), /mudou desde a prévia/);
  banco.aprova = false;
  r = await gravar({ decisionHash: previa.wholeSilo.decisionHash, typedName: "Wi-Fi e fibra óptica" });
  assert.equal(r.status, 403);
  assert.match(String(r.corpo.error), /permissão de aprovar/);
  semEscrita(banco);
});

test("Silo inteiro · gravação: 7 ArticleDNA (Pilar incluído) e o par recebem o evento 'rejeitado', as keywords voltam para sem Silo, as etiquetas saem, o grupo é desligado e o território fica desfeito — relido, nada de histórico apagado", async () => {
  const { banco, context } = montarAzul();
  const versoesAntes = JSON.stringify(banco.linhas("editorial_artifact_versions"));
  const previa = await previaAzul(context);
  // O nome digitado sem caixa nem espaços nas pontas vale (a regra da plataforma).
  const { status, corpo } = await patch(context, { territoryUndos: [{ territoryRef: AZUL, expectedLock: 7, decisionHash: previa.wholeSilo.decisionHash, typedName: "  wi-fi e fibra óptica " }] }, eventosNoBanco(banco));
  assert.equal(status, 200, JSON.stringify(corpo));

  const eventos = banco.linhas("editorial_version_status_events");
  assert.equal(eventos.length, 9, "7 artigos + SiloDNA + SiloPage");
  assert.ok(eventos.every(evento => evento.status === "rejected" && evento.actor_id === ATOR));
  assert.deepEqual(eventos.map(evento => evento.version_id).sort(), [...ARTIGOS_AZUL.map(([id]) => `v2-${id}`), DNA_V2, PAGE_V2].sort());
  assert.ok(!eventos.some(evento => evento.version_id === "v1-pilar" || evento.version_id === DNA_V1), "a versão anterior não é tocada");
  assert.equal(JSON.stringify(banco.linhas("editorial_artifact_versions")), versoesAntes, "nenhuma versão é regravada nem apagada");

  for (const [id] of ARTIGOS_AZUL) {
    const payload = linha(banco, itemAzul(id)).payload as Record<string, unknown>;
    assert.equal(payload.territoryRef, null);
    assert.equal((payload.territoryAssignment as Record<string, unknown>).state, "unassigned");
  }
  assert.equal(linha(banco, ITEM_FORA).lock_version, 3, "keyword fora do Silo não é tocada");
  const silo = linha(banco, ITEM_SILO);
  const gravado = (silo.payload as { territory: Record<string, unknown> }).territory;
  assert.equal(silo.state, "rejected");
  assert.equal(gravado.lifecycleStatus, "rejected");
  assert.equal(gravado.consolidation, null);
  assert.match(String((gravado.reasons as string[]).at(-1)), /^Silo inteiro desfeito por decisão humana .*7 artigo\(s\) retirado\(s\).*Pilar incluído.*o grupo Azul \(Wi-Fi e fibra óptica\) desligado do Silo; nada de histórico foi apagado; 7 keyword\(s\) voltaram para sem Silo\.$/);
  const grupo = banco.linhas("editorial_groups")[0];
  assert.equal(grupo.silo_id, null, "o grupo desligado do Silo (o writer de sempre)");
  assert.ok(grupo.plan, "o plano do cadastro fica no Minerador");
  assert.equal(banco.linhas("editorial_group_articles").length, 0, "as etiquetas da cor dos artigos retirados saem (a cor não fica presa)");
  const resultado = (corpo.data as { territoryUndoResults: Array<{ scope: string; rejectedVersionIds: string[]; groupUnlinked: boolean; untaggedArticles: number }> }).territoryUndoResults[0];
  assert.equal(resultado.scope, "whole_silo");
  assert.equal(resultado.rejectedVersionIds.length, 9);
  assert.equal(resultado.groupUnlinked, true);
  assert.equal(resultado.untaggedArticles, 7);

  // Desfeito: não se desfaz de novo.
  const deNovo = await patch(context, { territoryUndos: [{ territoryRef: AZUL, expectedLock: 8, mode: "preview" }] });
  assert.equal(deNovo.status, 409);
  assert.match(String(deNovo.corpo.error), /já foi desfeito/);
});

test("Silo inteiro · nada é recusado pelo estado: artigo no Radar sai e o item do Radar sai da operação (investigação fica); artigo publicado e SiloPage publicada saem com o alerta", async () => {
  const noRadar = montarAzul({ etapa: { artigo: "s3", stage: "radar" } });
  const previa = await previaAzul(noRadar.context);
  assert.ok(previa.wholeSilo.notices.some(aviso => /^Adiante: “fibra óptica” está no Radar — o item sai da operação \(“retirado”\); a investigação e o documento ficam como histórico\.$/.test(aviso)));
  const feito = await patch(noRadar.context, { territoryUndos: [{ territoryRef: AZUL, expectedLock: 7, decisionHash: previa.wholeSilo.decisionHash, typedName: "Wi-Fi e fibra óptica" }] }, eventosNoBanco(noRadar.banco));
  assert.equal(feito.status, 200, JSON.stringify(feito.corpo));
  const radar = linha(noRadar.banco, ITEM_RADAR);
  assert.equal(radar.state, "withdrawn", "o item do Radar sai da operação");
  const payload = radar.payload as Record<string, unknown>;
  assert.deepEqual(payload.analysisVersions, [{ versionNumber: 1, note: "investigação" }], "a investigação fica como histórico");
  assert.equal((payload.withdrawal as Record<string, unknown>).previousState, "awaiting_approval");
  assert.match(String((payload.withdrawal as Record<string, unknown>).reason), /Silo “Wi-Fi e fibra óptica” desfeito inteiro/);

  const publicado = montarAzul({ publicado: "s1" });
  const previaPublicado = await previaAzul(publicado.context);
  assert.ok(previaPublicado.wholeSilo.notices.some(aviso => /^Publicado: 1 artigo\(s\) deste Silo estão no ar \(“wi-fi 6 vale a pena”\)\. No site nada muda/.test(aviso)));

  const pagina = montarAzul({ paginaPublicada: true });
  const previaPagina = await previaAzul(pagina.context);
  assert.ok(previaPagina.wholeSilo.notices.some(aviso => /^Publicado: a SiloPage está publicada\. A página no site não muda/.test(aviso)));
  semEscrita(pagina.banco);
});

test("Silo inteiro · retomada: se a gravação parou depois dos eventos, a prévia nova não repete o que já saiu e termina o resto", async () => {
  const { banco, context } = montarAzul();
  const previa = await previaAzul(context);
  // Os eventos entram, mas a keyword do Pilar mudou na hora (lock vencido): a gravação para antes do território.
  const itemPilar = linha(banco, itemAzul("pilar"));
  const corpoDoPatch = { territoryUndos: [{ territoryRef: AZUL, expectedLock: 7, decisionHash: previa.wholeSilo.decisionHash, typedName: "Wi-Fi e fibra óptica" }] };
  const escrita = eventosNoBanco(banco).territoryUndo;
  const resposta = await handleArchitectWorkspacePatch(
    new Request("http://local/api/arquiteto/workspace", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ brandId: MARCA, ...corpoDoPatch }) }),
    context as never,
    { territoryUndo: { ...escrita, appendEvents: async eventos => { await escrita.appendEvents(eventos); itemPilar.lock_version = 99; } } },
  );
  assert.equal(resposta.status, 409);
  assert.equal(banco.linhas("editorial_version_status_events").length, 9, "os eventos ficaram (repetir não duplica)");
  assert.equal(linha(banco, ITEM_SILO).state, "consolidated", "o território ficou de pé: dá para terminar");
  // A prévia nova: os artigos e o par já saíram; falta o resto.
  const nova = await previaAzul(context);
  assert.equal(nova.wholeSilo.articles.length, 0);
  assert.equal(nova.wholeSilo.pair.length, 0);
  const fim = await patch(context, { territoryUndos: [{ territoryRef: AZUL, expectedLock: 7, decisionHash: nova.wholeSilo.decisionHash, typedName: "Wi-Fi e fibra óptica" }] }, eventosNoBanco(banco));
  assert.equal(fim.status, 200, JSON.stringify(fim.corpo));
  assert.equal(banco.linhas("editorial_version_status_events").length, 9, "nenhum evento duplicado");
  assert.equal(linha(banco, ITEM_SILO).state, "rejected");
  assert.equal(banco.linhas("editorial_groups")[0].silo_id, null);
});
