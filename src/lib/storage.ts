const isServer = typeof window === 'undefined';

export function getLocalStorageJSON<T>(key: string, fallback: T): T {
    if (isServer) return fallback;

    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) as T : fallback;
    } catch {
        return fallback;
    }
}

export function setLocalStorageJSON<T>(key: string, value: T): boolean {
    if (isServer) return false;

    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch {
        return false;
    }
}

export function removeLocalStorageItem(key: string): void {
    if (isServer) return;
    localStorage.removeItem(key);
}
