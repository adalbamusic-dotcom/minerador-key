import assert from "node:assert/strict";
import test from "node:test";

import { funnelComparisonKey, intentComparisonKey, resolveKeywordDnaSignals } from "../lib/arquiteto/keyword-dna-signals.ts";
import { ASSUNTO_AS_FOCUS_LABEL, INTENT_DNA_ONLY_STAYS, PAGE_BECOMES_SUBJECT_REASON, editorialAiBarrier, editorialAiPrincipalBlock, principalFitsSubject, principalLosesDefiningModifier, subjectDefiningModifiers, withoutBrandLocality, foreignLocalSearch, isBrandLocality, planArticleImprovements, principalSubjectConflictDetail, type ImprovementEvidence, type ImprovementKeyword, type ImprovementTarget } from "../lib/arquiteto/article-improvement.ts";
import { BRAND_SERP_SAO_PAULO_CITY } from "../lib/marca/brand-serp-location.ts";

/*
 * CENÁRIOS-OURO DO VERDE (AdalbaPro) — TESTE PELO BOTÃO DE 2026-10-19.
 *
 * "Melhorar publicados…" → "Ler com IA" → coletar a SERP, no grupo Verde (21 publicados). A prévia saiu com defeitos;
 * nada foi gravado. Cada defeito corrigido vira um cenário da MESMA linha (AGENTS.md §0.3), com as formas reais do SELECT
 * de 19/10 (rótulos de intenção do KeywordDNA, volumes, slugs):
 *
 *   V1 · "Informativo" × "Informativa" era "outra intenção" e tirava 3 keywords de "como atrair pacientes sem redes
 *        sociais" (5 → 1). Um normalizador só (`intentComparisonKey`, pela taxonomia do Minerador).
 *   V2 · a secundária do publicado saía por "outra intenção" só pelo rótulo do DNA, sem a SERP ("tráfego pago vs
 *        orgânico…": 1.870 → 140). Régua c (SDD 2026-10-18 §6.3-c): a intenção que tira é a da SERP (4 lentes).
 *   V3 · "agencia de marketing em são paulo" saía por "busca local" com a marca em São Paulo (cidade) — SDD da
 *        localidade, D11: só OUTRA cidade é fora do território.
 *   (V4, a coleta que pulava as principais, está em `arquiteto-cenarios-ouro-servidor-2026-10-16`.)
 *
 * Domínio puro: nenhuma rede, nenhum banco, nenhuma chamada paga.
 */

globalThis.fetch = (async () => { throw new Error("Rede proibida nos cenários-ouro do verde."); }) as typeof fetch;

const TERR = "territory:5e689f8c-8f06-4e65-94c4-b3cd7ac906cc";
const SITE = "https://adalbapro.com.br";
const url = (slug: string) => `${SITE}/${slug}`;
/** O DNA como o servidor lê: a Qualificação (intenção e estado) e a análise semântica (`intencao_principal`). */
const dna = (id: string, text: string, intent: { qualificacao?: string; analise?: string; conclusive?: boolean; entidade?: string } = {}) => resolveKeywordDnaSignals({
  keywordId: id, text,
  semanticQualification: intent.qualificacao ? { intent: intent.qualificacao, semanticState: intent.conclusive === false ? "non_conclusive" : "conclusive" } : {},
  semantic: { ...(intent.analise ? { intencao_principal: intent.analise } : {}), ...(intent.entidade ? { entidade_central: intent.entidade } : {}) },
});
const kw = (id: string, keyword: string, volume: number | null, intent: Parameters<typeof dna>[2] = {}, extra: Partial<ImprovementKeyword> = {}): ImprovementKeyword => ({ id, keyword, volume, volumeValidated: Boolean(volume && volume > 0), signals: dna(id, keyword, intent), ownerId: null, published: false, territoryRef: TERR, external: false, ...extra });
/** O alvo publicado com o Assunto na página (volume 0) e a principal do modo antigo — o que o servidor monta em `readInputs`. */
function publicado(pagina: string, slug: string, principal: string, membros: string[], intent: Parameters<typeof dna>[2], extra: Partial<ImprovementTarget> = {}): ImprovementTarget {
  return { id: pagina, kind: "published", theme: slug.replace(/-/g, " "), note: null, primaryId: principal, post: "free", memberIds: membros, territoryRef: TERR, slug, url: url(slug), canonical: url(slug), signals: dna(pagina, slug.replace(/-/g, " "), intent), principalSubject: { keywordId: pagina, volumeState: "zero" }, currentSubjectKeywordId: null, articleExists: true, ...extra };
}
const saiu = (reasons: readonly string[], keyword: string) => reasons.some(r => r.startsWith(`“${keyword}” sai do artigo`));

/* ================================================================== V1 */

test("V1 · o normalizador único da intenção e do funil: gênero, acento e caixa não mudam a intenção ('Informativo' = 'Informativa' = 'Informacional'; 'Comercial' = 'Comercial investigativa'); 'Pendente' continua ausência", () => {
  assert.equal(intentComparisonKey("Informativo"), intentComparisonKey("Informativa"));
  assert.equal(intentComparisonKey("INFORMATIVA"), intentComparisonKey("informacional"));
  assert.equal(intentComparisonKey("Comercial"), intentComparisonKey("Comercial investigativa"));
  assert.equal(intentComparisonKey("Transacional"), intentComparisonKey("transacional"));
  assert.notEqual(intentComparisonKey("Informativo"), intentComparisonKey("Comercial"));
  assert.notEqual(intentComparisonKey("Local"), intentComparisonKey("Informativa"));
  assert.equal(intentComparisonKey("Pendente"), null);
  assert.equal(intentComparisonKey(null), null);
  assert.equal(funnelComparisonKey("Topo"), funnelComparisonKey("TOFU"));
  assert.equal(funnelComparisonKey("Decisão"), "BOTTOM");
  assert.equal(funnelComparisonKey("meio de funil"), "MIDDLE");
});

test("V1 · 'como atrair pacientes sem redes sociais' (página 'Informativo'): 'como atrair mais pacientes para o consultorio', 'como atrair clientes para clinica medica' e 'como atrair pacientes particulares' ('Informativa') FICAM; só a página vai para o Assunto", () => {
  const pagina = kw("b1e61059", "como atrair pacientes sem redes sociais", null, { analise: "Informativo", conclusive: false }, { published: true, ownerId: "b1e61059" });
  const principal = kw("cb19a822", "como atrair mais pacientes", 10, { qualificacao: "Informativa", analise: "Informativo" }, { ownerId: "b1e61059" });
  const c1 = kw("fd1cf452", "como atrair mais pacientes para o consultorio", 10, { qualificacao: "Informativa", analise: "Informativo" }, { ownerId: "b1e61059" });
  const c2 = kw("2e1c2045", "como atrair clientes para clinica medica", 10, { qualificacao: "Informativa", analise: "Comercial" }, { ownerId: "b1e61059" });
  const c3 = kw("d1c9099a", "como atrair pacientes particulares", 10, { qualificacao: "Informativa", analise: "Informativo" }, { ownerId: "b1e61059" });
  const t = publicado("b1e61059", "como-atrair-pacientes-sem-redes-sociais", "cb19a822", ["b1e61059", "cb19a822", "fd1cf452", "2e1c2045", "d1c9099a"], { analise: "Informativo", conclusive: false });
  for (const c of [c1, c2, c3]) assert.equal(principalSubjectConflictDetail(t, c), null, `${c.keyword}: a mesma intenção (Informativo = Informativa)`);
  const [p] = planArticleImprovements({ targets: [t], keywords: [pagina, principal, c1, c2, c3], evidence: [] });
  /*
   * ~~"a principal do modo antigo passa na régua c e fica (SDD 18/10 §6.3-e)"~~ — SUBSTITUÍDO em 2026-10-19 (cobrança do
   * dono; V7 abaixo): "como atrair mais pacientes" perde o que define o artigo ("sem redes sociais") e deixa de ser a
   * principal; sem candidata com volume que o leve, o Assunto (a página) fica como o foco e a principal.
   */
  assert.equal(p.principalId, "b1e61059", "o Assunto como foco: nenhuma busca com volume leva “sem redes sociais”");
  assert.equal(p.subjectKeywordId, "b1e61059", "a página é o Assunto");
  assert.ok(p.reasons.some(r => r.startsWith(`${ASSUNTO_AS_FOCUS_LABEL}:`)), JSON.stringify(p.reasons));
  assert.ok(p.reasons.some(r => r.startsWith("“como atrair mais pacientes” deixa de ser a principal: perde o que define o artigo (“sem redes sociais”)")), JSON.stringify(p.reasons));
  assert.deepEqual([...p.memberIds].sort(), ["2e1c2045", "b1e61059", "cb19a822", "d1c9099a", "fd1cf452"], JSON.stringify(p.reasons));
  assert.deepEqual(p.removeIds, [], "nada sai: a antiga fica como secundária de contexto, as 3 da mesma intenção ficam");
  assert.ok(!p.reasons.some(r => /outra intenção/.test(r)), JSON.stringify(p.reasons));
});

/* ================================================================== V2 */

/** "tráfego pago vs orgânico para clínica de estética" (página 'Comercial'; a SERP do Minerador é mista, não decide). */
function trafego(extra: { paginaSerp?: string; organicoSerp?: string } = {}) {
  const pagina = kw("9717d543", "tráfego pago vs orgânico para clínica de estética", null, { analise: "Comercial", conclusive: false }, { published: true, ownerId: "9717d543" });
  const principal = kw("1f1896a8", "trafego organico e pago", 140, { analise: "Pendente" }, { ownerId: "9717d543" });
  const organico = kw("1da89171", "tráfego orgânico", 1000, { qualificacao: "Informativa", analise: "Pendente" }, { ownerId: "9717d543", ...(extra.organicoSerp ? { observedIntent: extra.organicoSerp } : {}) });
  const oque = kw("778a56f6", "oque é trafego organico", 590, { qualificacao: "Informativa", analise: "Pendente" }, { ownerId: "9717d543" });
  const pagoEOrganico = kw("e3178a67", "tráfego pago e orgânico", 140, { qualificacao: "Informativa", analise: "Pendente" }, { ownerId: "9717d543" });
  const t = publicado("9717d543", "trafego-pago-vs-organico-para-clinica-de-estetica", "1f1896a8", ["9717d543", "1f1896a8", "1da89171", "778a56f6", "e3178a67"], { analise: "Comercial", conclusive: false }, extra.paginaSerp ? { observedIntent: extra.paginaSerp } : {});
  return { t, keywords: [pagina, principal, organico, oque, pagoEOrganico] };
}

test("V2 · a intenção só diverge no rótulo do DNA (Comercial × Informativa), sem a SERP: as 3 secundárias com volume FICAM (1.870 de volume, não 140) e a prévia diz que a SERP decide", () => {
  const { t, keywords } = trafego();
  assert.equal(principalSubjectConflictDetail(t, keywords[2])?.kind, "intent_dna");
  const [p] = planArticleImprovements({ targets: [t], keywords, evidence: [] });
  /*
   * 2026-10-19 · SUBSTITUÍDO ("a principal do modo antigo fica; as 4 keywords ficam"): "trafego organico e pago" perde o
   * nicho ("para clínica de estética") e deixa de ser a principal — o Assunto fica como o foco; e "tráfego pago e
   * orgânico" (140) é a MESMA linha do Google Ads de "trafego organico e pago" (140): um dado só (RF19).
   */
  assert.equal(p.principalId, "9717d543", "o Assunto como foco");
  assert.deepEqual([...p.memberIds].sort(), ["1da89171", "1f1896a8", "778a56f6", "9717d543"], JSON.stringify(p.reasons));
  assert.deepEqual(p.removeIds, ["e3178a67"], "só a outra grafia da mesma linha do Google Ads");
  assert.ok(p.reasons.some(r => r.startsWith("“tráfego pago e orgânico” sai do artigo (vai para “Keywords não agrupadas”, nunca some): é a mesma linha do Google Ads de “trafego organico e pago”")), JSON.stringify(p.reasons));
  for (const nome of ["tráfego orgânico", "oque é trafego organico"]) {
    assert.ok(!saiu(p.reasons, nome), `${nome} não sai`);
    assert.ok(p.reasons.some(r => r.startsWith(`“${nome}” ${INTENT_DNA_ONLY_STAYS}`)), `${nome}: a prévia diz que fica e por quê`);
  }
});

test("V2 · a SERP (evidencia_serp conclusiva nas 4 lentes) mostra outra intenção: a secundária sai para 'Keywords não agrupadas' — salvo com 3+ páginas em comum com a página nas 4 lentes (aviso, RF11)", () => {
  const comSerp = trafego({ paginaSerp: "Comercial", organicoSerp: "Informativa" });
  assert.equal(principalSubjectConflictDetail(comSerp.t, comSerp.keywords[2])?.kind, "intent_serp");
  const [p] = planArticleImprovements({ targets: [comSerp.t], keywords: comSerp.keywords, evidence: [] });
  assert.ok(!p.memberIds.includes("1da89171") && p.removeIds.includes("1da89171"), JSON.stringify(p.reasons));
  assert.ok(p.reasons.some(r => r.startsWith("“tráfego orgânico” sai do artigo (vai para “Keywords não agrupadas”, nunca some): outra intenção pela SERP (Comercial × Informativa)")), JSON.stringify(p.reasons));
  assert.ok(p.memberIds.includes("778a56f6"), "a que a SERP não decidiu fica");
  const par: ImprovementEvidence = { targetId: "9717d543", keywordId: "1da89171", complete: true, sharedPages: 3, contradiction: false, anchorConclusive: false };
  const [q] = planArticleImprovements({ targets: [comSerp.t], keywords: comSerp.keywords, evidence: [par] });
  assert.ok(q.memberIds.includes("1da89171"), "com 3 páginas em comum, a intenção diferente é aviso");
  assert.ok(q.reasons.some(r => /^Aviso: “tráfego orgânico” — outra intenção pela SERP .* 3 páginas do top 10 coincidem/.test(r)), JSON.stringify(q.reasons));
  // A mesma intenção pela SERP vence o rótulo do DNA diferente: nenhum conflito.
  const mesma = trafego({ paginaSerp: "Informativa", organicoSerp: "Informativa" });
  assert.equal(principalSubjectConflictDetail(mesma.t, mesma.keywords[2]), null);
});

test("V2 · 'como atrair pacientes para clínica de estética' (DNA 'Local'; a SERP do Minerador tem só 3 lentes, não decide): 'como atrair pacientes' e 'como atrair o cliente' ('Informativa') não saem por intenção", () => {
  const pagina = kw("b324d9f6", "como atrair pacientes para clínica de estética", null, { qualificacao: "Local", analise: "Comercial" }, { published: true, ownerId: "b324d9f6" });
  const a = kw("411703ae", "como atrair pacientes", 20, { qualificacao: "Informativa", analise: "Informativo" }, { ownerId: "b324d9f6" });
  const b = kw("248e8279", "como atrair o cliente", 720, { qualificacao: "Informativa", analise: "Informativo" }, { ownerId: "b324d9f6" });
  const t = publicado("b324d9f6", "como-atrair-pacientes-para-clinica-de-estetica", "411703ae", ["b324d9f6", "411703ae", "248e8279"], { qualificacao: "Local", analise: "Comercial" });
  const [p] = planArticleImprovements({ targets: [t], keywords: [pagina, a, b], evidence: [] });
  assert.ok(!saiu(p.reasons, "como atrair o cliente") && !saiu(p.reasons, "como atrair pacientes"), JSON.stringify(p.reasons));
  assert.ok(p.memberIds.includes("248e8279"), JSON.stringify(p));
});

/* ================================================================== V3 */

const SP = BRAND_SERP_SAO_PAULO_CITY.territory!;

test("V3 · a cidade da marca não é 'busca local' de fora: 'agencia de marketing em são paulo' fica em 'agência de marketing para clínica de estética' com a AdalbaPro em São Paulo (cidade); outra cidade continua fora; marca nacional, a régua de antes", () => {
  assert.equal(isBrandLocality("sao paulo", SP), true);
  assert.equal(isBrandLocality("sp", SP), true);
  assert.equal(isBrandLocality("curitiba", SP), false);
  // A cidade da marca também não troca a entidade do slug (R12: julgada pela SERP de São Paulo, não pela palavra).
  assert.equal(withoutBrandLocality("agencia de marketing em são paulo", SP), "agencia de marketing");
  assert.equal(withoutBrandLocality("agencia de marketing em curitiba", SP), "agencia de marketing em curitiba");
  assert.equal(withoutBrandLocality("agencia de marketing em são paulo", null), "agencia de marketing em são paulo");
  assert.equal(foreignLocalSearch({ brandTerritory: SP }, "agencia de marketing em são paulo", "agencia de marketing para clinica de estetica"), null);
  assert.equal(foreignLocalSearch({ brandTerritory: SP }, "agencia de marketing em curitiba", "agencia de marketing para clinica de estetica"), "curitiba");
  assert.equal(foreignLocalSearch({ brandTerritory: null }, "agencia de marketing em são paulo", "agencia de marketing para clinica de estetica"), "sao paulo");
  const montar = (territorio: typeof SP | null) => {
    const pagina = kw("dfd6209e", "agência de marketing para clínica de estética", null, { qualificacao: "Local", analise: "Comercial" }, { published: true, ownerId: "dfd6209e" });
    const principal = kw("8ec5e8e8", "agencia de marketing para clinicas", 20, { qualificacao: "Local", analise: "Comercial", conclusive: false }, { ownerId: "dfd6209e" });
    const sp = kw("fcd0de48", "agencia de marketing em são paulo", 390, { analise: "Local" }, { ownerId: "dfd6209e" });
    const ctba = kw("c0000001", "agencia de marketing em curitiba", 210, { analise: "Local" }, { ownerId: "dfd6209e" });
    const t = publicado("dfd6209e", "agencia-de-marketing-para-clinica-de-estetica", "8ec5e8e8", ["dfd6209e", "8ec5e8e8", "fcd0de48", "c0000001"], { qualificacao: "Local", analise: "Comercial" }, { brandTerritory: territorio });
    return { t, keywords: [pagina, principal, sp, ctba] };
  };
  const comSp = montar(SP);
  const [p] = planArticleImprovements({ targets: [comSp.t], keywords: comSp.keywords, evidence: [] });
  assert.ok(p.memberIds.includes("fcd0de48") && !saiu(p.reasons, "agencia de marketing em são paulo"), JSON.stringify(p.reasons));
  assert.ok(saiu(p.reasons, "agencia de marketing em curitiba") && p.reasons.some(r => /busca local \(“curitiba”\)/.test(r)), JSON.stringify(p.reasons));
  // A leitura da IA usa a mesma régua.
  const livre = { ...comSp.keywords[2], ownerId: null };
  assert.ok(!/Busca local/.test(editorialAiBarrier({ ...comSp.t, memberIds: ["dfd6209e"] }, livre) ?? ""), "a IA não barra a cidade da marca");
  const nacional = montar(null);
  const [q] = planArticleImprovements({ targets: [nacional.t], keywords: nacional.keywords, evidence: [] });
  assert.ok(saiu(q.reasons, "agencia de marketing em são paulo"), "marca nacional: a régua de antes (São Paulo é outra cidade)");
});

/* ======================================================================= */
/* V6–V9 · A COBRANÇA DO DONO DEPOIS DA PRÉVIA DO VERDE (2026-10-19)        */
/* ======================================================================= */

/*
 * O dono, literal: "não está aplicando o SEO semântico, não está aplicando a linguagem natural orgânica"; "o sistema não
 * está vigiando a canibalização entre os artigos". A prévia manteve as principais do modo antigo que passavam na régua c
 * só pelas palavras do núcleo ("captação + paciente" casava com "captação de pacientes dentista" no artigo "captação de
 * pacientes SEM TRÁFEGO PAGO") — ou que nem passavam ("Volume 0 sem candidata… a principal fica por enquanto").
 * SUBSTITUI "a principal do modo antigo fica se passar na régua c" (núcleo pelas palavras) e "sem candidata, a principal
 * fica" (R7 da SDD 2026-10-18): o Assunto (a keyword da página) é a âncora; a principal só fica se for o mesmo tema sem
 * perder o que define o artigo; sem candidata, o Assunto é o foco e a vaga fica aberta. Dados reais do SELECT de 19/10.
 */

test("V6 · 'captação de pacientes sem tráfego pago': 'captação de pacientes dentista' sai como principal (outro público e perde a restrição) e sai do artigo; 'como captar pacientes' (solta, 30) também não é a principal; o Assunto fica como o foco e a vaga aberta", () => {
  const pagina = kw("92d3101c", "captação de pacientes sem tráfego pago", null, {}, { published: true, ownerId: "92d3101c" });
  const dentista = kw("e883af41", "captação de pacientes dentista", 10, { analise: "Comercial" }, { ownerId: "92d3101c" });
  const empresa = kw("c39dc4b8", "empresa de captação de pacientes", 10, { analise: "Comercial" }, { ownerId: "92d3101c" });
  const organico = kw("89e6ee7f", "tráfego orgânico como fazer", 140, { analise: "Informativo" }, { ownerId: "92d3101c" });
  const solta = kw("519bed2a", "como captar pacientes", 30, { analise: "Informativo" });
  const t = publicado("92d3101c", "captacao-de-pacientes-sem-trafego-pago", "e883af41", ["92d3101c", "e883af41", "c39dc4b8", "89e6ee7f"], {}, { brandTerritory: SP });
  assert.deepEqual(subjectDefiningModifiers(t).map(m => m.kind), ["restricao"]);
  assert.match(principalFitsSubject(t, dentista) ?? "", /outro público \(“dentista”\)/);
  assert.match(principalLosesDefiningModifier(t, solta) ?? "", /perde o que define o artigo \(“sem trafego pago”\)/);
  assert.equal(principalLosesDefiningModifier(t, { keyword: "captação de pacientes sem tráfego pago no instagram" }), null, "leva a restrição");
  assert.equal(principalLosesDefiningModifier(t, { keyword: "captação de pacientes orgânica" }), null, "o orgânico é o positivo de 'sem tráfego pago'");
  const [p] = planArticleImprovements({ targets: [t], keywords: [pagina, dentista, empresa, organico, solta], evidence: [] });
  assert.notEqual(p.principalId, "e883af41", JSON.stringify(p.reasons));
  assert.notEqual(p.principalId, "519bed2a", "a solta sem a restrição nunca é a principal");
  assert.equal(p.principalId, "92d3101c", "o Assunto como foco");
  assert.equal(p.subjectKeywordId, "92d3101c");
  assert.ok(p.removeIds.includes("e883af41") && !p.memberIds.includes("e883af41"), "a do outro público sai (vai para 'Keywords não agrupadas')");
  assert.ok(p.memberIds.includes("89e6ee7f"), "o orgânico reforça o artigo sem tráfego pago (dono, 30/09)");
  assert.ok(p.reasons.some(r => r.startsWith("“captação de pacientes dentista” deixa de ser a principal: outro público")), JSON.stringify(p.reasons));
  assert.ok(p.reasons.some(r => r.startsWith(`${ASSUNTO_AS_FOCUS_LABEL}:`) && /a vaga da principal com volume fica aberta/.test(r)), JSON.stringify(p.reasons));
  assert.ok(!p.reasons.some(r => /fica por enquanto/.test(r)), "SUBSTITUÍDO: a principal ruim não fica 'por enquanto'");
  assert.equal(p.status, "ready");
});

test("V7 · 'instagram não traz pacientes': o Assunto é a página; 'como atrair clientes pelo instagram' NÃO é a principal (perde a negação: outra intenção), nem as soltas do Instagram; ela fica como secundária de contexto", () => {
  const pagina = kw("8170a492", "instagram não traz pacientes", null, {}, { published: true, ownerId: "8170a492" });
  const antiga = kw("d6ae1043", "como atrair clientes pelo instagram", 70, { qualificacao: "Informativa", analise: "Informativo" }, { ownerId: "8170a492" });
  const s1 = kw("5740b9e2", "como conseguir clientes no instagram", 20, { analise: "Informativo" });
  const s2 = kw("6e82d372", "como ganhar clientes no instagram", 20, { analise: "Informativo" });
  const t = publicado("8170a492", "instagram-nao-traz-pacientes", "d6ae1043", ["8170a492", "d6ae1043"], {}, { brandTerritory: SP });
  assert.deepEqual(subjectDefiningModifiers(t).map(m => m.kind), ["negacao"]);
  for (const k of [antiga, s1, s2]) assert.ok(principalFitsSubject(t, k), `${k.keyword} não é o tema “instagram não traz pacientes”`);
  assert.match(principalLosesDefiningModifier(t, antiga) ?? "", /a principal sem a negação é outra intenção/);
  const [p] = planArticleImprovements({ targets: [t], keywords: [pagina, antiga, s1, s2], evidence: [] });
  assert.equal(p.principalId, "8170a492", JSON.stringify(p.reasons));
  assert.equal(p.subjectKeywordId, "8170a492");
  assert.ok(p.memberIds.includes("d6ae1043"), "fica como secundária de contexto");
  assert.ok(![antiga.id, s1.id, s2.id].includes(p.principalId!));
  // A leitura da IA segue a mesma régua: ela não pode propor a antiga como principal.
  const comFoco = { ...t, primaryId: "8170a492" };
  assert.match(editorialAiPrincipalBlock(comFoco, { ...pagina, volumeValidated: false }, antiga, false) ?? "", /não cabe no Assunto/);
});

/** "plano de marketing para clínica de estética" × "plano de marketing estética: exemplos e templates" (o mesmo Silo). */
function planos() {
  // A entidade central do DNA real (SELECT de 19/10): "plano" (o "um plano" e o "exemplo plano" também levam "plano").
  const e = { entidade: "plano" };
  const p3c = kw("3c3bb7b2", "plano de marketing para clínica de estética", null, { analise: "Comercial", ...e }, { published: true, ownerId: "3c3bb7b2" });
  const pd3 = kw("d3cf9b04", "plano de marketing estética: exemplos e templates", null, e, { published: true, ownerId: "d3cf9b04" });
  const plano = kw("8a04abf5", "plano de marketing", 1900, e, { ownerId: "3c3bb7b2" });
  const fazer = kw("2ecc155a", "como fazer um plano de marketing", 110, { analise: "Informativo", entidade: "um plano" }, { ownerId: "3c3bb7b2" });
  const ex1 = kw("da2b62c6", "exemplo plano de marketing", 260, { entidade: "exemplo plano" }, { ownerId: "3c3bb7b2" });
  const ex2 = kw("bef5c4b3", "plano de marketing exemplo", 260, e, { ownerId: "3c3bb7b2" });
  const pdf = kw("eb82f5c2", "plano de marketing clínica de estética pdf", 10, { analise: "Comercial", ...e }, { ownerId: "d3cf9b04" });
  const certa = kw("499606e5", "plano de marketing para clinica estetica", 10, { analise: "Comercial", ...e }, { ownerId: "d3cf9b04" });
  const a = publicado("3c3bb7b2", "plano-de-marketing-para-clinica-de-estetica", "8a04abf5", ["3c3bb7b2", "8a04abf5", "2ecc155a", "da2b62c6", "bef5c4b3"], { analise: "Comercial", ...e }, { brandTerritory: SP });
  const b = publicado("d3cf9b04", "plano-de-marketing-estetica-exemplos-e-templates", "eb82f5c2", ["d3cf9b04", "eb82f5c2", "499606e5"], e, { brandTerritory: SP, theme: "plano de marketing estética: exemplos e templates" });
  return { targets: [a, b], keywords: [p3c, pd3, plano, fazer, ex1, ex2, pdf, certa] };
}

test("V8 · canibalização entre dois artigos do verde: 'plano de marketing para clinica estetica' estava em 'exemplos e templates' e vai para 'plano de marketing para clínica de estética' (e vira a principal dele); 'plano de marketing exemplo' faz o caminho inverso; a mesma linha do Google Ads (260 = 260) entra uma vez", () => {
  const { targets, keywords } = planos();
  const [a, b] = planArticleImprovements({ targets, keywords, evidence: [] });
  assert.equal(a.principalId, "499606e5", `a principal certa veio do outro artigo: ${JSON.stringify(a.reasons)}`);
  assert.equal(a.subjectKeywordId, "3c3bb7b2", "a página é o Assunto");
  assert.ok(a.memberIds.includes("8a04abf5"), "“plano de marketing” (1.900) fica como secundária de contexto");
  assert.ok(a.reasons.some(r => r.startsWith("“plano de marketing” deixa de ser a principal: perde o público/nicho que define o artigo (“para clinica de estetica”)")), JSON.stringify(a.reasons));
  assert.deepEqual(a.movedIn, [{ keywordId: "499606e5", fromTargetId: "d3cf9b04" }]);
  assert.deepEqual(a.movedOut, [{ keywordId: "bef5c4b3", toTargetId: "d3cf9b04" }]);
  assert.ok(a.removeIds.includes("da2b62c6") && a.removeIds.includes("bef5c4b3"), JSON.stringify(a));
  assert.ok(a.reasons.some(r => r.startsWith("“exemplo plano de marketing” sai do artigo (vai para “Keywords não agrupadas”, nunca some): é a mesma linha do Google Ads de “plano de marketing exemplo”")), JSON.stringify(a.reasons));
  assert.ok(b.memberIds.includes("bef5c4b3") && b.addIds.includes("bef5c4b3"));
  assert.deepEqual(b.movedIn, [{ keywordId: "bef5c4b3", fromTargetId: "3c3bb7b2" }]);
  assert.deepEqual(b.movedOut, [{ keywordId: "499606e5", toTargetId: "3c3bb7b2" }]);
  assert.ok(!b.memberIds.includes("499606e5") && b.removeIds.includes("499606e5"));
  assert.equal(b.principalId, "d3cf9b04", "o pdf não leva o núcleo (exemplos e templates): o Assunto como foco");
  // Nenhuma keyword em dois artigos; a que sai de um e não entra em outro vai para "Keywords não agrupadas" (nunca some).
  const em = (id: string) => [a, b].filter(p => p.memberIds.includes(id)).length;
  for (const k of keywords) assert.ok(em(k.id) <= 1, `${k.keyword} em dois artigos`);
  for (const p of [a, b]) assert.equal(p.status, "ready");
});

test("V9 · a MESMA busca em dois artigos do verde ('agencia marketing digital' 1.300 em 'para clínica de estética' × 'marketing digital agencia' 1.300 em 'para cosméticos'): fica num só; 'agencia de marketing para clinicas' (20, leva o nicho) vira a principal de 'agência de marketing para clínica de estética'", () => {
  const pc = kw("dfd6209e", "agência de marketing para clínica de estética", null, { analise: "Comercial" }, { published: true, ownerId: "dfd6209e" });
  const pk = kw("18fcec03", "agência de marketing para cosméticos", null, { analise: "Comercial" }, { published: true, ownerId: "18fcec03" });
  const amd = kw("cf4fb05e", "agencia marketing digital", 1300, { analise: "Comercial" }, { ownerId: "dfd6209e" });
  const sp = kw("fcd0de48", "agencia de marketing em são paulo", 390, { analise: "Local" }, { ownerId: "dfd6209e" });
  const clinicas = kw("8ec5e8e8", "agencia de marketing para clinicas", 20, { analise: "Comercial" }, { ownerId: "dfd6209e" });
  const amd6600 = kw("07cc677a", "agencia de marketing digital", 6600, { analise: "Comercial" }, { ownerId: "18fcec03" });
  const mda = kw("523d026e", "marketing digital agencia", 1300, { analise: "Comercial" }, { ownerId: "18fcec03" });
  const sp2 = kw("a0c80dbc", "agencia de marketing são paulo", 480, { analise: "Comercial" }, { ownerId: "18fcec03" });
  const a = publicado("dfd6209e", "agencia-de-marketing-para-clinica-de-estetica", "cf4fb05e", ["dfd6209e", "cf4fb05e", "fcd0de48", "8ec5e8e8"], { analise: "Comercial" }, { brandTerritory: SP });
  const b = publicado("18fcec03", "agencia-de-marketing-para-cosmeticos", "07cc677a", ["18fcec03", "07cc677a", "523d026e", "a0c80dbc"], { analise: "Comercial" }, { brandTerritory: SP });
  const keywords = [pc, pk, amd, sp, clinicas, amd6600, mda, sp2];
  const [p, q] = planArticleImprovements({ targets: [a, b], keywords, evidence: [] });
  assert.equal(p.principalId, "8ec5e8e8", JSON.stringify(p.reasons));
  assert.equal(p.subjectKeywordId, "dfd6209e");
  const mesmaBusca = ["cf4fb05e", "523d026e", "07cc677a"];
  assert.equal([p, q].filter(x => x.memberIds.some(id => mesmaBusca.includes(id))).length, 1, "a mesma busca “agencia marketing digital” fica num artigo só");
  assert.ok(p.removeIds.includes("cf4fb05e") && p.reasons.some(r => r.startsWith("“agencia marketing digital” sai do artigo (vai para “Keywords não agrupadas”, nunca some): é a mesma busca que o artigo")), JSON.stringify(p.reasons));
  assert.equal(q.principalId, "18fcec03", "cosméticos: nenhuma busca com volume leva o nicho — o Assunto como foco");
});

test("V6–V9 · a IA que lê a lista recebe o Assunto da página e o que define o artigo como critério da principal", async () => {
  const { buildImprovementAiPrompt } = await import("../lib/arquiteto/article-improvement-ai.ts");
  const t = publicado("92d3101c", "captacao-de-pacientes-sem-trafego-pago", "e883af41", ["92d3101c", "e883af41"], {}, { theme: "captação de pacientes sem tráfego pago" });
  const pedido = buildImprovementAiPrompt({ targets: [t], list: [], keywords: [kw("e883af41", "captação de pacientes dentista", 10)] });
  const alvo = JSON.parse(pedido.user).alvos[0];
  assert.equal(alvo.assunto, "captação de pacientes sem tráfego pago");
  assert.deepEqual(alvo.oQueDefine, ["sem tráfego pago"]);
  assert.match(pedido.system, /oQueDefine/);
  assert.match(pedido.system, /captação de pacientes dentista" NÃO é principal/);
});

/* ======================================================================= */
/* V11 · A MESMA RÉGUA NA MESA D2.1, NO "REFORÇAR PUBLICADOS" E NA         */
/* DIFERENCIAÇÃO (`proposePublishedPrimarySwap`; AGENTS.md §0.5)          */
/* ======================================================================= */

test("V11 · a mesa D2.1, o 'Reforçar publicados' e a diferenciação propõem a troca pela MESMA régua do refazedor quando a página tem o Assunto: o volume 0 libera mesmo 'Travado ao slug'; a principal do modo antigo que perde o que define o artigo não fica; a candidata sem a restrição é recusada (subject_fit); a página vira o Assunto (não secundária)", async () => {
  const { proposePublishedPrimarySwap, decidePublishedPrimarySwap } = await import("../lib/arquiteto/published-primary-swap.ts");
  const { buildSerpSubjectIndex } = await import("../lib/arquiteto/serp-subject-overlap.ts");
  const { publishedPageSubjectFromRow } = await import("../lib/arquiteto/article-improvement.ts");
  const urls = ["https://a.com/1", "https://a.com/2", "https://a.com/3", "https://a.com/4"];
  const pegada = (keywordId: string) => ({ keywordId, keyword: keywordId, lenses: ["desktop-windows", "desktop-macos", "mobile-android", "mobile-ios"].map(lens => ({ lens, urls, domains: null, collectedAt: null })) });
  const serp = buildSerpSubjectIndex(["92d3101c", "519bed2a", "a0000001"].map(pegada) as never);
  const fk = (keywordId: string, keyword: string, volume: number | null) => ({ keywordId, keyword, intent: null, volume, kgr: null, entity: null, problem: null, isPublished: false, volumeValidated: Boolean(volume) });
  const pageSubject = { keywordId: "92d3101c", theme: "captação de pacientes sem tráfego pago", slug: "/leads-sem-trafego-pago/captacao-de-pacientes-sem-trafego-pago", volumeState: "zero" as const };
  const identity = { url: "https://adalbapro.com.br/leads-sem-trafego-pago/captacao-de-pacientes-sem-trafego-pago", canonical: null, slug: pageSubject.slug };
  const base = { published: { ...fk("92d3101c", "captação de pacientes sem tráfego pago", null), isPublished: true }, identity, serp, pageSubject, currentPrincipalKeyword: "captação de pacientes dentista" };
  // A candidata que perde "sem tráfego pago" é recusada pela régua do Assunto; a que leva o orgânico é proposta — mesmo com "Travado ao slug".
  const recusada = proposePublishedPrimarySwap({ ...base, post: "locked", candidates: [fk("519bed2a", "captação de pacientes", 30)] });
  assert.equal(recusada.state, "no_candidate", recusada.note);
  assert.equal(recusada.rejected[0]?.missing, "subject_fit");
  assert.match(recusada.rejected[0]?.reason ?? "", /perde o que define o artigo/);
  const proposta = proposePublishedPrimarySwap({ ...base, post: "locked", candidates: [fk("a0000001", "captação de pacientes orgânica", 50)] });
  assert.equal(proposta.state, "proposed", proposta.note);
  assert.equal(proposta.previousPrimaryBecomes, "assunto", "a página vira o Assunto, não a secundária");
  assert.match(proposta.note, /fica no artigo como o Assunto/);
  // O gravador da troca aceita com a principal atual do modo antigo (não a página) e o Posto travado.
  const decidida = decidePublishedPrimarySwap({ proposal: proposta, article: { principalKeywordId: "e883af41", keywordIds: ["e883af41", "92d3101c", "a0000001"], identity }, currentPost: "locked", accepted: true, actorUserId: "ator", decidedAt: "2026-10-19T12:00:00.000Z" });
  assert.ok(decidida.ok && decidida.accepted, JSON.stringify(decidida));
  assert.ok(decidida.ok && !decidida.roleChanges.some(r => r.keywordId === "92d3101c"), "a página não vira secundária");
  // A principal atual que cabe no Assunto fica: nada é proposto.
  const fica = proposePublishedPrimarySwap({ ...base, currentPrincipalKeyword: "captação de pacientes sem tráfego pago no instagram", post: "free", candidates: [fk("a0000001", "captação de pacientes orgânica", 50)] });
  assert.equal(fica.state, "locked");
  assert.match(fica.note, /cabe no Assunto/);
  // Sem o Assunto na página: a régua de antes (o publicado espera o "Aprovar e enviar" do Minerador).
  const semAssunto = proposePublishedPrimarySwap({ ...base, pageSubject: null, post: "locked", candidates: [fk("a0000001", "captação de pacientes orgânica", 50)] });
  assert.equal(semAssunto.state, "locked");
  assert.equal(semAssunto.previousPrimaryBecomes, "secundaria");
  // A leitura do Assunto da página é a do Minerador (o resolvedor e a régua do volume §6.1).
  const lido = publishedPageSubjectFromRow({ id: "92d3101c", keyword: "captação de pacientes sem tráfego pago", volume_search: null, volume_source: null, analise_semantica: { keyword_subject: { declared: true, note: null, destinationUrl: null, entry: { source: "cadastro", title: "Captação de pacientes sem tráfego pago" } }, volume_eligibility: { status: "no_average", checkedAt: new Date().toISOString(), provider: "google_ads" } } }, pageSubject.slug);
  assert.equal(lido?.theme, "Captação de pacientes sem tráfego pago");
  assert.equal(publishedPageSubjectFromRow({ id: "x", keyword: "y", analise_semantica: {} }, null), null, "sem Assunto declarado: nada");
});
