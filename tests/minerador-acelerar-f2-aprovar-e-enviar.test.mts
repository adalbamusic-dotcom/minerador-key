import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  APPROVE_AND_SEND_STALE_REASON,
  ApproveAndSendStaleError,
  applyApproveAndSend,
  describeApproveAndSendResult,
  previewApproveAndSend,
  type ApproveAndSendDeps,
  type ApproveAndSendEntry,
  type ApproveAndSendRow,
} from "../lib/minerador/approve-and-send-core.ts";

/*
 * SDD `docs/compartilhado/sdd-acelerar-fluxo-do-plano-2026-10-13.md`, item 2
 * (F2): "Aprovar e enviar ao Arquiteto" — prévia com motivo por keyword, recusa
 * por item, lote misto sem 409, idempotência, prévia vencida recusada e a tela
 * sem gravar "aprovado" pelo navegador. Núcleos injetados; nada de banco nem
 * chamada paga.
 */

const semComentarios = (texto: string) => texto
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split(/\r?\n/)
  .filter(linha => !linha.trimStart().startsWith("//"))
  .join("\n");

type Linha = ApproveAndSendRow & { ready: "ready" | "unchanged" | "blocked"; missing?: string[]; blockers?: string[]; refuseSend?: string };

function banco(linhas: Linha[]) {
  const estado = new Map(linhas.map(linha => [linha.id, { ...linha }]));
  const chamadas = { approve: [] as string[][], send: [] as string[][], previewSend: [] as string[][] };
  const entryOf = (row: Linha): ApproveAndSendEntry => ({
    id: row.id,
    currentStatus: row.status || "em revisão",
    outcome: row.ready,
    blockers: row.ready === "blocked" ? (row.blockers ?? ["Aprovar exige Lógica."]) : [],
    readiness: { ok: row.ready !== "blocked", missing: row.missing ?? [], reason: null },
  });
  const deps: ApproveAndSendDeps<Linha, ApproveAndSendEntry> = {
    readRows: async ids => {
      const rows = ids.flatMap(id => estado.has(id) ? [{ ...estado.get(id)! }] : []);
      return { rows, missingIds: ids.filter(id => !estado.has(id)) };
    },
    entries: rows => rows.map(entryOf),
    approve: async (rows, entries) => {
      chamadas.approve.push(rows.map(row => row.id));
      return entries.map(entry => {
        const row = estado.get(entry.id)!;
        if (entry.outcome === "unchanged") return { id: entry.id, outcome: "unchanged" as const };
        row.status = "aprovado";
        row.ready = "unchanged";
        return { id: entry.id, outcome: "applied" as const };
      });
    },
    previewSend: async ids => {
      chamadas.previewSend.push([...ids]);
      const refused = ids.flatMap(id => estado.get(id)?.refuseSend ? [{ keywordId: id, reason: estado.get(id)!.refuseSend! }] : []);
      return { eligibleKeywordIds: ids.filter(id => !estado.get(id)?.refuseSend), existingKeywordIds: ids.filter(id => id.startsWith("ja-")), refused };
    },
    send: async ids => {
      chamadas.send.push([...ids]);
      const refused = ids.flatMap(id => estado.get(id)?.refuseSend ? [{ keywordId: id, reason: estado.get(id)!.refuseSend! }] : []);
      return { importedKeywordIds: ids.filter(id => !estado.get(id)?.refuseSend), refused };
    },
    hash: value => createHash("sha256").update(JSON.stringify(value)).digest("hex"),
  };
  return { deps, estado, chamadas };
}

const base = { brandId: "b1", actorId: "u1" };
const linha = (id: string, ready: Linha["ready"], extra: Partial<Linha> = {}): Linha => ({ id, keyword: `kw ${id}`, status: ready === "unchanged" ? "aprovado" : "em revisão", analise_semantica: null, ready, ...extra });

test("item 2 · a prévia separa aprovar e enviar, só enviar e não podem ir — com o motivo de cada uma, agrupado", async () => {
  const { deps } = banco([
    linha("a", "ready"),
    linha("ja-b", "unchanged"),
    linha("c", "blocked", { missing: ["logic"] }),
    linha("d", "blocked", { missing: ["logic", "volume"] }),
    linha("e", "blocked", { blockers: ["Conteúdo publicado é protegido."] }),
  ]);
  const previa = await previewApproveAndSend({ ...base, keywordIds: ["a", "ja-b", "c", "d", "e", "sumiu"], send: true }, deps);
  assert.deepEqual(previa.lines.map(line => [line.id, line.action]), [["a", "approve_and_send"], ["ja-b", "send_only"], ["c", "blocked"], ["d", "blocked"], ["e", "send_only"], ["sumiu", "blocked"]]);
  assert.equal(previa.lines.find(line => line.id === "ja-b")?.alreadyInArquiteto, true);
  assert.equal(previa.counts.blocked, 3);
  assert.match(previa.blockedSummary, /falta a Lógica: 2/);
  assert.match(previa.blockedSummary, /falta o Volume: 1/);
  assert.match(previa.blockedSummary, /não existe mais nesta marca/);
  assert.match(previa.decisionHash, /^[0-9a-f]{64}$/);
});

test("item 2 · aplicar: desmarcada fica fora, lote misto sem 409, recusa do envio só na keyword dela", async () => {
  const { deps, chamadas, estado } = banco([
    linha("a", "ready"),
    linha("b", "ready", { refuseSend: "Página de destino recusada." }),
    linha("c", "ready"),
    linha("ja-d", "unchanged"),
    linha("e", "blocked", { missing: ["volume"] }),
  ]);
  const previa = await previewApproveAndSend({ ...base, keywordIds: ["a", "b", "c", "ja-d", "e"], send: true }, deps);
  const resultado = await applyApproveAndSend({ ...base, keywordIds: ["a", "b", "c", "ja-d", "e"], send: true, decisionHash: previa.decisionHash, excludedIds: ["c"] }, deps);
  const por = Object.fromEntries(resultado.results.map(line => [line.id, line.outcome]));
  assert.deepEqual(por, { a: "approved_and_sent", b: "approved_not_sent", c: "excluded", "ja-d": "sent", e: "blocked" });
  assert.equal(resultado.results.find(line => line.id === "b")?.reason, "Página de destino recusada.");
  assert.deepEqual(chamadas.approve, [["a", "b"]], "só as marcadas e prontas são aprovadas");
  assert.deepEqual(chamadas.send, [["a", "b", "ja-d"]], "um envio só, parcial");
  assert.equal(estado.get("c")!.status, "em revisão", "a desmarcada não muda");
  assert.equal(resultado.readbackConfirmed, true);
  assert.match(describeApproveAndSendResult(resultado), /1 aprovada\(s\) e enviada\(s\)/);
});

test("item 2 · idempotência: reaplicar o mesmo pedido não aprova de novo", async () => {
  const { deps, chamadas } = banco([linha("a", "ready")]);
  const p1 = await previewApproveAndSend({ ...base, keywordIds: ["a"], send: true }, deps);
  await applyApproveAndSend({ ...base, keywordIds: ["a"], send: true, decisionHash: p1.decisionHash }, deps);
  const p2 = await previewApproveAndSend({ ...base, keywordIds: ["a"], send: true }, deps);
  assert.equal(p2.lines[0].action, "send_only");
  const r2 = await applyApproveAndSend({ ...base, keywordIds: ["a"], send: true, decisionHash: p2.decisionHash }, deps);
  assert.equal(r2.results[0].outcome, "sent");
  assert.equal(chamadas.approve.length, 1, "a segunda vez não passa pela aprovação");
});

test("item 2 · prévia vencida é recusada e nada é gravado", async () => {
  const { deps, chamadas, estado } = banco([linha("a", "ready")]);
  const previa = await previewApproveAndSend({ ...base, keywordIds: ["a"], send: true }, deps);
  estado.get("a")!.analise_semantica = { mexeu: true };
  await assert.rejects(() => applyApproveAndSend({ ...base, keywordIds: ["a"], send: true, decisionHash: previa.decisionHash }, deps), ApproveAndSendStaleError);
  assert.equal(chamadas.approve.length, 0);
  assert.equal(chamadas.send.length, 0);
});

test("item 2 · só aprovar (Status → aprovado da tela): sem envio e sem prévia do envio", async () => {
  const { deps, chamadas } = banco([linha("a", "ready"), linha("ja-b", "unchanged")]);
  const previa = await previewApproveAndSend({ ...base, keywordIds: ["a", "ja-b"], send: false }, deps);
  assert.deepEqual(previa.lines.map(line => line.action), ["approve_only", "unchanged"]);
  const resultado = await applyApproveAndSend({ ...base, keywordIds: ["a", "ja-b"], send: false, decisionHash: previa.decisionHash }, deps);
  assert.deepEqual(resultado.results.map(line => line.outcome), ["approved", "unchanged"]);
  assert.equal(chamadas.send.length, 0);
  assert.equal(chamadas.previewSend.length, 0);
});

test("item 2 · releitura que não confirma vira 'mudou no meio', nunca sucesso", async () => {
  const { deps } = banco([linha("a", "ready")]);
  const semGravar: typeof deps = { ...deps, approve: async (_rows, entries) => entries.map(entry => ({ id: entry.id, outcome: "applied" as const })) };
  const previa = await previewApproveAndSend({ ...base, keywordIds: ["a"], send: false }, semGravar);
  const resultado = await applyApproveAndSend({ ...base, keywordIds: ["a"], send: false, decisionHash: previa.decisionHash }, semGravar);
  assert.equal(resultado.results[0].outcome, "stale");
  assert.equal(resultado.readbackConfirmed, false);
  assert.notEqual(APPROVE_AND_SEND_STALE_REASON, "");
});

test("item 2 · a tela não grava 'aprovado' pelo navegador; usa a rota do servidor e o diálogo", () => {
  const tela = semComentarios(readFileSync("modules/minerador/minerador-workspace.tsx", "utf8"));
  assert.doesNotMatch(tela, /applyApproval\(/);
  assert.doesNotMatch(tela, /\.update\(\{ status: normalizedStatus, analise_semantica/);
  assert.doesNotMatch(tela, /status: "aprovado"/);
  assert.match(tela, /if \(normalizedStatus === "aprovado"\) \{[\s\S]*?openApproveAndSend\(idsToUpdate,[\s\S]*?approveOneOnServer\(idsToUpdate\[0\]\)/);
  assert.match(tela, /<ApproveAndSendDialog/);
  assert.match(tela, /label="Aprovar e enviar"/);
  const dialogo = semComentarios(readFileSync("modules/minerador/approve-and-send-dialog.tsx", "utf8"));
  assert.match(dialogo, /\/api\/minerador\/marcas\/\$\{encodeURIComponent\(brandId\)\}\/keywords\/approve-and-send/);
  assert.match(dialogo, /decisionHash: preview\.decisionHash, excludedIds: \[\.\.\.excluded\]/);
  assert.match(dialogo, /await onApplied\(tocadas, aplicado\)/);
});

test("item 2 · um encadeamento só: rota, conversão e servidor usam o mesmo núcleo; envio antigo inalterado", () => {
  const rota = semComentarios(readFileSync("app/api/minerador/marcas/[brandId]/keywords/approve-and-send/route.ts", "utf8"));
  assert.match(rota, /module: "minerador", action: "approve"/);
  assert.match(rota, /module: "arquiteto", action: "create"/);
  assert.doesNotMatch(rota, /\.delete\(|keywords\/delete|purge/);
  const servidor = semComentarios(readFileSync("lib/server/minerador-approve-and-send.ts", "utf8"));
  assert.match(servidor, /applyKeywordDecisionEntries\(/);
  assert.match(servidor, /createMineradorArquitetoHandoff\(await arquitetoContext\(brandId, actorId\), keywordIds, \{ partial: true \}\)/);
  const conversao = semComentarios(readFileSync("lib/server/minerador-subject-conversion.ts", "utf8"));
  assert.match(conversao, /approveKeywordsOnServer\(/);
  assert.match(conversao, /sendKeywordsToArquitetoOnServer\(/);
  const handoffAntigo = semComentarios(readFileSync("app/api/arquiteto/handoff/route.ts", "utf8"));
  assert.match(handoffAntigo, /createMineradorArquitetoHandoff\(context, parsed\.keywordIds\)/, "a rota antiga continua sem o modo parcial");
  const envio = semComentarios(readFileSync("lib/server/arquiteto-workspace.ts", "utf8"));
  assert.match(envio, /if \(refusedByApproval\.length && partial\) \{/);
  assert.match(envio, /\} else if \(refusedByApproval\.length\) \{\s*const first = refusedByApproval\[0\];/);
  assert.match(envio, /\.\.\.\(options\.partial && prepared\.refused\.length \? \{ refused: prepared\.refused \} : \{\}\)/);
});
