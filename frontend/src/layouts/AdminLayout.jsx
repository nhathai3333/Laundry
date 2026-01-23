import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { clearAuth, getAuth, isRoot } from '../utils/auth';

function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = getAuth();

  const handleLogout = () => {
    clearAuth();
    navigate('/login');
  };

  // Root admin chỉ thấy Dashboard và Admin Management
  // Admin thường thấy tất cả các menu
  const navItems = isRoot() 
    ? [
        { path: '/admin', label: 'Dashboard', icon: '📊' },
        { path: '/admin/admin-management', label: 'Quản lý Admin', icon: '👑' },
      ]
    : [
        { path: '/admin', label: 'Dashboard', icon: '📊' },
        { path: '/admin/stores', label: 'Cửa hàng & Nhân sự', icon: '🏪' },
        { path: '/admin/products', label: 'Sản phẩm', icon: '📦' },
        { path: '/admin/promotions', label: 'Khuyến mãi', icon: '🎁' },
        { path: '/admin/customers', label: 'Khách hàng', icon: '👤' },
        { path: '/admin/timesheets', label: 'Chấm công', icon: '⏰' },
        { path: '/admin/reports', label: 'Báo cáo', icon: '📈' },
        { path: '/admin/settings', label: 'Cài đặt', icon: '⚙️' },
      ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Mobile Header with Navigation */}
      <div className="lg:hidden bg-gradient-to-r from-blue-600 to-blue-700 shadow-lg sticky top-0 z-50">
        <div className="flex items-center justify-between p-3 px-4">
          <h1 className="text-lg font-bold text-white">Quản lý cửa hàng</h1>
          <div className="flex items-center gap-3">
            <span className="text-xs text-blue-100 truncate max-w-[80px] font-medium">{user?.name}</span>
            <button
              onClick={handleLogout}
              className="text-xs text-white hover:text-red-200 whitespace-nowrap px-3 py-1.5 bg-white/20 rounded-lg hover:bg-white/30 transition-all font-medium"
            >
              Đăng xuất
            </button>
          </div>
        </div>
        {/* Mobile Top Nav */}
        <nav className="bg-white/10 backdrop-blur-sm border-t border-white/20">
          <div className="flex overflow-x-auto scrollbar-hide px-2 py-2" style={{scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch'}}>
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`flex flex-col items-center py-2 px-3 min-w-[70px] flex-shrink-0 rounded-lg transition-all ${
                  location.pathname === item.path
                    ? 'bg-white text-blue-600 shadow-md scale-105'
                    : 'text-white/90 hover:bg-white/20 hover:text-white'
                }`}
              >
                <span className="text-lg mb-1">{item.icon}</span>
                <span className="text-[9px] text-center leading-tight whitespace-nowrap font-medium">{item.label}</span>
              </Link>
            ))}
          </div>
        </nav>
      </div>

      <div className="flex">
        {/* Sidebar - Desktop */}
        <aside className="hidden lg:block w-72 bg-gradient-to-b from-white to-gray-50 shadow-xl min-h-screen relative border-r border-gray-200">
          <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-blue-600 to-blue-700">
            <h1 className="text-2xl font-bold text-white mb-1">Quản lý cửa hàng</h1>
            <p className="text-sm text-blue-100">Hệ thống quản lý</p>
          </div>
          <nav className="p-4 space-y-1">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl mb-1 transition-all duration-200 group ${
                  location.pathname === item.path
                    ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg transform scale-[1.02]'
                    : 'text-gray-700 hover:bg-gray-100 hover:shadow-md hover:transform hover:scale-[1.01]'
                }`}
              >
                <span className={`text-xl transition-transform ${location.pathname === item.path ? 'scale-110' : 'group-hover:scale-110'}`}>{item.icon}</span>
                <span className="flex-1 font-medium">{item.label}</span>
                {location.pathname === item.path && (
                  <span className="w-2 h-2 bg-white rounded-full"></span>
                )}
              </Link>
            ))}
          </nav>
          <div className="absolute bottom-0 w-72 p-4 border-t border-gray-200 bg-white z-10">
            <div className="px-4 py-3 bg-gradient-to-r from-gray-50 to-gray-100 rounded-lg mb-2">
              <p className="text-xs text-gray-500 mb-1">Đăng nhập bởi</p>
              <p className="font-semibold truncate text-gray-800">{user?.name}</p>
            </div>
            <button
              onClick={handleLogout}
              className="w-full px-4 py-2.5 text-sm text-white bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 rounded-lg transition-all shadow-md hover:shadow-lg font-medium"
            >
              Đăng xuất
            </button>
          </div>
        </aside>


        {/* Main Content */}
        <main className="flex-1 lg:ml-0 lg:pb-0">
          <div className="p-4 lg:p-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

export default AdminLayout;

