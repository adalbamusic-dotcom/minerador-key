import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  ANCHOR_REJECTION_LABELS,
  LINK_ANCHOR_SYSTEM_PROMPT,
  LinkAnchorProposalSchema,
  anchorRelatesToTarget,
  anchorRepeatsSlug,
  buildLinkAnchorPrompt,
  keepValidLinkAnchorProposals,
  reviewAnchorConcepts,
  summarizeLinkAnchorProposals,
  type AnchorConceptProposal,
  type LinkAnchorProposal,
  type LinkAnchorUnitFacts,
} from "../lib/arquiteto/link-anchor-ai.ts";

const SILO = "silo:skin-care";

const unidade = (over: Partial<LinkAnchorUnitFacts> = {}): LinkAnchorUnitFacts => ({
  ref: "article:pele-oleosa",
  unitType: "ARTICLE_DNA",
  label: "skin care para pele oleosa",
  siloId: SILO,
  siloLabel: "Skin care para peles oleosas",
  architecturalRole: "PILAR",
  principal: "skin care para pele oleosa",
  secondaries: ["rotina para pele oleosa"],
  reinforcements: ["oleosidade da pele"],
  entities: ["pele oleosa"],
  intent: "informacional",
  slug: "/skin-care-pele-oleosa",
  narrative: null,
  published: false,
  ...over,
});

const conceito = (text: string, over: Partial<AnchorConceptProposal> = {}): AnchorConceptProposal => ({
  text,
  semanticRelation: "expressao_contextual",
  reason: "descreve o destino",
  ...over,
});

/* ------------------- §4 âncora é descrição, não exact match -------------- */

test("variante semântica é aceita sem exigir exact match", () => {
  const target = unidade();
  const { accepted, rejected } = reviewAnchorConcepts({
    concepts: [
      conceito("cuidados para pele oleosa", { semanticRelation: "sinonimo" }),
      conceito("rotina para pele oleosa", { semanticRelation: "variante_lexical" }),
      conceito("cuidados com a oleosidade da pele", { semanticRelation: "expressao_contextual" }),
    ],
    target,
  });
  assert.equal(accepted.length, 3);
  assert.deepEqual(rejected, []);
  // Nenhuma delas é a keyword exata — e todas passam.
  assert.ok(accepted.every(item => item.text !== target.principal));
});

test("exact match continua válido, mas não é obrigatório", () => {
  const target = unidade();
  const comExato = reviewAnchorConcepts({
    concepts: [conceito("skin care para pele oleosa", { semanticRelation: "exact" })],
    target,
  });
  assert.equal(comExato.accepted.length, 1);

  const semExato = reviewAnchorConcepts({
    concepts: [conceito("cuidados para pele oleosa"), conceito("rotina para pele oleosa")],
    target,
  });
  assert.equal(semExato.accepted.length, 2, "uma lista sem exact match é perfeitamente utilizável");
});

test("âncora sem relação com o destino é recusada", () => {
  const { accepted, rejected } = reviewAnchorConcepts({
    concepts: [conceito("protetor solar mineral"), conceito("cuidados para pele oleosa")],
    target: unidade(),
  });
  assert.equal(accepted.length, 1);
  assert.equal(rejected[0].code, "UNRELATED_TO_TARGET");
  assert.match(rejected[0].detail, /não compartilha nenhum termo com o destino/);
});

test("o slug nunca vira âncora, escrito com hífen ou com espaço", () => {
  const target = unidade();
  assert.equal(anchorRepeatsSlug("skin-care-pele-oleosa", target), true);
  assert.equal(anchorRepeatsSlug("skin care pele oleosa", target), true);
  assert.equal(anchorRepeatsSlug("/skin-care-pele-oleosa", target), true);
  // Uma descrição natural que apenas compartilha vocabulário não é o endereço.
  assert.equal(anchorRepeatsSlug("cuidados para pele oleosa", target), false);

  const { rejected } = reviewAnchorConcepts({
    concepts: [conceito("skin-care-pele-oleosa")],
    target,
  });
  assert.equal(rejected[0].code, "SLUG_AS_ANCHOR");
});

test("âncora promocional é recusada", () => {
  const { rejected } = reviewAnchorConcepts({
    concepts: [conceito("confira nossa rotina para pele oleosa"), conceito("clique aqui")],
    target: unidade(),
  });
  assert.equal(rejected.length, 2);
  assert.ok(rejected.every(item => ["PROMOTIONAL", "UNRELATED_TO_TARGET"].includes(item.code)));
  assert.equal(rejected[0].code, "PROMOTIONAL");
});

test("conceito repetido não conta duas vezes", () => {
  const { accepted, rejected } = reviewAnchorConcepts({
    concepts: [conceito("cuidados para pele oleosa"), conceito("Cuidados Para Pele Oleosa")],
    target: unidade(),
  });
  assert.equal(accepted.length, 1);
  assert.equal(rejected[0].code, "DUPLICATE");
});

test("âncora longa demais não cabe numa frase natural", () => {
  const { rejected } = reviewAnchorConcepts({
    concepts: [conceito("cuidados diarios completos para quem tem a pele muito oleosa no verao")],
    target: unidade(),
  });
  assert.equal(rejected[0].code, "TOO_LONG");
});

test("a relação com o destino usa os fatos, não só o título", () => {
  const target = unidade({ label: "guia definitivo", principal: null, secondaries: [], entities: ["retinol"] });
  assert.equal(anchorRelatesToTarget("como usar retinol", target), true);
  assert.equal(anchorRelatesToTarget("vitamina c para o rosto", target), false);
});

/* ------------------ §15 as quatro relações estruturais ------------------- */

const proposta = (over: Partial<LinkAnchorProposal> = {}): LinkAnchorProposal => ({
  sourceRef: "article:coreano",
  targetRef: "article:pele-oleosa",
  relationType: "SUPPORT_TO_PILLAR",
  reason: "O artigo de origem aborda uma variação específica do universo coberto pelo Pilar.",
  anchorConcepts: [conceito("cuidados para pele oleosa"), conceito("rotina para pele oleosa")],
  priorityProposal: "MEDIUM",
  confidence: "media",
  confidenceReason: "as duas páginas compartilham entidade e intenção",
  warnings: [],
  ...over,
});

const universo = (extra: LinkAnchorUnitFacts[] = []) => new Map(
  [
    unidade(),
    unidade({ ref: "article:coreano", label: "skin care coreano", principal: "skin care coreano", architecturalRole: "SUPORTE", slug: "/coreano" }),
    unidade({ ref: "silo:page", unitType: "SILO_PAGE", label: "Skin care para peles oleosas", architecturalRole: "OUTRO", principal: null, slug: "/skin-care-para-peles-oleosas" }),
    ...extra,
  ].map(item => [item.ref, item]),
);

test("as quatro relações estruturais passam pelo mesmo caminho", () => {
  for (const relationType of ["SILO_PAGE_TO_ARTICLE", "PILLAR_TO_SUPPORT", "SUPPORT_TO_PILLAR", "SUPPORT_TO_SUPPORT"] as const) {
    const resultado = keepValidLinkAnchorProposals({
      proposals: [proposta({ relationType })],
      unitsByRef: universo(),
    });
    assert.equal(resultado.accepted.length, 1, `${relationType} deveria passar`);
    assert.equal(resultado.accepted[0].relationType, relationType);
  }
});

test("ref inventada não vira conexão", () => {
  const resultado = keepValidLinkAnchorProposals({
    proposals: [proposta({ targetRef: "article:que-nao-existe" })],
    unitsByRef: universo(),
  });
  assert.equal(resultado.accepted.length, 0);
  assert.match(resultado.rejected[0].issues[0], /não existe na arquitetura aprovada/);
});

test("página não linka para si mesma", () => {
  const resultado = keepValidLinkAnchorProposals({
    proposals: [proposta({ sourceRef: "article:pele-oleosa", targetRef: "article:pele-oleosa" })],
    unitsByRef: universo(),
  });
  assert.equal(resultado.accepted.length, 0);
  assert.match(resultado.rejected[0].issues.join(" "), /não linka para si mesma/);
});

test("conexão entre Silos diferentes não é decidida nesta aba", () => {
  const deOutroSilo = unidade({ ref: "article:retinol", siloId: "silo:retinol", label: "retinol", principal: "retinol" });
  const resultado = keepValidLinkAnchorProposals({
    proposals: [proposta({ targetRef: "article:retinol" })],
    unitsByRef: universo([deOutroSilo]),
  });
  assert.equal(resultado.accepted.length, 0);
  assert.match(resultado.rejected[0].issues.join(" "), /Silos diferentes/);
});

test("conexão sem âncora utilizável vira pendência, não edge mudo", () => {
  const resultado = keepValidLinkAnchorProposals({
    proposals: [proposta({ anchorConcepts: [conceito("protetor solar mineral"), conceito("clique aqui")] })],
    unitsByRef: universo(),
  });
  assert.equal(resultado.accepted.length, 0);
  assert.match(resultado.rejected[0].issues[0], /o mínimo é 2/);
  // E o motivo de cada recusa acompanha a pendência.
  assert.ok(resultado.rejected[0].issues.length > 1);
});

test("o que foi recusado vira aviso na proposta que passou", () => {
  const resultado = keepValidLinkAnchorProposals({
    proposals: [proposta({
      anchorConcepts: [
        conceito("cuidados para pele oleosa"),
        conceito("rotina para pele oleosa"),
        conceito("skin-care-pele-oleosa"),
      ],
    })],
    unitsByRef: universo(),
  });
  assert.equal(resultado.accepted.length, 1);
  assert.equal(resultado.accepted[0].anchorConcepts.length, 2);
  assert.match(resultado.accepted[0].warnings.join(" "), /repete o endereço/);
});

test("no máximo cinco conceitos chegam ao humano", () => {
  const muitos = ["cuidados para pele oleosa", "rotina para pele oleosa", "oleosidade da pele",
    "cuidados com pele oleosa", "pele oleosa no verao", "skin care oleosa"].map(text => conceito(text));
  const resultado = keepValidLinkAnchorProposals({
    proposals: [proposta({ anchorConcepts: muitos })],
    unitsByRef: universo(),
  });
  assert.ok(resultado.accepted[0].anchorConcepts.length <= 5);
});

/* ---------------------- §5/§6 o contrato da proposta --------------------- */

test("toda confiança vem com razão; nenhum score mágico", () => {
  const shape = LinkAnchorProposalSchema.shape;
  assert.ok("confidence" in shape && "confidenceReason" in shape);
  const source = readFileSync("lib/arquiteto/link-anchor-ai.ts", "utf8");
  assert.doesNotMatch(source, /seoScore|rankingScore|authorityScore/i);
  assert.match(source, /Não é score de SEO nem probabilidade de ranking/);
});

test("o prompt entrega fatos e proíbe o endereço como âncora", () => {
  const texto = buildLinkAnchorPrompt([{
    source: unidade({ ref: "article:coreano", label: "skin care coreano" }),
    target: unidade(),
    relationType: "SUPPORT_TO_PILLAR",
    structuralReason: "suporte aponta para o pilar do mesmo Silo",
  }]);
  for (const campo of ["busca principal", "buscas secundarias", "reforcos narrativos", "entidades", "intencao", "publicado"]) {
    assert.ok(texto.includes(campo), `o prompt precisa carregar ${campo}`);
  }
  // O endereço entra como identidade e sai proibido como texto de âncora.
  assert.match(texto, /NUNCA texto de ancora/);
  assert.match(LINK_ANCHOR_SYSTEM_PROMPT, /NUNCA use o slug/);
  assert.match(LINK_ANCHOR_SYSTEM_PROMPT, /Exact match NAO e obrigatorio/);
  assert.match(LINK_ANCHOR_SYSTEM_PROMPT, /de 2 a 5 conceitos distintos/);
});

test("a IA propõe e não escreve o grafo", () => {
  const source = readFileSync("lib/arquiteto/link-anchor-ai.ts", "utf8");
  assert.doesNotMatch(source, /fetch\(|supabase|persist|createInternalLinkGraph/);
  assert.match(LINK_ANCHOR_SYSTEM_PROMPT, /Voce propoe\. Um humano confirma\./);
});

test("âncora aprovada é universo permitido, não texto final obrigatório", () => {
  const source = readFileSync("lib/arquiteto/link-anchor-ai.ts", "utf8");
  assert.match(source, /anchorConcepts` e\s*\n \* não `anchorText`/);
  assert.doesNotMatch(source, /<a href/);
});

/* ------------------------------ leitura ---------------------------------- */

test("o resumo responde as perguntas do painel", () => {
  const resultado = keepValidLinkAnchorProposals({
    proposals: [
      proposta(),
      proposta({ sourceRef: "silo:page", relationType: "SILO_PAGE_TO_ARTICLE" }),
      proposta({ targetRef: "article:inexistente" }),
    ],
    unitsByRef: universo(),
  });
  const resumo = summarizeLinkAnchorProposals(resultado);
  assert.equal(resumo.connections, 2);
  assert.equal(resumo.anchorConcepts, 4);
  assert.equal(resumo.needsReview, 1);
  assert.deepEqual(resumo.byRelation, { SUPPORT_TO_PILLAR: 1, SILO_PAGE_TO_ARTICLE: 1 });
});

test("todo motivo de recusa é legível", () => {
  for (const label of Object.values(ANCHOR_REJECTION_LABELS)) {
    assert.ok(label.trim().length > 10, `motivo curto demais: ${label}`);
  }
});

/* ------------- o fallback determinístico também respeita o §4 ------------ */

test("o gerador determinístico deixou de emitir rótulo tipado e slug", () => {
  const source = readFileSync("lib/arquiteto/link-anchor-concepts.ts", "utf8");
  const codigo = source
    .split("\n")
    .filter(line => {
      const trimmed = line.trimStart();
      return !trimmed.startsWith("*") && !trimmed.startsWith("//") && !trimmed.startsWith("/*");
    })
    .join("\n");
  // Nada de "intenção: X", "entidade: Y", "categoria: <slug>".
  assert.doesNotMatch(codigo, /"intenção: "|"entidade: "|"tema relacionado: "|"universo: "|"seção: "|"categoria: "|"sobre "|"contexto: "/);
  // E o endereço não entra na lista de jeito nenhum.
  assert.doesNotMatch(codigo, /siloPage\.slug/);
  assert.match(source, /endereço não é texto de âncora/);
});

/* ---------------- §3 a aba de Links não fala com a SERP ------------------ */

test("a rota de âncoras não consulta SERP nem provider de busca", () => {
  const route = readFileSync("app/api/arquiteto/internal-link-graph/anchors/route.ts", "utf8");
  assert.doesNotMatch(route, /dataforseo|DataForSeo|\/api\/arquiteto\/serp|collectDataForSeo/);
  assert.match(route, /NÃO consulta SERP/);
  // Usa a Connection global já configurada, como a IA territorial.
  assert.match(route, /resolveDeepSeekCanonicalConfig/);
  assert.match(route, /generateStructuredAI/);
});

test("a rota propõe e não escreve o grafo", () => {
  const route = readFileSync("app/api/arquiteto/internal-link-graph/anchors/route.ts", "utf8");
  assert.doesNotMatch(route, /createInternalLinkGraph|persistInternalLinkGraph|approveInternalLinkGraph/);
  assert.match(route, /persistence: "PROPOSAL_ONLY"/);
});

test("candidato inválido não chega ao modelo", () => {
  const route = readFileSync("app/api/arquiteto/internal-link-graph/anchors/route.ts", "utf8");
  // Ref inexistente, cross-Silo e auto-link são filtrados antes da chamada.
  const filtro = route.slice(route.indexOf("const candidatos ="), route.lastIndexOf("resolveDeepSeekCanonicalConfig"));
  assert.match(filtro, /siloId === parsed\.data\.siloId/);
  assert.match(filtro, /source!\.ref !== candidate\.target!\.ref/);
  assert.match(filtro, /Boolean\(candidate\.source && candidate\.target\)/);
});

test("o nome do provider não vaza para a interface", () => {
  const route = readFileSync("app/api/arquiteto/internal-link-graph/anchors/route.ts", "utf8");
  assert.match(route, /publicFailureMessage/);
  assert.ok(route.includes("o modelo") && route.includes("DeepSeek"), "o nome do provider precisa ser trocado antes de chegar na tela");
});

test("slug de uma palavra não proíbe a entidade que dá nome à página", () => {
  const destino: LinkAnchorUnitFacts = {
    ref: "article:principia", unitType: "ARTICLE_DNA", label: "skin care principia",
    siloId: "s1", siloLabel: "Skin care", architecturalRole: "SUPORTE",
    principal: "skin care principia", secondaries: [], reinforcements: [], entities: ["principia"],
    intent: "informacional", slug: "principia", narrative: null, published: false,
  };
  // A regra existe contra usar o ENDEREÇO como texto do link, não contra nomear
  // o assunto: "principia" é a marca, e a regra 4 do prompt exige preservá-la.
  // Recusando toda âncora que a contivesse, sobravam zero conceitos usáveis.
  assert.equal(anchorRepeatsSlug("a linha principia", destino), false);
  assert.equal(anchorRepeatsSlug("produtos principia para a pele", destino), false);
  // O endereço puro continua recusado.
  assert.equal(anchorRepeatsSlug("principia", destino), true);
  assert.equal(anchorRepeatsSlug("/principia", destino), true);
});

test("slug composto continua barrando o endereço embutido na frase", () => {
  const destino: LinkAnchorUnitFacts = {
    ref: "article:oleosa", unitType: "ARTICLE_DNA", label: "skin care pele oleosa",
    siloId: "s1", siloLabel: "Skin care", architecturalRole: "PILAR",
    principal: "skin care pele oleosa", secondaries: [], reinforcements: [], entities: ["pele oleosa"],
    intent: "informacional", slug: "skin-care-pele-oleosa", narrative: null, published: false,
  };
  assert.equal(anchorRepeatsSlug("skin-care-pele-oleosa", destino), true);
  assert.equal(anchorRepeatsSlug("veja skin care pele oleosa aqui", destino), true);
  assert.equal(anchorRepeatsSlug("cuidados com a pele oleosa", destino), false);
});
