# Arquiteto — Links Internos / InternalLinkGraph

Estado estrutural: READY
Próxima etapa: implementação funcional/UI.

## Papel
Arquiteto decide quem linka para quem, direção, reason, priority e anchorConcepts.
Planejador decide seção/contexto/obrigatoriedade editorial.
Redator formula anchor final e materializa o link.

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


