import "server-only";

import { radarProviderDeviceEchoOf, type RadarProviderDeviceEcho } from "../radar/provider-device-echo.ts";

/**
 * O ECO DO APARELHO SEM UMA SEGUNDA PORTA AO PROVIDER — R5.
 *
 * O adapter da Amazon (`executeDataForSeoAmazonQuery`) normaliza o corpo e não
 * devolve `tasks[].data.device/os`. Em vez de uma segunda chamada ou de um
 * segundo parser do resultado, a coleta passa a ele um `fetchImpl` que
 * entrega a MESMA resposta ao adapter e lê, de uma cópia dela, só o eco do
 * aparelho. Nada muda no pedido, no custo nem na leitura dos produtos.
 *
 * Uma cópia que não parseia não derruba nada: quem decide se a resposta é
 * válida continua sendo o adapter.
 */
export function radarProviderDeviceEchoRecorder(base: typeof fetch = globalThis.fetch) {
  let eco: RadarProviderDeviceEcho | null = null;
  const fetchImpl = (async (entrada: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const resposta = await base(entrada, init);
    if (resposta.ok && !eco) {
      try {
        eco = radarProviderDeviceEchoOf(await resposta.clone().json());
      } catch {
        // A validade da resposta é do adapter; o eco só não é registrado.
      }
    }
    return resposta;
  }) as typeof fetch;
  return { fetchImpl, echo: (): RadarProviderDeviceEcho | null => eco };
}
