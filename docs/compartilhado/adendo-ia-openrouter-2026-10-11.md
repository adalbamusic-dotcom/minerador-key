# Adendo — IA da plataforma volta para a OpenRouter

- **Data:** 2026-10-11
- **Status:** decisão do dono, implementada localmente; deploy e smoke real pendentes e executados pelo usuário.
- **Módulo proprietário:** Arquitetura compartilhada / Integrações (Admin global).
- **Precede:** o adendo de precedência OpenRouter → DeepSeek de 2026-08-19 na
  [SDD de integrações](sdd-arquitetura-integracoes-plataforma-agencia-marca.md).
  O histórico daquele corte continua em `docs/_arquivo/` e não volta a valer.

## Decisão

O dono pediu, em 2026-10-11, para deixar de trabalhar com a DeepSeek e gastar os
créditos já existentes na OpenRouter. A capability `ai_generation` passa a
resolver a Connection global **OpenRouter**. O modelo padrão é
`openai/gpt-6-luna-pro`. O dono escolheu a variante `:batch`, mas ela não funciona
no endpoint de chat; veja a correção de 2026-10-12 abaixo.

A Connection DeepSeek continua READY no banco, mas não recebe chamadas. Ela fica
como reserva para rollback.

## Correção de 2026-10-12 — a variante batch não funciona no chat

A primeira chamada real devolveu "O provider de IA respondeu com erro HTTP 404". Uma chamada de diagnóstico autorizada pelo dono mostrou a mensagem que a plataforma descarta: a OpenRouter recusa `openai/gpt-6-luna-pro:batch` no endpoint chat/completions, porque essa variante usa um adaptador de lote. A mesma chamada com `openai/gpt-6-luna-pro` voltou HTTP 200 em cerca de 2 segundos, com JSON válido.

- O padrão do código passou a ser `openai/gpt-6-luna-pro`.
- `OPENROUTER_MODEL` terminado em `:batch` agora é recusado pelo resolvedor com 409 e uma instrução clara, antes de qualquer chamada.
- A lista de modelos conhecidos da metadata não tem mais variantes batch.
- Custo das duas chamadas de diagnóstico: a recusada não foi cobrada; a aceita custou US$ 0,000165.
- A suposição anterior, de que a variante batch era síncrona pela metade do preço, estava errada.

## Contrato anterior

- O runtime mapeava `ai_generation` para `deepseek` nos dois mapas de
  `lib/server/integrations-runtime.ts`.
- `resolveDeepSeekCanonicalConfig` recusava qualquer provider diferente de
  DeepSeek. A chave vinha só do Secret Store da Connection.
- A camada `lib/server/structured-ai.ts` aceitava somente `provider: "deepseek"`.
- O painel de Admin escondia a OpenRouter, e um teste estático proibia a palavra
  "openrouter" no runtime.

## Contrato novo

| Ponto | Como ficou |
|---|---|
| Roteamento | `ai_generation` → `openrouter` nos dois mapas do runtime. |
| Âncora | A Connection OpenRouter global precisa estar READY e com segredo. Ela continua sendo a âncora de autorização e do ledger de uso. |
| Chave | `OPENROUTER_API_KEY` da env do servidor tem precedência. Sem env, vale o segredo da Connection no formato `{ "OPENROUTER_API_KEY": "..." }`. |
| Modelo | `OPENROUTER_MODEL` da env, se for um slug válido e sem `:batch`. Senão, a metadata da Connection, só se apontar para um modelo conhecido. Senão, o padrão do código. |
| Raciocínio | Sem `temperature`. O modo de Thinking da operação vira `reasoning.effort`: desligado vira `low`, padrão vira `medium`, ligado vira `high`. O raciocínio não volta na resposta, mas é cobrado. |
| Orçamento | Na OpenRouter `max_tokens` inclui o raciocínio. Cada operação continua pedindo só o orçamento da resposta. O cliente soma uma folga de 8 mil, 16 mil ou 32 mil tokens conforme o esforço, até o teto do modelo. |
| Erros | HTTP 402 vira mensagem de crédito. Erro do provedor de origem dentro de um HTTP 200 vira erro com o status de origem. Resposta vazia cortada por tamanho vira erro próprio e não é repetida automaticamente. |
| Atribuição | Cabeçalhos `X-Title: Minerador Key` e `HTTP-Referer` com a origem da aplicação. Nenhum carrega segredo. |
| Admin | Card OpenRouter com chave, modelo em uso e origem do modelo. O teste de conexão consulta só `GET /api/v1/key`, que não gera texto nem gasta crédito. A DeepSeek aparece como reserva. |

A metadata remota da Connection OpenRouter ainda guarda o modelo
`deepseek/deepseek-v4-pro-0813`, de 2026-08. Por isso a metadata só vale quando
aponta para um modelo conhecido; esse valor antigo é ignorado sem escrita no
banco.

## Consumidores preservados

As rotas de IA não mudaram de assinatura: todas continuam chamando
`resolveDeepSeekCanonicalConfig` e `generateStructuredAI` ou
`generatePlainTextAI`. O nome ficou por compatibilidade; `resolveAICanonicalConfig`
é o mesmo resolvedor com nome neutro.

- Arquiteto: article-dna, silo-dna, silo-page, silo-review, territorial-ai,
  âncoras de links internos, revalidate-structure, melhoria de publicados e
  diferenciação.
- Radar: tópicos, artigo-modelo da SERP e organização de especialista no worker.
- Redator: improve, section e seed.

Alterações aditivas nesses consumidores:

- As chaves de idempotência do ledger em âncoras e territorial-ai usam o
  provider resolvido como prefixo, em vez de `deepseek:` fixo.
- O diagnóstico de revalidate-structure passou a expor `provider`, e a revisão
  de keywords grava o provider real.
- O worker do Radar grava o provider real na organização do especialista.
- Textos de tela, MCP e catálogo do agente dizem "IA da plataforma (OpenRouter)".

## Riscos

- **Variante batch.** Não funciona no endpoint de chat e agora é recusada no
  resolvedor. O timeout padrão das operações é 180 segundos e a melhoria de
  publicados tem 120 segundos de função; a chamada de diagnóstico sem batch levou
  cerca de 2 segundos.
- **Custo do raciocínio.** O modo pro raciocina muito. A folga de tokens limita o
  teto, não o gasto real. O consumo aparece no painel da OpenRouter.
- **Health check marca erro.** Como nos outros providers, um teste de conexão
  que falha deixa a Connection em erro, e a IA para até um teste bem-sucedido.

## Rollback

1. Voltar as duas linhas `ai_generation` de `lib/server/integrations-runtime.ts`
   para `"deepseek"`.
2. Fazer deploy. A Connection DeepSeek já está READY e o ramo DeepSeek do
   resolvedor continua no código.

Nenhuma migration nem escrita remota foi feita, então não há dado para reverter.

## Testes

- `npm run test:ai-provider` com 42 testes: corte estático, cliente OpenRouter,
  resolvedor, Admin, seleção legada e cliente DeepSeek de reserva.
- Testes de health check da OpenRouter em `tests/platform-integrations-health.test.mts`.
- `test:integrations-runtime`, `test:arquiteto`, `test:agent`, `test:radar` e
  `test:redator` verdes. Nenhum teste chama a OpenRouter nem consome crédito.

## Autorização

O dono autorizou a troca de provider no chat em 2026-10-11. A autorização não
cobre escrita no Supabase remoto, migration nem chamada paga de teste. O deploy,
a env na Vercel e o primeiro uso real ficam com o usuário.
