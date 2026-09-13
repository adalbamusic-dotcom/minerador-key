/**
 * ANÁLISE NÃO É PROPOSTA.
 *
 * `Processar arquitetura` lia o lote inteiro, classificava os grupos e
 * terminava com "Nada foi aplicado". Estava correto ao dizer isso — ele
 * realmente não aplicava nada. Três destinos do analisador não tinham
 * consequência nenhuma:
 *
 *   `new_silo`           → recomendava, mas ninguém criava o Silo;
 *   `insufficient_depth` → virava `keptWithoutSilo`, um no-op;
 *   `ambiguous`          → era ignorado, sem sequer aparecer na conta.
 *
 * Na homologação real isso deu: 9 keywords, 2 grupos, 0 Silos, 0 atribuições.
 * A pessoa teve de criar o Silo à mão para o motor voltar a enxergar alguma
 * coisa — e ainda assim as associações não saíam.
 *
 * Este módulo converte a análise em PROPOSTA OPERACIONAL: toda keyword do lote
 * sai daqui com destino, e destino nenhum é silêncio. Ou ela é atribuída, ou é
 * `EXPLICIT_UNASSIGNED` com motivo.
 *
 * Domínio puro: sem React, sem storage, sem rede.
 */

import type { ArchitectureAnalysis, ClusterAnalysis } from "./architecture-analysis";
import { intentComparisonKey, intentIsKnown, type KeywordDnaSignals } from "./keyword-dna-signals.ts";

export type ProposalSiloSource = "reused" | "proposed";

export type ProposalSilo = {
  /** Identidade dentro da proposta: `territoryRef` real ou `proposed:<slug>`. */
  key: string;
  /** `null` enquanto o Silo ainda não existe no acervo. */
  territoryRef: string | null;
  name: string;
  slug: string;
  /** A keyword que deu origem à identidade do Silo. */
  seedKeywordId: string | null;
  source: ProposalSiloSource;
  reason: string;
};

/**
 * O estado de membership que a decisão vai gravar.
 *
 * Vem do domínio, não da tela: é a diferença entre "casou com o Silo",
 * "ampliou o Silo" e "nasceu com o Silo", e cada uma dessas leituras muda
 * o que a fase seguinte entende sobre a keyword.
 */
export type ProposalMembershipState = "existing_silo_match" | "expand_existing_silo" | "new_silo_candidate";

export type ProposalAssignment = {
  keywordId: string;
  siloKey: string;
  reason: string;
  membershipState: ProposalMembershipState;
  /**
   * §11 — os sinais REALMENTE usados nesta decisão.
   *
   * A tela mostra isto como "Base:". Uma justificativa genérica sobre
   * campos que o motor não olhou seria pior que nenhuma.
   */
  basis: string[];
  /** §7 — a versão do KeywordDNA em que a decisão se apoia. */
  dnaVersionId: string | null;
  dnaContentHash: string | null;
};
export type ProposalUnassigned = { keywordId: string; reason: string };

export type ArchitectureProposalCounters = {
  KEYWORDS_ANALYZED: number;
  RESOLVED_KEYWORDS: number;
  SILOS_REUSED: number;
  SILOS_PROPOSED: number;
  ASSIGNED: number;
  EXPLICIT_UNASSIGNED: number;
  BLOCKED: number;
};

export type ArchitectureWorkingProposal = {
  silos: ProposalSilo[];
  assignments: ProposalAssignment[];
  unassigned: ProposalUnassigned[];
  counters: ArchitectureProposalCounters;
  /** Identidade da proposta. Muda quando a proposta muda — e só então. */
  proposalHash: string;
};

/*
 * A LEITURA DO KEYWORDDNA MUDOU DE CASA.
 *
 * Ela nasceu aqui porque Silos precisou dela primeiro. Artigos precisa da
 * MESMA leitura, e duas interpretações do mesmo payload é como o painel e a
 * justificativa passaram a discordar sobre a mesma keyword. Agora nenhuma
 * das duas fases é dona dela.
 */
export {
  intentComparisonKey,
  intentIsKnown,
  resolveKeywordDnaSignals,
  type KeywordDnaSignals,
} from "./keyword-dna-signals.ts";
export type ExistingSilo = {
  territoryRef: string;
  name: string | null;
  centralEntity: string;
  slug: string | null;
  /** Intenção macro declarada do Silo, quando já existe. */
  intent?: string | null;
};

/* -------------------------------------------------------------- núcleo */

/**
 * Os tokens que dão identidade a um texto, mais a forma compacta.
 *
 * "skin care" e "skincare" são a mesma coisa para uma pessoa e coisas
 * diferentes para um tokenizador. Sem a forma compacta, o lote real — que tem
 * as duas grafias — não se reconhece como um domínio só.
 */
export function identityCore(value: string): Set<string> {
  const limpo = value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (!limpo) return new Set();
  const tokens = limpo.split(" ").filter(token => token.length > 2);
  /*
   * Pares ADJACENTES, não a junção do texto inteiro.
   *
   * "skin care noturno" junto vira "skincarenoturno", que não casa com
   * "skincare" — e era esse o ponto. O que aproxima as duas grafias é o par
   * vizinho: skin+care.
   */
  const pares = tokens.slice(0, -1).map((token, index) => token + tokens[index + 1]);
  return new Set([...tokens, ...pares]);
}

function overlap(left: Set<string>, right: Set<string>): number {
  let n = 0;
  for (const token of left) if (right.has(token)) n += 1;
  return n;
}

const rotuloDoCluster = (cluster: ClusterAnalysis) => cluster.label || cluster.clusterRef;

/** Quais sinais sustentaram uma associação. Vira a linha "Base:" da tela. */
type Contribuicao = {
  lexico: boolean;
  entidade: boolean;
  modificadores: boolean;
  intencao: boolean;
  semantica: boolean;
};

/**
 * O destino veio do analisador: a base temática é a coerência do lote.
 *
 * `intencao: false` de propósito — o analisador não verificou compatibilidade
 * de intenção, e afirmar que verificou seria justificativa falsa.
 */
const TEMA_DO_ANALISADOR: Contribuicao = {
  lexico: true, entidade: false, modificadores: false, intencao: false, semantica: false,
};

/* ------------------------------------------------------------ proposta */

/**
 * Escolhe o grupo que dá nome ao Silo quando ainda não existe nenhum.
 *
 * O critério é o do próprio analisador: mais membros primeiro, coerência
 * depois, e rótulo mais curto para desempatar — o mais curto tende a ser o
 * termo guarda-chuva, não a variação de cauda longa.
 */
/**
 * O TERMO GUARDA-CHUVA DO LOTE.
 *
 * Quando o lote inteiro é um domínio só, o Silo deve levar o nome mais
 * amplo que o próprio lote oferece — não o rótulo do maior grupo, que
 * costuma ser uma variação de cauda longa. No lote real isso é a diferença
 * entre chamar o Silo de "skincare" e de "skin care noturno".
 *
 * O critério é do lote, não do código: menos palavras primeiro, texto mais
 * curto para desempatar. Nenhum termo está escrito aqui.
 */
function termoGuardaChuva(keywordTexts: ReadonlyMap<string, string>): { keywordId: string; texto: string } | null {
  let melhor: { keywordId: string; texto: string } | null = null;
  for (const [keywordId, texto] of keywordTexts) {
    const limpo = texto.trim();
    if (!limpo) continue;
    if (!melhor) { melhor = { keywordId, texto: limpo }; continue; }
    // `/s+/` dividia na LETRA "s", não em espaço: um escape comido por um
    // patch antigo. O critério "menos palavras primeiro" nunca chegou a rodar.
    const palavras = limpo.split(/\s+/).length;
    const palavrasMelhor = melhor.texto.split(/\s+/).length;
    if (palavras < palavrasMelhor || (palavras === palavrasMelhor && limpo.length < melhor.texto.length)) {
      melhor = { keywordId, texto: limpo };
    }
  }
  return melhor;
}

function grupoSemente(clusters: readonly ClusterAnalysis[]): ClusterAnalysis | null {
  const ordenados = [...clusters].sort((a, b) => {
    const porMembros = b.memberKeywordIds.length - a.memberKeywordIds.length;
    if (porMembros) return porMembros;
    const porCoerencia = (b.scores?.coherence?.value ?? 0) - (a.scores?.coherence?.value ?? 0);
    if (porCoerencia) return porCoerencia;
    return rotuloDoCluster(a).length - rotuloDoCluster(b).length;
  });
  return ordenados[0] || null;
}

export function buildArchitectureWorkingProposal(input: {
  analysis: ArchitectureAnalysis;
  existingSilos: readonly ExistingSilo[];
  /** §3 — o KeywordDNA canônico de cada keyword do lote. */
  keywords: readonly KeywordDnaSignals[];
  /** Normalizador de slug do próprio módulo; injetado para o domínio ficar puro. */
  slugOf: (value: string) => string;
}): ArchitectureWorkingProposal {
  const dnaPorKeyword = new Map(input.keywords.map(item => [item.keywordId, item]));
  const keywordTexts = new Map(input.keywords.map(item => [item.keywordId, item.text]));

  const silos = new Map<string, ProposalSilo>();
  const assignments: ProposalAssignment[] = [];
  const unassigned: ProposalUnassigned[] = [];

  const nucleoDoSilo = new Map<string, Set<string>>();
  /** Intenção dominante do Silo, declarada pelo DNA de quem já está nele. */
  const intencaoDoSilo = new Map<string, string | null>();

  const registrarExistente = (silo: ExistingSilo) => {
    const nome = silo.name || silo.centralEntity || silo.territoryRef;
    silos.set(silo.territoryRef, {
      key: silo.territoryRef,
      territoryRef: silo.territoryRef,
      name: nome,
      slug: silo.slug || input.slugOf(nome),
      seedKeywordId: null,
      source: "reused",
      reason: "Silo já existente no acervo desta Brand.",
    });
    nucleoDoSilo.set(silo.territoryRef, identityCore(`${nome} ${silo.centralEntity || ""}`));
    intencaoDoSilo.set(silo.territoryRef, intentComparisonKey(silo.intent ?? null));
  };
  for (const silo of input.existingSilos) registrarExistente(silo);

  /** A intenção que o DNA declara para o conjunto de um grupo. */
  const intencaoDoGrupo = (cluster: ClusterAnalysis): string | null => {
    const contagem = new Map<string, number>();
    for (const keywordId of cluster.memberKeywordIds) {
      const chave = intentComparisonKey(dnaPorKeyword.get(keywordId)?.intent ?? null);
      if (chave) contagem.set(chave, (contagem.get(chave) || 0) + 1);
    }
    return [...contagem.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  };

  const propor = (cluster: ClusterAnalysis, motivo: string): string => {
    const nome = rotuloDoCluster(cluster);
    const slug = input.slugOf(nome);
    const key = `proposed:${slug}`;
    if (!silos.has(key)) {
      silos.set(key, {
        key, territoryRef: null, name: nome, slug,
        seedKeywordId: cluster.headKeywordId,
        source: "proposed", reason: motivo,
      });
      nucleoDoSilo.set(key, identityCore(nome));
      intencaoDoSilo.set(key, intencaoDoGrupo(cluster));
    }
    return key;
  };

  const atribuir = (
    cluster: ClusterAnalysis,
    siloKey: string,
    motivo: string,
    membershipState: ProposalMembershipState,
    via: Contribuicao,
  ) => {
    for (const keywordId of cluster.memberKeywordIds) {
      const dna = dnaPorKeyword.get(keywordId) ?? null;
      assignments.push({
        keywordId, siloKey, reason: motivo, membershipState,
        // §7 — a base é a DESTA keyword, não a do grupo.
        basis: baseDaKeyword(dna, via),
        dnaVersionId: dna?.dnaVersionId ?? null,
        dnaContentHash: dna?.dnaContentHash ?? null,
      });
    }
  };

  /**
   * A base declarada, POR KEYWORD.
   *
   * §3/§7 — ela era montada por GRUPO, com `some(...)`: bastava um membro do
   * cluster ser conclusivo para todas as keywords afirmarem "qualificação
   * conclusiva", inclusive as `non_conclusive`. O painel mostrava uma coisa e
   * a justificativa afirmava outra sobre a MESMA keyword.
   *
   * Agora cada linha fala do próprio DNA. E o funil continua fora: TOFU/MOFU
   * explica estágio editorial, não prova pertencimento temático (§5).
   */
  const baseDaKeyword = (dna: KeywordDnaSignals | null, via: Contribuicao) => {
    const base: string[] = [];
    if (via.lexico) base.push("Coerência lexical do lote");
    if (via.entidade) base.push("Entidade central do KeywordDNA");
    if (via.modificadores) base.push("Modificadores do KeywordDNA");
    // §7 — só afirma intenção compatível quando ESTA keyword tem intenção.
    if (via.intencao && dna && intentIsKnown(dna.intent)) base.push(`Intenção ${dna.intent} compatível`);
    /*
     * §6 — a conclusividade só é APOIO quando foi condição: a afinidade por
     * entidade/modificadores exige DNA conclusivo. Fora disso, ela aparece
     * como ressalva, nunca como fundamento.
     */
    if ((via.entidade || via.modificadores) && dna?.semanticState === "conclusive") {
      base.push("Qualificação semântica conclusiva");
    } else if (dna?.semanticState === "non_conclusive") {
      base.push("Qualificação semântica não conclusiva (sinal fraco)");
    }
    return base;
  };

  /**
   * O Silo mais próximo de um grupo — por léxico E por DNA.
   *
   * §3 — "sem profundidade" é classificação, não instrução de não fazer nada.
   * §6 — e a semelhança de texto deixa de mandar sozinha: intenção declarada e
   * incompatível VETA a associação, e alinhamento de intenção sustenta uma
   * associação que o léxico sozinho não sustentaria.
   */
  const siloMaisProximo = (cluster: ClusterAnalysis) => {
    const membros = cluster.memberKeywordIds
      .map(id => dnaPorKeyword.get(id))
      .filter(Boolean) as KeywordDnaSignals[];
    const nucleoLexical = identityCore(
      [rotuloDoCluster(cluster), ...cluster.memberKeywordIds.map(id => keywordTexts.get(id) || "")].join(" "),
    );
    /*
     * §6 — entidade e modificadores só entram vindos de DNA CONCLUSIVO.
     *
     * Sustentar uma associação em entidade extraída de qualificação não
     * conclusiva seria decidir sobre um sinal que o próprio Minerador marcou
     * como incerto — e depois chamá-lo de fundamento na tela.
     */
    const conclusivos = membros.filter(item => item.semanticState === "conclusive");
    const nucleoEntidade = identityCore(conclusivos.map(item => item.centralEntity || "").join(" "));
    const nucleoModificadores = identityCore(conclusivos.flatMap(item => item.modifiers).join(" "));
    const intencao = intencaoDoGrupo(cluster);

    let melhor: { key: string; forca: number; via: Contribuicao } | null = null;
    let vetado: string | null = null;

    for (const [key, tokens] of nucleoDoSilo) {
      const intencaoDoAlvo = intencaoDoSilo.get(key) ?? null;
      const alinhado = Boolean(intencao && intencaoDoAlvo && intencao === intencaoDoAlvo);
      const conflito = Boolean(intencao && intencaoDoAlvo && intencao !== intencaoDoAlvo);

      const lexico = overlap(nucleoLexical, tokens);
      const entidade = overlap(nucleoEntidade, tokens);
      const modificadores = overlap(nucleoModificadores, tokens);

      if (conflito) {
        /*
         * §2 — A INTENÇÃO VETA.
         *
         * O léxico aproximava e o DNA diz que são coisas estruturalmente
         * diferentes. Quem manda é o DNA: agrupar por semelhança de string
         * sobre intenções incompatíveis é o erro que este veto impede.
         */
        if (lexico + entidade + modificadores > 0 && !vetado) {
          vetado = `intenção "${intencao}" incompatível com a do Silo ("${intencaoDoAlvo}")`;
        }
        continue;
      }

      /*
       * §1/§3/§6 — A INTENÇÃO NÃO CRIA AFINIDADE.
       *
       * "pele oleosa e acne" e "protetor solar" podem ser as duas
       * Informativas e não pertencem ao mesmo Silo. Intenção alinhada é
       * APOIO: aumenta confiança sobre uma relação temática que precisa
       * existir por outro caminho.
       *
       * A base temática é lexical (A) ou semântica vinda do próprio DNA —
       * entidade central ou modificadores (B). Sem uma das duas, não há
       * associação, por mais que as intenções combinem.
       */
      const temaSustenta = lexico > 0 || entidade > 0 || modificadores > 0;
      if (!temaSustenta) continue;

      const via: Contribuicao = {
        lexico: lexico > 0,
        entidade: entidade > 0,
        modificadores: modificadores > 0,
        intencao: alinhado,
        semantica: membros.some(item => item.semanticState === "conclusive"),
      };
      // Peso do tema; a intenção alinhada só desempata, nunca sustenta.
      const forca = lexico * 2 + entidade * 2 + modificadores + (alinhado ? 0.5 : 0);
      if (!melhor || forca > melhor.forca) melhor = { key, forca, via };
    }
    return { melhor, vetado };
  };

  /*
   * LOTE SEM NENHUM SILO NÃO PODE TERMINAR SEM NENHUM SILO.
   *
   * §2 — quando não há Silo algum e nenhum grupo se sustenta sozinho, o lote
   * inteiro fica órfão: foi o que aconteceu na homologação real (9 keywords,
   * 2 grupos, "2 sem profundidade", nada aplicado).
   */
  const semDestinoProprio = input.analysis.clusters.every(
    cluster => cluster.destination === "insufficient_depth" || cluster.destination === "ambiguous",
  );
  if (!silos.size && semDestinoProprio) {
    const semente = grupoSemente(input.analysis.clusters);
    const guardaChuva = termoGuardaChuva(keywordTexts);
    if (semente && guardaChuva) {
      propor(
        { ...semente, label: guardaChuva.texto, headKeywordId: guardaChuva.keywordId },
        "Nenhum Silo existia e o lote forma um domínio coerente: o termo mais amplo do lote dá a identidade inicial.",
      );
    } else if (semente) {
      propor(semente, "Nenhum Silo existia e o lote forma um domínio coerente: este grupo dá a identidade inicial.");
    }
  }

  for (const cluster of input.analysis.clusters) {
    if (cluster.destination === "strengthen_existing_silo" && cluster.suggestedTerritoryRef) {
      const key = cluster.suggestedTerritoryRef;
      if (!silos.has(key)) {
        for (const keywordId of cluster.memberKeywordIds) {
          unassigned.push({
            keywordId,
            reason: `O Silo sugerido (${cluster.suggestedTerritoryLabel || key}) não está no acervo carregado.`,
          });
        }
        continue;
      }
      atribuir(cluster, key, `Fortalece o Silo existente: ${cluster.reason}`, "existing_silo_match", TEMA_DO_ANALISADOR);
      continue;
    }

    if (cluster.destination === "new_silo_candidate") {
      const key = propor(cluster, `Grupo com profundidade própria: ${cluster.reason}`);
      atribuir(cluster, key, `Silo proposto a partir deste grupo: ${cluster.reason}`, "new_silo_candidate", TEMA_DO_ANALISADOR);
      continue;
    }

    const { melhor, vetado } = siloMaisProximo(cluster);
    if (melhor) {
      const motivo = cluster.destination === "ambiguous"
        ? `Grupo ambíguo resolvido pelo Silo de maior afinidade: ${cluster.reason}`
        : `Sem profundidade para Silo próprio; fortalece o Silo de maior afinidade: ${cluster.reason}`;
      const estado = silos.get(melhor.key)?.source === "proposed" ? "new_silo_candidate" : "expand_existing_silo";
      atribuir(cluster, melhor.key, motivo, estado, melhor.via);
      continue;
    }

    for (const keywordId of cluster.memberKeywordIds) {
      unassigned.push({
        keywordId,
        reason: vetado
          ? `Sem Silo compatível: ${vetado}.`
          : cluster.destination === "ambiguous"
            ? `Grupo ambíguo e sem Silo de afinidade no acervo: ${cluster.reason}`
            : `Sem profundidade para Silo próprio e sem Silo de afinidade no acervo: ${cluster.reason}`,
      });
    }
  }

  /*
   * §4 — NENHUMA KEYWORD FICA FORA DO PLANO.
   */
  const resolvidas = new Set([
    ...assignments.map(item => item.keywordId),
    ...unassigned.map(item => item.keywordId),
  ]);
  for (const keywordId of keywordTexts.keys()) {
    if (resolvidas.has(keywordId)) continue;
    unassigned.push({ keywordId, reason: "Não entrou em nenhum grupo narrativo do lote." });
  }

  const listaSilos = [...silos.values()].filter(silo =>
    silo.source === "proposed" || assignments.some(item => item.siloKey === silo.key));

  const counters: ArchitectureProposalCounters = {
    KEYWORDS_ANALYZED: keywordTexts.size,
    RESOLVED_KEYWORDS: assignments.length + unassigned.length,
    SILOS_REUSED: listaSilos.filter(silo => silo.source === "reused").length,
    SILOS_PROPOSED: listaSilos.filter(silo => silo.source === "proposed").length,
    ASSIGNED: assignments.length,
    EXPLICIT_UNASSIGNED: unassigned.length,
    BLOCKED: 0,
  };

  return {
    silos: listaSilos,
    assignments,
    unassigned,
    counters,
    proposalHash: proposalHashOf({ silos: listaSilos, assignments, unassigned }),
  };
}

/**
 * A identidade da proposta.
 *
 * §7 — é isto que substitui o "confirme novamente": se o hash mudou entre
 * processar e confirmar, a proposta não é mais a que a pessoa viu, e o certo é
 * recusar e mandar processar — não pedir um segundo clique sobre outro plano.
 */
export function proposalHashOf(input: {
  silos: readonly ProposalSilo[];
  assignments: readonly ProposalAssignment[];
  unassigned: readonly ProposalUnassigned[];
}): string {
  const partes = [
    ...input.silos.map(silo => `S|${silo.key}|${silo.slug}|${silo.source}`).sort(),
    // §7 — a versão do KeywordDNA entra na identidade: se o dado da keyword
    // mudar, a proposta é OUTRA, e confirmar a anterior seria confirmar
    // sobre base vencida.
    ...input.assignments.map(item => `A|${item.keywordId}|${item.siloKey}|${item.dnaContentHash || 'sem-dna'}`).sort(),
    ...input.unassigned.map(item => `U|${item.keywordId}`).sort(),
  ];
  // Hash textual determinístico: o domínio não importa cripto, e o que se
  // precisa aqui é só distinguir uma proposta da outra.
  let hash = 0;
  const texto = partes.join("\n");
  for (let i = 0; i < texto.length; i += 1) {
    hash = (Math.imul(31, hash) + texto.charCodeAt(i)) | 0;
  }
  return `proposal:${(hash >>> 0).toString(16)}:${partes.length}`;
}

/** §15 — a leitura que a mesa mostra depois de processar. */
export function formatProposalCounters(counters: ArchitectureProposalCounters): string {
  return [
    `KEYWORDS_ANALYZED = ${counters.KEYWORDS_ANALYZED}`,
    `RESOLVED_KEYWORDS = ${counters.RESOLVED_KEYWORDS}`,
    `SILOS_REUSED = ${counters.SILOS_REUSED}`,
    `SILOS_PROPOSED = ${counters.SILOS_PROPOSED}`,
    `ASSIGNED = ${counters.ASSIGNED}`,
    `EXPLICIT_UNASSIGNED = ${counters.EXPLICIT_UNASSIGNED}`,
    `BLOCKED = ${counters.BLOCKED}`,
  ].join(" · ");
}

/**
 * §10 — a proposta resolve o lote inteiro?
 *
 * Confirmar um plano que cobre 3 de 9 keywords sem dizer nada sobre as outras
 * 6 é o que deixou a homologação sem saber o que tinha sido confirmado.
 */
export function proposalCoversScope(proposal: ArchitectureWorkingProposal): {
  ok: boolean;
  missing: number;
  reason: string | null;
} {
  const missing = proposal.counters.KEYWORDS_ANALYZED - proposal.counters.RESOLVED_KEYWORDS;
  if (missing <= 0) return { ok: true, missing: 0, reason: null };
  return {
    ok: false,
    missing,
    reason: `${missing} keyword(s) do lote não têm destino na proposta. Processe a arquitetura novamente antes de confirmar.`,
  };
}
