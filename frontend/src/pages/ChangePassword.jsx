import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api';

const ChangePassword = () => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [currentPassword, setCurrentPassword] = useState('');
    const [password, setPassword] = useState('');
    const [confirmation, setConfirmation] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    const submit = async (event) => {
        event.preventDefault();
        setError('');
        if (password.length < 10) return setError('Password must contain at least 10 characters.');
        if (password !== confirmation) return setError('Passwords do not match.');
        setBusy(true);
        try {
            await api.post('/auth/change-password', {
                current_password: user?.must_change_password ? undefined : currentPassword,
                password
            });
            await logout();
            navigate('/login');
        } catch (requestError) {
            setError(requestError.response?.data?.error || 'Unable to change password.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
            <section className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-7 shadow-sm">
                <h1 className="text-2xl font-bold text-gray-900">Change password</h1>
                <p className="mt-2 text-sm text-gray-600">Use a unique password with at least 10 characters.</p>
                {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
                <form onSubmit={submit} className="mt-5 space-y-4">
                    {!user?.must_change_password && <label className="block text-sm font-medium text-gray-700">Current password
                        <input type="password" required autoComplete="current-password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} className="mt-1 block w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none transition" />
                    </label>}
                    <label className="block text-sm font-medium text-gray-700">New password
                        <input type="password" required minLength={10} autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} className="mt-1 block w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none transition" />
                    </label>
                    <label className="block text-sm font-medium text-gray-700">Confirm password
                        <input type="password" required minLength={10} autoComplete="new-password" value={confirmation} onChange={event => setConfirmation(event.target.value)} className="mt-1 block w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none transition" />
                    </label>
                    <button disabled={busy} className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50 transition">{busy ? 'Saving…' : 'Save password'}</button>
                </form>
            </section>
        </main>
    );
};

export default ChangePassword;
