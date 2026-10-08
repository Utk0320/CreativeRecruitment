import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Edit3, Save, UserRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const CoordinatorProfile = () => {
    const { user, setUser } = useAuth();
    const [form, setForm] = useState({
        name: '',
        department: '',
        year: '',
        phone: '',
        bio: ''
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        if (!user) return;

        axios.get(`http://localhost:5000/api/users/${user.id}`)
            .then(res => {
                const profile = res.data;
                setForm({
                    name: profile.name || '',
                    department: profile.department || '',
                    year: profile.year || '',
                    phone: profile.phone || '',
                    bio: profile.bio || ''
                });
                setLoading(false);
            })
            .catch(err => {
                setError(err.response?.data?.error || 'Unable to load profile.');
                setLoading(false);
            });
    }, [user]);

    const handleSubmit = async (event) => {
        event.preventDefault();
        setSaving(true);
        setMessage('');
        setError('');

        try {
            const response = await axios.get(`http://localhost:5000/api/users/${user.id}`);
            await axios.put(`http://localhost:5000/api/users/${user.id}`, {
                name: form.name.trim(),
                department: form.department.trim(),
                year: form.year ? Number(form.year) : '',
                phone: form.phone.trim(),
                bio: form.bio.trim(),
                skills: response.data.skills || [],
                interests: response.data.interests || [],
                projects: response.data.projects || [],
                achievements: response.data.achievements || []
            });

            setUser({ ...user, ...form, year: form.year ? Number(form.year) : '' });
            setMessage('Profile updated successfully.');
        } catch (err) {
            setError(err.response?.data?.error || 'Unable to update profile.');
        } finally {
            setSaving(false);
        }
    };

    if (!user || user.role !== 'coordinator') {
        return <div className="max-w-3xl mx-auto px-4 py-12 text-center text-red-600">Access denied.</div>;
    }

    if (loading) {
        return <div className="p-8 text-center text-gray-500">Loading profile...</div>;
    }

    return (
        <div className="max-w-4xl mx-auto px-4 py-10 sm:px-6 lg:px-8">
            <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-indigo-600">Coordinator profile</p>
                    <h1 className="mt-2 text-3xl font-bold text-gray-900">Edit your profile</h1>
                    <p className="mt-2 text-gray-600">Update your basic account details.</p>
                </div>
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600 shadow-sm">
                    <UserRound size={28} />
                </div>
            </div>

            <form onSubmit={handleSubmit} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
                {message && <div className="mb-6 rounded-lg bg-green-50 px-4 py-3 text-sm font-medium text-green-700">{message}</div>}
                {error && <div className="mb-6 rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div>}

                <div className="grid gap-5 sm:grid-cols-2">
                    <label className="block">
                        <span className="mb-2 block text-sm font-medium text-gray-700">Full name</span>
                        <input
                            required
                            value={form.name}
                            onChange={event => setForm({ ...form, name: event.target.value })}
                            className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-gray-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                        />
                    </label>

                    <label className="block">
                        <span className="mb-2 block text-sm font-medium text-gray-700">Department</span>
                        <input
                            value={form.department}
                            onChange={event => setForm({ ...form, department: event.target.value })}
                            placeholder="e.g. Engineering"
                            className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-gray-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                        />
                    </label>

                    <label className="block">
                        <span className="mb-2 block text-sm font-medium text-gray-700">Year / experience</span>
                        <input
                            type="number"
                            min="1"
                            max="10"
                            value={form.year}
                            onChange={event => setForm({ ...form, year: event.target.value })}
                            placeholder="e.g. 3"
                            className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-gray-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                        />
                    </label>

                    <label className="block">
                        <span className="mb-2 block text-sm font-medium text-gray-700">Phone number</span>
                        <input
                            type="tel"
                            value={form.phone}
                            onChange={event => setForm({ ...form, phone: event.target.value })}
                            placeholder="Optional"
                            className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-gray-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                        />
                    </label>
                </div>

                <label className="mt-5 block">
                    <span className="mb-2 block text-sm font-medium text-gray-700">Bio</span>
                    <textarea
                        value={form.bio}
                        onChange={event => setForm({ ...form, bio: event.target.value })}
                        placeholder="Tell others about your role and responsibilities."
                        rows="5"
                        className="w-full resize-none rounded-lg border border-gray-300 px-4 py-2.5 text-gray-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                    />
                </label>

                <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                    <button type="button" onClick={() => setForm({ name: user.name, department: user.department || '', year: user.year || '', phone: user.phone || '', bio: user.bio || '' })} className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                        Reset
                    </button>
                    <button type="submit" disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60">
                        <Save size={17} /> {saving ? 'Saving...' : 'Save changes'}
                    </button>
                </div>
            </form>

            <div className="mt-5 flex items-center gap-2 rounded-lg border border-indigo-100 bg-indigo-50 p-4 text-sm text-indigo-700">
                <Edit3 size={17} />
                <span>Your changes are saved to your coordinator account.</span>
            </div>
        </div>
    );
};

export default CoordinatorProfile;
