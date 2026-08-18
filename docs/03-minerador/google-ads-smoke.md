# Smoke manual Google Ads

Status: preparado localmente; ainda não homologado com uma chamada real.

O script consulta uma única keyword sem criar rota, persistência, tabela, cache de dados ou alteração no banco. Ele reutiliza o cliente REST, OAuth, resolução explícita de conta e normalizadores em `lib/google/ads`.

## Pré-requisitos

- Variáveis `GOOGLE_ADS_*` configuradas somente no ambiente server-side.
- `customerId` da conta anunciante informado manualmente.
- `loginCustomerId` informado somente quando a hierarquia MCC exigir; sem fallback de marca ou conta.
- Linguagem, pelo menos uma geolocalização, rede e `includeAdultKeywords` informados no comando.

## Diagnóstico sem API

Antes do smoke real, execute:

```powershell
npm run google-ads:smoke -- --check-config
```

O comando carrega `.env`, `.env.local` e o ambiente atual pelo carregador do Next.js. Ele informa apenas se a configuração foi carregada/completada ou os nomes das variáveis `GOOGLE_ADS_*` ausentes; não chama a API e não persiste dados.

Use `npm run google-ads:smoke -- --help` para ver a finalidade, os parâmetros, o formato de customerId e um exemplo sem credenciais.

## Comando manual

```powershell
npm run google-ads:smoke -- --customer-id 1234567890 --login-customer-id 1112223333 --keyword "marketing para clínicas" --language languageConstants/1014 --geo-target geoTargetConstants/2076 --network GOOGLE_SEARCH --include-adult-keywords false
```

Substitua o número de exemplo pelo ID real de 10 dígitos, sem hífens. Para uma conta sem MCC, omita apenas `--login-customer-id`. Não omita os demais argumentos e não execute o comando como teste automatizado.

## Saída a compartilhar

Compartilhe apenas o JSON sanitizado: provider, versão, ID mascarado, presença de MCC, moeda, timezone, targeting, keyword, canônica, close variants, volume médio, histórico mensal, concorrência, índice, lances, data, não associadas e duração.

O script nunca imprime access token, refresh token, client secret, developer token, header Authorization, cookies ou resposta bruta. Erros incluem estágio e `apiRequestStarted`; configuração ausente lista somente nomes de variáveis.

## Limites

O smoke real ainda é uma operação manual pendente. RapidAPI e a Extensão permanecem ativas; não há rota produtiva, persistência, associação marca-conta ou paridade validada.
