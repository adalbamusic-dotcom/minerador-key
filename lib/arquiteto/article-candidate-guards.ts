/**
 * O QUE UM CANDIDATO A ARTICLE NÃO PODE FAZER.
 *
 * A homologação de 2026-09-08 mostrou dois estragos de SEO que o agrupador
 * provisório produzia sem perceber:
 *
 *   1. a keyword `skincare` era a identidade da SiloPage `/skincare` E virou
 *      Principal de um Article com slug `skincare` — a página do Silo
 *      competindo com um artigo do próprio Silo;
 *
 *   2. `skin care para peles oleosas` e `skin care pele oleosa` viraram dois
 *      candidatos sobre o mesmo assunto, com slugs quase idênticos.
 *
 * Este módulo detecta as duas coisas. Ele NÃO decide: quem separa canibalização
 * de fato é a SERP, dentro de `Processar artigos`. Aqui a hipótese é marcada.
 *
 * Domínio puro: sem React, sem storage, sem rede.
 */

import { identityCore } from "./architecture-working-proposal.ts";
import { intentComparisonKey } from "./keyword-dna-signals.ts";

/* ------------------------------------------------ §1 · a SiloPage manda */

export type SiloPageIdentity = {
  /** Endereço da SiloPage, com ou sem barra inicial. */
  slug: string | null;
  /** Entidade central declarada do Silo. */
  centralEntity: string | null;
  /** Nome do Silo, quando é o que existe. */
  name: string | null;
};

/** Normaliza um slug/termo para comparação: sem barra, sem acento, sem ruído. */
export function slugKey(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/^\/+|\/+$/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * §1/§2/§10 — quais keywords do Silo estão RESERVADAS para a SiloPage.
 *
 * A reserva vinha de uma heurística de cluster (`qualifiesAsNewSiloHead`), que
 * chuta qual keyword *poderia* liderar um Silo. Depois que a fase Silos fecha,
 * a identidade da SiloPage é FATO — e é dela que a reserva tem de sair.
 *
 * Reservar NÃO é apagar: a keyword continua no universo semântico do Silo,
 * como seed, contexto e referência de centralidade. O que ela não pode é
 * formar Article próprio e competir com a página que ela mesma representa.
 */
export function reservedForSiloPage(input: {
  siloPage: SiloPageIdentity;
  keywords: readonly { keywordId: string; text: string }[];
}): Set<string> {
  const alvos = new Set(
    [input.siloPage.slug, input.siloPage.centralEntity, input.siloPage.name]
      .map(slugKey)
      .filter(Boolean),
  );
  if (!alvos.size) return new Set();
  const reservadas = new Set<string>();
  for (const keyword of input.keywords) {
    if (alvos.has(slugKey(keyword.text))) reservadas.add(keyword.keywordId);
  }
  return reservadas;
}

/* ------------------------------------------- §6 · colisão de endereço */

export type SlugCollision = {
  candidateRef: string;
  slug: string;
  kind: "EXACT_SLUG_COLLISION" | "NEAR_TOPIC_COLLISION";
  /** Com quem colide, em linguagem de tela. */
  against: string;
  detail: string;
};

export type CandidateSlugInput = {
  candidateRef: string;
  slug: string | null;
  label: string;
};

/**
 * §6 — o endereço do Article não pode colidir com o do Silo nem com o de outro.
 *
 * Exata é bloqueio: duas páginas no mesmo endereço é erro, não risco. Próxima
 * é sinalização — a SERP é quem dirá se os dois assuntos são o mesmo.
 */
export function detectSlugCollisions(input: {
  candidates: readonly CandidateSlugInput[];
  siloPage: SiloPageIdentity;
  /** Slugs de ArticleDNA já aprovados no mesmo Silo. */
  approvedSlugs?: readonly string[];
}): SlugCollision[] {
  const colisoes: SlugCollision[] = [];
  const doSilo = slugKey(input.siloPage.slug);
  const aprovados = new Set((input.approvedSlugs || []).map(slugKey).filter(Boolean));
  const vistos = new Map<string, CandidateSlugInput>();

  for (const candidato of input.candidates) {
    const chave = slugKey(candidato.slug);
    if (!chave) continue;

    if (doSilo && chave === doSilo) {
      colisoes.push({
        candidateRef: candidato.candidateRef,
        slug: chave,
        kind: "EXACT_SLUG_COLLISION",
        against: "a SiloPage deste Silo",
        detail: `"${candidato.label}" ocuparia o mesmo endereço da SiloPage (/${chave}).`,
      });
      continue;
    }
    if (aprovados.has(chave)) {
      colisoes.push({
        candidateRef: candidato.candidateRef,
        slug: chave,
        kind: "EXACT_SLUG_COLLISION",
        against: "um ArticleDNA aprovado deste Silo",
        detail: `"${candidato.label}" ocuparia o endereço de um artigo já aprovado (/${chave}).`,
      });
      continue;
    }
    const anterior = vistos.get(chave);
    if (anterior) {
      colisoes.push({
        candidateRef: candidato.candidateRef,
        slug: chave,
        kind: "EXACT_SLUG_COLLISION",
        against: `o candidato "${anterior.label}"`,
        detail: `"${candidato.label}" e "${anterior.label}" disputam o mesmo endereço (/${chave}).`,
      });
      continue;
    }
    vistos.set(chave, candidato);
  }

  /*
   * ENDEREÇO QUASE IGUAL TAMBÉM É DISPUTA.
   *
   * "skin-care-pele-oleosa" e "skin-care-para-peles-oleosas" não colidem
   * literalmente, e foi por isso que os dois passaram. Mas um contém o outro
   * palavra por palavra — é o mesmo endereço com uma preposição no meio.
   *
   * Isto NÃO é bloqueio: é o mesmo tipo de hipótese que a SERP resolve. O
   * critério é contenção de conjunto, não semelhança de string, para não
   * acusar "skin-care-noturno" e "skin-care-nivea", que só dividem o Silo.
   */
  const palavrasDo = (chave: string) => new Set(chave
    .split("-")
    .filter(token => token.length > 2)
    .map(token => (token.length >= 5 && token.endsWith("s") ? token.slice(0, -1) : token)));

  const comparaveis = [...vistos.entries()];
  for (let i = 0; i < comparaveis.length; i += 1) {
    for (let j = i + 1; j < comparaveis.length; j += 1) {
      const [chaveE, esquerda] = comparaveis[i];
      const [chaveD, direita] = comparaveis[j];
      const palavrasE = palavrasDo(chaveE);
      const palavrasD = palavrasDo(chaveD);
      if (!palavrasE.size || !palavrasD.size) continue;
      const contem = [...palavrasE].every(token => palavrasD.has(token))
        || [...palavrasD].every(token => palavrasE.has(token));
      if (!contem) continue;
      colisoes.push({
        candidateRef: direita.candidateRef,
        slug: chaveD,
        kind: "NEAR_TOPIC_COLLISION",
        against: `o candidato "${esquerda.label}"`,
        detail: `/${chaveD} e /${chaveE} são o mesmo endereço com outra formulação.`,
      });
    }
  }
  return colisoes;
}

/* --------------------------------- §3/§4 · risco de sobreposição */

export type CandidateOverlapInput = {
  candidateRef: string;
  label: string;
  /** Slug proposto, quando já existe. */
  slug: string | null;
  members: readonly {
    keywordId: string;
    text: string;
    intent: string | null;
    centralEntity: string | null;
    modifiers: readonly string[];
    semanticState: "conclusive" | "non_conclusive" | null;
  }[];
};

export type CandidateOverlapRisk = {
  left: string;
  right: string;
  /** 0–1; quanto os dois candidatos se sobrepõem tematicamente. */
  score: number;
  /** Os sinais que produziram o risco, para a tela mostrar. */
  reasons: string[];
  /**
   * `true` quando o DNA declara intenções DIFERENTES para os dois.
   *
   * Aí a separação tem lastro e a SERP só precisa confirmar. Sem isso, a
   * hipótese padrão é que são o mesmo assunto dito de dois jeitos.
   */
  intentsDiverge: boolean;
};

/**
 * O TERMO DO SILO NÃO DISTINGUE NINGUÉM DENTRO DELE.
 *
 * `identityCore` compara textos soltos, e dentro de um Silo todo candidato
 * repete o termo do Silo: "skin care noturno" e "skin care nivea" dividem
 * `skin`, `care` e `skincare` por construção. Comparados crus, os dois dão
 * 0,43 de sobreposição léxica e a portaria acusaria canibalização entre uma
 * rotina noturna e uma marca — travando a formação inteira com ruído.
 *
 * O que distingue é o que SOBRA depois de tirar o Silo. Por isso o núcleo
 * distintivo remove todo token contido no — ou que contém o — termo do Silo:
 * `skincare` alcança `skin` e `care` por continência, que é como as duas
 * grafias se encontram.
 *
 * Singular e plural são a mesma palavra para esta pergunta: "peles oleosas" e
 * "pele oleosa" são o mesmo assunto, e era exatamente esse par que passou.
 */
const singular = (token: string) => (token.length >= 5 && token.endsWith("s") ? token.slice(0, -1) : token);

function nucleoDistintivo(texto: string, tokensDoSilo: ReadonlySet<string>): Set<string> {
  const bruto = [...identityCore(texto)];
  const normalizados = new Set<string>();
  for (const token of bruto) normalizados.add(singular(token));
  // `identityCore` monta os pares antes da singularização; refaz os pares
  // sobre o texto já singularizado para que "peles oleosas" e "pele oleosa"
  // produzam o mesmo `peleoleosa`.
  const palavras = texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(token => token.length > 2)
    .map(singular);
  for (let index = 0; index < palavras.length - 1; index += 1) {
    normalizados.add(palavras[index] + palavras[index + 1]);
  }

  const distintivo = new Set<string>();
  for (const token of normalizados) {
    const doSilo = [...tokensDoSilo].some(silo => silo.includes(token) || token.includes(silo));
    if (!doSilo) distintivo.add(token);
  }
  return distintivo;
}

const nucleoDoCandidato = (candidato: CandidateOverlapInput, tokensDoSilo: ReadonlySet<string>) =>
  nucleoDistintivo([candidato.label, ...candidato.members.map(item => item.text)].join(" "), tokensDoSilo);

const intencaoDoCandidato = (candidato: CandidateOverlapInput): string | null => {
  const contagem = new Map<string, number>();
  for (const membro of candidato.members) {
    const chave = intentComparisonKey(membro.intent);
    if (chave) contagem.set(chave, (contagem.get(chave) || 0) + 1);
  }
  return [...contagem.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
};

/**
 * §3 — dois candidatos do mesmo Silo estão falando do mesmo assunto?
 *
 * O agrupador provisório separou `skin care para peles oleosas` de
 * `skin care pele oleosa`. Deixar os dois virarem ArticleDNA sem confronto é
 * criar canibalização por omissão.
 *
 * Isto é HIPÓTESE, não decisão: quem resolve MERGE ou KEEP_SEPARATE é a SERP,
 * dentro de `Processar artigos`.
 */
export function detectCandidateOverlap(input: {
  candidates: readonly CandidateOverlapInput[];
  /**
   * A identidade do Silo em que os candidatos vivem.
   *
   * Sem ela a comparação é entre textos soltos e o termo do Silo — repetido
   * por todos — vira falsa evidência. Com ela, o Silo é descontado dos dois
   * lados e sobra o que de fato distingue um candidato do outro.
   */
  siloPage?: SiloPageIdentity;
  /** A partir de quanto a sobreposição vira risco declarado. */
  threshold?: number;
}): CandidateOverlapRisk[] {
  const limite = input.threshold ?? 0.5;
  const riscos: CandidateOverlapRisk[] = [];

  const identidadeDoSilo = [input.siloPage?.slug, input.siloPage?.centralEntity, input.siloPage?.name]
    .filter((valor): valor is string => Boolean(valor))
    .join(" ");
  const tokensDoSilo = identidadeDoSilo
    ? new Set([...identityCore(identidadeDoSilo)].map(singular).filter(token => token.length >= 3))
    : new Set<string>();
  const entidadeDoSilo = slugKey(input.siloPage?.centralEntity ?? null);

  for (let i = 0; i < input.candidates.length; i += 1) {
    for (let j = i + 1; j < input.candidates.length; j += 1) {
      const esquerda = input.candidates[i];
      const direita = input.candidates[j];
      const reasons: string[] = [];

      const nucleoE = nucleoDoCandidato(esquerda, tokensDoSilo);
      const nucleoD = nucleoDoCandidato(direita, tokensDoSilo);
      const comuns = [...nucleoE].filter(token => nucleoD.has(token)).length;
      const uniao = new Set([...nucleoE, ...nucleoD]).size;
      const lexical = uniao ? comuns / uniao : 0;
      if (lexical >= 0.4) reasons.push("as formulações compartilham o núcleo");

      /*
       * A entidade do próprio Silo não conta.
       *
       * Todo artigo de um Silo de skincare tem `skincare` como entidade
       * central; usar isso como prova de sobreposição acusaria o Silo inteiro.
       * Só uma entidade MAIS ESPECÍFICA que a do Silo — "pele oleosa" — diz
       * que dois candidatos estão disputando o mesmo assunto.
       */
      const entidadesDe = (candidato: CandidateOverlapInput) => new Set(candidato.members
        .filter(item => item.semanticState === "conclusive" && item.centralEntity)
        .map(item => slugKey(item.centralEntity))
        .filter(chave => Boolean(chave) && chave !== entidadeDoSilo));
      const entidadesE = entidadesDe(esquerda);
      const entidadesD = entidadesDe(direita);
      const mesmaEntidade = [...entidadesE].some(item => entidadesD.has(item));
      if (mesmaEntidade) reasons.push("mesma entidade central no KeywordDNA");

      const modificadoresDe = (candidato: CandidateOverlapInput) => new Set(candidato.members
        .flatMap(item => item.modifiers)
        .map(slugKey)
        .filter(chave => Boolean(chave) && chave !== entidadeDoSilo && !tokensDoSilo.has(chave)));
      const modsE = modificadoresDe(esquerda);
      const modsD = modificadoresDe(direita);
      const modsComuns = [...modsE].filter(item => modsD.has(item)).length;
      if (modsComuns) reasons.push("modificadores em comum");

      const intencaoE = intencaoDoCandidato(esquerda);
      const intencaoD = intencaoDoCandidato(direita);
      const intentsDiverge = Boolean(intencaoE && intencaoD && intencaoE !== intencaoD);
      if (intentsDiverge) reasons.push(`intenções declaradas diferentes (${intencaoE} × ${intencaoD})`);

      const score = Math.min(1, lexical + (mesmaEntidade ? 0.3 : 0) + (modsComuns ? 0.1 : 0));
      if (score < limite) continue;

      riscos.push({ left: esquerda.candidateRef, right: direita.candidateRef, score, reasons, intentsDiverge });
    }
  }
  return riscos;
}

/**
 * §5 — a canibalização está resolvida?
 *
 * Um risco só está resolvido quando a SERP confrontou os dois candidatos e o
 * veredito ficou registrado. Intenções divergentes no DNA são lastro para
 * suspeitar de separação, mas não substituem a evidência.
 */
export function unresolvedCannibalization(input: {
  risks: readonly CandidateOverlapRisk[];
  /** Pares já confrontados pela SERP, em qualquer ordem. */
  resolvedPairs?: readonly { left: string; right: string }[];
}): CandidateOverlapRisk[] {
  const chave = (left: string, right: string) => [left, right].sort().join("::");
  const resolvidos = new Set((input.resolvedPairs || []).map(item => chave(item.left, item.right)));
  return input.risks.filter(risco => !resolvidos.has(chave(risco.left, risco.right)));
}
