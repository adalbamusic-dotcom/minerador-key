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
  NOT_OBSERVED_REASON,
  aggregatePairAcrossLenses,
  formationLensesMarkerOf,
  interpretArticleSerpAcrossLenses,
  articleSerpParecerFromAssessment,
  dominantTypeOf,
  interpretArticleSerp,
  observedIntentOf,
  pairwiseOverlap,
  resolveCompetitiveViability,
  resolveGroupVerdict,
  resolvePrincipalVerdict,
  splitArticleSerpMembers,
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

/* ------ A1 · KGR leve: secundária não consultada é "não observada" ------- */

/*
 * No perfil KGR leve com Principal clara, só a Principal é consultada. A rota
 * montava o parecer com TODAS as keywords do grupo, e a secundária sem
 * snapshot entrava com `results: []`: sobreposição `nenhuma`, intenção
 * `indefinido` — e a busca virava "de fora". Confirmado offline em
 * 2026-09-23: DIVERGENCE / SPLIT_RECOMMENDED por ausência de dado.
 */

const principalClara = [
  resultado(1, "a.com", "/skincare", "Skincare facial: guia completo", "article"),
  resultado(2, "b.com", "/rotina", "Como montar a rotina de skincare", "article"),
  resultado(3, "c.com", "/passo", "Passo a passo do skincare", "article"),
  resultado(4, "d.com", "/dicas", "Dicas de skincare facial", "article"),
  resultado(5, "e.com", "/guia", "Guia de cuidados com a pele", "article"),
  resultado(6, "f.com", "/o-que-e", "O que é skincare", "article"),
  resultado(7, "g.com", "/tutorial", "Tutorial de skincare", "article"),
  resultado(8, "h.com", "/como", "Como cuidar da pele do rosto", "article"),
];

const snapshotDe = (keywordId: string, results: SerpResultFact[]) => ({ keywordId, organicResults: results.map(item => ({ ...item, manualType: null })) });

const composicaoKgrLeve = [
  { keywordId: "p", keyword: "skincare facial", role: "principal" as const },
  { keywordId: "s1", keyword: "skincare facial rotina", role: "secundaria" as const },
];

test("A1 · o defeito, fixado: membro vazio vira 'de fora' e o parecer recomenda dividir", () => {
  // A construção ANTIGA da rota, preservada aqui só como prova do defeito.
  const antigo = interpretArticleSerp({
    candidateRef: "cand",
    members: [busca("p", "skincare facial", principalClara, "principal"), busca("s1", "skincare facial rotina", [])],
    principalKeywordId: "p",
  });
  assert.equal(antigo.verdict, "DIVERGENCE");
  assert.equal(antigo.group.kind, "SPLIT_RECOMMENDED");
  assert.equal(antigo.group.outsiders.length, 1);
});

test("A1 · secundária sem snapshot é NÃO OBSERVADA: fora de total e de outsiders, nunca DIVERGENCE", () => {
  const { members, notObserved } = splitArticleSerpMembers({
    keywords: composicaoKgrLeve,
    snapshots: [snapshotDe("p", principalClara)],
  });
  assert.deepEqual(members.map(item => item.keywordId), ["p"]);
  assert.deepEqual(notObserved, [{ keywordId: "s1", keyword: "skincare facial rotina", role: "secundaria", reason: NOT_OBSERVED_REASON }]);

  const parecer = interpretArticleSerp({ candidateRef: "cand", members, notObserved, principalKeywordId: "p" });
  assert.notEqual(parecer.verdict, "DIVERGENCE");
  assert.equal(parecer.verdict, "INCONCLUSIVE");
  assert.equal(parecer.group.kind, "INCONCLUSIVE");
  assert.notEqual(parecer.group.kind, "SPLIT_RECOMMENDED");
  assert.deepEqual(parecer.group.outsiders, []);
  assert.equal(parecer.group.total, 0);
  // Cai no caso de "uma busca só" (a SDD do artigo de uma keyword decide o veredito próprio).
  assert.equal(parecer.principal.kind, "PRINCIPAL_SUPPORTED");
  assert.equal(parecer.principal.principalAlternativeKeywordId, null);
  // A tela diz POR QUE o grupo tem 0 de 0, com o nome da busca não observada.
  assert.match(parecer.group.reason, /Só a Principal foi observada nesta validação/);
  assert.match(parecer.group.reason, /"skincare facial rotina"/);
  assert.match(parecer.principal.reason, /Só a Principal foi consultada nesta validação/);
  assert.doesNotMatch(parecer.recommendation, /Separar/);
  assert.deepEqual(parecer.notObserved.map(item => item.keywordId), ["s1"]);
  // O mercado observado continua o da Principal.
  assert.equal(parecer.observedIntent, observedIntentOf(principalClara));
});

test("A1 · secundária CONSULTADA e de fato distinta continua sendo 'de fora'", () => {
  const distinta = [
    resultado(1, "loja.com", "/comprar", "Comprar kit skincare com desconto", "product", "preço e frete"),
    resultado(2, "loja2.com", "/oferta", "Oferta kit skincare", "product", "cupom de desconto"),
  ];
  const { members, notObserved } = splitArticleSerpMembers({
    keywords: composicaoKgrLeve,
    snapshots: [snapshotDe("p", principalClara), snapshotDe("s1", distinta)],
  });
  assert.equal(notObserved.length, 0);
  const parecer = interpretArticleSerp({ candidateRef: "cand", members, notObserved, principalKeywordId: "p" });
  assert.equal(parecer.verdict, "DIVERGENCE");
  assert.deepEqual(parecer.group.outsiders.map(item => item.keywordId), ["s1"]);
  assert.deepEqual(parecer.notObserved, []);
  // Com todas observadas, a explicação é a de antes: nada sobre busca sem SERP.
  assert.doesNotMatch(parecer.group.reason, /sem SERP/);
});

test("A1 · snapshot presente e vazio continua membro: foi consultada e voltou vazia", () => {
  const { members, notObserved } = splitArticleSerpMembers({
    keywords: composicaoKgrLeve,
    snapshots: [snapshotDe("p", principalClara), snapshotDe("s1", [])],
  });
  assert.deepEqual(members.map(item => item.keywordId), ["p", "s1"]);
  assert.deepEqual(notObserved, []);
});

test("A1 · a leitura de resultado é a mesma da rota: tipo manual vence o inferido", () => {
  const { members } = splitArticleSerpMembers({
    keywords: [composicaoKgrLeve[0]],
    snapshots: [{ keywordId: "p", organicResults: [{ position: 3, title: "T", url: "https://a.com/x", domain: "a.com", snippet: "S", inferredType: "article", manualType: "product" }] }],
  });
  assert.deepEqual(members[0].results, [{ position: 3, title: "T", url: "https://a.com/x", domain: "a.com", snippet: "S", inferredType: "product" }]);
});

test("A1 · grupo parcialmente observado: a conta é só das observadas, e a explicação diz quem ficou de fora", () => {
  const convergente = principalClara.slice(0, 4);
  const { members, notObserved } = splitArticleSerpMembers({
    keywords: [...composicaoKgrLeve, { keywordId: "r1", keyword: "skincare facial barato", role: "reforco" as const }],
    snapshots: [snapshotDe("p", principalClara), snapshotDe("s1", convergente)],
  });
  const parecer = interpretArticleSerp({ candidateRef: "cand", members, notObserved, principalKeywordId: "p" });
  assert.equal(parecer.group.kind, "SUPPORTED");
  assert.equal(parecer.group.total, 1);
  assert.equal(parecer.group.converging, 1);
  assert.match(parecer.group.reason, /1 busca\(s\) do grupo sem SERP nesta validação \("skincare facial barato"\) não entram na conta\./);
});

test("A1 · sem a SERP da Principal, nada converge nem é de fora", () => {
  const { members, notObserved } = splitArticleSerpMembers({
    keywords: composicaoKgrLeve,
    snapshots: [snapshotDe("s1", principalClara)],
  });
  const parecer = interpretArticleSerp({ candidateRef: "cand", members, notObserved, principalKeywordId: "p" });
  assert.equal(parecer.verdict, "INCONCLUSIVE");
  assert.equal(parecer.principal.kind, "PRINCIPAL_INCONCLUSIVE");
  assert.match(parecer.principal.reason, /A Principal não tem SERP observada nesta validação/);
  assert.equal(parecer.group.kind, "INCONCLUSIVE");
  assert.deepEqual(parecer.group.outsiders, []);
  assert.match(parecer.group.reason, /Sem a SERP da Principal/);
});

test("A1 · registro legado reconstruído segue a mesma regra", () => {
  const registro = { candidateRef: "cand", assessment: { snapshots: [snapshotDe("p", principalClara)] } };
  const candidato = { principalKeywordId: "p", keywords: [{ keywordId: "p", role: "principal" }, { keywordId: "s1", role: "secundaria" }] };
  const rotulos = new Map(composicaoKgrLeve.map(item => [item.keywordId, item.keyword]));
  const parecer = articleSerpParecerFromAssessment(registro, candidato, id => rotulos.get(id) || id);
  assert.ok(parecer);
  assert.equal(parecer.groupVerdict, "INCONCLUSIVE");
  assert.deepEqual(parecer.outsiders, []);
  assert.equal(parecer.total, 0);
  assert.deepEqual(parecer.notObserved, [{ keywordId: "s1", keyword: "skincare facial rotina", reason: NOT_OBSERVED_REASON }]);

  // A mesa também passa só os ids da composição aprovada: a reconstrução não pode lançar.
  const soIds = articleSerpParecerFromAssessment(registro, { principalKeywordId: "p", keywordIds: ["p", "s1"] });
  assert.ok(soIds);
  assert.equal(soIds.groupVerdict, "INCONCLUSIVE");
  assert.deepEqual(soIds.notObserved?.map(item => item.keywordId), ["s1"]);

  // Todas observadas: o objeto é o de antes, sem a chave nova.
  const completo = articleSerpParecerFromAssessment(
    { candidateRef: "cand", assessment: { snapshots: [snapshotDe("p", principalClara), snapshotDe("s1", principalClara.slice(0, 4))] } },
    candidato,
  );
  assert.ok(completo);
  assert.equal("notObserved" in completo, false);
});

test("A1 · a rota monta os membros pelos snapshots, não pelo grupo inteiro", () => {
  const route = readFileSync("app/api/arquiteto/serp/route.ts", "utf8")
    .split("\n")
    .filter(line => {
      const trimmed = line.trimStart();
      return !trimmed.startsWith("*") && !trimmed.startsWith("//") && !trimmed.startsWith("/*");
    })
    .join("\n");
  assert.match(route, /const \{ members, notObserved \} = splitArticleSerpMembers\(\{/);
  assert.match(route, /snapshots: assessment\.snapshots,/);
  assert.match(route, /interpretArticleSerp\(\{\s*candidateRef: assessment\.articleId,\s*members,\s*notObserved,/);
  // O membro vazio da construção antiga não volta.
  assert.doesNotMatch(route, /\?\.organicResults \|\| \[\]\)/);
  assert.match(route, /\.\.\.\(interpretation\.notObserved\.length \? \{ notObserved: notObservedRecordOf\(interpretation\.notObserved\) \} : \{\}\)/);
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

test("A1 · o registro guarda as buscas não observadas, e o registro antigo continua legível", () => {
  const interpretacao = {
    principalVerdict: "PRINCIPAL_SUPPORTED", principalAlternativeKeywordId: null,
    principalReason: "Só a Principal foi consultada.", groupVerdict: "INCONCLUSIVE", groupReason: "Só a Principal foi observada.",
    outsiders: [], observedIntent: "informacional", dominantType: "article", viability: "inconclusivo",
    viabilityText: "Os resultados variam demais.", distinctDomains: 8, converging: 0, total: 0,
    recommendation: "Decidir explicitamente.",
  };
  const base = {
    candidateRef: "cand", territoryRef: "territory:t1", formationBaseHash: "serpbase:aaa", verdict: "INCONCLUSIVE" as const,
    assessment: { ...assessmentFalso, snapshots: [snapshotFalso] as never }, operationRequestId: "op-1",
  };

  const comNaoObservada = buildArticleFormationSerpRow({
    ...base,
    interpretation: { ...interpretacao, notObserved: [{ keywordId: "s1", keyword: "skincare facial rotina", reason: NOT_OBSERVED_REASON }] },
  });
  const lido = parseArticleFormationSerpRow(comNaoObservada);
  assert.equal(lido.ok, true);
  assert.deepEqual(lido.payload?.interpretation?.notObserved, [{ keywordId: "s1", keyword: "skincare facial rotina", reason: NOT_OBSERVED_REASON }]);

  // Registro gravado antes do campo: continua válido e sem a chave.
  const antigo = parseArticleFormationSerpRow(buildArticleFormationSerpRow({ ...base, interpretation: interpretacao }));
  assert.equal(antigo.ok, true);
  assert.equal(antigo.payload?.interpretation && "notObserved" in antigo.payload.interpretation, false);
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

/* ========== A3 · formação nas quatro lentes: o voto de cada par ========== */

/*
 * Adendo `docs/04-arquiteto/propostas/adendo-quatro-lentes-arquiteto-2026-09-23.md`,
 * A3 item 5. Um par converge com sobreposição forte ou parcial em PELO MENOS
 * DUAS lentes; é "de fora" só sem sobreposição em TODAS as lentes observadas e
 * com intenção diferente na MAIORIA delas. Com uma lente, o parecer de hoje.
 */

const informativos = (prefixo: string, n = 5) => Array.from({ length: n }, (_, i) =>
  resultado(i + 1, `${prefixo}${i}.com`, `/guia-${i}`, `Guia: como cuidar da pele ${i}`, "article"));
const transacionais = (prefixo: string, n = 5) => Array.from({ length: n }, (_, i) =>
  resultado(i + 1, `${prefixo}${i}.com`, `/comprar-${i}`, `Comprar kit ${i} com desconto`, "product", "preço e frete"));
const comuns = informativos("comum");
const P = (results = comuns) => busca("p", "skincare facial", results, "principal");
const S_JUNTO = () => busca("s", "rotina skincare", comuns.slice(0, 4));
const S_OUTRO_MESMA_INTENCAO = () => busca("s", "rotina skincare", informativos("outro"));
const S_TRANSACIONAL = () => busca("s", "rotina skincare", transacionais("loja"));
const lente = (lens: string, members: KeywordSerpFacts[]) => ({ lens, members });
const EXTRAS = ["desktop-macos", "mobile-android", "mobile-ios"] as const;

test("A3 · uma lente só dá EXATAMENTE o parecer de hoje", () => {
  for (const membros of [[P(), S_JUNTO()], [P(), S_TRANSACIONAL()], [P(), S_OUTRO_MESMA_INTENCAO()], [P()]]) {
    const hoje = interpretArticleSerp({ candidateRef: "c", members: membros, principalKeywordId: "p" });
    const quatro = interpretArticleSerpAcrossLenses({ candidateRef: "c", primary: lente("desktop-windows", membros), extras: [], principalKeywordId: "p" });
    for (const campo of ["verdict", "principal", "group", "overlaps", "viability", "observedIntent", "dominantType", "recommendation", "reason"] as const) {
      assert.deepEqual(quatro[campo], hoje[campo], campo);
    }
    // Extras sem o par (só a Principal observada nelas) também não mudam nada.
    const semPar = interpretArticleSerpAcrossLenses({ candidateRef: "c", primary: lente("desktop-windows", membros), extras: EXTRAS.map(l => lente(l, [P()])), principalKeywordId: "p" });
    assert.deepEqual(semPar.overlaps, hoje.overlaps);
    assert.equal(semPar.verdict, hoje.verdict);
  }
  // O voto de uma lente é devolvido como veio.
  const voto = pairwiseOverlap(P(), S_JUNTO());
  assert.equal(aggregatePairAcrossLenses([voto]), voto);
  assert.throws(() => aggregatePairAcrossLenses([]));
});

test("A3 · par convergente em 1 de 4 lentes NÃO converge", () => {
  const primaria = lente("desktop-windows", [P(), S_JUNTO()]);
  const extras = EXTRAS.map(l => lente(l, [P(), S_OUTRO_MESMA_INTENCAO()]));
  const quatro = interpretArticleSerpAcrossLenses({ candidateRef: "c", primary: primaria, extras, principalKeywordId: "p" });
  assert.equal(quatro.overlaps[0].level, "baixa", "nem converge, nem é de fora");
  assert.equal(quatro.group.converging, 0);
  assert.deepEqual(quatro.group.outsiders, []);
  assert.equal(quatro.verdict, "INCONCLUSIVE");
  // Só na principal o mesmo par convergia: é exatamente o que as quatro lentes corrigem.
  assert.equal(interpretArticleSerp({ candidateRef: "c", members: primaria.members, principalKeywordId: "p" }).verdict, "COMPATIBLE");
  // Os votos por lente ficam registrados; 3 das 4 lentes, sozinhas, dizem o mesmo que o agregado.
  assert.deepEqual(quatro.lensReadings.map(item => item.pairs[0]?.level), ["forte", "nenhuma", "nenhuma", "nenhuma"]);
  assert.deepEqual(quatro.observedLenses, ["desktop-windows", ...EXTRAS]);
  assert.equal(quatro.agreeingLenses, 3);
});

test("A3 · par convergente em 2 de 4 lentes converge", () => {
  const quatro = interpretArticleSerpAcrossLenses({
    candidateRef: "c", principalKeywordId: "p",
    primary: lente("desktop-windows", [P(), S_JUNTO()]),
    extras: [lente("desktop-macos", [P(), S_JUNTO()]), lente("mobile-android", [P(), S_OUTRO_MESMA_INTENCAO()]), lente("mobile-ios", [P(), S_OUTRO_MESMA_INTENCAO()])],
  });
  assert.equal(quatro.overlaps[0].level, "forte");
  assert.equal(quatro.group.kind, "SUPPORTED");
  assert.equal(quatro.verdict, "COMPATIBLE");
  assert.equal(quatro.agreeingLenses, 2);
});

test("A3 · 'de fora' exige sobreposição NENHUMA em todas as lentes e intenção diferente na maioria", () => {
  // Sem sobreposição e com intenção diferente nas quatro: é de fora.
  const fora = interpretArticleSerpAcrossLenses({
    candidateRef: "c", principalKeywordId: "p",
    primary: lente("desktop-windows", [P(), S_TRANSACIONAL()]),
    extras: EXTRAS.map(l => lente(l, [P(), S_TRANSACIONAL()])),
  });
  assert.equal(fora.overlaps[0].level, "nenhuma");
  assert.equal(fora.overlaps[0].sameIntent, false);
  assert.deepEqual(fora.group.outsiders.map(item => item.keywordId), ["s"]);
  assert.equal(fora.verdict, "DIVERGENCE");

  // Um domínio em comum numa lente só já tira o "de fora": não é nenhuma em TODAS.
  const umDominio = busca("s", "rotina skincare", [resultado(1, "comum0.com", "/outra-pagina", "Comprar kit com desconto", "product", "preço"), ...transacionais("loja", 4)]);
  const quase = interpretArticleSerpAcrossLenses({
    candidateRef: "c", principalKeywordId: "p",
    primary: lente("desktop-windows", [P(), S_TRANSACIONAL()]),
    extras: [lente("desktop-macos", [P(), umDominio]), lente("mobile-android", [P(), S_TRANSACIONAL()]), lente("mobile-ios", [P(), S_TRANSACIONAL()])],
  });
  assert.equal(quase.overlaps[0].level, "baixa");
  assert.deepEqual(quase.group.outsiders, []);
  assert.equal(quase.verdict, "INCONCLUSIVE");

  // Nenhuma em todas, mas intenção diferente em só 2 de 4: não é maioria, não é de fora.
  const empate = interpretArticleSerpAcrossLenses({
    candidateRef: "c", principalKeywordId: "p",
    primary: lente("desktop-windows", [P(), S_TRANSACIONAL()]),
    extras: [lente("desktop-macos", [P(), S_TRANSACIONAL()]), lente("mobile-android", [P(), S_OUTRO_MESMA_INTENCAO()]), lente("mobile-ios", [P(), S_OUTRO_MESMA_INTENCAO()])],
  });
  assert.equal(empate.overlaps[0].level, "nenhuma");
  assert.equal(empate.overlaps[0].sameIntent, true);
  assert.deepEqual(empate.group.outsiders, []);
  assert.equal(empate.verdict, "INCONCLUSIVE");
});

test("A3 · lente faltante nunca vira 'de fora': ela só não vota", () => {
  // A secundária não foi observada nas extras: o voto é o da principal.
  const faltando = interpretArticleSerpAcrossLenses({
    candidateRef: "c", principalKeywordId: "p",
    primary: lente("desktop-windows", [P(), S_JUNTO()]),
    extras: EXTRAS.map(l => lente(l, [P()])),
  });
  assert.equal(faltando.verdict, "COMPATIBLE");
  assert.deepEqual(faltando.lensReadings.slice(1).map(item => item.pairs.length), [0, 0, 0]);
  // Lente sem a Principal não é observada: não entra na concordância.
  const semPrincipal = interpretArticleSerpAcrossLenses({
    candidateRef: "c", principalKeywordId: "p",
    primary: lente("desktop-windows", [P(), S_JUNTO()]),
    extras: [lente("desktop-macos", [S_TRANSACIONAL()])],
  });
  assert.equal(semPrincipal.lensReadings[1].verdict, null);
  assert.deepEqual(semPrincipal.observedLenses, ["desktop-windows"]);
  assert.equal(semPrincipal.verdict, "COMPATIBLE");
});

test("A3 · viabilidade, intenção e tipo dominante vêm SÓ da lente principal", () => {
  // As extras convergem também, mas trazem 20 domínios a mais: a união inflaria a viabilidade.
  const muitosDominios = busca("s", "rotina skincare", [...comuns.slice(0, 4), ...informativos("extra", 20)]);
  const hoje = interpretArticleSerp({ candidateRef: "c", members: [P(), S_JUNTO()], principalKeywordId: "p" });
  const quatro = interpretArticleSerpAcrossLenses({
    candidateRef: "c", principalKeywordId: "p",
    primary: lente("desktop-windows", [P(), S_JUNTO()]),
    extras: EXTRAS.map(l => lente(l, [P([...comuns, ...transacionais("x", 9)]), muitosDominios])),
  });
  assert.equal(quatro.verdict, hoje.verdict);
  assert.equal(quatro.viability.distinctDomains, hoje.viability.distinctDomains);
  assert.equal(quatro.viability.level, hoje.viability.level);
  assert.equal(quatro.observedIntent, hoje.observedIntent);
  assert.equal(quatro.dominantType, hoje.dominantType);
});

/* ================= A5 · o marcador de lentes no parecer ================= */

test("A5 · o marcador: pedidas, observadas, faltantes, pares por lente e o portão de datas por keyword", () => {
  const quatro = interpretArticleSerpAcrossLenses({
    candidateRef: "c", principalKeywordId: "p",
    primary: lente("desktop-windows", [P(), S_JUNTO()]),
    extras: [lente("desktop-macos", [P(), S_JUNTO()]), lente("mobile-android", [P(), S_JUNTO()])],
  });
  const faltante = { lens: "mobile-ios", keywordId: "s", reason: "não paga" as const, detail: "Fora do plano de chamadas autorizado." };
  const marcador = formationLensesMarkerOf({
    requested: ["desktop-windows", ...EXTRAS],
    interpretation: quatro,
    // Dentro de uma lente, as buscas diferem 3 dias; isso NÃO é o portão, que é por keyword.
    collectedAtByLens: new Map([["desktop-windows", ["2026-09-20T00:00:00.000Z", "2026-09-17T00:00:00.000Z"]], ["desktop-macos", ["2026-09-20T00:00:00.000Z"]]]),
    // A keyword "p": principal em 10/09, extra em 20/09 → 10 dias entre as lentes da MESMA busca.
    collectedAtByKeyword: new Map([["p", ["2026-09-10T00:00:00.000Z", "2026-09-20T00:00:00.000Z"]], ["s", ["2026-09-20T00:00:00.000Z", "2026-09-21T00:00:00.000Z"]]]),
    missing: [faltante],
    withExtras: true,
  });
  assert.deepEqual(marcador.requested, ["desktop-windows", ...EXTRAS]);
  assert.deepEqual(marcador.observed, ["desktop-windows", "desktop-macos", "mobile-android"]);
  assert.deepEqual(marcador.missing, [faltante]);
  assert.equal(marcador.agreement, "3/3");
  assert.equal(marcador.collectedAtSpreadDays, 10);
  assert.equal(marcador.datesDiverge, true);
  assert.equal(marcador.perLens[0].oldestCollectedAt, "2026-09-17T00:00:00.000Z");
  assert.equal(marcador.perLens[0].newestCollectedAt, "2026-09-20T00:00:00.000Z");
  assert.deepEqual(marcador.perLens.map(linha => linha.pairs?.[0]?.level), ["forte", "forte", "forte"]);
  assert.ok(marcador.note, "a assimetria do digest é declarada");

  // Até 7 dias entre as lentes: nada a marcar.
  const perto = formationLensesMarkerOf({ requested: ["desktop-windows"], interpretation: quatro, collectedAtByLens: new Map(), collectedAtByKeyword: new Map([["p", ["2026-09-10T00:00:00.000Z", "2026-09-17T00:00:00.000Z"]]]), missing: [], withExtras: false });
  assert.equal(perto.datesDiverge, false);
  assert.equal("note" in perto, false);
});

test("A5 · o parser preserva o marcador, e a linha antiga sem ele continua legível", () => {
  const quatro = interpretArticleSerpAcrossLenses({
    candidateRef: "c", principalKeywordId: "p",
    primary: lente("desktop-windows", [P(), S_JUNTO()]),
    extras: [lente("desktop-macos", [P(), S_JUNTO()])],
  });
  const lenses = formationLensesMarkerOf({
    requested: ["desktop-windows", ...EXTRAS], interpretation: quatro,
    collectedAtByLens: new Map([["desktop-windows", ["2026-09-20T08:30:00+00:00"]]]),
    collectedAtByKeyword: new Map(), missing: [{ lens: "mobile-ios", keywordId: null, reason: "sem par", detail: "Só uma busca observada." }], withExtras: true,
  });
  const interpretacao = {
    principalVerdict: "PRINCIPAL_SUPPORTED", principalAlternativeKeywordId: null, principalReason: "ok", groupVerdict: "SUPPORTED", groupReason: "ok",
    outsiders: [], observedIntent: "informacional", dominantType: "article", viability: "consistente", viabilityText: "ok",
    distinctDomains: 5, converging: 1, total: 1, recommendation: "Manter a composição como está.",
  };
  const base = {
    candidateRef: "cand", territoryRef: "territory:t1", formationBaseHash: "serpbase:aaa", verdict: "COMPATIBLE" as const,
    assessment: { ...assessmentFalso, snapshots: [snapshotFalso] as never }, operationRequestId: "op-1",
  };
  const lido = parseArticleFormationSerpRow(buildArticleFormationSerpRow({ ...base, interpretation: { ...interpretacao, lenses } }));
  assert.equal(lido.ok, true);
  // O readback devolve o bloco gravado, inteiro — inclusive a data com deslocamento.
  assert.deepEqual(lido.payload?.interpretation?.lenses, lenses);
  const antigo = parseArticleFormationSerpRow(buildArticleFormationSerpRow({ ...base, interpretation: interpretacao }));
  assert.equal(antigo.ok, true);
  assert.equal(antigo.payload?.interpretation && "lenses" in antigo.payload.interpretation, false);
  // Marcador malformado não passa: o motivo da falta é do vocabulário fechado.
  const torto = parseArticleFormationSerpRow(buildArticleFormationSerpRow({ ...base, interpretation: interpretacao }));
  assert.ok(torto.ok);
  const payload = structuredClone(torto.payload) as Record<string, unknown> & { interpretation: Record<string, unknown> };
  payload.interpretation.lenses = { ...lenses, missing: [{ lens: "mobile-ios", keywordId: null, reason: "qualquer" }] };
  const recusado = parseArticleFormationSerpRow({ ...buildArticleFormationSerpRow({ ...base, interpretation: interpretacao }), payload });
  assert.equal(recusado.ok, false);
});
