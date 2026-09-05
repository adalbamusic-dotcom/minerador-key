# Spec — Admin

## Consolidação de governança das integrações — 2026-08-25

O Admin Global é o proprietário da infraestrutura compartilhada. Administra
Connections, capabilities, grants, bindings, quotas, ambientes, rotação e
uso sanitizado. A Agência recebe disponibilidade conforme plano/período/política
e a Marca consome o que sua Agência disponibiliza. Minerador, Arquiteto, Radar,
Planejador, Redator e Publicações não possuem provider, Connection, credential,
grant, binding ou quota próprios.

Estado documental: `PLATFORM_INTEGRATION_FOUNDATION = READY` e
`READY_FOR_RADAR_DEVELOPMENT = YES`. DataForSEO, DeepSeek (`deepseek-v4-pro`),
Google Cloud Speech/Storage e YouTube Data API possuem Connection/estado
`READY` conforme evidência manual registrada. Google Ads mantém credential
configurada, com connection/provider smoke e operation smoke separados.

Telegram usa um Bot global da Plataforma. Token/segredo configurados e
`getMe = PASS` não significam webhook configurado: `TELEGRAM_WEBHOOK =
NOT_CONFIGURED` e inbound E2E continua pendente. A Marca administra
especialistas e bindings de domínio; não recebe secrets.
## 1. Propósito
Administrar a visão da plataforma e o cadastro de marcas. **Verificado no código.**
## 2. Responsabilidades
Admin global permanece fora do tenant. Pode abrir uma marca na rota canônica, mas não se torna proprietário nem ganha identidade pessoal da equipe.
Exibir resumo administrativo e permitir criar, editar e excluir marcas conforme autorização.
## 3. Fora de responsabilidade
Não opera keywords, arquitetura editorial ou publicação.
## 4. Entidades
Marca, perfil e papel de usuário.
## Reestruturação de rota — 2026-07-23

A rota canônica é /admin com tabs. /admin/marcas existe somente como redirect para /admin?tab=marcas. A implementação funcional pertence a `modules/admin`; a rota App Router apenas compõe o módulo.

## 5. Jornada
Admin autenticado abre `/admin`, navega a `/admin/marcas` e administra uma marca.
## 6. Regras de negócio
Somente administrador cria/edita; marca com publicado é protegida contra exclusão. **Verificado no código.**
## 7. Estados
Carregando, autorizado, sem autorização, salvando, sucesso e erro.
## 8. Ações
Listar, criar, editar e solicitar exclusão.
## 9. Entradas
Sessão, dados de marca e silos iniciais.
## 10. Saídas
Marca persistida e silos iniciais quando aplicável.
## 11. Contratos com outros módulos
Fornece marcas ao contexto compartilhado.
## 12. Proteções
Autorização server-side; publicado não deve ser removido.
## 13. Casos de borda
Sessão ausente, marca inexistente e falha de Supabase.
## 14. Arquitetura técnica atual aprovada
Páginas App Router, `/api/marcas`, `BrandProvider`. **Verificado no código.**
## 15. Critérios de aceite
Operações autorizadas retornam resultado confirmado e não afetam outra marca.
## 16. Fora do escopo atual
Reformular permissões ou schema.
## 17. Arquivos pertencentes ao módulo
`app/(admin)/admin/**`, `app/api/marcas/route.ts`.
## 18. Arquivos compartilhados consumidos
`components/brand-context.tsx`, `lib/server/authz.ts`.
## 19. Arquivos proibidos sem autorização
Migrations, contratos editoriais e módulos operacionais.

## 20. Navegação global do shell — 2026-07-23
ProductShell exibe a navegação operacional geral em todas as superfícies, inclusive Admin: Marca, Minerador, Arquiteto, Radar, Planejador, Redator e Publicações. As tabs administrativas permanecem exclusivamente no conteúdo de Admin.
Atalhos globais para uma marca usam a rota tenantizada canônica; sem marca selecionada, direcionam para `/selecionar-marca?destino=<modulo>`. Trocar a marca dentro de Admin permanece em `/admin` e atualiza somente os atalhos.

## 21. Entrada, ativação e acesso temporário de Agencies — 2026-08-13

O Admin distingue dois caminhos canônicos de entrada:

- `PUBLIC_FREE_TRIAL`: solicitação pública aprovada, seguida de autenticação,
  onboarding e criação transacional da Agency, owner, membership e
  `agency_access_period`;
- `ADMIN_TRUSTED_INVITE`: convite administrativo com Agency proposta,
  responsável, destinatário e validade de acesso definidos pelo Admin, seguido
  de autenticação, confirmação explícita e a mesma criação transacional.

Em `PUBLIC_FREE_TRIAL`, `plan_code = FREE` é provenance e a duração de 30
dias começa na ativação. Em `ADMIN_TRUSTED_INVITE`, a data final do acesso é a
`access_expires_at` definida pelo Admin. Em ambos os caminhos,
`agency_invitations.expires_at` é validade técnica do link e não substitui
`agency_access_periods`.

`agency_access_periods` é a fonte canônica do direito operacional da Agency.
`agencies.status` não prova sozinho acesso operacional. O histórico Admin
separa solicitação pública aprovada, ativação aceita e convite administrativo
conforme `source` e estado reais.

No convite administrativo, `proposed_agency_name` continua obrigatório como
proposta inicial. O convidado pode corrigi-lo antes da criação da Agency; a
RPC transacional canônica persiste o nome final no convite e em `agencies.name`.
Essa confirmação não é uma escrita independente no cliente.
