import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, LoaderCircle, MailCheck } from 'lucide-react';
import api from '../api';

const VerifyEmail = () => {
    const [searchParams] = useSearchParams();
    const [state, setState] = useState('ready');
    const [message, setMessage] = useState('');
    const token = searchParams.get('token');

    const verify = async () => {
        if (!token) {
            setState('error');
            setMessage('This verification link is missing its token.');
            return;
        }
        setState('loading');
        try {
            const response = await api.post('/auth/verify-email', { token });
            setState('success');
            setMessage(response.data.message);
        } catch (error) {
            setState('error');
            setMessage(error.response?.data?.error || 'Unable to verify this email link.');
        }
    };

    return (
        <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
            <section className="w-full max-w-md bg-white border border-gray-200 rounded-xl p-7 shadow-sm">
                <div className="mb-5 text-indigo-700">
                    {state === 'success' ? <CheckCircle2 aria-hidden="true" /> : <MailCheck aria-hidden="true" />}
                </div>
                <h1 className="text-2xl font-bold text-gray-900">Verify your college email</h1>
                {message && <p className={`mt-3 text-sm ${state === 'error' ? 'text-red-700' : 'text-gray-700'}`} role="status">{message}</p>}
                {state === 'ready' && (
                    <button onClick={verify} className="mt-6 inline-flex items-center gap-2 rounded-md bg-indigo-700 px-4 py-2.5 font-semibold text-white hover:bg-indigo-800">
                        Verify email
                    </button>
                )}
                {state === 'loading' && <LoaderCircle className="mt-6 animate-spin" aria-label="Verifying email" />}
                {state === 'success' && <Link className="mt-6 inline-block font-semibold text-indigo-700" to="/login">Continue to sign in</Link>}
            </section>
        </main>
    );
};

export default VerifyEmail;