import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  readArticleStructuralState,
  resolveTerritoryChangeImpact,
  seedArticleRevision,
} from "../lib/arquiteto/article-structural-impact.ts";

/**
 * SILOS NÃO DESMONTA ARTICLE APROVADO EM SILÊNCIO — §13.
 *
 * O caso real: a confirmação de arquitetura moveu duas das três buscas de um
 * ArticleDNA aprovado para um território candidato. O artefato ficou intacto
 * no acervo e sumiu da tela, porque o agrupamento só projeta keywords de
 * territórios confirmados.
 */

const TERR = "territory:oleosa";
const OUTRO = "territory:acne";

const artigo = (overrides: Record<string, unknown> = {}) => ({
  versionId: "art-v5",
  versionNumber: 5,
  contentHash: "sha256:art",
  entityId: "article-formation:8f8",
  payload: {
    articleId: "article-formation:8f8",
    principalKeywordId: "kw-a",
    secondaryKeywordIds: ["kw-b", "kw-c"],
    narrativeReinforcementIds: [],
    keywordReferences: [
      { keywordId: "kw-a" }, { keywordId: "kw-b" }, { keywordId: "kw-c" },
    ],
    territoryRef: TERR,
    siloId: "working-silo:2",
    suggestedSlug: "skin-care-pele-oleosa",
    ...overrides,
  },
} as never);

const rotulos = new Map([["kw-a", "skin care pele oleosa"], ["kw-b", "skin care para peles oleosas"], ["kw-c", "skin care rosto"]]);

/* ------------- C/D) o Article não some: ele vira REVISION ---------------- */

test("composição partida entre territórios vira REVISION_REQUIRED, não sumiço", () => {
  const leitura = readArticleStructuralState({
    article: (artigo() as { payload: never }).payload,
    // Foi exatamente isto que aconteceu: duas saíram, uma ficou.
    territoryByKeywordId: new Map([["kw-a", OUTRO], ["kw-b", OUTRO], ["kw-c", TERR]]),
  });
  assert.equal(leitura.state, "REVISION_REQUIRED");
  assert.deepEqual(leitura.displacedKeywordIds.sort(), ["kw-a", "kw-b"]);
  assert.match(leitura.reason, /2 de 3 buscas saíram/);
});

test("composição inteira no território é CURRENT", () => {
  const leitura = readArticleStructuralState({
    article: (artigo() as { payload: never }).payload,
    territoryByKeywordId: new Map([["kw-a", TERR], ["kw-b", TERR], ["kw-c", TERR]]),
  });
  assert.equal(leitura.state, "CURRENT");
  assert.deepEqual(leitura.displacedKeywordIds, []);
});

test("Article sem território é legado, não revisão", () => {
  const leitura = readArticleStructuralState({
    article: (artigo({ territoryRef: undefined }) as { payload: never }).payload,
    territoryByKeywordId: new Map(),
  });
  assert.equal(leitura.state, "LEGACY_NO_TERRITORY");
});

/* ------------------- A) o impacto é calculado ANTES --------------------- */

test("A) mover keyword de Article aprovado lista o Article afetado", () => {
  const impacto = resolveTerritoryChangeImpact({
    proposals: [{ keywordId: "kw-a", territoryRef: OUTRO }, { keywordId: "kw-b", territoryRef: OUTRO }],
    approvedArticles: [artigo()],
    territoryByKeywordId: new Map([["kw-a", TERR], ["kw-b", TERR], ["kw-c", TERR]]),
    labelByKeywordId: rotulos,
  });
  assert.equal(impacto.clean, false);
  assert.equal(impacto.impacted.length, 1);
  const alvo = impacto.impacted[0];
  assert.equal(alvo.keywordCountBefore, 3);
  assert.equal(alvo.keywordCountAfter, 1);
  assert.equal(alvo.losesPrincipal, true, "kw-a é a Principal");
  assert.match(alvo.reason, /Perde a Principal/);
  assert.match(impacto.summary, /revisão estrutural/);
});

test("H) mudança que não toca Article aprovado segue fluxo normal", () => {
  const impacto = resolveTerritoryChangeImpact({
    proposals: [{ keywordId: "kw-solta", territoryRef: OUTRO }],
    approvedArticles: [artigo()],
    territoryByKeywordId: new Map([["kw-solta", TERR], ["kw-a", TERR], ["kw-b", TERR], ["kw-c", TERR]]),
  });
  assert.equal(impacto.clean, true);
  assert.deepEqual(impacto.impacted, []);
  assert.match(impacto.summary, /Nenhum ArticleDNA aprovado perde ou recupera buscas/);
});

test("keyword que já estava fora do território não conta como perda nova", () => {
  const impacto = resolveTerritoryChangeImpact({
    proposals: [{ keywordId: "kw-b", territoryRef: OUTRO }],
    approvedArticles: [artigo()],
    // kw-b já vivia em OUTRO: a proposta não a tira de lugar nenhum agora.
    territoryByKeywordId: new Map([["kw-a", TERR], ["kw-b", OUTRO], ["kw-c", TERR]]),
  });
  assert.equal(impacto.clean, true);
});

/* -------- E/F) a revisão nasce do DNA vigente e não o modifica ---------- */

test("E) a semente de revisão parte do ArticleDNA current", () => {
  const aprovado = artigo();
  const semente = seedArticleRevision({ approved: aprovado, removedKeywordIds: ["kw-b"] });

  assert.equal(semente.articleId, "article-formation:8f8");
  assert.equal(semente.previousVersionId, "art-v5");
  assert.equal(semente.previousVersionNumber, 5);
  // Principal, slug, território e Silo vêm do artefato — não são reinventados.
  assert.equal(semente.principalKeywordId, "kw-a");
  assert.equal(semente.suggestedSlug, "skin-care-pele-oleosa");
  assert.equal(semente.territoryRef, TERR);
  assert.equal(semente.siloId, "working-silo:2");
  assert.deepEqual(semente.secondaryKeywordIds, ["kw-c"]);
});

test("F) o ArticleDNA aprovado permanece imutável", () => {
  const aprovado = artigo();
  const antes = JSON.stringify(aprovado);
  seedArticleRevision({ approved: aprovado, removedKeywordIds: ["kw-a", "kw-b"] });
  assert.equal(JSON.stringify(aprovado), antes, "semear revisão não toca no aprovado");
});

test("perder a Principal devolve a decisão ao humano, sem escolher sozinho", () => {
  const semente = seedArticleRevision({ approved: artigo(), removedKeywordIds: ["kw-a"] });
  assert.equal(semente.principalKeywordId, "kw-a", "a atual é preservada para a tela mostrar o que se perde");
  assert.match(semente.reason, /decisão humana/);
});

/* ------------------------- B) a fiação da tela -------------------------- */

test("B) confirmar arquitetura calcula impacto antes de escrever", () => {
  const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
  assert.match(workspace, /const impactoEstrutural = resolveTerritoryChangeImpact\(\{/);
  /*
   * QUEM MOSTRA O QUE SE PERDE É PROCESSAR.
   *
   * Este teste exigia o preview de dois cliques dentro de Confirmar. Ele
   * existia porque Processar não produzia nada — sem prévia, confirmar
   * aplicaria um plano invisível. Agora Processar materializa a proposta e
   * devolve os contadores, e Confirmar aplica uma vez só.
   *
   * O que NÃO mudou, e é o que este teste guarda: o impacto sobre estrutura
   * aprovada é calculado ANTES de qualquer escrita, e quebra é recusa.
   */
  assert.ok(workspace.includes("if (!architectureMarker) {"), "confirmar precisa exigir cenário processado");
  assert.ok(workspace.includes("if (architectureIsStale) {"), "confirmar precisa recusar cenário vencido");
  assert.match(workspace, /setArchitectureImpactAck\(impactoEstrutural\)/);
  // E o cálculo acontece ANTES de qualquer escrita.
  const posImpacto = workspace.indexOf("const impactoEstrutural = resolveTerritoryChangeImpact");
  const posEscrita = workspace.indexOf("await applySiloDecision(assignment.keywordId");
  assert.ok(posImpacto > 0 && posImpacto < posEscrita, "o impacto precisa preceder a escrita");
});

test("C) o Article aprovado partido é nomeado, não some", () => {
  const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
  assert.match(workspace, /const structuralRevisions = useMemo/);
  assert.match(workspace, /readArticleStructuralState\(\{ article: version\.payload, territoryByKeywordId \}\)/);
  assert.match(workspace, /precisam de revisão estrutural e não estão no cenário/);
});

/* ---- A/B) direção do movimento decide: quebra bloqueia, restauração passa --- */

test("A) quebrar estrutura aprovada é BLOQUEIO, não aviso", () => {
  const impacto = resolveTerritoryChangeImpact({
    proposals: [{ keywordId: "kw-a", territoryRef: OUTRO }, { keywordId: "kw-b", territoryRef: OUTRO }],
    approvedArticles: [artigo()],
    territoryByKeywordId: new Map([["kw-a", TERR], ["kw-b", TERR], ["kw-c", TERR]]),
    labelByKeywordId: rotulos,
  });
  assert.equal(impacto.impacted[0].classification, "BREAKS_APPROVED_STRUCTURE");
  assert.equal(impacto.blocked.length, 1, "quebra entra na lista de bloqueio");
  assert.match(impacto.summary, /não pode ser aplicada/);
});

test("B) devolver as buscas ao território é RESTAURAÇÃO e pode aplicar", () => {
  /*
   * O caso real invertido: as duas keywords voltam de "Pele Oleosa e Acne"
   * para o Silo confirmado onde a terceira já está. Proibir isto pelo mesmo
   * motivo que proíbe a quebra tornaria o estrago permanente.
   */
  const impacto = resolveTerritoryChangeImpact({
    proposals: [{ keywordId: "kw-a", territoryRef: TERR }, { keywordId: "kw-b", territoryRef: TERR }],
    approvedArticles: [artigo()],
    territoryByKeywordId: new Map([["kw-a", OUTRO], ["kw-b", OUTRO], ["kw-c", TERR]]),
    labelByKeywordId: rotulos,
  });
  const alvo = impacto.impacted[0];
  assert.equal(alvo.classification, "RESTORES_APPROVED_STRUCTURE");
  assert.equal(alvo.alignedBefore, 1);
  assert.equal(alvo.alignedAfter, 3);
  assert.deepEqual(alvo.losingKeywordIds, []);
  assert.equal(impacto.blocked.length, 0, "restauração nunca bloqueia");
  assert.match(impacto.summary, /Restauração estrutural/);
});

test("restauração incompleta é reconhecida — e NÃO finaliza", () => {
  /*
   * A classificação continua distinguindo caminho de volta de quebra: são
   * coisas diferentes e o motivo mostrado é outro. O que mudou é que
   * parcial deixou de poder ser aplicada — restaurar é atômico por artigo.
   */
  const impacto = resolveTerritoryChangeImpact({
    proposals: [{ keywordId: "kw-a", territoryRef: TERR }],
    approvedArticles: [artigo()],
    territoryByKeywordId: new Map([["kw-a", OUTRO], ["kw-b", OUTRO], ["kw-c", TERR]]),
    labelByKeywordId: rotulos,
  });
  assert.equal(impacto.impacted[0].classification, "PARTIAL_RESTORATION");
  assert.equal(impacto.blocked.length, 1, "parcial não finaliza");
  assert.notEqual(impacto.impacted[0].classification, "BREAKS_APPROVED_STRUCTURE");
});

test("a UI recusa a quebra em vez de oferecer 'aplicar mesmo assim'", () => {
  const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
  assert.match(workspace, /if \(impactoEstrutural\.blocked\.length\) \{/);
  // A frase pode aparecer no comentário que EXPLICA a remoção; o que não pode
  // existir é a notificação que a oferecia.
  /*
   * A frase pode aparecer no comentário que EXPLICA a remoção; o que não pode
   * existir é a NOTIFICAÇÃO que a oferecia. Procurar a frase solta no arquivo
   * proibiria documentar o próprio defeito.
   */
  const linhasDeCodigo = workspace.split("\n")
    .filter(linha => !linha.trim().startsWith("*") && !linha.trim().startsWith("//") && !linha.trim().startsWith("/*"));
  assert.ok(
    !linhasDeCodigo.some(linha => linha.includes("aplicar mesmo assim")),
    "nenhuma linha de código pode oferecer aplicar mesmo assim",
  );
});

/* ------- restauração é ATÔMICA por Article: metade não finaliza --------- */

test("restauração parcial NÃO pode ser aplicada", () => {
  /*
   * Devolver uma das duas buscas deixaria o Article divergente entre um
   * clique e outro — estado que ninguém pediu e que só existe porque o lote
   * foi aplicado pela metade.
   */
  const impacto = resolveTerritoryChangeImpact({
    proposals: [{ keywordId: "kw-a", territoryRef: TERR }],
    approvedArticles: [artigo()],
    territoryByKeywordId: new Map([["kw-a", OUTRO], ["kw-b", OUTRO], ["kw-c", TERR]]),
    labelByKeywordId: rotulos,
  });
  assert.equal(impacto.impacted[0].classification, "PARTIAL_RESTORATION");
  assert.equal(impacto.blocked.length, 1, "parcial entra no bloqueio");
  assert.match(impacto.summary, /Restaurar é atômico por artigo/);
});

test("restauração COMPLETA das duas buscas é aplicável", () => {
  const impacto = resolveTerritoryChangeImpact({
    proposals: [{ keywordId: "kw-a", territoryRef: TERR }, { keywordId: "kw-b", territoryRef: TERR }],
    approvedArticles: [artigo()],
    territoryByKeywordId: new Map([["kw-a", OUTRO], ["kw-b", OUTRO], ["kw-c", TERR]]),
    labelByKeywordId: rotulos,
  });
  assert.equal(impacto.blocked.length, 0);
  assert.equal(impacto.impacted[0].alignedAfter, 3);
  assert.match(impacto.summary, /volta a 3\/3 no território aprovado/);
});

test("uma quebra no lote barra o lote inteiro, mesmo com restaurações junto", () => {
  const base = artigo() as { versionId: string; versionNumber: number; contentHash: string; entityId: string; payload: Record<string, unknown> };
  const outroArtigo = {
    ...base,
    payload: {
      ...base.payload, articleId: "outro", principalKeywordId: "kw-x",
      secondaryKeywordIds: [], narrativeReinforcementIds: [], keywordReferences: [{ keywordId: "kw-x" }],
    },
  } as never;
  const impacto = resolveTerritoryChangeImpact({
    proposals: [
      { keywordId: "kw-a", territoryRef: TERR }, { keywordId: "kw-b", territoryRef: TERR },
      { keywordId: "kw-x", territoryRef: OUTRO },
    ],
    approvedArticles: [artigo(), outroArtigo],
    territoryByKeywordId: new Map([["kw-a", OUTRO], ["kw-b", OUTRO], ["kw-c", TERR], ["kw-x", TERR]]),
    labelByKeywordId: rotulos,
  });
  assert.ok(impacto.blocked.some(item => item.classification === "BREAKS_APPROVED_STRUCTURE"));
  assert.match(impacto.summary, /não pode ser aplicada/);
});

/* --------------- §5 o preview mostra o plano inteiro ------------------- */

test("o plano inteiro viaja para o preview, não só o que impacta", () => {
  const impacto = resolveTerritoryChangeImpact({
    proposals: [
      { keywordId: "kw-a", territoryRef: TERR }, { keywordId: "kw-b", territoryRef: TERR },
      { keywordId: "kw-c", territoryRef: TERR },
    ],
    approvedArticles: [artigo()],
    territoryByKeywordId: new Map([["kw-a", OUTRO], ["kw-b", OUTRO], ["kw-c", TERR]]),
    labelByKeywordId: rotulos,
  });
  assert.equal(impacto.plannedAssignments.length, 3);
  // A linha que não move nada também aparece — o preview mostra o lote todo.
  const parada = impacto.plannedAssignments.find(linha => linha.keywordId === "kw-c");
  assert.equal(parada?.unchanged, true);
  assert.equal(parada?.label, "skin care rosto");
  const movida = impacto.plannedAssignments.find(linha => linha.keywordId === "kw-a");
  assert.equal(movida?.currentTerritoryRef, OUTRO);
  assert.equal(movida?.proposedTerritoryRef, TERR);
});

test("a tela renderiza o plano antes de qualquer escrita", () => {
  const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
  assert.match(workspace, /data-testid="architect-territory-impact-preview"/);
  assert.match(workspace, /data-testid="architect-territory-plan-rows"/);
  assert.match(workspace, /architectureImpactAck\.plannedAssignments\.map/);
});
