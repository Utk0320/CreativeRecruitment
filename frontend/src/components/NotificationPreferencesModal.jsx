import React, { useState, useEffect } from 'react';
import api from '../api';

const EVENT_LABELS = {
    stage_change: { title: 'Pipeline & Stage Updates', desc: 'When your application advances, is shortlisted, or decided' },
    deadline_reminder: { title: 'Application Deadlines', desc: '48h and 24h reminders before recruitment drives close' },
    interview_reminder: { title: 'Interview & Slot Reminders', desc: 'Upcoming scheduled interview time and location notices' },
    offer_expiry: { title: 'Offer Acceptance Alerts', desc: 'Notifications when an offer is issued or nearing 48h expiry' },
    appeal_update: { title: 'Appeals & Re-evaluations', desc: 'Status updates and coordinator review notes for your appeals' },
    ticket_update: { title: 'Support Ticket Replies', desc: 'New messages and status resolutions on support inquiries' },
    mentions_assignments: { title: 'Team Mentions & Assignments', desc: 'When tagged in internal comments or assigned to review' },
    announcements: { title: 'Club Announcements', desc: 'Broadcasts and notices sent by clubs you follow or applied to' }
};

const CHANNELS = [
    { key: 'in_app', label: 'In-App (SSE)', icon: '🔔' },
    { key: 'email', label: 'Email', icon: '✉️' },
    { key: 'sms', label: 'SMS / WhatsApp', icon: '💬' },
    { key: 'push', label: 'Web Push', icon: '📲' }
];

const NotificationPreferencesModal = ({ isOpen, onClose }) => {
    const [preferences, setPreferences] = useState({});
    const [loading, setLoading] = useState(true);
    const [updating, setUpdating] = useState(false);
    const [savedMsg, setSavedMsg] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        const fetchPreferences = async () => {
            setLoading(true);
            try {
                const res = await api.get('/notifications/preferences');
                setPreferences(res.data);
            } catch (err) {
                console.error('Failed to load notification preferences:', err);
            } finally {
                setLoading(false);
            }
        };
        fetchPreferences();
    }, [isOpen]);

    const handleToggle = async (eventType, channel) => {
        const currentVal = preferences[eventType]?.[channel] ?? false;
        const newVal = !currentVal;

        // Optimistic UI update
        setPreferences(prev => ({
            ...prev,
            [eventType]: {
                ...prev[eventType],
                [channel]: newVal
            }
        }));

        setUpdating(true);
        try {
            await api.put('/notifications/preferences', {
                event_type: eventType,
                channel,
                enabled: newVal
            });
            setSavedMsg(true);
            setTimeout(() => setSavedMsg(false), 2000);
        } catch (err) {
            console.error('Failed to update preference:', err);
            // Revert
            setPreferences(prev => ({
                ...prev,
                [eventType]: {
                    ...prev[eventType],
                    [channel]: currentVal
                }
            }));
        } finally {
            setUpdating(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-gray-100 animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
                <div className="flex items-center justify-between pb-4 border-b border-gray-100">
                    <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-lg">
                            ⚙️
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-gray-900">Notification Preferences</h3>
                            <p className="text-xs text-gray-500">Configure how and where you receive platform alerts</p>
                        </div>
                    </div>
                    <div className="flex items-center space-x-2">
                        {savedMsg && (
                            <span className="text-xs text-green-600 font-semibold bg-green-50 px-2 py-1 rounded-md animate-fade-in">
                                ✓ Saved
                            </span>
                        )}
                        <button
                            onClick={onClose}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                        >
                            ✕
                        </button>
                    </div>
                </div>

                {loading ? (
                    <div className="py-12 flex justify-center items-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                    </div>
                ) : (
                    <div className="flex-1 overflow-y-auto mt-4 pr-1 space-y-4">
                        <div className="grid grid-cols-12 gap-2 text-xs font-semibold text-gray-500 pb-2 border-b border-gray-100 px-2">
                            <div className="col-span-4">Event Type</div>
                            {CHANNELS.map(ch => (
                                <div key={ch.key} className="col-span-2 text-center flex flex-col items-center">
                                    <span className="text-sm">{ch.icon}</span>
                                    <span className="text-[10px] hidden sm:inline text-gray-600">{ch.label}</span>
                                </div>
                            ))}
                        </div>

                        {Object.entries(EVENT_LABELS).map(([eventType, info]) => (
                            <div
                                key={eventType}
                                className="grid grid-cols-12 gap-2 items-center p-2.5 rounded-xl hover:bg-gray-50 transition-colors border border-transparent hover:border-gray-100"
                            >
                                <div className="col-span-4 min-w-0">
                                    <p className="text-xs font-semibold text-gray-800 break-words">{info.title}</p>
                                    <p className="text-[11px] text-gray-500 line-clamp-1">{info.desc}</p>
                                </div>

                                {CHANNELS.map(ch => {
                                    const isEnabled = preferences[eventType]?.[ch.key] ?? false;
                                    return (
                                        <div key={ch.key} className="col-span-2 flex justify-center">
                                            <button
                                                type="button"
                                                onClick={() => handleToggle(eventType, ch.key)}
                                                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                                    isEnabled ? 'bg-indigo-600' : 'bg-gray-200'
                                                }`}
                                            >
                                                <span
                                                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                                                        isEnabled ? 'translate-x-4' : 'translate-x-0'
                                                    }`}
                                                />
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        ))}
                    </div>
                )}

                <div className="pt-4 mt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
                    <span>* SMS / WhatsApp and Web Push require configured verified contacts.</span>
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 rounded-xl text-xs font-semibold bg-gray-900 text-white hover:bg-black transition-colors"
                    >
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
};

export default NotificationPreferencesModal;
