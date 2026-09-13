import assert from "node:assert/strict";
import test from "node:test";

import { resolveKeywordDnaSignals } from "../lib/arquiteto/keyword-dna-signals.ts";
import {
  buildSemanticSignature,
  deriveSemanticNuclei,
  siloContextTokens,
  splitNucleusIfEditorialBoundary,
  type KeywordSemanticSignature,
} from "../lib/arquiteto/semantic-nucleus.ts";

/**
 * §18 — O LOTE REAL, DEPOIS DA RESERVA DA SILOPAGE.
 *
 * Brand care-glow, Silo `skincare` confirmado. `skincare` fica reservada para
 * a SiloPage; sobram estas oito. O agrupamento por semelhança de string
 * produziu três candidatos que são o mesmo artigo de pele oleosa.
 *
 * O teste NÃO afirma "tem que dar exatamente N Articles": ele afirma o que
 * não pode acontecer, e o que o DNA precisa sustentar para acontecer.
 */

const SILO_TOKENS = siloContextTokens({
  name: "skincare",
  centralEntity: "skincare",
  slug: "/skincare",
});

/**
 * O DNA chega como o motor do Minerador grava: `Record<string, string>`, com
 * `modificadores` em texto separado por vírgula. Ler isso como array devolvia
 * `[]` sempre — e era esse o estado do sinal até agora.
 */
const dna = (
  keywordId: string,
  text: string,
  semantic: Record<string, string> = {},
): KeywordSemanticSignature => buildSemanticSignature({
  dna: resolveKeywordDnaSignals({
    keywordId,
    text,
    semanticQualification: { intent: "Informativa", semanticState: "conclusive" },
    semantic: { entidade_central: "skincare", dna_confianca: "0.8", ...semantic },
  }),
  siloTokens: SILO_TOKENS,
  volume: 100,
});

const LOTE = [
  dna("k2", "skincare vitamina c", { modificadores: "vitamina c", problema_percebido: "Escolher ativo de vitamina C" }),
  dna("k3", "skincare para pele oleosa", { modificadores: "pele oleosa", problema_percebido: "Controlar oleosidade da pele" }),
  dna("k4", "skin care noturno", { modificadores: "noturno", problema_percebido: "Montar rotina noturna" }),
  dna("k5", "skin care nivea", { modificadores: "nivea" }),
  dna("k6", "skin care pele oleosa", { modificadores: "pele oleosa", problema_percebido: "Controlar oleosidade da pele" }),
  dna("k7", "skin care para peles oleosas", { modificadores: "peles oleosas", problema_percebido: "Controlar oleosidade da pele" }),
  dna("k8", "mascara facial skin care", { modificadores: "mascara facial" }),
  dna("k9", "pele oleosa e acne", { modificadores: "pele oleosa, acne" }),
];

const nucleoDe = (keywordId: string, particao = deriveSemanticNuclei({ signatures: LOTE })) =>
  particao.nuclei.find(nucleo => nucleo.keywordIds.includes(keywordId));

/* ================ o bug que desligava o sinal de modificadores ========== */

test("§3 — `modificadores` vem como string do Minerador e é lido como lista", () => {
  const sinais = resolveKeywordDnaSignals({
    keywordId: "k9",
    text: "pele oleosa e acne",
    semantic: { modificadores: "pele oleosa, acne", entidade_central: "skincare" },
  });
  assert.deepEqual(sinais.modifiers, ["pele oleosa", "acne"]);

  // "Nenhum modificador explícito" é a ausência dita pelo motor, não um dado.
  assert.deepEqual(
    resolveKeywordDnaSignals({ keywordId: "x", text: "x", semantic: { modificadores: "Nenhum modificador explícito" } }).modifiers,
    [],
  );
  // E o array continua aceito, para um payload já estruturado.
  assert.deepEqual(
    resolveKeywordDnaSignals({ keywordId: "x", text: "x", semantic: { modificadores: ["a", "b"] } }).modifiers,
    ["a", "b"],
  );
});

test("§3 — o resto do DNA deixou de ficar gravado sem ninguém consultar", () => {
  const sinais = resolveKeywordDnaSignals({
    keywordId: "k3",
    text: "skincare para pele oleosa",
    semantic: {
      problema_percebido: "Controlar oleosidade da pele",
      publico: "pele oleosa",
      resultado_desejado: "Pele equilibrada",
      tipo_editorial: "guia",
      risco_canibalizacao: "Moderado: termo amplo",
      resultado_nao_existente: "ignorado",
    },
  });
  assert.equal(sinais.perceivedProblem, "Controlar oleosidade da pele");
  assert.equal(sinais.audience, "pele oleosa");
  assert.equal(sinais.desiredResult, "Pele equilibrada");
  assert.equal(sinais.editorialType, "guia");
  assert.match(sinais.cannibalizationNote || "", /Moderado/);

  // Ausência declarada pelo motor não vira dado.
  const vazio = resolveKeywordDnaSignals({
    keywordId: "k",
    text: "k",
    semantic: { problema_percebido: "Problema não determinado pela keyword", publico: "A confirmar" },
  });
  assert.equal(vazio.perceivedProblem, null);
  assert.equal(vazio.audience, null);
});

/* ======================== §6 · a entidade do Silo ======================== */

test("§6 — `centralEntity = skincare` em todas não junta todas", () => {
  // As oito declaram a mesma entidade central. Se ela contasse como foco, o
  // Silo inteiro viraria um Article só.
  assert.ok(LOTE.every(item => item.centralEntity === "skincare"));
  const particao = deriveSemanticNuclei({ signatures: LOTE });
  assert.ok(particao.nuclei.length > 1, "o contexto do Silo não pode apagar os subtemas");
  // E nenhum foco derivado carrega o termo do Silo.
  for (const nucleo of particao.nuclei) {
    for (const ancora of nucleo.anchors) {
      assert.ok(!"skincare".includes(ancora), `âncora "${ancora}" é o próprio Silo`);
    }
  }
});

/* ==================== §18-A/§18-E · as variantes de pele oleosa ========== */

test("§18-A/E — as três variações de pele oleosa caem no MESMO núcleo", () => {
  const particao = deriveSemanticNuclei({ signatures: LOTE });
  const k3 = nucleoDe("k3", particao);
  assert.ok(k3, "k3 precisa ter núcleo");
  assert.ok(k3.keywordIds.includes("k6"), "'skin care pele oleosa' é a mesma pergunta");
  assert.ok(k3.keywordIds.includes("k7"), "'skin care para peles oleosas' é a mesma pergunta");

  // E não sobrou nenhum núcleo paralelo de pele oleosa.
  const deOleosa = particao.nuclei.filter(nucleo =>
    nucleo.anchors.some(ancora => ancora === "oleosa" || ancora === "pele"));
  assert.equal(deOleosa.length, 1, "três variações independentes de pele oleosa é formação ruim");

  // A justificativa cita sinal REALMENTE usado.
  assert.match(k3.reasons.join(" · "), /foco compartilhado|mesmo problema percebido/);
});

/* ================= §18-B/§8 · temas distintos não se fundem ============== */

test("§18-B — 'skin care' compartilhado não funde temas distintos", () => {
  const particao = deriveSemanticNuclei({ signatures: LOTE });
  const oleosa = nucleoDe("k3", particao)!;
  for (const outro of ["k2", "k4", "k5", "k8"]) {
    assert.ok(
      !oleosa.keywordIds.includes(outro),
      `${outro} foi absorvido por pele oleosa só por dividir "skin care"`,
    );
  }
});

test("§18-D — vitamina C forma núcleo próprio quando o DNA sustenta o foco", () => {
  const vitamina = nucleoDe("k2")!;
  assert.deepEqual(vitamina.keywordIds, ["k2"]);
  assert.match(vitamina.reasons.join(" "), /foco próprio/);
});

test("§18-C — acne só vira núcleo próprio quando o DNA a sustenta como foco", () => {
  // No lote real, "pele oleosa e acne" declara pele oleosa E acne: ela
  // pertence ao tema de pele oleosa, e acne é qualificador.
  assert.ok(nucleoDe("k9")!.keywordIds.includes("k3"));

  // Com mais buscas sustentando acne, o foco passa a existir por si.
  const comAcne = [
    ...LOTE,
    dna("k10", "skin care para acne", { modificadores: "acne", problema_percebido: "Tratar acne" }),
    dna("k11", "skin care acne adulta", { modificadores: "acne adulta", problema_percebido: "Tratar acne" }),
  ];
  const particao = deriveSemanticNuclei({ signatures: comAcne });
  const nucleoAcne = particao.nuclei.find(nucleo => nucleo.anchors.includes("acne"));
  assert.ok(nucleoAcne, "com DNA sustentando acne, ela forma o próprio Article");
  assert.ok(nucleoAcne.keywordIds.includes("k10") && nucleoAcne.keywordIds.includes("k11"));
});

/* ========================= §8 · intenção divergente ====================== */

test("§8 — intenção declarada diferente preserva candidatos distintos", () => {
  const comercial = buildSemanticSignature({
    dna: resolveKeywordDnaSignals({
      keywordId: "k12",
      text: "comprar skin care pele oleosa",
      semanticQualification: { intent: "Transacional", semanticState: "conclusive" },
      semantic: { entidade_central: "skincare", modificadores: "pele oleosa", problema_percebido: "Controlar oleosidade da pele" },
    }),
    siloTokens: SILO_TOKENS,
  });
  const particao = deriveSemanticNuclei({ signatures: [...LOTE, comercial] });
  const doComercial = particao.nuclei.find(nucleo => nucleo.keywordIds.includes("k12"))!;
  assert.equal(doComercial.keywordIds.length, 1, "comprar não é a mesma pergunta que como cuidar");
  assert.ok(particao.separations.some(item => item.reasons.join(" ").includes("intenção declarada diferente")));
});

test("§8 — intenção AUSENTE não separa: ausência não é divergência", () => {
  const semIntencao = buildSemanticSignature({
    dna: resolveKeywordDnaSignals({
      keywordId: "k13",
      text: "skin care pele oleosa caseiro",
      semanticQualification: { intent: "Pendente", semanticState: "conclusive" },
      semantic: { entidade_central: "skincare", modificadores: "pele oleosa" },
    }),
    siloTokens: SILO_TOKENS,
  });
  const particao = deriveSemanticNuclei({ signatures: [...LOTE, semIntencao] });
  assert.ok(particao.nuclei.find(nucleo => nucleo.keywordIds.includes("k13"))!.keywordIds.includes("k3"));
});

/* ============================ §14 · o teto ============================== */

test("§14 — núcleo acima do teto só se divide numa fronteira editorial real", () => {
  const nucleo = {
    nucleusKey: "nucleo:oleosa",
    label: "Controlar oleosidade da pele",
    anchors: ["oleosa"],
    keywordIds: LOTE.map(item => item.keywordId),
    reasons: [],
  };
  // Sem segundo foco declarado que parta o núcleo, ele continua inteiro: o
  // excedente é transbordo visível, não corte silencioso.
  const semFronteira = splitNucleusIfEditorialBoundary({
    nucleus: { ...nucleo, keywordIds: ["k3", "k6", "k7", "k9", "k2", "k4", "k5"] },
    signatures: LOTE,
    ceiling: 6,
  });
  assert.equal(semFronteira.length, 2, "vitamina/noturno/nivea sustentam fronteira própria");

  const pequeno = splitNucleusIfEditorialBoundary({
    nucleus: { ...nucleo, keywordIds: ["k3", "k6", "k7"] },
    signatures: LOTE,
    ceiling: 6,
  });
  assert.equal(pequeno.length, 1, "dentro do teto não se divide nada");
});

test("§5 — a partição é determinística: mesma entrada, mesmos núcleos", () => {
  const assinatura = (lista: readonly KeywordSemanticSignature[]) => deriveSemanticNuclei({ signatures: lista })
    .nuclei.map(nucleo => `${nucleo.nucleusKey}:${nucleo.keywordIds.join(",")}`).sort().join("|");
  assert.equal(assinatura(LOTE), assinatura([...LOTE].reverse()));
});

/* ==================== §9/§10/§11 · a SERP valida a fronteira ============= */

import {
  resolveCandidateBoundaries,
  resolveCandidateSerpBoundary,
  SERP_OVERLAP_HIGH_FLOOR,
  SERP_OVERLAP_LOW_CEILING,
  type CandidateSerpEvidence,
} from "../lib/arquiteto/candidate-serp-boundary.ts";

const evidencia = (
  candidateRef: string,
  urls: string[],
  over: Partial<CandidateSerpEvidence> = {},
): CandidateSerpEvidence => ({
  candidateRef,
  label: candidateRef,
  declaredIntent: "informacional",
  observedIntent: "informacional",
  urls,
  domains: urls.map(url => url.replace(/^https?:\/\//, "").split("/")[0]),
  current: true,
  ...over,
});

const TOPO = [
  "https://a.com/pele-oleosa",
  "https://b.com/skincare-oleosa",
  "https://c.com/rotina",
  "https://d.com/dicas",
  "https://e.com/produtos",
];

test("§11 — topo quase idêntico com a mesma intenção é MERGE", () => {
  const fronteira = resolveCandidateSerpBoundary(
    evidencia("cand-a", TOPO),
    evidencia("cand-b", [...TOPO.slice(0, 3), "https://x.com/outro", "https://y.com/outro"]),
  );
  assert.equal(fronteira.level, "SERP_OVERLAP_HIGH");
  assert.equal(fronteira.verdict, "MERGE");
  assert.ok(fronteira.urlOverlap >= SERP_OVERLAP_HIGH_FLOOR);
  assert.match(fronteira.reasons.join(" "), /mesmo conteúdo para as duas/);
});

test("§11 — topos diferentes confirmam a separação que a formação propôs", () => {
  const fronteira = resolveCandidateSerpBoundary(
    evidencia("cand-a", TOPO),
    evidencia("cand-c", ["https://p.com/vitamina-c", "https://q.com/ativo", "https://r.com/serum", "https://s.com/uso", "https://t.com/guia"]),
  );
  assert.equal(fronteira.level, "SERP_OVERLAP_LOW");
  assert.equal(fronteira.verdict, "KEEP_SEPARATE");
  assert.ok(fronteira.urlOverlap <= SERP_OVERLAP_LOW_CEILING);
});

test("§11 — domínio repetido é sinal FRACO e não funde sozinho", () => {
  // Mesmo site, páginas diferentes: o site responde duas necessidades.
  const fronteira = resolveCandidateSerpBoundary(
    evidencia("cand-a", ["https://a.com/1", "https://a.com/2", "https://b.com/1", "https://c.com/1", "https://d.com/1"]),
    evidencia("cand-b", ["https://a.com/9", "https://a.com/8", "https://b.com/9", "https://c.com/9", "https://d.com/9"]),
  );
  assert.equal(fronteira.sharedUrls, 0);
  assert.equal(fronteira.level, "SERP_OVERLAP_LOW");
  assert.equal(fronteira.verdict, "KEEP_SEPARATE");
  assert.ok(fronteira.domainOverlap > 0, "o domínio é contado, mas à parte");
});

test("§9 — evidência ausente ou defasada não vira veredito", () => {
  const semColeta = resolveCandidateSerpBoundary(evidencia("cand-a", TOPO), evidencia("cand-b", []));
  assert.equal(semColeta.verdict, "REFINE");
  assert.match(semColeta.reasons.join(" "), /sem evidência de SERP vigente/);

  const defasada = resolveCandidateSerpBoundary(
    evidencia("cand-a", TOPO),
    evidencia("cand-b", TOPO, { current: false }),
  );
  assert.equal(defasada.verdict, "REFINE");
});

test("§9 — sobreposição alta com intenções divergentes NÃO funde sozinha", () => {
  const fronteira = resolveCandidateSerpBoundary(
    evidencia("cand-a", TOPO),
    evidencia("cand-b", TOPO, { observedIntent: "transacional" }),
  );
  assert.equal(fronteira.level, "SERP_OVERLAP_HIGH");
  assert.equal(fronteira.verdict, "REFINE", "juntar aqui seria decidir por aritmética");
});

test("§9 — só os pares vizinhos são confrontados, e cada par uma vez", () => {
  const fronteiras = resolveCandidateBoundaries({
    evidence: [evidencia("cand-a", TOPO), evidencia("cand-b", TOPO), evidencia("cand-c", ["https://z.com/1"])],
    pairs: [{ left: "cand-a", right: "cand-b" }, { left: "cand-b", right: "cand-a" }, { left: "cand-a", right: "sumiu" }],
  });
  assert.equal(fronteiras.length, 1);
  assert.equal(fronteiras[0].verdict, "MERGE");
});

/* ============================ §19 · explicabilidade ===================== */

import { readFileSync } from "node:fs";

test("§19 — o candidato mostra o núcleo, o porquê de juntar e o porquê de separar", () => {
  const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
  assert.match(workspace, /data-testid="architect-candidate-nucleus"/);
  assert.match(workspace, /Núcleo do Article/);
  assert.match(workspace, /Por que estas buscas estão juntas/);
  assert.match(workspace, /Por que estão separadas de outro candidato/);
  // A explicação vem do MESMO cálculo que formou o candidato.
  assert.match(workspace, /articleFormation\.nucleusByKeywordId\.get/);
  assert.match(workspace, /articleFormation\.separationByKeywordId\.get/);
  assert.match(workspace, /const articleFormationUniverses = articleFormation\.universes;/);
});

test("§1 — a formação consome o DNA canônico antes de compor", () => {
  const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
  const trecho = workspace.slice(workspace.indexOf("const articleFormation = useMemo"));
  const corpo = trecho.slice(0, trecho.indexOf("\n  }, ["));
  // KeywordDNA → assinatura → núcleos → candidatos, nesta ordem.
  const ordem = ["dnaSignalsByKeyword.get", "buildSemanticSignature", "deriveSemanticNuclei", "buildArticleFormationUniverse"]
    .map(marca => corpo.indexOf(marca));
  assert.ok(ordem.every(posicao => posicao >= 0), "a cadeia da formação não está completa");
  assert.deepEqual([...ordem].sort((a, b) => a - b), ordem, "a ordem do contrato não foi respeitada");
  // Patrimônio publicado não é reagrupado por afinidade semântica.
  assert.match(corpo, /const publicadas = universoKeywords\.filter\(keyword => keyword\.isPublished\)/);
});

test("§10 — a fronteira usa a evidência JÁ persistida, sem chamar provider", () => {
  const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
  const trecho = workspace.slice(workspace.indexOf("const candidateGuards"));
  const corpo = trecho.slice(0, trecho.indexOf("\n  }, ["));
  // Os resultados vêm dos snapshots gravados por candidato.
  assert.match(corpo, /remoteArticleSerp\.find\(item => item\.candidateRef === ref\)/);
  assert.match(corpo, /snapshot\.organicResults/);
  assert.match(corpo, /resolveCandidateBoundaries\(\{/);
  // Só os pares vizinhos que a formação marcou.
  assert.match(corpo, /pairs: pares\.map\(par => \(\{ left: par\.left, right: par\.right \}\)\)/);
  // Nenhum provider é acionado aqui.
  assert.doesNotMatch(corpo, /fetch\(|runSerp|collectSerp/);
  assert.match(workspace, /data-testid="architect-candidate-serp-boundary"/);
});
