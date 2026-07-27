# ADR-018 — Autenticação manual e ownership explícito

## Status

Aceita localmente em 2026-07-26, com validação remota e smoke test manual pendentes.

## Decisão

O login manual por Credentials e o cadastro público do Supabase Auth são o caminho temporário de entrada. Google OAuth fica suspenso de modo reversível pela flag server-side `GOOGLE_LOGIN_ENABLED`; seu provider e integrações são preservados.

Cadastro cria identidade, não tenant. A associação ocorre somente por ownership administrativo ou convite aceito. Uma marca nova deve ser criada no servidor com `owner_user_id` real, `status = active`, membership `role = owner`/`status = active` e compensação segura quando uma etapa posterior falhar.

Usuário sem marca permanece em estado explícito de espera e não recebe fallback para a Adalba. Admin global continua distinto de owner.

## Consequências

Não há alteração de migration, RLS ou grants. A criação administrativa usa service role somente no Route Handler server-side. O aceite completo de convite permanece em SDD separado porque exige fechamento transacional/idempotente do contrato existente.

## Reversão

Definir `GOOGLE_LOGIN_ENABLED=true` em ambiente controlado reabilita o provider e exige novamente a validação manual do fluxo Google → Supabase. A reversão do provisionamento não deve apagar marcas, memberships ou usuários preexistentes.
