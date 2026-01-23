import { useEffect, useState } from 'react';
import api from '../utils/api';
import { format } from 'date-fns';

function PendingOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [orderToComplete, setOrderToComplete] = useState(null);
  const [shouldPrint, setShouldPrint] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('cash');

  useEffect(() => {
    loadPendingOrders();
  }, []);

  const loadPendingOrders = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.append('my_orders', 'true');
      // Không filter theo status, sẽ filter ở client-side

      const response = await api.get(`/orders?${params.toString()}`);
      const allOrders = response.data.data || [];
      
      // Filter chỉ lấy đơn hàng chưa hoàn thành (status !== 'completed')
      const pendingOrders = allOrders.filter(order => order.status !== 'completed');
      
      // Sắp xếp theo ngày tạo mới nhất
      pendingOrders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      
      setOrders(pendingOrders);
    } catch (error) {
      console.error('Error loading pending orders:', error);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteClick = (order) => {
    setOrderToComplete(order);
    setShowCompleteModal(true);
    setShouldPrint(false);
    setPaymentMethod('cash');
  };

  const handleCompleteOrder = async () => {
    if (!orderToComplete) return;

    try {
      setPrinting(shouldPrint);
      
      const updateData = {
        status: 'completed',
        payment_method: paymentMethod,
      };

      await api.patch(`/orders/${orderToComplete.id}`, updateData);

      // Print if requested
      if (shouldPrint) {
        try {
          await api.post(`/print/bill/${orderToComplete.id}`);
        } catch (printError) {
          console.error('Print error:', printError);
          // Don't fail the order completion if print fails
        }
      }

      setShowCompleteModal(false);
      setOrderToComplete(null);
      setShouldPrint(false);
      setPaymentMethod('cash');
      setPrinting(false);
      
      // Reload orders
      loadPendingOrders();
    } catch (error) {
      alert(error.response?.data?.error || 'Cập nhật thất bại');
      setPrinting(false);
    }
  };

  const handleStatusChange = async (orderId, newStatus) => {
    try {
      await api.patch(`/orders/${orderId}`, { status: newStatus });
      loadPendingOrders();
    } catch (error) {
      alert(error.response?.data?.error || 'Cập nhật thất bại');
    }
  };

  const statusColors = {
    created: 'bg-yellow-100 text-yellow-800',
    washing: 'bg-blue-100 text-blue-800',
    drying: 'bg-purple-100 text-purple-800',
    waiting_pickup: 'bg-orange-100 text-orange-800',
    completed: 'bg-green-100 text-green-800',
    cancelled: 'bg-red-100 text-red-800',
  };

  const statusLabels = {
    created: 'Mới tạo',
    washing: 'Đang giặt',
    drying: 'Đang sấy',
    waiting_pickup: 'Chờ lấy',
    completed: 'Hoàn thành',
    cancelled: 'Đã hủy',
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
          <div className="text-gray-600">Đang tải...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2 sm:space-y-3">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-3">
        <div className="flex-1 min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Tồn kho</h1>
          <p className="text-xs sm:text-sm text-gray-600 mt-0.5">Đơn hàng chưa hoàn thành</p>
        </div>
        <div className="text-xs sm:text-sm text-gray-600 whitespace-nowrap bg-blue-50 px-3 py-1.5 rounded-lg">
          <span className="font-semibold text-blue-600">{orders.length}</span> đơn
        </div>
      </div>

      {orders.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-6 text-center">
          <div className="text-5xl mb-3">📦</div>
          <h3 className="text-lg font-semibold text-gray-700 mb-1">Không có đơn hàng</h3>
          <p className="text-sm text-gray-500">Tất cả đơn hàng đã được hoàn thành</p>
        </div>
      ) : (
        <div className="space-y-2">
          {orders.map((order) => (
            <div
              key={order.id}
              className="bg-white rounded-lg shadow-sm border border-gray-200 p-2.5 sm:p-3 hover:shadow-md transition-all"
            >
              {/* Header: Code, Status, Amount */}
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <h3 className="text-sm sm:text-base font-semibold text-gray-900 truncate">
                    #{order.code}
                  </h3>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] sm:text-xs font-medium whitespace-nowrap flex-shrink-0 ${
                      statusColors[order.status] || 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {statusLabels[order.status] || order.status}
                  </span>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-base sm:text-lg font-bold text-blue-600">
                    {parseFloat(order.final_amount || order.total_amount || 0).toLocaleString('vi-VN')} đ
                  </div>
                  {order.discount_amount > 0 && (
                    <div className="text-[10px] text-gray-500 line-through">
                      {parseFloat(order.total_amount || 0).toLocaleString('vi-VN')} đ
                    </div>
                  )}
                </div>
              </div>

              {/* Customer & Date - Compact */}
              <div className="flex items-center gap-3 text-xs text-gray-600 mb-2 flex-wrap">
                <span className="truncate">
                  👤 {order.customer_name || order.customer_phone || 'Khách vãng lai'}
                </span>
                {order.customer_phone && !order.customer_phone.startsWith('temp_') && (
                  <span className="text-gray-500">• {order.customer_phone}</span>
                )}
                <span className="text-gray-500">
                  • {format(new Date(order.created_at), 'dd/MM HH:mm')}
                </span>
              </div>

              {/* Order Items - Compact */}
              {order.items && order.items.length > 0 && (
                <div className="border-t border-gray-100 pt-2 mb-2">
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-600">
                    {order.items.slice(0, 3).map((item, idx) => (
                      <span key={idx}>
                        {item.product_name} x{item.quantity}
                      </span>
                    ))}
                    {order.items.length > 3 && (
                      <span className="text-gray-500">+{order.items.length - 3} sản phẩm</span>
                    )}
                  </div>
                </div>
              )}

              {/* Note - Compact */}
              {order.note && (
                <div className="text-xs text-gray-500 italic mb-2 truncate" title={order.note}>
                  📝 {order.note}
                </div>
              )}

              {/* Actions - Compact */}
              <div className="flex gap-1.5 pt-2 border-t border-gray-100">
                {order.status !== 'completed' && order.status !== 'cancelled' && (
                  <>
                    <button
                      onClick={() => handleCompleteClick(order)}
                      className="flex-1 bg-gradient-to-r from-green-500 to-green-600 text-white px-3 py-1.5 rounded-lg active:bg-green-700 hover:from-green-600 hover:to-green-700 transition-all text-xs sm:text-sm font-medium touch-manipulation shadow-sm"
                    >
                      ✓ Hoàn thành
                    </button>
                    {order.status === 'created' && (
                      <button
                        onClick={() => handleStatusChange(order.id, 'washing')}
                        className="px-2.5 py-1.5 bg-blue-500 text-white rounded-lg active:bg-blue-600 hover:bg-blue-600 transition-colors text-xs touch-manipulation"
                        title="Đang giặt"
                      >
                        🧺
                      </button>
                    )}
                    {order.status === 'washing' && (
                      <button
                        onClick={() => handleStatusChange(order.id, 'drying')}
                        className="px-2.5 py-1.5 bg-purple-500 text-white rounded-lg active:bg-purple-600 hover:bg-purple-600 transition-colors text-xs touch-manipulation"
                        title="Đang sấy"
                      >
                        🔥
                      </button>
                    )}
                    {order.status === 'drying' && (
                      <button
                        onClick={() => handleStatusChange(order.id, 'waiting_pickup')}
                        className="px-2.5 py-1.5 bg-orange-500 text-white rounded-lg active:bg-orange-600 hover:bg-orange-600 transition-colors text-xs touch-manipulation"
                        title="Chờ lấy"
                      >
                        📦
                      </button>
                    )}
                    <button
                      onClick={() => handleStatusChange(order.id, 'cancelled')}
                      className="px-2.5 py-1.5 bg-red-500 text-white rounded-lg active:bg-red-600 hover:bg-red-600 transition-colors text-xs touch-manipulation"
                      title="Hủy đơn"
                    >
                      ✕
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Complete Order Modal */}
      {showCompleteModal && orderToComplete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-3 overflow-y-auto overflow-x-hidden">
          <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-2xl w-full sm:max-w-sm max-h-[90vh] sm:max-h-[85vh] overflow-y-auto overflow-x-hidden p-4 sm:p-5 pb-safe sm:pb-5 my-0 sm:my-auto">
            <div className="flex items-center justify-between mb-3 min-w-0">
              <h2 className="text-base sm:text-lg font-bold text-gray-900 truncate pr-2">Hoàn thành đơn hàng</h2>
              <button
                onClick={() => {
                  setShowCompleteModal(false);
                  setOrderToComplete(null);
                  setShouldPrint(false);
                  setPaymentMethod('cash');
                }}
                className="text-gray-500 hover:text-gray-700 text-xl w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-full hover:bg-gray-100 touch-manipulation"
              >
                ×
              </button>
            </div>
            
            <div className="mb-3 p-2.5 bg-blue-50 rounded-lg overflow-hidden">
              <div className="text-[10px] sm:text-xs text-gray-600 mb-0.5 truncate">Đơn: #{orderToComplete.code}</div>
              <div className="text-sm sm:text-base font-bold text-blue-600 break-words">
                {parseFloat(orderToComplete.final_amount || orderToComplete.total_amount || 0).toLocaleString('vi-VN')} đ
              </div>
            </div>

            <div className="mb-3">
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                Phương thức thanh toán
              </label>
              <div className="grid grid-cols-2 gap-1.5 min-w-0">
                <label className={`flex items-center justify-center p-2 rounded-lg border-2 cursor-pointer touch-manipulation transition-all min-w-0 ${
                  paymentMethod === 'cash' 
                    ? 'border-green-500 bg-green-50' 
                    : 'border-gray-200'
                }`}>
                  <input
                    type="radio"
                    value="cash"
                    checked={paymentMethod === 'cash'}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="sr-only"
                  />
                  <span className="text-xs font-medium text-center break-words">💰 Tiền mặt</span>
                </label>
                <label className={`flex items-center justify-center p-2 rounded-lg border-2 cursor-pointer touch-manipulation transition-all min-w-0 ${
                  paymentMethod === 'transfer' 
                    ? 'border-blue-500 bg-blue-50' 
                    : 'border-gray-200'
                }`}>
                  <input
                    type="radio"
                    value="transfer"
                    checked={paymentMethod === 'transfer'}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="sr-only"
                  />
                  <span className="text-xs font-medium text-center break-words">🏦 Chuyển khoản</span>
                </label>
              </div>
            </div>

            <div className="mb-3">
              <label className="flex items-center p-1.5 rounded-lg active:bg-gray-50 cursor-pointer touch-manipulation min-w-0">
                <input
                  type="checkbox"
                  checked={shouldPrint}
                  onChange={(e) => setShouldPrint(e.target.checked)}
                  className="mr-2 w-4 h-4 flex-shrink-0 touch-manipulation"
                />
                <span className="text-xs break-words">🖨️ In hóa đơn</span>
              </label>
            </div>

            <div className="flex gap-2 min-w-0">
              <button
                onClick={() => {
                  setShowCompleteModal(false);
                  setOrderToComplete(null);
                  setShouldPrint(false);
                  setPaymentMethod('cash');
                }}
                className="flex-1 min-w-0 px-3 py-2.5 bg-gray-200 text-gray-800 rounded-lg active:bg-gray-300 transition-colors touch-manipulation text-xs font-medium"
                disabled={printing}
              >
                Hủy
              </button>
              <button
                onClick={handleCompleteOrder}
                disabled={printing}
                className="flex-1 min-w-0 px-3 py-2.5 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg active:from-green-600 active:to-green-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation font-medium text-xs shadow-md"
              >
                {printing ? '⏳ Đang in...' : '✓ Xác nhận'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PendingOrders;
