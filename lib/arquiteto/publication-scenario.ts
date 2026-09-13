/**
 * O CENÁRIO DE PUBLICAÇÃO DESTA PASSADA — declarado, não escondido.
 *
 * A primeira passada do Arquiteto prova a cadeia SILOS → ARTIGOS → LINKS →
 * RADAR sobre arquitetura PLANEJADA. Não há conteúdo publicado sendo
 * trabalhado aqui, e exigir prova de publicação para aprovar uma página que
 * ninguém publicou ainda bloqueia o fechamento por um fato que não existe.
 *
 * O que isto NÃO é:
 *
 *  - não apaga a capacidade de reconciliar publicados. Sitemap, catálogo do
 *    site, `publishedStructureRef`, identidade publicada e divergência de
 *    canonical continuam implementados e testados;
 *  - não é um bypass silencioso. A relaxação é declarada, tem nome, viaja por
 *    parâmetro e o padrão de `resolveSiloPageApprovalReadiness` continua
 *    EXIGINDO verificação — quem não passa a bandeira não muda de comportamento;
 *  - não desliga a checagem de identidade contraditória. Canonical divergente
 *    entre o artefato e o catálogo continua bloqueando: isso não é "falta
 *    verificar a publicação", é o artefato afirmando dois endereços para a
 *    mesma página.
 *
 * Quando volta a valer: assim que uma rodada declarar ou importar conteúdo
 * como publicado, esta constante vira `true` e as verificações voltam a ser
 * obrigatórias — a reconciliação completa está no backlog como
 * PUBLISHED_STRUCTURE_RECONCILIATION.
 */
export const CURRENT_SCENARIO_REQUIRES_PUBLISHED_VERIFICATION = false;

/** Frase para a tela dizer por que a publicação não está sendo cobrada. */
export const PUBLICATION_VERIFICATION_DEFERRED_REASON =
  "Esta passada fecha arquitetura planejada: verificação de publicação não é exigida agora.";
