# Estado atual — Marca

## Estado operacional de marcas — registrado em janela anterior

Adalba e Lindisse permanecem documentadas como marcas isoladas, com owners distintos; Lindisse inicia vazia, os dados da Adalba são preservados, a troca de marca funciona e a navegação/Extensão acompanham `brandRef`. O registro é uma evidência operacional datada e não substitui smoke test autenticado ou validação remota nesta passada.

## Formação compartilhada — 2026-07-21

O Site/Sitemap agora preserva evidência de campos convergentes (`sourceFields`) e coerência de slug nas candidatas. A evidência segue para o Minerador sem promover KGR; a formação de artigo continua no Arquiteto. Testes locais cobrem candidata não-KGR e importação como `bruto`; confirmação autenticada real continua pendente.

- **Última auditoria:** 2026-07-20, código, documentação canônica e checkout local.
- **Funcionando:** seleção, leitura e atualização legada de marca; criação de convite com validação server-side; contrato e domínio de BrandDNA; painel estruturado com draft por marca. **Verificado no código.**
- **BrandDNA:** rota `/api/marca/brand-dna` implementada para listar versões, salvar sucessora imutável como `draft` e registrar aprovação humana separada. **Verificado por TypeScript e testes de domínio; persistência de ambiente ainda não validada.**
- **Persistência remota:** a rota usa `editorial_artifact_versions`/`editorial_version_status_events` previstos na migration 0002; a migration não foi aplicada nem executada nesta tarefa.
- **Fallback local:** `selected_brand_id` e draft de BrandDNA em `localStorage`, isolados por marca. O fallback é recuperação e não é fonte única de verdade.
- **Materiais, Skills e prompts:** contratos/estado local no pipeline; persistência própria e aprovação remota ainda não implementadas.
- **Equipe/permissões:** contratos, convites e autorização server-side existem; membership, edição granular de permissões, aceite e revogação ainda não estão expostos por API exclusiva de Marca.
- **Simulado:** nenhuma simulação nova foi adicionada.
- **Bloqueado:** validação manual/browser, confirmação do banco e aplicação de migration não realizadas.
- **Regressões/bugs:** nenhum confirmado no escopo Marca; o checkout já possuía alterações não consolidadas de outros módulos e foi preservado.
- **Arquivos centrais:** `components/brand-context.tsx`, `components/marca/marca-page-entry.tsx`, `components/marca/brand-dna-panel.tsx`, `lib/marca/domain.ts`, `app/api/marca/brand-dna/route.ts`.
- **Testes:** `tests/marcas-access.test.mjs`, `tests/marca-domain.test.mts`; `tsc --noEmit` passou.
- **Última validação manual:** ainda não verificada.
- **Diferença spec/implementação:** BrandDNA agora tem jornada de draft/aprovação implementada, mas depende da migration 0002 para persistência remota; materiais, Skills, prompts e gestão completa de equipe continuam parciais.
- **Limitação conhecida:** aprovação e supersessão de versões usam eventos append-only em duas escritas; a atomicidade transacional ainda precisa de RPC/migration validada.
### Atualização de continuidade — 2026-07-21

- **Implementado:** contratos Zod e reconciliação para sitemaps, execuções, catálogo, verificações, candidatos, lotes e eventos em `lib/marca/site-contracts.ts` e `lib/marca/site-reconciliation.ts`.
- **Implementado:** APIs server-side de teste, sincronização, verificação de página, consulta de listas do Minerador e importação seletiva em `app/api/marca/site/**`.
- **Implementado:** proteção de host, resolução DNS, redirects autorizados, timeout, limite de bytes e Content-Type em `lib/marca/site-fetch.ts` e `lib/marca/site-security.ts`.
- **Implementado:** fallback local identificado por marca em IndexedDB com fallback localStorage, sem limpeza e sem sobrescrever estado inválido durante a leitura.
- **Implementado:** prévia explícita de keywords e registro local de conteúdo legado; nenhum DNA, plano, documento ou estado publicado é fabricado.
- **Preparado, não aplicado:** `supabase/migrations/0004_brand_site_catalog.sql`, com entidades e RLS futuras. Nenhuma escrita remota ou chamada externa foi executada pelo agente.
- **Validação automatizada:** `node --test tests/marca-site.test.mts` passou 7/7; `npx tsc --noEmit`, lint direcionado, `git diff --check` e `npm run build` passaram.
- **Limitação:** não houve validação manual autenticada no navegador nem confirmação de persistência Supabase; domínios alternativos ainda não são cadastráveis nesta etapa.

## Site e Sitemap

### Navegação tenantizada — 2026-07-23

- O seletor do shell e o cartão de Admin entram na marca pela URL canônica baseada em marcas.id.
- A troca preserva somente módulo autorizado e parâmetros globais de interface; IDs de entidades não passam entre marcas.
- A sidebar concentra Conta, Admin global e saída. O reset editorial fica no cabeçalho do Arquiteto, fora da navegação geral.
- Validação remota de permissões por marca e teste manual autenticado permanecem pendentes.

### Integração aditiva com o Minerador — 2026-07-21

- Candidatas carregam situação técnica da URL, situação de publicação observada, relação keyword↔URL e situação arquitetural, sem inferir publicação ou arquitetura.
- A confirmação de relação é explícita no painel; `confirmed_primary` registra ator/data localmente, mas não altera Arquiteto nem cria publicação.
- A importação atualiza evidência de keywords existentes sem substituir semântica, métricas, intenção, DNA ou status editorial do Minerador.
- A validação local passou 14/14 testes focados. Migration `0004`, Supabase remoto, RLS e browser autenticado continuam não verificados.

### Fechamento da fila de keywords — 2026-07-21

- A contagem de candidatas agora é operacional: a tela oferece detalhe por conteúdo, fila global, filtros, seleção, ignorar, prévia real e confirmação.
- A prévia consulta o Minerador sem escrita; o lote local é marcado como `preview` antes da confirmação e só recebe `imported`, `partial` ou `failed` após a resposta do provider real.
- Keywords novas entram na lista existente como `bruto`, sem volume, KGR ou intenção inventados. Existentes não são sobrescritas e recebem o ID visualizado quando retornado.
- Candidatas antigas com confiança numérica continuam legíveis; novas extrações filtram palavras isoladas e sugerem papel sem confirmar decisão editorial.
- A validação automatizada desta correção passou 9/9 testes focados, TypeScript e lint direcionado; build e validação manual autenticada ainda são etapas separadas.

- **Implementado em 2026-07-21:** a aba `/{brandRef}/?secao=site` concentra a edicao do endereco principal e preserva `marcas.site_url` pelo PUT legado.
- **Validacao:** testes de URL, autorizacao de `/api/marcas`, regressao editorial, TypeScript e lint direcionado passaram. Nenhuma chamada externa, migration ou escrita remota foi executada pelo agente.
- **Limitacao:** multiplos sitemaps, verificacao HTTP, catalogo de URLs, health checks e importacao seletiva ainda nao possuem contrato ou persistencia nesta etapa.


### Correção funcional Site e Sitemap — 2026-07-21

- A navegação da aba dedicada permanece em `/{brandRef}/?secao=site`; o painel de revisão usa `painel=importacao` ou `painel=catalogo`, sem voltar para Visão geral após refresh ou ações locais.
- O reset do workspace foi corrigido: o carregamento agora depende da marca, não da alteração de `siteUrl`. Salvar a URL não limpa catálogo, filtros, seleções, prévias ou lotes.
- A aba dedicada ganhou dono de scroll vertical em seu conteúdo, mantendo o shell e o cabeçalho; tabelas continuam com rolagem horizontal própria.
- Preparar importação abre uma revisão visível no topo, começa com zero keywords e zero conteúdos autorizados e informa as contagens disponíveis. Keywords e conteúdos usam seleções independentes.
- O registro de conteúdo legado exige revisão e confirmação separadas e não cria keyword, DNA ou documento editorial.
- Validação automatizada desta correção: testes focados de navegação/revisão, TypeScript e lint direcionado. Validação autenticada no navegador, persistência remota e resposta real do Minerador continuam pendentes.
### Site e Sitemap — importação real no Minerador — 2026-07-21

- Auditoria autenticada confirmou que a tela do Minerador e a importação usam a mesma fonte remota: `listas_kgr`/`keywords_kgr`; o IndexedDB/localStorage guarda somente catálogo, candidatas e lotes locais da Marca.
- A prévia foi reproduzida com `brandId`, lista real e duas candidatas, sem escrita remota. A confirmação real permanece pendente por política operacional.
- Implementado `importSiteKeywordsToMinerador`: valida destino, normaliza, deduplica, preserva existentes, insere somente novas com `status: bruto`, registra `site_sitemap` e retorna ID real por item.
- A UI não marca sucesso quando `persisted` não é confirmado, preserva seleção em falha, reseta lista ao trocar marca, mostra erro explícito e usa os três modos `Conteúdos`, `Keywords` e `Importação e lotes` em largura integral.
- Sugestão de keyword principal agora exige convergência determinística de slug/H1/título; continua sem confirmação automática.
- Validação: testes focados do Site/Minerador, TypeScript e verificação browser com fixture passaram; confirmação manual `enviar → abrir lista real → recarregar → reenviar` ainda depende de autorização para escrita remota.
### Payload Site/Sitemap consumido pelo Minerador - 2026-07-22

- A confirmacao do lote continua explicita e o destino continua sendo uma lista existente validada para a marca.
- O payload aditivo agora pode registrar no `site_origin` a associacao do destino (`siloId`/`siloName`) e o instante de consolidacao, junto com URL resolvida, canonical e publicacao observadas.
- Nenhuma entidade nova, migration, publicacao automatica ou alteracao no Arquiteto foi executada; validacao remota e browser autenticado continuam pendentes.

### Harmonizacao visual do modulo Marca - 2026-07-27

- **Verificado no codigo:** as superficies ativas de Visao geral, Site e Sitemap, BrandDNA, Materiais, Skills e prompts, Equipe/convites e Configuracoes foram revisadas sem alterar handlers, contratos, tenantizacao, autenticacao ou persistencia.
- O shell reutiliza `ModuleHeader`, as abas internas permanecem tenantizadas e a aba Site/Sitemap conserva seu scroll vertical proprio, rolagem horizontal de tabelas e estado de painel na URL.
- A hierarquia agora diferencia cabecalho de modulo, titulo da secao, metricas, formularios, tabelas, estados vazios e mensagens de operacao. Textos essenciais usam no minimo 14px, controles possuem foco visivel e mensagens operacionais usam `aria-live`/`role=status` quando aplicavel.
- Foram removidos backgrounds/cores crus e tipografia excessivamente compacta do escopo Marca. Nenhum token global ou componente compartilhado foi alterado; os componentes compartilhados existentes foram apenas reutilizados.
- Especialistas nao aparecem como tela ativa independente no inventario atual; o papel continua disponivel no fluxo de convites. Materiais e Skills/prompts permanecem colecoes locais, sem nova persistencia.
- **Confirmado por teste:** suíte focada Marca/Auth/tenant passou 35/35; TypeScript, ESLint focalizado e `git diff --check` passaram. Build e validacao manual autenticada permanecem separados.
- **Ainda nao verificado:** comportamento visual em navegador autenticado, resolucoes 1440/1024/768/360, dark mode, teclado/foco/hover, troca real entre Adalba e Lindisse e ausencia de erros no console.
- Nenhuma operacao remota, SQL, migration, escrita Supabase, commit, push ou deploy foi executada.

### Correcao da direcao visual da Marca apos reprovacao manual - 2026-07-27

- **Relatado e confirmado na revisao visual:** a rodada anterior ficou generica, com roxo decorativo, abas em capsulas, bordas e superficies repetidas, BrandDNA dentro de moldura extensa e o campo de posicionamento com aparencia de editor tecnico.
- A Marca agora usa composicao dark neutra: grafite, cinza, texto off-white, divisores discretos, verde somente para aprovacao, amarelo somente para atencao e acao principal neutra solida.
- As abas da Marca e os modos do Site/Sitemap usam navegacao horizontal simples, fundo transparente, sem borda individual de botao e com indicador inferior discreto na aba ativa. Rotas, `brandRef`, `secao`, `painel` e teclado foram preservados.
- BrandDNA deixou de ser um card externo; o cabecalho concentra titulo, descricao, estado discreto e acoes. Os campos usam tipografia de texto normal, fundo neutro, line-height confortavel e scroll integrado.
- O `ModuleHeader` recebeu apenas a variante aditiva `tone="neutral"`; consumidores que nao a informam mantem o comportamento anterior. Nenhum token global foi alterado.
- **Confirmado por teste:** testes focados Marca/Auth/tenant 35/35, TypeScript, ESLint focalizado, build e `git diff --check` passaram. O scan local nao encontrou roxo/gradiente/cores cruas no escopo `modules/marca`.
- **Ainda nao validado manualmente:** navegador autenticado em Adalba/Lindisse, desktop/notebook/tablet/mobile, dark mode, contraste, hover, foco, rolagem do textarea, console e troca de marca real.

# Autorização herdada Agency → Brand - 2026-08-10

- **Implementado localmente:** `agency_brands(status = active)` passou a ser consumido como vínculo operacional herdado, sem criar `brand_memberships` artificiais e preservando `brandId = public.marcas.id`.
- **Implementado localmente:** restrições persistentes por Brand, Agency e capability, com status revogado e actor/timestamps de auditoria; a restrição bloqueia a capability sem remover o vínculo.
- **Verificado localmente:** Brand collaborator continua no caminho direto de `brand_memberships`; Agency owner/member usa o caminho Agency → Brand e só recebe capabilities autorizadas.
- **Pendente:** preflight e RLS remotos, aplicação da 0021, definição/validação manual de grants de membros e smoke autenticado. Nenhuma Brand legada foi reescrita.
# Roteamento tenant — 2026-07-23
# Consolidacao fisica dos modulos - 2026-07-23
- Implementacao proprietaria consolidada em modules/marca; wrappers canonicos permanecem finos.
- Suite focada desta rodada: 212/212; browser autenticado, persistencia remota e build continuam pendentes.

- Implementado localmente: wrappers canônicos `/{brandRef}/...`, contexto de tenant resolvido no servidor e seleção autenticada de marcas.
- Limite: `brandId` é o tenant canônico e `brandRef` é a referência pública; owner, membership, plano e estado ativo continuam sujeitos às evidências/documentos de autorização e às validações remotas pendentes.

### Conexão Google Ads da Marca — 2026-08-03

- **Verificado no código:** `Marca → Configurações` contém o painel operacional mínimo de conexão Google Ads. Ele reutiliza `GET` e `POST /api/minerador/marcas/[brandId]/google-ads/conexao`, sempre no `brandId` da marca ativa, sem integrar esses dados ao BrandDNA ou alterar a rota de métricas.
- A leitura inicial devolve somente dados sanitizados: IDs mascarados, presença de MCC, moeda, fuso horário, targeting e data de validação. A validação real da conta só é iniciada pelo botão explícito; credenciais OAuth e tokens não são enviados ao navegador.
- **Autorização verificada no código:** owner e qualquer colaborador com `minerador:manage` são aceitos pela rota. Sem essa permissão, o painel informa o bloqueio e não permite alteração.
- Conexão ativa exige confirmação explícita e novos IDs completos antes da revalidação/substituição; não existe edição silenciosa. A validação no navegador exige IDs de 10 dígitos sem hífens, MCC opcional e uma a dez localizações.
- **Ainda não verificado manualmente:** autenticação real de owner e colaborador, isolamento Adalba/Lindisse, validação com IDs reais, resposta de moeda/fuso e atualização de métricas no Minerador.
- Nenhuma operação Google Ads real, SQL, migration, alteração de credenciais, commit, push ou deploy foi executada pelo agente.
# Preparação canônica compartilhada — 2026-08-06

- **Preparado localmente:** resolvedor estrito de `brandRef = slug--brandId` e autorização editorial por `marcas.owner_user_id` ou membership UUID ativa.
- **Preservado:** rotas, `BrandProvider`, seleção local e consumidores atuais continuam no contrato híbrido até o corte aprovado.
- **Ainda não verificado:** owners/memberships remotos, `user_key`, policies, grants e dados necessários ao backfill.
## Fase 2A — entrada canônica da Marca — 2026-08-06

- **Verificado no código:** `/{brandRef}/` usa `slug--UUID` estrito, confirma o slug da marca buscada por ID e autoriza owner diretamente por `owner_user_id` ou colaborador por `member_user_id` ativo com `marca:view`.
- **Edição:** `PUT /api/marcas` aceita owner ou colaborador apenas com `marca:manage`; Administração global continua sendo a alternativa explícita para gestão global. Nenhuma decisão usa e-mail, `user_key`, `perfis.marca_id` ou seleção local.
- **Preservado:** Minerador, Arquiteto, Radar, Planejador, Redator e Publicações não foram migrados. Não houve alteração remota de dados, owners, memberships, RLS, providers ou Google Ads.
- **Pendente:** smoke owner/colaborador, slug divergente, marca inativa, reload, isolamento Adalba/Lindisse e responsividade/teclado no navegador autenticado.

## Google Ads Research Customer ID da Plataforma — 2026-08-15

- **Verificado no código e navegador:** a configuração ativa da Marca não exige nem exibe Customer ID Google Ads para Keyword Discovery/Metrics. A tela informa que a pesquisa usa a Connection global e o Research Customer ID da Plataforma.
- **Preservado:** o componente/rota de vínculo externo da Brand permanece no checkout para futuras operações de campanhas, anúncios, gastos, conversões e orçamento; não é usado pelo resolvedor de pesquisa.

## Consumo pela Minha Agência — 2026-08-10

- **Verificado no código:** a lista da Agency lê Brands por `agency_brands` ativo e `marcas`; a referência de entrada continua sendo `brandId`/`brandRef` canônico.
- **Verificado no código:** `Cadastrar Marca` cria a Brand com o owner canônico da Agency e o vínculo operacional, sem criar `brand_memberships` para membros da Agency.
- **Fora desta fase:** BrandDNA, colaboradores próprios, restrições por área/capability, activity, notificações e qualquer pipeline editorial automático.
- **Pendente:** validação manual autenticada e qualquer implementação futura da interface de restrições explícitas da Brand.

## Cadastro operacional e first-run — 2026-08-10

- **Formulário restaurado:** nome, website, nicho operacional e localização/área de atuação, todos já presentes nos contratos de dados consumidos por `public.marcas`.
- **Separação preservada:** BrandDNA, propósito, público-alvo, posicionamento, tom de voz, keywords, SERP e silos não são criados nem alterados pelo cadastro da Agency.
- **Home de Brand nova:** a rota `/{brandRef}` não depende de `pipeline.snapshot` para renderizar uma visão operacional. O BrandDNA é consultado somente para informar seu estado e o CTA encaminha à aba canônica `?secao=dna`.
- **Listagem:** a Agency mostra Marca, status traduzido, website, owner quando disponível e ação de entrada; não exibe texto bruto de `dna_diretrizes` como resumo.
- **Preservação:** Adalba, Lindisse e CareGlow não foram apagadas, recriadas ou alteradas por operação remota.
