# ADR-001 — Publicado preservado durante reedição

- **Status:** Aceita
- **Data:** 2026-07-20
- **Módulo proprietário:** Publicações
- **Consumidor protegido:** Redator / published guard

## Contexto

Uma atualização precisa permitir reedição e nova exportação sem transformar temporariamente um conteúdo público em rascunho. O editor do Redator usa o estado `published` para bloquear slug, canonical e keyword principal.

## Decisão

Solicitação de atualização e reedição são metadados operacionais (`updateRequested` e histórico) e não rebaixam o registro de `published`. Durante a nova exportação, a URL publicada continua protegida; a conclusão da atualização exige registro manual na mesma URL final.

## Consequências

O fluxo tem uma distinção explícita entre versão pública e trabalho de atualização. A aba Atualizações deriva do pedido, e uma futura mudança para estados de revisão separados exigirá contrato coordenado com o Redator. Não há alteração de migration nesta decisão.
