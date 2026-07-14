export class ProviderRequestError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.name = "ProviderRequestError";
    this.status = status;
  }
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
}: {
  apiUrl: string;
  apiKey: string;
  model: string;
  system: string;
  user: string;
  extraHeaders?: Record<string, string>;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}) {
  const response = await fetchImpl(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...extraHeaders,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      response_format: { type: "json_object" },
    }),
    signal,
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new ProviderRequestError(`Falha no provedor de IA (${response.status}): ${detail}`);
  }
  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new ProviderRequestError("A IA retornou uma resposta vazia.");
  }
  return content;
}
