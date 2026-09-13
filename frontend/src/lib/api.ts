import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_URL || "/api";

export const api = axios.create({ baseURL: API_BASE_URL });

let accessToken: string | null = localStorage.getItem("accessToken");
let refreshToken: string | null = localStorage.getItem("refreshToken");

export function setTokens(tokens: { accessToken: string; refreshToken: string } | null) {
  accessToken = tokens?.accessToken ?? null;
  refreshToken = tokens?.refreshToken ?? null;
  if (tokens) {
    localStorage.setItem("accessToken", tokens.accessToken);
    localStorage.setItem("refreshToken", tokens.refreshToken);
  } else {
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
  }
}

export function getAccessToken() {
  return accessToken;
}

/**
 * Attachment/upload URLs come back as paths relative to the backend's root
 * (e.g. "/uploads/xyz.png"), served outside the "/api" prefix. Resolve them
 * against the backend's origin so they load correctly when the frontend and
 * backend are deployed to different hosts.
 */
export function resolveFileUrl(relativeUrl: string): string {
  if (/^https?:\/\//.test(relativeUrl)) return relativeUrl;
  const origin = API_BASE_URL.replace(/\/api\/?$/, "");
  return `${origin}${relativeUrl}`;
}

api.interceptors.request.use((req) => {
  if (accessToken) {
    req.headers = req.headers ?? {};
    req.headers.Authorization = `Bearer ${accessToken}`;
  }
  return req;
});

let refreshPromise: Promise<string | null> | null = null;

async function performRefresh(): Promise<string | null> {
  if (!refreshToken) return null;
  try {
    const { data } = await axios.post(`${API_BASE_URL}/auth/refresh`, { refreshToken });
    setTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken });
    return data.accessToken;
  } catch {
    setTokens(null);
    return null;
  }
}

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry && refreshToken) {
      original._retry = true;
      refreshPromise = refreshPromise ?? performRefresh();
      const newToken = await refreshPromise;
      refreshPromise = null;
      if (newToken) {
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      }
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);
