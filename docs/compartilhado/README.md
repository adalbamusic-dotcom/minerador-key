# Código compartilhado

Esta pasta documenta a fronteira compartilhada, não um módulo proprietário. Consumidores atuais incluem providers de sessão/marca/pipeline, contratos editoriais, autorização, repositórios e componentes operacionais. Mudanças aditivas, mínimas, retrocompatíveis e necessárias podem prosseguir dentro da tarefa autorizada quando preservam o contrato, mapeiam consumidores e incluem regressão. Mudanças estruturais ou incompatíveis exigem proposta SDD com snapshot, rollback, testes e autorização.

Principais arquivos: `components/providers.tsx`, `components/brand-context.tsx`, `components/editorial-pipeline-context.tsx`, `lib/editorial/**`, `lib/server/**` e `components/product-shell.tsx`. `components/product/operational-pages.tsx` é referência histórica e não deve ser tratada como consumidor atual.
