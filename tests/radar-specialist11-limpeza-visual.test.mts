import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  radarSpecialistPriorityLabel,
  radarSpecialistReviewCard,
  type RadarFrozenSpecialistRequirement,
} from "../lib/radar/specialist-lifecycle.ts";
import type { RadarR6ExpertTopicContext } from "../lib/radar/r6-sequential.ts";
import { montarRadar, comProductShell, React } from "./radar-dom-harness.mts";

/* ============================== o cenário =============================== */

const brandId = "30000000-0000-4000-8000-0000000000c1";
const expertId = "30000000-0000-4000-8000-0000000000c2";
const articleId = "article-specialist-11";
const articleDnaVersionId = "article-dna-v9";

/**
 * O REQUISITO REAL DO BANCO, verbatim.
 *
 * `bundle:2be6e384` congelou a `specificQuestion` com a contagem de mercado na
 * frente. É exatamente esse texto que este gate manda tirar da visão
 * operacional — e é com ele que o recorte tem de ser provado, não com um
 * exemplo inventado que já viesse limpo.
 */
const requisitoReal: RadarFrozenSpecialistRequirement = {
  requirementId: "specialist:4a13e0cb",
  claimId: "claim:o-que-causa-acne",
  kind: "RESOLVE_FACTUAL_UNCERTAINTY",
  priority: "MEDIUM",
  specificQuestion: '3 de 10 concorrentes tratam de "O que causa acne", encontrados por 4 consultas. Não encontramos fonte adequada que sustente esta afirmação sobre "O que causa acne". O que pode ser afirmado com segurança neste ponto, e o que precisa ser qualificado ou omitido?',
};

const contexto = {
  articleId,
  brandId,
  articleDnaVersionId,
  articleDnaContentHash: "hash-specialist-11",
  articleDna: { principal: "acne", intent: "informacional", silo: "Pele", audience: "paciente", problem: "acne", desiredResult: "entender", requiredTopics: ["causas"], knownQuestions: [] },
  keywordDnas: [{ keywordId: "keyword-acne", keywordDnaVersionId: "keyword-dna-v1", keyword: "acne", role: "principal" }],
  siloDna: null,
  serpNeeds: ["Explicar as causas reais da acne", "Separar causa de fator agravante"],
  openGaps: ["competitor:9f2a11 não separa causa de fator", "Nenhuma página cita fonte primária"],
  conflicts: [],
  knownQuestions: [],
  approvedReferences: [{ position: 1, title: "Referência", url: "https://example.com/a", role: "primary" }],
  serpSnapshotId: "snapshot-11",
  serpSnapshotVersion: 1,
  serpReviewed: true,
  analysisVersionId: "analysis-11",
  amazonCriteria: [],
  amazonEvidence: [],
  amazonState: "AMAZON_NOT_APPLICABLE",
  existingContent: "Nenhum material existente do especialista associado.",
  existingContentItems: [],
  provenance: [{ sourceType: "ArticleDNA", label: "ArticleDNA v9", referenceId: articleDnaVersionId, url: null }],
} satisfies RadarR6ExpertTopicContext;

/* ================= §2 · o recorte do card, no domínio ================= */

test("SPECIALIST_1.1 · a contagem de mercado sai do card e a pergunta vira a pergunta", () => {
  const card = radarSpecialistReviewCard(requisitoReal);

  assert.equal(card.question, "O que pode ser afirmado com segurança neste ponto, e o que precisa ser qualificado ou omitido?");
  assert.doesNotMatch(card.question, /3 de 10 concorrentes|4 consultas/);
  assert.equal(card.reason, 'Não encontramos fonte adequada que sustente esta afirmação sobre "O que causa acne".');
  assert.doesNotMatch(card.reason, /concorrentes|consultas/, "o motivo também não repete a estatística");
  assert.match(card.expectation, /afirmado com segurança/);

  /* DATA_DELETED = NO: o congelado sai inteiro por `fullQuestion`. */
  assert.equal(card.fullQuestion, requisitoReal.specificQuestion.replace(/\s+/g, " ").trim());
  assert.equal(card.trimmed, true);
});

test("SPECIALIST_1.1 · sem pergunta interrogativa, o texto inteiro é preservado no card", () => {
  const semPergunta = { ...requisitoReal, specificQuestion: "Descreva o que a prática mostra sobre este ponto." };
  const card = radarSpecialistReviewCard(semPergunta);

  /* Recortar às cegas um texto fora do formato esconderia o que foi pedido. */
  assert.equal(card.question, "Descreva o que a prática mostra sobre este ponto.");
  assert.equal(card.trimmed, false);
});

test("SPECIALIST_1.1 · o motivo congelado tem precedência sobre o preâmbulo", () => {
  const comMotivo = { ...requisitoReal, whyReviewIsNeeded: "O mercado afirma uma coisa e a evidência diz outra." };
  assert.equal(radarSpecialistReviewCard(comMotivo).reason, "O mercado afirma uma coisa e a evidência diz outra.");
});

test("SPECIALIST_1.1 · o motivo cabe em duas linhas e o resto continua na proveniência", () => {
  const longo = { ...requisitoReal, whyReviewIsNeeded: "x".repeat(400) };
  const card = radarSpecialistReviewCard(longo);

  assert.ok(card.reason.length <= 180, `motivo com ${card.reason.length} caracteres`);
  assert.ok(card.reason.endsWith("…"), "o corte é visível");
  assert.equal(card.trimmed, true);
});

test("SPECIALIST_1.1 · a expectativa vem do tipo do ponto, sem nicho hardcodado", () => {
  assert.match(radarSpecialistReviewCard({ ...requisitoReal, kind: "RESOLVE_CONFLICT" }).expectation, /desacordo entre o que o mercado afirma/);
  assert.match(radarSpecialistReviewCard({ ...requisitoReal, kind: "VERIFY_AND_ADD_EXPERIENCE" }).expectation, /nuance, exceção/);
  assert.equal(radarSpecialistReviewCard({ ...requisitoReal, kind: "TIPO_NOVO" }).expectation, "Julgamento profissional sobre esta afirmação.");
});

test("SPECIALIST_1.1 · nenhuma regra do recorte conhece dermatologia", async () => {
  const dominio = await readFile(new URL("../lib/radar/specialist-lifecycle.ts", import.meta.url), "utf8");
  const semComentarios = dominio.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(semComentarios, /acne|pele|dermatolog|sebo/i, "o recorte é genérico de mercado");
});

test("SPECIALIST_1.1 · a prioridade é curta porque divide a linha com o estado", () => {
  assert.equal(radarSpecialistPriorityLabel("HIGH"), "ALTA");
  assert.equal(radarSpecialistPriorityLabel("MEDIUM"), "MÉDIA");
  assert.equal(radarSpecialistPriorityLabel("LOW"), "BAIXA");
  assert.equal(radarSpecialistPriorityLabel("DESCONHECIDA"), "DESCONHECIDA");
});

/* ==================== o DOM: o que está VISÍVEL ====================== */

type RespostaFalsa = { experts?: unknown[]; bindings?: unknown[]; briefs?: unknown[]; contributions?: unknown[] };

function servidorFalso(dados: RespostaFalsa) {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => ({
    ok: true,
    json: async () => ({ experts: dados.experts || [], bindings: dados.bindings || [], briefs: dados.briefs || [], contributions: dados.contributions || [] }),
  })) as unknown as typeof globalThis.fetch;
  return { restaurar: () => { globalThis.fetch = original; } };
}

const expertAtivo = { id: expertId, brandId, displayName: "Dra. X", specialty: "Dermatologia", status: "active", createdAt: "2026-01-01T00:00:00Z" };

async function montarPainel(dados: RespostaFalsa, requirements: RadarFrozenSpecialistRequirement[]) {
  const servidor = servidorFalso(dados);
  const tela = await montarRadar();
  const { RadarExpertBriefPanel } = await import("../modules/radar/radar-expert-brief-panel.tsx");
  await tela.render(comProductShell(React.createElement(RadarExpertBriefPanel, {
    brandId, articleId, articleDnaVersionId,
    articleTitle: "O que causa acne",
    articleVersion: "v9",
    articleRole: "pilar",
    context: contexto,
    requirements,
    onExpertEvidenceChange: () => {},
  })));
  return { tela, servidor };
}

/**
 * O TEXTO QUE UMA PESSOA REALMENTE LÊ AO ABRIR A TELA.
 *
 * `textContent` inclui o conteúdo de um `<details>` fechado — o nó existe no
 * DOM, só não é pintado. Medir o texto cru faria "escondido atrás de um
 * disclosure" e "aberto na cara" darem o mesmo resultado, que é exatamente a
 * diferença que este gate inteiro trata. Por isso o conteúdo de cada `details`
 * sem `open` é descontado.
 */
function textoVisivel(raiz: HTMLElement): string {
  const copia = raiz.cloneNode(true) as HTMLElement;
  for (const detalhe of [...copia.querySelectorAll("details")]) {
    if (!detalhe.hasAttribute("open")) {
      const resumo = detalhe.querySelector("summary");
      detalhe.textContent = resumo?.textContent || "";
    }
  }
  return copia.textContent || "";
}

test("SPECIALIST_1.1 · necessidades, lacunas e ids de concorrente saem da visão principal", async () => {
  const { tela, servidor } = await montarPainel({ experts: [expertAtivo] }, [requisitoReal]);
  try {
    const visivel = textoVisivel(tela.container);

    assert.ok(!visivel.includes("NECESSIDADES DO RADAR"), "RADAR_NEEDS_VISIBLE_DEFAULT = NO");
    assert.ok(!visivel.includes("LACUNAS OBSERVADAS"), "OBSERVED_GAPS_VISIBLE_DEFAULT = NO");
    assert.ok(!visivel.includes("competitor:"), "COMPETITOR_IDS_VISIBLE_DEFAULT = NO");
    assert.ok(!visivel.includes("Explicar as causas reais da acne"), "o dump de necessidades não aparece");
    assert.ok(!visivel.includes(articleDnaVersionId), "TECHNICAL_DIAGNOSTICS_VISIBLE_DEFAULT = NO");
    assert.ok(!visivel.includes(brandId), "hashes e ids internos ficam no disclosure");

    /* DATA_DELETED = NO — tudo continua no DOM, dentro do disclosure fechado. */
    const proveniencia = tela.get("radar-specialist-provenance");
    assert.equal(proveniencia.tagName, "DETAILS");
    assert.equal(proveniencia.hasAttribute("open"), false, "TECHNICAL_PROVENANCE_COLLAPSED = YES");
    const guardado = proveniencia.textContent || "";
    for (const dado of ["NECESSIDADES DO RADAR", "LACUNAS OBSERVADAS", "competitor:9f2a11", "Explicar as causas reais da acne", brandId, articleDnaVersionId]) {
      assert.ok(guardado.includes(dado), `a proveniência preserva: ${dado}`);
    }
  } finally {
    tela.destroy();
    servidor.restaurar();
  }
});

test("SPECIALIST_1.1 · um único disclosure de proveniência no nível da área", async () => {
  const { tela, servidor } = await montarPainel({ experts: [expertAtivo] }, [requisitoReal]);
  try {
    /*
     * DOIS DISCLOSURES, E CADA UM COM UM PAPEL — nunca uma fileira deles.
     *
     * "Proveniência" guarda o diagnóstico interno; "Ferramentas avançadas"
     * guarda o fluxo manual antigo, que o SPECIALIST_2.1.1 tirou da visão
     * normal sem apagar. Qualquer terceiro seria o muro de texto de volta.
     */
    const fechados = [...tela.container.querySelectorAll("details")].filter(item => !item.hasAttribute("open"));
    assert.deepEqual(fechados.map(item => item.getAttribute("data-testid")).sort(), ["radar-specialist-advanced", "radar-specialist-provenance"]);
  } finally {
    tela.destroy();
    servidor.restaurar();
  }
});

test("SPECIALIST_1.1 · o card do ponto mostra pergunta, motivo e o que se espera — e nada do diagnóstico", async () => {
  const { tela, servidor } = await montarPainel({ experts: [expertAtivo] }, [requisitoReal]);
  try {
    const card = tela.get("radar-specialist-review-point");
    const visivel = textoVisivel(card);

    assert.ok(visivel.includes("MÉDIA · Ponto preparado"), `prioridade e estado numa linha: ${visivel}`);

    /*
     * O snapshot estreito não tem assunto, então o TÍTULO é a pergunta — e o
     * bloco "Pergunta" some, em vez de repetir o título duas linhas abaixo.
     */
    assert.ok(visivel.includes("O que pode ser afirmado com segurança neste ponto, e o que precisa ser qualificado ou omitido?"));
    assert.equal(tela.query("radar-specialist-point-question"), null, "sem repetição do título");
    assert.equal((visivel.match(/O que pode ser afirmado com segurança neste ponto/g) || []).length, 1);
    assert.equal(tela.get("radar-specialist-point-reason").textContent, 'Não encontramos fonte adequada que sustente esta afirmação sobre "O que causa acne".');
    assert.ok(visivel.includes("O que esperamos"));
    assert.ok(visivel.includes("Criar consulta"));

    /* REVIEW_CARD_COMPACT: a contagem de concorrentes não está no card. */
    assert.ok(!visivel.includes("3 de 10 concorrentes"), "a repetição de mercado saiu do card");
    assert.ok(!visivel.includes("4 consultas"));
    assert.ok(!visivel.includes(requisitoReal.requirementId), "o id interno não aparece no card");
  } finally {
    tela.destroy();
    servidor.restaurar();
  }
});

test("SPECIALIST_1.1 · com assunto congelado, título e pergunta são coisas diferentes", async () => {
  const comAssunto = { ...requisitoReal, topic: "Excesso de sebo como causa de acne", whyReviewIsNeeded: "O mercado afirma uma coisa e a evidência diz outra." };
  const { tela, servidor } = await montarPainel({ experts: [expertAtivo] }, [comAssunto]);
  try {
    const visivel = textoVisivel(tela.get("radar-specialist-review-point"));
    assert.ok(visivel.includes("Excesso de sebo como causa de acne"), `o assunto vira o título: ${visivel}`);
    assert.equal(tela.get("radar-specialist-point-question").textContent, "O que pode ser afirmado com segurança neste ponto, e o que precisa ser qualificado ou omitido?");
    assert.equal(tela.get("radar-specialist-point-reason").textContent, "O mercado afirma uma coisa e a evidência diz outra.");
    assert.ok(!visivel.includes("3 de 10 concorrentes"));
  } finally {
    tela.destroy();
    servidor.restaurar();
  }
});

test("SPECIALIST_1.1 · o cabeçalho é um resumo operacional, sem cards conceituais", async () => {
  const { tela, servidor } = await montarPainel({ experts: [expertAtivo] }, [requisitoReal]);
  try {
    const cabecalho = tela.get("radar-specialist-header");
    const visivel = textoVisivel(cabecalho);

    assert.ok(visivel.includes("1 ponto(s) preparado(s) · 0 enviado(s) · 0 resposta(s) · 0 aceita(s)"), `resumo: ${visivel}`);
    assert.ok(visivel.includes("Nenhum especialista selecionado."), `estado: ${visivel}`);

    /* SPECIALIST_HEADER_COMPACT: o que era explicação conceitual saiu. */
    assert.ok(!visivel.includes("Pedido ≠ evidência"));
    assert.ok(!visivel.includes("ArticleDNA"));
    assert.ok(!visivel.includes("cópia de trabalho"));
  } finally {
    tela.destroy();
    servidor.restaurar();
  }
});

test("SPECIALIST_1.1 · a contagem não aparece duas vezes na tela", async () => {
  const enviada = {
    id: "brief-enviada", brandId, expertId, articleId, articleDnaVersionId,
    title: "Pauta enviada", radarContext: { specialistRequirement: { requirementId: requisitoReal.requirementId } },
    questions: [], status: "awaiting_expert", createdAt: "2026-09-13T09:00:00Z", updatedAt: "2026-09-13T09:00:00Z",
    sentAt: "2026-09-13T09:10:00Z", completedAt: null,
  };

  const { tela, servidor } = await montarPainel({ experts: [expertAtivo], briefs: [enviada] }, [requisitoReal]);
  try {
    const visivel = textoVisivel(tela.container);

    /* DUPLICATE_SUMMARY_CARDS_REMOVED: um lugar só diz quantos foram enviados. */
    assert.equal((visivel.match(/enviado\(s\)/g) || []).length, 1, `"enviado(s)" aparece uma vez: ${visivel}`);
    assert.ok(!visivel.includes("Pedidos enviados"), "o card técnico duplicado não existe mais");
    assert.ok(!visivel.includes("Evidências revisadas"));
  } finally {
    tela.destroy();
    servidor.restaurar();
  }
});

test("SPECIALIST_1.1 · os estados vazios são curtos", async () => {
  const { tela, servidor } = await montarPainel({}, []);
  try {
    const visivel = textoVisivel(tela.container);

    assert.ok(visivel.includes("Nenhuma consulta criada ainda."));
    assert.ok(visivel.includes("Nenhuma resposta recebida."));
    assert.ok(visivel.includes("A revisão começa quando uma contribuição é recebida."));

    /* A frase longa de antes não sobreviveu em lugar nenhum. */
    assert.ok(!visivel.includes("Nenhuma entidade é criada silenciosamente pelo Radar."));
  } finally {
    tela.destroy();
    servidor.restaurar();
  }
});

/* ================ §1 a §4 · a duplicação visual acabou ================ */

test("SPECIALIST_1.1.1 · a aba Especialista não renderiza o bloco duplicado", async () => {
  const workbench = await readFile(new URL("../modules/radar/radar-r3-workbench.tsx", import.meta.url), "utf8");
  const semComentarios = workbench.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

  /* DUPLICATE_REVIEW_BLOCK_REMOVED: nem o componente, nem o título, nem o testid. */
  assert.ok(!semComentarios.includes("RadarSpecialistBriefList"), "o bloco não é mais montado");
  assert.ok(!semComentarios.includes("Revisão necessária"));
  assert.ok(!semComentarios.includes('data-testid="radar-specialist-brief-panel"'));

  /* REVIEW_POINTS_IS_SINGLE_VISUAL_AUTHORITY: sobra o painel canônico. */
  const area = semComentarios.slice(semComentarios.indexOf('expandedArea === "especialista"'));
  assert.match(area.slice(0, 600), /<RadarR3SpecialistPanel/);

  /* TECHNICAL_DATA_DELETED = NO — o componente e a projeção continuam existindo. */
  const blueprint = await readFile(new URL("../modules/radar/radar-r3-blueprint.tsx", import.meta.url), "utf8");
  assert.match(blueprint, /export function RadarSpecialistBriefList/);
  const dominio = await readFile(new URL("../lib/radar/editorial-blueprint.ts", import.meta.url), "utf8");
  assert.match(dominio, /specialistBriefs/);
});

test("SPECIALIST_1.1.1 · o que o bloco removido dizia continua no card, em forma curta", async () => {
  /* O mapa é o MESMO que monta a pauta enviada: uma tabela, não duas. */
  const card = radarSpecialistReviewCard(requisitoReal);
  assert.deepEqual(card.contributions, ["Validar", "Corrigir"]);
  assert.deepEqual(radarSpecialistReviewCard({ ...requisitoReal, kind: "VERIFY_AND_ADD_EXPERIENCE" }).contributions, ["Validar", "Acrescentar experiência prática", "Indicar ressalva"]);
  assert.deepEqual(radarSpecialistReviewCard({ ...requisitoReal, kind: "TIPO_NOVO" }).contributions, []);

  const { tela, servidor } = await montarPainel({ experts: [expertAtivo] }, [requisitoReal]);
  try {
    assert.equal(tela.get("radar-specialist-point-contributions").textContent, "Validar · Corrigir");
  } finally {
    tela.destroy();
    servidor.restaurar();
  }
});

test("SPECIALIST_1.1.1 · o estado do convite vive no ponto e não numa barra própria", async () => {
  const { tela, servidor } = await montarPainel({ experts: [expertAtivo] }, [requisitoReal]);
  try {
    /* SEPARATE_SELECT_EXPERT_BANNER_REMOVED */
    assert.equal(tela.query("radar-specialist-empty-experts"), null);

    /*
     * O SPECIALIST_2.1 removeu a última exigência de cadastro: o botão nasce
     * habilitado, e o estado do convite aparece dentro do próprio ponto.
     */
    const acao = tela.get("radar-specialist-next-action") as HTMLButtonElement;
    assert.equal(acao.textContent, "Criar consulta");
    assert.equal(acao.disabled, false);
    assert.equal(tela.query("radar-specialist-needs-expert"), null, "não há mais nada a cadastrar antes");
    assert.ok(tela.get("radar-specialist-review-point").contains(acao), "a ação vive DENTRO do ponto — SPECIALIST_3 · §1");

    /* E o cabeçalho compacto continua dizendo o estado, sem ocupar uma linha extra. */
    assert.ok((tela.get("radar-specialist-state-line").textContent || "").includes("Nenhum especialista selecionado."));
  } finally {
    tela.destroy();
    servidor.restaurar();
  }
});

test("SPECIALIST_1.1.1 · sem nenhum participante na marca, criar consulta continua possível", async () => {
  const { tela, servidor } = await montarPainel({}, [requisitoReal]);
  try {
    assert.equal((tela.get("radar-specialist-next-action") as HTMLButtonElement).disabled, false);
    assert.equal(tela.query("radar-specialist-empty-experts"), null);
    assert.equal(tela.query("radar-specialist-needs-expert"), null);
  } finally {
    tela.destroy();
    servidor.restaurar();
  }
});

test("SPECIALIST_1.1.1 · nada entre o cabeçalho e as colunas repete o ponto de revisão", async () => {
  const { tela, servidor } = await montarPainel({ experts: [expertAtivo] }, [requisitoReal]);
  try {
    const grade = tela.get("radar-specialist-operational-grid");
    const cabecalho = tela.get("radar-specialist-header");

    /* Os irmãos entre o cabeçalho e a grade, na raiz da área. */
    const filhos = [...(tela.container.firstElementChild?.children || [])];
    const entre = filhos.slice(filhos.indexOf(cabecalho) + 1, filhos.indexOf(grade));
    const texto = entre.map(item => textoVisivel(item as HTMLElement)).join(" ");

    assert.ok(!texto.includes("O que pode ser afirmado com segurança"), `nada duplica o ponto: ${texto}`);
    assert.ok(!texto.includes("Por que revisar"));
    assert.ok(!texto.includes("O artigo precisa esclarecer"));

    /* E o ponto aparece uma vez só na tela inteira. */
    const visivel = textoVisivel(tela.container);
    assert.equal((visivel.match(/Por que revisar/g) || []).length, 1);
  } finally {
    tela.destroy();
    servidor.restaurar();
  }
});

/* =============== a segunda dashboard, no painel da área =============== */

test("SPECIALIST_1.1 · a área não repete uma dashboard técnica abaixo do painel", async () => {
  const area = await readFile(new URL("../modules/radar/radar-r3-specialist-panel.tsx", import.meta.url), "utf8");
  const semComentarios = area.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  for (const bloco of ["Pedidos enviados", "Contribuições recebidas", "Evidências revisadas", "TelegramExpertBinding", "A vinculação futura preserva", "aguardando fundação remota", "Fixture local disponível apenas em modo de teste"]) {
    assert.ok(!semComentarios.includes(bloco), `saiu da área: ${bloco}`);
  }

  /* FLOW_CHANGED = NO — a fila local de pautas e a fixture continuam lá. */
  assert.match(semComentarios, /RadarExpertBriefPanel/);
  assert.match(semComentarios, /Fila local de revisão de pautas/);
  assert.match(semComentarios, /showLocalFixture \? <details/);
});

test("SPECIALIST_1.1 · o fluxo não mudou: criar, aprovar e enviar continuam no painel", async () => {
  const painel = await readFile(new URL("../modules/radar/radar-expert-brief-panel.tsx", import.meta.url), "utf8");
  /*
   * OS RÓTULOS DAS AÇÕES MUDARAM DE CASA no SPECIALIST_3.
   *
   * A próxima ação de um ponto é decidida no domínio (`specialist-flow.ts`),
   * e é de lá que vem o texto do botão. Auditar só o painel passaria a medir
   * onde a string mora, não se a ação existe.
   */
  const fluxo = await readFile(new URL("../lib/radar/specialist-flow.ts", import.meta.url), "utf8");
  const superficie = painel + fluxo;

  /* Os rótulos mudaram no SPECIALIST_3; o que continua protegido é a AÇÃO existir. */
  for (const acao of ["Criar consulta", "Salvar pauta", "Aprovar pauta para envio", "Enviar pedido ao especialista", "Aceitar como evidência", "Rejeitar"]) {
    assert.ok(superficie.includes(acao), `a ação continua existindo: ${acao}`);
  }
  assert.match(painel, /remote_readback_confirmed/);

  /*
   * A PERGUNTA QUE VAI AO ESPECIALISTA É A CONGELADA, NUNCA O RECORTE DO CARD.
   *
   * O recorte existe para a tela caber; a pauta persistida usa
   * `specificQuestion` inteira, montada no servidor a partir do requisito que o
   * cliente enviou. Se o cliente montasse a pergunta, o recorte visual poderia
   * vazar para o que o profissional lê.
   */
  const rota = await readFile(new URL("../app/api/editorial/expert-consultations/route.ts", import.meta.url), "utf8");
  assert.match(rota, /radarSpecialistDraftFromRequirement\(/);
  assert.match(rota, /questions: projetada\.questions/);
  assert.doesNotMatch(painel, /radarSpecialistReviewCard\([^)]*\)\.question[\s\S]{0,200}body: JSON\.stringify/);
});
