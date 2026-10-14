# Arquiteto — Links Internos / InternalLinkGraph

Estado estrutural: READY
Próxima etapa: implementação funcional/UI.

## Papel

Arquiteto decide quem linka para quem, direção, reason, priority e anchorConcepts.

Radar decide a **aplicação evidencial**: quantidade recomendada, contextos,
afinidade de seção, âncora, variantes, distribuição, confiança e a evidência que
sustenta cada uma. Não altera a estrutura do grafo.

Planejador integra a aplicação ao ContentPlan final.

Redator formula anchor final e materializa o link.

### Relação exigida sem contexto sustentado

Quando a relação é `REQUIRED` e a evidência não sustentou nenhum contexto
natural de aplicação:

```text
structuralRequirement  = REQUIRED
applicationStatus      = REQUIRED_RELATION_WITHOUT_SUPPORTED_PLACEMENT
recommendedOccurrences = 0
```

Zero ocorrências **não** significa remover a relação: a exigência estrutural
continua de pé e volta como pendência declarada, não como silêncio.

### Sentido do `priority` e malha do Silo (2026-10-14)

SDD `docs/compartilhado/sdd-silo-interligado-seo-semantico-2026-10-14.md`, D1, D2,
D3 e D6, decididas pelo dono. Sem migration: o contrato da aresta não muda.

| `priority` | Sentido (D2) |
|---|---|
| `HIGH` | obrigatório no corpo do artigo |
| `MEDIUM` | no corpo quando uma seção trata do destino; senão, trilha "Continue no Silo" |
| `LOW` | trilha "Continue no Silo" |

- **Mínimo estrutural, que não baixa:** Suporte → Pilar e Pilar → cada Suporte
  são `HIGH`, mesmo que a aresta diga menos.
- **Malha (D1):** Suporte ↔ Suporte vale para todos os pares do Silo; o irmão vai
  ao corpo só quando a seção trata do assunto dele (no máximo 1 por seção) e o
  resto vai à trilha. A SiloPage liga a todos e é o índice completo.
- **Trilha (D3):** no fim do artigo, no máximo 12 irmãos e a SiloPage; a do Pilar
  não tem teto. A relação obrigatória (`HIGH`) nunca é cortada da trilha; desde a
  F4, com a malha no grafo, o irmão do grafo passa pelo teto como os outros. A trilha é a
  forma concreta do `REQUIRED_RELATION_WITHOUT_SUPPORTED_PLACEMENT`: nada some.
- **Teto por seção:** 3 links.
- **No grafo (F4):** o Arquiteto grava a malha com esses `priority`; o Radar só lê.

**Estado por fase:**

- **F2 (Radar) — implementada em código, confirmada por teste em 2026-10-14;
  validação manual pendente (dono).** A régua é `lib/radar/silo-link-mesh.ts`. O
  Radar lê o `priority` das arestas de saída do grafo aprovado, grava a obrigação
  em cada candidato K da planta nova (`priority`, aditivo), garante o `HIGH` no
  corpo (conferência da planta nova e leitura da planta gravada, sem IA e sem
  mudar o payload) e monta a trilha no CSV "Para escrever" e em
  `get_article_for_writing`. O grafo não é alterado: sem aresta S↔S ou
  Suporte → SiloPage, o Radar usa os membros do Silo e marca o destino como "fora
  do grafo aprovado".
- **F4 (Arquiteto) — implementada em código, confirmada por teste em 2026-10-14;
  validação manual pendente (dono).** O gerador
  (`lib/arquiteto/internal-link-structure.ts`, `buildStructuralLinkConnections`,
  chamado por "Processar links") grava a malha inteira num sucessor do grafo com
  aprovação humana; a decisão antiga ("Suporte ↔ Suporte não") foi revertida (D1).

  | Relação | `relationType` | `priority` |
  |---|---|---|
  | SiloPage → Pilar | `SILO_PAGE_TO_ARTICLE` | `HIGH` |
  | SiloPage → cada Suporte | `SILO_PAGE_TO_ARTICLE` | `MEDIUM` |
  | Pilar → SiloPage | `ARTICLE_TO_SILO_PAGE` | `MEDIUM` |
  | Pilar → cada Suporte | `PILLAR_TO_SUPPORT` | `HIGH` |
  | Suporte → Pilar | `SUPPORT_TO_PILLAR` | `HIGH` |
  | Suporte → SiloPage | `ARTICLE_TO_SILO_PAGE` | `LOW` |
  | Suporte ↔ Suporte (todos os pares) | `SUPPORT_TO_SUPPORT` | `MEDIUM` (assunto próximo) ou `LOW` |

  Silo de N artigos: `2 + 3(N−1) + (N−1)(N−2) + (N−1)` arestas (72 com 8, 930
  com 30). A afinidade entre irmãos é determinística (termos de conteúdo da
  principal, complementares, reforços e Assunto em comum, fora o cenário do
  Silo; a mesma faceta do plano quando há mais de uma), simétrica e dita no
  `reason`. Âncora de partida e IA de âncoras: nunca a keyword do destino nem
  frase que a contenha inteira (a régua do Radar, repetida e conferida em
  `link-anchor-ai.ts`). Ler antes de buscar (`lib/arquiteto/silo-link-mesh.ts`):
  aresta com âncora aprovada, da IA ou humana fica; a aresta nova da malha
  reaproveita a âncora do mesmo destino (variada por origem, proveniência
  `link-anchor-reuse`); só o esqueleto sem âncora vai à IA, com o custo dito na
  prévia antes de rodar. Grafo aprovado não é regerado sozinho: "Completar a
  malha do Silo" (prévia) abre a sucessora só acrescentando e confere que
  nenhuma aresta aprovada saiu nem mudou. A aba mostra a malha por artigo
  (X de Y, Y = todas as outras páginas do Silo) e "órfão no corpo".
- **Radar com a malha no grafo:** o irmão do grafo diz "pedido pelo grafo
  aprovado" na trilha; o teto de 12 irmãos (D3) vale também para ele; o `HIGH`
  nunca é cortado. O Radar lê o grafo que o artigo levou no envio
  (`arquitetoInternalLinks`): artigo enviado antes da aprovação da malha segue com
  o grafo do envio até a pessoa adotar os links novos no Radar (desde 2026-10-14:
  "Atualização disponível do Arquiteto · links", sem reenvio e sem refazer a
  pesquisa; o Arquiteto não reenvia nem é tocado).

## MVP
Graph por Silo.
Nodes: SILO_PAGE, ARTICLE_DNA.
KeywordDNA não é node.
Edges direcionais. A→B não implica B→A.

## Working copy
Persistente, editável, PATCH, lock_version, stale rejection e guards same-brand.
React Flow não é fonte canônica.

## Approved Graph
Append-only, imutável, versionado, previousVersion, contentHash, basisHash e proveniência.
Mudança estrutural real cria sucessor; mesmo conteúdo não cria versão.

## Hash
Inclui refs versionadas, nodes, edges, direção, relationType, priority e anchorConcepts.
Exclui warnings/conflicts diagnósticos e estado visual do React Flow.

## Tenant
Cross-brand isolation homologada em leitura, escrita, working copy, nodes, edges, proposal, previousVersion e handoff. Anon bloqueado. Service role não é autorização de domínio.

## Proposal IA
Separada do approved Graph. IA propõe; humano aceita/rejeita/edita. Proposal original permanece intacta.

## Layout
Canvas na metade superior, amplo, visível por padrão.
Direita: Atual/Lógica/SERP/IA em coluna.
Esquerda: comparativo/ganhos/perdas/ações humanas.
Uma única planilha.

## Próximo corte
1. carregar working copy real;
2. projetar React Flow;
3. renderizar SiloPage/ArticleDNA;
4. criar/remover edges;
5. editar reason/priority/anchorConcepts;
6. save/readback;
7. lock conflict;
8. aprovação;
9. approved readback;
10. successor;
11. handoff;
12. depois Proposal IA.


