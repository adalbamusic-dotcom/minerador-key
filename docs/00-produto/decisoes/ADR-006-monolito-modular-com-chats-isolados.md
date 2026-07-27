# ADR-006 — Monólito modular com chats isolados

- **Status:** Aceita
- **Data:** 2026-07-20
- **Módulos afetados:** Todos

## Contexto

O repositório único precisa permitir trabalho seguro em chats independentes.

## Decisão

Cada tarefa tem módulo proprietário, arquivos permitidos e proibidos. Mudança compartilhada aditiva, mínima, retrocompatível e necessária pode prosseguir dentro da tarefa autorizada quando preserva o contrato público, identifica consumidores e inclui regressão relacionada. Mudança estrutural ou incompatível exige proposta SDD e autorização antes da implementação.

## Alternativas consideradas

Alterações transversais livres; dividir prematuramente em múltiplos repositórios.

## Consequências

Documentação de fronteira é obrigatória e mudanças estruturais ficam mais deliberadas.
