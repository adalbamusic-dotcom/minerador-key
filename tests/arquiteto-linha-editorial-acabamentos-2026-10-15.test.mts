import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";
import { buildProvisionalGroups } from "../lib/arquiteto/engine.ts";
import { deterministicArticleDnaPayload } from "../lib/arquiteto/adapters.ts";
import { createVersionEnvelope } from "../lib/arquiteto/versioning.ts";
import type { ArticleDNA, VersionEnvelope } from "../lib/arquiteto/contracts.ts";
import { readArchitectSubjectStandings } from "../lib/arquiteto/declared-subject.ts";
import { articleEditorialNeedsLine, editorialIntentLabel, editorialSupportList, EDITORIAL_PENDING_TEXT, isLegacyEditorialAngle, isLegacyEditorialCta } from "../lib/arquiteto/plan-editorial-line.ts";
import { AZUL, MARCA_WIFI } from "./arquiteto-planilha-primeiro-fixtures.mts";
import { AZUL_REAL, mesaWifiReal } from "./arquiteto-uma-lista-so-fixtures.mts";

/*
 * 2026-10-15 (noite) · ACABAMENTOS DA LINHA EDITORIAL — o readback da
 * WifiConecta azul (SELECT de 15/10, 18:35) depois da primeira "3 · Linha
 * editorial": o ângulo gravou o enum cru ("— intenção commercial_investigation
 * confirmada pela SERP.") e o CTA do Pilar gravou o OBJETIVO interno do plano
 * ("Próximo passo do Silo “Wi-Fi e fibra óptica”: conquistar tráfego de
 * pessoas…"). Sem BrandDNA aprovado, o público ficou pendente (correto).
 *
 * O servidor real da etapa 3 (`previewPlanEditorialLine` /
 * `applyPlanEditorialLine`) roda com as fronteiras de I/O simuladas: os grupos
 * com plano, a mesa (ArticleDNA vigentes) e a gravação, que guarda a versão
 * nova na mesma mesa para a releitura. Sem rede, sem banco, sem IA.
 */
register(`data:text/javascript,${encodeURIComponent(`export async function resolve(s,c,n) {
  if(s==='next/server') return {shortCircuit:true,url:'data:text/javascript,'+encodeURIComponent('export class NextRequest extends Request {} export class NextResponse extends Response { static json(body, init) { return new Response(JSON.stringify(body), init); } }')}; return n(s,c); }`)}`);
globalThis.fetch = async () => { throw new Error("Rede proibida neste teste"); };

const { applyPlanEditorialLine, previewPlanEditorialLine } = await import("../lib/server/arquiteto-plan-editorial-line.ts");

const ATOR = "d67ebbad-a590-45f8-8bb5-a19c6241ac1b";
const OBJETIVO = "conquistar tráfego de pessoas que querem entender a tecnologia, melhorar a conexão ou descobrir se precisam trocar de plano.";
const PLANO = { siloName: "Wi-Fi e fibra óptica", siloSlug: "wifi-e-fibra", objective: OBJETIVO, articleCount: 7 };
const INTENCAO: Record<string, string> = { k9: "commercial_investigation", k10: "informational", k11: "informational", k12: "commercial_investigation", k13: "commercial_investigation", k14: "informational", k15: "informational" };
const HASH = `sha256:${"a".repeat(64)}`;
const kw = (id: string, value: string, volume: number) => ({ id, keyword: value, intent: "Informativo", volume_search: volume, results_allintitle: null, kgr_score: null, lista_id: null, siloName: null, status: "aprovado", analise_semantica: { entidade_central: "internet", publico: "clientes", problema_percebido: "duvida" } });
const semPonto = (value: string) => value.replace(/[.\s]+$/, "");

/** O que a REGRA ANTIGA gravou (a v2 do readback): ângulo com o enum cru; CTA do Pilar = objetivo; Suporte = "Aprofundar no artigo Pilar…"; público pendente. */
function textoDaRegraAntiga(id: string, titulo: string, papel: "Pilar" | "Suporte") {
  const pilar = AZUL_REAL[0][2];
  return {
    angle: `${semPonto(titulo)} — intenção ${INTENCAO[id]} confirmada pela SERP.`,
    cta: papel === "Pilar" ? `Próximo passo do Silo “Wi-Fi e fibra óptica”: ${semPonto(OBJETIVO)}.` : `Aprofundar no artigo Pilar do Silo “Wi-Fi e fibra óptica”: “${semPonto(pilar)}”.`,
    problem: `Quem busca “x” quer resolver: ${titulo}`,
    audience: EDITORIAL_PENDING_TEXT,
    brandObjective: `C${semPonto(OBJETIVO.slice(1))}.`,
    promise: "Escopo do artigo.",
  };
}

type Mesa = { articles: VersionEnvelope<ArticleDNA>[]; writes: number };
async function mesaDoReadback(override: Partial<Record<string, Partial<ArticleDNA>>> = {}): Promise<Mesa> {
  const articles: VersionEnvelope<ArticleDNA>[] = [];
  const pacotes = readArchitectSubjectStandings(mesaWifiReal());
  for (const [id, keyword, titulo, , papel, volume] of AZUL_REAL) {
    const base = deterministicArticleDnaPayload(buildProvisionalGroups([kw(id, keyword, volume ?? 0)])[0], MARCA_WIFI);
    const payload = {
      ...base, articleId: id, principalKeywordId: id, hierarchy: papel, architectureStatus: "architecture_confirmed",
      keywordReferences: base.keywordReferences.map(reference => ({ ...reference, keywordId: id })),
      subject: { keywordId: id, phrase: titulo, note: null, destinationUrl: null, attachedAt: "2026-10-15T00:56:23.995Z", attachedBy: ATOR, approvedPackageRef: pacotes.get(id)!.approvedPackageRef },
      serpAssessmentRef: { entityId: `serp:${id}`, versionId: `serp:${id}:v1`, contentHash: HASH },
      mainIntent: INTENCAO[id],
      ...textoDaRegraAntiga(id, titulo, papel),
      ...(override[id] ?? {}),
    } as unknown as ArticleDNA;
    articles.push(await createVersionEnvelope({ entityId: id, versionNumber: 2, origin: "human", changeReason: "Linha editorial do plano (regra antiga)", createdBy: ATOR, payload }));
  }
  return { articles, writes: 0 };
}

function deps(mesa: Mesa, publico: string[] | null) {
  const linhas = mesaWifiReal().filter(row => String(row.id).startsWith("k"));
  return {
    groupPlans: async () => [{ id: AZUL, name: "Wi-Fi e fibra óptica", color: "azul", origin: "declared_plan", status: "active", plan: PLANO, planVersion: 4, planHash: null, siloId: null, lockVersion: 7 }] as never,
    inputs: async () => ({
      standings: readArchitectSubjectStandings(linhas),
      rows: new Map(linhas.map(row => [String(row.id), row])),
      workspace: { articleDnas: mesa.articles.map(version => structuredClone(version)) },
    }) as never,
    brandAudience: async () => publico,
    write: async (_runtime: unknown, version: VersionEnvelope<ArticleDNA>) => { mesa.writes += 1; mesa.articles.push(structuredClone(version)); return { versionId: version.versionId, contentHash: version.contentHash }; },
    now: () => "2026-10-15T21:00:00.000Z",
  };
}
const context = { brandId: MARCA_WIFI, actorUserId: ATOR, module: "arquiteto", action: "approve", supabase: null } as never;
const runtime = { context, authorize: async () => context } as never;
const vigente = (mesa: Mesa, id: string) => mesa.articles.filter(version => version.payload.articleId === id).sort((a, b) => b.versionNumber - a.versionNumber)[0];

test("1 · o ângulo vai em pt-BR: o rótulo da plataforma no lugar do enum cru (comercial investigativa, informativa)", async () => {
  const mesa = await mesaDoReadback();
  const previa = await previewPlanEditorialLine(context, AZUL, deps(mesa, null));
  const pilar = previa.lines.find(line => line.keywordId === "k9")!;
  const angulo = pilar.changes.find(change => change.field === "angle")!;
  assert.equal(angulo.before, "Internet fibra óptica ou internet comum: qual a diferença e qual escolher? — intenção commercial_investigation confirmada pela SERP.");
  assert.equal(angulo.after, "Internet fibra óptica ou internet comum: qual a diferença e qual escolher? — intenção comercial investigativa confirmada pela SERP.");
  assert.match(angulo.source, /corrige o texto da regra antiga/);
  const suporte = previa.lines.find(line => line.keywordId === "k11")!.changes.find(change => change.field === "angle")!;
  assert.equal(suporte.after, "Wi-Fi lento em casa: 10 causas comuns e como melhorar a conexão — intenção informativa confirmada pela SERP.");
  for (const line of previa.lines) for (const change of line.changes) assert.doesNotMatch(change.after, /commercial_investigation|informational|transactional|navigational/, `${line.keywordId}: nada de enum cru`);
});

test("2 · o CTA do Pilar é para o leitor (os Suportes pelos Assuntos); os Suportes ficam; só o texto da regra antiga é corrigido, como versão seguinte", async () => {
  const mesa = await mesaDoReadback();
  const previa = await previewPlanEditorialLine(context, AZUL, deps(mesa, null));
  const cta = previa.lines.find(line => line.keywordId === "k9")!.changes.find(change => change.field === "cta")!;
  assert.match(cta.before, /^Próximo passo do Silo “Wi-Fi e fibra óptica”: conquistar tráfego/);
  assert.equal(cta.after, "Leia também os artigos do Silo “Wi-Fi e fibra óptica”: “Qual a diferença entre internet e Wi-Fi? Entenda antes de contratar”, “Wi-Fi lento em casa: 10 causas comuns e como melhorar a conexão”, “Quantos Mega de internet precisa para assistir Netflix, YouTube e streaming?” e mais 3.");
  assert.doesNotMatch(cta.after, /conquistar tráfego|objetivo/i, "o objetivo interno do plano nunca vai para o leitor");
  assert.equal(cta.source, "Suportes do plano (Assuntos) · corrige o texto da regra antiga");
  for (const id of ["k10", "k11", "k12", "k13", "k14", "k15"]) {
    assert.equal(previa.lines.find(line => line.keywordId === id)!.changes.some(change => change.field === "cta"), false, `${id}: o CTA do Suporte já sai certo`);
  }
  // Os 7 entram (ângulo de todos; CTA só do Pilar); nada além do texto gerado.
  assert.deepEqual(previa.lines.map(line => [line.keywordId, line.changes.map(change => change.field).sort()]), [
    ["k9", ["angle", "cta"]], ["k10", ["angle"]], ["k11", ["angle"]], ["k12", ["angle"]], ["k13", ["angle"]], ["k14", ["angle"]], ["k15", ["angle"]],
  ]);

  // Aplicar: versão seguinte (v3), relida; depois, a próxima prévia não tem mais nada (idempotente).
  for (const line of previa.lines) {
    const feito = await applyPlanEditorialLine(runtime, { groupId: AZUL, articleId: line.articleId, lineHash: line.lineHash }, deps(mesa, null));
    assert.equal(feito.status, "written");
    assert.equal(feito.versionNumber, 3);
    assert.match(feito.message, /Público continua pendente: Aprove o BrandDNA em Marca e rode a Linha editorial de novo\./);
  }
  assert.equal(mesa.writes, 7);
  const pilar = vigente(mesa, "k9");
  assert.equal(pilar.versionNumber, 3);
  assert.equal(pilar.previousVersionId, mesa.articles.find(version => version.payload.articleId === "k9" && version.versionNumber === 2)!.versionId, "a v2 fica no histórico");
  assert.match(pilar.payload.cta, /^Leia também os artigos do Silo/);
  assert.equal(pilar.payload.brandObjective, `C${semPonto(OBJETIVO.slice(1))}.`, "o objetivo continua no campo Objetivo");
  assert.match(pilar.changeReason, /CTA ← Suportes do plano \(Assuntos\) · corrige o texto da regra antiga/);
  const depois = await previewPlanEditorialLine(context, AZUL, deps(mesa, null));
  assert.deepEqual(depois.lines.map(line => line.changes.length), [0, 0, 0, 0, 0, 0, 0], "idempotente: nada a regravar");
  assert.deepEqual(depois.acceptedArticleIds, []);
  // Repetir a mesma confirmação não grava de novo.
  const repetido = await applyPlanEditorialLine(runtime, { groupId: AZUL, articleId: "k9", lineHash: previa.lines[0].lineHash }, deps(mesa, null));
  assert.equal(repetido.status, "kept");
  assert.equal(mesa.writes, 7);
});

test("2 · texto editado por gente nunca é tocado: CTA e ângulo escritos à mão ficam, mesmo parecidos com a regra antiga", async () => {
  const mesa = await mesaDoReadback({
    k9: { cta: "Próximo passo do Silo “Wi-Fi e fibra óptica”: compare os planos da WifiConecta.", angle: "Fibra ou internet comum — escrito pelo dono, intenção comercial." },
    k11: { angle: "Wi-Fi lento — intenção informational confirmada pela SERP, revisado pelo dono" },
  });
  const previa = await previewPlanEditorialLine(context, AZUL, deps(mesa, null));
  assert.deepEqual(previa.lines.find(line => line.keywordId === "k9")!.changes, [], "CTA e ângulo do Pilar são do dono");
  assert.equal(previa.lines.find(line => line.keywordId === "k11")!.changes.length, 0, "o ângulo revisado à mão não tem a forma exata da regra antiga");
  assert.equal(previa.lines.find(line => line.keywordId === "k12")!.changes.length, 1, "o resto segue corrigido");
});

test("6 · sem BrandDNA aprovado: a prévia diz 'Aprove o BrandDNA em Marca e rode a Linha editorial de novo'; com o BrandDNA aprovado, a próxima Linha editorial preenche o público (só ele)", async () => {
  const mesa = await mesaDoReadback();
  const sem = await previewPlanEditorialLine(context, AZUL, deps(mesa, null));
  assert.equal(sem.brandDnaAvailable, false);
  assert.match(sem.summary, /Sem BrandDNA aprovado, o Público fica pendente: Aprove o BrandDNA em Marca e rode a Linha editorial de novo\./);
  assert.match(sem.lines[0].sentence, /Público pendente \(sem BrandDNA aprovado\): Aprove o BrandDNA em Marca e rode a Linha editorial de novo\./);
  for (const line of sem.lines) await applyPlanEditorialLine(runtime, { groupId: AZUL, articleId: line.articleId, lineHash: line.lineHash }, deps(mesa, null));
  const publico = ["Famílias que contratam internet em casa", "Quem trabalha em home office"];
  const com = await previewPlanEditorialLine(context, AZUL, deps(mesa, publico));
  assert.equal(com.brandDnaAvailable, true);
  assert.doesNotMatch(com.summary, /Aprove o BrandDNA/);
  assert.deepEqual(com.lines.map(line => line.changes.map(change => [change.field, change.after, change.source])), Array(7).fill([["audience", "Famílias que contratam internet em casa; Quem trabalha em home office", "BrandDNA aprovado"]]));
  for (const line of com.lines) {
    const feito = await applyPlanEditorialLine(runtime, { groupId: AZUL, articleId: line.articleId, lineHash: line.lineHash }, deps(mesa, publico));
    assert.equal(feito.versionNumber, 4);
    assert.doesNotMatch(feito.message, /pendente/);
  }
  assert.equal(vigente(mesa, "k13").payload.audience, "Famílias que contratam internet em casa; Quem trabalha em home office");
  const fim = await previewPlanEditorialLine(context, AZUL, deps(mesa, publico));
  assert.deepEqual(fim.acceptedArticleIds, [], "tudo preenchido: nada a gravar");
});

test("2 · a etapa '3 · Linha editorial' reaparece para o texto da regra antiga (mesmo com tudo preenchido) e some depois da correção", () => {
  const preenchido = { angle: "Ângulo do dono.", cta: "Fale com a WifiConecta.", problem: "Problema.", audience: "Famílias", brandObjective: `C${semPonto(OBJETIVO.slice(1))}.` };
  assert.equal(articleEditorialNeedsLine(preenchido), false);
  assert.equal(articleEditorialNeedsLine({ ...preenchido, angle: "Assunto — intenção commercial_investigation confirmada pela SERP." }), true, "enum cru no ângulo");
  assert.equal(articleEditorialNeedsLine({ ...preenchido, cta: `Próximo passo do Silo “Wi-Fi e fibra óptica”: ${semPonto(OBJETIVO)}.` }), true, "objetivo do plano no CTA");
  assert.equal(articleEditorialNeedsLine({ ...preenchido, cta: "Próximo passo do Silo “Wi-Fi e fibra óptica”: compare os planos." }), false, "CTA escrito à mão fica");
  assert.equal(articleEditorialNeedsLine({ ...preenchido, angle: "Assunto — intenção comercial investigativa confirmada pela SERP." }), false, "o ângulo novo, em pt-BR");
  assert.equal(isLegacyEditorialAngle("Assunto — intenção informational confirmada pela SERP."), true);
  assert.equal(isLegacyEditorialCta(`Próximo passo do Silo: ${semPonto(OBJETIVO)}.`, [OBJETIVO]), true, "sem nome do Silo também era da regra antiga");
  assert.equal(editorialIntentLabel("commercial_investigation"), "comercial investigativa");
  assert.equal(editorialIntentLabel("informational"), "informativa");
  assert.equal(editorialIntentLabel("transactional"), "transacional");
  assert.equal(editorialIntentLabel("navigational"), "navegacional");
  assert.equal(editorialIntentLabel("unknown"), null, "desconhecida: o ângulo fica só com o Assunto");
  assert.equal(editorialSupportList(["A", "B"]), "“A” e “B”");
  assert.equal(editorialSupportList(["A"]), "“A”");
});
