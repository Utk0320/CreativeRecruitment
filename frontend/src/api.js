import axios from 'axios';

const baseURL = import.meta.env.VITE_API_URL || '/api';
export const API_BASE_URL = new URL(baseURL, window.location.origin).href.replace(/\/$/, '');
export const API_ORIGIN = new URL(baseURL, window.location.origin).origin;

const api = axios.create({
    baseURL,
    withCredentials: true,
    withXSRFToken: true,
    xsrfCookieName: 'csrf_token',
    xsrfHeaderName: 'X-CSRF-Token'
});

api.interceptors.response.use(
    response => response,
    async error => {
        const status = error.response?.status;
        const request = error.config;
        const url = request?.url || '';
        if (status !== 401 || url.includes('/auth/login')) return Promise.reject(error);
        if (url.includes('/auth/refresh') || url.includes('/auth/logout') || request?._retry) {
            window.dispatchEvent(new Event('creative-recruit-unauthorized'));
            return Promise.reject(error);
        }
        try {
            await api.post('/auth/refresh');
            return api({ ...request, _retry: true });
        } catch {
            window.dispatchEvent(new Event('creative-recruit-unauthorized'));
            return Promise.reject(error);
        }
    }
);

export default api;