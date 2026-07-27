# ADR-008 — Política da keyword principal publicada

## Decisão

Conteúdo publicado sempre protege marca, URL estrutural, slug e canonical. A keyword principal publicada recebe uma política independente: `locked` impede proposta automática; `reviewable` mantém a principal legada, mas registra que uma proposta futura poderá ser avaliada com SERP, intenção, coerência de slug, ausência de canibalização e aprovação humana. Conteúdo não publicado é `free`.

## Consequência

O estado é aditivo em `analise_semantica`; não troca principal, não altera URL e não executa migração. Arquiteto recebe o contexto para reconhecimento, mas a formação não foi modificada nesta decisão.
