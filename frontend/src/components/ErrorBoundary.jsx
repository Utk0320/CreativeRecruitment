import React from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        this.setState({ errorInfo });
        console.error('Unhandled Application Exception caught by ErrorBoundary:', error, errorInfo);
    }

    handleReload = () => {
        window.location.reload();
    };

    handleGoHome = () => {
        window.location.href = '/';
    };

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                    <div className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-xl border border-gray-200 text-center">
                        <div className="w-16 h-16 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-4">
                            <AlertTriangle size={32} />
                        </div>
                        <h1 className="text-xl font-bold text-gray-900 mb-2">Something went wrong</h1>
                        <p className="text-sm text-gray-600 mb-6">
                            An unexpected error occurred while rendering this page. Our platform keeps your data safe.
                        </p>

                        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-6">
                            <button
                                type="button"
                                onClick={this.handleReload}
                                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition shadow-xs"
                            >
                                <RefreshCw size={14} /> Reload Page
                            </button>
                            <button
                                type="button"
                                onClick={this.handleGoHome}
                                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl border border-gray-300 bg-white text-gray-700 text-xs font-semibold hover:bg-gray-50 transition shadow-xs"
                            >
                                <Home size={14} /> Back to Dashboard
                            </button>
                        </div>

                        {this.state.error && (
                            <details className="text-left text-xs bg-gray-50 rounded-xl p-3 border border-gray-200 text-gray-700 overflow-x-auto">
                                <summary className="font-semibold text-gray-500 cursor-pointer">Technical Details</summary>
                                <p className="mt-2 font-mono text-[11px] text-red-600">{this.state.error.toString()}</p>
                            </details>
                        )}
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;

