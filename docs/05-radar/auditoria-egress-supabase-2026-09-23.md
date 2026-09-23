# Auditoria de egress da Supabase — 2026-09-23

**Módulo proprietário:** Radar. **Escopo:** consumo remoto, leitura da mesa editorial e viabilidade de execução local. Consultas em outros módulos são diagnóstico de consumidores; a única alteração de código deste corte é a projeção já consumida por `ArtifactRepository.list`.

## Resposta operacional

Nas capturas fornecidas pelo usuário e no painel autenticado lido novamente durante a auditoria, a organização `minerador-key`, no Free Plan e com um projeto ativo, está **acima da cota de egress do ciclo 26/08–26/09/2026**: 5,758 GB / 5 GB (115%), excesso de aproximadamente 0,758 GB. O aviso informa possível restrição a partir de 20/10/2026 caso a organização permaneça acima da cota. O valor é acumulado: os ajustes não retiram bytes que já saíram. O próximo ciclo precisa permanecer abaixo da cota. O conector confirmou organização/projeto, e a inspeção do gráfico de cobrança confirmou **PostgREST como fonte dominante nos dias amostrados**. O gráfico ainda não prova a economia mensal futura nem atribui cada byte a uma rota da aplicação.

O painel mostra banco em cerca de 0,101/0,5 GB, Storage 0/1 GB, cached egress 0/5 GB, MAU 5/50.000, mensagens Realtime 0/2 milhões, invocações Edge Functions 0/500 mil e pico de conexões Realtime 3/200. A cota pressionada é transferência não cacheada. Consulta SQL somente leitura em 23/09/2026 06:55 UTC mediu `pg_database_size` em 82 MB; esta é outra métrica/instante que os ~96 MB exibidos no painel, sem mudar o diagnóstico.

### Série diária amostrada no painel autenticado

| Dia de 2026 | PostgREST | Auth | Outras categorias exibidas | Leitura |
| --- | ---: | ---: | --- | --- |
| 19/09 | 624,988 MB (97,0%) | 18,702 MB | Storage 66 kB; Realtime 469 kB; pooler 403 kB | Pico de ~644 MB, quase todo da API de dados. |
| 20/09 | 34,410 MB (97,4%) | 929 kB | demais arredondadas a zero pelo painel | ~35 MB. |
| 21/09 | 95,632 MB (96,5%) | 3,199 MB | Realtime 7 kB; pooler 240 kB | ~99 MB. |
| 22/09 | 12,772 MB (93,8%) | 851 kB | Realtime 9 kB | ~14 MB. |

**Inferência:** o ritmo dos três dias 20–22/09 é bem inferior ao pico de 19/09 e, se sustentado, fica abaixo do orçamento diário de um ciclo Free. Ele também reflete atividade diferente e o ajuste de 21/09 entrou durante a janela; sem controle de número de aberturas/consultas, não é prova causal isolada nem garantia para outubro. O painel informa atualização de hora em hora; 23/09 ainda não tinha barra fechada.

No Logs Explorer autenticado, o plano Free informou **retenção de apenas um dia**. Executei o modelo agregado *Top Paths* nas últimas 24 horas: `/auth/v1/user` apareceu 494 vezes; entre as consultas PostgREST, `/rest/v1/minerador_discovery_keyword_origins` apareceu 103 vezes, e leituras de `perfis` e `minerador_keywords` com a mesma projeção apareceram 102 vezes cada. O modelo agrupa caminho e parâmetros, portanto outra projeção da mesma tabela pode formar outra linha. São **contagens de requisições, não bytes**; não permitem explicar os picos de 19/09 nem atribuir o egress antigo a esses endpoints. Os logs desse período já expiraram. Também não identificam se as chamadas vieram da aplicação, de testes ou de outro cliente.

Segundo a [documentação de egress](https://supabase.com/docs/guides/platform/manage-your-usage/egress), Database, Auth, Storage, Functions, Realtime e pooler contribuem; o uso acumula no ciclo e só reinicia no ciclo seguinte. A [política de fair use](https://supabase.com/docs/guides/platform/billing-faq#fair-use-policy) prevê restrições para excesso recorrente; o aviso pode permanecer após a queda de uso e não é prova de que o consumo atual continua crescendo no ritmo anterior.

## Conferência dos ajustes de 21/09

As migrations `20260921030000`, `060000`, `070000` e `080000` constam no histórico remoto. As views `minerador_keywords_listagem` e `editorial_workflow_items_listagem` existem com `security_invoker=true`. As 31 linhas de `radar_analysis_runs` não estão vazias nem órfãs. Leituras agregadas não transferiram payload editorial ao agente.

| Leitura no banco | Antes / origem completa | Agora / projeção | Interpretação |
| --- | ---: | ---: | --- |
| 3 payloads Radar na tabela versus view | 1.635.026 B | 1.635.400 B | As corridas já saíram da linha; a view hoje funciona como proteção contra regressão, mas não economiza mais nesses 3 itens. |
| Semântica de 267 keywords ativas | 1.771.869 B | 1.397.895 B | A view poupa ~374 kB, 21% desse campo, por leitura completa das keywords existentes. |
| 31 corridas Radar na tabela própria | 9.204.387 B | leitura por detalhe | A separação poupou a listagem e a regravação, porém `findByArticle` ainda reidrata todas as versões do item. |
| 2 `ContentDocument` | 4.496.695 B no `payload` | ambos completos em `ContentDocumentRepository.list` | Custo remanescente da leitura geral do workspace, mesmo quando o artigo não é aberto no Redator. |
| `editorial_artifact_versions` | 613 linhas, 2.312.813 B de payload | só 6 linhas de tipos consumidos, 183.781 B | A consulta anterior baixava 607 linhas que o método descartava. O filtro por tipo foi corrigido localmente neste corte. |

Esses números usam `length(jsonb::text)` como **estimativa de corpo de dados**, não os bytes faturados pelo provedor: JSON de resposta, headers, compressão, transferências entre serviços, Auth e repetições podem alterar o total. `pg_stat_statements` está acumulado desde 10/07/2026; seus contadores não isolam o período antes/depois das correções. A correção histórica de 10 MB → ~1,6 MB na listagem do Radar está descrita em [estado-atual.md](estado-atual.md); o readback atual confirma o patamar menor, não a economia mensal efetiva.

## Mudança local deste corte

`ArtifactRepository.list` agora filtra `article_dna`, `silo_dna` e `content_plan` **na consulta**, os únicos tipos que o método valida e devolve. Preserva a forma da resposta, a marca e os consumidores atuais: workspace editorial, export e envio do Radar, início de YouTube, análise Amazon, pesquisa de apoio e rota SERP. Não altera schema, RLS, persistência, Auth nem dados. Os 2,13 MB excluídos são o **total do projeto**, não a economia por requisição: a consulta é isolada por marca. Nas três marcas com artefatos, o payload descartado por carga seria respectivamente ~1,26 MB, ~0,70 MB e ~0,17 MB. A economia só existirá quando o código for publicado pelo usuário.

Verificação local: `tsc --noEmit` e ESLint direcionado passaram; 14 testes de leitura parcial e 7 da listagem de workflow passaram. A suíte conjunta de 41 testes teve 37 sucessos e 4 falhas preexistentes em `editorial-pipeline.test.mts`, ligadas a expectativas antigas de rotas/componentes sem relação com este filtro. `git diff --check` passou. Não houve deploy, escrita remota, chamada paga ou teste de interface autenticada.

## Próximos cortes, por retorno esperado

1. **Acompanhar cobrança pós-ajuste no painel.** A amostra de 19–22/09 identifica PostgREST como serviço dominante. Registrar os dias restantes e o próximo ciclo; usar Logs Explorer diariamente para medir frequência e, quando o dado estiver disponível, bytes por rota, separando endpoints da aplicação de outros clientes. O plano Free não preserva logs antigos para uma análise retroativa. Meta operacional para 5 GB em um ciclo de ~31 dias: média abaixo de ~161 MB/dia; usar meta interna de 100 MB/dia para folga.
2. **Publicar o filtro de artefatos e medir.** A mudança é local até o deploy manual. Medir número/tamanho das leituras da mesa antes e depois sem expor payload/segredos.
3. **SDD para listagem de documentos enxuta.** `ContentDocumentRepository.list` retorna payload completo de todos os documentos. Propor metadados para a mesa e hidratação do documento específico ao abrir o Redator, com readback, F5, controle de versão, tenant e regressão de consumidores. A mudança de hidratação global é estrutural; não executar como ajuste avulso.
4. **SDD para reidratação seletiva das corridas Radar.** `findByArticle` ainda baixa todas as corridas do item consultado por padrão; são 31 corridas e 9,2 MB de texto somadas **no projeto**, não em cada chamada. Selecionar versão por rota requer mapear cada consumidor e preservar aprovação, hash e escrita lossless.
5. **Validar polling por área.** O fallback do Radar consulta a área visível a cada 3 s com trabalho pendente ou 10 s quando aberta, se o sinal Realtime estiver indisponível. O workspace inteiro não é polled por esse hook. Medir endpoints e bytes no painel antes de alterar o ritmo; não reduzir atualização em silêncio.

## Execução local e instalador Windows

| Opção | Redução de egress Supabase | Mudança necessária | Adequação |
| --- | --- | --- | --- |
| Next.js/worker no Windows + banco remoto atual | pequena ou nenhuma por si só | empacotamento da aplicação | Mantém as mesmas leituras da Supabase; útil para processamento local, não resolve a cota. |
| Supabase CLI local + Next.js local | elimina egress remoto nos testes locais | Docker compatível, migrations, envs e dados de teste locais | Melhor caminho para desenvolvimento e testes. A stack CLI é **só de desenvolvimento**, sem endurecimento para produção. |
| Supabase self-hosted local/servidor próprio | elimina a cota da plataforma gerenciada para o tráfego migrado | operação de Postgres/Auth/Storage, backup, atualização, segurança, rede e migração | Viável tecnicamente, mas transfere manutenção e risco de indisponibilidade/dados ao operador. |
| Edição offline com sincronização só do concluído | potencialmente grande | novo armazenamento durável local, fila, sincronização idempotente, conflitos, Auth/permissões offline e versionamento | Nova arquitetura de produto; exige SDD aprovada, protótipo isolado e plano de migração/rollback. |

Instalar apenas a interface no Windows não muda onde estão Auth e dados; o tráfego remoto continuaria. Guardar **somente processos finalizados** na Supabase conflita com a persistência canônica atual de cópias de trabalho, aprovações, trilha de versões, handoffs e acesso multi-marca. É possível desenhar um modo local que preserve esses fatos em um banco local e sincronize marcos aprovados, mas ele precisa resolver perda do PC, duas pessoas editando, reconciliação cross-brand e tokens/segredos. `localStorage`/IndexedDB existentes são recuperação/apresentação, não autoridade.

O projeto já possui Local Worker para processamento pesado; ele não é banco local. A stack local oficial da Supabase requer CLI e runtime de contêiner e não é indicada para produção ([desenvolvimento local](https://supabase.com/docs/guides/local-development), [limite da stack de desenvolvimento](https://supabase.com/docs/guides/local-development/cli-workflows)). O self-host oficial exige operação própria ([guia](https://supabase.com/docs/guides/self-hosting)); Next.js 16 aceita servidor Node próprio ([guia](https://nextjs.org/docs/app/guides/self-hosting)). Nenhuma instalação foi executada nesta auditoria.

**Recomendação:** concluir a otimização de leituras e medir um ciclo novo antes de decidir uma migração. Em paralelo, preparar ambiente Supabase local para desenvolvimento e uma SDD de hidratação enxuta. Considerar instalador/offline depois que a necessidade de operação desconectada e equipe simultânea estiver definida; ele não é uma correção simples de egress.
