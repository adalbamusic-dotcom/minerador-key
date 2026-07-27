# ADR-007 — localStorage não é fonte única de verdade

- **Status:** Aceita
- **Data:** 2026-07-20
- **Módulos afetados:** Marca, Arquiteto, Radar, Planejador, Redator, Publicações

## Contexto

O navegador pode perder, corromper ou ficar desatualizado em relação ao servidor.

## Decisão

`localStorage` é recuperação/fallback por marca e nunca substitui persistência confirmada. Dados grandes de recuperação do Arquiteto ficam em IndexedDB.

## Alternativas consideradas

Persistência somente local; apagar recovery inválido automaticamente.

## Consequências

Falhas de parse preservam o dado para auditoria e a interface precisa indicar modo de persistência.
