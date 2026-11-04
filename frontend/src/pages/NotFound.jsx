import React from 'react';
import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';

const NotFound = () => (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-6">
        <div className="h-16 w-16 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center mb-6">
            <Compass size={32} />
        </div>
        <h1 className="text-4xl font-extrabold text-gray-900">Page not found</h1>
        <p className="mt-3 text-gray-600 max-w-md">The page you're looking for doesn't exist or has been moved.</p>
        <Link to="/" className="mt-8 px-6 py-3 rounded-full bg-indigo-600 text-white font-semibold hover:bg-indigo-500 transition-colors">Back to home</Link>
    </div>
);

export default NotFound;
