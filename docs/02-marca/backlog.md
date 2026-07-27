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
