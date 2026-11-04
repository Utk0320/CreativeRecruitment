import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from '../api';
import { useAuth } from '../context/AuthContext';
import {
    Users, Calendar, ArrowLeft, Briefcase, MapPin, Globe,
    CheckSquare, Clock, QrCode, Check, Award, ExternalLink, X
} from 'lucide-react';

const StudentClubDetails = () => {
    const { id } = useParams();
    const { user } = useAuth();
    const [club, setClub] = useState(null);
    const [drives, setDrives] = useState([]);
    const [roster, setRoster] = useState([]);
    const [events, setEvents] = useState([]);
    const [onboardingTasks, setOnboardingTasks] = useState([]);
    const [activeTab, setActiveTab] = useState('drives');
    const [loading, setLoading] = useState(true);
    const [checkInEvent, setCheckInEvent] = useState(null);
    const [qrCodeInput, setQrCodeInput] = useState('');
    const [checkInMsg, setCheckInMsg] = useState('');
    const [checkInErr, setCheckInErr] = useState('');

    const fetchDetails = async () => {
        try {
            const [clubRes, drivesRes, rosterRes, eventsRes, onbRes] = await Promise.all([
                axios.get(`/clubs/${id}`),
                axios.get('/drives'),
                axios.get(`/clubs/${id}/members/roster`).catch(() => ({ data: [] })),
                axios.get(`/lifecycle/clubs/${id}/events`).catch(() => ({ data: [] })),
                axios.get(`/lifecycle/clubs/${id}/onboarding`).catch(() => ({ data: [] }))
            ]);
            setClub(clubRes.data);
            setDrives(drivesRes.data.filter(d => d.club_id === parseInt(id) && ['open', 'published'].includes(d.status)));
            setRoster(rosterRes.data || []);
            setEvents(eventsRes.data || []);
            setOnboardingTasks(onbRes.data || []);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDetails();
    }, [id]);

    const handleRsvp = async (eventId, status) => {
        try {
            await axios.post(`/lifecycle/events/${eventId}/rsvp`, { status });
            await fetchDetails();
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to update RSVP');
        }
    };

    const handleCheckInSubmit = async (e) => {
        e.preventDefault();
        if (!checkInEvent || !qrCodeInput.trim()) return;
        setCheckInMsg('');
        setCheckInErr('');
        try {
            await axios.post(`/lifecycle/events/${checkInEvent.id}/check-in`, { qr_token: qrCodeInput.trim() });
            setCheckInMsg('Presence verified! Attendance recorded successfully.');
            setQrCodeInput('');
            await fetchDetails();
        } catch (err) {
            setCheckInErr(err.response?.data?.error || 'Check-in failed. Please verify the code.');
        }
    };

    const handleToggleOnboarding = async (taskId) => {
        try {
            await axios.post(`/lifecycle/clubs/${id}/onboarding/${taskId}/toggle`, {});
            await fetchDetails();
        } catch (err) {
            console.error(err);
        }
    };

    if (loading) return (
        <div className="min-h-screen flex items-center justify-center">
            <div className="animate-spin w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full"></div>
        </div>
    );
    if (!club) return <div className="p-8 text-center text-red-500 font-bold text-xl">Club not found</div>;

    const isMember = roster.some(m => m.user_id === user?.id);

    return (
        <div className="bg-gray-50 min-h-screen pb-16">
            {/* Header Banner */}
            <div className="h-64 bg-gradient-to-r from-indigo-700 to-purple-800 relative">
                <Link to="/explore-clubs" className="absolute top-6 left-6 inline-flex items-center text-white/80 hover:text-white transition-colors bg-black/20 hover:bg-black/40 px-3 py-1.5 rounded-full text-sm font-medium backdrop-blur-sm">
                    <ArrowLeft className="w-4 h-4 mr-1" /> Back to Clubs
                </Link>
            </div>

            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 -mt-24 relative z-10">
                {/* Club Overview Card */}
                <div className="bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden mb-8">
                    <div className="p-8 sm:p-10 flex flex-col sm:flex-row gap-8 items-start sm:items-center">
                        <div className="w-32 h-32 bg-white rounded-3xl shadow-lg border-4 border-white flex-shrink-0 flex items-center justify-center -mt-16 sm:-mt-0">
                            <Users className="w-16 h-16 text-indigo-500" />
                        </div>
                        <div className="flex-1">
                            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
                                <div>
                                    <div className="flex items-center gap-3">
                                        <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-1 break-words">{club.name}</h1>
                                        {isMember && (
                                            <span className="bg-emerald-100 text-emerald-800 text-xs font-bold px-2.5 py-0.5 rounded-full shrink-0">
                                                Active Member
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex flex-wrap gap-3 text-sm text-gray-600 mb-4 mt-1">
                                        <span className="inline-flex items-center bg-indigo-50 text-indigo-700 px-3 py-0.5 rounded-full font-semibold text-xs shrink-0">
                                            {club.category || 'General'}
                                        </span>
                                        <span className="inline-flex items-center text-xs"><MapPin className="w-3.5 h-3.5 mr-1 shrink-0" /> Campus MMCOE</span>
                                        <span className="inline-flex items-center text-xs break-all"><Globe className="w-3.5 h-3.5 mr-1 shrink-0" /> {club.name.toLowerCase().replace(/\s+/g, '')}.mmcoe.edu</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="border-t border-gray-100 p-8 sm:p-10 bg-gray-50/50">
                        <h3 className="text-base font-bold text-gray-900 mb-2">About the Club</h3>
                        <p className="text-gray-600 leading-relaxed text-sm break-words">
                            {club.description || 'A passionate student community dedicated to innovation and skill building at MMCOE.'}
                        </p>
                    </div>
                </div>

                {/* Sub-Tabs Navigation */}
                <div className="flex border-b border-gray-200 mb-6 gap-2 sm:gap-4 overflow-x-auto whitespace-nowrap -mx-4 px-4 sm:mx-0 sm:px-0">
                    <button
                        type="button"
                        onClick={() => setActiveTab('drives')}
                        className={`py-3 px-4 font-semibold text-sm rounded-t-xl transition-all border-b-2 flex items-center gap-2 ${
                            activeTab === 'drives'
                                ? 'border-indigo-600 text-indigo-600 bg-white'
                                : 'border-transparent text-gray-500 hover:text-gray-800'
                        }`}
                    >
                        <Briefcase size={16} />
                        <span>Recruitment Drives ({drives.length})</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setActiveTab('roster')}
                        className={`py-3 px-4 font-semibold text-sm rounded-t-xl transition-all border-b-2 flex items-center gap-2 ${
                            activeTab === 'roster'
                                ? 'border-indigo-600 text-indigo-600 bg-white'
                                : 'border-transparent text-gray-500 hover:text-gray-800'
                        }`}
                    >
                        <Users size={16} />
                        <span>Team & Alumni ({roster.length})</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setActiveTab('events')}
                        className={`py-3 px-4 font-semibold text-sm rounded-t-xl transition-all border-b-2 flex items-center gap-2 ${
                            activeTab === 'events'
                                ? 'border-indigo-600 text-indigo-600 bg-white'
                                : 'border-transparent text-gray-500 hover:text-gray-800'
                        }`}
                    >
                        <Calendar size={16} />
                        <span>Events & Workshops ({events.length})</span>
                    </button>

                    {isMember && (
                        <button
                            type="button"
                            onClick={() => setActiveTab('onboarding')}
                            className={`py-3 px-4 font-semibold text-sm rounded-t-xl transition-all border-b-2 flex items-center gap-2 ${
                                activeTab === 'onboarding'
                                    ? 'border-indigo-600 text-indigo-600 bg-white'
                                    : 'border-transparent text-gray-500 hover:text-gray-800'
                            }`}
                        >
                            <CheckSquare size={16} />
                            <span>My Onboarding Tasks</span>
                        </button>
                    )}
                </div>

                {/* TAB 1: RECRUITMENT DRIVES */}
                {activeTab === 'drives' && (
                    <div className="space-y-6">
                        {drives.length === 0 ? (
                            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
                                <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                                <h3 className="text-lg font-medium text-gray-900">No active recruitment drives</h3>
                                <p className="text-gray-500 mt-2">Check back later for opportunities.</p>
                            </div>
                        ) : (
                            drives.map(drive => (
                                <div key={drive.id} className="bg-white rounded-2xl shadow-sm hover:shadow-lg transition-shadow border border-gray-100 p-6 sm:p-8">
                                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-3 mb-2">
                                                <h3 className="text-2xl font-bold text-gray-900">{drive.title}</h3>
                                                <span className="bg-green-100 text-green-800 text-xs font-bold px-2.5 py-1 rounded-md uppercase tracking-wide">Accepting</span>
                                            </div>
                                            <p className="text-gray-600 mb-6 line-clamp-2">{drive.description}</p>
                                            
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm bg-gray-50 p-4 rounded-xl">
                                                <div>
                                                    <span className="block text-gray-500 font-medium mb-1">Eligibility</span>
                                                    <span className="font-semibold text-gray-900">{drive.eligibility || 'All Students'}</span>
                                                </div>
                                                <div>
                                                    <span className="block text-gray-500 font-medium mb-1">Deadline</span>
                                                    <span className="font-semibold text-red-600 flex items-center">
                                                        <Calendar className="w-4 h-4 mr-1" /> {drive.deadline ? new Date(drive.deadline).toLocaleDateString() : 'Rolling'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center md:items-end justify-center">
                                            <Link to={`/student/apply/${drive.id}`} className="w-full md:w-auto px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow transition-colors text-center">
                                                Apply Now
                                            </Link>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}

                {/* TAB 2: ROSTER & TEAM DIRECTORY */}
                {activeTab === 'roster' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {roster.length === 0 ? (
                            <div className="col-span-3 bg-white rounded-2xl p-12 text-center border border-gray-200">
                                <Users size={36} className="text-gray-300 mx-auto mb-2" />
                                <h4 className="text-sm font-bold text-gray-700">Roster Not Public Yet</h4>
                                <p className="text-xs text-gray-400 mt-1">Club leads will publish members once onboarding completes.</p>
                            </div>
                        ) : (
                            roster.map(member => (
                                <div key={member.id} className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs hover:shadow-md transition">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                                            member.role === 'lead' ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-gray-700'
                                        }`}>
                                            {member.role === 'lead' ? 'Club Lead' : member.title || 'Member'}
                                        </span>
                                        {member.status === 'alumni' && (
                                            <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                                                Alumni
                                            </span>
                                        )}
                                    </div>
                                    <h4 className="font-bold text-gray-900 text-base">{member.name}</h4>
                                    <p className="text-xs text-gray-500 mt-0.5">
                                        {member.department ? `${member.department} Engineering` : 'Student'} {member.year ? `• Year ${member.year}` : ''}
                                    </p>
                                    {member.bio && (
                                        <p className="text-xs text-gray-600 mt-3 line-clamp-2 bg-gray-50 p-2.5 rounded-xl border border-gray-100">
                                            "{member.bio}"
                                        </p>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                )}

                {/* TAB 3: EVENTS & WORKSHOPS */}
                {activeTab === 'events' && (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Campus Activities & Meetups</span>
                        </div>
                        {events.length === 0 ? (
                            <div className="bg-white rounded-2xl p-12 text-center border border-gray-200">
                                <Calendar size={36} className="text-gray-300 mx-auto mb-2" />
                                <h4 className="text-sm font-bold text-gray-700">No Upcoming Events</h4>
                                <p className="text-xs text-gray-400 mt-1">Check back soon for sessions and hackathons.</p>
                            </div>
                        ) : (
                            events.map(ev => (
                                <div key={ev.id} className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-6">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-3 mb-1">
                                            <h4 className="text-lg font-bold text-gray-900">{ev.title}</h4>
                                            {ev.my_attendance === 1 && (
                                                <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                                                    <Check size={12} /> Attended
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-gray-600 mb-3">{ev.description || 'Join this session to collaborate with members.'}</p>
                                        <div className="flex flex-wrap gap-4 text-xs text-gray-500">
                                            <span className="flex items-center gap-1 font-semibold text-gray-800">
                                                <Calendar size={13} className="text-indigo-600" /> {ev.event_date}
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <Clock size={13} /> {ev.start_time} - {ev.end_time}
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <MapPin size={13} /> {ev.location}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-2 pt-2 md:pt-0">
                                        {/* RSVP Toggles */}
                                        <button
                                            type="button"
                                            onClick={() => handleRsvp(ev.id, 'going')}
                                            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition ${
                                                ev.my_rsvp_status === 'going'
                                                    ? 'bg-indigo-600 border-indigo-600 text-white'
                                                    : 'border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100'
                                            }`}
                                        >
                                            {ev.my_rsvp_status === 'going' ? '✓ Attending' : 'RSVP Going'}
                                        </button>

                                        {/* Check-In Button */}
                                        {ev.my_attendance !== 1 && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setCheckInEvent(ev);
                                                    setCheckInMsg('');
                                                    setCheckInErr('');
                                                }}
                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition"
                                            >
                                                <QrCode size={13} /> Check In (QR)
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}

                {/* TAB 4: MY ONBOARDING (Members only) */}
                {activeTab === 'onboarding' && isMember && (
                    <div className="bg-white rounded-3xl p-8 border border-gray-200 shadow-sm space-y-4">
                        <div className="border-b border-gray-100 pb-4 mb-4">
                            <h3 className="text-lg font-bold text-gray-900">My Onboarding Progress</h3>
                            <p className="text-xs text-gray-500">Complete these orientation tasks to set up your membership.</p>
                        </div>

                        {onboardingTasks.length === 0 ? (
                            <div className="text-center py-8 text-xs text-gray-400">No onboarding tasks currently assigned.</div>
                        ) : (
                            onboardingTasks.map(task => (
                                <div key={task.id} className="p-4 rounded-2xl border border-gray-100 bg-gray-50/50 flex items-start justify-between gap-4">
                                    <div className="flex items-start gap-3">
                                        <button
                                            type="button"
                                            onClick={() => handleToggleOnboarding(task.id)}
                                            className={`mt-0.5 w-6 h-6 rounded-lg border flex items-center justify-center transition ${
                                                task.is_completed === 1
                                                    ? 'bg-emerald-600 border-emerald-600 text-white'
                                                    : 'border-gray-300 bg-white hover:border-indigo-500'
                                            }`}
                                        >
                                            {task.is_completed === 1 && <Check size={14} />}
                                        </button>
                                        <div>
                                            <h4 className={`text-sm font-bold ${task.is_completed === 1 ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                                                {task.title}
                                            </h4>
                                            {task.description && (
                                                <p className="text-xs text-gray-600 mt-1">{task.description}</p>
                                            )}
                                            {task.resource_url && (
                                                <a
                                                    href={task.resource_url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="font-semibold text-indigo-600 hover:underline text-xs flex items-center gap-1 mt-2"
                                                >
                                                    <ExternalLink size={12} /> Open Setup Resource
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>

            {/* Check-In Modal */}
            {checkInEvent && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 overflow-y-auto">
                    <div className="w-full max-w-sm max-h-[90vh] overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl border border-gray-200">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-base font-bold text-gray-900">Event Check-In</h3>
                            <button onClick={() => setCheckInEvent(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
                        </div>
                        <p className="text-xs text-gray-600 mb-4 break-words">
                            Checking in for <span className="font-semibold text-gray-900">{checkInEvent.title}</span>. Enter the QR secret token displayed on the coordinator's screen.
                        </p>

                        {checkInMsg && (
                            <div className="mb-4 p-3 rounded-xl bg-emerald-50 text-emerald-800 text-xs font-semibold flex items-center gap-2">
                                <Check size={14} /> {checkInMsg}
                            </div>
                        )}
                        {checkInErr && (
                            <div className="mb-4 p-3 rounded-xl bg-red-50 text-red-800 text-xs font-semibold">
                                {checkInErr}
                            </div>
                        )}

                        <form onSubmit={handleCheckInSubmit} className="space-y-3">
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">
                                    QR Secret / Check-In Token
                                </label>
                                <input
                                    required
                                    type="text"
                                    placeholder="Paste or enter 32-character code"
                                    value={qrCodeInput}
                                    onChange={(e) => setQrCodeInput(e.target.value)}
                                    className="w-full rounded-xl border border-gray-300 p-2.5 text-xs bg-gray-50 focus:bg-white font-mono"
                                />
                            </div>
                            <div className="flex justify-end gap-2 pt-2">
                                <button type="button" onClick={() => setCheckInEvent(null)} className="rounded-xl border px-4 py-2 text-xs font-medium">Close</button>
                                <button type="submit" className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white">Verify Attendance</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default StudentClubDetails;
