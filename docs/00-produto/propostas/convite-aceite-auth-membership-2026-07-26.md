# SDD — Aceite de convite e ativação de membership

## Status

Proposta pendente de autorização para mudança estrutural. Não foi criada migration nem alterado o banco nesta tarefa.

## Auditoria

O projeto já possui a entidade canônica `public.brand_invitations`, `brand_invitation_permissions` e `brand_memberships` na migration editorial 0002. `InvitationRepository` cria convites com `token_hash`, papel, permissões, marca, ator e validade; não cria uma segunda entidade e não envia e-mail.

O contrato de aceite ainda não está completo na aplicação: não existe rota que receba o token bruto, valide uso único/expiração, confirme a identidade Auth do usuário, crie ou vincule `member_user_id`, ative membership com `invitation_id` e marque `brand_invitations.status = 'accepted'` com `accepted_at`.

## Mudança proposta

Adicionar um fluxo server-side de aceite usando token bruto somente durante a requisição, hash compatível com `token_hash`, transação ou RPC atômica para:

1. validar convite `pending` e não expirado;
2. confirmar usuário Auth autenticado ou concluir cadastro controlado;
3. criar/reconciliar uma única membership para `(marca, member_user_id)`;
4. preservar `role`, permissões e `invitation_id`;
5. marcar o convite como `accepted` uma única vez;
6. devolver somente a rota canônica da marca após persistência.

## Consumidores e riscos

Consumidores: Admin/Marca, login/cadastro, memberships, sidebar, resolução tenant e módulos protegidos. Riscos: replay de token, ativação parcial, troca indevida de owner, conflito de membership e exposição do convite. O aceite não pode alterar `owner_user_id`; troca de owner permanece ação estrutural separada.

## Compatibilidade e rollback

Preservar `brand_invitations`, `brand_invitation_permissions`, `brand_memberships`, `member_user_id`, `role`, `status` e as rotas existentes de criação/listagem. A mudança deve ser aditiva, com rollback por remoção do fluxo de aceite novo, sem apagar convites ou memberships preexistentes. A migration/RPC somente pode ser preparada após autorização explícita e revisão de RLS/constraints.
