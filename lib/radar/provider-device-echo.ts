/**
 * O APARELHO QUE O PROVIDER DIZ TER USADO — SDD do Radar nas quatro lentes, R5.
 *
 * YouTube e Amazon Merchant continuam em LENTE ÚNICA: o pedido não manda
 * `device` nem `os`, e nada no repositório prova que o endpoint aceite macOS
 * ou iOS, nem que os itens mudem com o aparelho. O que existe é o ECO — a
 * DataForSEO devolve, em `tasks[].data`, o que executou (`desktop`/`windows`
 * por padrão).
 *
 * O eco é gravado na proveniência como o que ele é: a declaração do provider
 * sobre a coleta, nunca a prova de que o aparelho muda o resultado. Adotar
 * outras lentes nesses endpoints depende de medição autorizada (D8).
 *
 * Domínio puro: lê um corpo já recebido; sem fetch, sem provider.
 */

export type RadarProviderDeviceEcho = { device: string | null; os: string | null };

const texto = (valor: unknown) => (typeof valor === "string" && valor.trim() ? valor.trim() : null);

/** O eco da PRIMEIRA tarefa que declara aparelho. `null` quando nenhuma declara. */
export function radarProviderDeviceEchoOf(body: unknown): RadarProviderDeviceEcho | null {
  const raiz = body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : null;
  const tarefas = Array.isArray(raiz?.tasks) ? raiz.tasks : raiz ? [raiz] : [];
  for (const bruta of tarefas) {
    const tarefa = bruta && typeof bruta === "object" && !Array.isArray(bruta) ? bruta as Record<string, unknown> : null;
    const dados = tarefa?.data && typeof tarefa.data === "object" && !Array.isArray(tarefa.data) ? tarefa.data as Record<string, unknown> : null;
    const eco = { device: texto(dados?.device), os: texto(dados?.os) };
    if (eco.device || eco.os) return eco;
  }
  return null;
}
