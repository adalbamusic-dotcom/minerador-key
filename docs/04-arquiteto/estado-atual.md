# Estado atual — Arquiteto

> **Estado documental vigente — 2026-07-27:** a rota atual é `app/(brand)/[brandRef]/arquiteto/page.tsx`; a referência posterior a `/{brandUserId}/arquiteto` é alias histórico. O reparo de leitura/recovery continua sem reagrupamento automático e a conclusão operacional ainda depende de validação manual com snapshot, localização e isolamento por marca.

## Regra compartilhada de formação — 2026-07-21

Implementados localmente o gate de uma principal/até cinco apoios, a estratégia aditiva do ArticleDNA (`keywordStrategy`) e sinais de hierarquia do SiloDNA. Volume ausente permanece parcial/indisponível; score, slug ou similaridade não confirmam KGR. Artigos publicados permanecem protegidos e o Radar recebe somente contexto de leitura.

## Correção do avaliador SERP, intenção e KGR leve (2026-07-21)

- **Implementado:** `intentProfile` no ArticleDNA, normalização determinística de intenção com preservação do rótulo original e compatibilidade individual das secundárias/reforços; CTA e hierarquia não alteram a intenção central.
- **Implementado:** sanitização proprietária no Arquiteto para eliminar falsos conflitos de labels equivalentes, hierarquia comparada como formato e ausência em snippets. A evidência fraca aparece como limitação e não gera separação.
- **Implementado:** `validationProfile` com `kgr_light`; principal obrigatória, secundárias condicionais à ambiguidade, referências integrais preservadas e `queriedKeywordDnaIds` explícitos. Confiança baixa/inconclusiva impede ações destrutivas.
- **Implementado:** ingestão aditiva preserva URL publicada, canonical, slug e status; ArticleDNA exibe intenção/origem, arquitetura, KGR, publicação e identidade URL/canonical quando recebidos.
- **Implementado:** assessment anterior permanece no histórico e é marcado `Desatualizado por correção do avaliador`; nova execução explícita gera v2.
- **Verificado em fixtures:** `test:arquiteto` 70/70. Nenhuma chamada real Serper, escrita remota, migration, limpeza de armazenamento ou validação browser autenticada foi executada.
- **Limitações:** ainda pendem validação manual autenticada do preview/URL/reload/troca de marca e confirmação do schema remoto/RLS. O Radar não foi alterado.
- **Correção de deep-link (2026-07-20):** a seleção externa Radar → Arquiteto agora usa solicitação consumível por marca, compara expansão/seleção antes de chamar setters e remove `articleId` da URL após encontrar o artigo. O artigo publicado continua sendo apenas selecionado; não é recriado nem reimportado.
- **Reparo de integridade (2026-07-20):** a leitura do workspace voltou a incluir keywords aprovadas cujo ID está no índice de importação, sem deixar de preservar linhas já renderizadas. A leitura continua sem reagrupar automaticamente e uma falha de leitura não marca a assinatura como carregada.
- **Evidências do reparo:** `test:arquiteto` (48/48), `test:operational` (49/49), `npm run build` e `git diff --check` passaram.
- **Limitações:** a validação visual autenticada do deep-link e do snapshot ainda não foi repetida nesta execução; lint amplo do monólito pode continuar exibindo avisos legados, mas o lint do escopo alterado e o build passam.
- **Critério ainda aberto:** não marcar a tarefa como concluída enquanto a validação manual com snapshot não confirmar localização, recuperação e isolamento por marca.
- **Última auditoria:** 2026-07-20, leitura de código e testes de domínio/fluxo.
- **Funcionando:** agrupamento lógico, agrupamento por IA, ArticleDNA, SiloDNA, anotações, proteção de publicados e envio ao Radar existem no código. **Verificado no código; regras principais confirmadas por teste.**
- **Parcial:** SiloPage possui contrato e rota; hidratação/persistência no workspace ainda não foi confirmada como completa.
- **Simulado:** parte do pipeline pode usar fallback/local; não confundir com persistência server-side.
- **Local:** recovery por marca em `localStorage`; artefatos do Arquiteto em IndexedDB. **Verificado no código.**
- **Persistido:** ArticleDNA/SiloDNA e eventos possuem repositórios/migration previstos; execução remota não verificada.
- **Corrigido em código:** o loop `Maximum update depth exceeded` no recebimento de navegação externa; a busca continua dependente de `masterList`, mas a solicitação já consumida não reaplica estado.
- **Regressões/bugs:** a correção visual ainda aguarda reprodução manual autenticada; os testes cobrem resolução, idempotência, IDs ausentes, Sets já corretos e mudança para outro artigo.
- **Arquivos centrais:** `app/(brand)/[brandRef]/arquiteto/page.tsx`, `lib/arquiteto/**`, `lib/editorial/architect-recovery.ts`.
- **Testes:** `tests/arquiteto-domain.test.mts`, `tests/operational-flow.test.mts` cobrem contratos, published guard, recovery e preflight.
- **Última validação manual:** ainda não verificada nesta sprint.
- **Diferença spec/implementação:** não marcar como concluído; integridade de importação/hidratação é pré-requisito aberto.

## Implementação SERP e identidade publicada (2026-07-21)

- **Implementado:** SDD `docs/04-arquiteto/propostas/2026-07-21-serp-formacao-identidade-publicada.md`, contratos opcionais de snapshot integral da KeywordDNA, assessment SERP versionado, decisões por keyword, identidade publicada coerente/divergente/ausente e verificação server-side.
- **Interface:** botão `Validar agrupamento pela SERP` imediatamente depois de `Detectar viés SiloDNA (IA)`, preview com custo/consultas, recomendações `Seguir recomendação`/`Ignorar`, link publicado com `noopener noreferrer` e coluna independente `APROVAÇÃO`.
- **Persistência:** assessments, snapshots, decisões, histórico e verificações são armazenados por marca no artefato IndexedDB existente, com fallback local já identificado; a UI só anuncia sucesso após a escrita.
- **Transferência:** itens aprovados enviados ao Radar carregam referências KeywordDNA e assessment de formação de modo aditivo; UI e workflow Radar não foram alterados.
- **Verificado em código/testes:** `test:arquiteto` 54/54, `test:operational` 49/49, `tsc --noEmit` e `git diff --check` passaram. Nenhuma chamada real Serper, escrita remota ou validação browser autenticada foi executada.
- **Limitações abertas:** o build atual compilou e terminou TypeScript, mas falhou na prerenderização fora do escopo em `/admin/marcas` com `Invariant: Expected workStore to be initialized`; ainda é necessária validação manual autenticada do preview, uma coleta explícita, reload/troca de marca, link e verificação online.

## Correção de visibilidade SERP por keyword (2026-07-21)

- **Causa confirmada:** o assessment era persistido no artefato IndexedDB brand-scoped, mas a planilha só o mostrava como uma lista solta dentro do artigo expandido; não havia indicador na linha, abertura automática após confirmação nem vínculo visual obrigatório com cada keyword.
- **Correção:** cada linha de artigo exibe `SERP não analisada`, `SERP processando`, `SERP pronta · vN`, `SERP com conflito`, `SERP desatualizada` ou `SERP com erro`. Após persistência bem-sucedida, o artigo é expandido, a aba de suporte é aberta e a linha recebe foco sem reload.
- **Associação:** a renderização usa `articleId`, `keywordId` e `keywordDnaVersionId` contra as referências do assessment. Recomendações não associadas ou com versão divergente aparecem explicitamente com `KeywordDNA` e `ArticleDNA`; nunca são descartadas silenciosamente.
- **Preservação:** falhas e assessments incompletos não substituem o assessment anterior válido; ações em publicados continuam protegidas e as recomendações permanecem sujeitas a decisão humana.
- **Verificado:** `test:arquiteto` 56/56, `test:operational` 49/49, `tsc --noEmit` e `git diff --check`. O build compilou o código, mas a geração estática falhou em `/admin/marcas`, fora do Arquiteto. Ainda pendem validação browser autenticada e uma coleta real explícita.

## Separação SERP de formação e fortalecimento (2026-07-21)

- **Causa:** o assessment anterior possuía somente o modo de coleta `keyword_individual`; o domínio não recebia o estado editorial publicado e aplicava semântica de formação ao principal protegido.
- **Correção:** assessments novos recebem `assessmentMode: formacao|fortalecimento`. Publicados usam `SERP de fortalecimento`, com a principal como âncora e recomendações de intenção/conteúdo ao redor da identidade existente.
- **Proteções:** `tornar_principal`, `separar_artigo` e `retirar_do_artigo` continuam bloqueados para a principal publicada no domínio. A interface não oferece `Seguir recomendação` para ela; oferece registro de proposta de atualização ou ignorar.
- **Secundárias:** podem receber manutenção, remoção ou proposta complementar na cópia de trabalho, sem alterar principal, slug, canonical ou URL.
- **Codificação:** corrigidas as duas strings corrompidas da UI; o teste agora rejeita mojibake no arquivo da planilha.
- **Pendente:** validação manual autenticada com artigo novo e publicado, sem provider real nos testes.

## Contexto rico de URL, arquitetura e KGR (2026-07-21)

- **Implementado:** contratos opcionais para relação keyword↔URL, situação arquitetural e `ArticleKgrIdentity`, com aliases português/legado normalizados no consumidor do Arquiteto.
- **ArticleDNA:** referências preservam relação/evidência; o payload preserva situação arquitetural, designação KGR, principal KeywordDNA, slug vinculado e proveniência. Score KGR ou coincidência textual não confirmam vínculo.
- **SERP:** resolução determinística em `formacao`, `arquitetura_publicado` e `fortalecimento`; publicados sem confirmação não entram automaticamente em fortalecimento.
- **Proteções:** publicado sempre protege URL, slug, canonical e marca; principal só quando arquitetura/principal estão confirmadas ou KGR está explicitamente confirmado. KGR confirmado também protege o par principal+slug fora da publicação.
- **Transferência:** Radar recebe campos opcionais aditivos; UI/workflow do Radar não foram alterados.
- **Verificado em código/testes:** fixtures cobrem aliases, três modos, candidata editável, KGR protegido, nova versão na confirmação arquitetural e preservação ao Radar; `test:arquiteto` 63/63, `test:operational` 49/49, TypeScript, lint focado, build e `git diff --check` passaram. Validação browser/authenticated e provider real permanecem pendentes.

## ArticleDNA estratégico de KGR, volume e hierarquia (2026-07-21)

- **Implementado:** SDD `docs/04-arquiteto/propostas/2026-07-21-article-dna-estrategia-kgr-volume-hierarquia.md` e projeções aditivas `volumeStrategy`, `hierarchyStrategy` e `strategicPurpose` no ArticleDNA.
- **Implementado:** referências individuais preservam papel, volume conhecido/desconhecido, contribuição e propósito. `null` não é convertido em volume zero; reforços narrativos não recebem volume incremental artificial.
- **Implementado:** KGR explícito nasce candidato com slug derivado da principal, divergência vira conflito e confirmação arquitetural humana cria sucessora com o par principal–slug confirmado.
- **Implementado:** `ArticleControlContext` concentra intenção herdada, KGR, volume, hierarquia, propósito e ações protegidas. Radar recebe essa projeção em campo opcional único; nenhuma UI/workflow de consumidor foi alterada.
- **Implementado:** painel expandido do Arquiteto exibe propósito, volume, score/racional de hierarquia e contribuição por KeywordDNA.
- **Verificado:** `test:arquiteto` 74/74, `test:operational` 49/49, `tsc --noEmit`, lint focado e `npm run build` passaram. Nenhuma chamada real de IA/Serper, escrita remota, migration, limpeza de storage ou validação browser autenticada foi executada.
- **Limitações:** provider real, SERP real, navegador autenticado e schema remoto/RLS permanecem não verificados; mudanças de consumidores continuam limitadas ao transporte opcional.

## Perfis estratégicos de unidades e SERP (2026-07-22)

- **Implementado:** SDD `docs/04-arquiteto/propostas/2026-07-22-perfis-unidades-kgr-nao-kgr-serp.md` e ADR-015. ArticleDNA e `ArticleControlContext` receberam campos opcionais para classificação da unidade, propósito e estratégia SERP.
- **Tipos:** artigo, página de serviço, landing page, página de categoria e outro; landing mantém finalidade SEO, campanha, híbrida ou desconhecida. Sugestões mostram evidências e não equivalem a confirmação.
- **Estratégia:** ciclo, competição e perfil SERP são resolvidos em dimensões independentes. KGR confirmado usa `kgr_light`; não KGR explícito usa `competitive`; ausência/candidato/conflito usa `unknown`.
- **Interface:** painel expandido permite confirmar, alterar, marcar conflito ou manter desconhecido. A decisão cria sucessora humana do ArticleDNA, preserva identidade publicada e marca assessments anteriores como desatualizados sem apagar histórico.
- **Transporte:** o Radar recebe a projeção opcional pelo `ArticleControlContext`; sua UI/workflow não foram alterados. `EditorialUnitType` operacional permanece `article|silo_page`.
- **Verificado:** `test:arquiteto` 83/83 e TypeScript após a implementação. Ainda pendem `test:operational`, build, validação browser autenticada, provider/SERP real e schema remoto/RLS.

## Criador manual de SiloDNA e SiloPage (2026-07-21)

## Consumo da política da principal do Minerador — 2026-07-22

- **Implementado:** SDD `docs/04-arquiteto/propostas/2026-07-22-consumo-politica-principal-minerador.md` e ADR-016 registram o consumo aditivo de `primary_keyword_policy` e seu contexto humano.
- **Campos recebidos:** o adaptador reconhece política, principal publicada original/atual, ator, data, versão, motivo, histórico, `kgr_decisao`/`kgr_aplicabilidade`, intenção, volume, resultados, score, URL, slug, canonical, relação e evidências; snapshots integrais continuam no `KeywordDnaProvenanceSnapshot`.
- **Resolução:** `locked`/confirmação consolidada usa `fortalecimento`; `reviewable` usa `arquitetura_publicado`; unidade nova usa `formacao`; publicado sem política fica `unknown`. `not_applicable` explícito usa competição `competitive`; KGR confirmado usa `kgr_light`; ausência/candidato fica `unknown`.
- **Proteções:** URL, slug, canonical e marca publicados são independentes da proteção da principal. Principal revisável permanece editável; principal travada não pode ser substituída por recomendação estrutural.
- **ArticleDNA/Contexto:** política efetiva, origem/histórico, métricas, candidatas, decisão e `protectionReason` são opcionais e retrocompatíveis. A confirmação humana cria sucessora e recalcula a próxima SERP para fortalecimento sem alterar a identidade publicada.
- **Verificado:** `test:arquiteto` 89/89, `test:operational` 49/49, `tsc --noEmit`, lint focado do domínio/API e `npm run build` passaram. O lint da página completa mantém apenas dívida legada; reload autenticado e provider real permanecem validações manuais separadas desta etapa.

- **Implementado:** SDD `docs/04-arquiteto/propostas/2026-07-21-criador-manual-silo-silopage.md` e decisão `docs/00-produto/decisoes/ADR-014-criacao-manual-silo-silopage.md`.
- **Modal:** removido `Nicho (opcional)`. O formulário agora exige nome do silo e keyword/entidade central, sem transformar a entidade automaticamente em principal de artigo.
- **SiloDNA:** criação manual pode iniciar sem artigos, preserva marca, nome, entidade central, origem manual e referência real opcional de KeywordDNA.
- **SiloPage:** criação opcional com slug, situação `Novo`/`Publicado`, URL publicada obrigatória em publicado e verificação inicial `not_applicable`/`not_checked`. A URL é preservada e publicada não significa verificada.
- **Proteções:** slug inválido/conflitante e URL fora do domínio da marca ativa são rejeitados; canonical permanece separado; nenhum artigo, grupo ou KeywordDNA existente é alterado.
- **Verificado:** `test:arquiteto` 78/78, `test:operational` 49/49, TypeScript, lint focado e build com 50 páginas. Nenhuma verificação online real foi executada.
- **Limitações:** reload autenticado, conferência online, schema remoto/RLS e persistência remota ponta a ponta permanecem pendentes.
# Roteamento tenant — 2026-07-23
# Consolidacao fisica dos modulos - 2026-07-23
- Implementacao proprietaria consolidada em modules/arquiteto; wrappers canonicos permanecem finos.
- Suite focada desta rodada: 212/212; browser autenticado, persistencia remota e build continuam pendentes.

- Adicionado wrapper canônico `/{brandRef}/arquiteto`; nenhum contrato interno de formação foi refeito.

## Diagnóstico de acesso autenticado às listas — 2026-07-24

- Causa compartilhada confirmada: o cliente browser não propagava corretamente o token da sessão Supabase; o Arquiteto ainda tentava `setSession` com `refresh_token` vazio.
- Correção: Arquiteto e Minerador compartilham `lib/supabase/browser-authenticated-client.ts`; o Arquiteto também filtra `keywords_kgr` por `brand_id`.
- O erro de carregamento agora preserva código, tabela, operação, status e mensagem no log interno, sem tokens. RLS, grants e regras editoriais permanecem intactos; smoke test autenticado segue pendente.
- Verificação local: 95 testes focados, TypeScript, build e `git diff --check` passaram; ESLint do factory/teste passou. O lint integral do workspace mantém erros legados de `any`/hooks, fora desta correção.

## Ciclo JWT NextAuth → Supabase — 2026-07-24

- Causa adicional corrigida: o bearer fixo expirava porque o callback JWT não guardava/renovava o `refresh_token` do Supabase; `session.accessToken` também podia carregar indevidamente um token Google.
- Arquiteto e Minerador usam a mesma factory dinâmica; consultas revalidam a sessão, aplicam margem de 60 segundos e preservam `marca_id`/`brand_id`.
- Erros registram somente operação, tabela, código, status, diagnóstico seguro e `tokenExpired`; a UI reserva “sessão expirada” para expiração efetiva ou falha de refresh, sem expor JWT ou refresh token.
- SELECT do ecossistema pode repetir uma vez após JWT expirado; escritas não recebem retry automático. Smoke test autenticado e Google OAuth real seguem pendentes.

### Diagnóstico final da sessão NextAuth → Supabase — 2026-07-24

- Corrigida a classificação que mostrava “sessão expirou” para qualquer erro de autenticação. O Arquiteto compartilha o mesmo resultado estruturado e os mesmos códigos seguros do Minerador.
- SELECTs tenantizados só prosseguem com `SUPABASE_SESSION_READY`; ausência de sessão, troca Google, token, claims e refresh são diferenciados sem fallback anon.
- A configuração remota do provider Google permanece requisito externo, não alterado nem testado por login real.
- O fluxo de login não redireciona ao Arquiteto quando `session.supabaseAuth.status` não é `ready`; falhas Google/Supabase interrompem o callback e exigem novo login.
