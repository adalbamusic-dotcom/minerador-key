/**
 * NÚCLEOS TEMÁTICOS — A FORMAÇÃO COMEÇA PELO ASSUNTO, NÃO PELA FRASE.
 *
 * A ordem anterior era:
 *
 *   semelhança de string → candidatos → tentar consertar depois
 *
 * e ela produziu, no Silo `skincare`, três candidatos que são o mesmo artigo:
 * "skincare para pele oleosa", "skin care para peles oleosas" e "skin care
 * pele oleosa". Detectar isso depois descreve o estrago. Fundir tudo num
 * Article gigante troca canibalização por artigo sem foco. Nenhum dos dois é
 * formação.
 *
 * A ordem correta é:
 *
 *   KeywordDNA → assinatura semântica → NÚCLEOS temáticos
 *   → deduplicação DENTRO do núcleo → candidatos → SERP valida fronteiras
 *
 * Um núcleo é uma pergunta editorial distinta: uma condição ("pele oleosa"),
 * um ativo ("vitamina C"), uma rotina ("noturno"), um público. Não é um token
 * repetido — é o FOCO que sobra quando o assunto do Silo sai da conta.
 *
 * Nada aqui é hardcode de tema: os núcleos são derivados dos DNAs reais.
 *
 * Domínio puro: sem React, sem storage, sem rede.
 */

import type { KeywordDnaSignals } from "./keyword-dna-signals.ts";
import { intentComparisonKey } from "./keyword-dna-signals.ts";

/* ------------------------- assinatura semântica (§3) --------------------- */

export type KeywordSemanticSignature = {
  keywordId: string;
  text: string;
  /** Tokens de FOCO: o que resta depois de descontar o assunto do Silo. */
  focus: Set<string>;
  /** Tokens de foco que o DNA DECLAROU (problema, modificadores, entidade). */
  declared: Set<string>;
  intent: string | null;
  perceivedProblem: string | null;
  audience: string | null;
  centralEntity: string | null;
  modifiers: readonly string[];
  semanticState: "conclusive" | "non_conclusive" | null;
  volume: number | null;
  kgr: number | null;
  isPublished: boolean;
};

const STOPWORDS = new Set([
  "para", "com", "sem", "que", "dos", "das", "por", "uma", "uns", "seu", "sua",
  "mais", "melhor", "melhores", "como", "qual", "quais", "onde", "quando",
  "the", "and", "for", "nao", "sim",
]);

/** Singular e plural são a mesma palavra para esta pergunta. */
const singular = (token: string) => (token.length >= 5 && token.endsWith("s") ? token.slice(0, -1) : token);

export function semanticTokens(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(token => token.length > 2 && !STOPWORDS.has(token))
    .map(singular);
}

/**
 * O assunto do Silo, em tokens — para ser DESCONTADO.
 *
 * §6: `centralEntity = skincare` em todas as keywords não significa que todas
 * pertencem ao mesmo Article. "skincare" é o contexto do Silo, e contexto
 * comum a todos não distingue ninguém dentro dele.
 *
 * A continência resolve as grafias: `skincare` alcança `skin` e `care`.
 */
export function siloContextTokens(input: {
  name?: string | null;
  centralEntity?: string | null;
  slug?: string | null;
  macroIntent?: string | null;
}): Set<string> {
  const tokens = new Set<string>();
  for (const campo of [input.name, input.centralEntity, (input.slug || "").replace(/[/-]+/g, " ")]) {
    for (const token of semanticTokens(campo)) tokens.add(token);
  }
  return tokens;
}

const doSilo = (token: string, siloTokens: ReadonlySet<string>) =>
  [...siloTokens].some(silo => silo.includes(token) || token.includes(silo));

/**
 * §3 — a assinatura canônica de uma keyword, com os campos REAIS do DNA.
 *
 * Funil entra como apoio editorial em outro lugar; aqui ele não participa,
 * porque TOFU/MOFU/BOFU é estágio e não identidade temática.
 */
export function buildSemanticSignature(input: {
  dna: KeywordDnaSignals;
  siloTokens: ReadonlySet<string>;
  volume?: number | null;
  kgr?: number | null;
  isPublished?: boolean;
}): KeywordSemanticSignature {
  const { dna, siloTokens } = input;

  /*
   * O que o DNA DECLARA sobre o foco vale mais que o que a frase repete.
   *
   * `problema_percebido` e `modificadores` são leitura do Minerador sobre a
   * necessidade; os tokens do texto são só a formulação. Os dois entram, mas
   * a origem é registrada — é ela que decide quem ancora um núcleo.
   */
  const declared = new Set<string>();
  for (const token of semanticTokens(dna.perceivedProblem)) if (!doSilo(token, siloTokens)) declared.add(token);
  for (const modificador of dna.modifiers) {
    for (const token of semanticTokens(modificador)) if (!doSilo(token, siloTokens)) declared.add(token);
  }
  for (const token of semanticTokens(dna.centralEntity)) if (!doSilo(token, siloTokens)) declared.add(token);
  for (const token of semanticTokens(dna.audience)) if (!doSilo(token, siloTokens)) declared.add(token);

  const focus = new Set(declared);
  for (const token of semanticTokens(dna.text)) if (!doSilo(token, siloTokens)) focus.add(token);

  return {
    keywordId: dna.keywordId,
    text: dna.text,
    focus,
    declared,
    intent: intentComparisonKey(dna.intent),
    perceivedProblem: dna.perceivedProblem,
    audience: dna.audience,
    centralEntity: dna.centralEntity,
    modifiers: dna.modifiers,
    semanticState: dna.semanticState,
    volume: input.volume ?? null,
    kgr: input.kgr ?? null,
    isPublished: Boolean(input.isPublished),
  };
}

/* ---------------------------- núcleos (§5/§6/§7) ------------------------- */

export type SemanticNucleus = {
  /** Identidade estável do núcleo, derivada da âncora. */
  nucleusKey: string;
  /** Rótulo legível: o tema, para a tela. */
  label: string;
  /** Os tokens que sustentam este núcleo. */
  anchors: string[];
  keywordIds: string[];
  /** Por que estas keywords estão juntas. Só sinal REALMENTE usado. */
  reasons: string[];
};

export type NucleusPartition = {
  nuclei: SemanticNucleus[];
  /** Por que dois núcleos vizinhos não viraram um. Só sinal realmente usado. */
  separations: Array<{ left: string; right: string; reasons: string[] }>;
};

/** Um token vale mais quando o DNA o DECLAROU, não quando a frase o repetiu. */
const PESO_DECLARADO = 2;
const PESO_LEXICAL = 1;

/**
 * O nome do tema, em linguagem de gente.
 *
 * Ordenar os tokens em alfabética produzia "acne oleosa pele" para o núcleo
 * que qualquer pessoa chama de "pele oleosa". O rótulo sai dos tokens que
 * TODOS os membros compartilham — o que só um deles traz é qualificação, não
 * o tema — na ordem em que aparecem na busca mais curta do núcleo, que é a
 * formulação mais direta dele.
 */
function rotuloDoFoco(membros: readonly KeywordSemanticSignature[], fallback: string): string {
  const comuns = [...membros[0].focus].filter(token => membros.every(membro => membro.focus.has(token)));
  if (!comuns.length) return fallback;
  const maisCurta = [...membros].sort((a, b) => a.text.length - b.text.length || a.text.localeCompare(b.text))[0];
  const ordem = semanticTokens(maisCurta.text);
  const ordenados = [
    ...ordem.filter(token => comuns.includes(token)),
    ...comuns.filter(token => !ordem.includes(token)).sort(),
  ];
  return ordenados.join(" ") || fallback;
}

/**
 * §5/§6/§7 — particionar o Silo em focos editoriais distintos.
 *
 * O critério é ÂNCORA: um token de foco que aparece em mais de uma keyword
 * nomeia um tema recorrente; um token que aparece uma vez só qualifica aquela
 * busca. As âncoras são disputadas por peso — declarado pelo DNA pesa o dobro
 * do que só aparece no texto — e o núcleo mais forte serve primeiro.
 *
 * Keyword sem âncora compartilhada vira núcleo próprio: separar é o padrão, e
 * juntar exige evidência. É isso que impede "vitamina C" de ser absorvida por
 * "pele oleosa" só porque as duas dizem "skin care".
 *
 * Intenção DIVERGENTE quebra o núcleo mesmo com âncora comum: duas buscas que
 * pedem coisas diferentes não são o mesmo artigo. Intenção ausente não separa
 * — ausência não é divergência.
 */
export function deriveSemanticNuclei(input: {
  signatures: readonly KeywordSemanticSignature[];
  /** Mínimo de keywords para um token virar âncora de tema. */
  anchorFloor?: number;
}): NucleusPartition {
  const piso = input.anchorFloor ?? 2;
  const pendentes = new Map(input.signatures.map(item => [item.keywordId, item]));
  const nuclei: SemanticNucleus[] = [];
  const separations: NucleusPartition["separations"] = [];

  const pesoDe = (token: string, assinatura: KeywordSemanticSignature) =>
    assinatura.declared.has(token) ? PESO_DECLARADO : PESO_LEXICAL;

  while (pendentes.size) {
    const restantes = [...pendentes.values()];

    // Quem é âncora agora: peso somado sobre as keywords que ainda não têm
    // núcleo. Recontar a cada rodada é o que impede um tema já servido de
    // continuar puxando keywords de outro.
    const peso = new Map<string, { total: number; keywords: string[] }>();
    for (const assinatura of restantes) {
      for (const token of assinatura.focus) {
        const atual = peso.get(token) || { total: 0, keywords: [] };
        atual.total += pesoDe(token, assinatura);
        atual.keywords.push(assinatura.keywordId);
        peso.set(token, atual);
      }
    }

    const ancora = [...peso.entries()]
      .filter(([, dados]) => dados.keywords.length >= piso)
      .sort((a, b) => b[1].total - a[1].total || b[1].keywords.length - a[1].keywords.length || a[0].localeCompare(b[0]))[0];

    if (!ancora) {
      // Sem tema recorrente: cada busca restante é a própria pergunta.
      for (const assinatura of restantes) {
        nuclei.push({
          nucleusKey: `nucleo:${assinatura.keywordId}`,
          label: assinatura.perceivedProblem || rotuloDoFoco([assinatura], assinatura.text),
          anchors: [...assinatura.focus].sort(),
          keywordIds: [assinatura.keywordId],
          reasons: ["foco próprio: nenhuma outra busca do Silo compartilha este tema"],
        });
        pendentes.delete(assinatura.keywordId);
      }
      break;
    }

    const [token, dados] = ancora;
    const membros = dados.keywords
      .map(keywordId => pendentes.get(keywordId))
      .filter((item): item is KeywordSemanticSignature => Boolean(item));

    /*
     * §8 — intenção divergente preserva candidatos distintos.
     *
     * A intenção mais frequente do núcleo é a de referência; quem declara
     * outra sai e disputa a próxima rodada. Quem não declara nenhuma fica:
     * ausência não é divergência.
     */
    const contagem = new Map<string, number>();
    for (const membro of membros) if (membro.intent) contagem.set(membro.intent, (contagem.get(membro.intent) || 0) + 1);
    const intencaoDoNucleo = [...contagem.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    const dentro: KeywordSemanticSignature[] = [];
    for (const membro of membros) {
      if (intencaoDoNucleo && membro.intent && membro.intent !== intencaoDoNucleo) {
        separations.push({
          left: membro.keywordId,
          right: `nucleo:${token}`,
          reasons: [`intenção declarada diferente (${membro.intent} × ${intencaoDoNucleo})`],
        });
        continue;
      }
      dentro.push(membro);
    }

    if (dentro.length < piso) {
      // O núcleo desmanchou por divergência de intenção: a âncora deixa de
      // valer nesta rodada e as buscas voltam a disputar sozinhas.
      for (const assinatura of dentro) {
        nuclei.push({
          nucleusKey: `nucleo:${assinatura.keywordId}`,
          label: assinatura.perceivedProblem || rotuloDoFoco([assinatura], assinatura.text),
          anchors: [...assinatura.focus].sort(),
          keywordIds: [assinatura.keywordId],
          reasons: ["foco próprio: a intenção declarada separa esta busca das demais do tema"],
        });
        pendentes.delete(assinatura.keywordId);
      }
      continue;
    }

    const declarado = dentro.some(membro => membro.declared.has(token));
    const reasons = [
      declarado
        ? `foco compartilhado, declarado no KeywordDNA: ${token}`
        : `foco compartilhado nas formulações: ${token}`,
    ];
    const problemas = [...new Set(dentro.map(membro => membro.perceivedProblem).filter(Boolean))];
    if (problemas.length === 1) reasons.push(`mesmo problema percebido: ${problemas[0]}`);
    const modificadores = [...new Set(dentro.flatMap(membro => membro.modifiers))];
    if (modificadores.length) reasons.push(`modificadores relacionados: ${modificadores.join(", ")}`);
    if (intencaoDoNucleo) reasons.push(`intenção compatível: ${intencaoDoNucleo}`);

    const rotulo = problemas[0] || rotuloDoFoco(dentro, token);

    nuclei.push({
      nucleusKey: `nucleo:${token}`,
      label: rotulo,
      anchors: [token],
      keywordIds: dentro.map(membro => membro.keywordId),
      reasons,
    });
    for (const membro of dentro) pendentes.delete(membro.keywordId);
  }

  // Ordem estável: a mesma entrada precisa produzir a mesma partição.
  nuclei.sort((a, b) => b.keywordIds.length - a.keywordIds.length || a.nucleusKey.localeCompare(b.nucleusKey));
  for (const nucleo of nuclei) nucleo.keywordIds.sort();
  return { nuclei, separations };
}

/* --------------------------- teto de keywords (§14) ---------------------- */

/**
 * §14 — um núcleo maior que o teto só se divide numa fronteira REAL.
 *
 * Dividir para caber seria criar dois artigos sobre o mesmo assunto, que é
 * exatamente a canibalização que a partição existe para evitar. Quando não há
 * fronteira, o núcleo continua inteiro e o excedente vira transbordo — visível
 * e decidido por gente, não cortado em silêncio.
 */
export function splitNucleusIfEditorialBoundary(input: {
  nucleus: SemanticNucleus;
  signatures: readonly KeywordSemanticSignature[];
  ceiling: number;
}): SemanticNucleus[] {
  const { nucleus, ceiling } = input;
  if (nucleus.keywordIds.length <= ceiling) return [nucleus];

  const porId = new Map(input.signatures.map(item => [item.keywordId, item]));
  const membros = nucleus.keywordIds
    .map(id => porId.get(id))
    .filter((item): item is KeywordSemanticSignature => Boolean(item));

  // Uma fronteira real é um SEGUNDO foco declarado que parte o núcleo em dois
  // grupos com pelo menos duas buscas cada — e nunca a âncora que o formou.
  const secundarios = new Map<string, string[]>();
  for (const membro of membros) {
    for (const token of membro.declared) {
      if (nucleus.anchors.includes(token)) continue;
      secundarios.set(token, [...(secundarios.get(token) || []), membro.keywordId]);
    }
  }
  const fronteira = [...secundarios.entries()]
    .filter(([, ids]) => ids.length >= 2 && ids.length <= membros.length - 2)
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))[0];

  if (!fronteira) return [nucleus];

  const [token, ids] = fronteira;
  const dentro = new Set(ids);
  return [
    {
      ...nucleus,
      nucleusKey: `${nucleus.nucleusKey}+${token}`,
      label: `${nucleus.label} · ${token}`,
      anchors: [...nucleus.anchors, token],
      keywordIds: [...dentro].sort(),
      reasons: [...nucleus.reasons, `fronteira editorial real dentro do tema: ${token}`],
    },
    {
      ...nucleus,
      keywordIds: nucleus.keywordIds.filter(id => !dentro.has(id)),
      reasons: [...nucleus.reasons, `separado de "${token}", que sustenta artigo próprio`],
    },
  ];
}
