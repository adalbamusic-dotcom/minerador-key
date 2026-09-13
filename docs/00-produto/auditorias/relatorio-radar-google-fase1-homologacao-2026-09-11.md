# Relatório — Radar / Pesquisa Google — Fase 1 homologada — 2026-09-11

Registro datado e congelado da rodada usada na homologação manual. **Relatado
pelo usuário / smoke real.**

Este arquivo é fotografia, não contrato. O que vale como estado é
[docs/05-radar/estado-atual.md](../../05-radar/estado-atual.md); o que vale como
regra permanente é [docs/05-radar/spec.md](../../05-radar/spec.md).

## O que foi validado

Fluxo executado pelo USER em runtime real, com provider DataForSEO:

```text
RESET → START → ANALYZE → FINALIZE → F5
```

Camadas atravessadas: SERP canônica e auxiliares, universo multi-query, seleção
automática, extração de páginas, `failed_final` separado de `pending`,
verificação de fontes, persistência intermediária da amostra, readback,
consolidação de evidências, persistência final, concorrência otimista, bundle
de evidência congelado, reload sem provider, Blueprint editorial,
`SpecialistBriefs`, `VideoBriefs` e `PlannerHandoff v3`.

## Números da rodada

Estes números descrevem **uma** investigação. Não são invariantes do produto,
não são metas e não devem ser usados como limite, expectativa ou critério de
aceite de outra rodada.

| Medida | Valor |
| --- | --- |
| Consultas executadas | 4 |
| Consulta canônica | 1 |
| Consultas auxiliares | 3 |
| Referências observadas | 19 |
| Referências selecionadas | 18 |
| Páginas analisadas com sucesso | 12 |
| `failed_final` | 6 |
| Páginas comparáveis | 11 |
| Suficiência da análise | parcial |
| `SpecialistBriefs` produzidos | 1 |
| `VideoBriefs` produzidos | sim |

Verificação de fontes executada. Blueprint produzido. `FINALIZE` remoto
confirmado. Após F5, o bundle congelado foi preservado e nenhuma conclusão
diferente foi reconstruída.

## Leitura honesta dos números

`18 selecionadas = 12 analisadas + 6 failed_final`, e ao concluir
`PENDING = 0`. As seis falhas finais são fontes que não puderam ser extraídas —
`403`, `404`, `410`, `429`, timeout, `5xx` ou bloqueio de acesso — e entram como
**limitação declarada**, não como pendência.

A suficiência ficou **parcial**, e isso está correto: 11 páginas comparáveis
sustentam observação competitiva, e o sistema diz que sustentam parcialmente em
vez de arredondar para "suficiente". Suficiência parcial não invalida a
homologação; ela descreve a amostra daquela rodada.

## Limites desta homologação

- Vale para o modo **Google**. `YouTube` e `Amazon` não foram homologados.
- Vale para a Fase 1: investigação, evidência, congelamento e handoff. O
  consumo do handoff pelo Planejador não faz parte desta rodada.
- A área `Vídeos` não foi exercitada com engine de transcrição/extração, porque
  ela não existe.
- O workflow do Especialista foi exercitado até `PREPARED`. Nenhum pedido foi
  enviado; Telegram não faz parte desta homologação.

```text
GOOGLE_SEARCH_PHASE_1 = HOMOLOGADA
PROVIDER = DataForSEO (real)
MANUAL_UI_VALIDATED = YES (pelo USER)
FROZEN_BUNDLE_PRESERVED_AFTER_F5 = YES
YOUTUBE_SEARCH = NÃO HOMOLOGADA
AMAZON_SEARCH = NÃO IMPLEMENTADA
PLANNER_CONSUMPTION = PENDENTE
```
