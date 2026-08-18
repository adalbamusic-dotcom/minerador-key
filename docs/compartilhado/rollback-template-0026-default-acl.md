# Template de rollback — 0026 Default ACL

Este arquivo é somente documentação. Não é um script SQL executável e não
autoriza operação remota.

## Fonte obrigatória

O rollback somente pode ser construído depois de o operador preservar o
resultado integral de:

`supabase/scripts/default-acl-preflight-read-only.sql`

O snapshot deve ser identificado por versão fixa, data da consulta e projeto
confirmado pelo operador. Sem esse snapshot, não há rollback seguro para
inventar.

## Estado a restaurar

Para cada linha de default ACL capturada antes da 0026, preservar exatamente:

| Campo | Valor do snapshot |
|---|---|
| role alvo | `<role>` |
| schema | `<schema ou ALL_SCHEMAS>` |
| object type | `<TABLE / SEQUENCE / FUNCTION / TYPE / outro>` |
| grantee | `<role ou PUBLIC>` |
| privilege | `<privilégio>` |
| grantability | `<true/false>` |

O rollback futuro deverá reconstruir apenas as concessões e revogações que
existiam no snapshot para a combinação exata de role, schema, tipo, grantee,
privilégio e grantability. Não deve aplicar um conjunto genérico nem remover
defaults descobertos depois da 0026.

## Restrições

- Não alterar ownership.
- Não tocar defaults de `supabase_admin` ou de schemas fora de `public`.
- Não alterar ACL de objetos existentes.
- Não alterar RLS, policies, dados, funções ou tabelas.
- Revisar o plano com o snapshot real antes de qualquer execução manual.
