import { useEffect, useRef } from 'react';
import { API_BASE_URL } from '../api';

export const DATA_CHANGED_EVENT = 'creative-recruit-data-changed';

export const notifyDataChanged = () => {
    window.dispatchEvent(new Event(DATA_CHANGED_EVENT));
};

export const useDataSync = (refresh) => {
    const refreshRef = useRef(refresh);

    useEffect(() => {
        refreshRef.current = refresh;
    }, [refresh]);

    useEffect(() => {
        refreshRef.current();
        const events = new EventSource(`${API_BASE_URL}/events`, { withCredentials: true });
        events.onmessage = () => refreshRef.current();
        window.addEventListener(DATA_CHANGED_EVENT, refreshRef.current);

        return () => {
            events.close();
            window.removeEventListener(DATA_CHANGED_EVENT, refreshRef.current);
        };
    }, []);
};
