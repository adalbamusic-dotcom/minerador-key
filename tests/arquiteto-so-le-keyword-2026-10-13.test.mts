import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { normalizeKeyword as normalizeKeywordDoMinerador } from "../lib/minerador/keyword-import-core.ts";
import {
  ARCHITECT_SUGGESTIONS_SUBJECT_TYPE,
  architectSuggestionRecordKey,
  buildArchitectSuggestionRecord,
  mineradorHandoffHref,
  normalizeKeyword,
  projectArchitectSuggestionRecord,
  readArchitectSuggestionItem,
  readMineradorHandoff,
  type ArchitectSuggestionItem,
  type ArchitectSuggestionStoredMeasurement,
} from "../lib/arquiteto/minerador-suggestions.ts";
import {
  IMPROVEMENT_APPROVE_NEW_KEYWORDS_RETIRED,
  improvementMineradorNeeds,
  improvementSuggestionDrafts,
  markImprovementMineradorNeeds,
} from "../lib/arquiteto/article-improvement-minerador.ts";
import type { ImprovementKeyword, ImprovementProposal, ImprovementTarget } from "../lib/arquiteto/article-improvement.ts";
import { buildArchitectSuggestionLines, summarizeArchitectSuggestions, type ArchitectSuggestionFacts, type ArchitectSuggestionKeywordFact, type ArchitectSuggestionRecordRead } from "../lib/minerador/architect-suggestions-view.ts";
import { applyArchitectSuggestions, ArchitectSuggestionStaleError, previewArchitectSuggestions, type ArchitectSuggestionPorts } from "../lib/minerador/architect-suggestions-apply.ts";

/*
 * F4 · O ARQUITETO SÓ LÊ (SDD `docs/compartilhado/sdd-arquiteto-so-le-e-listas-leves-2026-10-13.md`,
 * item 2; D2, D3). Fixtures; sem banco, sem rede, sem chamada paga.
 *
 * 1. Estrutural (lista fechada, comentários removidos antes de casar): nenhum
 *    arquivo do Arquiteto (tela, rotas, núcleos do servidor) importa ou chama
 *    núcleo do Minerador que escreve, nem grava em tabela `minerador_*`, nem
 *    chama rota de escrita do Minerador.
 * 2. Comportamento: a melhoria reorganiza só com keywords já no Minerador; o
 *    que falta vira sugestão; a caixa do Minerador lê por cor e grava pelos
 *    núcleos dele; o link do Arquiteto leva ao Minerador.
 */

const semComentarios = (texto: string) => texto
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
const ler = (caminho: string) => semComentarios(readFileSync(caminho, "utf8"));

function arquivos(dir: string, filtro: (nome: string) => boolean): string[] {
  const achados: string[] = [];
  const andar = (atual: string) => {
    for (const nome of readdirSync(atual)) {
      const cheio = join(atual, nome);
      if (statSync(cheio).isDirectory()) andar(cheio);
      else if (filtro(nome)) achados.push(cheio.split("\\").join("/"));
    }
  };
  andar(dir);
  return achados.sort();
}

/** Tudo que é "do Arquiteto": tela, rotas e núcleos do servidor. */
const DO_ARQUITETO = [
  ...arquivos("app/api/arquiteto", nome => nome.endsWith(".ts")),
  ...arquivos("modules/arquiteto", nome => nome.endsWith(".ts") || nome.endsWith(".tsx")),
  ...readdirSync("lib/server").filter(nome => nome.startsWith("arquiteto-") && nome.endsWith(".ts")).map(nome => `lib/server/${nome}`).sort(),
];

/** Núcleos do Minerador que ESCREVEM (ou o encadeamento dele com service role). */
const ESCRITORES_DO_MINERADOR = [
  "measureKeywordVolume",
  "runKeywordLogicWithCore",
  "importSubjectDiscoveryWithCore",
  "applyKeywordDecisionEntries",
  "handleGoogleAdsKeywordMetrics",
  "approveAndSendDeps",
  "applyApproveAndSendOnServer",
  "sendKeywordsToArquitetoOnServer",
  "assignKeywordGroupWithCore",
  "setKeywordPlanLockWithCore",
  "importDeclaredPlanWithCore",
  "withdrawFromDeclaredPlanWithCore",
  "lifecycle_delete_minerador_keywords",
  "replayStoredMeasurements",
];

test("estrutural · lista fechada: nenhum arquivo do Arquiteto usa núcleo do Minerador que escreve", () => {
  assert.ok(DO_ARQUITETO.length > 40, `varredura vazia? ${DO_ARQUITETO.length}`);
  const achados: string[] = [];
  for (const caminho of DO_ARQUITETO) {
    const codigo = ler(caminho);
    for (const simbolo of ESCRITORES_DO_MINERADOR) if (new RegExp(`\\b${simbolo}\\b`).test(codigo)) achados.push(`${caminho}: ${simbolo}`);
  }
  assert.deepEqual(achados, []);
});

function escritasNoMinerador(caminho: string, codigo: string): string[] {
  const achados: string[] = [];
  // .from("minerador_x") seguido de escrita, na mesma cadeia (quebras de linha incluídas).
  if (/\.from\(\s*["'`]minerador_[a-z_]+["'`]\s*\)\s*\.(update|insert|upsert|delete)\(/.test(codigo)) achados.push(`${caminho}: escrita em minerador_*`);
  if (/\.rpc\(\s*["'`][^"'`]*(minerador|lifecycle_delete)[^"'`]*["'`]/.test(codigo)) achados.push(`${caminho}: RPC do Minerador`);
  if (/["'`]\/api\/minerador\//.test(codigo)) achados.push(`${caminho}: chamada à API do Minerador`);
  if (/from ["']@\/app\/api\/minerador\//.test(codigo)) achados.push(`${caminho}: rota do Minerador em processo`);
  return achados;
}

test("estrutural · nenhum arquivo do Arquiteto grava em tabela minerador_* nem chama rota do Minerador", () => {
  // O detector pega o que deve pegar (amostras do que existia antes da F4).
  assert.equal(escritasNoMinerador("amostra", 'await db.from("minerador_keywords")\n  .update({ status: "aprovado" })').length, 1);
  assert.equal(escritasNoMinerador("amostra", 'await client.from("minerador_keyword_lists").insert({ nome })').length, 1);
  assert.equal(escritasNoMinerador("amostra", "await fetch(`/api/minerador/marcas/${id}/keywords/delete`, { method: \"POST\" })").length, 1);
  assert.equal(escritasNoMinerador("amostra", 'import { POST } from "@/app/api/minerador/marcas/[brandId]/google-ads/metricas-keywords/route";').length, 1);
  assert.equal(escritasNoMinerador("amostra", 'await db.from("minerador_keywords").select("id")').length, 0, "ler pode");
  assert.ok(ESCRITORES_DO_MINERADOR.every(simbolo => !new RegExp(`\\b${simbolo}\\b`).test(ler("lib/server/arquiteto-article-improvement.ts"))));
  const achados = DO_ARQUITETO.flatMap(caminho => escritasNoMinerador(caminho, ler(caminho)));
  assert.deepEqual(achados, []);
  // A rota legada de Silo (W8) não insere mais lista do Minerador.
  assert.doesNotMatch(ler("app/api/arquiteto/silos/route.ts"), /minerador_keyword_lists/);
});

test("estrutural · o modal 'Importar do Minerador' não aprova e não usa service role (D2)", () => {
  const servidor = ler("lib/server/arquiteto-minerador-import.ts");
  assert.doesNotMatch(servidor, /getOperationalClient|createCanonicalServiceClient|approveAndSendDeps|actorCanApproveInMinerador/);
  assert.match(servidor, /return withoutArquitetoApproval\(\{/);
  assert.match(servidor, /approve: async \(\) => \{ throw new Error\("O Arquiteto não aprova keyword: aprove no Minerador\."\); \}/);
});

test("estrutural · a tela e o MCP do Arquiteto não pedem mais a aprovação no Minerador", () => {
  assert.doesNotMatch(ler("modules/arquiteto/article-improvement-panel.tsx"), /approveNewKeywords/);
  assert.doesNotMatch(ler("modules/arquiteto/published-reinforcement-model.ts"), /approveNewKeywords: true/);
  assert.doesNotMatch(ler("modules/arquiteto/use-published-reinforcement.ts"), /approveNewKeywords/);
  assert.doesNotMatch(ler("modules/arquiteto/use-published-differentiation.ts"), /subject-discovery\/import|sendIngest/);
  const mcp = ler("lib/server/platform-mcp-tools.ts");
  const improve = mcp.slice(mcp.indexOf('server.registerTool("improve_articles"'), mcp.indexOf("server.registerTool(\"apply_declared_plan_to_silo\""));
  assert.ok(improve.length > 200);
  assert.doesNotMatch(improve, /"minerador\.write"|module: "minerador"/, "aplicar a melhoria não pede escopo nem permissão do Minerador");
  assert.match(improve, /\["arquiteto\.write", "platform\.decide"\] as const/);
});

/* ------------------------------ a melhoria: o que precisa do Minerador ------------------------------ */

const sinais = (intent: string | null) => ({ keywordId: "x", text: "x", intent, intentLabel: null, centralEntity: null, perceivedProblem: null, audience: null, desiredOutcome: null, modifiers: null, dnaVersionId: null, dnaContentHash: null }) as unknown as ImprovementKeyword["signals"];
const kw = (id: string, extra: Partial<ImprovementKeyword> = {}): ImprovementKeyword => ({ id, keyword: `kw ${id}`, volume: 50, volumeValidated: true, signals: sinais("informational"), ownerId: null, published: false, territoryRef: null, external: false, ...extra });
const proposta = (extra: Partial<ImprovementProposal> = {}): ImprovementProposal => ({ targetId: "alvo", kind: "subject", theme: "Assunto do artigo", currentPrimaryId: "p", principalId: "p", memberIds: ["p", "a"], addIds: ["a"], removeIds: [], transfers: [], angle: "", exclusions: [], reasons: [], status: "ready", evidenceBasis: "serp", ...extra });

test("melhoria · só keywords recebidas, com volume e Lógica: nada precisa do Minerador e a linha continua pronta", () => {
  const keywords = [kw("p"), kw("a")];
  assert.equal(improvementMineradorNeeds(proposta(), keywords), null);
  const propostas = [proposta()];
  assert.equal(markImprovementMineradorNeeds(propostas, keywords), 0);
  assert.equal(propostas[0].status, "ready");
  assert.equal(propostas[0].needsMinerador, undefined);
});

test("melhoria · keyword nova, medição a gravar e Lógica: 'Precisa do Minerador', não aceitável, com o motivo", () => {
  const keywords = [kw("p", { signals: sinais(null) }), kw("a", { external: true }), kw("m", { volumePendingWrite: true })];
  const propostas = [proposta({ memberIds: ["p", "a", "m"], addIds: ["a", "m"] }), proposta({ targetId: "outro", serpRefresh: { recordVersionId: "r", intent: "i", funnel: "f", detail: "d" } })];
  assert.equal(markImprovementMineradorNeeds(propostas, keywords), 1);
  assert.equal(propostas[0].status, "insufficient_evidence");
  assert.deepEqual(propostas[0].needsMinerador, { newKeywordIds: ["a"], measureKeywordIds: ["m"], logicKeywordIds: ["p"] });
  assert.match(propostas[0].reasons.at(-1)!, /^Precisa do Minerador: 1 keyword\(s\) nova\(s\) para importar e aprovar no Minerador \(“kw a”\); 1 medição\(ões\) de volume para gravar no Minerador \(“kw m”\); a Lógica do Minerador em 1 keyword\(s\) sem intenção \(“kw p”\)\. O Arquiteto não grava no Minerador/);
  assert.equal(propostas[1].status, "ready", "atualizar o DNA com a SERP não depende do Minerador");
  // Na gravação, a intenção é a da linha relida (não a da prévia).
  assert.deepEqual(improvementMineradorNeeds(proposta(), [kw("p", { signals: sinais(null) }), kw("a")], id => id === "p" ? true : null), null);
  assert.match(IMPROVEMENT_APPROVE_NEW_KEYWORDS_RETIRED, /O Arquiteto não aprova keyword no Minerador/);
});

test("melhoria · as sugestões da execução: destino, motivo, a medição guardada só no servidor", () => {
  const medicao: ArchitectSuggestionStoredMeasurement = { metric: { keyword: "ideia nova", averageMonthlySearches: 90, matchedRequestedKeywords: ["ideia nova"] } as never, requestId: "ads-1" };
  const keywords = [kw("p"), kw("a", { external: true, keyword: "ideia nova", volume: 90, measuredNowAt: "2026-10-14T10:00:00.000Z", googleAdsMeasured: true, measurement: medicao }), kw("k", { external: true, keyword: "já no minerador", knownInMinerador: { keywordId: "id-do-minerador" }, measurement: medicao }), kw("m", { volumePendingWrite: true, keyword: "medir esta", measurement: medicao })];
  const target: ImprovementTarget = { id: "alvo", kind: "subject", theme: "Assunto do artigo", note: null, primaryId: "p", post: "free", memberIds: ["p"], territoryRef: "t", slug: null, url: null, canonical: null, signals: sinais("informational") };
  const propostas = [proposta({ memberIds: ["p", "a", "k", "m"], addIds: ["a", "k", "m"], aiReasons: [{ keywordId: "a", reason: "Responde a dúvida do Assunto." }] })];
  markImprovementMineradorNeeds(propostas, keywords);
  const drafts = improvementSuggestionDrafts({ runId: "11111111-1111-4111-8111-111111111111", targets: [target], keywords, proposals: propostas });
  const record = buildArchitectSuggestionRecord({ brandId: "marca", source: "improvement", sourceId: "11111111-1111-4111-8111-111111111111", createdAt: "2026-10-14T10:00:00.000Z", actorId: "ator", drafts })!;
  assert.equal(architectSuggestionRecordKey("improvement", "11111111-1111-4111-8111-111111111111"), "improvement:11111111-1111-4111-8111-111111111111");
  assert.equal(ARCHITECT_SUGGESTIONS_SUBJECT_TYPE, "architect_minerador_suggestions");
  const porPalavra = Object.fromEntries(record.items.map(item => [item.keyword, item]));
  assert.deepEqual([porPalavra["ideia nova"].kind, porPalavra["ideia nova"].keywordId, porPalavra["ideia nova"].subjectKeywordId, porPalavra["ideia nova"].hasStoredMeasurement, porPalavra["ideia nova"].searchId], ["new_keyword", null, "alvo", true, "11111111-1111-4111-8111-111111111111"]);
  assert.match(porPalavra["ideia nova"].reason, /Entraria como secundária em “Assunto do artigo”\. Responde a dúvida do Assunto\./);
  assert.deepEqual([porPalavra["já no minerador"].keywordId, porPalavra["já no minerador"].hasStoredMeasurement], ["id-do-minerador", false], "a que o Minerador já tem não leva medição para regravar");
  assert.deepEqual([porPalavra["medir esta"].kind, porPalavra["medir esta"].keywordId, porPalavra["medir esta"].hasStoredMeasurement], ["measure", "m", true]);
  assert.equal(Object.keys(record.measurements ?? {}).length, 2);
  // O que sai para o navegador e o MCP não leva a medição guardada.
  assert.equal("measurements" in projectArchitectSuggestionRecord(record), false);
  // Item gravado que não fecha o contrato fica de fora; o resto é lido como gravado.
  assert.equal(readArchitectSuggestionItem({ kind: "outra coisa", keyword: "x", id: "y" }), null);
  assert.deepEqual(readArchitectSuggestionItem(JSON.parse(JSON.stringify(porPalavra["medir esta"]))), porPalavra["medir esta"]);
});

test("a normalização das sugestões é a MESMA do Minerador", () => {
  for (const texto of ["  Captação de Pacientes  ", "CLÍNICA   de estética", "ação", "", 42]) assert.equal(normalizeKeyword(texto), normalizeKeywordDoMinerador(texto));
});

/* ------------------------------ a caixa do Minerador ------------------------------ */

const fato = (id: string, keyword: string, extra: Partial<ArchitectSuggestionKeywordFact> = {}): ArchitectSuggestionKeywordFact => ({ id, keyword, normalizedKeyword: normalizeKeyword(keyword), status: "aprovado", intent: "Informativa", volumeSource: "google_ads", volume: 50, groupId: "g-azul", ...extra });
function fatos(lista: ArchitectSuggestionKeywordFact[], recebidas: string[] = []): ArchitectSuggestionFacts {
  return {
    keywordsById: new Map(lista.map(item => [item.id, item])),
    keywordsByNormalized: new Map(lista.map(item => [item.normalizedKeyword, item])),
    receivedInArquiteto: new Set(recebidas),
    colorOfGroup: groupId => groupId === "g-azul" ? "azul" : groupId === "g-laranja" ? "laranja" : null,
  };
}
const item = (extra: Partial<ArchitectSuggestionItem>): ArchitectSuggestionItem => ({ id: `${extra.kind ?? "new_keyword"}:${normalizeKeyword(extra.keyword ?? "x")}:${extra.targetKeywordId ?? "alvo-azul"}`, kind: "new_keyword", keyword: "x", normalizedKeyword: normalizeKeyword(extra.keyword ?? "x"), keywordId: null, targetKeywordId: "alvo-azul", targetTheme: "Assunto azul", targetKind: "subject", subjectKeywordId: "alvo-azul", volume: 90, volumeSource: "google_ads", measuredAt: null, hasStoredMeasurement: false, reason: "motivo", origins: ["ads_keyword_seed"], evidence: [], searchId: "11111111-1111-4111-8111-111111111111", ...extra });

function caixa() {
  const registros: ArchitectSuggestionRecordRead[] = [
    { recordKey: "improvement:run-velho", source: "improvement", createdAt: "2026-10-10T10:00:00.000Z", items: [item({ keyword: "nova importar", reason: "velho" })] },
    { recordKey: "improvement:run-novo", source: "improvement", createdAt: "2026-10-14T10:00:00.000Z", items: [
      item({ keyword: "nova importar", reason: "novo", hasStoredMeasurement: true }),
      item({ keyword: "ja aprovar", keywordId: null }),
      item({ keyword: "ja no arquiteto" }),
      item({ keyword: "rejeitada" }),
      item({ kind: "measure", keyword: "medir guardada", keywordId: "k-medir", hasStoredMeasurement: true }),
      item({ kind: "measure", keyword: "medir no botao", keywordId: "k-botao" }),
      item({ kind: "logic", keyword: "sem logica", keywordId: "k-logica" }),
      item({ kind: "logic", keyword: "sumiu", keywordId: "k-sumiu" }),
    ] },
    { recordKey: "reinforcement:op-1", source: "reinforcement", createdAt: "2026-10-13T10:00:00.000Z", items: [item({ keyword: "do laranja", targetKeywordId: "alvo-laranja", targetKind: "published", subjectKeywordId: null })] },
  ];
  const lista = [
    fato("alvo-azul", "Assunto azul"), fato("alvo-laranja", "publicado laranja", { groupId: "g-laranja" }),
    fato("k-aprovar", "ja aprovar", { status: "bruto" }), fato("k-arq", "ja no arquiteto"), fato("k-rej", "rejeitada", { status: "rejeitado" }),
    fato("k-medir", "medir guardada", { volumeSource: "previous", volume: 140 }), fato("k-botao", "medir no botao", { volumeSource: null, volume: null }),
    fato("k-logica", "sem logica", { intent: null }),
  ];
  return { registros, lista };
}

test("caixa · o estado de cada sugestão vem do Minerador de agora; a mais nova vence; cor = a do artigo de destino", () => {
  const { registros, lista } = caixa();
  const linhas = buildArchitectSuggestionLines(registros, fatos(lista, ["k-arq"]));
  const estado = Object.fromEntries(linhas.map(linha => [linha.keyword, [linha.state, linha.color, linha.applicable]]));
  assert.deepEqual(estado, {
    "nova importar": ["import", "azul", true],
    "ja aprovar": ["approve_and_send", "azul", false],
    "ja no arquiteto": ["done", "azul", false],
    rejeitada: ["rejected", "azul", false],
    "medir guardada": ["record_measurement", "azul", true],
    "medir no botao": ["measure_in_minerador", "azul", false],
    "sem logica": ["run_logic", "azul", true],
    sumiu: ["missing", "azul", false],
    "do laranja": ["import", "laranja", true],
  });
  assert.equal(linhas.find(linha => linha.keyword === "nova importar")!.reason, "novo", "a sugestão mais nova vence");
  assert.equal(linhas.filter(linha => linha.keyword === "nova importar").length, 1);
  assert.deepEqual(summarizeArchitectSuggestions(linhas), [{ color: "azul", total: 8, pending: 5 }, { color: "laranja", total: 1, pending: 1 }]);
  // Ordem: cor, depois o que a caixa resolve.
  assert.equal(linhas[0].color, "azul"); assert.equal(linhas.at(-1)!.color, "laranja");
});

function portas(estado: { lista: ArchitectSuggestionKeywordFact[]; recebidas: string[]; registros: ArchitectSuggestionRecordRead[] }) {
  const chamadas: string[] = [];
  const medicao: ArchitectSuggestionStoredMeasurement = { metric: { averageMonthlySearches: 90 } as never, requestId: "ads-1" };
  const ports: ArchitectSuggestionPorts = {
    readRecords: async () => estado.registros,
    readFacts: async () => fatos(estado.lista, estado.recebidas),
    readMeasurements: async chaves => new Map(chaves.map(chave => [chave, Object.fromEntries((estado.registros.find(registro => registro.recordKey === chave)?.items ?? []).filter(i => i.hasStoredMeasurement).map(i => [i.id, medicao]))])),
    importKeywords: async request => {
      chamadas.push(`importar:${request.subjectKeywordId}:${request.items.map(i => i.keyword).join("|")}`);
      for (const i of request.items) estado.lista.push(fato(`novo-${normalizeKeyword(i.keyword)}`, i.keyword, { status: "bruto", volumeSource: null, volume: null }));
      return { ok: true };
    },
    recordMeasurements: async entries => {
      chamadas.push(`medicao:${entries.map(entry => entry.keywordId).join(",")}`);
      for (const entry of entries) Object.assign(estado.lista.find(f => f.id === entry.keywordId)!, { volumeSource: "google_ads", volume: 90 });
      return { failed: [] };
    },
    runLogic: async ids => { chamadas.push(`logica:${ids.join(",")}`); for (const id of ids) estado.lista.find(f => f.id === id)!.intent = "Informativa"; return { failedIds: [] }; },
    hash: value => JSON.stringify(value).length.toString(16).padStart(64, "0"),
    stableUuid: (...partes) => `uuid:${partes.join("|")}`,
  };
  return { ports, chamadas };
}

test("caixa · prévia não grava; aplicar grava SÓ pelos núcleos do Minerador e devolve o 'Aprovar e enviar' de sempre", async () => {
  const { registros, lista } = caixa();
  const estado = { lista, recebidas: ["k-arq"], registros };
  const { ports, chamadas } = portas(estado);
  const chaves = (await previewArchitectSuggestions(ports, { brandId: "marca", keys: [] })).lines.filter(linha => linha.color === "azul").map(linha => linha.key);
  const previa = await previewArchitectSuggestions(ports, { brandId: "marca", keys: chaves });
  assert.deepEqual(chamadas, [], "a prévia não grava");
  assert.deepEqual(previa.selected.map(linha => linha.keyword).sort(), ["medir guardada", "nova importar", "sem logica"]);
  assert.equal(previa.notApplicable.length, 5);

  await assert.rejects(() => applyArchitectSuggestions(ports, { brandId: "marca", keys: chaves, decisionHash: "0".repeat(64) }), ArchitectSuggestionStaleError);
  assert.deepEqual(chamadas, [], "hash vencido: nada gravado");

  const resultado = await applyArchitectSuggestions(ports, { brandId: "marca", keys: chaves, decisionHash: previa.decisionHash });
  assert.deepEqual(chamadas, ["importar:alvo-azul:nova importar", "medicao:novo-nova importar,k-medir", "logica:k-logica"]);
  const desfecho = Object.fromEntries(resultado.results.map(r => [r.keyword, r.outcome]));
  assert.equal(desfecho["nova importar"], "imported"); assert.equal(desfecho["medir guardada"], "measurement_recorded"); assert.equal(desfecho["sem logica"], "logic_applied");
  assert.equal(desfecho["ja aprovar"], "skipped");
  assert.equal(resultado.readbackConfirmed, true);
  // Aprovar e enviar NÃO acontece aqui: a nova importada e a que já estava esperam o diálogo de sempre.
  assert.deepEqual(resultado.approveAndSendIds.sort(), ["k-aprovar", "novo-nova importar"].sort());
  assert.deepEqual(resultado.measureInMineradorIds, ["k-botao"]);
  assert.ok(!chamadas.some(chamada => /aprovar|enviar/.test(chamada)));
});

test("caixa · a tela do Minerador lê a lista leve e abre o 'Aprovar e enviar' de sempre; nada de aprovar pela caixa", () => {
  const dialogo = ler("modules/minerador/architect-suggestions-dialog.tsx");
  assert.match(dialogo, /const ROUTE = \(brandId: string\) => `\/api\/minerador\/marcas\/\$\{encodeURIComponent\(brandId\)\}\/architect-suggestions`;/);
  assert.match(dialogo, /onOpenApproveAndSend\(aAprovar, /);
  assert.doesNotMatch(dialogo, /approve-and-send|decide_keywords|status: "aprovado"/);
  const servidor = ler("lib/server/minerador-architect-suggestions.ts");
  assert.match(servidor, /\.select\("subject_id,updated_at,items:payload->items,source:payload->>source,createdAt:payload->>createdAt,recordBrand:payload->>brandId"\)/, "a lista leve não lê a medição guardada");
  assert.match(servidor, /\.select\("id,keyword,status,intent,volume_source,volume_search,group_id"\)/, "colunas estreitas, sem analise_semantica");
  assert.doesNotMatch(servidor, /applyKeywordDecisionEntries|createMineradorArquitetoHandoff|getOperationalClient|createCanonicalServiceClient/);
  const workspace = ler("modules/minerador/minerador-workspace.tsx");
  assert.match(workspace, /<ArchitectSuggestionsButton onClick=/);
  assert.match(workspace, /onOpenApproveAndSend=\{\(ids, scopeLabel\) => \{ setArchitectSuggestionsOpen\(null\); openApproveAndSend\(ids, scopeLabel\); \}\}/);
});

/* ------------------------------ o link do Arquiteto ao Minerador ------------------------------ */

test("link · 'Aprovar no Minerador', 'Excluir no Minerador' e 'Sugestões' levam ao Minerador; ids inválidos não passam", () => {
  const ids = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"];
  const href = mineradorHandoffHref("adalbapro--61d2e019", { action: "aprovar", ids: [...ids, "nao-e-uuid"], color: "azul" });
  assert.equal(href, `/adalbapro--61d2e019/minerador?arquiteto=aprovar&ids=${ids.join("%2C")}&cor=azul`);
  const lido = readMineradorHandoff(new URL(`http://x${href}`).searchParams)!;
  assert.deepEqual(lido, { action: "aprovar", ids, color: "azul" });
  assert.equal(readMineradorHandoff(new URLSearchParams("arquiteto=apagar&ids=x")), null, "só as três ações");
  assert.deepEqual(readMineradorHandoff(new URLSearchParams("arquiteto=sugestoes")), { action: "sugestoes", ids: [], color: null });
});
