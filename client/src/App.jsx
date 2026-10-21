import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/Auth';
import { AdminLayout, ExecutiveLayout } from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Clients from './pages/Clients';
import CallDesk from './pages/CallDesk';
import History from './pages/History';
import Analytics from './pages/Analytics';
import Executives from './pages/Executives';
import ActivityLog from './pages/ActivityLog';
import PhoneMode from './pages/PhoneMode';
import Inbox from './pages/Inbox';
import InboxAdmin from './pages/InboxAdmin';
import Attendance from './pages/Attendance';
import WhatsAppAdmin from './pages/WhatsAppAdmin';

// Only the right role may enter a panel. Anyone else is sent to the matching login page.
function Guard({ role, children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to={role === 'admin' ? '/admin/login' : '/login'} replace />;
  if (user.role !== role) return <Navigate to={user.role === 'admin' ? '/admin' : '/executive/inbox'} replace />;
  return children;
}

const Home = () => {
  const { user } = useAuth();
  return <Navigate to={!user ? '/login' : user.role === 'admin' ? '/admin' : '/executive/inbox'} replace />;
};

export default function App() {
  const { user } = useAuth();
  const home = user?.role === 'admin' ? '/admin' : '/executive/inbox';   // executives land on the Inbox, admin on the Dashboard
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={user ? <Navigate to={home} replace /> : <Login panel="executive" />} />
      <Route path="/admin/login" element={user ? <Navigate to={home} replace /> : <Login panel="admin" />} />

      <Route path="/admin" element={<Guard role="admin"><AdminLayout /></Guard>}>
        <Route index element={<Dashboard />} />
        <Route path="clients" element={<Clients />} />
        <Route path="inbox" element={<InboxAdmin />} />
        <Route path="attendance" element={<Attendance />} />
        <Route path="executives" element={<Executives />} />
        <Route path="whatsapp" element={<WhatsAppAdmin />} />
        <Route path="activity" element={<ActivityLog />} />
        <Route path="calls" element={<History />} />
        <Route path="analytics" element={<Analytics />} />
      </Route>

      <Route path="/executive" element={<Guard role="executive"><ExecutiveLayout /></Guard>}>
        <Route index element={<Navigate to="inbox" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="inbox" element={<Inbox />} />
        <Route path="call-desk" element={<CallDesk />} />
        <Route path="attendance" element={<Attendance />} />
        <Route path="phone" element={<PhoneMode />} />
        <Route path="clients" element={<Clients />} />
        <Route path="calls" element={<History />} />
        <Route path="activity" element={<ActivityLog />} />
      </Route>

      <Route path="*" element={<Home />} />
    </Routes>
  );
}
