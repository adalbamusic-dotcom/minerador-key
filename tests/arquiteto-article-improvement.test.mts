import test from "node:test";
import assert from "node:assert/strict";
import { allocateReinforcementChoices } from "../lib/arquiteto/reinforcement-allocation.ts";
import { planArticleImprovements, volumelessPrincipalSwap, carriesSlugCore, slugCoreWords, principalIsIdentity, targetPrincipalIsIdentity, improvementEditorialFit, improvementCopyLine, copyLineMatch, improvementDiscoverySeeds, COPY_LINE_LABEL, SUBJECT_KEYWORD_STAYS_SUBJECT_REASON, type ImprovementTarget, type ImprovementKeyword, type ImprovementEvidence, type ImprovementSerpVocabulary } from "../lib/arquiteto/article-improvement.ts";
import { resolveKeywordDnaSignals } from "../lib/arquiteto/keyword-dna-signals.ts";
import { normalizeKeyword } from "../lib/minerador/keyword-import-core.ts";

const dna = (id: string, text = "captação de pacientes") => resolveKeywordDnaSignals({ keywordId: id, text, semantic: { entidade_central: "captação de pacientes", problema_percebido: "poucos agendamentos", publico: "gestores de clínicas", resultado_desejado: "ampliar agendamentos", intencao_principal: "Informativa" } });
const term = (id: string, overrides: Partial<ImprovementKeyword> = {}): ImprovementKeyword => ({ id, keyword: `captação de pacientes ${id}`, volume: 50, volumeValidated: true, signals: dna(id), ownerId: null, published: false, territoryRef: "territory:b", external: false, ...overrides });
const page = (id: string, overrides: Partial<ImprovementTarget> = {}): ImprovementTarget => ({ id, kind: "published", theme: `captação de pacientes ${id}`, note: null, primaryId: id, post: "free", memberIds: [id], territoryRef: "territory:a", slug: `captacao-de-pacientes-${id}`, url: `https://example.test/${id}`, canonical: `https://example.test/${id}`, signals: dna(id), ...overrides });
const proof = (targetId: string, keywordId: string, overrides: Partial<ImprovementEvidence> = {}): ImprovementEvidence => ({ targetId, keywordId, complete: true, sharedPages: 4, contradiction: false, anchorConclusive: true, ...overrides });

test("artigo cheio não reserva a única keyword de outro destino", () => {
  const result = allocateReinforcementChoices({ targets: [{ id: "full", capacity: 0 }, { id: "open", capacity: 1 }], edges: [{ targetId: "full", keywordId: "k", tier: 0, score: 8, volume: 30 }, { targetId: "open", keywordId: "k", tier: 0, score: 4, volume: 30 }] });
  assert.equal(result.get("k"), "open");
});
test("rematching atende destino com uma única opção antes de completar o flexível", () => {
  const result = allocateReinforcementChoices({ targets: [{ id: "a", capacity: 4 }, { id: "b", capacity: 1 }], edges: [
    { targetId: "a", keywordId: "only", tier: 0, score: 5, volume: 80 }, { targetId: "a", keywordId: "alternative", tier: 0, score: 5, volume: 40 }, { targetId: "b", keywordId: "only", tier: 0, score: 5, volume: 80 },
  ] });
  assert.equal(result.get("only"), "b"); assert.equal(result.get("alternative"), "a");
});
test("cobertura não degrada a evidência de Forte para Provável", () => {
  const result = allocateReinforcementChoices({ targets: [{ id: "a", capacity: 1 }, { id: "b", capacity: 1 }], edges: [
    { targetId: "a", keywordId: "only", tier: 0, score: 5, volume: 80 }, { targetId: "a", keywordId: "weak", tier: 1, score: 2, volume: 40 }, { targetId: "b", keywordId: "only", tier: 0, score: 5, volume: 80 },
  ] });
  assert.equal(result.get("only"), "a"); assert.equal(result.size, 1);
});
/*
 * 2026-10-17 · PRINCIPAL DE IDENTIDADE (dono: "Se o termo principal tem pouco volume, mas faz sentido preservá-lo por
 * ser a identidade do assunto/tema, principalmente nos publicados mas também nos novos. As keywords mais amplas podem
 * reforçar o contexto."). Nos casos de troca abaixo, a página fica FORA da identidade (o slug não foi feito da
 * principal); com o slug feito dela, a principal fica e a candidata só reforça. SUBSTITUÍDO: "Livre sem volume troca"
 * como padrão.
 */
test("Livre sem volume FORA da identidade usa fundamento editorial e SERP completa da candidata; de identidade, fica", () => {
  const keywords = [term("old", { published: true, volume: null, volumeValidated: false }), term("new", { keyword: "captação de pacientes old guia" })];
  const evidence = [proof("old", "new", { sharedPages: 0, anchorConclusive: false })];
  const result = planArticleImprovements({ targets: [page("old", { slug: "guia-de-captacao-de-pacientes" })], keywords, evidence })[0];
  assert.equal(result.status, "ready"); assert.equal(result.principalId, "new");
  assert.deepEqual(result.memberIds, ["old", "new"]); assert.equal(result.evidenceBasis, "editorial_and_candidate_serp");
  // Slug feito da principal ("captacao-de-pacientes-old"): identidade — fica, a candidata entra como secundária.
  const identidade = planArticleImprovements({ targets: [page("old")], keywords, evidence })[0];
  assert.equal(identidade.principalId, "old");
  assert.deepEqual(identidade.addIds, ["new"]);
  assert.ok(identidade.reasons.some(reason => /^Principal de identidade: “captação de pacientes old” \(sem volume\) é o assunto do slug publicado/.test(reason)), JSON.stringify(identidade.reasons));
});
test("Travada fica, desconhecida também; ambas podem receber apoio", () => {
  for (const post of ["locked", "unknown"] as const) {
    const result = planArticleImprovements({ targets: [page("old", { post })], keywords: [term("old", { published: true, volume: 0, volumeValidated: false }), term("new")], evidence: [proof("old", "new")] })[0];
    assert.equal(result.principalId, "old"); assert.deepEqual(result.addIds, ["new"]);
  }
});

test("apoio já presente pode assumir a principal Livre (fora da identidade) sem precisar de nova vaga", () => {
  const result = planArticleImprovements({ targets: [page("old", { memberIds: ["old", "existing"], slug: "captacao-de-pacientes-existing" })], keywords: [term("old", { published: true, volume: 0, volumeValidated: false }), term("existing", { ownerId: "old" })], evidence: [proof("old", "existing")] })[0];
  assert.equal(result.status, "ready"); assert.equal(result.principalId, "existing"); assert.deepEqual(result.addIds, []); assert.deepEqual(result.memberIds, ["old", "existing"]);
});

test("páginas coincidentes da SERP têm precedência sobre rótulos derivados de intenção", () => {
  const target = page("old", { signals: { ...dna("old"), intent: "Informativa", semanticState: "conclusive" } });
  const candidate = term("new", { signals: { ...dna("new"), intent: "Comercial", semanticState: "conclusive" } });
  const keywords = [term("old", { published: true, volume: 0, volumeValidated: false }), candidate];
  assert.equal(planArticleImprovements({ targets: [target], keywords, evidence: [proof("old", "new", {sharedPages:3})] })[0].status, "ready");
  assert.equal(planArticleImprovements({ targets: [target], keywords, evidence: [proof("old", "new", {sharedPages:1})] })[0].status, "insufficient_evidence");
});
test("substitui apoio fraco no teto, sem remover a identidade ou consumir sétima vaga", () => {
  const targets = [page("old", { memberIds: ["old", "a", "b", "c", "d", "weak"] })];
  const keywords = [term("old", { published: true, volume: 0, volumeValidated: false }), ...["a", "b", "c", "d"].map(id => term(id, { ownerId: "old" })), term("weak", { ownerId: "old", volume: 0, volumeValidated: false }), term("new")];
  const result = planArticleImprovements({ targets, keywords, evidence: keywords.map(k => proof("old", k.id)) })[0];
  assert.equal(result.memberIds.length, 6); assert.deepEqual(result.removeIds, ["weak"]);
  assert.ok(result.memberIds.includes("old")); assert.ok(result.memberIds.includes("new"));
});
test("Assunto sem volume fica fora das seis, principal com demanda e apoios", () => {
  const result = planArticleImprovements({ targets: [page("subject", { kind: "subject", primaryId: null, memberIds: [], slug: null, url: null, canonical: null })], keywords: [term("primary"), term("support")], evidence: [proof("subject", "primary", { sharedPages: 0, anchorConclusive: false }), proof("subject", "support", { sharedPages: 0, anchorConclusive: false })] })[0];
  assert.equal(result.status, "ready"); assert.equal(result.memberIds.length, 2); assert.ok(!result.memberIds.includes("subject"));
});
test("lente faltante, contradição ou membro de outro aprovado não vira reforço", () => {
  const result = planArticleImprovements({ targets: [page("old")], keywords: [term("old", { published: true, volume: 0, volumeValidated: false }), term("missing"), term("conflict"), term("owned", { ownerId: "other" })], evidence: [proof("old", "missing", { complete: false }), proof("old", "conflict", { contradiction: true }), proof("old", "owned")] })[0];
  assert.equal(result.status, "insufficient_evidence"); assert.deepEqual(result.addIds, []);
});
test("restrição sem anúncios não aceita anúncios pagos, mesmo com páginas em comum", () => {
  const target = page("old", { theme: "como atrair pacientes sem anúncios" });
  const candidate = term("bad", { keyword: "anúncios pagos para clínica" });
  assert.equal(improvementEditorialFit(target, candidate).conflict, true);
  const result = planArticleImprovements({ targets: [target], keywords: [term("old", { published: true }), candidate], evidence: [proof("old", "bad")] })[0];
  assert.deepEqual(result.addIds, []);
});
test("caso real captar clientes × atrair pacientes: sinônimos não resolvem a canibalização", () => {
  const a = page("a", { theme: "como captar clientes para clínica de estética" }), b = page("b", { theme: "como atrair pacientes para clínica de estética" });
  // As principais novas são o mesmo assunto com sinônimo trocado (captar/atrair, pacientes/clientes).
  const keywords = [term("a", { published: true, volume: 0, volumeValidated: false }), term("b", { published: true, volume: 0, volumeValidated: false }), term("ka", { keyword: "captar pacientes clínica de estética" }), term("kb", { keyword: "atrair clientes clínica de estética" })];
  const result = planArticleImprovements({ targets: [a, b], keywords, evidence: [proof("a", "ka"), proof("b", "kb")] });
  assert.ok(result.every(p => p.status === "insufficient_evidence"));
  assert.ok(result.every(p => p.reasons.some(reason => reason.includes("canibalização"))));
});
// As duas páginas abaixo têm principal FORA da identidade ("captação de pacientes a/b" não é o slug delas): a troca vale (2026-10-17).
const foraDaIdentidade = { a: "como-captar-clientes-para-clinica-de-estetica", b: "como-atrair-pacientes-para-clinica-de-estetica" };
test("caso real 2026-09-30: captar × atrair ficam distintos quando cada um recebe keywords próprias da lista", () => {
  const a = page("a", { theme: "como captar clientes para clínica de estética", slug: foraDaIdentidade.a }), b = page("b", { theme: "como atrair pacientes para clínica de estética", slug: foraDaIdentidade.b });
  const keywords = [term("a", { published: true, volume: 0, volumeValidated: false }), term("b", { published: true, volume: 0, volumeValidated: false }), term("ka", { keyword: "como captar clientes", volume: 390 }), term("kb", { keyword: "como atrair clientes pelo instagram", volume: 90 })];
  const result = planArticleImprovements({ targets: [a, b], keywords, evidence: [proof("a", "ka"), proof("b", "kb")] });
  assert.ok(result.every(p => p.status === "ready"), JSON.stringify(result.map(p => [p.status, p.reasons])));
  assert.equal(result[0].principalId, "ka"); assert.equal(result[1].principalId, "kb");
  assert.deepEqual(result[0].exclusions, ["como atrair clientes pelo instagram"]);
  assert.deepEqual(result[1].exclusions, ["como captar clientes"]);
  assert.match(result[0].reasons.join(" "), /keywords próprias da lista/);
});
test("ângulos distintos são registrados com exclusões recíprocas", () => {
  const a = page("a", { theme: "como captar clientes para clínica de estética", slug: foraDaIdentidade.a }), b = page("b", { theme: "como atrair pacientes para clínica de estética", slug: foraDaIdentidade.b });
  const ka = term("ka"), kb = term("kb"); ka.signals.modifiers = ["WhatsApp e agendamento"]; kb.signals.modifiers = ["indicações de pacientes"];
  const result = planArticleImprovements({ targets: [a, b], keywords: [term("a", { published: true, volume: 0, volumeValidated: false }), term("b", { published: true, volume: 0, volumeValidated: false }), ka, kb], evidence: [proof("a", "ka"), proof("b", "kb")] });
  assert.ok(result.every(p => p.status === "ready"));
  assert.deepEqual(result[0].exclusions, [result[1].angle]); assert.deepEqual(result[1].exclusions, [result[0].angle]);
});
test("sem páginas em comum, a principal nova precisa caber no slug: 'agência de marketing' não substitui 'agência de marketing para cosméticos'", () => {
  const signals = (id: string) => resolveKeywordDnaSignals({ keywordId: id, text: "agência de marketing", semantic: { entidade_central: "agência de marketing", problema_percebido: "contratar agência", resultado_desejado: "escolher agência" } });
  const target = page("cosm", { theme: "agência de marketing para cosméticos", slug: "agencia-de-marketing-para-cosmeticos", signals: signals("cosm") });
  const keywords = [term("cosm", { keyword: "agência de marketing para cosméticos", published: true, volume: null, volumeValidated: false, signals: signals("cosm") }), term("generica", { keyword: "agência de marketing", volume: 18100, signals: signals("generica") })];
  const result = planArticleImprovements({ targets: [target], keywords, evidence: [proof("cosm", "generica", { sharedPages: 0, anchorConclusive: false })] })[0];
  assert.notEqual(result.principalId, "generica");
  assert.deepEqual(result.addIds, []);
});
test("decisão 2026-09-30: publicado Livre sem volume ganha principal mais ampla que leva o núcleo do slug; cabeça genérica enorme continua fora", () => {
  const slug = "checklist-de-plano-de-marketing-para-clinica-de-estetica";
  assert.deepEqual(slugCoreWords(slug), ["plano", "marketing"]);
  assert.equal(carriesSlugCore(slug, { keyword: "exemplo de plano de marketing", volume: 1300 }), true);
  assert.equal(carriesSlugCore(slug, { keyword: "plano de marketing para clínica", volume: 90 }), true);
  assert.equal(carriesSlugCore(slug, { keyword: "plano de marketing", volume: 9900 }), false, "cabeça de 2 palavras acima de 5.000");
  assert.equal(carriesSlugCore(slug, { keyword: "marketing para clínica de estética", volume: 90 }), false, "sem o núcleo 'plano'");
  assert.equal(carriesSlugCore("agencia-de-marketing-para-cosmeticos", { keyword: "agência de marketing", volume: 18100 }), false);
  assert.deepEqual(slugCoreWords("como-atrair-pacientes-para-clinica-de-estetica"), ["atrair", "paciente"]);

  const semDna = (id: string, text: string) => resolveKeywordDnaSignals({ keywordId: id, text, semantic: {} });
  const alvo = page("chk", { theme: "checklist de plano de marketing para clínica de estética", slug, signals: semDna("chk", "checklist de plano de marketing para clínica de estética") });
  // 2026-10-17 · a principal da página FORA da identidade (o slug não foi feito dela): só então a mais ampla assume.
  const keywords = [
    term("chk", { keyword: "modelo de checklist para clínica", published: true, volume: null, volumeValidated: false, signals: semDna("chk", "checklist") }),
    term("amplo", { keyword: "exemplo de plano de marketing", volume: 1300, signals: semDna("amplo", "exemplo de plano de marketing") }),
    term("cabeca", { keyword: "plano de marketing", volume: 9900, signals: semDna("cabeca", "plano de marketing") }),
  ];
  const evidence = [proof("chk", "amplo", { sharedPages: 0, anchorConclusive: false }), proof("chk", "cabeca", { sharedPages: 0, anchorConclusive: false })];
  const livre = planArticleImprovements({ targets: [alvo], keywords, evidence })[0];
  assert.equal(livre.status, "ready", JSON.stringify(livre));
  assert.equal(livre.principalId, "amplo");
  assert.ok(!livre.memberIds.includes("cabeca"));
  assert.match(livre.reasons.join(" "), /Principal mais ampla, com volume/);
  const travado = planArticleImprovements({ targets: [{ ...alvo, post: "locked" }], keywords, evidence })[0];
  assert.equal(travado.principalId, "chk", "Travado não troca");
  // Principal de identidade (o slug foi feito dela): fica; a mais ampla entra como secundária e reforça o contexto; a cabeça enorme continua fora.
  const daPagina = keywords.map(k => k.id === "chk" ? { ...k, keyword: "checklist de plano de marketing para clínica de estética" } : k);
  const identidade = planArticleImprovements({ targets: [alvo], keywords: daPagina, evidence })[0];
  assert.equal(identidade.principalId, "chk");
  assert.deepEqual(identidade.addIds, ["amplo"]);
  assert.ok(!identidade.memberIds.includes("cabeca"));
  assert.ok(!identidade.reasons.some(reason => /Principal mais ampla/.test(reason)));
});

test("principal sem volume com Posto Livre FORA da identidade: a secundária com mais volume do próprio artigo assume, sem entrar nem sair nada, mesmo sem par da SERP (caso 'instagram não traz pacientes', 2026-10-01); de identidade, fica (2026-10-17)", () => {
  // A secundária com volume não divide páginas com a frase da página e não leva o slug: os passos de keyword nova não a escolhiam.
  // 2026-10-17 · o slug real ("instagram-nao-traz-pacientes") foi feito da principal: identidade, a principal FICA (SUBSTITUÍDO o caso de 01/10).
  const keywords = [
    term("ig", { keyword: "instagram não traz pacientes", published: true, volume: null, volumeValidated: false, ownerId: "ig" }),
    term("insta", { keyword: "como atrair clientes pelo instagram", volume: 70, ownerId: "ig" }),
  ];
  const identidade = planArticleImprovements({ targets: [page("ig", { theme: "instagram não traz pacientes", slug: "instagram-nao-traz-pacientes", memberIds: ["ig", "insta"] })], keywords, evidence: [] })[0];
  assert.equal(identidade.principalId, "ig", "principal de identidade: fica");
  assert.ok(!identidade.reasons.some(reason => /Principal sem volume com Posto Livre/.test(reason)));
  // Fora da identidade (o slug não foi feito da principal): a troca de 01/10 continua.
  const alvo = page("ig", { theme: "instagram não traz pacientes", slug: "como-atrair-clientes-pelo-instagram", memberIds: ["ig", "insta"] });
  const result = planArticleImprovements({ targets: [alvo], keywords, evidence: [] })[0];
  assert.equal(result.status, "ready", JSON.stringify(result.reasons));
  assert.equal(result.principalId, "insta");
  assert.deepEqual(result.addIds, []); assert.deepEqual(result.removeIds, []);
  assert.deepEqual(result.memberIds, ["ig", "insta"]);
  assert.match(result.reasons.join(" "), /Principal sem volume com Posto Livre/);
  // Travada, ou principal com volume: não troca por esta regra.
  assert.equal(planArticleImprovements({ targets: [{ ...alvo, post: "locked" }], keywords, evidence: [] })[0].principalId, "ig");
  const comVolume = keywords.map(k => k.id === "ig" ? { ...k, volume: 30, volumeValidated: true } : k);
  assert.notEqual(planArticleImprovements({ targets: [alvo], keywords: comVolume, evidence: [] })[0].principalId === "insta" && planArticleImprovements({ targets: [alvo], keywords: comVolume, evidence: [] })[0].reasons.some(r => /Principal sem volume/.test(r)), true);
});

test("a nova principal (fora da identidade) é a do artigo com mais sentido com o slug, não a de maior volume; o volume só desempata (dono, 2026-10-01)", () => {
  const alvo = page("pg", { theme: "como atrair pacientes para clínica de estética", slug: "como-atrair-pacientes-para-clinica-de-estetica", memberIds: ["pg", "amplo", "proximo"] });
  // 2026-10-17 · com a principal "como atrair pacientes para clínica de estética" (o slug feito dela) nada troca: identidade.
  const deIdentidade = term("pg", { keyword: "como atrair pacientes para clínica de estética", published: true, volume: null, volumeValidated: false, ownerId: "pg" });
  assert.equal(planArticleImprovements({ targets: [alvo], keywords: [deIdentidade, term("proximo", { keyword: "como atrair pacientes para clínica", volume: 20, ownerId: "pg" })], evidence: [] })[0].principalId, "pg");
  const keywords = [
    term("pg", { keyword: "agenda cheia na clínica de estética", published: true, volume: null, volumeValidated: false, ownerId: "pg" }),
    term("amplo", { keyword: "marketing digital para negócios", volume: 5400, ownerId: "pg" }),
    term("proximo", { keyword: "como atrair pacientes para clínica", volume: 20, ownerId: "pg" }),
  ];
  const result = planArticleImprovements({ targets: [alvo], keywords, evidence: [] })[0];
  assert.equal(result.status, "ready", JSON.stringify(result.reasons));
  assert.equal(result.principalId, "proximo", "a de volume 20 tem mais sentido com o slug do que a de 5.400");
  assert.match(result.reasons.join(" "), /mais próxima do slug/);
  // Nenhuma palavra em comum com o slug: não troca.
  const semSentido = keywords.filter(k => k.id !== "proximo");
  assert.notEqual(planArticleImprovements({ targets: [{ ...alvo, memberIds: ["pg", "amplo"] }], keywords: semSentido, evidence: [] })[0].principalId, "amplo");
});

test("publicado com principal COM volume fica travado ao slug: candidata de mais volume entra como apoio, não vira principal (dono, 2026-10-01)", () => {
  const result = planArticleImprovements({ targets: [page("old")], keywords: [term("old", { published: true, volume: 70, volumeValidated: true }), term("new", { volume: 210 })], evidence: [proof("old", "new")] })[0];
  assert.equal(result.principalId, "old");
  assert.deepEqual(result.addIds, ["new"]);
});

test("principal sem volume: a IA propõe primeiro; a troca pela keyword que já está no artigo fica pronta como reserva (o servidor a usa quando a SERP da IA não confirma) — caso 'instagram não traz pacientes', 2026-10-01; principal de identidade: sem reserva (2026-10-17)", () => {
  const keywords = [
    term("ig", { keyword: "instagram não traz pacientes", published: true, volume: null, volumeValidated: false, ownerId: "ig" }),
    term("insta", { keyword: "como atrair clientes pelo instagram", volume: 70, ownerId: "ig" }),
  ];
  assert.equal(volumelessPrincipalSwap(page("ig", { theme: "instagram não traz pacientes", slug: "instagram-nao-traz-pacientes", memberIds: ["ig", "insta"] }), new Map(keywords.map(k => [k.id, k]))), null, "o slug foi feito da principal: identidade, sem troca");
  const alvo = page("ig", { theme: "instagram não traz pacientes", slug: "como-atrair-clientes-pelo-instagram", memberIds: ["ig", "insta"] });
  const troca = volumelessPrincipalSwap(alvo, new Map(keywords.map(k => [k.id, k])));
  assert.ok(troca);
  assert.equal(troca.principalId, "insta"); assert.deepEqual(troca.addIds, []); assert.equal(troca.status, "ready"); assert.equal(troca.evidenceBasis, "serp");
  // Travado ou principal com volume: sem troca.
  assert.equal(volumelessPrincipalSwap({ ...alvo, post: "locked" }, new Map(keywords.map(k => [k.id, k]))), null);
});

/* ----------------------------------------------------------------------------
 * 2026-10-16 · A LINHA DE COPY E A SERP DA PRINCIPAL (SDD da linha única §15,
 * passos 3a, 3b e 4; caso real do amarelo da WifiConecta). Nenhuma SERP de
 * candidata é dada: o reforço sai do Assunto, do slug, dos detalhes do plano,
 * do DNA e do que a SERP da principal JÁ em cache mostra.
 * -------------------------------------------------------------------------- */
const TERR = "territory:amarelo";
const dnaDe = (id: string, text: string, entidade: string | null, intencao: string | null = null) => resolveKeywordDnaSignals({ keywordId: id, text, semantic: { ...(entidade ? { entidade_central: entidade } : {}), ...(intencao ? { intencao_principal: intencao } : {}) } });
const daLista = (id: string, keyword: string, volume: number, intencao: string | null = null): ImprovementKeyword => ({ id, keyword, volume, volumeValidated: true, signals: dnaDe(id, keyword, null, intencao), ownerId: null, published: false, territoryRef: TERR, external: false });
const doPlano = (id: string, keyword: string, titulo: string, slug: string, entidade: string, opcoes: { volume?: number; travada?: boolean; intencao?: string; escopo?: string } = {}) => {
  const k: ImprovementKeyword = { id, keyword, volume: opcoes.volume ?? null, volumeValidated: Boolean(opcoes.volume), signals: dnaDe(id, keyword, entidade, opcoes.intencao ?? null), ownerId: id, published: false, territoryRef: TERR, external: false };
  const t: ImprovementTarget = { id, kind: "subject", theme: titulo, note: null, primaryId: id, post: "free", memberIds: opcoes.volume ? [id] : [], territoryRef: TERR, slug: opcoes.volume ? slug : null, url: null, canonical: null, signals: k.signals, planPrincipalId: id, planSlug: slug, planScope: opcoes.escopo ?? null, ...(opcoes.travada || opcoes.volume ? { declaredPrincipalId: id } : {}) };
  return { k, t };
};
const VOCAB_CEP: ImprovementSerpVocabulary = { keywordId: "t3", lenses: 4, questions: ["Como saber qual provedor de internet tem na minha rua?", "Como saber qual internet pega no meu CEP?"], relatedSearches: ["Internet no meu bairro", "Melhor internet no meu cep", "Internet fibra no meu cep", "Internet no meu endereço"], titles: ["Cobertura de Internet: Guia Prático para Verificar no seu Endereço"] };
const VOCAB_BARATA: ImprovementSerpVocabulary = { keywordId: "t1", lenses: 4, questions: ["Qual é o pacote de internet residencial mais barato?", "Tem internet de R$50?"], relatedSearches: ["Plano internet residencial", "Preço internet residencial", "Internet residencial barata sp", "Vivo internet residencial"], titles: ["Internet residencial barata: 11 planos em Outubro 2026"] };

test("§15 · a linha de copy: a SERP da principal em cache indica; o slug e o DNA seguram o assunto; 'qual é o meu cep' e 'como ver meu cep na internet' ficam fora", () => {
  const { k, t } = doPlano("t3", "internet no meu cep", "Como saber quais operadoras de internet atendem minha rua e meu CEP", "operadoras-internet-no-meu-cep", "internet", { volume: 720, travada: true });
  const line = improvementCopyLine(t, new Map([[k.id, k]]), VOCAB_CEP);
  assert.equal(copyLineMatch(line, "melhor internet no meu cep").serp, 3, "relacionada exata");
  assert.equal(copyLineMatch(line, "melhor internet no meu cep").fits, true);
  assert.equal(copyLineMatch(line, "operadoras que atendem meu cep").fits, true, "reescreve o slug (operadoras + meu cep)");
  assert.equal(copyLineMatch(line, "qual é o meu cep").fits, false, "outra intenção: sem a entidade e sem o slug");
  assert.equal(copyLineMatch(line, "como ver meu cep na internet").fits, false, "palavra fora do assunto e sem a SERP");
  assert.equal(copyLineMatch(line, "entra na conta do google").fits, false);
});

test("§15 passo 4 · Travado com SERP em cache: secundárias pela SERP da principal, SEM SERP das candidatas; a principal fica; cabeça 3× maior e busca local ficam fora", () => {
  const { k, t } = doPlano("t1", "internet residencial barata", "Internet residencial barata: o que comparar além da mensalidade", "internet-residencial-barata", "internet residencial", { volume: 1600, travada: true, escopo: "Diferença entre preço promocional e custo real; reajuste, multa, instalação e serviços adicionais" });
  const keywords = [k, daLista("c1", "preço internet residencial", 170), daLista("c2", "internet residencial mais barata", 320), daLista("c3", "vivo internet residencial", 22200), daLista("c4", "internet residencial barata sp", 90), daLista("c5", "plano de internet residencial 4k para gamers", 50), daLista("c6", "internet residencial barata", 2000, null)];
  keywords[6] = { ...keywords[6], external: true };
  const [p] = planArticleImprovements({ targets: [t], keywords, evidence: [], serpVocabulary: { t1: VOCAB_BARATA } });
  assert.equal(p.status, "ready", JSON.stringify(p.reasons));
  assert.equal(p.principalId, "t1", "Travada: a principal nunca troca");
  assert.deepEqual([...p.addIds].sort(), ["c1", "c2"]);
  assert.equal(p.evidenceBasis, "copy_line");
  assert.ok(p.reasons.some(r => r.startsWith(COPY_LINE_LABEL) && /relacionadas da SERP de “internet residencial barata”/.test(r)), JSON.stringify(p.reasons));
  assert.ok(!p.memberIds.includes("c3"), "22.200 é cabeça de outro artigo (mais de 3× a principal)");
  assert.ok(!p.memberIds.includes("c4"), "busca local");
  assert.ok(!p.memberIds.includes("c6"), "a ideia da busca que repete a principal não entra de novo");
});

test("2026-10-17 · Principal de identidade: a Livre SEM volume que está no título e no slug do Assunto FICA; as mais amplas (plano(s) de internet residencial…) entram como secundárias e reforçam o contexto", () => {
  const { k, t } = doPlano("l1", "como escolher plano de internet residencial", "Como escolher um plano de internet residencial sem cair em uma oferta ruim", "como-escolher-plano-internet-residencial", "plano", { intencao: "Informativo" });
  assert.equal(principalIsIdentity({ keyword: k.keyword, title: t.theme, slug: t.planSlug }), true, "no título e no slug do plano");
  assert.equal(targetPrincipalIsIdentity(t, k), true);
  // Os números reais do Pilar do amarelo (17/10).
  const keywords = [k, daLista("e1", "planos de internet residencial", 6600), daLista("e2", "plano de internet residencial", 2900), daLista("e3", "plano internet residencial", 1000), daLista("e4", "melhores planos de internet residencial", 480, "Comercial"), daLista("e5", "melhor plano de internet residencial", 260, "Comercial")];
  const [p] = planArticleImprovements({ targets: [{ ...t, planRole: "Pilar" }], keywords, evidence: [] });
  assert.equal(p.status, "ready", JSON.stringify(p.reasons));
  assert.equal(p.principalId, "l1", "a principal de identidade fica, mesmo sem volume");
  // 2026-10-17 · SUBSTITUÍDO "as cinco entram": "plano internet residencial" (1.000) é a TERCEIRA grafia da mesma busca
  // ("planos de internet residencial", "plano de internet residencial") — no máximo duas, as de maior volume (SAME_SEARCH_MAX_PER_ARTICLE).
  assert.deepEqual([...p.addIds].sort(), ["e1", "e2", "e4", "e5"], "as mais amplas reforçam; a mesma busca entra no máximo duas vezes");
  assert.ok(!p.memberIds.includes("e3"), "a terceira variante da mesma busca fica de fora");
  assert.ok(p.memberIds.includes("l1") && p.memberIds.length === 5, JSON.stringify(p.memberIds));
  assert.match(p.reasons.join(" "), /^.*Principal de identidade: “como escolher plano de internet residencial” \(sem volume\) está no título e no slug do Assunto e fica como principal/);
  assert.ok(!p.reasons.some(reason => /assume como principal/.test(reason)), "nenhuma troca proposta");
  // "Procurar outra principal" (decisão do dono na linha) continua trocando.
  const [escolhida] = planArticleImprovements({ targets: [{ ...t, chosenPrincipalId: "e1" }], keywords, evidence: [] });
  assert.equal(escolhida.principalId, "e1");
});

test("§15 passo 3b · Livre SEM volume FORA da identidade (fora do título e do slug): a proposta de troca vai primeiro para a que leva o núcleo do slug com a entidade do DNA; depois a que mantém a intenção; a keyword do Assunto sai das keywords e continua como o Assunto", () => {
  const { k, t } = doPlano("lx", "internet sem fidelidade", "Como escolher um plano de internet residencial sem cair em uma oferta ruim", "como-escolher-plano-internet-residencial", "plano", {});
  assert.equal(targetPrincipalIsIdentity(t, k), false, "'fidelidade' não está no título nem no slug");
  assert.deepEqual(slugCoreWords(t.planSlug!, "plano"), ["plano", "internet", "residencial"], "o núcleo do slug com a entidade do DNA");
  const keywords = [k, daLista("e1", "como escolher internet residencial", 1300), daLista("e2", "melhor plano de internet residencial", 880, "Comercial"), daLista("e3", "planos de internet residencial", 6600)];
  const [p] = planArticleImprovements({ targets: [t], keywords, evidence: [] });
  assert.equal(p.status, "ready", JSON.stringify(p.reasons));
  assert.equal(p.currentPrimaryId, "lx");
  assert.equal(p.principalId, "e3", "leva o núcleo do slug (plano + internet + residencial), mais volume");
  assert.ok(!p.memberIds.includes("lx"), "o Assunto não é secundária do próprio artigo (contrato do ArticleDNA)");
  assert.ok(p.memberIds.includes("e1") && p.memberIds.includes("e2"), "as outras reforçam");
  assert.match(p.reasons.join(" "), /Livre sem volume e fora da identidade .*“planos de internet residencial” \(6600\) assume como principal .*leva o núcleo do slug, plano \+ internet \+ residencial.*Proposta: decisão sua na prévia/);
  assert.ok(p.reasons.includes(SUBJECT_KEYWORD_STAYS_SUBJECT_REASON) || !p.memberIds.includes("lx"));
  // Sem a do núcleo, a que mantém a intenção; sem nenhuma, a principal fica e o artigo só recebe reforço.
  const [semNucleo] = planArticleImprovements({ targets: [t], keywords: keywords.filter(item => item.id !== "e3" && item.id !== "e2"), evidence: [] });
  assert.equal(semNucleo.principalId, "e1");
  const pergunta = doPlano("lq", "quais dúvidas antes de assinar", "Como escolher um plano de internet residencial sem cair em uma oferta ruim", "como-escolher-plano-internet-residencial", "plano", { intencao: "Informativo" });
  const [so] = planArticleImprovements({ targets: [pergunta.t], keywords: [pergunta.k, daLista("e2", "melhor plano de internet residencial", 880, "Comercial")], evidence: [] });
  assert.equal(so.principalId, "lq");
  assert.ok(so.memberIds.includes("lq"), "a Livre que fica é a principal, entre as keywords");
  assert.match(so.reasons.join(" "), /Nenhuma candidata com volume mantém a intenção de “quais dúvidas antes de assinar” nem leva o núcleo do slug/);
});

test("§15 passo 3a · Travada ou Livre com volume: nunca troca, mesmo com candidata parecida de mais volume", () => {
  for (const opcoes of [{ volume: 10 }, { travada: true, volume: 720 }]) {
    const { k, t } = doPlano("t2", "combo internet e celular", "Combo de internet e celular vale a pena?", "combo-internet-e-celular-vale-a-pena", "combo internet celular", opcoes);
    const [p] = planArticleImprovements({ targets: [t], keywords: [k, daLista("x", "combo de internet e celular barato", 900)], evidence: [] });
    assert.equal(p.principalId, "t2", JSON.stringify(opcoes));
  }
});

test("§15 · o teto de seis vale para o artigo do plano (a principal conta) e a busca nova só semeia do plano e do DNA", () => {
  const { k, t } = doPlano("l3", "quantos mega de internet preciso", "300, 500, 600 Mega ou 1 Giga: quantos Mega você realmente precisa?", "quantos-mega-de-internet-preciso", "quantos mega", {});
  const lista = Array.from({ length: 8 }, (_, i) => daLista(`q${i}`, `quantos mega de internet preciso ${["para jogar", "para home office", "em casa", "para streaming", "para 4 pessoas", "para trabalhar", "para estudar", "no wifi"][i]}`, 100 + i));
  const [p] = planArticleImprovements({ targets: [{ ...t, planScope: "Dimensionamento por pessoas, dispositivos simultâneos e atividades: jogar, home office, casa, streaming, trabalhar, estudar, wifi" }], keywords: [k, ...lista], evidence: [] });
  assert.ok(p.memberIds.length <= 6, JSON.stringify(p.memberIds));
  const sementes = improvementDiscoverySeeds(t, new Map([[k.id, k]]), null, []);
  assert.equal(sementes[0], "quantos mega de internet preciso", "a principal primeiro");
  assert.ok(sementes.includes("quantos mega"), "a entidade do DNA");
  assert.ok(sementes.every(semente => !/entra na conta|primeira fatura/.test(semente)));
});

test("2026-10-17 · sem canibalização no Silo: as variantes da mesma busca vão TODAS para o artigo que as contém (o Pilar); a busca com marca só vai para quem nomeia a marca; a cabeça mais ampla não fica num Suporte", () => {
  const pilar = doPlano("l1", "como escolher plano de internet residencial", "Como escolher um plano de internet residencial sem cair em uma oferta ruim", "como-escolher-plano-internet-residencial", "plano", { intencao: "Informativo" });
  const barata = doPlano("t1", "internet residencial barata", "Internet residencial barata: o que comparar além da mensalidade", "internet-residencial-barata", "internet residencial", { volume: 1600, travada: true, escopo: "Diferença entre preço promocional e custo real" });
  const operadoras = doPlano("l2", "claro vivo ou tim internet residencial", "Claro, Vivo ou TIM para casa: como comparar onde você mora", "claro-vivo-tim-internet-residencial", "claro vivo ou tim internet", {});
  const alvos = [{ ...pilar.t, planRole: "Pilar" as const }, { ...barata.t, planRole: "Suporte" as const }, { ...operadoras.t, planRole: "Suporte" as const }];
  const vocab: ImprovementSerpVocabulary = { ...VOCAB_BARATA, keywordId: "t1", domains: ["vivo.com.br", "claro.com.br", "tim.com.br"] };
  const keywords = [pilar.k, barata.k, operadoras.k,
    daLista("v1", "planos de internet residencial", 6600), daLista("v2", "plano de internet residencial", 2900), daLista("v3", "plano internet residencial", 1000),
    daLista("p1", "preço internet residencial", 170), daLista("b1", "vivo internet residencial", 2400), daLista("b2", "internet residencial claro ou vivo", 110)];
  const propostas = planArticleImprovements({ targets: alvos, keywords, evidence: [], serpVocabulary: { t1: vocab } });
  const de = (id: string) => propostas.find(p => p.targetId === id)!;
  // 2026-10-17 · SUBSTITUÍDO "as três variantes no Pilar": a mesma busca entra no máximo duas vezes (as de maior volume) e nunca vai para outro artigo.
  assert.deepEqual(["v1", "v2", "v3"].filter(id => de("l1").memberIds.includes(id)), ["v1", "v2"], "as duas de maior volume no Pilar");
  assert.ok(!["v1", "v2", "v3"].some(id => de("t1").memberIds.includes(id)), "nenhuma variante dividida com 'barata'");
  assert.ok(!propostas.some(p => p.memberIds.includes("v3")), "a terceira grafia da mesma busca não vai para outro artigo");
  assert.ok(de("t1").memberIds.includes("p1"), "'barata' fica com 'preço internet residencial'");
  assert.ok(!de("t1").memberIds.includes("b1") && !de("t1").memberIds.includes("b2"), "'barata' não nomeia operadora: a busca com marca não entra");
  assert.ok(de("l2").memberIds.includes("b2"), "a busca com marca vai para o artigo que nomeia as operadoras");
});

test("2026-10-17 · sementes sem procurar à toa: palavra solta do DNA não semeia; a relacionada com marca só semeia o artigo que nomeia a marca ou as operadoras", () => {
  const combo = doPlano("t2", "combo internet e celular", "Combo de internet e celular vale a pena? Veja o que entra na conta", "combo-internet-celular-vale-a-pena", "internet", { volume: 720, travada: true });
  const vocab: ImprovementSerpVocabulary = { keywordId: "t2", lenses: 4, questions: [], relatedSearches: ["Claro combo internet e celular", "Combo internet celular"], titles: [], domains: ["claro.com.br", "vivo.com.br"] };
  const sementes = improvementDiscoverySeeds(combo.t, new Map([[combo.k.id, combo.k]]), vocab, []);
  assert.ok(sementes.includes("combo internet e celular"), "a principal semeia");
  assert.ok(!sementes.includes("internet"), "a entidade de uma palavra só não semeia");
  assert.ok(!sementes.some(seed => /claro/i.test(seed)), "o artigo não nomeia operadora: a relacionada com marca não semeia");
  const operadoras = doPlano("l2", "claro vivo ou tim internet residencial", "Claro, Vivo ou TIM para casa: como comparar onde você mora", "claro-vivo-tim-internet-residencial", "claro vivo ou tim internet", {});
  const deles = improvementDiscoverySeeds(operadoras.t, new Map([[operadoras.k.id, operadoras.k]]), { ...vocab, keywordId: "l2", relatedSearches: ["Claro internet residencial"] }, []);
  assert.ok(deles.some(seed => normalizeKeyword(seed) === "claro internet residencial"), "o artigo que nomeia a marca recebe a semente dela");
});

test("2026-10-17 · a variante de uma secundária que JÁ está num artigo do Silo fica com esse artigo, nunca vai para outro", () => {
  const pilar = doPlano("l1", "como escolher plano de internet residencial", "Como escolher um plano de internet residencial sem cair em uma oferta ruim", "como-escolher-plano-internet-residencial", "plano", { intencao: "Informativo" });
  const barata = doPlano("t1", "internet residencial barata", "Internet residencial barata: o que comparar além da mensalidade", "internet-residencial-barata", "internet residencial", { volume: 1600, travada: true });
  const membro = { ...daLista("m1", "preço internet residencial", 170), ownerId: "l1" };
  const alvos = [{ ...pilar.t, planRole: "Pilar" as const, memberIds: ["m1"] }, { ...barata.t, planRole: "Suporte" as const }];
  const keywords = [pilar.k, barata.k, membro, daLista("v1", "preço de internet residencial", 170)];
  const propostas = planArticleImprovements({ targets: alvos, keywords, evidence: [], serpVocabulary: { t1: VOCAB_BARATA } });
  assert.ok(!propostas.find(p => p.targetId === "t1")!.memberIds.includes("v1"), "'preço de internet residencial' é variante da secundária do Pilar: não vai para 'barata'");
});
