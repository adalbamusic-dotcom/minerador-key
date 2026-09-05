# Invariantes do produto

13. Site observa, Minerador qualifica, Arquiteto forma e Radar valida somente o ArticleDNA formado; KGR, volume, resultados e intenção não podem ser promovidos por inferência de URL ou slug.

1. DNAs permanecem rastreáveis por identidade, versão, hash e proveniência.
2. IA aplicada não significa aprovado.
3. Publicados mantêm slug, canonical, keyword principal, marca e URL estrutural protegidos.
4. Importação é seletiva, idempotente e limitada à marca correta.
5. Seleção não controla renderização.
6. Estado vazio não sobrescreve estado válido.
7. Toda keyword importada possui localização conhecida ou é bloqueada para reconciliação.
8. SiloDNA e SiloPage são entidades diferentes.
9. Versões consolidadas são imutáveis; uma alteração cria sucessora.
10. Operações estruturais exigem snapshot, rollback definido e regressão executada.
11. Sucesso só aparece após salvamento confirmado pelo meio de persistência aplicável.
12. Dados de marcas diferentes nunca se misturam.
13. Tenant de URL, body de API e cache local deve resolver para a mesma marca; divergência é recusada no servidor.
14. Preferência local de marca não concede acesso nem substitui contexto canônico de rota.
15. `brandId` é `public.marcas.id`; `brandRef` é somente referência pública, e owner, membro e ator são identidades distintas.
16. `keywords_kgr.brand_id` é obrigatório e `lista_id` é opcional; uma keyword sem lista permanece válida e vinculada à marca.
17. `keywords_kgr.lista_id → listas_kgr.id` usa `ON DELETE RESTRICT`; excluir uma lista nunca apaga keywords.
18. Histórico de undo/redo e operações recentes da interface é `SESSION_HISTORY`, local ou de sessão, e nunca substitui versionamento, auditoria, proveniência ou proteção contra exclusão.
19. `isPublished(subject)` é resolvido server-side por publicação formal ou linhagem canônica real; status visual, ArticleDNA, workflow, aprovação, handoff, DNA e métricas isolados não promovem publicação.
20. Entidade não publicada pode seguir para hard delete transacional após impacto, confirmação digitada pelo nome exato e readback; entidade publicada usa a mesma confirmação, tombstone recuperável por 24 horas, restore dentro da janela e purge server-side após o vencimento. História canônica append-only permanece preservada.
21. `InternalLinkGraph` é a fonte canônica das relações estruturais de links
    internos. Ele é tenantizado por `brandId`, versionado append-only e
    referencia versões de SiloDNA, SiloPage e ArticleDNA; React Flow, estado
    local e propostas de IA não substituem o grafo consolidado.
22. SiloDNA e SiloPage permanecem entidades, versionamentos e aprovações
    distintos. A consolidação pareada deve persistir os dois na mesma
    transação, sem apresentar o par como uma entidade única.

## Infraestrutura compartilhada e entradas externas — 2026-08-25

- A Plataforma/Admin governa providers, Connections, capabilities, grants,
  bindings, quotas e uso. A Agência recebe disponibilidade conforme plano,
  período e política; a Marca consome o que sua Agência disponibiliza. Os
  módulos são consumidores e não possuem provider, Connection, credential,
  grant, binding ou quota próprios.
- Google Ads é infraestrutura fixa da Plataforma, com configuração server-side
  e rotação do OAuth Refresh Token pelo Admin global. DataForSEO é a
  infraestrutura compartilhada de SERP/orgânico; DeepSeek é a IA canônica
  compartilhada. Nenhum desses recursos vira autorização por módulo.
- Google Cloud Speech-to-Text, Cloud Storage e YouTube Data API são operações
  compartilhadas. Speech produz transcrição, Storage distingue original de
  processamento temporário e YouTube fornece somente metadata; nenhum deles
  toma decisão editorial.
- Telegram usa um único Bot global da Plataforma, webhook único e routing por
  `TelegramExpertBinding(brandId, expertId, telegramUserId, telegramChatId)`.
  Sem binding e `briefId` explícitos, não existe contribuição editorial. Não
  há resolução de Marca por username, nome, telefone, e-mail ou última pauta.
- `telegram_inbound_updates` é um ledger global de pré-routing: não é entidade
  editorial tenantizada, não recebe `brand_id` artificial, não é acessível por
  `authenticated` e só promove contexto depois de binding, `brandId`,
  `expertId` e `briefId/articleDnaVersionId` explícitos.
- `service_role` pode acessar infraestrutura server-side, mas não ignora
  tenantização. Não existe segundo caminho de persistência que promova inbound
  para entidade editorial sem os guards canônicos de binding e contexto.
- Especialista é identidade de domínio da Marca e não é automaticamente um
  usuário Auth. `ExpertBrief` é uma pauta de um especialista para um artigo e
  versão específicos; múltiplas pautas permanecem independentes. Original,
  transcrição/extração e organização editorial são camadas distintas e
  rastreáveis.
- Vercel trata entrada, webhook, administração e estado; o Local Worker do
  Minerador Key trata processamento pesado, podendo retomar jobs quando voltar
  a estar online. O webhook não executa processamento pesado.
- O Radar investiga e organiza evidências do ArticleDNA recebido, usando a
  infraestrutura SERP compartilhada e preparando `RadarEvidencePackage` para
  o Planejador. Não forma ArticleDNA, troca principal, altera slug/canonical,
  modifica SiloDNA nem envia conteúdo diretamente ao Redator.

```text
PLATFORM_INTEGRATION_FOUNDATION = READY
READY_FOR_RADAR_DEVELOPMENT = YES
TELEGRAM_BOT_READY != TELEGRAM_WEBHOOK_READY
TELEGRAM_WEBHOOK = NOT_CONFIGURED
TELEGRAM_INBOUND_E2E = PENDING
```

Estas regras são canônicas. Uma exceção exige proposta SDD aprovada e atualização desta documentação quando permanente.
