# SDD — Arquitetura de provedores por plataforma e agência

**Status: aprovada para implementação.**

**Data da aprovação:** 2026-08-05  
**Escopo aprovado:** arquitetura de provedores por plataforma e agência.

> **Atualização canônica em 2026-08-11:** os nomes de entidades desta proposta
> (`agency_provider_connections` e `provider_usage_events`) foram supersedidos
> pelo contrato `integration_*` da SDD canônica de governança e pela migration
> local `0024_integrations_resource_governance.sql`. As referências abaixo
> permanecem como histórico do desenho anterior; não devem gerar tabelas
> duplicadas nem adaptação de consumidores nesta fase.

### Andamento da implementação

A Fase 1 foi implementada apenas no checkout local: migration aditiva `0014_agency_foundation.sql`, RLS e contratos server-side de resolução/autorização de agência. A migration, qualquer vínculo inicial de marcas e toda validação funcional/remota permanecem manuais e pendentes. Google Ads, DataForSEO, Serper e seus consumidores produtivos não foram migrados nesta fase.

## Problema

O código atual resolve duas credenciais de provider diretamente do ambiente do processo: Google Ads por `GOOGLE_ADS_*` e DataForSEO por `DATAFORSEO_*`. Ao mesmo tempo, a configuração operacional de Google Ads (conta anunciante, MCC, targeting, moeda e fuso) está em `minerador_google_ads_connections`, uma linha por `brand_id`. O Radar ainda chama Serper diretamente por `SERPER_*`.

Esse desenho não representa uma agência que opera várias marcas: mistura configuração global de plataforma, credencial operacional compartilhável e tenant de dados. Também não há entidade reutilizável de agência ou operador no schema atual.

## Estado atual confirmado no código

- `public.marcas.id` é o tenant canônico. `owner_user_id`, `auth.uid()`, slug e `brandRef` não são identificadores de agência.
- `brand_memberships` concede acesso à marca e `requireTenantPermission` revalida marca, ator e permissão no servidor. Admin global recebe acesso administrativo às marcas, mas não é uma agência.
- `minerador_google_ads_connections` é 1:1 por `brand_id`; mantém `customer_id`, MCC opcional, targeting, moeda, fuso e validação. As rotas de Descoberta e métricas a consultam antes de usar a configuração global de OAuth/Developer Token.
- Google Ads lê `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`, `GOOGLE_ADS_REFRESH_TOKEN`, MCC global opcional e versão da API somente no servidor.
- DataForSEO lê uma única combinação `DATAFORSEO_LOGIN`/`DATAFORSEO_PASSWORD` do ambiente. Hoje ela é usada pelo allintitle de Descoberta e Processador; não existe conexão por agência, auditoria de consumo por agência ou resolução de credencial por marca.
- Radar consome Serper diretamente em `lib/radar/serper-provider-core.ts`, com `SERPER_*`; seus contratos persistidos e de evidência ainda usam o literal `serper`.
- Não foi encontrada tabela ou contrato reutilizável de agência, operadora, agency membership ou provider connection compartilhada.

Nada nesta SDD altera essas conclusões atuais nem executa consulta externa, migration ou escrita remota.

## Decisão aprovada

1. **Marca continua sendo o tenant dos dados.** Toda keyword, medição, DiscoveryRun, candidato, resultado allintitle, snapshot e histórico continua obrigatoriamente ligada a `brand_id`.
2. **Agência é o escopo operacional de credenciais e consumo.** Uma agência pode operar muitas marcas; uma marca fica ligada a, no máximo, uma agência ativa por vez. Compartilhar credenciais não compartilha dados entre marcas.
3. **Google Ads é conexão de plataforma global.** Developer token, OAuth, refresh token, MCC técnico e versão ficam somente no servidor/secret store da plataforma. A conta anunciante e o targeting ainda são resolvidos para a marca, durante a transição, até a nova arquitetura obter paridade comprovada.
4. **DataForSEO é conexão operacional da agência.** Login/senha são criptografados ou referenciados por segredo exclusivamente server-side. Nenhum navegador recebe segredo, header Basic, ID completo de credencial ou saldo.
5. **DataForSEO será o provider único de SERP** para allintitle/resultados/KGR do Minerador, evidências de compatibilidade/agrupamento do Arquiteto e SERP orgânica do Radar. A troca do Serper é uma fase posterior, com adaptador, migração de contratos e paridade; até lá, Serper continua produtivo exclusivamente no Radar.
6. Não há fallback entre agências, entre marcas, para credencial global DataForSEO ou para conta de outro operador. Ausência de vínculo/conexão ativa falha de modo explícito e sanitizado.

## Modelo proposto (conceitual)

| Entidade | Responsabilidade | Restrições principais |
| --- | --- | --- |
| `agencies` | identidade operacional da agência | não substitui `marcas`; possui status e auditoria |
| `agency_memberships` | usuários autorizados a operar uma agência | papel próprio; não reutiliza owner de marca como agência |
| `agency_brands` | vínculo agência → marca | uma marca ativa pertence a no máximo uma agência; histórico fechado, sem fallback |
| `agency_provider_connections` | conexão DataForSEO por agência | provider, status, referência criptografada ao segredo, versão, validação e rotação |
| `provider_usage_events` | auditoria de uso/cota | sempre inclui `agency_id`, `brand_id`, provider, finalidade, resultado, custo sanitizado e operação |

Uma implementação pode adicionar uma projeção de configuração de plataforma, se for necessária para auditoria de Google Ads, mas ela não deve armazenar segredo no banco nem virar conexão por marca. O secret store permanece a fonte de OAuth/Developer Token.

### Relações e resolução

```text
usuário autenticado
  → valida acesso à marca e permissão do módulo
  → resolve brand_id canônico
  → resolve agency_brands ativa para a marca
  → resolve agency_provider_connections ativa para provider/finalidade
  → executa provider somente no servidor
  → persiste resultado em brand_id
  → grava provider_usage_events em agency_id + brand_id
```

O resolvedor recebe `provider` e `purpose` explícitos, por exemplo `minerador_allintitle`, `arquiteto_grouping_evidence` ou `radar_serp`. Ele nunca recebe `agencyId` do navegador como autoridade e nunca decide agência pelo owner, e-mail, slug ou MCC.

## Contrato de autorização

### Marca

O acesso a dados continua baseado exclusivamente em `brandId` e nas permissões já existentes (`minerador`, `arquiteto`, `radar`). Um usuário sem acesso à marca não chega à resolução de provider.

### Agência

`agency_memberships` terá papéis próprios, inicialmente equivalentes a `agency_admin`, `operator` e `viewer`. Só `agency_admin` pode cadastrar, validar, rotacionar, revogar ou visualizar estado sanitizado de conexão DataForSEO. Operar uma marca vinculada não concede, por si só, administração da agência.

O vínculo marca-agência deve ser criado/alterado por uma autorização explícita que exige gestão da marca e papel administrativo da agência (ou administração global em fluxo administrativo auditado). Revogar membership de agência não remove acesso de marca; apenas impede operar/configurar credenciais de agência.

## Google Ads: transição segura

### Estado existente

As credenciais técnicas são globais no servidor, mas cada marca possui sua própria linha validada em `minerador_google_ads_connections`. Essa linha é consumida por validação de conta, Descoberta e atualização de métricas.

### Estado alvo

- A plataforma resolve uma única configuração técnica Google Ads server-side e sua versão suportada.
- A configuração de conta/targeting/moeda/fuso continua associada ao contexto de marca, pois os dados e a conta anunciante são específicos da medição da marca.
- Se a futura operação exigir gestão central por agência, ela deve criar uma referência operacional aditiva, sem remover a linha por marca até o resolver novo, a validação real e a regressão de moedas/contas comprovarem paridade.
- Moedas de contas diferentes nunca são somadas ou comparadas silenciosamente; a moeda e o fuso continuam vindo da conta anunciante validada.

### Compatibilidade e rollback

O resolvedor novo deverá preferir a arquitetura aprovada somente após validar agência, marca, conta e autorização. Antes desse marco, as rotas atuais continuam usando `minerador_google_ads_connections`. Rollback significa desligar a seleção do novo resolvedor e manter a leitura das conexões por marca intacta; não apagar conexões, histórico nem medições.

## DataForSEO: transição para agência

### Estado alvo

`agency_provider_connections` para `provider = dataforseo` deve armazenar apenas referência de segredo criptografada ou identificador de secret manager, nunca login/senha em texto nem material devolvido ao browser. A validação server-side registra somente status, data, versão/capacidade consultada e erro sanitizado.

Uma chamada DataForSEO deverá:

1. validar ator, `brand_id`, finalidade e limite da marca;
2. resolver agência ativa da marca;
3. conferir membership/papel exigido para administrar ou somente permissão da marca para executar;
4. carregar a conexão DataForSEO ativa da agência no servidor;
5. chamar o adaptador do provider;
6. persistir o resultado somente no tenant da marca;
7. gravar uso por agência e marca, inclusive sucesso, partial, falha, custo quando informado e `operation_request_id`.

Rotação cria nova versão de segredo, valida-a e somente então ativa a nova referência. Revogação desativa a conexão e interrompe novas chamadas; dados e históricos já pertencentes às marcas permanecem disponíveis. Quota e saldo são avaliados antes/depois de cada chamada conforme as capacidades do provider, sem expor credencial.

### Migração dos consumidores

| Consumidor | Uso DataForSEO alvo | Regra de dados |
| --- | --- | --- |
| Minerador | allintitle/resultados e KGR | resultado atual e histórico permanecem em `brand_id` |
| Arquiteto | evidência de compatibilidade e agrupamento | evidência é aditiva; não reagrupa nem altera decisão humana automaticamente |
| Radar | SERP orgânica, concorrentes, PAA, relacionadas e evidências | recebe ArticleDNA formado; não altera principal, slug ou canonical |

O adaptador deve expor contratos de domínio por finalidade, não despejar o payload bruto comum no front-end. `se_results_count` continua sendo o único total de allintitle aceito; resultados orgânicos e evidências Radar exigem contrato próprio e não podem ser inferidos de allintitle.

## Serper: saída planejada, não executada

Atualmente Serper é o provider canônico do Radar. A decisão de DataForSEO como provider SERP único aprova a substituição arquitetural, mas não autoriza remover Serper, renomear snapshots ou alterar contratos `provider: serper` nesta tarefa.

A fase de migração deverá criar adaptador DataForSEO de SERP orgânica, fixtures equivalentes, normalizador de organic/PAA/related/knowledge graph, proveniência e regressões de Radar. Somente depois de coleta autenticada, persistência e recuperação comprovadas poderá haver seleção explícita de provider e remoção de Serper. Não há fallback silencioso entre providers em uma mesma medição.

## Persistência, RLS e segurança da migration futura

Uma migration aditiva futura deverá:

- criar as cinco entidades conceituais com FKs `ON DELETE RESTRICT` enquanto houver dados/uso;
- impedir duas relações agência-marca ativas para a mesma marca;
- limitar `agency_provider_connections.provider` a providers conhecidos;
- separar estado sanitizado da referência ao segredo;
- aplicar RLS: leitura/escrita de agência somente para membership ativo, com regras administrativas explícitas; eventos de uso sem acesso cruzado de marcas;
- manter `brand_id` obrigatório em resultados de negócio e `agency_id` obrigatório somente na infraestrutura operacional/auditoria;
- fornecer índices para `agency_brands(brand_id)` ativo, conexão ativa por agência/provider e uso por agência/marca/data;
- incluir snapshot, pré-checagens de conflitos, plano de backfill e rollback lógico.

Não se deve tentar inferir agência de registros existentes. Marcas sem vínculo entram em estado transitório explícito `agency_unassigned`; a execução que depender de DataForSEO falha com configuração ausente até o vínculo ser feito. Isso evita usar a credencial de outra agência por conveniência.

## Fases de implementação propostas

1. **Fundação e leitura:** migration aditiva, RLS, contratos, resolvedor server-side sem consumidores produtivos; fixtures para isolamento agência/marca.
2. **Administração operacional:** UI/rotas server-side para criar agência, administrar memberships, vincular marcas e validar/rotacionar DataForSEO, com segredos fora do browser.
3. **DataForSEO no Minerador:** migrar allintitle/resultados para o resolvedor por agência, preservar valores/histórico e registrar uso; smoke controlado por marca/agência.
4. **DataForSEO no Arquiteto:** adicionar evidência de compatibilidade/agrupamento sem alterar decisões humanas ou ArticleDNA.
5. **DataForSEO no Radar:** adaptar SERP orgânica, fazer paridade com fixtures e persistência; executar smoke autenticado por marca.
6. **Saída do Serper:** somente após paridade, remover consumidores/segredos Serper de forma explícita e manter snapshots históricos legíveis.
7. **Google Ads:** migrar a resolução técnica para configuração de plataforma e, se aprovado, evoluir referências operacionais por agência sem quebrar conexões por marca existentes.

Cada fase é reversível por feature selection server-side; não apaga dados de medição nem conexões anteriores antes de paridade comprovada.

## Testes obrigatórios por fase

- Usuário com acesso à marca A não resolve dados, conexão ou consumo da marca B.
- Agência A não resolve credencial, evento ou limite da agência B.
- Admin global não é tratado como agência e não recebe fallback de credencial.
- Marca sem agência/conexão falha antes de chamada externa; segredo nunca aparece em JSON, log ou diagnóstico.
- Duas marcas da mesma agência compartilham somente a credencial operacional, nunca resultados ou histórico.
- Rotação e revogação impedem novas chamadas e preservam medições históricas.
- Uma medição confirmada substitui somente o valor atual da mesma marca; falha preserva valor/KGR anterior.
- Google Ads preserva moeda, fuso e conta validados por marca durante toda a transição.
- Contratos/fixtures Radar demonstram paridade DataForSEO antes de remover Serper.
- Uso/custo é auditado com agência, marca, finalidade, operação e resultado sanitizado.

## Riscos e decisões ainda necessárias

1. Definir quem pode criar agência e vincular uma marca inicialmente: somente admin global ou também owner com aprovação administrativa.
2. Escolher o secret manager/referência criptografada e a chave de rotação; não persistir login/senha DataForSEO em tabela comum.
3. Definir se uma marca pode trocar de agência com período de transição ou se exige bloqueio operacional até corte explícito.
4. Definir limites/quota por agência e comportamento em saldo insuficiente.
5. Aprovar o contrato de DataForSEO para SERP do Radar antes de substituir o contrato Serper.
6. Definir a política de retenção para eventos de uso e referências de segredo revogadas.

## Critérios de aceite da futura implementação

A arquitetura estará concluída apenas quando uma marca vinculada a uma agência autorizada usar a conexão correta em cada finalidade, dados continuarem isolados por `brand_id`, consumo for auditável por agência, Google Ads mantiver operação sem regressão e Radar operar DataForSEO com paridade comprovada antes da remoção do Serper.
