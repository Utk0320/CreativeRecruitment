import React, { useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import api from '../api';

const AccountAction = () => {
    const { pathname } = useLocation();
    const [searchParams] = useSearchParams();
    const [password, setPassword] = useState('');
    const [confirmation, setConfirmation] = useState('');
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);
    const isInvite = pathname === '/accept-invite';
    const token = searchParams.get('token') || '';
    const title = isInvite ? 'Accept coordinator invite' : 'Reset password';
    const endpoint = isInvite ? '/auth/accept-invite' : '/auth/reset-password';

    const submit = async (event) => {
        event.preventDefault();
        setError('');
        setMessage('');
        if (!token) return setError('This link is missing its one-time token.');
        if (password.length < 10) return setError('Password must contain at least 10 characters.');
        if (password !== confirmation) return setError('Passwords do not match.');
        setBusy(true);
        try {
            const response = await api.post(endpoint, { token, password });
            setMessage(response.data.message);
        } catch (requestError) {
            setError(requestError.response?.data?.error || 'This link could not be used.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
            <section className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-7 shadow-sm">
                <KeyRound className="mb-5 text-indigo-700" aria-hidden="true" />
                <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
                {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
                {message ? <div className="mt-4"><p role="status" className="text-sm text-green-800">{message}</p><Link to="/login" className="mt-5 inline-block font-semibold text-indigo-700">Continue to sign in</Link></div> : (
                    <form onSubmit={submit} className="mt-5 space-y-4">
                        <label className="block text-sm font-medium text-gray-700">New password
                            <input type="password" required minLength={10} autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} className="mt-1 block w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none transition" />
                        </label>
                        <label className="block text-sm font-medium text-gray-700">Confirm password
                            <input type="password" required minLength={10} autoComplete="new-password" value={confirmation} onChange={event => setConfirmation(event.target.value)} className="mt-1 block w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none transition" />
                        </label>
                        <button disabled={busy} className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50 transition">{busy ? 'Submitting…' : isInvite ? 'Create coordinator account' : 'Reset password'}</button>
                    </form>
                )}
            </section>
        </main>
    );
};

export default AccountAction;
