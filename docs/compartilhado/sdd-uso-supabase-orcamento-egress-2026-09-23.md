# SDD — Uso da Supabase e orçamento de egress — 2026-09-23

## Identificação

- **Módulo proprietário:** compartilhado (plataforma). A causa atravessa módulos; cada correção é registrada também no `estado-atual.md` do módulo dono do arquivo alterado.
- **Data:** 2026-09-23.
- **Responsável humano pela aprovação:** dono do produto.
- **Ambiente:** projeto Supabase remoto `minerador-key`, plano Free, consumido por `next dev` local e pelo deploy em `minerador-key.vercel.app`.
- **Estado desta SDD:** regras de uso **vigentes a partir desta data**; correções localizadas **implementadas e confirmadas por teste**, validação manual pendente; propostas estruturais **aguardando autorização**.

Precedência: esta SDD fica abaixo de invariantes e ADRs e acima de spec e código, conforme `AGENTS.md`. Ela **não autoriza** migration, SQL remoto nem mudança estrutural: cada proposta da seção 6 tem decisão própria.

---

## 1. Problema, medido

| Medida | Valor | Fonte |
| --- | --- | --- |
| Egress do ciclo 26/08–26/09 | **5,758 GB / 5 GB (115%)** | painel de uso |
| Carência | até **20/10/2026**, depois fair use | painel de uso |
| Participação do PostgREST | **93,8% a 97,4%** nos dias amostrados | gráfico de cobrança |
| Banco, Storage, MAU, Realtime | 20%, <1%, <1%, 0 mensagens | painel de uso |
| 19/09 | ~644 MB (625 MB de PostgREST) | gráfico |
| 20/09, 21/09, 22/09 | ~35 MB, ~99 MB, ~14 MB | gráfico |

**O que isso significa.** Egress é o que **sai** da Supabase — leitura. O app roda em `next dev` na máquina do desenvolvedor contra o projeto **remoto**, e o gráfico só sobe em dia de trabalho. Portanto:

> **egress ≈ atividade de desenvolvimento × bytes por leitura.**

O que já saiu não volta: o ciclo atual está perdido. O que importa é o próximo, de 26/09 a 26/10, que precisa ficar abaixo de 5 GB — e em especial até 20/10.

**Orçamento.** 5 GB em ~31 dias dão **161 MB/dia**. A meta interna é **100 MB/dia**, para absorver dias de homologação intensa.

---

## 2. Como a auditoria foi feita

Duas rodadas multiagente, somente leitura. Nenhum arquivo foi alterado nelas e o banco só recebeu consultas agregadas de tamanho, porque ler payload para medir também gasta a cota.

1. **Mapeamento em oito frentes** — mesa editorial, Radar ao vivo, Minerador, Arquiteto, Redator/Planejador/MCP, autenticação por requisição, atividade de fundo, e viabilidade de Supabase local. Cada frente registrou gatilho, frequência, consulta, bytes medidos e evidência arquivo:linha.
2. **Verificação adversarial por duas lentes** para todo achado médio ou maior: uma tenta derrubar gatilho, frequência e bytes com medição independente; a outra tenta quebrar a correção proposta procurando consumidores do dado removido.
3. **Crítico de completude**, que procurou portas de entrada não cobertas e abriu frentes novas para as de alto impacto.

Resultado: **74 agentes na primeira rodada**, 35 achados de peso, 2 refutados.

---

## 3. Regras de uso da Supabase — vigentes

Estas regras valem para **todo código novo e toda mudança** em leitura ou escrita na Supabase. Cada uma vem de um defeito medido nesta auditoria ou na de 21/09.

### 3.1 Orçamento e medição

**R1. Toda leitura em caminho quente declara custo por gatilho.** Caminho quente é montagem de página, carga fria de provider, poll, revalidação por foco ou visibilidade, evento Realtime e autosave. A revisão pergunta: *quantos bytes, quantas vezes por hora de trabalho?* Uma leitura de 50 kB a cada 3 s pesa mais que uma de 5 MB por semana.

**R2. Tamanho de fio se mede com `length(coluna::text)`.** Nunca com `pg_column_size`, que mede disco **comprimido** e subestima o tráfego — esse erro levou a estimar 2,5 MB onde havia 10 MB, duas vezes na mesma sessão.

**R3. Consulta de auditoria só devolve agregados.** `sum(length(...))`, `count(*)`, `max(...)`. Nunca a coluna de payload: ela custa a mesma cota e pode expor dado de cliente.

### 3.2 Isolamento

**R4. Toda consulta filtra por `brand_id` na própria consulta, mesmo com service role.** O cliente service role **ignora RLS**; o filtro da consulta é a única proteção. Defeito encontrado: `/api/inteligencia` usava `.or("lista_id.is.null, …")` sem marca e devolvia **267 keywords de 3 marcas quando só 39 eram da marca pedida** — violação de `AGENTS.md` §5, não só de egress.

### 3.3 Forma da leitura

**R5. Proibido `select("*")` em tabela com coluna JSON de payload, em caminho quente.** Selecione as colunas que o chamador usa.

**R6. Escrita devolve só o que o chamador lê.** `update(...).select("id,lock_version,…")`, nunca a linha inteira. Defeito encontrado: o autosave do Redator devolvia o documento inteiro, **~4,4 MB a cada pausa de 1,2 s na digitação**.

**R7. O banco filtra o que o chamador descartaria.** Tipo de artefato, marca, versão: se o código faz `continue` depois da consulta, o filtro pertence à consulta. Defeitos encontrados: `ArtifactRepository.list` (0,2 a 1,3 MB descartados por carga) e `listArquitetoArtifacts` (~1 MB).

**R8. Listagem não é detalhe.** A listagem lê projeção ou view; o payload do item é hidratado **sob demanda**, para o item aberto. Referências: `minerador_keywords_listagem`, `editorial_workflow_items_listagem`.

### 3.4 Hidratação e escrita

**R9. Reidratação seletiva.** Leia só as versões e corridas que a resposta usa. `WorkflowRepository.find` e `findByArticle` reidratam **todas** as corridas e ficam reservados a quem precisa de todas. Defeitos encontrados: a montagem do Radar lia **~10,8 MB e a própria rota descartava ~7,4 MB** na poda; a área Vídeos lia **~8 MB para usar ~3 kB**.

**R10. Escrita lê verbatim.** Caminhos de escrita leem a linha como está gravada (`findByArticleRaw`), nunca uma leitura podada ou reidratada. Guarda: `tests/radar-live-ux-1-payload.test.mts`. Ler podado e regravar apaga conteúdo no banco; ler reidratado e regravar desfaz a separação das corridas.

### 3.5 Gatilhos recorrentes

**R11. Custo por gatilho recorrente em kB, não em MB.** Poll, visibilidade, foco e evento Realtime precisam ser baratos por disparo, coalescidos por chave e pausados com a aba oculta. Defeito encontrado: voltar à aba (alt-tab) relê **~8,5 MB** do Radar sem coalescer.

**R12. Não ligar Realtime nem polling antes de baratear o disparo.** A publicação `supabase_realtime` está **vazia**, e o sinal do Radar marca "ao vivo" por falso positivo — o que, por acaso, mantém o polling desligado. Consertar só o sinal ligaria o poll de 3 a 10 s com o custo atual por disparo.

**R13. Efeito de montagem é idempotente.** Em `next dev` o Strict Mode monta os efeitos duas vezes: em desenvolvimento, toda leitura de montagem não deduplicada custa **o dobro**.

### 3.6 Ambiente

**R14. Desenvolvimento e homologação intensos preferem banco local** quando existir (seção 6, E5). Contra o remoto, contam como egress.

**R15. Script com service role que lê payload completo roda só com autorização explícita e orçamento declarado.** `audit:*`, `reset:*`, `minerador:*` e `radar:*` leem `.env.local`, que aponta para o remoto.

### 3.7 Prova

**R16. Toda correção de egress tem teste que fixa a forma da leitura** — o filtro por marca, as colunas estreitadas, o conjunto de versões reidratadas. Teste estrutural remove comentários antes de casar, senão casa com a própria explicação.

---

## 4. Achados confirmados

Bytes medidos por gatilho, confirmados pela lente independente. "Seguro" é o veredicto da lente que tentou quebrar a correção.

| Achado | Gatilho | Bytes | Correção | Classe | Seguro |
| --- | --- | ---: | --- | --- | --- |
| `/api/inteligencia` sem filtro de marca | carga fria da mesa, qualquer página | 1,84 MB → 0,43 MB | `.eq("brand_id")` | localizada | sim |
| Radar: readback de montagem reidrata tudo | montagem de `/radar`, cada coleta SERP | ~10,8 MB | reidratação seletiva | localizada | sim* |
| Radar: área Vídeos | montagem, troca de artigo, volta à aba | ~8 MB | leitura leve | localizada | sim |
| Radar: amostra da pesquisa | abrir o disclosure | ~8 MB | reidratar a versão servida | localizada | sim |
| Radar: extração da concorrência | cada **lote** de 5 páginas, em laço | ~8 MB por lote | leitura sem corridas | localizada | sim |
| Radar: verificação de fontes | cada lote, em laço | ~8,8 MB por lote | leitura sem corridas | localizada | sim |
| Radar: trava da gravação da análise | cada gravação | ~8 MB | só a versão corrente | localizada | sim |
| Radar: volta à aba | `visibilitychange` | ~8,5 MB | coalescer e baratear | localizada | **não como proposto** |
| Radar: export e envios | ação | ~24 MB | reidratação seletiva nas ações | localizada | **não como proposto** |
| Redator: autosave | pausa de 1,2 s na digitação | ~4,4 MB | colunas estreitas no retorno | localizada | sim |
| MCP: `resolveTarget` | toda ferramenta com documento | ~4,4 MB | ler só `id,marca_id` | localizada | sim |
| MCP: `save_writer_draft` | chamada da IA externa | ~13 MB | idem, e readback estreito | localizada | parcial |
| Arquiteto: artefatos de todos os tipos | montagem e 24 recargas | ~1 MB | filtrar tipos na consulta | localizada | sim |
| Mesa: `ContentDocument` completo | carga fria | ~4,4 MB | metadados na listagem | **estrutural** | — |
| Provider no layout raiz | carga fria em **qualquer** página | ~8 MB | montar só onde é usado | **estrutural** | — |
| Publicação Realtime vazia | montagem do Radar | 0 direto | ver R12 | **estrutural** | não agora |

\* uma lente marcou seguro sem ressalva; a outra exigiu dois ajustes — incluir a última versão **na ordem do array** e a versão pedida no conjunto reidratado —, já incorporados na implementação.

**Refutados.** O polling de fallback a cada 3 a 10 s **não roda em regime**: o sinal vira "ao vivo" em 1 a 2 s por falso positivo do `realtime-js` e o intervalo é cancelado antes do primeiro disparo. A dupla leitura do catálogo do site também não se confirmou como descrita.

---

## 5. Correções localizadas — implementadas (ver seção 8)

Classificadas como localizadas por `AGENTS.md` §4: aditivas, retrocompatíveis, sem schema, persistência, workflow ou contrato público alterado, com consumidores preservados e teste de regressão. Cada grupo mexe só nos próprios arquivos e passa por revisor adversarial.

| Grupo | Arquivos | Economia esperada |
| --- | --- | --- |
| Isolamento de marca | `app/api/inteligencia/route.ts` | 1,4 MB por carga fria, e fim do vazamento entre marcas |
| Artefatos do Arquiteto | `lib/server/pipeline-repositories.ts`, `lib/server/arquiteto-persistence.ts` | ~1 MB por carga do Arquiteto |
| MCP do Redator | `app/api/mcp/redator/route.ts` | ~4,4 MB por chamada de ferramenta de IA |
| Leituras do Radar e autosave | `lib/server/editorial-repositories.ts` e rotas `radar-analysis`, `radar-video-matching`, `radar-research-part` | ~7 MB por montagem do Radar, ~8 MB por leitura de Vídeos, ~4,4 MB por autosave |
| Ações do Radar *(depois do grupo anterior, que cria os métodos novos no mesmo arquivo)* | rotas `radar-analysis` (POST save), `radar-analysis/extract`, `radar-analysis/verify-sources` | ~8 MB **por lote** de extração e de verificação; ~8 MB por gravação |

O grupo de ações do Radar pesa mais do que parece: "Analisar concorrência" roda em **laço de lotes de 5 páginas**, e cada lote relê ~8 MB. Uma análise de 20 páginas custa hoje ~32 MB só nessa releitura. Duas salvaguardas vêm do revisor: a leitura sem corridas ganha método público próprio, documentado como "versões com os 4 campos vazios"; e a trava de gravação ganha um método que devolve **só a versão corrente**, nunca uma linha meio hidratada que alguém poderia regravar por engano.

O resultado de cada grupo — testes, revisão e suítes — é registrado na seção 8 ao concluir.

**Localizada, mas adiada:** `keyword-import-core` do Minerador (668 kB por importação). A suíte desse núcleo **já está vermelha na linha de base**, então não haveria rede de proteção. Primeiro corrigir os testes, depois a leitura.

---

## 6. Propostas estruturais — aguardam autorização

Cada uma muda persistência, hidratação global, workflow ou infraestrutura. Nenhuma será implementada sem decisão explícita.

### E1. `ContentDocument` fora da carga da mesa

- **Contrato atual:** `ContentDocumentRepository.list` devolve o payload completo de todos os documentos da marca a cada carga fria da mesa — ~4,5 MB hoje, com dois documentos, e crescendo com cada um novo.
- **Onde está o peso:** **99,8% é `importedContext.dossier.bundle`** (4,49 MB de 4,50 MB). O texto do documento (`blocks`) tem 1,2 kB. O bundle só é lido pelo Redator, no documento aberto (`lib/redator/radar-foundations.ts:129`).
- **Histórico:** o `pg_stat_statements` registra **2 298 chamadas** dessa projeção desde 10/07. Foi uma das fontes dominantes do ciclo.
- **Proposta:** a listagem devolve o documento **sem o bundle** (ou só metadados); o bundle é carregado ao abrir o documento no Redator.
- **Risco crítico — perda de dado:** o autosave do Redator **reenvia o documento inteiro** no PATCH. Se o Redator editasse uma cópia vinda da listagem sem o bundle, o salvamento **apagaria o bundle no banco**. Por isso a proposta exige uma de duas garantias, escolhida na SDD de implementação: o servidor funde `importedContext` ao salvar, ou o Redator carrega o detalhe completo antes de permitir edição. Sem uma delas, esta proposta não pode ser implementada.
- **Consumidores:** Redator (`professional-writer`, `writer-page`, `writer-radar-foundations-panel`, `writer-derived-environment`), Publicações (lista e exportação), Planejador, recuperação local (`LocalWorkflowRecoverySchema.documents`), MCP.
- **Riscos adicionais:** F5 no Redator; salvamento com `lock_version` desatualizada; `ContentDocumentSchema` exige `importedContext` e faz parse na listagem.
- **Compatibilidade:** método novo de detalhe; a listagem estreita depois de migrar os consumidores.
- **Rollback:** reverter a projeção da listagem; não há mudança de dado.
- **Testes:** paridade do documento aberto; F5; salvamento confirmado **preservando o bundle**; isolamento por marca.

### E2. Provider editorial só onde é usado

- **Contrato atual:** `EditorialPipelineProvider` está no layout **raiz** (`components/providers.tsx:20`). Toda carga fria, em qualquer página — inclusive as que não usam a mesa —, dispara ~8 MB: `/api/inteligencia`, `/api/editorial/workspace` com documentos, fluxo e artefatos.
- **Proposta:** montar o provider nos layouts das rotas editoriais, ou buscar sob demanda na primeira leitura do contexto.
- **Riscos:** componente fora das rotas editoriais que lê o contexto; estado perdido entre navegações.
- **Rollback:** voltar o provider ao layout raiz.

### E3. Realtime e polling do Radar

- **Contrato atual:** publicação `supabase_realtime` com **zero tabelas**; sinal "ao vivo" por falso positivo; polling efetivamente desligado.
- **Opções:** (a) incluir as tabelas na publicação — DDL remota, revisão de RLS, e cada evento envia a linha nova inteira; (b) abandonar Realtime nessas áreas e fazer polling **apenas enquanto houver trabalho pendente**.
- **Pré-condição (R12):** baratear o disparo antes. Até lá, manter como está.

### E4. Export, envios e volta à aba no Radar

Três caminhos de ação que eu tinha agrupado aqui — gravação da análise, extração e verificação de fontes — **saíram desta proposta**: a verificação adversarial os confirmou como **localizados e seguros** e eles passaram à seção 5. A razão é específica de cada um: a extração não grava nada e seu portão lê campos que nem ficam nas corridas; a trava de gravação só lê a versão corrente.

Ficam aqui os dois cuja correção proposta foi **recusada** pelo revisor:

- **Export e envios** (~24 MB por ação, reidratação tripla): cada envio relê o item várias vezes; a correção simples esbarra em consumidores do pacote exportado.
- **Volta à aba** (~8,5 MB por `visibilitychange`, sem coalescer): mudar a frequência exige alterar a assinatura do hook e preservar a cobertura anterior, senão a tela passa a dizer "nunca casou".

Os dois precisam de desenho próprio, que parta de baratear o custo por disparo (R11) antes de mexer na frequência.

### E5. Supabase local para desenvolvimento

É o maior efeito isolado possível: com as três variáveis apontando para o local, o egress de desenvolvimento **cai a quase zero**, inclusive as ~494 chamadas diárias a `/auth/v1/user`.

**Estado da máquina, verificado:** sem Docker, sem WSL2. CLI Supabase 2.111 disponível por `npx`. 15,7 GB de RAM, suficiente para a pilha com serviços opcionais desligados.

**O replay das migrations não reproduz o banco — e nem termina:**
- falha no primeiro arquivo: `0001_protect_publicado.sql` altera `keywords_kgr`, que nenhuma migration cria;
- `marcas`, `perfis` e `briefings_artigos` existem no remoto e **nenhuma migration as cria**;
- `0027` recria `editorial_workflow_items` sem `IF NOT EXISTS`, depois de `0002` já tê-la criado;
- 11 tabelas e 11 funções criadas por migrations não existem mais no remoto, removidas fora da cadeia pelo Master Refresh;
- só 21 das 93 migrations constam no histórico remoto.

**Caminho recomendado:** baseline por **dump só de schema** mais seed mínimo, e troca por `.env.development.local`.

| Quem | Passo |
| --- | --- |
| Usuário | Instalar WSL2 (`wsl --install`, admin e reinício) e Docker Desktop |
| Usuário | `npx supabase db dump --linked --schema public -f supabase/baseline/<data>_schema_public.sql` — **só schema**; revisar antes de versionar. Nunca dump de dados. |
| Usuário | Autorizar o arranjo da cadeia local — pasta própria ou reorganização das migrations (esta é a parte estrutural) |
| Usuário | `npx supabase start`, copiar URL e chaves para um `.env.development.local` novo |
| Agente | Seed mínimo: marca, membership, papéis e catálogo de permissões |
| Usuário | Smoke manual local: cadastro, login, Minerador, Arquiteto, Radar, Redator |

**Riscos:**
- os scripts com `--env-file-if-exists=.env.local` **ignoram** `.env.development.local` e continuariam escrevendo no **remoto** com service role — precisam de tratamento antes de qualquer reset local;
- divergência de schema entre local e remoto a cada migration nova;
- OAuth do MCP desligado no `config.toml` local.

### E6. Deploy na Vercel no mesmo projeto

`minerador-key.vercel.app` aponta para o **mesmo** projeto Supabase. Todo acesso a ele — inclusive robôs — sai da mesma cota. Decidir: projeto separado para produção, proteção de acesso, ou pausa enquanto não houver uso real.

### E7. SERP nas 4 lentes — avaliação de 2026-09-23

**Pergunta:** aplicar a matriz de 4 lentes (desktop-windows, desktop-macos, mobile-android, mobile-ios) no Minerador ajuda ou atrapalha os limites do Free?

**Objeto avaliado:** o cache de SERP implementado hoje por outra sessão (`docs/compartilhado/sdd-cache-serp-temporario-2026-09-23.md`; `lib/editorial/serp-cache.ts`, `lib/server/serp-cache*.ts`), **não commitado e sem validação manual**. A proposta anterior, com registro versionado e referência dentro de `evidencia_serp`, foi substituída por ele. Ela também não se sustentaria: `applySerpEvidenceRecord` (`lib/minerador/serp-evidence-record.ts:120-126`) troca o registro inteiro a cada versão da Qualificação e apagaria a referência em silêncio. No cache a chave é determinística, então a referência deixa de ser necessária.

**Estado do cache lido às 06:23:** o Minerador coleta só a lente canônica, `desktop-windows` (`allintitle/route.ts:195`). A `keyword-serp` do Arquiteto consulta o cache antes do provider e paga só as lentes que faltam. A formação de artigo lê o corpo do cache. O Radar não está ligado. No remoto há 0 linhas `serp_cache_entry` (MEDIDO).

**Resultado — três limites, separados:**

| Limite | Efeito das lentes | Número |
| --- | --- | --- |
| Egress (5 GB) | baixo, **se** as lentes ficarem no cache e fora da Qualificação | Guardar as 4 lentes como a Qualificação é guardada hoje, em versão por coleta, com a montagem lendo todas as versões: **~130 MB/dia** (ESTIMADO), acima da meta sozinho. No cache: ~45–55 MB/dia num dia de SERP pesado com a montagem atual, **~15 MB/dia** com as correções 2 e 3 abaixo (ESTIMADO) |
| Tamanho do banco (500 MB; 81 MB usados, MEDIDO) | **é aqui que as lentes pesam** | Cada entrada grava o corpo podado (33,9 KB em depth 20, 26,5 KB em depth 10) e a observação (0,9 KB) (MEDIDO offline em fixture real). 4 lentes em toda keyword: ~23–28 MB de texto por lista de 200, ~15–18 listas até o teto. Só a lente canônica: ~7 MB por lista. No disco há compressão, ainda não medida |
| Dinheiro (DataForSEO) | cresce com lentes × keywords | 4 lentes em tudo: 800 chamadas `advanced` por lista (~US$ 2,80). 1 lente + 3 nas aprovadas: ~490 (~US$ 1,71, com a aprovação de 48% da Care Glow) |

**Quando coletar as lentes.** O Minerador não decide nada que dependa de lente: intenção e funil vêm de uma SERP (`lib/minerador/serp-semantic-evidence.ts`), o KGR vem do allintitle e a aprovação é humana. Em 166 recoletas, intenção e funil não mudaram nenhuma vez (MEDIDO). As lentes pesam no agrupamento: `measureKeywordAffinity` exige ao menos 2 lentes em concordância (`lib/arquiteto/serp-competitive-evidence.ts:143-147`), então com 1 lente o agrupamento por SERP nunca passa. O Arquiteto só recebe aprovadas (`lib/server/arquiteto-workspace.ts:158-161`). Funil medido: 267 vivas, 35 aprovadas, 8 em artigo; 28% das keywords qualificadas foram apagadas depois.

**Decisão do usuário (2026-09-23), que substitui a recomendação abaixo:** a SERP vai para o cache no banco desde a primeira vez que é acionada (Descoberta ou Processador) e **sempre nas 4 lentes**; a intenção e o funil do Minerador passam a usar as 4 lentes; e as 4 lentes valem para todo ponto de SERP orgânica da plataforma. Na Descoberta, a SERP só roda com o filtro Resultado ou KD ativado. Implementação em ondas, registrada na SDD do cache de SERP.

**Recomendação original:** as 4 lentes em **toda keyword aprovada, antes de qualquer agrupamento**, por ação explícita. Coletar na aprovação, no Minerador, ou na entrada do Arquiteto custa o mesmo com o cache. As 4 lentes em toda keyword minerada ficam como ação por keyword, para quem quiser avaliar antes de aprovar, e não em massa. O sinal de divergência entre lentes ainda não foi validado: as duas medições reais, 0,061 e 0,174, ficaram abaixo do limiar de 0,5. Hoje o valor das lentes está na concordância e nos formatos por aparelho.

**IAs:** só o Google AI Overview é medido. O cache separa os domínios citados pelo AIO, mas `paraObservacao` (`app/api/arquiteto/keyword-serp/route.ts:82-90`) os descarta ao entregar ao Arquiteto, e `competitorDomains` mistura citações com resultados orgânicos. Medir ChatGPT, Perplexity ou Gemini seria capability nova, com SDD própria.

**Correções que acompanham, por ordem de peso:**

1. **Corpo só na lente canônica.** As outras 3 lentes gravam só a observação. Com 4 lentes em tudo, o banco cai de ~28 para ~8 MB por lista. Nenhum leitor atual usa o corpo das lentes não canônicas. Exige um modo de escrita sem corpo, que hoje não existe. Pertence ao cache.
2. **Acerto de cache sem ler corpo nem versionar.** No acerto, o Minerador lê o corpo (~34 KB, `allintitle/route.ts:207`) e grava uma Qualificação nova (`serpSource: "REUSED"`; `keyword-semantic-qualification.ts:104` não compara hash). Isso contraria o `AGENTS.md` §9. Ler `meta` primeiro e não versionar quando a coleta for a mesma.
3. **Montagem do Minerador só com a versão vigente** (`modules/minerador/minerador-workspace.tsx:507-527`; `lib/server/keyword-semantic-qualification-store.ts:47-64`). Lê todas as versões de todas as listas da marca: é o maior egress recorrente de SERP hoje. Localizada no Minerador.
4. **Invalidação humana vale como `refresh`.** Dentro dos 30 dias, o cache devolveria a mesma SERP e `applySerpEvidenceRecord` apagaria a invalidação. É latente: `invalidateSerpEvidence` ainda não tem chamador.
5. **Citações do AIO até o Arquiteto,** como campo aditivo em `SerpCompetitiveObservation`.
6. **Datas das lentes.** Se a lente canônica tiver mais de N dias quando as outras 3 forem coletadas, coletar as 4 juntas, para não misturar mudança no tempo com diferença entre aparelhos.
7. **Idioma e local.** O Minerador usa os códigos do alvo e o Arquiteto os do ambiente. O reuso só ocorre quando coincidem.

**Regras propostas** (entram na seção 3 quando esta proposta for aprovada):

- **R17. Tamanho do banco também é orçamento.** Toda gravação recorrente declara bytes por unidade de trabalho (lista, artigo) e quantas unidades cabem até 500 MB.
- **R18. Acerto de cache lê o mínimo.** Primeiro `meta`, o corpo só quando for usado, e evidência reaproveitada não gera versão.
- **R19. Corpo bruto ou podado só onde houver leitor.**

**Classificação:** estrutural (`AGENTS.md` §4). Os códigos do cache pertencem à sessão que o implementou e estão sendo editados. As correções 1, 2, 4, 5 e 6 exigem adendo à SDD do cache e autorização. A 3 é localizada no Minerador e pode vir antes. Hipóteses não medidas: 20 montagens por dia, 1 lista de 200 por dia; o Free guarda logs só de 1 dia.

### E8. Cache do DNA das keywords — Vercel, servidor ou navegador — avaliação de 2026-09-23

**Pergunta:** o DNA das keywords pode ficar em cache, na Vercel ou no PC, com o banco consultado só no que mudou, já que cada marca trabalha num único computador?

**Achado que vem antes do cache.** Quem mais baixa o DNA não é a tela do Minerador. É a carga do Arquiteto: `listBrandKeywords` (`lib/server/arquiteto-workspace.ts:79-82`) lê `select("*")` de **todas** as keywords vivas da marca, com o `analise_semantica` inteiro, e devolve tudo ao navegador como `availableKeywords`. `importEligibility` usa só `id`, `brand_id`, `status` e `content_hash`. O envio ao Arquiteto repete a leitura duas vezes, na preparação e na confirmação (`:147`, `createMineradorArquitetoHandoff`).

MEDIDO em `pg_stat_statements` desde 2026-07-10: **1.910 chamadas** com essa forma (`service_role`, `brand_id` e `deleted_at is null`, sem outro filtro; é a única no servidor). Hoje cada chamada pesa **464 a 747 kB** por marca (MEDIDO, `length(k::text)`). ESTIMADO: 0,9 a 1,4 GB em 75 dias, ~12 a 19 MB/dia em média. AdalbaPro e Somatec não têm nenhuma keyword aprovada, e o Arquiteto só trabalha com aprovadas: ~745 kB por carga sem uso.

Outras formas: o PATCH do workspace (`app/api/arquiteto/workspace/route.ts:126`) lê `id,status,kgr_score,analise_semantica` da marca inteira para usar o `status` de poucos itens, 104 chamadas; `/api/inteligencia`, ~1.650 chamadas.

A correção é **localizada**, sem cache e sem schema: filtrar no banco pelo que o Arquiteto usa, colunas estreitas para a elegibilidade e linha completa só para as recebidas e as candidatas. Antes, é preciso mapear o que a tela do Arquiteto lê de `availableKeywords`.

**Opções avaliadas:**

| Opção | Veredito | Por quê |
| --- | --- | --- |
| Cache de servidor do Next 16 (`use cache`) ou da Vercel | rejeitar | O Minerador lê e grava o DNA do navegador direto na Supabase (`modules/minerador/minerador-workspace.tsx:363, 507-527, 1034-1058`), sem passar pelo servidor. Em `next dev`, o cache fica na memória e cai a cada HMR ou reinício (`use-cache.md:81, :274`; `cacheHandlers.md:24`). Na Vercel serverless, não persiste entre requisições (`use-cache.md:206`). A invalidação só vale na instância que recebeu a gravação (`how-revalidation-works.md:74`). Exige ligar `cacheComponents`, e 29 arquivos que exportam `dynamic` ou `revalidate` quebram (`migrating-to-cache-components.md:75`). O `Cache-Control: private, no-store` de `next.config.ts:7` é o correto para dado de marca e fica |
| Confiar no local sem conferir ("a gente sabe o que mudou") | rejeitar | Há outros escritores: scripts com service role regravaram 104 e 29 keywords (`docs/03-minerador/estado-atual.md:2972, :3804`); allintitle, Google Ads e a importação do site gravam `analise_semantica` no servidor; gatilhos reescrevem `analise_semantica` quando ele muda (`20260921030000:88`), então o gravado não é o enviado; o MCP do ChatGPT grava pela Vercel; a purga apaga keywords em definitivo. `localhost`, `s-<slot>.localhost` e a Vercel são origens com armazenamento próprio, e duas abas não se sincronizam. `minerador_keywords` **não tem marcador de mudança** (sem `updated_at`, versão ou hash; MEDIDO). Fere o `AGENTS.md` §10 |
| Local-first completo | rejeitar agora | Nova arquitetura (auditoria do Radar, `docs/05-radar/auditoria-egress-supabase-2026-09-23.md:61-63`). Para desenvolvimento, o caminho é a E5 |
| **Versões imutáveis no navegador** (Qualificação, ArticleDNA, SiloDNA, SiloPage), por `version_id` | **adotar** | `editorial_artifact_versions` é append-only por gatilho ativo e sem exceção (`0027_editorial_artifacts_workflow_serp.sql:90-99`; MEDIDO `tgenabled='O'`; índice único por versão). Uma versão guardada nunca fica errada, só deixa de ser a vigente, e o ponteiro para a vigente vem do servidor a cada montagem. Sem migration. Abertura aquecida: metadados de 2 a 13 kB (MEDIDO) no lugar do payload |
| **Keywords vivas no navegador, conferidas** | **adotar depois, com SDD** | Na abertura: mostrar o cache como "conferindo", pedir ao banco a impressão digital (ids vivos + versão por linha: 2,5 a 14 kB contra 357 a 601 kB da listagem, MEDIDO), baixar só o que mudou e descartar os ids ausentes. Exige coluna `row_version` com gatilho em `minerador_keywords` (migration do usuário), gravação bloqueada até a conferência terminar, gravação condicional à versão lida, e readback em toda gravação do Minerador. Hoje `:2176-2195` e `:2373-2380` atualizam a tela com o que foi enviado |

**Ganho, contra a meta de 100 MB/dia:**

- **Cache das versões imutáveis mais o das keywords vivas conferidas:** ~6 a 10 MB/dia, com 11 a 12 aberturas do Minerador por dia. A frequência vem de 26 chamadas do app na view desde 21/09; as chamadas de agentes foram excluídas (MEDIDO).
- **Correção do Arquiteto:** ~12 a 19 MB/dia em média, sem cache e sem migration.
- **E1 e E2:** alguns MB por carga, e não por dia.

"Um PC por marca" ajuda: em 30 dias houve 1 autor humano por marca (MEDIDO). Mas a premissa não dispensa a conferência, porque o DNA também muda por caminhos que não são o clique.

**Ordem:**
1. Correção do Arquiteto e correção 3 do E7.
2. E2 e E1.
3. Cache das versões imutáveis.
4. SDD e migration para o cache das keywords vivas.

**Regras propostas** (entram na seção 3 quando esta proposta for aprovada):

- **R20. Cache local é de leitura e sempre conferido.** A tela confere contra uma impressão digital do banco (ids vivos + marcador) antes de dar o dado por atual. Gravação espera a conferência e é condicional à versão lida. Se a conferência falhar, a tela cai para a leitura remota.
- **R21. O cache recebe o readback do banco, nunca o que foi enviado.**
- **R22. Chave e valor levam `actorUserId` e `brandId`, e a leitura confere o `brandId`.** Cache vazio ou despejado nunca vira "marca vazia". A poda é limpeza e exige política autorizada (`AGENTS.md` §10).
- **R23. Imutável se guarda por `version_id`, sem invalidação.** Mutável só entra em cache se a tabela tiver marcador confiável.
- **R24. Sem cache de servidor do Next para dado de marca lido com service role, salvo SDD própria.**

---

## 7. Critério de aceite

- Painel de uso do ciclo 26/09–26/10 com **dias de trabalho abaixo de 100 MB**.
- Por porta de entrada, medido com R2 e R3:

| Porta | Antes | Meta |
| --- | ---: | ---: |
| carga fria da mesa (qualquer página) | ~8 MB | < 1 MB após E1 e E2 |
| montagem do Radar | ~10,8 MB | ~3,5 MB após o grupo do Radar |
| leitura da área Vídeos | ~8 MB | kB |
| autosave do Redator | ~4,4 MB | < 1 kB |

- Nenhuma regressão de isolamento por marca, versionamento, aprovação ou F5.

---

## 8. Execução — 2026-09-23

**Confirmado por teste; ainda não verificado manualmente.** Nenhuma migration,
SQL remoto, escrita na Supabase, commit ou deploy. Como o app roda em
`next dev` local, as correções valem no próximo recarregamento de página.

Cada grupo foi implementado por um agente que só podia tocar os próprios
arquivos, e revisado por outro que tentou quebrá-lo. **Os cinco foram
aprovados na primeira revisão**, sem must-fix.

| Grupo | Resultado | Registro |
| --- | --- | --- |
| Isolamento de marca | `.eq("brand_id")` em `/api/inteligencia` | [Minerador](../03-minerador/estado-atual.md) |
| Artefatos do Arquiteto | parâmetro opcional `artifactTypes`, 4 tipos | [Arquiteto](../04-arquiteto/estado-atual.md) |
| MCP do Redator | `documentOwner` no lugar do payload | [Redator](../07-redator/estado-atual.md) |
| Leituras do Radar e autosave | reidratação seletiva, leitura leve, `save` estreito | [Radar](../05-radar/estado-atual.md), [Redator](../07-redator/estado-atual.md) |
| Ações do Radar | extração, verificação de fontes e trava de gravação | [Radar](../05-radar/estado-atual.md) |

### Suítes, contra a linha de base

| Suíte | Testes | Falhas | Base |
| --- | ---: | ---: | ---: |
| Minerador | 676 | 28 | 28 |
| Arquiteto | 2131 | 2 | 2 |
| Radar | 2313 | 0 | 0 |
| Editorial | 67 | 4 | 4 |
| Redator | 296 | 0 | — |
| Redator MCP | 51 | 0 | — |
| Marca | 106 | 0 | 0 |

TypeScript sem erro, ESLint sem erro nos arquivos alterados, `git diff --check`
limpo. Os testes novos estão registrados nos scripts `test:editorial`,
`test:arquiteto` e `test:redator:mcp`; os do Radar entram pelo glob.

### Duas correções que vieram da revisão, não do plano

1. **Texto da requisição chegando cru a um filtro.** O `versionId` pedido ia
   direto para `.in("version_id", …)`, e o `postgrest-js` não escapa aspas
   embutidas: `a"b(` derrubava a rota com 500. O repositório agora só aceita
   ids que a própria linha tem — sem mudar resultado, porque um id ausente
   nunca casaria com corrida.
2. **A verificação adversarial errou, e a implementação pegou.** As duas
   lentes concluíram que a verificação de fontes não lia campos de corrida.
   Lê: `payload.extractions`. A leitura sem corridas teria feito **toda**
   fonte sair 422. O implementador desviou da instrução, provou com teste de
   sensibilidade e reidratou só a versão pedida.

A segunda é a lição de processo desta rodada: **leitura de código confirma
hipótese, mas só teste que exercita a rota prova a correção**. Toda correção
desta SDD tem teste com o caminho antigo como oráculo.

### Mudança visível na interface

A métrica **Keywords** da página da Marca da Care Glow cai de **267 para 39**.
As 228 a mais eram de outras duas marcas. Não é regressão.

### O que a medição precisa confirmar

Os números acima são de payload medido com `length(::text)`, não de bytes
faturados. A prova é o painel: **dias de trabalho abaixo de 100 MB** no ciclo
26/09–26/10.

---

### Etapas autorizadas depois — 2026-09-23

O usuário autorizou a correção do Arquiteto (E8), a correção 3 do E7, o cache de versões imutáveis (E8), E2, E1 e a SDD com a migration do cache conferido. Cada grupo teve implementador, dois revisores adversariais e corretor. Nenhuma migration aplicada, nenhuma escrita remota, nenhuma chamada paga. Bytes MEDIDOS por agregado no remoto.

| Grupo | Arquivos | Antes → depois | Testes |
| --- | --- | --- | --- |
| Arquiteto: leitura estreita (E8) | `lib/server/arquiteto-workspace.ts`, `app/api/arquiteto/workspace/route.ts`, `lib/arquiteto/canonical-workspace.ts`, `modules/arquiteto/arquiteto-workspace.tsx` | Montagem: 441 → 328 kB (Care Glow, 29 recebidas), 712 → 29 kB e 738 → 67 kB (marcas sem aprovadas). PATCH: ~430-690 kB → ~1,6 kB para 10 itens. Handoff lê só os ids pedidos | `test:arquiteto:servidor` 18/18 |
| Minerador: Qualificação vigente (correção 3 do E7) | `lib/minerador/keyword-semantic-qualification-current.ts` (novo), `lib/server/keyword-semantic-qualification-store.ts`, `modules/minerador/minerador-workspace.tsx` | 1.030 → 584 kB por rodada nas 3 marcas (−43%), com o recuo para a versão anterior preservado | `tests/minerador-qualificacao-vigente.test.mts` 10/10 |
| Minerador: cache de versões imutáveis (E8) | `lib/minerador/semantic-qualification-version-cache.ts` (novo), loader do Minerador | Com cache quente: 584 → 53,5 kB (−91%); só metadados | `tests/minerador-qualificacao-cache-versoes.test.mts` 20/20 |
| E2: mesa sob demanda | `components/editorial-pipeline-context.tsx` (opção b: o provider fica na raiz e só lê quando o primeiro consumidor pede) | Página sem mesa (Admin, Conta, Agências, Minerador, login): ~6,85 MB → 0 | `test:editorial:dom` 12/12, `tests/editorial-mesa-rotas.test.mts` 33/33 |
| E1: documento sem dossiê na mesa | `lib/editorial/content-document-listing.ts` (novo), `lib/server/editorial-repositories.ts`, `app/api/editorial/documents/route.ts`, `lib/editorial/persistence-contracts.ts`, `components/editorial-pipeline-context.tsx`, `components/editorial/professional-writer.tsx`, `modules/publicacoes/publications-workspace.tsx`, `lib/publicacoes/editorial-library.ts` | Documentos na carga da mesa: 4.497.354 → 9.138 B (−99,8%). Carga fria da mesa: ~6,85 → ~2,36 MB | `tests/editorial-documento-sem-bundle.test.mts` 23/23, `test:redator:dom` 14/14 |
| SDD do cache conferido (O2) | `docs/compartilhado/sdd-cache-local-keywords-conferido-2026-09-23.md`, `supabase/migrations/20260923140000_minerador_keywords_row_version.sql` (**não aplicada**) | impressão digital de 2,6 a 10,6 kB contra 380 a 607 kB da listagem | — |

**Política do cache de versões (E8, R22 e R24):** banco IndexedDB próprio `minerador-qualificacao-versoes`, chave e valor com actor e marca, só versões vigentes. A poda roda ao fim de uma carga bem-sucedida e só no próprio actor e marca; ela é modo `loaded-entities` quando a listagem ou os metadados batem no teto de linhas do PostgREST (1000). Não há limpeza no logout: o dado continua legível pelo DevTools daquele navegador, como já acontece com `minerador-pro-editorial`. O cache confere o `version_id`, não o `content_hash`: uma versão apagada e regravada com o mesmo id seria servida antiga. Isso é aceitável porque a tabela é append-only por gatilho.

**E1 — as duas garantias contra perda do dossiê:**
1. O servidor preserva o dossiê gravado quando o PATCH vem sem ele, lendo a linha verbatim (R10).
2. O Redator só libera edição e autosave depois de carregar o detalhe completo.

A recuperação local só aplica o rascunho sobre o mesmo pacote do Radar.

**E1 — pré-requisito medido pelo revisor:** a listagem projetada usa 29 seletores `payload->…`, e cada um descomprime o jsonb inteiro. São ~0,8 s de CPU por documento v2 grande, contra ~0,08 s da leitura antiga. Com o `statement_timeout` de 8 s, a seção de documentos da mesa cai por volta de **8 a 9 documentos grandes**; hoje são 1 grande e 1 pequeno. **Antes de a marca passar de ~5 documentos v2 com dossiê**, é preciso uma coluna gerada ou uma view da listagem (migration com SDD, aplicada pelo usuário), ou tirar o dossiê do payload (Fase 2 da E9). O teste 22 fixa os 29 seletores para nenhum campo novo passar sem rever essa conta.

**O que ficou pendente dessas etapas:**
- **Arquiteto:** a linha inteira das keywords recebidas (311 kB por montagem na Care Glow, ~96% `analise_semantica`); o `.catch(() => new Map())` que engole erro do store da Qualificação (`lib/server/arquiteto-workspace.ts`); o fetch duplicado de `/api/editorial/workspace` na montagem (`modules/arquiteto/arquiteto-workspace.tsx` ~4543).
- **Marca:** a home da marca (`modules/marca/brand-page.tsx`) ainda lê a mesa inteira para mostrar 4 contadores, e costuma ser a página de entrada.
- **Radar:** `editorial_workflow_items_listagem` pesa 1,64 MB e é o maior item restante da mesa.
- **Radar → Redator:** `radar-writer-send` ainda lê o documento inteiro (~4,5 MB) a cada envio.
- **Redator:** o F5 com um documento do Radar aberto ainda custa a mesa e o detalhe (~6,8 MB), até existir cache do detalhe pelo hash ou até a Fase 2 da E9.
- **Cache conferido das keywords (O2):** quando a migration de `row_version` for aplicada, incluir a coluna na lista explícita de colunas do Arquiteto.

**Suítes no fim, contra a linha de base:** `test:arquiteto` 2 falhas, `test:editorial` 4, `test:operational` 10, Minerador 28, iguais à base. `test:redator`, `test:redator:mcp`, `test:marca` e `test:radar` sem falhas. `tsc` sem erros.

## 9. Decisão

- [x] Regras da seção 3: vigentes a partir de 2026-09-23.
- [x] Correções localizadas da seção 5: implementadas e verificadas por teste em 2026-09-23 (seção 8). Validação manual pendente. `keyword-import-core` adiada.
- [x] E1 — `ContentDocument` fora da carga da mesa: implementada em 2026-09-23, com o pré-requisito da view ou coluna gerada antes de ~5 documentos grandes. Validação manual pendente.
- [x] E2 — provider editorial só onde é usado: implementada em 2026-09-23, opção (b). Validação manual pendente.
- [ ] E3 — Realtime e polling do Radar.
- [ ] E4 — export, envios e volta à aba no Radar. **Parcial em 2026-09-23:** o export lê por artigo e só a versão usada, com CSV byte a byte igual: ~23,6 → ~16,3 MB por export na Care Glow. Faltam as releituras de autoridades e da camada de vídeo (chegaria a ~3,8 MB), os envios e a volta à aba. Ver o backlog do Radar.
- [ ] E5 — Supabase local para desenvolvimento.
- [ ] E6 — deploy na Vercel.
- [x] E7 — SERP nas 4 lentes: decidido pelo usuário em 2026-09-23 (4 lentes em todo ponto de SERP, cache desde a primeira coleta). Correção 3 implementada; a coleta nas 4 lentes e a intenção e o funil pelas 4 lentes estão em implementação.
- [ ] E8 — cache do DNA: correção do Arquiteto e cache de versões imutáveis **implementados**; cache conferido das keywords vivas com SDD e migration **escritas, aguardando aprovação e aplicação pelo usuário**.
- [x] E9 — Redator: leitor de evidências (Fases 0 e 1 implementadas em 2026-09-23, migration `20260923150000` aplicada pelo usuário e verificada; Fase 2 planejada). Sessão MCP ~58,5 → ~23 MB.
- [ ] E9 (histórico) — Redator: leitor de evidências para a IA que escreve. SDD própria em [`docs/07-redator/propostas/sdd-leitor-evidencias-redator-2026-09-23.md`](../07-redator/propostas/sdd-leitor-evidencias-redator-2026-09-23.md). Uma sessão MCP de escrita custa hoje ~58 MB por artigo (`(2 + g + 2s) · P`, P = 4,48 MB MEDIDO); com o dossiê fora do payload, ~1 MB.
- Decisão, data e aprovador:
