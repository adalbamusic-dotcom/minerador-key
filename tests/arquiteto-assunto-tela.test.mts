/**
 * F2 · FASE B · TELA — o Assunto na mesa do Arquiteto (SDD
 * `docs/compartilhado/sdd-assunto-tronco-editorial-2026-09-24.md`, F2.2 a F2.4).
 *
 * Duas metades:
 *   1. o modelo puro da tela (`modules/arquiteto/subject-workspace-model.ts`),
 *      com as fixtures do domínio e sem rede;
 *   2. a estrutura dos componentes e da fiação, lida como texto SEM
 *      comentários (um comentário que cita o código casaria com a busca).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import {
  attachedSubjectWarning,
  buildSubjectFilterEntries,
  filterBySubject,
  heldOutSubjectIds,
  groupAutomaticSubjectSupports,
  liveWorkingSubjectAnchors,
  migrateWorkingSubjectAnchors,
  planSubjectSupportFormation,
  readSubjectStandings,
  siloSubjectTerritories,
  subjectAttachOptions,
  subjectUnitLabel,
  workingSubjectCarriers,
  SUBJECT_ONE_PER_UNIT,
  SUBJECT_PHRASE_SERP_HINT,
  SUBJECT_SILO_PAGE_GUARD,
  SUBJECT_SUPPORT_PRINCIPAL_HINT,
  SUBJECT_WITHDRAWN_LABEL,
} from "../modules/arquiteto/subject-workspace-model.ts";
import { planSubjectAttachment, splitUngroupedBySubjectAnchor, SUBJECT_ANOTHER_ATTACHED_REASON, SUBJECT_AWAITING_SUPPORT_LABEL, type SubjectSupportSuggestion } from "../lib/arquiteto/declared-subject.ts";
import { buildArticleFormationUniverse, suggestPrincipal } from "../lib/arquiteto/article-formation.ts";
import { planKeywordRole } from "../lib/arquiteto/article-formation-editing.ts";
import { findVisualViolations } from "../scripts/check-visual-system.mjs";
import {
  ASSUNTO_FRASE,
  ASSUNTO_ID,
  ATOR,
  MARCA,
  OUTRA_MARCA,
  SILO_REF,
  VOLUME_VALIDADO,
  declarado,
  formacaoDeReferencia,
  kwFormacao,
  linhaDaMesa,
  logica,
} from "./arquiteto-assunto-fixtures.mts";

let chamadasDeRede = 0;
globalThis.fetch = (async () => {
  chamadasDeRede += 1;
  throw new Error("Rede proibida nos testes da tela do Assunto.");
}) as typeof fetch;

const AGORA = "2026-09-24T12:00:00+00:00";

const semComentarios = (fonte: string) => fonte
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

const lerSemComentarios = (caminho: string) => semComentarios(readFileSync(caminho, "utf8"));

const assuntoD2 = () => linhaDaMesa({ id: ASSUNTO_ID, keyword: ASSUNTO_FRASE, semantic: { ...declarado(), ...logica({ entity: "marketing para clínicas" }) } });
const assuntoComVolume = () => linhaDaMesa({ id: ASSUNTO_ID, keyword: ASSUNTO_FRASE, semantic: { ...declarado(), ...VOLUME_VALIDADO } });

/* ============================ modelo da tela ============================ */

test("filtro Assuntos: aguardando sustentação, tronco de N, isolamento de marca e retirado no Minerador", () => {
  const keywords = [
    assuntoD2(),
    linhaDaMesa({ id: "a2", keyword: "marketing odontologico", semantic: declarado("Tronco de odontologia.") }),
    linhaDaMesa({ id: "a3", keyword: "gestao de consultorio", semantic: declarado("Outra marca."), brandId: OUTRA_MARCA }),
    linhaDaMesa({ id: "a4", keyword: "agenda de clinica", semantic: declarado("Não recebido."), received: false }),
    linhaDaMesa({ id: "a5", keyword: "atendimento humanizado", semantic: logica({ entity: "atendimento" }) }),
    linhaDaMesa({ id: "comum", keyword: "google meu negocio", semantic: VOLUME_VALIDADO }),
  ];
  const standings = readSubjectStandings(keywords);
  const anchors = [
    { subject: { keywordId: "a2" } },
    { subjectKeywordId: "a2" },
    { subjectKeywordId: "a5" },
  ];
  const entries = buildSubjectFilterEntries({ brandId: MARCA, standings, anchors });

  assert.deepEqual(entries.map(entry => entry.keywordId), ["a5", "a2", ASSUNTO_ID]);
  const porId = new Map(entries.map(entry => [entry.keywordId, entry]));

  assert.equal(porId.get(ASSUNTO_ID)!.label, SUBJECT_AWAITING_SUPPORT_LABEL);
  assert.equal(porId.get(ASSUNTO_ID)!.articleCount, 0);
  assert.equal(porId.get(ASSUNTO_ID)!.attachable, true);
  assert.equal(porId.get(ASSUNTO_ID)!.volumeValidated, false);

  assert.equal(porId.get("a2")!.label, "Assunto · tronco de 2 artigos");
  assert.equal(porId.get("a2")!.articleCount, 2);

  assert.equal(porId.get("a5")!.label, SUBJECT_WITHDRAWN_LABEL, "retirado continua listado enquanto estiver preso");
  assert.equal(porId.get("a5")!.withdrawn, true);
  assert.equal(porId.get("a5")!.attachable, false);

  assert.ok(!porId.has("a3"), "Assunto de outra marca não aparece");
  assert.ok(!porId.has("a4"), "Assunto que não chegou ao Arquiteto não aparece");
  assert.ok(!porId.has("comum"), "keyword comum não é Assunto");

  assert.deepEqual(buildSubjectFilterEntries({ brandId: OUTRA_MARCA, standings, anchors: [] }).map(entry => entry.keywordId), ["a3"], "cada marca vê só os próprios Assuntos");
});

test("vínculo da formação desta sessão: quem já tem Definição responde por ela, e ref velho não ancora", () => {
  const workingAnchors = new Map([["article-formation:a", ASSUNTO_ID], ["article-candidate:x:k1", ASSUNTO_ID], ["article-candidate:x:sumiu", ASSUNTO_ID]]);
  const liveCandidates = new Map([["article-formation:a", "p1"], ["article-candidate:x:k1", "k1"]]);
  const carriers = workingSubjectCarriers({ workingAnchors, materializedRefs: new Set(["article-candidate:x:k1"]), liveCandidates });
  assert.deepEqual(carriers, [{ subjectKeywordId: ASSUNTO_ID, principalKeywordId: "p1" }]);
  assert.deepEqual([...liveWorkingSubjectAnchors({ workingAnchors, liveCandidates }).keys()], ["article-formation:a", "article-candidate:x:k1"]);

  const orfao = workingSubjectCarriers({ workingAnchors: new Map([["formation:fantasma", ASSUNTO_ID]]), materializedRefs: new Set(), liveCandidates });
  assert.deepEqual(orfao, []);
  const mesa = splitUngroupedBySubjectAnchor({ ungroupedKeywordIds: [ASSUNTO_ID], articles: orfao, isDeclaredSubject: () => true });
  assert.deepEqual(mesa.ungrouped, [{ keywordId: ASSUNTO_ID, label: SUBJECT_AWAITING_SUPPORT_LABEL }], "vínculo órfão: aguardando sustentação, nunca tronco sem artigo");
  assert.deepEqual(mesa.anchored, []);
});

test("prender em candidato calculado e revisar a formação: o Assunto acompanha o artigo ou volta a aguardar", () => {
  const refCalculado = `article-candidate:${SILO_REF}:k5`;
  const keywords = [...formacaoDeReferencia().keywords, kwFormacao(ASSUNTO_ID, ASSUNTO_FRASE, { subjectHeldOut: true })];
  const itens = keywords.map(keyword => ({ keywordId: keyword.keywordId, workflowItemId: `wf-${keyword.keywordId}`, lockVersion: 1 }));
  const entrada = { ...formacaoDeReferencia(), groups: [], keywords };
  const antes = buildArticleFormationUniverse({ ...entrada, subjectByCandidateRef: new Map([[refCalculado, ASSUNTO_ID]]) });
  assert.equal(antes.candidates.find(candidate => candidate.candidateRef === refCalculado)!.subjectKeywordId, ASSUNTO_ID);

  const plano = planKeywordRole({ universe: antes, keywords: itens, candidateRef: refCalculado, keywordId: "k6", role: "secundaria", mintUuid: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d", decidedAt: AGORA });
  assert.equal(plano.refusals.length, 0);
  const novoRef = plano.patches[0].assignment.articleFormationRef;
  assert.notEqual(novoRef, refCalculado, "a primeira decisão humana troca o ref do candidato calculado");

  const depoisDasDecisoes = keywords.map(keyword => {
    const patch = plano.patches.find(item => item.keywordId === keyword.keywordId);
    return patch ? { ...keyword, humanFormationRef: patch.assignment.articleFormationRef, humanRole: patch.assignment.articleFormationDecision.role } : keyword;
  });
  const candidatosAntes = antes.candidates.map(candidate => ({ candidateRef: candidate.candidateRef, principalKeywordId: candidate.principalKeywordId, keywordIds: candidate.keywords.map(item => item.keywordId) }));
  const migrado = migrateWorkingSubjectAnchors({ anchors: new Map([[refCalculado, ASSUNTO_ID]]), candidates: candidatosAntes, patches: plano.patches });
  assert.deepEqual([...migrado], [[novoRef, ASSUNTO_ID]]);

  for (const [anchors, esperado] of [[migrado, "tronco"], [new Map([[refCalculado, ASSUNTO_ID]]), "aguardando"]] as const) {
    const depois = buildArticleFormationUniverse({ ...entrada, keywords: depoisDasDecisoes, subjectByCandidateRef: anchors });
    const vivos = new Map(depois.candidates.map(candidate => [candidate.candidateRef, candidate.principalKeywordId]));
    const carriers = workingSubjectCarriers({ workingAnchors: anchors, materializedRefs: new Set(), liveCandidates: vivos });
    const mesa = splitUngroupedBySubjectAnchor({ ungroupedKeywordIds: [ASSUNTO_ID], articles: carriers, isDeclaredSubject: () => true });
    if (esperado === "tronco") {
      assert.equal(depois.candidates.find(candidate => candidate.candidateRef === novoRef)!.subjectKeywordId, ASSUNTO_ID, "continua preso ao mesmo artigo");
      assert.deepEqual(mesa.anchored.map(item => item.label), ["Assunto · tronco de 1 artigo"]);
      assert.deepEqual(depois.anchoredSubjectKeywordIds, [ASSUNTO_ID]);
    } else {
      assert.deepEqual(mesa.anchored, [], "sem migrar, o ref velho não ancora");
      assert.deepEqual(mesa.ungrouped, [{ keywordId: ASSUNTO_ID, label: SUBJECT_AWAITING_SUPPORT_LABEL }]);
      assert.ok(depois.ungroupedKeywordIds.includes(ASSUNTO_ID));
      assert.deepEqual(depois.awaitingSupportSubjectKeywordIds, [ASSUNTO_ID]);
    }
  }
});

test("migração do vínculo: maioria dos membros, empate pela principal, destino ocupado ou reservado não troca Assunto", () => {
  const candidatos = [
    { candidateRef: "c:a", principalKeywordId: "a1", keywordIds: ["a1", "a2", "a3"] },
    { candidateRef: "c:b", principalKeywordId: "b1", keywordIds: ["b1", "b2"] },
    { candidateRef: "c:c", principalKeywordId: "c1", keywordIds: ["c1", "c2", "c3"] },
  ];
  const patch = (keywordId: string, ref: string) => ({ keywordId, assignment: { articleFormationRef: ref } });

  const movida = migrateWorkingSubjectAnchors({ anchors: new Map([["c:a", "S"]]), candidates: candidatos, patches: [patch("a3", "f:outro")] });
  assert.deepEqual([...movida], [["c:a", "S"]], "uma keyword saiu: o artigo continua no ref de antes");

  const separada = migrateWorkingSubjectAnchors({ anchors: new Map([["c:b", "S"]]), candidates: candidatos, patches: [patch("b1", "f:fica"), patch("b2", "f:novo")] });
  assert.deepEqual([...separada], [["f:fica", "S"]], "empate: vai com a principal");

  const juntada = migrateWorkingSubjectAnchors({ anchors: new Map([["c:c", "S"]]), candidates: candidatos, patches: ["a1", "a2", "a3", "c1", "c2", "c3"].map(id => patch(id, "f:junto")) });
  assert.deepEqual([...juntada], [["f:junto", "S"]]);

  const ocupado = migrateWorkingSubjectAnchors({ anchors: new Map([["c:a", "S"], ["c:c", "T"]]), candidates: candidatos, patches: ["a1", "a2", "a3", "c1", "c2", "c3"].map(id => patch(id, "c:a")) });
  assert.deepEqual([...ocupado].sort(), [["c:a", "S"], ["c:c", "T"]], "destino com outro Assunto: nada troca sozinho");

  const reservado = migrateWorkingSubjectAnchors({ anchors: new Map([["c:c", "T"]]), candidates: candidatos, patches: ["c1", "c2", "c3"].map(id => patch(id, "f:novo")), reservedRefs: new Set(["f:novo"]) });
  assert.deepEqual([...reservado], [["c:c", "T"]], "ref reservado ao Assunto da própria ação");
});

test("Silo com Assunto: o território vem da Arquitetura consolidada ou dos artigos que a revisão de Silos referencia", () => {
  const plano = planSubjectAttachment({ brandId: MARCA, keyword: assuntoD2(), actorUserId: ATOR, attachedAt: AGORA });
  assert.ok(plano.ok);
  const territorioDoArtigo = new Map([["art-1", SILO_REF], ["art-2", SILO_REF], ["art-3", "territory:outro"], ["art-4", "territory:outro"]]);
  const mapa = siloSubjectTerritories({
    silos: [
      { siloId: "silo-consolidado", name: "Consolidado", territoryRef: "territory:consolidado", subject: plano.subject },
      { siloId: "silo-ambiguo", name: "Misto", articleReferences: [{ articleId: "art-2" }, { articleId: "art-3" }], subject: plano.subject },
      { siloId: "silo-revisao", name: "Clínicas", territoryRef: null, articleReferences: [{ articleId: "art-1" }, { articleId: "art-2" }], subject: plano.subject },
      { siloId: "silo-sem-assunto", territoryRef: "territory:outro", articleReferences: [{ articleId: "art-4" }], subject: null },
    ],
    articleTerritoryOf: articleId => territorioDoArtigo.get(articleId) ?? null,
  });
  assert.deepEqual([...mapa.keys()].sort(), [SILO_REF, "territory:consolidado"].sort());
  assert.equal(mapa.get(SILO_REF)!.siloId, "silo-revisao", "SiloDNA sem territoryRef ainda sugere, pelos artigos dele");
  assert.equal(mapa.get(SILO_REF)!.subject.keywordId, ASSUNTO_ID);

  const universo = buildArticleFormationUniverse({ ...formacaoDeReferencia(), siloSubjectKeywordId: mapa.get(SILO_REF)!.subject.keywordId });
  assert.ok(universo.candidates.length > 0);
  assert.ok(universo.candidates.every(candidate => candidate.suggestedSubjectKeywordId === ASSUNTO_ID), "cada artigo do território recebe a sugestão");
  assert.ok(universo.candidates.every(candidate => candidate.subjectKeywordId === undefined), "sugestão não prende");
});

test("retidos lidos uma vez pelo domínio, e uma unidade com outro Assunto dá a recusa do domínio", () => {
  const standings = readSubjectStandings([assuntoD2(), linhaDaMesa({ id: "comum", keyword: "google meu negocio", semantic: VOLUME_VALIDADO })]);
  assert.deepEqual([...heldOutSubjectIds(standings)], [ASSUNTO_ID]);
  assert.deepEqual([...heldOutSubjectIds(readSubjectStandings([assuntoComVolume()]))], [], "com Volume validado, não fica retido");
  assert.equal(SUBJECT_ONE_PER_UNIT, SUBJECT_ANOTHER_ATTACHED_REASON);
});

test("filtro por Assunto: sem filtro a lista volta intacta; com filtro, só quem ele sustenta", () => {
  const artigos = [{ id: "1", assunto: ASSUNTO_ID }, { id: "2", assunto: null }, { id: "3", assunto: "outro" }];
  assert.deepEqual(filterBySubject(artigos, null, artigo => artigo.assunto), artigos);
  assert.notEqual(filterBySubject(artigos, null, artigo => artigo.assunto), artigos);
  assert.deepEqual(filterBySubject(artigos, ASSUNTO_ID, artigo => artigo.assunto).map(artigo => artigo.id), ["1"]);
});

test("prender: a recusa de cada unidade é a do domínio, e landing e serviço são unidades do ArticleDNA", () => {
  const opcoes = subjectAttachOptions({
    brandId: MARCA,
    subjectKeyword: assuntoD2(),
    actorUserId: ATOR,
    attachedAt: AGORA,
    targets: [
      { ref: "livre", kind: "article", label: "atrair pacientes", unitType: "article", principalKeywordId: "p1", keywords: [{ keywordId: "p1", role: "principal" }], currentSubjectKeywordId: null, persisted: true },
      { ref: "landing", kind: "article", label: "seo clinicas landing", unitType: "landing_page", principalKeywordId: "p2", currentSubjectKeywordId: null, persisted: false },
      { ref: "servico", kind: "article", label: "consultoria", unitType: "service_page", principalKeywordId: "p3", currentSubjectKeywordId: ASSUNTO_ID, persisted: true },
      { ref: "apoio", kind: "article", label: "apoio", principalKeywordId: "p4", keywords: [{ keywordId: ASSUNTO_ID, role: "secundaria" }], currentSubjectKeywordId: null, persisted: true },
      { ref: "principal", kind: "article", label: "principal sem volume", principalKeywordId: ASSUNTO_ID, currentSubjectKeywordId: null, persisted: true },
      { ref: "excluido", kind: "article", label: "excluído", principalKeywordId: "p5", excludedSubjects: ["seo para clinicas"], currentSubjectKeywordId: null, persisted: true },
      { ref: "outro", kind: "article", label: "outro tronco", principalKeywordId: "p6", currentSubjectKeywordId: "outro-assunto", persisted: true },
      { ref: "silo-com-pagina", kind: "silo", label: "Marketing", principalKeywordId: null, currentSubjectKeywordId: null, blockedReason: SUBJECT_SILO_PAGE_GUARD, persisted: true },
      { ref: "silo-livre", kind: "silo", label: "Clínicas", principalKeywordId: null, currentSubjectKeywordId: null, persisted: true },
    ],
  });
  const porRef = new Map(opcoes.map(opcao => [opcao.ref, opcao]));

  assert.equal(porRef.get("livre")!.refusal, null);
  assert.equal(porRef.get("livre")!.unitLabel, "Artigo");
  assert.equal(porRef.get("landing")!.refusal, null);
  assert.equal(porRef.get("landing")!.unitLabel, "Landing page");
  assert.equal(porRef.get("landing")!.persisted, false);
  assert.equal(porRef.get("servico")!.unitLabel, "Página de serviço");
  assert.equal(porRef.get("servico")!.alreadyAttached, true);
  assert.equal(porRef.get("servico")!.refusal, null);
  assert.match(porRef.get("apoio")!.refusal!, /não pode ser secundária nem reforço/);
  assert.match(porRef.get("principal")!.refusal!, /Volume validado/);
  assert.match(porRef.get("excluido")!.refusal!, /temas excluídos/);
  assert.equal(porRef.get("outro")!.refusal, SUBJECT_ONE_PER_UNIT);
  assert.equal(porRef.get("silo-com-pagina")!.refusal, SUBJECT_SILO_PAGE_GUARD);
  assert.equal(porRef.get("silo-livre")!.refusal, null);
  assert.equal(porRef.get("silo-livre")!.unitLabel, "Silo");

  const esperado = planSubjectAttachment({ brandId: MARCA, keyword: assuntoD2(), actorUserId: ATOR, attachedAt: AGORA, target: { principalKeywordId: "p4", keywords: [{ keywordId: ASSUNTO_ID, role: "secundaria" }] } });
  assert.equal(esperado.ok, false);
  assert.equal(porRef.get("apoio")!.refusal, esperado.ok ? null : esperado.reason, "a tela repete o motivo do domínio, sem reescrever");

  const comVolume = subjectAttachOptions({
    brandId: MARCA, subjectKeyword: assuntoComVolume(), actorUserId: ATOR, attachedAt: AGORA,
    targets: [{ ref: "principal", kind: "article", label: "principal com volume", principalKeywordId: ASSUNTO_ID, currentSubjectKeywordId: null, persisted: true }],
  });
  assert.equal(comVolume[0].refusal, null, "Q7: com Volume validado o Assunto pode ser a própria principal");
});

test("prender sem sessão ou em outra marca é recusado; a IA nunca prende", () => {
  const semAtor = subjectAttachOptions({
    brandId: MARCA, subjectKeyword: assuntoD2(), actorUserId: null, attachedAt: AGORA,
    targets: [{ ref: "a", kind: "article", label: "a", principalKeywordId: "p", currentSubjectKeywordId: null, persisted: true }],
  });
  assert.match(semAtor[0].refusal!, /ato humano/);

  const outraMarca = subjectAttachOptions({
    brandId: OUTRA_MARCA, subjectKeyword: assuntoD2(), actorUserId: ATOR, attachedAt: AGORA,
    targets: [{ ref: "a", kind: "article", label: "a", principalKeywordId: "p", currentSubjectKeywordId: null, persisted: true }],
  });
  assert.match(outraMarca[0].refusal!, /outra marca/);

  const ia = subjectAttachOptions({
    brandId: MARCA, subjectKeyword: assuntoD2(), actorUserId: "ia-proposta", attachedAt: AGORA,
    targets: [{ ref: "a", kind: "article", label: "a", principalKeywordId: "p", currentSubjectKeywordId: null, persisted: true }],
  });
  assert.match(ia[0].refusal!, /ato humano/);
});

test("aviso do Assunto preso: retirado no Minerador avisa e não troca nada", () => {
  const retirado = linhaDaMesa({ id: ASSUNTO_ID, keyword: ASSUNTO_FRASE, semantic: logica({ entity: "marketing" }) });
  const naSessao = attachedSubjectWarning({ subject: null, subjectKeywordId: ASSUNTO_ID, keyword: retirado });
  assert.equal(naSessao.state, "withdrawn");
  assert.match(naSessao.warning!, /retirou a declaração/);

  const plano = planSubjectAttachment({ brandId: MARCA, keyword: assuntoD2(), actorUserId: ATOR, attachedAt: AGORA });
  assert.ok(plano.ok);
  const gravado = attachedSubjectWarning({ subject: plano.subject, subjectKeywordId: ASSUNTO_ID, keyword: retirado });
  assert.equal(gravado.state, "withdrawn");
  assert.match(gravado.warning!, /nada foi trocado/);

  assert.deepEqual(attachedSubjectWarning({ subject: plano.subject, subjectKeywordId: ASSUNTO_ID, keyword: assuntoD2() }), { state: "current", warning: null });
  assert.equal(attachedSubjectWarning({ subject: null, subjectKeywordId: ASSUNTO_ID, keyword: null }).state, "not_in_mesa");
});

test("sustentação marcada vira artigo: principal entre as marcadas pela regra atual, Assunto fora dos membros", () => {
  const marcadas = [
    kwFormacao("s1", "atrair pacientes estetica", { volume: 90 }),
    kwFormacao("s2", "agendamento online consultorio", { volume: 480 }),
    kwFormacao("s3", "google meu negocio consultorio", { volume: 260 }),
  ];
  const itens = marcadas.map(keyword => ({ keywordId: keyword.keywordId, workflowItemId: `wf-${keyword.keywordId}`, lockVersion: 3 }));
  const plano = planSubjectSupportFormation({
    subjectKeywordId: ASSUNTO_ID,
    marked: marcadas,
    siloRefOf: () => SILO_REF,
    keywords: itens,
    mintUuid: "5f4e3d2c-1b0a-4987-8654-3210fedcba98",
    decidedAt: AGORA,
  });
  assert.ok(plano.ok);
  const regraAtual = suggestPrincipal({ keywords: marcadas });
  assert.equal(plano.principalKeywordId, regraAtual!.keywordId);
  assert.equal(plano.siloRef, SILO_REF);
  assert.match(plano.formationRef, /^article-formation:/);
  assert.deepEqual(plano.patches.map(patch => patch.keywordId).sort(), ["s1", "s2", "s3"]);
  assert.ok(!plano.patches.some(patch => patch.keywordId === ASSUNTO_ID), "o Assunto é tronco, não membro");
  assert.equal(plano.patches.filter(patch => patch.assignment.articleFormationDecision.role === "principal").length, 1);
  for (const patch of plano.patches) {
    assert.equal(patch.assignment.articleFormationRef, plano.formationRef);
    assert.equal(patch.assignment.articleFormationDecision.source, "human");
    assert.equal(patch.expectedLock, 3);
  }

  const automatico = planSubjectSupportFormation({
    subjectKeywordId: ASSUNTO_ID,
    marked: [kwFormacao("s1", "atrair pacientes estetica", { volume: 900 }), kwFormacao("s2", "agendamento online consultorio", { volume: 25 })],
    siloRefOf: () => SILO_REF,
    keywords: ["s1", "s2"].map(keywordId => ({ keywordId, workflowItemId: `wf-${keywordId}`, lockVersion: 3 })),
    principalKeywordIds: new Set(["s2"]),
    mintUuid: "5f4e3d2c-1b0a-4987-8654-3210fedcba98",
    decidedAt: AGORA,
    source: "system",
  });
  assert.ok(automatico.ok);
  assert.equal(automatico.principalKeywordId, "s2", "o lote automático só elege entre volumes validados");
  assert.ok(automatico.patches.every(patch => patch.assignment.articleFormationDecision.source === "system"));
});

test("lote automático divide por Silo e intenção, respeita seis e não perde termos sem Principal", () => {
  const suggestion = (keywordId: string, extra: Partial<SubjectSupportSuggestion> = {}): SubjectSupportSuggestion => ({
    keywordId,
    keyword: `keyword ${keywordId}`,
    signals: ["subject_phrase_terms"],
    reason: "termos em comum",
    discoveryEvidence: [],
    sharedNoteTerms: [],
    sharedSubjectTerms: ["clinica", "paciente"],
    automaticEligible: true,
    alreadyInArticle: false,
    ...extra,
  });
  const suggestions = ["a1", "a2", "a3", "a4", "a5", "a6", "a7", "b1", "c1", "x1"].map(keywordId => suggestion(keywordId));
  const silos = new Map(suggestions.map(item => [item.keywordId, item.keywordId.startsWith("b") ? "silo-b" : item.keywordId.startsWith("c") ? "silo-a" : "silo-a"]));
  const intents = new Map(suggestions.map(item => [item.keywordId, item.keywordId.startsWith("b") ? "Comercial" : item.keywordId.startsWith("c") ? "Transacional" : "Informativa"]));
  const grouped = groupAutomaticSubjectSupports({
    suggestions,
    siloRefByKeywordId: silos,
    intentByKeywordId: intents,
    principalEligibleKeywordIds: new Set(["a1", "a7", "b1", "c1"]),
    excludedKeywordIds: new Set(["x1"]),
  });
  assert.deepEqual(grouped.batches.map(batch => [batch.siloRef, batch.intentKey, batch.suggestions.map(item => item.keywordId)]), [
    ["silo-a", "informativa", ["a1", "a2", "a3", "a4", "a5", "a6"]],
    ["silo-a", "informativa", ["a7"]],
    ["silo-b", "comercial", ["b1"]],
    ["silo-a", "transacional", ["c1"]],
  ]);
  assert.deepEqual(grouped.withoutPrincipal, []);
  const unformable = groupAutomaticSubjectSupports({
    suggestions: [suggestion("no-volume")],
    siloRefByKeywordId: new Map([["no-volume", "silo-a"]]),
    intentByKeywordId: new Map([["no-volume", null]]),
    principalEligibleKeywordIds: new Set(),
  });
  assert.deepEqual(unformable.batches, []);
  assert.deepEqual(unformable.withoutPrincipal.map(item => item.keywordId), ["no-volume"]);
  assert.equal(groupAutomaticSubjectSupports({
    suggestions: [suggestion("unconfirmed")],
    siloRefByKeywordId: new Map([["unconfirmed", null]]),
    intentByKeywordId: new Map(),
    principalEligibleKeywordIds: new Set(["unconfirmed"]),
  }).batches.length, 0, "Silo não confirmado nunca vira pai do artigo");
});

test("sustentação: recusas antes de gravar", () => {
  const base = {
    subjectKeywordId: ASSUNTO_ID,
    siloRefOf: () => SILO_REF as string | null,
    keywords: ["s1", "s2", "s3", "s4", "s5", "s6", "s7", ASSUNTO_ID].map(id => ({ keywordId: id, workflowItemId: `wf-${id}`, lockVersion: 1 })),
    mintUuid: "5f4e3d2c-1b0a-4987-8654-3210fedcba98",
    decidedAt: AGORA,
  };
  const kw = (id: string, extra: Record<string, unknown> = {}) => kwFormacao(id, `busca ${id}`, extra);

  const nada = planSubjectSupportFormation({ ...base, marked: [] });
  assert.equal(nada.ok ? null : nada.code, "NONE_MARKED");

  const teto = planSubjectSupportFormation({ ...base, marked: ["s1", "s2", "s3", "s4", "s5", "s6", "s7"].map(id => kw(id)) });
  assert.equal(teto.ok ? null : teto.code, "OVER_CEILING");

  const assunto = planSubjectSupportFormation({ ...base, marked: [kw("s1"), kw(ASSUNTO_ID)] });
  assert.equal(assunto.ok ? null : assunto.code, "SUBJECT_MARKED");

  const decidido = planSubjectSupportFormation({ ...base, marked: [kw("s1"), kw("s2")], memberKeywordIds: new Set(["s2"]) });
  assert.equal(decidido.ok ? null : decidido.code, "ALREADY_IN_ARTICLE");

  const semSilo = planSubjectSupportFormation({ ...base, marked: [kw("s1"), kw("s2")], siloRefOf: id => id === "s1" ? SILO_REF : null });
  assert.equal(semSilo.ok ? null : semSilo.code, "WITHOUT_SILO");

  const doisSilos = planSubjectSupportFormation({ ...base, marked: [kw("s1"), kw("s2")], siloRefOf: id => id === "s1" ? SILO_REF : "territory:outro" });
  assert.equal(doisSilos.ok ? null : doisSilos.code, "NOT_SAME_SILO");

  const soRetidos = planSubjectSupportFormation({ ...base, marked: [kw("s1", { subjectHeldOut: true })] });
  assert.equal(soRetidos.ok ? null : soRetidos.code, "NO_ELIGIBLE_PRINCIPAL");

  const semItem = planSubjectSupportFormation({ ...base, marked: [kw("s1"), kw("s9")] });
  assert.equal(semItem.ok ? null : semItem.code, "WITHOUT_WORKFLOW_ITEM");

  const retidoNuncaPrincipal = planSubjectSupportFormation({ ...base, marked: [kw("s1", { volume: 9000, subjectHeldOut: true }), kw("s2", { volume: 10 })] });
  assert.ok(retidoNuncaPrincipal.ok);
  assert.equal(retidoNuncaPrincipal.principalKeywordId, "s2", "Assunto sem Volume validado nunca é principal (D1)");
});

test("textos fixos: SERP da frase no Processador, sem chamada paga; principal pela regra de sempre", () => {
  assert.match(SUBJECT_PHRASE_SERP_HINT, /Resultados/);
  assert.match(SUBJECT_PHRASE_SERP_HINT, /Processador do Minerador/);
  assert.match(SUBJECT_PHRASE_SERP_HINT, /não faz chamada paga/);
  assert.match(SUBJECT_SUPPORT_PRINCIPAL_HINT, /agrupa as keywords elegíveis por intenção e Silo/);
  assert.match(SUBJECT_SUPPORT_PRINCIPAL_HINT, /não vira keyword, principal nem dá o slug/);
  assert.equal(subjectUnitLabel(null), "Artigo");
  assert.equal(subjectUnitLabel("category_page"), "Página de categoria");
});

/* ============================ estrutura da tela ============================ */

const painel = lerSemComentarios("modules/arquiteto/subject-panels.tsx");
const modelo = lerSemComentarios("modules/arquiteto/subject-workspace-model.ts");
const workspace = lerSemComentarios("modules/arquiteto/arquiteto-workspace.tsx");
const linhas = lerSemComentarios("modules/arquiteto/territorial-workspace-rows.tsx");

test("os rótulos vêm do domínio: a tela não repete as frases do Assunto", () => {
  for (const nome of ["SUBJECT_ATTACH_ACTION_LABEL", "SUBJECT_DETACH_ACTION_LABEL", "SUBJECT_FILTER_LABEL", "SUBJECT_SILO_SUGGESTION_ACTION_LABEL", "SUBJECT_SUGGESTION_SIGNAL_LABELS"]) {
    assert.match(painel, new RegExp(`\\b${nome}\\b`), `${nome} fora do painel`);
  }
  for (const fonte of [painel, workspace, linhas]) {
    assert.doesNotMatch(fonte, /"Assunto · aguardando sustentação"/);
    assert.doesNotMatch(fonte, /"Prender Assunto"|"Soltar Assunto"|"Confirmar Assunto do Silo"/);
    assert.doesNotMatch(fonte, /Assunto · tronco de \$\{/);
  }
});

test("leitor de tela: cada Soltar e cada Confirmar diz a unidade; cada sugestão mostra o Silo", () => {
  assert.match(painel, /aria-label=\{`\$\{SUBJECT_DETACH_ACTION_LABEL\} de \$\{anchor\.unitLabel\} \$\{anchor\.label\}`\}/);
  assert.match(painel, /aria-label=\{`\$\{SUBJECT_SILO_SUGGESTION_ACTION_LABEL\} em \$\{suggestion\.label\}`\}/);
  assert.match(painel, /aria-label=\{`\$\{SUBJECT_ATTACH_ACTION_LABEL\} em \$\{option\.label\}`\}/);
  assert.match(painel, /suggestion\.automaticEligible/);
  assert.doesNotMatch(painel, /type="checkbox"/);
  assert.match(painel, /Formar artigos automaticamente/);
  assert.match(workspace, /groupAutomaticSubjectSupports\(/);
  assert.match(workspace, /automatic \? "system" : "human"/);
  assert.match(workspace, /setAutomaticSubjectFinalization/);
  assert.match(painel, /\{SUBJECT_SUPPORT_WITHOUT_SILO\}/);
  assert.match(painel, /\{SUBJECT_SILO_SCOPE_NOTE\}/);
});

test("diálogos: foco entra, Tab contido, Escape fecha e o foco volta a quem abriu", () => {
  assert.equal((painel.match(/role="dialog"/g) || []).length, 2);
  assert.equal((painel.match(/aria-modal="true"/g) || []).length, 2);
  assert.equal((painel.match(/tabIndex=\{-1\}/g) || []).length, 2);
  assert.match(painel, /dialogRef\.current\?\.focus\(\)/);
  assert.match(painel, /event\.key === "Escape"/);
  assert.match(painel, /event\.key !== "Tab"/);
  assert.match(painel, /if \(trigger\?\.isConnected\) trigger\.focus\(\)/);
  assert.equal((painel.match(/useSubjectDialogFocus\(open, dialogRef, onClose, !busy\)/g) || []).length, 2);
});

test("sistema visual: sem cor crua, sem texto abaixo de 14px nos arquivos novos e na linha do Vínculo", () => {
  for (const caminho of ["modules/arquiteto/subject-panels.tsx", "modules/arquiteto/subject-workspace-model.ts", "modules/arquiteto/territorial-workspace-rows.tsx"]) {
    assert.deepEqual(findVisualViolations(readFileSync(caminho, "utf8")), [], caminho);
  }
  assert.doesNotMatch(painel, /\btext-xs\b|text-\[\d+px\]/);
  assert.match(painel, /text-keyword/);
});

test("nenhuma rede, nenhum provider e nenhum botão pago na tela do Assunto", () => {
  for (const fonte of [painel, modelo]) {
    assert.doesNotMatch(fonte, /\bfetch\(|\/api\/|supabase|dataforseo/i);
  }
  const bloco = workspace.slice(workspace.indexOf("const selectedSubjectRow = useMemo"), workspace.indexOf("const confirmSubjectSupport = async"));
  assert.ok(bloco.length > 1000, "bloco do Assunto não encontrado");
  assert.doesNotMatch(bloco, /\bfetch\(|keyword-serp|territorial-serp|dataforseo/i);
  assert.match(bloco, /persistArquitetoArtifact\(\{ brandId: selectedBrandId, artifactType: "article_dna", action: "edit", version: successor, status: "proposed" \}\)/);
  assert.match(bloco, /persistArquitetoArtifact\(\{ brandId: selectedBrandId, artifactType: "silo_dna", action: "edit", version: successor, status: "proposed" \}\)/);
});

test("não agrupadas: o predicado do domínio decide, e nenhuma keyword some", () => {
  assert.match(workspace, /splitUngroupedBySubjectAnchor\(\{\s*ungroupedKeywordIds: ungroupedArticleKeywords\.map/);
  assert.match(workspace, /Keywords não agrupadas · \{visibleUngroupedArticleKeywords\.length\}/);
  assert.match(workspace, /<SubjectConservationBadge label=\{selo\} tone="awaiting"/);
  assert.match(workspace, /<SubjectConservationBadge label=\{item\.label\} tone="trunk"/);
  assert.match(workspace, /\$\{visibleUngroupedArticleKeywords\.length\} keyword\(s\) sem grupo/);
});

test("formação, motor e proposta recebem os conjuntos do Assunto, de uma lista só", () => {
  assert.match(workspace, /const subjectHeldOut = useMemo\(\(\) => heldOutSubjectIds\(subjectStandings\)/);
  assert.match(workspace, /const subjectFormationTrunks = useMemo\(\(\) => trunkAnchoredKeywordIds\(subjectDnaCarriers\)/);
  assert.match(workspace, /subjectHeldOut\.has\(String\(keyword\.id\)\) \? \{ subjectHeldOut: true \}/);
  assert.match(workspace, /subjectFormationTrunks\.has\(String\(keyword\.id\)\) \? \{ subjectAnchored: true \}/);
  assert.match(workspace, /automaticFormationHoldouts\(\{\s*siloRef: territory\.territoryRef,\s*keywords: universoKeywords,\s*subjectByCandidateRef: workingSubjectAnchors,\s*\}\)/);
  assert.match(workspace, /!keyword\.isPublished && !foraDaAutomatica\.has\(keyword\.keywordId\)/);
  assert.match(workspace, /\.\.\.subjectDnaCarriers,\s*\.\.\.workingSubjectCarriers\(\{ workingAnchors: workingSubjectAnchors, materializedRefs: materializationPartition\.current, liveCandidates: liveSubjectCandidates \}\)/);
  assert.match(workspace, /anchored: trunkAnchoredKeywordIds\(subjectAnchorCarriers\)/);
  assert.doesNotMatch(workspace, /subjectMesaAnchors|subjectFormationAnchors/);
  assert.equal((workspace.match(/articles: subjectAnchorCarriers|anchors: subjectAnchorCarriers|countSubjectAnchors\(keywordId, subjectAnchorCarriers\)/g) || []).length, 3, "mesa, filtro e Vínculo leem a mesma lista");
  assert.match(workspace, /liveSubjectAnchors\.get\(article\.candidateRef\)/);
  assert.match(workspace, /subjectByCandidateRef: workingSubjectAnchors/);
  assert.match(workspace, /siloSubjectKeywordId: siloSubjectByTerritoryRef\.get\(territory\.territoryRef\)/);
  assert.match(workspace, /buildDeterministicArticleArchitecture\(source, \{\s*heldOutKeywordIds: subjectSets\.heldOut,\s*anchoredKeywordIds: subjectSets\.anchored,\s*\}\)/);
  assert.match(workspace, /anchoredSubjectKeywordIds: subjectSets\.anchored/);
});

test("conclusão: a portaria recebe o Volume de cada Assunto, e o Assunto vai para o ArticleDNA sem sumir ao reconcluir", () => {
  assert.match(workspace, /subjectVolumeValidated: new Map\(\[\.\.\.subjectStandings\]/);
  assert.match(workspace, /subjectLabels: new Map\(/);
  const materializacao = workspace.slice(workspace.indexOf("const materializeApprovedArticleDnas"), workspace.indexOf("const confirmArticleFormation"));
  assert.ok(
    materializacao.indexOf("attachSubjectToArticleDna(artigoDaFormacao") < materializacao.indexOf("bindArticleParentForMaterialization({"),
    "o Assunto entra antes de o pai ser declarado",
  );
  assert.match(materializacao, /const assuntoGravado = acceptedArticleDnas\[articleId\]\?\.payload\.subject \?\? null;/);
  assert.match(materializacao, /planSubjectAttachment\(\{/);
  assert.match(materializacao, /const assuntoMudou = !sameDeclaredSubject\(canonicaAprovada\?\.payload\.subject \?\? null, payload\.subject \?\? null\);/);
  assert.match(materializacao, /if \(!diffEditorial\.substantive\) \{\s*if \(!assuntoMudou\) \{\s*semDiff\.push\(\{ articleId, reason: diffEditorial\.reason \}\);/);
});

test("Vínculo e importação mostram o Assunto pelo resolver do Minerador", () => {
  assert.match(workspace, /subjectLabel: readArchitectKeywordVinculo\(keyword\)\.subjectLabel \?\? null/);
  assert.match(workspace, /architectureKeywordVinculos\.get\(String\(keyword\.id\)\)\?\.subjectLabel/);
  assert.match(workspace, /data-testid="architect-import-subject"/);
  assert.match(workspace, /const aguardando = Boolean\(vinculo\.subjectLabel\) && Boolean\(ungroupedSubjectLabels\.get\(keywordId\)\);/);
  assert.match(workspace, /subjectConservationLabel\(\{ declared: aguardando, anchoredArticleCount: trunkCount \}\)/);
  assert.match(linhas, /<SubjectConservationBadge label=\{vinculo\.subject\.label\} tone=\{vinculo\.subject\.tone\}/);
  assert.doesNotMatch(workspace, /analise_semantica\?\.keyword_subject|keyword_subject_actor/, "a tela não lê a declaração por conta própria");
});

test("ações humanas: prender, soltar, confirmar a sugestão do Silo e formar em torno do Assunto", () => {
  assert.match(workspace, /<SubjectFilterPanel/);
  assert.match(workspace, /<SubjectAttachDialog/);
  assert.match(workspace, /<SubjectSupportDialog/);
  assert.match(workspace, /onDetach=\{anchor => \{ void detachSubjectAnchor\(anchor\); \}\}/);
  assert.match(workspace, /onConfirmSiloSuggestion=\{ref => \{ void confirmSiloSubjectSuggestion\(ref\); \}\}/);
  assert.match(workspace, /suggestSubjectSupport\(\{ brandId: selectedBrandId, subjectKeyword: selectedSubjectRow, keywords: masterList, memberKeywordIds: subjectSupportMemberIds/);
  assert.match(workspace, /suggestSubjectFromSilo\(\{ silo, article: \{ subjectKeywordId: null \} \}\)/);
  assert.match(workspace, /const doSilo = siloSubjectByTerritoryRef\.get\(entrada\.siloRef\) \?\? null;/);
  assert.match(workspace, /siloSubjectTerritories\(\{/);
  assert.match(workspace, /siloLabels=\{subjectSupportSiloLabels\}/);
  assert.match(workspace, /anchor\.ref\.startsWith\("dna:"\)/);
  assert.match(workspace, /ref: `dna:\$\{key\}`/);
  const aplicar = workspace.slice(workspace.indexOf("const applyFormationPlan = useCallback"), workspace.indexOf("const universeOfCandidate = useCallback"));
  assert.ok(aplicar.indexOf("workingSubjectAnchorMigrationAssignments(") < aplicar.indexOf("await persistArchitectWorkingCopy("), "o vínculo acompanha o artigo na mesma escrita da formação");
  assert.ok(aplicar.indexOf("setWorkingSubjectAnchorState(") > aplicar.indexOf("if (naoConfirmadas.length)"), "a mesa só mostra o vínculo movido depois do readback");
  assert.match(workspace, /applyFormationPlan\(\{ patches, refusals: \[\] \}, "Artigos formados automaticamente em torno do Assunto", refsNovos, vinculosNaFormacao\)/);
  const formar = workspace.slice(workspace.indexOf("const confirmSubjectSupport = async"));
  assert.ok(formar.indexOf("planSubjectAttachment(") < formar.indexOf("await applyFormationPlan("), "o Assunto é conferido antes de gravar a formação");
  assert.match(formar, /setWorkingSubjectAnchor\(anchor\.candidateRef, anchor\.subjectKeywordId\)/);
  assert.match(workspace, /filterBySubject\(porCampos, workspaceMode === "articles" \? activeSubjectFilter : null/);
  assert.match(workspace, /detachSubjectFromArticleDna\(entry\.version\.payload\);\s*if \(article\.candidateRef\) await persistWorkingSubjectAnchor\(\{ candidateRef: article\.candidateRef, subjectKeywordId: null, holderKeywordId: null, actorId \}\);/);
  assert.match(workspace, /authenticatedArchitectActor\(\{ sessionStatus, actorUserId: session\?\.user\?\.id, brandId: selectedBrandId \}\);\s*if \(!actorId\) \{\s*showNotification\("error", "Prender o Assunto é ato humano/);
});

test("formação automática conclui os artigos aprovados mesmo se outro candidato parar num gate", () => {
  const finalize = workspace.slice(workspace.indexOf("const request = automaticSubjectFinalization"), workspace.indexOf("const processArchitecture = useCallback"));
  assert.match(finalize, /const eligibleCandidateRefs = request\.candidateRefs\.filter\(\(_, index\) => !gates\[index\]\?\.blocksConclusion\)/);
  assert.match(finalize, /if \(eligibleCandidateRefs\.length\) \{\s*void confirmArticleFormation\(\{ candidateRefs: eligibleCandidateRefs, subjectPhrase: request\.subjectPhrase \}\)/);
  assert.match(finalize, /blocked\.length/);
});

test("nenhuma chamada de rede em todo o arquivo", () => {
  assert.equal(chamadasDeRede, 0);
});
