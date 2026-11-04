import React, { useState, useEffect } from 'react';
import axios from '../api';
import { Calendar, Clock, MapPin, Download, AlertTriangle, CheckCircle } from 'lucide-react';

export default function StudentInterviewModal({ application, onClose, onBooked }) {
    const [slots, setSlots] = useState([]);
    const [myBooking, setMyBooking] = useState(null);
    const [loading, setLoading] = useState(true);
    const [bookingSlotId, setBookingSlotId] = useState(null);
    const [cancelling, setCancelling] = useState(false);
    const [error, setError] = useState('');
    const [clashError, setClashError] = useState(null);

    const loadSlots = async () => {
        try {
            setLoading(true);
            setError('');
            setClashError(null);
            const res = await axios.get(`/interviews/drive/${application.drive_id}/slots`);
            setSlots(res.data.slots || []);
            setMyBooking(res.data.my_booking || null);
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to load interview slots');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadSlots();
    }, [application.drive_id]);

    const handleBookSlot = async (slotId) => {
        try {
            setBookingSlotId(slotId);
            setError('');
            setClashError(null);
            await axios.post('/interviews/book', {
                slot_id: slotId,
                application_id: application.id
            });
            await loadSlots();
            if (onBooked) onBooked();
        } catch (err) {
            if (err.response?.status === 409 && err.response?.data?.clash_club) {
                setClashError(err.response.data);
            } else {
                setError(err.response?.data?.error || 'Failed to book slot');
            }
        } finally {
            setBookingSlotId(null);
        }
    };

    const handleCancelBooking = async () => {
        if (!myBooking || !window.confirm('Are you sure you want to cancel your interview slot? You will need to book another slot.')) return;
        try {
            setCancelling(true);
            await axios.post('/interviews/cancel', { booking_id: myBooking.id });
            await loadSlots();
            if (onBooked) onBooked();
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to cancel booking');
        } finally {
            setCancelling(false);
        }
    };

    const handleDownloadIcs = () => {
        if (!myBooking) return;
        // Direct download using the authenticated backend endpoint
        window.open(`/api/interviews/${myBooking.id}/ics`, '_blank');
    };

    const formatSlotDate = (iso) => {
        const d = new Date(iso);
        return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
    };

    const formatSlotTime = (iso) => {
        const d = new Date(iso);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-gray-100 overflow-hidden">
                {/* Header */}
                <div className="px-6 py-4 bg-gradient-to-r from-purple-700 to-indigo-700 text-white flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                        <h2 className="text-lg font-bold">Interview Scheduling</h2>
                        <p className="text-xs text-purple-100 mt-0.5 break-words">
                            {application.club_name} · {application.drive_title}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/10 text-white shrink-0 text-xl leading-none">
                        &times;
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-6 space-y-5">
                    {loading ? (
                        <div className="py-12 text-center text-gray-500">
                            <div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                            Loading interview slots...
                        </div>
                    ) : (
                        <>
                            {/* Clash Detection Error Banner */}
                            {clashError && (
                                <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-900 space-y-2">
                                    <div className="flex items-center gap-2 font-bold text-sm text-red-800">
                                        <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
                                        Interview Clash Detected!
                                    </div>
                                    <p className="text-xs leading-relaxed">
                                        You already have a confirmed interview booked with{' '}
                                        <strong className="font-bold">{clashError.clash_club}</strong> from{' '}
                                        <strong>{formatSlotTime(clashError.clash_start)}</strong> to{' '}
                                        <strong>{formatSlotTime(clashError.clash_end)}</strong>.
                                    </p>
                                    <p className="text-[11px] text-red-700 italic">
                                        Please choose another time slot to prevent conflicting interview schedules.
                                    </p>
                                </div>
                            )}

                            {error && !clashError && (
                                <div className="p-3 bg-red-50 text-red-700 border border-red-200 rounded-lg text-xs">
                                    {error}
                                </div>
                            )}

                            {/* Current Confirmed Booking Card */}
                            {myBooking && (
                                <div className="p-4 bg-emerald-50 border-2 border-emerald-300 rounded-xl space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2 text-emerald-900 font-bold text-sm">
                                            <CheckCircle className="w-5 h-5 text-emerald-600" />
                                            <span>Your Interview is Confirmed</span>
                                        </div>
                                        <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-200 text-emerald-900">
                                            Confirmed
                                        </span>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-emerald-950 pt-1">
                                        <div className="flex items-center gap-2">
                                            <Calendar className="w-4 h-4 text-emerald-700" />
                                            <span>{formatSlotDate(myBooking.start_time)}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Clock className="w-4 h-4 text-emerald-700" />
                                            <span>{formatSlotTime(myBooking.start_time)} – {formatSlotTime(myBooking.end_time)}</span>
                                        </div>
                                        <div className="flex items-center gap-2 sm:col-span-2">
                                            <MapPin className="w-4 h-4 text-emerald-700 shrink-0" />
                                            <span>{myBooking.location}</span>
                                        </div>
                                    </div>

                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-emerald-200">
                                        <button
                                            onClick={handleDownloadIcs}
                                            className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold shadow-xs transition-colors"
                                        >
                                            <Download className="w-3.5 h-3.5" />
                                            Download Calendar (.ics)
                                        </button>
                                        <button
                                            onClick={handleCancelBooking}
                                            disabled={cancelling}
                                            className="text-xs text-red-600 hover:text-red-800 font-semibold self-start sm:self-auto"
                                        >
                                            {cancelling ? 'Cancelling...' : 'Cancel / Reschedule'}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Available Slots List */}
                            <div className="space-y-3">
                                <h3 className="text-sm font-bold text-gray-900">
                                    {myBooking ? 'Reschedule to another slot:' : 'Available Interview Slots:'}
                                </h3>

                                {slots.length === 0 ? (
                                    <div className="p-8 text-center bg-gray-50 rounded-xl text-gray-500 text-xs">
                                        No interview slots have been published by the coordinators yet. Please check back soon.
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {slots.map(s => {
                                            const isMySlot = myBooking?.slot_id === s.id;
                                            const isFull = s.capacity <= s.booked_count && !isMySlot;

                                            return (
                                                <div
                                                    key={s.id}
                                                    className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs transition-colors ${
                                                        isMySlot
                                                            ? 'bg-purple-50 border-purple-300 font-semibold'
                                                            : isFull
                                                            ? 'bg-gray-100 border-gray-200 opacity-50'
                                                            : 'bg-white border-gray-200 hover:border-purple-300'
                                                    }`}
                                                >
                                                    <div className="space-y-1">
                                                        <div className="flex items-center gap-3">
                                                            <span className="font-bold text-gray-900">{formatSlotDate(s.start_time)}</span>
                                                            <span className="text-gray-500">
                                                                {formatSlotTime(s.start_time)} – {formatSlotTime(s.end_time)}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center gap-1.5 text-gray-600 text-[11px]">
                                                            <MapPin className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                                                            <span>{s.location}</span>
                                                            <span className="text-gray-400 ml-2">
                                                                ({s.capacity - s.booked_count} seat remaining)
                                                            </span>
                                                        </div>
                                                    </div>

                                                    <div>
                                                        {isMySlot ? (
                                                            <span className="px-3 py-1 bg-purple-200 text-purple-800 rounded-lg font-bold">
                                                                Booked
                                                            </span>
                                                        ) : (
                                                            <button
                                                                onClick={() => handleBookSlot(s.id)}
                                                                disabled={isFull || bookingSlotId === s.id}
                                                                className="px-4 py-1.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-lg disabled:opacity-40 shadow-xs"
                                                            >
                                                                {bookingSlotId === s.id ? 'Booking...' : isFull ? 'Slot Full' : 'Book Slot'}
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-3 bg-gray-50 border-t border-gray-200 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-200 rounded-lg"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}
