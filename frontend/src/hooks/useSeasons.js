/**
 * hooks/useSeasons.js — Fetches the list of recruitment seasons.
 * Returns { seasons, loading, error, reload }.
 */
import { useState, useEffect, useCallback } from 'react';
import api from '../api';

export function useSeasons(statusFilter) {
    const [seasons, setSeasons] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const load = useCallback(() => {
        setLoading(true);
        setError('');
        const params = {};
        if (statusFilter) params.status = statusFilter;
        api.get('/seasons', { params })
            .then(res => setSeasons(res.data))
            .catch(err => setError(err.response?.data?.error || 'Unable to load seasons'))
            .finally(() => setLoading(false));
    }, [statusFilter]);

    useEffect(() => { load(); }, [load]);

    return { seasons, loading, error, reload: load };
}

