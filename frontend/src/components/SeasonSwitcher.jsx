/**
 * components/SeasonSwitcher.jsx — Compact dropdown to select the active recruitment season.
 *
 * Used in coordinator and admin headers. Stores the active season in sessionStorage
 * so it survives page refreshes but resets per browser session.
 *
 * Props:
 *   className (string)  — extra Tailwind classes for the wrapper
 *   onChange (fn)       — optional callback called with the selected season object
 */
import React, { createContext, useContext, useState, useEffect } from 'react';
import { ChevronDown, CalendarDays } from 'lucide-react';
import { useSeasons } from '../hooks/useSeasons';

// ── Season context — share active season across the app ────────────────────────
const SeasonContext = createContext(null);

export const SeasonProvider = ({ children }) => {
    const { seasons, loading } = useSeasons();
    const [activeSeason, setActiveSeason] = useState(null);

    // Restore from sessionStorage on first load
    useEffect(() => {
        if (seasons.length === 0) return;
        const stored = sessionStorage.getItem('active_season_id');
        const match = seasons.find(s => String(s.id) === stored);
        setActiveSeason(match || seasons.find(s => s.status === 'active') || seasons[0] || null);
    }, [seasons]);

    const chooseSeason = (season) => {
        setActiveSeason(season);
        if (season) sessionStorage.setItem('active_season_id', String(season.id));
        else sessionStorage.removeItem('active_season_id');
    };

    return (
        <SeasonContext.Provider value={{ activeSeason, setActiveSeason: chooseSeason, seasons, loading }}>
            {children}
        </SeasonContext.Provider>
    );
};

export const useSeason = () => useContext(SeasonContext);

// ── Season switcher dropdown widget ───────────────────────────────────────────
const SeasonSwitcher = ({ className = '', onChange }) => {
    const { seasons, activeSeason, setActiveSeason, loading } = useSeason() || {};
    const [open, setOpen] = useState(false);

    if (loading) {
        return (
            <div className={`flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-400 ${className}`}>
                <CalendarDays size={15} className="shrink-0" />
                <span>Loading seasons…</span>
            </div>
        );
    }

    if (!seasons || seasons.length === 0) {
        return (
            <div className={`flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-400 ${className}`}>
                <CalendarDays size={15} className="shrink-0" />
                <span>No seasons</span>
            </div>
        );
    }

    const select = (s) => {
        setActiveSeason(s);
        onChange?.(s);
        setOpen(false);
    };

    const statusColor = (status) => {
        switch (status) {
            case 'active': return 'bg-green-100 text-green-700';
            case 'upcoming': return 'bg-blue-100 text-blue-700';
            case 'closed': return 'bg-gray-100 text-gray-600';
            case 'archived': return 'bg-amber-100 text-amber-700';
            default: return 'bg-gray-100 text-gray-600';
        }
    };

    return (
        <div className={`relative ${className}`}>
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                aria-haspopup="listbox"
                aria-expanded={open}
                className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:border-indigo-300 hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
                <CalendarDays size={15} className="shrink-0 text-indigo-500" />
                <span className="max-w-[120px] sm:max-w-[180px] truncate">
                    {activeSeason ? activeSeason.name : 'Select season'}
                </span>
                {activeSeason && (
                    <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-xs font-semibold ${statusColor(activeSeason.status)}`}>
                        {activeSeason.status}
                    </span>
                )}
                <ChevronDown size={14} className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && (
                <>
                    {/* backdrop */}
                    <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden="true" />
                    <ul
                        role="listbox"
                        className="absolute right-0 top-full z-20 mt-1 max-h-64 w-64 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg"
                    >
                        {seasons.map(s => (
                            <li key={s.id}>
                                <button
                                    type="button"
                                    role="option"
                                    aria-selected={activeSeason?.id === s.id}
                                    onClick={() => select(s)}
                                    className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-indigo-50 ${activeSeason?.id === s.id ? 'bg-indigo-50 font-semibold text-indigo-800' : 'text-gray-800'}`}
                                >
                                    <span className="truncate">{s.name}</span>
                                    <span className={`ml-2 shrink-0 rounded-full px-1.5 py-0.5 text-xs ${statusColor(s.status)}`}>
                                        {s.status}
                                    </span>
                                </button>
                            </li>
                        ))}
                    </ul>
                </>
            )}
        </div>
    );
};

export default SeasonSwitcher;

