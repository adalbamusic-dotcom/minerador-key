# SDD — agendamento durável do allintitle

## Módulo proprietário

Minerador — Extensão Chrome.

## Contrato atual

- O lote é isolado por `brandId`, `actorUserId`, `operationRequestId` e `batchId`.
- Somente `success` e `zero_results` confirmados atualizam `results_allintitle` pelo endpoint server-side.
- CAPTCHA, consentimento, bloqueio, timeout e falhas preservam dados anteriores.
- O estado operacional é salvo em `chrome.storage.session`.

## Problema

O executor mantém um laço assíncrono com espera em memória. Um service worker MV3 pode ser suspenso entre itens. Ao acordar, a reconciliação anterior tratava o estado ativo persistido como órfão, interrompendo listas longas.

## Proposta autorizada

- Manter o executor sequencial existente e agendar um watchdog com `chrome.alarms`, identificado pelo `batchId`.
- No alarme, recuperar o estado persistido, validar que ele ainda está ativo e continuar a partir de `index` caso o service worker tenha sido suspenso.
- Não exigir popup aberto, página do Minerador em foco ou bridge conectada depois da aceitação inicial do lote.
- Pausar em CAPTCHA, consentimento ou bloqueio; notificar pelo Chrome e trazer a aba Google para frente. Retomada continua explícita.
- Mostrar no Minerador apenas contador compacto feito/restante e ações pausar, retomar e cancelar.

## Compatibilidade e rollback

- Nenhum schema, endpoint, contrato de resultado, tenantização ou persistência de keyword muda.
- A chave de alarme é aditiva e pode ser removida em terminais, pausa, cancelamento e descarte.
- Se não houver alarme de um estado ativo legado, a operação permanece recuperável por retomada explícita; não se cria nova medição silenciosamente.

## Testes

- Leitor conserva fallback de texto principal da página para a contagem exibida pelo Google.
- Alarmes agendam, recuperam e continuam itens sem `sleep` entre medições.
- CAPTCHA, consentimento e bloqueio pausam, preservam dados e emitem alerta.
- Progresso, persistência por item, cancelamento, retomada e isolamento por marca permanecem cobertos.
