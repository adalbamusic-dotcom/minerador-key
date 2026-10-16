import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { planSiloCreationRefusal, planSiloHeadKeywordIds, planSiloTextKey } from "../lib/arquiteto/declared-plan-silo.ts";
import { reservedSiloHeadKeywordIds } from "../lib/arquiteto/article-candidate-guards.ts";
import { buildArchitectureWorkingProposal, resolveKeywordDnaSignals } from "../lib/arquiteto/architecture-working-proposal.ts";
import type { ArchitectureAnalysis, ClusterAnalysis } from "../lib/arquiteto/architecture-analysis.ts";
import { planArticleKeywordIds } from "../lib/arquiteto/plan-article-sheet.ts";
import { readArchitectSubjectStandings } from "../lib/arquiteto/declared-subject.ts";
import { AZUL, MARCA_WIFI } from "./arquiteto-planilha-primeiro-fixtures.mts";
import { AZUL_REAL, mesaWifiReal } from "./arquiteto-uma-lista-so-fixtures.mts";

/*
 * 2026-10-15 · O SILO DO PLANO É O DNA DO PLANO (pedido do dono, literal):
 * "muitas vezes eu já tenho a keyword e o slug do silo (…) o Google provider
 * barra ele porque tem 0 volume e não cadastra ele como keyword (…) se ele não
 * detectou uma keyword destinada para o silo, mas no DNA já está definido, ele
 * tem que fazer só isso, recriar e ir pra frente, os dados são claros, não tem
 * que tentar converter ninguém (…) a definição do silo já tem que estar na aba
 * do Silo e não nos artigos. Artigo só mexe com artigos".
 *
 * Fixture do caso real (SELECT de 15/10, marca WifiConecta d4fa133a): grupo
 * azul com plano { siloName "Wi-Fi e fibra óptica", siloSlug "wifi-e-fibra" },
 * 7 artigos do plano (k9 Pilar … k15); a keyword 34bd7c0f "Wi-Fi e fibra
 * óptica" existe no Minerador (bruta, 0 volume, sem Assunto e sem grupo) e NÃO
 * está no Arquiteto. As duas variantes são testadas: ausente (o normal) e
 * presente (se um dia for enviada).
 *
 * 2026-10-16 · restauração do fluxo de sempre (ordem do dono, 15/10 noite):
 * saíram daqui os testes das portas paralelas (linha "Consolidar o Silo do
 * plano", etapas da aba Artigos, "Linha editorial"). Ficam os consertos: a
 * keyword do Silo, nunca converter artigo em Silo, o Silo do plano sem semente
 * em "Processar arquitetura" e as keywords soltas na lista da melhoria.
 */
const PLANO_AZUL = { groupId: AZUL, siloName: "Wi-Fi e fibra óptica", siloSlug: "wifi-e-fibra" };
const PLANO_LARANJA = { groupId: "aaaa0000-0000-4000-8000-00000000a202", siloName: "Planos de internet", siloSlug: "planos-de-internet" };
const CABECA = "34bd7c0f-b543-4c0e-b83d-a71b0a819ce3";
const TERRITORIO = "territory:5e689f8c-8f06-4e65-94c4-b3cd7ac906cc";
const mesa = () => mesaWifiReal();
const doPlano = () => planArticleKeywordIds({ brandId: MARCA_WIFI, standings: readArchitectSubjectStandings(mesa()) });
const slugOf = (value: string) => value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const ler = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), "utf8");

/* ---------------------------------------------- 1 · a keyword do Silo */

test("1 · a keyword do Silo é reconhecida pelo nome/slug do plano (cabeça da SiloPage); artigo do plano nunca é cabeça; ambígua não é reconhecida", () => {
  assert.equal(planSiloTextKey("Wi-Fi e fibra óptica"), "wifiefibraoptica");
  const keywords = [
    ...AZUL_REAL.map(([keywordId, text]) => ({ keywordId, text })),
    { keywordId: CABECA, text: "Wi-Fi e fibra óptica" },
    { keywordId: "slug", text: "wifi e fibra" },
    { keywordId: "outra", text: "internet residencial" },
  ];
  const cabecas = planSiloHeadKeywordIds({ plans: [PLANO_AZUL, PLANO_LARANJA], keywords, planArticleKeywordIds: doPlano() });
  assert.deepEqual([...cabecas].sort(), [[CABECA, AZUL], ["slug", AZUL]], "o nome e o slug do plano; nenhuma keyword de artigo");
  // Artigo do plano com o mesmo texto do Silo continua artigo (nunca converte artigo em Silo).
  const artigoComONome = planSiloHeadKeywordIds({ plans: [PLANO_AZUL], keywords: [{ keywordId: "k9", text: "Wi-Fi e fibra óptica" }], planArticleKeywordIds: new Set(["k9"]) });
  assert.equal(artigoComONome.size, 0);
  // Dois planos com o mesmo nome: ambíguo, decisão humana.
  assert.equal(planSiloHeadKeywordIds({ plans: [PLANO_AZUL, { ...PLANO_LARANJA, siloName: "Wi-Fi e fibra óptica" }], keywords: [{ keywordId: CABECA, text: "Wi-Fi e fibra óptica" }] }).size, 0);
  // Marca sem plano (AdalbaPro): nada é reconhecido.
  assert.equal(planSiloHeadKeywordIds({ plans: [], keywords }).size, 0);
});

test("1 · a reserva: a keyword do Silo (presente) fica fora de artigo e de 'não agrupadas' mesmo sem Silo; artigo do plano nunca é reservado", () => {
  const reservadas = reservedSiloHeadKeywordIds({
    lexicalHeadIds: ["k9"], declaredSiloHeadIds: [], territories: [],
    keywords: [{ keywordId: CABECA, text: "Wi-Fi e fibra óptica", territoryRef: null }],
    planArticleKeywordIds: doPlano(), planSiloHeadIds: [CABECA],
  });
  assert.deepEqual([...reservadas], [CABECA], "a cabeça reservada; o Pilar (k9) nunca");
  // Sem a cabeça (o caso real): nada é reservado — e nada é pendência.
  assert.equal(reservedSiloHeadKeywordIds({ lexicalHeadIds: [], declaredSiloHeadIds: [], territories: [], keywords: [], planArticleKeywordIds: doPlano(), planSiloHeadIds: [] }).size, 0);
});

/* ------------------------- 2 · nunca converter artigo, nunca Silo paralelo */

function proposta(opcoes: { cabeca: boolean; territorio: boolean }) {
  const ids = AZUL_REAL.map(([id]) => id);
  const textos = [...AZUL_REAL.map(([keywordId, text]) => ({ keywordId, text })), ...(opcoes.cabeca ? [{ keywordId: CABECA, text: "Wi-Fi e fibra óptica" }] : [])];
  const sinais = textos.map(({ keywordId, text }) => resolveKeywordDnaSignals({ keywordId, text, semantic: {} }));
  // O léxico junta a keyword do Silo com os artigos e a elege cabeça (o que fazia nascer um Silo "wi-fi-e-fibra-optica" paralelo).
  const membros = opcoes.cabeca ? [CABECA, ...ids] : ids;
  const cluster = { clusterRef: "c1", label: "Wi-Fi e fibra óptica", memberKeywordIds: membros, headKeywordId: membros[0], ambiguousHeadKeywordIds: [], destination: "new_silo_candidate", suggestedTerritoryRef: null, suggestedTerritoryLabel: null, alternativeTerritoryRefs: [], confidence: "alta", reason: "grupo coeso" } as unknown as ClusterAnalysis;
  const analise: ArchitectureAnalysis = { clusters: [cluster], summary: { keywords: membros.length, clusters: 1, strengthening: 0, newSilos: 1, insufficient: 0, ambiguous: 0, confidence: "alta" }, narrative: [], baseHash: "base" };
  return buildArchitectureWorkingProposal({
    analysis: analise, existingSilos: [], keywords: sinais, slugOf,
    declaredPlanGroups: [{ groupId: AZUL, label: "Azul", siloName: "Wi-Fi e fibra óptica", siloSlug: "wifi-e-fibra", keywordIds: ids,
      territoryRef: opcoes.territorio ? TERRITORIO : null, territory: opcoes.territorio ? { name: "Wi-Fi e fibra óptica", slug: "wifi-e-fibra" } : null,
      headKeywordIds: opcoes.cabeca ? [CABECA] : [] }],
  });
}

test("2 · 'Processar arquitetura' com a keyword do Silo presente: ela entra no Silo do plano como cabeça; nenhum segundo Silo; nenhum artigo vira semente", () => {
  for (const territorio of [true, false]) {
    const resultado = proposta({ cabeca: true, territorio });
    const chave = territorio ? TERRITORIO : "proposed:wifi-e-fibra";
    assert.deepEqual(resultado.silos.map(silo => silo.key), [chave], `um Silo só, o do plano (${territorio ? "existente" : "proposto"})`);
    assert.equal(resultado.silos[0].seedKeywordId, null, "o tema é o nome do Silo do plano, nunca a semente léxica");
    const cabeca = resultado.assignments.find(item => item.keywordId === CABECA)!;
    assert.equal(cabeca.siloKey, chave);
    assert.match(cabeca.reason, /Keyword do Silo do plano.*cabeça da SiloPage/);
    assert.ok(resultado.assignments.filter(item => item.keywordId !== CABECA).every(item => item.siloKey === chave), "os artigos do plano seguem no Silo do plano");
    assert.equal(resultado.counters.RESOLVED_KEYWORDS, 8, "nenhuma keyword some");
  }
});

test("2 · variante 'keyword do Silo ausente' (o caso real): o Silo do plano é reusado ou proposto pelo NOME e SLUG do plano; nada pendente", () => {
  const existente = proposta({ cabeca: false, territorio: true });
  assert.deepEqual([existente.counters.SILOS_PROPOSED, existente.counters.SILOS_REUSED], [0, 1]);
  const novo = proposta({ cabeca: false, territorio: false });
  assert.deepEqual(novo.silos.map(silo => [silo.key, silo.name, silo.slug, silo.seedKeywordId]), [["proposed:wifi-e-fibra", "Wi-Fi e fibra óptica", "wifi-e-fibra", null]]);
});

test("2 · criação manual, 'Usar como Silo' e sugestão: Silo do plano não é criado por fora; artigo do plano não vira Silo; marca sem plano segue como antes", () => {
  const planos = [{ ...PLANO_AZUL, groupLabel: "Azul" }];
  assert.match(planSiloCreationRefusal({ name: "Wi-Fi e fibra óptica", plans: planos, existingTerritoryName: () => "Wi-Fi e fibra óptica" })!, /já existe .*não se cria um segundo/);
  // 2026-10-16 · o caminho é o de sempre: "Processar arquitetura" → "Confirmar propostas novas" (desfeito: "Recriar o Silo do plano").
  assert.match(planSiloCreationRefusal({ name: "Qualquer", slug: "wifi-e-fibra", plans: planos })!, /nasce com o nome e o slug do plano — na aba Silos, “Processar arquitetura” o propõe e “Confirmar propostas novas” o confirma \(desfeito: “Recriar o Silo do plano”\)/);
  assert.doesNotMatch(planSiloCreationRefusal({ keywordIds: ["k9"], plans: planos, planArticleKeywordIds: doPlano() })!, /Consolidar o Silo do plano/);
  assert.match(planSiloCreationRefusal({ keywordIds: ["k9"], plans: planos, planArticleKeywordIds: doPlano() })!, /artigo do plano nunca vira Silo/);
  assert.equal(planSiloCreationRefusal({ name: "Captação de Pacientes", plans: [] }), null, "AdalbaPro (sem plano): como antes");
  assert.equal(planSiloCreationRefusal({ name: "Planos de internet", plans: planos }), null, "outro nome: livre");
  const tela = ler("../modules/arquiteto/arquiteto-workspace.tsx");
  assert.equal(tela.split("planSiloCreationRefusal({").length - 1, 2, "a criação manual e o 'Usar como Silo' perguntam ao plano");
  assert.match(tela, /candidates: doTerritorio\.filter\(kw => !planArticleKeywordIdSet\.has\(String\(kw\.id\)\)\)/, "a primária do Silo pela SERP nunca propõe artigo do plano");
  assert.match(tela, /keyword\.siloCandidate\?\.status === "candidate" && !keyword\.isPublished && !planArticleKeywordIdSet\.has\(String\(keyword\.id\)\) && !planSiloHeadIds\.has\(String\(keyword\.id\)\)/, "a sugestão de Silo não lista artigo do plano nem a keyword do Silo");
});

/* ------------------------- 3 · o reforço: as keywords soltas entram na lista */

test("3 · a melhoria (o painel 'Melhorar publicados…') com o recorte de um grupo traz as keywords soltas para a lista; a Livre com volume fica fixa", () => {
  const motor = ler("../lib/server/arquiteto-article-improvement.ts");
  assert.match(motor, /groupFilter: \{ kind: "none" \}/, "o recorte do grupo traz as soltas para a lista");
  assert.match(motor, /livreComVolume \? \{ declaredPrincipalId: livreComVolume \}/);
});

/* ------------------------------------------ 5 · contrato e catálogo */

test("5 · o contrato está escrito (spec, SDD) e o catálogo do MCP acompanha", () => {
  const spec = ler("../docs/04-arquiteto/spec.md");
  assert.match(spec, /Silo do plano: identidade = DNA do plano/);
  assert.match(ler("../docs/compartilhado/sdd-plano-declarado-e-grupos-2026-10-12.md"), /keyword do Silo é OPCIONAL/);
  const catalogo = ler("../lib/agent/platform-catalog.ts");
  // 2026-10-16 · restauração do fluxo de sempre: sem as rotas paralelas; a regra do Silo do plano continua escrita.
  assert.doesNotMatch(catalogo, /id: "arquiteto\.plan_silo"/);
  for (const rotas of catalogo.match(/routes: \[[^\]]*\]/g) ?? []) assert.doesNotMatch(rotas, /plan-silo\/consolidate|plan-silo\/editorial-line/, rotas);
  assert.match(catalogo, /Nunca converter artigo em Silo nem criar Silo paralelo/);
});
