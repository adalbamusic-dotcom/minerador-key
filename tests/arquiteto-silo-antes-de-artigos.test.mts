import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { readArticleParent } from "../lib/arquiteto/article-parent-binding.ts";
import { readSiloLifecycle } from "../lib/arquiteto/silo-lifecycle.ts";
import {
  challengesRequiringSiloReview,
  describeSiloReconsideration,
  resolveSiloBoundaryChallenge,
  type SiloBoundaryChallenge,
} from "../lib/arquiteto/silo-boundary-challenge.ts";
import {
  planTerritorialSiloComposition,
  resolveSiloConsolidationReadiness,
  type TerritorialSiloComposition,
} from "../lib/arquiteto/silo-consolidation-territorial.ts";
import type { TerritoryCandidate } from "../lib/arquiteto/territory.ts";

const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");

/**
 * CONFIRMAR ARQUITETURA NÃO É "SILODNA FINAL E IMUTÁVEL".
 *
 * Uma passada anterior fez esse ato criar o par canônico na hora, para calar o
 * "consolidação canônica pendente" que a fase Artigos mostrava. Era a resposta
 * errada para a queixa certa: o par canônico afirma a FRONTEIRA do Silo, e a
 * fronteira ainda pode ser contestada pela SERP durante Processar artigos.
 *
 * Confirmar fecha a arquitetura de TRABALHO. O par canônico vem depois.
 */

const TERRITORIO = "territory:33333333-3333-4333-8333-333333333333";
const OUTRO = "territory:44444444-4444-4444-8444-444444444444";

/* ======================== §1/§9 · os dois eixos ========================== */

test("§1 — confirmar a arquitetura deixa o Silo em WORKING_CONFIRMED, canônico pendente", () => {
  const leitura = readSiloLifecycle({ territoryConfirmed: true, canonicalSiloId: null });
  assert.equal(leitura.working, "WORKING_CONFIRMED");
  assert.equal(leitura.canonical, "CANONICAL_CONSOLIDATION_PENDING");
  assert.equal(leitura.articleFormationAllowed, true, "ARTICLE_FORMATION_ALLOWED = YES");
  // §8 — pendência normal NÃO é erro.
  assert.equal(leitura.pendingIsExpected, true);
  assert.match(leitura.note || "", /pode ser revisada por evidência SERP/);
});

test("§9 — os dois eixos têm rótulos próprios, e o canônico fecha depois", () => {
  const pendente = readSiloLifecycle({ territoryConfirmed: true, canonicalSiloId: null });
  assert.equal(pendente.workingLabel, "Confirmada");
  assert.equal(pendente.canonicalLabel, "Pendente");

  const consolidado = readSiloLifecycle({ territoryConfirmed: true, canonicalSiloId: "silo:1" });
  assert.equal(consolidado.workingLabel, "Confirmada");
  assert.equal(consolidado.canonicalLabel, "Consolidado");
  assert.equal(consolidado.pendingIsExpected, false);
  assert.equal(consolidado.note, null);
});

test("§1 — sem arquitetura de trabalho confirmada, formar Article não é permitido", () => {
  const leitura = readSiloLifecycle({ territoryConfirmed: false, canonicalSiloId: null });
  assert.equal(leitura.working, "NOT_CONFIRMED");
  assert.equal(leitura.canonical, "NOT_APPLICABLE");
  assert.equal(leitura.articleFormationAllowed, false);
  // Aqui a pendência NÃO é esperada: falta uma decisão humana.
  assert.equal(leitura.pendingIsExpected, false);
});

test("§8 — a leitura do pai carrega os dois eixos, sem esconder a pendência", () => {
  const leitura = readArticleParent({
    territoryRef: TERRITORIO,
    territoryName: "skincare",
    territoryConfirmed: true,
    canonicalSiloId: null,
  });
  // A pendência continua dita: escondê-la seria mentir.
  assert.equal(leitura.pending, "consolidação canônica pendente");
  // E deixou de ser a única coisa dita.
  assert.equal(leitura.lifecycle.working, "WORKING_CONFIRMED");
  assert.equal(leitura.lifecycle.pendingIsExpected, true);
  assert.equal(leitura.hasParent, true, "o artigo já pertence a um Silo");
});

/* ================ §2/§3/§5 · a SERP contesta, não reatribui ============= */

const contestar = (over: Partial<Parameters<typeof resolveSiloBoundaryChallenge>[0]> = {}) =>
  resolveSiloBoundaryChallenge({
    scope: { kind: "keyword", id: "k9", label: "pele oleosa e acne" },
    currentSiloRef: TERRITORIO,
    currentSiloLabel: "skincare",
    suggestedSiloRef: OUTRO,
    suggestedSiloLabel: "acne",
    sharedUrlsWithCurrent: 1,
    sharedUrlsWithSuggested: 6,
    ...over,
  });

test("§3 — evidência forte vira achado com destino, motivo e confiança", () => {
  const achado = contestar();
  assert.equal(achado.kind, "BELONGS_ELSEWHERE");
  assert.equal(achado.suggestedSiloRef, OUTRO);
  assert.equal(achado.confidence, "alta");
  assert.match(achado.reason, /aproxima "pele oleosa e acne" de "acne"/);
  assert.equal(achado.evidence.sharedUrlsWithSuggested, 6);
  assert.equal(achado.state, "open");
});

test("§3 — empate técnico é ambiguidade, e ambiguidade nunca vira 'mude'", () => {
  const achado = contestar({ sharedUrlsWithCurrent: 4, sharedUrlsWithSuggested: 5 });
  /*
   * `AMBIGUOUS_BOUNDARY` virou `BOUNDARY_UNRESOLVED` quando a homologação
   * mostrou o efeito do nome: falta de conclusão era apresentada como
   * contestação, e os cinco candidatos de um Silo único apareceram acusados.
   */
  assert.equal(achado.kind, "BOUNDARY_UNRESOLVED");
  assert.equal(achado.confidence, "baixa");
  assert.match(achado.reason, /em medida parecida/);
});

test("§3 — evidência que CONFIRMA o Silo atual também é registrada", () => {
  const achado = contestar({ sharedUrlsWithCurrent: 7, sharedUrlsWithSuggested: 0 });
  assert.equal(achado.kind, "BELONGS_TO_CURRENT");
  assert.equal(achado.suggestedSiloRef, null, "não há destino: ninguém sai daqui");
  assert.equal(achado.confidence, "alta");
});

test("§2/§5 — só o que MUDA fronteira represa; confirmação não trava a fase", () => {
  const achados: SiloBoundaryChallenge[] = [
    contestar(),
    contestar({ scope: { kind: "keyword", id: "k3", label: "pele oleosa" }, sharedUrlsWithCurrent: 7, sharedUrlsWithSuggested: 0 }),
  ];
  const abertos = challengesRequiringSiloReview(achados);
  assert.equal(abertos.length, 1);
  assert.equal(abertos[0].scope.id, "k9");

  // Incorporado ou descartado sai da pendência.
  assert.deepEqual(
    challengesRequiringSiloReview(achados.map(item => ({ ...item, state: "incorporated" as const }))),
    [],
  );
});

test("§4 — o que volta para Silos diz o que fazer, e diz que Artigos não move", () => {
  const descricao = describeSiloReconsideration([contestar()]);
  assert.equal(descricao.required, true);
  assert.equal(descricao.scopes, 1);
  assert.match(descricao.summary, /Reprocessar e confirmar a arquitetura na fase Silos/);
  assert.match(descricao.summary, /Artigos não move keyword/);

  assert.equal(describeSiloReconsideration([]).required, false);
});

test("§5 — o módulo de contestação não move nada: ele só descreve", () => {
  const fonte = readFileSync("lib/arquiteto/silo-boundary-challenge.ts", "utf8");
  // Sem escrita, sem mutação de membership, sem rede.
  assert.doesNotMatch(fonte, /applySiloDecision|setMasterList|fetch\(|persist|supabase/i);
  assert.match(fonte, /ARTICLE_CAN_DIRECTLY_MOVE_KEYWORD_BETWEEN_SILOS = NO/);
});

/* ==================== §6 · quando o canônico pode nascer ================= */

const territorioConfirmado = () => ({
  territoryRef: TERRITORIO,
  lifecycleStatus: "confirmed",
  decisionState: "confirmed",
  pendingOperation: null,
} as unknown as TerritoryCandidate);

const composicao = (): TerritorialSiloComposition => ({
  territoryRef: TERRITORIO,
  brandId: "brand-1",
  pillarArticleId: "a1",
  supportArticleIds: [],
  exclusions: [],
});

const artigos = () => [{
  articleId: "a1", brandId: "brand-1", territoryRef: TERRITORIO,
  articleDnaVersionId: "v1", articleDnaContentHash: "h1",
  isConsolidated: true, isHumanApproved: true,
}];

const decisao = () => ({
  actorUserId: "u1", decidedAt: "2026-09-08T00:00:00.000Z", reason: "consolidar",
  territoryRef: TERRITORIO, pillarArticleId: "a1", supportArticleIds: [],
  excludedArticleIds: [], publishedIdentityResolved: true,
});

test("§6 — a formação não concluída barra a consolidação canônica", () => {
  const base = {
    territory: territorioConfirmado(),
    composition: composicao(),
    articles: artigos(),
    decision: decisao(),
    siloDnaTerritoryRef: TERRITORIO,
    siloPageTerritoryRef: TERRITORIO,
  };
  assert.equal(resolveSiloConsolidationReadiness(base).state, "ready");

  const semFormacao = resolveSiloConsolidationReadiness({ ...base, articleFormationConcluded: false });
  assert.equal(semFormacao.state, "blocked");
  assert.ok(semFormacao.blockers.some(item => item.code === "ARTICLE_FORMATION_NOT_CONCLUDED"));

  // Quem já concluiu passa; quem não sabe responder não é barrado pela pergunta.
  assert.equal(
    resolveSiloConsolidationReadiness({ ...base, articleFormationConcluded: true }).state,
    "ready",
  );
});

test("§6 — contestação de fronteira aberta barra a consolidação canônica", () => {
  const veredito = resolveSiloConsolidationReadiness({
    territory: territorioConfirmado(),
    composition: composicao(),
    articles: artigos(),
    decision: decisao(),
    siloDnaTerritoryRef: TERRITORIO,
    siloPageTerritoryRef: TERRITORIO,
    articleFormationConcluded: true,
    openBoundaryChallenges: [{ scopeLabel: "pele oleosa e acne", suggestedSiloLabel: "acne" }],
  });
  assert.equal(veredito.state, "blocked");
  const bloqueio = veredito.blockers.find(item => item.code === "SILO_RECONSIDERATION_PENDING");
  assert.ok(bloqueio);
  assert.match(bloqueio.detail, /pele oleosa e acne → acne/);
});

/* ============= §10 · confirmar NÃO consolida o Silo canônico ============= */

test("§10 — ARCHITECTURE_CONFIRM_IS_FINAL_CANONICAL_SILO = NO", () => {
  const trecho = workspace.slice(workspace.indexOf("const confirmArchitecture"));
  const corpo = trecho.slice(0, trecho.indexOf("\n  };"));
  // Nenhum caminho de consolidação nasce do ato de confirmar.
  assert.doesNotMatch(corpo, /consolidateSiloIdentities|consolidateRemoteSiloFromWorkingCopy|persistSiloPair/);
  assert.doesNotMatch(workspace, /consolidateSiloIdentities/);
  /*
   * O `identityOnly` — consolidar no ATO de confirmar a arquitetura, antes de
   * existir formação alguma — continua fechado. O que existe hoje é outra
   * coisa e tem outro nome: `pendingFormations`, no fechamento automático,
   * depois de todas as formações estarem congeladas.
   *
   * O critério é o CÓDIGO: os comentários citam o nome antigo justamente para
   * explicar a diferença, e comentário não consolida Silo nenhum.
   */
  const semComentarios = (caminho: string) => readFileSync(caminho, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(semComentarios("lib/arquiteto/silo-consolidation-territorial.ts"), /identityOnly/);
  assert.doesNotMatch(semComentarios("app/api/arquiteto/silo-consolidation/route.ts"), /identityOnly/);
});

test("§6 — sem Pilar humano a consolidação continua recusando", () => {
  const plano = planTerritorialSiloComposition({
    composition: { ...composicao(), pillarArticleId: null },
    articles: [],
  });
  assert.ok(plano.issues.some(item => item.code === "PILLAR_NOT_SELECTED"));
  assert.ok(plano.issues.some(item => item.code === "ZERO_ARTICLES"));
});

/* ============================ §22 · a coluna IA ========================== */

test("§22 — a coluna Revisão IA continua fora da planilha", () => {
  const cabecalho = workspace.slice(
    workspace.indexOf('<thead className="sticky top-0'),
    workspace.indexOf("</thead>", workspace.indexOf('<thead className="sticky top-0')),
  );
  assert.equal(cabecalho.indexOf(">Revisão IA<"), -1);
  assert.doesNotMatch(cabecalho, /columnId="aiReview"/);
});

/* ========================= §2/§4 · a fiação do challenge ================= */

test("§2/§3 — a contestação nasce da evidência já persistida, sem mover nada", () => {
  const trecho = workspace.slice(workspace.indexOf("const candidateGuards"));
  const corpo = trecho.slice(0, trecho.indexOf("\n  }, ["));
  assert.match(corpo, /resolveSiloBoundaryChallenge\(\{/);
  // Medida contra os OUTROS candidatos: comparar um candidato com um conjunto
  // que o contém daria 100% de pertencimento a qualquer Silo.
  assert.match(corpo, /if \(outra\.candidateRef === evidencia\.candidateRef\) continue;/);
  // Sem evidência vigente não há contestação.
  assert.match(corpo, /!evidencia\.current \|\| !evidencia\.urls\.length\) continue;/);
  // E nada é movido no caminho de Artigos.
  assert.doesNotMatch(corpo, /applySiloDecision|handleMoveArticleToSilo|setMasterList/);
});

test("§4 — a aba Silos recebe o challenge, com o caminho normal da fase", () => {
  assert.match(workspace, /data-testid="architect-silo-reconsideration"/);
  assert.match(workspace, /Contestação de fronteira vinda dos Artigos/);
  assert.match(workspace, /Reprocessar arquitetura incorpora esta evidência/);
  // E a fase Artigos diz quem decide, em vez de oferecer um botão de mover.
  assert.match(workspace, /data-testid="architect-silo-boundary-challenge"/);
  assert.match(workspace, /Artigos não move keyword/);
});

test("§7 — LINKS_REQUIRE_CANONICAL_SILO = YES", () => {
  const trecho = workspace.slice(workspace.indexOf("const linkSiloContexts"));
  const corpo = trecho.slice(0, trecho.indexOf("\n  const resolvedLinksSiloId"));
  // Ter os dois artefatos não basta: o território precisa estar consolidado.
  assert.match(corpo, /lifecycleStatus === "consolidated"/);
  assert.match(corpo, /return siloPage && consolidado \? \{ siloId, siloDna, siloPage, workingCopy \} : null;/);
  // SiloDNA legado não declara território: para ele a pergunta não pode ser
  // feita, e inventar a resposta seria pior que não perguntar.
  assert.match(corpo, /const consolidado = !territoryRef/);
});

test("§9 — a planilha mostra os dois eixos, e a pendência normal não vira erro", () => {
  assert.match(workspace, /data-testid="architect-silo-lifecycle"/);
  assert.match(workspace, /Working: <span className="text-foreground">\{pai\.lifecycle\.workingLabel\}/);
  assert.match(workspace, /Canônico: /);
  // A coluna Ações deixou de repetir a pendência esperada como se fosse falha.
  assert.match(workspace, /pai\.lifecycle\.pendingIsExpected \? "Silo definido na fase Silos"/);
});

test("§6 — consolidar recusa enquanto houver contestação de fronteira aberta", () => {
  const trecho = workspace.slice(workspace.indexOf("const consolidateSilos"));
  const corpo = trecho.slice(0, trecho.indexOf("\n  };"));
  assert.match(corpo, /if \(candidateGuards\.openChallenges\.length\)/);
  assert.match(corpo, /candidateGuards\.reconsideration\.summary/);
  // A guarda é de CLIENTE e é dita como tal: o achado ainda não é persistido.
  assert.match(corpo, /guarda de CLIENTE/);
});
