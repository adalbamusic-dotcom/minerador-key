/**
 * ===== O ADAPTER DO GOOGLE — RADAR_BLUEPRINT_CANONICAL_1.1 =====
 *
 * ========================== O QUE ISTO É, E NÃO É ==========================
 *
 * ISTO É uma tradução. O pipeline do Google já produz um modelo competitivo
 * rico — conceitos recorrentes, perguntas, entidades, lacunas, conflitos,
 * autoridade, plano de links —, e ele continua sendo a AUTORIDADE OPERACIONAL
 * com as seis etapas dele: coleta, curadoria, análise, modelo, relatório,
 * revisão.
 *
 * ISTO NÃO É um segundo pipeline. Nada aqui coleta, decide etapa, muda estado
 * ou persiste. É função pura: entra o que o Google já observou, sai o mesmo
 * conteúdo falando a gramática do envelope canônico.
 *
 * ================== POR QUE O ADAPTER, E NÃO A CONVERSÃO ==================
 *
 * Converter o pipeline espremeria seis etapas com nome próprio nos seis
 * estados do perfil e perderia curadoria, modelo e revisão pelo caminho. O
 * adapter deixa as duas autoridades intactas e resolve o que de fato estava
 * faltando: o Google e o YouTube falavam línguas diferentes sobre a mesma
 * pergunta editorial.
 *
 * =================== A DIFERENÇA QUE O TRADUTOR PRESERVA ===================
 *
 * Métrica não é instrução. "4 de 7 páginas citam a mesma instituição" é
 * observação; "esta afirmação precisa de fonte institucional" é o que permite
 * escrever. O modelo do Google tem as duas coisas separadas, e este módulo
 * mantém a separação — `observed` recebe as contagens, `recommended` recebe as
 * instruções.
 *
 * Domínio puro: sem fetch, sem storage, sem provider, sem React.
 */

import {
  RadarCompetitiveBlueprintSchema,
  recomendacao,
  sinalObservado,
  type RadarAuthorityNeed,
  type RadarBlueprintRecommendation,
  type RadarGoogleBlueprint,
  type RadarInternalLinkDirection,
  type RadarObservedSignal,
  type RadarResearchRef,
  type RadarSectionDirection,
} from "./competitive-blueprint.ts";
import type { RadarCompetitiveObservedModel } from "./competitive-observed-model.ts";

/* ====================== §6 · CARD 1 · modelo competitivo ====================== */

function sinaisDePadrao(observed: RadarCompetitiveObservedModel): RadarObservedSignal[] {
  return observed.structure.patterns
    .filter(padrao => padrao.verdict === "dominant" || padrao.verdict === "mixed")
    .map(padrao => sinalObservado(
      `pattern:${padrao.key}`,
      padrao.verdict === "dominant"
        ? `A maioria das páginas usa ${padrao.label.toLowerCase()}.`
        : `Parte das páginas usa ${padrao.label.toLowerCase()}.`,
      padrao.evidence,
      padrao.present,
    ));
}

function sinaisDeLacuna(observed: RadarCompetitiveObservedModel): RadarObservedSignal[] {
  return observed.gaps.map((gap, indice) => sinalObservado(
    `gap:${indice}`,
    gap.against === "MARKET"
      ? `O mercado cobre "${gap.subject}" e o artigo ainda não.`
      : `O artigo declara "${gap.subject}" e a amostra não cobre.`,
    gap.evidence,
    gap.pagesCovering,
  ));
}

function sinaisDeConflito(observed: RadarCompetitiveObservedModel): RadarObservedSignal[] {
  return observed.conflicts.map((conflito, indice) => sinalObservado(
    `conflict:${indice}`,
    `O que o mercado repete sobre "${conflito.subject}" diverge do que o artigo declara.`,
    conflito.evidence,
  ));
}

/* ==================== §6 · CARD 2 · busca e compreensão ==================== */

function sinaisDeIntencao(observed: RadarCompetitiveObservedModel): RadarObservedSignal[] {
  const intent = observed.intent;
  const sinais: RadarObservedSignal[] = [];

  if (intent.observedInSerp) {
    sinais.push(sinalObservado("intent:serp", `A busca trata esta intenção como ${intent.observedInSerp}.`, intent.note));
  }
  if (intent.observedInPages) {
    sinais.push(sinalObservado("intent:pages", `As páginas lidas respondem no formato ${intent.observedInPages}.`, intent.note));
  }
  /*
   * DIVERGÊNCIA É O SINAL MAIS ÚTIL DESTE BLOCO.
   *
   * Quando o fundamento declarou uma intenção e a busca mostra outra, escrever
   * para a declarada produz um texto que a SERP não reconhece como resposta.
   */
  if (intent.alignment === "DIVERGENT") {
    sinais.push(sinalObservado(
      "intent:divergent",
      "A intenção declarada pelo fundamento diverge da que a busca mostra.",
      intent.note,
    ));
  }
  return sinais;
}

function sinaisDeConceito(observed: RadarCompetitiveObservedModel): RadarObservedSignal[] {
  return observed.concepts.recurrent.slice(0, 12).map(conceito => sinalObservado(
    `concept:${conceito.id}`,
    conceito.canonicalLabel,
    `${conceito.sourceCount} de ${conceito.sampleSize} página(s) tratam este conceito.`,
    conceito.sourceCount,
  ));
}

function sinaisDePergunta(observed: RadarCompetitiveObservedModel): RadarObservedSignal[] {
  return observed.questions.slice(0, 12).map(pergunta => sinalObservado(
    `question:${pergunta.id}`,
    pergunta.canonicalQuestion,
    `${pergunta.pages} de ${pergunta.sampleSize} página(s) respondem esta pergunta.`,
    pergunta.pages,
  ));
}

function sinaisDeEntidade(observed: RadarCompetitiveObservedModel): RadarObservedSignal[] {
  const entidades = observed.entities;
  return [
    ...entidades.shared.slice(0, 8).map(item => sinalObservado(`entity:shared:${item.label}`, item.label, item.evidence, item.pages)),
    /*
     * ENTIDADE QUE SÓ O MERCADO USA É A MAIS ACIONÁVEL: é cobertura que o
     * artigo não tem e a busca já associa à intenção.
     */
    ...entidades.marketOnly.slice(0, 8).map(item => sinalObservado(`entity:market:${item.label}`, `${item.label} — só o mercado usa.`, item.evidence, item.pages)),
  ];
}

function sinaisDeFormato(observed: RadarCompetitiveObservedModel): RadarObservedSignal[] {
  const dominante = observed.formats.dominant;
  if (!dominante) return [];
  return [sinalObservado(
    "format:dominant",
    `O formato dominante da amostra é ${dominante.label}.`,
    `${dominante.pages} de ${observed.sample.analyzedSuccess} página(s) analisada(s).`,
    dominante.pages,
  )];
}

/* ==================== §6 · CARD 3 · fontes e autoridade ==================== */

function sinaisDeFonte(observed: RadarCompetitiveObservedModel): RadarObservedSignal[] {
  /*
   * §8 · O DOMÍNIO CITADO É OBSERVAÇÃO, NUNCA RECOMENDAÇÃO.
   *
   * "Quatro concorrentes citam a mesma instituição" descreve o mercado. Virar
   * isso em "cite esta instituição" transformaria observação em endosso
   * editorial — e o Radar não avaliou fonte nenhuma.
   */
  return observed.authorityEvidence.summary.sourcesByType.map(tipo => sinalObservado(
    `source:${tipo.type}`,
    `A amostra cita fontes do tipo ${tipo.label}.`,
    `${tipo.count} ocorrência(s) observada(s) nas páginas lidas.`,
    tipo.count,
  ));
}

function sinaisDeAutoridade(observed: RadarCompetitiveObservedModel): RadarObservedSignal[] {
  const resumo = observed.authorityEvidence.summary;
  const sinais: RadarObservedSignal[] = [];

  if (resumo.claimsNeedingSupport) {
    sinais.push(sinalObservado(
      "authority:claims",
      "Há afirmações que precisam de sustentação factual.",
      `${resumo.claimsNeedingSupport} afirmação(ões) identificada(s) na leitura da amostra.`,
      resumo.claimsNeedingSupport,
    ));
  }
  if (resumo.claimsWithEvidenceGap) {
    sinais.push(sinalObservado(
      "authority:gap",
      "Algumas afirmações não encontraram evidência factual nesta rodada.",
      `${resumo.claimsWithEvidenceGap} afirmação(ões) sem lastro localizado.`,
      resumo.claimsWithEvidenceGap,
    ));
  }
  for (const sinal of observed.authorityEvidence.eeatSignals.slice(0, 6)) {
    sinais.push(sinalObservado(`eeat:${sinal.key}`, sinal.label, sinal.observation, sinal.pages));
  }
  return sinais;
}

/**
 * §8 · AS AFIRMAÇÕES QUE PRECISAM DE LASTRO, COMO INSTRUÇÃO.
 *
 * O pipeline já sabe qual afirmação é YMYL, qual tem conflito e qual precisa
 * de especialista. O que faltava era dizer, para cada uma, QUE TIPO de fonte
 * buscar — porque "precisa de evidência" não move ninguém.
 */
function planoDeAutoridade(observed: RadarCompetitiveObservedModel): RadarAuthorityNeed[] {
  const porEspecialista = new Map(
    observed.authorityEvidence.specialistReviewRequirements.map(item => [item.claimId, item]),
  );

  return observed.authorityEvidence.claims
    .filter(claim => claim.ymyl.relevance !== "NONE" || porEspecialista.has(claim.claimId))
    .slice(0, 10)
    .map(claim => {
      const especialista = porEspecialista.get(claim.claimId);
      const ymyl = claim.ymyl.relevance !== "NONE";
      return {
        claim: claim.canonicalClaim,
        evidenceType: ymyl
          ? "Evidência de literatura ou órgão reconhecido, com a afirmação delimitada ao que a fonte sustenta."
          : "Referência verificável que sustente o número ou a relação afirmada.",
        /* TIPO de fonte, e não o domínio que a amostra citou. */
        sourceTypeNeeded: ymyl
          ? "Fonte institucional, acadêmica ou de sociedade profissional da área."
          : "Fonte primária do dado — quem produziu a medição ou a definição.",
        specialistReason: especialista?.whyReviewIsNeeded || null,
        ymylRelevant: ymyl,
        sourceSignal: claim.market.statement || claim.provenance,
      };
    });
}

/* =================== §6 · CARD 4 · aplicação editorial =================== */

/**
 * §9 · OS LINKS INTERNOS, EDITORIALMENTE.
 *
 * O grafo é do Arquiteto e não é recriado aqui. O que o Radar acrescentou —
 * em que contexto o link cabe dentro DESTE texto — é o que vira instrução.
 *
 * `occurrences = 0` é resposta legítima e chega como tal: significa que esta
 * rodada não achou onde aplicar a relação com fundamento, e não que a relação
 * deixou de existir.
 */
function planoDeLinks(observed: RadarCompetitiveObservedModel): RadarInternalLinkDirection[] {
  return observed.internalLinkPlan.outgoing.slice(0, 10).map(link => {
    const contexto = link.supportingContexts[0];
    return {
      target: link.slug || link.nodeId,
      role: link.targetRole,
      placementContext: contexto
        ? `Na passagem que trata "${contexto.conceptLabel}".`
        : "Sem contexto natural localizado nesta rodada: o link permanece exigido pelo grafo, sem posição recomendada.",
      anchorDirection: link.approvedAnchorConcepts.length
        ? `Âncora ancorada em ${link.approvedAnchorConcepts.slice(0, 3).join(", ")} — reescrita para o texto, não colada.`
        : "Âncora derivada do conceito da passagem.",
      occurrences: link.recommendedOccurrences,
      sourceSignal: link.occurrencesReason,
    };
  });
}

function sinaisDeLink(observed: RadarCompetitiveObservedModel): RadarObservedSignal[] {
  const plano = observed.internalLinkPlan;
  if (!plano.outgoing.length && !plano.incoming.length) return [];
  return [sinalObservado(
    "links:graph",
    "O grafo aprovado relaciona este artigo a outras páginas do silo.",
    `${plano.outgoing.length} relação(ões) de saída e ${plano.incoming.length} de entrada, com ${plano.totalRecommendedLinks} ocorrência(s) fundamentada(s).`,
    plano.totalRecommendedLinks,
  )];
}

function sinaisMultimidia(observed: RadarCompetitiveObservedModel): RadarObservedSignal[] {
  const presencas = observed.structure.presences.filter(item =>
    /imag|video|tabel|lista/i.test(item.key) && item.present > 0);
  return presencas.map(item => sinalObservado(
    `media:${item.key}`,
    `A amostra usa ${item.label.toLowerCase()}.`,
    `${item.present} de ${item.sampleSize} página(s).`,
    item.present,
  ));
}

function sinaisComerciais(observed: RadarCompetitiveObservedModel): RadarObservedSignal[] {
  const intent = observed.intent;
  if (intent.alignment !== "COHERENT_COMMERCIAL" && !/comercial|transacional/i.test(intent.observedInSerp || "")) return [];
  return [sinalObservado(
    "commercial:intent",
    "A busca mostra camada comercial nesta intenção.",
    intent.note,
  )];
}

/* ======================= §7 · a estrutura recomendada ======================= */

/**
 * AS SEÇÕES — derivadas das perguntas e conceitos, nunca dos headings alheios.
 *
 * Copiar a sequência de H2 da amostra produziria um artigo que já existe sete
 * vezes. O que sai daqui é: esta seção fecha esta pergunta, precisa tocar
 * estes conceitos, e vai exigir esta evidência.
 */
function direcoesDeSecao(observed: RadarCompetitiveObservedModel): RadarSectionDirection[] {
  const perguntas = observed.questions.slice(0, 6);
  const conceitos = observed.concepts.recurrent;
  const precisaEvidencia = new Set(
    observed.authorityEvidence.claims.filter(item => item.ymyl.relevance !== "NONE").map(item => item.conceptId),
  );

  return perguntas.map((pergunta, indice) => {
    const relacionados = conceitos
      .filter(conceito => conceito.id === pergunta.conceptId || conceito.canonicalLabel === pergunta.conceptLabel)
      .map(conceito => conceito.canonicalLabel);

    return {
      order: indice + 1,
      /*
       * A PERGUNTA NÃO ENTRA NO HEADING — ela mora em `answersQuestion`.
       *
       * Na amostra real a pergunta canônica É, literalmente, o H2 de vários
       * concorrentes: "Como identificar a pele oleosa?" aparece em 12 de 12
       * páginas. Reproduzi-la aqui devolveria o heading alheio vestido de
       * recomendação — e é exatamente o que o §7 proíbe.
       *
       * A direção descreve a FORMA da seção; a pergunta fica ao lado, como
       * observação, para quem escreve saber o que precisa fechar.
       */
      headingDirection: pergunta.declaredByArticle
        ? "Uma seção que feche a pergunta ao lado, formulada com as palavras do leitor — não com o heading da amostra."
        : "Uma seção que responda a pergunta ao lado, que o mercado cobre e este artigo ainda não. Formule o heading do seu jeito.",
      objective: pergunta.declaredByArticle
        ? "Responder uma necessidade que o próprio fundamento declarou."
        : "Responder uma pergunta que o mercado responde e o artigo ainda não.",
      answersQuestion: pergunta.canonicalQuestion,
      mustCover: relacionados.length ? relacionados : [pergunta.conceptLabel].filter(Boolean),
      evidenceNeeded: precisaEvidencia.has(pergunta.conceptId)
        ? "Esta seção toca afirmação sensível: vai precisar de fonte verificável."
        : null,
      sourceSignal: `${pergunta.pages} de ${pergunta.sampleSize} página(s) comparáveis respondem esta pergunta.`,
    };
  });
}

function coberturaDePergunta(observed: RadarCompetitiveObservedModel): RadarBlueprintRecommendation[] {
  return observed.questions
    .filter(item => item.status === "MARKET_QUESTION_UNDERCOVERED")
    .slice(0, 8)
    .map(pergunta => recomendacao(
      `cover:q:${pergunta.id}`,
      `Responder "${pergunta.canonicalQuestion}".`,
      "fechar uma dúvida que o mercado responde e este artigo ainda não.",
      `${pergunta.pages} de ${pergunta.sampleSize} página(s) comparáveis já respondem.`,
    ));
}

function coberturaDeEntidade(observed: RadarCompetitiveObservedModel): RadarBlueprintRecommendation[] {
  return observed.entities.marketOnly.slice(0, 8).map(entidade => recomendacao(
    `cover:e:${entidade.label}`,
    `Tratar "${entidade.label}" em algum ponto do texto.`,
    "cobrir uma entidade que a busca associa à intenção e o artigo não menciona.",
    entidade.evidence,
  ));
}

/* ========================== o blueprint do Google ========================== */

export function googleCompetitiveBlueprintOfAnalysis(input: {
  articleId: string;
  articleDnaVersionId: string;
  articleDnaContentHash?: string | null;
  observed: RadarCompetitiveObservedModel;
  researchRefs: readonly RadarResearchRef[];
  generatedAt: string;
  frozenAt?: string | null;
}): RadarGoogleBlueprint {
  const { observed } = input;
  const amostra = observed.sample.comparablePages;
  const lacunas = sinaisDeLacuna(observed);
  const diferenciais = observed.differentiations.slice(0, 6);

  const intencao = observed.intent.observedInSerp
    || observed.intent.declared
    || "A intenção não foi concluída pelo fundamento nem observada na busca.";

  return RadarCompetitiveBlueprintSchema.parse({
    schemaVersion: 1,
    profile: "GOOGLE",
    articleId: input.articleId,
    articleDnaVersionId: input.articleDnaVersionId,
    articleDnaContentHash: input.articleDnaContentHash ?? null,
    researchRefs: [...input.researchRefs],

    observed: {
      comparablePages: amostra,
      intent: sinaisDeIntencao(observed),
      recurringPatterns: sinaisDePadrao(observed),
      recurrentConcepts: sinaisDeConceito(observed),
      questions: sinaisDePergunta(observed),
      entities: sinaisDeEntidade(observed),
      /*
       * Refinamentos vêm da SERP e não do modelo de páginas. Enquanto o
       * adapter só tem o modelo, a ausência é declarada em vez de fabricada.
       */
      refinementSignals: [],
      formatSignals: sinaisDeFormato(observed),
      authoritySignals: sinaisDeAutoridade(observed),
      sourceSignals: sinaisDeFonte(observed),
      internalLinkSignals: sinaisDeLink(observed),
      gaps: lacunas,
      conflicts: sinaisDeConflito(observed),
      multimediaSignals: sinaisMultimidia(observed),
      commercialSignals: sinaisComerciais(observed),
      sufficiency: observed.sufficiency.reasons[0]
        || `${amostra} página(s) comparável(is) sustentam a leitura.`,
    },

    recommended: {
      intentToSatisfy: intencao,
      editorialAngle: recomendacao(
        "angle",
        lacunas.length
          ? `Cobrir o que a amostra não cobre: ${lacunas.slice(0, 2).map(item => item.statement).join(" ")}`
          : "Responder a intenção com a profundidade que a amostra já estabelece, e diferenciar pela execução.",
        "existir na página por uma razão que os concorrentes não oferecem.",
        lacunas.length
          ? `${lacunas.length} lacuna(s) observada(s) na amostra de ${amostra} página(s).`
          : `${amostra} página(s) comparáveis cobrem a intenção sem lacuna evidente.`,
      ),
      differentiation: diferenciais.map((item, indice) => recomendacao(
        `diff:${indice}`,
        `Sustentar "${item.subject}" como diferencial.`,
        item.basis === "ARTICLE_DECLARES"
          ? "entregar o que o fundamento prometeu e a amostra não tem."
          : "ocupar um espaço que a busca evidencia e poucos disputam.",
        item.evidence,
      )),
      titleDirection: recomendacao(
        "title",
        "Formular o título pela pergunta que a seção de abertura fecha — sem reproduzir a formulação dos concorrentes.",
        "ser reconhecido como resposta sem repetir a promessa que já está na página.",
        `${amostra} página(s) comparáveis disputam esta busca.`,
      ),
      contentArchitecture: observed.questions.length
        ? `Uma sequência que fecha ${Math.min(observed.questions.length, 6)} pergunta(s) observada(s), do fundamento para a aplicação.`
        : null,
      sectionDirections: direcoesDeSecao(observed),
      questionCoverage: coberturaDePergunta(observed),
      entityCoverage: coberturaDeEntidade(observed),
      authorityPlan: planoDeAutoridade(observed),
      internalLinkPlan: planoDeLinks(observed),
      multimediaPlan: sinaisMultimidia(observed).slice(0, 4).map((sinal, indice) => recomendacao(
        `media:${indice}`,
        `Prever ${sinal.statement.toLowerCase().replace(/^a amostra usa /, "")}`,
        "acompanhar o formato que a busca reconhece como resposta completa.",
        sinal.evidence,
      )),
      commercialApplication: sinaisComerciais(observed).map((sinal, indice) => recomendacao(
        `commercial:${indice}`,
        "Prever uma camada comercial na estrutura, sem transformar o artigo em vitrine.",
        "atender a intenção de compra que a busca mostra ao lado da informacional.",
        sinal.evidence,
      )),
      /*
       * §10 · A SAÍDA EDITORIAL SÓ SOBE QUANDO A EVIDÊNCIA SUSTENTA.
       *
       * Prometer pacote multiformato sem sinal audiovisual faria o Planejador
       * receber trabalho que a investigação não justifica.
       */
      editorialOutput: sinaisMultimidia(observed).some(item => /v[íi]deo/i.test(item.statement))
        ? "ARTICLE_WITH_VIDEO"
        : "ARTICLE",
    },

    limitations: [...new Set([...observed.limitations, ...observed.authorityEvidence.limitations])],
    provenance: { generatedAt: input.generatedAt, frozenAt: input.frozenAt ?? null },
  }) as RadarGoogleBlueprint;
}
