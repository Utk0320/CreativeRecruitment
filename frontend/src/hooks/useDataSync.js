import { useEffect, useRef } from 'react';

export const DATA_CHANGED_EVENT = 'creative-recruit-data-changed';

export const notifyDataChanged = () => {
    window.dispatchEvent(new Event(DATA_CHANGED_EVENT));
};

export const useDataSync = (refresh, intervalMs = 15000) => {
    const refreshRef = useRef(refresh);
    refreshRef.current = refresh;

    useEffect(() => {
        refreshRef.current();
        const interval = window.setInterval(() => refreshRef.current(), intervalMs);
        window.addEventListener(DATA_CHANGED_EVENT, refreshRef.current);

        return () => {
            window.clearInterval(interval);
            window.removeEventListener(DATA_CHANGED_EVENT, refreshRef.current);
        };
    }, [intervalMs]);
};
