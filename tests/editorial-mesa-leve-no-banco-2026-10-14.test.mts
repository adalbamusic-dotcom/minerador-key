import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

/**
 * F2 · A MESA LEVE, RECORTADA NO BANCO (SDD
 * `docs/compartilhado/sdd-arquiteto-so-le-e-listas-leves-2026-10-13.md`, item 4).
 *
 * `GET /api/editorial/workspace` agora é leve por padrão e o corte acontece no
 * banco (`ArtifactRepository.listLight`): metadados de todas as versões (sem
 * `payload`), a MESMA escolha de sempre (`lightArtifactSelection`: vigente,
 * última aprovada e as referenciadas por item do Radar ou documento) e o
 * `payload` só das escolhidas. Este teste roda o repositório de verdade com o
 * cliente `supabase-js` de verdade, contra um PostgREST simulado por `fetch`
 * (nenhuma rede): o resultado é o mesmo da poda no Node sobre a leitura
 * inteira, com menos bytes do banco — inclusive quando a escolhida não passa
 * no contrato (o artefato é relido inteiro e escolhido do jeito antigo).
 */

process.env.NEXT_PUBLIC_SUPABASE_URL = "http://supabase.teste.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-de-teste-sem-rede";
const flagsDoProcesso = [...process.execArgv, String(process.env.NODE_OPTIONS || "")].join(" ");
if (!flagsDoProcesso.includes("integrations-runtime-loader")) register("./integrations-runtime-loader.mjs", import.meta.url);

type Linha = Record<string, unknown>;
type Pedido = { tabela: string; select: string; bytes: number; params: URLSearchParams };
const banco: Record<string, Linha[]> = { editorial_artifact_versions: [], editorial_version_status_events: [] };
const pedidos: Pedido[] = [];

function valor(linha: Linha, expressao: string): unknown {
  const partes = expressao.split(/(->>?)/);
  let atual: unknown = linha[partes[0]];
  let texto = false;
  for (let indice = 1; indice < partes.length; indice += 2) {
    texto = partes[indice] === "->>";
    atual = atual && typeof atual === "object" && !Array.isArray(atual) ? (atual as Linha)[partes[indice + 1]] : undefined;
  }
  if (atual === undefined || atual === null) return null;
  return texto && typeof atual !== "string" ? JSON.stringify(atual) : atual;
}
function projeta(linha: Linha, select: string | null): Linha {
  if (!select || select === "*") return structuredClone(linha);
  return Object.fromEntries(select.split(",").map(item => {
    const separador = /^[A-Za-z_][A-Za-z0-9_]*:/.test(item) ? item.indexOf(":") : -1;
    const expressao = separador >= 0 ? item.slice(separador + 1) : item;
    return [separador >= 0 ? item.slice(0, separador) : expressao.split(/->>?/).at(-1)!, structuredClone(valor(linha, expressao))];
  }));
}
function casa(linha: Linha, params: URLSearchParams): boolean {
  for (const [coluna, filtro] of params) {
    if (["select", "order", "limit", "offset"].includes(coluna)) continue;
    const atual = linha[coluna] === null || linha[coluna] === undefined ? "null" : String(linha[coluna]);
    if (filtro.startsWith("eq.")) { if (atual !== filtro.slice(3)) return false; continue; }
    if (filtro.startsWith("in.(") && filtro.endsWith(")")) {
      if (!filtro.slice(4, -1).split(",").map(item => item.replace(/^"|"$/g, "")).includes(atual)) return false;
      continue;
    }
    throw new Error(`filtro não simulado: ${coluna}=${filtro}`);
  }
  return true;
}
globalThis.fetch = (async (entrada: string | URL | Request) => {
  const url = new URL(typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada.url);
  if (url.hostname !== "supabase.teste.invalid") throw new Error(`rede real proibida neste teste: ${url.href}`);
  const tabela = url.pathname.replace(/^\/rest\/v1\//, "");
  let linhas = (banco[tabela] || []).filter(linha => casa(linha, url.searchParams));
  const ordem = url.searchParams.get("order");
  if (ordem) {
    const [coluna] = ordem.split(".");
    linhas = [...linhas].sort((a, b) => String(a[coluna]).localeCompare(String(b[coluna])));
  }
  const corpo = JSON.stringify(linhas.map(linha => projeta(linha, url.searchParams.get("select"))));
  pedidos.push({ tabela, select: url.searchParams.get("select") || "*", bytes: corpo.length, params: new URLSearchParams(url.searchParams) });
  return new Response(corpo, { status: 200, headers: { "content-type": "application/json" } });
}) as typeof fetch;

const { ArtifactRepository } = await import("../lib/server/editorial-repositories.ts");
const { lightArtifactSelection } = await import("../lib/editorial/workspace-read-scope.ts");
const { artigo, linhaDeVersao, versao } = await import("./listas-leves-fixtures.mts");

const MARCA = "61d2e019-0000-4000-8000-000000000001";
const OUTRA = "d4fa133a-0000-4000-8000-000000000002";
const ATOR = "11111111-1111-4111-8111-111111111111";
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

async function semear() {
  const a = artigo(MARCA, uuid(1), "internet fibra residencial");
  const b = artigo(MARCA, uuid(2), "plano de internet barato");
  const c = artigo(MARCA, uuid(3), "roteador wifi potente");
  const d = artigo(MARCA, uuid(4), "wifi lento em casa");
  const fora = artigo(OUTRA, uuid(9), "internet de outra marca");
  const versoes = {
    a1: await versao(a, a.articleId, 1, ATOR), a2: await versao({ ...a, promise: "Segunda." }, a.articleId, 2, ATOR), a3: await versao({ ...a, promise: "Terceira." }, a.articleId, 3, ATOR),
    b1: await versao(b, b.articleId, 1, ATOR), b2: await versao({ ...b, promise: "Outra." }, b.articleId, 2, ATOR),
    c1: await versao(c, c.articleId, 1, ATOR), c2: await versao({ ...c, promise: "Quebrada." }, c.articleId, 2, ATOR),
    d1: await versao(d, d.articleId, 1, ATOR),
    fora: await versao(fora, fora.articleId, 1, ATOR),
  };
  // `c2` gravada com payload que não passa no contrato: a leitura inteira escolheria `c1`.
  const envelopeC2 = versoes.c2 as unknown as Record<string, unknown> & { payload: Record<string, unknown> };
  const quebrada = { ...linhaDeVersao(MARCA, "article_dna", versoes.c2, "draft", "envelope"), payload: { ...envelopeC2, payload: { ...envelopeC2.payload, keywordReferences: [] } } };
  banco.editorial_artifact_versions = [
    // A mesa antiga gravava o envelope; o Arquiteto grava o DNA cru — as duas formas convivem.
    linhaDeVersao(MARCA, "article_dna", versoes.a1, "approved", "envelope"), linhaDeVersao(MARCA, "article_dna", versoes.a2, "proposed", "envelope"), linhaDeVersao(MARCA, "article_dna", versoes.a3, "draft", "cru"),
    linhaDeVersao(MARCA, "article_dna", versoes.b1, "approved", "cru"), linhaDeVersao(MARCA, "article_dna", versoes.b2, "proposed", "cru"),
    linhaDeVersao(MARCA, "article_dna", versoes.c1, "approved", "cru"), quebrada,
    linhaDeVersao(MARCA, "article_dna", versoes.d1, "proposed", "cru"),
    linhaDeVersao(OUTRA, "article_dna", versoes.fora, "approved", "cru"),
  ];
  // Histórico como o dos dados reais (AdalbaPro: 102 versões para 26 artigos): rodadas antigas de `d`.
  for (let numero = 2; numero <= 8; numero += 1) {
    const historico = await versao({ ...d, promise: `Rodada ${numero}.` }, d.articleId, numero, ATOR);
    banco.editorial_artifact_versions.push(linhaDeVersao(MARCA, "article_dna", historico, "superseded", "cru"));
  }
  (versoes as Record<string, unknown>).d8 = { versionId: `${d.articleId}:v8`, entityId: d.articleId };
  banco.editorial_version_status_events = [
    { id: uuid(101), version_id: versoes.a1.versionId, status: "approved", reason: "aprovado", actor_id: ATOR, occurred_at: "2026-10-01T11:00:00.000000+00:00" },
    { id: uuid(102), version_id: versoes.b1.versionId, status: "approved", reason: "aprovado", actor_id: ATOR, occurred_at: "2026-10-01T11:00:00.000000+00:00" },
    { id: uuid(103), version_id: versoes.c1.versionId, status: "approved", reason: "aprovado", actor_id: ATOR, occurred_at: "2026-10-01T11:00:00.000000+00:00" },
    { id: uuid(104), version_id: versoes.a2.versionId, status: "proposed", reason: "proposta", actor_id: ATOR, occurred_at: "2026-10-02T11:00:00.000000+00:00" },
  ];
  return versoes;
}

const ids = (lista: ReadonlyArray<{ versionId: string }>) => lista.map(item => item.versionId).sort();
const bytesDeArtefatos = (de: number) => pedidos.slice(de).filter(pedido => pedido.tabela === "editorial_artifact_versions").reduce((total, pedido) => total + pedido.bytes, 0);

test("mesa leve · o corte no banco escolhe as MESMAS versões e eventos que a poda no Node, com menos bytes", async () => {
  const versoes = await semear();
  const referenciadas = new Set([versoes.b1.versionId]);
  const repositorio = new ArtifactRepository();

  const inicioInteira = pedidos.length;
  const inteira = await repositorio.list(MARCA);
  const podada = lightArtifactSelection({
    articles: inteira.articles, silos: inteira.silos, events: inteira.events,
    articleOf: version => ({ versionId: version.versionId, versionNumber: version.versionNumber, entityKey: version.payload.articleId }),
    siloOf: version => ({ versionId: version.versionId, versionNumber: version.versionNumber, entityKey: version.payload.siloId }),
    keepVersionIds: referenciadas,
  });
  const bytesInteira = bytesDeArtefatos(inicioInteira);

  const inicioLeve = pedidos.length;
  const leve = await repositorio.listLight(MARCA, null, referenciadas);
  const bytesLeve = bytesDeArtefatos(inicioLeve);

  assert.deepEqual(ids(leve.articles), ids(podada.articles));
  for (const versaoLida of leve.articles) assert.deepEqual(versaoLida, podada.articles.find(item => item.versionId === versaoLida.versionId), `${versaoLida.versionId} inteira`);
  assert.deepEqual([...leve.events].map(evento => evento.eventId).sort(), [...podada.events].map(evento => evento.eventId).sort());
  // A vigente de cada artigo, a última aprovada, a referenciada; a quebrada cai para a anterior válida.
  assert.deepEqual(ids(leve.articles), [versoes.a1.versionId, versoes.a3.versionId, versoes.b1.versionId, versoes.b2.versionId, versoes.c1.versionId, `${versoes.d1.entityId}:v8`].sort());
  assert.ok(leve.incompatible.some(registro => registro.id === versoes.c2.versionId), "a versão quebrada continua nomeada no diagnóstico");
  assert.ok(!leve.articles.some(item => item.payload.brandId !== MARCA), "isolamento por marca");

  // Os metadados vêm sem payload; o payload só das escolhidas, por version_id.
  const consultas = pedidos.slice(inicioLeve).filter(pedido => pedido.tabela === "editorial_artifact_versions");
  assert.doesNotMatch(consultas[0].select, /(^|,)payload(,|$)/, "a 1ª leitura é só de metadados");
  assert.match(consultas[0].select, /a1:payload->>articleId/);
  assert.ok(consultas.slice(1).every(pedido => pedido.params.get("version_id")?.startsWith("in.(")
    || pedido.params.get("entity_id") === `in.(${versoes.c2.entityId})`), "o payload só por version_id (e o artefato quebrado relido sozinho)");
  assert.ok(bytesLeve < bytesInteira, `menos bytes do banco (${bytesInteira} → ${bytesLeve})`);
});

test("mesa leve · recorte por grupo: os mesmos artefatos que a leitura recortada entregava", async () => {
  const versoes = await semear();
  const repositorio = new ArtifactRepository();
  const entidades = [versoes.a1.entityId, versoes.d1.entityId];
  const inteira = await repositorio.listScoped(MARCA, entidades);
  const podada = lightArtifactSelection({
    articles: inteira.articles, silos: inteira.silos, events: inteira.events,
    articleOf: version => ({ versionId: version.versionId, versionNumber: version.versionNumber, entityKey: version.payload.articleId }),
    siloOf: version => ({ versionId: version.versionId, versionNumber: version.versionNumber, entityKey: version.payload.siloId }),
    keepVersionIds: new Set(),
  });
  const leve = await repositorio.listLight(MARCA, entidades, new Set());
  assert.deepEqual(ids(leve.articles), ids(podada.articles));
});

test("mesa leve · marca sem artefato: listas vazias sem consultar payload", async () => {
  banco.editorial_artifact_versions = [];
  const inicio = pedidos.length;
  const leve = await new ArtifactRepository().listLight(MARCA, null, new Set());
  assert.deepEqual(leve.articles, []);
  assert.equal(pedidos.slice(inicio).filter(pedido => pedido.tabela === "editorial_artifact_versions").length, 1, "só os metadados");
});
