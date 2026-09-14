# Adendo aprovado — validade técnica de 12 horas do convite de Agência

**Módulo proprietário:** Admin.  
**Autorização:** pedido explícito do usuário em 2026-09-13 para links de convite válidos por 12 horas em produção.  
**Escopo:** altera apenas o TTL de novos convites de Agência em produção e o fallback de ambiente desconhecido. Substitui somente a linha temporal de 7 dias da SDD `docs/compartilhado/sdd-agency-invitation-successor-lifecycle.md`; preserva seu restante.

## Contrato anterior e decisão

O contrato implementado era 7 dias em produção, 2 horas em homologação/desenvolvimento. A referência do usuário a uma espera de 24 horas não corresponde ao prazo técnico atual desse link. A decisão é **12 horas em produção**, mantendo 2 horas em homologação/desenvolvimento e override injetável somente em testes. Não há período de espera obrigatório antes do aceite: o destinatário pode abrir o link imediatamente.

`agency_invitations.expires_at` é a validade técnica do link. `access_expires_at` e `agency_access_periods` são a duração de acesso da Agency e não mudam. Convites anteriores preservam seu `expires_at`; não há atualização retroativa, SQL ou migration. O Resend não controla esse TTL.

## Consumidores, compatibilidade e risco

- `createDirectAgencyInvitation`, `approveAgencyApplication` e `renewAgencyInvitation` usam o resolver central e passam a criar novos prazos de 12 horas em produção.
- O dispatcher apresenta o vencimento persistido real; a checagem de token/onboarding continua a recusar convite expirado, revogado, aceito ou de e-mail incompatível. Hash-only, uso único, RLS e confirmação humana permanecem.
- Um convite direto antigo ainda `PENDING` com prazo maior que 12 horas não é reescrito. Pela classificação de renovação atual, não pode receber nova geração sob a política nova; o Admin deverá revogá-lo e criar um novo convite após o deploy, se precisar de um link com 12 horas. Convites ligados a application exigem sucessor conforme o lifecycle existente.
- Esta mudança não conserta `/auth/new-slot` no host `vercel.app`; esse fallback permanece proposto separadamente em `sdd-convite-agencia-sem-slot-vercel-2026-09-13.md`.

## Verificação e rollback

Testar resolução por ambiente, expiração de 12 horas, classificação de convite legado e consumidores Admin/onboarding; executar TypeScript, lint direcionado e `git diff --check`. O smoke de link real na Vercel continua manual e depende da correção de navegação. Rollback de código restaura o TTL anterior somente para convites futuros; nenhum convite persistido é reescrito ou apagado.
