# ADR-004 — Workflow, publicação e transferência separados

- **Status:** Aceita
- **Data:** 2026-07-20
- **Módulos afetados:** Radar, Planejador, Redator, Publicações

## Contexto

Estado interno, passagem entre módulos e destino de publicação possuem regras diferentes.

## Decisão

Workflow usa itens e transições; transferência é importação seletiva/idempotente; publicação possui registro e ciclo próprios.

## Alternativas consideradas

Um único status global por artigo.

## Consequências

Mais estados explícitos, menos avanço implícito e maior auditabilidade.
