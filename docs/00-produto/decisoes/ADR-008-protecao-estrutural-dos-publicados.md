# ADR-008 — Proteção estrutural dos publicados

- **Status:** Aceita
- **Data:** 2026-07-20
- **Módulos afetados:** Minerador, Arquiteto, Publicações

## Contexto

Mudar identidade estrutural de conteúdo publicado causa risco de SEO e rastreabilidade.

## Decisão

Slug, canonical, keyword principal, marca e URL estrutural são protegidos; alterações estruturais viram alerta ou exigem fluxo autorizado.

Esta decisão foi refinada pelo ADR-016, que formaliza a política da keyword principal. URL, slug, canonical e marca permanecem sempre protegidos. A principal publicada pode estar `locked` ou `reviewable`: no segundo caso, a revisão passa pelo Arquiteto, exige decisão humana, cria uma sucessora versionada e registra histórico. Nenhum módulo altera a principal ou sua identidade silenciosamente.

## Alternativas consideradas

Permitir edição comum; duplicar conteúdo publicado sem vínculo.

## Consequências

O domínio precisa validar published guards e o usuário deve receber bloqueio claro.
