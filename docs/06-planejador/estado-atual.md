# Estado atual — Planejador

## ContentPlan determinístico e cockpit editorial — 2026-08-27

- **Implementado localmente:** `lib/planejador/deterministic-plan.ts` interpreta o pacote Radar sem criar uma segunda fonte de verdade, distribui referências por seção, preserva perguntas/entidades/objeções, mantém lacunas de fontes e links explícitas e constrói o gabarito a partir de métricas observadas quando disponíveis.
- **Implementado localmente:** novos planos v2 recebem plano visual determinístico com uma capa e dois respiros, todos em `planned`, sem geração automática de imagem ou prompt inventado; FAQ não é oferecido como bloco novo.
- **Implementado localmente:** o editor central expõe função argumentativa, tópicos, perguntas, entidades, objeções, instruções, restrições, exclusões, faixas de palavras/parágrafos, tom, profundidade, detalhe, referências preservadas e histórico local.
- **Implementado localmente:** o cockpit foi normalizado para o sistema visual compartilhado, com estados legíveis de carregamento, ausência, conflito, proteção de publicação, revisão e plano visual em tamanhos responsivos.
- **Verificado:** 25 testes focados Planejador/Radar, 20 testes do sistema visual, ESLint direcionado, `check-visual-system` e `git diff --check` passaram nesta execução.
- **TypeScript:** `tsc --noEmit` continua bloqueado por erros preexistentes em `lib/minerador/keyword-qualification.ts` e pelas flags de regex dos testes `tests/agency-adalba-platform-internal.test.mts`; nenhum erro novo foi reportado nos arquivos desta implementação.
- **Validado parcialmente no navegador:** a rota válida `/{brandRef}/planejador` resolve para o login tenantizado sem sessão; cockpit com dados reais, troca autenticada das etapas e inspeção visual completa aguardam login.
- **Não executado:** migration, SQL, escrita/readback remoto, SERP paga, geração de imagem, publicação, commit, push e deploy.

## InternalLinkGraph como contexto de entrada — 2026-08-26

O Planejador pode receber a referência opcional e versionada
`internalLinkGraphRef` dentro do handoff do Radar. Isso não transforma o
grafo em `ContentPlan`, não concede mutação ao Planejador e mantém a escolha
de seção, contexto, quantidade planejada e conceito de âncora separada da
decisão estrutural do Arquiteto. A fundação remota, o readback e o isolamento
cross-brand estão confirmados; o adaptador funcional de leitura do Planejador
continua dependente da evolução do consumidor e não exige nova migration.

## Gate de leitura do Radar — 2026-08-26

```text
RADAR_HANDOFF_V2=READY
PLANNER_READ_CONTRACT=READY
CONTENTPLAN_BOUNDARY=PRESERVED
RADAR_PLANNER_HANDOFF_V2=PASS
BACKWARD_COMPATIBILITY=PASS
HANDOFF_DATABASE_CHANGE_REQUIRED=NO
PERSISTENCE=EXISTS_NEEDS_ADAPTER
```

O Planejador lê o envelope v2 como evidência versionada e continua sendo o
único responsável pelo `ContentPlan`. O envelope preserva ArticleDNA,
`brandId`, `articleId`, `articleDnaVersionId`, SiloDNA, evidências SERP,
proveniência, decisões humanas e hashes/versionamento; `ExpertEvidence` é
opcional e `ProductEvidence` permanece opcional/futura. Não há mudança de
banco.

A fundação Telegram/Experts está `REMOTE VERIFIED`, mas contribuição Telegram
real, texto/áudio E2E e Speech real continuam pendentes. O Planejador não
refaz SERP e não transforma o envelope em decisão editorial automática.

## Entrada canônica do Radar — 2026-08-26

- **Implementado localmente:** o Planejador aceita o `RadarPlannerHandoff`
  v2 como evidência de origem e o adapta ao `ContentPlan` existente sem
  confundir as duas entidades.
- **Preservado:** identidade por `brandId`, ArticleDNA/SiloDNA, versões,
  hashes, aprovação humana, decisões, referências SERP e compatibilidade com
  itens antigos sem envelope.
- **Gate:** novas coletas para handoff usam DataForSEO. Um pacote histórico
  Serper já válido e aprovado também pode formar o envelope sucessor, sem
  converter ou apagar `provider=serper` da provenance.
- **Persistência:** `EXISTS_NEEDS_ADAPTER` no payload JSONB do workflow;
  nenhuma migration ou alteração remota foi executada.
- **Pendente:** smoke autenticado Radar → Planejador com dados reais,
  persistência/readback/reload e decisão humana do primeiro ContentPlan;
  contribuição Telegram real permanece um gate separado.

## Estratégia KGR, volume e cobertura — 2026-07-21

- **Implementado:** SDD `propostas/estrategia-kgr-volume-e-cobertura.md`; o Planejador consome as estratégias já formadas pelo ArticleDNA e registra snapshot compacto opcional no ContentPlan.
- **Implementado:** uma principal é obrigatória, zero a cinco apoios são aceitos e seis é apenas teto; a principal mantém intenção, promessa, fronteira, URL/slug/canonical e identidade recebidas.
- **Implementado:** painel do cockpit mostra potencial de volume combinado, cobertura parcial, origem KGR, score/resultados/cauda quando disponíveis, coerência de slug, hierarquia e mapa de apoio sem criar H2 automaticamente.
- **Implementado:** alertas e aprovação detectam conflito de intenção, KGR conflitante, principal sem cobertura e divergência hierárquica; ausência de dado permanece explícita e não é inferida.
- **Verificado:** 18 testes focados do Planejador passaram, o script manual determinístico passou e ESLint dos arquivos alterados passou. A validação ampliada teve 243/244 testes; TypeScript/build seguem bloqueados por erros preexistentes no módulo Minerador.
- **Limitações:** não houve KGR externo, SERP, IA paga, persistência remota, migração ou validação visual autenticada; permanece um erro TypeScript preexistente em `lib/minerador/site-sync-adapter.ts`, fora do módulo proprietário.
- **Última auditoria:** 2026-07-20.
- **Funcionando:** importação seletiva do Radar, criação de ContentPlan v2, editor de sucessoras, gate de aprovação e abertura do Redator existem no código. **Confirmado por testes direcionados.**
- **Parcial:** primeiro artigo recebido e primeiro ContentPlan criado são **Relatados pelo usuário**; SERP real aprovada, fontes externas e validação manual ponta a ponta continuam pendentes.
- **Simulado:** provider possui criação mock de plano/documento, identificada explicitamente. **Verificado no código.**
- **Local:** fallback de workspace por marca.
- **Persistido:** ContentPlan e workflow possuem repositórios/migration previstos; banco remoto não verificado.
- **Bloqueado:** confirmação manual de persistência remota e fechamento humano de fontes/links quando a carga de origem for parcial.
- **Regressões/bugs:** nenhum confirmado nesta sprint.
- **Arquivos centrais:** `lib/planejador/content-plan.ts`, `lib/arquiteto/contracts.ts`, `lib/editorial/operational-flow.ts`, `modules/planejador/planner-page.tsx`, `components/planejador/content-plan-editor.tsx`.
- **Testes:** `tests/planejador-content-plan.test.mts`, `tests/operational-flow.test.mts` e `tests/editorial-pipeline.test.mts`.
- **Última validação manual:** ainda não verificada.
- **Diferença spec/implementação:** a UI e o contrato v2 estão implementados; persistência remota e confirmação no navegador ainda não foram verificadas nesta tarefa.
## Entrada Radar - 2026-07-20

O contrato `ContentPlanDetails.radar` aceita, de forma aditiva e retrocompativel, `analysisVersionId`, modo, enforcement, hash do pacote, requisitos, recomendacoes, observado e decisoes humanas. Um plano novo pode receber o pacote aprovado; versoes existentes nao sao sobrescritas silenciosamente.

## Cockpit editorial e hidratação - 2026-07-20

- **Implementado:** SDD `propostas/cockpit-editorial-e-hidratacao.md`, rota `/planejador/[contentPlanId]`, resumo hidratado na grade e painel dedicado com visão geral, DNA, SERP, estrutura, gabarito, itens editoriais, fontes/evidências, CTA/metadados e validação.
- **Implementado:** `lib/planejador/hydration.ts` resolve textos de keyword/silo e separa dado editorial de diagnóstico técnico; ausência mostra `Referência não hidratada`.
- **Implementado:** `lib/planejador/outline.ts` calcula métricas, alerta H3 órfão e distingue save sem mudança material de sucessora.
- **Implementado:** gabarito/blocos/perguntas/entidades/objeções opcionais no ContentPlan; `writingBrief` opcional segue ao ContentDocument sem alterar Tiptap.
- **Persistência:** alterações continuam no provider local e no workflow existente; nenhuma migration, escrita remota, limpeza de recovery ou chamada paga foi executada.
- **Verificado:** typecheck, lint direcionado, `git diff --check` e 75 testes de Planejador/fluxo/editorial passaram.
- **Limitação:** a validação manual no navegador, persistência remota real, Radar real aprovado e transferência ponta a ponta continuam pendentes.
## Entrada de evidência Radar — 2026-07-20

O Planejador pode receber um `RadarEvidencePackage` aditivo com snapshot SERP, curadoria, estruturas observadas, semântica, competitividade observada, conflitos, proveniência, versão e hash. O Radar não envia metas finais, outline, CTA, requisitos estruturais ou decisões do Guardião. O Planejador transforma evidências em ContentPlan e não sobrescreve plano existente automaticamente.

O pacote também preserva a identidade editorial como contexto de origem: o artigo publicado chega com keyword principal, slug, canonical, marca e URL estrutural protegidos no Radar. A decisão de criar nova versão do ContentPlan continua humana e pertence ao Planejador.

## Organização guiada do cockpit - 2026-07-20

- **Implementado:** cockpit dividido em Contexto, Estratégia, Estrutura, Recursos editoriais e Revisão/aprovação, sem alterar a navegação global.
- **Implementado:** resumo fixo com progresso derivado, H2/H3, extensão, perguntas, links, fontes, imagens, conflitos, bloqueios e próxima ação.
- **Implementado:** editor central de outline com H1, H2/H3, conversão, reordenação, remoção, blocos, faixas de palavras/parágrafos, associação de tópicos/perguntas/entidades e desfazer/refazer local.
- **Implementado:** labels de workflow, publicação e transferência separados e traduzidos; aprovação permanece visível, mas desabilitada quando há bloqueios.
- **Implementado:** alertas de sobreposição lexical de headings, gabarito vazio, H3 órfão, SERP ausente, fontes, links e referências não hidratadas.
- **Verificado:** build Next.js concluído, typecheck, ESLint direcionado, diff check e 77 testes direcionados passaram.
- **Limitação:** validação manual visual continua pendente; os contratos canônicos `docs/00-produto/contratos/status.md`, `workflow.md` e `versionamento.md` não existem no checkout e os contratos reais do código foram usados como fonte.
- **Correção de carregamento:** a rota do cockpit agora ignora envelopes legados sem `payload.planning`, seleciona a versão definitiva mais recente por entidade e exibe recuperação orientada quando nenhuma versão definitiva existe; não chama o view model com contrato incompatível.

## Integridade editorial e protecao de publicados — 2026-07-20

## Contexto estrategico e identidade publicada - 2026-07-21

- **Implementado:** SDD `propostas/contexto-estrategico-identidade-publicada.md`; a etapa Estrategia le a versao aprovada do BrandDNA pela rota existente, usa o contexto legado somente quando o BrandDNA nao esta disponivel e mostra estado explicativo quando faltam dados.
- **Implementado:** materiais, Skills e prompts da marca ativa aparecem somente quando ja estao no estado local do workspace; a selecao e explicita, filtrada por marca e aplicada de forma idempotente na copia de trabalho. O ContentPlan registra referencias compactas, origem, aplicacao e conflitos sem copiar prompts/documentos completos.
- **Implementado:** `ArticleDNA` aceita `publishedIdentityRef` opcional; a identidade operacional/PublicationRecord permanece canonica para publicacao, URL, slug e canonical. O Planejador mostra a relacao e bloqueia divergencia conhecida.
- **Implementado:** a etapa Recursos oferece `Verificar publicacao` somente para reconciliar fontes locais ja carregadas; nao ha publicacao, servico externo ou escrita remota.
- **Verificado:** 145 testes direcionados, `tsc --noEmit` e ESLint dos arquivos alterados passaram nesta execucao.
- **Persistencia:** aplicacao de contexto fica na copia de trabalho; salvar com mudanca material usa a sucessora versionada existente. BrandDNA remoto continua dependente da migration/infraestrutura ja prevista; materiais, Skills e prompts nao tem persistencia propria confirmada.
- **Limitacoes:** validacao visual autenticada do artigo real, persistencia remota e confirmacao de materiais/Skills/prompts alem do estado local continuam pendentes.

- **Implementado:** `lib/planejador/publication-identity.ts` resolve publicação operacional/legada por marca e artigo, com estados publicado, não publicado, desconhecido e conflito.
- **Implementado:** `lib/planejador/hydration.ts` recebe a hidratação do Radar, usa aliases/versionamento da KeywordDNA e separa Silo de SiloDNA.
- **Implementado:** `createContentPlanSuccessor` e o contexto do pipeline recusam mudanças de identidade protegida no payload/sucessora; edições editoriais permitidas continuam versionadas.
- **Implementado:** cockpit mostra situação, identidade e explicação simples; desconhecido fica protegido conservadoramente.
- **Verificado:** 83 testes focados, typecheck, ESLint direcionado e build Next.js passaram; diff-check sem erros.
- **Limitação:** a marca não estava selecionada na sessão do navegador; roteiro manual real continua pendente.
# Roteamento tenant — 2026-07-23

# Correção de abertura do cockpit — 2026-07-29
- **Verificado no código:** o botão `Abrir cockpit` passou a montar `/{brandRef}/planejador/{contentPlanId}`, preservando o tenant ativo e o `versionId` do plano.
- **Verificado no código:** os retornos do cockpit para a grade/lista também usam o Planejador tenantizado; sem contexto de marca, a ação fica protegida e não gera uma URL inválida.
- **Confirmado por teste:** regressão de navegação canônica e `tests/tenant-routing.test.mts` passaram (6/6); lint direcionado passou.
- **Validado parcialmente no navegador:** a grade autenticada exibe os links tenantizados corretos; o processo `next dev` em execução ainda não reindexou a rota dinâmica e devolve 404 até ser reiniciado.
- **Pendente:** reiniciar o servidor local, confirmar a entrada no cockpit e validar a persistência remota.
# Consolidacao fisica dos modulos - 2026-07-23
- Implementacao proprietaria consolidada em modules/planejador; wrappers canonicos permanecem finos.
- Suite focada desta rodada: 212/212; browser autenticado, persistencia remota e build continuam pendentes.

- Adicionado wrapper canônico `/{brandRef}/planejador`; o cockpit existente permanece proprietário do módulo.
## Fase 2A — limite explícito — 2026-08-06

- O Planejador não foi migrado para a nova autorização nesta fatia. Sua rota continua no gate legado deliberadamente, para preservar o contrato editorial enquanto Marca, Conta, seleção e Administração passam por smoke canônico.
- Pendente: migrar somente após validação manual da Fase 2A e proposta aprovada para os consumidores editoriais.

## Incidente 3B-R1 — porta de entrada do Planejador — 2026-08-09

- O Planejador permanece protegido pelo contexto Supabase autenticado e não recebe grants, suporte ou comunicação enquanto a identidade/sessão não estiverem aprovadas no smoke.
- A correção local ficou restrita à entrada de autenticação: erros agora são classificados sem mascarar falhas de configuração ou rede, e não foi criado fallback por e-mail, `ADMIN_EMAIL` ou NextAuth.
- Acesso real ao Planejador, Admin global, conta comum, reload e logout continuam pendentes de validação manual autenticada.

## Brand Skills no contexto de IA — 2026-08-28

- **Implementado localmente:** builder compartilhado de Brand Context e adaptador `content-plan` do Planejador, com `definitionKey`, versão, hash e ID de versão quando a operação efetivamente o usar.
- **Preservado:** BrandDNA continua superior; evidência Radar, ArticleDNA e identidade publicada não são alterados. ContentPlan guarda apenas referências compactas.
- **Limite confirmado:** o runtime atual do Planejador é determinístico e não contém chamada de IA/provider. Nenhum provider, dado remoto ou ContentPlan real foi alterado.
- **Pendente:** ativar a Skill real Care Glow, integrar a primeira operação IA autorizada antes do prompt e executar smoke controlado.
