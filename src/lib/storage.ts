export function getLocalStorageJSON<T>(key: string, fallback: T): T {
    if (typeof window === 'undefined') {
        return fallback;
    }

    try {
        const raw = localStorage.getItem(key);
        if (!raw) {
            return fallback;
        }
        return JSON.parse(raw) as T;
    } catch {
        return fallback;
    }
}

export function setLocalStorageJSON<T>(key: string, value: T): boolean {
    if (typeof window === 'undefined') {
        return false;
    }

    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch {
        return false;
    }
}

export function removeLocalStorageItem(key: string): void {
    if (typeof window === 'undefined') {
        return;
    }
    localStorage.removeItem(key);
}
