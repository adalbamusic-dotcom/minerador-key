# Proveniencia dos grants extras da 0020

Data: 2026-08-10

## Estado da evidencia

- Verifier remoto informado: v4, 173 PASS, 7 FAIL, 5 INFO.
- Os sete FAILs sao `explicit=true; effective=true` para `service_role`.
- Nenhuma ACL foi alterada e nenhum revoke foi executado.
- O diagnostico remoto foi relatado pelo usuario e identificou owner/grantor
  `postgres`, default ACL relevante e ausencia de membership de
  `service_role`.
- Classificacao: `ACL_PROVENANCE = IDENTIFIED`; `CAUSE = DEFAULT_ACL /
  PRE-EXISTING OBJECT ACL`.
- Os extras nao sao exigidos pelo runtime local e deixam de ser um problema
  de interpretacao do verifier; continuam pendentes de hardening aprovado.

## Auditoria local

A busca local em migrations, scripts, docs, testes e codigo ativo encontrou:

- `supabase/migrations/0020_communication_transactional_minimum.sql`: concede
  somente o conjunto minimo esperado e revoga apenas `PUBLIC`, `anon` e
  `authenticated` nas quatro tabelas.
- Nenhum `GRANT` local concede os sete privilegios extras a `service_role`.
- Nenhum `ALTER DEFAULT PRIVILEGES` foi encontrado no escopo pesquisado.
- `GRANT ALL` encontrado em `0021` pertence a tabelas de autorizacao canonica,
  nao a nenhuma tabela de Communication.
- As migrations 0019/0020 estao sem commits historicos disponiveis neste
  checkout; o Git local nao consegue provar a data de introducao remota.

## Tabela de classificacao

| TABLE | PRIVILEGE | EXPLICIT_REMOTE | GRANTOR/ORIGIN | FOUND_IN_REPO | RUNTIME_USES | CLASSIFICATION | RECOMMENDATION |
| --- | --- | --- | --- | --- | --- | --- | --- |
| agency_invitation_token_generations | INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER/MAINTAIN | true | DEFAULT_ACL / PRE-EXISTING OBJECT ACL | NOT_FOUND_IN_REPO | NOT_USED_BY_RUNTIME; RPC SECURITY DEFINER | EXTRA_NOT_RUNTIME_REQUIRED | Revogar em 0022 apos preflight |
| communication_delivery_events | UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER/MAINTAIN | true | DEFAULT_ACL / PRE-EXISTING OBJECT ACL | NOT_FOUND_IN_REPO | NOT_USED_BY_RUNTIME; RPC registra evento | EXTRA_NOT_RUNTIME_REQUIRED | Revogar em 0022 apos preflight |
| communication_messages | DELETE/TRUNCATE/REFERENCES/TRIGGER/MAINTAIN | true | DEFAULT_ACL / PRE-EXISTING OBJECT ACL | NOT_FOUND_IN_REPO | NOT_USED_BY_RUNTIME; claim/complete usam RPC | EXTRA_NOT_RUNTIME_REQUIRED | Revogar em 0022 apos preflight |
| communication_templates | DELETE/TRUNCATE/REFERENCES/TRIGGER/MAINTAIN | true | DEFAULT_ACL / PRE-EXISTING OBJECT ACL | NOT_FOUND_IN_REPO | NOT_USED_BY_RUNTIME; dispatcher somente le | EXTRA_NOT_RUNTIME_REQUIRED | Revogar em 0022 apos preflight |

## Semantica confirmada da 0020

A migration executa:

```sql
REVOKE ALL ... FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ... TO service_role;
GRANT SELECT, INSERT ... TO service_role;
GRANT SELECT ... TO service_role;
```

Ela nao executa `REVOKE` de `INSERT`, `UPDATE` ou `DELETE` de
`service_role`. Portanto, se esses privilegios ja existiam como ACL explicita,
uma concessao mais restrita nao os remove. Essa e a hipotese local mais forte,
mas a origem exata continua dependente do catalogo remoto.

## Consumidores

- Insercao/atualizacao de token ocorre por RPC `SECURITY DEFINER`, nao por
  grant direto de tabela.
- Revogacao de token ocorre por RPC; nao ha delete de token.
- Delivery events sao inseridos por RPC e o contrato e append-only.
- Messages sao enfileiradas, reivindicadas e concluidas por RPC; nao ha delete.
- Templates sao lidos pelo dispatcher; nao ha delete em runtime.

Os sete privilegios extras estao classificados como `NOT_USED_BY_RUNTIME`,
mas a classificacao de origem permanece `UNKNOWN` ate o diagnostico remoto.

## Script de diagnostico

Executar, quando autorizado, somente:

`supabase/scripts/fase-comunicacao-0020-acl-provenance-read-only.sql`

O script retorna owner, grantee, privilege, grantor, grantable, ACL do objeto,
default ACL relevante, membership de `service_role`, efetividade e sinal de
proveniencia. Nao retorna conteudo de tabelas, tokens, hashes, e-mails ou
segredos.

## Possivel hardening futuro, sem executar

Se o diagnostico confirmar ACL explicita legada sem owner/membership/default
que a reintroduza, a migration sucessora provavel sera `0022` e podera conter,
apos snapshot e preflight, somente:

```sql
REVOKE INSERT, UPDATE, DELETE ON public.agency_invitation_token_generations FROM service_role;
REVOKE UPDATE, DELETE ON public.communication_delivery_events FROM service_role;
REVOKE DELETE ON public.communication_messages FROM service_role;
REVOKE DELETE ON public.communication_templates FROM service_role;
```

Isso foi preparado localmente em `supabase/migrations/0022_communication_service_role_acl_hardening.sql`.
Ainda exige aprovacao do adendo, snapshot, preflight, aplicacao manual e
pos-verification. Nenhuma migration foi executada. O rollback preparado esta
em `supabase/scripts/fase-comunicacao-0022-rollback.sql`.

## Matriz completa do contrato `service_role`

`CURRENT` abaixo significa `PRESENT_REPORTED_IN_OBJECT_ACL` quando o
diagnostico remoto informou a ACL bruta `arwdDxtm/postgres`; a confirmacao por
objeto deve ser refeita pelo preflight antes da aplicacao. `REQUIRED_BY_0020`
e o contrato minimo da migration local. `RUNTIME_USES` registra o inventario
de consumidores local; mutacoes passam por RPCs `SECURITY DEFINER`.

| TABLE | PRIVILEGE | CURRENT | REQUIRED_BY_0020 | RUNTIME_USES | KEEP-REVOKE |
| --- | --- | --- | --- | --- | --- |
| agency_invitation_token_generations | SELECT | PRESENT_REPORTED | KEEP | leitura server-side/RPC | KEEP |
| agency_invitation_token_generations | INSERT | PRESENT_REPORTED | NO | RPC only | REVOKE |
| agency_invitation_token_generations | UPDATE | PRESENT_REPORTED | NO | RPC only | REVOKE |
| agency_invitation_token_generations | DELETE | PRESENT_REPORTED | NO | nenhum | REVOKE |
| agency_invitation_token_generations | TRUNCATE | PRESENT_REPORTED | NO | nenhum | REVOKE |
| agency_invitation_token_generations | REFERENCES | PRESENT_REPORTED | NO | nenhum | REVOKE |
| agency_invitation_token_generations | TRIGGER | PRESENT_REPORTED | NO | nenhum | REVOKE |
| agency_invitation_token_generations | MAINTAIN | PRESENT_REPORTED | NO | nenhum | REVOKE |
| communication_templates | SELECT | PRESENT_REPORTED | KEEP | dispatcher | KEEP |
| communication_templates | INSERT | PRESENT_REPORTED | KEEP | seed/admin server-side | KEEP |
| communication_templates | UPDATE | PRESENT_REPORTED | KEEP | admin server-side | KEEP |
| communication_templates | DELETE | PRESENT_REPORTED | NO | nenhum | REVOKE |
| communication_templates | TRUNCATE | PRESENT_REPORTED | NO | nenhum | REVOKE |
| communication_templates | REFERENCES | PRESENT_REPORTED | NO | nenhum | REVOKE |
| communication_templates | TRIGGER | PRESENT_REPORTED | NO | nenhum | REVOKE |
| communication_templates | MAINTAIN | PRESENT_REPORTED | NO | nenhum | REVOKE |
| communication_messages | SELECT | PRESENT_REPORTED | KEEP | inspeccao/dispatcher | KEEP |
| communication_messages | INSERT | PRESENT_REPORTED | KEEP | RPC enqueue | KEEP |
| communication_messages | UPDATE | PRESENT_REPORTED | KEEP | RPC claim/complete | KEEP |
| communication_messages | DELETE | PRESENT_REPORTED | NO | nenhum | REVOKE |
| communication_messages | TRUNCATE | PRESENT_REPORTED | NO | nenhum | REVOKE |
| communication_messages | REFERENCES | PRESENT_REPORTED | NO | nenhum | REVOKE |
| communication_messages | TRIGGER | PRESENT_REPORTED | NO | nenhum | REVOKE |
| communication_messages | MAINTAIN | PRESENT_REPORTED | NO | nenhum | REVOKE |
| communication_delivery_events | SELECT | PRESENT_REPORTED | KEEP | inspeccao server-side | KEEP |
| communication_delivery_events | INSERT | PRESENT_REPORTED | KEEP | RPC delivery webhook | KEEP |
| communication_delivery_events | UPDATE | PRESENT_REPORTED | NO | append-only/RPC | REVOKE |
| communication_delivery_events | DELETE | PRESENT_REPORTED | NO | nenhum | REVOKE |
| communication_delivery_events | TRUNCATE | PRESENT_REPORTED | NO | nenhum | REVOKE |
| communication_delivery_events | REFERENCES | PRESENT_REPORTED | NO | nenhum | REVOKE |
| communication_delivery_events | TRIGGER | PRESENT_REPORTED | NO | nenhum | REVOKE |
| communication_delivery_events | MAINTAIN | PRESENT_REPORTED | NO | nenhum | REVOKE |

Para `PUBLIC`, `anon` e `authenticated`, a mesma matriz tem `CURRENT =
ABSENT_REQUIRED` e `KEEP-REVOKE = KEEP_REVOKED` em todas as 32 combinacoes.
