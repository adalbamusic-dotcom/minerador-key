import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CANONICAL_IMPORTABILITY, resolveCanonicalMineradorArquitetoImportEligibility } from "../lib/arquiteto/minerador-handoff.ts";
import { applyApproveAndSend, previewApproveAndSend, type ApproveAndSendDeps } from "../lib/minerador/approve-and-send-core.ts";
import {
  ARQUITETO_IMPORT_APPROVE_IN_MINERADOR_REASON,
  ARQUITETO_IMPORT_ITEM_FIELDS,
  ARQUITETO_IMPORT_REAPPROVE_REASON,
  applyArquitetoImportGate,
  arquitetoImportLineLabel,
  arquitetoImportProgress,
  classifyArquitetoImportPool,
  confirmArquitetoImportResult,
  initialArquitetoImportColor,
  isArquitetoImportable,
  selectArquitetoImportColor,
  summarizeArquitetoImportColors,
  withoutArquitetoApproval,
  type ArquitetoImportPoolRow,
} from "../lib/arquiteto/minerador-import.ts";

/*
 * "Importar do Minerador" no Arquiteto (pedido do dono, 2026-10-13; SDD
 * `docs/compartilhado/sdd-acelerar-fluxo-do-plano-2026-10-13.md`, itens 1, 2
 * e 6). Fixtures no formato da WifiConecta (lido por SELECT em 2026-10-13):
 * 64 keywords, 58 aprovadas e já recebidas pelo Arquiteto, 6 brutas (5 na cor
 * laranja, 1 sem cor). Sem banco, sem chamada paga.
 */

const semComentarios = (texto: string) => texto
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
  .split("\n")
  .filter(linha => !linha.trimStart().startsWith("//"))
  .join("\n");
const ler = (caminho: string) => semComentarios(readFileSync(caminho, "utf8"));

const BRAND = "d4fa133a-0000-4000-8000-000000000001";
const AZUL = "g-azul";
const LARANJA = "g-laranja";
const corDoGrupo = (groupId: string | null) => groupId === AZUL ? "azul" as const : groupId === LARANJA ? "laranja" as const : null;

function wifiConecta() {
  const keywords: ArquitetoImportPoolRow[] = [];
  for (let i = 0; i < 7; i++) keywords.push({ id: `az-${i}`, keyword: `roteador azul ${i}`, status: "aprovado", group_id: AZUL });
  for (let i = 0; i < 51; i++) keywords.push({ id: `la-${i}`, keyword: `wifi laranja ${i}`, status: "aprovado", group_id: LARANJA });
  for (let i = 0; i < 5; i++) keywords.push({ id: `br-${i}`, keyword: `bruta laranja ${i}`, status: "bruto", group_id: LARANJA });
  keywords.push({ id: "br-sem", keyword: "bruta sem cor", status: "bruto", group_id: null });
  const workflowStateByKeywordId = new Map(keywords.filter(k => k.status === "aprovado").map(k => [k.id, "received"] as const));
  return { keywords, workflowStateByKeywordId };
}

test("causa do 'não importa': na lista antiga as 58 já estavam no Arquiteto e as 6 que faltavam nem apareciam", () => {
  const { keywords, workflowStateByKeywordId } = wifiConecta();
  const antiga = resolveCanonicalMineradorArquitetoImportEligibility({
    brandId: BRAND,
    keywords: keywords.map(k => ({ id: k.id, brandId: BRAND, status: k.status })),
    workflowItems: [...workflowStateByKeywordId].map(([subjectId, state]) => ({ marcaId: BRAND, subjectType: "keyword", subjectId, stage: "architect", state })),
    articleDnaKeywordIds: new Set(),
  });
  // O modal antigo descartava NOT_APPROVED e só deixava marcar IMPORTABLE/PUBLISHED_PROTECTED.
  const mostradas = antiga.filter(item => item.importability !== CANONICAL_IMPORTABILITY.NOT_APPROVED);
  const marcaveis = mostradas.filter(item => item.importability === CANONICAL_IMPORTABILITY.IMPORTABLE || item.importability === CANONICAL_IMPORTABILITY.PUBLISHED_PROTECTED);
  assert.equal(mostradas.length, 58);
  assert.equal(marcaveis.length, 0, "nada para marcar: o modal parecia não importar");

  // A lista leve mostra as 64; as 6 vão ao portão e voltam com o motivo.
  const pool = classifyArquitetoImportPool({ keywords, workflowStateByKeywordId, incorporatedKeywordIds: new Set() });
  assert.equal(pool.items.length, 64);
  assert.equal(pool.items.filter(item => item.state === "in_arquiteto").length, 58);
  assert.deepEqual(pool.gateIds.sort(), ["br-0", "br-1", "br-2", "br-3", "br-4", "br-sem"]);
  const comPortao = applyArquitetoImportGate(pool.items, pool.gateIds, pool.gateIds.map(id => ({ id, action: "blocked" as const, missing: ["logic" as const], reasons: [], alreadyInArquiteto: false })));
  const bruta = comPortao.find(item => item.id === "br-0")!;
  assert.equal(bruta.state, "out");
  assert.equal(arquitetoImportLineLabel(bruta), "fora: falta a Lógica");
});

test("importar por cor: as cinco cores com contagens; escolher uma marca as que podem ir e diz quais ficam fora, com motivo", () => {
  const { keywords, workflowStateByKeywordId } = wifiConecta();
  // Duas brutas laranja ficaram prontas para aprovar (Lógica e Volume feitos).
  const pool = classifyArquitetoImportPool({ keywords, workflowStateByKeywordId, incorporatedKeywordIds: new Set() });
  const itens = applyArquitetoImportGate(pool.items, pool.gateIds, [
    { id: "br-0", action: "approve_and_send", missing: [], reasons: [], alreadyInArquiteto: false },
    { id: "br-1", action: "approve_and_send", missing: [], reasons: [], alreadyInArquiteto: false },
    { id: "br-2", action: "blocked", missing: ["logic"], reasons: [], alreadyInArquiteto: false },
    { id: "br-3", action: "blocked", missing: ["volume"], reasons: [], alreadyInArquiteto: false },
    { id: "br-4", action: "blocked", missing: [], reasons: ["Não aprovada no Minerador, ou aprovada e alterada depois (o pacote aprovado divergiu): aprove-a de novo."], alreadyInArquiteto: false },
    { id: "br-sem", action: "blocked", missing: ["logic"], reasons: [], alreadyInArquiteto: false },
  ]);
  // F4 (D2, ajuste declarado 2026-10-14): "aprovar e enviar" não importa daqui — vira "precisa aprovar no Minerador".
  const resumo = summarizeArquitetoImportColors(itens, corDoGrupo);
  assert.deepEqual(resumo.map(cor => cor.color), ["amarelo", "azul", "verde", "lima", "laranja"]);
  assert.deepEqual(resumo.find(cor => cor.color === "laranja"), { color: "laranja", total: 56, importable: 0, approveInMinerador: 2, inArquiteto: 51, out: 3, refresh: 0 });
  assert.deepEqual(resumo.find(cor => cor.color === "azul"), { color: "azul", total: 7, importable: 0, approveInMinerador: 0, inArquiteto: 7, out: 0, refresh: 0 });
  assert.equal(resumo.find(cor => cor.color === "verde")!.total, 0);

  const laranja = selectArquitetoImportColor(itens, "laranja", corDoGrupo);
  assert.deepEqual(laranja.importIds, []);
  assert.deepEqual(laranja.approveInMineradorIds, ["br-0", "br-1"]);
  assert.equal(arquitetoImportLineLabel(itens.find(item => item.id === "br-0")!), "precisa aprovar no Minerador");
  assert.equal(laranja.inArquiteto, 51);
  assert.deepEqual(laranja.out.map(item => [item.id, arquitetoImportLineLabel(item)]), [
    ["br-2", "fora: falta a Lógica"],
    ["br-3", "fora: falta o Volume"],
    ["br-4", "fora: alterada depois de aprovada: reaprove no Minerador"],
  ]);
  // A sem cor nunca entra numa cor.
  assert.equal(laranja.out.some(item => item.id === "br-sem"), false);
});

type Row = { id: string; keyword: string; status: string | null; analise_semantica: Record<string, unknown> | null };
type Entry = { id: string; currentStatus: string; outcome: "unchanged" | "blocked" | "ready"; blockers: string[]; readiness: { ok: boolean; missing: unknown; reason: string | null } | null };

function fakeDeps(registro: { approved: string[][]; sent: string[][] }): ApproveAndSendDeps<Row, Entry> {
  const rows: Row[] = [
    { id: "ok", keyword: "aprovada ok", status: "aprovado", analise_semantica: { a: 1 } },
    { id: "mexida", keyword: "aprovada e mexida", status: "aprovado", analise_semantica: { a: 2 } },
    { id: "pronta", keyword: "pronta para aprovar", status: "em_revisao", analise_semantica: { a: 3 } },
    { id: "sem-logica", keyword: "sem lógica", status: "bruto", analise_semantica: null },
    { id: "destino", keyword: "destino ruim", status: "aprovado", analise_semantica: { a: 4 } },
  ];
  const entries: Record<string, Entry> = {
    ok: { id: "ok", currentStatus: "aprovado", outcome: "unchanged", blockers: [], readiness: { ok: true, missing: [], reason: null } },
    mexida: { id: "mexida", currentStatus: "aprovado", outcome: "ready", blockers: [], readiness: { ok: true, missing: [], reason: null } },
    pronta: { id: "pronta", currentStatus: "em_revisao", outcome: "ready", blockers: [], readiness: { ok: true, missing: [], reason: null } },
    "sem-logica": { id: "sem-logica", currentStatus: "bruto", outcome: "blocked", blockers: ["Aprovar exige Lógica."], readiness: { ok: false, missing: ["logic"], reason: "Aprovar exige Lógica." } },
    destino: { id: "destino", currentStatus: "aprovado", outcome: "unchanged", blockers: [], readiness: { ok: true, missing: [], reason: null } },
  };
  const status = new Map(rows.map(row => [row.id, row.status] as const));
  return {
    readRows: async ids => ({ rows: rows.filter(row => ids.includes(row.id)).map(row => ({ ...row, status: status.get(row.id) ?? null })), missingIds: ids.filter(id => !rows.some(row => row.id === id)) }),
    entries: lidas => lidas.map(row => status.get(row.id) === "aprovado" && entries[row.id].outcome === "ready" && registro.approved.flat().includes(row.id) ? { ...entries[row.id], outcome: "unchanged" as const } : entries[row.id]),
    approve: async (lidas) => { registro.approved.push(lidas.map(row => row.id)); for (const row of lidas) status.set(row.id, "aprovado"); return lidas.map(row => ({ id: row.id, outcome: "applied" as const })); },
    previewSend: async ids => ({ eligibleKeywordIds: ids.filter(id => id !== "destino"), existingKeywordIds: [], refused: ids.includes("destino") ? [{ keywordId: "destino", reason: "A página de destino do Assunto foi recusada: fora do domínio da marca." }] : [] }),
    send: async ids => {
      registro.sent.push([...ids]);
      return { importedKeywordIds: ids.filter(id => id !== "destino"), refused: ids.includes("destino") ? [{ keywordId: "destino", reason: "A página de destino do Assunto foi recusada." }] : [], declaredPlanSilos: [{ message: "Silo do plano Laranja confirmado; 2 keywords entraram nele.", pendingConfirmation: null }] };
    },
    hash: value => String(JSON.stringify(value).length).padStart(64, "0"),
  };
}

/*
 * F4 · O ARQUITETO SÓ LÊ (SDD 2026-10-13 `sdd-arquiteto-so-le-e-listas-leves`,
 * item 2, D2; ajuste declarado 2026-10-14): o modal NÃO aprova — a etapa de
 * aprovar fica SEMPRE fechada, com ou sem `minerador:approve`. A que só falta
 * aprovar fica "precisa aprovar no Minerador" (o botão abre o "Aprovar e
 * enviar" de lá); as já aprovadas seguem pelo envio.
 */
test("F4 (D2): o modal nunca aprova — a que falta aprovar fica 'precisa aprovar no Minerador'; as aprovadas seguem", async () => {
  const registro = { approved: [] as string[][], sent: [] as string[][] };
  const ids = ["ok", "mexida", "pronta", "sem-logica", "destino"];
  const previa = await previewApproveAndSend({ brandId: BRAND, actorId: "ator", keywordIds: ids, send: true }, withoutArquitetoApproval(fakeDeps(registro)));
  const acao = Object.fromEntries(previa.lines.map(line => [line.id, line.action]));
  assert.deepEqual(acao, { ok: "send_only", mexida: "blocked", pronta: "blocked", "sem-logica": "blocked", destino: "blocked" });
  assert.equal(previa.lines.some(line => line.action === "approve_and_send"), false, "nada de 'aprovar e enviar' pelo Arquiteto");
  const pool = classifyArquitetoImportPool({ keywords: ids.map(id => ({ id, keyword: id, status: "x", group_id: LARANJA })), workflowStateByKeywordId: new Map(), incorporatedKeywordIds: new Set() });
  const itens = applyArquitetoImportGate(pool.items, pool.gateIds, previa.lines);
  const rotulo = Object.fromEntries(itens.map(item => [item.id, arquitetoImportLineLabel(item)]));
  assert.deepEqual(rotulo, {
    ok: "pode importar",
    mexida: "precisa aprovar no Minerador",
    pronta: "precisa aprovar no Minerador",
    "sem-logica": "fora: falta a Lógica",
    destino: "fora: página de destino do Assunto recusada",
  });
  assert.equal(itens.find(item => item.id === "pronta")!.detail, ARQUITETO_IMPORT_APPROVE_IN_MINERADOR_REASON);
  assert.equal(itens.find(item => item.id === "mexida")!.detail, ARQUITETO_IMPORT_REAPPROVE_REASON);
  assert.equal(isArquitetoImportable(itens.find(item => item.id === "pronta")!), false);
  assert.equal(registro.approved.length, 0, "a prévia não grava");
});

test("F4 (D2): aplicar só envia as já aprovadas; a aprovação nunca é chamada; Silo do plano e desfecho por item, conferido na releitura", async () => {
  const registro = { approved: [] as string[][], sent: [] as string[][] };
  const ids = ["ok", "pronta", "sem-logica", "destino"];
  const deps = withoutArquitetoApproval(fakeDeps(registro));
  const previa = await previewApproveAndSend({ brandId: BRAND, actorId: "ator", keywordIds: ids, send: true }, deps);
  const resultado = await applyApproveAndSend({ brandId: BRAND, actorId: "ator", keywordIds: ids, send: true, decisionHash: previa.decisionHash, excludedIds: [] }, deps);
  assert.deepEqual(registro.approved, [], "o Arquiteto não aprova");
  assert.deepEqual(registro.sent, [["ok"]]);
  assert.deepEqual(resultado.notices, ["Silo do plano Laranja confirmado; 2 keywords entraram nele."]);
  assert.deepEqual(Object.fromEntries(resultado.results.map(line => [line.id, line.outcome])), { ok: "sent", pronta: "blocked", "sem-logica": "blocked", destino: "blocked" });

  // Releitura: "ok" não apareceu → não confirmada.
  const conferido = confirmArquitetoImportResult(resultado, [{ id: "ok", state: "send" }]);
  assert.equal(conferido.allConfirmed, false);
  assert.deepEqual(conferido.lines.filter(line => !line.confirmed).map(line => line.id), ["ok"]);
  assert.equal(confirmArquitetoImportResult(resultado, [{ id: "ok", state: "in_arquiteto" }]).allConfirmed, true);

  // Desmarcar na prévia é recusa por item: não entra no resultado mostrado.
  const outra = { approved: [] as string[][], sent: [] as string[][] };
  const deps2 = withoutArquitetoApproval(fakeDeps(outra));
  const previa2 = await previewApproveAndSend({ brandId: BRAND, actorId: "ator", keywordIds: ["ok", "pronta"], send: true }, deps2);
  const resultado2 = await applyApproveAndSend({ brandId: BRAND, actorId: "ator", keywordIds: ["ok", "pronta"], send: true, decisionHash: previa2.decisionHash, excludedIds: ["ok"] }, deps2);
  assert.deepEqual(outra.approved, []); assert.deepEqual(outra.sent, []);
  assert.deepEqual(confirmArquitetoImportResult(resultado2, []).lines.map(line => line.id), ["pronta"]);
});

test("F4 (D2), no código: o portão sem aprovar, a leitura com a sessão (sem service role) e o envio pelo handoff do Arquiteto", () => {
  const servidor = ler("lib/server/arquiteto-minerador-import.ts");
  assert.match(servidor, /import \{ applyApproveAndSend, previewApproveAndSend \} from "@\/lib\/minerador\/approve-and-send-core";/);
  assert.match(servidor, /return withoutArquitetoApproval\(\{/);
  assert.match(servidor, /readDecisionKeywords\(context\.brandId, unique\.slice\(start, start \+ ID_BATCH\), context\.supabase\)/, "o MESMO leitor, em lotes, com o cliente da sessão");
  assert.match(servidor, /send: \(ids: readonly string\[\]\) => createMineradorArquitetoHandoff\(context, ids, \{ partial: true \}\)/);
  assert.doesNotMatch(servidor, /approveAndSendDeps|minerador-approve-and-send|getOperationalClient|createCanonicalServiceClient|applyKeywordDecisionEntries|actorCanApproveInMinerador/, "nada de service role nem de aprovar");
  assert.doesNotMatch(servidor, /from\("editorial_workflow_items"\)\.(upsert|update|insert)|from\("minerador_keywords"\)\.(update|insert|upsert|delete)/, "nenhum envio paralelo nem escrita no Minerador");
  const rota = ler("app/api/arquiteto/import/route.ts");
  assert.match(rota, /resolvePipelineContext\(\{ brandId: query\.brandId, module: "arquiteto", action: "view" \}\)/);
  assert.match(rota, /resolvePipelineContext\(\{ brandId: input\.brandId, module: "arquiteto", action: "create" \}\)/);
  assert.match(rota, /applyArquitetoImport\(context, \{ keywordIds: input\.keywordIds, decisionHash: input\.decisionHash!/);
  // O encadeamento único continua o do Minerador; o envio parcial é o do handoff.
  const encadeamento = ler("lib/server/minerador-approve-and-send.ts");
  assert.match(encadeamento, /createMineradorArquitetoHandoff\(await arquitetoContext\(brandId, actorId\), keywordIds, \{ partial: true \}\)/);
  // O modal fala só com a rota nova; o handoff em lote (409 do lote) saiu da tela do Arquiteto.
  const dialogo = ler("modules/arquiteto/minerador-import-dialog.tsx");
  assert.match(dialogo, /const ROUTE = "\/api\/arquiteto\/import";/);
  assert.doesNotMatch(dialogo, /\/api\/arquiteto\/handoff/);
  // F4 (D2): "Aprovar no Minerador (N)" abre o Minerador (o "Aprovar e enviar" de lá), filtrado na cor.
  assert.match(dialogo, /mineradorHandoffHref\(brandRef, \{ action: "aprovar", ids, color: cor \}\)/);
  assert.match(dialogo, /Aprovar no Minerador \(\{aprovarNaLista\.length\}\)/);
  assert.doesNotMatch(dialogo, /Aprovar no Minerador e importar/);
  const workspace = ler("modules/arquiteto/arquiteto-workspace.tsx");
  assert.doesNotMatch(workspace, /persistMineradorArquitetoHandoff|WorkflowImportDialog/);
  assert.match(workspace, /<MineradorImportDialog\s+brandId=\{selectedBrandId \|\| null\}\s+brandRef=\{serpSubjectBrandRef\}/);
});

test("resposta enxuta: cada linha só com id, keyword, grupo, status e estado; a leitura não pede analise_semantica", () => {
  assert.deepEqual([...ARQUITETO_IMPORT_ITEM_FIELDS], ["id", "keyword", "groupId", "status", "state", "reason", "detail"]);
  const { keywords, workflowStateByKeywordId } = wifiConecta();
  const pool = classifyArquitetoImportPool({ keywords, workflowStateByKeywordId, incorporatedKeywordIds: new Set(["la-0"]) });
  const itens = applyArquitetoImportGate(pool.items, pool.gateIds, pool.gateIds.map(id => ({ id, action: "blocked" as const, missing: ["logic" as const], reasons: [], alreadyInArquiteto: false })));
  for (const item of itens) assert.deepEqual(Object.keys(item).sort(), [...ARQUITETO_IMPORT_ITEM_FIELDS].sort());
  const bytes = Buffer.byteLength(JSON.stringify({ success: true, data: { items: itens, canApprove: true, canCreate: true, checked: 6, readAt: new Date(0).toISOString() } }));
  assert.ok(bytes < 15_000, `64 linhas em ${bytes} bytes`);

  const servidor = ler("lib/server/arquiteto-minerador-import.ts");
  // 2026-10-14 (WifiConecta, azul): além do de sempre, só o TEXTO do hash da aprovação e do pacote recebido, por caminho JSON.
  assert.match(servidor, /POOL_KEYWORD_COLUMNS = "id,keyword,status,group_id,approval_hash:analise_semantica->aprovacao->>contentHash"/);
  assert.match(servidor, /POOL_WORKFLOW_COLUMNS = "subject_id,state,received_hash:payload->approvedDna->>contentHash"/);
  assert.match(servidor, /\.select\(POOL_KEYWORD_COLUMNS\)/);
  assert.match(servidor, /\.select\(POOL_WORKFLOW_COLUMNS\)/);
  assert.match(servidor, /readArticleKeywordIndex\(db, brandId\)/, "o índice do ArticleDNA por caminho JSON, sem o payload");
  assert.doesNotMatch(servidor.replace(/analise_semantica->aprovacao->>contentHash/g, ""), /analise_semantica/, "nada do DNA além do hash");
  assert.doesNotMatch(servidor.replace(/payload->approvedDna->>contentHash/g, ""), /select\([^)]*payload/, "nada do pacote além do hash");
  assert.doesNotMatch(servidor, /loadCanonicalArquitetoWorkspace|listArquitetoArtifacts/, "a lista não lê a mesa nem os artefatos inteiros");
});

test("abre filtrado pela cor ativa da etiqueta; abrir não relê a mesa inteira", () => {
  assert.equal(initialArquitetoImportColor("laranja"), "laranja");
  assert.equal(initialArquitetoImportColor("todos"), null);
  assert.equal(initialArquitetoImportColor("sem-grupo"), null);
  assert.equal(initialArquitetoImportColor({ legacyGroupId: "x" }), null);
  const workspace = ler("modules/arquiteto/arquiteto-workspace.tsx");
  assert.match(workspace, /initialColor=\{initialArquitetoImportColor\(arquitetoGroups\.choice\)\}/);
  assert.match(workspace, /onClick=\{\(\) => \{ setKeywordImportOpen\(true\); \}\}/);
  assert.doesNotMatch(workspace, /setKeywordImportOpen\(true\); void topbarHandlersRef\.current\.fetchMasterList\(\)/);
  const dialogo = ler("modules/arquiteto/minerador-import-dialog.tsx");
  assert.match(dialogo, /const colorToSelect = useRef<EditorialGroupColor \| null>\(initialColor\);/);
  assert.match(dialogo, /const \[color, setColor\] = useState<EditorialGroupColor \| null>\(initialColor\);/);
  assert.match(workspace, /\{keywordImportOpen && <MineradorImportDialog/, "montado a cada abertura: estado novo, cor da barra daquele momento");
  assert.match(dialogo, /if \(corInicial\) setSelected\(new Set\(selectArquitetoImportColor\(answer\.data\.items, corInicial, colorOfGroup\)\.importIds\)\);/);
  assert.match(dialogo, /`Importar a cor \$\{corDaEscolha\} \(\$\{selecionadasDaCor\.length\}\)`/);
});

test("o que o Arquiteto está fazendo: etapa nomeada e contagem; resultado só depois da releitura", () => {
  assert.deepEqual(arquitetoImportProgress("previewing", { approve: 0, send: 0 }), { label: "Conferindo no servidor quais podem ir", done: 1, total: 4 });
  // F4 (D2, ajuste declarado 2026-10-14): o modal não aprova; a etapa só importa as já aprovadas.
  const aplicando = arquitetoImportProgress("applying", { approve: 0, send: 3 });
  assert.equal(aplicando.done, 2);
  assert.match(aplicando.label, /^Importando 3 já aprovada\(s\) no Minerador para o Arquiteto \(o Silo do plano/);
  assert.doesNotMatch(aplicando.label, /Aprovando/);
  assert.deepEqual(arquitetoImportProgress("rereading", { approve: 0, send: 1 }).done, 3);
  assert.deepEqual(arquitetoImportProgress("refreshing_mesa", { approve: 0, send: 1 }), { label: "Atualizando a mesa do Arquiteto", done: 4, total: 4 });
  const dialogo = ler("modules/arquiteto/minerador-import-dialog.tsx");
  assert.match(dialogo, /<OperationProgress label=\{progresso\.label\} startedAt=\{phaseStartedAt\} done=\{progresso\.done\} total=\{progresso\.total\} unit="etapas"/);
  const confirmar = dialogo.slice(dialogo.indexOf("const confirmImport = async"), dialogo.indexOf("const previewLines ="));
  assert.ok(confirmar.length > 200);
  const etapa = confirmar.indexOf('startPhase("rereading")');
  const releitura = confirmar.indexOf("const relida = await rereadPool();");
  const conferencia = confirmar.indexOf("confirmArquitetoImportResult(answer.data, relida?.items ?? [])");
  assert.ok(etapa >= 0 && releitura > etapa && conferencia > releitura, "etapa nomeada → releitura no servidor → resultado conferido");
  assert.match(confirmar, /startPhase\("refreshing_mesa"\);\s*onApplied\(\);/);
});
