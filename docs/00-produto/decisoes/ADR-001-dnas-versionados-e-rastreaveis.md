# ADR-001 — DNAs versionados e rastreáveis

- **Status:** Aceita
- **Data:** 2026-07-20
- **Módulos afetados:** Marca, Minerador, Arquiteto, Radar, Planejador, Redator

## Contexto

Decisões editoriais precisam sobreviver a revisões e transferências.

## Decisão

DNAs e ContentPlans usam identidade, versão, hash, versão anterior, origem, razão de mudança e eventos de status quando aplicável.

## Alternativas consideradas

Sobrescrever o objeto atual; guardar somente histórico textual.

## Consequências

Há maior custo de hidratação e referências devem ser validadas; em troca, alterações são auditáveis e artefatos consolidados não são mutados.
