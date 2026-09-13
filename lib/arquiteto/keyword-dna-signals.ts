/**
 * A ÚNICA INTERPRETAÇÃO DO KEYWORDDNA.
 *
 * Nasceu dentro do módulo da proposta de arquitetura, porque foi a fase Silos
 * que precisou dela primeiro. A fase Artigos precisa exatamente da mesma
 * leitura — e uma segunda interpretação do mesmo payload é como o painel e a
 * justificativa passaram a discordar sobre a mesma keyword em 2026-09-08.
 *
 * Por isso ela vive aqui: nenhuma das duas fases é dona dela.
 *
 * Domínio puro: sem React, sem storage, sem rede.
 */

export type KeywordDnaSignals = {
  keywordId: string;
  text: string;
  /** `semanticQualification.intent` — NÃO a coluna `intent`, que fica "Pendente". */
  intent: string | null;
  /** `intencao_secundaria` — apoio, nunca identidade. */
  secondaryIntent: string | null;
  funnel: string | null;
  semanticState: "conclusive" | "non_conclusive" | null;
  confidence: string | null;
  centralEntity: string | null;
  /** `analise_semantica.modificadores` — sinal temático, não estágio. */
  modifiers: string[];
  /**
   * O RESTO DO DNA, que o motor nunca leu.
   *
   * `keyword-dna-engine` produz vinte e poucos campos por keyword; esta
   * função lia cinco. Problema percebido, público e resultado desejado são
   * exatamente o que separa "pele oleosa" de "acne" dentro do mesmo Silo —
   * e ficavam gravados sem ninguém consultar.
   */
  perceivedProblem: string | null;
  audience: string | null;
  desiredResult: string | null;
  editorialType: string | null;
  awarenessLevel: string | null;
  journeyStage: string | null;
  /** `risco_canibalizacao`: o próprio DNA já avisa quando o termo é amplo. */
  cannibalizationNote: string | null;
  /** Proveniência: a versão exata em que a decisão se apoia. */
  dnaVersionId: string | null;
  dnaContentHash: string | null;
};

/**
 * "PENDENTE" NÃO É INTENÇÃO.
 *
 * O Minerador usa marcadores operacionais para dizer "ainda não decidi". Eles
 * têm a forma de um valor, e foi assim que "Pendente" virou uma intenção
 * comparável: um Silo com `macroIntent = "Pendente"` passou a CONFLITAR com
 * uma keyword Informativa, e a proposta recusou a associação por um conflito
 * que não existe.
 *
 * O mesmo valia em Artigos pelo avesso: duas keywords "Pendente" contavam
 * como "mesma intenção" e ganhavam pontos de convergência por um campo que
 * ninguém preencheu.
 *
 * Ausência é ausência. Aqui ela vira `null`, e `null` nem conflita nem apoia.
 */
const MARCADORES_SEM_INTENCAO = new Set([
  "pendente", "pending", "unknown", "desconhecida", "desconhecido",
  "indefinido", "indefinida", "nao definido", "nao definida", "n/a", "na", "-", "",
]);

/** Normalização só para COMPARAR intenções; nada é reescrito. */
export function intentComparisonKey(value: string | null | undefined): string | null {
  if (!value) return null;
  const limpo = value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  if (!limpo || MARCADORES_SEM_INTENCAO.has(limpo)) return null;
  return limpo;
}

/** A intenção é dado editorial de verdade, e não um marcador de pendência. */
export function intentIsKnown(value: string | null | undefined): boolean {
  return intentComparisonKey(value) !== null;
}

/**
 * Lê o KeywordDNA canônico de uma keyword.
 *
 * Motor de Silos, motor de Artigos, justificativa e painel de inspeção passam
 * todos por aqui. Campo ausente vira `null` — a ausência é declarada, nunca
 * preenchida por conveniência.
 */
export function resolveKeywordDnaSignals(input: {
  keywordId: string;
  text: string;
  /** `payload.semanticQualification` do item de workflow. */
  semanticQualification?: Record<string, unknown> | null;
  /** `analise_semantica` da linha do Minerador. */
  semantic?: Record<string, unknown> | null;
}): KeywordDnaSignals {
  const texto = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);
  const qualificacao = input.semanticQualification || {};
  const semantica = input.semantic || {};
  const intentBruto = texto(qualificacao.intent) || texto(semantica.intencao_principal);

  /*
   * `modificadores` É STRING, NÃO ARRAY.
   *
   * `KeywordSemanticRecord` é `Record<string, string>` e o motor grava
   * `modificadores: keywordModifiers.join(", ")`. Ler com `Array.isArray`
   * devolvia `[]` SEMPRE — e como esta função é a autoridade única do DNA, o
   * sinal de modificadores estava desligado nas duas fases desde que ela
   * nasceu. `lib/arquiteto/adapters.ts` sempre leu certo; era esta que estava
   * errada.
   *
   * O array continua sendo aceito: um payload futuro que já venha estruturado
   * não precisa passar pela string.
   */
  const listaDeTexto = (value: unknown): string[] => {
    if (Array.isArray(value)) return value.map(item => String(item).trim()).filter(Boolean);
    const bruto = texto(value);
    if (!bruto) return [];
    // "Nenhum modificador explícito" é a ausência dita pelo motor, não um dado.
    if (/^nenhum/i.test(bruto)) return [];
    return bruto.split(/[,;]/).map(item => item.trim()).filter(Boolean);
  };

  /*
   * Ausência declarada pelo motor não vira dado.
   *
   * "Problema não determinado pela keyword" é o jeito do motor dizer que não
   * apurou — a marca está no MEIO da frase, não no começo. Tratá-la como
   * problema percebido faria oito keywords compartilharem o mesmo "tema".
   */
  const semPlaceholder = (value: string | null) =>
    value && !/n[aã]o determinad/i.test(value) && !/^(nenhum|a confirmar|pendente)/i.test(value)
      ? value
      : null;

  return {
    keywordId: input.keywordId,
    text: input.text,
    intent: intentIsKnown(intentBruto) ? intentBruto : null,
    secondaryIntent: intentIsKnown(texto(semantica.intencao_secundaria)) ? texto(semantica.intencao_secundaria) : null,
    funnel: texto(qualificacao.funnel),
    semanticState: qualificacao.semanticState === "conclusive" || qualificacao.semanticState === "non_conclusive"
      ? qualificacao.semanticState
      : null,
    confidence: texto(semantica.dna_confianca),
    centralEntity: texto(semantica.entidade_central),
    modifiers: listaDeTexto(semantica.modificadores),
    perceivedProblem: semPlaceholder(texto(semantica.problema_percebido)),
    audience: semPlaceholder(texto(semantica.publico)),
    desiredResult: semPlaceholder(texto(semantica.resultado_desejado)),
    editorialType: semPlaceholder(texto(semantica.tipo_editorial) || texto(semantica.formato_esperado)),
    awarenessLevel: semPlaceholder(texto(semantica.nivel_consciencia)),
    journeyStage: semPlaceholder(texto(semantica.etapa_jornada)),
    cannibalizationNote: semPlaceholder(texto(semantica.risco_canibalizacao)),
    dnaVersionId: texto(qualificacao.versionId),
    dnaContentHash: texto(qualificacao.contentHash),
  };
}
