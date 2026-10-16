import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext';

const FAQS = [
    {
        category: 'Applications',
        q: 'Can I edit my common application profile after submitting to a drive?',
        a: 'When you submit an application, a snapshot of your profile is permanently frozen for reviewers. You can update your master profile anytime for future drives, and you may re-submit to an active drive before its deadline to generate a new application version.'
    },
    {
        category: 'Applications',
        q: 'How many clubs can I apply to simultaneously?',
        a: 'The campus recruitment season allows multiple applications across clubs. If selected by multiple clubs at the end of the season, you will be invited to rank your preferences and accept your top choice offer.'
    },
    {
        category: 'Interviews & Tests',
        q: 'What happens if my interview slot clashes with another club?',
        a: 'CreativeRecruit features built-in cross-club clash detection. You will be prevented from booking overlapping time slots, ensuring your schedule never conflicts between clubs.'
    },
    {
        category: 'Appeals',
        q: 'How do I appeal a recruitment decision?',
        a: 'If your application outcome is Rejected or Waitlisted, an "Appeal Decision" button appears on your Applications dashboard for 7 days. You can submit one official appeal per application, which is independently reviewed by a panel coordinator.'
    },
    {
        category: 'Technical',
        q: 'Why am I not receiving email or SMS notifications?',
        a: 'Check your Notification Preferences in your profile. You can customize delivery channels (In-App, Email, SMS/WhatsApp) per event type.'
    }
];

const HelpSupport = () => {
    const { user } = useAuth();
    const [searchParams] = useSearchParams();

    const [activeTab, setActiveTab] = useState('tickets'); // 'tickets' or 'faq'
    const [tickets, setTickets] = useState([]);
    const [loading, setLoading] = useState(true);

    // Filter states
    const [statusFilter, setStatusFilter] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('');

    // New Ticket Modal State
    const [showNewModal, setShowNewModal] = useState(false);
    const [newSubject, setNewSubject] = useState('');
    const [newMessage, setNewMessage] = useState('');
    const [newCategory, setNewCategory] = useState(searchParams.get('category') || 'Application');
    const [newPriority, setNewPriority] = useState('Medium');
    const [newClubId, setNewClubId] = useState(searchParams.get('clubId') || '');
    const [newAppId, setNewAppId] = useState(searchParams.get('appId') || '');
    const [newAttachment, setNewAttachment] = useState('');
    const [creating, setCreating] = useState(false);
    const [formError, setFormError] = useState(null);

    // Thread View State
    const [selectedTicket, setSelectedTicket] = useState(null);
    const [replyText, setReplyText] = useState('');
    const [replying, setReplying] = useState(false);

    useEffect(() => {
        if (searchParams.get('report') === 'true' || searchParams.get('category')) {
            setShowNewModal(true);
        }
    }, [searchParams]);

    const fetchTickets = async () => {
        setLoading(true);
        try {
            const params = {};
            if (statusFilter) params.status = statusFilter;
            if (categoryFilter) params.category = categoryFilter;
            const res = await api.get('/tickets', { params });
            setTickets(res.data);
        } catch (err) {
            console.error('Failed to load tickets:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTickets();
    }, [statusFilter, categoryFilter]);

    const handleCreateTicket = async (e) => {
        e.preventDefault();
        setCreating(true);
        setFormError(null);

        try {
            const payload = {
                subject: newSubject.trim(),
                message: newMessage.trim(),
                category: newCategory,
                priority: newPriority,
                club_id: newClubId ? Number(newClubId) : undefined,
                application_id: newAppId ? Number(newAppId) : undefined,
                attachment_url: newAttachment.trim() || undefined
            };

            await api.post('/tickets', payload);
            setShowNewModal(false);
            setNewSubject('');
            setNewMessage('');
            setNewAttachment('');
            fetchTickets();
        } catch (err) {
            setFormError(err.response?.data?.error || 'Failed to submit ticket');
        } finally {
            setCreating(false);
        }
    };

    const openTicketDetails = async (ticketId) => {
        try {
            const res = await api.get(`/tickets/${ticketId}`);
            setSelectedTicket(res.data);
        } catch (err) {
            console.error('Failed to load ticket details:', err);
        }
    };

    const handleSendReply = async (e) => {
        e.preventDefault();
        if (!replyText.trim() || !selectedTicket) return;

        setReplying(true);
        try {
            await api.post(`/tickets/${selectedTicket.id}/replies`, {
                message: replyText.trim()
            });
            setReplyText('');
            openTicketDetails(selectedTicket.id);
            fetchTickets();
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to send reply');
        } finally {
            setReplying(false);
        }
    };

    const handleStatusChange = async (newStatus) => {
        if (!selectedTicket) return;
        try {
            await api.patch(`/tickets/${selectedTicket.id}/status`, { status: newStatus });
            openTicketDetails(selectedTicket.id);
            fetchTickets();
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to update status');
        }
    };

    const handleReopen = async () => {
        if (!selectedTicket) return;
        try {
            await api.post(`/tickets/${selectedTicket.id}/reopen`);
            openTicketDetails(selectedTicket.id);
            fetchTickets();
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to reopen ticket');
        }
    };

    return (
        <div className="max-w-6xl mx-auto px-4 py-8">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-gray-200 gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center space-x-2">
                        <span>🎧</span>
                        <span>Help & Support Center</span>
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">
                        Find answers to common questions or submit support tickets to club coordinators and IT
                    </p>
                </div>
                <div className="flex items-center space-x-3">
                    <button
                        onClick={() => setShowNewModal(true)}
                        className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-indigo-600 text-white shadow-sm hover:bg-indigo-700 transition-colors flex items-center space-x-1.5"
                    >
                        <span>+</span>
                        <span>Create Support Ticket</span>
                    </button>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex space-x-4 mt-6 border-b border-gray-200">
                <button
                    onClick={() => setActiveTab('tickets')}
                    className={`pb-3 text-sm font-semibold transition-colors relative ${
                        activeTab === 'tickets' ? 'text-indigo-600' : 'text-gray-500 hover:text-gray-800'
                    }`}
                >
                    My Support Tickets
                    {activeTab === 'tickets' && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 rounded-full" />
                    )}
                </button>
                <button
                    onClick={() => setActiveTab('faq')}
                    className={`pb-3 text-sm font-semibold transition-colors relative ${
                        activeTab === 'faq' ? 'text-indigo-600' : 'text-gray-500 hover:text-gray-800'
                    }`}
                >
                    Frequently Asked Questions (FAQ)
                    {activeTab === 'faq' && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 rounded-full" />
                    )}
                </button>
            </div>

            {/* Content Area */}
            {activeTab === 'faq' ? (
                <div className="mt-8 space-y-4 max-w-4xl">
                    {FAQS.map((faq, i) => (
                        <div key={i} className="bg-white rounded-2xl p-5 border border-gray-200 shadow-xs">
                            <div className="flex items-center space-x-2 mb-2">
                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700">
                                    {faq.category}
                                </span>
                            </div>
                            <h3 className="text-sm font-bold text-gray-900">{faq.q}</h3>
                            <p className="text-xs text-gray-600 mt-2 leading-relaxed">{faq.a}</p>
                        </div>
                    ))}
                    <div className="mt-8 p-6 bg-indigo-50/60 rounded-2xl border border-indigo-100 flex items-center justify-between">
                        <div>
                            <h4 className="text-sm font-bold text-indigo-950">Didn't find what you're looking for?</h4>
                            <p className="text-xs text-indigo-700 mt-0.5">Submit a ticket and our coordinators will assist you.</p>
                        </div>
                        <button
                            onClick={() => setShowNewModal(true)}
                            className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-semibold hover:bg-indigo-700"
                        >
                            Open Ticket
                        </button>
                    </div>
                </div>
            ) : (
                <div className="mt-6">
                    {/* Filters */}
                    <div className="flex flex-wrap gap-3 items-center justify-between pb-4">
                        <div className="flex flex-wrap gap-2 text-xs">
                            <select
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                                className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-gray-700"
                            >
                                <option value="">All Statuses</option>
                                <option value="Open">Open</option>
                                <option value="In Progress">In Progress</option>
                                <option value="Resolved">Resolved</option>
                                <option value="Closed">Closed</option>
                            </select>

                            <select
                                value={categoryFilter}
                                onChange={(e) => setCategoryFilter(e.target.value)}
                                className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-gray-700"
                            >
                                <option value="">All Categories</option>
                                <option value="Application">Application</option>
                                <option value="Account">Account</option>
                                <option value="Technical">Technical</option>
                                <option value="Appeal-related">Appeal-related</option>
                                <option value="Other">Other</option>
                            </select>
                        </div>
                        <span className="text-xs text-gray-500">{tickets.length} tickets</span>
                    </div>

                    {/* Ticket List */}
                    {loading ? (
                        <div className="py-16 flex justify-center items-center">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                        </div>
                    ) : tickets.length === 0 ? (
                        <div className="bg-white rounded-2xl p-12 text-center border border-gray-200 mt-4">
                            <div className="text-3xl mb-2">🎫</div>
                            <h3 className="text-sm font-bold text-gray-800">No support tickets found</h3>
                            <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
                                You haven't filed any tickets yet. Need help with a recruitment drive or technical issue?
                            </p>
                            <button
                                onClick={() => setShowNewModal(true)}
                                className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-semibold hover:bg-indigo-700"
                            >
                                Create Ticket
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-3 mt-2">
                            {tickets.map(ticket => (
                                <div
                                    key={ticket.id}
                                    onClick={() => openTicketDetails(ticket.id)}
                                    className="bg-white rounded-2xl p-4 border border-gray-200 shadow-xs hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-4"
                                >
                                    <div className="space-y-1 min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="font-mono text-xs font-bold text-indigo-600">{ticket.ticket_number}</span>
                                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                                ticket.priority === 'Urgent' ? 'bg-red-50 text-red-700 border border-red-200' :
                                                ticket.priority === 'High' ? 'bg-orange-50 text-orange-700' :
                                                'bg-gray-100 text-gray-700'
                                            }`}>
                                                {ticket.priority}
                                            </span>
                                            <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-gray-100 text-gray-700">
                                                {ticket.category}
                                            </span>
                                            {ticket.is_sla_breached === 1 && (
                                                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-100 text-rose-800 animate-pulse">
                                                    ⚠️ SLA Breached
                                                </span>
                                            )}
                                        </div>
                                        <h3 className="text-sm font-bold text-gray-900 break-words">{ticket.subject}</h3>
                                        <p className="text-xs text-gray-500 break-words">
                                            {ticket.club_name ? `Club: ${ticket.club_name} • ` : ''}
                                            Assigned: {ticket.assignee_name || 'Campus IT / Admin'} • Created {new Date(ticket.created_at).toLocaleDateString()}
                                        </p>
                                    </div>

                                    <div className="flex items-center space-x-3 self-end md:self-center">
                                        <div className="text-right">
                                            <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                                                ticket.status === 'Open' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                                                ticket.status === 'In Progress' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                                                ticket.status === 'Resolved' ? 'bg-green-50 text-green-700 border border-green-200' :
                                                'bg-gray-100 text-gray-600'
                                            }`}>
                                                {ticket.status}
                                            </span>
                                            <p className="text-[10px] text-gray-400 mt-1">{ticket.reply_count || 1} replies</p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Create Ticket Modal */}
            {showNewModal && (
                <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl border border-gray-100 animate-in fade-in zoom-in-95">
                        <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                            <h3 className="text-base font-bold text-gray-900">Create Support Ticket</h3>
                            <button onClick={() => setShowNewModal(false)} className="text-gray-400 hover:text-gray-600">✕</button>
                        </div>

                        {formError && (
                            <div className="mt-3 p-3 bg-red-50 text-red-700 rounded-xl text-xs border border-red-200">
                                {formError}
                            </div>
                        )}

                        <form onSubmit={handleCreateTicket} className="mt-4 space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">Subject</label>
                                <input
                                    type="text"
                                    required
                                    value={newSubject}
                                    onChange={(e) => setNewSubject(e.target.value)}
                                    placeholder="Brief summary of your query or problem"
                                    className="w-full text-xs p-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-1">Category</label>
                                    <select
                                        value={newCategory}
                                        onChange={(e) => setNewCategory(e.target.value)}
                                        className="w-full text-xs p-2.5 rounded-xl border border-gray-300 bg-white"
                                    >
                                        <option value="Application">Application</option>
                                        <option value="Account">Account</option>
                                        <option value="Technical">Technical</option>
                                        <option value="Appeal-related">Appeal-related</option>
                                        <option value="Other">Other</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-1">Priority</label>
                                    <select
                                        value={newPriority}
                                        onChange={(e) => setNewPriority(e.target.value)}
                                        className="w-full text-xs p-2.5 rounded-xl border border-gray-300 bg-white"
                                    >
                                        <option value="Low">Low (48h SLA)</option>
                                        <option value="Medium">Medium (24h SLA)</option>
                                        <option value="High">High (12h SLA)</option>
                                        <option value="Urgent">Urgent (4h SLA)</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">Detailed Description</label>
                                <textarea
                                    rows={4}
                                    required
                                    value={newMessage}
                                    onChange={(e) => setNewMessage(e.target.value)}
                                    placeholder="Please provide steps to reproduce or details for your inquiry..."
                                    className="w-full text-xs p-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">Screenshot / Document Link (Optional)</label>
                                <input
                                    type="url"
                                    value={newAttachment}
                                    onChange={(e) => setNewAttachment(e.target.value)}
                                    placeholder="https://drive.google.com/..."
                                    className="w-full text-xs p-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>

                            <div className="pt-2 flex justify-end space-x-3">
                                <button
                                    type="button"
                                    onClick={() => setShowNewModal(false)}
                                    className="px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-xl"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={creating}
                                    className="px-5 py-2 text-xs font-semibold bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50"
                                >
                                    {creating ? 'Submitting...' : 'Submit Ticket'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Threaded Conversation Modal */}
            {selectedTicket && (
                <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-gray-100 flex flex-col max-h-[90vh]">
                        {/* Modal Header */}
                        <div className="flex items-start justify-between pb-4 border-b border-gray-100">
                            <div className="min-w-0 flex-1 pr-2">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-mono text-xs font-bold text-indigo-600">{selectedTicket.ticket_number}</span>
                                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                        selectedTicket.status === 'Open' ? 'bg-blue-50 text-blue-700' :
                                        selectedTicket.status === 'In Progress' ? 'bg-amber-50 text-amber-700' :
                                        selectedTicket.status === 'Resolved' ? 'bg-green-50 text-green-700' :
                                        'bg-gray-100 text-gray-600'
                                    }`}>
                                        {selectedTicket.status}
                                    </span>
                                    <span className="text-xs text-gray-400">• SLA Due: {new Date(selectedTicket.sla_due_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                </div>
                                <h3 className="text-base font-bold text-gray-900 mt-1 break-words">{selectedTicket.subject}</h3>
                            </div>
                            <button onClick={() => setSelectedTicket(null)} className="text-gray-400 hover:text-gray-600 text-lg shrink-0">✕</button>
                        </div>

                        {/* Thread Replies */}
                        <div className="flex-1 overflow-y-auto my-4 pr-1 space-y-3">
                            {selectedTicket.replies?.map((rep, idx) => (
                                <div
                                    key={rep.id || idx}
                                    className={`p-3.5 rounded-2xl text-xs ${
                                        rep.sender_id === user.id
                                            ? 'bg-indigo-50/70 border border-indigo-100 ml-4 sm:ml-8'
                                            : 'bg-gray-50 border border-gray-200 mr-4 sm:mr-8'
                                    }`}
                                >
                                    <div className="flex items-center justify-between mb-1.5">
                                        <div className="flex items-center space-x-2">
                                            <span className="font-bold text-gray-900">{rep.sender_name}</span>
                                            <span className="px-1.5 py-0.5 text-[9px] font-semibold rounded-md bg-white border border-gray-200 text-gray-600 capitalize">
                                                {rep.sender_role}
                                            </span>
                                        </div>
                                        <span className="text-[10px] text-gray-400">
                                            {new Date(rep.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                    <p className="text-gray-800 leading-relaxed whitespace-pre-wrap break-words">{rep.message}</p>
                                    {rep.attachment_url && (
                                        <a
                                            href={rep.attachment_url}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="mt-2 inline-flex items-center space-x-1 text-indigo-600 font-semibold underline text-[11px] break-all"
                                        >
                                            <span>📎 Attachment link</span>
                                        </a>
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* Actions & Reply Form */}
                        <div className="pt-3 border-t border-gray-100 space-y-3">
                            {['Resolved', 'Closed'].includes(selectedTicket.status) && selectedTicket.user_id === user.id && (
                                <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-amber-900">
                                    <span>This ticket is {selectedTicket.status.toLowerCase()}. Need more help?</span>
                                    <button
                                        onClick={handleReopen}
                                        className="px-3 py-1 bg-amber-600 text-white rounded-lg font-semibold hover:bg-amber-700 shrink-0"
                                    >
                                        Reopen Ticket
                                    </button>
                                </div>
                            )}

                            {(user.role === 'coordinator' || user.role === 'admin') && (
                                <div className="flex flex-wrap items-center gap-2 text-xs">
                                    <span className="font-semibold text-gray-600">Update Status:</span>
                                    {['In Progress', 'Resolved', 'Closed'].map(st => (
                                        <button
                                            key={st}
                                            disabled={selectedTicket.status === st}
                                            onClick={() => handleStatusChange(st)}
                                            className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium text-gray-700 disabled:opacity-40"
                                        >
                                            Mark as {st}
                                        </button>
                                    ))}
                                </div>
                            )}

                            <form onSubmit={handleSendReply} className="flex gap-2">
                                <input
                                    type="text"
                                    value={replyText}
                                    onChange={(e) => setReplyText(e.target.value)}
                                    placeholder="Type your reply here..."
                                    className="flex-1 text-xs p-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-indigo-500"
                                />
                                <button
                                    type="submit"
                                    disabled={replying || !replyText.trim()}
                                    className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50"
                                >
                                    {replying ? 'Sending...' : 'Reply'}
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default HelpSupport;
