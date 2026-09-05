import { z } from "zod";
import { InternalLinkGraphPrioritySchema, InternalLinkGraphRelationTypeSchema } from "./contracts.ts";

/**
 * ÂNCORA É DESCRIÇÃO NATURAL DO DESTINO, NÃO EXACT MATCH OBRIGATÓRIO.
 *
 * O gerador anterior devolvia rótulos tipados — "intenção: informacional",
 * "entidade: retinol", "categoria: /skin-care". Nada disso é âncora: ninguém
 * escreve isso dentro de um texto. E "categoria: <slug>" era pior que inútil,
 * porque usava o endereço como texto de link, que é exatamente o que o
 * contrato proíbe.
 *
 * O que o Arquiteto decide aqui:
 *
 *   QUEM linka para QUEM
 *   COM QUAIS CONCEITOS de âncora
 *   POR QUE a conexão existe
 *
 * O que ele NÃO decide: quantas vezes, em qual parágrafo, com qual string
 * final. Isso é do Radar e do redator. Por isso o nome é `anchorConcepts` e
 * não `anchorText`: são pontos de partida semânticos editáveis, e a lista
 * aprovada é um universo permitido, nunca uma obrigação de uso literal.
 *
 * A IA propõe. O humano confirma. Nada aqui escreve no grafo aprovado.
 *
 * Domínio puro: sem storage, sem fetch, sem provider.
 */

/* ------------------------- o que a IA responde --------------------------- */

export const ANCHOR_SEMANTIC_RELATIONS = [
  "exact",
  "variante_lexical",
  "sinonimo",
  "recorte",
  "expressao_contextual",
] as const;
export type AnchorSemanticRelation = (typeof ANCHOR_SEMANTIC_RELATIONS)[number];

export const AnchorConceptProposalSchema = z.object({
  text: z.string().trim().min(3).max(80),
  semanticRelation: z.enum(ANCHOR_SEMANTIC_RELATIONS),
  reason: z.string().trim().min(1),
}).strict();
export type AnchorConceptProposal = z.infer<typeof AnchorConceptProposalSchema>;

export const LinkAnchorProposalSchema = z.object({
  sourceRef: z.string().min(1),
  targetRef: z.string().min(1),
  relationType: InternalLinkGraphRelationTypeSchema,
  reason: z.string().trim().min(1),
  anchorConcepts: z.array(AnchorConceptProposalSchema).min(1).max(8),
  priorityProposal: InternalLinkGraphPrioritySchema,
  /**
   * Confiança da PROPOSTA, sempre acompanhada de razão.
   *
   * Não é score de SEO nem probabilidade de ranking: é o quanto a IA se
   * compromete com aquela leitura, e por quê.
   */
  confidence: z.enum(["alta", "media", "baixa"]),
  confidenceReason: z.string().trim().min(1),
  warnings: z.array(z.string().trim().min(1)).default([]),
}).strict();
export type LinkAnchorProposal = z.infer<typeof LinkAnchorProposalSchema>;

export const LinkAnchorResponseSchema = z.object({
  proposals: z.array(LinkAnchorProposalSchema).min(1).max(40),
}).strict();

/* ------------------------- os fatos que ela recebe ----------------------- */

export type LinkAnchorUnitFacts = {
  ref: string;
  unitType: "SILO_PAGE" | "ARTICLE_DNA";
  label: string;
  siloId: string;
  siloLabel: string;
  architecturalRole: "PILAR" | "SUPORTE" | "REFORCO" | "OUTRO" | null;
  principal: string | null;
  secondaries: readonly string[];
  reinforcements: readonly string[];
  entities: readonly string[];
  intent: string | null;
  slug: string | null;
  narrative: string | null;
  /** Publicado: a conexão pode ser recomendada, a identidade não muda. */
  published: boolean;
};

export type LinkAnchorCandidate = {
  source: LinkAnchorUnitFacts;
  target: LinkAnchorUnitFacts;
  relationType: z.infer<typeof InternalLinkGraphRelationTypeSchema>;
  structuralReason: string;
};

const lista = (values: readonly string[]) => values.filter(Boolean).join(", ") || "—";

/**
 * O prompt carrega FATOS já aprovados, nunca hipóteses.
 *
 * O slug entra como identidade da página — para a IA saber do que se trata —
 * e sai proibido como texto de âncora logo em seguida. Sem essa distinção
 * explícita o modelo tende a devolver o próprio endereço.
 */
export function buildLinkAnchorPrompt(candidates: readonly LinkAnchorCandidate[]): string {
  const bloco = (unidade: LinkAnchorUnitFacts, papel: "ORIGEM" | "DESTINO") => [
    `${papel}:`,
    `  ref: ${unidade.ref}`,
    `  tipo: ${unidade.unitType === "SILO_PAGE" ? "SiloPage (raiz do Silo)" : "Article"}`,
    `  titulo: ${unidade.label}`,
    `  silo: ${unidade.siloLabel}`,
    `  papel: ${unidade.architecturalRole || "não definido"}`,
    `  busca principal: ${unidade.principal || "—"}`,
    `  buscas secundarias: ${lista(unidade.secondaries)}`,
    `  reforcos narrativos: ${lista(unidade.reinforcements)}`,
    `  entidades: ${lista(unidade.entities)}`,
    `  intencao: ${unidade.intent || "—"}`,
    `  narrativa: ${unidade.narrative || "—"}`,
    `  endereco (identidade, NUNCA texto de ancora): ${unidade.slug || "—"}`,
    `  publicado: ${unidade.published ? "sim" : "nao"}`,
  ].join("\n");

  return candidates.map((candidate, index) => [
    `CONEXAO ${index + 1}`,
    `relacao estrutural: ${candidate.relationType}`,
    `razao estrutural ja aprovada: ${candidate.structuralReason}`,
    bloco(candidate.source, "ORIGEM"),
    bloco(candidate.target, "DESTINO"),
  ].join("\n")).join("\n\n---\n\n");
}

export const LINK_ANCHOR_SYSTEM_PROMPT = [
  "Voce propoe CONCEITOS DE ANCORA para links internos de um site editorial brasileiro.",
  "",
  "Um conceito de ancora e a forma natural como um texto se referiria a pagina de DESTINO",
  "no meio de uma frase. Ele descreve o destino; ele nao repete o endereco nem grita a keyword.",
  "",
  "REGRAS:",
  "1. Proponha de 2 a 5 conceitos distintos por conexao.",
  "2. Exact match NAO e obrigatorio e nao deve dominar a lista.",
  "3. Use variantes: recorte da busca, variante lexical, sinonimo, expressao contextual.",
  "4. Todo conceito precisa preservar a ENTIDADE e a INTENCAO do destino.",
  "5. NUNCA use o slug, a URL ou qualquer fragmento de endereco como ancora.",
  "6. NUNCA escreva ancora promocional, imperativa ou com chamada para acao.",
  "7. NUNCA invente entidade que nao esteja nos fatos do destino.",
  "8. Escreva em portugues do Brasil, em minusculas, sem pontuacao final.",
  "9. Cada conceito vem com o motivo pelo qual ele descreve o destino.",
  "10. A razao da conexao explica por que a ORIGEM mencionaria o DESTINO.",
  "",
  "Voce propoe. Um humano confirma. Voce nao decide quantos links, nem onde, nem a frase final.",
  "",
  // O contrato de saída fica NO PROMPT, não só no validador.
  //
  // O provider roda em modo `json_object` e recusa com HTTP 400 qualquer pedido
  // cujo prompt não diga que a resposta é JSON. Além disso, descrever o formato
  // aqui evita a rodada perdida em que o modelo devolve prosa e o schema recusa.
  "FORMATO DA RESPOSTA:",
  "Responda SOMENTE com um objeto JSON valido, sem texto fora dele e sem cercas de codigo.",
  "O JSON tem a forma:",
  "{\"proposals\":[{\"sourceRef\":\"...\",\"targetRef\":\"...\",\"relationType\":\"...\",\"reason\":\"...\",",
  "\"anchorConcepts\":[{\"text\":\"...\",\"semanticRelation\":\"...\",\"reason\":\"...\"}],",
  "\"priorityProposal\":\"HIGH|MEDIUM|LOW\",\"confidence\":\"alta|media|baixa\",",
  "\"confidenceReason\":\"...\",\"warnings\":[]}]}",
  "Repita `sourceRef`, `targetRef` e `relationType` exatamente como vieram na conexao.",
  `\`semanticRelation\` e um destes: ${ANCHOR_SEMANTIC_RELATIONS.join(" | ")}.`,
].join("\n");

/* --------------------------- a validação do §4 --------------------------- */

export const ANCHOR_REJECTION_CODES = [
  "UNRELATED_TO_TARGET",
  "SLUG_AS_ANCHOR",
  "PROMOTIONAL",
  "DUPLICATE",
  "TOO_LONG",
] as const;
export type AnchorRejectionCode = (typeof ANCHOR_REJECTION_CODES)[number];

export const ANCHOR_REJECTION_LABELS: Record<AnchorRejectionCode, string> = {
  UNRELATED_TO_TARGET: "não compartilha nenhum termo com o destino",
  SLUG_AS_ANCHOR: "repete o endereço da página em vez de descrevê-la",
  PROMOTIONAL: "é chamada para ação, não descrição do destino",
  DUPLICATE: "repete um conceito já proposto",
  TOO_LONG: "é longa demais para caber numa frase natural",
};

const STOPWORDS = new Set([
  "para", "com", "sem", "por", "que", "dos", "das", "uma", "seu", "sua", "mais",
  "como", "the", "and", "de", "da", "do", "em", "no", "na", "os", "as", "um",
]);

export const normalizeAnchor = (value: string) =>
  value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim().replace(/\s+/g, " ");

const tokens = (value: string) =>
  new Set(normalizeAnchor(value).split(/[^a-z0-9]+/).filter(token => token.length > 2 && !STOPWORDS.has(token)));

const PROMOCIONAL = [
  "clique", "confira", "saiba mais", "veja aqui", "acesse", "aproveite",
  "compre", "garanta", "imperdivel", "melhor preco", "nao perca",
];

/**
 * O conceito descreve mesmo o destino?
 *
 * O critério é compartilhar vocabulário com os FATOS do destino — busca
 * principal, secundárias, reforços, entidades, título. Sinônimo puro sem
 * nenhum termo em comum é recusado de propósito: aqui não temos como
 * verificar que ele fala da mesma coisa, e um link com âncora que não
 * descreve o destino é pior que nenhum link.
 */
export function anchorRelatesToTarget(text: string, target: LinkAnchorUnitFacts): boolean {
  const doDestino = new Set<string>();
  for (const fonte of [target.label, target.principal || "", ...target.secondaries, ...target.reinforcements, ...target.entities]) {
    for (const token of tokens(fonte)) doDestino.add(token);
  }
  if (!doDestino.size) return true;
  for (const token of tokens(text)) if (doDestino.has(token)) return true;
  return false;
}

/** O texto é o endereço da página disfarçado de âncora? */
export function anchorRepeatsSlug(text: string, target: LinkAnchorUnitFacts): boolean {
  const slug = (target.slug || "").trim();
  if (!slug) return false;
  const normalizado = normalizeAnchor(text);
  const semBarras = slug.replace(/^\/+|\/+$/g, "").toLowerCase();
  if (!semBarras) return false;
  const comEspacos = semBarras.replace(/[-_/]+/g, " ");
  const segmentos = semBarras.split(/[-_/]+/).filter(Boolean);

  // Barra no texto, ou o endereço literal com hífens: isso tem forma de URL, e
  // ninguém escreve assim no meio de uma frase.
  if (normalizado.includes("/")) return true;
  if (semBarras.includes("-") && normalizado.includes(semBarras)) return true;

  // "skin-care-pele-oleosa" e "skin care pele oleosa" são o mesmo endereço
  // escrito de dois jeitos; só o segundo passaria por uma comparação ingênua.
  if (normalizado === semBarras || normalizado === comEspacos) return true;

  /*
   * Endereço EMBUTIDO só é reconhecível quando o slug tem mais de um segmento.
   *
   * Um slug de uma palavra é indistinguível da entidade que dá nome à página:
   * `/principia` vem de "principia", que é a marca. Recusar toda âncora que
   * contenha essa palavra proibia justamente a âncora certa — "a linha
   * principia" descreve o destino, e a regra 4 do próprio prompt exige que a
   * entidade seja preservada. A regra existe contra usar o ENDEREÇO como texto,
   * não contra nomear o assunto.
   */
  return segmentos.length > 1 && normalizado.includes(comEspacos);
}

export type AnchorReview = {
  accepted: AnchorConceptProposal[];
  rejected: { concept: AnchorConceptProposal; code: AnchorRejectionCode; detail: string }[];
};

/**
 * Filtra os conceitos antes de qualquer humano ver.
 *
 * Recusar aqui é melhor que recusar na revisão: uma lista com âncora
 * inventada treina quem revisa a confiar menos em toda a lista.
 */
export function reviewAnchorConcepts(input: {
  concepts: readonly AnchorConceptProposal[];
  target: LinkAnchorUnitFacts;
}): AnchorReview {
  const accepted: AnchorConceptProposal[] = [];
  const rejected: AnchorReview["rejected"] = [];
  const vistos = new Set<string>();

  for (const concept of input.concepts) {
    const normalizado = normalizeAnchor(concept.text);
    const recusa = (code: AnchorRejectionCode) =>
      rejected.push({ concept, code, detail: `"${concept.text}" ${ANCHOR_REJECTION_LABELS[code]}.` });

    if (vistos.has(normalizado)) { recusa("DUPLICATE"); continue; }
    if (normalizado.split(" ").length > 8) { recusa("TOO_LONG"); continue; }
    if (anchorRepeatsSlug(concept.text, input.target)) { recusa("SLUG_AS_ANCHOR"); continue; }
    if (PROMOCIONAL.some(termo => normalizado.includes(termo))) { recusa("PROMOTIONAL"); continue; }
    if (!anchorRelatesToTarget(concept.text, input.target)) { recusa("UNRELATED_TO_TARGET"); continue; }

    vistos.add(normalizado);
    accepted.push(concept);
  }

  return { accepted, rejected };
}

export type LinkAnchorReviewResult = {
  accepted: LinkAnchorProposal[];
  rejected: { sourceRef: string; targetRef: string; issues: string[] }[];
};

/**
 * A proposta inteira só entra se sobrarem conceitos utilizáveis.
 *
 * Uma conexão sem âncora nenhuma não é uma conexão fraca: é uma conexão que
 * ninguém consegue escrever. Ela vira pendência explícita, não um edge mudo.
 */
export function keepValidLinkAnchorProposals(input: {
  proposals: readonly LinkAnchorProposal[];
  unitsByRef: ReadonlyMap<string, LinkAnchorUnitFacts>;
  minimumConcepts?: number;
}): LinkAnchorReviewResult {
  const minimo = input.minimumConcepts ?? 2;
  const accepted: LinkAnchorProposal[] = [];
  const rejected: LinkAnchorReviewResult["rejected"] = [];

  for (const proposal of input.proposals) {
    const source = input.unitsByRef.get(proposal.sourceRef);
    const target = input.unitsByRef.get(proposal.targetRef);
    const issues: string[] = [];

    // Ref inventada não vira conexão: seria decisão sobre objeto imaginário.
    if (!source) issues.push(`A origem ${proposal.sourceRef} não existe na arquitetura aprovada.`);
    if (!target) issues.push(`O destino ${proposal.targetRef} não existe na arquitetura aprovada.`);
    if (source && target && source.ref === target.ref) issues.push("Uma página não linka para si mesma.");
    if (source && target && source.siloId !== target.siloId) {
      issues.push("Conexão entre Silos diferentes não é decidida nesta aba.");
    }
    if (issues.length || !target) {
      rejected.push({ sourceRef: proposal.sourceRef, targetRef: proposal.targetRef, issues });
      continue;
    }

    const revisao = reviewAnchorConcepts({ concepts: proposal.anchorConcepts, target });
    if (revisao.accepted.length < minimo) {
      rejected.push({
        sourceRef: proposal.sourceRef,
        targetRef: proposal.targetRef,
        issues: [
          `Sobraram ${revisao.accepted.length} conceito(s) utilizáveis, e o mínimo é ${minimo}.`,
          ...revisao.rejected.map(item => item.detail),
        ],
      });
      continue;
    }

    accepted.push({
      ...proposal,
      anchorConcepts: revisao.accepted.slice(0, 5),
      warnings: [...proposal.warnings, ...revisao.rejected.map(item => item.detail)],
    });
  }

  return { accepted, rejected };
}

/** Leitura curta para o painel. */
export function summarizeLinkAnchorProposals(result: LinkAnchorReviewResult) {
  return {
    connections: result.accepted.length,
    anchorConcepts: result.accepted.reduce((total, item) => total + item.anchorConcepts.length, 0),
    needsReview: result.rejected.length + result.accepted.filter(item => item.warnings.length).length,
    byRelation: result.accepted.reduce((acc, item) => {
      acc[item.relationType] = (acc[item.relationType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>),
  };
}
