import { Outlet, Navigate, useLocation } from 'react-router-dom';
import AdminBottomNav from './AdminBottomNav';
import AdminSidebar from './AdminSidebar';
import { useAuth } from '../hooks/useAuth';

export default function AdminLayout() {
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

  // Role protection - Allow management to access admin area
  const isManagement = user?.role === 'admin' || user?.role === 'manager' || user?.role === 'supervisor' || user?.email === 'antrippy1@gmail.com' || user?.email === 'ath222139@gmail.com';
  
  if (!isManagement) {
    return <Navigate to="/employee/home" replace />;
  }

  const isChatRoom = location.pathname.includes('/chat/') && location.pathname.split('/').length > 3;

  return (
    <div className="min-h-screen bg-white flex flex-row overflow-x-hidden antialiased">
      {/* Desktop Sidebar */}
      {!isChatRoom && <AdminSidebar />}

      {/* Main Content Area */}
      <div className={`flex-1 flex flex-col relative min-h-screen ${!isChatRoom ? 'pb-20 md:pb-0 md:pr-72' : ''} overflow-y-auto`}>
        <div className={`w-full max-w-[1400px] mx-auto flex-1 ${!isChatRoom ? 'p-4 md:p-10 pb-10' : ''}`}>
          <Outlet />
        </div>
        
        {/* Mobile Navigation */}
        {!isChatRoom && <AdminBottomNav />}
      </div>
    </div>
  );
}
