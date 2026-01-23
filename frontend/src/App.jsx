import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { isAuthenticated, isAdmin, isRoot } from './utils/auth';
import Login from './pages/Login';
import AdminLayout from './layouts/AdminLayout';
import EmployerLayout from './layouts/EmployerLayout';
import Dashboard from './pages/Dashboard';
import Home from './pages/Home';
import Users from './pages/admin/Users';
import Products from './pages/admin/Products';
import Orders from './pages/Orders';
import PendingOrders from './pages/PendingOrders';
import Customers from './pages/Customers';
import Timesheets from './pages/Timesheets';
import Reports from './pages/admin/Reports';
import Settings from './pages/admin/Settings';
import Employees from './pages/admin/Employees';
import Stores from './pages/admin/Stores';
import AdminManagement from './pages/admin/AdminManagement';
import Promotions from './pages/admin/Promotions';

const PrivateRoute = ({ children, adminOnly = false }) => {
  if (!isAuthenticated()) {
    return <Navigate to="/login" />;
  }
  if (adminOnly && !isAdmin()) {
    return <Navigate to="/" />;
  }
  return children;
};

// Route protection cho root admin - chỉ cho phép truy cập Dashboard và Admin Management
const RootAdminRoute = ({ children }) => {
  const location = useLocation();
  
  if (!isAuthenticated()) {
    return <Navigate to="/login" />;
  }
  if (!isAdmin()) {
    return <Navigate to="/" />;
  }
  // Nếu là root admin và đang cố truy cập page không được phép, redirect về dashboard
  if (isRoot() && location.pathname !== '/admin' && location.pathname !== '/admin/admin-management') {
    return <Navigate to="/admin" />;
  }
  return children;
};

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        
        <Route
          path="/admin/*"
          element={
            <PrivateRoute adminOnly={true}>
              <AdminLayout />
            </PrivateRoute>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="admin-management" element={<RootAdminRoute><AdminManagement /></RootAdminRoute>} />
          {/* Các route chỉ dành cho admin thường, root admin sẽ bị redirect */}
          <Route path="users" element={<RootAdminRoute><Users /></RootAdminRoute>} />
          <Route path="products" element={<RootAdminRoute><Products /></RootAdminRoute>} />
          <Route path="customers" element={<RootAdminRoute><Customers /></RootAdminRoute>} />
          <Route path="timesheets" element={<RootAdminRoute><Timesheets /></RootAdminRoute>} />
          <Route path="reports" element={<RootAdminRoute><Reports /></RootAdminRoute>} />
          <Route path="settings" element={<RootAdminRoute><Settings /></RootAdminRoute>} />
          <Route path="stores" element={<RootAdminRoute><Stores /></RootAdminRoute>} />
          <Route path="promotions" element={<RootAdminRoute><Promotions /></RootAdminRoute>} />
        </Route>

        <Route
          path="/*"
          element={
            <PrivateRoute>
              <EmployerLayout />
            </PrivateRoute>
          }
        >
          <Route index element={<Home />} />
          <Route path="pending-orders" element={<PendingOrders />} />
          <Route path="customers" element={<Customers />} />
          <Route path="timesheets" element={<Timesheets />} />
          <Route path="employees" element={<Employees />} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;

