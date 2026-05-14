const IRACING_BASE_URL = "https://members-ng.iracing.com";

export class IracingApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "IracingApiError";
    this.status = status;
  }
}

function toAbsoluteUrl(endpointOrUrl: string): string {
  if (
    endpointOrUrl.startsWith("http://") ||
    endpointOrUrl.startsWith("https://")
  ) {
    return endpointOrUrl;
  }
  return `${IRACING_BASE_URL}${endpointOrUrl.startsWith("/") ? "" : "/"}${endpointOrUrl}`;
}

async function parseJsonOrThrow<T>(response: Response, context: string) {
  const text = await response.text();

  if (!text) {
    throw new IracingApiError(
      `${context} failed: empty_response`,
      response.status || 502,
    );
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    const preview = text.slice(0, 200).replace(/\s+/g, " ").trim();
    throw new IracingApiError(
      `${context} failed: non_json_response (${preview || "no_content"})`,
      response.status || 502,
    );
  }
}

export async function fetchIracingJson<T>(
  accessToken: string,
  endpointOrUrl: string,
): Promise<T> {
  const url = toAbsoluteUrl(endpointOrUrl);

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new IracingApiError(
      `iRacing API request failed: ${response.status} ${text || response.statusText}`,
      response.status,
    );
  }

  return await parseJsonOrThrow<T>(response, "iRacing API request");
}

export async function fetchIracingLinkedJson<T>(
  accessToken: string,
  endpointOrUrl: string,
): Promise<T> {
  const pointerData = await fetchIracingJson<{ link?: string } & Partial<T>>(
    accessToken,
    endpointOrUrl,
  );

  if (pointerData.link) {
    const linkedResponse = await fetch(pointerData.link, {
      cache: "no-store",
    });

    if (!linkedResponse.ok) {
      const text = await linkedResponse.text();
      throw new IracingApiError(
        `iRacing linked JSON request failed: ${linkedResponse.status} ${text || linkedResponse.statusText}`,
        linkedResponse.status,
      );
    }

    return await parseJsonOrThrow<T>(
      linkedResponse,
      "iRacing linked JSON request",
    );
  }

  return pointerData as T;
}
