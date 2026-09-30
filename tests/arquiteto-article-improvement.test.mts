import test from "node:test";
import assert from "node:assert/strict";
import { allocateReinforcementChoices } from "../lib/arquiteto/reinforcement-allocation.ts";
import { planArticleImprovements, carriesSlugCore, slugCoreWords, improvementEditorialFit, type ImprovementTarget, type ImprovementKeyword, type ImprovementEvidence } from "../lib/arquiteto/article-improvement.ts";
import { resolveKeywordDnaSignals } from "../lib/arquiteto/keyword-dna-signals.ts";

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
test("Livre sem volume usa fundamento editorial e SERP completa da candidata", () => {
  const result = planArticleImprovements({ targets: [page("old")], keywords: [term("old", { published: true, volume: null, volumeValidated: false }), term("new", { keyword: "captação de pacientes old guia" })], evidence: [proof("old", "new", { sharedPages: 0, anchorConclusive: false })] })[0];
  assert.equal(result.status, "ready"); assert.equal(result.principalId, "new");
  assert.deepEqual(result.memberIds, ["old", "new"]); assert.equal(result.evidenceBasis, "editorial_and_candidate_serp");
});
test("Travada fica, desconhecida também; ambas podem receber apoio", () => {
  for (const post of ["locked", "unknown"] as const) {
    const result = planArticleImprovements({ targets: [page("old", { post })], keywords: [term("old", { published: true, volume: 0, volumeValidated: false }), term("new")], evidence: [proof("old", "new")] })[0];
    assert.equal(result.principalId, "old"); assert.deepEqual(result.addIds, ["new"]);
  }
});

test("apoio já presente pode assumir a principal Livre sem precisar de nova vaga", () => {
  const result = planArticleImprovements({ targets: [page("old", { memberIds: ["old", "existing"] })], keywords: [term("old", { published: true, volume: 0, volumeValidated: false }), term("existing", { ownerId: "old" })], evidence: [proof("old", "existing")] })[0];
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
test("caso real 2026-09-30: captar × atrair ficam distintos quando cada um recebe keywords próprias da lista", () => {
  const a = page("a", { theme: "como captar clientes para clínica de estética" }), b = page("b", { theme: "como atrair pacientes para clínica de estética" });
  const keywords = [term("a", { published: true, volume: 0, volumeValidated: false }), term("b", { published: true, volume: 0, volumeValidated: false }), term("ka", { keyword: "como captar clientes", volume: 390 }), term("kb", { keyword: "como atrair clientes pelo instagram", volume: 90 })];
  const result = planArticleImprovements({ targets: [a, b], keywords, evidence: [proof("a", "ka"), proof("b", "kb")] });
  assert.ok(result.every(p => p.status === "ready"), JSON.stringify(result.map(p => [p.status, p.reasons])));
  assert.equal(result[0].principalId, "ka"); assert.equal(result[1].principalId, "kb");
  assert.deepEqual(result[0].exclusions, ["como atrair clientes pelo instagram"]);
  assert.deepEqual(result[1].exclusions, ["como captar clientes"]);
  assert.match(result[0].reasons.join(" "), /keywords próprias da lista/);
});
test("ângulos distintos são registrados com exclusões recíprocas", () => {
  const a = page("a", { theme: "como captar clientes para clínica de estética" }), b = page("b", { theme: "como atrair pacientes para clínica de estética" });
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
  const keywords = [
    term("chk", { keyword: "checklist de plano de marketing para clínica de estética", published: true, volume: null, volumeValidated: false, signals: semDna("chk", "checklist") }),
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
});
