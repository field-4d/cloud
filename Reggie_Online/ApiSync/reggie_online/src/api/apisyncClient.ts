export type ApiError = {
  status: number;
  message: string;
};

const API_BASE = import.meta.env.VITE_API_BASE as string;

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`);
  if (!response.ok) {
    throw {
      status: response.status,
      message: `Request failed: ${response.status}`,
    } as ApiError;
  }
  return (await response.json()) as T;
}
