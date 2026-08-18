export class ProviderRequestError extends Error {
  status: number;
  code: "AI_PROVIDER_AUTHENTICATION" | "AI_PROVIDER_RATE_LIMIT" | "AI_PROVIDER_UNAVAILABLE" | "AI_PROVIDER_ERROR" | "AI_PROVIDER_INVALID_RESPONSE";

  constructor(
    message: string,
    status = 502,
    code: ProviderRequestError["code"] = "AI_PROVIDER_ERROR",
  ) {
    super(message);
    this.name = "ProviderRequestError";
    this.status = status;
    this.code = code;
  }
}

function classifyProviderStatus(status: number): ProviderRequestError["code"] {
  if (status === 401 || status === 403) return "AI_PROVIDER_AUTHENTICATION";
  if (status === 429) return "AI_PROVIDER_RATE_LIMIT";
  if (status === 408 || status === 425 || status === 502 || status === 503 || status === 504) return "AI_PROVIDER_UNAVAILABLE";
  return "AI_PROVIDER_ERROR";
}

export async function fetchProviderResponse(
  apiUrl: string,
  init: RequestInit,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  let response: Response;
  try {
    response = await fetchImpl(apiUrl, init);
  } catch {
    throw new ProviderRequestError(
      "O provider de IA está indisponível.",
      503,
      "AI_PROVIDER_UNAVAILABLE",
    );
  }

  if (!response.ok) {
    // O corpo pode conter dados do request ou segredos refletidos pelo provider.
    // O status e o código sanitizado são suficientes para a UI distinguir a falha.
    await response.text();
    throw new ProviderRequestError(
      `O provider de IA respondeu com erro HTTP ${response.status}.`,
      response.status,
      classifyProviderStatus(response.status),
    );
  }

  return response;
}

export async function requestProviderContent({
  apiUrl,
  apiKey,
  model,
  system,
  user,
  extraHeaders = {},
  signal,
  fetchImpl = fetch,
  maxTokens,
  temperature = 0,
}: {
  apiUrl: string;
  apiKey: string;
  model: string;
  system: string;
  user: string;
  extraHeaders?: Record<string, string>;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  maxTokens?: number;
  temperature?: number;
}) {
  const body: Record<string, unknown> = {
    model,
    messages: [{ role: "system", content: system }, { role: "user", content: user }],
    response_format: { type: "json_object" },
    // temperature 0 para saida mais deterministica e rapida em JSON estruturado
    temperature,
  };
  // max_tokens limita o tamanho da resposta e evita geracao excessiva que
  // aumenta latencia. Se nao definido, o provedor usa seu default.
  if (maxTokens !== undefined) body.max_tokens = maxTokens;
  const response = await fetchProviderResponse(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...extraHeaders,
    },
    body: JSON.stringify(body),
    signal,
  }, fetchImpl);
  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new ProviderRequestError("O provider de IA retornou uma resposta inválida.", 502, "AI_PROVIDER_INVALID_RESPONSE");
  }
  return content;
}
