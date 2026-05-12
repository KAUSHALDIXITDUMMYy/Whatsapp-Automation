const TOKEN_KEY = "wa_crm_token";
const ADMIN_TOKEN_KEY = "wa_crm_admin_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function getAdminToken(): string | null {
  return localStorage.getItem(ADMIN_TOKEN_KEY);
}

export function setAdminToken(token: string | null): void {
  if (token) localStorage.setItem(ADMIN_TOKEN_KEY, token);
  else localStorage.removeItem(ADMIN_TOKEN_KEY);
}

export async function apiFetch<T>(
  path: string,
  opts: RequestInit & { admin?: boolean } = {}
): Promise<T> {
  const headers = new Headers(opts.headers);
  headers.set("Content-Type", "application/json");
  const tok = opts.admin ? getAdminToken() : getToken();
  if (tok) headers.set("Authorization", `Bearer ${tok}`);
  const base = import.meta.env.VITE_API_URL ?? "";
  const res = await fetch(`${base}${path}`, { ...opts, headers });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const msg = (data && (data.error as string)) || res.statusText;
    throw new Error(msg || "Request failed");
  }
  return data as T;
}

export async function apiUpload<T>(path: string, formData: FormData): Promise<T> {
  const headers = new Headers();
  const tok = getToken();
  if (tok) headers.set("Authorization", `Bearer ${tok}`);
  const base = import.meta.env.VITE_API_URL ?? "";
  const res = await fetch(`${base}${path}`, { method: "POST", body: formData, headers });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const msg = (data && (data.error as string)) || res.statusText;
    throw new Error(msg || "Upload failed");
  }
  return data as T;
}
