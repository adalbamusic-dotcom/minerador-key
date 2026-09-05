# Estado atual — Marca

## Fundação remota fechada e convergência local — Skills — 2026-08-28

- **Primeira BrandSkill real persistida:** Care Glow / `brand_voice` / v1 /
  `draft`, arquivo `CareGlow_SKILL.md`. **Validado manualmente pelo usuário**
  na aba Skills, com `write → readback → success`.
- **Fundação remota:** `REMOTE_FOUNDATION = READY`; migration já aplicada;
  `artifact_type = brand_skill`; verificador pós-migration aprovado. Nenhuma
  migration nova, escrita estrutural ou segunda Skill remota nesta convergência.
- **Contrato local canônico único:** `SkillDefinition.expectedSections` com
  `key`, `label`, `description`, `importance` (`recommended` |
  `optional`) e `aliases`. As formas `requiredSections` e
  `recommendedSections + optionalSections` não existem mais no checkout.
- **Validação canônica:** `VALID` / `VALID_WITH_NOTICES` / `INVALID`.
  Somente `INVALID` bloqueia, e apenas por falha técnica real. Diagnóstico de
  seção usa somente `matched` / `alias_matched` / `not_found`.
- **Limite de tamanho:** vive só em `definition.maxFileSizeBytes`. A constante
  global `MARKDOWN_MAX_BYTES`, que ficara órfã duplicando o contrato, foi
  removida nesta convergência.
- **Hash único:** `markdownContentHash` no domínio. Rota, painel e editor não
  recalculam hash. **Confirmado por teste.**
- **Repository e rota alinhados:** `lib/server/brand-skills.ts` valida cada
  linha com `BrandSkillSchema` e recusa payload divergente
  (`stored_skill_contract_invalid`); sucesso só é retornado após readback
  (`readback_missing` caso contrário). `app/api/marca/skills/route.ts` usa
  `BrandSkillActionRequestSchema` e não redefine payload.
- **Identidade:** `brandId + definitionKey`. Renomear "Care Glow" para
  "Voz editorial Care Glow" não altera `brand_voice`, hash nem consumidores.
  **Confirmado por teste.**
- **Brand Context Pack:** convergido. O rascunho atual da Care Glow **não** é
  oferecido a Planejador nem Redator; só versão ativa aparece, sempre com
  `applied: false`. **Confirmado por teste.**
- **Lifecycle preservado:** a Skill real permanece `Rascunho v1`. Nada foi
  enviado para aprovação nem ativado nesta tarefa.
- **Planejador legado:** `toLegacyBrandSkill` mantido como adaptador de
  consumidor; não é fonte do contrato.
- **Concorrência:** nenhuma edição externa detectada durante esta tarefa
  (comparação de hashes dos arquivos de Skills antes e depois).
- **Testes:** `marca-brand-skills` 18/18, `-workspace` 4/4, `-ui` 4/4,
  `-convergence` 13/13. Erros de TypeScript em Brand Skills: **0**. `eslint`
  limpo em `lib/marca`, `modules/marca`, repository e rota. Permanecem 5
  erros de TypeScript realmente externos (dna-panels, minerador,
  `tests/agency-adalba-platform-internal`).
- **Pendente:** `F5_VALIDATION`, `APPROVAL_VALIDATION`,
  `ACTIVATION_VALIDATION` e `CONSUMER_VALIDATION`.


## Correção — validação de Markdown de BrandSkill — 2026-08-28

> **Superada em 2026-08-28** pela convergência acima: `recommendedSections`,
> `found` / `equivalent` / `missing` e a taxonomia em minúsculas descritos
> aqui foram substituídos por `expectedSections`,
> `matched` / `alias_matched` / `not_found` e
> `VALID` / `VALID_WITH_NOTICES` / `INVALID`. Fica como histórico.


- **Falso negativo corrigido:** `CareGlow_SKILL.md` era Markdown válido e rico,
  mas o validador exigia os headings literais `## Tom`, `## Vocabulário
  preferido` e `## Evitar` e mantinha o botão desabilitado. A estrutura do
  gabarito passou de exigência para **recomendação com diagnóstico**.
- **Bloqueia apenas erro técnico:** extensão diferente de `.md`, MIME não
  aceito, arquivo vazio, acima de 512 KB, texto não UTF-8 ou leitura impossível.
  Ausência de heading recomendado **não bloqueia**. **Confirmado por teste.**
- **Três estados:** `invalid` (bloqueia), `valid_with_notices` (aceito com
  divergências) e `valid`. A interface mostra "Estrutura recomendada
  parcialmente reconhecida" e a contagem de estruturas reconhecidas versus não
  identificadas, em vez de "Markdown inválido".
- **Aliases determinísticos:** `SkillDefinition.recommendedSections` ganhou
  `aliases` e o reconhecimento passou a casar por título exato, alias ou
  contenção por sequência de tokens — sem IA e sem correção automática. Para
  `brand_voice`: Tom reconhece "Perfil de Voz aprovado" e "Ajuste de tom";
  Vocabulário preferido reconhece "Vocabulário e terminologia"; Evitar
  reconhece "Atalhos e claims proibidos", entre outros.
- **Leitura de estrutura mais tolerante:** o documento é dividido no nível de
  título mais raso disponível, títulos numerados são normalizados e subtítulos
  permanecem dentro do corpo da seção. Nada é reescrito.
- **Diagnóstico canônico:** `normalizedContent.sectionDiagnostics` registra
  `found` / `equivalent` / `missing` com o título realmente usado pela Marca.
  Os campos antigos continuam presentes com valor padrão para ler normalizações
  gravadas antes desta correção.
- **Original preservado:** `originalMarkdown` continua íntegro, com seções
  próprias e subtítulos. **Confirmado por teste** com a fixture
  `tests/care-glow-skill.fixture.ts`, representativa do arquivo observado.
- **Identidade inalterada:** resolução por `brandId + definitionKey`;
  consumidores continuam vindo do gabarito; a Marca não os escolhe.
- **Servidor:** a rota `/api/marca/skills` usa o mesmo validador pelo domínio
  compartilhado, então a correção vale para cliente e servidor. Nenhuma
  migration, tabela, RLS ou escrita remota nesta correção.
- **Limitação conhecida:** versões já persistidas antes desta correção têm
  `sectionDiagnostics` vazio e exibem o relatório de estrutura em branco no modo
  de leitura. Reprocessá-las exigiria escrita remota e não foi feito.
- **Testes:** `tests/marca-brand-skills.test.mts` 18/18,
  `tests/marca-brand-skills-workspace.test.mts` 11/11,
  `tests/marca-brand-skills-ui.test.mts` 19/19. `tsc --noEmit` e `eslint` sem
  erro. As asserções de UI foram sincronizadas com o painel reescrito pela
  entrega de persistência.
- **Ainda não verificado:** reteste manual autenticado com `CareGlow_SKILL.md`.

## Correção de contrato — Skills dirigidas por gabarito — 2026-08-28

- **Correção:** a entrega anterior tratava BrandSkill como construtor livre.
  O modelo correto é dirigido por gabarito: a área consumidora define a
  `SkillDefinition`; a Marca escolhe o gabarito, informa um nome humano e envia
  um arquivo `.md` com o próprio conhecimento.
- **Removido do front:** categoria livre, objetivo, instruções, exemplos,
  evitar, áreas aplicáveis e uso recomendado como campos de construção.
- **Implementado:** `lib/marca/skill-definitions.ts` com o gabarito local
  `brand_voice` (Voz da Marca, consumido por Planejador e Redator, seções
  obrigatórias Tom / Vocabulário preferido / Evitar e opcionais Forma de tratar
  o leitor / Exemplos).
- **Implementado:** `lib/marca/brand-skill-markdown.ts` com validação de
  extensão, MIME, arquivo vazio, limite de 512 KB, UTF-8 e seções obrigatórias,
  além de normalização pelo gabarito e blocos de prévia. A prévia é renderizada
  como texto em elementos React; nenhum HTML do arquivo é executado.
- **Identidade técnica:** `brandId + definitionKey`. O nome é rótulo humano e
  editável; renomear não altera identidade, hash nem consumidores.
  **Confirmado por teste.**
- **Original preservado:** `originalMarkdown` nunca é descartado;
  `normalizedContent` é leitura estruturada ao lado dele.
- **Versionamento local por hash:** substituir por conteúdo idêntico não cria
  versão; conteúdo diferente cria a sucessora e preserva a anterior.
- **Consumidores:** vêm sempre do gabarito. A Marca não os escolhe em nenhum
  ponto da interface. **Confirmado por teste.**
- **Não persistente:** aviso permanente de cópia de trabalho local no painel e
  em cada diálogo. O front não faz `fetch`, não chama `/api/**`, não cria
  cliente Supabase e não envia arquivo ao servidor.
- **Banco:** nenhuma migration, tabela, RLS ou rota criada. A SDD
  `propostas/skills-da-marca-persistencia-e-contexto-compartilhado.md` foi
  revisada (revisão 2) para o payload definitivo: `definitionKey`, `name`,
  `originalMarkdown`, `normalizedContent`, `sourceFilename`, `contentHash`,
  `version`, `status`, `provenance`.
- **Testes:** `tests/marca-brand-skills.test.mts` 15/15,
  `tests/marca-brand-skills-workspace.test.mts` 11/11,
  `tests/marca-brand-skills-ui.test.mts` 19/19. `tsc --noEmit` e `eslint` sem
  erro novo. `tests/marca-visual.test.mts` mantém a falha pré-existente da rota
  Google Ads, fora deste escopo.
- **Ainda não verificado:** validação manual autenticada da entrada `.md` com a
  Care Glow. O smoke autenticado é executado pelo usuário.

## Experiência frontend de Skills — 2026-08-28

- **Implementado:** aba `Skills e prompts` com cabeçalho canônico, `+ Nova Skill`,
  busca, filtros de categoria, estado e área aplicável, lista densa com nome,
  categoria, objetivo, estado, versão local, áreas e contagem de fontes,
  empty state próprio (`Nenhuma Skill criada` + `Criar primeira Skill`),
  modo de leitura e editor em diálogo.
- **Editor:** nome, categoria (as nove categorias do contrato), objetivo,
  instruções, exemplos, evitar — cada um com a pergunta orientadora —,
  estrutura guiada opcional de voz (só em `Voz e estilo`), áreas aplicáveis,
  uso recomendado, fontes e tags de propósito.
- **Aditivo nos contratos da Marca:** `BrandSkillCategorySchema` passou às
  categorias do produto; `recommendedAreas` e `voiceTemplate` (opcional)
  entraram em `BrandSkillDraftSchema`. Sem consumidor externo afetado — a
  conversão legada `toLegacyBrandSkill` segue intacta.
- **Lógica pura:** `lib/marca/brand-skill-workspace.ts` concentra criar,
  editar, duplicar, enviar para aprovação, ativar, arquivar, excluir da cópia
  local, buscar e filtrar. **Confirmado por teste.**
- **Não persistente, declarado na tela:** aviso permanente
  "Modo de protótipo — cópia de trabalho local. Rascunho local: ainda não salvo
  no servidor" no painel e em cada diálogo; estados rotulados como
  `Rascunho local`, `Aguardando aprovação (local)`, `Ativa (local)`,
  `Arquivada (local)`. Nenhuma string afirma salvo, persistido ou sincronizado.
- **Sem backend:** o front de Skills não faz `fetch`, não chama `/api/**` e não
  cria cliente Supabase. `useSupabaseSession` é usado apenas para identificar o
  ator local. Nenhuma migration, tabela, RLS ou rota foi criada.
- **Material:** `Criar a partir de Material · em breve` permanece desabilitado;
  não há upload nem simulação de envio. Fontes de fixture são rotuladas.
- **Prompts:** bloco preservado sem reconstrução funcional.
- **Testes:** `tests/marca-brand-skills-workspace.test.mts` 11/11,
  `tests/marca-brand-skills-ui.test.mts` 16/16,
  `tests/marca-brand-skills.test.mts` 9/9. `tsc --noEmit` e `eslint` sem erro
  novo. `tests/marca-visual.test.mts` segue com a falha pré-existente da rota
  Google Ads, fora deste escopo.
- **Ainda não verificado:** validação manual autenticada com a Care Glow
  (criação da Skill de voz, leitura, edição, busca, filtro, dark mode e reload).
  Smoke autenticado é executado pelo usuário.

## Fundação de Skills da Marca — 2026-08-28

- **Auditado no código:** não existe persistência remota de Skill. Nenhuma
  tabela, coluna ou policy com `skill` em `supabase/migrations/**`, e
  `editorial_artifact_versions.artifact_type` aceita apenas `article_dna`,
  `silo_dna`, `silo_page`, `content_plan` e `brand_dna`. O estado
  `pipeline.skills` existia vazio e sem mutadores.
- **Não executado:** diagnóstico read-only no Supabase remoto. O projeto em uso
  (`hjjlntdpdgvpnazdztqw`) não está disponível na conexão MCP desta sessão.
- **Implementado (contrato e domínio puro):** `lib/marca/brand-skill-contracts.ts`
  e `lib/marca/brand-skill-domain.ts` com estados `draft`/`pending_approval`/
  `active`/`archived`, versão por linhagem, hash material, `applicableAreas`,
  `purposeTags`, `sourceRefs` e aprovação humana com ator/data. Versão ativa é
  imutável; mudança material cria sucessora. **Confirmado por teste.**
- **Implementado (resolver compartilhado):** `lib/marca/brand-context-pack.ts`
  com `getBrandContextPack({ brandId, module, purpose })`. Filtra por
  `brandId`, mantém `voiceCanonicalSource = "brand_dna"`, devolve referências
  compactas com `applied: false` e registra proveniência e lacunas.
  **Confirmado por teste.**
- **Implementado (front):** `modules/marca/brand-skills-panel.tsx` com criação,
  busca, filtros de categoria e status, lista com nome, categoria, resumo,
  status, versão e áreas, editor completo e aprovação humana explícita.
- **Não persistente:** o painel usa cópia de trabalho local por
  `actorUserId + brandId`, rotulada na tela. Não é fonte de verdade e não
  alimenta módulos consumidores.
- **Preservado:** `BrandSkillSchema` legado e o consumidor
  `lib/planejador/strategic-context.ts` seguem intactos; a conversão explícita
  é `toLegacyBrandSkill`. Prompts mantêm separação visual e contrato atual.
- **Bloqueado:** persistência, API e ligação de consumidores dependem da SDD
  `propostas/skills-da-marca-persistencia-e-contexto-compartilhado.md`.
  Nenhuma migration foi criada ou aplicada; nenhuma escrita remota ocorreu.
- **Testes:** `tests/marca-brand-skills.test.mts` 9/9. `npx tsc --noEmit` e
  `eslint` dos arquivos tocados sem erro novo. `tests/marca-visual.test.mts`
  falha 1/5 em asserção sobre a rota Google Ads da Marca, falha pré-existente
  no checkout e fora do escopo desta tarefa.
- **Ainda não verificado:** validação manual autenticada da aba.

## Governança canônica de consumo — 2026-08-25

- **Regra vigente:** a Marca consome DataForSEO, DeepSeek, Google Cloud,
  YouTube e Telegram por infraestrutura compartilhada e disponibilidade da
  Agência; não possui provider, Connection, credential ou quota de módulo.
- **Isolamento:** todo consumo e contribuição continuam tenantizados por
  `brandId = public.marcas.id`; transferência de Agência não troca o tenant.
- **Especialistas:** `expertId` é identidade de domínio da Marca, não é
  automaticamente `auth.uid()`. O binding Telegram explícito é requisito para
  receber contribuição; não existe resolução por username, nome ou última
  pauta.

## Especialistas externos + Telegram — 2026-08-25

- **Preparado localmente:** a aba Equipe inclui o painel tenantizado de especialistas externos, sem transformar especialista em usuário, membership ou owner.
- **Verificado no código:** `brand_experts` possui `brand_id`, bindings Telegram revogáveis e tokens opacos de onboarding; link direto só é exibido quando o username do Bot foi confirmado pelo health check.
- **Persistência:** depende de `supabase/migrations/20260825150000_telegram_expert_contribution_platform_foundation.sql`, ainda não aplicada remotamente. O token bruto aparece apenas uma vez na resposta de criação para compartilhamento manual.
- **Ainda não verificado:** sessão autenticada, aplicação da migration, isolamento remoto e smoke real de onboarding/contribuição.

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

## Brand Skills — contrato local único consolidado — 2026-08-28

- **Remote BrandSkill foundation:** pronta e congelada; esta etapa não executou SQL, migration, leitura/escrita remota nem criou conteúdo de teste.
- **Implementado localmente:** `SkillDefinition` code-owned, payload `BrandSkill`, parser diagnóstico (sem headings bloqueantes), hash canônico, Route Handler com schema compartilhado, readback server-side e `BrandContextPack` com a versão corrente válida da própria Marca.
- **Validação local:** 25 testes direcionados passaram. O arquivo real representativo Care Glow é aceito como `VALID_WITH_NOTICES`, preservando Markdown e headings próprios.
- **Pendente de usuário:** smoke autenticado com conteúdo real, save → readback → reload, e confirmação visual da aba Skills. Nenhuma Skill real foi persistida nesta etapa.

## Brand Skills — primeiro consumidor Minerador — 2026-08-28

- A disponibilidade de BrandSkill passou a ser resolvida pela versão corrente, válida e não arquivada da própria Marca. `draft`, `pending_approval` e `active` entram no `BrandContextPack`; `archived`/`superseded` não entram.
- `consumerModules` permanece metadado de recomendação do gabarito; não bloqueia Minerador, Arquiteto, Radar, Planejador, Redator ou Publicações.
- O Minerador resolve a Skill por `brandId` e `definitionKey`, e só registra `appliedSkillRefs` quando a operação contextual a injeta no prompt. A proveniência inclui lifecycle, versão e hash.
- BrandDNA ausente vira lacuna declarada, mas não impede o uso de uma `brand_voice` válida. A fundação persistente, o Markdown original, o hash e a separação entre BrandDNA e Skill de voz permanecem preservados.
- Validação local passou sem provider call ou escrita remota; o smoke real e a confirmação manual do texto da Care Glow v1 em `draft` continuam pendentes.

## Site/Sitemap — fonte canônica ausente, SDD proposta — 2026-09-02

- **Achado estrutural:** a aba Site não possui persistência server-side do
  catálogo. `BrandSiteWorkspace` inteiro — sitemaps, syncRuns, catalog,
  verifications, candidates, importBatches, events — é gravado por
  `lib/marca/site-store.ts` em IndexedDB/localStorage, na chave
  `minerador-pro:site-workspace:{actorUserId}:{brandId}`, com `persistenceMode`
  forçado a `"local_fallback"`.
- **Rotas stateless:** `sitemap/test`, `sitemap/sync` e `page/verify` coletam e
  devolvem, sem gravar. `sitemap/sync` devolve inclusive `newCount: 0` fixo.
  A única rota da aba que persiste é `import/keywords`, que grava em
  `minerador_keywords` — e essa parte funciona.
- **Única fonte remota do site:** `marcas.site_url`.
- **`brand_site_*`:** zero referências em `lib/`, `app/`, `modules/`,
  `components/`. A migration 0004 permanece não aplicada e, além do cabeçalho,
  referencia `listas_kgr` (renomeada pela 0036) e usa RLS no padrão anterior a
  0027.
- **Segurança da coleta auditada e íntegra:** `fetchAuthorizedText` mantém
  bloqueio de host privado/reservado, verificação de todos os endereços do DNS,
  redirects manuais com revalidação de host, timeout, teto de bytes e
  Content-Type restrito. Nada foi flexibilizado.
- **Defeito registrado:** `normalizeSiteUrl` remove a barra final apenas na raiz,
  então `/a/` e `/a` produzem chaves distintas — duplicaria catálogo e erraria a
  reconciliação. A SDD propõe `canonicalSiteKey` como função nova e pura, sem
  alterar a atual.
- **Consequência para o Arquiteto:** a Fase 2 (Base Territorial read-only)
  permanece bloqueada; sem catálogo persistido, consumi-lo exigiria crawler
  próprio, o que é vetado.
- **Documento:** `propostas/2026-09-02-sdd-site-sitemap-persistencia-canonica.md`,
  `SDD_STATUS = PROPOSED_AWAITING_APPROVAL`. Nenhum código, migration, SQL,
  chamada externa ou escrita remota nesta rodada.

## Site/Sitemap canônico — Fase 1 (domínio) e Fase 2 (migration local) — 2026-09-02

```
FASE_1 = PASS   (domínio puro)
FASE_2 = MIGRATION LOCAL PRONTA — NÃO APLICADA
SQL_EXECUTED = 0 · DB_PUSH = 0 · MIGRATION_REPAIR = 0 · REMOTE_MUTATIONS = 0
SITEMAP_FETCHES = 0 · PAID_PROVIDER_CALLS = 0
```

- **`canonicalSiteKey`** (`lib/marca/site-canonical-url.ts`): regra única e
  determinística para catálogo, matching, reconciliação e UNIQUE. Corrige o
  defeito registrado — `/a` e `/a/` agora produzem a mesma chave, enquanto
  `normalizeSiteUrl` continua divergindo e segue responsável por apresentação e
  pelos guards de host. Remove fragmento, porta padrão e `www.`; ignora o
  protocolo; **preserva** a query com parâmetros ordenados; **preserva** caixa do
  path e percent-encoding. A equivalência `www`/apex não é heurística: está
  provada em `isAuthorizedSiteHost`, e há teste lendo o arquivo de segurança.
- **Contratos de persistência** (`lib/marca/site-persistence-contracts.ts`):
  configuração, execução append-only e catálogo, separados. `applyCatalogSync` é
  função pura e total: execução `failed` não toca o catálogo; URL ausente vira
  `missing` preservando `lastSeenAt`/`lastSeenRunId`; `firstSeen*` e decisão
  humana (`importStatus`, `ignoredAt`, `publicationRef`) nunca são
  sobrescritos; nenhuma linha é removida. `resolveLastKnownGoodRun` devolve a
  última execução válida mesmo com falha posterior.
- **Reconciliação** (`lib/marca/site-publication-reconciliation.ts`): ordem
  `declared_ref → canonical → published_url → site_url+slug → sem
  correspondência`, produzindo `matched | site_only | database_only |
  conflicting`. Nunca por substring — há teste com URL que contém a outra como
  prefixo e resulta em `site_only` + `database_only`. O módulo não importa
  contratos do Arquiteto: a fronteira de módulo é preservada.
- **Condição de parada do escopo verificada:** `relationConfirmedBy/At` **não** é
  fonte única — é produzida pelo Minerador (`lib/minerador/publication-link.ts`)
  e persiste em `minerador_keywords.analise_semantica.site_origin` via
  `site-minerador-import.ts`. Já a decisão "ignorar esta URL" seria perdida, por
  isso `import_status`/`ignored_at` foram para o catálogo remoto.
- **Migration local:**
  `supabase/migrations/20260902120000_brand_site_canonical_persistence.sql` —
  3 tabelas, 0 colunas novas em tabelas existentes, 0 artifact_type, 5 índices,
  RLS no padrão 0027 (`canonical_actor_can_access_brand`), grants com escrita só
  para `service_role`, gatilhos canônicos reaproveitados e rollback documentado.
  Guarda por estado real: recusa se `marcas` faltar, se alguma das três tabelas
  já existir ou se as funções canônicas não existirem.
- **`0004` permanece intocada** e não aplicada.
- **Validação:** `test:marca` 39/39 (17 novos). `test:arquiteto` 460/459 com a
  falha pré-existente do Minerador. TypeScript: 5 erros, os mesmos de antes.
  Lint dos três módulos novos: limpo. `git diff --check`: limpo.
- **Próximo passo é do usuário:** executar o SQL remotamente. Repository, escrita
  do sync, UI remota e `readBrandSiteSnapshot` continuam bloqueados até o
  readback confirmar schema, RLS e constraints.

## Site/Sitemap canônico — auditoria pré-execução: 3 defeitos corrigidos — 2026-09-02

A auditoria do arquivo real encontrou três defeitos na primeira versão da
migration. Todos corrigidos antes de qualquer entrega de SQL.

1. **`sync_run` append-only × `status: running` era contraditório.** O CHECK
   admitia `running`, mas o gatilho `pipeline_editorial_protect_append_only`
   recusava qualquer UPDATE — a transição terminal seria impossível, e
   `service_role` nem tinha UPDATE. Resolvido com modelo de escrita explícito: a
   linha nasce `running` **antes** da coleta, para que uma queda no meio deixe
   evidência em vez de silêncio, e recebe **uma** transição terminal. O guard
   `brand_site_sync_run_guard()` permite só `running → completed|partial|failed`,
   exige `completed_at`, congela identidade/tenant/sitemap/início/autor, recusa
   reescrita de terminal e recusa DELETE. CHECK
   `brand_site_sync_runs_completion_coherent` espelha a regra, e
   `SiteSyncRunRecordSchema` espelha o CHECK no domínio.
2. **A prova de identidade de URL estava errada.** `isAuthorizedSiteHost`
   estabelece equivalência de **autorização de coleta**, não identidade
   editorial — usá-la para justificar colapso global de `www.` era heurística.
   Agora há dois níveis: `canonicalSiteKey` conservadora (mantém protocolo e
   `www.`) e `brandCanonicalSiteKey(marcas.site_url, url)`, **ancorada na
   Brand**, que é a única que alimenta `normalized_url` e o UNIQUE. Host fora da
   origem declarada devolve `null` e não entra no catálogo. Sem `site_url`
   cadastrada não existe identidade — nada é inventado.
3. **Cross-brand era possível por FK simples.** Um UUID válido de outra Brand
   podia ser referenciado. Agora todas as cinco relações internas são FKs
   compostas contra `UNIQUE (id, marca_id)`: `parent_sitemap_id`, `sitemap_id`,
   `last_successful_run_id`, `source_sitemap_id`, `first_seen_run_id` e
   `last_seen_run_id`. Cross-brand passou a ser erro de banco, não de aplicação.

Também: índice `brand_site_sitemaps_brand_idx` **removido** por redundância com
`UNIQUE (marca_id, normalized_url)` num conjunto de poucas linhas por Brand; e
CHECK `brand_site_catalog_entries_ignored_coherent` acrescentado para que
`import_status = 'ignored'` e `ignored_at` andem juntos.

```
MIGRATION_FILE_SHA256 = 1051ddeebd8779ff5bc97742e8a4cb334f4630af605e7b39ad2f949e12845f54
TESTS = test:marca 47/47 · TYPESCRIPT = 5 pré-existentes, 0 novos
LINT = limpo · GIT_DIFF_CHECK = limpo
REMOTE_MUTATIONS = 0 · DB_PUSH = 0 · MIGRATION_REPAIR = 0
```

## Site/Sitemap — Fase 3 bloqueada por atomicidade; adendo A1 proposto — 2026-09-02

```
REMOTE_SCHEMA_MATERIALIZATION = PASS (homologado pelo Planner)
ATOMICITY_BLOCKER = YES
PHASE_3_IMPLEMENTED = NO — repositories e rota NÃO alterados
```

- **Auditoria do acesso ao banco:** o projeto não tem driver Postgres — só
  `@supabase/supabase-js` e `@supabase/ssr`, ou seja, PostgREST. Cada requisição
  é a própria transação e não existe API de `BEGIN`/`COMMIT`. Multi-write atômico
  no runtime é impossível pelo caminho atual.
- **Precedente encontrado:** `persist_silo_pair_atomic`
  (`20260826225154_silo_pair_atomicity.sql`) já resolve o mesmo problema com
  função plpgsql chamada por `.rpc()`, `SECURITY INVOKER`, `EXECUTE` só para
  `service_role` e checagens canônicas internas. O adendo A1 segue esse padrão.
- **Entregue:** adendo A1 na SDD, migration local
  `20260902130000_brand_site_sync_finalization_atomic.sql` (1 função, zero
  tabela/coluna/policy/índice/gatilho), contrato de domínio
  `lib/marca/site-sync-finalization.ts` e 13 testes.
- **Não entregue, por decisão:** sitemap/sync-run/catalog repositories e a
  persistência em `POST /api/marca/site/sitemap/sync`. Construí-los agora
  significaria escrever contra uma função que ainda não existe no remoto, sem
  poder provar o caminho `completed`.
- **Validação:** `test:marca` 69/69. TypeScript 5 erros pré-existentes, 0 novos.
  Lint limpo. `git diff --check` limpo. Zero rede, zero mutação remota.
- **Próximo passo é do usuário:** executar o SQL do adendo A1.

## Adendo A1 revisão 2 — retry idempotente e igualdade de conjunto — 2026-09-02

- **Defeito 1 corrigido:** `run` terminal deixou de ser exceção. Branch
  idempotente após os dois `FOR UPDATE`, com zero mutação e zero inferência de
  ausência; conflitos separados por código (`FINALIZATION_STATE_CONFLICT` para
  status divergente, `FINALIZATION_REPLAY_CONFLICT` para payload divergente).
- **Defeito 2 corrigido:** a validação passou de `INPUT ⊆ DB` para `INPUT = DB`,
  com três contagens (`v_input_count`, `v_db_observed_count`, `v_matched_count`)
  mais higiene de nulo/vazio/duplicata. `p_found_count` não participa da prova.
- **Guards da fundação** passaram a ser pré-condição explícita da migration.
- **Validação:** `test:marca` 74/74 (18 no arquivo do adendo). TypeScript 5
  pré-existentes, 0 novos. Lint limpo. `git diff --check` limpo.
- `MIGRATION_FILE_SHA256 = 2cc77031ed3020946a9692ec405bc27987d71c7708e6f520fe61d6c1e29b2f87`
- **Nada executado remotamente.**

## Adendo A1 revisão 3 — idempotência DURÁVEL — 2026-09-02

- **Defeito corrigido:** o branch de replay validava contra
  `catalog.last_seen_run_id = p_run_id`, que é estado TEMPORAL. Depois que uma
  execução posterior reobservasse as mesmas URLs, um retry legítimo do run
  anterior falharia com `OBSERVED_SET_MISMATCH`.
- **Solução:** `brand_site_sync_runs` ganha `observed_count` e
  `observed_set_hash` — fingerprint imutável gravado na própria transição
  terminal. O replay compara input contra o fingerprint do run, nunca contra o
  catálogo. A prova contra o catálogo permanece, mas só na PRIMEIRA finalização,
  enquanto o run está `running`.
- **Hash:** `sha256(bytea)`, função de núcleo do PostgreSQL desde a 11. Sem
  pgcrypto, sem `CREATE EXTENSION`. A dependência é **provada pela própria
  migration** (`to_regprocedure('pg_catalog.sha256(bytea)')`), não presumida —
  não consegui consultar o remoto daqui.
- **Representação canônica:** `count || '\n' || urls distintas ordenadas por
  COLLATE "C", uma por linha`. O prefixo de contagem elimina ambiguidade de
  concatenação. Conjunto vazio de um `failed` recebe o hash da representação
  canônica de zero elementos — **nunca NULL** — para que a comparação de replay
  seja sempre hash contra hash.
- **Guard atualizado sem perder proteção:** `observed_count` e
  `observed_set_hash` entram na allowlist e ganham exigência própria na
  transição; como o guard só admite UMA transição, ficam imutáveis depois.
  DELETE recusado, terminal imutável e identidade congelada continuam.
- **Resposta deixou de ser historicamente contraditória:**
  `lastKnownGoodPromoted` é EVENTO (`status = 'completed'`, verdadeiro também em
  replay) e `isCurrentLastKnownGood` é ESTADO
  (`sitemap.last_successful_run_id = run.id`).
- **Rollback não destrói histórico:** as tabelas já existem no remoto e não são
  derrubadas. O rollback remove as duas funções, o CHECK e as duas colunas, e
  **restaura o guard anterior** com a allowlist de nove campos.
- **Blocker registrado, não resolvido aqui:** não existe UNIQUE parcial
  impedindo duas execuções `running` no mesmo sitemap. Pertence ao gate do
  repository/start sync.
- **Validação:** `test:marca` 79/79 (23 no arquivo do adendo). TypeScript 5
  pré-existentes, 0 novos. Lint limpo. `git diff --check` limpo.
- `MIGRATION_FILE_SHA256 = 449610f1dd21a96de4d328049b4e7c091b5315ca92bd48aec3369319b2ce3f2d`
- **Nada executado remotamente.**

## Adendo A1 revisão 4 — fingerprint por bytes — 2026-09-02

- **Defeito corrigido:** a serialização `count + '\n' + join(urls, '\n')` era
  ambígua — `["a\nb","c"]` e `["a","b\nc"]` produziam o mesmo texto. O prefixo de
  contagem não resolve separador presente DENTRO do elemento.
- **Solução:** identidade por bytes. Cada URL vira `encode(convert_to(u,'UTF8'),
  'hex')`; `DISTINCT` e `ORDER BY` operam sobre o hex; o payload é
  `count || ':' || hex...`. Como hex só usa `[0-9a-f]`, nenhum elemento pode
  conter o separador — a ambiguidade deixa de existir. Também elimina dependência
  de collation: `count(DISTINCT u)` sobre texto poderia considerar iguais duas
  URLs com bytes diferentes numa collation não-determinística.
- **Uma definição só:** `brand_site_observed_set_fingerprint(text[])` devolve
  `RETURNS TABLE (observed_count, observed_set_hash)`. A guarda de duplicata e o
  fingerprint saem da MESMA chamada — não há como as duas regras divergirem.
  Substitui `brand_site_observed_set_hash`, que não chegou a ser executada.
- **Espelho em TypeScript:** `canonicalObservedSetPayload` em
  `lib/marca/site-sync-finalization.ts` reproduz a regra para provar as
  propriedades sem banco e permitir conferência do readback. O **Postgres é a
  autoridade**; o espelho está documentado como tal.
- **Rollback com redação corrigida:** "nenhum histórico PRÉ-EXISTENTE À A1 é
  destruído". Execuções finalizadas depois da A1 perdem, no rollback, os campos
  de fingerprint — e com eles o replay durável; as linhas seguem intactas.
- **Inalterado:** observed_count, observed_set_hash, fingerprint_coherent, replay
  durável, locking run → sitemap, ausência só em completed, semântica de
  partial/failed, LKG histórico × corrente, autorização, grants e assinatura da RPC.
- **Blocker mantido:** duas execuções `running` no mesmo sitemap continuam
  possíveis; pertence ao gate de `createRunningSyncRun`.
- **Validação:** `test:marca` 81/81 (25 no arquivo do adendo). TypeScript 5
  pré-existentes, 0 novos. Lint limpo. `git diff --check` limpo.
- `MIGRATION_FILE_SHA256 = cc7415b1b817cfecc4fde83f4853cac8cb6770d85ee2ebb83d41985fe3bfa528`
- **Nada executado remotamente.**

## Adendo A1 revisão 5 — identidade em bytea — 2026-09-02

- **Defeito corrigido:** `SELECT DISTINCT encode(...)` ainda fazia `DISTINCT`
  sobre `text`, então a identidade continuava sujeita à collation do banco.
- **Solução:** `DISTINCT convert_to(u,'UTF8')` e `ORDER BY url_bytes` operam
  sobre `bytea`. Igualdade e ordenação de `bytea` são byte a byte, sem collation
  nenhuma. O hex passou a existir só dentro do `string_agg`, para serializar.
  `COLLATE` desapareceu do arquivo — zero ocorrências.
- **Espelho em TS alinhado:** deduplicação por chave hex (bijetiva com os bytes)
  e ordenação por `Buffer.compare`, espelhando a ordenação de `bytea`.
- **Teste 6 acrescentado:** o SQL executável não pode conter `DISTINCT encode(`,
  `ORDER BY c.encoded_url`, `COLLATE "C"`, `count(DISTINCT u)` nem `DISTINCT t.u`.
- **Validação:** `test:marca` 81/81. TypeScript 5 pré-existentes, 0 novos.
  Lint limpo. `git diff --check` limpo.
- `MIGRATION_FILE_SHA256 = 113ad44523959d4e14daba7b3d48dc2ec84f1e194227fa11ac63a0924c907cf7`
- **Nada executado remotamente.**

## Adendo A1 — APPLIED / materialização remota PASS — 2026-09-02

- `MIGRATION_20260902130000 = APPLIED` (executada pelo USUÁRIO).
- `REMOTE_MATERIALIZATION = PASS`.
- Pendente nesta frente, em ordem: **A2 — exclusividade de execução `running`
  por Brand** (sem índice único parcial, duas execuções concorrentes no mesmo
  sitemap continuam possíveis) · repositories · runtime real do sync · UI e
  leitura remota · `readBrandSiteSnapshot` · smokes correspondentes.
