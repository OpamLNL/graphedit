const API_BASE_URL = import.meta.env.VITE_API_BASE_URL as string;

export class ApiError extends Error {
    constructor(
        public status: number,
        message: string,
    ) {
        super(message);
    }
}

export async function apiFetch<T>(
    path: string,
    options: RequestInit = {},
    auth = true,
): Promise<T> {
    const headers: Record<string, string> = {
        ...(options.headers as Record<string, string>),
    };

    if (!(options.body instanceof FormData)) {
        headers['Content-Type'] = headers['Content-Type'] ?? 'application/json';
    }

    if (auth) {
        const token = localStorage.getItem('token');
        if (token) headers.Authorization = `Bearer ${token}`;
    }

    const res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });

    if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        throw new ApiError(res.status, text || `HTTP ${res.status}`);
    }

    if (res.status === 204) return undefined as T;

    const text = await res.text();
    if (!text.trim()) return undefined as T;

    return JSON.parse(text) as T;
}

export { API_BASE_URL };

/** Повний URL для статичних файлів API (/api/uploads/...) */
export function apiAssetUrl(path: string): string {
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    const base = API_BASE_URL.replace(/\/api\/?$/, '');
    return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}
