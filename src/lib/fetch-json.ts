/** GET a JSON API of this app; null when the response is not OK. For loading data in effects and handlers. */
export async function fetchJson<T>(url: string): Promise<T | null> {
  const response = await fetch(url);
  return response.ok ? ((await response.json()) as T) : null;
}
