# SDD — Exclusão atômica de keywords não publicadas com métricas oficiais

Status: implementação local autorizada; aplicação remota da migration pendente de execução manual.

## Problema

Uma keyword não publicada já medida pelo Google Ads não pode ser excluída pela interface: a FK de `minerador_keyword_metric_measurements.keyword_id` usa `ON DELETE RESTRICT`. A tentativa falha e, antes desta correção, o diálogo permanecia aberto com diagnóstico opaco.

## Decisão

Quando uma keyword **não publicada** for permanentemente excluída por usuário com `minerador:manage`, as medições Google Ads vinculadas exclusivamente a ela serão removidas na mesma transação por `ON DELETE CASCADE`.

Keywords publicadas continuam protegidas pelo contrato existente, pela interface e pelas proteções do banco. A migration não altera listas, conexões Google Ads, outras marcas nem keywords publicadas.

## Contrato e segurança

- tenant continua sendo `keywords_kgr.brand_id = marcas.id`;
- a exclusão ainda exige a policy `minerador:manage` já existente;
- não há exclusão pelo navegador de medições isoladamente;
- a cascade é limitada à relação `measurement.keyword_id → keywords_kgr.id`;
- a interface fecha o diálogo em qualquer terminal e mostra apenas mensagem sanitizada; detalhes técnicos ficam somente no console de desenvolvimento;
- código `23503` comunica dependência de histórico enquanto a migration ainda não tiver sido aplicada; `42501` comunica falta de permissão.

## Migration e rollback

`0008_minerador_keyword_measurement_delete_cascade.sql` valida que há uma única FK da métrica para a keyword, substitui apenas essa FK por `ON DELETE CASCADE` e é transacional.

Rollback: recriar a mesma FK com `ON DELETE RESTRICT`. O rollback só é seguro antes de novas exclusões, pois medições já removidas não são recuperáveis.

## Testes e aceite

- keyword não publicada sem métricas continua excluível;
- keyword não publicada medida é excluída junto com suas medições, sem resíduo órfão;
- keyword publicada continua recusada;
- falta de `minerador:manage` é recusada;
- falha fecha o diálogo e apresenta causa compreensível;
- não há acesso ou alteração entre marcas.

## Execução manual pendente

Aplicar a migration no ambiente remoto somente após revisão e backup/snapshot operacional. O agente não a executou.
