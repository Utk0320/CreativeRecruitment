import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail } from 'lucide-react';
import api from '../api';

const ForgotPassword = () => {
    const [email, setEmail] = useState('');
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    const submit = async (event) => {
        event.preventDefault();
        setMessage('');
        setError('');
        setBusy(true);
        try {
            const response = await api.post('/auth/forgot-password', { email });
            setMessage(response.data.message);
        } catch (requestError) {
            setError(requestError.response?.data?.error || 'Unable to request a reset link.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
            <section className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-7 shadow-sm">
                <Mail className="mb-5 text-indigo-700" aria-hidden="true" />
                <h1 className="text-2xl font-bold text-gray-900">Reset your password</h1>
                <p className="mt-2 text-sm text-gray-600">Enter your account email. If it exists, a one-time link will be sent.</p>
                {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
                {message && <p role="status" className="mt-4 text-sm text-green-800">{message}</p>}
                <form onSubmit={submit} className="mt-5 space-y-4">
                    <label className="block text-sm font-medium text-gray-700">Email
                        <input type="email" required value={email} onChange={event => setEmail(event.target.value)} className="mt-1 block w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none transition" />
                    </label>
                    <button disabled={busy} className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50 transition">{busy ? 'Sending…' : 'Send reset link'}</button>
                </form>
                <Link to="/login" className="mt-5 inline-block text-sm font-semibold text-indigo-600 hover:text-indigo-800">Back to sign in</Link>
            </section>
        </main>
    );
};

export default ForgotPassword;
