import React from 'react';
import { Link } from 'react-router-dom';

const Footer = () => (
    <footer className="bg-white border-t border-gray-200 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-500">
            <p>&copy; {new Date().getFullYear()} CreativeRecruit. Built for MMCOE clubs.</p>
            <div className="flex gap-6">
                <Link to="/explore-clubs" className="hover:text-indigo-600">Explore Clubs</Link>
                <Link to="/login" className="hover:text-indigo-600">Login</Link>
                <Link to="/register" className="hover:text-indigo-600">Register</Link>
            </div>
        </div>
    </footer>
);

export default Footer;
