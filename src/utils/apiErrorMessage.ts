export function apiErrorMessage(error: unknown, fallback = 'Сталася помилка'): string {
    if (error instanceof Error) {
        const raw = error.message.trim();
        if (!raw) return fallback;
        try {
            const parsed = JSON.parse(raw) as { message?: string | string[] };
            if (Array.isArray(parsed.message)) return parsed.message.join(', ');
            if (typeof parsed.message === 'string') return parsed.message;
        } catch {
            /* plain text */
        }
        return raw;
    }
    return fallback;
}
