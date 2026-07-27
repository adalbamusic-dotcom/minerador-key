# ADR-009 — ContentPlan definitivo e sucessores imutáveis

- **Status:** Aceita
- **Data:** 2026-07-20
- **Módulo proprietário:** Planejador
- **Módulos consumidores:** Redator, Publicações e workflow editorial

## Contexto

O Planejador possuía um plano inicial suficiente para abrir o editor, mas não carregava de forma explícita todas as instruções editoriais nem oferecia edição versionada e gate editorial completo.

## Decisão

Planos novos usam um bloco aditivo `planning` no `ContentPlan` v2. O plano registra estratégia, estrutura, links, fontes/evidências, CTA, imagens, Skills, metadados, carga do Radar e notas humanas. Toda edição cria uma sucessora com hash e `previousVersionId`; aprovação é humana e registrada por evento de status. O Redator continua consumindo somente a versão aprovada.

## Consequências

O contrato compartilhado permanece compatível com planos v1, mas exige mais hidratação e validação no Planejador. Ausência de pesquisa ou fonte permanece pendência explícita. Não há migration nova nem geração automática de artigo, fonte ou estatística.
