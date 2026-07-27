# ADR-005 — Importação seletiva e idempotente

- **Status:** Aceita
- **Data:** 2026-07-20
- **Módulos afetados:** Minerador, Arquiteto, Radar, Planejador, Publicações

## Contexto

Reimportações e seleção parcial não podem duplicar dados nem ocultar itens já tratados.

## Decisão

Transferências são explícitas por item, preservam itens já importados visíveis e usam identidade/marca para impedir duplicação.

## Alternativas consideradas

Importar todos os itens automaticamente; remover itens já importados da interface.

## Consequências

A UI precisa informar bloqueios e a persistência deve garantir unicidade.
