# SDD proposta — convite de Agência sem subdomínio de sessão

**Módulo proprietário:** Admin (convite administrativo de Agência).  
**Estado:** aprovada pelo usuário em 2026-09-14 para implementação local; runtime implementado localmente, ainda não publicado nem homologado em produção.
**Data:** 2026-09-13.

## Problema confirmado

O e-mail de `ADMIN_INVITE` recente foi aceito pelo Resend (`communication_messages.status = SENT`), e o destinatário não possuía identidade em `auth.users` no momento da consulta read-only. O link produzido pelo dispatcher aponta para `/auth/new-slot?next=/onboarding/agencia?...`. No host `https://minerador-key.vercel.app`, a rota publicada respondeu `307` para `/login?error=session_slot_unavailable`. O `next` com o token deixou de ser encaminhado, e o usuário chegou ao cadastro comum sem vínculo com o convite.

`APP_BASE_URL` resolveu a formação do link e o envio. O problema restante é a dependência de `SESSION_SLOT_ROOT_DOMAIN` e de host wildcard para abrir um novo slot na produção. Em `localhost`, o host `s-*.localhost` atende ao fluxo; não há equivalência automática no domínio `vercel.app`.

## Contrato atual e consumidores

- `lib/server/communication/dispatcher.ts` chama `buildIsolatedAuthEntryUrl` e preserva o token somente na URL do convite; o banco guarda apenas hash de token.
- `app/auth/new-slot/route.ts` cria um host de sessão e redireciona o `next` sanitizado; qualquer falha cai em `/login?error=session_slot_unavailable`, sem `next`.
- `components/auth/new-session-slot-link.tsx` também usa `/auth/new-slot` para “Entrar em outra conta”. Essa finalidade deve permanecer isolada e não receber fallback.
- `app/onboarding/agencia/page.tsx` valida o convite, impede aceite com identidade de e-mail diferente e exige confirmação humana; `app/api/onboarding/agency/continue/route.ts` escolhe cadastro convidado ou login pela identidade Auth; `app/api/auth/invited-signup/route.ts` valida token antes de criar a identidade.
- Login, cadastro, callback, Supabase SSR, sessões e cookies host-only são consumidores indiretos. Nenhum deles pode trocar de ator ou criar Agency implicitamente.

## Proposta limitada

Quando `buildSessionSlotOrigin` falhar por ausência de host de slot **e** o `next` sanitizado apontar exatamente para `/onboarding/agencia` com token presente, `/auth/new-slot` redirecionará para esse mesmo caminho no host atual, com `Cache-Control: private, no-store` e política de referência que não divulgue o token. O fluxo existente de onboarding então valida o token e leva um destinatário sem identidade a `/cadastro` em modo de convite (`inviteToken` e `callbackUrl`), ou um destinatário já cadastrado a `/login` preservando o callback.

O fallback é explícito na interface como **uso de uma única sessão por vez neste navegador**. Se houver outra identidade autenticada, o onboarding não faz logout automático nem aceita o convite para ela: solicita a saída explícita antes da continuidade. O fluxo “Entrar em outra conta” continua a exigir host de slot; apenas o link de convite tem continuidade no host atual. Com `SESSION_SLOT_ROOT_DOMAIN` configurado e host válido, o comportamento de slot atual permanece igual.

Não há nova entidade, migration, SQL, alteração de Supabase Auth, credencial Resend ou envio automático. O convite continua pendente até aceite autenticado e transacional; cadastro genérico continua a criar somente identidade Auth.

## Riscos, compatibilidade e rollback

- **Isolamento:** sem subdomínio, duas identidades não podem coexistir simultaneamente no mesmo origin. É obrigatório preservar a recusa de e-mail divergente e a saída explícita. Nenhum estado local de outro ator pode virar autorização.
- **Token na URL:** manter a validação server-side, token hash-only no banco, `no-store`, destino estritamente same-origin e sem logging do token. Não devolver token ao Admin.
- **Compatibilidade:** hosts `localhost` e hosts wildcard configurados continuam a usar slots. Links de convite já enviados passam pela mesma rota e podem ser recuperados enquanto válidos, sem reenvio obrigatório.
- **Rollback:** reverter somente a regra de fallback da rota e a orientação visual. Não limpar sessões, localStorage, IndexedDB, convites ou mensagens. O fallback anterior para `/login?error=session_slot_unavailable` volta a valer.

## Validação exigida

1. Testes locais: slot válido preserva host isolado; convite tokenizado sem host de slot preserva token e `next` no mesmo origin; `next` inválido, externo, sem token ou não pertencente ao onboarding não recebe fallback; outro ator continua sem aceite.
2. TypeScript, lint direcionado, build e `git diff --check`; consultar a documentação Next.js 16 local antes de alterar a rota.
3. Smoke manual em Preview/Production: abrir link real em navegador sem sessão, confirmar cadastro convidado (e-mail fixo), criar identidade e concluir Agency apenas após confirmação; repetir com identidade já existente e com outra identidade logada. Confirmar que Resend `SENT` não é tratado como `DELIVERED`.
4. Validação visual da tela de convite/cadastro em dark/light, 360/768/1024/1440px e estados de erro.

## Gate de decisão

- [x] Aprovado pelo usuário em 2026-09-14 para implementar somente o fallback de convite descrito acima.
- [ ] Rejeitado; aguardar domínio/host wildcard e manter o comportamento atual.
- **Aprovador e data:** usuário, 2026-09-14.

## Implementação local após aprovação — 2026-09-14

- O fallback usa somente `next` sanitizado com caminho exato
  `/onboarding/agencia` e um único token não vazio; `next` externo, sem token,
  duplicado ou com fragmento continua no erro de slot. Host isolado disponível
  segue o fluxo original.
- O redirect do convite no mesmo origin define `private, no-store` e
  `Referrer-Policy: no-referrer`. A tela existente continua a exigir e-mail
  compatível e saída explícita de outra sessão; a orientação foi esclarecida
  como uma conta por vez no mesmo endereço. Nenhum logout automático foi criado.
- Testes direcionados (19), TypeScript, ESLint direcionado e build passaram.
  Resposta HTTP local no build de produção confirmou `307` para o onboarding
  tokenizado e manteve `/login?error=session_slot_unavailable` para entradas
  não convidadas. O smoke com token real na Vercel permanece **manual e
  pendente**; não houve deploy, SQL, migration, alteração de Auth remoto ou
  novo envio nesta implementação.
- O guard visual estrito do arquivo tocado passou. A suíte visual global
  permanece com cinco falhas preexistentes em Arquiteto/Radar fora do escopo;
  nenhuma alteração nesses módulos foi feita.
