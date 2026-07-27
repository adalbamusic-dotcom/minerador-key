# MÃ©tricas independentes da aplicabilidade KGR

**MÃ³dulo proprietÃ¡rio:** Minerador
**DecisÃ£o permanente:** volume e `results_allintitle` pertencem Ã  keyword; aplicabilidade KGR controla somente estratÃ©gia, apresentaÃ§Ã£o da pontuaÃ§Ã£o e aprovaÃ§Ã£o humana.

## MudanÃ§a

Substituir a taxonomia local de mediÃ§Ã£o, que dependia indevidamente da existÃªncia de `kgr_score`, por: `without_data` (Sem mediÃ§Ã£o), `partial` (Parcial), `complete` (Completa) e `invalid` (InvÃ¡lida). A classificaÃ§Ã£o observa volume e resultados de forma independente da decisÃ£o KGR; valor de mÃ©trica rejeitado continua `invalid`.

Valores de filtro legados sÃ£o adaptados sem ocultaÃ§Ã£o silenciosa: `with_score` passa a `complete`; o antigo `without_data`, que misturava ausÃªncia e parcial, volta a `Todos` por nÃ£o ter equivalÃªncia segura.

## Escopo e rollback

Arquivos: `lib/minerador/kgr-applicability.ts`, projeÃ§Ã£o/filtros e apresentaÃ§Ã£o do Minerador, preferÃªncias locais e testes. NÃ£o hÃ¡ alteraÃ§Ã£o no Arquiteto, schema, migration, chamadas externas ou escrita remota. Rollback: restaurar a taxonomia local anterior; mÃ©tricas persistidas nÃ£o sÃ£o modificadas.
