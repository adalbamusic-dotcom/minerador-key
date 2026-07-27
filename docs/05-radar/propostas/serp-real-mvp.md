# DiagnÃ³stico e implementaÃ§Ã£o â€” Radar / SERP real

**Data:** 2026-07-20
**MÃ³dulo proprietÃ¡rio:** Radar
**Status:** implementado no checkout; confirmaÃ§Ã£o real externa pendente de aÃ§Ã£o manual.

## DiagnÃ³stico antes da implementaÃ§Ã£o

O Radar tinha apenas `simulateSerp`, sem provider real, rota autenticada, snapshot versionado, diagnÃ³stico estruturado, revisÃ£o independente ou persistÃªncia confirmada. A keyword podia cair em ID tÃ©cnico. `serpRecords` tambÃ©m nÃ£o participava da recuperaÃ§Ã£o local nem do workspace remoto.

## ImplementaÃ§Ã£o realizada

- `lib/radar/serper-provider-core.ts` lÃª configuraÃ§Ã£o somente no servidor, chama `POST /search` com `X-API-KEY`, aplica timeout sem retry e normaliza organic, PAA, related searches e Knowledge Graph.
- `lib/radar/serp/contracts.ts` define snapshot, diagnÃ³stico, review e persistÃªncia.
- `lib/radar/keyword-resolver.ts` rejeita vazio, UUID, `pub-k-*`, `keyword-*` e outros IDs tÃ©cnicos.
- `app/api/editorial/serp/route.ts` resolve ArticleDNA/keyword no servidor, autoriza por marca e separa coleta de revisÃ£o.
- A UI distingue `Coletar SERP` de `Simular`, mostra histÃ³rico, resultados, diagnÃ³stico e aprovaÃ§Ã£o/rejeiÃ§Ã£o humana.
- A recuperaÃ§Ã£o local mantÃ©m snapshots/revisÃµes por marca. A migration `0003_radar_serp_snapshots.sql` prepara armazenamento remoto append-only sem ser executada automaticamente.
- O Planejador sÃ³ recebe referÃªncia de SERP quando hÃ¡ snapshot real aprovado; sem isso a pendÃªncia humana permanece no plano.

## Arquivos compartilhados autorizadamente conectados

Foram alterados apenas os consumidores necessÃ¡rios do fluxo existente: contexto editorial, contratos/persistÃªncia compartilhados, repositÃ³rio editorial, workspace route, operational flow e planilha operacional. Arquiteto e Planejador nÃ£o foram alterados.

## SeguranÃ§a e custo

A chave nÃ£o Ã© importada pelo client nem retornada. A rota exige sessÃ£o, marca e permissÃ£o Radar. A consulta pode ser cobrÃ¡vel e sÃ³ ocorre por aÃ§Ã£o explÃ­cita; testes usam fixtures, sem endpoint pago, retry ou batch implÃ­cito.

## EvidÃªncia de validaÃ§Ã£o

- `tests/radar-serper-provider.test.mts`: sucesso, normalizaÃ§Ã£o/hash, ausÃªncia de configuraÃ§Ã£o, URL invÃ¡lida, timeout e bloqueio de keyword tÃ©cnica.
- `tests/editorial-pipeline.test.mts` e `tests/operational-flow.test.mts`: regressÃµes existentes preservadas.
- Resultado: 72 testes passando, `npx tsc --noEmit` passando e ESLint direcionado passando.

## PendÃªncias reais

NÃ£o foi executada chamada real Ã  Serper.dev, nÃ£o foi aplicada migration remota e nÃ£o foi feita validaÃ§Ã£o visual autenticada. A confirmaÃ§Ã£o manual deve usar uma Ãºnica keyword, revisar a proveniÃªncia e confirmar se a persistÃªncia foi remota ou fallback local.
