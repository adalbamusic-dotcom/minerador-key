# Adendo 0022 — hardening ACL de Communication

Status: Proposto, nao aprovado
Implementacao: Preparada localmente, nao aplicada
Operacoes remotas: Nenhuma
Modulo proprietario: Communication / Supabase Security

## Problema

O preflight remoto informado para a 0020 encontrou concessoes explicitas
adicionais de `service_role` nas quatro tabelas de Communication. A origem
foi classificada como `ACL_PROVENANCE = IDENTIFIED`, com `CAUSE =
DEFAULT_ACL / PRE-EXISTING OBJECT ACL`. A migration 0020 adiciona grants
minimos, mas nao revoga ACLs amplos que ja existiam.

O resultado nao e tratado como falha do runtime: a auditoria local nao
encontrou consumidor que dependa dos privilegios extras. A origem exata e
proveniencia remotas foram relatadas pelo usuario; nao houve consulta remota
pelo agente.

## Proposta minima

Criar a migration sucessora `0022_communication_service_role_acl_hardening`
para normalizar somente os quatro objetos da 0020. O primeiro passo revoga
todos os privilegios de `service_role` nesses objetos; em seguida, concede
somente o contrato abaixo:

| Tabela | Concessao final de `service_role` |
| --- | --- |
| `communication_templates` | `SELECT`, `INSERT`, `UPDATE` |
| `communication_messages` | `SELECT`, `INSERT`, `UPDATE` |
| `communication_delivery_events` | `SELECT`, `INSERT` |
| `agency_invitation_token_generations` | `SELECT` |

`PUBLIC`, `anon` e `authenticated` permanecem sem acesso direto. A matriz
de verificacao inclui `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`,
`REFERENCES`, `TRIGGER` e `MAINTAIN`; qualquer privilegio fora do contrato
reprova o preflight/verifier.

Nao alterar `ALTER DEFAULT PRIVILEGES`, owner, membership, RLS, policies,
funcoes, dados, provider, Vault ou contratos de identidade.

## Consumidores preservados

- enqueue, claim, complete e delivery event usam RPCs `SECURITY DEFINER`;
- criacao e revogacao de token usam RPCs `SECURITY DEFINER`;
- dispatcher le templates e usa RPCs para mutacoes;
- onboarding inspeciona tokens e conclui por RPC;
- nenhum consumidor local usa `DELETE` direto nessas tabelas.

O inventario de consumidores e local. A ausencia de dependencia remota direta
deve ser mantida como criterio de revisao antes da aplicacao.

## Risco e rollback

Risco principal: algum fluxo server-side nao inventariado depender de escrita
direta de tabela por `service_role`. O preflight read-only e a revisao do
runtime devem passar antes da aplicacao.

O rollback preparado restaura `ALL PRIVILEGES` de `service_role` nos quatro
objetos, conforme o ACL anterior relatado, sem alterar defaults globais. Nao
executar o rollback neste gate.

## Aceitacao

1. Adendo aprovado humanamente.
2. Snapshot pre-0022 realizado pelo usuario.
3. `supabase/scripts/fase-comunicacao-0022-preflight-read-only.sql` executado
   e sem FAIL.
4. Migration 0022 aplicada manualmente.
5. Verifier 0020 v4 e preflight sucessor confirmam zero privilegios extras.
6. Testes locais de RPCs, dispatcher, onboarding, retry/reclaim e delivery
   permanecem aprovados.

## Divida separada

Os `ALTER DEFAULT PRIVILEGES` globais de `postgres`/`supabase_admin` ficam
registrados como decisao futura de plataforma. Este adendo nao os altera nem
os normaliza.
