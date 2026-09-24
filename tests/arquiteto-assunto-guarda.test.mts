/**
 * A guarda do Assunto na gravação, o vínculo gravado na cópia de trabalho,
 * o Assunto na consolidação do Silo e no diff de versão (SDD 2026-09-24,
 * F2 fase B). Domínio puro: fixtures, sem rede.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  ASSUNTO_FRASE,
  ASSUNTO_ID,
  ATOR,
  declarado,
  linhaDaMesa,
  logica,
  MARCA,
  OUTRA_MARCA,
  VOLUME_VALIDADO,
} from "./arquiteto-assunto-fixtures.mts";
import {
  mergeWorkingSubjectAnchors,
  persistedWorkingSubjectAnchors,
  planWorkingSubjectAnchorWrites,
  readWorkingSubjectAnchor,
  sameSubjectRecord,
  sameWorkingSubjectAnchor,
  subjectWriteRequiresCheck,
  verifyDeclaredSubjectWrite,
  verifyWorkingSubjectAnchorWrite,
  workingSubjectAnchorMigrationAssignments,
  WORKING_SUBJECT_ANCHOR_FIELD,
  WorkingSubjectAnchorSchema,
} from "../lib/arquiteto/declared-subject-guard.ts";
import { attachSubjectToSiloDna, planSubjectAttachment } from "../lib/arquiteto/declared-subject.ts";
import type { DeclaredSubject } from "../lib/arquiteto/contracts.ts";
import { EDITORIAL_DECISION_FIELDS, articleEditorialDiff } from "../lib/arquiteto/article-editorial-diff.ts";
import type { ArticleDNA } from "../lib/arquiteto/contracts.ts";
import { buildProvisionalGroups } from "../lib/arquiteto/engine.ts";
import { deterministicArticleDnaPayload, deterministicSiloDnaPayload } from "../lib/arquiteto/adapters.ts";
import { chooseSiloWorkingCopyPillar, formSiloWorkingCopies } from "../lib/arquiteto/silo-formation.ts";
import { buildConsolidatedSiloDnaPayload, buildConsolidatedSiloPagePayload } from "../lib/arquiteto/silo-consolidation.ts";
import { canonicalJson, contentHash, createVersionEnvelope } from "../lib/arquiteto/versioning.ts";

const fetchOriginal = globalThis.fetch;
let chamadasDeRede = 0;
globalThis.fetch = (async () => { chamadasDeRede += 1; throw new Error("rede proibida no teste"); }) as typeof fetch;
test.after(() => { globalThis.fetch = fetchOriginal; });

const OUTRO_HUMANO = "7c6b5a49-3827-4165-9403-f2e1d0c9b8a7";
const ATTACHED_AT = "2026-09-24T12:00:00+00:00";

const assuntoD2 = () => linhaDaMesa({
  id: ASSUNTO_ID,
  keyword: ASSUNTO_FRASE,
  semantic: { ...logica({ entity: "marketing para clínicas", intent: "Comercial", funnel: "MOFU" }), ...declarado() },
});
const assuntoComVolume = () => linhaDaMesa({
  id: ASSUNTO_ID,
  keyword: ASSUNTO_FRASE,
  semantic: { ...logica({ entity: "marketing para clínicas" }), ...declarado(), ...VOLUME_VALIDADO },
});

function preso(linha = assuntoD2(), ator = ATOR): DeclaredSubject {
  const plano = planSubjectAttachment({ brandId: MARCA, keyword: linha, actorUserId: ator, attachedAt: ATTACHED_AT });
  assert.ok(plano.ok, plano.ok ? "" : plano.reason);
  return plano.subject;
}

/* ============================== 1. a guarda ============================== */

test("humano da requisição, keyword da marca, declarada no pacote: aceito", () => {
  const verdict = verifyDeclaredSubjectWrite({ brandId: MARCA, actorUserId: ATOR, subject: preso(), keyword: assuntoD2() });
  assert.deepEqual(verdict, { ok: true });
});

test("IA, e-mail ou local-user como attachedBy: recusado", () => {
  for (const autor of ["deepseek", "ia", "local-user", "pessoa@exemplo.com"]) {
    const verdict = verifyDeclaredSubjectWrite({ brandId: MARCA, actorUserId: ATOR, subject: { ...preso(), attachedBy: autor }, keyword: assuntoD2() });
    assert.equal(verdict.ok, false);
    assert.equal(!verdict.ok && verdict.code, "SUBJECT_ACTOR_MISMATCH", autor);
  }
});

test("attachedBy de outro humano que não o ator da requisição: recusado; na restauração, aceito", () => {
  const subject = preso(assuntoD2(), OUTRO_HUMANO);
  const sessao = verifyDeclaredSubjectWrite({ brandId: MARCA, actorUserId: ATOR, subject, keyword: assuntoD2() });
  assert.equal(!sessao.ok && sessao.code, "SUBJECT_ACTOR_MISMATCH");
  const restaurado = verifyDeclaredSubjectWrite({ brandId: MARCA, actorUserId: ATOR, subject, keyword: assuntoD2(), actorMode: "restored" });
  assert.deepEqual(restaurado, { ok: true });
  const iaRestaurada = verifyDeclaredSubjectWrite({ brandId: MARCA, actorUserId: ATOR, subject: { ...subject, attachedBy: "deepseek" }, keyword: assuntoD2(), actorMode: "restored" });
  assert.equal(!iaRestaurada.ok && iaRestaurada.code, "SUBJECT_ACTOR_MISMATCH", "restaurar não abre a porta para a IA");
});

test("keyword de outra marca: recusada", () => {
  const daOutra = linhaDaMesa({ id: ASSUNTO_ID, keyword: ASSUNTO_FRASE, brandId: OUTRA_MARCA, semantic: declarado() });
  const verdict = verifyDeclaredSubjectWrite({ brandId: MARCA, actorUserId: ATOR, subject: preso(), keyword: daOutra });
  assert.equal(!verdict.ok && verdict.code, "SUBJECT_CROSS_BRAND");
});

test("keyword que o pacote não declara Assunto: recusada", () => {
  const semDeclaracao = linhaDaMesa({ id: ASSUNTO_ID, keyword: ASSUNTO_FRASE, semantic: logica({ entity: "x" }) });
  const verdict = verifyDeclaredSubjectWrite({ brandId: MARCA, actorUserId: ATOR, subject: preso(), keyword: semDeclaracao });
  assert.equal(!verdict.ok && verdict.code, "SUBJECT_NOT_DECLARED");
});

test("keyword inexistente, excluída, não recebida ou sem pacote: recusada", () => {
  const base = { brandId: MARCA, actorUserId: ATOR, subject: preso() };
  assert.equal((verifyDeclaredSubjectWrite({ ...base, keyword: null }) as { code: string }).code, "SUBJECT_KEYWORD_NOT_FOUND");
  assert.equal((verifyDeclaredSubjectWrite({ ...base, keyword: { ...assuntoD2(), deleted_at: "2026-09-24T10:00:00+00:00" } }) as { code: string }).code, "SUBJECT_KEYWORD_NOT_FOUND");
  assert.equal((verifyDeclaredSubjectWrite({ ...base, keyword: linhaDaMesa({ id: ASSUNTO_ID, keyword: ASSUNTO_FRASE, semantic: declarado(), received: false }) }) as { code: string }).code, "SUBJECT_NOT_RECEIVED");
  assert.equal((verifyDeclaredSubjectWrite({ ...base, keyword: linhaDaMesa({ id: ASSUNTO_ID, keyword: ASSUNTO_FRASE, semantic: declarado(), semPacote: true }) }) as { code: string }).code, "SUBJECT_NO_APPROVED_PACKAGE");
});

test("pacote divergente (versão, hash, frase, nota ou destino): recusado", () => {
  const subject = preso();
  const variantes: Array<[string, DeclaredSubject]> = [
    ["approvedPackageRef", { ...subject, approvedPackageRef: { ...subject.approvedPackageRef, version: 9 } }],
    ["approvedPackageRef", { ...subject, approvedPackageRef: { ...subject.approvedPackageRef, contentHash: "pkg-inventado" } }],
    ["phrase", { ...subject, phrase: "SEO para dentistas" }],
    ["note", { ...subject, note: "Nota inventada pelo cliente." }],
    ["destinationUrl", { ...subject, destinationUrl: "https://exemplo.com/oferta" }],
  ];
  for (const [campo, variante] of variantes) {
    const verdict = verifyDeclaredSubjectWrite({ brandId: MARCA, actorUserId: ATOR, subject: variante, keyword: assuntoD2() });
    assert.equal(!verdict.ok && verdict.code, "SUBJECT_PACKAGE_MISMATCH", campo);
    assert.match(!verdict.ok ? verdict.reason : "", new RegExp(campo));
  }
});

test("Assunto como a própria principal: só com Volume validado no pacote (Q7)", () => {
  const semVolume = verifyDeclaredSubjectWrite({ brandId: MARCA, actorUserId: ATOR, subject: preso(), keyword: assuntoD2(), principalKeywordId: ASSUNTO_ID });
  assert.equal(!semVolume.ok && semVolume.code, "SUBJECT_PRINCIPAL_WITHOUT_VOLUME");
  const comVolume = verifyDeclaredSubjectWrite({ brandId: MARCA, actorUserId: ATOR, subject: preso(assuntoComVolume()), keyword: assuntoComVolume(), principalKeywordId: ASSUNTO_ID });
  assert.deepEqual(comVolume, { ok: true });
});

test("subject igual ao da versão anterior não pede conferência; novo, alterado ou de outro autor pede", () => {
  const subject = preso();
  const relido = JSON.parse(JSON.stringify({ attachedAt: subject.attachedAt, phrase: subject.phrase, keywordId: subject.keywordId, note: subject.note, destinationUrl: subject.destinationUrl, attachedBy: subject.attachedBy, approvedPackageRef: { approvedAt: subject.approvedPackageRef.approvedAt, contentHash: subject.approvedPackageRef.contentHash, version: subject.approvedPackageRef.version } })) as DeclaredSubject;
  assert.equal(sameSubjectRecord(subject, relido), true, "ordem de chave do JSONB não é mudança");
  assert.equal(subjectWriteRequiresCheck(relido, subject), false);
  assert.equal(subjectWriteRequiresCheck(null, subject), true);
  assert.equal(subjectWriteRequiresCheck(subject, { ...subject, attachedBy: OUTRO_HUMANO }), true);
  assert.equal(subjectWriteRequiresCheck(subject, { ...subject, attachedAt: "2026-09-25T12:00:00+00:00" }), true);
  assert.equal(subjectWriteRequiresCheck(subject, undefined), false, "soltar não prende nada");
  assert.equal(subjectWriteRequiresCheck(undefined, undefined), false, "sem Assunto, nada a conferir");
});

/* ================= 2. o vínculo gravado na cópia de trabalho ================= */

const ITENS = [
  { keywordId: "kw-principal", workflowItemId: "11111111-1111-4111-8111-111111111111", lockVersion: 3 },
  { keywordId: "kw-secundaria", workflowItemId: "22222222-2222-4222-8222-222222222222", lockVersion: 5 },
];

test("prender grava o vínculo no item da principal; soltar tira de onde estiver", () => {
  const prender = planWorkingSubjectAnchorWrites({
    candidateRef: "article-formation:f1", subjectKeywordId: ASSUNTO_ID, holderKeywordId: "kw-principal",
    items: ITENS, persisted: new Map(), actorUserId: ATOR, attachedAt: ATTACHED_AT,
  });
  assert.ok(prender.ok);
  assert.deepEqual(prender.writes, [{
    keywordId: "kw-principal", workflowItemId: ITENS[0].workflowItemId, expectedLock: 3,
    assignment: { [WORKING_SUBJECT_ANCHOR_FIELD]: { candidateRef: "article-formation:f1", subjectKeywordId: ASSUNTO_ID, attachedBy: ATOR, attachedAt: ATTACHED_AT } },
  }]);
  assert.ok(WorkingSubjectAnchorSchema.safeParse(prender.writes[0].assignment.articleSubjectAnchor).success);

  const gravado = new Map([["article-formation:f1", { subjectKeywordId: ASSUNTO_ID, holderKeywordId: "kw-secundaria" }]]);
  const trocaDeDono = planWorkingSubjectAnchorWrites({
    candidateRef: "article-formation:f1", subjectKeywordId: ASSUNTO_ID, holderKeywordId: "kw-principal",
    items: ITENS, persisted: gravado, actorUserId: ATOR, attachedAt: ATTACHED_AT,
  });
  assert.ok(trocaDeDono.ok);
  assert.deepEqual(trocaDeDono.writes.map(write => [write.keywordId, write.assignment.articleSubjectAnchor === null]), [["kw-principal", false], ["kw-secundaria", true]]);

  const soltar = planWorkingSubjectAnchorWrites({
    candidateRef: "article-formation:f1", subjectKeywordId: null, holderKeywordId: null,
    items: ITENS, persisted: gravado, actorUserId: ATOR, attachedAt: ATTACHED_AT,
  });
  assert.ok(soltar.ok);
  assert.deepEqual(soltar.writes, [{ keywordId: "kw-secundaria", workflowItemId: ITENS[1].workflowItemId, expectedLock: 5, assignment: { articleSubjectAnchor: null } }]);

  const semItem = planWorkingSubjectAnchorWrites({
    candidateRef: "article-formation:f1", subjectKeywordId: ASSUNTO_ID, holderKeywordId: "kw-sem-item",
    items: ITENS, persisted: new Map(), actorUserId: ATOR, attachedAt: ATTACHED_AT,
  });
  assert.equal(semItem.ok, false, "sem item com lock, nada fica fingindo que foi gravado");
});

test("o vínculo sobrevive ao recarregar: lido do payload do item, por candidateRef", () => {
  const anchor = { candidateRef: "article-formation:f1", subjectKeywordId: ASSUNTO_ID, attachedBy: ATOR, attachedAt: ATTACHED_AT };
  const linhas = [
    { id: "kw-principal", canonicalWorkflow: { payload: { articleFormationRef: "article-formation:f1", [WORKING_SUBJECT_ANCHOR_FIELD]: anchor } } },
    { id: "kw-secundaria", canonicalWorkflow: { payload: { articleFormationRef: "article-formation:f1" } } },
    { id: "kw-solto", canonicalWorkflow: { payload: { [WORKING_SUBJECT_ANCHOR_FIELD]: null } } },
    { id: "kw-invalido", canonicalWorkflow: { payload: { [WORKING_SUBJECT_ANCHOR_FIELD]: { candidateRef: "x" } } } },
  ];
  const lidos = persistedWorkingSubjectAnchors(linhas);
  assert.deepEqual([...lidos], [["article-formation:f1", { subjectKeywordId: ASSUNTO_ID, holderKeywordId: "kw-principal" }]]);
  assert.deepEqual(readWorkingSubjectAnchor(linhas[0].canonicalWorkflow.payload), anchor);
  assert.equal(readWorkingSubjectAnchor(linhas[3].canonicalWorkflow.payload), null);
  assert.equal(sameWorkingSubjectAnchor(anchor, { ...anchor }), true);

  const mesa = mergeWorkingSubjectAnchors(lidos, new Map([["article-candidate:s:p", ASSUNTO_ID], ["article-formation:f1", null]]));
  assert.deepEqual([...mesa], [["article-candidate:s:p", ASSUNTO_ID]], "o solto confirmado sai antes de a releitura chegar");
});

test("sem Assunto, o payload da cópia de trabalho não ganha campo", () => {
  const payload = { articleFormationRef: "article-formation:f1", articleFormationDecision: { operation: "move", role: "principal", reason: "r", source: "human", decidedAt: ATTACHED_AT } };
  const antes = contentHash(payload);
  const migracao = workingSubjectAnchorMigrationAssignments({
    before: new Map(), after: new Map(),
    patches: [{ keywordId: "kw-principal", assignment: payload }],
    persisted: new Map(), actorUserId: ATOR, attachedAt: ATTACHED_AT,
  });
  assert.equal(migracao.size, 0);
  const escrito = { ...payload, ...(migracao.get("kw-principal") || {}) };
  assert.equal(canonicalJson(escrito), canonicalJson(payload));
  return antes.then(hashAntes => contentHash(escrito).then(hashDepois => assert.equal(hashDepois, hashAntes)));
});

test("o ref do artigo muda: o vínculo vai na mesma escrita para a principal do ref novo e sai do item antigo", () => {
  const extra = workingSubjectAnchorMigrationAssignments({
    before: new Map([["article-candidate:s:kw-principal", ASSUNTO_ID]]),
    after: new Map([["article-formation:novo", ASSUNTO_ID]]),
    patches: [
      { keywordId: "kw-secundaria", assignment: { articleFormationRef: "article-formation:novo", articleFormationDecision: { role: "principal" } } },
      { keywordId: "kw-principal", assignment: { articleFormationRef: "article-formation:novo", articleFormationDecision: { role: "secundaria" } } },
    ],
    persisted: new Map([["article-candidate:s:kw-principal", { subjectKeywordId: ASSUNTO_ID, holderKeywordId: "kw-principal" }]]),
    actorUserId: ATOR,
    attachedAt: ATTACHED_AT,
  });
  assert.deepEqual(extra.get("kw-secundaria"), { articleSubjectAnchor: { candidateRef: "article-formation:novo", subjectKeywordId: ASSUNTO_ID, attachedBy: ATOR, attachedAt: ATTACHED_AT } });
  assert.deepEqual(extra.get("kw-principal"), { articleSubjectAnchor: null });
});

test("guarda do vínculo: IA, outra marca e não declarado recusados; humano válido aceito", () => {
  const anchor = { candidateRef: "article-formation:f1", subjectKeywordId: ASSUNTO_ID, attachedBy: ATOR, attachedAt: ATTACHED_AT };
  assert.deepEqual(verifyWorkingSubjectAnchorWrite({ brandId: MARCA, actorUserId: ATOR, anchor, keyword: assuntoD2() }), { ok: true });
  const ia = verifyWorkingSubjectAnchorWrite({ brandId: MARCA, actorUserId: ATOR, anchor: { ...anchor, attachedBy: "deepseek" }, keyword: assuntoD2() });
  assert.equal(!ia.ok && ia.code, "SUBJECT_ACTOR_MISMATCH");
  const outroAtor = verifyWorkingSubjectAnchorWrite({ brandId: MARCA, actorUserId: OUTRO_HUMANO, anchor, keyword: assuntoD2() });
  assert.equal(!outroAtor.ok && outroAtor.code, "SUBJECT_ACTOR_MISMATCH");
  const outraMarca = verifyWorkingSubjectAnchorWrite({ brandId: MARCA, actorUserId: ATOR, anchor, keyword: linhaDaMesa({ id: ASSUNTO_ID, keyword: ASSUNTO_FRASE, brandId: OUTRA_MARCA, semantic: declarado() }) });
  assert.equal(!outraMarca.ok && outraMarca.code, "SUBJECT_CROSS_BRAND");
  const naoDeclarado = verifyWorkingSubjectAnchorWrite({ brandId: MARCA, actorUserId: ATOR, anchor, keyword: linhaDaMesa({ id: ASSUNTO_ID, keyword: ASSUNTO_FRASE, semantic: logica({ entity: "x" }) }) });
  assert.equal(!naoDeclarado.ok && naoDeclarado.code, "SUBJECT_NOT_DECLARED");
});

/* ======================= 3. o Assunto na consolidação do Silo ======================= */

const kw = (id: string, value: string, volume_search: number) => ({
  id, keyword: value, intent: "Informativo", volume_search, results_allintitle: null, kgr_score: null, lista_id: null,
  siloName: null, status: "aprovado", analise_semantica: { entidade_central: "manicure", publico: "clientes", problema_percebido: "duvida" },
});

async function consolidacao(comAssunto: boolean) {
  const artigo = async (id: string, value: string, volume: number) => {
    const group = buildProvisionalGroups([kw(`${id}-kw`, value, volume)])[0];
    const payload = deterministicArticleDnaPayload(group, "brand-1");
    return createVersionEnvelope({ entityId: payload.articleId, versionNumber: 1, origin: "system", changeReason: "fixture", createdBy: "test", payload });
  };
  const first = await artigo("a1", "manicure profissional", 900);
  const second = await artigo("a2", "manicure para iniciantes", 300);
  const formed = formSiloWorkingCopies({ brandId: "brand-1", articleVersions: [first, second] });
  const copy = chooseSiloWorkingCopyPillar(formed.workingCopies[0], first.payload.articleId);
  let anterior = deterministicSiloDnaPayload(copy.id, "Manicure", [first], { brandId: "brand-1", centralEntity: "manicure" });
  if (comAssunto) {
    const preso = attachSubjectToSiloDna(anterior, { ...presoGenerico(), keywordId: ASSUNTO_ID });
    assert.ok(preso.ok);
    anterior = preso.value;
  }
  const existingSiloDna = await createVersionEnvelope({ entityId: copy.id, versionNumber: 1, origin: "human", changeReason: "fixture", createdBy: ATOR, payload: anterior });
  return { copy, articleVersions: [first, second], existingSiloDna, articleStatuses: { [first.payload.articleId]: "approved", [second.payload.articleId]: "approved" } };
}

function presoGenerico(): DeclaredSubject {
  return { ...preso(), attachedBy: ATOR };
}

test("a consolidação do Silo carrega o Assunto da versão anterior, sem trocar a entidade central", async () => {
  const input = await consolidacao(true);
  const dna = buildConsolidatedSiloDnaPayload(input);
  assert.deepEqual(dna.subject, input.existingSiloDna.payload.subject);
  assert.equal(dna.centralEntity, input.existingSiloDna.payload.centralEntity, "o Assunto não vira entidade central (D1)");
  const versao = await createVersionEnvelope({ entityId: dna.siloId, versionNumber: 2, previousVersionId: input.existingSiloDna.versionId, origin: "human", changeReason: "t", createdBy: ATOR, payload: dna });
  const pagina = buildConsolidatedSiloPagePayload(versao, input);
  assert.equal(pagina.siloDnaRef.versionId, versao.versionId, "a página nasce apontando para a versão com o Assunto: nada desalinhado");
  assert.equal(JSON.stringify(pagina).includes(ASSUNTO_FRASE), false, "a SiloPage não lê o Assunto (H1 e title da entidade central)");
});

test("sem Assunto, a consolidação sai igual: nenhum campo novo e o mesmo hash com e sem a linha nova", async () => {
  const input = await consolidacao(false);
  const dna = buildConsolidatedSiloDnaPayload(input);
  assert.equal("subject" in dna, false);
  const preso = attachSubjectToSiloDna(input.existingSiloDna.payload, presoGenerico());
  assert.ok(preso.ok);
  const anteriorComAssunto = await createVersionEnvelope({ entityId: input.copy.id, versionNumber: 1, origin: "human", changeReason: "fixture", createdBy: ATOR, payload: preso.value });
  const comAssunto = buildConsolidatedSiloDnaPayload({ ...input, existingSiloDna: anteriorComAssunto });
  const { subject: _assunto, ...semAssunto } = comAssunto;
  void _assunto;
  assert.equal(await contentHash(semAssunto), await contentHash(dna), "o Assunto é a única diferença entre as duas consolidações");
});

/* ============================== 4. diff de versão ============================== */

function artigoDna(extra: Partial<ArticleDNA> = {}): ArticleDNA {
  const group = buildProvisionalGroups([kw("kw-diff", "manicure profissional", 900)])[0];
  return { ...deterministicArticleDnaPayload(group, MARCA), ...extra } as ArticleDNA;
}

test("diff de versão: prender, soltar ou ler de pacote novo é revisão real; autor e data não são", () => {
  assert.ok((EDITORIAL_DECISION_FIELDS as readonly string[]).includes("subject"));
  const subject = preso();
  const base = artigoDna();
  assert.equal(articleEditorialDiff({ canonical: base, candidate: artigoDna() }).substantive, false, "sem Assunto, igual a antes");

  const prendeu = articleEditorialDiff({ canonical: base, candidate: artigoDna({ subject }) });
  assert.equal(prendeu.substantive, true);
  assert.deepEqual(prendeu.changedFields, ["subject"]);

  const soltou = articleEditorialDiff({ canonical: artigoDna({ subject }), candidate: base });
  assert.deepEqual(soltou.changedFields, ["subject"]);

  const carimbo = articleEditorialDiff({ canonical: artigoDna({ subject }), candidate: artigoDna({ subject: { ...subject, attachedBy: OUTRO_HUMANO, attachedAt: "2026-09-30T08:00:00+00:00" } }) });
  assert.equal(carimbo.substantive, false, "quem prendeu e quando são carimbos");

  const pacoteNovo = articleEditorialDiff({ canonical: artigoDna({ subject }), candidate: artigoDna({ subject: { ...subject, approvedPackageRef: { ...subject.approvedPackageRef, version: 2, contentHash: "pkg-v2" } } }) });
  assert.deepEqual(pacoteNovo.changedFields, ["subject"]);
});

test("a auditoria de versões usa a MESMA lista de campos da mesa", () => {
  const script = readFileSync("scripts/arquiteto-audit-version-diff.mts", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  assert.match(script, /import \{ EDITORIAL_DECISION_FIELDS \} from "\.\.\/lib\/arquiteto\/article-editorial-diff\.ts";/);
  assert.match(script, /const CAMPOS_ARTICLE = EDITORIAL_DECISION_FIELDS;/);
  assert.doesNotMatch(script, /"principalKeywordId", "secondaryKeywordIds"/, "sem lista própria que diverge da mesa");
});

test("nenhuma chamada de rede", () => {
  assert.equal(chamadasDeRede, 0);
});
