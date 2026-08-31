import { Outlet, Navigate, useLocation } from 'react-router-dom';
import BottomNav from './BottomNav';
import Sidebar from './Sidebar';
import { useAuth } from '../hooks/useAuth';

export default function EmployeeLayout() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-white">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#E31E24]"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Role protection - Prevent managers from entering employee area
  const isManagement = user?.role === 'admin' || user?.role === 'manager';

  if (isManagement && location.pathname.startsWith('/employee')) {
    // If management tries to access employee home, redirect to admin home
    if (location.pathname === '/employee/home' || location.pathname === '/employee') {
      return <Navigate to="/admin/home" replace />;
    }
  }

  // Force join-group if not in a group
  if (user.groupStatus !== 'joined' && location.pathname !== '/employee/join-group') {
    return <Navigate to="/employee/join-group" replace />;
  }

  // Hide bottom nav and sidebar in certain screens
  const isJoiningGroup = location.pathname === '/employee/join-group';
  const isChatRoom = location.pathname.includes('/chat/') && location.pathname.split('/').length > 3;
  const hideNav = isJoiningGroup || isChatRoom;

  return (
    <div className="min-h-screen bg-white flex flex-row overflow-x-hidden antialiased">
      {/* Desktop Sidebar */}
      {!hideNav && <Sidebar />}

      {/* Main Content Area */}
      <div className={`flex-1 flex flex-col relative min-h-screen ${!hideNav ? 'pb-20 md:pb-0 md:pr-72' : ''}`}>
        <div className={`w-full max-w-6xl mx-auto flex-1 ${!hideNav ? 'px-4 md:px-8 pb-10' : ''}`}>
          <Outlet />
        </div>
        
        {/* Mobile Navigation */}
        {!hideNav && (
          <div className="md:hidden">
            <BottomNav />
          </div>
        )}
      </div>
    </div>
  );
}
