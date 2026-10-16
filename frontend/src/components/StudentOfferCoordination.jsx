import React, { useState, useEffect } from 'react';
import axios from '../api';
import { Award, CheckCircle, XCircle, ArrowUp, ArrowDown, Clock, AlertCircle } from 'lucide-react';

export default function StudentOfferCoordination({ onOffersUpdated }) {
    const [offers, setOffers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [confirmModal, setConfirmModal] = useState(null); // { offer, action: 'accept' | 'decline' }
    const [successMessage, setSuccessMessage] = useState('');

    const fetchOffers = async () => {
        try {
            setLoading(true);
            const res = await axios.get('/offers/my-offers');
            setOffers(res.data || []);
        } catch (err) {
            console.error('Failed to fetch offers', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchOffers();
    }, []);

    const handleSaveRankings = async () => {
        try {
            setActionLoading(true);
            const payload = offers.map((o, idx) => ({
                application_id: o.application_id,
                rank: idx + 1
            }));
            await axios.post('/offers/rank', { rankings: payload });
            setSuccessMessage('Offer preference ranking saved successfully!');
            setTimeout(() => setSuccessMessage(''), 3000);
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to save rankings');
        } finally {
            setActionLoading(false);
        }
    };

    const moveOffer = (index, direction) => {
        const newOffers = [...offers];
        const targetIndex = index + direction;
        if (targetIndex < 0 || targetIndex >= newOffers.length) return;
        const temp = newOffers[index];
        newOffers[index] = newOffers[targetIndex];
        newOffers[targetIndex] = temp;
        setOffers(newOffers);
    };

    const handleConfirmAction = async () => {
        if (!confirmModal) return;
        const { offer, action } = confirmModal;

        try {
            setActionLoading(true);
            if (action === 'accept') {
                const res = await axios.post(`/offers/${offer.application_id}/accept`);
                setSuccessMessage(res.data.message || 'Offer accepted successfully!');
            } else {
                const res = await axios.post(`/offers/${offer.application_id}/decline`);
                setSuccessMessage(res.data.message || 'Offer declined.');
            }
            setConfirmModal(null);
            await fetchOffers();
            if (onOffersUpdated) onOffersUpdated();
        } catch (err) {
            alert(err.response?.data?.error || `Failed to ${action} offer`);
        } finally {
            setActionLoading(false);
        }
    };

    if (loading || offers.length === 0) return null;

    const acceptedOffer = offers.find(o => o.offer_status === 'accepted');

    return (
        <div className="mb-8 bg-gradient-to-br from-indigo-50 via-purple-50 to-emerald-50 rounded-2xl border-2 border-indigo-200 p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-indigo-100">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-md">
                        <Award className="w-7 h-7" />
                    </div>
                    <div>
                        <h2 className="text-xl font-black text-gray-900 tracking-tight">
                            Recruitment Offers Received ({offers.length})
                        </h2>
                        <p className="text-xs text-gray-600 mt-0.5">
                            {acceptedOffer
                                ? `You accepted an offer with ${acceptedOffer.club_name}. Other offers were released to waitlisted students.`
                                : 'You have been selected by one or more clubs! Rank your preference or accept your preferred club.'}
                        </p>
                    </div>
                </div>

                {!acceptedOffer && offers.length > 1 && (
                    <button
                        onClick={handleSaveRankings}
                        disabled={actionLoading}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-sm shrink-0"
                    >
                        Save Preference Order
                    </button>
                )}
            </div>

            {successMessage && (
                <div className="mt-4 p-3 bg-emerald-100 border border-emerald-200 text-emerald-900 text-xs font-semibold rounded-lg flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{successMessage}</span>
                </div>
            )}

            {/* Offers Cards */}
            <div className="mt-5 space-y-3">
                {offers.map((offer, idx) => {
                    const isAccepted = offer.offer_status === 'accepted';
                    const isDeclined = offer.offer_status === 'declined';

                    return (
                        <div
                            key={offer.application_id}
                            className={`p-4 rounded-xl border transition-all ${
                                isAccepted
                                    ? 'bg-emerald-50 border-emerald-300 ring-2 ring-emerald-200'
                                    : isDeclined
                                    ? 'bg-gray-100 border-gray-200 opacity-60'
                                    : 'bg-white border-gray-200 shadow-xs'
                            } flex flex-col sm:flex-row sm:items-center justify-between gap-4`}
                        >
                            <div className="flex items-center gap-3">
                                {!acceptedOffer && offers.length > 1 && (
                                    <div className="flex flex-col gap-1 items-center mr-1">
                                        <button
                                            onClick={() => moveOffer(idx, -1)}
                                            disabled={idx === 0}
                                            className="p-1 text-gray-400 hover:text-indigo-600 disabled:opacity-20"
                                            title="Move Up in Preference"
                                        >
                                            <ArrowUp className="w-3.5 h-3.5" />
                                        </button>
                                        <span className="text-xs font-bold text-gray-500 font-mono">#{idx + 1}</span>
                                        <button
                                            onClick={() => moveOffer(idx, 1)}
                                            disabled={idx === offers.length - 1}
                                            className="p-1 text-gray-400 hover:text-indigo-600 disabled:opacity-20"
                                            title="Move Down in Preference"
                                        >
                                            <ArrowDown className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                )}

                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <h3 className="font-bold text-gray-900 text-base break-words">{offer.club_name}</h3>
                                        <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold bg-indigo-100 text-indigo-800 shrink-0">
                                            {offer.club_category || 'Club'}
                                        </span>
                                        {isAccepted && (
                                            <span className="text-[11px] px-2.5 py-0.5 rounded-full font-bold bg-emerald-600 text-white flex items-center gap-1 shrink-0">
                                                <CheckCircle className="w-3 h-3" /> Offer Accepted
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs text-indigo-600 font-medium mt-0.5 break-words">{offer.drive_title}</p>
                                    {offer.offer_expires_at && !isAccepted && !isDeclined && (
                                        <div className="flex items-center gap-1 text-[11px] text-amber-700 mt-1 font-medium">
                                            <Clock className="w-3 h-3 shrink-0" />
                                            <span>Offer expires on {new Date(offer.offer_expires_at).toLocaleDateString()}</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Action Buttons */}
                            {!acceptedOffer && !isDeclined && (
                                <div className="flex items-center gap-2 shrink-0">
                                    <button
                                        onClick={() => setConfirmModal({ offer, action: 'accept' })}
                                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-sm flex items-center gap-1.5"
                                    >
                                        <CheckCircle className="w-4 h-4" />
                                        Accept Offer
                                    </button>
                                    <button
                                        onClick={() => setConfirmModal({ offer, action: 'decline' })}
                                        className="px-3 py-2 bg-gray-100 hover:bg-red-50 text-gray-700 hover:text-red-700 text-xs font-bold rounded-lg border border-gray-200"
                                    >
                                        Decline
                                    </button>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Confirmation Dialog */}
            {confirmModal && (
                <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 overflow-y-auto">
                    <div className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto p-6 space-y-4 shadow-2xl border border-gray-100">
                        <div className="flex items-center gap-3 text-amber-600">
                            <AlertCircle className="w-7 h-7 shrink-0" />
                            <h3 className="text-lg font-bold text-gray-900">
                                {confirmModal.action === 'accept' ? 'Accept Club Offer?' : 'Decline Offer?'}
                            </h3>
                        </div>

                        <p className="text-xs text-gray-600 leading-relaxed">
                            {confirmModal.action === 'accept' ? (
                                <>
                                    You are accepting the official recruitment offer from{' '}
                                    <strong className="text-gray-900">{confirmModal.offer.club_name}</strong>.
                                    <br /><br />
                                    <span className="text-amber-800 font-semibold">Important Notice:</span> In accordance with college policy, accepting this seat will automatically decline any other offers you hold and cascade the freed positions to waitlisted students.
                                </>
                            ) : (
                                <>
                                    Are you sure you want to decline the offer from{' '}
                                    <strong className="text-gray-900">{confirmModal.offer.club_name}</strong>? This seat will be immediately released to the next waitlisted applicant.
                                </>
                            )}
                        </p>

                        <div className="flex justify-end gap-2 pt-2">
                            <button
                                onClick={() => setConfirmModal(null)}
                                className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-lg"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleConfirmAction}
                                disabled={actionLoading}
                                className={`px-4 py-2 text-xs font-bold text-white rounded-lg shadow-sm ${
                                    confirmModal.action === 'accept'
                                        ? 'bg-emerald-600 hover:bg-emerald-700'
                                        : 'bg-red-600 hover:bg-red-700'
                                }`}
                            >
                                {actionLoading ? 'Processing...' : confirmModal.action === 'accept' ? 'Yes, Accept Offer' : 'Yes, Decline'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

