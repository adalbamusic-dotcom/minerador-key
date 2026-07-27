# Proposta tÃ©cnica â€” restauraÃ§Ã£o da Ãºltima organizaÃ§Ã£o do Minerador

**Data:** 2026-07-22
**MÃ³dulo proprietÃ¡rio:** Minerador
**Escopo:** localizado Ã  preferÃªncia visual de filtros e ordenaÃ§Ã£o da tela `/minerador`.

## DiagnÃ³stico

A preferÃªncia jÃ¡ Ã© gravada na chave `minerador-pro:last-view:<usuÃ¡rio>:<marca>:minerador`, mas o leitor compartilhado Ã© montado somente dentro do painel `Organizar`. Assim, a leitura e a aplicaÃ§Ã£o sÃ³ comeÃ§am depois do clique que abre o painel.

## DecisÃ£o

Substituir, somente no Minerador, essa montagem condicional por um restaurador local que usa a mesma chave e o mesmo formato de valores. Ele serÃ¡ montado independentemente de `Organizar`, apÃ³s usuÃ¡rio, marca e carregamento da coleÃ§Ã£o estarem resolvidos.

- A chave continua isolando usuÃ¡rio, marca e mÃ³dulo; nÃ£o hÃ¡ nova persistÃªncia de domÃ­nio, migration ou mudanÃ§a de contrato pÃºblico.
- O leitor aceita valores legados reconhecidos e normaliza somente campos conhecidos.
- JSON invÃ¡lido, campos invÃ¡lidos e uma referÃªncia a silo inexistente sÃ£o ignorados com seguranÃ§a; nenhum item de `localStorage` Ã© removido.
- A primeira gravaÃ§Ã£o da montagem Ã© suprimida para nÃ£o sobrescrever a preferÃªncia antes de ela ser aplicada.
- A coleÃ§Ã£o da tabela continua derivada diretamente de `keywords` e filtros pela projeÃ§Ã£o memoizada existente. `Organizar` continua sendo apenas visibilidade do painel.

## Riscos e rollback

O `localStorage` Ã© uma preferÃªncia exclusivamente local e pode estar indisponÃ­vel no navegador; nesse caso a pÃ¡gina mantÃ©m os filtros padrÃ£o, sem limpar dados. O rollback consiste em remover o restaurador local e restabelecer a montagem anterior, sem efeito sobre dados do domÃ­nio ou registros remotos.

## ValidaÃ§Ã£o

Testes unitÃ¡rios cobrirÃ£o chave por usuÃ¡rio/marca, preferÃªncia vÃ¡lida, valores legados, JSON invÃ¡lido, silo inexistente e rÃ³tulos do botÃ£o. A regressÃ£o de hidrataÃ§Ã£o confirmarÃ¡ que o painel nÃ£o participa da coleÃ§Ã£o exibida.
