# Backlog — Marca

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
