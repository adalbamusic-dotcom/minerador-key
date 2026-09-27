import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { MAX_ARTICLE_KEYWORDS, buildArticleFormationUniverse, sameArticleAffinity, summarizeArticleFormation, type ArticleFormationKeyword, type ArticleFormationUniverse } from "../lib/arquiteto/article-formation.ts";
import { FORM_NEW_FROM_LEFTOVERS_ACTION, planSiloArticleFormation, proposeCrossSiloReinforcements, reservePriorityArticleGroups } from "../lib/arquiteto/article-formation-priority.ts";
import { siloThemeTokens } from "../lib/arquiteto/article-formation.ts";
import { resolveArticleClassification, type ClassificationEvidence } from "../lib/arquiteto/article-classification-closure.ts";
import { articleRunRowsFromGates, buildArticleRunReadout, formatArticleRunReadout } from "../lib/arquiteto/process-observability.ts";
import { siloContextTokens } from "../lib/arquiteto/semantic-nucleus.ts";
import { SUBJECT_AWAITING_SUPPORT_LABEL, SUBJECT_SUGGESTED_TRUNK_LABEL, splitUngroupedBySubjectAnchor } from "../lib/arquiteto/declared-subject.ts";

const siloRef = "territory:test";
const kw = (keywordId: string, keyword: string, overrides: Partial<ArticleFormationKeyword> = {}): ArticleFormationKeyword => ({
  keywordId, keyword, intent: "informacional", volume: 100, kgr: null,
  entity: "clinica", problem: "captar pacientes", isPublished: false, ...overrides,
});

test("publicado recebe sustentação primeiro; Assunto reserva o restante; novo artigo só usa sobras", () => {
  const published = [kw("pub", "como atrair pacientes para clínica", { isPublished: true, volume: null })];
  const free = [
    kw("apoio", "como atrair pacientes para clínicas"),
    kw("s1", "captação de pacientes sem tráfego pago", { problem: "sem anuncios" }),
    kw("s2", "leads sem tráfego pago para clínica", { problem: "sem anuncios" }),
    kw("novo", "preço de software odontológico", { intent: "comercial", entity: "software", problem: "preco" }),
  ];
  const planned = reservePriorityArticleGroups({
    published, free,
    subjectClaims: [{ subjectKeywordId: "assunto", keywordIds: ["s1", "s2"] }],
    principalEligibleKeywordIds: new Set(["s1", "s2"]),
    siloTokens: new Set<string>(),
  });
  assert.equal(planned.publishedGroups.length, 1);
  assert.equal(planned.publishedGroups[0].principalKeywordId, "pub");
  assert.ok(planned.publishedGroups[0].keywordIds.includes("apoio"));
  assert.equal(planned.subjectGroups[0]?.subjectKeywordId, "assunto");
  assert.deepEqual(new Set(planned.subjectGroups[0]?.keywordIds), new Set(["s1", "s2"]));
  assert.deepEqual(planned.remainingFree.map(item => item.keywordId), ["novo"]);
});

test("núcleo com 27 keywords mantém seis no artigo e 21 visíveis fora dele", () => {
  const keywords = Array.from({ length: 27 }, (_, index) => kw(`k${index}`, `como captar pacientes clinica ${index}`));
  const result = buildArticleFormationUniverse({
    siloRef, siloLabel: "Captação", siloSlug: "/captacao", keywords,
    groups: [{ principalKeywordId: "k0", keywordIds: keywords.map(item => item.keywordId) }],
  });
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].keywords.length, 6);
  assert.equal(result.candidates[0].overflowKeywordIds.length, 0);
  assert.equal(result.ungroupedKeywordIds.length, 21);
  assert.equal(new Set([...result.candidates[0].keywords.map(item => item.keywordId), ...result.ungroupedKeywordIds]).size, 27);
  // D8 — cada uma fica em Keywords não agrupadas COM o motivo.
  assert.equal(result.deferredKeywords?.length, 21);
  assert.ok(result.deferredKeywords!.every(item => /teto de seis/.test(item.reason)));
  // Excedente não é Assunto: não recebe o selo "aguardando sustentação".
  assert.equal(result.awaitingSupportSubjectKeywordIds, undefined);
});

test("catálogo do site não retira a âncora publicada nem sua sustentação do candidato", () => {
  const keywords = [
    kw("pub", "promoções para estética", { isPublished: true, volume: null }),
    kw("apoio", "promoções para clínica de estética"),
  ];
  const result = buildArticleFormationUniverse({
    siloRef, siloLabel: "Leads sem tráfego", siloSlug: "/leads",
    keywords,
    groups: [{ principalKeywordId: "pub", keywordIds: ["pub", "apoio"] }],
    publishedArticles: [{ normalizedUrl: "site.test/leads/promocoes-para-estetica", path: "/leads/promocoes-para-estetica", label: "promoções para clínica de estética", canonical: "https://site.test/leads/promocoes-para-estetica", matchedKeywordId: "pub" }],
  });
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].principalKeywordId, "pub");
  assert.deepEqual(new Set(result.candidates[0].keywords.map(item => item.keywordId)), new Set(["pub", "apoio"]));
});

test("Assunto sem principal de Volume validado não vira artigo nem some", () => {
  const free = [kw("s1", "sem redes sociais", { volume: null })];
  const planned = reservePriorityArticleGroups({
    published: [], free, subjectClaims: [{ subjectKeywordId: "assunto", keywordIds: ["s1"] }],
    principalEligibleKeywordIds: new Set(), siloTokens: new Set<string>(),
  });
  assert.equal(planned.subjectGroups.length, 0);
  assert.deepEqual(planned.awaitingSubject, ["s1"]);
  assert.equal(planned.remainingFree.length, 0);
});

test("busca disputada por dois Assuntos aguarda revisão sem receber tronco arbitrário", () => {
  const planned = reservePriorityArticleGroups({
    published: [], free: [kw("comum", "captação de pacientes")],
    subjectClaims: [
      { subjectKeywordId: "assunto-a", keywordIds: ["comum"] },
      { subjectKeywordId: "assunto-b", keywordIds: ["comum"] },
    ],
    principalEligibleKeywordIds: new Set(["comum"]), siloTokens: new Set<string>(),
  });
  assert.equal(planned.subjectGroups.length, 0);
  assert.deepEqual(planned.awaitingSubject, ["comum"]);
});

/* =====================================================================
 * O CENÁRIO DO DONO (AdalbaPro, 2026-09-26), EM FIXTURE.
 *
 * Silos com artigos publicados reconhecidos só pelo Vínculo (status
 * "aprovado", sem sitemap nem catálogo), Assuntos com e sem sustentação —
 * inclusive dois que SÃO páginas publicadas sem Volume —, 130 livres e um
 * núcleo de 27 candidatas. Nenhuma rede, nenhum provider.
 * ===================================================================== */

const livre = (keywordId: string, keyword: string, overrides: Partial<ArticleFormationKeyword> = {}): ArticleFormationKeyword => ({
  keywordId, keyword, intent: "Informativa", volume: 90, kgr: null,
  entity: null, problem: null, funnel: "TOFU", isPublished: false, ...overrides,
});
const publicada = (keywordId: string, keyword: string, overrides: Partial<ArticleFormationKeyword> = {}) =>
  livre(keywordId, keyword, { isPublished: true, volume: null, ...overrides });

const MODIFICADORES = ["rapido", "barato", "gratis", "instagram", "whatsapp", "google", "parceria", "evento", "palestra",
  "blog", "site", "email", "panfleto", "radio", "jornal", "outdoor", "podcast", "youtube", "tiktok", "linkedin",
  "facebook", "telegram", "comunidade", "vizinhanca", "convenio", "feira", "cupom"];

function cenarioLeads(opcoes: { formNewFromLeftovers?: boolean } = {}) {
  const publicadas = [
    publicada("p-leads-1", "captar leads clinica odontologica"),
    publicada("p-leads-2", "promocoes para clinica de estetica"),
    publicada("p-leads-3", "programa de indicacao de pacientes"),
    publicada("p-leads-4", "parcerias locais para consultorio"),
    publicada("p-leads-5", "eventos gratuitos para atrair pacientes"),
    publicada("p-leads-6", "conteudo educativo para pacientes"),
  ];
  // O núcleo de 27: todas repetem "captar clinica odontologica".
  const nucleo = MODIFICADORES.map((mod, index) => livre(`n-${index}`, `captar leads clinica odontologica ${mod}`));
  const reforcoEstetica = [
    livre("e-1", "promocoes clinica de estetica verao"),
    livre("e-2", "promocoes para clinica de estetica natal"),
  ];
  // Livres distintas: cada uma com um tema próprio, sem convergir com nada.
  const distintas = Array.from({ length: 81 }, (_, index) => livre(`d-${index}`, `tema${index}a assunto${index}b pergunta${index}c`));
  const keywords = [...publicadas, ...nucleo, ...reforcoEstetica, ...distintas];
  return {
    keywords,
    publicadas,
    plan: planSiloArticleFormation({
      siloRef: "territory:leads",
      siloLabel: "Leads sem Tráfego Pago",
      siloSlug: "/leads-sem-trafego-pago",
      siloTokens: siloContextTokens({ name: "Leads sem Tráfego Pago", slug: "/leads-sem-trafego-pago" }),
      keywords,
      subjects: new Map(keywords.map(keyword => [keyword.keywordId, { declared: false, volumeValidated: !keyword.isPublished }] as const)),
      // O Vínculo diz onde cada publicada mora; o catálogo do site está vazio.
      publishedPages: publicadas.map(keyword => ({
        keywordId: keyword.keywordId,
        url: `https://adalbapro.com.br/leads-sem-trafego-pago/${keyword.keyword.replace(/ /g, "-")}`,
        canonical: `https://adalbapro.com.br/leads-sem-trafego-pago/${keyword.keyword.replace(/ /g, "-")}`,
      })),
      catalogPages: [],
      ...opcoes,
    }),
  };
}

function cenarioCaptacao() {
  const assuntoPublicado = publicada("p-cap-1", "como atrair pacientes sem redes sociais");
  const assuntoPublicado2 = publicada("p-cap-2", "como atrair pacientes para clinica");
  const assuntoSemVolume = livre("a-sem-volume", "da primeira pesquisa ao agendamento", { volume: null });
  const assuntoComVolume = livre("a-com-volume", "marketing para clinicas", { volume: 320 });
  const sustentacoes = [
    livre("s-1", "atrair pacientes sem instagram"),
    livre("s-2", "atrair pacientes sem redes sociais para clinica"),
  ];
  const apoioPublicada2 = livre("s-3", "como atrair pacientes para clinica odontologica");
  const sustentacaoMarketing = [
    livre("m-1", "marketing digital para clinicas"),
    livre("m-2", "marketing para clinica medica"),
  ];
  const distintas = Array.from({ length: 15 }, (_, index) => livre(`c-${index}`, `topico${index}x detalhe${index}y`));
  const keywords = [assuntoPublicado, assuntoPublicado2, assuntoSemVolume, assuntoComVolume, ...sustentacoes, apoioPublicada2, ...sustentacaoMarketing, ...distintas];
  const declarados = new Set(["p-cap-1", "p-cap-2", "a-sem-volume", "a-com-volume"]);
  return {
    keywords,
    plan: planSiloArticleFormation({
      siloRef: "territory:captacao",
      siloLabel: "Captação de Pacientes",
      siloSlug: "/captacao-de-pacientes",
      siloTokens: siloContextTokens({ name: "Captação de Pacientes", slug: "/captacao-de-pacientes" }),
      keywords: keywords.map(keyword => declarados.has(keyword.keywordId) && !keyword.isPublished && keyword.volume === null
        ? { ...keyword, subjectHeldOut: true }
        : keyword),
      subjects: new Map(keywords.map(keyword => [keyword.keywordId, {
        declared: declarados.has(keyword.keywordId),
        // Os três Assuntos do dono vieram sem Volume; o de marketing tem.
        volumeValidated: keyword.volume !== null,
      }] as const)),
      subjectClaims: [
        { subjectKeywordId: "p-cap-1", keywordIds: ["s-1", "s-2"] },
        { subjectKeywordId: "a-com-volume", keywordIds: ["m-1", "m-2"] },
      ],
      publishedPages: [
        { keywordId: "p-cap-1", url: "https://adalbapro.com.br/captacao-de-pacientes/como-atrair-pacientes-sem-redes-sociais", canonical: null },
        { keywordId: "p-cap-2", url: "https://adalbapro.com.br/captacao-de-pacientes/como-atrair-pacientes-para-clinica", canonical: null },
      ],
    }),
  };
}

const candidatoDe = (universe: ArticleFormationUniverse, keywordId: string) =>
  universe.candidates.find(candidate => candidate.keywords.some(item => item.keywordId === keywordId)) ?? null;

function conservacao(universe: ArticleFormationUniverse) {
  const lugares = new Map<string, number>();
  const marca = (keywordId: string) => lugares.set(keywordId, (lugares.get(keywordId) ?? 0) + 1);
  for (const candidate of universe.candidates) for (const item of candidate.keywords) marca(item.keywordId);
  for (const keywordId of universe.ungroupedKeywordIds) marca(keywordId);
  for (const keywordId of universe.anchoredSubjectKeywordIds || []) marca(keywordId);
  return lugares;
}

test("cenário do dono · 130 livres: nenhuma keyword some, nenhuma aparece duas vezes, nenhum candidato passa de seis", () => {
  const leads = cenarioLeads();
  const captacao = cenarioCaptacao();
  assert.equal(leads.keywords.filter(keyword => !keyword.isPublished).length + captacao.keywords.filter(keyword => !keyword.isPublished).length - 2, 130,
    "130 livres (fora publicadas e Assuntos)");
  for (const { plan, keywords } of [leads, captacao]) {
    const lugares = conservacao(plan.universe);
    for (const keyword of keywords) assert.equal(lugares.get(keyword.keywordId), 1, `${keyword.keyword} precisa estar em exatamente um lugar`);
    for (const candidate of plan.universe.candidates) {
      assert.ok(candidate.keywords.length <= MAX_ARTICLE_KEYWORDS, `${candidate.candidateRef} tem ${candidate.keywords.length}`);
    }
  }
});

test("cenário do dono · publicados reconhecidos pelo Vínculo sem catálogo: contagem certa, âncora e principal preservadas", () => {
  const leads = cenarioLeads();
  const captacao = cenarioCaptacao();
  const resumo = summarizeArticleFormation([leads.plan.universe, captacao.plan.universe]);
  assert.equal(resumo.publishedArticles, 8, "6 publicadas em Leads + 2 em Captação, sem sitemap");
  for (const pub of [...leads.publicadas, ...captacao.keywords.filter(keyword => keyword.isPublished)]) {
    const candidato = candidatoDe(pub.keywordId.startsWith("p-leads") ? leads.plan.universe : captacao.plan.universe, pub.keywordId)!;
    assert.ok(candidato, `${pub.keyword} não pode ir para Keywords não agrupadas`);
    assert.equal(candidato.principalKeywordId, pub.keywordId, "a publicada é a principal do próprio artigo");
    assert.equal(candidato.suggestedSlug, null, "slug publicado não é reproposto");
    assert.equal(candidato.keywords.filter(item => item.keywordId.startsWith("p-")).length, 1, "duas publicadas nunca se fundem");
  }
  // O catálogo continua evidência adicional: o endereço do Vínculo protege o slug.
  assert.ok(leads.plan.universe.publishedArticles.every(item => item.path.startsWith("/leads-sem-trafego-pago/")));
});

test("cenário do dono · publicado e Assunto nunca isolados, 'Não aplicável' ou 'sem convergência'", () => {
  const leads = cenarioLeads();
  const captacao = cenarioCaptacao();
  for (const universe of [leads.plan.universe, captacao.plan.universe]) {
    for (const audit of universe.singletonAudits) {
      const keywordId = audit.keywordId;
      if (keywordId.startsWith("p-")) assert.equal(audit.classification, "PUBLISHED_ANCHOR", keywordId);
      if (keywordId === "a-com-volume") assert.equal(audit.classification, "SUBJECT_TRUNK");
    }
  }
  const resumo = summarizeArticleFormation([leads.plan.universe, captacao.plan.universe]);
  const publicadasSozinhas = [leads.plan.universe, captacao.plan.universe].flatMap(universe => universe.candidates)
    .filter(candidate => candidate.keywords.length === 1 && candidate.principalKeywordId.startsWith("p-")).length;
  assert.equal(resumo.publishedAwaitingSupport, publicadasSozinhas);
  // "candidato individual" conta só livres: publicado sozinho é artigo completo.
  const livresSozinhas = [leads.plan.universe, captacao.plan.universe].flatMap(universe => universe.candidates)
    .filter(candidate => candidate.keywords.length === 1 && !candidate.principalKeywordId.startsWith("p-") && candidate.principalKeywordId !== "a-com-volume").length;
  assert.equal(resumo.singles, livresSozinhas);

  // A compatibilidade do resumo do artigo: nunca "Não aplicável" para publicado ou Assunto.
  const base: ClassificationEvidence = {
    principalIntent: "Informativa", compositionIntents: [], serpObservedIntent: null, serpMixedIntent: false, serpResolved: false,
    principalFunnel: "TOFU", compositionFunnels: [], principalKgrScore: null, principalKgrApplicability: "not_applicable",
    fullKgr: false, humanKgrDecision: null, awaitingHumanKgrDecision: false, compatibilityConflicts: 0, compatibilityEvaluated: 0,
    compositionKeywordCount: 1, isPublished: false, principalProtected: false,
  };
  assert.equal(resolveArticleClassification({ ...base, isPublished: true, principalProtected: true }).compatibility.value, "COMPATIBLE");
  assert.match(resolveArticleClassification({ ...base, isPublished: true }).compatibility.reason, /aguarda reforço/);
  assert.equal(resolveArticleClassification({ ...base, principalIsSubject: true }).compatibility.value, "COMPATIBLE");
  // Livre sozinha continua sem par a comparar.
  assert.equal(resolveArticleClassification(base).compatibility.value, "NOT_APPLICABLE");
});

test("cenário do dono · publicado que também é Assunto sem Volume prevalece e recebe as sustentações dele", () => {
  const { plan } = cenarioCaptacao();
  const universe = plan.universe;
  const doAssuntoPublicado = candidatoDe(universe, "p-cap-1")!;
  assert.equal(doAssuntoPublicado.principalKeywordId, "p-cap-1");
  assert.deepEqual(new Set(doAssuntoPublicado.keywords.map(item => item.keywordId)), new Set(["p-cap-1", "s-1", "s-2"]),
    "as sustentações do Assunto publicado entram na página que está no ar");
  // Nenhum artigo concorrente com principal livre para as mesmas buscas.
  assert.equal(universe.candidates.filter(candidate => candidate.keywords.some(item => item.keywordId === "s-1")).length, 1);
  assert.ok(!universe.ungroupedKeywordIds.includes("p-cap-1"));
  assert.ok(!(universe.awaitingSupportSubjectKeywordIds || []).includes("p-cap-1"));
  // A outra publicada-Assunto recebe a livre compatível antes de nascer artigo novo (D1/D7).
  assert.deepEqual(new Set(candidatoDe(universe, "p-cap-2")!.keywords.map(item => item.keywordId)), new Set(["p-cap-2", "s-3"]));
});

test("cenário do dono · Assunto com sustentação vira tronco-principal; sem sustentação aguarda, como estado normal", () => {
  const { plan } = cenarioCaptacao();
  const universe = plan.universe;
  const marketing = candidatoDe(universe, "a-com-volume")!;
  assert.equal(marketing.principalKeywordId, "a-com-volume", "Assunto com Volume validado é a principal (B5)");
  assert.equal(marketing.suggestedSubjectKeywordId, "a-com-volume");
  assert.deepEqual(new Set(marketing.keywords.map(item => item.keywordId)), new Set(["a-com-volume", "m-1", "m-2"]));
  // Assunto sem Volume e sem sustentação: nas sobras, com o selo, nunca principal.
  assert.ok(universe.ungroupedKeywordIds.includes("a-sem-volume"));
  assert.deepEqual(universe.awaitingSupportSubjectKeywordIds, ["a-sem-volume"]);
  assert.equal(candidatoDe(universe, "a-sem-volume"), null);
});

test("cenário do dono · o núcleo de 27 com publicados no lote: livres reforçam a publicada e a sobra fica com motivo, sem artigo novo (D1.4)", () => {
  const { plan } = cenarioLeads();
  const universe = plan.universe;
  assert.equal(plan.objective, "improve", "o lote tem publicados: o objetivo é melhorá-los");
  const doNucleo = (keywordId: string) => keywordId.startsWith("n-");
  // 1) A publicada do mesmo tema recebe primeiro até completar seis (D1).
  const publicadaDoTema = candidatoDe(universe, "p-leads-1")!;
  assert.equal(publicadaDoTema.keywords.length, MAX_ARTICLE_KEYWORDS);
  assert.equal(publicadaDoTema.keywords.filter(item => doNucleo(item.keywordId)).length, 5);
  // 2) Nenhum artigo novo nasce sozinho: todo candidato é uma publicada.
  assert.ok(universe.candidates.every(candidate => candidate.principalKeywordId.startsWith("p-")),
    universe.candidates.filter(candidate => !candidate.principalKeywordId.startsWith("p-")).map(candidate => candidate.principalKeywordId).join(","));
  // 3) As 22 do núcleo que não couberam e as 81 distintas ficam visíveis, com o motivo e a ação explícita.
  const adiadas = universe.deferredKeywords || [];
  assert.equal(adiadas.filter(item => doNucleo(item.keywordId)).length, 27 - 5);
  assert.equal(adiadas.filter(item => item.keywordId.startsWith("d-")).length, 81);
  assert.ok(adiadas.every(item => item.reason.includes(FORM_NEW_FROM_LEFTOVERS_ACTION) && /não vira artigo novo sozinha/.test(item.reason)));
  assert.equal(plan.leftoverKeywordIds.length, 22 + 81, "as sobras são as candidatas a reforçar outro Silo");
  // 4) As livres de estética reforçam a publicada de estética.
  assert.deepEqual(new Set(candidatoDe(universe, "p-leads-2")!.keywords.map(item => item.keywordId)), new Set(["p-leads-2", "e-1", "e-2"]));
});

test("cenário do dono · 'Formar artigos novos com as sobras': a ação explícita forma artigos, o novo para em seis e o resto fica com motivo", () => {
  const { plan, keywords } = cenarioLeads({ formNewFromLeftovers: true });
  const universe = plan.universe;
  assert.equal(plan.formNewFromLeftovers, true);
  const doNucleo = (keywordId: string) => keywordId.startsWith("n-");
  // Os publicados continuam reforçados primeiro.
  assert.equal(candidatoDe(universe, "p-leads-1")!.keywords.filter(item => doNucleo(item.keywordId)).length, 5);
  // Um artigo novo com o que sobrou do núcleo, no teto.
  const novos = universe.candidates.filter(candidate => !candidate.principalKeywordId.startsWith("p-") && candidate.keywords.some(item => doNucleo(item.keywordId)));
  assert.equal(novos.length, 1, "o mesmo assunto não vira vários artigos concorrentes");
  assert.equal(novos[0].keywords.length, MAX_ARTICLE_KEYWORDS);
  const adiadas = (universe.deferredKeywords || []).filter(item => doNucleo(item.keywordId));
  assert.equal(adiadas.length, 27 - 5 - 6);
  assert.ok(adiadas.every(item => /teto de seis/.test(item.reason) && /revisão humana/.test(item.reason)));
  // Todo candidato no teto; nada some.
  assert.ok(universe.candidates.every(candidate => candidate.keywords.length <= MAX_ARTICLE_KEYWORDS));
  const lugares = conservacao(universe);
  for (const keyword of keywords) assert.equal(lugares.get(keyword.keywordId), 1, keyword.keyword);
  assert.deepEqual(plan.leftoverKeywordIds, [], "com artigos novos pedidos, não há sobra a propor a outro Silo");
});

test("D1 · lote todo novo forma artigos desde o início; com âncora no LOTE, o Silo sem âncora não forma sozinho", () => {
  const siloTokens = siloContextTokens({ name: "Leads sem Tráfego Pago", slug: "/leads-sem-trafego-pago" });
  const keywords = [
    livre("t-1", "captar leads clinica odontologica agora"),
    livre("t-2", "captar leads clinica odontologica hoje"),
    livre("t-3", "captar leads clinica odontologica rapido"),
    livre("u-1", "tema isolado sem par"),
  ];
  const base = { siloRef: "territory:novo", siloLabel: "Leads sem Tráfego Pago", siloSlug: "/leads-sem-trafego-pago", siloTokens, keywords };
  const novo = planSiloArticleFormation(base);
  assert.equal(novo.objective, "new");
  assert.equal(candidatoDe(novo.universe, "t-1")?.keywords.length, 3, "lote todo novo: as livres formam artigo");
  // O MESMO Silo, num lote que tem publicados em outro Silo: o objetivo é do lote.
  const melhorar = planSiloArticleFormation({ ...base, batchObjective: "improve" });
  assert.equal(melhorar.universe.candidates.length, 0);
  assert.deepEqual(new Set(melhorar.leftoverKeywordIds), new Set(keywords.map(keyword => keyword.keywordId)));
  assert.equal(melhorar.universe.deferredKeywords?.length, 4);
  assert.ok(melhorar.universe.deferredKeywords!.some(item => item.reason.includes("formaria com outras 2 busca(s)")));
});

test("D1/D3 · Assunto sem Volume e sem sustentação sugerida vira artigo com as livres que convergem com ele", () => {
  const siloTokens = siloContextTokens({ name: "Captação de Pacientes", slug: "/captacao-de-pacientes" });
  const assunto = livre("assunto", "marketing odontologico para consultorio", { volume: null, subjectHeldOut: true });
  const keywords = [
    assunto,
    livre("m-1", "marketing odontologico para consultorio pequeno", { volume: 480 }),
    livre("m-2", "marketing odontologico para consultorio iniciante", { volume: 90 }),
    livre("fora", "software de agenda online", { volume: 300 }),
  ];
  const plan = planSiloArticleFormation({
    siloRef: "territory:captacao", siloLabel: "Captação de Pacientes", siloSlug: "/captacao-de-pacientes", siloTokens, keywords,
    subjects: new Map(keywords.map(keyword => [keyword.keywordId, { declared: keyword.keywordId === "assunto", volumeValidated: keyword.volume !== null }] as const)),
  });
  assert.equal(plan.objective, "improve", "Assunto no lote: melhorar");
  const artigo = candidatoDe(plan.universe, "m-1")!;
  assert.ok(artigo, "o Assunto virou artigo");
  assert.equal(artigo.suggestedSubjectKeywordId, "assunto", "o Assunto é o tronco sugerido");
  assert.ok(!artigo.keywords.some(item => item.keywordId === "assunto"), "o Assunto sem Volume nunca é membro nem principal (B5)");
  assert.deepEqual(new Set(artigo.keywords.map(item => item.keywordId)), new Set(["m-1", "m-2"]));
  assert.ok(!plan.awaitingSubjectKeywordIds.includes("assunto"));
  // A livre sem encaixe fica fora, com motivo, e não vira artigo novo.
  assert.equal(candidatoDe(plan.universe, "fora"), null);
  assert.deepEqual(plan.leftoverKeywordIds, ["fora"]);
});

test("D8 · a sobra que reforçaria um publicado de OUTRO Silo vira proposta com motivo, nunca movimento automático", () => {
  // Leads concentrou as livres; os publicados de Captação ficaram sem reforço.
  const tokensLeads = siloContextTokens({ name: "Leads sem Tráfego Pago", slug: "/leads-sem-trafego-pago" });
  const tokensCaptacao = siloContextTokens({ name: "Captação de Pacientes", slug: "/captacao-de-pacientes" });
  const leadsKeywords = [
    publicada("p-leads", "promocoes para estetica"),
    livre("l-1", "como atrair pacientes para o consultorio odontologico", { volume: 320 }),
    livre("l-2", "como atrair pacientes para o consultorio medico", { volume: 210 }),
    livre("l-3", "marketing para dentistas iniciantes", { volume: 150 }),
    livre("l-4", "como atrair pacientes consultorio comprar", { volume: 500, funnel: "BOFU" }),
    livre("l-5", "assunto totalmente diferente", { volume: 40 }),
  ];
  const captacaoKeywords = [
    publicada("p-cap", "como atrair pacientes para o consultorio"),
    publicada("p-cap-2", "marketing para dentistas"),
  ];
  const assuntoKeywords = [livre("a-cres", "crescimento de clinicas pequenas", { volume: null, subjectHeldOut: true })];
  const leads = planSiloArticleFormation({ siloRef: "territory:leads", siloLabel: "Leads sem Tráfego Pago", siloSlug: "/leads-sem-trafego-pago", siloTokens: tokensLeads, keywords: leadsKeywords, batchObjective: "improve" });
  const captacao = planSiloArticleFormation({ siloRef: "territory:captacao", siloLabel: "Captação de Pacientes", siloSlug: "/captacao-de-pacientes", siloTokens: tokensCaptacao, keywords: captacaoKeywords, batchObjective: "improve" });
  const crescimento = planSiloArticleFormation({
    siloRef: "territory:crescimento", siloLabel: "Crescimento de Clínicas", siloSlug: "/crescimento",
    siloTokens: siloContextTokens({ name: "Crescimento de Clínicas", slug: "/crescimento" }),
    keywords: assuntoKeywords, batchObjective: "improve",
    subjects: new Map([["a-cres", { declared: true, volumeValidated: false }]]),
  });
  // A formação não cruzou Silo: as livres de Leads não estão nos artigos de Captação.
  assert.ok(candidatoDe(captacao.universe, "p-cap")!.keywords.every(item => item.keywordId.startsWith("p-")));
  assert.deepEqual(crescimento.awaitingSubjectKeywordIds, ["a-cres"]);
  const todas = new Map([...leadsKeywords, ...captacaoKeywords, ...assuntoKeywords].map(keyword => [keyword.keywordId, keyword] as const));
  const propostas = proposeCrossSiloReinforcements({
    silos: [
      { siloRef: "territory:leads", siloLabel: "Leads sem Tráfego Pago", siloTokens: tokensLeads, plan: leads },
      { siloRef: "territory:captacao", siloLabel: "Captação de Pacientes", siloTokens: tokensCaptacao, plan: captacao },
      { siloRef: "territory:crescimento", siloLabel: "Crescimento de Clínicas", siloTokens: new Set<string>(), plan: crescimento },
    ],
    keywords: todas,
    // O Minerador sugeriu "l-5" como sustentação do Assunto de Crescimento.
    subjectClaims: [{ subjectKeywordId: "a-cres", keywordIds: ["l-5"] }],
    principalEligibleKeywordIds: new Set(["l-1", "l-2", "l-3", "l-4", "l-5"]),
  });
  const destinoDe = (keywordId: string) => propostas.find(item => item.keywordId === keywordId);
  assert.equal(destinoDe("l-1")?.anchorKeywordId, "p-cap");
  assert.equal(destinoDe("l-1")?.toSiloRef, "territory:captacao");
  assert.equal(destinoDe("l-1")?.fromSiloRef, "territory:leads");
  assert.equal(destinoDe("l-2")?.anchorKeywordId, "p-cap");
  assert.equal(destinoDe("l-3")?.anchorKeywordId, "p-cap-2");
  assert.match(destinoDe("l-3")!.reason, /reforça o artigo publicado "marketing para dentistas"/);
  // Contradição de DNA (funil diferente) nunca vira proposta (D5).
  assert.equal(destinoDe("l-4"), undefined);
  // A sustentação sugerida pelo Minerador vale como motivo para o Assunto de outro Silo.
  assert.equal(destinoDe("l-5")?.anchorKind, "subject");
  assert.equal(destinoDe("l-5")?.anchorKeywordId, "a-cres");
  assert.match(destinoDe("l-5")!.reason, /sustentação sugerida pelo Minerador/);
  assert.ok(propostas.every(item => item.fromSiloRef !== item.toSiloRef));
});

test("D8/D4 · as propostas entre Silos respeitam o teto de seis do destino", () => {
  const tokens = new Set<string>();
  const publicadaB = publicada("pub", "captar leads clinica odontologica");
  const livresA = MODIFICADORES.slice(0, 9).map((mod, index) => livre(`x-${index}`, `captar leads clinica odontologica ${mod}`));
  const destino = planSiloArticleFormation({ siloRef: "territory:b", siloLabel: "B", siloSlug: null, siloTokens: tokens, batchObjective: "improve", keywords: [publicadaB] });
  const origem = planSiloArticleFormation({ siloRef: "territory:a", siloLabel: "A", siloSlug: null, siloTokens: tokens, batchObjective: "improve", keywords: livresA });
  assert.equal(origem.leftoverKeywordIds.length, 9);
  const propostas = proposeCrossSiloReinforcements({
    silos: [
      { siloRef: "territory:a", siloLabel: "A", siloTokens: tokens, plan: origem },
      { siloRef: "territory:b", siloLabel: "B", siloTokens: tokens, plan: destino },
    ],
    keywords: new Map([publicadaB, ...livresA].map(keyword => [keyword.keywordId, keyword] as const)),
  });
  assert.equal(propostas.length, MAX_ARTICLE_KEYWORDS - 1, "a publicada tem cinco vagas");
});

test("a fronteira gravada como lista dos membros não vira tema do Silo nem desconta a convergência", () => {
  const membros = ["como captar pacientes", "como atrair clientes"];
  const tokens = siloThemeTokens({ siloLabel: "Leads sem Tráfego Pago", siloSlug: "/leads", boundaryIncludes: [...membros, "odontologia"], memberPhrases: membros });
  assert.ok(!tokens.has("captar") && !tokens.has("paciente") && !tokens.has("atrair"), [...tokens].join(","));
  assert.ok(tokens.has("odontologia"), "termo de fronteira que não é membro continua sendo tema");
  // Sem as frases dos membros, o comportamento anterior continua (compatível).
  assert.ok(siloThemeTokens({ siloLabel: "Leads", siloSlug: null, boundaryIncludes: membros }).has("captar"));
});

test("D5 · DNA contraditório não é agrupado automaticamente e pode formar artigo próprio", () => {
  const siloTokens = siloContextTokens({ name: "Leads sem Tráfego Pago", slug: "/leads-sem-trafego-pago" });
  const keywords = [
    livre("t-1", "captar leads clinica odontologica agora"),
    livre("t-2", "captar leads clinica odontologica hoje"),
    livre("b-1", "captar leads clinica odontologica preco", { funnel: "BOFU" }),
    livre("x-1", "captar leads clinica odontologica comparativo", { observedIntent: "Comercial" }),
    livre("x-2", "captar leads clinica odontologica melhor", { observedIntent: "Informativa" }),
  ];
  assert.equal(sameArticleAffinity(keywords[0], keywords[2], siloTokens).affinity, 0, "funil diferente");
  assert.equal(sameArticleAffinity(keywords[3], keywords[4], siloTokens).affinity, 0, "SERP conclusiva divergente");
  const { universe } = planSiloArticleFormation({
    siloRef: "territory:leads", siloLabel: "Leads sem Tráfego Pago", siloSlug: "/leads-sem-trafego-pago", siloTokens, keywords,
  });
  const doFundo = candidatoDe(universe, "b-1")!;
  assert.ok(doFundo, "a busca de fundo de funil forma artigo próprio, não some");
  assert.ok(!doFundo.keywords.some(item => item.keywordId === "t-1" || item.keywordId === "t-2"));
  assert.notEqual(candidatoDe(universe, "x-1")?.candidateRef, candidatoDe(universe, "x-2")?.candidateRef);
});

test("D6 · cancelar o pagamento mantém os pareceres do cache e os contadores dizem a verdade", () => {
  // 55 artigos: 40 com as quatro lentes no cache, 15 dependiam de coleta paga recusada.
  const refs = Array.from({ length: 55 }, (_, index) => `article-candidate:t:${index}`);
  const doCache = new Set(refs.slice(0, 40));
  const pendentes = new Map(refs.slice(40).map(ref => [ref, "A lente mobile-ios de \"busca\" não está no cache e a coleta paga não foi autorizada: este artigo fica pendente, sem custo."] as const));
  const linhas = articleRunRowsFromGates({
    gates: refs.map(ref => ({
      candidateRef: ref,
      state: doCache.has(ref) ? "current_supported" : "missing",
      blocksConclusion: !doCache.has(ref),
      reason: doCache.has(ref) ? "sustentada" : "não executada",
    })),
    collectedInThisRun: new Set(),
    reusedInThisRun: doCache,
    pendingReasons: pendentes,
    closedCandidateRefs: new Set(),
  });
  const readout = buildArticleRunReadout(linhas);
  assert.equal(readout.SERP_COLLECTED, 0, "nada foi pago: nada foi coletado");
  assert.equal(readout.SERP_REUSED, 40, "os pareceres do cache contam como reaproveitados");
  assert.equal(readout.SERP_PENDING, 15);
  assert.equal(readout.BLOCKED, 15);
  assert.match(formatArticleRunReadout(readout), /SERP_PENDING = 15/);
  // O bloqueado diz exatamente o que falta.
  assert.ok(linhas.filter(linha => linha.blocked).every(linha => /não está no cache/.test(linha.decisionBasis)));
});

test("D6 · na tela, cancelar é cancelar o PAGAMENTO; cache ilegível oferece coletar ou ler de novo", () => {
  const dialogo = readFileSync("modules/arquiteto/serp-paid-plan-dialog.tsx", "utf8");
  assert.match(dialogo, /onClick=\{ofereceSomenteCache \? \(\) => onChoose\(somenteCache\) : onCancel\}/);
  // D6 — com o cache ilegível, a análise gratuita não é oferecida: cada bloco voltaria 503.
  assert.match(dialogo, /const ofereceSomenteCache = allowCacheOnly && !plan\.cacheUnavailable;/);
  assert.match(dialogo, /Cancelar pagamento · analisar com o cache \(US\$ 0\)/);
  assert.match(dialogo, /plan\.cacheUnavailable \? \([\s\S]*?retryCacheRead: true[\s\S]*?Tentar ler o cache de novo/);
  assert.match(dialogo, /texto\.cacheWarning/);
});

test("mesa · o objetivo é do LOTE, a ação explícita forma artigos novos e o reforço entre Silos passa pela decisão humana de Silo", () => {
  const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
  const trecho = workspace.slice(workspace.indexOf("const articleFormation = useMemo"));
  const corpo = trecho.slice(0, trecho.indexOf("\n  }, ["));
  // D1 — o lote inteiro da marca decide o objetivo, não o Silo.
  assert.match(corpo, /const loteTemAncora = masterList\.some\(keyword => Boolean\(keyword\.isPublished\)[\s\S]*?subjectStandings\.get\(String\(keyword\.id\)\)\?\.declared/);
  assert.match(corpo, /batchObjective,\s*formNewFromLeftovers,\s*\}\);/);
  // D8 — propostas, não movimento: só no modo melhorar.
  assert.match(corpo, /batchObjective === "improve" && !formNewFromLeftovers\s*\? proposeCrossSiloReinforcements\(\{/);
  // A ação explícita do dono e a volta ao modo melhorar.
  assert.match(workspace, /data-testid="architect-formation-new-from-leftovers"[\s\S]*?\{FORM_NEW_FROM_LEFTOVERS_ACTION\}/);
  assert.match(workspace, /data-testid="architect-formation-improve-only"/);
  // Mover de Silo é a mesma decisão da aba Silos, com releitura, e recarrega a mesa.
  const aplicar = workspace.slice(workspace.indexOf("const applyCrossSiloReinforcements"));
  const corpoAplicar = aplicar.slice(0, aplicar.indexOf("\n  };"));
  assert.match(corpoAplicar, /applySiloDecisionsInBatch\(proposals\.map/);
  assert.match(corpoAplicar, /setCanonicalWorkspaceReload/);
  assert.doesNotMatch(corpoAplicar, /fetch\(/);
});

test("D6 · o readout diz o que os contadores contam: parecer de artigo, não entrada de cache", () => {
  const texto = formatArticleRunReadout(buildArticleRunReadout([]));
  assert.match(texto, /por parecer de artigo confirmado no acervo/);
  assert.match(texto, /REUSED saiu só do cache/);
});

/* =====================================================================
 * SONDAS DA REVISÃO (2026-09-26): um artigo por Assunto, o artigo do
 * Assunto nunca "sem convergência", publicado sozinho nunca "isolado",
 * sustentação sem Principal oferecida às âncoras e motivo para toda sobra.
 * ===================================================================== */

const assuntoSemVolume = (keywordId: string, keyword: string) => livre(keywordId, keyword, { volume: null, subjectHeldOut: true });
const planoComAssunto = (keywords: ArticleFormationKeyword[], assuntoId: string, sustentacoes: string[], extra: Partial<Parameters<typeof planSiloArticleFormation>[0]> = {}) => planSiloArticleFormation({
  siloRef: "territory:sonda", siloLabel: "Sonda", siloSlug: "/sonda", siloTokens: new Set<string>(), keywords,
  subjects: new Map(keywords.map(keyword => [keyword.keywordId, { declared: keyword.keywordId === assuntoId, volumeValidated: keyword.volume !== null }] as const)),
  subjectClaims: [{ subjectKeywordId: assuntoId, keywordIds: sustentacoes }],
  ...extra,
});

test("sonda Z · Assunto sem Volume com 5 sustentações divergentes forma UM artigo; as outras ficam com motivo, sem candidato de uma keyword", () => {
  const sustentacoes = Array.from({ length: 5 }, (_, index) => livre(`s${index}`, `tema${index}a detalhe${index}b`, { volume: 100 + index * 50 }));
  const keywords = [assuntoSemVolume("as", "captar pacientes sem anuncios"), ...sustentacoes];
  const plan = planoComAssunto(keywords, "as", sustentacoes.map(item => item.keywordId));
  const universe = plan.universe;
  assert.equal(plan.objective, "improve");
  assert.equal(universe.candidates.length, 1, universe.candidates.map(candidate => candidate.principalKeywordId).join(","));
  const artigo = universe.candidates[0];
  assert.equal(artigo.suggestedSubjectKeywordId, "as");
  assert.equal(artigo.carriesSubject, true);
  // D3 — sozinho, o artigo do Assunto é tronco aguardando sustentação.
  assert.equal(universe.singletonAudits.find(item => item.candidateRef === artigo.candidateRef)?.classification, "SUBJECT_TRUNK");
  assert.deepEqual(artigo.scores.coherence.reasons, ["artigo do Assunto · aguarda sustentação"]);
  assert.doesNotMatch(artigo.reason, /não convergiu/);
  // As quatro sustentações que não convergiram: fora, com o motivo, e oferecíveis a outro Silo.
  const fora = sustentacoes.map(item => item.keywordId).filter(id => id !== artigo.principalKeywordId);
  const motivos = new Map((universe.deferredKeywords || []).map(item => [item.keywordId, item.reason] as const));
  for (const id of fora) {
    assert.match(motivos.get(id) || "", /um artigo por Assunto/, id);
    assert.ok(plan.leftoverKeywordIds.includes(id), id);
  }
  // O Assunto tem artigo: não leva o selo de espera, e a tela diz o mesmo.
  assert.ok(!(universe.awaitingSupportSubjectKeywordIds || []).includes("as"));
  assert.deepEqual(universe.suggestedTrunkSubjectKeywordIds, ["as"]);
  assert.ok(!plan.awaitingSubjectKeywordIds.includes("as"));
  assert.match(motivos.get("as") || "", /tronco sugerido/);
  const lugares = conservacao(universe);
  for (const keyword of keywords) assert.equal(lugares.get(keyword.keywordId), 1, keyword.keywordId);
});

test("sonda H · doze sustentações que convergem: um artigo de seis; o excedente não vira segundo artigo que canibaliza, nem com a ação explícita", () => {
  const sustentacoes = MODIFICADORES.slice(0, 12).map((mod, index) => livre(`t${index}`, `captar leads clinica odontologica ${mod}`, { volume: 100 + index }));
  const keywords = [assuntoSemVolume("as", "leads para clinica odontologica"), ...sustentacoes];
  for (const formNewFromLeftovers of [false, true]) {
    const plan = planoComAssunto(keywords, "as", sustentacoes.map(item => item.keywordId), { formNewFromLeftovers });
    const universe = plan.universe;
    const comSustentacao = universe.candidates.filter(candidate => candidate.keywords.some(item => item.keywordId.startsWith("t")));
    assert.equal(comSustentacao.length, 1, `formNewFromLeftovers=${formNewFromLeftovers}: ${comSustentacao.map(candidate => candidate.principalKeywordId).join(",")}`);
    assert.equal(comSustentacao[0].keywords.length, MAX_ARTICLE_KEYWORDS);
    assert.equal(comSustentacao[0].suggestedSubjectKeywordId, "as");
    assert.equal((universe.deferredKeywords || []).filter(item => item.keywordId.startsWith("t")).length, 12 - MAX_ARTICLE_KEYWORDS);
    const lugares = conservacao(universe);
    for (const keyword of keywords) assert.equal(lugares.get(keyword.keywordId), 1, keyword.keywordId);
  }
});

test("sonda C · o artigo do Assunto com Principal livre nunca sai 'sem convergência' nem 'Não aplicável'", () => {
  const keywords = [assuntoSemVolume("assunto", "da primeira pesquisa ao agendamento"), livre("c1", "agenda online consultorio", { volume: 210 })];
  const plan = planoComAssunto(keywords, "assunto", ["c1"]);
  const artigo = candidatoDe(plan.universe, "c1")!;
  assert.equal(artigo.carriesSubject, true);
  assert.equal(artigo.suggestedSubjectKeywordId, "assunto");
  const auditoria = plan.universe.singletonAudits.find(item => item.keywordId === "c1")!;
  assert.equal(auditoria.classification, "SUBJECT_TRUNK");
  assert.match(auditoria.reasons[0], /artigo do Assunto/);
  // A mesa passa o Assunto do artigo à classificação em TODAS as leituras.
  const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
  assert.match(workspace, /principalIsSubject: Boolean\(input\.carriesSubject\) \|\|/);
  assert.equal((workspace.match(/^\s+carriesSubject: /gm) || []).length, 4, "as quatro leituras da classificação");
});

test("D2 · publicado sozinho é 'artigo publicado · aguarda reforço', nunca 'busca isolada'", () => {
  const plan = planSiloArticleFormation({
    siloRef: "territory:pub", siloLabel: "Pub", siloSlug: "/pub", siloTokens: new Set<string>(), batchObjective: "improve",
    keywords: [publicada("p", "como organizar a agenda da clinica")],
  });
  const artigo = candidatoDe(plan.universe, "p")!;
  assert.deepEqual(artigo.scores.coherence.reasons, ["artigo publicado · aguarda reforço"]);
  assert.match(artigo.reason, /é artigo publicado: completo, aguarda reforço/);
  const semPlano = buildArticleFormationUniverse({ siloRef, siloLabel: "Pub", siloSlug: "/pub", keywords: [publicada("q", "tema publicado sozinho")] });
  assert.ok(semPlano.candidates.length > 0);
  assert.ok(semPlano.candidates.every(candidate => !candidate.scores.coherence.reasons.includes("busca isolada no silo")));
});

test("D3/D8 · sustentação sem Principal de Volume é oferecida às âncoras; sem encaixe, fica com motivo e vira sobra para proposta", () => {
  const keywords = [
    publicada("pub", "captar leads clinica odontologica"),
    assuntoSemVolume("as", "tema do assunto declarado"),
    livre("w1", "captar leads consultorio medico", { volume: null }),
    livre("w2", "outra coisa distinta", { volume: null }),
  ];
  const plan = planoComAssunto(keywords, "as", ["w1", "w2"], { publishedPages: [{ keywordId: "pub", url: "https://site.test/sonda/captar-leads", canonical: null }] });
  const universe = plan.universe;
  assert.deepEqual(new Set(candidatoDe(universe, "pub")!.keywords.map(item => item.keywordId)), new Set(["pub", "w1"]), "a sustentação presa reforça a publicada");
  assert.equal(candidatoDe(universe, "w2"), null);
  const motivo = (universe.deferredKeywords || []).find(item => item.keywordId === "w2")?.reason || "";
  assert.match(motivo, /aguarda uma Principal com Volume validado/);
  assert.match(motivo, /não encontrou publicado nem Assunto compatível/);
  assert.ok(plan.leftoverKeywordIds.includes("w2"), "a sobra pode reforçar outro Silo por proposta");
  assert.deepEqual(universe.awaitingSupportSubjectKeywordIds, ["as"], "o Assunto sem artigo continua com o selo de espera");
});

test("D8 · grupo humano sem Principal elegível fica fora COM motivo, visível mesmo com clusterId", () => {
  const keywords = [
    kw("h1", "assunto um", { humanFormationRef: "human:1", subjectHeldOut: true }),
    kw("h2", "assunto dois", { humanFormationRef: "human:1", subjectHeldOut: true }),
  ];
  const universe = buildArticleFormationUniverse({ siloRef, siloLabel: "Captação", siloSlug: "/captacao", keywords });
  const motivos = new Map((universe.deferredKeywords || []).map(item => [item.keywordId, item.reason] as const));
  for (const id of ["h1", "h2"]) assert.match(motivos.get(id) || "", /revisão humana reuniu este grupo sem uma Principal elegível/, id);
});

test("D3 · na mesa, o Assunto com artigo sugerido não leva 'aguardando sustentação'", () => {
  const view = splitUngroupedBySubjectAnchor({
    ungroupedKeywordIds: ["as", "espera"],
    articles: [],
    isDeclaredSubject: () => true,
    suggestedTrunkKeywordIds: new Set(["as"]),
  });
  assert.equal(view.ungrouped.find(item => item.keywordId === "as")?.label, SUBJECT_SUGGESTED_TRUNK_LABEL);
  assert.equal(view.ungrouped.find(item => item.keywordId === "espera")?.label, SUBJECT_AWAITING_SUPPORT_LABEL);
  // Sem o parâmetro novo, o comportamento anterior continua.
  assert.equal(splitUngroupedBySubjectAnchor({ ungroupedKeywordIds: ["as"], articles: [], isDeclaredSubject: () => true }).ungrouped[0].label, SUBJECT_AWAITING_SUPPORT_LABEL);
});

test("D6 · o plano mostrado ao dono diz que as quatro lentes valem para artigo de uma keyword", () => {
  const dialogo = readFileSync("modules/arquiteto/serp-paid-plan-dialog.tsx", "utf8");
  assert.match(dialogo, /As quatro lentes valem também para artigo de uma keyword só/);
});
