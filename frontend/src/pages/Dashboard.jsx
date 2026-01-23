import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/api';
import { isAdmin, isRoot } from '../utils/auth';
import { format } from 'date-fns';
import { getSavedFilters, saveFilters } from '../utils/filterStorage';

function Dashboard() {
  const [stats, setStats] = useState({
    todayRevenue: 0,
    todayOrders: 0,
    totalCustomers: 0,
    activeOrders: 0,
    revenueByShift: 0,
    revenueByProduct: 0,
    averageOrderValue: 0,
  });
  const [revenueByStore, setRevenueByStore] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stores, setStores] = useState([]);
  const savedFilters = getSavedFilters();
  const [selectedStoreId, setSelectedStoreId] = useState(savedFilters.selectedStoreId);

  // Root admin statistics
  const [rootStats, setRootStats] = useState({
    overview: {},
    subscriptionPackages: [],
  });
  const [rootStatsLoading, setRootStatsLoading] = useState(true);

  const loadRootStatistics = async () => {
    try {
      setRootStatsLoading(true);
      const response = await api.get('/reports/root/statistics');
      setRootStats(response.data.data || {
        overview: {},
        subscriptionPackages: [],
      });
    } catch (error) {
      console.error('Error loading root statistics:', error);
    } finally {
      setRootStatsLoading(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isRoot()) {
      loadRootStatistics();
    } else {
      if (isAdmin()) {
        loadStores();
      }
      loadData();
    }
  }, [selectedStoreId]);

  // Save store filter whenever it changes
  useEffect(() => {
    if (isAdmin()) {
      saveFilters(selectedStoreId, savedFilters.selectedMonth, savedFilters.selectedYear);
    }
  }, [selectedStoreId]);

  const loadStores = async () => {
    try {
      const response = await api.get('/stores');
      setStores(response.data.data || []);
    } catch (error) {
      console.error('Error loading stores:', error);
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const today = format(new Date(), 'yyyy-MM-dd');

      // Get today's revenue
      let todayRevenue = 0;
      try {
        const params = new URLSearchParams();
        params.append('period', 'day');
        params.append('start_date', today);
        params.append('end_date', today);
        if (isAdmin() && selectedStoreId && selectedStoreId !== 'all') {
          params.append('store_id', selectedStoreId);
        }
        const revenueRes = await api.get(`/reports/revenue?${params.toString()}`);
        const todayRevenueData = revenueRes.data.data?.[0];
        todayRevenue = parseFloat(todayRevenueData?.total_revenue) || 0;
      } catch (error) {
        console.error('Error loading revenue:', error);
      }
      
      // Get orders
      let todayOrders = 0;
      let activeOrders = 0;
      try {
        const params = new URLSearchParams();
        params.append('limit', '100');
        if (isAdmin() && selectedStoreId && selectedStoreId !== 'all') {
          params.append('store_id', selectedStoreId);
        }
        const ordersRes = await api.get(`/orders?${params.toString()}`);
        const orders = ordersRes.data.data || [];
        
        // Calculate stats - count orders completed today (by updated_at)
        todayOrders = orders.filter(
          (o) => o.status === 'completed' && o.updated_at?.startsWith(today)
        ).length;
        activeOrders = orders.filter(
          (o) => !['completed', 'cancelled'].includes(o.status)
        ).length;
      } catch (error) {
        console.error('Error loading orders:', error);
      }
      
      // Get customers count
      let totalCustomers = 0;
      try {
        const params = new URLSearchParams();
        if (isAdmin() && selectedStoreId && selectedStoreId !== 'all') {
          params.append('store_id', selectedStoreId);
        }
        const customersRes = await api.get(`/customers?${params.toString()}`);
        totalCustomers = customersRes.data.data?.length || 0;
      } catch (error) {
        console.error('Error loading customers:', error);
      }

      // Get revenue by store (only when viewing all stores)
      let storeRevenues = [];
      if (isAdmin() && selectedStoreId === 'all') {
        try {
          // Get stores list if not already loaded
          let storesList = stores;
          if (storesList.length === 0) {
            const storesRes = await api.get('/stores');
            storesList = storesRes.data.data || [];
          }
          
          // Get revenue for each store separately
          for (const store of storesList) {
            try {
              const storeParams = new URLSearchParams();
              storeParams.append('period', 'day');
              storeParams.append('start_date', today);
              storeParams.append('end_date', today);
              storeParams.append('store_id', store.id);
              const url = `/reports/revenue?${storeParams.toString()}`;
              // Debug log removed for security
              const storeRevenueRes = await api.get(url);
              const storeRevenueData = storeRevenueRes.data.data?.[0];
              const storeRevenue = parseFloat(storeRevenueData?.total_revenue) || 0;
              const storeOrdersCount = storeRevenueData?.total_orders || 0;
              
              // Debug log removed for security
              
              // Show all stores, even if revenue is 0
              storeRevenues.push({
                store_id: store.id,
                store_name: store.name,
                revenue: storeRevenue,
                orders: storeOrdersCount,
              });
            } catch (error) {
              console.error(`Error loading revenue for store ${store.id} (${store.name}):`, error);
              // Still add store with 0 revenue if error
              storeRevenues.push({
                store_id: store.id,
                store_name: store.name,
                revenue: 0,
                orders: 0,
              });
            }
          }
          // Debug log removed for security
        } catch (error) {
          console.error('Error loading revenue by store:', error);
        }
      }

      setStats({
        todayRevenue,
        todayOrders,
        totalCustomers,
        activeOrders,
      });
      setRevenueByStore(storeRevenues);
    } catch (error) {
      console.error('Error loading dashboard:', error);
    } finally {
      setLoading(false);
    }
  };


  const statusColors = {
    created: 'bg-gray-100 text-gray-800',
    washing: 'bg-blue-100 text-blue-800',
    drying: 'bg-yellow-100 text-yellow-800',
    waiting_pickup: 'bg-orange-100 text-orange-800',
    completed: 'bg-green-100 text-green-800',
    cancelled: 'bg-red-100 text-red-800',
  };

  const statusLabels = {
    created: 'Đã tạo',
    washing: 'Đang giặt',
    drying: 'Đang sấy',
    waiting_pickup: 'Chờ lấy đồ',
    completed: 'Hoàn thành',
    cancelled: 'Hủy',
  };

  // Root admin dashboard
  if (isRoot()) {
    if (rootStatsLoading) {
      return (
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
            <div className="text-gray-600">Đang tải...</div>
          </div>
        </div>
      );
    }
    const { overview, subscriptionPackages } = rootStats;
    
    const packageLabels = {
      '3months': '3 tháng',
      '6months': '6 tháng',
      '1year': '1 năm',
      'Không có': 'Không có gói'
    };
    
    return (
      <div className="space-y-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Dashboard - Root Admin</h1>
          <p className="text-gray-600">Tổng quan hệ thống</p>
        </div>

        {/* Main Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Pending Admins */}
          <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl shadow-lg p-6 border border-orange-200 hover:shadow-xl transition-all duration-300">
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm font-medium text-orange-700 uppercase tracking-wide">Tài khoản chờ duyệt</div>
              <div className="text-2xl">⏳</div>
            </div>
            <div className="text-5xl font-bold text-orange-600 mb-2">{overview.pendingAdmins || 0}</div>
            <div className="text-xs text-orange-600 font-medium">Admin đang chờ phê duyệt</div>
          </div>

          {/* Active Admins */}
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl shadow-lg p-6 border border-blue-200 hover:shadow-xl transition-all duration-300">
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm font-medium text-blue-700 uppercase tracking-wide">Admin đang hoạt động</div>
              <div className="text-2xl">👥</div>
            </div>
            <div className="text-5xl font-bold text-blue-600 mb-2">{overview.totalAdmins || 0}</div>
            <div className="text-xs text-blue-600 font-medium">Tổng số admin active</div>
          </div>

          {/* Subscription Packages */}
          <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl shadow-lg p-6 border border-green-200 hover:shadow-xl transition-all duration-300">
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm font-medium text-green-700 uppercase tracking-wide">Tổng số gói đăng ký</div>
              <div className="text-2xl">📦</div>
            </div>
            <div className="text-5xl font-bold text-green-600 mb-2">
              {subscriptionPackages?.reduce((sum, pkg) => sum + (pkg.count || 0), 0) || 0}
            </div>
            <div className="text-xs text-green-600 font-medium">Tổng số admin có gói</div>
          </div>
        </div>

        {/* Subscription Packages Breakdown */}
        {subscriptionPackages && subscriptionPackages.length > 0 && (
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
            <div className="bg-gradient-to-r from-indigo-500 to-purple-600 p-6">
              <h2 className="text-xl font-bold text-white">Các gói đăng ký đang sử dụng</h2>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {subscriptionPackages.map((pkg) => (
                  <div key={pkg.package} className="bg-gradient-to-br from-indigo-50 to-purple-50 border-2 border-indigo-200 rounded-xl p-5 hover:shadow-md transition-all duration-300">
                    <div className="text-sm font-medium text-indigo-700 mb-2">Gói {packageLabels[pkg.package] || pkg.package}</div>
                    <div className="text-3xl font-bold text-indigo-600 mb-1">{pkg.count || 0}</div>
                    <div className="text-xs text-indigo-500 font-medium">admin</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Link
            to="/admin/admin-management"
            className="bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl p-6 text-center hover:from-blue-700 hover:to-blue-800 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:-translate-y-1"
          >
            <div className="text-4xl mb-3">👑</div>
            <div className="font-semibold text-lg">Quản lý Admin</div>
          </Link>
        </div>
      </div>
    );
  }

  // Regular admin/employer dashboard
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
          <div className="text-gray-600">Đang tải dữ liệu...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Dashboard</h1>
          <p className="text-gray-600">Tổng quan hệ thống</p>
        </div>
        {isAdmin() && stores.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Lọc theo cửa hàng</label>
            <select
              value={selectedStoreId}
              onChange={(e) => setSelectedStoreId(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg text-base bg-white shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">Tất cả cửa hàng</option>
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Revenue Section - Separated */}
      <div className="bg-gradient-to-br from-green-50 to-emerald-100 rounded-xl shadow-lg p-6 border border-green-200">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-green-800 mb-1">Doanh thu hôm nay</h2>
            <p className="text-sm text-green-600">Tổng hợp doanh thu trong ngày</p>
          </div>
          <div className="text-4xl">💰</div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div className="bg-white rounded-lg p-4 border border-green-200">
            <div className="text-xs font-medium text-green-700 uppercase tracking-wide mb-2">Tổng doanh thu</div>
            <div className="text-2xl font-bold text-green-600">
              {new Intl.NumberFormat('vi-VN').format(parseFloat(stats.todayRevenue) || 0)} đ
            </div>
          </div>
          <div className="bg-white rounded-lg p-4 border border-green-200">
            <div className="text-xs font-medium text-green-700 uppercase tracking-wide mb-2">Số đơn hoàn thành</div>
            <div className="text-2xl font-bold text-green-600">{stats.todayOrders}</div>
          </div>
          <div className="bg-white rounded-lg p-4 border border-green-200">
            <div className="text-xs font-medium text-green-700 uppercase tracking-wide mb-2">Giá trị đơn trung bình</div>
            <div className="text-2xl font-bold text-green-600">
              {stats.todayOrders > 0 
                ? new Intl.NumberFormat('vi-VN').format(Math.round((parseFloat(stats.todayRevenue) || 0) / stats.todayOrders)) + ' đ'
                : '0 đ'
              }
            </div>
          </div>
        </div>
        
        {/* Revenue by Store - Only show when viewing all stores */}
        {isAdmin() && selectedStoreId === 'all' && revenueByStore.length > 0 && (
          <div className="mt-4 pt-4 border-t border-green-300">
            <h3 className="text-sm font-bold text-green-800 mb-3">Doanh thu theo từng cửa hàng</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {revenueByStore.map((store) => (
                <div key={store.store_id} className="bg-white rounded-lg p-3 border border-green-200">
                  <div className="text-xs font-medium text-green-700 mb-1">{store.store_name}</div>
                  <div className="text-lg font-bold text-green-600">
                    {new Intl.NumberFormat('vi-VN').format(parseFloat(store.revenue) || 0)} đ
                  </div>
                  <div className="text-xs text-green-600 mt-1">{store.orders} đơn</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-blue-50 to-cyan-100 rounded-xl shadow-lg p-5 border border-blue-200 hover:shadow-xl transition-all duration-300">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs font-medium text-blue-700 uppercase tracking-wide">Đơn hôm nay</div>
            <div className="text-xl">📋</div>
          </div>
          <div className="text-2xl font-bold text-blue-600">{stats.todayOrders}</div>
        </div>
        <div className="bg-gradient-to-br from-purple-50 to-pink-100 rounded-xl shadow-lg p-5 border border-purple-200 hover:shadow-xl transition-all duration-300">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs font-medium text-purple-700 uppercase tracking-wide">Tổng khách hàng</div>
            <div className="text-xl">👤</div>
          </div>
          <div className="text-2xl font-bold text-purple-600">{stats.totalCustomers}</div>
        </div>
        <div className="bg-gradient-to-br from-orange-50 to-amber-100 rounded-xl shadow-lg p-5 border border-orange-200 hover:shadow-xl transition-all duration-300">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs font-medium text-orange-700 uppercase tracking-wide">Đơn đang xử lý</div>
            <div className="text-xl">⚡</div>
          </div>
          <div className="text-2xl font-bold text-orange-600">{stats.activeOrders}</div>
        </div>
      </div>

      {/* Quick Actions */}
      {isAdmin() && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Link
            to="/admin/orders"
            className="bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl p-6 text-center hover:from-blue-700 hover:to-blue-800 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:-translate-y-1"
          >
            <div className="text-4xl mb-3">📋</div>
            <div className="font-semibold text-lg">Quản lý đơn</div>
          </Link>
          <Link
            to="/admin/products"
            className="bg-gradient-to-r from-green-600 to-green-700 text-white rounded-xl p-6 text-center hover:from-green-700 hover:to-green-800 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:-translate-y-1"
          >
            <div className="text-4xl mb-3">📦</div>
            <div className="font-semibold text-lg">Sản phẩm</div>
          </Link>
          <Link
            to="/admin/users"
            className="bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-xl p-6 text-center hover:from-purple-700 hover:to-purple-800 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:-translate-y-1"
          >
            <div className="text-4xl mb-3">👥</div>
            <div className="font-semibold text-lg">Nhân viên</div>
          </Link>
          <Link
            to="/admin/reports"
            className="bg-gradient-to-r from-orange-600 to-orange-700 text-white rounded-xl p-6 text-center hover:from-orange-700 hover:to-orange-800 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:-translate-y-1"
          >
            <div className="text-4xl mb-3">📈</div>
            <div className="font-semibold text-lg">Báo cáo</div>
          </Link>
        </div>
      )}
    </div>
  );
}

export default Dashboard;

