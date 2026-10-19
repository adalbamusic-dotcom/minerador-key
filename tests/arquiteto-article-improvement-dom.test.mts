import assert from "node:assert/strict";
import test from "node:test";
import { comProductShell, montarRadar, React, type RadarDomScreen } from "./radar-dom-harness.mts";
import { ArticleImprovementPanel } from "../modules/arquiteto/article-improvement-panel.tsx";

/*
 * O REFAZEDOR ("Melhorar publicados…") NA TELA (DOM). 2026-10-17 (noite) · SUBSTITUÍDOS o cartão "Próximo passo" e
 * a fileira de botões (dono: "tem 7 botões totalmente inúteis"): abrir LÊ sozinho (a busca nova no Google Ads incluída,
 * grátis); a prévia tem só "Cancelar" e "Confirmar", e o Confirmar faz o passo que falta. O que fica, e estes testes
 * guardam: um aceite só para o lote; a coleta e a gravação autorizadas continuam sozinhas; tempo esgotado não para a
 * coleta; a tabela mostra só o que pode mudar; a troca de marca não restaura nada; a leitura da IA e a origem por
 * linha; "Precisa do Minerador"; a keyword nova com o aceite explícito.
 */

let screen: RadarDomScreen, calls: any[], restored: any, applied: number, closed: number;
const fixture = () => ({ brandId: "brand-a", runId: "run", decisionHash: "a".repeat(64), state: "prepared", acceptedIds: null, leaseUntil: null, costs: { paidQueries: 2, estimatedCostUsd: { min: .004, max: .006 }, missingDetails: [{ keyword: "demanda nova", lens: "mobile-ios", reason: "missing" }] }, keywords: [{ id: "old", keyword: "tema antigo", volumeValidated: false }, { id: "new", keyword: "demanda nova", volume: 50, volumeValidated: true }], proposals: ["a", "b"].map(id => ({ targetId: id, kind: "published", theme: `Publicado ${id}`, currentPrimaryId: "old", principalId: "new", memberIds: ["old", "new"], addIds: ["new"], removeIds: [], transfers: [], angle: `enfoque ${id}`, exclusions: [], reasons: ["Cache completo"], status: "ready" })), notices: [], outcomes: [] });
const semCusto = () => ({ ...fixture(), costs: { paidQueries: 0, estimatedCostUsd: { min: 0, max: 0 }, missingDetails: [] } });
let prepared: () => any = fixture;
const panel = (brandId = "brand-a", extra: Record<string, unknown> = {}) => comProductShell(React.createElement(ArticleImprovementPanel, { brandId, onApplied: () => { applied++; }, onClose: () => { closed++; }, buttonClassName: "button", primaryButtonClassName: "button", ...extra }));
const button = (text: string) => [...screen.container.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === text);
const settle = async (times = 20) => { for (let i = 0; i < times; i += 1) await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); }); };
test.beforeEach(async () => {
  calls = []; restored = null; applied = 0; closed = 0; prepared = fixture; screen = await montarRadar();
  globalThis.fetch = async (_url, options) => {
    if (!options?.method) return new Response(JSON.stringify({ success: true, data: restored }));
    const body = JSON.parse(String(options.body)); calls.push(body);
    const run = body.action === "prepare" ? prepared() : fixture();
    if (body.action === "collect") Object.assign(run, semCusto());
    if (body.action === "apply") {
      const number = calls.filter(c => c.action === "apply").length;
      Object.assign(run, { costs: semCusto().costs, state: number === 1 ? "applying" : "complete", acceptedIds: ["a", "b"], outcomes: [{ targetId: "a", status: "improved", message: "Relido" }, ...(number === 2 ? [{ targetId: "b", status: "failed", message: "Falha por alvo" }] : [])] });
    }
    return new Response(JSON.stringify({ success: true, data: run }));
  };
});
test.afterEach(() => screen.destroy());

test("abrir lê sozinho (com a busca nova); o custo vem antes; UMA confirmação completa o lote; cancelar a coleta fecha sem pagar", async () => {
  await screen.render(panel()); await settle();
  assert.deepEqual(calls.map(c => [c.action, c.discover]), [["prepare", true]]);
  assert.match(screen.text(), /volume 50/);
  assert.match(screen.get("architect-improvement-cost").textContent!, /SERP no DataForSEO: 2 consulta\(s\), até US\$ 0,006/);
  assert.equal(button("Autorizar 2 consulta(s) e coletar a SERP (até US$ 0,006)")?.disabled, false);
  await screen.click(button("Cancelar")!);
  assert.equal(calls.filter(c => c.action === "collect").length, 0, "cancelar não paga");
  assert.equal(closed, 1, "cancelar fecha o refazedor");
  // A prévia de novo: autorizar coleta; depois, o MESMO Confirmar grava o lote (um aceite, a retomada continua sem outro).
  await screen.click(button("Autorizar 2 consulta(s) e coletar a SERP (até US$ 0,006)")!); await settle();
  assert.deepEqual(calls.filter(c => c.action === "collect").map(c => c.authorizedCostUsd), [0.006]);
  await screen.click(button("Confirmar e gravar (2)")!); await settle();
  const applies = calls.filter(c => c.action === "apply"); assert.equal(applies.length, 2); assert.deepEqual(applies[0].targetIds, ["a", "b"]);
  assert.equal("approveNewKeywords" in applies[0], false, "sem keyword nova, o pedido não leva o aceite de incorporar"); assert.equal(applies[1].targetIds, undefined);
  assert.match(screen.text(), /Melhoria gravada/); assert.match(screen.text(), /Falha recuperável/); assert.equal(applied, 1);
});

test("gravar só as prontas sem coletar a SERP continua possível (a caixa dentro da prévia, no lugar do 'Gravar sem validar')", async () => {
  await screen.render(panel()); await settle();
  await screen.click(screen.get("architect-improvement-without-serp"));
  assert.equal(button("Confirmar e gravar (2)")?.disabled, false);
  await screen.click(button("Confirmar e gravar (2)")!); await settle();
  assert.equal(calls.filter(c => c.action === "collect").length, 0);
  assert.deepEqual(calls.filter(c => c.action === "apply")[0].targetIds, ["a", "b"]);
});

test("a gravação já aceita continua sozinha ao abrir (F5), sem outra confirmação e sem nova leitura", async () => {
  restored = { ...fixture(), state: "applying", acceptedIds: ["a", "b"] }; await screen.render(panel()); await settle();
  assert.equal(calls[0].action, "apply"); assert.equal(calls[0].targetIds, undefined);
  assert.equal(calls.some(c => c.action === "prepare"), false);
});

test("a coleta pela metade continua sozinha ao abrir; tempo esgotado numa volta não para (o andamento está no servidor)", async () => {
  restored = { ...fixture(), state: "collecting" };
  let collects = 0;
  globalThis.fetch = async (_url, options) => {
    if (!options?.method) return new Response(JSON.stringify({ success: true, data: restored }));
    const body = JSON.parse(String(options.body)); calls.push(body);
    // 1º passo avança e continua "collecting"; o 2º esgota o tempo (a plataforma responde HTML); o 3º termina.
    if (body.action === "collect" && ++collects === 2) return new Response("<html>timeout</html>", { status: 504 });
    return new Response(JSON.stringify({ success: true, data: { ...fixture(), state: body.action === "collect" && collects >= 3 ? "prepared" : "collecting" } }));
  };
  await screen.render(panel()); await settle(40);
  assert.deepEqual(calls.map(c => c.action), ["collect", "collect", "status", "collect"]); assert.doesNotMatch(screen.text(), /demorou demais/);
});

/*
 * 2026-10-18 · SUBSTITUÍDO "a tabela mostra só o que pode mudar": a tabela é a LEITURA de cada artigo lido (o que tem,
 * o que falta, a proposta) — o dono, no amarelo, viu só "Já feito…" e achou que o refazedor "não fez nada". Só a linha
 * pronta é marcável; a lista solta "sem melhoria possível" continua fora.
 */
test("a tabela é a leitura de cada artigo lido (tem · falta · proposta), só a pronta marcável; sem a lista 'sem melhoria possível'; nada a refazer = sem botão", async () => {
  const base = fixture();
  prepared = () => ({ ...base, proposals: [base.proposals[0], { ...base.proposals[1], status: "adequate", addIds: [], principalId: "old", reasons: ["Já cobre a busca"] }] });
  await screen.render(panel()); await settle();
  assert.equal(screen.container.querySelectorAll("tbody tr").length, 2, "as duas leituras");
  assert.equal(screen.all("architect-improvement-reading").length, 2);
  const caixas = [...screen.container.querySelectorAll<HTMLInputElement>("input[type='checkbox'][aria-label^='Aplicar']")];
  assert.deepEqual(caixas.map(caixa => caixa.disabled), [false, true], "só a pronta é marcável");
  assert.doesNotMatch(screen.text(), /sem melhoria possível/);
  screen.destroy(); screen = await montarRadar(); calls = [];
  prepared = () => ({ ...semCusto(), proposals: [{ ...base.proposals[0], status: "adequate", addIds: [], memberIds: ["old"], principalId: "old" }] });
  await screen.render(panel()); await settle();
  assert.equal(screen.get("architect-improvement-nothing").textContent, "Nada a refazer agora nos artigos lidos.");
  assert.equal(screen.container.querySelectorAll("button").length, 0);
});

test("an old-brand response cannot restore state after switching brand", async () => {
  let deliver: ((value: Response) => void) | undefined;
  globalThis.fetch = async (_url, options) => options?.method ? new Promise<Response>(resolve => { deliver = resolve; }) : new Response(JSON.stringify({ success: true, data: null }));
  await screen.render(panel()); await settle(); await screen.render(panel("brand-b")); await settle();
  await React.act(async () => { deliver!(new Response(JSON.stringify({ success: true, data: fixture() }))); });
  assert.doesNotMatch(screen.text(), /Publicado a/);
});

test("leitura da IA: a linha mostra 'Leitura da IA — confira' com o motivo; a que falta a SERP fica sem marcação", async () => {
  const base = fixture();
  prepared = () => ({ ...base, keywords: [...base.keywords, { id: "lista", keyword: "como atrair clientes", volume: 720, volumeValidated: true }], proposals: [
    { ...base.proposals[0], principalId: "old", memberIds: ["old", "lista"], addIds: ["lista"], evidenceBasis: "editorial_ai", aiReasons: [{ keywordId: "lista", reason: "Quem busca quer o mesmo passo a passo." }] },
    { ...base.proposals[1], status: "insufficient_evidence", needsValidation: true, evidenceBasis: "editorial_ai", aiReasons: [{ keywordId: "new", reason: "Mesmo público da página." }] },
  ] });
  await screen.render(panel()); await settle();
  const leituras = screen.container.querySelectorAll("[data-testid='architect-improvement-ai-reading']");
  assert.equal(leituras.length, 2);
  assert.match(leituras[0].textContent!, /Leitura da IA — confira[\s\S]*como atrair clientes: Quem busca quer o mesmo passo a passo\./);
  const caixas = [...screen.container.querySelectorAll<HTMLInputElement>("input[type='checkbox'][aria-label^='Aplicar']")];
  assert.equal(caixas[0].disabled, false); assert.equal(caixas[1].disabled, true);
  assert.match(screen.text(), /Falta a SERP da principal \(coleta paga, custo antes\)/);
});

test("origem por linha e as recusas da IA recolhidas", async () => {
  const base = fixture();
  prepared = () => ({ ...base, costs: semCusto().costs, keywords: [...base.keywords, { id: "ideia", keyword: "ideia nova", volume: 90, volumeValidated: true, external: true }], proposals: [
    { ...base.proposals[0], evidenceBasis: "serp" },
    { ...base.proposals[1], principalId: "old", memberIds: ["old", "ideia"], addIds: ["ideia"], evidenceBasis: "editorial_and_candidate_serp" },
  ], editorialAi: { status: "answered", askedTargetIds: ["c"], listSize: 3, picks: [], rejected: [{ targetId: "c", keywordId: "k9", keyword: "clinica de estetica facial", theme: "Publicado c", reason: "Não leva o núcleo do assunto do artigo: outro público ou outra necessidade." }], rejectedCount: 1 } });
  await screen.render(panel()); await settle();
  assert.deepEqual([...screen.container.querySelectorAll("[data-testid='architect-improvement-origin']")].map(e => e.textContent), ["Origem: Pares da SERP", "Origem: Busca nova no Google Ads"]);
  const recusas = screen.container.querySelector<HTMLDetailsElement>("[data-testid='architect-improvement-ai-rejected']")!;
  assert.equal(recusas.open, false); assert.match(recusas.textContent!, /Sugestões da IA recusadas pelas regras \(1\)[\s\S]*clinica de estetica facial → Publicado c: Não leva o núcleo/);
});

test("barra de progresso: contador e porcentagem quando o total é conhecido; pulso e tempo decorrido quando não é", async () => {
  const { ImprovementProgress } = await import("../modules/arquiteto/article-improvement-panel.tsx");
  const inicio = 1_000_000;
  await screen.render(React.createElement(ImprovementProgress, { activity: { action: "collect", startedAt: inicio }, now: inicio + 75_000, done: 7, total: 36, unit: "grupos validados" }));
  assert.match(screen.text(), /Coletando a SERP no DataForSEO \(pago, com o seu aceite\)/);
  assert.match(screen.text(), /7 de 36 grupos validados/);
  assert.match(screen.text(), /19%/);
  assert.match(screen.text(), /1 min 15 s/);
  assert.equal(screen.container.querySelector('[role="progressbar"]')!.getAttribute("aria-valuenow"), "19");
  await screen.render(React.createElement(ImprovementProgress, { activity: { action: "prepare", startedAt: inicio }, now: inicio + 12_000, done: null, total: null, unit: "" }));
  assert.match(screen.text(), /Lendo os artigos e buscando o reforço/);
  assert.match(screen.text(), /Em andamento · 12 s/);
  assert.equal(screen.container.querySelector('[role="progressbar"]')!.getAttribute("aria-valuenow"), null);
});

test("linha 'Precisa do Minerador': à vista, não marcável, com o link para as Sugestões do Arquiteto no Minerador (na cor da leitura)", async () => {
  const base = fixture();
  prepared = () => ({ ...base, groupScope: { requested: "azul", filter: "group", groupId: "g-azul" }, keywords: [...base.keywords, { id: "ext", keyword: "ideia nova", volume: 90, volumeValidated: true, external: true, knownInMinerador: { keywordId: "ja-no-minerador" } }],
    proposals: [{ ...base.proposals[0], addIds: ["ext"], memberIds: ["old", "ext"], principalId: "old", status: "insufficient_evidence", needsMinerador: { newKeywordIds: ["ext"], measureKeywordIds: [], logicKeywordIds: [] }, reasons: ["Precisa do Minerador."] }] });
  await screen.render(panel("brand-a", { brandRef: "adalbapro--brand-a", activeGroup: { requested: "azul", label: "Azul" } })); await settle();
  assert.deepEqual(calls.map(c => [c.action, c.group]), [["prepare", "azul"]], "a leitura recorta a cor da etiqueta");
  assert.match(screen.text(), /1 linha\(s\) precisa do minerador: dependem de keyword que JÁ existe no Minerador/);
  assert.match(screen.container.querySelector("[data-testid='architect-improvement-row-needs-minerador']")!.textContent ?? "", /Precisa do Minerador · Sugestões do Arquiteto/);
  assert.equal(screen.container.querySelector<HTMLAnchorElement>("[data-testid='architect-improvement-open-suggestions']")!.getAttribute("href"), "/adalbapro--brand-a/minerador?arquiteto=sugestoes&cor=azul");
  assert.equal(screen.container.querySelector<HTMLInputElement>("input[aria-label='Aplicar melhoria em Publicado a']")!.disabled, true);
});

test("keyword nova: a prévia lista por artigo (volume e fonte); o Confirmar diz quantas e o pedido leva approveNewKeywords", async () => {
  const base = fixture();
  prepared = () => ({ ...semCusto(), keywords: [...base.keywords, { id: "ideia", keyword: "preço internet residencial", volume: 170, volumeValidated: true, external: true }],
    proposals: [{ ...base.proposals[0], theme: "Internet residencial barata", principalId: "new", memberIds: ["new", "ideia"], addIds: ["ideia"], evidenceBasis: "copy_line" }, base.proposals[1]] });
  await screen.render(panel()); await settle();
  assert.match(screen.text(), /Entram: preço internet residencial · volume 170 · nova/);
  const caixa = screen.get("architect-improvement-new-keywords");
  assert.match(caixa.textContent ?? "", /1 keyword\(s\) NOVA\(S\) na marca\. Ao confirmar, as keywords NOVAS desta prévia/);
  assert.match(caixa.textContent ?? "", /“Internet residencial barata”: “preço internet residencial” \(170\/mês, busca nova no Google Ads\)\./);
  await screen.click(button("Confirmar e gravar (com 1 keyword(s) nova(s))")!); await settle();
  const applies = calls.filter(c => c.action === "apply");
  assert.equal(applies[0].approveNewKeywords, true);
  assert.deepEqual(applies[0].targetIds, ["a", "b"]);
  assert.equal("approveNewKeywords" in applies[1], false, "a retomada continua o lote aceito, sem novo aceite");
});

/*
 * 2026-10-18 · O ASSUNTO PELA PRINCIPAL NO "MELHORAR PUBLICADOS…" (SDD `sdd-assunto-pela-principal-e-volume-2026-10-18.md`
 * §14, DOM pelos botões): a prévia de cada página diz "a página passa a ser o Assunto" e a troca da principal pelo volume
 * 0 (com o porquê); o Confirmar de sempre manda as linhas marcadas. Nenhum botão novo.
 */
test("Assunto pela principal: a prévia mostra 'página → Assunto' e a principal nova com volume (volume 0); o Confirmar de sempre grava", async () => {
  const base = fixture();
  prepared = () => ({ ...semCusto(), keywords: [{ id: "pagina", keyword: "como atrair pacientes para clínica de estética", volumeValidated: false }, { id: "nova", keyword: "como atrair pacientes", volume: 720, volumeValidated: true }],
    proposals: [{ ...base.proposals[0], theme: "como atrair pacientes para clínica de estética", currentPrimaryId: "pagina", principalId: "nova", memberIds: ["nova"], addIds: ["nova"], removeIds: ["pagina"], subjectKeywordId: "pagina", evidenceBasis: "copy_line",
      reasons: ["Assunto pela principal (SDD 2026-10-18): “como atrair pacientes para clínica de estética” tem volume 0; “como atrair pacientes” (720) assume como principal — leva o núcleo do slug (atrair + paciente) e cabe no Assunto (público, restrição, localidade e intenção). “como atrair pacientes para clínica de estética” continua no artigo como o Assunto (a página). Título, slug e canonical não mudam. Proposta: decisão sua na prévia.", "A keyword da página publicada passa a ser o Assunto do artigo (sai das secundárias e continua no artigo como o Assunto); URL, slug e canonical não mudam (SDD 2026-10-18)."] }, base.proposals[1]] });
  await screen.render(panel()); await settle();
  assert.match(screen.text(), /A keyword da página publicada passa a ser o Assunto do artigo/);
  assert.match(screen.text(), /“como atrair pacientes” \(720\) assume como principal/);
  await screen.click(button("Confirmar e gravar (2)")!); await settle();
  assert.deepEqual(calls.filter(c => c.action === "apply")[0].targetIds, ["a", "b"], "o Confirmar de sempre");
});

/*
 * 2026-10-19 · CASO REAL DO VERDE: a coleta autorizada parou com um 409 (REWORK_SAME_REFUSAL) e a tela ficou muda —
 * o erro não era mostrado no painel, a prévia fechava com a execução em "collecting" e o botão sumia. Agora o erro
 * aparece no painel e no sino dizendo o que foi pago e o que parou, e o MESMO Confirmar continua a coleta autorizada.
 */
test("coleta que para no meio (409): o erro aparece no painel e no sino com o pago e o que parou; o Confirmar 'Continuar a coleta autorizada' não some", async () => {
  const avisos: Array<[string, string]> = [];
  let collects = 0;
  globalThis.fetch = async (_url, options) => {
    if (!options?.method) return new Response(JSON.stringify({ success: true, data: null }));
    const body = JSON.parse(String(options.body)); calls.push(body);
    if (body.action === "prepare") return new Response(JSON.stringify({ success: true, data: { ...fixture(), costs: { paidQueries: 84, estimatedCostUsd: { min: .2, max: .294 }, missingDetails: [] } } }));
    if (body.action === "collect" && ++collects === 1) return new Response(JSON.stringify({ success: true, data: { ...fixture(), state: "collecting", costs: { paidQueries: 84, estimatedCostUsd: { min: .2, max: .294 }, missingDetails: [] }, collect: { doneGroupIds: ["g1", "g2", "g3"], remaining: 72, reservedRemaining: .252, phase: "collect", totalGroups: 33 } } }));
    if (body.action === "collect" && collects === 2) return new Response(JSON.stringify({ success: false, error: "REWORK_SAME_REFUSAL: A mesma recusa aconteceu em 18/10 às 22:34.", code: "CONFLICT" }), { status: 409 });
    return new Response(JSON.stringify({ success: true, data: { ...fixture(), ...semCusto() } }));
  };
  await screen.render(panel("brand-a", { onNotify: (tone: string, message: string) => avisos.push([tone, message]) })); await settle();
  await screen.click(button("Autorizar 84 consulta(s) e coletar a SERP (até US$ 0,294)")!); await settle();
  const erro = screen.get("architect-improvement-error").textContent!;
  assert.match(erro, /A coleta parou: 12 de 84 consulta\(s\) autorizada\(s\) foram pagas \(3 de 33 grupos\)/);
  assert.ok(avisos.some(([tone, message]) => tone === "error" && /A coleta parou: 12 de 84/.test(message)), "o mesmo aviso vai para o sino");
  const continuar = button("Continuar a coleta autorizada");
  assert.ok(continuar && !continuar.disabled, "o Confirmar de sempre continua a coleta");
  await screen.click(continuar!); await settle();
  assert.equal(calls.filter(c => c.action === "collect").length, 3, "continuar chama a mesma coleta autorizada");
});
