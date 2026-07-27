# ADR-017 — FK canônica `lista_id` com `ON DELETE RESTRICT`

## Status

Aceita; aplicação remota e validação `READY` registradas em 2026-07-24. Não reexecutar a migration 0006 nem executar seu rollback.

## Contexto

Após a 0005, existem duas FKs para `keywords_kgr.lista_id`:

- `fk_keywords_kgr_lista_0005`, canônica, com `ON DELETE RESTRICT`;
- `keywords_kgr_lista_id_fkey`, legada, com `ON DELETE CASCADE`.

O `CASCADE` permitiria que a exclusão de uma lista apagasse silenciosamente keywords vinculadas. Isso viola o invariante de que uma keyword deve permanecer vinculada a uma lista ou visível como não agrupada.

## Decisão

A 0006 valida os atributos catalogados exatos das duas constraints — tabela, colunas, ações, nulidade de opções, validação e destino — preserva `fk_keywords_kgr_lista_0005` e remove somente `keywords_kgr_lista_id_fkey` quando ela for exatamente a FK `CASCADE` esperada. A definição textual é exibida apenas como diagnóstico, sem depender da formatação de `pg_get_constraintdef`; qualquer estado semântico inesperado aborta antes do `DROP`.

`lista_id` permanece nullable. A exclusão de lista deve ser bloqueada pelo `RESTRICT` enquanto houver vínculos; movimentação ou desagrupamento explícito deve ocorrer antes da exclusão.

## Consumidores auditados

- `modules/arquiteto/arquiteto-workspace.tsx`: “remover silo” altera apenas a organização local e desagrupa referências; não executa `DELETE` em `listas_kgr`.
- `modules/minerador/minerador-workspace.tsx`: exclusões encontradas são de keywords duplicadas/não publicadas, com escopo de tenant; não excluem listas.
- `app/api/marcas/route.ts`: exclusão é de marca, não de lista, e não depende do `CASCADE` de `lista_id`.
- `supabase/migrations/0001_protect_publicado.sql`: `trg_protect_published_lista` bloqueia lista com keyword publicada.

Não foi localizado consumidor ativo que dependa do `CASCADE`; nenhum módulo de aplicação foi alterado.

## Proteção e rollback

A migration captura contagens e fingerprints de `id + lista_id` e `id + brand_id` dentro da transação e aborta se qualquer dado, lista ou nulabilidade divergir. O rollback é assistido, reintroduz apenas a FK legada `CASCADE` com definição catalogada e valida novamente os fingerprints. Ele reintroduz comportamento perigoso e não deve ser executado sem revisão humana.

A precondição da migration cataloga as cinco funções e aceita os estados normalizados `public,pg_temp` e `pg_catalog,public,pg_temp`. Depois do `CREATE OR REPLACE FUNCTION`, a pós-condição exige `pg_catalog,public,pg_temp`. O dry-run informa `SEARCH_PATH_RECONCILIATION_REQUIRED` sem bloquear o estado antigo; a validation exige `SEARCH_PATH_OK`.

## Limites

Nenhum SQL remoto, migration, rollback, commit, push ou deploy foi executado. A aplicação remota permanece manual e exige o dry-run antes da janela controlada.

> **Nota de governança — 2026-07-27:** o bloco de limites acima descreve a autorização e a execução originalmente auditada, antes do resultado remoto. O resultado posterior abaixo é o estado vigente; esta distinção preserva a proveniência sem manter a migration como pendência atual.

## Atualização operacional — 2026-07-24

A migration 0006 foi aplicada remotamente antes desta correção e a validation pós-migration retornou `READY`. O erro `42P01` ocorreu somente no diagnóstico pós-`COMMIT`, quando o snapshot temporário já havia sido removido por `ON COMMIT DROP`; não há indicação de perda de dados. O arquivo local foi corrigido para futuras instalações. A migration não deve ser reexecutada e o rollback não deve ser executado.
