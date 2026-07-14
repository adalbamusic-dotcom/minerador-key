# Fluxo Editorial Operacional

## Estado inicial auditado

Auditoria iniciada em 11/07/2026, antes das alterações desta sprint.

O produto já possuía as rotas oficiais `Marca → Minerador → Arquiteto →
Radar → Planejador → Redator → Publicações`, o shell lateral, contratos
versionados e um provider local por marca. Minerador e Arquiteto eram as telas
mais maduras. Radar, Planejador, Redator, Publicações, Equipe e Admin ainda
eram demonstrações em cards, sem máquina de estados operacional entre etapas.

### Reuso confirmado

- autenticação NextAuth e autorização central em `lib/server/authz.ts`;
- marca ativa em `BrandProvider`;
- leitura autorizada de `marcas`, `listas_kgr`, `keywords_kgr` e
  `briefings_artigos` em `/api/inteligencia`;
- contratos imutáveis e versionados de KeywordDNA, ArticleDNA, SiloDNA,
  ContentPlan e ContentDocument;
- estado local por marca em `EditorialPipelineProvider`;
- planilhas existentes do Minerador e do Arquiteto;
- proteção de publicados da migration local `0001_protect_publicado.sql`.

### Problemas encontrados

- não existia grade operacional compartilhada;
- não existiam visualizações salvas por usuário, marca e módulo;
- aprovações, imports e vínculos entre etapas não tinham máquina de estados;
- Radar e Planejador mostravam principalmente exemplos simulados;
- Publicações tinha tabela mínima e registros demonstrativos;
- Equipe não possuía convites ou permissões granulares;
- não há tabelas locais documentadas para preferências, convites, workflow,
  planos, documentos e publicações;
- `supabase/baseline/` continua sem dump do schema atual, portanto nenhuma
  migration desta sprint será aplicada ou tratada como conferida contra o
  banco remoto;
- Tiptap não está instalado (`@tiptap/react` e `@tiptap/starter-kit` ausentes).

### Decisões da sprint

- não substituir as grades maduras do Minerador e do Arquiteto;
- criar `OperationalDataGrid` para Radar, Planejador e Publicações;
- manter o workflow real no estado local por marca, sem mocks para aprovações,
  imports, seleção ou criação de rascunhos;
- usar `localStorage` apenas para visualizações de grade, com chave formada por
  usuário, marca e módulo, deixando explícito que não é persistência no servidor;
- propostas de SERP, Amazon e similaridade externa permanecem mocks isolados e
  identificados;
- preparar migration local de persistência, sem aplicá-la;
- não criar editor rico falso: o Redator receberá o vínculo operacional,
  layout, metadados, Guardião e bloqueio explícito até a instalação manual do
  Tiptap.

## Arquitetura-alvo desta entrega

O fluxo local explícito será:

`ArticleDNA aprovado → item Radar → Radar aprovado → item Planejador →
ContentPlan aprovado → ContentDocument + rascunho em Publicações`

Cada transição valida marca, estado de origem e duplicidade. Nenhuma etapa puxa
conteúdo automaticamente: o usuário seleciona e confirma a ação.

## Estado final

### Padrão operacional das etapas

- Minerador, Arquiteto, Radar, Planejador, Redator e Publicações ocupam a altura
  útil da tela. Apenas a planilha ou o documento central rola.
- O topo permanece visível e reúne busca, filtros, ordenação, importação,
  exportação e processamento global da etapa.
- O rodapé permanece visível durante uma seleção e concentra mudança de status,
  aprovação, encaminhamento, exclusão permitida e demais ações em lote.
- Não existem versões nomeadas de visualização. Busca, filtros, ordenação,
  colunas e scroll da última configuração são restaurados silenciosamente por
  usuário, marca e módulo.
- O Arquiteto executa primeiro `Processar lógica (sem IA)`, usando o motor
  determinístico. A revisão por IA é uma ação posterior: ela aplica sua
  repartição somente no estado local e marca cada alteração na planilha como
  pendente de pente-fino. Os antigos `humanDecisionPoints` viram anotações e
  não bloqueiam a aplicação local.
- Aplicar uma sugestão de IA não equivale a aprovar o artigo. O status continua
  sob controle humano e somente `Aprovado` libera a importação na etapa
  seguinte. A mesma separação entre `IA aplicada` e `status aprovado` deve ser
  reutilizada nos demais módulos.
- Em publicados, a aplicação automática continua impedida de alterar keyword
  principal, slug, marca ou silo; qualquer recomendação desse tipo permanece
  apenas como anotação estratégica.
- ArticleDNA e SiloDNA gerados também entram diretamente como versões locais
  propostas e aparecem em seus resumos com confiança e pendências. Não existe
  um segundo popup de aceite: o pente-fino ocorre na grade e a passagem de
  etapa depende do status humano.
- O agrupamento lógico aplica o limite estrutural de 6 keywords no total por
  artigo. Ao atingir o limite, o excedente é repartido semanticamente em novos
  artigos de Suporte, priorizando o mesmo silo existente ou publicado. A
  revisão por IA também passa por essa trava e não pode voltar a concentrar as
  keywords em um único artigo.

### Unidade de trabalho e carga acumulada

A partir do Arquiteto a unidade de trabalho é o artigo. Agrupar keywords não
remove nem reescreve seus DNAs: o ArticleDNA guarda referências exatas para
cada KeywordDNA. O SiloDNA referencia os ArticleDNAs e as etapas seguintes
acrescentam novas cargas ao mesmo artigo por referências versionadas:

`KeywordDNAs → ArticleDNA → SiloDNA → SERP/evidências → ContentPlan → ContentDocument`

As planilhas de Arquiteto, Radar, Planejador e Publicações mostram a presença ou
quantidade dessas cargas. O conteúdo completo é hidratado somente quando
necessário; ele não é duplicado em cada etapa. Propostas aparecem como
`Aguardando aprovação`, aprovação é humana e somente itens aprovados ficam
disponíveis no popup de importação da etapa seguinte.

### Funcionalidades reais entregues

- `OperationalDataGrid` usado por Radar, Planejador e Publicações, com:
  numeração, seleção total/parcial, ações em lote, busca, filtros, ordenação,
  cabeçalho e colunas fixas, redimensionamento, visibilidade de colunas,
  expansão, paginação 25/50/100/200/Todos com limite seguro, exportação CSV,
  scroll preservado e ordem manual bloqueada durante ordenação automática;
- última configuração restaurada silenciosamente no navegador por usuário,
  marca e módulo, incluindo busca, filtros, ordenação, colunas, larguras,
  paginação e ordem manual;
- Minerador e Arquiteto restauram automaticamente a última busca e filtros por
  usuário, marca e módulo, sem versões nomeadas ou controles extras na barra;
- botão `Cadastrar nova marca` no Admin, reutilizando `/admin/marcas`;
- convite de colaborador validado no servidor quanto à sessão, marca, papel,
  módulos, ações e validade; o adaptador de desenvolvimento retorna convite
  pendente e declara que não houve envio nem persistência;
- contratos de permissão recusam convite expirado/revogado e acesso implícito a
  cobrança, CNPJ, proprietário, exclusão e cadastro estrutural;
- ArticleDNA só é elegível ao Radar com aprovação humana, exatamente uma
  principal, 2 a 6 keywords, silo, função, slug válido e nenhum bloqueio
  informado;
- Arquiteto envia seleções elegíveis e o Radar também possui seletor explícito;
- Radar importa sem duplicar, possui estados, revisão, aprovação, ações em lote,
  detalhe de ArticleDNA/SERP/originalidade e encaminhamento ao Planejador;
- Planejador importa apenas Radar aprovado, cria ContentPlan local referenciado,
  aguarda revisão humana, aprova e executa `Redigir artigo`;
- `Redigir artigo` é idempotente: localiza ou cria um ContentDocument e um único
  rascunho em Publicações, preservando artigo, plano, documento, marca e silo;
- Publicações é planilha operacional com Biblioteca, Fila, Publicados e
  Atualizações, filtros, ordenação, seleção, paginação e retorno ao documento;
- Redator possui folha editorial única, painéis recolhíveis de Fundamentos e
  Guardião, outline, metadados, proveniência compacta, contagem de palavras,
  fullscreen e navegação de alertas para a seção;
- `external_source` foi adicionado ao contrato de blocos e ao adaptador futuro
  de Tiptap;
- mocks continuam restritos e identificados para SERP/produtos/similaridade
  externa. Aprovação, seleção, importação e criação de rascunho não usam mock.

### Persistência proposta

Foi criada, mas não aplicada, a migration
`supabase/migrations/0002_operational_editorial_flow.sql`. Ela propõe:

- `editorial_saved_views`;
- `brand_invitations`;
- `brand_memberships`;
- `editorial_workflow_items`;
- `content_plan_versions`;
- `content_documents`;
- `publication_records`.

As tabelas propostas usam `marca_id`, referências de versão/hash, unicidade por
artigo e etapa, `lock_version` para concorrência otimista e RLS habilitado. A
migration não cria políticas permissivas. Antes de qualquer aplicação devem
ser definidos os repositories server-side e políticas finais coerentes com os
papéis reais.

O rollback destrutivo está separado em
`supabase/rollback/0002_operational_editorial_flow.rollback.sql` e só pode ser
considerado após exportação e confirmação manual dos dados.

### Arquivos criados nesta sprint

- `app/api/editorial/invitations/route.ts`;
- `components/editorial/compact-saved-views.tsx`;
- `components/editorial/operational-data-grid.tsx`;
- `lib/editorial/data-grid.ts`;
- `lib/editorial/operational-flow.ts`;
- `lib/server/operational-permissions.ts`;
- `supabase/migrations/0002_operational_editorial_flow.sql`;
- `supabase/rollback/0002_operational_editorial_flow.rollback.sql`;
- `tests/operational-flow.test.mts`;
- este documento.

### Arquivos alterados diretamente nesta sprint

- `app/(workspace)/arquiteto/page.tsx`;
- `app/(workspace)/minerador/page.tsx`;
- `app/(workspace)/redator/page.tsx`;
- `components/editorial-pipeline-context.tsx`;
- `components/product/operational-pages.tsx`;
- `lib/arquiteto/contracts.ts`;
- `lib/arquiteto/document.ts`;
- `package.json`.

Nenhum arquivo foi removido por esta sprint. Alterações e remoções de sprints
anteriores permanecem descritas em `docs/PRODUCT_SKELETON_REFACTOR.md`.

### Redator Tiptap

Os onze pacotes Tiptap foram instalados e o Redator operacional usa o editor
real. Extensões próprias representam CTA, link interno, fonte externa, produto,
comparação, briefing de imagem, comentários e identidade dos blocos sem perder
a proveniência compacta do `ContentDocument`.

### Limitações assumidas

- enquanto a migration proposta não for aplicada, workflow, convites,
  ContentPlans, documentos e rascunhos usam fallback local identificado;
- visualizações, posição do editor e recuperação de rascunho migram para o
  servidor quando as tabelas estiverem disponíveis;
- não há e-mail real nem aceite externo do convite; o convite persistido fica
  com entrega `not_sent`;
- o editor rico, autosave, comentários e versões estão implementados, mas a
  durabilidade remota depende da aplicação manual da migration;
- não há SERP, concorrentes, Amazon, antiplágio externo, fontes ou publicação
  real;
- o Admin mantém esqueleto para consumo, cobrança, alertas e falhas; apenas o
  acesso ao cadastro de marcas foi ligado nesta sprint;
- os dois arquivos monolíticos legados mantêm dívida de lint fora do código
  novo: dois erros `react-hooks/immutability` no Arquiteto e 12 avisos de itens
  não usados. O lint de todos os módulos novos e extraídos passa.

### Validações executadas

- `npm test`: 96 testes aprovados; suíte de banco real bloqueada por padrão;
- `npx tsc --noEmit --incremental false`: aprovado;
- ESLint dos módulos novos/extraídos: aprovado;
- build Next.js 16.2.9: aprovado;
- `git diff --check`: aprovado.

### Operações manuais restantes

1. gerar e revisar o dump schema-only atual antes de considerar a migration;
2. reconciliar manualmente e com segurança o histórico da `0001`, sem reaplicar
   seus triggers;
3. revisar a `0002`, políticas RLS, repositories e rollback; só então aplicar
   manualmente em ambiente controlado;
4. testar a migration em Supabase local/isolado e validar todas as políticas
   com perfis admin, responsável da marca e acesso delegado;
5. escolher e configurar um provedor de e-mail antes de enviar convites;
6. executar uma rodada manual de UX com dados reais autorizados nas rotas
   Radar → Planejador → Redator → Publicações.

### Próximo passo recomendado

Gerar o dump e validar/aplicar manualmente a persistência operacional em ambiente
controlado. Com a persistência ativa e o Redator já integrado ao
`ContentDocument`, o próximo incremento de produto deve ser a coleta inicial de
SERP com evidências rastreáveis e propostas de revisão humana.

## Histórico de segurança operacional

Minerador, Arquiteto, Radar, Planejador, Redator e Publicações usam o mesmo
padrão de segurança durante a sessão: **Desfazer**, **Refazer** e **Histórico**.
Antes de uma alteração estrutural, o módulo registra um snapshot nomeado. O
drawer do histórico permite inspecionar esses pontos e restaurar qualquer um;
antes da restauração, o sistema cria automaticamente o ponto “Antes da
restauração manual”, permitindo voltar à situação anterior.

O histórico é separado por marca e por módulo. Ele acompanha a navegação entre
as rotas na mesma sessão do navegador, tem limite de 30 pontos por módulo e é
descartado no reload completo. No Redator existem dois níveis complementares:
o histórico do Tiptap para digitação fina e o histórico operacional para
documento, status, importação e metadados.

Os nomes funcionais do esqueleto ficam fixados assim:

- Minerador: **Detectar viés · KeywordDNA**;
- Arquiteto: **Agrupar keywords em artigos (IA)**;
- Arquiteto: **Detectar viés · ArticleDNA (IA)**;
- Arquiteto: **Detectar viés · SiloDNA (IA)**.

### Limite de recuperação nesta fase

O histórico restaura o estado operacional da sessão e protege o trabalho ainda
local. Ele não desfaz uma escrita que um fluxo legado já tenha concluído no
Supabase. Em especial, uma exclusão física feita pelo Minerador não pode ser
ressuscitada com segurança apenas por um snapshot do navegador. A recuperação
durável dessas exclusões exige futuramente soft delete, log append-only e uma
ação server-side autorizada de restauração. Até isso existir, exclusões mantêm
confirmação reforçada, e artigos publicados continuam protegidos.

### Recuperação independente dos resultados de IA no Arquiteto

Para impedir perda de tokens após reload, o Arquiteto mantém três recuperações
separadas por marca no navegador:

- Revisão IA: repartição das keywords, grupos, ajustes e anotações;
- ArticleDNA: versões e eventos correspondentes;
- SiloDNA: versões e eventos correspondentes.

Uma recuperação inválida é removida isoladamente e não apaga as outras duas.
Ao concluir uma tarefa, a gravação é feita antes da notificação de sucesso; se o
navegador recusar a gravação, a interface mostra erro e orienta a não recarregar.
Esta durabilidade cobre reload no mesmo navegador. Persistência entre máquinas
continua dependendo da aplicação manual e posterior da estrutura operacional do
banco, que não foi executada nesta sprint.
