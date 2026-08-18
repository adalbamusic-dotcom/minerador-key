# Fase 2E — preparação local da migration 0017

## Estado de entrada

- **Relatado pelo operador:** 0015 e 0016 foram aplicadas e validadas manualmente.
- **Confirmado pelo preflight remoto informado:** consumidores de runtime, dependências bloqueadoras, papéis inválidos e informação exclusiva em canonical_role retornaram zero.
- **Confirmado pelo operador:** há snapshot novo pós-0016/pré-0017.
- **Preparado localmente:** a 0017, manifest read-only, rollback estrutural e pós-validação.
- **Não verificado nesta preparação:** o catálogo remoto atual. A aplicação continua manual.

## Corte físico proposto

A futura aplicação remove somente:

1. brand_memberships.user_key;
2. perfis.marca_id;
3. agency_memberships.canonical_role.

Permanecem member_user_id, perfis.role, owners UUID, agency_memberships.user_id e agency_memberships.role.

## Dependências físicas esperadas

O preflight aprovado informou seis linhas de dependência classificadas como EXPECTED_DROP_DEPENDENCY. Uma constraint pode aparecer mais de uma vez em pg_depend quando usa a mesma coluna em mais de uma expressão. A migration exige novamente as seis linhas, mas deduplica cada constraint ou índice por OID antes do DROP; qualquer classe adicional ou mudança na contagem aborta antes de escrever.

O manifest fase-2e-0017-dependency-manifest-read-only.sql lista os seis nomes de constraint/índice sem retornar dados pessoais. A 0017:

- remove constraints locais explicitamente;
- remove índices locais remanescentes explicitamente;
- recusa objeto ligado a outra tabela, índice de constraint ou classe inesperada;
- não usa CASCADE.

## Proteções e risco

A 0017 exige as três colunas legadas, os contratos canônicos e owners UUID válidos. Também bloqueia funções, policies, triggers ou views que ainda referenciem contrato legado, divergência de canonical_role, papel de agência inválido e qualquer dependência não prevista.

Ela não atualiza dados, não muda owners, não altera memberships legítimas, RLS, grants, funções, módulos editoriais ou rotas. O risco residual é exclusivamente uma divergência entre o preflight/snapshot e o catálogo no momento da aplicação; os guards convertem essa divergência em abort transacional.

## Rollback

Durante falha da própria 0017, a transação reverte integralmente.

Depois de um COMMIT, o rollback local somente recria as três colunas vazias como ponte estrutural. Ele não inventa user_key, perfis.marca_id ou canonical_role, nem restaura índices, constraints, policies ou autorização textual. Recuperação histórica completa depende do snapshot pré-0017 aprovado.

## Operação manual posterior

1. Executar o manifest read-only e confirmar expected_drop_dependencies = 6, blocking_dependencies = 0 e READY_FOR_0017_REVIEW.
2. Revisar o snapshot pré-0017 e o rollback.
3. Aplicar manualmente 0017_remove_legacy_identity_contracts.sql.
4. Executar fase-2e-legacy-contracts-post-validation-read-only.sql.
5. Exigir post_migration_status = READY antes de qualquer nova limpeza ou corte de consumidor.

## Débito separado

legacy_security_debt: PENDING_SEPARATE_HARDENING. Grants e funções históricos fora das três colunas não integram a 0017.

## Limites desta entrega

remote_operations: NONE  
migration_0017_execution: NOT_PERFORMED
