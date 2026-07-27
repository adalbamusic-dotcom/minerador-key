# SDD — Coleta real de SERP com Serper.dev

## Status

Implementada no MVP do Radar em 2026-07-20. A chamada paga e a migration remota permanecem ações manuais, fora desta execução.

## Decisão

O provider é server-side e lê `SERP_PROVIDER`, `SERPER_API_KEY`, `SERPER_API_BASE_URL`, país, idioma, quantidade e timeout apenas no momento da coleta. A chave segue no header `X-API-KEY`. A rota autentica a sessão, verifica a marca e exige `radar:edit` para coletar ou `radar:review` para decidir.

## Contrato e fluxo

`POST /api/editorial/serp` possui as ações `collect` e `review`. A coleta resolve a keyword principal no ArticleDNA e na fonte da marca, bloqueando IDs técnicos. O resultado cria `SerpResearchSnapshot` real, `needs_review`, versionado, com hash e diagnóstico determinístico. A revisão é independente e o mock permanece separado.

## Persistência

`supabase/migrations/0003_radar_serp_snapshots.sql` cria tabelas append-only para snapshots e reviews, com RLS e proteção de imutabilidade. Se a migration não estiver aplicada, a aplicação usa fallback local identificável; nunca declara persistência remota confirmada.

## Integração

Os consumidores compartilhados foram conectados somente para manter a planilha, recuperação e fluxo existentes: contexto editorial, contratos, repositório, workspace route e operational flow. Arquiteto e Planejador não foram editados. O Planejador recebe referência de SERP somente após aprovação humana do snapshot.

## Limites

Sem retry, polling, batch implícito ou chamada paga em testes. O resultado não é declaração de originalidade nem aprovação editorial. Classificações heurísticas permanecem sujeitas a revisão humana.

## Validação

Fixtures do provider, regressões editoriais/operacionais, TypeScript e ESLint direcionado passaram. A execução manual de uma única keyword e a confirmação visual/autenticada continuam pendentes.
