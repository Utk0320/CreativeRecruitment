import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { Building2, BriefcaseBusiness, FileText, Plus, Users, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { notifyDataChanged, useDataSync } from '../hooks/useDataSync';

const emptyClub = { name: '', category: '', description: '', logo_url: '' };

const CoordinatorClubs = () => {
    const { user } = useAuth();
    const [clubs, setClubs] = useState([]);
    const [selectedClub, setSelectedClub] = useState(null);
    const [form, setForm] = useState(emptyClub);
    const [editingId, setEditingId] = useState(null);
    const [showForm, setShowForm] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const fetchClubs = useCallback(() => {
        axios.get('http://localhost:5000/api/coordinator/clubs')
            .then(res => {
                setClubs(res.data);
                setSelectedClub(current => current
                    ? res.data.find(club => club.id === current.id) || res.data[0] || null
                    : res.data[0] || null);
            })
            .catch(err => setError(err.response?.data?.error || 'Unable to load clubs'))
            .finally(() => setLoading(false));
    }, []);

    useDataSync(fetchClubs);

    const selectedStats = useMemo(() => {
        const club = selectedClub;
        if (!club) return { drives: 0, applications: 0, shortlisted: 0 };
        return {
            drives: club.drives,
            applications: club.applications,
            shortlisted: club.shortlisted
        };
    }, [selectedClub]);

    const openCreate = () => {
        setEditingId(null);
        setForm(emptyClub);
        setShowForm(true);
        setError('');
    };

    const openEdit = (club) => {
        setEditingId(club.id);
        setForm({
            name: club.name,
            category: club.category,
            description: club.description,
            logo_url: club.logo_url || ''
        });
        setShowForm(true);
        setError('');
    };

    const saveClub = async (event) => {
        event.preventDefault();
        setSaving(true);
        setError('');
        try {
            if (editingId) {
                await axios.put(`http://localhost:5000/api/clubs/${editingId}`, form);
            } else {
                await axios.post('http://localhost:5000/api/clubs', form);
            }
            setShowForm(false);
            notifyDataChanged();
            fetchClubs();
        } catch (err) {
            setError(err.response?.data?.error || 'Unable to save club');
        } finally {
            setSaving(false);
        }
    };

    const deleteClub = async (club) => {
        if (!window.confirm(`Delete ${club.name}? This will also remove its drives.`)) return;
        try {
            await axios.delete(`http://localhost:5000/api/clubs/${club.id}`);
            notifyDataChanged();
            fetchClubs();
        } catch (err) {
            setError(err.response?.data?.error || 'Unable to delete club');
        }
    };

    if (loading) return <div className="p-8 text-center text-gray-500">Loading clubs...</div>;
    if (!user || user.role !== 'coordinator') return <div className="p-8 text-center text-red-500">Access denied</div>;

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between mb-8 gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">Manage Clubs</h1>
                    <p className="text-gray-600 mt-2">Select a club to review its drives and applications.</p>
                </div>
                <button onClick={openCreate} className="flex items-center justify-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700">
                    <Plus size={18} /> Add Club
                </button>
            </div>

            {error && <div className="mb-6 bg-red-50 border border-red-200 text-red-700 rounded-lg p-4">{error}</div>}

            {showForm && (
                <form onSubmit={saveClub} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
                    <div className="flex items-center justify-between mb-5">
                        <h2 className="text-xl font-bold text-gray-900">{editingId ? 'Edit Club' : 'Add Club'}</h2>
                        <button type="button" onClick={() => setShowForm(false)} aria-label="Close"><X size={20} /></button>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                        <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="px-4 py-2 border rounded-lg" placeholder="Club name" />
                        <input required value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="px-4 py-2 border rounded-lg" placeholder="Category" />
                        <textarea required value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="md:col-span-2 px-4 py-2 border rounded-lg rows-3" placeholder="Club description" />
                        <input type="url" value={form.logo_url} onChange={e => setForm({ ...form, logo_url: e.target.value })} className="md:col-span-2 px-4 py-2 border rounded-lg" placeholder="Logo URL (optional)" />
                    </div>
                    <div className="flex justify-end gap-3 mt-5">
                        <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 border rounded-lg">Cancel</button>
                        <button disabled={saving} className="px-4 py-2 bg-indigo-600 text-white rounded-lg disabled:opacity-60">{saving ? 'Saving...' : editingId ? 'Save Changes' : 'Create Club'}</button>
                    </div>
                </form>
            )}

            {clubs.length === 0 ? (
                <div className="bg-white rounded-xl border border-dashed border-gray-300 p-12 text-center">
                    <Building2 className="mx-auto w-10 h-10 text-gray-300 mb-3" />
                    <h2 className="text-lg font-semibold">No clubs yet</h2>
                    <p className="text-gray-500">Create your first club to start managing drives.</p>
                </div>
            ) : (
                <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
                    <div className="space-y-4">
                        <h2 className="text-xl font-bold text-gray-900">Your Clubs</h2>
                        {clubs.map(club => (
                            <button key={club.id} onClick={() => setSelectedClub(club)} className={`w-full rounded-xl border bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md ${selectedClub?.id === club.id ? 'border-indigo-400 ring-2 ring-indigo-100' : 'border-gray-200'}`}>
                                <div className="flex items-center gap-4">
                                    <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                                        {club.logo_url ? <img src={club.logo_url} alt="" className="h-full w-full rounded-xl object-cover" /> : <Building2 size={26} />}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <h3 className="font-bold text-gray-900">{club.name}</h3>
                                        <p className="text-sm text-gray-500">{club.category}</p>
                                    </div>
                                    <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium">{club.drives} drives</span>
                                </div>
                            </button>
                        ))}
                    </div>

                    {selectedClub && (
                        <aside className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">Selected club</p>
                                    <h2 className="text-2xl font-bold mt-1 text-gray-900">{selectedClub.name}</h2>
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => openEdit(selectedClub)} className="px-3 py-1.5 text-sm rounded-lg bg-indigo-50 text-indigo-700">Edit</button>
                                    <button onClick={() => deleteClub(selectedClub)} className="px-3 py-1.5 text-sm rounded-lg bg-red-50 text-red-700">Delete</button>
                                </div>
                            </div>
                            <p className="text-sm text-gray-600 mt-3">{selectedClub.description || 'No description provided.'}</p>
                            <div className="mt-6 space-y-3">
                                <div className="flex items-center rounded-lg bg-gray-50 p-4">
                                    <BriefcaseBusiness className="mr-3 text-indigo-600" />
                                    <div><p className="text-sm font-medium text-gray-700">Active drives</p><p className="font-bold">{selectedStats.drives}</p></div>
                                </div>
                                <div className="flex items-center rounded-lg bg-gray-50 p-4">
                                    <Users className="mr-3 text-green-600" />
                                    <div><p className="text-sm font-medium text-gray-700">Applications</p><p className="font-bold">{selectedStats.applications}</p></div>
                                </div>
                                <div className="flex items-center rounded-lg bg-gray-50 p-4">
                                    <FileText className="mr-3 text-purple-600" />
                                    <div><p className="text-sm font-medium text-gray-700">Shortlisted</p><p className="font-bold">{selectedStats.shortlisted}</p></div>
                                </div>
                            </div>
                            <Link to="/coordinator/drives" className="mt-6 flex w-full justify-center rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700">Manage Drives</Link>
                        </aside>
                    )}
                </div>
            )}
        </div>
    );
};

export default CoordinatorClubs;
