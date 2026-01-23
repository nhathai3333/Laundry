import api from './api';

/**
 * Check if Web Bluetooth is supported
 */
const isBluetoothSupported = () => {
  return 'bluetooth' in navigator;
};

/**
 * Connect to Bluetooth printer and print ESC/POS data
 */
const printViaBluetooth = async (escPosDataBase64) => {
  if (!isBluetoothSupported()) {
    throw new Error('Web Bluetooth không được hỗ trợ trên thiết bị này');
  }

  try {
    // Request Bluetooth device
    // ESC/POS printers usually use Serial Port Profile (SPP)
    const device = await navigator.bluetooth.requestDevice({
      filters: [
        { services: ['000018f0-0000-1000-8000-00805f9b34fb'] }, // Serial Port Profile
      ],
      optionalServices: [
        '0000fff0-0000-1000-8000-00805f9b34fb', // Some printers use this
        '00001800-0000-1000-8000-00805f9b34fb', // Generic Access
      ]
    });

    // Connect to GATT server
    const server = await device.gatt.connect();
    
    // Try to get Serial Port Profile service
    let service;
    try {
      service = await server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb');
    } catch (e) {
      // Try alternative service
      try {
        service = await server.getPrimaryService('0000fff0-0000-1000-8000-00805f9b34fb');
      } catch (e2) {
        throw new Error('Không tìm thấy dịch vụ Serial Port trên máy in. Vui lòng đảm bảo máy in hỗ trợ Bluetooth SPP.');
      }
    }
    
    // Get characteristic for writing
    // Common characteristics for ESC/POS printers
    let characteristic;
    const characteristics = [
      '0000fff1-0000-1000-8000-00805f9b34fb',
      '0000fff2-0000-1000-8000-00805f9b34fb',
      '0000fff3-0000-1000-8000-00805f9b34fb',
    ];
    
    for (const charId of characteristics) {
      try {
        characteristic = await service.getCharacteristic(charId);
        break;
      } catch (e) {
        continue;
      }
    }
    
    if (!characteristic) {
      throw new Error('Không tìm thấy đặc tính ghi dữ liệu trên máy in');
    }
    
    // Convert base64 to Uint8Array
    const binaryString = atob(escPosDataBase64);
    const data = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      data[i] = binaryString.charCodeAt(i);
    }
    
    // Send data in chunks (Bluetooth has MTU limits, usually 20 bytes)
    const chunkSize = 20;
    for (let i = 0; i < data.length; i += chunkSize) {
      const chunk = data.slice(i, i + chunkSize);
      await characteristic.writeValue(chunk);
      // Small delay to avoid overwhelming the printer
      if (i + chunkSize < data.length) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }
    
    // Disconnect
    device.gatt.disconnect();
    
    return true;
  } catch (error) {
    if (error.name === 'NotFoundError') {
      throw new Error('Không tìm thấy máy in Bluetooth. Vui lòng đảm bảo máy in đã được bật và có thể phát hiện.');
    } else if (error.name === 'SecurityError') {
      throw new Error('Lỗi bảo mật. Vui lòng cho phép truy cập Bluetooth.');
    } else if (error.name === 'NetworkError') {
      throw new Error('Lỗi kết nối Bluetooth. Vui lòng thử lại.');
    } else {
      throw new Error(`Lỗi kết nối Bluetooth: ${error.message || 'Lỗi không xác định'}`);
    }
  }
};

/**
 * Get print settings from server
 */
const getPrintSettings = async () => {
  try {
    const response = await api.get('/settings');
    return response.data.data || {};
  } catch (error) {
    console.error('Error loading print settings:', error);
    return {
      print_method: 'server'
    };
  }
};

/**
 * Print bill using the method set in settings
 * This function enforces the print method set by admin
 */
export const printBill = async (orderId) => {
  try {
    // Get print settings - this is mandatory
    const settings = await getPrintSettings();
    const printMethod = settings.print_method || 'server';
    
    // Enforce the print method from settings
    if (printMethod === 'bluetooth') {
      // Must use Bluetooth
      if (!isBluetoothSupported()) {
        throw new Error('Web Bluetooth không được hỗ trợ trên thiết bị này. Vui lòng liên hệ admin để đổi phương thức in.');
      }
      
      // Get bill data from server
      const response = await api.get(`/print/bill-data/${orderId}`);
      if (response.data.success && response.data.data) {
        // Print via Bluetooth
        await printViaBluetooth(response.data.data);
        return { success: true, method: 'bluetooth' };
      } else {
        throw new Error('Không thể lấy dữ liệu bill để in');
      }
    } else {
      // Must use Server (default)
      await api.post(`/print/bill/${orderId}`);
      return { success: true, method: 'server' };
    }
  } catch (error) {
    // Re-throw with better error message
    if (error.response?.data?.error) {
      throw new Error(error.response.data.error);
    }
    throw error;
  }
};
