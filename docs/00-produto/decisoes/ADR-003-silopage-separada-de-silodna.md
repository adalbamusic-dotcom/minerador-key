# ADR-003 — SiloPage separada de SiloDNA

- **Status:** Aceita
- **Data:** 2026-07-20
- **Módulos afetados:** Arquiteto, Radar

## Contexto

Direção arquitetural e conteúdo de uma página de silo evoluem em ritmos diferentes.

## Decisão

SiloDNA e SiloPage são contratos e versões distintos, ligados por referências explícitas.

## Alternativas consideradas

Um único objeto para regras e página.

## Consequências

Mais referências para hidratar, com menor risco de uma alteração de página deformar a estratégia do silo.
