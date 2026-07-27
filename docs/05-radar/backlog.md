# Backlog — Radar

## Consumo somente leitura da formação — 2026-07-21

- O contexto estratégico do Arquiteto permanece opcional e compatível com itens antigos.
- Pendente: validação manual autenticada da leitura no navegador; nenhuma SERP real ou escrita remota foi executada.

## Agora

- Validar manualmente a hidratação do artigo publicado existente: texto da keyword, `KeywordDNA`, `ArticleDNA`, `SiloDNA`, nome do silo, SERP `Não pesquisada` e botão de coleta habilitado.
- Aplicar manualmente `supabase/migrations/0003_radar_serp_snapshots.sql` no ambiente autorizado.
- Executar uma única coleta manual autenticada com keyword real e confirmar query, status, hash e persistência.
- Fazer validação visual da planilha, detalhe expandido, revisão humana e integração com o Planejador.

## Depois

- Integrar provider de fontes externas e sinalização de originalidade, mantendo proveniência e revisão humana.
- Evoluir classificação manual de resultado sem substituir o diagnóstico determinístico histórico.
- Avaliar rate limit/observabilidade operacional para consultas pagas, com política de custo explícita.

## Concluídos recentemente — 2026-07-20

- Provider real Serper.dev server-side com configuração lazy, timeout, normalização e erros explícitos.
- Fallback local para coleta real quando a persistência editorial/migration remota está indisponível, preservando `origin: real`, `isMock: false` e `needs_review`.
- Erros estruturados de configuração, migration, conexão, autenticação, permissão e provider.
- Separação explícita entre UUID canônico, alias `pub-k-*`, ID de origem e texto; nenhum alias é enviado para colunas UUID.
- Ação `Abrir no Radar`, painel expandido e ação separada `Ver no Arquiteto`, sem loop de deep-link.
- Rota autenticada de coleta/revisão com bloqueio de keyword técnica e verificação de marca.
- Snapshots versionados, hash SHA-256, PAA, related searches, Knowledge Graph e diagnóstico.
- Persistência remota append-only preparada e fallback local identificável.
- UI real separada do mock e evidência real condicionada à aprovação humana.
- Integração do snapshot aprovado como referência opcional no plano do Planejador.
- Fixtures do provider e regressões editoriais/operacionais passando.
- Snapshot aditivo de hidratação no item Radar, reconciliação segura de registros antigos e resolução de aliases `pub-k-*` no cliente e no servidor.
- Inclusão de keywords sem `lista_id` no snapshot editorial quando pertencem ao conjunto de silos autorizado; nenhum conteúdo do Arquiteto é recriado ou alterado.
- Envelope editorial versionado e hashado na transferência cliente→Radar, com validação server-side, bloqueio de conflitos antes do provedor e registro de `resolutionMode`/`canonicalRemoteVerified`.

## Fora do MVP

- Scraping direto do Google.
- Retry, polling, coleta em lote implícita ou aprovação automática.
- Execução de migration remota e consulta paga automática durante testes.
## Novos itens - 2026-07-20

- Validar manualmente a pagina `/radar/[articleId]`: abas, curadoria, extracao controlada, aprovacao e recovery apos reload.
- Confirmar no Planejador a visualizacao do pacote Radar aprovado e decidir humanamente entre manter o plano atual ou criar sucessora.
- Integrar fontes externas e originalidade sem transformar observacao em aprovacao automatica.
- Adicionar sincronizacao posterior do recovery local sem nova coleta ou extracao.

## Correção estrutural de evidência — 2026-07-20

- Validar manualmente que a URL canônica usa `articleDnaVersionId` limpo e que `/radar/radar%3Apub-k-*` redireciona uma única vez.
- Confirmar os nove resultados no Resumo, SERP e Concorrentes após reload com remoto parcial e recovery local completo.
- Confirmar estados específicos para PAA, relacionadas, Knowledge Graph, extração não iniciada, amostra insuficiente e conflito de hash.
- Confirmar no Planejador que `RadarEvidencePackage` aparece como evidência e que ContentPlan existente não é sobrescrito.

## Validacao manual da correcao de hidratacao — 2026-07-20

- Abrir uma linha real pela planilha e confirmar que a URL usa `RadarItem.id`; abrir também uma URL antiga `pub-k-*` e confirmar redirecionamento canônico com `?tab=serp` preservado.
- Confirmar nas sete abas o mesmo snapshot SERP v1, seus resultados orgânicos/PAA/relacionados/Knowledge Graph, ArticleDNA, KeywordDNA, SiloDNA e revisão legada.
- Recarregar a página e confirmar recovery local/servidor sem nova chamada Serper, sem perda de resultados e sem substituição por estado vazio.
- Só após essa conferência, iniciar a análise uma vez e confirmar que ela referencia o mesmo snapshot, sem duplicar coleta ou versão por duplo clique/reload.

## Identidade e proteção — implementado em 2026-07-20

- Identidade editorial, proteção de publicados, DNAs, silo, comparação DNA x SERP e orientação por próxima ação.
- Justificativa de keyword exigida somente para conflito que encaminha revisão ao Arquiteto.
- Validar manualmente selo `Publicado e protegido`, URL publicada em nova aba, proveniência recolhida e campos preservados em artigo publicado e novo.

## Fechamento operacional — implementado em 2026-07-21

- Estados separados de investigação, publicação e transferência, com progresso real condicionado à revisão da SERP orgânica.
- Registro versionado de transferência ao Planejador, com distinção entre corrente, aprovada, enviada e atualização disponível, sem duplicar artigo ou `ContentPlan`.
- Mensagens canônicas para dado não recebido nesta etapa, proteção compreensível de publicados e orientação de artigos novos para o Arquiteto.
- Benchmark limitado a artigos editoriais completos e semântica com categorias de ruído e recuperação explícita.
- Cobertura automatizada de formatos, semântica, estados, transferência e chaves React duplicadas em `tests/radar-usability.test.mts` e `tests/radar-navigation.test.mts`.

## Validação manual restante

- Conferir um artigo novo e um publicado, preservando identidade, canonical, URL estrutural e controles somente leitura.
- Conferir uma SERP com itens orgânicos pendentes e outra com todos revisados, verificando a diferença real no progresso e na próxima ação.
- Aprovar e enviar uma versão; criar uma sucessora; confirmar que a atualização é indicada sem duplicar artigo ou plano.
- Executar uma coleta Serper real somente por ação manual autenticada, com uma keyword, após confirmar configuração e persistência autorizadas.

## Contexto KGR e identidade estratégica — implementado em 2026-07-21

- Exibir no Resumo a estratégia KGR recebida, origem, principal, score, volumes, composição, limite, papéis, hierarquia, slug e situação de publicação.
- Preservar classificação recebida; sugerir KGR leve sem recalcular classificação pela SERP; manter ausência como estado explícito.
- Comparar principal e slug sem alteração automática; encaminhar artigo novo desalinhado ao Arquiteto e proteger publicado historicamente desalinhado.
- Transportar `kgrStrategy` de forma aditiva no `RadarEvidencePackage`, com aviso de sobreposição e sem metas finais de ContentPlan.
- Manter referências acima de seis visíveis em recovery/fixture e bloquear somente a consolidação de novo pacote até revisão no Arquiteto.

## Validação manual KGR restante

- Cenário A: artigo KGR novo, slug alinhado, até seis keywords, sugestão KGR leve e primeiro envio ao Planejador.
- Cenário B: artigo KGR publicado com slug desalinhado, campos protegidos e oportunidade de atualização sem troca de URL.
- Cenário C: artigo não KGR, sugestão competitiva completa, composição preservada e nenhuma classificação inventada.
- Cenário D: artigo com mais de seis referências em recovery/fixture, conflito visível, nenhuma referência apagada e revisão indicada no Arquiteto.
- Cenário E: KGR ausente, estado honesto e escolha humana de profundidade.

## Consolidacao fisica concluida - 2026-07-23
- Implementacoes exclusivas da area permanecem em modules/radar; nenhum contrato ou rota foi alterado nesta etapa.
- Validacao manual autenticada e persistencia remota seguem pendentes.
