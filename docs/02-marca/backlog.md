# Backlog — Marca

## Skills — fundação remota fechada e convergência local — 2026-08-28

- [x] Primeira BrandSkill real persistida e confirmada por readback
  (Care Glow / `brand_voice` / v1 / `draft`).
- [x] Convergir o checkout para um contrato único: `expectedSections`,
  `VALID` / `VALID_WITH_NOTICES` / `INVALID`,
  `matched` / `alias_matched` / `not_found`.
- [x] Remover a constante global `MARKDOWN_MAX_BYTES` que duplicava
  `definition.maxFileSizeBytes`.
- [x] Alinhar repository e rota ao `BrandSkillSchema`/`BrandSkillActionRequestSchema`.
- [x] Brand Context Pack resolve a versão corrente válida, incluindo rascunho, e mantém `available != applied`.
- [x] Zerar erros de TypeScript em Brand Skills.
- [ ] **Próximo gate:** F5 na Care Glow e confirmar que a Skill v1 é recuperada
  do servidor.
- [ ] Depois do F5: validar leitura pela IA antes e depois de transições de governança, sem tratar aprovação como gate de disponibilidade.


## Skills — validação de Markdown — 2026-08-28

- [x] Retirar o bloqueio por heading literal: estrutura do gabarito virou
  recomendação com diagnóstico.
- [x] Introduzir `invalid` / `valid_with_notices` / `valid`; só `invalid` impede
  o envio.
- [x] Adicionar aliases determinísticos e reconhecimento por contenção de
  tokens, sem IA.
- [x] Cobrir o arquivo real com `tests/care-glow-skill.fixture.ts`.
- [ ] **Próximo gate:** reteste manual com `CareGlow_SKILL.md` na Care Glow.
- [ ] Decidir se versões persistidas antes da correção devem ser
  renormalizadas — exige escrita remota e gate próprio.
- [ ] Ampliar os gabaritos além de `brand_voice` conforme as áreas
  consumidoras definirem novas capacidades.

## Skills da Marca — correção de contrato — 2026-08-28

- [x] Substituir o construtor livre pelo modelo dirigido por gabarito.
- [x] Criar `SkillDefinition` local com `brand_voice` e seções obrigatórias e
  opcionais distintas.
- [x] Entrada por arquivo `.md` com validação, prévia segura e relatório de
  estrutura encontrada versus esperada.
- [x] Identidade estável por `brandId + definitionKey`, com nome humano
  editável que não quebra consumidores.
- [x] Versionamento local por hash; substituir arquivo idêntico não cria versão.
- [x] Revisar a SDD para o payload definitivo antes de qualquer migration.
- [ ] **Próximo gate:** validar manualmente a entrada `.md` com a Care Glow.
- [ ] Depois da validação: escolher a opção de persistência, aprovar a SDD e só
  então migration, RLS, API e ligação dos consumidores.
- [ ] Decidir se `SkillDefinition` permanece em código ou vira registro global
  persistido — decisão separada, não bloqueia o BrandSkill.

## Skills da Marca — experiência frontend — 2026-08-28

- [x] Empty state, cabeçalho, busca e filtros de categoria, estado e área.
- [x] Criação, edição, modo de leitura, duplicação, arquivamento e exclusão da
  cópia local, com fluxo de estado e versionamento local simulados.
- [x] Template guiado de voz em `Voz e estilo`, sem substituir o BrandDNA.
- [x] Áreas aplicáveis e uso recomendado como conceitos distintos, com InfoHint.
- [x] Aviso permanente de cópia de trabalho local, sem mensagem de persistência.
- [ ] **Próximo gate:** validação humana da experiência com a Care Glow antes de
  qualquer decisão de persistência.
- [ ] Depois da validação: retomar a SDD de persistência e só então API, RLS e
  ligação dos consumidores.

## Skills da Marca — 2026-08-28

- [x] Auditar BrandSkill, BrandPrompt, BrandMaterial, consumidores e
  persistência; confirmar `REMOTE_PERSISTENCE_EXISTS = NO`.
- [x] Propor contrato mínimo de BrandSkill com versão, hash, status, áreas
  aplicáveis e `sourceRefs`, preservando o contrato legado do Planejador.
- [x] Propor `getBrandContextPack` como resolver compartilhado, com
  `available != applied` e referências compactas.
- [x] Implementar a aba Skills com criação, filtros, editor e aprovação humana,
  marcada como não persistente.
- [x] Criar SDD `propostas/skills-da-marca-persistencia-e-contexto-compartilhado.md`.
- [ ] **Próximo gate:** decidir entre Opção A (estender
  `editorial_artifact_versions`) e Opção B (tabela `public.brand_skills`) e
  aprovar a SDD. Sem essa decisão não há migration, API nem consumidor ligado.
- [ ] Após aprovação: migration, RLS, `app/api/marca/skills`, smoke autenticado
  de isolamento por marca e só então ligar Planejador e Redator ao Context Pack.
- [ ] Reconstruir Prompts em tarefa própria, depois de Skills consolidada.
- [ ] Definir contrato de conteúdo de Material para habilitar
  "Criar Skill a partir de Material" com revisão humana.

## Consolidação de governança compartilhada — 2026-08-25

- [x] Registrar a Marca como consumidora da disponibilidade da Agência, sem
  Connection, credential, provider ou quota de módulo.
- [x] Registrar especialista como identidade de domínio tenantizada e
  Telegram como Bot global com binding explícito.
- [ ] Validar manualmente, após os gates de infraestrutura, isolamento por
  `brandId`, revogação do binding e contribuição para o `ExpertBrief` correto.

## Regra compartilhada KGR/formação — concluído localmente em 2026-07-21

- Contrato aditivo de candidata com `isKgr: false`, coerência, campos de origem e status de qualificação.
- Importação preserva evidência no Minerador e não escreve volume/KGR/intenção.
- Pendente: validação manual autenticada do fluxo completo; nenhuma escrita remota foi executada nesta entrega.

## Agora

- **Objetivo:** confirmar a migration 0002 em ambiente controlado e validar manualmente o ciclo BrandDNA: carregar, salvar draft, recarregar, aprovar e isolar por marca.
  - **Módulo proprietário:** Marca
  - **Arquivos permitidos:** `app/api/marca/**`, `components/marca/**`, `lib/marca/**`, documentação e testes de Marca
  - **Arquivos proibidos:** aplicação de migration, escrita remota e telas de outros módulos
  - **Dependências:** execução manual do usuário e ambiente Supabase configurado
  - **Riscos:** confundir resposta local com persistência remota
  - **Critério de aceite:** evidência de persistência server-side e troca de marca sem vazamento
  - **Testes obrigatórios:** `test:authz`, `tests/marca-domain.test.mts`, validação manual

## Próximo

### Pendente — validação de navegação tenantizada

- Validar manualmente a troca de marca como Admin global em cada módulo, inclusive mobile e URL copiada/aberta em nova sessão.
- Confirmar por evidência de RLS que um colaborador sem module:view recebe bloqueio server-side e retorno seguro à raiz da marca.

- **Objetivo:** criar contrato e persistência versionada para materiais, Skills e prompts.
  - **Dependências:** proposta SDD e migration própria não aplicada pelo agente
- **Objetivo:** expor membros, permissões efetivas, aceite, suspensão e revogação por APIs exclusivas de Marca.
  - **Dependências:** confirmar contrato de autenticação/ownership e policies da 0002

## Depois

- Derivar e publicar `activeBrandDnaVersionId` para consumidores do pipeline sem duplicar estado.

## Bloqueado

- Confirmação do banco e validação browser não executadas nesta sprint.
- Documentos compartilhados referenciados mas ausentes no checkout: `docs/compartilhado/autenticacao-e-permissoes.md` e `docs/compartilhado/persistencia-local.md`.

## Descartado

- Trocar o provider compartilhado sem proposta SDD.

## Concluídos recentes

- Auditoria documental e de código do módulo Marca em 2026-07-20.
- SDD `propostas/marca-branddna-equipe-e-permissoes.md` criado.
- Contrato/domínio, rota e painel de BrandDNA adicionados; testes puros aprovados.
## Site e Sitemap - entrega inicial

- Aba adicionada com edicao retrocompativel do `site_url`, validacao local e estado de salvamento.
- Sitemaps, catalogo de URLs e verificacao externa permanecem como proxima proposta estrutural, sem chamadas automaticas.

## Concluído — continuidade Site e Sitemap — 2026-07-21

- Implementar teste e sincronização explícitos de sitemap com parser XML, deduplicação, recursão limitada e preservação de URLs ausentes.
- Implementar catálogo local por marca, verificação HTML por URL selecionada e extração determinística sem IA.
- Implementar prévia e importação seletiva/idempotente para lista do Minerador, sem sobrescrever keywords existentes.
- Registrar conteúdo legado observado sem criar DNA ou documento editorial.
- Preparar migration/RLS remotos sem aplicar migration, escrever Supabase, limpar browser storage, fazer commit, push ou deploy.

## Concluído — fechamento da fila de keywords — 2026-07-21

- Transformar candidatas do contador em fila global filtrável e detalhe `Ver keywords` por conteúdo.
- Exibir origem title/H1/slug/meta/headings, papel sugerido, confiança, status e vínculo com o Minerador.
- Filtrar ruído determinístico e manter apenas expressões úteis, sem remover o texto observado salvo por regra explícita.
- Criar prévia read-only, confirmação separada, lote persistido e resultado por item.
- Registrar IDs do Minerador, duplicatas, ignorados, falhas e retry somente de falhas.

## Próximo — execução controlada

- Validar manualmente `/{brandRef}/?secao=site` em sessão autenticada usando fixture/local controlado ou domínio autorizado.
- Revisar e aplicar manualmente a migration 0004 somente após confirmação do baseline 0002 e das policies no ambiente alvo.
- Adicionar domínios alternativos autorizados e provider remoto do catálogo em SDD separado, se necessário.


## Concluído — correção funcional Site e Sitemap — 2026-07-21

- Preservar `secao=site` e adicionar `painel=importacao|catalogo` na revisão.
- Corrigir reset causado pela dependência de `siteUrl` no carregamento do workspace.
- Corrigir scroll da aba dedicada sem remover o scroll global do produto.
- Exibir pré-lista de keywords e conteúdos com autorização explícita, revisão e confirmação separadas.
- Manter como pendência a validação manual autenticada e a confirmação de persistência Supabase; nenhuma chamada paga, escrita remota, limpeza de storage, migration, commit, push ou deploy foi executada.
## Concluído — correção definitiva da importação Site → Minerador — 2026-07-21

- Auditar e reproduzir payload, `brandId`, lista real e resposta de prévia sem escrita remota.
- Consolidar adaptador de importação com repository fixture/Supabase real, IDs retornados, deduplicação e proveniência.
- Impedir falso sucesso, preservar seleção em falha, expor indisponibilidade e corrigir troca de marca/lista.
- Simplificar a aba em três modos, ocupar a largura disponível e manter ações de confirmação visíveis.
- Adicionar heurística KGR determinística por convergência slug/H1/título, sem aprovação automática.
- Pendência operacional: validação manual com confirmação no Supabase remoto e recarga na tela do Minerador.

## Concluído — evidência Site/Sitemap no Minerador — 2026-07-21

- Adicionar relação keyword↔URL, situação técnica/publicação e situação arquitetural sem inferências automáticas.
- Atualizar evidência de keywords existentes de forma aditiva, preservando semântica, métricas, intenção, DNA e status.
- Manter como pendência a validação autenticada, RLS, migration 0004 e persistência durável do catálogo.
# Pendente — convergência de tenant

- Auditar schema/RLS remoto e propor migration separada para `owner_user_id`, estado de marca, plano e memberships identificadas por usuário, com backfill e rollback.

## Consolidacao fisica concluida - 2026-07-23
- Implementacoes exclusivas da area permanecem em modules/marca; nenhum contrato ou rota foi alterado nesta etapa.
- Validacao manual autenticada e persistencia remota seguem pendentes.

## Concluido - harmonizacao visual do modulo Marca - 2026-07-27

- Harmonizar as paginas e abas ativas da Marca com o sistema visual compartilhado, preservando comportamento e contratos existentes.
- Melhorar hierarquia, legibilidade, formularios, tabelas, estados vazios, mensagens e foco de teclado no escopo de `modules/marca`.
- Manter pendente a validacao manual autenticada e visual em navegador; nenhum SQL remoto, migration, escrita Supabase, commit, push ou deploy foi executado.

## Concluido - correcao da direcao visual neutra da Marca - 2026-07-27

- Remover roxo decorativo, gradientes, abas em capsulas e cards usados apenas como moldura.
- Reorganizar BrandDNA e demais abas por tipografia, espacamento, alinhamento e divisores discretos.
- Preservar funcionalidades, dados, rotas, tenantizacao, BrandDNA, Site/Sitemap, convites, permissoes e persistencia.
- Manter pendente a validacao manual autenticada e visual nos quatro breakpoints; nenhuma operacao remota foi executada.

## Concluído localmente — conexão Google Ads pela Marca — 2026-08-03

- Incluir em `Marca → Configurações` o formulário operacional de conexão por `brandId`, reutilizando a rota server-side existente e sem tocar na integração de volume.
- Exibir somente a conexão sanitizada; validar IDs completos no cliente e no servidor; exigir confirmação antes de substituir conexão ativa; manter MCC opcional e targeting explícito.
- Preservar a autorização server-side de `minerador:manage`, sem fallback entre marcas e sem expor credenciais.
- Pendente: validação manual autenticada em Adalba e Lindisse com IDs reais, confirmação de moeda/fuso e uma atualização de métricas no Minerador. Nenhuma chamada Google Ads real, SQL, migration, alteração de credenciais, commit, push ou deploy foi executada nesta entrega.

## Complemento proposto — operação da Brand dentro da Agência — 2026-08-09

- [x] Preservar Brand como tenant editorial por `brandId`; `agency_brands` concede controle operacional herdado por padrão, limitado por RLS, permissões do actor e restrições explícitas da Brand.
- [x] Registrar planilha futura de colaboradores com `brand_memberships`, papéis e permissões canônicas, sem UUID manual.
- [x] Registrar que BrandDNA, dados da Marca e pipeline editorial não serão reconstruídos pelo workspace da Agência.
- [ ] Auditar formulário de cadastro da Brand e fluxo Agência → Marcas → Cadastrar Marca antes de qualquer implementação.
- [ ] Definir activity detalhada da Brand somente após mapear eventos e históricos já existentes.
- [x] Registrar que restrições da Brand devem ser explícitas, persistidas, auditáveis, removíveis e visíveis à Agência sem desaparecerem da interface.
- [ ] Criar SDD própria para capacidades/restrições Agency → Brand antes de alterar authorization, RLS ou telas de permissão.

## SDD proposta — autorização herdada e restrições da Brand — 2026-08-09

- [x] Formalizar que `agency_brands` concede acesso operacional herdado por padrão.
- [x] Formalizar restrições explícitas, persistidas, auditáveis e removíveis por capability.
- [x] Preservar `brand_memberships` para colaboradores próprios da Brand, sem duplicar funcionários da Agency.
- [ ] Definir estrutura física, RLS, audit trail e telas de “Acesso da Agência” somente após aprovação da SDD.
# Bloqueado — geração canônica

- Aplicar ou conectar o resolvedor canônico somente após auditoria remota, snapshot, migration 0015 manual e smoke de owner/colaborador. A remoção de membership owner e `user_key` pertence à fase de limpeza posterior.
## Próximo após Fase 2A — 2026-08-06

- Realizar smoke autenticado da rota raiz da Marca para owner e colaborador com permissão, incluindo slug divergente e isolamento entre marcas.
- Não ampliar a reconexão para módulos editoriais nem remover `user_key`/membership owner até a fase de corte autorizada.

## Minha Agência — consumo operacional da Brand - 2026-08-10

- [x] Listar Brands existentes da Agency sem recálculo, duplicação, recriação ou alteração de dados.
- [x] Preparar `Cadastrar Marca` com persistência server-side e referência canônica, sem iniciar módulos editoriais.
- [ ] Projetar e aprovar UI própria para restrições Brand → Agency; nenhuma restrição é criada ou alterada nesta fase.

## First-run de Marca recém-cadastrada - 2026-08-10

- [x] Restaurar campos operacionais sem incorporar BrandDNA ou pipeline editorial.
- [x] Converter o cadastro para modal único reutilizado pelo botão do topo e pelo estado vazio.
- [x] Adicionar ações não destrutivas de edição e colaboradores pelas rotas canônicas existentes.
- [ ] Criar SDD de lifecycle para standby, arquivamento, reativação e exclusão segura antes de qualquer comportamento adicional.
- [x] Exibir home útil para Brand sem snapshot, sem fabricar métricas.
- [x] Encaminhar configuração estratégica para a área existente de BrandDNA.
- [ ] Validar manualmente CareGlow, Adalba e Lindisse em light/dark, desktop/mobile e teclado.

## Brand Skills — próximo gate manual — 2026-08-28

- [x] Consolidar contrato local único: definição code-owned, parser diagnóstico, domínio, API e painel server-backed.
- [ ] Executar smoke autenticado de conteúdo real: selecionar tipo, Markdown, salvar, confirmar readback e recarregar.
- [ ] Confirmar que uma Skill corrente da própria Marca chega ao consumidor escolhido sem aplicação automática; a aprovação humana permanece governança, não gate de leitura.

## Brand Skills — primeiro consumidor Minerador — 2026-08-28

- [x] Declarar `minerador` como consumidor de `brand_voice` no gabarito compartilhado.
- [x] Entregar às áreas compatíveis a versão corrente válida da própria Marca e registrar referências de proveniência somente quando realmente aplicadas.
- [ ] Validar com a `brand_voice` v1 `draft` real da Care Glow e revisar a apresentação contextual produzida no Minerador.
- [ ] Avaliar futuros consumidores apenas em tarefas próprias, sem ampliar esta integração para outras áreas.

## Persistência canônica de Site/Sitemap — SDD proposta — 2026-09-02

- [x] Auditoria completa da aba Site: UI, contratos, storage, rotas, coleta,
      segurança, normalização, testes e migrations relacionadas.
- [x] Comprovado que o catálogo do site vive **somente** no navegador
      (`lib/marca/site-store.ts`, IndexedDB/localStorage por ator), que as rotas
      de sitemap/verificação são stateless e que `brand_site_*` não é referenciada
      por nenhum código.
- [x] SDD proposta: `propostas/2026-09-02-sdd-site-sitemap-persistencia-canonica.md`.
      Recomenda 3 tabelas (sitemaps, sync_runs, catalog_entries), não as 8 da 0004.
- [x] `LEGACY_0004_POLICY = HISTORICAL_DESIGN_INPUT` — nunca aplicar: referencia
      `listas_kgr`, usa RLS no padrão antigo e `created_by text`.
- [x] Defeito de normalização registrado: `normalizeSiteUrl` só remove a barra
      final na raiz, então `/a/` e `/a` gerariam entradas duplicadas.
- [ ] **Aguardando aprovação do Planner Geral.** Nenhum código, migration ou SQL.
- [ ] Fase 2 do Arquiteto continua bloqueada até a Fase 5 desta frente.

## Site/Sitemap canônico — Fases 1 e 2 entregues; gate de SQL — 2026-09-02

- [x] Fase 1 — `site-canonical-url.ts`, `site-persistence-contracts.ts`,
      `site-publication-reconciliation.ts` + 17 testes puros.
- [x] Script `test:marca` criado; 39/39.
- [x] Fase 2 — migration local
      `20260902120000_brand_site_canonical_persistence.sql`, não aplicada.
- [x] Condição de parada do escopo verificada: nenhum dos quatro estados locais é
      fonte única de decisão/proveniência; a decisão "ignorar URL" foi para o
      catálogo remoto.
- [ ] **USUÁRIO executa o SQL remoto.** Antes disso, nada de repository ou escrita.
- [ ] Após execução: readback remoto de schema, RLS, constraints e índices.
- [ ] Fase 3 repository + persistência do sync · Fase 4 UI remota ·
      Fase 5 `readBrandSiteSnapshot` (desbloqueia Fase 2 do Arquiteto) ·
      Fase 6 smoke cross-browser.
- [ ] Resíduo declarado: "ignorar candidata de termo" continua local; vira adendo
      se o uso real provar necessidade.

## Fase 3 — atomicity gate bloqueou; adendo A1 aguardando SQL — 2026-09-02

- [x] Auditoria: sem driver Postgres; PostgREST não permite transação multi-write.
- [x] Precedente `persist_silo_pair_atomic` identificado e reaproveitado como padrão.
- [x] Adendo A1 na SDD + migration local + contrato de domínio + 13 testes.
- [x] **USUÁRIO executou o SQL do adendo A1 — APPLIED, materialização remota PASS.**
- [ ] **A2 — exclusividade de execução `running` por Brand.** Sem índice único
      parcial, duas execuções concorrentes no mesmo sitemap continuam possíveis.
- [ ] Só então: sitemap repository · sync run repository · catalog repository ·
      persistência em `POST /api/marca/site/sitemap/sync`.
- [ ] Fase 4 (UI remota) e Fase 5 (`readBrandSiteSnapshot`) seguem depois.
