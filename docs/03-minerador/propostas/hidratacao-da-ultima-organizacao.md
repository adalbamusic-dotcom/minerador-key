# HidrataÃ§Ã£o da Ãºltima organizaÃ§Ã£o do Minerador

**MÃ³dulo proprietÃ¡rio:** Minerador
**Status:** implementada localmente, pendente de validaÃ§Ã£o manual autenticada.

## Problema e causa confirmada

A chave jÃ¡ separa `usuÃ¡rio + marca + mÃ³dulo`, mas `CompactSavedViews` era montado somente dentro de `Organizar`. A preferÃªncia sÃ³ era lida apÃ³s o clique, e a aplicaÃ§Ã£o ainda era adiada por `setTimeout(0)`.

## Contrato atual e soluÃ§Ã£o

`localStorage` guarda somente preferÃªncia de visualizaÃ§Ã£o na chave `minerador-pro:last-view:<usuÃ¡rio>:<marca>:minerador`; nÃ£o Ã© fonte de verdade de keywords. Um restaurador headless, exclusivo do Minerador, Ã© montado fora do painel e aplica uma configuraÃ§Ã£o vÃ¡lida uma vez por chave, apÃ³s usuÃ¡rio, marca e schema de filtros estarem disponÃ­veis. O painel permanece somente como editor, limpeza e visualizaÃ§Ã£o de filtros.

O restaurador reutiliza a chave e o formato de preferÃªncias existentes, mas nÃ£o altera `CompactSavedViews`, que tambÃ©m atende Arquiteto e `OperationalDataGrid`. A leitura usa dependÃªncias reais e `useLayoutEffect`, sem temporizador, clique programÃ¡tico, reload, polling ou estado global.

## ValidaÃ§Ã£o e compatibilidade

JSON invÃ¡lido Ã© ignorado, nunca removido. Campos legados reconhecidos sÃ£o adaptados; campo invÃ¡lido, enum desconhecido ou silo que nÃ£o pertence Ã  marca ativa volta apenas ao padrÃ£o seguro, preservando os demais campos vÃ¡lidos. A configuraÃ§Ã£o limpa Ã© persistida somente quando o usuÃ¡rio efetivamente muda os filtros; a hidrataÃ§Ã£o inicial nÃ£o regrava conteÃºdo idÃªntico.

Durante a restauraÃ§Ã£o hÃ¡ somente um estado visual curto, sem apagar keywords. A tabela continua derivada de `keywords` e filtros por `useMemo`; `Organizar` nÃ£o participa da hidrataÃ§Ã£o, busca, ordenaÃ§Ã£o, seleÃ§Ã£o ou derivaÃ§Ã£o.

## Arquivos, consumidores e riscos

- Alterados: `app/(brand)/[brandRef]/minerador/page.tsx`, `modules/minerador`, `components/minerador/last-organization-restorer.tsx`, `lib/minerador/last-organization.ts` e testes do Minerador.
- NÃ£o alterado: `components/editorial/compact-saved-views.tsx`; consumidores preservados: Arquiteto e `components/editorial/operational-data-grid.tsx`.
- NÃ£o afetados: volume, `/api/volume`, `results_allintitle`, KGR, Site/Sitemap, KeywordDNA, dados remotos e demais mÃ³dulos.

Se o armazenamento estiver indisponÃ­vel, o Minerador segue com os filtros padrÃ£o. Rollback: remover apenas o restaurador local e sua montagem; nÃ£o hÃ¡ migration, escrita de domÃ­nio nem operaÃ§Ã£o remota a reverter.

## CritÃ©rios de aceite e testes

O aceite exige: restauraÃ§Ã£o com painel fechado, isolamento A/B por usuÃ¡rio e marca, abertura do painel sem efeito colateral, persistÃªncia posterior sem ciclo, resumo estÃ¡vel de atÃ© trÃªs critÃ©rios e limpeza persistida. Testes automatizados cobrem parsing, legado, chave, resumo, painel e projeÃ§Ã£o; reload/troca de marca autenticados continuam como roteiro manual.
