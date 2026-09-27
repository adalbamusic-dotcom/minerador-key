# SDD — Validação de artigos com SERP parcialmente em cache — 2026-09-26

**Módulo proprietário:** Arquiteto. **Autorização:** pedido do usuário para aproveitar as SERPs já pagas e manter o cartão de custos correto. **Estado:** implementação local; homologação remota pendente do deploy do usuário.

## Contrato atual e falha

A SERP por keyword fica no cache compartilhado por marca, consulta e lente. Um parecer de formação por artigo é outro artefato: precisa confrontar a composição atual com a SERP e confirmar a gravação. O fluxo antigo, quando uma minoria das lentes faltava, oferecia pagar ou cancelar. Cancelar deixava todos os artigos sem parecer, inclusive os que já tinham toda a evidência necessária. O plano agregado não identificava as keywords faltantes.

## Proposta aplicada

A rota de formação mantém `plan` e `execute` e aceita o campo aditivo `cacheOnly`. Nessa opção, orçamento autorizado é zero, lentes extras faltantes não são pagas e recoleta é proibida. A rota reaproveita o cache, grava com readback os pareceres dos artigos atendidos e devolve falhas individuais para os que precisariam de lente canônica ausente ou corpo ilegível. Nenhum provider, Secret Store ou ledger de gasto é chamado nesse caminho. O plano acrescenta detalhes de keyword, lente e razão da falta; o cartão continua mostrando quantidade e custo das chamadas pagas possíveis e oferece a opção gratuita somente na formação.

Se a leitura da metadata do cache falhar, **a coleta não fica proibida** (D6 de `docs/compartilhado/regras-serp-e-assuntos-2026-09-26.md`). No modo `plan`, e também no `execute` pago, a rota trata todas as consultas como falta — o custo máximo —, devolve `cacheUnavailable: true` e o motivo “cache ilegível” em cada falta. A tela avisa que não dá para saber o que já está no cache e oferece três saídas: coletar com o custo máximo (o servidor continua recusando pagar além do autorizado), “Tentar ler o cache de novo” ou cancelar sem pagar. A opção gratuita “analisar com o cache” **não é oferecida** com o cache ilegível, porque não há o que ler; se alguém a pedir pela API (`cacheOnly`), a rota devolve `SERP_CACHE_UNAVAILABLE` (503) sem custo, dizendo as duas saídas. O total “No cache” conta metadata; o corpo e o digest são conferidos na execução. Entrada degradada resulta em falha individual na opção gratuita, sem pagamento ou inferência de evidência.

Cancelar o pagamento não cancela a análise: a escolha “Cancelar pagamento · analisar com o cache (US$ 0)” envia `cacheOnly`, e os artigos com evidência completa no cache recebem parecer gravado com readback; só os que dependem de coleta ficam pendentes, cada um com o motivo (`SERP_PENDING` no readout). Os contadores `SERP_COLLECTED` e `SERP_REUSED` contam **pareceres de artigo confirmados no acervo**, não entradas do cache por keyword; o readout traz essa legenda na própria linha. No modo `plan`, a lista de faltas das lentes extras não depende de a leitura devolver a posição (a chave sai da própria consulta), para uma leitura incompleta não derrubar o plano.

O cálculo de sobreposição da proposta lógica é separado da disponibilidade do cache e do parecer SERP. Não se declara artigo validado apenas por existir SERP da keyword.

A regra de quatro lentes passa a incluir artigos de uma keyword. O plano mostra as três extras caso faltem; o leitor utiliza os digests já pagos por aparelho. Um parecer parcial fica legível e persistido com as lentes faltantes, mas o gate `incomplete` bloqueia a conclusão e o envio ao Radar até completar as quatro lentes. Registros legados sem marcador de lentes continuam com estado desconhecido para essa checagem, sem atribuir artificialmente quatro leituras; a revalidação deles é frente separada.

## Consumidores, compatibilidade e riscos

Consumidores: mesa de Artigos, rota `/api/arquiteto/serp`, plano em blocos, gate de formação, leitura para o Radar, catálogo MCP e leitor dos pareceres. O formato anterior da requisição continua válido; `cacheOnly` é opt-in. Não muda schema, cache, KeywordDNA, ArticleDNA, identidade publicada, fronteiras de módulos nem fluxo territorial da SERP. O risco de uma lente que o plano contou como presente perder o corpo na execução resulta em falha individual sem cobrança. Rollback: remover opção gratuita e campos aditivos do plano, restaurar a exceção dos unitários e o gate antigo; os pareceres já gravados permanecem versionados.

## Verificação

Teste de rota com dois artigos, um integralmente em cache e outro sem lente canônica: um parecer, uma falha nomeada, zero chamadas ao provider e zero consumo. Teste de rota com o cache ilegível: plano com custo máximo e `cacheUnavailable`, nenhum pagamento sem autorização, coleta até o teto autorizado e `cacheOnly` com 503 sem custo. Teste da tela: sem `cacheUnavailable`, “Cancelar pagamento · analisar com o cache (US$ 0)”; com ele, só coletar, ler de novo ou cancelar. Teste do readout: 40 pareceres do cache e 15 pendentes dão `SERP_COLLECTED = 0 · SERP_REUSED = 40 · SERP_PENDING = 15`, com o motivo em cada bloqueado. Teste do runner em três blocos: orçamento zero em todos. Executar lentes do Arquiteto, testes em blocos, agente, TypeScript, build, lint direcionado e `git diff --check`. A leitura remota das entradas reais da marca e o smoke após deploy permanecem pendentes; não executar chamadas pagas para homologar.
