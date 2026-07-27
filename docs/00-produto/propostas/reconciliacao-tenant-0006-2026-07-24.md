# Reconciliacao de seguranca tenant 0006 - 2026-07-24

> **Classificação atual — 2026-07-27:** proposta histórica/supersedida pela aplicação remota registrada em `docs/compartilhado/supabase.md`. Pré-condições, validações e rollback permanecem como histórico; não reexecutar 0006 nem executar rollback.

## Escopo

Infraestrutura compartilhada de tenantizacao e RLS. A 0006 corrige somente funcoes SECURITY DEFINER, grants de EXECUTE, policies de `listas_kgr` e constraints duplicadas semanticamente equivalentes apos a 0005.

## Invariantes

- Nenhum `INSERT`, `UPDATE` ou `DELETE` em dados operacionais.
- `keywords_kgr.lista_id`, `keywords_kgr.brand_id`, keywords, listas, owner, memberships e dados editoriais permanecem intocados.
- `auth.uid()` e a identidade principal; fallback por e-mail somente quando ambos os valores existem e nao estao vazios.
- `anon` nao executa as cinco funcoes; `authenticated` e `service_role` executam.
- `search_path` das cinco funcoes nao inclui `pg_temp`.
- Policies de escrita de `listas_kgr` usam `minerador/create`, `minerador/edit` e `minerador/manage`.
- Constraints legadas so sao removidas quando `pg_get_constraintdef` e os metadados do catalogo comprovam equivalencia com a constraint 0005.

## Rollout

Executar dry-run, revisar os conflitos e manter o aplicativo encerrado durante a janela. Aplicar a 0006 somente depois de confirmar que a 0005 existe estruturalmente. A 0005 nao deve ser reexecutada e seu rollback integral nao deve ser usado.

## Rollback

O rollback e transacional e restaura apenas as definicoes anteriores catalogadas nesta proposta: funcoes, grants, policies e nomes legados de constraints. Ele nao altera dados, `lista_id`, `brand_id`, memberships ou a estrutura completa da 0005.

## Estado

Preparado localmente; nao aplicado, nao homologado remotamente e sem qualquer SQL remoto executado.
