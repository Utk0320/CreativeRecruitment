import React from 'react';
import {
    normalizeStages,
    REASON_LABELS,
    OUTCOME_BADGES
} from '../utils/pipelineTransitions';
import { Calendar, Check, Clock, HelpCircle, XCircle } from 'lucide-react';

const ApplicationTracker = ({ application }) => {
    if (!application) return null;

    const stages = normalizeStages(application.drive_stages || application.stages);
    const currentStageId = application.current_stage_id || stages[0]?.id || 'screening';
    const outcome = application.outcome || 'Pending';
    const isRejected = outcome === 'Rejected';
    const isSelected = outcome === 'Selected';
    const isWithdrawn = application.is_withdrawn === 1 || outcome === 'Withdrawn';

    const currentStageIndex = stages.findIndex(s => s.id === currentStageId);
    const activeIndex = currentStageIndex === -1 ? 0 : currentStageIndex;

    return (
        <div className="mt-4 pt-4 border-t border-gray-100 space-y-4">
            {/* Visual Step Tracker */}
            <div className="overflow-x-auto -mx-1 px-1">
              <div className="relative min-w-[320px]">
                <div className="flex items-center justify-between relative z-10">
                    {stages.map((stage, idx) => {
                        let statusClass = 'bg-gray-100 text-gray-400 border-gray-200';
                        let icon = idx + 1;

                        if (isWithdrawn) {
                            statusClass = 'bg-gray-100 text-gray-400 border-gray-200';
                        } else if (isRejected && idx === activeIndex) {
                            statusClass = 'bg-rose-50 text-rose-600 border-rose-400 ring-2 ring-rose-200';
                            icon = <XCircle className="w-4 h-4" />;
                        } else if (isSelected || idx < activeIndex) {
                            statusClass = 'bg-emerald-500 text-white border-emerald-500';
                            icon = <Check className="w-3.5 h-3.5" />;
                        } else if (idx === activeIndex) {
                            statusClass = 'bg-indigo-600 text-white border-indigo-600 ring-4 ring-indigo-100 animate-pulse';
                            icon = idx + 1;
                        }

                        return (
                            <div key={stage.id} className="flex flex-col items-center flex-1">
                                <div className={`w-7 h-7 rounded-full border flex items-center justify-center font-bold text-xs shadow-2xs transition-all ${statusClass}`}>
                                    {icon}
                                </div>
                                <span className={`text-[11px] mt-1.5 font-medium text-center line-clamp-2 max-w-[80px] ${
                                    idx === activeIndex ? 'text-indigo-900 font-bold' : 'text-gray-500'
                                }`}>
                                    {stage.name}
                                </span>
                            </div>
                        );
                    })}
                </div>

                {/* Connecting Track Line */}
                <div className="absolute top-3.5 left-6 right-6 h-0.5 bg-gray-200 z-0">
                    <div
                        className={`h-full transition-all duration-300 ${isRejected ? 'bg-rose-300' : 'bg-indigo-500'}`}
                        style={{
                            width: stages.length > 1
                                ? `${(Math.min(activeIndex, stages.length - 1) / (stages.length - 1)) * 100}%`
                                : '0%'
                        }}
                    />
                </div>
              </div>
            </div>

            {/* Tracker Status Details & Rejection/Waitlist Feedback */}
            <div className="bg-gray-50 rounded-xl p-3 border border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div>
                    <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-700">Current Status:</span>
                        <span className={`px-2 py-0.5 rounded-full font-bold border ${OUTCOME_BADGES[outcome] || 'bg-gray-100 text-gray-700 border-gray-200'}`}>
                            {outcome}
                        </span>
                        {application.offer_state && application.offer_state !== 'None' && (
                            <span className="px-2 py-0.5 rounded-full font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                Offer: {application.offer_state}
                            </span>
                        )}
                    </div>

                    {/* Reason code & feedback */}
                    {application.rejection_reason_code && (
                        <p className="text-gray-600 mt-1">
                            <span className="font-semibold text-gray-700">Reason:</span>{' '}
                            {REASON_LABELS[application.rejection_reason_code] || application.rejection_reason_code}
                        </p>
                    )}
                    {application.rejection_feedback && (
                        <div className="mt-1.5 p-2 bg-white rounded border border-gray-200 text-gray-600 italic">
                            "{application.rejection_feedback}"
                        </div>
                    )}
                </div>

                {/* Expected Decision Date / Deadline */}
                {(application.expected_decision_date || application.deadline) && (
                    <div className="flex items-center gap-1.5 text-gray-500 text-[11px] shrink-0">
                        <Clock className="w-3.5 h-3.5 text-indigo-500" />
                        <span>
                            Decision by:{' '}
                            <strong className="text-gray-700">
                                {new Date(application.expected_decision_date || application.deadline).toLocaleDateString()}
                            </strong>
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ApplicationTracker;

