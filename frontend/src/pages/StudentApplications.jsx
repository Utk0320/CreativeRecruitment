import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';
import axios from '../api';
import { ArrowLeft, Briefcase, Calendar, BookOpen, UserCheck } from 'lucide-react';
import ApplicationTracker from '../components/ApplicationTracker';
import StudentOfferCoordination from '../components/StudentOfferCoordination';
import StudentAssessmentModal from '../components/StudentAssessmentModal';
import StudentInterviewModal from '../components/StudentInterviewModal';
import StudentAppealModal from '../components/StudentAppealModal';

const StudentApplications = () => {
    const { user } = useAuth();
    const [applications, setApplications] = useState([]);
    const [appealsMap, setAppealsMap] = useState({});
    const [loading, setLoading] = useState(true);
    const [activeAssessmentApp, setActiveAssessmentApp] = useState(null);
    const [activeInterviewApp, setActiveInterviewApp] = useState(null);
    const [activeAppealApp, setActiveAppealApp] = useState(null);

    const fetchApplications = async () => {
        try {
            const [appsRes, appealsRes] = await Promise.all([
                axios.get('/applications'),
                axios.get('/appeals/my').catch(() => ({ data: [] }))
            ]);
            // Sort by applied_at descending
            const sortedApps = appsRes.data.sort((a, b) => new Date(b.applied_at) - new Date(a.applied_at));
            setApplications(sortedApps);

            const map = {};
            for (const ap of appealsRes.data) {
                map[ap.application_id] = ap;
            }
            setAppealsMap(map);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchApplications();
    }, []);

    const getStatusColor = (status) => {
        switch(status) {
            case 'Selected': return 'bg-green-100 text-green-800 border-green-200';
            case 'Rejected': return 'bg-red-100 text-red-800 border-red-200';
            case 'Shortlisted': return 'bg-purple-100 text-purple-800 border-purple-200';
            case 'Under Review': return 'bg-blue-100 text-blue-800 border-blue-200';
            default: return 'bg-gray-100 text-gray-800 border-gray-200';
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="bg-gray-50 min-h-screen py-8 px-4 sm:px-6 lg:px-8">
            <div className="max-w-5xl mx-auto">
                <Link to="/student/dashboard" className="inline-flex items-center text-sm font-medium text-indigo-600 hover:text-indigo-800 mb-6">
                    <ArrowLeft className="w-4 h-4 mr-2" /> Back to Dashboard
                </Link>

                {/* Phase 7: Multi-offer coordination & preference ranking */}
                <StudentOfferCoordination onOffersUpdated={fetchApplications} />

                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="p-6 border-b border-gray-100 bg-white">
                        <h1 className="text-2xl font-bold text-gray-900">All Applications</h1>
                        <p className="text-gray-500 mt-1">Review the status of your club applications</p>
                    </div>
                    
                    <div className="divide-y divide-gray-100">
                        {applications.length === 0 ? (
                            <div className="p-16 text-center">
                                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 mb-4">
                                    <Briefcase className="w-8 h-8 text-gray-400" />
                                </div>
                                <h3 className="text-lg font-medium text-gray-900 mb-1">No applications yet</h3>
                                <p className="text-gray-500 mb-6">You haven't applied to any clubs yet.</p>
                                <Link to="/student/apply" className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700">
                                    Find Clubs to Apply
                                </Link>
                            </div>
                        ) : (
                            applications.map(app => (
                                <div key={app.id} className="p-6 hover:bg-gray-50/50 transition-colors">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                        <div className="mb-2 sm:mb-0 min-w-0 flex-1">
                                            <h3 className="text-lg font-bold text-gray-900 truncate">{app.club_name}</h3>
                                            <p className="text-sm font-medium text-indigo-600 mb-1 truncate">{app.drive_title}</p>
                                            <div className="flex items-center text-xs text-gray-500 mt-1">
                                                <Calendar className="w-3.5 h-3.5 mr-1 shrink-0" />
                                                <span>Applied on {new Date(app.applied_at).toLocaleDateString()}</span>
                                                {app.updated_at && app.updated_at !== app.applied_at && (
                                                    <span className="ml-3 italic truncate">
                                                        (Updated: {new Date(app.updated_at).toLocaleDateString()})
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex flex-col sm:items-end shrink-0">
                                            <span className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold border ${getStatusColor(app.status)} mb-2`}>
                                                {app.status}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Phase 4: Application Tracker (stages, outcome, expected decision date) */}
                                    <ApplicationTracker application={app} />

                                    {/* Phase 8: Appeal Status Banner & Appeal Action */}
                                    {appealsMap[app.id] ? (
                                        <div className="mt-3 p-3 bg-amber-50/60 rounded-xl border border-amber-200/80 text-xs text-amber-900 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                            <div className="min-w-0 flex-1">
                                                <span className="font-bold">Recruitment Appeal: </span>
                                                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                                    appealsMap[app.id].status === 'Overturned' ? 'bg-green-100 text-green-800' :
                                                    appealsMap[app.id].status === 'Upheld' ? 'bg-red-100 text-red-800' :
                                                    'bg-amber-100 text-amber-800'
                                                }`}>
                                                    {appealsMap[app.id].status}
                                                </span>
                                                {appealsMap[app.id].reviewer_notes && (
                                                    <p className="mt-1 text-gray-600 italic break-words">"{appealsMap[app.id].reviewer_notes}"</p>
                                                )}
                                            </div>
                                        </div>
                                    ) : (['Rejected', 'Waitlisted'].includes(app.outcome || app.status)) ? (
                                        (() => {
                                            const windowDays = app.appeal_window_days || 7;
                                            const decisionTime = app.decision_date ? new Date(app.decision_date).getTime() : new Date(app.updated_at || Date.now()).getTime();
                                            const expiresAt = decisionTime + windowDays * 24 * 3600 * 1000;
                                            const isExpired = Date.now() > expiresAt;
                                            const daysLeft = Math.ceil((expiresAt - Date.now()) / (24 * 3600 * 1000));

                                            return (
                                                <div className="mt-3 p-3 bg-gray-50 rounded-xl border border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                                    <div className="text-xs text-gray-500 min-w-0">
                                                        {!isExpired ? (
                                                            <span className="text-amber-800 font-medium">⏳ Appeal window: {daysLeft} days remaining</span>
                                                        ) : (
                                                            <span className="text-gray-400">Official appeal window has closed</span>
                                                        )}
                                                    </div>
                                                    {!isExpired && (
                                                        <button
                                                            onClick={() => setActiveAppealApp(app)}
                                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-lg text-xs font-bold transition-colors shrink-0"
                                                        >
                                                            ⚖️ Appeal Decision
                                                        </button>
                                                    )}
                                                </div>
                                            );
                                        })()
                                    ) : null}

                                    {/* Action Buttons (Assessments, Interviews, Support) */}
                                    <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap items-center justify-between gap-2">
                                        <Link
                                            to={`/help?category=Application&clubId=${app.club_id || ''}&appId=${app.id}&report=true`}
                                            className="text-[11px] text-gray-400 hover:text-indigo-600 transition-colors"
                                        >
                                            Report a problem
                                        </Link>

                                        <div className="flex flex-wrap gap-2">
                                            {(app.current_stage_id === 'stage_test' || app.current_stage_id === 'stage_task' || app.status === 'Shortlisted') && (
                                                <button
                                                    onClick={() => setActiveAssessmentApp(app)}
                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold transition-colors"
                                                >
                                                    <BookOpen className="w-3.5 h-3.5" />
                                                    Skill Assessment
                                                </button>
                                            )}

                                            {(app.current_stage_id === 'stage_interview' || app.outcome === 'Shortlisted' || app.status === 'Shortlisted') && (
                                                <button
                                                    onClick={() => setActiveInterviewApp(app)}
                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-lg text-xs font-bold transition-colors"
                                                >
                                                    <UserCheck className="w-3.5 h-3.5" />
                                                    Interview Booking & Calendar
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Modals */}
                {activeAppealApp && (
                    <StudentAppealModal
                        application={activeAppealApp}
                        isOpen={Boolean(activeAppealApp)}
                        onClose={() => setActiveAppealApp(null)}
                        onAppealSubmitted={fetchApplications}
                    />
                )}

                {activeAssessmentApp && (
                    <StudentAssessmentModal
                        application={activeAssessmentApp}
                        onClose={() => setActiveAssessmentApp(null)}
                        onSubmitted={fetchApplications}
                    />
                )}

                {activeInterviewApp && (
                    <StudentInterviewModal
                        application={activeInterviewApp}
                        onClose={() => setActiveInterviewApp(null)}
                        onBooked={fetchApplications}
                    />
                )}
            </div>
        </div>
    );
};

export default StudentApplications;

