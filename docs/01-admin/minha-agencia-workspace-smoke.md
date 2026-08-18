# Checklist manual — Minha Agência

Status: preparado, não executado pelo agente.

Pré-condições: snapshot pós-0021 registrado pelo operador; sessão Supabase válida; nenhum provider, e-mail, alteração de owner, membership, Brand ou storage local durante a validação.

## Admin global com Agency operacional

- Abrir `/admin` e confirmar que a Administração global continua acessível.
- Abrir `/agencias/{agencyRef}` pela referência canônica da Agency Adalba.
- Confirmar que a mesma identidade aparece como Admin global e como owner/membro operacional da Agency, sem troca de identidade.
- Confirmar Visão geral: nome, `ACTIVE`, completude, contagem real de membros e contagem real das duas Brands existentes.
- Confirmar que `/conta` continua pessoal e que não aparece seletor entre múltiplas Agencies.

## Dados e membros

- Abrir Dados da Agency e confirmar nome, status, owner e datas sem campos de application/invitation.
- Salvar uma alteração autorizada de nome somente se houver decisão humana; confirmar retorno seguro pela nova referência.
- Abrir Membros e confirmar owner, memberships, papéis, status e capabilities sem UUID manual.
- Confirmar que uma identidade Auth inexistente não é apresentada como membro salvo e que nenhum convite/e-mail é declarado como enviado.
- Confirmar que membro sem capability não acessa a área correspondente após nova leitura server-side.

## Brands

- Abrir Marcas e confirmar as duas Brands reais sem duplicação, recálculo, recriação ou alteração.
- Confirmar nome, status, vínculo e owner quando disponível; não exibir UUID técnico como campo de entrada.
- Abrir `Cadastrar Marca`, revisar o formulário e cancelar sem salvar.
- Não executar cadastro real neste smoke sem autorização específica; quando autorizado, confirmar Brand criada, vínculo Agency → Brand e ausência de `brand_membership` artificial.
- Confirmar que cadastro não inicia BrandDNA, Minerador, IA, SERP, editor ou e-mail.

## Permissões, estados e visual

- Repetir leitura com membro comum e confirmar somente leitura onde aplicável.
- Confirmar Agency suspensa/inexistente/referência divergente como erro ou restrição, sem fallback para outra Agency.
- Testar loading, vazio, erro, sucesso e teclado em desktop e mobile, em light e dark mode.
- Confirmar logout e retorno ao login sem limpeza de localStorage ou IndexedDB.

Não homologar nesta checklist: notifications, sino, activity, provider, Vault, dispatcher, webhook, e-mail real, consumo ou smoke 3B-R1.
