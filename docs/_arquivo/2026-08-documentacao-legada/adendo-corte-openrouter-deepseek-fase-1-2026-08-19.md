> **HISTÓRICO — NÃO OPERACIONAL — 2026-08-27**
>
> Registro preservado durante a consolidação documental. Não é fonte de verdade nem autoriza implementação; consulte as fontes canônicas ativas em `docs/README.md`.

# Adendo arquitetônico — corte OpenRouter → DeepSeek — Fase 1

- **Status:** decisão registrada para auditoria e preparação; não autoriza implementação
- **Data:** 2026-08-19
- **Módulo proprietário:** Plataforma / Integrações compartilhadas de IA
- **SDD de referência:** `sdd-arquitetura-integracoes-plataforma-agencia-marca.md`
- **Auditoria vinculada:** `auditoria-corte-openrouter-deepseek-fase-1-2026-08-19.md`

Este adendo substitui, para a IA, qualquer decisão anterior que tratava o
OpenRouter como provider canônico ou como fallback operacional. A substituição
não foi implementada nesta fase. O runtime atual e as referências históricas
permanecem preservados para auditoria e serão cortados somente após os gates da
fase de implementação.

## Atualização posterior — Fase 2 local — 2026-08-19

O texto acima registra o estado da Fase 1. Na Fase 2, o corte local foi
implementado: DeepSeek é o único provider ativo, R5 e consumidores estruturados
usam a camada compartilhada, e OpenRouter não possui caminho ativo. A
Connection/secret remoto, health check real e smoke autenticado permanecem
pendentes; Usage e registros históricos OpenRouter não foram apagados ou
renomeados.

## Decisão canônica registrada na Fase 1

Uma operação de IA deve resolver, nesta ordem:

```text
operação → capability → Connection → provider → modelo explícito
```

Na primeira fase do novo provider:

```text
provider       = deepseek
connection     = única Connection da Plataforma
connectionScope= platform
base_url       = https://api.deepseek.com
model          = deepseek-v4-pro
```

O modelo é configuração da Connection e não uma Connection separada. Modelos
DeepSeek adicionais poderão ser autorizados posteriormente na mesma Connection,
com seleção explícita e validação própria.

## Regras de runtime do destino

- `OPENROUTER_RUNTIME = DISABLED` no destino do corte.
- `OPENROUTER_FALLBACK = FORBIDDEN`.
- `PARALLEL_PROVIDER_ROUTING = FORBIDDEN`.
- `AUTOMATIC_PROVIDER_SWITCH = FORBIDDEN`.
- Falha do DeepSeek retorna erro explícito, preserva o estado anterior e
  registra erro sanitizado. Retry somente por ação explícita.
- Nenhum módulo instancia cliente DeepSeek diretamente; todos usam a camada
  compartilhada de IA e o resolvedor de Connection.
- A credencial fica server-side, no Secret Store/Vault conforme o contrato de
  Connections. Não há chave de IA no browser, por módulo ou em `NEXT_PUBLIC_*`.
- Providers futuros exigem adapter oficial direto e Connection explícita; não
  podem ser introduzidos como fallback automático.

## OpenRouter histórico

Usage, eventos append-only, Connections, referências de segredo, diagnósticos,
modelos persistidos e demais registros antigos que tenham
`provider = openrouter` são preservados. Preservação histórica não autoriza
nova resolução, nova chamada ou restauração do OpenRouter no runtime.

O estado de destino é conceitualmente:

```text
provider          = openrouter
lifecycle         = legacy/retired
runtime_resolvable= false
```

Essa transição não altera banco, Connection, Vault, RLS, grants, bindings,
Usage ou dados remotos nesta fase.

## Limites da Fase 1 — histórico

Esta etapa entrega somente documentação e auditoria local do runtime. Ficam
proibidos: adapter DeepSeek, alteração de resolver ou consumidor, migration,
Connection remota, cadastro de segredo, alteração remota, chamada paga,
limpeza de histórico, instalação, commit, push e deploy.

O próximo gate depende do mapa de consumidores, da confirmação do catálogo
remoto quando necessária, do contrato de capability/binding/Usage e de testes
com fixtures. A auditoria vinculada registra o estado observado sem declarar
que DeepSeek já está disponível.


