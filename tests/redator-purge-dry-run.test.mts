/**
 * ===== CORTE 5 · A SELEÇÃO DA PURGA, ANTES DE EXISTIR PURGA =====
 *
 * COMPORTAMENTAL (01-10) — exercita as guardas de verdade, sem banco.
 * ESTRUTURAL (11-16) — lê o código e prova que a fiação é essa.
 *
 * Nenhum teste aqui apaga nada, e nenhum deles poderia: os módulos sob teste
 * não importam banco nem Storage.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  classifyStorageRemoval, canDeleteRowAfterStorage, isCurrentMediaRow, planMediaPurge,
  resolveSuccessorChain, summarizePurge, type MediaPurgeRow,
} from "../lib/redator/media-purge-plan.ts";
import {
  planVersionPurge, PURGE_FORBIDDEN_TABLES, resolveVersionChain, VERSION_PURGE_TABLES, type VersionPurgeRow,
} from "../lib/redator/version-purge-plan.ts";

const fonte = (caminho: string) => readFile(new URL(caminho, import.meta.url), "utf8");
const AGORA = "2026-09-21T12:00:00.000Z";
const MARCA = "marca-1";

const midia = (o: Partial<MediaPurgeRow> = {}): MediaPurgeRow => ({
  assetId: "velho", brandId: MARCA, documentId: "doc-1", status: "uploaded",
  storagePath: "marca-1/doc/velho.png", anchorKind: "article_block", anchorRef: "bloco-7",
  supersededAt: "2026-09-19T00:00:00.000Z", purgeAfter: "2026-09-21T00:00:00.000Z",
  replacedByAssetId: "novo", ...o,
});
const sucessor = (o: Partial<MediaPurgeRow> = {}): MediaPurgeRow => midia({
  assetId: "novo", supersededAt: null, purgeAfter: null, replacedByAssetId: null, ...o,
});

const versao = (o: Partial<VersionPurgeRow> = {}): VersionPurgeRow => ({
  versionId: "v1", kind: "content_document", ownerId: "doc-1", brandId: MARCA,
  currentVersionId: "v2", supersededAt: "2026-09-19T00:00:00.000Z",
  supersededByVersionId: "v2", purgeAfter: "2026-09-21T00:00:00.000Z", ...o,
});
/** A corrente do dono: sem `superseded_at` e sem sucessora. */
const versaoCorrente = (id: string, current = id): VersionPurgeRow =>
  versao({ versionId: id, currentVersionId: current, supersededAt: null, supersededByVersionId: null, purgeAfter: null });

/* ======================= COMPORTAMENTAL ======================= */

test("01 · o item atual nunca aparece na seleção", () => {
  /* Mídia: o atual não tem `superseded_at`, logo nem chega a ser candidato. */
  const atual = sucessor();
  const d = planMediaPurge({ candidate: atual, rows: [midia(), atual], now: AGORA });
  assert.equal(d.eligible, false);
  assert.equal(d.eligible === false && d.refusal, "not_superseded");

  /* Versão: `is_current` é conferido por nome, antes de qualquer outra coisa. */
  const v2 = versaoCorrente("v2");
  const corrente = planVersionPurge(v2, [v2], AGORA);
  assert.equal(corrente.eligible, false);
  assert.equal(corrente.eligible === false && corrente.refusal, "is_current");
});

test("02 · substituído dentro das 48h não aparece", () => {
  const dentro = planMediaPurge({
    candidate: midia({ purgeAfter: "2026-09-21T12:00:01.000Z" }),
    rows: [midia({ purgeAfter: "2026-09-21T12:00:01.000Z" }), sucessor()], now: AGORA,
  });
  assert.equal(dentro.eligible === false && dentro.refusal, "window_open");

  const v1Dentro = versao({ purgeAfter: "2026-09-22T00:00:00.000Z" });
  const versaoDentro = planVersionPurge(v1Dentro, [v1Dentro, versaoCorrente("v2")], AGORA);
  assert.equal(versaoDentro.eligible === false && versaoDentro.refusal, "window_open");
});

test("03 · expirado com sucessor de pé aparece", () => {
  const d = planMediaPurge({ candidate: midia(), rows: [midia(), sucessor()], now: AGORA });
  assert.equal(d.eligible, true);
  assert.equal(d.eligible && d.successorAssetId, "novo");
  assert.equal(d.eligible && d.storagePath, "marca-1/doc/velho.png");

  const v1 = versao();
  const v = planVersionPurge(v1, [v1, versaoCorrente("v2")], AGORA);
  assert.equal(v.eligible, true);
  assert.equal(v.eligible && v.successorVersionId, "v2");
});

test("04 · idade sozinha nunca torna elegível", () => {
  /*
   * `created_at` não aparece em condição alguma. Uma linha antiquíssima e
   * corrente continua fora — o que autoriza apagar é ter sido substituída.
   */
  const antigoECorrente = sucessor({ assetId: "antigo" });
  const d = planMediaPurge({ candidate: antigoECorrente, rows: [antigoECorrente], now: "2030-01-01T00:00:00.000Z" });
  assert.equal(d.eligible === false && d.refusal, "not_superseded");
});

test("05 · predecessor sem sucessor válido não aparece", () => {
  /* Sem declaração de sucessor. */
  const semDeclaracao = midia({ replacedByAssetId: null });
  assert.equal(planMediaPurge({ candidate: semDeclaracao, rows: [semDeclaracao], now: AGORA })
    .eligible === false && true, true);

  /* Declara, mas o sucessor não está mais na tabela. */
  const orfao = planMediaPurge({ candidate: midia(), rows: [midia()], now: AGORA });
  assert.equal(orfao.eligible === false && orfao.refusal, "successor_missing");

  /*
   * CORTE 5.1 · aqui havia a asserção que CODIFICAVA o defeito: exigir que o
   * sucessor direto fosse o corrente. Numa cadeia A → B → C(corrente) isso
   * reteria A para sempre. O caso migrou para o teste 17; o que sobra aqui é
   * a cadeia que termina SEM corrente.
   */
  const sucessorSubstituidoSemFim = sucessor({ supersededAt: "2026-09-20T00:00:00.000Z" });
  const d = planMediaPurge({ candidate: midia(), rows: [midia(), sucessorSubstituidoSemFim], now: AGORA });
  assert.equal(d.eligible === false && d.refusal, "chain_no_current",
    "cadeia que morre sem corrente é recusada, mas não por ser cadeia");

  /* O sucessor perdeu a âncora: a posição ficou sem dono. */
  const semAncora = sucessor({ anchorKind: null, anchorRef: null });
  const e = planMediaPurge({ candidate: midia(), rows: [midia(), semAncora], now: AGORA });
  assert.equal(e.eligible === false && e.refusal, "successor_scope_mismatch");

  /* Versão substituída sem sucessor declarado. */
  const semSucessora = versao({ supersededByVersionId: null });
  const v = planVersionPurge(semSucessora, [semSucessora, versaoCorrente("v2")], AGORA);
  assert.equal(v.eligible === false && v.refusal, "no_successor");
});

test("06 · sucessor de outra marca ou outro documento não autoriza a purga", () => {
  for (const fora of [
    sucessor({ brandId: "outra-marca" }),
    sucessor({ documentId: "doc-2" }),
    sucessor({ anchorRef: "bloco-9" }),
    sucessor({ anchorKind: "article_cover" }),
  ]) {
    const d = planMediaPurge({ candidate: midia(), rows: [midia(), fora], now: AGORA });
    assert.equal(d.eligible === false && d.refusal, "successor_scope_mismatch", JSON.stringify(fora));
  }
});

test("07 · o predecessor que voltou a ser atual sai da seleção", () => {
  /*
   * Restaurar dentro da janela limpa `superseded_at`. Sem essa marca a linha
   * deixa de ser candidata — e é assim que a recuperação de 48h protege quem
   * foi restaurado.
   */
  const restaurado = midia({ supersededAt: null, purgeAfter: null, replacedByAssetId: null });
  const d = planMediaPurge({ candidate: restaurado, rows: [restaurado, sucessor()], now: AGORA });
  assert.equal(d.eligible === false && d.refusal, "not_superseded");
});

test("08 · objeto ausente no Storage é idempotente; outra falha preserva a linha", () => {
  for (const ausente of [{ error: { status: 404, message: "Object not found" } },
                         { error: { message: "NoSuchKey" } }]) {
    assert.equal(classifyStorageRemoval(ausente), "already_absent");
    assert.equal(canDeleteRowAfterStorage(classifyStorageRemoval(ausente)), true);
  }
  for (const falha of [{ error: { status: 500, message: "Internal error" } },
                       { error: { message: "fetch failed" } }]) {
    assert.equal(classifyStorageRemoval(falha), "failed");
    assert.equal(canDeleteRowAfterStorage("failed"), false,
      "linha não sai enquanto o arquivo puder estar lá");
  }
});

test("09 · repetir a purga não gera erro nem efeito duplicado", () => {
  /* Linha já apagada não é candidata: ela não está na tabela. */
  const resumo = summarizePurge([
    { assetId: "a", result: "purged", storage: "removed" },
    { assetId: "a", result: "already_purged" },
    { assetId: "b", result: "skipped", refusal: "window_open" },
  ]);
  assert.equal(resumo.purgados, 1);
  assert.equal(resumo.ja_purgados, 1);
  assert.equal(resumo.pulados, 1);
});

test("10 · as tabelas apagáveis são uma lista fechada, e o DNA não está nela", () => {
  assert.deepEqual([...VERSION_PURGE_TABLES], ["content_document_versions", "writer_deliverable_versions"]);
  for (const proibida of PURGE_FORBIDDEN_TABLES) {
    assert.ok(!(VERSION_PURGE_TABLES as readonly string[]).includes(proibida), `${proibida} não pode ser purgável`);
  }
  for (const intocavel of ["editorial_artifact_versions", "editorial_serp_snapshots", "writer_mcp_call_events"]) {
    assert.ok((PURGE_FORBIDDEN_TABLES as readonly string[]).includes(intocavel), `${intocavel} precisa estar declarado fora`);
  }
});

/* ======================= ESTRUTURAL ======================= */

test("11 · o dry-run não tem como escrever", async () => {
  const servico = await fonte("../lib/server/writer-purge-service.ts");
  const codigo = servico.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  const dryRun = codigo.slice(codigo.indexOf("export async function planWriterPurge"),
    codigo.indexOf("export type PurgeExecution"));
  for (const escrita of [".update(", ".insert(", ".upsert(", ".delete(", ".remove(", ".rpc("]) {
    assert.ok(!dryRun.includes(escrita), `dry-run não pode conter ${escrita}`);
  }
  /* E as leituras que ele usa são select puro. */
  const leitura = codigo.slice(codigo.indexOf("async function lerMediaDaMarca"), codigo.indexOf("export type MediaDryRunItem"));
  for (const escrita of [".update(", ".insert(", ".delete(", ".remove("]) {
    assert.ok(!leitura.includes(escrita), `a leitura não pode conter ${escrita}`);
  }
});

test("12 · quem apaga é a autoridade da M2 e da M3, não este serviço", async () => {
  const servico = await fonte("../lib/server/writer-purge-service.ts");
  const codigo = servico.replace(/\/\*[\s\S]*?\*\//g, "");

  assert.match(codigo, /rpc\("lifecycle_confirm_writer_media_purge"/);
  assert.match(codigo, /rpc\("lifecycle_purge_editorial_history"/);
  /* Nenhum DELETE direto em tabela. */
  assert.doesNotMatch(codigo, /\.delete\(\)|DELETE FROM/i);
  /* Nenhum segundo mecanismo: uma chamada de cada. */
  assert.equal((codigo.match(/lifecycle_confirm_writer_media_purge/g) || []).length, 1);
  assert.equal((codigo.match(/lifecycle_purge_editorial_history/g) || []).length, 1);
});

test("13 · a execução reconfere a elegibilidade entre o Storage e o DELETE", async () => {
  const servico = await fonte("../lib/server/writer-purge-service.ts");
  const codigo = servico.replace(/\/\*[\s\S]*?\*\//g, "");
  const execucao = codigo.slice(codigo.indexOf("export async function executeWriterPurge"));

  const iStorage = execucao.indexOf('.from("writer-media").remove');
  const iRevalida = execucao.indexOf("const revalidado = planMediaPurge");
  const iConfirm = execucao.indexOf("lifecycle_confirm_writer_media_purge");

  assert.ok(iStorage > 0 && iRevalida > iStorage, "a reconferência vem DEPOIS do Storage");
  assert.ok(iConfirm > iRevalida, "o DELETE só acontece depois de revalidar");
  /* Perder elegibilidade cancela o item, não o força. */
  assert.match(execucao, /if \(!revalidado\.eligible\) \{[\s\S]{0,140}result: "skipped"/);
  /* Falha de Storage preserva a linha. */
  assert.match(execucao, /if \(!canDeleteRowAfterStorage\(storage\)\) \{[\s\S]{0,160}continue;/);
});

test("14 · a rota é interna: token operacional, fechada por padrão, sem sessão de usuário", async () => {
  const rota = await fonte("../app/api/internal/writer-purge/route.ts");
  const codigo = rota.replace(/\/\*[\s\S]*?\*\//g, "");

  /* Sem token no ambiente, nada roda. */
  assert.match(codigo, /if \(!esperado\) \{[\s\S]{0,180}status: 503/);
  assert.match(codigo, /process\.env\.WRITER_PURGE_TOKEN/);
  /* Comparação em tempo constante. */
  assert.match(codigo, /timingSafeEqual/);
  /* Não autoriza por sessão de usuário: quem tem login não tem caminho até aqui. */
  assert.doesNotMatch(codigo, /requireCanonicalSessionProfile|assertEditorialPermission/);
  /* O corpo não aceita ids nem ator. */
  assert.doesNotMatch(codigo, /assetId|versionId|updated_by|updatedBy|actorId/);
  assert.match(codigo, /\.strict\(\)/);
  /* `dry_run` é o padrão declarado. */
  assert.match(codigo, /z\.enum\(\["dry_run", "execute"\]\)\.default\("dry_run"\)/);
});

test("15 · nenhum cliente React alcança a purga, e nenhum cron existe", async () => {
  const servico = await fonte("../lib/server/writer-purge-service.ts");
  assert.match(servico, /^import "server-only";/m);

  const fs = await import("node:fs/promises");
  const procurar = async (dir: string): Promise<string[]> => {
    const achados: string[] = [];
    for (const entrada of await fs.readdir(new URL(dir, import.meta.url), { withFileTypes: true })) {
      const caminho = `${dir}${entrada.name}`;
      if (entrada.isDirectory()) achados.push(...await procurar(`${caminho}/`));
      else if (/\.tsx?$/.test(entrada.name)) {
        const texto = await fonte(caminho);
        if (/writer-purge-service|executeWriterPurge|planWriterPurge/.test(texto)) achados.push(caminho);
      }
    }
    return achados;
  };
  const consumidores = [...await procurar("../components/"), ...await procurar("../modules/")];
  assert.deepEqual(consumidores, [], "nenhum componente pode importar o serviço de purga");

  /* Sem cron de plataforma. */
  const raiz = await fs.readdir(new URL("../", import.meta.url));
  assert.ok(!raiz.includes("vercel.json"), "nenhum vercel.json com cron foi criado");
});

test("16 · autosave não é versão, e por isso não entra no purge", async () => {
  const regras = await fonte("../lib/redator/version-purge-plan.ts");
  const codigo = regras.replace(/\/\*[\s\S]*?\*\//g, "");
  /* Nenhuma condição olha idade. */
  assert.doesNotMatch(codigo, /created_at|createdAt/);
  /* Puro: sem I/O. */
  assert.doesNotMatch(codigo, /server-only|getOperationalClient|\.rpc\(|fetch\(/);
  /* E o invariante está escrito onde o produto o guarda. */
  const invariantes = await fonte("../docs/00-produto/invariantes.md");
  assert.match(invariantes, /Autosaves intermediários não entram no lifecycle de retenção/i);
});

/**
 * ===== 17-25 · CORTE 5.1 · A CADEIA DE SUBSTITUIÇÕES =====
 *
 * O defeito que estes testes travam: exigir que o sucessor DIRETO fosse o
 * corrente retinha o predecessor para sempre em qualquer cadeia com mais de um
 * elo. Em `A → B → C(corrente)`, quando a janela de A vencesse, B já estaria
 * substituída — e A jamais sairia.
 *
 * O que autoriza apagar A é a cadeia dela DESEMBOCAR no corrente. Quantos elos
 * há no caminho não importa; que ela chegue lá, sim.
 */

/** Um elo intermediário: substituído, apontando para o próximo. */
const elo = (id: string, proximo: string, purgeAfter = "2026-09-21T00:00:00.000Z"): MediaPurgeRow =>
  midia({ assetId: id, replacedByAssetId: proximo, supersededAt: "2026-09-20T00:00:00.000Z", purgeAfter });

test("17 · A → B(corrente): A elegível depois das 48h", () => {
  const A = elo("A", "B");
  const B = sucessor({ assetId: "B" });
  const d = planMediaPurge({ candidate: A, rows: [A, B], now: AGORA });

  assert.equal(d.eligible, true);
  assert.equal(d.eligible && d.currentAssetId, "B");
  assert.equal(d.eligible && d.chainLength, 1);
});

test("18 · A → B → C(corrente): A elegível, mesmo com B já substituída", () => {
  /* É exatamente o caso que a versão anterior retinha para sempre. */
  const A = elo("A", "B");
  const B = elo("B", "C");
  const C = sucessor({ assetId: "C" });
  const d = planMediaPurge({ candidate: A, rows: [A, B, C], now: AGORA });

  assert.equal(d.eligible, true, "A não pode ficar retida só porque B deixou de ser corrente");
  assert.equal(d.eligible && d.currentAssetId, "C");
  assert.equal(d.eligible && d.chainLength, 2);
  /* O sucessor DIRETO continua declarado, para o rastro não se perder. */
  assert.equal(d.eligible && d.successorAssetId, "B");
});

test("19 · na mesma cadeia, B só sai quando a janela DE B vencer", () => {
  const A = elo("A", "B");
  const B = elo("B", "C", "2026-09-22T00:00:00.000Z");
  const C = sucessor({ assetId: "C" });

  const deA = planMediaPurge({ candidate: A, rows: [A, B, C], now: AGORA });
  assert.equal(deA.eligible, true, "A já venceu e a cadeia chega em C");

  const deB = planMediaPurge({ candidate: B, rows: [A, B, C], now: AGORA });
  assert.equal(deB.eligible === false && deB.refusal, "window_open",
    "purgar A não antecipa nada para B: cada elo tem a sua janela");
});

test("20 · A → B(inexistente): cadeia quebrada é recusada", () => {
  const A = elo("A", "B");
  const d = planMediaPurge({ candidate: A, rows: [A], now: AGORA });
  assert.equal(d.eligible === false && d.refusal, "successor_missing");

  /* E quebrada no MEIO também: A → B → C, sem C na tabela. */
  const B = elo("B", "C");
  const e = planMediaPurge({ candidate: A, rows: [A, B], now: AGORA });
  assert.equal(e.eligible === false && e.refusal, "successor_missing");
});

test("21 · elo em outro anchor, documento ou marca: recusado", () => {
  const A = elo("A", "B");
  /* O elo do MEIO é que cruza — a quebra não precisa ser no primeiro salto. */
  const B = elo("B", "C");
  for (const fora of [
    sucessor({ assetId: "C", anchorRef: "bloco-9" }),
    sucessor({ assetId: "C", anchorKind: "article_cover" }),
    sucessor({ assetId: "C", documentId: "doc-2" }),
    sucessor({ assetId: "C", brandId: "outra-marca" }),
  ]) {
    const d = planMediaPurge({ candidate: A, rows: [A, B, fora], now: AGORA });
    assert.equal(d.eligible === false && d.refusal, "successor_scope_mismatch", JSON.stringify(fora));
  }
});

test("22 · A → B → A: ciclo é recusado, e não trava", () => {
  const A = elo("A", "B");
  const B = elo("B", "A");
  const d = planMediaPurge({ candidate: A, rows: [A, B], now: AGORA });
  assert.equal(d.eligible === false && d.refusal, "chain_cycle");

  /* Auto-referência também. */
  const S = elo("S", "S");
  const e = planMediaPurge({ candidate: S, rows: [S], now: AGORA });
  assert.equal(e.eligible === false && e.refusal, "chain_cycle");

  /* E a resolução isolada devolve o mesmo, sem laço infinito. */
  assert.equal(resolveSuccessorChain({ from: A, rows: [A, B] }).ok, false);
});

test("23 · dois correntes no mesmo anchor: purga recusada", () => {
  /*
   * Estado que o índice único parcial da M3 deveria impedir. Se ele aparecer,
   * não se resolve apagando: ninguém sabe qual das duas é a boa.
   */
  const A = elo("A", "B");
  const B = sucessor({ assetId: "B" });
  const intruso = sucessor({ assetId: "X" });
  const d = planMediaPurge({ candidate: A, rows: [A, B, intruso], now: AGORA });
  assert.equal(d.eligible === false && d.refusal, "anchor_current_ambiguous");

  assert.equal(isCurrentMediaRow(B), true);
  assert.equal(isCurrentMediaRow(A), false);
});

test("24 · versões: v1 → v2 → v3(corrente) não retém v1 para sempre", () => {
  const v1 = versao({ versionId: "v1", supersededByVersionId: "v2", currentVersionId: "v3" });
  const v2 = versao({ versionId: "v2", supersededByVersionId: "v3", currentVersionId: "v3",
    supersededAt: "2026-09-20T00:00:00.000Z", purgeAfter: "2026-09-22T00:00:00.000Z" });
  const v3 = versaoCorrente("v3");
  const rows = [v1, v2, v3];

  const d1 = planVersionPurge(v1, rows, AGORA);
  assert.equal(d1.eligible, true, "v1 não fica retida só porque v2 já foi substituída");
  assert.equal(d1.eligible && d1.currentVersionId, "v3");
  assert.equal(d1.eligible && d1.chainLength, 2);

  const d2 = planVersionPurge(v2, rows, AGORA);
  assert.equal(d2.eligible === false && d2.refusal, "window_open", "v2 espera a janela dela");
});

test("25 · versões: cadeia quebrada, cíclica ou de outro dono falha fechada", () => {
  const v1 = versao({ versionId: "v1", supersededByVersionId: "v2", currentVersionId: "v3" });

  const ausente = planVersionPurge(v1, [v1], AGORA);
  assert.equal(ausente.eligible === false && ausente.refusal, "successor_missing");

  const c1 = versao({ versionId: "c1", supersededByVersionId: "c2", currentVersionId: "c3" });
  const c2 = versao({ versionId: "c2", supersededByVersionId: "c1", currentVersionId: "c3",
    supersededAt: "2026-09-20T00:00:00.000Z" });
  const ciclo = planVersionPurge(c1, [c1, c2], AGORA);
  assert.equal(ciclo.eligible === false && ciclo.refusal, "chain_cycle");

  const outroDono = versao({ versionId: "v2", ownerId: "doc-2", currentVersionId: "v3",
    supersededAt: null, supersededByVersionId: null });
  const cruzado = planVersionPurge(v1, [v1, outroDono], AGORA);
  assert.equal(cruzado.eligible === false && cruzado.refusal, "successor_scope_mismatch");

  /* Cadeia que morre sem chegar à corrente do dono. */
  const m1 = versao({ versionId: "m1", supersededByVersionId: "m2", currentVersionId: "m9" });
  const m2 = versaoCorrente("m2", "m9");
  const morta = planVersionPurge(m1, [m1, m2], AGORA);
  assert.equal(morta.eligible === false && morta.refusal, "chain_no_current");

  assert.equal(resolveVersionChain({ from: c1, rows: [c1, c2] }).ok, false);
});
