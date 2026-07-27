# ADR-015 â€” Perfis de unidade e estratÃ©gia SERP combinada

## Status

Aceita em 2026-07-22.

## Contexto

KGR, ciclo editorial e tipo de unidade respondem a perguntas diferentes. Um resultado KGR nÃ£o define que a unidade Ã© artigo, uma URL publicada nÃ£o define fortalecimento e a ausÃªncia de KGR nÃ£o significa nÃ£o KGR. A mesma validaÃ§Ã£o SERP nÃ£o pode ser aplicada a artigo, serviÃ§o, landing page e categoria.

## DecisÃ£o

O Arquiteto passa a representar as trÃªs dimensÃµes separadamente:

- `unitClassification`: tipo sugerido/confirmado, fonte, evidÃªncias e finalidade de landing;
- `serpStrategy.lifecycleMode`: `formacao`, `arquitetura_publicado` ou `fortalecimento`;
- `serpStrategy.competitionStrategy`: `kgr_light`, `competitive` ou `unknown`;
- `serpStrategy.unitProfile`: perfil especÃ­fico da unidade;
- `unitPurpose`: objetivo editorial, necessidade de busca, conversÃ£o e indexaÃ§Ã£o.

KGR confirmado usa validaÃ§Ã£o leve; nÃ£o KGR explicitamente recebido usa estratÃ©gia competitiva; candidato, conflito ou ausÃªncia usam `unknown`. O tipo e o ciclo continuam independentes.

## ConsequÃªncias

ArticleDNA antigo continua vÃ¡lido porque os campos sÃ£o opcionais. A sugestÃ£o nÃ£o equivale a confirmaÃ§Ã£o. ConfirmaÃ§Ã£o, alteraÃ§Ã£o, conflito ou desconhecido criam uma sucessora humana e preservam o histÃ³rico. URL, slug, canonical, marca e principal confirmada de publicados continuam protegidos.

O `ArticleControlContext` leva a projeÃ§Ã£o para o Radar como campo opcional. O enum operacional de workflow nÃ£o Ã© ampliado: `article|silo_page` permanece reservado ao transporte operacional, enquanto tipos de unidade vivem em `context.unit.type`. NÃ£o hÃ¡ alteraÃ§Ã£o da UI ou workflow do Radar nesta decisÃ£o.

## Rejeitado

- criar um campo Ãºnico `nao_kgr` que misture competiÃ§Ã£o e tipo;
- inferir KGR por score, volume, slug ou SERP;
- tratar serviÃ§o como artigo informacional;
- exigir SERP automaticamente para landing de campanha;
- alterar publicados ou reprocessar ArticleDNAs em lote.
