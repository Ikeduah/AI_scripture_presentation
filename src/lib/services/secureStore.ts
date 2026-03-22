import { invoke } from '@tauri-apps/api/core';

// @ts-ignore
const isTauri = typeof window !== 'undefined' && window.__TAURI_INTERPROCESS__ !== undefined;

export async function setSecureKey(key: string, value: string): Promise<void> {
    try {
        if (!isTauri) {
            if (!value) localStorage.removeItem(`mock_secure_${key}`);
            else localStorage.setItem(`mock_secure_${key}`, value);
            return;
        }
        if (!value) {
            await invoke('delete_secure_key', { key });
        } else {
            await invoke('set_secure_key', { key, value });
        }
    } catch (err) {
        console.error("Failed to set secure key", key, err);
    }
}

export async function getSecureKey(key: string): Promise<string> {
    try {
        if (!isTauri) {
            return localStorage.getItem(`mock_secure_${key}`) || "";
        }
        const val = await invoke<string>('get_secure_key', { key });
        return val || "";
    } catch (err) {
        console.error("Failed to get secure key", key, err);
        return "";
    }
}
