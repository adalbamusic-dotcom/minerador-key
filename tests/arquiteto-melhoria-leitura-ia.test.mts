import test from "node:test";
import assert from "node:assert/strict";
import { planArticleImprovements, editorialAiBarrier, editorialAiPrincipalBlock, IMPROVEMENT_AI_LABEL, type ImprovementKeyword, type ImprovementTarget, type ImprovementEvidence, type ImprovementEditorialPick } from "../lib/arquiteto/article-improvement.ts";
import { buildImprovementAiPrompt, improvementAiList, improvementAiTargets, validateImprovementAiPicks, IMPROVEMENT_AI_SYSTEM } from "../lib/arquiteto/article-improvement-ai.ts";
import { resolveKeywordDnaSignals } from "../lib/arquiteto/keyword-dna-signals.ts";
import { normalizeKeyword } from "../lib/minerador/keyword-import-core.ts";

/*
 * LEITURA EDITORIAL DA IA NA LISTA (decisão do dono, 2026-09-30, "Sim, lista
 * primeiro"). Exemplos reais da AdalbaPro. A IA é simulada: estes testes
 * provam que o CÓDIGO barra o que não serve, mesmo quando a IA sugere.
 */
const sig = (id: string, text: string) => resolveKeywordDnaSignals({ keywordId: id, text });
const slugOf = (text: string) => normalizeKeyword(text).replace(/\s+/g, "-");
const kw = (id: string, keyword: string, volume: number | null, overrides: Partial<ImprovementKeyword> = {}): ImprovementKeyword => ({ id, keyword, volume, volumeValidated: volume !== null && volume > 0, signals: sig(id, keyword), ownerId: null, published: false, territoryRef: "territory:a", external: false, ...overrides });
const pub = (id: string, theme: string, overrides: Partial<ImprovementTarget> = {}): ImprovementTarget => ({ id, kind: "published", theme, note: null, primaryId: id, post: "free", memberIds: [id], territoryRef: "territory:a", slug: slugOf(theme), url: `https://adalbapro.com.br/${slugOf(theme)}`, canonical: `https://adalbapro.com.br/${slugOf(theme)}`, signals: sig(id, theme), ...overrides });
const own = (target: ImprovementTarget) => kw(target.id, target.theme, null, { published: true });
const pick = (targetId: string, keywordId: string, role: "principal" | "secundaria" = "secundaria", reason = "Quem busca quer o mesmo passo a passo do artigo.") => ({ targetId, keywordId, role, reason });
const noEvidence: ImprovementEvidence[] = [];

const consultorio = pub("consultorio", "como atrair clientes para consultorio");
const estetica = pub("estetica", "como captar clientes para clinica de estetica");
const boas = [kw("atrair", "como atrair clientes", 720), kw("atrair-os", "como atrair os clientes", 720), kw("captar", "como captar clientes", 390)];

test("casos BONS: a IA completa o publicado sem par da SERP, com motivo visível e sem SERP para escolher", () => {
  const targets = [consultorio, estetica];
  const keywords = [own(consultorio), own(estetica), ...boas];
  const serpOnly = planArticleImprovements({ targets, keywords, evidence: noEvidence, listReading: false });
  assert.ok(serpOnly.every(p => p.status !== "ready"), "sem par da SERP, nenhuma proposta pronta");
  const list = improvementAiList(keywords, serpOnly);
  assert.deepEqual(list.map(k => k.id).sort(), ["atrair", "atrair-os", "captar"]);
  const checked = validateImprovementAiPicks({ picks: [pick("consultorio", "atrair", "principal"), pick("consultorio", "atrair-os"), pick("estetica", "captar", "principal")] }, { targets, keywords, listIds: list.map(k => k.id) });
  assert.deepEqual(checked.rejected, []);
  const [a, b] = planArticleImprovements({ targets, keywords, evidence: noEvidence, editorialPicks: checked.picks, ranking: { consultorio: false, estetica: false } });
  assert.equal(a.status, "ready"); assert.equal(a.evidenceBasis, "editorial_ai");
  assert.equal(a.principalId, "atrair"); assert.deepEqual(a.memberIds, ["consultorio", "atrair", "atrair-os"]); assert.deepEqual(a.addIds, ["atrair", "atrair-os"]);
  assert.deepEqual(a.aiReasons?.map(r => r.keywordId), ["atrair", "atrair-os"]);
  assert.match(a.reasons.join(" "), /parecer da SERP da composição final continua obrigatório/);
  // A principal nova é mais ampla que o slug ("para consultório" sai da busca): o aviso de SEO fica escrito na linha.
  assert.match(a.reasons.join(" "), /Principal mais ampla, com volume: "como atrair clientes" leva o núcleo do assunto da página; o nicho do slug continua no texto/);
  assert.equal(b.status, "ready"); assert.equal(b.principalId, "captar"); assert.deepEqual(b.memberIds, ["estetica", "captar"]);
  assert.equal(IMPROVEMENT_AI_LABEL, "Leitura da IA — confira");
});

test("casos RUINS: o código barra mesmo quando a IA sugere", () => {
  const casos: [ImprovementTarget, ImprovementKeyword, RegExp][] = [
    [pub("sem-trafego", "captacao de pacientes sem trafego pago"), kw("trafego", "trafego pago como funciona", 1900), /restrição|contradiz|núcleo/],
    [pub("atrair-pacientes", "como atrair pacientes para clinica de estetica"), kw("facial", "clinica de estetica facial", 880), /outro tema/],
    [pub("checklist", "checklist de plano de marketing para clinica de estetica"), kw("vet", "marketing para veterinarios", 480), /Outro nicho|contradiz|outro tema/],
    // Sem slug publicado (Assunto), o núcleo inteiro ("plano" e "marketing") segura antes do nicho.
    [{ ...pub("checklist-assunto", "checklist de plano de marketing para clinica de estetica"), kind: "subject", primaryId: null, memberIds: [], slug: null, url: null, canonical: null }, kw("vet", "marketing para veterinarios", 480), /outro tema/],
    // Com o núcleo inteiro, o nicho declarado depois de "para" ainda barra.
    [{ ...pub("checklist-assunto", "checklist de plano de marketing para clinica de estetica"), kind: "subject", primaryId: null, memberIds: [], slug: null, url: null, canonical: null }, kw("vet-plano", "plano de marketing para veterinarios", 210), /Outro nicho/],
    [pub("cosmeticos", "agencia de marketing para cosmeticos"), kw("agencia", "agencia de marketing", 18100), /Cabeça genérica/],
  ];
  for (const [target, candidate, motivo] of casos) {
    const barrier = editorialAiBarrier(target, candidate);
    assert.ok(barrier, `${candidate.keyword} → ${target.theme} deveria ser barrada`);
    assert.match(barrier!, motivo);
    const keywords = [own(target), candidate];
    const checked = validateImprovementAiPicks({ picks: [pick(target.id, candidate.id, "principal")] }, { targets: [target], keywords, listIds: [candidate.id] });
    assert.equal(checked.picks.length, 0); assert.equal(checked.rejected.length, 1);
    // Mesmo que uma escolha chegue ao plano sem passar pelo validador, a barreira vale de novo.
    const forced: ImprovementEditorialPick[] = [{ ...pick(target.id, candidate.id, "principal"), rank: 0 }];
    const plan = planArticleImprovements({ targets: [target], keywords, evidence: noEvidence, editorialPicks: forced, ranking: { [target.id]: false } })[0];
    assert.notEqual(plan.status, "ready"); assert.deepEqual(plan.addIds, []);
  }
});

test("ids inventados, alvo não enviado, formato errado e mais de 3 por alvo são recusados", () => {
  const extras = [kw("c4", "como atrair clientes no consultorio", 90), kw("c5", "como atrair mais clientes", 320)];
  const keywords = [own(consultorio), ...boas, ...extras];
  const listIds = keywords.filter(k => !k.published).map(k => k.id);
  const checked = validateImprovementAiPicks({ picks: [
    pick("consultorio", "inventado"), pick("outro-alvo", "atrair"),
    pick("consultorio", "atrair"), pick("consultorio", "atrair"), pick("consultorio", "atrair-os"), pick("consultorio", "c5"), pick("consultorio", "c4"),
  ] }, { targets: [consultorio], keywords, listIds });
  assert.deepEqual(checked.picks.map(p => [p.keywordId, p.rank]), [["atrair", 0], ["atrair-os", 1], ["c5", 2]]);
  assert.deepEqual(checked.rejected.map(r => r.reason.split(":")[0]), ["Keyword fora da lista enviada (id inventado)", "Alvo que não foi enviado à IA", "Mais de 3 para o mesmo alvo"]);
  assert.equal(validateImprovementAiPicks({ picks: [{ targetId: "consultorio", keywordId: "atrair" }] }, { targets: [consultorio], keywords, listIds }).picks.length, 0);
  assert.equal(validateImprovementAiPicks("não é JSON", { targets: [consultorio], keywords, listIds }).rejected.length, 1);
  // Id presente na lista de keywords mas NÃO enviado à IA também é recusado.
  assert.equal(validateImprovementAiPicks({ picks: [pick("consultorio", "atrair")] }, { targets: [consultorio], keywords, listIds: ["atrair-os"] }).picks.length, 0);
});

test("barreiras da lista: publicada, sem volume validado, de outro artigo aprovado e ideia externa nunca entram", () => {
  const casos = [
    kw("p", "como atrair clientes rapido", 300, { published: true }),
    kw("v", "como atrair clientes rapido", null),
    kw("v2", "como atrair clientes rapido", 300, { volumeValidated: false }),
    kw("o", "como atrair clientes rapido", 300, { ownerId: "outro-artigo" }),
    kw("e", "como atrair clientes rapido", 300, { external: true }),
  ];
  for (const candidate of casos) assert.ok(editorialAiBarrier(consultorio, candidate), candidate.id);
  assert.deepEqual(improvementAiList([...casos, ...boas], []).map(k => k.id).sort(), ["atrair", "atrair-os", "captar"]);
});

test("principal nova só com Posto Livre, atual sem volume e página que não ranqueia; senão entra como secundária", () => {
  const candidate = boas[0];
  const semVolume = own(consultorio), comVolume = kw("consultorio", consultorio.theme, 140, { published: true });
  assert.equal(editorialAiPrincipalBlock(consultorio, semVolume, candidate, false), null);
  assert.match(editorialAiPrincipalBlock({ ...consultorio, post: "locked" }, semVolume, candidate, false)!, /Travado/);
  assert.match(editorialAiPrincipalBlock({ ...consultorio, post: "unknown" }, semVolume, candidate, false)!, /não foi declarado/);
  assert.match(editorialAiPrincipalBlock(consultorio, comVolume, candidate, false)!, /já tem volume/);
  assert.match(editorialAiPrincipalBlock(consultorio, semVolume, candidate, true)!, /ranqueia/);
  assert.match(editorialAiPrincipalBlock(consultorio, semVolume, candidate, null)!, /não deu para reler/);
  for (const [target, ranking, current] of [[{ ...consultorio, post: "locked" as const }, false, semVolume], [consultorio, true, semVolume], [consultorio, null, semVolume], [consultorio, false, comVolume]] as const) {
    const keywords = [current, ...boas];
    const checked = validateImprovementAiPicks({ picks: [pick("consultorio", "atrair", "principal")] }, { targets: [target], keywords, listIds: ["atrair"] });
    const plan = planArticleImprovements({ targets: [target], keywords, evidence: noEvidence, editorialPicks: checked.picks, ranking: { consultorio: ranking } })[0];
    assert.equal(plan.status, "ready"); assert.equal(plan.principalId, "consultorio", "a principal atual fica");
    // A escolha da IA vem primeiro; a lista completa só com o verbo do slug ("atrair"), nunca "captar".
    assert.equal(plan.addIds[0], "atrair"); assert.ok(!plan.addIds.includes("captar"));
    if (current === semVolume) assert.match(plan.reasons.join(" "), /entra como secundária/);
  }
});

test("Assunto sem principal e sem papel da IA: vence a que leva o núcleo, com mais volume e menos palavras de ligação", () => {
  const subject: ImprovementTarget = { ...pub("assunto", "como atrair clientes para consultorio odontologico"), kind: "subject", primaryId: null, memberIds: [], slug: null, url: null, canonical: null };
  const keywords = [...boas, kw("pouco", "como atrair clientes no consultorio", 90)];
  // A IA pôs a variante com artigo primeiro; a principal do conteúdo novo fica alinhada ao slug.
  const checked = validateImprovementAiPicks({ picks: [pick("assunto", "atrair-os"), pick("assunto", "pouco"), pick("assunto", "atrair")] }, { targets: [subject], keywords, listIds: ["atrair", "atrair-os", "pouco"] });
  const plan = planArticleImprovements({ targets: [subject], keywords, evidence: noEvidence, editorialPicks: checked.picks })[0];
  assert.equal(plan.status, "ready"); assert.equal(plan.principalId, "atrair", "720 e 3 palavras vence 720 com artigo e 90");
  assert.deepEqual(plan.memberIds, ["atrair-os", "pouco", "atrair"]);
  // Quando a IA marca a principal, vale a marcação dela (as barreiras continuam).
  const marcada = validateImprovementAiPicks({ picks: [pick("assunto", "atrair-os", "principal"), pick("assunto", "atrair")] }, { targets: [subject], keywords, listIds: ["atrair", "atrair-os"] });
  assert.equal(planArticleImprovements({ targets: [subject], keywords, evidence: noEvidence, editorialPicks: marcada.picks })[0].principalId, "atrair-os");
});

test("alocação: uma keyword vai para um alvo só (preferência da IA) e o artigo não passa de 6", () => {
  const outro = pub("outro", "como atrair clientes para salao de beleza");
  const keywords = [own(consultorio), own(outro), ...boas];
  const checked = validateImprovementAiPicks({ picks: [pick("outro", "atrair-os"), pick("outro", "atrair"), pick("consultorio", "atrair")] }, { targets: [consultorio, outro], keywords, listIds: ["atrair", "atrair-os"] });
  const [a, b] = planArticleImprovements({ targets: [consultorio, outro], keywords, evidence: noEvidence, editorialPicks: checked.picks, ranking: { consultorio: false, outro: false } });
  const owners = [...a.addIds.map(id => [id, "consultorio"]), ...b.addIds.map(id => [id, "outro"])];
  assert.equal(new Set(owners.map(([id]) => id)).size, owners.length, "nenhuma keyword em dois alvos");
  assert.deepEqual(a.addIds, ["atrair"], "a primeira escolha para o consultório vence a segunda do outro");
  assert.deepEqual(b.addIds, ["atrair-os"]);
  const cheio = { ...consultorio, memberIds: ["consultorio", "m1", "m2", "m3", "m4"] };
  const membros = ["m1", "m2", "m3", "m4"].map(id => kw(id, `como atrair clientes ${id}`, 20, { ownerId: "consultorio" }));
  const all = [own(consultorio), ...membros, ...boas];
  const cap = validateImprovementAiPicks({ picks: [pick("consultorio", "atrair"), pick("consultorio", "atrair-os")] }, { targets: [cheio], keywords: all, listIds: ["atrair", "atrair-os"] });
  const plan = planArticleImprovements({ targets: [cheio], keywords: all, evidence: noEvidence, editorialPicks: cap.picks, ranking: { consultorio: false } })[0];
  assert.equal(plan.memberIds.length, 6); assert.deepEqual(plan.addIds, ["atrair"]);
});

test("ordem: a proposta pronta pela SERP vence e a keyword dela não é reaproveitada pela IA", () => {
  const keywords = [own(consultorio), own(estetica), ...boas];
  const evidence: ImprovementEvidence[] = [{ targetId: "estetica", keywordId: "captar", complete: true, sharedPages: 4, contradiction: false, anchorConclusive: false }];
  const serp = planArticleImprovements({ targets: [consultorio, estetica], keywords, evidence, listReading: false });
  assert.equal(serp[1].status, "ready"); assert.equal(serp[1].evidenceBasis, "serp");
  assert.deepEqual(improvementAiTargets([consultorio, estetica], serp).map(t => t.id), ["consultorio"], "só quem ficou sem proposta pronta vai para a IA");
  assert.ok(!improvementAiList(keywords, serp).some(k => k.id === "captar"));
  const forced: ImprovementEditorialPick[] = [{ ...pick("estetica", "atrair"), rank: 0 }, { ...pick("consultorio", "captar"), rank: 0 }];
  const [a, b] = planArticleImprovements({ targets: [consultorio, estetica], keywords, evidence, editorialPicks: forced, ranking: { consultorio: false, estetica: false } });
  assert.equal(b.evidenceBasis, "serp", "a IA não sobrescreve a SERP");
  assert.ok(!a.addIds.includes("captar"), "a keyword da proposta da SERP não vai para outro alvo");
  // O consultório recebe as de "atrair" pela leitura da lista pelo código (núcleo do slug).
  assert.equal(a.evidenceBasis, "list_core"); assert.deepEqual([...a.addIds].sort(), ["atrair", "atrair-os"]);
});

test("pedido único em lote: instrução com exemplos, lista com ids e quem pode trocar a principal", () => {
  const keywords = [own(consultorio), own(estetica), ...boas];
  const prompt = buildImprovementAiPrompt({ targets: [consultorio, estetica], list: boas, keywords, ranking: { consultorio: false, estetica: true } });
  assert.equal(prompt.system, IMPROVEMENT_AI_SYSTEM);
  for (const exemplo of ["como atrair os clientes", "como captar clientes", "tráfego pago como funciona", "clínica de estética facial", "marketing para veterinários", "18.100", "Nunca invente id"]) assert.ok(prompt.system.includes(exemplo), exemplo);
  const user = JSON.parse(prompt.user);
  // Apelidos curtos no pedido (resposta menor, cabe no limite de tempo); o código traduz de volta.
  assert.deepEqual(user.alvos.map((a: any) => [a.targetId, a.tema, a.podeTrocarPrincipal, a.vagas]), [["A1", consultorio.theme, true, 3], ["A2", estetica.theme, false, 3]]);
  assert.deepEqual(user.lista.map((k: any) => [k.keywordId, k.keyword, k.volume]), [["K1", "como atrair clientes", 720], ["K2", "como atrair os clientes", 720], ["K3", "como captar clientes", 390]]);
  assert.deepEqual(prompt.aliases, { targets: { A1: "consultorio", A2: "estetica" }, keywords: { K1: "atrair", K2: "atrair-os", K3: "captar" } });
  assert.ok(!prompt.user.includes("\"atrair-os\""), "os ids reais não vão para a IA");
});

test("com apelidos, só o apelido do pedido vale: apelido desconhecido ou id real é id inventado", () => {
  const keywords = [own(consultorio), ...boas];
  const prompt = buildImprovementAiPrompt({ targets: [consultorio], list: boas, keywords, ranking: { consultorio: false } });
  const checked = validateImprovementAiPicks({ picks: [pick("A1", "K2", "principal"), pick("A1", "K99"), pick("A1", "atrair"), pick("A9", "K1"), pick("consultorio", "K1"), pick("toString", "K1"), pick("A1", "constructor")] }, { targets: [consultorio], keywords, listIds: boas.map(k => k.id), aliases: prompt.aliases });
  assert.deepEqual(checked.picks.map(p => [p.targetId, p.keywordId, p.role]), [["consultorio", "atrair-os", "principal"]]);
  assert.equal(checked.rejected.length, 6);
});

test("uma escolha malformada não derruba as boas: acento no papel, motivo longo e campo a mais", () => {
  const keywords = [own(consultorio), ...boas];
  const listIds = boas.map(k => k.id);
  const longo = "Quem busca atrair clientes quer exatamente o passo a passo deste artigo, ".repeat(6);
  const checked = validateImprovementAiPicks({ picks: [
    { targetId: "consultorio", keywordId: "atrair", role: "Secundária", reason: longo, confianca: 0.9 },
    { targetId: "consultorio", keywordId: "atrair-os", role: "reforço", reason: "Papel que não existe." },
    { targetId: "consultorio", keywordId: "captar" },
    "texto solto",
  ], observacao: "campo a mais no envelope" }, { targets: [consultorio], keywords, listIds });
  assert.deepEqual(checked.picks.map(p => [p.keywordId, p.role]), [["atrair", "secundaria"]]);
  assert.ok(checked.picks[0].reason.length <= 240 && checked.picks[0].reason.endsWith("…"));
  assert.equal(checked.rejected.length, 3);
  assert.ok(checked.rejected.every(r => /fora do formato/.test(r.reason)));
  // A recusa guarda o texto da keyword e do alvo para a tela mostrar.
  const barrada = validateImprovementAiPicks({ picks: [pick("consultorio", "facial")] }, { targets: [consultorio], keywords: [...keywords, kw("facial", "clinica de estetica facial", 880)], listIds: ["facial"] });
  assert.deepEqual([barrada.rejected[0].keyword, barrada.rejected[0].theme], ["clinica de estetica facial", consultorio.theme]);
});

test("núcleo do assunto: as duas palavras precisam estar; uma palavra ambígua não basta", () => {
  const checklist = pub("checklist", "checklist de plano de marketing para clinica de estetica");
  assert.match(editorialAiBarrier(checklist, kw("saude", "plano de saude para clinica", 1300))!, /outro tema/);
  assert.match(editorialAiBarrier(checklist, kw("mkt", "marketing para clinica de estetica", 90))!, /outro tema/);
  assert.equal(editorialAiBarrier(checklist, kw("exemplo", "exemplo de plano de marketing", 1300)), null);
  // Sinônimos do núcleo continuam valendo: atrair = captar, paciente = cliente.
  assert.equal(editorialAiBarrier(pub("pacientes", "como atrair pacientes para clinica de estetica"), kw("captar", "como captar clientes", 390)), null);
});

test("limite por chamada: até 12 alvos vão à IA; os outros ficam com as regras", async () => {
  const { IMPROVEMENT_AI_MAX_TARGETS, IMPROVEMENT_AI_MAX_TOKENS, improvementAiEligibleTargets } = await import("../lib/arquiteto/article-improvement-ai.ts");
  assert.equal(IMPROVEMENT_AI_MAX_TARGETS, 12);
  assert.ok(IMPROVEMENT_AI_MAX_TOKENS >= IMPROVEMENT_AI_MAX_TARGETS * 3 * 50, "o teto de saída cabe 3 escolhas curtas por alvo");
  const muitos = Array.from({ length: 15 }, (_, i) => pub(`p${i}`, `como atrair clientes para consultorio ${i}`));
  assert.equal(improvementAiEligibleTargets(muitos, []).length, 15);
  assert.equal(improvementAiTargets(muitos, []).length, 12);
});

test("a leitura da IA dá a vez primeiro aos artigos com menos keywords: os já melhorados não tomam as 12 vagas", async () => {
  const { improvementAiTargets, IMPROVEMENT_AI_MAX_TARGETS } = await import("../lib/arquiteto/article-improvement-ai.ts");
  const alvo = (id: string, membros: number) => ({ id, kind: "published", theme: id, note: null, primaryId: id, post: "free", memberIds: Array.from({ length: membros }, (_, i) => `${id}-${i}`), territoryRef: "territory:a", slug: id, url: null, canonical: null, signals: {} }) as any;
  const melhorados = Array.from({ length: 12 }, (_, i) => alvo(`melhorado-${i}`, 3));
  const fracos = Array.from({ length: 7 }, (_, i) => alvo(`fraco-${i}`, 1));
  const escolhidos = improvementAiTargets([...melhorados, ...fracos], []).map((t: any) => t.id);
  assert.equal(escolhidos.length, IMPROVEMENT_AI_MAX_TARGETS);
  for (let i = 0; i < 7; i++) assert.ok(escolhidos.includes(`fraco-${i}`), `fraco-${i} entra na leitura`);
});

test("secundárias da lista que a IA acertou e as regras de principal barravam (caso real, 2026-09-30)", async () => {
  const { editorialAiBarrier } = await import("../lib/arquiteto/article-improvement.ts");
  const alvo = (id: string, tema: string) => ({ id, kind: "published", theme: tema, note: null, primaryId: id, post: "free", memberIds: [id], territoryRef: "territory:a", slug: tema.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "-"), url: null, canonical: null, signals: resolveKeywordDnaSignals({ keywordId: id, text: tema, semantic: {} }) }) as any;
  const k = (id: string, texto: string, volume: number) => ({ id, keyword: texto, volume, volumeValidated: true, signals: resolveKeywordDnaSignals({ keywordId: id, text: texto, semantic: {} }), ownerId: null, published: false, territoryRef: "territory:b", external: false }) as any;
  const passam: Array<[string, string, number]> = [
    ["como captar clientes para clínica de estética", "como captar clientes", 390],
    ["como captar clientes para clínica de estética", "como captar um cliente", 390],
    ["como captar clientes para clínica de estética", "como fazer captação de clientes", 40],
    ["captação de pacientes sem tráfego pago", "tráfego orgânico", 1000],
    ["como atrair pacientes sem redes sociais", "sem redes sociais", 260],
    ["instagram não traz pacientes", "como atrair clientes pelo instagram", 70],
    ["como atrair clientes para consultório", "como conseguir clientes", 210],
  ];
  for (const [tema, texto, volume] of passam) assert.equal(editorialAiBarrier(alvo("t", tema), k("c", texto, volume)), null, `${texto} → ${tema}`);
  // Continuam barradas.
  assert.match(editorialAiBarrier(alvo("t", "captação de pacientes sem tráfego pago"), k("c", "tráfego pago como funciona", 5400))!, /restrição editorial/);
  assert.match(editorialAiBarrier(alvo("t", "marketing para clínica de estética"), k("c", "agência de marketing", 18100))!, /Cabeça genérica/);
  assert.match(editorialAiBarrier(alvo("t", "como atrair pacientes para clínica de estética"), k("c", "clínica de estética facial", 260))!, /outro tema/);
});

test("caso real 2026-09-30: a IA deu 'captar' aos dois; a leitura da lista pelo código dá a cada página o verbo do próprio slug", async () => {
  const { IMPROVEMENT_LIST_CORE_LABEL, slugCoreListPicks } = await import("../lib/arquiteto/article-improvement.ts");
  assert.equal(IMPROVEMENT_LIST_CORE_LABEL, "Lista · núcleo do slug");
  const captar = pub("captar-pg", "como captar clientes para clinica de estetica");
  const atrair = pub("atrair-pg", "como atrair pacientes para clinica de estetica");
  const lista = [
    kw("c1", "como captar clientes", 390), kw("c2", "como captar um cliente", 390),
    kw("a1", "como atrair clientes", 720), kw("a2", "como atrair o cliente", 720), kw("a3", "como atrair os clientes", 720), kw("a4", "como atrair um cliente", 720),
    kw("ig", "como atrair clientes pelo instagram", 70), kw("zero", "como atrair pacientes", null),
  ];
  const keywords = [own(captar), own(atrair), ...lista];
  // O que a IA fez de verdade: as duas de "captar" para os dois.
  const picks: ImprovementEditorialPick[] = [
    { targetId: "captar-pg", keywordId: "c2", role: "secundaria", reason: "variação", rank: 0 },
    { targetId: "atrair-pg", keywordId: "c1", role: "secundaria", reason: "sinônimo", rank: 0 },
  ];
  const [pc, pa] = planArticleImprovements({ targets: [captar, atrair], keywords, evidence: noEvidence, editorialPicks: picks, ranking: { "captar-pg": false, "atrair-pg": false } });
  assert.equal(pc.status, "ready", JSON.stringify(pc.reasons)); assert.equal(pa.status, "ready", JSON.stringify(pa.reasons));
  assert.equal(pc.evidenceBasis, "list_core"); assert.equal(pa.evidenceBasis, "list_core");
  assert.deepEqual([...pc.addIds].sort(), ["c1", "c2"], "captar fica com as de captar");
  assert.ok(pa.addIds.every(id => id.startsWith("a")) && pa.addIds.length === 3, `atrair fica com as de atrair: ${pa.addIds}`);
  assert.ok(!pa.addIds.includes("ig"), "ângulo instagram não é o núcleo");
  assert.ok(!pa.addIds.includes("zero"), "sem volume nunca entra");
  assert.ok(pc.principalId === "c1" || pc.principalId === "c2", "Livre sem volume e sem ranquear: principal com volume da lista");
  assert.ok(!pc.reasons.concat(pa.reasons).some(r => /Risco de canibalização/.test(r)), "par separado pelo verbo não é barrado");
  assert.equal(slugCoreListPicks(atrair, lista).some(p => p.keywordId === "c1"), false, "'captar' não vai para a página de 'atrair'");

  // Sem nenhuma keyword de 'atrair' na lista: 'captar' melhora sozinha; 'atrair' não recebe 'captar'.
  const soCaptar = [own(captar), own(atrair), kw("c1", "como captar clientes", 390), kw("c2", "como captar um cliente", 390)];
  const [sc, sa] = planArticleImprovements({ targets: [captar, atrair], keywords: soCaptar, evidence: noEvidence, editorialPicks: picks, ranking: { "captar-pg": false, "atrair-pg": false } });
  assert.equal(sc.status, "ready", JSON.stringify(sc.reasons));
  assert.notEqual(sa.status, "ready", "a página de 'atrair' não grava 'captar'");
  assert.deepEqual([...sc.addIds].sort(), ["c1", "c2"]);
});

test("SERP separou parte da composição: fica a principal e quem divide páginas com ela em 2+ lentes", async () => {
  const { serpSupportedMembers } = await import("../lib/arquiteto/article-improvement.ts");
  const lens = (pairs: Array<[string, string, string]>) => ({ pairs: pairs.map(([left, right, level]) => ({ left, right, level })) });
  const lenses = { perLens: [
    lens([["p", "melhores", "baixa"], ["p", "tres", "nenhuma"], ["p", "irma", "forte"]]),
    lens([["p", "melhores", "baixa"], ["p", "tres", "nenhuma"], ["p", "irma", "parcial"]]),
    lens([["p", "melhores", "nenhuma"], ["tres", "p", "parcial"], ["p", "irma", "nenhuma"]]),
    lens([["p", "melhores", "forte"], ["p", "tres", "nenhuma"], ["irma", "p", "forte"]]),
  ] };
  assert.deepEqual(serpSupportedMembers(lenses, "p", ["p", "melhores", "tres", "irma"]), ["p", "irma"]);
  assert.equal(serpSupportedMembers({}, "p", ["p"]), null);
});

test("caso real 2026-09-30: a IA escolheu 'um cliente' e 'mais clientes'; a lista completa com 'como captar clientes' (núcleo do slug)", () => {
  const captar = pub("captar-pg", "como captar clientes para clinica de estetica");
  const keywords = [own(captar), kw("c1", "como captar clientes", 390), kw("c2", "como captar um cliente", 390), kw("c3", "como captar mais clientes", 30)];
  const picks: ImprovementEditorialPick[] = [
    { targetId: "captar-pg", keywordId: "c2", role: "secundaria", reason: "variação", rank: 0 },
    { targetId: "captar-pg", keywordId: "c3", role: "secundaria", reason: "variação", rank: 1 },
  ];
  const [p] = planArticleImprovements({ targets: [captar], keywords, evidence: noEvidence, editorialPicks: picks, ranking: { "captar-pg": false } });
  assert.equal(p.status, "ready"); assert.equal(p.evidenceBasis, "editorial_ai");
  assert.deepEqual(p.addIds, ["c2", "c3", "c1"]);
  assert.match(p.reasons.join(" "), /completou a da IA com “como captar clientes”/);
  assert.ok(p.aiReasons?.some(r => r.keywordId === "c1" && /Lista · núcleo do slug/.test(r.reason)));
});

test("busca local de outra cidade não entra (caso real: 'agência de marketing em são paulo' em 'agência de marketing para clínica de estética')", () => {
  const agencia = pub("ag", "agencia de marketing para clinica de estetica");
  assert.match(editorialAiBarrier(agencia, kw("sp", "agência de marketing em são paulo", 390))!, /Busca local/);
  assert.match(editorialAiBarrier(agencia, kw("pm", "agência de marketing perto de mim", 90))!, /Busca local/);
  const agenciaSp = pub("ag-sp", "agencia de marketing em sao paulo para clinicas");
  assert.equal(editorialAiBarrier(agenciaSp, kw("sp", "agência de marketing em são paulo", 390)), null, "a página da própria cidade aceita");
});
