import type { RadarSpecialistReviewRequirement } from "./authority-evidence.ts";
import { RADAR_SPECIALIST_CONTRIBUTION_BY_KIND, RADAR_SPECIALIST_CONTRIBUTION_LABEL } from "./editorial-blueprint.ts";

/**
 * O CICLO DE UM PONTO DE REVISÃO PROFISSIONAL — e as fronteiras que ele não pode
 * atravessar sozinho.
 *
 * A investigação PREPARA pontos que merecem julgamento humano. Preparar não é
 * pedir, pedir não é receber, e receber não é aceitar como evidência. Quatro
 * fatos distintos, e o produto inteiro depende de eles nunca se confundirem:
 *
 *   PREPARED   o Radar concluiu que esta afirmação precisa de um profissional
 *   SENT       alguém enviou a pauta, por ação explícita
 *   RESPONDED  o especialista respondeu
 *   ACCEPTED   uma pessoa leu a resposta e a aceitou como evidência
 *
 * Uma tela que some esses quatro num só número diria "especialista consultado"
 * sobre uma pauta que ninguém enviou. É o tipo de mentira que só aparece quando
 * o artigo já foi publicado.
 *
 * ============ POR QUE UM VOCABULÁRIO NOVO, E NÃO UMA MIGRATION ============
 *
 * A persistência usa `reviewed` para "uma pessoa aprovou a PAUTA antes do
 * envio" e `awaiting_review` para "chegou CONTRIBUIÇÃO e falta revisar". Duas
 * revisões diferentes no mesmo enum — e a rota de envio depende de `reviewed`
 * com o primeiro sentido.
 *
 * Renomear a coluna seria uma migration destrutiva para um problema de leitura.
 * O vocabulário canônico vive aqui, no domínio, e a projeção traduz o legado
 * uma vez só. A UI nunca vê `reviewed`.
 *
 * Domínio puro: sem fetch, sem storage, sem provider.
 */

/* ======================= o vocabulário canônico ======================== */

export const RADAR_SPECIALIST_STATES = [
  /** Ponto preparado pela investigação. Ninguém agiu ainda. */
  "PREPARED",
  /** Existe pauta em rascunho para o ponto. Não foi enviada. */
  "DRAFT",
  /** Consulta criada e link gerado. O especialista ainda não abriu o bot. */
  "INVITED",
  /** O especialista abriu o link e o vínculo Telegram existe. Nada foi enviado. */
  "CONNECTED",
  /** A pauta está completa e pode ser aprovada para envio. */
  "READY_TO_SEND",
  /** Uma pessoa aprovou o envio. Ainda não foi enviada. */
  "APPROVED_TO_SEND",
  /** Enviada ao especialista, por ação explícita. */
  "SENT",
  /** Enviada e sem resposta até agora. */
  "WAITING_RESPONSE",
  /** Chegou contribuição do especialista. */
  "RESPONSE_RECEIVED",
  /** Há contribuição e falta a decisão humana sobre ela. */
  "AWAITING_CONTRIBUTION_REVIEW",
  /** Uma pessoa aceitou a contribuição como evidência. */
  "ACCEPTED",
  /** Uma pessoa recusou a contribuição. */
  "REJECTED",
  "BLOCKED",
  "CANCELLED",
] as const;
export type RadarSpecialistState = typeof RADAR_SPECIALIST_STATES[number];

export const RADAR_SPECIALIST_STATE_LABELS: Record<RadarSpecialistState, string> = {
  PREPARED: "Ponto preparado",
  DRAFT: "Pauta em rascunho",
  INVITED: "Consulta criada · aguardando especialista",
  CONNECTED: "Especialista conectado",
  READY_TO_SEND: "Pauta pronta",
  APPROVED_TO_SEND: "Aprovada para envio",
  SENT: "Pedido enviado",
  WAITING_RESPONSE: "Aguardando o especialista",
  RESPONSE_RECEIVED: "Resposta recebida",
  AWAITING_CONTRIBUTION_REVIEW: "Contribuição a revisar",
  ACCEPTED: "Aceita como evidência",
  REJECTED: "Recusada",
  BLOCKED: "Bloqueada",
  CANCELLED: "Cancelada",
};

export function radarSpecialistStateLabel(state: RadarSpecialistState): string {
  return RADAR_SPECIALIST_STATE_LABELS[state];
}

/* ==================== a tradução do estado legado ====================== */

/**
 * O QUE O BANCO GUARDA, TRADUZIDO UMA VEZ SÓ.
 *
 * `reviewed` aqui significa APROVADA PARA ENVIO — é o estado que a rota de
 * envio exige. `awaiting_review` significa o oposto do ciclo: já voltou
 * contribuição e falta decidir sobre ela. Traduzir nas duas pontas seria
 * convidar as duas leituras a divergirem.
 *
 * O `sentAt` tem precedência sobre o rótulo: um brief com data de envio foi
 * enviado, qualquer que seja o texto da coluna. Foi enviado no mundo real.
 */
export function radarSpecialistStateFromBrief(input: {
  status: string;
  sentAt: string | null;
  contributions: number;
  /** Contribuições já decididas por uma pessoa — aceitas ou recusadas. */
  reviewedContributions?: number;
  acceptedContributions?: number;
  /** Há vínculo Telegram ativo: o especialista abriu o link. */
  connected?: boolean;
  /** A consulta foi criada e o link, gerado. */
  invited?: boolean;
}): RadarSpecialistState {
  const recebidas = Math.max(0, input.contributions);
  const aceitas = Math.max(0, input.acceptedContributions || 0);
  const revisadas = Math.max(0, input.reviewedContributions || aceitas);

  if (input.status === "cancelled") return "CANCELLED";
  if (input.status === "blocked") return "BLOCKED";

  if (recebidas > 0) {
    if (aceitas > 0) return "ACCEPTED";
    if (revisadas >= recebidas) return "REJECTED";
    return "AWAITING_CONTRIBUTION_REVIEW";
  }

  if (input.sentAt) return "WAITING_RESPONSE";

  /*
   * SEM `sentAt`, NADA FOI ENVIADO — e `reviewed` é só aprovação para enviar.
   *
   * Esta linha é a fronteira inteira do gate: é aqui que uma pauta aprovada
   * deixaria de ser aprovada e viraria "especialista consultado" se alguém
   * tratasse o rótulo legado como envio.
   */
  if (input.status === "reviewed") return "APPROVED_TO_SEND";
  if (input.status === "ready_to_send") return "READY_TO_SEND";

  /*
   * CONECTADO VEM ANTES DE CONVIDADO, e os dois depois da aprovação.
   *
   * A ordem é a do que pede atenção de quem opera: uma pauta aprovada espera
   * o clique de envio, e dizer "especialista conectado" ali esconderia a ação
   * pendente. Já entre convidar e conectar, o fato mais recente é o que
   * informa — o link continua existindo depois que a pessoa entrou.
   *
   * NENHUM DOS DOIS É ENVIO. Criar a consulta e o especialista abrir o bot
   * são fatos do convite; `sent_at` continua sendo a única prova de pedido.
   */
  if (input.connected) return "CONNECTED";
  if (input.invited) return "INVITED";
  return "DRAFT";
}

/** O ponto preparado que ainda não virou pauta nenhuma. */
export const RADAR_SPECIALIST_STATE_WITHOUT_BRIEF: RadarSpecialistState = "PREPARED";

/* ==================== a leitura de uma pauta remota ==================== */

/**
 * O QUE A TELA SABE DE UMA PAUTA — uma forma só, para os números e a lista.
 *
 * Contadores e pontos de revisão respondem sobre o mesmo conjunto de pautas.
 * Enquanto cada um recebia a sua própria forma, era possível passar um total
 * de contribuições para um e outra lista de ids para o outro — e a tela
 * mostraria "2 respondidas" ao lado de três respostas. Uma estrutura só
 * elimina a possibilidade.
 *
 * `acceptedContributionIds` é decisão humana local: o schema remoto ainda não
 * tem tabela de ExpertEvidence, e inventar uma aqui seria fingir persistência.
 */
export type RadarSpecialistBriefReading = {
  id: string;
  expertId: string;
  status: string;
  /** Só o banco escreve isto, e só depois do envio confirmado. */
  sentAt: string | null;
  /** O ponto de revisão que originou a pauta. `null` quando ela nasceu solta. */
  requirementId: string | null;
  contributionIds: readonly string[];
  acceptedContributionIds: readonly string[];
  /** Há vínculo Telegram ativo para o participante desta pauta. */
  connected?: boolean;
  /** A pauta nasceu de uma consulta e o link foi gerado. */
  invited?: boolean;
};

function estadoDaPauta(pauta: RadarSpecialistBriefReading): RadarSpecialistState {
  return radarSpecialistStateFromBrief({
    status: pauta.status,
    sentAt: pauta.sentAt,
    contributions: pauta.contributionIds.length,
    acceptedContributions: pauta.acceptedContributionIds.length,
    connected: pauta.connected,
    invited: pauta.invited,
  });
}

/* ========================= os contadores reais ========================= */

export type RadarSpecialistCounters = {
  /** Pontos que a investigação preparou. Conclusão do Radar, não ação de ninguém. */
  prepared: number;
  /** Rascunhos existentes. Draft NUNCA conta como pedido. */
  drafts: number;
  /** Pautas com `sent_at`. Só o banco decide isto. */
  sent: number;
  /** Enviadas e ainda sem contribuição. */
  waiting: number;
  /** Pautas com pelo menos uma contribuição recebida. */
  responded: number;
  /** Contribuições aceitas como evidência por uma pessoa. */
  accepted: number;
};

/**
 * OS CINCO NÚMEROS, CONTADOS SEPARADAMENTE — §5.
 *
 * `requestsSent` vinha fixo em zero na página: o envio existia, gravava
 * `sent_at`, e a planilha continuava dizendo que ninguém tinha pedido nada.
 * Contar aqui, a partir do que o banco tem, é o que torna a linha verdadeira.
 *
 * E DRAFT NÃO ENTRA EM `sent`. Nem por engano, nem por atalho: a única prova
 * de envio é `sent_at`, que só a rota de envio escreve, depois do Telegram
 * confirmar.
 */
export function radarSpecialistCounters(input: {
  requirements: readonly { requirementId: string }[];
  briefs: readonly RadarSpecialistBriefReading[];
}): RadarSpecialistCounters {
  const estados = input.briefs.map(estadoDaPauta);

  return {
    prepared: input.requirements.length,
    drafts: estados.filter(state => state === "DRAFT" || state === "INVITED" || state === "CONNECTED" || state === "READY_TO_SEND" || state === "APPROVED_TO_SEND").length,
    /* O ÚNICO SINAL DE ENVIO é `sent_at`. Rascunho não vira pedido por contagem. */
    sent: input.briefs.filter(item => Boolean(item.sentAt)).length,
    waiting: estados.filter(state => state === "WAITING_RESPONSE").length,
    responded: input.briefs.filter(item => item.contributionIds.length > 0).length,
    accepted: input.briefs.reduce((total, item) => total + item.acceptedContributionIds.length, 0),
  };
}

/* ================= a ponte: requisito vira rascunho =================== */

/**
 * O REQUISITO CONGELADO, COMO ELE PODE CHEGAR.
 *
 * O congelamento antigo preservava cinco campos; o novo preserva o contexto
 * editorial inteiro. A leitura aceita os dois — tudo além do mínimo é opcional,
 * e bundle velho continua legível sem ser regravado.
 */
export type RadarFrozenSpecialistRequirement = {
  requirementId: string;
  claimId: string;
  kind: string;
  priority: string;
  specificQuestion: string;
  topic?: string | null;
  claim?: string | null;
  whyReviewIsNeeded?: string | null;
  ymylRelevance?: string | null;
  marketObservation?: string | null;
  factualEvidence?: string | null;
  conflict?: string | null;
  sourceCandidates?: readonly string[];
  provenance?: string | null;
};

export type RadarSpecialistDraft = {
  /** A identidade que impede dois rascunhos para o mesmo ponto. */
  identity: string;
  title: string;
  questions: Array<{ id: string; text: string; origin: "radar"; need: string | null; reference: string | null; justification: string | null }>;
  radarContext: {
    requirementId: string;
    claimId: string;
    kind: string;
    priority: string;
    topic: string | null;
    claim: string | null;
    whyReviewIsNeeded: string | null;
    ymylRelevance: string | null;
    marketObservation: string | null;
    factualEvidence: string | null;
    conflict: string | null;
    sourceCandidates: string[];
    provenance: string | null;
    /** De onde este rascunho nasceu. Nunca de uma pessoa digitando. */
    origin: "radar_specialist_requirement";
  };
};

/**
 * A IDENTIDADE DE UM RASCUNHO — §2.
 *
 * Mesmo artigo, mesma versão de ArticleDNA, mesmo requisito, mesmo
 * especialista: é a MESMA pauta. Sem isto, clicar duas vezes em "Criar pauta"
 * criaria dois pedidos para a mesma dúvida, e o especialista receberia a mesma
 * pergunta duas vezes.
 */
export function radarSpecialistDraftIdentity(input: {
  brandId: string;
  articleId: string;
  articleDnaVersionId: string;
  requirementId: string;
  expertId: string;
}): string {
  return [input.brandId, input.articleId, input.articleDnaVersionId, input.requirementId, input.expertId].join("|");
}

const texto = (valor: unknown): string | null => (typeof valor === "string" && valor.trim() ? valor.trim() : null);

/**
 * O RASCUNHO, DERIVADO DO REQUISITO — determinístico, e sem IA.
 *
 * A pergunta principal é a `specificQuestion` que a investigação já escreveu:
 * ela nasceu do conflito ou da lacuna concretos daquele claim. Gerar outra com
 * modelo aqui trocaria uma pergunta fundamentada por uma inventada — e o §3
 * proíbe exatamente isso.
 *
 * O TÍTULO CAI PARA O QUE EXISTIR. Bundle antigo não tem `topic`; nesse caso o
 * assunto vem do claim, e em último caso do identificador do requisito. Um
 * título vazio na tela do especialista seria pior do que um título técnico.
 */
export function radarSpecialistDraftFromRequirement(input: {
  requirement: RadarFrozenSpecialistRequirement | RadarSpecialistReviewRequirement;
  brandId: string;
  articleId: string;
  articleDnaVersionId: string;
  expertId: string;
}): RadarSpecialistDraft {
  const requisito = input.requirement as RadarFrozenSpecialistRequirement;
  const assunto = radarSpecialistDisplayTitle(requisito);

  const perguntaPrincipal = texto(requisito.specificQuestion);
  const questions = perguntaPrincipal
    ? [{
      id: `${requisito.requirementId}:1`,
      text: perguntaPrincipal,
      origin: "radar" as const,
      need: texto(requisito.whyReviewIsNeeded),
      reference: texto(requisito.claim),
      justification: texto(requisito.conflict) || texto(requisito.whyReviewIsNeeded),
    }]
    : [];

  return {
    identity: radarSpecialistDraftIdentity({
      brandId: input.brandId, articleId: input.articleId,
      articleDnaVersionId: input.articleDnaVersionId,
      requirementId: requisito.requirementId, expertId: input.expertId,
    }),
    title: assunto.slice(0, 240),
    questions,
    radarContext: {
      requirementId: requisito.requirementId,
      claimId: requisito.claimId,
      kind: requisito.kind,
      priority: requisito.priority,
      topic: texto(requisito.topic),
      claim: texto(requisito.claim),
      whyReviewIsNeeded: texto(requisito.whyReviewIsNeeded),
      ymylRelevance: texto(requisito.ymylRelevance),
      marketObservation: texto(requisito.marketObservation),
      factualEvidence: texto(requisito.factualEvidence),
      conflict: texto(requisito.conflict),
      sourceCandidates: [...(requisito.sourceCandidates || [])].filter((item): item is string => Boolean(texto(item))),
      provenance: texto(requisito.provenance),
      origin: "radar_specialist_requirement",
    },
  };
}

/**
 * O PONTO DE REVISÃO COM O QUE ACONTECEU COM ELE — a leitura da coluna direita.
 *
 * Sem pauta, o estado é `PREPARED` e a única ação possível é criar o rascunho.
 * Com pauta, o estado é o do ciclo — e nenhum deles é inferido do rascunho.
 */
/**
 * DE ONDE A PAUTA VEIO — lido do `radarContext`, que é onde ela cabe.
 *
 * A tabela `expert_briefs` não tem coluna de requisito, e criar uma exigiria
 * migration para gravar um dado que o `radar_context` já aceita. A proveniência
 * mora dentro do contexto, sob `specialistRequirement`, e é ela que amarra a
 * resposta do especialista ao ponto que a investigação preparou.
 *
 * Sem esta amarração, uma contribuição chegaria como texto solto: ninguém
 * saberia qual dúvida ela responde, e o RESULTADO DA REVISÃO não teria por
 * onde se organizar.
 *
 * A forma achatada também é aceita — pauta criada por outra mão, ou por uma
 * versão anterior desta tela, não pode perder a origem por causa do formato.
 */
export function radarSpecialistRequirementIdOf(radarContext: unknown): string | null {
  if (!radarContext || typeof radarContext !== "object" || Array.isArray(radarContext)) return null;
  const registro = radarContext as Record<string, unknown>;
  const aninhado = registro.specialistRequirement;
  if (aninhado && typeof aninhado === "object" && !Array.isArray(aninhado)) {
    const interno = texto((aninhado as Record<string, unknown>).requirementId);
    if (interno) return interno;
  }
  return texto(registro.requirementId);
}

/**
 * A PAUTA GÊMEA, SE ELA JÁ EXISTIR — a guarda de idempotência do §2.
 *
 * Quem chama já reduziu a busca ao contexto que define a identidade: marca,
 * artigo, versão do ArticleDNA e especialista. O que falta decidir é se
 * alguma daquelas pautas nasceu DESTE ponto — e é só isso que esta função faz.
 *
 * Ela é pura de propósito. A regra que impede o especialista de receber a
 * mesma dúvida duas vezes não pode viver dentro de um `if` de rota, onde a
 * única prova possível seria ler o arquivo.
 *
 * Sem `requirementId` não há identidade a proteger: pauta avulsa pode
 * repetir, porque foi uma pessoa que decidiu criá-la.
 */
export function radarSpecialistDuplicateDraft<T extends { radarContext?: unknown }>(input: {
  requirementId: string | null;
  briefs: readonly T[];
}): T | null {
  if (!input.requirementId) return null;
  return input.briefs.find(brief => radarSpecialistRequirementIdOf(brief.radarContext) === input.requirementId) || null;
}

/** A pauta de cada ponto, para a tela não procurar duas vezes. */
export function radarSpecialistRequirementByBrief(
  briefs: readonly { id: string; radarContext?: unknown }[],
): Map<string, string | null> {
  return new Map(briefs.map(item => [item.id, radarSpecialistRequirementIdOf(item.radarContext)]));
}
export type RadarSpecialistReviewPoint = {
  requirementId: string;
  title: string;
  specificQuestion: string;
  whyReviewIsNeeded: string | null;
  priority: string;
  state: RadarSpecialistState;
  stateLabel: string;
  briefId: string | null;
  /** Quem recebeu a pauta. `null` enquanto ela não existe. */
  expertId: string | null;
  /** As respostas que chegaram por este ponto. Vazio não é falha. */
  contributionIds: string[];
  acceptedContributionIds: string[];
  canCreateDraft: boolean;
};

/* =============== o card operacional de um ponto =============== */

/**
 * O QUE A PESSOA PRECISA LER PARA AGIR — SPECIALIST_1.1.
 *
 * A `specificQuestion` congelada mistura três coisas numa string só:
 *
 *   "3 de 10 concorrentes tratam de X, encontrados por 4 consultas.  ← mercado
 *    Não encontramos fonte adequada que sustente esta afirmação.      ← motivo
 *    O que pode ser afirmado com segurança, e o que precisa ser
 *    qualificado ou omitido?"                                        ← A PERGUNTA
 *
 * Na tela operacional, as duas primeiras partes são o diagnóstico que LEVOU o
 * Radar a criar o ponto. Quem vai falar com o profissional não precisa lê-las
 * para decidir — precisa saber o que perguntar, por quê, e o que espera de
 * volta. Empilhadas, elas empurram a pergunta para o fim de um parágrafo.
 *
 * NADA É APAGADO. `fullQuestion` devolve o texto congelado inteiro, e é ele
 * que vai para a pauta e para o disclosure de proveniência. Esta é uma
 * projeção de LEITURA: o congelado continua sendo a autoridade.
 */
export type RadarSpecialistReviewCard = {
  /** O que será perguntado. O trecho interrogativo, quando ele existe. */
  question: string;
  /** Por que revisar, em uma ou duas linhas. */
  reason: string;
  /** O que se espera do profissional, derivado do tipo do ponto. */
  expectation: string;
  /**
   * As formas concretas de contribuir — "Validar · Corrigir".
   *
   * Vinha do bloco "Revisão necessária", que o SPECIALIST_1.1.1 removeu por
   * duplicar esta coluna. A informação não se perde: ela é derivada do mesmo
   * `kind`, pelo mesmo mapa que monta a pauta enviada ao profissional.
   */
  contributions: string[];
  /** O texto congelado, inteiro. A pauta usa este, nunca o recorte. */
  fullQuestion: string;
  /** `true` quando o recorte escondeu alguma coisa do texto original. */
  trimmed: boolean;
};

const ESPERADO_POR_TIPO: Record<string, string> = {
  RESOLVE_CONFLICT: "Decidir como apresentar ao leitor o desacordo entre o que o mercado afirma e a evidência factual.",
  RESOLVE_FACTUAL_UNCERTAINTY: "Dizer o que pode ser afirmado com segurança e o que precisa ser qualificado ou omitido.",
  VERIFY_AND_ADD_EXPERIENCE: "Confirmar a afirmação e acrescentar a leitura prática: nuance, exceção e o erro comum de quem lê.",
};

const ESPERADO_PADRAO = "Julgamento profissional sobre esta afirmação.";

/** Uma frase por vez, preservando a pontuação que a encerra. */
function frases(valor: string): string[] {
  return valor.split(/(?<=[.!?])\s+/).map(item => item.trim()).filter(Boolean);
}

/**
 * A CONTAGEM DE MERCADO NÃO AJUDA A FORMULAR A PERGUNTA.
 *
 * "3 de 10 concorrentes", "encontrados por 4 consultas" — é como o Radar
 * chegou ao ponto, não o que o especialista precisa responder. O padrão é
 * genérico de mercado (número + unidade de observação) e não conhece nicho
 * nenhum: hardcodar "acne" aqui quebraria na primeira marca diferente.
 */
const CONTAGEM_DE_MERCADO = /\d+\s*(?:de\s*\d+\s*)?(?:concorrente|consulta|página|pagina|resultado|ocorrência|ocorrencia|fonte)s?\b/i;

export function radarSpecialistReviewCard(requirement: RadarFrozenSpecialistRequirement): RadarSpecialistReviewCard {
  const integral = (requirement.specificQuestion || "").replace(/\s+/g, " ").trim();
  const partes = frases(integral);

  /*
   * A PERGUNTA É O TRECHO INTERROGATIVO, procurado do fim para o começo.
   *
   * Do fim porque o preâmbulo vem antes por construção; e quando não há "?"
   * nenhum, o texto inteiro vira a pergunta — recortar às cegas um texto que
   * não segue o formato esperado esconderia justamente o que foi perguntado.
   */
  const indiceDaPergunta = partes.map(item => item.endsWith("?")).lastIndexOf(true);
  const question = indiceDaPergunta >= 0 ? partes.slice(indiceDaPergunta).join(" ") : integral;
  const preambulo = indiceDaPergunta > 0 ? partes.slice(0, indiceDaPergunta) : [];

  const motivoCongelado = texto(requirement.whyReviewIsNeeded);
  const motivoDoPreambulo = preambulo.filter(item => !CONTAGEM_DE_MERCADO.test(item)).join(" ");
  const reason = motivoCongelado || motivoDoPreambulo || ESPERADO_POR_TIPO[requirement.kind] || ESPERADO_PADRAO;

  return {
    question,
    /* Duas linhas: o que não couber continua inteiro na proveniência. */
    reason: reason.length > 180 ? `${reason.slice(0, 179).trimEnd()}…` : reason,
    expectation: ESPERADO_POR_TIPO[requirement.kind] || ESPERADO_PADRAO,
    contributions: (RADAR_SPECIALIST_CONTRIBUTION_BY_KIND[requirement.kind] || []).map(item => RADAR_SPECIALIST_CONTRIBUTION_LABEL[item]),
    fullQuestion: integral,
    trimmed: question !== integral || reason.length > 180,
  };
}

/**
 * COMO O PONTO SE CHAMA NA TELA — e por que o identificador não serve.
 *
 * `topic` e `claim` só existem em congelamentos feitos depois do SPECIALIST_1;
 * o bundle em produção é estreito, e o rótulo caía em "Ponto de revisão
 * specialist:4a13e0cb". Um hash na coluna não diz nada a quem vai falar com um
 * profissional — e o SPECIALIST_1.1 tirou ids internos da visão operacional.
 *
 * O último recurso passa a ser a PERGUNTA, encurtada. Ela é o que distingue um
 * ponto do outro para uma pessoa, e o identificador continua inteiro na
 * proveniência, que é onde se confere.
 */
export function radarSpecialistDisplayTitle(requirement: RadarFrozenSpecialistRequirement): string {
  const assunto = texto(requirement.topic) || texto(requirement.claim);
  if (assunto) return assunto;

  /*
   * INTEIRA, não encurtada: o card omite o bloco "Pergunta" quando o título já
   * é ela, e um título truncado seguido da versão completa logo abaixo era
   * exatamente a repetição que o SPECIALIST_1.1 veio remover.
   */
  return radarSpecialistReviewCard(requirement).question || "Ponto de revisão";
}

/** ALTA · MÉDIA · BAIXA — curto, porque divide a linha com o estado. */
export function radarSpecialistPriorityLabel(priority: string): string {
  return ({ HIGH: "ALTA", MEDIUM: "MÉDIA", LOW: "BAIXA" } as Record<string, string>)[priority] || priority;
}

/**
 * OS PONTOS, COM O QUE ACONTECEU COM CADA UM — a coluna direita e o resultado.
 *
 * A mesma projeção serve às duas regiões da tela de propósito: a lista de
 * pontos e o RESULTADO DA REVISÃO falam dos mesmos requisitos, e montá-los
 * separadamente deixaria um dizer "aguardando" enquanto o outro já mostra a
 * resposta logo abaixo.
 */
export function radarSpecialistReviewPoints(input: {
  requirements: readonly RadarFrozenSpecialistRequirement[];
  briefs: readonly RadarSpecialistBriefReading[];
}): RadarSpecialistReviewPoint[] {
  const porRequisito = new Map(input.briefs.filter(item => item.requirementId).map(item => [item.requirementId as string, item]));

  return input.requirements.map(requisito => {
    const pauta = porRequisito.get(requisito.requirementId) || null;
    const state = pauta ? estadoDaPauta(pauta) : RADAR_SPECIALIST_STATE_WITHOUT_BRIEF;

    return {
      requirementId: requisito.requirementId,
      title: radarSpecialistDisplayTitle(requisito),
      specificQuestion: requisito.specificQuestion,
      whyReviewIsNeeded: texto(requisito.whyReviewIsNeeded),
      priority: requisito.priority,
      state,
      stateLabel: radarSpecialistStateLabel(state),
      briefId: pauta?.id || null,
      expertId: pauta?.expertId || null,
      contributionIds: [...(pauta?.contributionIds || [])],
      acceptedContributionIds: [...(pauta?.acceptedContributionIds || [])],
      /* Criar é ação humana, e só existe onde ainda não há pauta. */
      canCreateDraft: !pauta,
    };
  });
}
