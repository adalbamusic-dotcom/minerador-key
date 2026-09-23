import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { register } from "node:module";
import test from "node:test";
import { ARTIGO, HOST_DO_BANCO, MARCA, PEDIDO_DO_SILO, instalarPostgrestSimulado, semearBanco, type Banco, type Pedido } from "./radar-export-leitura-fixtures.mts";

/*
 * ===== E4 · O EXPORT LÊ SÓ A CORRIDA DA VERSÃO QUE USA — e o CSV não muda =====
 *
 * A SDD de egress (docs/compartilhado/sdd-uso-supabase-orcamento-egress-2026-09-23.md)
 * mediu ~24 MB por export: o item do Radar era lido três vezes por artigo, duas
 * delas com as corridas de TODAS as versões de análise. A primeira leitura, a
 * da análise corrente, passou a trazer só a corrida da versão usada.
 *
 * A correção tinha sido recusada antes por risco aos consumidores do pacote
 * exportado. Por isso a prova é o CSV: a rota roda duas vezes sobre o MESMO
 * banco semeado, uma com a leitura nova e outra com a leitura antiga (o código
 * de antes, trocado no objeto de portas), e as duas respostas têm de ser iguais
 * byte a byte.
 *
 * O banco é um PostgREST simulado: o cliente Supabase é o real e só o `fetch`
 * é trocado. Cada pedido guarda os bytes da resposta, e é assim que a economia
 * é medida aqui.
 *
 * PROVIDER_CALLS = 0: o `fetch` recusa qualquer host que não seja o do banco.
 */

/* ======================= ambiente sem rede ======================= */

process.env.NEXT_PUBLIC_SUPABASE_URL = `http://${HOST_DO_BANCO}`;
process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-de-teste-sem-rede";

const flagsDoProcesso = [...process.execArgv, String(process.env.NODE_OPTIONS || "")].join(" ");
if (!flagsDoProcesso.includes("integrations-runtime-loader")) {
  register("./integrations-runtime-loader.mjs", import.meta.url);
}

const STUBS: Record<string, string> = {
  "@/lib/server/authz": [
    "export class AuthzError extends Error { constructor(status, message) { super(message); this.status = status; } }",
    "export function authzErrorResponse(error) { return { status: (error && error.status) || 500, message: String((error && error.message) || error) }; }",
    "export async function requireCanonicalSessionProfile() { return globalThis.__perfilDoExportDeTeste; }",
  ].join("\n"),
  "@/lib/server/editorial-authorization": "export async function assertEditorialPermission() {}",
};
const HOOKS = `
const STUBS = ${JSON.stringify(STUBS)};
export async function resolve(specifier, context, next) {
  if (Object.prototype.hasOwnProperty.call(STUBS, specifier)) {
    return { url: "data:text/javascript," + encodeURIComponent(STUBS[specifier]), shortCircuit: true };
  }
  if (specifier === "next/server") return next("next/server.js", context);
  return next(specifier, context);
}
`;
register("data:text/javascript," + encodeURIComponent(HOOKS), import.meta.url);

let banco: Banco = semearBanco();
const { pedidos, foraDoBanco } = instalarPostgrestSimulado(() => banco);

const { createCanonicalServiceClient } = await import("../lib/server/canonical-authorization.ts");
(globalThis as Record<string, unknown>).__perfilDoExportDeTeste = { userId: "ator-de-teste", supabase: createCanonicalServiceClient() };

const rota = await import("../app/api/editorial/radar-export/route.ts");
const { radarExportArticleReads } = await import("../app/api/editorial/radar-export/_leitura-do-artigo.ts");
const { radarStartPorts } = await import("../lib/server/radar-youtube-start.ts");
const { VersionedRadarAnalysisSchema } = await import("../lib/radar/analysis-contracts.ts");
const {
  radarPortableExportCurrentAnalysisOfRow,
  radarPortableExportCurrentVersionIndex,
  radarPortableExportCurrentVersionPick,
  radarPortableExportLatestAnalysis,
} = await import("../lib/radar/portable-export-reading.ts");
const {
  RADAR_EXPORT_LARGE_READ_BYTES,
  RADAR_EXPORT_READ_BYTES_PER_BATCH,
  RADAR_EXPORT_READ_BYTES_PER_FINALIZED,
  RADAR_EXPORT_READ_BYTES_PER_OPEN,
  radarExportMegabytes,
  radarSiloExportEstimate,
  radarSiloExportSizeNotice,
} = await import("../lib/radar/portable-export-estimate.ts");
const { RADAR_EXPORT_MAX_ARTICLES, radarSiloExportScopeLimitNotice } = await import("../lib/radar/portable-silo-scope.ts");

/* ======================= a rota, com relógio fixo ======================= */

const AGORA = "2026-09-25T12:00:00.000Z";
const DataReal = Date;
class DataFixa extends DataReal {
  constructor(...argumentos: unknown[]) {
    if (argumentos.length === 0) super(AGORA);
    else super(...(argumentos as [string]));
  }
  static now() { return new DataReal(AGORA).getTime(); }
}

type Resposta = { status: number; texto: string; pedidos: Pedido[] };

async function exportar(corpo: unknown, ajuste?: (semeado: Banco) => void): Promise<Resposta> {
  banco = semearBanco();
  ajuste?.(banco);
  pedidos.length = 0;
  (globalThis as { Date: DateConstructor }).Date = DataFixa as unknown as DateConstructor;
  try {
    const resposta = await rota.POST(new Request("http://localhost/api/editorial/radar-export", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corpo),
    }));
    return { status: resposta.status, texto: await resposta.text(), pedidos: [...pedidos] };
  } finally {
    (globalThis as { Date: DateConstructor }).Date = DataReal;
  }
}

/* O ORÁCULO: a leitura de antes, literal — estado inteiro, todas as corridas, maior número. */
const leituraAntiga = async (input: { brandId: string; articleId: string }) => {
  const estado = await radarStartPorts.loadRadarState({ brandId: input.brandId, articleId: input.articleId });
  return estado?.analyses.slice().sort((esquerda, direita) => direita.versionNumber - esquerda.versionNumber)[0] || null;
};

async function comLeituraAntiga<T>(corpo: () => Promise<T>): Promise<T> {
  const nova = radarExportArticleReads.currentAnalysis;
  radarExportArticleReads.currentAnalysis = leituraAntiga;
  try {
    return await corpo();
  } finally {
    radarExportArticleReads.currentAnalysis = nova;
  }
}

const CENARIOS = {
  silo: { corpo: { brandId: MARCA, articleIds: PEDIDO_DO_SILO, groupBy: "silo" }, status: 200 },
  avulso: { corpo: { brandId: MARCA, articleIds: PEDIDO_DO_SILO }, status: 200 },
  so_o_finalizado: { corpo: { brandId: MARCA, articleIds: [ARTIGO.F] }, status: 200 },
  so_recusados: { corpo: { brandId: MARCA, articleIds: [ARTIGO.N, ARTIGO.V, ARTIGO.M] }, status: 409 },
} as const;

const corridas = (lista: Pedido[]) => lista.filter(pedido => pedido.tabela === "radar_analysis_runs");
const estreitas = (lista: Pedido[]) => corridas(lista).filter(pedido => pedido.params.has("version_id"));
const inteiras = (lista: Pedido[]) => corridas(lista).filter(pedido => !pedido.params.has("version_id"));
const bytes = (lista: Pedido[]) => lista.reduce((total, pedido) => total + pedido.bytes, 0);

/* ======================= 1 · o CSV, byte a byte ======================= */

for (const [nome, cenario] of Object.entries(CENARIOS)) {
  test(`E4 · ${nome}: a resposta é idêntica à da leitura antiga, byte a byte`, async () => {
    const antiga = await comLeituraAntiga(() => exportar(cenario.corpo));
    const nova = await exportar(cenario.corpo);
    assert.equal(antiga.status, cenario.status, antiga.texto.slice(0, 300));
    assert.equal(nova.status, cenario.status, nova.texto.slice(0, 300));
    assert.equal(nova.texto, antiga.texto, "nem um byte de diferença");
  });
}

/* Estado corrompido: uma versão `null` no início do array e nenhuma corrida gravada no item. */
const versaoNulaSemCorridas = (chaves: ReadonlyArray<keyof typeof ARTIGO>) => (semeado: Banco) => {
  for (const chave of chaves) {
    const item = semeado.editorial_workflow_items.find(linha => linha.article_id === ARTIGO[chave]);
    if (!item) throw new Error(`o banco semeado não tem o item de ${chave}`);
    semeado.radar_analysis_runs = semeado.radar_analysis_runs.filter(corrida => corrida.workflow_item_id !== item.id);
    const payload = item.payload as { analysisVersions: unknown[] };
    item.payload = { ...payload, analysisVersions: [null, ...payload.analysisVersions] };
  }
};

test("E4 · versão nula e item sem corridas: a leitura estreita cai na antiga, e a resposta é a mesma byte a byte", async () => {
  const ajuste = versaoNulaSemCorridas(["F", "N", "T"]);
  const antiga = await comLeituraAntiga(() => exportar(CENARIOS.silo.corpo, ajuste));
  const nova = await exportar(CENARIOS.silo.corpo, ajuste);
  assert.equal(antiga.status, 200, antiga.texto.slice(0, 300));
  assert.equal(nova.status, 200, nova.texto.slice(0, 300));
  assert.equal(nova.texto, antiga.texto, "nem um byte de diferença");
  assert.match(JSON.parse(nova.texto).files[0].csv, /páginas na versão F5\./, "a versão corrente de F sumiu do CSV");
});

test("E4 · versão nula e item sem corridas: a análise corrente de cada artigo é a da leitura antiga", async () => {
  for (const chave of ["F", "N", "T"] as const) {
    banco = semearBanco();
    versaoNulaSemCorridas([chave])(banco);
    const pedido = { brandId: MARCA, articleId: ARTIGO[chave] };
    const antiga = await leituraAntiga(pedido);
    const nova = await radarExportArticleReads.currentAnalysis(pedido);
    assert.ok(antiga, `${chave}: a leitura antiga não achou versão`);
    assert.equal(JSON.stringify(nova), JSON.stringify(antiga), `${chave}: a leitura nova escolheu outra versão`);
  }
});

test("E4 · a bancada enxerga a versão escolhida: escolher outra mudaria o CSV", async () => {
  const { texto } = await exportar(CENARIOS.silo.corpo);
  const corpo = JSON.parse(texto) as { exported: number; refused: Array<{ code: string }>; files: Array<{ csv: string }> };
  assert.equal(corpo.exported, 4);
  assert.deepEqual(corpo.refused.map(item => item.code).sort(), ["article_dna_not_found", "radar_item_not_found", "radar_research_not_finalized"]);
  assert.equal(corpo.files.length, 1);
  const csv = corpo.files[0].csv;
  /* A de maior número; a PRIMEIRA do empate; a anterior quando a corrida da maior quebra; número em texto, sem id e fracionário ficam fora. */
  for (const escolhida of ["F5", "T3a", "X2", "Z2"]) assert.match(csv, new RegExp(`páginas na versão ${escolhida}\\.`), `a versão ${escolhida} sumiu do CSV`);
  for (const preterida of ["T3b", "X3", "Z9", "Z12", "Z7"]) assert.equal(csv.includes(`na versão ${preterida}.`), false, `a versão ${preterida} entrou no CSV`);
});

/* ======================= 2 · o que atravessa a rede ======================= */

test("E4 · cada artigo reidrata só a corrida da versão usada, e a releitura antiga só entra no caso quebrado", async () => {
  const antiga = await comLeituraAntiga(() => exportar(CENARIOS.silo.corpo));
  const nova = await exportar(CENARIOS.silo.corpo);

  assert.equal(estreitas(antiga.pedidos).length, 0, "o oráculo lia todas as corridas");
  assert.deepEqual(
    estreitas(nova.pedidos).map(pedido => pedido.params.get("version_id")),
    ["in.(f-v5)", "in.(n-v2)", "in.(t-v3a)", "in.(x-v3)", "in.(z-v2)"],
    "uma corrida por artigo com análise, e é a da versão que o CSV usa",
  );
  /* Cinco artigos com análise deixam de ler tudo; X, cuja corrida quebra o contrato, relê como antes. */
  assert.equal(inteiras(nova.pedidos).length, inteiras(antiga.pedidos).length - 5 + 1);
  /* A linha do item: a mesma contagem de antes, mais a releitura de X. V, sem versão nenhuma, não relê. */
  const itens = (lista: Pedido[]) => lista.filter(pedido => pedido.tabela === "editorial_workflow_items").length;
  assert.equal(itens(nova.pedidos), itens(antiga.pedidos) + 1);
  assert.ok(bytes(corridas(nova.pedidos)) < bytes(corridas(antiga.pedidos)), "a leitura nova trouxe mais corrida que a antiga");
  for (const pedido of nova.pedidos) assert.equal(pedido.metodo, "GET", `o export gravou: ${pedido.tabela}`);
});

test("E4 · a conta exata de um artigo: some uma leitura de todas as corridas, entra a corrida da corrente", async () => {
  const antiga = await comLeituraAntiga(() => exportar(CENARIOS.so_o_finalizado.corpo));
  const nova = await exportar(CENARIOS.so_o_finalizado.corpo);
  const todasAsCorridasDeF = inteiras(antiga.pedidos)[0].bytes;
  const corridaDaCorrente = estreitas(nova.pedidos)[0].bytes;
  assert.ok(corridaDaCorrente > 0 && corridaDaCorrente < todasAsCorridasDeF);
  assert.equal(bytes(nova.pedidos), bytes(antiga.pedidos) - todasAsCorridasDeF + corridaDaCorrente);
  assert.equal(nova.pedidos.length, antiga.pedidos.length, "nenhuma leitura a mais");
});

/* ======================= 3 · a regra de escolha ======================= */

/* Versões LEVES e válidas, tiradas do banco semeado: só o id, o número e o payload variam. */
const BASE = ((banco.editorial_workflow_items.find(linha => linha.article_id === ARTIGO.F)?.payload as { analysisVersions: Record<string, unknown>[] }).analysisVersions);

function sorteio(semente: number) {
  let estado = semente >>> 0;
  return () => {
    estado = (estado + 0x6d2b79f5) >>> 0;
    let t = estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test("E4 · a escolha é a regra antiga: 600 históricos sorteados, com empate, número inválido, id inválido e payload quebrado", () => {
  const aleatorio = sorteio(20260923);
  const um = <T,>(lista: readonly T[]) => lista[Math.floor(aleatorio() * lista.length)];
  const IDS: unknown[] = ["a", "b", "c", "d", "", 7, null];
  const NUMEROS: unknown[] = [1, 2, 3, 3, 4, 5, 5, "9", 0, -1, 2.5, null];
  const vistos = { current: 0, none: 0, reread: 0 };

  for (let caso = 0; caso < 600; caso += 1) {
    const versoes = Array.from({ length: 1 + Math.floor(aleatorio() * 6) }, () => {
      const base = structuredClone(um(BASE));
      return {
        ...base,
        versionId: um(IDS),
        versionNumber: um(NUMEROS),
        ...(aleatorio() < 0.15 ? { payload: "quebrado" } : {}),
      };
    });
    const linha = { marca_id: MARCA, article_id: ARTIGO.F, payload: { analysisVersions: versoes } };
    const nova = radarPortableExportCurrentAnalysisOfRow({ row: linha, brandId: MARCA, articleId: ARTIGO.F });
    const validas = versoes.map(versao => VersionedRadarAnalysisSchema.safeParse(versao)).filter(lida => lida.success).map(lida => lida.data);
    const antiga = radarPortableExportLatestAnalysis(validas);
    vistos[nova.kind] += 1;

    if (nova.kind === "current") {
      assert.equal(JSON.stringify(nova.analysis), JSON.stringify(antiga), `caso ${caso}: escolheu outra versão`);
    } else if (nova.kind === "none") {
      assert.equal(antiga, null, `caso ${caso}: disse que não havia análise, e havia`);
    } else {
      /* Releitura só quando o id e o número PASSAM no contrato e o resto da versão não: nunca por metadado inválido. */
      const escolhida = versoes[radarPortableExportCurrentVersionIndex(versoes)];
      assert.equal(VersionedRadarAnalysisSchema.safeParse(escolhida).success, false, `caso ${caso}: pediu releitura sem precisar`);
      assert.equal(VersionedRadarAnalysisSchema.shape.versionId.safeParse(escolhida.versionId).success, true, `caso ${caso}: escolheu versão sem id válido`);
      assert.equal(VersionedRadarAnalysisSchema.shape.versionNumber.safeParse(escolhida.versionNumber).success, true, `caso ${caso}: escolheu versão sem número válido`);
    }
    const pick = radarPortableExportCurrentVersionPick(versoes);
    assert.ok(pick.length <= 1, "o pick nunca reidrata mais de uma versão");
  }
  assert.ok(vistos.current > 200 && vistos.none > 10 && vistos.reread > 10, `o sorteio não cobriu os três caminhos: ${JSON.stringify(vistos)}`);
});

test("E4 · as guardas da linha são as da leitura antiga", () => {
  const versoes = BASE.slice(0, 2);
  const linha = (patch: Record<string, unknown>) => ({ marca_id: MARCA, article_id: ARTIGO.F, payload: { analysisVersions: versoes }, ...patch });
  const ler = (row: unknown) => radarPortableExportCurrentAnalysisOfRow({ row, brandId: MARCA, articleId: ARTIGO.F }).kind;
  assert.equal(ler(linha({})), "current");
  assert.equal(ler(null), "none");
  assert.equal(ler(linha({ marca_id: "outra-marca" })), "none", "linha de outra marca");
  assert.equal(ler(linha({ article_id: ARTIGO.N })), "none", "linha de outro artigo");
  assert.equal(ler(linha({ payload: [versoes] })), "none", "payload em lista");
  assert.equal(ler(linha({ payload: { analysisVersions: { 0: versoes[0] } } })), "none", "versões fora de lista");
  assert.equal(ler(linha({ payload: { analysisVersions: [] } })), "none");
  assert.deepEqual(radarPortableExportCurrentVersionPick([]), []);
  assert.equal(radarPortableExportLatestAnalysis(null), null);
});

/* ======================= 4 · a forma da leitura ======================= */

const semComentarios = (fonte: string) => fonte.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

test("E4 · a rota lê a corrente pela leitura estreita, e só a releitura antiga lê o estado inteiro", async () => {
  const rotaFonte = semComentarios(await readFile(new URL("../app/api/editorial/radar-export/route.ts", import.meta.url), "utf8"));
  assert.equal((rotaFonte.match(/radarExportArticleReads\.currentAnalysis\(/g) || []).length, 1);
  assert.equal(/loadRadarState\(|findByArticle\(|\.sort\(\(esquerda, direita\) => direita\.versionNumber/.test(rotaFonte), false, "a rota voltou a ler o estado inteiro");
  assert.equal((rotaFonte.match(/loadRadarCanonicalAuthorities\(\{/g) || []).length, 1);

  const leitura = semComentarios(await readFile(new URL("../app/api/editorial/radar-export/_leitura-do-artigo.ts", import.meta.url), "utf8"));
  assert.match(leitura, /findByArticleHydratingVersions\(\s*input\.brandId,\s*input\.articleId,\s*"radar",\s*radarPortableExportCurrentVersionPick,?\s*\)/);
  assert.equal((leitura.match(/radarStartPorts\.loadRadarState\(/g) || []).length, 1, "a releitura antiga entra num lugar só");
  assert.match(leitura, /if \(leitura\.kind === "current"\) return leitura\.analysis;\s*if \(leitura\.kind === "none"\) return null;\s*const estado = await radarStartPorts\.loadRadarState/);
  assert.match(leitura, /\}\s*catch\s*\{\s*leitura = \{ kind: "reread" \};\s*\}/, "um erro da leitura estreita cai na leitura antiga");
  assert.equal(/findByArticle\(|findByArticleWithoutRuns\(|\.insert\(|\.update\(|\.upsert\(|\.delete\(|select\("\*"\)/.test(leitura), false);

  for (const caminho of ["../lib/radar/portable-export-reading.ts", "../lib/radar/portable-export-estimate.ts"]) {
    const fonte = semComentarios(await readFile(new URL(caminho, import.meta.url), "utf8"));
    assert.equal(/fetch\(|supabase|createClient|localStorage|indexedDB|from "react"|lib\/server/i.test(fonte), false, `${caminho} deixou de ser puro`);
  }
});

/* ======================= 5 · o tamanho antes do clique ======================= */

test("E4 · a estimativa soma lote, finalizados e abertos, e arredonda para cima", () => {
  const estimativa = radarSiloExportEstimate({ articleIds: ["a", "b", "c", "a"], finalizedArticleIds: ["a", "fora-do-pedido"] });
  assert.deepEqual(
    { finalized: estimativa.finalized, open: estimativa.open },
    { finalized: 1, open: 2 },
    "o repetido conta uma vez, e finalizado fora do pedido não conta",
  );
  assert.equal(estimativa.readBytes, RADAR_EXPORT_READ_BYTES_PER_BATCH + RADAR_EXPORT_READ_BYTES_PER_FINALIZED + 2 * RADAR_EXPORT_READ_BYTES_PER_OPEN);
  assert.equal(radarSiloExportEstimate({ articleIds: [], finalizedArticleIds: [] }).readBytes, 0);
  assert.equal(radarExportMegabytes(133_000), "0,2");
  assert.equal(radarExportMegabytes(3_010_000), "3,1");
  assert.equal(radarExportMegabytes(27_100_000), "28");
});

test("E4 · o aviso de tamanho só aparece em 'todos os silos' e só quando é grande", () => {
  const ids = (quantos: number) => Array.from({ length: quantos }, (_, indice) => `artigo-${indice}`);
  /* Care Glow hoje: 1 finalizado e 2 abertos, ~16 MB depois desta etapa. Não é grande. */
  assert.equal(radarSiloExportSizeNotice({ scope: { mode: "all", articleIds: ids(3) }, finalizedArticleIds: ["artigo-0"] }), null);

  const grande = radarSiloExportSizeNotice({ scope: { mode: "all", articleIds: ids(6) }, finalizedArticleIds: ["artigo-0", "artigo-1"] });
  assert.ok(grande, "2 finalizados e 4 abertos passam de 20 MB");
  assert.equal(grande!.title, "Exportação grande");
  assert.match(grande!.message, /^Estimativa de ~33 MB lidos do banco \(a meta de leitura é 100 MB por dia\) e arquivo de ~0,3 MB, com 2 artigo\(s\) finalizado\(s\) e 4 ainda em investigação\. Para ler menos, selecione alguns silos na planilha e exporte em partes\.$/);
  assert.equal(/[0-9a-f]{8}-[0-9a-f]{4}|artigo-\d/.test(`${grande!.title} ${grande!.message}`), false, "nenhum id no aviso");

  /* Com seleção, quem clicou já escolheu o tamanho. */
  assert.equal(radarSiloExportSizeNotice({ scope: { mode: "selection", articleIds: ids(40) }, finalizedArticleIds: ids(40) }), null);
  assert.equal(radarSiloExportSizeNotice({ scope: { mode: "all", articleIds: [] }, finalizedArticleIds: [] }), null);

  /* O limiar: um quinto da meta do dia. */
  assert.equal(RADAR_EXPORT_LARGE_READ_BYTES, 20_000_000);
  assert.equal(radarSiloExportSizeNotice({ scope: { mode: "all", articleIds: ids(8) }, finalizedArticleIds: [] }), null, "8 abertos: ~17,9 MB");
  assert.ok(radarSiloExportSizeNotice({ scope: { mode: "all", articleIds: ids(9) }, finalizedArticleIds: [] }), "9 abertos: ~20,1 MB");
});

test("E4 · acima do teto de artigos o clique não lê nada, e o aviso de tamanho não aparece junto com a recusa", () => {
  const ids = (quantos: number) => Array.from({ length: quantos }, (_, indice) => `artigo-${indice}`);
  const noTeto = { mode: "all" as const, articleIds: ids(RADAR_EXPORT_MAX_ARTICLES) };
  const acima = { mode: "all" as const, articleIds: ids(RADAR_EXPORT_MAX_ARTICLES + 1) };
  assert.equal(radarSiloExportScopeLimitNotice(noTeto), null);
  assert.ok(radarSiloExportSizeNotice({ scope: noTeto, finalizedArticleIds: [] }), "no teto o pedido sai, e é grande");
  assert.ok(radarSiloExportScopeLimitNotice(acima), "acima do teto a tela recusa antes do pedido");
  assert.equal(radarSiloExportSizeNotice({ scope: acima, finalizedArticleIds: [] }), null);
  assert.equal(radarSiloExportSizeNotice({ scope: acima, finalizedArticleIds: acima.articleIds }), null);
});

test("E4 · o menu mostra o tamanho no item recomendado, em 14px e na cor de atenção, sem mexer no resto", async () => {
  const pagina = (await readFile(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
  const barra = semComentarios(pagina.slice(pagina.indexOf("const renderTopbarActions"), pagina.indexOf("const openDetail")));
  assert.match(barra, /const avisoDeTamanhoDoExport = menuDeExport\s*\?\s*radarSiloExportSizeNotice\(\{\s*scope: radarSiloExportScope\(\{ items: pipeline\.radarItems, selectedArticleIds, siloVersions: pipeline\.siloVersions \}\),\s*finalizedArticleIds: pipeline\.radarItems\.filter\(row => radarPrimaryProfileOfAnalysis\(analiseCorrenteDe\(row\)\?\.payload \|\| null\)\)\.map\(row => row\.articleId\),\s*\}\)\s*:\s*null;/);

  const menu = barra.slice(barra.indexOf('role="menu"'));
  const primeiroItem = menu.slice(menu.indexOf("<button"), menu.indexOf("</button>") + "</button>".length);
  assert.match(primeiroItem, /data-testid="radar-export-silos"/);
  assert.match(primeiroItem, /\{avisoDeTamanhoDoExport \? <span className="mt-1 block" data-testid="radar-silos-size-estimate"><strong className="font-semibold text-warning">\{avisoDeTamanhoDoExport\.title\}:<\/strong> \{avisoDeTamanhoDoExport\.message\}<\/span> : null\}/);
  assert.match(primeiroItem, /className="block w-full rounded px-2 py-2 text-left text-sm text-foreground\/85 /, "o item deixou de ter 14px no texto do item");
  assert.equal(/text-xs|#[0-9a-f]{3,6}\b|rgb\(/i.test(primeiroItem), false);
  assert.equal((primeiroItem.match(/text-warning/g) || []).length, 1, "só o título vai na cor de atenção; a mensagem fica no texto do item");
  assert.equal((barra.match(/avisoDeTamanhoDoExport/g) || []).length, 4, "o aviso aparece só no item recomendado");
  assert.match(primeiroItem, /void exportarSilosCompletos\(\)/, "o clique continua exportando direto");
});

/* ======================= sentinelas ======================= */

test("PROVIDER_CALLS = 0: nenhum pedido saiu do banco simulado", () => {
  assert.deepEqual(foraDoBanco, []);
});
