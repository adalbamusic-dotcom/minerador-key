import assert from "node:assert/strict";
import test from "node:test";
import { buildRadarExpertEvidence, projectRadarExpertEvidence } from "../lib/radar/expert-evidence.ts";

const base = {
  brandId: "10000000-0000-4000-8000-0000000000a1",
  articleId: "article-a",
  articleDnaVersionId: "article-dna-v1",
  brief: { id: "20000000-0000-4000-8000-0000000000a1", brandId: "10000000-0000-4000-8000-0000000000a1", expertId: "30000000-0000-4000-8000-0000000000a1", articleId: "article-a", articleDnaVersionId: "article-dna-v1" },
  contribution: {
    id: "40000000-0000-4000-8000-0000000000a1",
    brandId: "10000000-0000-4000-8000-0000000000a1",
    expertId: "30000000-0000-4000-8000-0000000000a1",
    briefId: "20000000-0000-4000-8000-0000000000a1",
    sourceType: "VOICE" as const,
    originalText: null,
    transcriptText: "Texto bruto preservado.",
    organizationPayload: { organizedText: "Organização fiel para revisão." },
    externalUpdateId: "telegram-update-1",
    originalAssetUri: "gs://bucket/radar/asset.ogg",
    checksum: "checksum-1",
    receivedAt: "2026-08-26T12:00:00.000Z",
  },
};

test("projeção aceita somente conteúdo revisado e preserva a camada de organização", () => {
  const evidence = buildRadarExpertEvidence({ ...base, review: { decision: "accepted" } });
  assert.equal(evidence.id, "expert-evidence:40000000-0000-4000-8000-0000000000a1");
  assert.equal(evidence.evidenceType, "EDITORIAL_ORGANIZATION");
  assert.equal(evidence.approvedContent, "Organização fiel para revisão.");
  assert.equal(evidence.originalAssetUri, "gs://bucket/radar/asset.ogg");
  assert.equal(evidence.humanDecision, "accepted");
  assert.equal(evidence.fidelityStatus, "faithful");
});

test("pergunta pendente não vira ExpertEvidence e áudio sem texto permanece bloqueado", () => {
  const pending = projectRadarExpertEvidence({ ...base, review: { decision: "pending" } });
  assert.equal(pending.evidence, null);
  assert.equal(pending.reason, "pending_review");

  const unreadable = projectRadarExpertEvidence({
    ...base,
    contribution: { ...base.contribution, transcriptText: null, organizationPayload: null },
    review: { decision: "accepted" },
  });
  assert.equal(unreadable.evidence, null);
  assert.equal(unreadable.reason, "content_not_readable");
});

test("rejeição mantém proveniência sem contaminar o conteúdo aprovado do relatório", () => {
  const evidence = buildRadarExpertEvidence({
    ...base,
    contribution: { ...base.contribution, organizationPayload: null, transcriptText: null, originalText: "Fala original textual." },
    review: { decision: "rejected" },
  });
  assert.equal(evidence.evidenceType, "ORIGINAL");
  assert.equal(evidence.approvedContent, "Fala original textual.");
  assert.equal(evidence.humanDecision, "rejected");
  assert.equal(evidence.fidelityStatus, "conflict");
});

test("projeção falha fechada em marca, artigo, versão ou brief divergente", () => {
  assert.throws(() => buildRadarExpertEvidence({ ...base, brandId: "90000000-0000-4000-8000-0000000000a1", review: { decision: "accepted" } }), /RADAR_EXPERT_EVIDENCE_BRAND_MISMATCH/);
  assert.throws(() => buildRadarExpertEvidence({ ...base, articleId: "article-b", review: { decision: "accepted" } }), /RADAR_EXPERT_EVIDENCE_ARTICLE_MISMATCH/);
  assert.throws(() => buildRadarExpertEvidence({ ...base, contribution: { ...base.contribution, briefId: "50000000-0000-4000-8000-0000000000a1" }, review: { decision: "accepted" } }), /RADAR_EXPERT_EVIDENCE_CONTEXT_MISMATCH/);
});


/* ============ o instante que o banco devolve, não o que a fixture inventa ============ */

/**
 * O DEFEITO DE RUNTIME DO SPECIALIST_3 — e por que nenhum teste o pegou.
 *
 * `RadarExpertEvidenceSchema.contributedAt` é `z.string().datetime()`, que
 * exige o sufixo `Z`. O PostgREST devolve `timestamptz` COM DESLOCAMENTO:
 *
 *   2026-09-13T11:11:57.420036+00:00      ← lido do banco real desta marca
 *
 * A fixture acima usa `"2026-08-26T12:00:00.000Z"`. Ela nunca descreveu o que
 * o provider entrega, e por isso a suíte inteira passava enquanto o primeiro
 * "Aceitar como evidência" sobre um dado de verdade derrubava a página com um
 * ZodError — dentro de um efeito de render, levando o Radar junto.
 *
 * O caminho só era alcançável com DECISÃO HUMANA: a projeção devolve
 * `pending_review` antes do `parse`. Enquanto a decisão morava no
 * `localStorage` e ninguém tinha decidido, o defeito ficou escondido.
 */
const COM_DESLOCAMENTO = "2026-09-13T11:11:57.420036+00:00";

test("o instante com deslocamento do PostgREST vira evidência, normalizado para UTC canônico", () => {
  const evidence = buildRadarExpertEvidence({
    ...base,
    contribution: { ...base.contribution, receivedAt: COM_DESLOCAMENTO },
    review: { decision: "accepted" },
  });

  /* O MESMO instante, na forma que o contrato exige — e sem perder precisão. */
  assert.equal(evidence.contributedAt, "2026-09-13T11:11:57.420Z");
  assert.equal(Date.parse(evidence.contributedAt), Date.parse(COM_DESLOCAMENTO));
});

test("deslocamento diferente de zero é convertido, não truncado", () => {
  /*
   * A marca é brasileira e o banco está em UTC hoje. Amanhã um provider pode
   * devolver `-03:00`: cortar o sufixo em vez de converter gravaria o instante
   * errado em três horas, silenciosamente.
   */
  const evidence = buildRadarExpertEvidence({
    ...base,
    contribution: { ...base.contribution, receivedAt: "2026-09-13T08:11:57-03:00" },
    review: { decision: "accepted" },
  });
  assert.equal(evidence.contributedAt, "2026-09-13T11:11:57.000Z");
});

test("instante ilegível bloqueia a promoção em vez de derrubar a área", () => {
  /*
   * Lançar aqui é lançar dentro de um efeito de render. Uma linha com data
   * corrompida não pode apagar o Radar da tela: ela declara o motivo e trava
   * a aprovação do relatório, que é o que se quer de um dado inconferível.
   */
  const projecao = projectRadarExpertEvidence({
    ...base,
    contribution: { ...base.contribution, receivedAt: "ontem de manhã" },
    review: { decision: "accepted" },
  });
  assert.equal(projecao.evidence, null);
  assert.equal(projecao.reason, "contributed_at_unreadable");

  assert.throws(
    () => buildRadarExpertEvidence({ ...base, contribution: { ...base.contribution, receivedAt: "" }, review: { decision: "accepted" } }),
    /RADAR_EXPERT_EVIDENCE_CONTRIBUTED_AT_UNREADABLE/,
  );
});
