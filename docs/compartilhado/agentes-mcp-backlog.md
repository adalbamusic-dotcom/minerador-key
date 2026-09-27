# Agentes operacionais e MCP — estado e backlog

## Atualização do protocolo e da prontidão — 2026-09-26

- **Verificado localmente:** o servidor anuncia 31 ferramentas na mesma URL:
  14 do Redator e 17 da plataforma. `test:agent` confere catálogo, rotas e
  ferramentas de plataforma; `test:redator:mcp` confere o servidor integrado,
  inclusive todas as ferramentas catalogadas.
- **Verificado remotamente por GET, somente leitura:** `/api/mcp/redator/health`
  e `/.well-known/oauth-protected-resource/api/mcp/redator` retornam HTTP 200
  e declaram OAuth configurado. A implantação remota ainda anuncia o serviço
  legado `minerador-key-redator-mcp` e o nome de recurso `Minerador Key —
  Redator`; ela não informa hash do catálogo. Portanto, a resposta não comprova
  que a versão local atual esteja publicada.
- **Alteração local desta revisão:** o health passa a divulgar o hash SHA-256
  do guia/catálogo, a quantidade de tópicos e a quantidade total de ferramentas
  catalogadas. Após o deploy, comparar esse hash remoto ao
  `PLATFORM_CATALOG_HASH` local. O hash esperado deste checkout é
  `8600db73353959f2f015311fa3bfc7365372dff5424ad955a604bb6dee2f877e` (31
  ferramentas). O health continua sem afirmar que um cliente
  Claude autenticou ou executou uma ferramenta.
- **Validação desta revisão:** `test:agent` 44/44, `test:mcp:runtime` 5/5,
  `test:redator:mcp` 117/117, `tsc --noEmit` e build passaram. O teste de
  protocolo agora compara o total de ferramentas com o catálogo, sem congelar
  uma contagem ultrapassada; `test:agent` também garante que o guia explica a
  formação automática de artigos e informa que o MCP ainda não a dispara por
  ferramenta. Não houve escrita remota, migration, deploy ou chamada paga.
- **Pendente para homologar Claude:** aplicar M8/M9 quando necessárias, fazer
  deploy, reconectar/reconsentir o cliente para os escopos novos e executar
  uma chamada autenticada de leitura e uma operação de prévia. As operações do
  Arquiteto e a investigação/finalização do Radar seguem marcadas como
  operações de tela no catálogo; o MCP orienta essas etapas, mas não as dispara.

## Estado desta revisão — 2026-09-26

O endpoint único continua sendo `/api/mcp/redator`. O catálogo em
`lib/agent/platform-catalog.ts` gera o guia, os próximos passos e o hash entregue
ao cliente MCP. `test:agent` verifica a sincronia entre catálogo, rotas e
ferramentas.

**Implementado no código local nesta revisão:** Lógica determinística de
keywords; prévia e aplicação com aceite explícito para Vínculo, aplicabilidade
KGR, aprovação/rejeição de keywords, aprovação do documento e criação do
registro interno em Publicações. O fluxo respeita o ator autenticado, permissões
por módulo e marca, `decisionHash`, compare-and-swap/readback e auditoria do
aceite. O escopo `platform.decide` é opt-in e não vem marcado por padrão.

**Verificação local final desta revisão:** TypeScript passou; `test:agent`
44/44, `test:arquiteto` 2.396/2.396, `test:redator` 358/358 e
`test:minerador:dom` 4/4 passaram. O teste direcionado do Workbench/publicados
passou 75/75. A checagem visual global ainda acusa dívida de outros arquivos;
nenhuma gravação remota foi executada.

**Ainda não homologado:** Claude conectado após deploy, consentimento do escopo,
MCP contra dados remotos, persistência na marca AdalbaPro e os fluxos editoriais
completos. Nenhuma escrita remota, migration, deploy ou chamada paga foi feita
nesta revisão.

## Como a IA sabe o que fazer

`lib/agent/platform-catalog.ts` é a fonte única: etapas, pré-condições, custo,
quem decide, onde clicar, playbooks e critérios de SEO. Toda mudança de processo
precisa atualizar o catálogo e seus testes na mesma entrega (`AGENTS.md` §17.1).

## Escopos

| Escopo | O que libera |
|---|---|
| `writer.read`, `writer.draft.write`, `writer.media.brief` | leitura, escrita e mídia do Redator |
| `platform.read` | retrato da marca, busca de tema, keywords, próximos passos e prévias |
| `minerador.write` | Assuntos, pesquisa por Assunto, importação, Lógica e handoff ao Arquiteto |
| `arquiteto.write` | operações autorizadas do Arquiteto quando houver ferramenta correspondente |
| `radar.write` | enviar pacotes finalizados ao Redator |
| `platform.decide` | aplicar decisões humanas aceitas no chat, com prévia, hash, permissão e auditoria; **opt-in** |
| `provider.spend` | executar pesquisa paga depois do plano e aceite; **opt-in** |

As migrations M8/M9 estão no repositório. M9 acrescenta `platform.decide` aos
checks de grants e delegações. O usuário precisa aplicar a migration necessária
antes do deploy; não executar `db push`. Confirmar no banco se M8 já foi aplicada
antes de decidir a ordem.

## Operações disponíveis no MCP

- **Minerador:** declarar Assuntos; plano e execução paga da pesquisa por
  Assunto; importar candidatas; rodar Lógica determinística; decidir Vínculo,
  KGR e aprovação depois do aceite no chat; enviar keywords aprovadas ao
  Arquiteto. A medição Volume/Resultados ainda fica na tela.
- **Arquiteto:** leitura e validação de plano de silo; formação, SERP,
  confirmação, InternalLinkGraph e envio ao Radar ainda são operações de tela.
  Conteúdo publicado é reconhecido pelo Vínculo e canonical, sem confirmação
  duplicada. Assunto já declarado tem formação automática iniciada na tela;
  keywords livres e propostas novas mantêm seus próprios gates.
- **Radar:** leitura e handoff de pacotes finalizados ao Redator. Pesquisa,
  investigação e finalização ainda são operações de tela.
- **Redator/Publicações:** ler evidências, salvar rascunhos e mídia, conferir o
  Guardião, aprovar documento com aceite humano e criar o `PublicationRecord`
  interno com aceite. Não há publicação externa por MCP.

O catálogo indica com `access: "ui"` cada operação que a IA ainda não executa.
`decision: "human"` continua significando que a decisão pertence ao usuário;
`chatConfirmationRequired` só habilita a aplicação delegada após aceite
específico.

## Próximas fatias

1. **Minerador — medição:** extrair dos fluxos atuais um núcleo de servidor
   compartilhado para Volume, Resultados e KGR, com `plan` gratuito, custo,
   `authorizedPlan`, aceite e readback. Os providers não foram chamados nesta
   revisão.
2. **Arquiteto:** extrair do Workbench os núcleos de proposta, formação e
   confirmação. Separar processamento sem decisão de confirmação delegada;
   manter publicados efetivados no primeiro processamento, respeitar os
   contratos de ArticleDNA/SiloDNA/SiloPage e preservar links/canonical.
3. **Radar:** extrair investigação, salvamento e finalização em núcleo
   compartilhado com a tela; medições e evidências pagas exigem planejamento e
   `provider.spend`.
4. **InternalLinkGraph:** expor leitura e operações compatíveis com o contrato
   próprio depois da extração segura do núcleo da tela.
5. **Claude:** depois de migration/deploy, reconsentir com a marca e os escopos
   necessários, testar guia → estado → busca de tema → prévia de Assuntos, e
   então homologar um fluxo completo com dados reais.

Autonomia sem instrução e aceite do usuário continua fora de escopo. A IA pode
sugerir caminhos; ela não inventa aprovações, evidências ou dados publicados.

## Correções da auditoria de 2026-09-26 (segunda rodada) — só no código local

Auditoria em 6 frentes com verificação adversarial: 107 achados confirmados. Parte foi
resolvida no commit `339a754` (consentimento com mais de 3 escopos, hash do catálogo,
ferramentas de decisão delegada). Esta rodada corrigiu o que continuava aberto:

- **Radar finalizado** passa a ser o carimbo da análise corrente
  (`radarFrozenObservedAtOfAnalysis`), lido estreito (553 B para 3 artigos), e não o
  estado `approved`, que o fluxo atual não grava. Na Care Glow, o artigo finalizado em
  16/09 sem documento passa a gerar `radar.send_to_writer`.
- **Colisão com publicado:** `pathOfUrl` aceita o formato real do catálogo, sem esquema
  (`publishedPathOf`). Antes, as 41 páginas da Care Glow viravam null.
- **Busca de tema:** plural `-es` ("melhor" × "melhores"), tema de uma palavra só é
  "mesmo tema" na igualdade, teto por tipo com totais, publicado primeiro no empate.
- **Conta → Conexões de IA** marca só o padrão (sem gasto nem decisão delegada); sugestão
  da Agência nunca pré-marca opt-in; o link de reconsentimento (`reconsentUrl`) chega no
  `scope_denied` mesmo com grant, e o login preserva `mcp_client`.
- **Posto da principal publicada** saiu de `set_keyword_vinculo`: o adendo §3 e o
  `AGENTS.md` §11 o mantêm fora do MCP.
- **P4 do Assunto:** os dois chamadores MCP entram na lista fechada, com teste que prova
  aceite → hash → aplicar.
- Testes: `test:agent` 54/54, `test:redator:mcp` 117/117, `test:redator` 358/358, P4
  16/16, tsc e lint limpos. Todos os testes novos falham no código anterior.

**Verificado no banco (só leitura) em 2026-09-26 23:4x:** a m9 **não** está aplicada
(`platform.decide` ausente dos dois CHECK) e não existe grant do Claude.

**Ainda aberto:** medição Volume/Resultados como ferramenta; status efetivo da keyword
(S6); BrandDNA no retrato (J13); `redator.finalize`/`send_to_publications` no catálogo
e nos próximos passos (S8); Guardião bloqueando prosa com "definir"/"pendente" (S14);
`test:agent` fora do `npm test` (S5); mapeamento de erros por status (R9); limite de
chamadas contando dois eventos (J5). O catálogo e o `package.json` estavam sendo editados
por outra sessão e não foram tocados nesta rodada.
