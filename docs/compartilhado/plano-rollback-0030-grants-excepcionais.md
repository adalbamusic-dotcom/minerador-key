# Plano de rollback — migration 0030, grants excepcionais

**Escopo:** `0030_brand_exceptional_operation_grants.sql`  
**Status:** preparado localmente; não executável automaticamente  
**Operações remotas:** nenhuma

## Antes de qualquer grant, evento ou guard real

Após snapshot e confirmação humana de que as duas tabelas permanecem vazias, um rollback estrutural poderá ser preparado como operação remota separada. Ele deverá remover, nesta ordem, o helper, o trigger, as tabelas e seus índices, somente depois de readback demonstrando zero grants, zero eventos e zero `historical_import_protected` criado pelo fluxo futuro.

## Após existir evidência real

Não executar `DROP`, `DELETE` ou limpeza genérica. O caminho de recuperação deve ser desabilitado, grants ativos devem ser revogados por operação auditada futura e grants, eventos e guards permanecem preservados como evidência. Qualquer reversão posterior exige nova SDD, snapshot, readback e autorização humana específica.

## Limites

Este plano não cria SQL de rollback, não altera `editorial_workflow_items`, não remove dados locais e não autoriza recovery, backfill, reimportação, commit, push ou deploy.
