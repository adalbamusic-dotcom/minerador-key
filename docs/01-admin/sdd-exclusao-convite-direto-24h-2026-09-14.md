# SDD aprovada — exclusão de convite direto e link de 24 horas

**Módulo proprietário:** Admin. **Autorização:** pedido explícito do usuário em 2026-09-14. **Estado:** implementação local; migration e deploy remotos dependem de execução manual.

## Contrato atual e mudança

`Revogar` atualiza `agency_invitations.status` e revoga as gerações de token, preservando convite, mensagens e eventos. A exclusão definitiva solicitada aplica-se **somente a convites diretos `ADMIN_INVITE` ainda não aceitos**, identificados por `invitation_id`, inclusive revogados/expirados. Não apaga a identidade `auth.users`, solicitações públicas, Agency, período de acesso nem mensagens de boas-vindas. Convites de `PUBLIC_APPLICATION` continuam revogáveis e históricos pela SDD de sucessão. Um e-mail já enviado pelo Resend não pode ser recolhido da caixa do destinatário.

Uma RPC transacional, restrita a `service_role`, bloqueia o convite e suas mensagens, recusa aceite, vínculo de Agency/onboarding/período e envio em curso, remove eventos de entrega, mensagens de convite, gerações de token e por último o convite. A API exige Admin global e confirma a ausência do convite por readback. A UI exige confirmação explícita e chama a ação de `Excluir definitivamente`; convites de solicitação pública conservam `Revogar`.

Novos convites de Agency em produção e fallback desconhecido expiram em **24 horas exatas**; desenvolvimento/homologação continuam em 2 horas. `agency_invitations.expires_at` e as gerações são a validade técnica; `access_expires_at` não muda. Convites existentes não são reescritos. Este adendo substitui somente o TTL de 12 horas do adendo de 2026-09-13 e o TTL original de sete dias da SDD de sucessão.

## Consumidores, riscos e rollback

Consumidores preservados: onboarding e aceite por token (convite ausente é inválido), dispatcher (sem mensagem pendente após a exclusão), sucessão de `PUBLIC_APPLICATION`, lista/histórico do Admin, Auth e Agency. A remoção é incompatível com o histórico anterior de convite direto; o banco impede exclusão de convite aceito ou referenciado. Uma mensagem `SENDING` impede a operação para não disputar com o provider. Mensagens `SENT` removidas internamente não apagam o registro externo do Resend.

Antes de aplicar a migration em produção, o usuário deve revisar backup/snapshot e o plano de recuperação do banco. Depois de cada exclusão não há desfazer na aplicação; recuperação requer backup externo. Rollback de código retira o botão/endpoint e restaura o TTL anterior apenas para convites futuros. A migration pode ter a função revogada/removida manualmente; dados já excluídos não reaparecem.

## Gate e validação

- [x] Usuário autorizou explicitamente exclusão definitiva de convites errados e prazo de 24 horas em 2026-09-14.
- [x] Testes de contrato locais: ACL/RPC, sequência transacional, convite aceito e application protegidos, estados de envio, API autorizada, UI e TTL (30 testes direcionados passaram).
- [x] TypeScript, lint direcionado, build e `git diff --check` passaram. O guard visual global estrito ainda aponta uma ocorrência preexistente em `modules/arquiteto/territorial-workspace-rows.tsx`, fora do escopo; nenhum smoke visual manual foi feito.
- [ ] Usuário aplica migration manualmente, depois publica o código e faz smoke real. Nenhum registro remoto é excluído nesta implementação local.
