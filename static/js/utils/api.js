export const API_ENDPOINTS = {
    SETTINGS: '/api/manage/settings',
    SETTINGS_RESET: (component, key) => `/api/manage/settings/${component}/${key}/reset`,
    USERS: '/api/manage/users',
    USER_BY_ID: (id) => `/api/manage/users/${id}`,
    USER_PERMISSIONS: (id) => `/api/manage/users/${id}/permissions`,
    PERMISSIONS: '/api/manage/permissions',
    ACCOUNTS: '/api/accounts',
    ACCOUNT_DOMAINS: '/api/accounts/domains',
    LOGS: '/api/manage/logs',
    LOG_FILE: (path) => `/api/manage/logs/${path}`,
    VNC_IFRAME: '/vnc/iframe',
};

/**
 * Standardized API request wrapper with error handling
 * @param {string} url - The URL to fetch
 * @param {RequestInit} options - Fetch options
 * @returns {Promise<any>} Parsed JSON response
 * @throws {Error} If response is not ok or JSON parsing fails
 */
export async function apiRequest(url, options = {}) {
    const defaultOptions = {
        headers: {
            'Content-Type': 'application/json',
            ...options.headers,
        },
    };

    const response = await fetch(url, { ...defaultOptions, ...options });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(data.error || `Request failed with status ${response.status}`);
    }

    return data;
}

/**
 * GET request helper
 * @param {string} url 
 * @returns {Promise<any>}
 */
export async function apiGet(url) {
    return apiRequest(url, { method: 'GET' });
}

/**
 * POST request helper
 * @param {string} url 
 * @param {Object} body 
 * @returns {Promise<any>}
 */
export async function apiPost(url, body) {
    return apiRequest(url, { method: 'POST', body: JSON.stringify(body) });
}

/**
 * PUT request helper
 * @param {string} url 
 * @param {Object} body 
 * @returns {Promise<any>}
 */
export async function apiPut(url, body) {
    return apiRequest(url, { method: 'PUT', body: JSON.stringify(body) });
}

/**
 * DELETE request helper
 * @param {string} url 
 * @param {Object} body 
 * @returns {Promise<any>}
 */
export async function apiDelete(url, body) {
    return apiRequest(url, { method: 'DELETE', body: JSON.stringify(body) });
}

/**
 * Build URL with query parameters
 * @param {string} baseUrl - Base URL
 * @param {Object} params - Query parameters
 * @returns {URL}
 */
export function buildUrl(baseUrl, params = {}) {
    const url = new URL(baseUrl, window.location.origin);
    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
            if (Array.isArray(value)) {
                value.forEach(v => url.searchParams.append(key, v));
            } else {
                url.searchParams.append(key, value);
            }
        }
    });
    return url;
}