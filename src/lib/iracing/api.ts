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

  return (await response.json()) as T;
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

    return (await linkedResponse.json()) as T;
  }

  return pointerData as T;
}
