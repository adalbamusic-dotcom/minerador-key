import {
  ARTICLE_FORMATION_REF_PREFIX,
  isArticleFormationRef,
  type ArticleFormationDecision,
  type ArticleFormationOperation,
  type ArticleFormationRole,
} from "./article-formation-decision.ts";
import type { ArticleCandidate, ArticleFormationUniverse } from "./article-formation.ts";

/**
 * PLANEJAMENTO DAS EDIÇÕES HUMANAS DA FORMAÇÃO.
 *
 * Quatro ações: mover keyword, juntar candidatos, separar keyword, trocar a
 * principal. Todas escrevem no MESMO lugar onde a membership já mora — o
 * payload do item de workflow da keyword — pelo writer que já existe
 * (`persistArchitectWorkingCopy`, com `expectedLock`). Nenhuma persistência
 * paralela, nenhum subject_type novo.
 *
 * Este módulo só PLANEJA: devolve os patches e as recusas. Quem escreve é o
 * chamador, e o resultado é lido de volta do remoto.
 *
 * Nada aqui cria ArticleDNA. Formação revisada continua sendo working state.
 *
 * Domínio puro: sem storage, sem fetch.
 */

export type FormationKeywordLike = {
  keywordId: string;
  workflowItemId: string;
  lockVersion: number;
};

export type FormationPatch = {
  workflowItemId: string;
  expectedLock: number;
  keywordId: string;
  assignment: {
    articleFormationRef: string;
    articleFormationDecision: ArticleFormationDecision;
  };
};

export const FORMATION_REFUSAL_CODES = [
  "KEYWORD_NOT_IN_UNIVERSE",
  "KEYWORD_WITHOUT_WORKFLOW_ITEM",
  "CANDIDATE_NOT_FOUND",
  "CANDIDATES_IN_DIFFERENT_SILOS",
  "MERGE_EXCEEDS_CEILING",
  "SPLIT_LEAVES_CANDIDATE_EMPTY",
  "PRINCIPAL_NOT_IN_CANDIDATE",
  "PUBLISHED_KEYWORD_IS_PROTECTED",
] as const;
export type FormationRefusalCode = (typeof FORMATION_REFUSAL_CODES)[number];

export type FormationPlan = {
  patches: FormationPatch[];
  refusals: { code: FormationRefusalCode; detail: string }[];
};

/** Teto do Article — repetido aqui como guarda, não como segunda autoridade. */
const CEILING = 6;

const refusal = (code: FormationRefusalCode, detail: string): FormationPlan =>
  ({ patches: [], refusals: [{ code, detail }] });

/** `article-formation:<uuid>` — identidade nova para um agrupamento revisado. */
export function newFormationRef(uuid: string): string {
  return `${ARTICLE_FORMATION_REF_PREFIX}${uuid}`;
}

/**
 * A identidade que a decisão humana vai usar.
 *
 * O ref do candidato calculado é `article-candidate:<silo>:<principal>` — ele
 * EMBUTE a principal. Guardar a decisão nele faria a identidade mudar junto
 * com a escolha que a decisão registra, e o ponteiro apontaria para um
 * candidato que não existe mais.
 *
 * Por isso: candidato já revisado mantém sua identidade; candidato calculado
 * ganha uma `article-formation:` estável no momento da primeira decisão.
 */
export function stableFormationRef(candidateRef: string, mintUuid: string): string {
  return isArticleFormationRef(candidateRef) ? candidateRef : newFormationRef(mintUuid);
}

function decision(
  operation: ArticleFormationOperation,
  role: ArticleFormationRole,
  reason: string,
  decidedAt: string,
): ArticleFormationDecision {
  return { operation, role, reason, source: "human", decidedAt };
}

function patchFor(input: {
  keywordId: string;
  keywords: readonly FormationKeywordLike[];
  formationRef: string;
  decision: ArticleFormationDecision;
}): FormationPatch | null {
  const item = input.keywords.find(keyword => keyword.keywordId === input.keywordId);
  if (!item) return null;
  return {
    workflowItemId: item.workflowItemId,
    expectedLock: item.lockVersion,
    keywordId: input.keywordId,
    assignment: {
      articleFormationRef: input.formationRef,
      articleFormationDecision: input.decision,
    },
  };
}

/** Todas as keywords de um candidato, incluindo o excesso além do teto. */
function keywordIdsOf(candidate: ArticleCandidate): string[] {
  return [...candidate.keywords.map(item => item.keywordId), ...candidate.overflowKeywordIds];
}

/**
 * §21 MOVER — a keyword passa a pertencer a outro candidato.
 *
 * O candidato de destino já tem identidade; o de origem simplesmente deixa de
 * contar com ela na próxima leitura. Nenhuma linha do candidato de origem
 * precisa ser reescrita: a composição é derivada das keywords.
 */
export function planMoveKeyword(input: {
  universe: ArticleFormationUniverse;
  keywords: readonly FormationKeywordLike[];
  keywordId: string;
  targetCandidateRef: string;
  /** UUID para a identidade estável, quando o destino ainda é calculado. */
  mintUuid: string;
  decidedAt: string;
}): FormationPlan {
  const destino = input.universe.candidates.find(item => item.candidateRef === input.targetCandidateRef);
  if (!destino) return refusal("CANDIDATE_NOT_FOUND", "O artigo de destino não existe neste Silo.");
  if (!input.universe.keywordIds.includes(input.keywordId)) {
    return refusal("KEYWORD_NOT_IN_UNIVERSE", "A keyword não pertence a este Silo.");
  }
  if (keywordIdsOf(destino).length >= CEILING) {
    return refusal("MERGE_EXCEEDS_CEILING", "O artigo de destino já está no teto de seis keywords.");
  }

  const formationRef = stableFormationRef(input.targetCandidateRef, input.mintUuid);
  const patches: FormationPatch[] = [];

  // Se o destino ainda era um candidato calculado, ele inteiro passa a ter a
  // identidade revisada. Sem isso a keyword movida ficaria sozinha sob o ref
  // novo e o resto do destino continuaria agrupado pela lógica.
  if (formationRef !== input.targetCandidateRef) {
    for (const keywordId of keywordIdsOf(destino)) {
      const patch = patchFor({
        keywordId,
        keywords: input.keywords,
        formationRef,
        decision: decision(
          "move",
          keywordId === destino.principalKeywordId ? "principal" : "secundaria",
          "permaneceu no artigo que recebeu a keyword movida",
          input.decidedAt,
        ),
      });
      if (patch) patches.push(patch);
    }
  }

  const movida = patchFor({
    keywordId: input.keywordId,
    keywords: input.keywords,
    formationRef,
    decision: decision("move", "secundaria", "movida para outro artigo em revisão humana", input.decidedAt),
  });
  if (movida) patches.push(movida);

  return patches.length
    ? { patches, refusals: [] }
    : refusal("KEYWORD_WITHOUT_WORKFLOW_ITEM", "A keyword não tem item canônico para receber a decisão.");
}

/**
 * §23 JUNTAR — dois candidatos viram um.
 *
 * O da esquerda mantém a identidade e a principal; as keywords do outro
 * passam a apontar para ele. Não cria ArticleDNA.
 */
export function planMergeCandidates(input: {
  universe: ArticleFormationUniverse;
  keywords: readonly FormationKeywordLike[];
  leftCandidateRef: string;
  rightCandidateRef: string;
  mintUuid: string;
  decidedAt: string;
}): FormationPlan {
  const esquerda = input.universe.candidates.find(item => item.candidateRef === input.leftCandidateRef);
  const direita = input.universe.candidates.find(item => item.candidateRef === input.rightCandidateRef);
  if (!esquerda || !direita) return refusal("CANDIDATE_NOT_FOUND", "Um dos artigos não existe neste Silo.");
  if (esquerda.siloRef !== direita.siloRef) {
    return refusal("CANDIDATES_IN_DIFFERENT_SILOS", "Artigos de Silos diferentes não podem ser juntados.");
  }

  const total = keywordIdsOf(esquerda).length + keywordIdsOf(direita).length;
  if (total > CEILING) {
    return refusal("MERGE_EXCEEDS_CEILING", `A junção somaria ${total} keywords e o teto é ${CEILING}.`);
  }

  const formationRef = stableFormationRef(input.leftCandidateRef, input.mintUuid);
  const patches: FormationPatch[] = [];
  // A esquerda também recebe a decisão: sem isso o agrupamento revisado
  // dependeria do cálculo para se manter de pé no próximo reprocessamento.
  for (const keywordId of keywordIdsOf(esquerda)) {
    const patch = patchFor({
      keywordId,
      keywords: input.keywords,
      formationRef,
      decision: decision(
        "merge",
        keywordId === esquerda.principalKeywordId ? "principal" : "secundaria",
        "agrupamento confirmado em revisão humana",
        input.decidedAt,
      ),
    });
    if (patch) patches.push(patch);
  }
  for (const keywordId of keywordIdsOf(direita)) {
    const patch = patchFor({
      keywordId,
      keywords: input.keywords,
      formationRef,
      decision: decision("merge", "secundaria", "juntada a outro artigo em revisão humana", input.decidedAt),
    });
    if (patch) patches.push(patch);
  }

  return patches.length
    ? { patches, refusals: [] }
    : refusal("KEYWORD_WITHOUT_WORKFLOW_ITEM", "Nenhuma keyword da junção tem item canônico.");
}

/**
 * §24 SEPARAR — a keyword sai e forma um candidato próprio.
 *
 * Recusa deixar o candidato de origem vazio: separar a única keyword não é
 * separação, é renomear identidade.
 */
export function planSplitKeyword(input: {
  universe: ArticleFormationUniverse;
  keywords: readonly FormationKeywordLike[];
  candidateRef: string;
  keywordId: string;
  /** Identidade do novo agrupamento — gerada por quem chama. */
  newFormationRef: string;
  /** Identidade estável para quem FICA, quando a origem é calculada. */
  mintUuid: string;
  decidedAt: string;
}): FormationPlan {
  const candidato = input.universe.candidates.find(item => item.candidateRef === input.candidateRef);
  if (!candidato) return refusal("CANDIDATE_NOT_FOUND", "O artigo de origem não existe neste Silo.");

  const membros = keywordIdsOf(candidato);
  if (!membros.includes(input.keywordId)) {
    return refusal("KEYWORD_NOT_IN_UNIVERSE", "A keyword não pertence a este artigo.");
  }
  if (membros.length <= 1) {
    return refusal("SPLIT_LEAVES_CANDIDATE_EMPTY", "Separar a única keyword do artigo não separa nada.");
  }

  const patches: FormationPatch[] = [];
  // Quem sai vira principal do próprio artigo.
  const saindo = patchFor({
    keywordId: input.keywordId,
    keywords: input.keywords,
    formationRef: input.newFormationRef,
    decision: decision("split", "principal", "separada em artigo próprio por revisão humana", input.decidedAt),
  });
  if (saindo) patches.push(saindo);

  // Quem fica precisa da decisão explícita, senão o reprocessamento pode
  // reagrupar exatamente o que a pessoa acabou de separar.
  const refDeQuemFica = stableFormationRef(input.candidateRef, input.mintUuid);
  for (const keywordId of membros.filter(item => item !== input.keywordId)) {
    const patch = patchFor({
      keywordId,
      keywords: input.keywords,
      formationRef: refDeQuemFica,
      decision: decision(
        "split",
        keywordId === candidato.principalKeywordId ? "principal" : "secundaria",
        "permaneceu no artigo após separação revisada",
        input.decidedAt,
      ),
    });
    if (patch) patches.push(patch);
  }

  return patches.length
    ? { patches, refusals: [] }
    : refusal("KEYWORD_WITHOUT_WORKFLOW_ITEM", "Nenhuma keyword da separação tem item canônico.");
}

/**
 * §22 TROCAR A PRINCIPAL.
 *
 * A escolha vale para o working state; ArticleDNA continua sendo outro passo.
 * Keyword publicada não perde a liderança: a âncora publicada é patrimônio.
 */
export function planPrincipalChange(input: {
  universe: ArticleFormationUniverse;
  keywords: readonly FormationKeywordLike[];
  candidateRef: string;
  keywordId: string;
  publishedKeywordIds?: ReadonlySet<string>;
  mintUuid: string;
  decidedAt: string;
}): FormationPlan {
  const candidato = input.universe.candidates.find(item => item.candidateRef === input.candidateRef);
  if (!candidato) return refusal("CANDIDATE_NOT_FOUND", "O artigo não existe neste Silo.");

  const membros = keywordIdsOf(candidato);
  if (!membros.includes(input.keywordId)) {
    return refusal("PRINCIPAL_NOT_IN_CANDIDATE", "A keyword escolhida não faz parte deste artigo.");
  }
  const publicadaAtual = membros.find(keywordId => input.publishedKeywordIds?.has(keywordId));
  if (publicadaAtual && publicadaAtual !== input.keywordId) {
    return refusal(
      "PUBLISHED_KEYWORD_IS_PROTECTED",
      "A keyword publicada ancora este artigo e continua sendo a principal.",
    );
  }

  // A identidade não pode depender da principal: é justamente ela que muda.
  const formationRef = stableFormationRef(input.candidateRef, input.mintUuid);
  // Quem já era reforço narrativo continua sendo. Rebaixar todo mundo a
  // secundária faria a troca de Principal apagar, de carona, uma decisão
  // editorial diferente que ninguém pediu para desfazer.
  const papelAtual = new Map(candidato.keywords.map(item => [item.keywordId, item.role]));
  const patches: FormationPatch[] = [];
  for (const keywordId of membros) {
    const anterior = papelAtual.get(keywordId);
    const patch = patchFor({
      keywordId,
      keywords: input.keywords,
      formationRef,
      decision: decision(
        "principal",
        keywordId === input.keywordId ? "principal" : anterior === "reforco" ? "reforco" : "secundaria",
        keywordId === input.keywordId
          ? "escolhida como principal em revisão humana"
          : anterior === "reforco"
            ? "reforço narrativo preservado na troca de principal"
            : "papel ajustado pela troca de principal",
        input.decidedAt,
      ),
    });
    if (patch) patches.push(patch);
  }

  return patches.length
    ? { patches, refusals: [] }
    : refusal("KEYWORD_WITHOUT_WORKFLOW_ITEM", "Nenhuma keyword do artigo tem item canônico.");
}

/**
 * §7 PAPEL — secundária ↔ reforço narrativo, sem mover nada.
 *
 * A composição do artigo não muda: muda o que aquela busca sustenta dentro
 * dele. É a decisão editorial mais barata de tomar e a mais fácil de perder —
 * ela vivia só na tela, e o ArticleDNA nascia com tudo como secundária.
 *
 * Como o artigo inteiro passa a ter decisão humana, TODAS as suas keywords
 * recebem a identidade revisada: deixar as outras para trás faria metade do
 * artigo ser reagrupado pela lógica na próxima leitura.
 */
export function planKeywordRole(input: {
  universe: ArticleFormationUniverse;
  keywords: readonly FormationKeywordLike[];
  candidateRef: string;
  keywordId: string;
  role: "secundaria" | "reforco";
  mintUuid: string;
  decidedAt: string;
}): FormationPlan {
  const candidato = input.universe.candidates.find(item => item.candidateRef === input.candidateRef);
  if (!candidato) return refusal("CANDIDATE_NOT_FOUND", "O artigo não existe neste Silo.");

  const membros = keywordIdsOf(candidato);
  if (!membros.includes(input.keywordId)) {
    return refusal("KEYWORD_NOT_IN_UNIVERSE", "Esta busca não faz parte deste artigo.");
  }
  if (candidato.principalKeywordId === input.keywordId) {
    return refusal("PRINCIPAL_NOT_IN_CANDIDATE", "A Principal não vira secundária nem reforço: troque a Principal primeiro.");
  }

  const formationRef = stableFormationRef(input.candidateRef, input.mintUuid);
  const papelAtual = new Map(candidato.keywords.map(item => [item.keywordId, item.role]));
  const patches: FormationPatch[] = [];
  for (const keywordId of membros) {
    const alvo = keywordId === input.keywordId;
    const anterior = papelAtual.get(keywordId);
    const papel = keywordId === candidato.principalKeywordId
      ? "principal" as const
      : alvo
        ? input.role
        : anterior === "reforco" ? "reforco" as const : "secundaria" as const;
    const patch = patchFor({
      keywordId,
      keywords: input.keywords,
      formationRef,
      decision: decision(
        "role",
        papel,
        alvo
          ? `papel definido como ${input.role === "reforco" ? "reforço narrativo" : "secundária"} em revisão humana`
          : "papel preservado na revisão de papéis do artigo",
        input.decidedAt,
      ),
    });
    if (patch) patches.push(patch);
  }

  return patches.length
    ? { patches, refusals: [] }
    : refusal("KEYWORD_WITHOUT_WORKFLOW_ITEM", "Nenhuma keyword do artigo tem item canônico.");
}