# Backlog — Publicações
## Links a ativar (F5 da SDD silo interligado) — 2026-10-14
- [x] Destino que vai ao ar → "Links a ativar" nos artigos que ligam para ele (Radar, `-links.csv`, MCP `get_silo_links_update`, Redator), sem editar a página nem URL/slug/canonical. Nada mudou no código de Publicações.
- [ ] Avaliar: depois de registrar a URL de um artigo, Publicações apontar "N links a ativar no Silo" com o caminho para o Radar (SDD §6.5 cita Publicações; exigiria ler a malha na tela de Publicações — fora da frente "listas leves").
- [ ] **Dono:** depois de publicar um destino novo do Silo piloto, conferir os links a ativar no Radar.

## Assunto legível — 2026-10-13
- [x] Grade e Biblioteca mostram "Assunto · …" quando o artigo tem Assunto.
- [ ] **Dono:** conferir na tela.

## Agora
- **Objetivo:** validar manualmente com fixture a jornada completa: importação, fila, download, URL manual, atualização e reedição.
  - **Módulo proprietário:** Publicações
  - **Arquivos permitidos:** testes e `docs/08-publicacoes/**`
  - **Arquivos proibidos:** CMS externo, migrations e Redator sem SDD
  - **Dependências:** fixture de documento aprovado
  - **Riscos:** promoção indevida ou alteração estrutural
  - **Critério de aceite:** somente aprovado entra; arquivo é baixado; URL é informada pelo usuário; atualização não altera campos protegidos
  - **Testes obrigatórios:** `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test tests/publicacoes-domain.test.mts`, `test:operational`, `test:editorial`, `test:redator`
## Próximo
- Confirmar manualmente a migration operacional, persistência/reload do payload aditivo e conflito de `lock_version`.
## Depois
- Definir SDD própria para integração externa/CMS quando houver destino e credenciais autorizados.
## Bloqueado
Primeiro documento final e destino de publicação.
## Descartado
Publicar automaticamente na ausência de aprovação humana.
## Concluídos recentes
- 2026-10-12 · F6 da SDD do plano declarado e grupos: etiqueta de cor na barra global e listas (Biblioteca, Fila,
  Publicados, Atualizações) filtradas pelo grupo do artigo, com faixa e etiqueta. **Validado manualmente: não** —
  homologação do dono pendente (escolher uma cor em Publicações e conferir as quatro listas).
- Auditoria documental inicial em 2026-07-20.
- SDD e implementação de fila, exportações, publicação manual, URL protegida, atualização e histórico em 2026-07-20.

## Consolidacao fisica concluida - 2026-07-23
- Implementacoes exclusivas da area permanecem em modules/publicacoes; nenhum contrato ou rota foi alterado nesta etapa.
- Validacao manual autenticada e persistencia remota seguem pendentes.
