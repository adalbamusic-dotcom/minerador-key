# ADR-016 — Política da principal do Minerador consumida pelo Arquiteto

## Status

Decisão aceita e implementada localmente. A validação manual tenantizada ainda está pendente quando aplicável.

## Data

2026-07-27

## Módulos afetados

Minerador, Arquiteto e Radar como consumidor diagnóstico.

## Decisão

O Arquiteto consome `analise_semantica.primary_keyword_policy` (`locked`,
`reviewable` ou `free`) e normaliza o estado efetivo para `locked`, `revisable`,
`free`, `conflict` ou `unknown`. Publicado sozinho não protege a principal.
URL, slug, canonical e marca publicados permanecem protegidos
independentemente.

`reviewable` usa `arquitetura_publicado`; `locked`, arquitetura confirmada ou
KGR confirmado usa `fortalecimento`; unidade nova usa `formacao`. Decisão
explícita humana `kgr_decisao=NAO`/`not_applicable` resolve competição
`competitive`; KGR confirmado resolve `kgr_light`; ausência não vira não-KGR.
Confirmação humana cria sucessora do ArticleDNA, registra a candidata escolhida,
torna a política efetiva `locked` e preserva a identidade publicada.

## Consequências

ArticleDNA e ArticleControlContext carregam política, proveniência, métricas,
candidatas, decisão e motivo de proteção como campos opcionais. Legados sem
política ficam `unknown` no Arquiteto, sem travamento silencioso. Nenhuma UI,
contrato ou cálculo do Minerador é alterado.

## Validação

Fixtures cobrem `SEO para Clínicas`, publicado legado, unidade nova, não-KGR,
KGR confirmado, troca supervisionada, confirmação humana e proteção
independente de URL/principal.
