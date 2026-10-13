import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { ArticleDNASchema } from "../lib/arquiteto/contracts.ts";
import {
  architectConvertedTitles,
  readArchitectSubjectStanding,
  readArchitectSubjectStandings,
  splitUngroupedBySubjectAnchor,
  subjectFormationSets,
  planSubjectAttachment,
} from "../lib/arquiteto/declared-subject.ts";
import { pendingSubjectConversions, reanchorSubjectOnArticleDna } from "../lib/arquiteto/subject-conversion.ts";
import { ATOR, MARCA, OUTRA_MARCA, linhaDaMesa } from "./arquiteto-assunto-fixtures.mts";

/*
 * CONVERSÃO DO ASSUNTO DO FORMATO ANTERIOR — LADO DO ARQUITETO (SDD
 * `docs/compartilhado/sdd-conversao-assunto-legado-2026-10-13.md` §6–§7).
 * Domínio puro: a linha-título T, a keyword K que passou a carregar o Assunto
 * e o artigo cujo `subject` ainda aponta para T. Sem rede, sem provider.
 */

const T = "6d5d87cd-3f0f-4431-bef4-81285715db0e";
const K = "3048743b-0000-4000-8000-000000000001";
const S = "258696eb-0000-4000-8000-000000000003";
const ARTIGO = T; // no formato anterior, o artigo nasceu com o id da linha-título
const TITULO = "Claro, Vivo ou TIM: qual internet residencial escolher?";
const GRUPO = "a9d5c87b-59aa-4e49-8357-3fa893d4cd2d";
const AT = "2026-10-13T12:00:00+00:00";

const declaradoAnterior = { keyword_subject: { declared: true, note: null, destinationUrl: null, destinationCheck: null }, keyword_subject_actor: ATOR, keyword_subject_at: AT, keyword_subject_origin: "import" };
const MEDIDA = { volume_measurement: { provider: "google_ads", averageMonthlySearches: 590, measuredAt: "2026-10-10T10:00:00+00:00" } };

function semanticaDeK(extra: Record<string, unknown> = {}) {
  return {
    ...MEDIDA,
    keyword_subject: {
      declared: true, note: null, destinationUrl: null, destinationCheck: null,
      entry: { title: TITULO, source: "cadastro" },
      plan: { groupId: GRUPO, planVersion: 1, order: 1, role: "Pilar", scope: "Comparar Claro, Vivo e TIM para internet residencial.", declaredPrincipal: { keywordId: K, phrase: "claro ou vivo" } },
    },
    keyword_subject_actor: ATOR, keyword_subject_at: AT, keyword_subject_origin: "import",
    keyword_declared_principal: { subjectKeywordId: K, groupId: GRUPO, planVersion: 1 },
    keyword_subject_conversion: { fromKeywordId: T, fromPhrase: TITULO, articleId: ARTIGO, convertedAt: AT, actorId: ATOR },
    ...extra,
  };
}

function referencia(keywordId: string, role: "principal" | "secundaria") {
  return {
    keywordId, keywordDnaVersionId: `legacy:dna-${keywordId}:v1`, keywordDnaContentHash: `legacy:dna-${keywordId}`,
    approvedPackageRef: { version: 1, contentHash: `pkg-${keywordId}-velho`, approvedAt: "2026-10-12T16:00:00+00:00" },
    role, strategicContribution: role === "principal" ? "Âncora de busca do artigo." : "Sustenta a narrativa.",
    coveredIntentions: ["comercial"], requiredTopics: [], excludedTopics: [], classificationOrigin: "human" as const, confidence: 0.8, humanConfirmed: true, volume: 590, resultCount: null, kgrScore: null,
  };
}

function artigo(extra: Record<string, unknown> = {}) {
  return ArticleDNASchema.parse({
    schemaVersion: 1, articleId: ARTIGO, brandId: MARCA, principalKeywordId: K, secondaryKeywordIds: [S], narrativeReinforcementIds: [],
    keywordReferences: [referencia(K, "principal"), referencia(S, "secundaria")],
    subject: { keywordId: T, approvedPackageRef: { version: 1, contentHash: `pkg-${T}-v1`, approvedAt: "2026-09-24T09:30:00+00:00" }, phrase: TITULO, note: null, destinationUrl: null, attachedBy: ATOR, attachedAt: "2026-10-12T17:00:00+00:00" },
    siloId: null, hierarchy: "Suporte", suggestedSlug: "claro-ou-vivo", canonical: null, mainIntent: "comercial", auxiliaryIntents: [], audience: "Famílias", problem: "Escolher a operadora",
    desiredResult: "Contratar bem", journeyStage: "MOFU", brandObjective: "Levar ao comparador", promise: "Cobrir com clareza o tema “claro ou vivo”.", angle: "Comparação", cta: "Comparar planos",
    coverage: ["operadoras de internet residencial"], excludedSubjects: [], antiCannibalizationBoundary: "Não trata de celular.", nearbyArticleIds: [], differentiation: [], entities: [], requiredTopics: [], questions: [], objections: [],
    evidenceNeeded: [], sourcesNeeded: [], internalLinks: [], alerts: [], confidence: 0.7, humanPendingDecisions: [],
    ...extra,
  });
}

const mesa = (kExtra: Record<string, unknown> = {}) => [
  linhaDaMesa({ id: T, keyword: TITULO, semantic: declaradoAnterior }),
  linhaDaMesa({ id: K, keyword: "claro ou vivo", semantic: semanticaDeK(kExtra), version: 2, contentHash: `pkg-${K}-v2` }),
  linhaDaMesa({ id: S, keyword: "vivo ou claro", semantic: { ...MEDIDA, subject_discovery: { subjectKeywordIds: [T] } } }),
];

const versao = (payload = artigo(), versionNumber = 3) => ({ entityId: ARTIGO, versionId: `v${versionNumber}`, versionNumber, contentHash: `sha256:${versionNumber}`, payload });

test("standings: a linha-título convertida deixa de ser Assunto (fora da formação); K lê a conversão do PACOTE; sem conversão, nada muda", () => {
  const linhas = mesa();
  const standings = readArchitectSubjectStandings(linhas);
  const t = standings.get(T)!;
  assert.equal(t.declared, false);
  assert.equal(t.heldOutOfFormation, true);
  assert.deepEqual(t.convertedTo, { keywordId: K, phrase: TITULO, articleId: ARTIGO });
  assert.equal(standings.get(K)!.conversion?.fromKeywordId, T);
  assert.equal(standings.get(K)!.carriesSubject, true);
  assert.ok(subjectFormationSets({ keywords: linhas, articles: [] }).heldOut.has(T));
  // Sem conversão: o standing é byte a byte o de readArchitectSubjectStanding (nenhum campo novo).
  const semConversao = [linhaDaMesa({ id: T, keyword: TITULO, semantic: declaradoAnterior }), linhaDaMesa({ id: S, keyword: "vivo ou claro", semantic: MEDIDA })];
  for (const linha of semConversao) assert.equal(JSON.stringify(readArchitectSubjectStandings(semConversao).get(linha.id)), JSON.stringify(readArchitectSubjectStanding(linha)));
  // A conversão só vale quando K chegou ao Arquiteto com o pacote novo.
  const naoEnviada = [linhaDaMesa({ id: T, keyword: TITULO, semantic: declaradoAnterior }), linhaDaMesa({ id: K, keyword: "claro ou vivo", semantic: semanticaDeK(), received: false })];
  assert.equal(architectConvertedTitles(readArchitectSubjectStandings(naoEnviada).values()).size, 0);
  // Outra marca nunca converte a linha desta.
  const cruzada = [linhaDaMesa({ id: T, keyword: TITULO, semantic: declaradoAnterior }), linhaDaMesa({ id: K, keyword: "claro ou vivo", semantic: semanticaDeK(), brandId: OUTRA_MARCA })];
  assert.equal(readArchitectSubjectStandings(cruzada).get(T)!.declared, true);
});

test("não agrupadas: a linha-título convertida fica na lista com o selo próprio — nunca some", () => {
  const standings = readArchitectSubjectStandings(mesa());
  const vista = splitUngroupedBySubjectAnchor({ ungroupedKeywordIds: [T], articles: [], isDeclaredSubject: id => standings.get(id)?.declared === true, convertedTitleOf: id => standings.get(id)?.convertedTo ?? null });
  assert.equal(vista.ungrouped.length, 1);
  assert.match(String(vista.ungrouped[0].label), /Linha-título convertida → .* · não forma artigo/);
});

test("lista do Assunto: as sustentações ligadas à linha-título valem para a keyword que agora carrega o Assunto (alias)", async () => {
  const { suggestSubjectSupport } = await import("../lib/arquiteto/declared-subject.ts");
  const linhas = mesa();
  const sugestoes = suggestSubjectSupport({ brandId: MARCA, subjectKeyword: linhas[1], keywords: linhas });
  assert.ok(sugestoes.some(item => item.keywordId === S && item.signals.includes("subject_discovery")), JSON.stringify(sugestoes.map(item => [item.keywordId, item.signals])));
  assert.equal(sugestoes.some(item => item.keywordId === T), false, "a linha-título não vira sustentação");
});

test("reanchor: uma versão só troca T por K, atualiza o pacote de K, aplica o plano; principal, slug e keywords iguais", () => {
  const plano = planSubjectAttachment({ brandId: MARCA, keyword: mesa()[1], actorUserId: ATOR, attachedAt: AT, target: { principalKeywordId: K } });
  assert.ok(plano.ok, plano.ok ? "" : plano.reason);
  const standing = readArchitectSubjectStandings(mesa()).get(K)!;
  const troca = reanchorSubjectOnArticleDna(artigo(), { fromKeywordId: T, subject: plano.subject, standing });
  assert.ok(troca.ok, troca.ok ? "" : troca.reason);
  assert.equal(troca.changed, true);
  assert.equal(troca.value.subject?.keywordId, K);
  assert.equal(troca.value.subject?.phrase, TITULO, "o título do Assunto é o mesmo texto: Radar e Redator leem a mesma frase");
  assert.equal(troca.value.principalKeywordId, K);
  assert.equal(troca.value.suggestedSlug, "claro-ou-vivo");
  assert.deepEqual(troca.value.secondaryKeywordIds, [S]);
  assert.equal(troca.value.hierarchy, "Pilar", "papel do plano");
  assert.equal(troca.value.promise, "Comparar Claro, Vivo e TIM para internet residencial.");
  assert.deepEqual(troca.value.keywordReferences.find(item => item.keywordId === K)?.approvedPackageRef, plano.subject.approvedPackageRef);
  assert.deepEqual(troca.value.keywordReferences.find(item => item.keywordId === S), artigo().keywordReferences.find(item => item.keywordId === S));
  assert.ok(ArticleDNASchema.parse(JSON.parse(JSON.stringify(troca.value))));
  // Idempotente.
  const denovo = reanchorSubjectOnArticleDna(troca.value, { fromKeywordId: T, subject: { ...plano.subject, attachedAt: "2026-10-14T00:00:00+00:00" }, standing });
  assert.ok(denovo.ok && !denovo.changed);
  // Recusas: K secundária; Assunto vigente que não é a linha-título.
  const comoSecundaria = reanchorSubjectOnArticleDna(artigo({ principalKeywordId: S, secondaryKeywordIds: [K], keywordReferences: [referencia(S, "principal"), referencia(K, "secundaria")] }), { fromKeywordId: T, subject: plano.subject, standing });
  assert.equal(comoSecundaria.ok, false);
  const outro = reanchorSubjectOnArticleDna(artigo({ subject: { ...artigo().subject!, keywordId: "ffffffff-0000-4000-8000-00000000000f" } }), { fromKeywordId: T, subject: plano.subject, standing });
  assert.equal(outro.ok, false);
});

test("pendências: o artigo vigente com Assunto na linha-título aparece pronto; convertido, sai; de outra marca, nunca entra", () => {
  const pendentes = pendingSubjectConversions({ brandId: MARCA, actorUserId: ATOR, attachedAt: AT, articles: [versao()], keywords: mesa() });
  assert.equal(pendentes.length, 1);
  assert.equal(pendentes[0].state, "ready", String(pendentes[0].reason));
  assert.equal(pendentes[0].fromKeywordId, T);
  assert.equal(pendentes[0].toKeywordId, K);
  assert.equal(pendentes[0].versionNumber, 3);
  assert.ok(pendentes[0].changes.some(change => /Papel: Suporte → Pilar/.test(change)));
  const convertido = versao(pendentes[0].next!, 4);
  assert.equal(pendingSubjectConversions({ brandId: MARCA, actorUserId: ATOR, attachedAt: AT, articles: [convertido], keywords: mesa() }).length, 0, "depois da versão nova não há pendência");
  assert.equal(pendingSubjectConversions({ brandId: OUTRA_MARCA, actorUserId: ATOR, attachedAt: AT, articles: [versao()], keywords: mesa() }).length, 0);
  // K ainda sem pacote aprovado novo (não enviada): nada a fazer no Arquiteto.
  const semEnvio = [mesa()[0], linhaDaMesa({ id: K, keyword: "claro ou vivo", semantic: { ...MEDIDA }, version: 1 })];
  assert.equal(pendingSubjectConversions({ brandId: MARCA, actorUserId: ATOR, attachedAt: AT, articles: [versao()], keywords: semEnvio }).length, 0);
});

function semComentarios(fonte: string) {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

test("servidor e rota: o writer e as guardas de sempre, decisionHash, releitura; a melhoria espera a atualização (nunca um 2º artigo)", () => {
  const servidor = semComentarios(readFileSync(new URL("../lib/server/arquiteto-subject-conversion.ts", import.meta.url), "utf8"));
  assert.match(servidor, /appendArquitetoArtifact\(aprovar, "article_dna", version, "approved"\)/);
  assert.match(servidor, /articleApprovalRevalidationIssues\(/);
  assert.match(servidor, /STALE_DECISION/);
  assert.match(servidor, /loadCanonicalArquitetoWorkspace\(context, \{ keywordDetail: "full" \}\)/);
  assert.doesNotMatch(servidor, /\.delete\(|lifecycle_delete/);
  const rota = semComentarios(readFileSync(new URL("../app/api/arquiteto/subject-conversion/route.ts", import.meta.url), "utf8"));
  assert.match(rota, /action: "approve"/);
  assert.match(rota, /handleArticleSubjectConversion\(context/);
  const melhoria = semComentarios(readFileSync(new URL("../lib/server/arquiteto-article-improvement.ts", import.meta.url), "utf8"));
  assert.match(melhoria, /readArchitectSubjectStandings\(rows\.values\(\)\)/);
  assert.match(melhoria, /aguarda “Atualizar o Assunto do artigo”/);
});
