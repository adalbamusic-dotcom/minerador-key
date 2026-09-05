# Propostas SDD — Arquiteto

Propostas de mudança estrutural devem registrar problema, contrato, consumidores, migração, snapshot, rollback, critérios de aceite e testes antes de qualquer código.

Proposta implementada nesta etapa: `2026-07-21-serp-formacao-identidade-publicada.md`.

## Estado atual

O pedido `2026-08-25-pedido-estrutural-internal-link-graph.md` foi
consolidado e implementado no escopo aprovado. A auditoria, o plano e o pedido
original permanecem preservados em
[`docs/_arquivo/2026-08-documentacao-legada/`](../../_arquivo/2026-08-documentacao-legada/)
e não são fonte operacional.

## Propostas/pedidos em aberto

Não há pedido estrutural aberto para o `InternalLinkGraph`. A próxima evolução
é funcional/UI e deve consumir o contrato persistente já confirmado, sem
reabrir a fundação ou criar uma migration sucessora sem evidência nova.
