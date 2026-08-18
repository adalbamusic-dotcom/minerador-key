# Tarefa obrigatória — auditoria e endurecimento do legado de segurança

- **Módulo proprietário:** Segurança compartilhada / Minerador
- **Estado:** planejada e obrigatória antes de declarar zero legado ou homologação completa de segurança.
- **Não bloqueia:** aplicação manual da migration 0015.
- **Não autoriza:** alteração remota, migration, grant, revoke, remoção de função, trigger, tabela ou dado sem SDD/adendo e autorização específicos.

## Evidência de origem

O parecer read-only pré-0015 identificou, fora das dependências diretas ou indiretas da 0015:

- 12 grants DML para `anon` em `briefings_artigos` e `tenant_0005_migration_guard`;
- `minerador_discovery_candidate_brand_guard`;
- `minerador_discovery_import_brand_guard`;
- `minerador_discovery_run_immutable`.

As três funções são triggers operacionais das migrations 0009/0010, com `SECURITY DEFINER`, `search_path` explícito e execução pública a revisar. Elas não são classificadas como removíveis. `tenant_0005_migration_guard` é histórico estrutural. `briefings_artigos` só poderá ser classificada depois de inventário de consumidores.

## Objetivos e limites

1. Mapear consumidores, triggers, policies e roles de cada grant/função/tabela.
2. Confirmar se `PUBLIC` ou `anon` possuem acesso efetivo indevido, distinguindo ACL de bloqueio por RLS.
3. Revisar `SECURITY DEFINER`, `search_path` e ACL de execução sem quebrar triggers operacionais.
4. Preservar guards históricos e qualquer objeto ainda consumido.
5. Remover somente grants excessivos comprovados, por migration sucessora específica quando necessária.
6. Testar regressões do Minerador e provar isolamento entre marcas.

Nenhum objeto será removido em lote. A tarefa bloqueia encerramento da geração canônica, declaração de zero legado, limpeza destrutiva final e homologação completa da segurança.
