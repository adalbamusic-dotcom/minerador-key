# SDD — Fase 3B.1: porta de entrada de agências

- **Status:** aprovada para implementação local controlada. A migration `0018` requer snapshot, revisão humana, preflight e aplicação manual separada.
- **Módulo proprietário:** Interface Planner.

## Decisão e estados

Agências são clientes. A Home pública oferece somente o Plano **Free** (R$ 0, acesso mediante aprovação). Não existe cobrança, checkout, cupom, assinatura ou criação automática.

`AgencyApplication` é uma solicitação pública com estados `PENDING → APPROVED | REJECTED`. `AgencyInvitation` é um convite autorizado com estados `PENDING → ACCEPTED | EXPIRED | REVOKED`. `Agency` só nasce no aceite autenticado de um convite válido.

As origens do convite são `ADMIN_INVITE` e `PUBLIC_APPLICATION`. Ambas convergem no mesmo onboarding, que cria `agencies.owner_user_id = auth.users.id`, deriva `agencyRef` e não cria membership, papel global ou acesso editorial implícito.

## Persistência e consumidores

- `agency_applications`: nome da empresa, responsável, e-mail normalizado, site/quantidade opcionais, `FREE`, status e chave de idempotência.
- `agency_invitations`: destino, responsável, empresa, `FREE`, origem, `application_id` quando aplicável, expiração, status e `token_hash`. O token bruto nunca é persistido ou listado.
- `agency_onboardings`: trilha semântica de origem, convite, owner, agência e idempotência.
- `approve_agency_application`: fronteira transacional que bloqueia a solicitação, cria no máximo um convite e a marca como aprovada.
- `complete_agency_onboarding`: fronteira transacional para criação da agência e aceite.

Consumidores: Home `/`, formulário `/solicitar-acesso`, revisão em `/admin/agencias`, convite direto do Admin e `/onboarding/agencia`. `POST /api/admin/agencies` e `POST /api/marcas` continuam desativados para criação operacional.

## Segurança e idempotência

O visitante pode somente enviar dados validados à rota server-side; não lista solicitações, não cria Auth, agency ou membership e não recebe dados de terceiros. E-mail é comunicação/deduplicação, nunca autorização. A revisão exige `perfis.role = 'admin'`. `service_role` permanece somente no servidor; RLS é habilitado e execução pública das RPCs é revogada.

A chave de idempotência da solicitação evita retry acidental. A aprovação bloqueia a solicitação e retorna o convite existente em retry, sem criar outro. O aceite retorna a mesma agência para o mesmo owner e chave; outro actor é recusado.

## Email, rollback e evolução

Não há provider de e-mail configurado: entrega é `NOT_CONFIGURED` e o Admin pode copiar o link apenas no momento da criação do convite. Rollback antes da aplicação: não aplicar 0018. Após aplicação, não executar `DROP` direto; auditar solicitações, convites e onboards e preparar migration humana reversível.

Planos pagos, billing, limites, telemetria, convites de membros e onboarding de marcas pertencem a fases posteriores. Plano não é identidade nem tenant.

## Testes e smoke pendente

Cobrir solicitação sem criação de Auth/agência, controle de retry, visibilidade exclusiva de Admin, rejeição sem convite, aprovação sem agência, convite direto, token inválido/expirado/revogado, destinatário incompatível, aceite único, owner/ref e isolamento. Os smokes A (Home → aprovação) e B (convite direto) permanecem manuais e posteriores à aplicação remota autorizada.
