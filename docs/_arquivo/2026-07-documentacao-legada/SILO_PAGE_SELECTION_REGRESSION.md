# Diagnostico da regressao de selecao da SiloPage

## Causa raiz

O checkbox da Pagina do Silo no cabecalho do silo era escondido quando a pagina ainda nao existia (`if (!pageVersion) return null;`). O usuario via apenas o checkbox azul dos artigos, nao o checkbox teal da Pagina do Silo.

Isso violava o requisito de que o checkbox deve permanecer visivel mesmo quando a pagina ainda nao estiver gerada.

## Correcoes aplicadas

1. Checkbox da Pagina do Silo sempre visivel: Removida a condicao if (!pageVersion) return null. O checkbox agora aparece para todos os silos com siloId, fica habilitado quando o SiloDNA existe e desabilitado quando nao existe.

2. Tooltip dinamico: Quando o SiloDNA existe: "Selecionar Pagina do Silo". Quando nao existe: "Gere o SiloDNA primeiro para trabalhar a Pagina do Silo."

3. Badge "Pagina Pendente": Quando a Pagina do Silo ainda nao foi gerada, mostra "Pagina Pendente" em vez de esconder o badge.

4. Status badge sempre visivel: Removida a condicao que escondia o status quando era pending. Agora mostra o status mesmo quando pendente.

5. Removida restricao !startsWith("tmp-"): O checkbox da Pagina do Silo agora aparece para todos os silos, nao apenas para silos nao-tmp.

## Arquivos modificados

- app/(workspace)/arquiteto/page.tsx - checkbox, badge e status da Pagina do Silo