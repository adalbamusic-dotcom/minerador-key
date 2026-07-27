# ADR-001 — Site e Sitemap server-side com fallback local por marca

## Status

Aceito para a etapa de implementação local — 2026-07-21.

> **Estado verificado documentalmente — 2026-07-27:** a implementação local de preview, catálogo, verificação e importação seletiva segue esta ADR. A migration 0004 continua não aplicada nesta auditoria; persistência remota dedicada, validação browser autenticada e provider externo permanecem pendentes. Nenhuma chamada externa automática ou limpeza de armazenamento é permitida.

## Contexto

A Marca precisava catalogar URLs do site e permitir importação seletiva sem transformar a abertura da tela em crawler, sem expor requisições externas no navegador e sem contaminar DNA ou estado publicado. O checkout não possuía entidades persistidas para sitemap/catálogo e a migration operacional remota ainda não estava aplicada.

## Decisão

As requisições ao sitemap e às páginas são executadas somente pelas APIs server-side de Marca. A camada de fetch valida HTTP/HTTPS, host autorizado, DNS, redirects, Content-Type, timeout e limite de resposta, bloqueando redes reservadas. O estado operacional da etapa é persistido localmente por `brandId`, primeiro em IndexedDB e depois em localStorage, com erro de parse preservado para recuperação manual. A sincronização, verificação, extração e importação são sempre ações explícitas.

Keywords só seguem para a lista existente do Minerador após prévia e seleção humana. Conteúdo legado permanece referência no catálogo e não recebe DNA, plano, documento, aprovação ou identidade publicada inventados. A persistência remota fica condicionada à revisão/aplicação manual da migration 0004.

## Consequências

- O browser não acessa domínios externos diretamente e o carregamento inicial não executa crawler.
- O fallback local permite continuar a operação sem declarar persistência remota confirmada.
- Ausências de sitemap não são apagadas; são marcadas como obsoletas/stale.
- Domínios alternativos e provider remoto dedicado exigem decisão posterior e não são inferidos.
- A migration preparada depende dos contratos/policies operacionais existentes e não foi aplicada nesta etapa.

## Rollback

Reverter os arquivos da etapa remove a superfície nova sem limpar IndexedDB/localStorage e sem alterar artigos, DNAs, versões, hashes, anotações ou conteúdo publicado.
