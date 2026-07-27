# Roteiro manual — integridade editorial e publicados

Nao executar automaticamente e nao usar IA paga neste roteiro.

1. Selecione a marca que contem o artigo `tráfego pago vs orgânico para clínica de estética` e abra o Planejador.
2. Confirme que a keyword principal exibida corresponde ao texto da origem. Se houver alias do Radar, abra a proveniência e confira ID, versão KeywordDNA, marca e silo.
3. Confirme que `Silo` mostra o nome editorial e que `SiloDNA` aparece separado, com versão/proveniência quando o envelope estiver carregado. Ausência deve ser explícita; não aceite nome de DTO apresentado como SiloDNA.
4. Confirme a situação de publicação. Um briefing ou publicação existente deve mostrar `Publicado protegido`; divergência deve mostrar situação inconsistente; ausência deve mostrar situação não confirmada, nunca `Novo`.
5. Em Recursos editoriais, confira marca, keyword principal, slug, canonical e URL. Para publicado, slug/canonical devem estar desabilitados e a explicação deve dizer que a identidade estrutural está protegida.
6. Edite apenas estratégia, H1 quando permitido, SEO/meta permitido, seções, perguntas, entidades, fontes, links, CTA, imagens, blocos ou instruções. Salve uma cópia.
7. Tente alterar slug, canonical, keyword principal, marca ou vínculo de silo/unidade no payload. O salvamento deve recusar a sucessora e listar o campo protegido; a versão anterior deve permanecer intacta.
8. Com publicação desconhecida, confirme a proteção conservadora e a mensagem simples explicando que a verificação é necessária antes de alterar a identidade.
9. Com registros divergentes, confirme bloqueio de aprovação e indicação de reconciliação humana. Não sobrescreva nenhum registro de origem.
10. Recarregue o cockpit e confirme que a versão, as referências e a proteção permanecem. Não executar limpeza de localStorage/IndexedDB, migration, publicação ou escrita remota.

Limitação desta entrega: a sessão de navegador disponível em 2026-07-20 não tinha marca selecionada; por isso o artigo real não foi declarado validado.
