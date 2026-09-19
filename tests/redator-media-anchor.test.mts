/**
 * ===== PRÉ-M3 · A ÂNCORA DA MÍDIA E A SUBSTITUIÇÃO ATÔMICA =====
 *
 * COMPORTAMENTAL (01-12) — exercita as regras de verdade, sem banco e sem Storage.
 * ESTRUTURAL (13-18) — lê código e DDL como texto e prova que a fiação é essa.
 *
 * O defeito que estes testes travam: trocar a imagem de um bloco, cena ou slide
 * não tinha caminho. O 409 mandava "criar outro briefing", e o briefing novo
 * nascia sem vínculo com a POSIÇÃO do antigo — sobrava um ativo órfão e uma
 * posição com a imagem velha.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  BREATH_BLOCKED, MEDIA_ANCHOR_KINDS, RECOVERY_WINDOW_HOURS, coverAnchor, isMediaAnchorKind,
  mediaFileConfirmed, newMediaBriefAnchorState, planMediaReplacement, predecessorRetention, sameAnchor,
  type MediaAssetState,
} from "../lib/redator/media-anchor.ts";
import { WriterMediaBriefSchema } from "../lib/redator/multiformat-contracts.ts";

const fonte = (caminho: string) => readFile(new URL(caminho, import.meta.url), "utf8");
const MARCA = "marca-1";

const ativo = (overrides: Partial<MediaAssetState> = {}): MediaAssetState => ({
  assetId: "asset-novo",
  brandId: MARCA,
  documentId: "doc-1",
  deliverableId: null,
  status: "uploaded",
  storagePath: "marca-1/abc/asset-novo.png",
  fileHash: "hash-novo",
  anchor: null,
  supersededAt: null,
  ...overrides,
});

const atual = (overrides: Partial<MediaAssetState> = {}): MediaAssetState => ativo({
  assetId: "asset-atual",
  storagePath: "marca-1/abc/asset-atual.png",
  fileHash: "hash-atual",
  anchor: { kind: "article_block", ref: "bloco-7" },
  ...overrides,
});

/* ======================= COMPORTAMENTAL ======================= */

test("01 · o sucessor nasce SEM âncora", () => {
  /*
   * A âncora no briefing poria duas linhas disputando a mesma posição enquanto
   * a segunda ainda é um prompt sem arquivo — e a janela de retenção poderia
   * abrir sobre a única imagem boa que existe.
   */
  assert.deepEqual(newMediaBriefAnchorState(), { anchorKind: null, anchorRef: null });

  const brief = WriterMediaBriefSchema.parse({
    brandId: "11111111-1111-4111-8111-111111111111", documentId: "doc-1", deliverableId: null,
    role: "article_block", objective: "ilustrar o bloco", prompt: "uma foto", altText: "", aspectRatio: "16:9",
  });
  assert.ok(!("anchorKind" in brief), "o contrato do briefing não carrega âncora");
  assert.ok(!("anchorRef" in brief), "o contrato do briefing não carrega referência");
});

test("02 · upload sem readback confirmado não permite substituição", () => {
  /* `prompt_ready` é briefing sem arquivo: prompt não substitui imagem. */
  const semArquivo = planMediaReplacement({
    predecessor: atual(), successor: ativo({ status: "prompt_ready", storagePath: null, fileHash: null }), brandId: MARCA,
  });
  assert.deepEqual(semArquivo, { allowed: false, refusal: "successor_file_unconfirmed" });

  /* Caminho gravado mas sem hash é meia-verdade: o hash é o que o readback conferiu. */
  const semHash = planMediaReplacement({
    predecessor: atual(), successor: ativo({ fileHash: null }), brandId: MARCA,
  });
  assert.deepEqual(semHash, { allowed: false, refusal: "successor_file_unconfirmed" });

  assert.equal(mediaFileConfirmed({ status: "uploaded", storagePath: "p", fileHash: null }), false);
  assert.equal(mediaFileConfirmed({ status: "prompt_ready", storagePath: null, fileHash: null }), false);
  assert.equal(mediaFileConfirmed({ status: "uploaded", storagePath: "p", fileHash: "h" }), true);
  assert.equal(mediaFileConfirmed({ status: "reviewed", storagePath: "p", fileHash: "h" }), true);
});

test("03 · com arquivo confirmado, a substituição é permitida e herda a âncora", () => {
  const plano = planMediaReplacement({ predecessor: atual(), successor: ativo(), brandId: MARCA });
  assert.equal(plano.allowed, true);
  assert.deepEqual(plano.allowed && plano.anchor, { kind: "article_block", ref: "bloco-7" });
});

test("04 · o predecessor continua atual quando a operação é recusada", () => {
  const predecessor = atual();
  const recusas = [
    planMediaReplacement({ predecessor, successor: ativo({ fileHash: null }), brandId: MARCA }),
    planMediaReplacement({ predecessor, successor: ativo({ brandId: "outra" }), brandId: MARCA }),
    planMediaReplacement({ predecessor, successor: ativo({ documentId: "doc-2" }), brandId: MARCA }),
  ];
  for (const recusa of recusas) assert.equal(recusa.allowed, false);
  /*
   * A prova é que o objeto do predecessor não foi tocado: o planejamento é puro
   * e não muda estado. Quem perde a posição só perde depois da troca confirmada.
   */
  assert.equal(predecessor.anchor?.ref, "bloco-7");
  assert.equal(predecessor.supersededAt, null);
});

test("05 · a âncora do sucessor, se vier, precisa ser a MESMA", () => {
  /* Aceitar outra transformaria "substituir" em "mover", que é outra operação. */
  const divergente = planMediaReplacement({
    predecessor: atual(), successor: ativo({ anchor: { kind: "article_block", ref: "bloco-9" } }), brandId: MARCA,
  });
  assert.deepEqual(divergente, { allowed: false, refusal: "anchor_divergent" });

  const mesma = planMediaReplacement({
    predecessor: atual(), successor: ativo({ anchor: { kind: "article_block", ref: "bloco-7" } }), brandId: MARCA,
  });
  assert.equal(mesma.allowed, true);

  assert.equal(sameAnchor({ kind: "article_block", ref: "a" }, { kind: "article_block", ref: "a" }), true);
  assert.equal(sameAnchor({ kind: "article_block", ref: "a" }, { kind: "script_scene", ref: "a" }), false);
  assert.equal(sameAnchor(null, { kind: "article_block", ref: "a" }), false);
});

test("06 · repetir a substituição não abre uma segunda janela", () => {
  /*
   * Depois da primeira troca o predecessor está superseded e sem âncora.
   * Repetir o mesmo pedido é recusado — que é a forma idempotente aqui: não
   * reivindica a posição de novo e não recalcula `purge_after`, o que esticaria
   * a janela a cada clique repetido.
   */
  const jaTrocado = atual({ anchor: null, supersededAt: "2026-09-18T10:00:00.000Z" });
  const repeticao = planMediaReplacement({ predecessor: jaTrocado, successor: ativo(), brandId: MARCA });
  assert.deepEqual(repeticao, { allowed: false, refusal: "predecessor_without_anchor" });

  /* E um predecessor que ainda tem âncora mas já foi substituído também não passa. */
  const inconsistente = atual({ supersededAt: "2026-09-18T10:00:00.000Z" });
  assert.deepEqual(planMediaReplacement({ predecessor: inconsistente, successor: ativo(), brandId: MARCA }),
    { allowed: false, refusal: "predecessor_not_current" });
});

test("07 · a janela de 48h é calculada só a partir da troca confirmada", () => {
  const retencao = predecessorRetention({ supersededAt: "2026-09-18T10:00:00.000Z", successorAssetId: "asset-novo" });
  assert.equal(retencao.supersededAt, "2026-09-18T10:00:00.000Z");
  assert.equal(retencao.replacedByAssetId, "asset-novo");
  assert.equal(new Date(retencao.purgeAfter).getTime() - new Date(retencao.supersededAt).getTime(),
    RECOVERY_WINDOW_HOURS * 60 * 60 * 1000);
  assert.equal(RECOVERY_WINDOW_HOURS, 48);
});

test("08 · um ativo corrente nunca é candidato a purge", async () => {
  /*
   * Corrente = sem `superseded_at`. `predecessorRetention` só recebe um
   * `supersededAt`, então não existe caminho que produza `purge_after` para
   * quem não foi substituído. A garantia no banco é o CHECK da M3.
   */
  const corrente = atual();
  assert.equal(corrente.supersededAt, null);

  const m3 = await fonte("../supabase/migrations/20260918190200_m3_writer_media_anchor_lifecycle.sql");
  assert.match(m3, /writer_media_assets_retention_check/);
  assert.match(m3, /writer_media_assets_purge_idx/);
  /* O índice único de posição ignora quem já foi substituído. */
  assert.match(m3, /WHERE anchor_kind IS NOT NULL[\s\S]{0,80}superseded_at IS NULL/);
});

test("09 · isolamento por marca em todas as direções", () => {
  assert.deepEqual(planMediaReplacement({ predecessor: atual({ brandId: "outra" }), successor: ativo(), brandId: MARCA }),
    { allowed: false, refusal: "brand_mismatch" });
  assert.deepEqual(planMediaReplacement({ predecessor: atual(), successor: ativo({ brandId: "outra" }), brandId: MARCA }),
    { allowed: false, refusal: "brand_mismatch" });
  /* Os dois na mesma marca errada também não passa: a marca do chamador é a que vale. */
  assert.deepEqual(planMediaReplacement({ predecessor: atual({ brandId: "outra" }), successor: ativo({ brandId: "outra" }), brandId: MARCA }),
    { allowed: false, refusal: "brand_mismatch" });
});

test("10 · artigo, roteiro e carrossel — e o mesmo entregável dos dois lados", () => {
  const casos = [
    { kind: "article_cover" as const, ref: "doc-1", deliverableId: null },
    { kind: "article_block" as const, ref: "bloco-7", deliverableId: null },
    { kind: "script_scene" as const, ref: "cena-3", deliverableId: "entregavel-1" },
    { kind: "carousel_slide" as const, ref: "slide-2", deliverableId: "entregavel-2" },
  ];
  for (const caso of casos) {
    const plano = planMediaReplacement({
      predecessor: atual({ anchor: { kind: caso.kind, ref: caso.ref }, deliverableId: caso.deliverableId }),
      successor: ativo({ deliverableId: caso.deliverableId }), brandId: MARCA,
    });
    assert.equal(plano.allowed, true, `${caso.kind} deveria permitir substituição`);
    assert.deepEqual(plano.allowed && plano.anchor, { kind: caso.kind, ref: caso.ref });
  }

  /* Cruzar entregáveis é recusado: um slide não substitui a cena de outro roteiro. */
  assert.deepEqual(planMediaReplacement({
    predecessor: atual({ deliverableId: "entregavel-1" }), successor: ativo({ deliverableId: "entregavel-2" }), brandId: MARCA,
  }), { allowed: false, refusal: "deliverable_mismatch" });

  assert.deepEqual(coverAnchor("doc-9"), { kind: "article_cover", ref: "doc-9" });
});

test("11 · o vocabulário de âncora é fechado, e o respiro está fora", () => {
  assert.deepEqual([...MEDIA_ANCHOR_KINDS], ["article_cover", "article_block", "script_scene", "carousel_slide"]);
  assert.equal(isMediaAnchorKind("article_break"), false, "respiro não é âncora — ver BREATH_BLOCKED");
  assert.equal(isMediaAnchorKind("scene"), false, "vocabulário antigo, sem prefixo, não vale");
  assert.equal(isMediaAnchorKind("article_block"), true);
  assert.equal(BREATH_BLOCKED.role, "breath");
  assert.match(BREATH_BLOCKED.motivo, /identidade est/i);
});

test("12 · substituir um ativo por ele mesmo é recusado antes de tudo", () => {
  const mesmo = atual();
  assert.deepEqual(planMediaReplacement({ predecessor: mesmo, successor: mesmo, brandId: MARCA }),
    { allowed: false, refusal: "same_asset" });
});

/* ======================= ESTRUTURAL ======================= */

test("13 · a ordem obrigatória está no código, e a âncora é o último passo", async () => {
  const io = await fonte("../lib/server/writer-media-lifecycle.ts");
  const codigo = io.replace(/\/\*[\s\S]*?\*\//g, "");

  /* A troca é da RPC, numa transação só — não dois UPDATEs daqui. */
  assert.match(codigo, /rpc\("writer_replace_media_asset"/);
  assert.equal((codigo.match(/writer_replace_media_asset/g) || []).length, 1);

  /* E o readback é o que autoriza a janela. */
  /*
   * `predecessor_manteve_ancora` saiu: o predecessor MANTÉM a âncora de
   * propósito — é o registro de onde ele vivia, e o que torna a recuperação
   * dentro das 48h possível. Quem o tira do posto é `superseded_at`, que o
   * remove do índice único parcial. Exigir a âncora apagada reprovaria toda
   * substituição bem sucedida como `readback_failed`.
   */
  for (const prova of ["sucessor_sem_ancora", "predecessor_sem_superseded_at",
                       "sucessor_em_outra_ancora", "predecessor_sem_sucessor_declarado"]) {
    assert.ok(codigo.includes(prova), `readback precisa conferir: ${prova}`);
  }
  /* Nada aqui apaga. */
  assert.doesNotMatch(codigo, /\.delete\(\)|DROP |DELETE FROM/i);
});

test("14 · a substituição valida os sete pontos antes de qualquer I/O", async () => {
  const regras = await fonte("../lib/redator/media-anchor.ts");
  for (const recusa of ["brand_mismatch", "document_mismatch", "deliverable_mismatch",
                        "predecessor_without_anchor", "predecessor_not_current", "anchor_divergent",
                        "successor_file_unconfirmed", "successor_already_superseded"]) {
    assert.ok(regras.includes(recusa), `falta a recusa nomeada: ${recusa}`);
  }
  /*
   * Regras puras: sem I/O, para poder ser exercitada sem banco. Os comentários
   * do módulo citam `server-only` para explicar a ausência dele, então a
   * comparação ignora comentário — senão o teste casaria com a própria
   * explicação, e não com o código.
   */
  const semComentario = regras.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(semComentario, /server-only|getOperationalClient|fetch\(/);
});

test("15 · o briefing não atribui âncora em lugar nenhum do servidor", async () => {
  const deliverables = await fonte("../lib/server/writer-deliverables.ts");
  const registro = deliverables.slice(
    deliverables.indexOf("export async function registerWriterMediaBrief"),
    deliverables.indexOf("function verifiedImageMime"));
  assert.doesNotMatch(registro, /anchor_kind|anchor_ref/);

  /* E o upload também não: ele confirma arquivo, não ocupa posição. */
  const upload = deliverables.slice(deliverables.indexOf("export async function uploadWriterMediaAsset"));
  assert.doesNotMatch(upload, /anchor_kind:|anchor_ref:/);
  /* O que o upload já fazia continua: magic bytes, hash e readback do Storage. */
  assert.match(upload, /verifiedImageMime/);
  assert.match(upload, /storage\.download\(path\)/);
  assert.match(upload, /storage_hash_mismatch/);
});

test("16 · a autoridade da associação fica no Redator, fora dos contratos do Arquiteto", async () => {
  const arquiteto = await fonte("../lib/arquiteto/contracts.ts");
  /*
   * O DNA não pode passar a depender de um ativo que nasce e morre no ciclo de
   * produção editorial. Nenhum `assetId` e nenhuma âncora entram aqui.
   */
  assert.doesNotMatch(arquiteto, /anchor_kind|anchorKind|anchor_ref|anchorRef/);
  assert.doesNotMatch(arquiteto, /writer_media_assets/);

  const m3 = await fonte("../supabase/migrations/20260918190200_m3_writer_media_anchor_lifecycle.sql");
  for (const intocavel of ["editorial_artifact_versions", "article_dna", "silo_dna"]) {
    assert.doesNotMatch(m3, new RegExp(`ALTER TABLE[^;]*${intocavel}`, "i"), `M3 não pode alterar ${intocavel}`);
  }
});

test("17 · a M3 declara o vocabulário desta rodada e uma posição por documento", async () => {
  const m3 = await fonte("../supabase/migrations/20260918190200_m3_writer_media_anchor_lifecycle.sql");
  assert.match(m3, /'article_cover', 'article_block', 'script_scene', 'carousel_slide'/);
  assert.doesNotMatch(m3, /IN \('article_block', 'scene', 'slide'\)/, "vocabulário antigo não pode sobrar");
  /* Exatamente um ativo corrente por posição. */
  assert.match(m3, /CREATE UNIQUE INDEX writer_media_assets_current_anchor_uidx/);
  assert.match(m3, /\(marca_id, document_id, anchor_kind, anchor_ref\)/);
  /* `article_block` precisa de papel, senão o briefing é impossível. */
  assert.match(m3, /'cover', 'breath', 'storyboard', 'slide', 'article_block'/);
});

test("18 · a UI trabalha a imagem na posição, sem seção global e sem barra nova", async () => {
  const painel = await fonte("../modules/redator/writer-media-anchor-panel.tsx");
  const writer = await fonte("../components/editorial/professional-writer.tsx");
  const codigoPainel = painel.replace(/\/\*[\s\S]*?\*\//g, "");

  assert.match(codigoPainel, /data-writer-media-anchor-panel/);
  /*
   * CORTE 4 · o seletor de posição passou a viver DENTRO do painel, para que o
   * mesmo componente sirva artigo, roteiro e carrossel sem cada tela
   * reimplementá-lo. Por isso a guarda mudou de `!target` para
   * `targets.length === 0`, e `data-redator-media-target` mudou de arquivo.
   * Descrição de superfície que o corte moveu, não defeito.
   */
  assert.match(codigoPainel, /if \(!brandId \|\| !documentId \|\| targets\.length === 0\) return null;/);
  assert.match(codigoPainel, /data-redator-media-target/);
  assert.doesNotMatch(codigoPainel, /Prompts e imagens/);
  /* Nenhuma barra horizontal nova, nem no painel nem no Redator. */
  assert.doesNotMatch(codigoPainel, /<header|<footer/);

  /* Montado no painel LATERAL direito, junto do Guardião. */
  assert.match(writer, /<WriterMediaAnchorPanel /);
  assert.equal((writer.match(/<WriterMediaAnchorPanel /g) || []).length, 1);
});

/**
 * ===== 19-22 · O CONTRATO ENTRE O CÓDIGO E A MIGRATION =====
 *
 * O gate final encontrou uma divergência que nenhum teste anterior pegava: a
 * RPC declarava três parâmetros e o código chamava com quatro. PostgREST
 * recusaria com PGRST202 — e só na primeira substituição real, em produção.
 * Estes testes comparam os dois lados como texto.
 */

test("19 · a chamada da RPC casa com a assinatura declarada na M3", async () => {
  const m3 = await fonte("../supabase/migrations/20260918190200_m3_writer_media_anchor_lifecycle.sql");
  const io = await fonte("../lib/server/writer-media-lifecycle.ts");

  const assinatura = m3.slice(m3.indexOf("CREATE FUNCTION public.writer_replace_media_asset"));
  const declarados: string[] = assinatura.slice(0, assinatura.indexOf(") RETURNS")).match(/p_[a-z_]+/g) ?? [];
  const chamados: string[] = io.slice(io.indexOf('rpc("writer_replace_media_asset"'), io.indexOf("if (error) return { status: \"failed\""))
    .match(/p_[a-z_]+/g) ?? [];

  assert.deepEqual([...declarados].sort(), [...chamados].sort(),
    "os parâmetros declarados e os chamados precisam ser exatamente os mesmos");
  assert.ok(declarados.includes("p_actor_id"), "a substituição precisa registrar quem a fez");

  /* E o GRANT precisa acompanhar a aridade, senão a função fica sem permissão. */
  const aridade = declarados.length;
  const tipos = Array(aridade).fill("uuid").join(",");
  /* Comparação literal em vez de regex: parêntese e ponto exigiriam escape. */
  assert.ok(m3.includes(`GRANT EXECUTE ON FUNCTION public.writer_replace_media_asset(${tipos}) TO service_role`),
    `o GRANT precisa declarar a mesma aridade (${tipos})`);
  assert.ok(m3.includes(`REVOKE ALL ON FUNCTION public.writer_replace_media_asset(${tipos})`),
    "o REVOKE precisa acompanhar a mesma aridade");
});

test("20 · o vocabulário de âncora é o mesmo nos cinco lugares", async () => {
  const m3 = await fonte("../supabase/migrations/20260918190200_m3_writer_media_anchor_lifecycle.sql");
  const regras = await fonte("../lib/redator/media-anchor.ts");
  const rota = await fonte("../app/api/redator/media-anchor/route.ts");
  const io = await fonte("../lib/server/writer-media-lifecycle.ts");
  const painel = await fonte("../modules/redator/writer-media-anchor-panel.tsx");

  /* `\s*` porque o CHECK quebra linha entre `IN` e o parêntese. */
  const noCheck = (m3.match(/anchor_kind IN\s*\(([^)]+)\)/) || [])[1] || "";
  assert.ok(noCheck, "o CHECK de anchor_kind precisa ser localizável na M3");
  const doCheck = (noCheck.match(/'([a-z_]+)'/g) || []).map(v => v.replace(/'/g, "")).sort();
  assert.deepEqual(doCheck, [...MEDIA_ANCHOR_KINDS].sort(),
    "o CHECK da M3 e MEDIA_ANCHOR_KINDS precisam declarar o mesmo conjunto");

  /* A rota não redeclara o conjunto: ela reusa a constante. */
  assert.match(rota, /z\.enum\(MEDIA_ANCHOR_KINDS\)/);
  /* O I/O reexporta a mesma constante, sem cópia. */
  assert.match(io, /MEDIA_ANCHOR_KINDS/);
  /* O painel rotula os quatro, e só os quatro. */
  for (const kind of MEDIA_ANCHOR_KINDS) assert.ok(painel.includes(kind), `o painel precisa rotular ${kind}`);
  assert.ok(!regras.replace(/\/\*[\s\S]*?\*\//g, "").includes("article_break"),
    "article_break não pode entrar no vocabulário");
  /*
   * A pergunta é se `article_break` é VALOR ACEITO, não se a palavra aparece:
   * o `COMMENT ON COLUMN` cita o termo justamente para documentar a exclusão.
   */
  assert.ok(!(doCheck as string[]).includes("article_break"), "article_break não pode ser valor aceito no CHECK");
  assert.match(m3, /article_break\) nao entra/, "e a exclusão precisa estar documentada na coluna");
});

test("21 · article_block tem papel; article_break não é suportado", async () => {
  const m3 = await fonte("../supabase/migrations/20260918190200_m3_writer_media_anchor_lifecycle.sql");

  /* O papel existe no banco e no contrato — sem ele o briefing seria impossível. */
  const roleCheck = (m3.match(/role IN \(([^)]+)\)/) || [])[1] || "";
  const papeis = (roleCheck.match(/'([a-z_]+)'/g) || []).map(v => v.replace(/'/g, ""));
  assert.ok(papeis.includes("article_block"), "o CHECK de role precisa aceitar article_block");
  for (const antigo of ["cover", "breath", "storyboard", "slide"]) {
    assert.ok(papeis.includes(antigo), `o papel ${antigo} não pode ser removido`);
  }

  const zod = WriterMediaBriefSchema.shape.role.options as readonly string[];
  assert.deepEqual([...zod].sort(), [...papeis].sort(), "Zod e CHECK precisam aceitar os mesmos papéis");

  /* `breath` continua sendo papel válido — o que ele não tem é âncora. */
  assert.ok(papeis.includes("breath"));
  assert.equal(isMediaAnchorKind("article_break"), false);
  assert.equal(BREATH_BLOCKED.role, "breath");
});

test("22 · a M3 final mantém as invariantes do lifecycle", async () => {
  const m3 = await fonte("../supabase/migrations/20260918190200_m3_writer_media_anchor_lifecycle.sql");
  const efetivo = m3.replace(/^\s*--.*$/gm, "");

  /* Janela de 48h fixa no CHECK, e não calculada por quem grava. */
  assert.match(efetivo, /purge_after = superseded_at \+ interval '48 hours'/);
  /* Corrente nunca é candidato: sem superseded_at, purge_after é obrigatoriamente nulo. */
  assert.match(efetivo, /superseded_at IS NULL AND purge_after IS NULL AND replaced_by_asset_id IS NULL/);
  /* Um atual por âncora, por MARCA. */
  assert.match(efetivo, /\(marca_id, document_id, anchor_kind, anchor_ref\)/);
  /* O sucessor em janela não pode assumir posição. */
  assert.match(efetivo, /media_successor_already_superseded/);
  /*
   * ===== A ORDEM DAS ESCRITAS É EXIGÊNCIA DO ÍNDICE =====
   *
   * A versão anterior deste teste exigia o contrário — âncora do sucessor antes
   * da janela do predecessor — e era ela que estava errada. Com o índice único
   * parcial cobrindo `superseded_at IS NULL`, ancorar o sucessor primeiro
   * deixaria DUAS linhas com a mesma chave e sem `superseded_at`: 23505, e a
   * substituição falharia sempre.
   *
   * Tudo é uma transação, então a ordem entre comandos não é observável. O que
   * importa é que nenhuma escrita aconteça antes de todas as validações, e que
   * a falha no fim desfaça o começo.
   */
  const rpc = efetivo.slice(efetivo.indexOf("CREATE FUNCTION public.writer_replace_media_asset"));
  const janela = rpc.indexOf("superseded_at = v_now");
  const ancoragem = rpc.indexOf("SET anchor_kind = v_old.anchor_kind");
  assert.ok(janela > 0 && ancoragem > 0, "os dois UPDATEs precisam existir");
  assert.ok(janela < ancoragem,
    "o predecessor precisa sair do índice ANTES de o sucessor entrar, senão 23505");

  /* Toda validação acontece antes da primeira escrita. */
  const primeiraEscrita = Math.min(janela, ancoragem);
  for (const validacao of ["media_self_replace", "media_old_not_found", "media_new_not_found",
                           "media_document_mismatch", "media_successor_not_confirmed",
                           "media_successor_already_superseded", "media_old_without_anchor",
                           "media_anchor_divergent"]) {
    assert.ok(rpc.indexOf(validacao) < primeiraEscrita, `${validacao} precisa barrar antes de qualquer UPDATE`);
  }
  /* E a conferência final aborta, desfazendo a janela por ROLLBACK. */
  assert.ok(rpc.indexOf("media_successor_not_anchored") > ancoragem,
    "a conferência da âncora vem depois da ancoragem, e aborta a transação inteira");
  /* Só uma tabela é tocada, e nenhum cron ou trigger nasce aqui. */
  assert.equal((efetivo.match(/ALTER TABLE public\.(?!writer_media_assets)/g) || []).length, 0);
  assert.doesNotMatch(efetivo, /pg_cron|cron\.schedule|CREATE TRIGGER/i);
});
