import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  classifyRadarSerpCollectionFailure,
  radarSerpCollectionAction,
  radarSerpCollectionInFlight,
  RADAR_SERP_COLLECTION_LABEL,
} from "../lib/radar/serp-collection-state.ts";

const pronto = { hasSnapshot: false, state: "NOT_COLLECTED" as const, contextReady: true };

/* --------------------------- A · estado inicial -------------------------- */

test("sem snapshot existe uma ação primária explícita e nenhum provider é chamado", () => {
  const action = radarSerpCollectionAction(pronto);
  assert.equal(action.state, "NOT_COLLECTED");
  assert.equal(action.actionLabel, "Iniciar coleta SERP");
  assert.equal(action.canStart, true);
  assert.equal(action.isFirstCollection, true);
  assert.match(action.detail, /explícita/);

  // O rótulo é o canônico do contrato, não texto solto do componente.
  assert.equal(RADAR_SERP_COLLECTION_LABEL.NOT_COLLECTED, "Iniciar coleta SERP");
});

test("sem contexto mínimo não há ação oferecida", () => {
  const action = radarSerpCollectionAction({ ...pronto, contextReady: false });
  assert.equal(action.actionLabel, null);
  assert.equal(action.canStart, false);
});

/* ----------------- B, C · a coleta só sai por ação explícita -------------- */

test("a única chamada ao provider parte do handler de coleta", () => {
  const workbench = readFileSync("modules/radar/radar-page.tsx", "utf8");
  const chamadas = workbench.match(/pipeline\.collectSerp\(/g) || [];
  assert.equal(chamadas.length, 1, "collectSerp precisa ter um único ponto de chamada");

  // Nenhum efeito de montagem/seleção/reload pode disparar a coleta.
  for (const efeito of workbench.match(/useEffect\([\s\S]*?\n {2}\}, \[[^\]]*\]\);/g) || []) {
    assert.equal(/collectSerp|collect\(/.test(efeito), false, "nenhum useEffect pode coletar SERP");
  }

  const painel = readFileSync("modules/radar/radar-r3-serp-panel.tsx", "utf8");
  assert.match(painel, /Abrir esta subaba não dispara chamada/);
  assert.equal(/useEffect\([^)]*collect/i.test(painel), false);
});

/* --------------------------- D · duplo clique ---------------------------- */

test("uma requisição em voo não aceita a segunda", () => {
  for (const state of ["VALIDATING", "COLLECTING", "PERSISTING"] as const) {
    assert.equal(radarSerpCollectionInFlight(state), true);
    const action = radarSerpCollectionAction({ ...pronto, state });
    assert.equal(action.canStart, false, `${state} não pode disparar outra coleta`);
    assert.equal(action.actionLabel, RADAR_SERP_COLLECTION_LABEL[state]);
  }
  for (const state of ["NOT_COLLECTED", "SUCCESS", "TRANSIENT_FAILURE", "STRUCTURAL_BLOCK"] as const) {
    assert.equal(radarSerpCollectionInFlight(state), false);
  }
});

test("o guard de duplo clique fecha antes do await, não por estado de render", () => {
  const workbench = readFileSync("modules/radar/radar-page.tsx", "utf8");
  assert.match(workbench, /if \(collectingArticleIdRef\.current\) return "FAILED_RETRYABLE";/);
  const corpo = workbench.slice(workbench.indexOf("const collect = async"));
  const guard = corpo.indexOf("collectingArticleIdRef.current");
  const primeiroAwait = corpo.indexOf("await pipeline.collectSerp");
  assert.ok(guard >= 0 && primeiroAwait > guard, "o ref precisa ser conferido antes do await");
  assert.match(corpo, /finally \{ collectingArticleIdRef\.current = null;/);
});

/* ------------------------- E · erro estrutural --------------------------- */

test("erro de vínculo é bloqueio, não retry", () => {
  const silo = Object.assign(new Error("O Silo deste artigo não pôde ser comprovado dentro da marca selecionada. Nenhuma coleta foi iniciada."), { code: "permission_denied" });
  assert.equal(classifyRadarSerpCollectionFailure(silo), "STRUCTURAL_BLOCK");

  const action = radarSerpCollectionAction({ ...pronto, state: "STRUCTURAL_BLOCK", blockedReason: silo.message });
  assert.equal(action.actionLabel, null, "bloqueio estrutural não oferece ação primária");
  assert.equal(action.canStart, false);
  assert.equal(action.detail, silo.message);
  assert.equal(/tentar novamente/i.test(action.detail), false);
});

test("marca, transferência, identidade e keyword técnica bloqueiam sem retry", () => {
  const estruturais = [
    Object.assign(new Error("qualquer"), { code: "unauthenticated" }),
    Object.assign(new Error("qualquer"), { code: "invalid_transfer" }),
    Object.assign(new Error("qualquer"), { code: "transfer_conflict" }),
    Object.assign(new Error("qualquer"), { code: "invalid_serp_request" }),
    new Error("A keyword principal não pertence à marca selecionada."),
    new Error("A keyword principal foi hidratada como identificador técnico. Corrija o vínculo no Arquiteto antes de pesquisar a SERP."),
    new Error("A hidratação local não corresponde ao ArticleDNA deste artigo."),
    new Error("A versão do ArticleDNA enviada pelo Radar diverge da versão canônica."),
  ];
  for (const error of estruturais) {
    assert.equal(classifyRadarSerpCollectionFailure(error), "STRUCTURAL_BLOCK", `${error.message} deveria bloquear`);
  }
});

test("a UI do bloqueio não oferece repetir e não despeja identificador na mensagem", () => {
  const painel = readFileSync("modules/radar/radar-r3-serp-panel.tsx", "utf8");
  assert.match(painel, /Coleta bloqueada/);
  assert.match(painel, /Corrija o vínculo da keyword antes de coletar/);
  assert.match(painel, /Nenhuma chamada DataForSEO foi iniciada/);
  const generico = radarSerpCollectionAction({ ...pronto, state: "STRUCTURAL_BLOCK" });
  assert.equal(/[0-9a-f]{8}-[0-9a-f]{4}-/i.test(generico.detail), false, "a mensagem principal não carrega UUID");
});

/* ------------------------- F · erro transitório -------------------------- */

test("falha transitória oferece tentar novamente", () => {
  const transitorios = [
    Object.assign(new Error("indisponível"), { code: "persistence_unavailable" }),
    Object.assign(new Error("gateway"), { code: "http_502" }),
    new Error("O provider excedeu o tempo limite."),
    new Error("network error"),
  ];
  for (const error of transitorios) {
    assert.equal(classifyRadarSerpCollectionFailure(error), "TRANSIENT_FAILURE", `${error.message} deveria permitir retry`);
  }

  const action = radarSerpCollectionAction({ ...pronto, state: "TRANSIENT_FAILURE" });
  assert.equal(action.actionLabel, "Tentar novamente");
  assert.equal(action.canStart, true);
  assert.equal(action.isFirstCollection, true);
});

/* --------------------------- G, H · sucesso e reload --------------------- */

test("com snapshot o estado é sucesso e a primeira coleta não é oferecida", () => {
  const action = radarSerpCollectionAction({ hasSnapshot: true, state: "SUCCESS", contextReady: true });
  assert.equal(action.state, "SUCCESS");
  assert.equal(action.isFirstCollection, false);
  assert.notEqual(action.actionLabel, "Iniciar coleta SERP");
  assert.equal(action.actionLabel, "Atualizar SERP");
});

test("após reload, snapshot existente não reinicia coleta", () => {
  // Sem estado de sessão, o modelo cai em SUCCESS pelo snapshot — nunca em
  // NOT_COLLECTED, que é o único estado que ofereceria a primeira coleta.
  const aposReload = radarSerpCollectionAction({ hasSnapshot: true, state: "SUCCESS", contextReady: true });
  assert.equal(aposReload.isFirstCollection, false);

  const workbench = readFileSync("modules/radar/radar-page.tsx", "utf8");
  assert.match(workbench, /state: collectionByArticle\[row\.articleId\]\?\.state \|\| \(view \? "SUCCESS" : "NOT_COLLECTED"\)/);
});

/* --------------------------- I · isolamento ------------------------------ */

test("a prova de posse do Silo continua remota e escopada por marca", () => {
  const rota = readFileSync("app/api/editorial/serp/route.ts", "utf8");

  // O espaço legado continua sendo conferido com marca.
  assert.match(rota, /from\("minerador_keyword_lists"\)\.select\("id,marca_id"\)/);
  assert.match(rota, /if \(silo\.marca_id === brandId\) ownedSiloIds\.push\(silo\.id\)/);

  // O espaço canônico vem do repositório tenantizado, não do navegador.
  assert.match(rota, /const artifacts = await new ArtifactRepository\(\)\.list\(brandId\);/);
  assert.match(rota, /for \(const silo of artifacts\.silos\) brandSiloDnaIds\.add\(silo\.payload\.siloId\);/);
  assert.match(rota, /brandSiloDnaIds\.has\(candidate\)/);

  // E nada aceita Silo sem prova.
  assert.match(rota, /if \(!ownedSiloIds\.length\) throw new AuthzError\(403/);
  assert.equal(/\.eq\("brand_id", *"\*"\)|ignoreBrand|semBrand/.test(rota), false);
});

test("a mensagem do bloqueio culpa o Silo, não a keyword", () => {
  const rota = readFileSync("app/api/editorial/serp/route.ts", "utf8");
  assert.match(rota, /O Silo deste artigo não pôde ser comprovado dentro da marca selecionada/);
  assert.equal(
    /throw new AuthzError\(403, "A keyword principal não pertence à marca selecionada\."\)/.test(rota),
    false,
    "o guard de Silo não pode voltar a acusar a keyword",
  );
});

/* --------------------------- J · snapshot existente ---------------------- */

test("com snapshot, atualizar continua explícito e cria sucessor por decisão", () => {
  const comSnapshot = radarSerpCollectionAction({ hasSnapshot: true, state: "SUCCESS", contextReady: true });
  assert.match(comSnapshot.detail, /snapshot sucessor/);
  assert.match(comSnapshot.detail, /deliberada/);

  const semSnapshot = radarSerpCollectionAction(pronto);
  assert.notEqual(semSnapshot.actionLabel, comSnapshot.actionLabel);
});

test("a planilha projeta bloqueio estrutural como bloqueio, não como retry", () => {
  const workbench = readFileSync("modules/radar/radar-page.tsx", "utf8");
  assert.match(workbench, /collection\?\.state === "STRUCTURAL_BLOCK" \? "Coleta bloqueada"/);
  assert.match(workbench, /r3\.nextAction = "Corrija o vínculo da keyword antes de coletar\."/);
  // "Falha · tentar novamente" continua existindo — só para o transitório.
  assert.match(workbench, /"FAILED_RETRYABLE" \? "Falha · tentar novamente"/);
});
