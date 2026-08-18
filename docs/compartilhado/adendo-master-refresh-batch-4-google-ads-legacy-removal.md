# Master Refresh Batch 4 — remoção do legado Google Ads

Status: pacote preparado; aplicação remota não autorizada nesta etapa.

## Contrato preservado

Google Ads permanece infraestrutura global server-side da Plataforma, com configuração exclusiva por `PLATFORM_ENV`. O provider técnico, as capabilities `google_ads_keyword_discovery` e `google_ads_keyword_metrics`, os 11 eventos de Usage e a Connection histórica permanecem no banco. A Connection histórica deixa de ser operacional (`revoked`) sem apagar `secret_ref`, metadata ou referências do ledger.

DataForSEO e OpenRouter permanecem fora do delta.

## Delta aprovado e bound

- remover 8 bindings, 8 grants e 2 quotas Google Ads do modelo comercial dinâmico;
- remover as tabelas vazias `minerador_google_ads_connections`, `google_ads_binding_targeting` e `google_ads_binding_account_state`;
- remover a função validadora exclusiva das duas últimas tabelas; seus triggers, policies e índices exclusivos desaparecem com os objetos;
- bloquear os writers administrativos genéricos de Connection, grant e binding para `google_ads`;
- não alterar Discovery, Metrics, provider técnico, capabilities ou Usage.

## Ordem operacional futura

1. publicar o código com os guards dos writers;
2. executar o preflight bound read-only e exigir PASS;
3. aplicar somente a migration do Batch 4;
4. executar o post-verifier bound e os testes direcionados;
5. manter o rollback como contingência manual, nunca automática.

Qualquer divergência de contagem, fingerprint, dependência ou estado da Connection interrompe a execução.
