import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SeasonProvider } from './components/SeasonSwitcher';
import Navbar from './components/Navbar';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import VerifyEmail from './pages/VerifyEmail';
import StudentDashboard from './pages/StudentDashboard';
import StudentClubs from './pages/StudentClubs';
import StudentClubDetails from './pages/StudentClubDetails';
import StudentApply from './pages/StudentApply';
import StudentApplyHub from './pages/StudentApplyHub';
import StudentApplications from './pages/StudentApplications';
import StudentProfile from './pages/StudentProfile';
import CoordinatorDashboard from './pages/CoordinatorDashboard';
import CoordinatorDrives from './pages/CoordinatorDrives';
import CoordinatorClubs from './pages/CoordinatorClubs';
import CoordinatorProfile from './pages/CoordinatorProfile';
import ClubMembers from './pages/ClubMembers';
import AdminUsers from './pages/AdminUsers';
import AdminAudit from './pages/AdminAudit';
import AccountAction from './pages/AccountAction';
import ForgotPassword from './pages/ForgotPassword';
import ChangePassword from './pages/ChangePassword';
import HelpSupport from './pages/HelpSupport';
import VerifyCertificate from './pages/VerifyCertificate';
import Footer from './components/Footer';
import NotFound from './pages/NotFound';

const ProtectedRoute = ({ children, role }) => {
    const { user } = useAuth();
    const { pathname } = useLocation();
    if (!user) return <Navigate to="/login" />;
    if (user.must_change_password && pathname !== '/change-password') return <Navigate to="/change-password" replace />;
    if (role && user.role !== role) return <Navigate to="/" />;
    return children;
};

const ScrollToTop = () => {
    const { pathname } = useLocation();
    useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
    return null;
};

const PageTransition = ({ children }) => (
    <div className="page-transition">{children}</div>
);

const AppContent = () => {
    const { pathname } = useLocation();
    const isAuthPage = ['/login', '/register', '/verify-email', '/forgot-password', '/accept-invite', '/reset-password', '/change-password'].includes(pathname) || pathname.startsWith('/verify/');
    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            <ScrollToTop />
            {!isAuthPage && <Navbar />}
            <main className="flex-1">
                <PageTransition key={pathname}>
                    <Routes>
                    <Route path="/" element={<Landing />} />
                    <Route path="/login" element={<Login />} />
                    <Route path="/register" element={<Register />} />
                    <Route path="/verify-email" element={<VerifyEmail />} />
                    <Route path="/forgot-password" element={<ForgotPassword />} />
                    <Route path="/accept-invite" element={<AccountAction />} />
                    <Route path="/reset-password" element={<AccountAction />} />
                    <Route path="/change-password" element={<ProtectedRoute><ChangePassword /></ProtectedRoute>} />
                    <Route path="/verify/:hash" element={<VerifyCertificate />} />
                    
                    <Route path="/explore-clubs" element={<StudentClubs />} />
                    
                    <Route path="/student/dashboard" element={
                        <ProtectedRoute role="student">
                            <StudentDashboard />
                        </ProtectedRoute>
                    } />
                    <Route path="/student/clubs/:id" element={
                        <ProtectedRoute role="student">
                            <StudentClubDetails />
                        </ProtectedRoute>
                    } />
                    <Route path="/student/applications" element={
                        <ProtectedRoute role="student">
                            <StudentApplications />
                        </ProtectedRoute>
                    } />
                    <Route path="/student/apply" element={
                        <ProtectedRoute role="student">
                            <StudentApplyHub />
                        </ProtectedRoute>
                    } />
                    <Route path="/student/apply/:driveId" element={
                        <ProtectedRoute role="student">
                            <StudentApply />
                        </ProtectedRoute>
                    } />
                    
                    <Route path="/coordinator/dashboard" element={
                        <ProtectedRoute role="coordinator">
                            <CoordinatorDashboard />
                        </ProtectedRoute>
                    } />
                    <Route path="/coordinator/drives" element={
                        <ProtectedRoute role="coordinator">
                            <CoordinatorDrives />
                        </ProtectedRoute>
                    } />
                    <Route path="/coordinator/clubs" element={
                        <ProtectedRoute role="coordinator">
                            <CoordinatorClubs />
                        </ProtectedRoute>
                    } />
                    <Route path="/coordinator/clubs/:clubId/members" element={
                        <ProtectedRoute role="coordinator">
                            <ClubMembers />
                        </ProtectedRoute>
                    } />
                    <Route path="/coordinator/profile" element={
                        <ProtectedRoute role="coordinator">
                            <CoordinatorProfile />
                        </ProtectedRoute>
                    } />
                    <Route path="/admin/users" element={
                        <ProtectedRoute role="admin">
                            <AdminUsers />
                        </ProtectedRoute>
                    } />
                    <Route path="/admin/audit" element={
                        <ProtectedRoute role="admin">
                            <AdminAudit />
                        </ProtectedRoute>
                    } />
                    <Route path="/admin/clubs/:clubId/members" element={
                        <ProtectedRoute role="admin">
                            <ClubMembers />
                        </ProtectedRoute>
                    } />
                    <Route path="/student/profile" element={
                        <ProtectedRoute role="student">
                            <StudentProfile />
                        </ProtectedRoute>
                    } />
                    <Route path="/help" element={
                        <ProtectedRoute>
                            <HelpSupport />
                        </ProtectedRoute>
                    } />
                    <Route path="*" element={<NotFound />} />
                    </Routes>
                </PageTransition>
            </main>
            {!isAuthPage && <Footer />}
        </div>
    );
};

const App = () => {
    return (
        <ErrorBoundary>
            <AuthProvider>
                <SeasonProvider>
                    <Router>
                        <AppContent />
                    </Router>
                </SeasonProvider>
            </AuthProvider>
        </ErrorBoundary>
    );
};

export default App;
