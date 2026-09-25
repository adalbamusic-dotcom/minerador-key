## 34. Publicado revalidado: Vínculo, Silo pela URL e remontagem — 2026-09-25

Regras permanentes (no código desde 2026-09-25; homologação manual pendente):

1. **Publicada** é a keyword com status legado `publicado` **ou** com publicação declarada no Vínculo do Minerador (`resolveKeywordVinculo`, lido do pacote aprovado do item). Não existe leitor paralelo de `site_origin` no Arquiteto. A publicada recebe todas as proteções de identidade: artigo próprio, principal preservada, URL, slug, canonical e marca intocados (AGENTS §11) e a trava do PATCH da cópia de trabalho.
2. **Os campos de identidade publicada** da cópia de trabalho são uma lista só (`PUBLISHED_IDENTITY_ASSIGNMENT_KEYS`), usada pela rota para recusar e pela mesa para não enviar. `territoryRef` não é identidade.
3. **Silo do artigo publicado pela URL.** O artigo publicado cuja URL canônica está sob a URL canônica de um Silo publicado da mesma marca (mesmo host, prefixo de caminho inteiro, normalizado) é membro declarado desse Silo. É decisão do site, não afinidade. Havendo Silos aninhados, vence o mais profundo; dois Silos com o mesmo endereço são conflito para decisão humana. O Silo publicado mantém a primária declarada. Nada disso muda canonical.
4. **A publicada não é remanejada por afinidade.** Sem Silo na URL, ela fica fora de Silo com o motivo dito; nunca vira semente léxica nem nome de Silo novo. A membership da publicada só é gravada no destino que o site declara.
5. **Revalidar é remontar.** As livres seguem pela proposta de sempre; um grupo léxico que contém artigo publicado de um Silo vai para esse Silo, e a livre que pede o mesmo conteúdo de um artigo publicado (piso de canibalização) entra nele, até o teto de seis, sem trocar a principal publicada. Duas publicadas nunca se fundem.
6. **O Silo publicado mantém o endereço do site.** O slug de um Silo cuja cabeça está publicada é o caminho da URL declarada (canônico primeiro), nunca o texto da keyword normalizado. O território dele nasce `protected`, com `publishedSlug` e `publishedCanonical` da declaração e sem slug proposto. A cabeça publicada reaproveita o território de mesmo endereço (ou de mesma primária) em vez de criar outro.
7. **Conflito não é declaração do site.** Quando o endereço não resolve o Silo de uma publicada (dois Silos com o mesmo endereço, publicada sem URL absoluta), a linha diz o conflito para decisão humana. Publicada que já está num território e cuja URL não declara Silo mantém a membership vigente até decisão humana. Revisão humana de formação que junta publicada como não principal, ou duas publicadas, aparece com conflito — a composição humana não é trocada em silêncio.

## 33. Assunto declarado no ArticleDNA e no SiloDNA — 2026-09-24

Fonte: [SDD do Assunto](../compartilhado/sdd-assunto-tronco-editorial-2026-09-24.md),
aprovada em 2026-09-24, e [ADR-022](../00-produto/decisoes/ADR-022-assunto-tronco-editorial.md).
Estado da implementação em [estado-atual.md](estado-atual.md).

O **Assunto** é a frase que o humano declarou no Minerador como tronco do
artigo, mesmo sem volume de busca. As **keywords de sustentação** são as buscas
reais que trazem o leitor e fazem a virada para ele. A **principal** continua
sendo uma keyword com busca, dona do slug, do KGR e do H1; o Assunto entra no H1
como complemento ou num H2/H3, conforme a SERP.

### 33.1 Contrato (vigente no código desde a fase A)

- `subject` é campo **opcional** do `ArticleDNA` e do `SiloDNA`, no formato
  `DeclaredSubjectSchema` (`.strict()`): `keywordId`, `approvedPackageRef`,
  `phrase`, `note` (1 a 280 caracteres, ou `null`), `destinationUrl` (URL, ou
  `null`), `attachedBy` e `attachedAt`.
- A frase, a nota e o destino viajam como snapshot. O Radar e o Redator não
  hidratam outra keyword para saber qual é o tronco.
- **Não é referência:** o Assunto fica fora de `keywordReferences` e do teto de
  6. Não existe papel "Assunto" em `role`, e nenhum enum muda.
- **Um Assunto por artigo; o mesmo Assunto pode sustentar vários artigos,
  landings ou um Silo inteiro.** Vale para qualquer unidade do ArticleDNA,
  inclusive `landing_page` e `service_page`.
- O `superRefine` do ArticleDNA recusa:
  - `subject.keywordId` entre as secundárias ou os reforços do mesmo artigo;
  - `subject.phrase` igual, por keyword normalizada, a um item de
    `excludedSubjects` do mesmo artigo. O tronco não pode ser tema excluído.
- O Assunto igual à principal **não** é decidido no schema, porque o ArticleDNA
  não carrega o Volume. A regra fica no gate de conclusão (33.2).
- No SiloDNA, `centralEntity` **não** recebe a frase do Assunto: a SiloPage tira
  H1 e title de lá, e isso contrariaria a regra da principal. A primária do
  Silo continua eleita pelas origens atuais.
- `excludedSubjects` ("assuntos excluídos") é outra coisa: os temas que o
  artigo não cobre. Na tela, o termo novo aparece como "Assunto · declarado" ou
  "Assunto (tronco)".

### 33.2 Regras da fase B (no código desde 2026-09-24; homologação pendente)

Vigentes no código, salvo os itens marcados **Planejado**. Implementação em
`lib/arquiteto/declared-subject.ts` e, na gravação,
`lib/arquiteto/declared-subject-guard.ts` com
`lib/server/arquiteto-subject-guard.ts`; detalhes e limites no
[estado-atual.md](estado-atual.md).

- **Prender é ato humano.** O `subject` é montado do pacote aprovado, lido
  pelo resolver do Minerador, com `attachedBy` humano. Só uma keyword recebida
  pelo Arquiteto, da mesma marca e declarada Assunto pode ser presa. Uma
  unidade com outro Assunto recusa a troca (`ANOTHER_SUBJECT_ATTACHED`).
  Assunto retirado ou reaprovado no Minerador gera aviso, e nada é trocado.
- **O servidor confere a regra na gravação**, e não só a tela: no writer de
  ArticleDNA e SiloDNA, no par SiloDNA+SiloPage, na consolidação do Silo e no
  PATCH da cópia de trabalho. A conferência roda quando o `subject` é novo ou
  mudou em relação à versão vigente, campo a campo; o mesmo Assunto relido
  passa sem conferência. Exige `attachedBy` igual ao ator da requisição,
  keyword viva, da marca, recebida e declarada, e `approvedPackageRef`,
  `phrase`, `note` e `destinationUrl` iguais aos do pacote aprovado. Recusa
  com código `SUBJECT_*`: 403 para ator e outra marca, 409 para o resto.
- Na restauração de backup, o autor gravado não precisa ser quem restaura, mas
  precisa ser um `auth.users.id`; o resto é conferido igual, e IA nunca prende.
- O Assunto só pode ser a própria principal com **Volume validado** no pacote
  aprovado. Um Assunto aprovado pela exceção do Minerador, sem Volume, nunca é
  principal nem dá slug. Gate de conclusão `SUBJECT_PRINCIPAL_REQUIRES_VOLUME`;
  no servidor, `SUBJECT_PRINCIPAL_WITHOUT_VOLUME`, inclusive quando o Assunto
  já preso passa a ser a principal.
- Assunto sem Volume validado fica fora da formação automática e da eleição da
  principal e do slug. Entra num artigo só como `subject`, ou como membro por
  ato humano explícito.
- **Conservação:** o vínculo do tronco é um campo do artigo na cópia de
  trabalho (`subjectKeywordId`), não `clusterId`. Tronco ancorado conta como
  incorporado e fica fora de `NO_DUPLICATED_KEYWORD`, de `DUPLICATE_KEYWORD` e
  do teto. Todos os cálculos usam o mesmo predicado, `isAnchoredSubject`.
  Assunto sem artigo fica em "Keywords não agrupadas" com o selo
  "Assunto · aguardando sustentação"; o ancorado aparece como
  "Assunto · tronco de N artigo(s)". Nenhuma keyword some.
- **Vínculo antes da Definição:** numa formação que ainda não tem ArticleDNA,
  o Assunto preso é gravado em `articleSubjectAnchor`, campo opcional do item
  de workflow da principal, chaveado por `candidateRef`, e sobrevive ao
  recarregar. Vai com a formação quando o ref do artigo muda e passa ao
  ArticleDNA ao concluir a formação. Soltar sempre é aceito.
- **Formação em torno do Assunto:** sugestões determinísticas só sobre as
  keywords já recebidas, sem leitura nova e sem provider. O primeiro sinal é
  `subject_discovery.subjectKeywordIds` do pacote. O humano escolhe as
  sustentações; a principal sai entre elas pela regra atual; a SERP das
  sustentações, nas 4 lentes com cache, valida o artigo. A SERP da frase é
  opcional, sob pedido, pela rota Resultados do Minerador, e não entra na trava
  de SERP do artigo.
- **Silo:** o Assunto preso ao SiloDNA vira sugestão aos artigos do Silo, e
  cada artigo confirma. Um Silo que já tem SiloPage não recebe Assunto novo
  por versão avulsa do SiloDNA (`SUBJECT_SILO_PAGE_BOUND`), porque isso
  desalinharia o `siloDnaRef` da página. A consolidação do Silo versiona o par
  junto e carrega o Assunto da versão vigente, sem tocar `centralEntity`;
  consolidar sem o Assunto vigente é recusado (`SUBJECT_DROPPED`), porque
  soltar é ação própria. Escolher Assunto novo para um Silo com página é
  **Planejado**.
- **Versão:** `subject` é decisão editorial no diff de versão
  (`EDITORIAL_DECISION_FIELDS`). Prender, soltar e pacote novo são revisão;
  `attachedBy` e `attachedAt` são carimbos.
- IA só propõe; aceitar é ato humano. O botão "Pedir proposta" da IA é
  **Planejado** e exige adendo.
- O texto da trava `NO_UNRESOLVED_CANNIBALIZATION` passou de "disputam o mesmo
  assunto" para "disputam o mesmo tema", para não confundir com o Assunto
  declarado.

### 33.3 Duas fases e rollback

- **Fase A:** o schema aceita `subject`, e nenhum caminho grava.
- **Fase B:** a interface e a formação passam a gravar, só depois da fase A no
  ar e homologada.
- Depois do deploy da fase A, **nenhum rollback volta para antes dela**. O
  ArticleDNA é lido com `.strict()`: um artefato com `subject` lido por código
  anterior derruba o readback do Arquiteto da marca com 503 e tira o artigo do
  Radar.
- A fase B não cria formato novo de ArticleDNA nem de SiloDNA além do schema
  da fase A. Os campos novos de rota (`articleSubjectAnchor` no PATCH da cópia
  de trabalho e `subjectCode` na resposta de erro) são opcionais e aditivos.
- O Radar e o Redator só usam o campo depois da fase B homologada.

## 32. Exportação: dois contratos independentes

Salvar o sistema e usar o conhecimento produzido por ele são finalidades
diferentes e não cabem no mesmo arquivo. O Arquiteto exporta dois produtos, e
a fronteira entre eles é regra, não conveniência.

As duas exportações são **somente leitura**: não alteram estado, não chamam
provider, não criam versão e não modificam artefato. Cobrem o conjunto inteiro
da Brand, independentemente da seleção e dos filtros da mesa, e leem os mesmos
read-models canônicos que alimentam a interface — nunca o HTML da tabela.

`EXPORT_SOURCE = CANONICAL_READ_MODELS` ·
`EXPORT_REQUIRES_SELECTION = NO` · `EXPORT_WRITES_REMOTE_STATE = NO` ·
`LINK_ROLE_SOURCE = SILODNA` · `LINK_RELATIONS_SOURCE = INTERNAL_LINK_GRAPH`.

### 32.1 BACKUP_RESTORABLE_V1 — recuperar o Arquiteto

Representação canônica, versionada e importável. O arquivo se declara no
cabeçalho: `minekey_export_type = ARQUITETO_BACKUP`, `schema_version = 1`,
Brand, data e contagem. A tabela usa uma linha por artefato, com
`record_type`, `record_key`, `record_version`, `status`, `content_hash`,
`parent_ref` e `payload_json` — o conteúdo canônico inteiro, sem achatar um
objeto complexo em centenas de colunas.

`record_key` é a identidade do ARTEFATO (`siloId`, `articleId`, `graphId`),
nunca o identificador de uma linha de banco. A cobertura por tipo e as lacunas
conhecidas estão na auditoria datada de 2026-09-13.

Importar é sempre em duas etapas: `parse + preview` e, depois de confirmação
humana, `restore`. O preview roda no servidor, contra o estado canônico real, e
classifica cada registro como `CREATE`, `NO_OP`, `REMAP`, `CONFLICT` ou
`BLOCKED`. Um `CONFLICT` ou `BLOCKED` recusa o lote inteiro — restauração
parcial silenciosa não existe.

A restauração entra pelos **writers canônicos** de cada tipo e herda deles a
validação de Brand, contrato, identidade e lock; não existe INSERT genérico em
tabela. Quando a identidade é emitida pelo servidor, como em território e
working copy de Silo, o artefato volta com identificador novo, que entra no
mapa `id antigo → id restaurado`; todas as referências são religadas por esse
mapa antes da escrita. Mesmo artefato com o mesmo hash é `NO_OP`, o que torna a
restauração idempotente: importar duas vezes não cria sucessora nem duplicata.
Mesma identidade com conteúdo divergente é `CONFLICT`. Restaurar entre Brands
exige decisão explícita. Nada publicado ou canônico divergente é sobrescrito em
silêncio.

Depois da escrita, o servidor relê o remoto e compara semanticamente com o
backup religado. Retorno 2xx da mutation não é prova de sucesso; a comparação
ignora apenas identificador remapeado e carimbo novo de restauração, e exige
equivalência de conteúdo, relações, papéis, estados e topologia.

### 32.2 EDITORIAL_EXPORT_V1 — escrever o artigo

Uma linha por ArticleDNA canônico, com o que ajuda a produzir conteúdo: Silo,
papel no Silo, Principal, slug, intenção, funil, volume, resultados, KGR e
aplicabilidade, secundárias e reforços, o contexto do KeywordDNA já congelado
no ArticleDNA (entidade central, modificadores, público, problema percebido,
resultado desejado, tipo editorial, nível de consciência, etapa da jornada),
parecer e mercado observado da SERP vigente, evidências e fontes necessárias,
e os links internos **agregados na linha do artigo**: recebe de, aponta para,
conceitos de âncora e relações internas.

Catorze arestas não viram catorze linhas: a unidade do arquivo é o artigo.
UUID interno, hash, version id, lock version, id de nó e id de aresta ficam de
fora — quem restaura estado é o backup.

`EDITORIAL_EXPORT_IS_IMPORTABLE = NO`. O contrato é deliberadamente one-way, e
o importador só aceita arquivo que se declara `ARQUITETO_BACKUP`. É isso que
impede um CSV editorial editado no Excel de virar estado canônico.

### 32.3 CSV e interface

Os dois arquivos são UTF-8 com BOM, delimitados por `;`, com aspas, vírgulas,
quebras de linha e textos livres escapados, datas em ISO 8601 e arrays em
lista estável (`valor 1 | valor 2`). Objeto nunca sai como `[object Object]`.
Nomes: `arquiteto-backup-<brand>-YYYY-MM-DD-HHmm.csv` e
`arquiteto-editorial-<brand>-YYYY-MM-DD-HHmm.csv`.

`Exportar` é um menu com os dois produtos e com `Restaurar backup`.
`Importar do Minerador` continua significando KeywordDNA vindo da etapa
anterior e não se mistura com recuperação operacional.

O sucesso só é anunciado depois que o arquivo foi montado e o download foi
disparado, com a contagem real do que saiu. Falha declara o motivo; anunciar
início de exportação sem arquivo produzido é proibido.

## 31. Precedência evidencial da SERP e contrato downstream

Lógica é hipótese determinística; IA é proposta analítica; SERP é evidência
externa observável; humano consolida. Quando a SERP ativa possuir cobertura
completa, representativa e suficiente, sua recomendação prevalece na
apresentação sobre Lógica/IA conflitantes. Essa precedência não movimenta a
working copy, não troca principal/papéis/slug e não consolida nada sem decisão
humana explícita.

O painel SERP apresenta hipótese vigente, intenção esperada e observada,
compatibilidade, sobreposição, formato dominante, competição, conflito,
recomendação, motivo, impacto e limitações quando esses dados existem. KGR é
sinal para a coerência principal/slug, jamais regra mecânica de exact match.

Depois da aprovação, ArticleDNA, SiloDNA/SiloPage e InternalLinkGraph formam
contrato estrutural downstream imutável. Evidência posterior contraditória deve
retornar ao Arquiteto como `STRUCTURAL_REVIEW_REQUIRED`, preservando vN até
# Spec — Arquiteto

## Fundação estrutural de Links Internos e consolidação pareada — estado vigente 2026-08-27

`InternalLinkGraph` é a fonte canônica e persistente das relações estruturais
de links internos. O contrato local foi implementado em quatro entidades
versionadas/tenantizadas (`internal_link_graphs`, `internal_link_graph_nodes`,
`internal_link_graph_edges` e `internal_link_graph_proposals`). React Flow,
localStorage e IndexedDB permanecem projeções/recuperação, nunca fonte de
verdade. O MVP é restrito a uma Brand, um Silo, uma base SiloDNA, uma base
SiloPage e ArticleDNAs participantes; KeywordDNA não é nó.

SiloDNA e SiloPage continuam entidades distintas. A consolidação humana usa
`persist_silo_pair_atomic(...)` para inserir os dois artefatos em uma única
transação com lock por Brand/Silo e readback dos dois registros. As aprovações
permanecem independentes. O catálogo de listas e o workflow ainda estão fora
desse boundary de artefatos.

```text
LOCAL_IMPLEMENTATION = COMPLETE
REMOTE_MIGRATIONS = APPLIED_MANUALLY
REMOTE_PREFLIGHT = PASS_PRE_APPLY_READ_ONLY
REMOTE_POST_APPLY_READBACK = PASS
REMOTE_TRANSACTIONAL_SMOKE = PASS_ROLLED_BACK
REMOTE_CROSS_BRAND_SMOKE = PASS_ROLLED_BACK
MANUAL_APPLY_ORDER = internal_link_graph_foundation -> silo_pair_atomicity -> integrity_guards
```

## Conceito canônico consolidado — 2026-08-25

O Arquiteto é a mesa de arquitetura editorial, organizada conceitualmente em
Artigos, Silos e Links Internos. A planilha continua sendo a superfície
operacional; esta divisão não autoriza um wizard nem um redesenho imediato.

- **Artigos:** KeywordDNA completo → hipótese de grupo → SERP como evidência →
  IA opcional como proposta → revisão humana → ArticleDNA.
- **Silos:** ArticleDNA → SiloDNA estratégico + SiloPage indexável, com um
  Pilar, Suportes, verticalidade e proteção de publicados.
- **Links Internos:** SiloDNA + ArticleDNA → InternalLinkGraph versionado. O
  grafo é fonte da verdade; React Flow é apenas projeção visual. A aba
  funcional permanece como próxima frente.

Processos de lógica, SERP, IA e revisão são independentes. SERP não move
keywords, IA não aprova e a decisão humana não é substituída por atualização
de métricas. Cada KeywordDNA permanece rastreável até a versão consolidada.

O contrato vigente está detalhado em
[`links-internos-estado-e-contrato.md`](links-internos-estado-e-contrato.md) e
na visão canônica de artigos, silos e links. A auditoria, o plano e o pedido
estrutural de 2026-08-25 foram preservados como histórico em
[`docs/_arquivo/2026-08-documentacao-legada/`](../_arquivo/2026-08-documentacao-legada/).

## Integrações compartilhadas — precedência 2026-08-25

O Arquiteto consome capabilities compartilhadas da Plataforma. Para
compatibilidade SERP, usa a Connection global DataForSEO `READY` resolvida
server-side; não possui provider, Connection, credential, grant, binding ou
quota próprios. DeepSeek é opcional por operação/capability, também via
infraestrutura compartilhada. Referências históricas a providers SERP ou IA
anteriores não são contrato vigente.

## Regra compartilhada de formação — 2026-07-21

O Arquiteto é proprietário da formação: exatamente uma principal e até cinco keywords de apoio, com no máximo seis referências. A principal herda a intenção dominante e orienta slug candidato, KGR, volume e limites do ArticleDNA; secundárias exigem compatibilidade editorial e não substituem a principal. KGR só é qualificado quando há evidência real do Minerador e vínculo principal–slug compatível.

## 26. Intenção editorial, formato SERP e perfil KGR

Novos ArticleDNAs carregam `intentProfile`: a intenção principal é herdada da KeywordDNA da principal, com valor canônico e rótulo original preservado. Intenções de secundárias/reforços são sinais individuais e não sobrescrevem `mainIntent`; CTA não muda a intenção editorial. `Pilar`, `Suporte` e `Reforço Narrativo` são hierarquia, nunca formato SERP. Formato só é comparado quando explicitamente informado como formato editorial; caso contrário, permanece não definido.

O avaliador do Arquiteto trata snippets como evidência parcial. Ausência textual vira limitação `Cobertura não observada nos snippets`/`Evidência insuficiente`, nunca separação automática. `validationProfile` pode ser `standard`, `kgr_light`, `published_architecture` ou `published_strengthening`. KGR confirmado consulta a principal primeiro, amplia somente diante de ambiguidade e registra `queriedKeywordDnaIds` sem remover referências KeywordDNA. Confiança baixa ou inconclusiva bloqueia recomendações destrutivas. Assessment novo preserva a versão anterior e marca-a como `Desatualizado por correção do avaliador`.
## 1. Propósito
Transformar keywords em arquitetura editorial rastreável.
## 2. Responsabilidades
Agrupamento lógico e por IA, revisão de keywords, ArticleDNA, SiloDNA, SiloPage, anotações, proteção de publicados e envio ao Radar.
## 3. Fora de responsabilidade
Não chama Google Ads, não renova métricas, não recebe credenciais/campaigns e
não interpreta respostas brutas de Ads. A validação de compatibilidade SERP do
Arquiteto reutiliza exclusivamente a Connection global DataForSEO READY já
resolvida pela Plataforma; não exige uma capability específica de SERP do
Arquiteto. O Radar continua responsável pela investigação SERP profunda. O
Arquiteto não aprova automaticamente nem publica.
## 4. Entidades
KeywordDNA, ArticleDNA, SiloDNA, SiloPage, versão, evento, anotação, snapshot e conflito.
## 5. Jornada
Importar keywords localizadas, agrupar, revisar, gerar propostas, validar gates humanos e transferir Articles aprovados ao Radar.
## 6. Regras de negócio
ArticleDNA usa uma principal e até cinco keywords de apoio (máximo de 6); IA não aprova; published guard bloqueia campos estruturais; SiloDNA e SiloPage são distintos. **Confirmado por teste.**
## 7. Estados
Rascunho, análise, conflitos, aguardando aprovação, aprovado, bloqueado e enviado ao Radar.
## 8. Ações
O fluxo mínimo expõe uma ação visível por etapa: `Processar lógica`, `Validar
SERP`, `Revisar com IA`, `Confirmar arquitetura` e `Enviar ao Radar`. A barra
contextual também oferece `Limpar seleção`; ações internas de geração e
auditoria permanecem disponíveis quando necessárias, sem duplicar o caminho
principal.

Antes da confirmação, artigos novos mantêm uma cópia de trabalho editável:
cada keyword pode ser marcada como `principal`, `secundaria` ou
`reforco_narrativo`; ao escolher outra principal, a anterior é rebaixada. A
decisão é persistida no workflow canônico e não pode alterar papéis ou
agrupamento de identidade publicada protegida.
## 9. Entradas
Keywords por marca, contexto da marca, grupos e decisões humanas.
## 10. Saídas
Envelopes versionados, eventos e itens elegíveis ao Radar.
## 11. Contratos com outros módulos
Consome Minerador; entrega ArticleDNA/SiloPage aprovados ao Radar; usa contratos editoriais compartilhados.
## 12. Proteções
Hash, proveniência, imutabilidade, limite de keywords, marca, published guard, IndexedDB para recuperação e rejeição de conclusão vazia. Consultas browser exigem sessão NextAuth autenticada e um JWT Supabase atual, validado com margem de 60 segundos; o cliente compartilhado usa `accessToken` dinâmico e resultado estruturado (`ok`, `token`, `reason`, `expiresAt`), e SELECT pode repetir uma vez após refresh. Falhas de troca Google, ausência de token, claims inválidos e expiração são estados distintos; apenas expiração efetiva ou falha de refresh após vencimento recebe mensagem de sessão expirada.
## 13. Casos de borda
Keyword sem localização, hidratação ausente, referência divergente, resposta parcial de IA e artefato órfão.
## 14. Arquitetura técnica atual aprovada
Página cliente, domínio em `lib/arquiteto`, APIs estruturadas e contexto editorial. SiloDNA/SiloPage usam o runtime canônico server-side; a consolidação humana pareada chama `persist_silo_pair_atomic(...)` e confirma readback das duas entidades. A operação de catálogo/workflow permanece separada.
## 15. Critérios de aceite
Nenhum artefato incompleto/sem marca chega a aprovado ou é transferido.
## 16. Fora do escopo atual
 Integração direta com Google Ads, provider SERP legado, RapidAPI ou provider IA
 próprio. Revisão DeepSeek
é opcional, explícita e feita somente pela conexão oficial server-side da
plataforma, após evidência SERP quando o fluxo solicitar.
## 17. Arquivos pertencentes ao módulo
`app/(brand)/[brandRef]/arquiteto/page.tsx`, `app/api/arquiteto/**`, `lib/arquiteto/**`.
## 18. Arquivos compartilhados consumidos
`components/editorial-pipeline-context.tsx`, `lib/editorial/**`, `lib/server/structured-ai.ts`.
## 19. Arquivos proibidos sem autorização

## Integridade recebida do Minerador

O Arquiteto recebe keywords já tenantizadas por `brand_id`. `lista_id` pode ser nulo sem invalidar a keyword; quando houver lista, ela deve pertencer à mesma marca. O Arquiteto não exclui keywords por estarem sem lista e deve preservar a localização recuperável ou encaminhar a keyword para `Keywords não agrupadas`.

## Rebase canônico do patrimônio do Minerador

Keywords válidas `aprovado` e `publicado` da Brand podem entrar no fluxo canônico do Arquiteto uma única vez. `publicado` conserva seu status e todas as proteções de URL, slug, canonical, Brand e política da principal; ele não é convertido em `aprovado` para fins de entrada.

A elegibilidade é server-side e considera somente a mesma Brand, workflow `keyword/architect` operacional e referências de ArticleDNA canônico válido. Marcadores de `localStorage`, IndexedDB, `importedKeywordIds`, estado incorporado legado e qualquer marcador histórico não são autoridade de sucesso. O recovery/rebaseline histórico foi abandonado no runtime; workflow remoto não-`received` é conflito explícito e não é convertido automaticamente em `received`.

O read model distingue disponível, recebida, incorporada em ArticleDNA novo, publicada protegida e descartada/inválida. Estados de workflow remotos desconhecidos impedem o bootstrap até investigação. A operação em massa é server-side, autenticada, autorizada por Brand, idempotente e depende de preflight sanitizado e aprovação humana; não modifica dados estratégicos do Minerador.

## 20. Referencia de identidade publicada

`ArticleDNA` pode carregar `publishedIdentityRef` como referencia opcional e compacta da identidade publicada. Esse campo preserva a relacao com `PublicationRecord`/`OperationalPublication`, mas nao altera a imutabilidade do ArticleDNA nem substitui a fonte canonica de slug, canonical, URL, marca ou keyword principal. O Planejador deve bloquear divergencias conhecidas e manter a protecao conservadora.

## 21. SERP de formação do artigo

O Arquiteto possui a ação explícita `Validar SERP`, distinta de DataForSEO
`allintitle`, que resolve server-side a Connection global READY já disponível
para DataForSEO no contexto autorizado da Brand. A operação não exige criar ou
revalidar capability, grant, binding ou quota específica do Arquiteto; esses
metadados, quando presentes, continuam apenas rastreáveis no runtime. Não há
Serper, RapidAPI ou fallback. A operação real só ocorre por ação explícita do
usuário e nenhum teste usa créditos. A limitação ou erro do provider não apaga
assessments nem a cópia de trabalho. A ação continua aceitando grupo
provisório, keyword utilizável e Brand, sem exigir ArticleDNA ou SiloDNA
aprovado. Cada keyword recebe snapshot e recomendação humana versionados;
seguir altera somente a cópia de trabalho e ignorar registra a decisão sem
alterar agrupamento. O Radar continua responsável pela SERP profunda do artigo
já formado e poderá reutilizar a infraestrutura compartilhada.

`Revisar com IA` recebe o `keywordDnaSnapshot` completo de cada candidato,
além da hipótese de grupos, assessments SERP, silos e proteções de publicados.
Esse snapshot é fato primário do Minerador; a resposta compacta da IA é apenas
proposta e nunca substitui a cópia de trabalho nem a confirmação humana.

### 21.1 Execução em blocos — 2026-09-25

Quando uma ação passa do teto por pedido da rota (SERP da formação: 20
artigos e 20 candidatas a Silo; SERP dos silos: 10 dúvidas; IA dos silos: 6
dúvidas), o cliente divide o lote em blocos que cabem no teto e os executa em
sequência. Regras permanentes:

- o plano de chamadas pagas de todos os blocos é lido antes (sem pagar) e a
  pessoa confirma uma vez a soma; cada bloco executa só com o número do plano
  dele, e o orçamento do servidor continua por pedido;
- falha de um bloco vira falha nomeada dos itens dele e não interrompe os
  outros; nenhum bloco é repetido automaticamente;
- nenhum item é cortado em silêncio: o que não cabe em bloco nenhum é dito;
- o andamento diz "bloco N de M · faltam R";
- a IA dos silos recebe só as keywords do escopo aberto da dúvida.

## 22. Identidade publicada e verificação

`publishedIdentityRef` pode carregar URL publicada e canonical vindos de uma fonte coerente de KeywordDNA, IDs de origem e verificação online. URL divergente vira conflito; sem URL o Arquiteto mostra ausência e não inventa destino. A verificação é explícita, server-side, brand-scoped e não sobrescreve identidade publicada.

## 24. Modos SERP por estado editorial

Assessments novos carregam `assessmentMode`: `formacao` para artigos sem publicação, `arquitetura_publicado` para publicados sem principal/arquitetura consolidadas e `fortalecimento` para principal confirmada com arquitetura confirmada ou vínculo KGR confirmado. A formação e a arquitetura do publicado podem sugerir mudanças na cópia de trabalho; o fortalecimento trabalha ao redor da identidade consolidada. Em todo publicado, URL, slug, canonical e marca são restrições de entrada. Secundárias e reforços continuam sujeitos a decisão humana, preservando KeywordDNA e exigindo nova aprovação quando a cópia de trabalho mudar.

## 25. Relação keyword/URL, arquitetura e KGR

O Arquiteto preserva `keywordUrlRelation`, `architectureStatus` e `kgrIdentity` quando recebidos do Minerador, sem misturar relação, arquitetura, publicação ou aprovação. `candidate_primary` e estados arquiteturais pendentes não protegem a principal. A principal só é estruturalmente protegida com `confirmed_primary` + `architecture_confirmed`, ou com KGR confirmado contendo principal KeywordDNA e slug vinculados. A coincidência textual entre keyword e slug não confirma KGR. O ArticleDNA mantém esses campos, as referências individuais, snapshots integrais, evidências, decisões e histórico versionado.

## 26. ArticleDNA como contexto estratégico

O ArticleDNA expõe, de forma aditiva e determinística, `intentProfile`, `volumeStrategy`, `hierarchyStrategy` e `strategicPurpose`. A intenção do artigo é herdada da principal. Secundárias representam expansão compatível de alcance/volume; `reforco_narrativo` representa cobertura semântica e não recebe volume inventado. Volume desconhecido permanece `null`.

`ArticleControlContext` é derivado do ArticleDNA para IA, SERP e transferência operacional. Ele concentra identidade, intenção, KGR, volume, hierarquia, propósito e ações permitidas/protegidas/proibidas. Não é uma nova entidade persistida e não substitui os campos de origem.

KGR confirmado vincula principal e slug. KGR novo permanece candidato até confirmação arquitetural humana; slug divergente produz conflito. Publicado candidato protege URL, slug, canonical e marca, mas mantém a principal corrigível. Publicado com arquitetura/KGR confirmados protege também a principal.

O limite de formação permanece entre 1 e 6 KeywordDNAs, sem preenchimento artificial. A hierarquia considera volume, centralidade semântica, abrangência tópica, capacidade de ligação no silo e prioridade de negócio; volume não decide sozinho.

## 27. Criador manual de silo

O modal do Arquiteto não solicita `Nicho`, keyword ou entidade central. A marca ativa fornece o contexto de marca; a criação manual exige somente o nome editorial do silo e seu slug.

Após a extensão contratual registrada em `docs/04-arquiteto/propostas/2026-08-24-silo-draft-pareado-silopage-novo.md`, a operação cria a estrutura inicial pareada: um `SiloDNA` em `draft`/`em_formacao` e uma `SiloPage` independente em `publicationStatus = "new"`. Nenhuma keyword, KeywordDNA, principal, entidade central, intenção ou publicação é inventada nessa etapa. O endpoint confirma os dois artefatos e o catálogo por readback antes de responder sucesso.

A entidade central e a arquitetura editorial permanecem pendentes até os processos posteriores do Arquiteto. O SiloDNA formado continua exigindo contexto estratégico válido; a SiloPage conserva a referência versionada ao SiloDNA, slug, Brand, versão e aprovação independente.

O slug aceita `manicure` e `/manicure`, normaliza ambos para `/manicure`, rejeita URL completa, protocolo, domínio, vazio e valores inválidos, sem alterar canonical ou URL publicada. Repetição de slug na mesma Brand é conflito explícito. A persistência individual de artefatos continua disponível; a consolidação pareada de SiloDNA/SiloPage usa a RPC transacional local preparada acima, enquanto catálogo/workflow permanecem fora desse boundary.

## 28. Perfis de unidade, propósito e estratégia SERP

O ArticleDNA pode carregar, de forma opcional, `unitClassification`, `unitPurpose` e `serpStrategy`. A classificação possui tipos `article`, `service_page`, `landing_page`, `category_page` e `other`, além de finalidade independente para landing (`seo`, `campaign`, `hybrid`, `unknown`). Sugestão é diferente de confirmação humana.

`serpStrategy` mantém separados `lifecycleMode`, `competitionStrategy` e `unitProfile`. KGR confirmado recebido com principal/slug vinculados resolve `kgr_light`; não KGR explícito resolve `competitive`; candidato, conflito ou ausência resolvem `unknown`. O Arquiteto não recalcula KGR e a intenção central permanece herdada da principal.

O `ArticleControlContext` projeta unidade, intenção, propósito e estratégia para os consumidores autorizados. Para ArticleDNA antigo, a projeção usa `other/unknown` quando não há evidência suficiente. A confirmação humana cria sucessora versionada; a SERP anterior permanece no histórico e fica desatualizada por mudança de perfil. Em publicados, URL, slug, canonical, marca e principal confirmada permanecem protegidos.

## 23. Visibilidade operacional da SERP

## 29. Política da keyword principal recebida do Minerador

O consumidor do Arquiteto lê a política aditiva gravada pelo Minerador em
`analise_semantica`: `primary_keyword_policy`,
`primary_keyword_published_original`, `primary_keyword_current`, ator, data,
versão, motivo, revisão necessária e histórico. O contrato do Arquiteto mantém
`reviewable` como alias de transporte e expõe a política efetiva como
`locked`, `revisable`, `free`, `conflict` ou `unknown`.

Publicado protege sempre URL, slug, canonical e marca. A principal só é
protegida por política `locked`, vínculo KGR confirmado ou arquitetura
confirmada. Publicado com política `reviewable` permanece com principal
candidata e usa `arquitetura_publicado`; publicado sem informação suficiente
fica `unknown`, sem travamento silencioso. Unidade nova usa `free` e
`formacao`.

`kgr_decisao`/`kgr_aplicabilidade` só são consumidos quando explícitos e
humanos: `NAO`/`not_applicable` vira não-KGR e estratégia competitiva; KGR
confirmado exige identidade principal–slug recebida/confirmada. Score, volume,
resultado, slug e similaridade não confirmam KGR.

ArticleDNA preserva política original/efetiva, contexto, intenção, volume,
resultados, URL, slug, canonical, publicação, relação keyword–URL, candidatas,
decisão humana, versão e snapshots integrais de KeywordDNA. A confirmação
humana cria sucessora, registra principal anterior e candidata escolhida,
confirma a relação, trava a nova principal e conduz a próxima SERP a
`fortalecimento` sem alterar a URL publicada.

O resultado SERP deve ser descobrível na linha do artigo e renderizado junto à keyword correspondente. O vínculo exige `articleId`, `keywordId` e a versão de KeywordDNA da referência; texto, ordem ou índice não são identidade. Após persistência, a UI fecha o preview, atualiza a linha, abre o suporte e mantém a recomendação visível. Assessment incompleto, conflito, erro, versão desatualizada ou recomendação sem hidratação devem ser estados explícitos e não podem substituir um assessment válido anterior.
Migrations, Minerador, componentes compartilhados e módulos consumidores.
## 27. Métricas Ads e KGR opcional

`allintitle` e `kgr` são evidências opcionais recebidas do Minerador. `null` significa indisponível ou não medido, nunca zero; sua ausência não bloqueia agrupamento, formação ou aprovação. KGR histórico permanece auxiliar e não é recalculado no Arquiteto.

O Arquiteto pode transportar, por keyword e referência ArticleDNA, um envelope normalizado de demanda Ads com média mensal, série temporal, CPC, competição Ads, close variants, tendência/sazonalidade e proveniência. CPC e competição Ads não representam dificuldade orgânica; close variants não decidem agrupamento; tendência e sazonalidade não aprovam calendário. Volume não escolhe sozinho a principal.

O Arquiteto não acessa Google Ads nem recebe credenciais, customerId, MCC ou
resposta bruta. DataForSEO é o único provider usado para a compatibilidade SERP
do Arquiteto por meio da Connection global READY; Radar e Planejador recebem
apenas evidências normalizadas pelos contratos autorizados. DeepSeek oficial é
opcional para revisão e nunca substitui decisão humana. Atualização de métrica
nunca substitui decisão humana, principal confirmada ou identidade publicada. Ver
`docs/04-arquiteto/propostas/metricas-google-ads-kgr-opcional.md`.

## 30. Experiência funcional sem infraestrutura

Infraestrutura de providers, Connections, capabilities, quotas e consumo é
responsabilidade da Plataforma. O Arquiteto apresenta somente ações e estados
funcionais da área.

O preview de SERP usa o título `Validar SERP`, informa o contexto editorial,
os artigos e as keywords previstas e não apresenta provider, créditos, quota,
capability, Connection, retries ou custo. A ação principal é `Validar SERP`.

A revisão assistida usa somente o rótulo `Revisar com IA`. Modelo, provider,
tokens, thinking, Connection e custo não fazem parte da experiência do módulo.
Falhas de infraestrutura são traduzidas para `Validação SERP indisponível no
momento.` ou `Não foi possível concluir a revisão com IA.`; códigos, provider,
capability, Connection, Usage e detalhes sanitizados permanecem no caminho
interno/server-side autorizado.

A indisponibilidade de SERP ou IA não bloqueia a planilha nem as ações manuais
autorizadas: mover artigos e silos, reorganizar keywords, definir principal,
secundária, reforço, Pilar/Suporte e confirmar a arquitetura quando os gates
editoriais estiverem atendidos continuam independentes.

## 31. SERP nas 4 lentes — 2026-09-23

Decisão do usuário: as 4 lentes (desktop-windows, desktop-macos, mobile-android, mobile-ios) valem em todo ponto de SERP orgânica. No Arquiteto:
- Formação e territorial leem a canônica em corpo e as extras pelo digest do cache. Cada lente vota, e o parecer grava um marcador de lentes.
- Um par converge só com sobreposição em 2 lentes ou mais.
- Nada é pago no clique: a tela mostra o plano de chamadas, e a rota recusa pagar além do autorizado.
- A lente canônica é gravada com 20 resultados.
- A concordância entre lentes conta em dobro só com 3 lentes observadas ou mais.
- A primária do Silo pela SERP é sempre proposta e só é gravada com aceite humano, na origem "lista nova".

Regras e itens no [adendo](propostas/adendo-quatro-lentes-arquiteto-2026-09-23.md).
