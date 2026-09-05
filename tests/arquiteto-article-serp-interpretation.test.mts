import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildArticleFormationSerpRow,
  parseArticleFormationSerpRow,
  ARTICLE_FORMATION_SERP_SUBJECT_TYPE,
} from "../lib/arquiteto/article-serp-record.ts";
import {
  COMPETITIVE_VIABILITY_TEXT,
  dominantTypeOf,
  interpretArticleSerp,
  observedIntentOf,
  pairwiseOverlap,
  resolveCompetitiveViability,
  resolveGroupVerdict,
  resolvePrincipalVerdict,
  type KeywordSerpFacts,
  type SerpResultFact,
} from "../lib/arquiteto/article-serp-interpretation.ts";

const resultado = (
  position: number,
  domain: string,
  path: string,
  title: string,
  inferredType = "article",
  snippet = "",
): SerpResultFact => ({
  position, title, url: `https://${domain}${path}`, domain, snippet, inferredType,
});

const busca = (
  keywordId: string,
  keyword: string,
  results: SerpResultFact[],
  role: KeywordSerpFacts["role"] = "secundaria",
): KeywordSerpFacts => ({ keywordId, keyword, role, results });

/* ------------ §4 a intenção vem da SERP, não do que o Minerador disse ---- */

test("a intenção observada é inferida dos resultados", () => {
  const comercial = [
    resultado(1, "a.com", "/melhores-cremes", "Os 10 melhores cremes", "list"),
    resultado(2, "b.com", "/review", "Review: vale a pena?", "comparison"),
  ];
  assert.equal(observedIntentOf(comercial), "comercial");

  const transacional = [
    resultado(1, "loja.com", "/comprar", "Comprar creme com desconto", "product", "preço e frete grátis"),
    resultado(2, "loja2.com", "/oferta", "Oferta: cupom de desconto", "product", "comprar agora"),
  ];
  assert.equal(observedIntentOf(transacional), "transacional");

  const informacional = [
    resultado(1, "blog.com", "/como-usar", "Como usar retinol: guia", "article"),
    resultado(2, "blog2.com", "/o-que-e", "O que é niacinamida", "article"),
  ];
  assert.equal(observedIntentOf(informacional), "informacional");
});

test("SERP vazia é indefinida, não uma intenção qualquer", () => {
  assert.equal(observedIntentOf([]), "indefinido");
  assert.equal(dominantTypeOf([]), "desconhecido");
});

test("empate real é misto, não o primeiro da lista", () => {
  const dividida = [
    resultado(1, "loja.com", "/comprar", "Comprar agora", "product", "preço"),
    resultado(2, "blog.com", "/guia", "Guia: como escolher", "article"),
  ];
  assert.equal(observedIntentOf(dividida), "misto");
});

test("o interpretador não consulta a intenção declarada pelo Minerador", () => {
  const source = readFileSync("lib/arquiteto/article-serp-interpretation.ts", "utf8");
  // O comentário cita o Minerador de propósito — é a regra que ele explica.
  // A asserção olha o CÓDIGO: nenhum caminho lê a intenção declarada.
  const codigo = source
    .split("\n")
    .filter(line => {
      const trimmed = line.trimStart();
      return !trimmed.startsWith("*") && !trimmed.startsWith("//") && !trimmed.startsWith("/*");
    })
    .join("\n");
  assert.doesNotMatch(codigo, /declaredIntent|upstreamIntent|minerador|expectedIntent/i);
  assert.match(source, /a intenção observada é inferida DA SERP/i);
});

/* -------------------- §5 compatibilidade par a par ----------------------- */

test("URL repetida é convergência forte; domínio repetido é sinal fraco", () => {
  const esquerda = busca("k1", "creme oleosa", [
    resultado(1, "a.com", "/x", "A"), resultado(2, "b.com", "/y", "B"), resultado(3, "c.com", "/z", "C"),
  ]);
  const mesmaPagina = busca("k2", "cremes oleosa", [
    resultado(1, "a.com", "/x", "A"), resultado(2, "b.com", "/y", "B"), resultado(3, "c.com", "/z", "C"),
  ]);
  assert.equal(pairwiseOverlap(esquerda, mesmaPagina).level, "forte");

  const mesmoSiteOutraPagina = busca("k3", "outra coisa", [
    resultado(1, "a.com", "/completamente-outro", "Outro"),
  ]);
  const fraca = pairwiseOverlap(esquerda, mesmoSiteOutraPagina);
  assert.equal(fraca.sharedUrls, 0);
  assert.equal(fraca.level, "baixa");
});

test("SERPs sem nada em comum não convergem", () => {
  const a = busca("k1", "skin care", [resultado(1, "a.com", "/x", "A")]);
  const b = busca("k2", "outra busca", [resultado(1, "z.com", "/w", "Z")]);
  assert.equal(pairwiseOverlap(a, b).level, "nenhuma");
});

/* ---------------------- §6 veredito da Principal ------------------------- */

const GRUPO_CONVERGENTE = [
  busca("p", "skin care para peles oleosas", [
    resultado(1, "a.com", "/1", "A"), resultado(2, "b.com", "/2", "B"), resultado(3, "c.com", "/3", "C"),
  ], "principal"),
  busca("s1", "skin care pele oleosa", [
    resultado(1, "a.com", "/1", "A"), resultado(2, "b.com", "/2", "B"), resultado(3, "c.com", "/3", "C"),
  ]),
];

test("a Principal que alcança o grupo é sustentada", () => {
  const overlaps = [pairwiseOverlap(GRUPO_CONVERGENTE[0], GRUPO_CONVERGENTE[1])];
  const verdict = resolvePrincipalVerdict({ members: GRUPO_CONVERGENTE, principalKeywordId: "p", overlaps });
  assert.equal(verdict.kind, "PRINCIPAL_SUPPORTED");
  assert.equal(verdict.principalAlternativeKeywordId, null);
});

test("alternativa melhor é apontada, nunca aplicada", () => {
  const membros = [
    busca("p", "busca isolada", [resultado(1, "so-eu.com", "/x", "X")], "principal"),
    busca("s1", "cabeceira real", [
      resultado(1, "a.com", "/1", "A"), resultado(2, "b.com", "/2", "B"), resultado(3, "c.com", "/3", "C"),
    ]),
    busca("s2", "apoio", [
      resultado(1, "a.com", "/1", "A"), resultado(2, "b.com", "/2", "B"), resultado(3, "c.com", "/3", "C"),
    ]),
  ];
  const overlaps = [
    pairwiseOverlap(membros[0], membros[1]),
    pairwiseOverlap(membros[0], membros[2]),
    pairwiseOverlap(membros[1], membros[2]),
  ];
  const verdict = resolvePrincipalVerdict({ members: membros, principalKeywordId: "p", overlaps });
  assert.equal(verdict.kind, "PRINCIPAL_ALTERNATIVE_BETTER");
  assert.equal(verdict.principalAlternativeKeywordId, "s1");
  assert.match(verdict.reason, /cabeceira real/);
  // A SERP aponta e explica; ela não troca.
  const source = readFileSync("lib/arquiteto/article-serp-interpretation.ts", "utf8");
  assert.match(source, /A SERP nunca troca\. Ela aponta e explica\./);
});

test("sem sobreposição nenhuma a Principal fica inconclusiva", () => {
  const membros = [
    busca("p", "a", [resultado(1, "x.com", "/1", "X")], "principal"),
    busca("s1", "b", [resultado(1, "y.com", "/2", "Y")]),
  ];
  const overlaps = [pairwiseOverlap(membros[0], membros[1])];
  assert.equal(resolvePrincipalVerdict({ members: membros, principalKeywordId: "p", overlaps }).kind, "PRINCIPAL_INCONCLUSIVE");
});

/* ------------------------- §7 veredito do grupo -------------------------- */

test("grupo convergente é sustentado", () => {
  const overlaps = [pairwiseOverlap(GRUPO_CONVERGENTE[0], GRUPO_CONVERGENTE[1])];
  const verdict = resolveGroupVerdict({ members: GRUPO_CONVERGENTE, principalKeywordId: "p", overlaps });
  assert.equal(verdict.kind, "SUPPORTED");
  assert.deepEqual(verdict.outsiders, []);
});

test("uma busca de fora vira recomendação de remover; duas, de separar", () => {
  const base = [
    busca("p", "skin care principia", [
      resultado(1, "a.com", "/1", "A"), resultado(2, "b.com", "/2", "B"), resultado(3, "c.com", "/3", "C"),
    ], "principal"),
    busca("s1", "skin care principia resenha", [
      resultado(1, "a.com", "/1", "A"), resultado(2, "b.com", "/2", "B"), resultado(3, "c.com", "/3", "C"),
    ]),
    busca("s2", "skin care barato", [
      resultado(1, "loja.com", "/comprar", "Comprar barato", "product", "preço e desconto"),
    ]),
  ];
  const overlaps = [
    pairwiseOverlap(base[0], base[1]), pairwiseOverlap(base[0], base[2]), pairwiseOverlap(base[1], base[2]),
  ];
  const um = resolveGroupVerdict({ members: base, principalKeywordId: "p", overlaps });
  assert.equal(um.kind, "REMOVE_KEYWORD_RECOMMENDED");
  assert.equal(um.outsiders.length, 1);
  assert.equal(um.outsiders[0].keyword, "skin care barato");
  assert.match(um.outsiders[0].reason, /não se repetem com os da Principal/);

  const comDois = [...base, busca("s3", "skin care cupom", [
    resultado(1, "cupons.com", "/x", "Cupom de desconto", "product", "comprar com cupom"),
  ])];
  const overlapsDois = [];
  for (let i = 0; i < comDois.length; i += 1) {
    for (let j = i + 1; j < comDois.length; j += 1) overlapsDois.push(pairwiseOverlap(comDois[i], comDois[j]));
  }
  assert.equal(resolveGroupVerdict({ members: comDois, principalKeywordId: "p", overlaps: overlapsDois }).kind, "SPLIT_RECOMMENDED");
});

test("Principal sustentada e grupo a dividir são perguntas diferentes", () => {
  const membros = [
    busca("p", "skin care principia", [
      resultado(1, "a.com", "/1", "A"), resultado(2, "b.com", "/2", "B"), resultado(3, "c.com", "/3", "C"),
    ], "principal"),
    busca("s1", "skin care principia resenha", [
      resultado(1, "a.com", "/1", "A"), resultado(2, "b.com", "/2", "B"), resultado(3, "c.com", "/3", "C"),
    ]),
    busca("s2", "comprar skin care barato", [
      resultado(1, "loja.com", "/c", "Comprar", "product", "preço desconto oferta"),
    ]),
    busca("s3", "cupom skin care", [
      resultado(1, "cupom.com", "/d", "Cupom", "product", "comprar desconto"),
    ]),
  ];
  const parecer = interpretArticleSerp({ candidateRef: "cand", members: membros, principalKeywordId: "p" });
  assert.equal(parecer.principal.kind, "PRINCIPAL_SUPPORTED");
  assert.equal(parecer.group.kind, "SPLIT_RECOMMENDED");
  assert.equal(parecer.verdict, "DIVERGENCE");
  assert.match(parecer.recommendation, /Separar/);
});

/* ------------------- §8 viabilidade sem promessa de ROI ------------------ */

test("a viabilidade descreve o observado e nunca promete resultado", () => {
  // O comentário cita as promessas proibidas de propósito — é a regra. A
  // asserção olha o texto que a tela pode mostrar.
  const source = readFileSync("lib/arquiteto/article-serp-interpretation.ts", "utf8");
  const frases = Object.values(COMPETITIVE_VIABILITY_TEXT).join(" ");
  assert.doesNotMatch(frases, /vai render|garante|ROI|tráfego|posição|rankear/i);

  const fragmentado = resolveCompetitiveViability({
    group: { kind: "SPLIT_RECOMMENDED", outsiders: [], converging: 0, total: 2, reason: "" },
    distinctDomains: 3, totalResults: 6,
  });
  assert.equal(fragmentado.level, "fragmentado");
  assert.match(fragmentado.text, /divide essas buscas em necessidades diferentes/);

  const competitivo = resolveCompetitiveViability({
    group: { kind: "SUPPORTED", outsiders: [], converging: 2, total: 2, reason: "" },
    distinctDomains: 12, totalResults: 30,
  });
  assert.equal(competitivo.level, "competitivo");
});

/* --------------------- §1/§2 identidade canônica remota ------------------ */

/** Snapshot mínimo VÁLIDO: a leitura remota revalida o parecer inteiro. */
const snapshotFalso = {
  id: "serp:cand:k1:1", brandId: "brand", articleId: "article-candidate:territory:t1:k1",
  articleDnaVersionId: "work:cand", keywordId: "k1", keywordDnaVersionId: "kdna:1",
  query: "skin care", country: "BR", language: "pt-br", location: "Brasil", device: "desktop" as const,
  resultLimit: 10, provider: "dataforseo", providerEndpoint: "/search" as const, origin: "real" as const,
  isMock: false, collectedAt: new Date().toISOString(), version: 1, previousSnapshotId: null,
  contentHash: "b".repeat(64), persistenceMode: "remote_canonical", resolutionMode: "remote_canonical" as const,
  canonicalRemoteVerified: true, status: "needs_review" as const,
  organicResults: [], peopleAlsoAsk: [], relatedSearches: [], knowledgeGraph: null,
  diagnostic: {
    dominantIntent: null, secondaryIntents: [], confidence: "media", dominantFormats: [],
    resultTypeCounts: {}, pageTypes: [], recurringTitlePatterns: [], recurringSnippetPatterns: [],
    frequentEntities: [], frequentDomains: [], localSignals: [], questions: [], relatedSearches: [],
    possibleConflicts: [], limitations: [],
  },
};

const assessmentFalso = {
  schemaVersion: 1 as const,
  id: "serp-formation:brand:cand:v1",
  brandId: "brand",
  articleId: "article-candidate:territory:t1:k1",
  articleDnaVersionId: "work:article-candidate:territory:t1:k1",
  version: 1,
  previousVersionId: null,
  contentHash: `sha256:${"a".repeat(64)}`,
  createdAt: new Date().toISOString(),
  createdBy: "actor",
  mode: "keyword_individual" as const,
  assessmentMode: "formacao" as const,
  validationProfile: "standard" as const,
  queryCount: 1,
  keywordDnaReferences: [] as never[],
  snapshots: [] as never[],
  intentCompatibility: "coerente" as const,
  competitionLevel: "media" as const,
  dominantResultTypes: ["article"],
  recommendations: [] as never[],
  conflicts: [] as string[],
  notes: [] as string[],
  evaluationStatus: "active" as const,
  outdatedReason: null,
};

test("a evidência é do candidato e não pertence a nenhum ArticleDNA", () => {
  const source = readFileSync("lib/arquiteto/article-serp-record.ts", "utf8");
  assert.match(source, /articleId: null/);
  assert.match(source, /subjectId: input\.candidateRef/);
  assert.equal(ARTICLE_FORMATION_SERP_SUBJECT_TYPE, "article_formation_serp_assessment");
  // Cabe no CHECK de 80 caracteres da coluna: nenhuma migration necessária.
  assert.ok(ARTICLE_FORMATION_SERP_SUBJECT_TYPE.length <= 80);
});

test("a linha remota é recusada quando não concorda consigo mesma", () => {
  const row = buildArticleFormationSerpRow({
    candidateRef: "article-candidate:territory:t1:k1",
    territoryRef: "territory:t1",
    formationBaseHash: "serpbase:aaa",
    verdict: "DIVERGENCE",
    assessment: { ...assessmentFalso, snapshots: [snapshotFalso] as never },
    operationRequestId: "op-1",
  });
  assert.equal(row.state, "divergent");
  assert.equal(row.articleId, null);

  const ok = parseArticleFormationSerpRow(row);
  assert.equal(ok.ok, true);

  // Estado que não corresponde ao veredito deixaria a listagem remota mentindo.
  const mentiroso = parseArticleFormationSerpRow({ ...row, state: "supported" });
  assert.equal(mentiroso.ok, false);
  assert.ok(mentiroso.issues.includes("STATE_DOES_NOT_MATCH_VERDICT"));

  // `article_id` presente significa que alguém fabricou um Article para caber.
  const comArticle = parseArticleFormationSerpRow({ ...row, articleId: "article:1" });
  assert.equal(comArticle.ok, false);
  assert.ok(comArticle.issues.includes("ARTICLE_ID_PRESENT"));
});

test("resolução humana de outra composição é recusada na leitura", () => {
  const row = buildArticleFormationSerpRow({
    candidateRef: "cand",
    territoryRef: "territory:t1",
    formationBaseHash: "serpbase:aaa",
    verdict: "INCONCLUSIVE",
    assessment: { ...assessmentFalso, snapshots: [snapshotFalso] as never },
    operationRequestId: "op-1",
    humanResolution: {
      decision: "accept_current_composition",
      reason: "assumo o risco desta composição",
      source: "human",
      decidedAt: new Date().toISOString(),
      decidedBy: "actor",
      assessmentId: assessmentFalso.id,
      formationBaseHash: "serpbase:OUTRA",
    },
  });
  const lido = parseArticleFormationSerpRow(row);
  assert.equal(lido.ok, false);
  assert.ok(lido.issues.includes("RESOLUTION_BASE_MISMATCH"));
});

test("não existe decisão genérica de ignorar a SERP", () => {
  const source = readFileSync("lib/arquiteto/article-serp-record.ts", "utf8");
  assert.doesNotMatch(source, /"ignore_serp"|"skip_serp"|"dismiss"/);
  assert.match(source, /Não existe "ignorar a SERP"/);
  for (const decisao of ["accept_current_composition", "change_composition", "change_principal", "split", "merge"]) {
    assert.ok(source.includes(`"${decisao}"`), `falta a decisão ${decisao}`);
  }
});

/* ----------------------------- pureza ------------------------------------ */

test("interpretação e registro são domínio puro", () => {
  for (const arquivo of ["lib/arquiteto/article-serp-interpretation.ts", "lib/arquiteto/article-serp-record.ts"]) {
    const source = readFileSync(arquivo, "utf8")
      .split("\n")
      .filter(line => {
        const trimmed = line.trimStart();
        return !trimmed.startsWith("*") && !trimmed.startsWith("//") && !trimmed.startsWith("/*");
      })
      .join("\n");
    assert.doesNotMatch(source, /fetch\(|supabase|dataforseo|callStrategicApi/i, `${arquivo} precisa ser puro`);
  }
});

/* ------------------- §1/§3 remoto é autoridade, não o browser ------------ */

const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
const review = readFileSync("modules/arquiteto/article-formation-review.tsx", "utf8");

test("o gate lê o remoto, não o cache do navegador", () => {
  assert.match(workspace, /const remotoPorCandidato = new Map\(remoteArticleSerp\.map/);
  // O IndexedDB continua como cache de interface; ele não decide mais nada.
  const trecho = workspace.slice(workspace.indexOf("const articleSerpGates = useMemo"));
  const corpo = trecho.slice(0, trecho.indexOf("\n  }, ["));
  assert.doesNotMatch(corpo, /serpAssessments/);
  assert.match(workspace, /setRemoteArticleSerp\(canonical\.articleFormationSerp\)/);
});

test("a rota grava e relê antes de responder", () => {
  const route = readFileSync("app/api/arquiteto/serp/route.ts", "utf8");
  const escrita = route.indexOf("saveArticleFormationSerpAssessment");
  const leitura = route.indexOf("readbackArticleFormationSerpAssessment(pipelineContext");
  assert.ok(escrita > -1 && leitura > -1);
  assert.ok(escrita < leitura, "o readback vem depois da escrita");
  assert.match(route, /não devolveu a composição gravada/);
  // A interpretação nasce dos resultados observados, na própria rota.
  assert.match(route, /interpretArticleSerp\(\{/);
});

test("a hidratação do workspace devolve a evidência remota", () => {
  const route = readFileSync("app/api/arquiteto/workspace/route.ts", "utf8");
  assert.match(route, /listArticleFormationSerpAssessments\(context\)/);
  assert.match(route, /articleFormationSerp,/);
  const canonical = readFileSync("lib/arquiteto/canonical-workspace.ts", "utf8");
  assert.match(canonical, /articleFormationSerp: z\.array\(RemoteArticleFormationSerpSchema\)/);
});

test("o painel mostra as duas perguntas e o mercado observado", () => {
  assert.match(review, /data-testid="architect-review-serp-parecer"/);
  for (const secao of ["Parecer da SERP", "Principal", "Grupo", "Mercado observado", "Recomendação"]) {
    assert.ok(review.includes(secao), `falta a seção ${secao}`);
  }
  assert.match(review, /data-testid="architect-review-serp-outsiders"/);
  assert.match(review, /data-testid="architect-review-serp-recommendation"/);
});
