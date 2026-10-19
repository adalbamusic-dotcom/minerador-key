import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  RADAR_ARTICLE_BLUEPRINT_RULES_VERSION,
  RadarArticleBlueprintAiSchema,
  buildRadarArticleBlueprintBrief,
  radarArticleBlueprintColumns,
  radarArticleBlueprintPendingNotes,
  radarArticleBlueprintPrompt,
  radarSanitizeArticleBlueprint,
  type RadarArticleBlueprintPayload,
} from "../lib/radar/article-blueprint.ts";
import {
  RADAR_COMPETITIVE_READING_LIMITS,
  buildRadarCompetitiveReading,
  radarCompetitiveReadingOf,
  radarCompetitiveReferenceLine,
  radarCompetitiveRelevanceReasons,
  radarCompetitiveSampleLine,
} from "../lib/radar/competitive-reading.ts";
import {
  radarClosingCalls,
  radarClosingDiagnosisVerifies,
  radarClosingEaseNamesDoer,
  radarClosingIssues,
  radarDiagnosisOfferOf,
} from "../lib/radar/brand-edge.ts";
import {
  BRAND_DIAGNOSIS_OFFER_DEFAULT,
  BRAND_DIAGNOSIS_OFFER_HEADING,
  BRAND_DIAGNOSIS_OFFER_PROPOSAL,
  brandDiagnosisOfferInMarkdown,
  brandDiagnosisOfferOf,
} from "../lib/marca/brand-diagnosis-offer.ts";
import {
  RADAR_CLOSING_RULES_VERSION,
  RADAR_HUMAN_VOICE_RESERVATION_RULE,
  radarHumanVoicePromptBlock,
  radarHumanVoiceWritingRule,
} from "../lib/radar/human-voice-guideline.ts";
import { RADAR_WRITING_EXPORT_COLUMNS, buildRadarWritingExportArticle, radarWritingProjections } from "../lib/radar/portable-writing-export.ts";
import type { RadarBrandVoice } from "../lib/radar/brand-voice.ts";
import { ARTIGO, entradaGoogle } from "./radar-portable-writing-fixtures.mts";
import { respostaDaPlanta } from "./radar-piloto-planta-fixtures-2026-10-09.mts";
import {
  PRINCIPAL_DO_CASO,
  PRINCIPAL_NATURAL_DO_CASO,
  PUBLICACAO_DO_CASO_REAL,
  SILO_DO_CASO_REAL,
  contextoDoCasoReal,
  entradaDoCasoRealComSerp,
  leituraDoCasoReal,
  plantaDoCasoReal,
} from "./fixtures/silo-interligado-caso-real-2026-10-14.mts";

/*
 * ===== 2026-10-14b · F3 · ANÁLISE COMPETITIVA, DIFERENCIAL DA MARCA E FECHAMENTO =====
 *
 * SDD `docs/compartilhado/sdd-silo-interligado-seo-semantico-2026-10-14.md` §8, §9 e
 * §13 (itens 3 e 9; D7, D8, D11, D12 e D13, decididas pelo dono em 2026-10-14:
 * "sim, pode sim, e do MCP também é uma boa ideia, pode implementar").
 *
 * Provas, sobre o caso real do Suporte "captação de pacientes dentista" (fixture
 * `tests/fixtures/silo-interligado-caso-real-2026-10-14.mts`, SERP reduzida, sem
 * dado pessoal) e sobre a bancada do export:
 *   - a leitura pura (sem IA, sem SERP nova): a amostra relevante (psitto, zenklub
 *     e amplimed fora do leitor; prospectaodonto fora da curva — marcados, não
 *     escondidos), a faixa de referência, a base (T), o que só os melhores fazem
 *     pelo cruzamento posição × cobertura (M+), o ganho de informação pela resposta
 *     do PAA que nada usava (N) e o SEO antigo pelos títulos, padrões e H2 (U);
 *   - a mesma régua D11 marca a SERP crua do F-S;
 *   - o pedido (regras 29 e 30, os conjuntos citáveis, a oferta de diagnóstico);
 *   - a conferência: id inventado recusado, ganho sem sustentação vira pedido
 *     preparado, até 4 perguntas, fechamento em 4 campos conferido (D7, D8);
 *   - o CSV "Para escrever" (o mesmo núcleo de get_article_for_writing): a coluna
 *     cobrir_e_superar nos quatro blocos, a planta gravada lida sem IA (D6), o
 *     antes → depois do caso.
 * Sem rede, sem IA, sem banco.
 */

const idasAoServidor: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    idasAoServidor.push(String((entrada as { url?: string })?.url || entrada));
    return Promise.reject(new Error("REDE PROIBIDA NESTE TESTE"));
  },
  writable: true, configurable: true,
});

const linhas = (texto: string) => texto.split("\n");
const semComentarios = (fonte: string) => fonte.replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/* ============================== 1 · a leitura pura ============================== */

test("F3 · D11 · amostra relevante do caso: psitto, zenklub e amplimed fora do leitor; prospectaodonto fora da curva — marcados, não escondidos", () => {
  const leitura = buildRadarCompetitiveReading(leituraDoCasoReal());
  assert.equal(leitura.sample.total, 9);
  assert.equal(leitura.sample.relevant, 5);
  const fora = new Map(leitura.sample.excluded.map(item => [item.domain, item.reasons.join(" | ")]));
  for (const dominio of ["psitto.com.br", "zenklub.com.br", "amplimed.com.br"]) assert.match(fora.get(dominio) || "", /^fora do leitor: outra profissão/, dominio);
  assert.match(fora.get("prospectaodonto.com.br") || "", /^outlier de medida: 15944 palavras/);
  for (const dominio of ["capim.com.br", "cemoi.com.br", "idealodonto.com.br"]) assert.equal(fora.has(dominio), false, dominio);
  /* Marcado, nunca escondido: a linha da serp_resumida diz quem saiu e por quê. */
  assert.equal(radarCompetitiveSampleLine(leitura), "Amostra relevante (D11): 5 de 9 páginas comparáveis (fora, marcadas e não escondidas: psitto.com.br (fora do leitor), zenklub.com.br (fora do leitor), amplimed.com.br (fora do leitor), prospectaodonto.com.br (outlier de medida)).");
});

test("F3 · D12 · as medidas viram faixa de referência da amostra relevante, nunca meta de parágrafos", () => {
  const leitura = buildRadarCompetitiveReading(leituraDoCasoReal());
  assert.deepEqual(leitura.reference.words, { min: 1900, max: 2100, median: 2000 });
  assert.deepEqual(leitura.reference.h2, { min: 8, max: 9 });
  assert.equal(radarCompetitiveReferenceLine(leitura), "Faixa de referência (amostra relevante, 5 páginas, sem outlier): 1900–2100 palavras, 8–9 H2; não é meta (D12).");
  assert.doesNotMatch(radarCompetitiveReferenceLine(leitura)!, /parágrafos/);
});

test("F3 · (a) base e (b) só os melhores: o cruzamento posição × cobertura, nunca feito antes, separa a jornada do paciente (top 3) da base", () => {
  const leitura = buildRadarCompetitiveReading(leituraDoCasoReal());
  assert.deepEqual(leitura.consensus.map(item => item.text), [
    "canais e conteúdo (5 de 5 sites da amostra relevante)",
    "site profissional (4 de 5 sites da amostra relevante)",
    "diferença entre tráfego pago e orgânico (2 de 5 sites da amostra relevante)",
  ]);
  assert.deepEqual(leitura.bestOnly.map(item => [item.id, item.practice, item.top, item.rest, item.domains.join(",")]), [
    ["M+1", "jornada do paciente", 3, 0, "capim.com.br,cemoi.com.br,idealodonto.com.br"],
  ]);
  assert.equal(leitura.consensus.some(item => item.topic === "jornada do paciente"), false, "o que só os melhores fazem não é base");
  /* Sem top 3 e resto (amostra pequena), não há "só os melhores": nada é inventado. */
  const pequena = buildRadarCompetitiveReading({ ...leituraDoCasoReal(), pages: leituraDoCasoReal().pages.slice(0, 3) });
  assert.deepEqual(pequena.bestOnly, []);
});

test("F3 · (c) ganho de informação: a fonte que só o resumo de IA cita, a pergunta sem resposta, o tema pouco coberto e a resposta rasa ou de fora do leitor", () => {
  const leitura = buildRadarCompetitiveReading(leituraDoCasoReal());
  assert.deepEqual(leitura.gains.map(item => item.text), [
    "Código de ética odontológica (cfo.org.br) — o resumo de IA cita, nenhum orgânico cita (a verificar)",
    "O que o CRO não permite postar? — sem resposta na SERP",
    "Como funciona o tráfego vindo de IA? — sem resposta na SERP",
    "regras do CRO para publicidade — pouco coberto (1 de 9 páginas)",
    "Como fazer captação de pacientes em odontologia? — resposta rasa na SERP",
    "Como criar um script para captar pacientes para a odontologia? — resposta de fora do leitor (amplimed.com.br)",
  ]);
  assert.ok(leitura.gains.length <= RADAR_COMPETITIVE_READING_LIMITS.perBlock);
  /* A resposta coletada do PAA (que nada usava) diz a qualidade. */
  assert.deepEqual(leitura.questions.map(item => item.quality), ["rasa", "sem resposta", "com resposta", "de fora do leitor", "sem resposta"]);
});

test("F3 · (d) SEO antigo a não copiar: listicle, título-isca, H2 numerados, fechamento genérico, keyword em quase todo H2 e 'o que é' com resposta de IA", () => {
  const leitura = buildRadarCompetitiveReading(leituraDoCasoReal());
  assert.deepEqual(leitura.oldSeo.map(item => item.text), [
    "título-isca sem dado (visto em youtube.com)",
    "listicle \"N dicas\" (visto em capim.com.br, cemoi.com.br)",
    "H2 numerados (a lista virou estrutura) (visto em capim.com.br)",
    "fechamento genérico (\"Conclusão\", \"Considerações finais\") (visto em idealodonto.com.br)",
    "a keyword principal em quase todo H2 (repetição) (visto em odontoblog-exemplo.com.br)",
    "seção \"o que é\" com resposta de IA no topo (zero-click) (visto em odontoblog-exemplo.com.br)",
  ]);
  for (const item of leitura.oldSeo) assert.ok(item.instead, `${item.pattern}: diz o que fazer no lugar`);
  /* Os padrões de título que o diagnóstico da SERP leu bastam para o listicle, sem orgânico. */
  const soPadroes = buildRadarCompetitiveReading({ ...leituraDoCasoReal(), organic: [], pages: [] });
  assert.equal(soPadroes.oldSeo[0]?.pattern, "listicle \"N dicas\"");
  /* Sem resposta de IA no topo, o "o que é" não é SEO antigo (zero-click). */
  const semIa = buildRadarCompetitiveReading({ ...leituraDoCasoReal(), aiOverview: null });
  assert.equal(semIa.oldSeo.some(item => /zero-click/.test(item.pattern)), false);
});

test("F3 · D11 · uma régua só: a SERP crua do F-S marca a relevância pela mesma função", async () => {
  const fonte = semComentarios(await readFile(new URL("../lib/radar/serp-raw-export.ts", import.meta.url), "utf8"));
  assert.match(fonte, /import \{ radarCompetitiveRelevanceReasons \} from "\.\/competitive-reading\.ts";/);
  /* 2026-10-18 · L3 (SDD localidade da SERP por marca): a MESMA chamada, com o endereço e os H2 só para o D11 geográfico. */
  assert.match(fonte, /const motivos = radarCompetitiveRelevanceReasons\(conteudo, palavras, contexto, mediana, \{ url, headings: /);
  const contexto = { core: [PRINCIPAL_DO_CASO], audience: "Dentistas e donos de consultório odontológico." };
  assert.deepEqual(radarCompetitiveRelevanceReasons("Zenklub: Terapia online com psicólogos", null, contexto, null), ["fora do leitor: outra profissão, fora do público do artigo"]);
  assert.deepEqual(radarCompetitiveRelevanceReasons("Captação de pacientes na odontologia", 2000, contexto, 2050), []);
  assert.deepEqual(radarCompetitiveRelevanceReasons("Prospecta Odonto", 15944, contexto, 2050), ["outlier de medida: 15944 palavras (mediana das páginas lidas: 2050)"]);
});

/* ============================== 2 · o pedido (a mesma chamada de IA) ============================== */

const VOZ = (secoes: Array<{ heading: string; body: string }> = []): RadarBrandVoice => ({
  versionId: "voz-1", version: 2, name: "Marca Exemplo", contentHash: "sha256:voz", status: "active", title: "Voz da Marca Exemplo", markdown: "",
  sections: [{ heading: "Tom", body: "Direto e humano." }, ...secoes],
});
const OFERTA_DA_SKILL = "Eu olho seu site, seu perfil no Google e as perguntas que mais chegam na recepção, e te digo o que falta.";
const briefDoCaso = (brandVoice: RadarBrandVoice | null = null) => buildRadarArticleBlueprintBrief({
  entrada: entradaDoCasoRealComSerp(), silo: SILO_DO_CASO_REAL(), articleId: ARTIGO, publication: PUBLICACAO_DO_CASO_REAL, ...(brandVoice ? { brandVoice } : {}),
});

test("F3 · pedido: a leitura vai à MESMA chamada (regras 29 e 30), com os conjuntos T, M+, N e U citáveis e as medidas da amostra relevante", () => {
  const brief = briefDoCaso();
  const ids = brief.evidence.map(item => item.id);
  for (const id of ["T1", "T2", "T3", "M+1", "N1", "N2", "U1", "U6"]) assert.ok(ids.includes(id), id);
  assert.equal(brief.competitive?.sample.relevant, 5);
  /* D11: as medidas da planta (a base sem psitto, zenklub, amplimed e prospectaodonto). */
  assert.equal(brief.measures.comparablePages, 5);
  assert.equal(brief.measures.words.median, 2000);
  const { system, user } = radarArticleBlueprintPrompt(brief);
  assert.match(system, /, T, M\+, N, U\)\. Nunca invente id/);
  assert.match(system, /^29\. ANÁLISE COMPETITIVA \(regras 2026-10-14b; só dados já coletados/m);
  assert.match(system, /questionsKept: até 4 perguntas reais \(ids P\) que valem resposta/);
  assert.match(system, /^30\. DIFERENCIAL DA MARCA E FECHAMENTO \(regras 2026-10-14b\): devolva brandEdge\./m);
  assert.match(system, /UM CTA SÓ: o diagnóstico \(closing\.diagnosis\) é a única chamada do artigo/);
  assert.match(system, /11\. Medidas: use como REFERÊNCIA \(nunca meta de parágrafos\)/);
  assert.match(user, /^# Análise competitiva \(só dados já coletados; siga a regra 29/m);
  assert.match(user, /^Amostra relevante \(D11\): 5 de 9 páginas comparáveis/m);
  assert.match(user, /^Faixa de referência \(amostra relevante, 5 páginas, sem outlier\): 1900–2100 palavras/m);
  /* A resposta coletada do PAA (que nada usava) vai ao pedido, com o id P quando a pergunta está nas evidências. */
  assert.match(user, /^- (?:P\d+ · )?O que o CRO não permite postar\? — sem resposta coletada · sem resposta$/m);
  assert.match(user, /^- (?:P\d+ · )?Como fazer captação de pacientes em odontologia\? — o Google mostra: "A captação começa pelo perfil da clínica no Google[^"]*" \(capim\.com\.br\) · rasa$/m);
  assert.match(user, /^Há resposta de IA no topo da SERP: definição vira 1 ou 2 frases da abertura/m);
  assert.match(user, /"competitive":\{"consensus":/);
  assert.match(user, /"brandEdge":\{"method":/);
  assert.match(user, /"closing":\{"pain":"","structureShift":"","ease":"","diagnosis":""/);
  /* Sem Skill lida, o pedido diz o texto padrão neutro; sem a seção na Skill, também, com a proposta na Marca. */
  assert.match(user, new RegExp(`^Sem a Skill de voz da Marca neste pedido: o diagnóstico parte do texto padrão neutro \\("${BRAND_DIAGNOSIS_OFFER_DEFAULT.replace(/[?.()]/g, "\\$&")}"\\)`, "m"));
  assert.match(radarArticleBlueprintPrompt(briefDoCaso(VOZ())).user, /A Skill de voz da Marca não tem a seção "Oferta de diagnóstico" \(D8\)/);
  assert.match(radarArticleBlueprintPrompt(briefDoCaso(VOZ([{ heading: "Oferta de diagnóstico", body: OFERTA_DA_SKILL }]))).user, /^Oferta de diagnóstico da Skill de voz da Marca \(seção "Oferta de diagnóstico"\): Eu olho seu site/m);
  /* Sem SERP do Google lida (outro perfil), nada de análise: o pedido é o de antes. */
  assert.equal(buildRadarArticleBlueprintBrief({ entrada: { ...entradaGoogle(), profile: "AMAZON" } as never, silo: null, articleId: ARTIGO, publication: null }).competitive, undefined);
});

/* ============================== 3 · a conferência ============================== */

const H2_DEPOIS = [
  "Por que a agenda sobe com o anúncio e cai quando ele para",
  "O que o paciente da sua região vê quando procura um dentista",
  "As perguntas da recepção que viram páginas, e o que o CRO permite publicar",
  "Agência de posts ou estrutura própria: como comparar quem executa",
  "Como saber se está funcionando: do clique ao paciente na cadeira",
];
const FECHAMENTO_DEPOIS = {
  pain: "Se a agenda depende do mês em que o anúncio roda, você está alugando a atenção do paciente.",
  structureShift: "A saída é o consultório achável no Google: uma página por tratamento, o perfil da empresa coerente com o site e as perguntas da recepção respondidas, ligadas entre si.",
  ease: "Eu pesquiso, escrevo e publico; você revisa o que é clínico e conta o que já responde na cadeira.",
  diagnosis: "Quer saber por onde começar? Eu olho seu site, seu perfil no Google e as perguntas que mais chegam na recepção, e te digo o que falta.",
  specialist: null,
  nextStep: null,
};
const ANALISE_DEPOIS = {
  consensus: [
    { topic: "canais e conteúdo", sites: 5, evidence: ["T1"], howWeCover: "Em duas frases da abertura: canal sem estrutura não segura agenda." },
    { topic: "site profissional", sites: 4, evidence: ["T2", "X99"], howWeCover: "Dentro da seção do que o paciente vê." },
    { topic: "algo que não está no pacote", sites: 3, evidence: ["T42"], howWeCover: "" },
  ],
  bestOnly: [{ practice: "organizar pela jornada do paciente", evidence: ["M+1"], doBetter: "Mostrar a jornada com as perguntas reais da recepção, da busca à cadeira." }],
  gains: [
    { gap: "o que o CRO permite publicar", kind: "regra_oficial", giver: "fonte_oficial", evidence: ["N1", "N2"], section: H2_DEPOIS[2] },
    { gap: "o que o paciente vê na busca local", kind: "experiencia", giver: "marca", evidence: ["N3"], section: H2_DEPOIS[1] },
    { gap: "a conta do clique ao paciente", kind: "dado", giver: "especialista", evidence: ["N4"], section: H2_DEPOIS[4] },
  ],
  oldSeo: [
    { pattern: "listicle \"10 estratégias\" e \"Dicas de Ouro\"", seenIn: ["capim.com.br", "cemoi.com.br"], evidence: ["U2"], instead: "um caminho com critério: o que verificar primeiro" },
    { pattern: "promessa \"20 pacientes sem gastar\"", seenIn: ["youtube.com"], evidence: ["U1"], instead: "o que a marca verifica, sem número inventado" },
  ],
  angle: "O checklist do que o consultório já tem antes de qualquer canal: site, perfil e as perguntas da recepção.",
  questionsKept: [
    { question: "Como conseguir captar pacientes?", valueAnswer: "Sendo encontrado por quem já procura: página por tratamento, perfil coerente e as dúvidas da recepção respondidas.", section: H2_DEPOIS[1], evidence: ["P2"] },
    { question: "O que o CRO não permite postar?", valueAnswer: "O que a regra oficial veta (antes e depois, promessa de resultado), pela fonte do conselho.", section: H2_DEPOIS[2], evidence: [] },
    { question: "Como criar um script para captar pacientes para a odontologia?", valueAnswer: "As respostas da recepção viram o roteiro: o que perguntam, o que a clínica responde.", section: H2_DEPOIS[2], evidence: ["P3"] },
    { question: "Como funciona o tráfego vindo de IA?", valueAnswer: "A resposta de IA cita páginas claras e verificáveis: a mesma estrutura serve às duas buscas.", section: H2_DEPOIS[4], evidence: ["P5"] },
    { question: "Como fazer captação de pacientes em odontologia?", valueAnswer: "Repete a primeira.", section: H2_DEPOIS[0], evidence: ["P1"] },
    { question: "Qual o melhor horário para postar?", valueAnswer: "", section: "", evidence: ["P77"] },
  ],
  questionsDropped: [{ question: "Como fazer marketing no Instagram?", reason: "outro artigo do Silo" }],
};
const DIFERENCIAL_DEPOIS = {
  method: [{ deliverable: "uma página por tratamento com as perguntas da recepção, ligadas entre si", methodName: "Silo", section: H2_DEPOIS[2] }],
  vsGeneric: "A agência de posts entrega calendário; a estrutura própria entrega o consultório achável quando o paciente procura.",
  localSignals: [{ signal: "o perfil da empresa coerente com o site", section: H2_DEPOIS[1] }, { signal: "as perguntas da recepção virando páginas", section: H2_DEPOIS[2] }],
  bottomFunnel: H2_DEPOIS[3],
};

function respostaDepois(brief: ReturnType<typeof briefDoCaso>, patch: Record<string, unknown> = {}) {
  const resposta = respostaDaPlanta(brief, {
    title: {
      principalNatural: PRINCIPAL_NATURAL_DO_CASO,
      h1: "A agenda sobe com o anúncio e cai quando ele para? Captação de pacientes para dentista com estrutura própria",
      alternatives: ["Menos dicas, mais estrutura: a captação de pacientes para dentista que o Google encontra", "Seu consultório aparece para quem procura dentista na região? O diagnóstico antes da próxima campanha"],
      seoTitle: "Captação de pacientes para dentista sem depender de anúncio",
      metaDescription: "Post, anúncio e agência e a agenda ainda oscila? Veja como site, perfil no Google e respostas às perguntas da recepção ajudam a captação de pacientes para dentista.",
    },
    closing: { ...FECHAMENTO_DEPOIS, turn: "", cta: "" },
    competitive: ANALISE_DEPOIS,
    brandEdge: DIFERENCIAL_DEPOIS,
    ...patch,
  });
  const ai = RadarArticleBlueprintAiSchema.parse(resposta);
  ai.sections = H2_DEPOIS.map((h2, indice) => ({ ...(ai.sections[indice] ?? ai.sections[0]), h2, readerQuestion: `${h2}?` }));
  return ai;
}

test("F3 · conferência: id inventado é recusado; o ganho da marca sem a Skill vira pedido preparado; até 4 perguntas, as outras no painel com o motivo", () => {
  const brief = briefDoCaso();
  const { payload, notes } = radarSanitizeArticleBlueprint(respostaDepois(brief), brief, { close: true });
  const c = payload.blueprint.competitive!;
  /* Id inventado (X99, T42, P77) é recusado: o item sem id válido sai. */
  assert.deepEqual(c.consensus.map(item => [item.topic, item.evidence]), [["canais e conteúdo", ["T1"]], ["site profissional", ["T2"]]]);
  assert.ok(notes.some(nota => /^Análise competitiva: 3 id\(s\) que não existem no pacote removido\(s\)/.test(nota)), notes.join("\n"));
  /* "marca" sem a Skill e "especialista" sem parecer: pedido de contribuição preparado (não enviado), fora do CSV. */
  assert.deepEqual(c.gains.map(item => item.giver), ["fonte_oficial"]);
  assert.deepEqual(c.contributionRequests.map(item => [item.giver, item.status]), [["marca", "PREPARED"], ["especialista", "PREPARED"]]);
  assert.match(c.contributionRequests[0].ask, /^Pedir à marca \(Skill de voz\): o que ela entrega ou mede sobre "o que o paciente vê na busca local"/);
  /* D13: até 4; a pergunta pelo texto do pacote (sem id) vale; a quinta vai ao painel com o motivo. */
  assert.equal(c.questionsKept.length, RADAR_COMPETITIVE_READING_LIMITS.questionsKept);
  assert.deepEqual(c.questionsKept[1].evidence.length, 1, "o CRO casou pela pergunta do pacote");
  assert.ok(c.questionsDropped.some(item => item.question === "Como fazer captação de pacientes em odontologia?" && /acima das 4 perguntas que valem resposta \(D13\)/.test(item.reason)));
  assert.ok(c.questionsDropped.some(item => item.reason === "outro artigo do Silo"));
  assert.ok(notes.some(nota => /pergunta\(s\) além das 4 que valem resposta ficaram neste painel \(D13\)/.test(nota)));
  /* Com a Skill e o parecer, a marca e o especialista sustentam o ganho. */
  const comVoz = briefDoCaso(VOZ());
  const comSkill = radarSanitizeArticleBlueprint(respostaDepois(comVoz), { ...comVoz, specialist: [{ id: "E1", kind: "DIRETRIZ", text: "Eu meço do clique à cadeira." }] }, { close: true }).payload.blueprint.competitive!;
  assert.deepEqual(comSkill.gains.map(item => item.giver), ["fonte_oficial", "marca", "especialista"]);
  assert.deepEqual(comSkill.contributionRequests, []);
  assert.equal(payload.rulesVersion, RADAR_ARTICLE_BLUEPRINT_RULES_VERSION);
  assert.equal(RADAR_ARTICLE_BLUEPRINT_RULES_VERSION, "2026-10-14c"); /* 2026-10-14c · SDD silo interligado · F-B · decisão do dono (§16.2): regras 2026-10-14c */
});

test("F3 · D7 · fechamento em 4 campos conferido: a virada e o CTA saem dos campos; o diagnóstico é o CTA único", () => {
  const brief = briefDoCaso();
  const { payload, notes } = radarSanitizeArticleBlueprint(respostaDepois(brief), brief, { close: true });
  const fechamento = payload.blueprint.closing;
  assert.equal(fechamento.diagnosis, FECHAMENTO_DEPOIS.diagnosis);
  assert.equal(fechamento.cta, FECHAMENTO_DEPOIS.diagnosis, "o CTA é o diagnóstico");
  assert.equal(fechamento.turn, [FECHAMENTO_DEPOIS.pain, FECHAMENTO_DEPOIS.structureShift, FECHAMENTO_DEPOIS.ease].join(" "));
  assert.deepEqual(radarClosingIssues(fechamento), []);
  assert.equal(notes.some(nota => /fechamento em 4 campos/i.test(nota)), false, notes.join("\n"));
  assert.equal(payload.blueprint.brandEdge?.method[0].methodName, "Silo");

  /* Sem fechar: o diagnóstico que não verifica nada (e chama duas vezes) e a facilidade sem quem faz pedem ação. */
  const ruim = respostaDepois(brief, { closing: { ...FECHAMENTO_DEPOIS, ease: "Comece com poucas páginas bem feitas.", diagnosis: "Vamos planejar a presença orgânica da sua clínica? Agende uma conversa.", turn: "", cta: "" } });
  const aberta = radarSanitizeArticleBlueprint(ruim, brief);
  const pendencia = aberta.notes.find(nota => nota.startsWith("O fechamento em 4 campos tem pendência"))!;
  assert.match(pendencia, /a facilidade não diz quem faz/);
  assert.match(pendencia, /o diagnóstico não diz o que a marca verifica/);
  assert.match(pendencia, /o diagnóstico faz mais de uma chamada/);
  assert.equal(radarArticleBlueprintPendingNotes([pendencia]).pending.length, 1, "vai à passada de correção");
  /* Fechando (D8): o diagnóstico vira a oferta da Skill ou o texto padrão neutro; o resto fica no painel. */
  const fechada = radarSanitizeArticleBlueprint(ruim, brief, { close: true });
  assert.equal(fechada.payload.blueprint.closing.diagnosis, BRAND_DIAGNOSIS_OFFER_DEFAULT);
  assert.equal(fechada.payload.blueprint.closing.cta, BRAND_DIAGNOSIS_OFFER_DEFAULT);
  assert.ok(fechada.notes.some(nota => /^Fechamento: o diagnóstico virou o texto padrão neutro/.test(nota)));
  const comOferta = briefDoCaso(VOZ([{ heading: "Oferta de diagnóstico", body: OFERTA_DA_SKILL }]));
  assert.equal(radarSanitizeArticleBlueprint(ruim, comOferta, { close: true }).payload.blueprint.closing.diagnosis, OFERTA_DA_SKILL);

  /* A resposta de antes (sem os 4 campos) continua válida, como era: só a nota que diz que o CSV os escreve. */
  const antes = RadarArticleBlueprintAiSchema.parse(respostaDaPlanta(brief));
  const deAntes = radarSanitizeArticleBlueprint(antes, brief, { close: true });
  assert.equal("diagnosis" in deAntes.payload.blueprint.closing, false);
  assert.equal("competitive" in deAntes.payload.blueprint, false);
  assert.equal("brandEdge" in deAntes.payload.blueprint, false);
  assert.ok(deAntes.notes.some(nota => /^Fechamento: a resposta não trouxe os 4 campos/.test(nota)));
  assert.equal(radarArticleBlueprintPendingNotes(deAntes.notes.filter(nota => /^Fechamento:|^Análise competitiva:/.test(nota))).pending.length, 0, "não paga correção");
});

test("F3 · réguas do fechamento (palavras, não sentido): verificação, quem faz e uma chamada só", () => {
  assert.ok(radarClosingDiagnosisVerifies("Eu olho seu site e te digo o que falta."));
  assert.ok(radarClosingDiagnosisVerifies("Peça um diagnóstico do seu perfil."));
  assert.equal(radarClosingDiagnosisVerifies("Vamos planejar a presença orgânica da sua clínica no Google?"), false);
  assert.equal(radarClosingCalls("Quer saber? Agende. Siga no Instagram."), 2);
  assert.ok(radarClosingEaseNamesDoer("Eu pesquiso, escrevo e publico."));
  assert.ok(radarClosingEaseNamesDoer("A Marca Exemplo cuida das páginas.", "Marca Exemplo"));
  assert.equal(radarClosingEaseNamesDoer("Comece com poucas páginas bem feitas."), false);
  assert.ok(radarClosingDiagnosisVerifies(BRAND_DIAGNOSIS_OFFER_DEFAULT) && radarClosingCalls(BRAND_DIAGNOSIS_OFFER_DEFAULT) === 1, "o texto padrão passa na própria régua");
});

/* ============================== 4 · D8 · a oferta da Marca ============================== */

test("F3 · D8 · a oferta de diagnóstico é a seção da Skill de voz; sem ela, o texto padrão neutro e a proposta para o dono aplicar (nada é escrito na Skill)", async () => {
  assert.equal(brandDiagnosisOfferOf([{ heading: "Tom", body: "Direto." }]), null);
  assert.equal(brandDiagnosisOfferOf([{ heading: "Oferta de diagnóstico", body: `- ${OFERTA_DA_SKILL}` }]), OFERTA_DA_SKILL);
  assert.equal(brandDiagnosisOfferOf([{ heading: "CTA de diagnóstico", body: "Eu reviso o perfil." }]), "Eu reviso o perfil.");
  assert.deepEqual(radarDiagnosisOfferOf(null), { text: BRAND_DIAGNOSIS_OFFER_DEFAULT, source: "default" });
  assert.deepEqual(radarDiagnosisOfferOf([{ heading: "Oferta de diagnóstico", body: OFERTA_DA_SKILL }]), { text: OFERTA_DA_SKILL, source: "skill" });
  assert.ok(brandDiagnosisOfferInMarkdown("# Voz\n\n## Oferta de diagnóstico\n\nEu olho."));
  assert.equal(brandDiagnosisOfferInMarkdown("# Voz\n\n## Tom\n\nDireto."), false);
  assert.match(BRAND_DIAGNOSIS_OFFER_PROPOSAL, new RegExp(`^## ${BRAND_DIAGNOSIS_OFFER_HEADING}\\n`));
  /* O painel da Marca mostra a proposta quando a Skill de voz não tem a seção; nada grava a Skill. */
  const painel = semComentarios(await readFile(new URL("../modules/marca/brand-skill-editor.tsx", import.meta.url), "utf8"));
  assert.match(painel, /skill\.definitionKey === "brand_voice" && !brandDiagnosisOfferInMarkdown\(skill\.originalMarkdown\) \? <DiagnosisOfferProposal\/> : null/);
  assert.match(painel, /<MarkdownPreview markdown=\{BRAND_DIAGNOSIS_OFFER_PROPOSAL\}\/>/);
  assert.match(painel, /Nada é aplicado automaticamente\./);
  const proposta = painel.slice(painel.indexOf("function DiagnosisOfferProposal"), painel.indexOf("export function BrandSkillFormDialog"));
  assert.doesNotMatch(proposta, /fetch\(|onSubmit|onReplace|save|salvar/i, "a proposta não grava nada");
});

/* ============================== 5 · o CSV "Para escrever" (o núcleo de get_article_for_writing) ============================== */

const linhaDoCaso = (blueprint: RadarArticleBlueprintPayload, extra: Record<string, unknown> = {}) =>
  buildRadarWritingExportArticle(entradaDoCasoRealComSerp(), contextoDoCasoReal({ blueprint, ...extra })).row;
const plantaDepois = (brandVoice: RadarBrandVoice | null = null) => {
  const brief = briefDoCaso(brandVoice);
  return { ...radarSanitizeArticleBlueprint(respostaDepois(brief), brief, { close: true }).payload, approval: "APPROVED" as const };
};

test("F3 · caso real · ANTES (planta gravada, regras 2026-10-11c): a coluna cobrir_e_superar lê os quatro blocos da SERP coletada, sem IA e sem 'material insuficiente'", () => {
  const linha = linhaDoCaso(plantaDoCasoReal());
  const cobrir = linhas(linha.cobrir_e_superar);
  assert.equal(cobrir[0], "Ângulo deste artigo: O checklist do que a clínica já tem antes de qualquer canal.");
  const blocos = cobrir.filter(item => /^[1-4]\. /.test(item));
  assert.deepEqual(blocos, [
    "1. Base que todos cobrem (diga em poucas linhas, sem copiar):",
    "2. O que os melhores fazem, e como fazer melhor:",
    "3. O que ninguém entrega e este artigo entrega (ganho de informação, de quem):",
    "4. SEO antigo que não se copia:",
  ]);
  assert.ok(cobrir.includes("- canais e conteúdo (5 de 5 sites)"));
  assert.ok(cobrir.includes("- jornada do paciente (top 3 relevante: 3 de 3; do 4º em diante: 0 de 2): faça igual e melhor, com o exemplo da marca"));
  assert.ok(cobrir.includes("- Código de ética odontológica (cfo.org.br) — o resumo de IA cita, nenhum orgânico cita (a verificar)"));
  assert.ok(cobrir.some(item => item.startsWith("- listicle \"N dicas\" (visto em capim.com.br, cemoi.com.br): no lugar, ")));
  assert.doesNotMatch(linha.cobrir_e_superar, /material insuficiente/);
  /* D13: no máximo 4 perguntas na coluna (as da linha, as prontas primeiro). */
  const inicio = cobrir.findIndex(item => item.startsWith("Perguntas que valem resposta (até 4"));
  const perguntas = inicio < 0 ? [] : cobrir.slice(inicio + 1, cobrir.findIndex((item, indice) => indice > inicio && !item.startsWith("- ")));
  assert.ok(perguntas.length <= RADAR_COMPETITIVE_READING_LIMITS.questionsKept, perguntas.join(" | "));
  /* serp_resumida: a amostra relevante, marcada. Estrutura: a faixa de referência e o CTA aprovado da planta (D6, AGENTS §9). */
  assert.match(linha.serp_resumida, /^Amostra relevante \(D11\): 5 de 9 páginas comparáveis \(fora, marcadas e não escondidas: psitto\.com\.br \(fora do leitor\)/m);
  assert.match(linha.estrutura, /^Faixa de referência \(amostra relevante, 5 páginas, sem outlier\): 1900–2100 palavras, 8–9 H2; não é meta \(D12\)\.$/m);
  assert.match(linha.estrutura, /^CTA: Vamos planejar a presença orgânica da sua clínica no Google\?$/m);
  assert.match(linha.estrutura, /^- Fechamento em 4 tempos: dor/m);
  assert.doesNotMatch(linha.estrutura, /^Diferencial da marca/m, "brandEdge só organizando de novo");
  assert.deepEqual(Object.keys(linha), [...RADAR_WRITING_EXPORT_COLUMNS], "as 13 colunas, na mesma ordem");
});

test("F3 · caso real · DEPOIS (planta nova, regras 2026-10-14b): os quatro blocos da IA, até 4 perguntas com a resposta de valor, o diferencial da marca e o fechamento em 4 tempos", () => {
  const linha = linhaDoCaso(plantaDepois());
  const cobrir = linhas(linha.cobrir_e_superar);
  assert.equal(cobrir[0], `Ângulo deste artigo: ${ANALISE_DEPOIS.angle}`);
  assert.ok(cobrir.includes("- canais e conteúdo (5 sites) — Em duas frases da abertura: canal sem estrutura não segura agenda"));
  assert.ok(cobrir.includes("- organizar pela jornada do paciente — como fazer melhor: Mostrar a jornada com as perguntas reais da recepção, da busca à cadeira"));
  assert.ok(cobrir.includes(`- o que o CRO permite publicar (regra oficial; de quem: fonte oficial, a verificar; seção "${H2_DEPOIS[2]}")`));
  assert.ok(cobrir.includes("- listicle \"10 estratégias\" e \"Dicas de Ouro\" (visto em capim.com.br, cemoi.com.br): no lugar, um caminho com critério: o que verificar primeiro"));
  const inicio = cobrir.findIndex(item => item.startsWith("Perguntas que valem resposta (até 4"));
  const perguntas = cobrir.slice(inicio + 1).filter(item => item.startsWith("- ") && item.includes("? →"));
  assert.equal(perguntas.length, 4, linha.cobrir_e_superar);
  assert.equal(perguntas[0], `- Como conseguir captar pacientes? → Sendo encontrado por quem já procura: página por tratamento, perfil coerente e as dúvidas da recepção respondidas (seção "${H2_DEPOIS[1]}")`);
  /* Fora do CSV: a pergunta além das 4, o pedido preparado e o motivo de descarte (só o painel). */
  assert.doesNotMatch(linha.cobrir_e_superar, /Como fazer captação de pacientes em odontologia\? →|Pedir à marca|PREPARED|acima das 4/);
  /* promessa_e_leitor: o ângulo de diferenciação e o contraste com o genérico. */
  assert.match(linha.promessa_e_leitor, /^Ângulo de diferenciação \(análise competitiva; a entrega que a amostra relevante não tem\): O checklist do que o consultório/m);
  assert.match(linha.promessa_e_leitor, /^Contra o genérico: A agência de posts entrega calendário/m);
  /* estrutura: o diferencial da marca e o fechamento em 4 tempos, com o diagnóstico como CTA único. */
  const estrutura = linhas(linha.estrutura);
  assert.ok(estrutura.includes("Diferencial da marca (regras 2026-10-14b; a entrega primeiro, o nome do método depois, uma vez):"));
  assert.ok(estrutura.includes(`- Método: uma página por tratamento com as perguntas da recepção, ligadas entre si — isso tem nome: Silo (dito uma vez, depois da entrega) · seção "${H2_DEPOIS[2]}"`));
  assert.ok(estrutura.includes(`- Fundo de funil (a seção de decisão: critérios, custo, prazo, como avaliar quem executa): ${H2_DEPOIS[3]}`));
  assert.ok(estrutura.includes("Fechamento em 4 tempos (D7, regras 2026-10-14b; um CTA só, o diagnóstico):"));
  assert.ok(estrutura.includes(`- Dor: ${FECHAMENTO_DEPOIS.pain}`));
  assert.ok(estrutura.includes(`- Facilidade (quem faz é a marca): ${FECHAMENTO_DEPOIS.ease}`));
  assert.ok(estrutura.includes(`CTA (a única chamada) — diagnóstico: ${FECHAMENTO_DEPOIS.diagnosis}`));
  assert.equal(estrutura.filter(item => /^CTA[ :(]/.test(item)).length, 1, "um CTA só");
  assert.match(linha.titulo_e_seo, /^SEO antigo do topo, que o título não copia: listicle "10 estratégias" e "Dicas de Ouro" \(capim\.com\.br, cemoi\.com\.br\); promessa "20 pacientes sem gastar" \(youtube\.com\); o título promete o ângulo "O checklist/m);
  assert.deepEqual(Object.keys(linha), [...RADAR_WRITING_EXPORT_COLUMNS], "as 13 colunas, na mesma ordem");
  assert.equal(idasAoServidor.length, 0, "nada sai para a rede");
});

test("F3 · D7 · a fala aprovada do especialista vai à mudança e à facilidade, inteira, e não substitui o CTA (planta nova e gravada)", () => {
  const fala = "\"Eu vejo isso toda semana: a clínica posta, o anúncio cai e o dinheiro some.\" (E1; atribuir como fala do especialista, sem inventar nome ou credencial)";
  for (const planta of [plantaDepois(), plantaDoCasoReal()]) {
    const colunas = radarArticleBlueprintColumns(planta, null, null, null, { specialistCta: fala });
    assert.match(colunas.estrutura, /^Fala aprovada do especialista \(D7: entra na mudança para a estrutura e na facilidade, na voz dele; não substitui o diagnóstico\): "Eu vejo isso toda semana/m);
    assert.equal(linhas(colunas.estrutura).filter(item => /^CTA[ :(]/.test(item)).length, 1);
    assert.doesNotMatch(colunas.estrutura, /^CTA.*Eu vejo isso toda semana/m);
  }
});

test("F3 · D8 · com a seção na Skill, a planta gravada diz a oferta junto do CTA aprovado; sem ela, o CSV não leva nota de pendência", () => {
  const comOferta = radarArticleBlueprintColumns(plantaDoCasoReal(), null, null, null, { diagnosisOffer: { text: OFERTA_DA_SKILL, source: "skill" } });
  assert.match(comOferta.estrutura, /^- Oferta de diagnóstico da Skill de voz da Marca \(D8\): Eu olho seu site, seu perfil no Google e as perguntas que mais chegam na recepção, e te digo o que falta; o CTA acima a segue, como a única chamada\.$/m);
  const semOferta = radarArticleBlueprintColumns(plantaDoCasoReal(), null, null, null, { diagnosisOffer: { text: BRAND_DIAGNOSIS_OFFER_DEFAULT, source: "default" } });
  assert.doesNotMatch(semOferta.estrutura, /Oferta de diagnóstico|painel da Marca|proposta de texto/);
});

test("F3 · a regra das ressalvas (uma vez, onde a afirmação está) chega à regra geral 12 e ao pedido; a versão das regras é 2026-10-14b", () => {
  assert.ok(radarHumanVoiceWritingRule().includes(RADAR_HUMAN_VOICE_RESERVATION_RULE));
  assert.ok(radarHumanVoicePromptBlock()[1].includes(RADAR_HUMAN_VOICE_RESERVATION_RULE));
  assert.match(RADAR_HUMAN_VOICE_RESERVATION_RULE, /a ressalva vai UMA vez, onde a afirmação está, nunca "pode" e "não garante" em série/);
  assert.equal(RADAR_CLOSING_RULES_VERSION, "2026-10-14b");
});

test("F3 · uma leitura só: o pedido do artigo-modelo e o CSV leem a SERP pela mesma função (radarCompetitiveReadingOf)", async () => {
  const blueprint = semComentarios(await readFile(new URL("../lib/radar/article-blueprint.ts", import.meta.url), "utf8"));
  const escrita = semComentarios(await readFile(new URL("../lib/radar/portable-writing-export.ts", import.meta.url), "utf8"));
  assert.match(blueprint, /const leituraCompetitiva: RadarCompetitiveReading \| null = radarCompetitiveReadingOf\(entrada, \{ serpObserved: serp, base: p\.base, subject: p\.assunto\?\.phrase \?\? null \}\);/);
  assert.match(escrita, /radarCompetitiveReadingOf\(input, \{ serpObserved: p\.serpObservada, base: p\.base, subject: p\.assunto\?\.phrase \?\? null \}\)/);
  /* A mesma entrada dá a mesma leitura dos dois lados. */
  const entrada = entradaDoCasoRealComSerp();
  const p = radarWritingProjections(entrada);
  const leitura = radarCompetitiveReadingOf(entrada, { serpObserved: p.serpObservada, base: p.base, subject: p.assunto?.phrase ?? null })!;
  assert.deepEqual(briefDoCaso().competitive?.sample, leitura.sample);
});
