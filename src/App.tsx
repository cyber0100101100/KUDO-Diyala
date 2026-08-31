import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import SplashScreen from './screens/SplashScreen';
import AccountTypeSelection from './screens/AccountTypeSelection';
import LoginScreen from './screens/LoginScreen';
import SignUpScreen from './screens/SignUpScreen';
import ForgotPasswordScreen from './screens/ForgotPasswordScreen';
import AccountVerificationScreen from './screens/AccountVerificationScreen';
import EmployeeHomeScreen from './screens/EmployeeHomeScreen';
import AttendanceScreen from './screens/AttendanceScreen';
import FaceEnrollmentScreen from './screens/FaceEnrollmentScreen';
import SalaryScreen from './screens/SalaryScreen';
import NotificationsScreen from './screens/NotificationsScreen';
import RequestsScreen from './screens/RequestsScreen';
import ChatListScreen from './screens/ChatListScreen';
import ChatRoomScreen from './screens/ChatRoomScreen';
import ProfileScreen from './screens/ProfileScreen';
import JoinGroupScreen from './screens/JoinGroupScreen';
import EmployeeLayout from './components/EmployeeLayout';

import AdminLayout from './components/AdminLayout';
import AdminHomeScreen from './screens/AdminHomeScreen';
import AdminWorkforceScreen from './screens/AdminWorkforceScreen';
import AdminScheduleScreen from './screens/AdminScheduleScreen';
import AdminSalaryScreen from './screens/AdminSalaryScreen';
import AdminEmployeeProfileScreen from './screens/AdminEmployeeProfileScreen';
import AdminOrdersScreen from './screens/AdminOrdersScreen';
import GlobalServiceRunner from './components/GlobalServiceRunner';

export default function App() {
  return (
    <HashRouter>
      <AuthProvider>
        <GlobalServiceRunner />
        <Routes>
        <Route path="/" element={<SplashScreen />} />
        <Route path="/selection" element={<AccountTypeSelection />} />
        <Route path="/login/:role" element={<LoginScreen />} />
        <Route path="/login" element={<LoginScreen />} />
        <Route path="/forgot-password" element={<ForgotPasswordScreen />} />
        <Route path="/signup/:role" element={<SignUpScreen />} />
        <Route path="/signup" element={<SignUpScreen />} />
        <Route path="/verify-email" element={<AccountVerificationScreen />} />

        {/* Employee Section */}
        <Route path="/employee" element={<EmployeeLayout />}>
          <Route path="home" element={<EmployeeHomeScreen />} />
          <Route path="join-group" element={<JoinGroupScreen />} />
          <Route path="attendance" element={<AttendanceScreen />} />
          <Route path="enrollment" element={<FaceEnrollmentScreen />} />
          <Route path="salary" element={<SalaryScreen />} />
          <Route path="requests" element={<RequestsScreen />} />
          <Route path="chat" element={<ChatListScreen />} />
          <Route path="chat/:chatId" element={<ChatRoomScreen />} />
          <Route path="notifications" element={<NotificationsScreen />} />
          <Route path="profile" element={<ProfileScreen />} />
        </Route>

        {/* Admin Section */}
        <Route path="/admin" element={<AdminLayout />}>
          <Route path="home" element={<AdminHomeScreen />} />
          <Route path="workforce" element={<AdminWorkforceScreen />} />
          <Route path="schedule" element={<AdminScheduleScreen />} />
          <Route path="salary" element={<AdminSalaryScreen />} />
          <Route path="orders" element={<AdminOrdersScreen />} />
          <Route path="workforce/:id" element={<AdminEmployeeProfileScreen />} />
          <Route path="chat" element={<ChatListScreen />} />
          <Route path="chat/:chatId" element={<ChatRoomScreen />} />
          <Route path="notifications" element={<NotificationsScreen />} />
          <Route path="profile" element={<ProfileScreen />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </AuthProvider>
    </HashRouter>
  );
}
