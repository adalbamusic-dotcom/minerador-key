import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { persistExpertBriefRadarContext } from "../lib/server/telegram/persistence.ts";
import { radarSpecialistReviewsOf } from "../lib/radar/specialist-contribution-review.ts";

/**
 * A DECISÃO HUMANA CHEGANDO AO BANCO — SPECIALIST_3 · §13.
 *
 * O que precisa ser verdade: clicar em "Aceitar como evidência" grava a
 * decisão e NÃO reescreve a pauta. Um clique de revisão que devolvesse título,
 * perguntas e status ao banco faria a tela sobrescrever, com o que tivesse em
 * mãos, uma pauta que outra pessoa pode ter acabado de editar.
 *
 * Nenhuma chamada real: o cliente do Supabase é um duplo que registra o
 * `update` recebido.
 */

const brandId = "70000000-0000-4000-8000-0000000000b1";
const briefId = "70000000-0000-4000-8000-0000000000b2";
const expertId = "70000000-0000-4000-8000-0000000000b3";
const articleId = "artigo-persistencia";
const articleDnaVersionId = "dna-persistencia";

/** O mínimo que `persistExpertBriefRadarContext` encadeia, e nada além. */
function clienteFalso(devolvido: Record<string, unknown> | null) {
  const updates: Array<Record<string, unknown>> = [];
  const filtros: Array<[string, unknown]> = [];

  const alvo: Record<string, unknown> = {
    update(valores: Record<string, unknown>) { updates.push(valores); return alvo; },
    eq(coluna: string, valor: unknown) { filtros.push([coluna, valor]); return alvo; },
    select() { return alvo; },
    async maybeSingle() { return { data: devolvido, error: null }; },
  };

  return { updates, filtros, client: { from: () => alvo } };
}

const contextoGravado = {
  specialistRequirement: { requirementId: "specialist:4a13e0cb" },
  consultation: { consultationId: "consultation|x", requirementId: "specialist:4a13e0cb" },
  contributionReviews: {
    "contrib-1": { decision: "ACCEPTED_EVIDENCE", classification: "RESSALVA", relatedRequirementId: null, decidedAt: "2026-09-13T09:00:00Z", decidedBy: "u" },
  },
};

const linha = {
  id: briefId, brand_id: brandId, expert_id: expertId,
  article_id: articleId, article_dna_version_id: articleDnaVersionId,
  title: "O que causa acne",
  radar_context: contextoGravado,
  questions: [{ id: "q1", text: "pergunta" }],
  status: "awaiting_review",
  created_at: "2026-09-13T08:00:00Z", updated_at: "2026-09-13T08:00:00Z",
  sent_at: "2026-09-13T08:09:08Z", completed_at: null,
};

test("§13 · gravar a decisão toca SOMENTE o radar_context", async () => {
  const duplo = clienteFalso(linha);
  await persistExpertBriefRadarContext({
    brandId, briefId, expertId, articleId, articleDnaVersionId,
    radarContext: contextoGravado,
  }, duplo.client as never);

  assert.equal(duplo.updates.length, 1);
  const update = duplo.updates[0];
  /*
   * A LISTA É EXATA de propósito.
   *
   * `updateExpertBrief` reescreve título, artigo, perguntas e status. Usá-la
   * para registrar uma decisão faria um clique de revisão reenviar a pauta
   * inteira. E `updated_at` fica de fora porque a PAUTA não mudou: mexer nela
   * faria a coluna de data dizer que o especialista foi consultado agora.
   */
  assert.deepEqual(Object.keys(update), ["radar_context"]);
  assert.equal(radarSpecialistReviewsOf(update.radar_context)["contrib-1"].decision, "ACCEPTED_EVIDENCE");
});

test("§13 · a gravação é presa ao contexto inteiro: marca, pauta, especialista, artigo e versão", async () => {
  const duplo = clienteFalso(linha);
  await persistExpertBriefRadarContext({
    brandId, briefId, expertId, articleId, articleDnaVersionId, radarContext: {},
  }, duplo.client as never);

  /*
   * Sem qualquer um destes filtros, uma decisão poderia cair na pauta de outro
   * artigo — ou de outra marca, que é pior.
   */
  assert.deepEqual(duplo.filtros, [
    ["brand_id", brandId],
    ["id", briefId],
    ["expert_id", expertId],
    ["article_id", articleId],
    ["article_dna_version_id", articleDnaVersionId],
  ]);
});

test("§13 · uma pauta fora do contexto devolve nulo em vez de inventar sucesso", async () => {
  const duplo = clienteFalso(null);
  const resultado = await persistExpertBriefRadarContext({
    brandId, briefId, expertId, articleId, articleDnaVersionId, radarContext: {},
  }, duplo.client as never);
  assert.equal(resultado, null);
});

/* ================= a rota, auditada no bloco que importa ================ */

/**
 * O READBACK DA DECISÃO, CONFERIDO NO TEXTO DA ROTA.
 *
 * Não dá para executar o handler sem o runtime do Next e sem sessão; o que dá
 * para travar é que a confirmação exista e compare a DECISÃO — e não apenas o
 * status HTTP. O recorte é do bloco específico porque uma varredura do arquivo
 * inteiro casaria com qualquer outra ocorrência da mesma palavra.
 */
async function blocoDoReadback(): Promise<string> {
  const fonte = await readFile(new URL("../app/api/editorial/expert-contributions/review/route.ts", import.meta.url), "utf8");
  const inicio = fonte.indexOf("const readback = await getExpertBrief");
  const fim = fonte.indexOf("return NextResponse.json", inicio);
  assert.ok(inicio > 0 && fim > inicio, "o bloco de readback precisa existir na rota");
  return fonte.slice(inicio, fim);
}

test("§13 · a rota confirma a DECISÃO no readback, não só a resposta do banco", async () => {
  const bloco = await blocoDoReadback();
  assert.match(bloco, /radarSpecialistReviewsOf\(readback\.radarContext\)\[input\.contributionId\]/);
  assert.match(bloco, /confirmada\.decision !== input\.decision/);
  assert.match(bloco, /readback remoto não a confirmou/);
});

test("§13 · a rota exige que a contribuição pertença à pauta informada", async () => {
  const fonte = await readFile(new URL("../app/api/editorial/expert-contributions/review/route.ts", import.meta.url), "utf8");
  const inicio = fonte.indexOf("const contribuicao = await getExpertContribution");
  const fim = fonte.indexOf("const radarContext", inicio);
  assert.ok(inicio > 0 && fim > inicio);
  const bloco = fonte.slice(inicio, fim);
  /* Os três escopos juntos: marca, especialista da pauta e a própria pauta. */
  assert.match(bloco, /briefId: brief\.id/);
  assert.match(bloco, /expertId: brief\.expertId/);
  assert.match(bloco, /Contribuição não encontrada nesta pauta/);
});

test("§13 · salvar a pauta preserva as decisões gravadas no servidor", async () => {
  const fonte = await readFile(new URL("../app/api/editorial/expert-briefs/route.ts", import.meta.url), "utf8");
  const inicio = fonte.indexOf("const radarContext = radarContextPreservingReviews");
  assert.ok(inicio > 0, "o PATCH da pauta precisa preservar as decisões gravadas");
  const bloco = fonte.slice(inicio, fonte.indexOf("\n", fonte.indexOf("updateExpertBrief", inicio)));
  assert.match(bloco, /stored: current\.radarContext/, "o que vence é o que está gravado, não o que o cliente mandou");
  assert.match(bloco, /updateExpertBrief\(\{ \.\.\.input, radarContext,/, "o contexto preservado precisa chegar ao update");
});
