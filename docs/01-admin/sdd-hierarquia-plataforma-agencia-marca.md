# SDD — fundação operacional Plataforma → Agência → Marca

## Estado e escopo

Preparação local para o bootstrap manual da Agência Adalba. Nenhuma instrução deste documento foi executada remotamente.

O contrato vigente é `auth.users.id` para identidade, `public.perfis.role = 'admin'` para Admin global, `public.agencies.id` para agência e `public.marcas.id` para o tenant editorial. Agência não substitui `brandId`.

## Auditoria

- **Verificado no código e migration local:** `0006` define `public.is_global_admin()` por `auth.uid()` e `perfis.role = 'admin'`.
- **Preparado por migration local:** `0014_agency_foundation.sql` cria `agencies`, `agency_memberships` (`user_id`, não `member_user_id`) e `agency_brands`, além de RLS, `can_access_agency` e `can_manage_agency`.
- **Ainda não verificado remotamente:** aplicação da `0014`, identidade `scalbeto@gmail.com`, UUID da Lindisse e os vínculos reais.
- **Evidência histórica local:** Adalba tem `brandId` `95bef1bb-0a3d-4218-a01f-ac7281c55e45` e `adalbapro@gmail.com` tem UUID `d67ebbad-a590-45f8-8bb5-a19c6241ac1b`; ambos precisam ser conferidos novamente no bootstrap.

## Decisões e compatibilidade

### Auditoria remota de 2026-08-05

- **Confirmado remotamente por leitura:** as três tabelas de agência existem e estão vazias; `perfis` tem somente `adalbapro@gmail.com` como Admin global; Adalba e Lindisse possuem owners e memberships owner distintos e ativos.
- **Identidades confirmadas por leitura:** Adalba tem `brandId` `95bef1bb-0a3d-4218-a01f-ac7281c55e45` e `adalbapro@gmail.com` tem UUID `d67ebbad-a590-45f8-8bb5-a19c6241ac1b`. Lindisse é propriedade de `scalbeto@gmail.com`; sua membership owner é legítima e não pode ser removida. Scalberto ainda não possui e-mail confirmado, logo o bootstrap deve permanecer bloqueado até a confirmação e login manual.
- **Ainda não comprovado:** o ledger da `0014`, a definição da policy pré-existente e os detalhes de constraints/RLS/grants no catálogo. O script local `agency-remote-structure-audit.sql` existe para essa leitura manual segura.
- **Origem editorial legada:** a migration `0002_operational_editorial_flow.sql` pode criar `brand_memberships` `platform_admin` para cada Admin global em todas as marcas. Ela não explica a membership owner de Scalberto na Lindisse, que coincide com o owner atual.

- Admin global não é owner, não é `agency_member` automático e não recebe `brand_membership` automático.
- `agency_admin` não é owner automático. Owners e `brand_memberships` não são escritos pelos scripts.
- Há um bootstrap editorial legado que pode materializar `brand_memberships` para qualquer Admin global durante fluxo editorial. Ele está fora deste escopo; não executar fluxos editoriais durante o smoke de bootstrap se a ausência de mudança nessas memberships precisar ser comprovada.
- Uma marca tem no máximo uma agência operacional ativa, já imposto pelo índice parcial de `0014`.
- O bootstrap desta SDD não migra, lê nem altera providers. A governança atual
  de Google Ads, DataForSEO, DeepSeek, mídia e Telegram está registrada na SDD
  compartilhada de integrações; nenhum provider é propriedade da Agência ou de
  um módulo.

## Plano manual

1. Confirmar manualmente o e-mail e login de `scalbeto@gmail.com`; não executar bootstrap enquanto `email_confirmed_at` estiver nulo.
2. Gerar backups separados de schema e dados fora do Git. Em ambiente com Docker Desktop, usar `npx supabase db dump --linked --schema public --file <caminho-fora-do-git>` e depois `npx supabase db dump --linked --data-only --file <caminho-fora-do-git>`.
3. Executar `agency-remote-structure-audit.sql` no SQL Editor para registrar ledger, policy, constraints, RLS, funções e grants. Decidir sobre a `0014` somente com esse resultado.
4. Executar o dry-run somente leitura, preenchendo os quatro UUIDs e os dois nomes confirmados.
5. Se `0014` ainda não estiver aplicada, revisar e aplicar somente essa migration manualmente; se já estiver aplicada, não a reexecutar.
6. Executar o bootstrap em transação; ele concede o papel a Scalberto, cria/reusa Agência Adalba, cria/reconcilia o membership de AdalbaPro e os dois vínculos de marca.
7. Executar `agency-adalba-post-bootstrap-validation.sql` e validar o novo Admin em `/admin`, usuários e agências. Só então executar a despromoção separada.
8. A retirada do fallback runtime `ADMIN_EMAIL` permanece uma tarefa posterior e independente; até ela ocorrer, a despromoção no banco não remove o privilégio concedido por configuração.

## Rollback

O bootstrap é idempotente e não apaga dados. Antes de qualquer alteração ele valida identidade, schema, links conflitantes e snapshots de owner/memberships. Em falha, a transação reverte integralmente.

Após um bootstrap já confirmado, usar somente `agency-adalba-bootstrap.rollback.sql` sob autorização manual. Ele exige que a agência contenha somente o membership `agency_admin` esperado e os dois links de marca esperados, preserva owners e `brand_memberships` por snapshot e mantém pelo menos outro Admin global. Qualquer vínculo posterior aborta a reversão, sem apagar dados compartilhados.

Se o novo Admin não funcionar após um bootstrap confirmado, não despromover o Admin atual. Corrigir a identidade/papel de Scalberto ou restaurar temporariamente o mecanismo de bootstrap de configuração sob operação manual controlada. Esse mecanismo não pode permanecer como autorização normal.

## Testes e aceites

Testes locais cobrem schema/contratos, ausência de escrita em owner e `brand_memberships`, entradas obrigatórias, precondições e a separação da despromoção. RLS real, Auth real e persistência só podem ser confirmados no roteiro manual.
