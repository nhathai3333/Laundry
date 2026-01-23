import { useEffect, useState } from 'react';
import api from '../../utils/api';
import { isAdmin, isEmployer } from '../../utils/auth';

function Settings() {
  const [settings, setSettings] = useState({
    printer_ip: '192.168.1.100',
    printer_port: '9100',
    paper_size: '80mm',
    print_method: 'server',
    bill_store_name: '',
    bill_store_address: '',
    bill_store_phone: '',
    bill_footer_message: 'Cảm ơn quý khách!',
  });
  const [stores, setStores] = useState([]);
  const [selectedStoreId, setSelectedStoreId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (isAdmin()) {
      loadStores();
    }
    loadSettings();
  }, []);

  useEffect(() => {
    if (selectedStoreId) {
      loadSettings();
    }
  }, [selectedStoreId]);

  const loadStores = async () => {
    try {
      const response = await api.get('/stores');
      setStores(response.data.data || []);
      if (response.data.data && response.data.data.length > 0) {
        setSelectedStoreId(response.data.data[0].id);
      }
    } catch (error) {
      console.error('Error loading stores:', error);
    }
  };

  const loadSettings = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (isAdmin() && selectedStoreId) {
        params.append('store_id', selectedStoreId);
      }
      const response = await api.get(`/settings?${params.toString()}`);
      setSettings(response.data.data || settings);
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');

    try {
      const dataToSend = { ...settings };
      if (isAdmin() && selectedStoreId) {
        dataToSend.store_id = selectedStoreId;
      }
      await api.put('/settings', dataToSend);
      setMessage('Đã lưu cài đặt thành công!');
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      setMessage('Lưu thất bại: ' + (error.response?.data?.error || 'Lỗi không xác định'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="text-center py-8">Đang tải...</div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Cài đặt</h1>
        <p className="text-gray-600">Cấu hình máy in và hệ thống</p>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Cài đặt máy in</h2>
        
        {message && (
          <div
            className={`mb-4 p-3 rounded-lg ${
              message.includes('thành công')
                ? 'bg-green-100 text-green-700'
                : 'bg-red-100 text-red-700'
            }`}
          >
            {message}
          </div>
        )}

        {isAdmin() && stores.length > 0 && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Chọn cửa hàng
            </label>
            <select
              value={selectedStoreId}
              onChange={(e) => setSelectedStoreId(e.target.value)}
              className="w-full px-3 py-2.5 border rounded-lg text-base"
            >
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name} {store.phone ? `(${store.phone})` : ''}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Cài đặt sẽ áp dụng cho cửa hàng được chọn
            </p>
          </div>
        )}

        {isEmployer() && (
          <div className="mb-4 p-3 bg-blue-50 rounded-lg">
            <p className="text-sm text-blue-800">
              Cài đặt này sẽ áp dụng cho cửa hàng của bạn
            </p>
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              IP máy in *
            </label>
            <input
              type="text"
              value={settings.printer_ip}
              onChange={(e) => setSettings({ ...settings, printer_ip: e.target.value })}
              className="w-full px-3 py-2.5 border rounded-lg text-base"
              placeholder="192.168.1.100"
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              Địa chỉ IP của máy in trong mạng nội bộ
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Cổng máy in *
            </label>
            <input
              type="number"
              value={settings.printer_port}
              onChange={(e) => setSettings({ ...settings, printer_port: e.target.value })}
              className="w-full px-3 py-2.5 border rounded-lg text-base"
              placeholder="9100"
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              Cổng mặc định cho máy in network thường là 9100
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Cỡ giấy *
            </label>
            <select
              value={settings.paper_size}
              onChange={(e) => setSettings({ ...settings, paper_size: e.target.value })}
              className="w-full px-3 py-2.5 border rounded-lg text-base"
              required
            >
              <option value="80mm">80mm (Thông thường)</option>
              <option value="58mm">58mm (Nhỏ)</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Chọn cỡ giấy phù hợp với máy in của bạn
            </p>
          </div>

          <div className="pt-4 border-t border-gray-200">
            <h3 className="text-base font-semibold text-gray-800 mb-3">Cài đặt in bill</h3>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Phương thức in *
              </label>
              <select
                value={settings.print_method || 'server'}
                onChange={(e) => setSettings({ ...settings, print_method: e.target.value })}
                className="w-full px-3 py-2.5 border rounded-lg text-base"
                required
              >
                <option value="server">Server (IP/Port) - In qua mạng</option>
                <option value="bluetooth">Bluetooth - In trực tiếp từ điện thoại</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Cửa hàng sẽ bắt buộc sử dụng phương thức in đã được cài đặt. Bluetooth chỉ hoạt động trên Android Chrome.
              </p>
            </div>

            <div className="pt-4 border-t border-gray-200">
              <h4 className="text-sm font-semibold text-gray-700 mb-3">Định dạng bill</h4>
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tên cửa hàng (Header)
                </label>
                <input
                  type="text"
                  value={settings.bill_store_name || ''}
                  onChange={(e) => setSettings({ ...settings, bill_store_name: e.target.value })}
                  className="w-full px-3 py-2.5 border rounded-lg text-base"
                  placeholder="QUẢN LÝ CỬA HÀNG"
                  maxLength={50}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Tên hiển thị ở đầu bill. Để trống sẽ dùng "QUẢN LÝ CỬA HÀNG"
                </p>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Địa chỉ cửa hàng
                </label>
                <textarea
                  value={settings.bill_store_address || ''}
                  onChange={(e) => setSettings({ ...settings, bill_store_address: e.target.value })}
                  className="w-full px-3 py-2.5 border rounded-lg text-base"
                  placeholder="123 Đường ABC, Quận XYZ, TP.HCM"
                  rows="2"
                  maxLength={200}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Địa chỉ hiển thị trên bill. Để trống sẽ không hiển thị
                </p>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  SĐT cửa hàng
                </label>
                <input
                  type="text"
                  value={settings.bill_store_phone || ''}
                  onChange={(e) => setSettings({ ...settings, bill_store_phone: e.target.value })}
                  className="w-full px-3 py-2.5 border rounded-lg text-base"
                  placeholder="0123456789"
                  maxLength={20}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Số điện thoại hiển thị trên bill. Để trống sẽ không hiển thị
                </p>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Thông điệp cuối bill (Footer)
                </label>
                <input
                  type="text"
                  value={settings.bill_footer_message || 'Cảm ơn quý khách!'}
                  onChange={(e) => setSettings({ ...settings, bill_footer_message: e.target.value })}
                  className="w-full px-3 py-2.5 border rounded-lg text-base"
                  placeholder="Cảm ơn quý khách!"
                  maxLength={100}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Thông điệp hiển thị ở cuối bill
                </p>
              </div>
            </div>
          </div>

          <div className="pt-4">
            <button
              type="submit"
              disabled={saving}
              className="w-full sm:w-auto px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-base disabled:opacity-50"
            >
              {saving ? 'Đang lưu...' : 'Lưu cài đặt'}
            </button>
          </div>
        </form>

        <div className="mt-6 p-4 bg-blue-50 rounded-lg">
          <h3 className="font-medium text-blue-900 mb-2">Hướng dẫn:</h3>
          <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
            <li>Đảm bảo máy in đã được kết nối vào cùng mạng WiFi với thiết bị</li>
            <li>Kiểm tra IP máy in trong cài đặt máy in hoặc router</li>
            <li>Cổng mặc định thường là 9100 (Raw TCP/IP)</li>
            <li>Sau khi cấu hình, thử in bill từ một đơn hàng để kiểm tra</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default Settings;

