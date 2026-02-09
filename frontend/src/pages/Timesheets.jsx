import { useEffect, useState } from 'react';
import api from '../utils/api';
import { isAdmin, getEmployeeId, getAuth } from '../utils/auth';
import { format, getDaysInMonth } from 'date-fns';
import { getSavedFilters, saveFilters } from '../utils/filterStorage';

function Timesheets() {
  const savedFilters = getSavedFilters();
  const [timesheets, setTimesheets] = useState([]);
  const [stores, setStores] = useState([]);
  const [selectedStoreId, setSelectedStoreId] = useState(savedFilters.selectedStoreId);
  const [loading, setLoading] = useState(true);
  const [todayCheckIn, setTodayCheckIn] = useState(null);
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selectedMonth, setSelectedMonth] = useState(savedFilters.selectedMonth);
  const [selectedYear, setSelectedYear] = useState(savedFilters.selectedYear);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [revenueAmount, setRevenueAmount] = useState('');
  const [checkoutNote, setCheckoutNote] = useState('');
  const [expectedRevenue, setExpectedRevenue] = useState(0);
  const [expectedOrderCount, setExpectedOrderCount] = useState(0);
  const [totalWithdrawn, setTotalWithdrawn] = useState(0);
  const [checkoutWithdrawnAmount, setCheckoutWithdrawnAmount] = useState('');
  const [dailyHours, setDailyHours] = useState([]);
  const [dailyHoursLoading, setDailyHoursLoading] = useState(false);
  const [viewMode, setViewMode] = useState(isAdmin() ? 'list' : 'list'); // 'list', 'daily', 'payroll'
  const [periodViewMode, setPeriodViewMode] = useState(isAdmin() ? 'day' : 'day'); // 'day', 'month', or 'year' for admin
  const [daysInMonth, setDaysInMonth] = useState(31);
  const [showCheckinModal, setShowCheckinModal] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [checkinNote, setCheckinNote] = useState('');
  const [payroll, setPayroll] = useState([]);
  const [payrollLoading, setPayrollLoading] = useState(false);
  const [payrollPeriod, setPayrollPeriod] = useState('month');
  const [payrollMonth, setPayrollMonth] = useState(new Date().getMonth() + 1);
  const [payrollYear, setPayrollYear] = useState(new Date().getFullYear());
  const [payrollWeek, setPayrollWeek] = useState(1);

  useEffect(() => {
    if (isAdmin()) {
      loadStores();
    }
    loadTimesheets();
    checkTodayStatus();
    if (isAdmin() && viewMode === 'daily') {
      loadDailyHours();
    }
    if (isAdmin() && viewMode === 'payroll') {
      loadPayroll();
    }
    if (!isAdmin()) {
      loadStoreEmployees();
    }
  }, [selectedDate, selectedMonth, selectedYear, viewMode, periodViewMode, payrollPeriod, payrollMonth, payrollYear, payrollWeek, selectedStoreId]);

  // Save filters whenever they change
  useEffect(() => {
    if (isAdmin()) {
      saveFilters(selectedStoreId, selectedMonth, selectedYear);
    }
  }, [selectedStoreId, selectedMonth, selectedYear]);

  const loadStores = async () => {
    try {
      const response = await api.get('/stores');
      setStores(response.data.data || []);
    } catch (error) {
      console.error('Error loading stores:', error);
    }
  };

  useEffect(() => {
    if (payrollPeriod === 'week' && payrollWeek === 1) {
      setPayrollWeek(getWeekNumber(new Date()));
    }
  }, []);

  const loadTimesheets = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      
      if (isAdmin() && periodViewMode === 'month') {
        // For month view, get all timesheets in the month
        const startDate = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`;
        const daysInMonth = getDaysInMonth(new Date(selectedYear, selectedMonth - 1));
        const endDate = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
        params.append('start_date', startDate);
        params.append('end_date', endDate);
      } else if (isAdmin() && periodViewMode === 'year') {
        // For year view, get all timesheets in the year
        const startDate = `${selectedYear}-01-01`;
        const endDate = `${selectedYear}-12-31`;
        params.append('start_date', startDate);
        params.append('end_date', endDate);
      } else {
        // For day view, filter by date
        params.append('date', selectedDate);
      }
      
      // Add store_id filter if admin selected a specific store
      if (isAdmin() && selectedStoreId && selectedStoreId !== 'all') {
        params.append('store_id', selectedStoreId);
      }

      const response = await api.get(`/timesheets?${params.toString()}`);
      let allTimesheets = response.data.data || [];
      
      // Filter by date if day mode
      if (isAdmin() && periodViewMode === 'day') {
        allTimesheets = allTimesheets.filter(ts => {
          const tsDate = format(new Date(ts.check_in), 'yyyy-MM-dd');
          return tsDate === selectedDate;
        });
      }
      
      setTimesheets(allTimesheets);
    } catch (error) {
      console.error('Error loading timesheets:', error);
    } finally {
      setLoading(false);
    }
  };

  const checkTodayStatus = async () => {
    try {
      const today = format(new Date(), 'yyyy-MM-dd');
      const response = await api.get(`/timesheets?date=${today}`);
      const todayRecords = response.data.data || [];
      const active = todayRecords.find((t) => !t.check_out);
      setTodayCheckIn(active || null);
    } catch (error) {
      console.error('Error checking today status:', error);
    }
  };

  const loadStoreEmployees = async () => {
    try {
      const response = await api.get('/timesheets/store-employees');
      setEmployees(response.data.data || []);
    } catch (error) {
      console.error('Error loading employees:', error);
    }
  };

  const handleCheckInClick = () => {
    // Nếu đã chọn nhân viên khi login, tự động dùng employee_id đó
    const employeeIdFromToken = getEmployeeId();
    setShowCheckinModal(true);
    setSelectedEmployee(employeeIdFromToken || '');
    setCheckinNote('');
  };

  const handleCheckIn = async () => {
    try {
      // Ưu tiên dùng employee_id từ token (nếu đã chọn khi login)
      // Nếu không có trong token, dùng từ form
      const employeeIdFromToken = getEmployeeId();
      const employeeIdToSend = employeeIdFromToken || selectedEmployee || undefined;
      
      await api.post('/timesheets/check-in', {
        employee_id: employeeIdToSend,
        note: checkinNote,
      });
      setShowCheckinModal(false);
      setSelectedEmployee('');
      setCheckinNote('');
      checkTodayStatus();
      loadTimesheets();
    } catch (error) {
      alert(error.response?.data?.error || 'Check-in thất bại');
    }
  };

  const handleCheckOutClick = async () => {
    try {
      // Get expected revenue and total withdrawn from completed orders in this shift
      const response = await api.get('/timesheets/expected-revenue');
      setExpectedRevenue(response.data.data.expected_revenue || 0);
      setExpectedOrderCount(response.data.data.order_count || 0);
      setTotalWithdrawn(response.data.data.total_withdrawn || 0);
      setRevenueAmount(response.data.data.expected_revenue || '');
      setShowCheckoutModal(true);
    } catch (error) {
      console.error('Error loading expected revenue:', error);
      setExpectedRevenue(0);
      setExpectedOrderCount(0);
      setTotalWithdrawn(0);
      setRevenueAmount('');
      setShowCheckoutModal(true);
    }
  };

  const handleCheckOut = async () => {
    // Allow any numeric value, including negative numbers
    if (revenueAmount === '' || revenueAmount === null || revenueAmount === undefined) {
      alert('Vui lòng nhập số tiền thực tế');
      return;
    }
    
    const revenueValue = parseFloat(revenueAmount);
    
    if (isNaN(revenueValue)) {
      alert('Vui lòng nhập số tiền hợp lệ');
      return;
    }

    // Debug log removed for security

    try {
      const response = await api.post('/timesheets/check-out', {
        revenue_amount: revenueValue,
        expected_revenue: expectedRevenue || 0,
        withdrawn_amount: checkoutWithdrawnAmount !== '' && checkoutWithdrawnAmount != null
          ? parseFloat(checkoutWithdrawnAmount)
          : null,
        note: checkoutNote || null,
      });
      
      // Success log removed for security
      
      setShowCheckoutModal(false);
      setRevenueAmount('');
      setCheckoutNote('');
      setCheckoutWithdrawnAmount('');
      setExpectedRevenue(0);
      setExpectedOrderCount(0);
      setTotalWithdrawn(0);
      checkTodayStatus();
      loadTimesheets();
      if (isAdmin() && viewMode === 'daily') {
        loadDailyHours();
      }
      alert('Check-out thành công!');
    } catch (error) {
      // Error details removed for security
      const errorMessage = error.response?.data?.error || error.message || 'Lỗi không xác định';
      alert('Check-out thất bại: ' + errorMessage);
    }
  };

  const loadDailyHours = async () => {
    if (!isAdmin()) return;
    
    setDailyHoursLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('month', selectedMonth);
      params.append('year', selectedYear);
      
      // Add store_id filter if admin selected a specific store
      if (selectedStoreId && selectedStoreId !== 'all') {
        params.append('store_id', selectedStoreId);
      }

      const response = await api.get(`/timesheets/daily-hours?${params.toString()}`);
      setDailyHours(response.data.data || []);
      setDaysInMonth(response.data.days_in_month || 31);
    } catch (error) {
      console.error('Error loading daily hours:', error);
    } finally {
      setDailyHoursLoading(false);
    }
  };


  const loadPayroll = async () => {
    if (!isAdmin()) return;
    
    setPayrollLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('period', payrollPeriod);
      
      if (payrollPeriod === 'week') {
        params.append('week', payrollWeek);
        params.append('year', payrollYear);
      } else {
        params.append('month', payrollMonth);
        params.append('year', payrollYear);
      }
      
      // Add store_id filter if admin selected a specific store
      if (selectedStoreId && selectedStoreId !== 'all') {
        params.append('store_id', selectedStoreId);
      }

      const response = await api.get(`/timesheets/payroll?${params.toString()}`);
      setPayroll(response.data.data || []);
    } catch (error) {
      console.error('Error loading payroll:', error);
    } finally {
      setPayrollLoading(false);
    }
  };

  const handleExportExcel = async () => {
    try {
      const params = new URLSearchParams();
      
      if (periodViewMode === 'month') {
        const startDate = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`;
        const daysInMonth = getDaysInMonth(new Date(selectedYear, selectedMonth - 1));
        const endDate = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
        params.append('start_date', startDate);
        params.append('end_date', endDate);
      } else if (periodViewMode === 'year') {
        params.append('start_date', `${selectedYear}-01-01`);
        params.append('end_date', `${selectedYear}-12-31`);
      } else {
        params.append('date', selectedDate);
      }
      
      if (isAdmin() && selectedStoreId && selectedStoreId !== 'all') {
        params.append('store_id', selectedStoreId);
      }

      const response = await api.get(`/timesheets/export?${params.toString()}`, {
        responseType: 'blob'
      });

      // Create blob and download
      const blob = new Blob([response.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      // Get filename from Content-Disposition header or use default
      const contentDisposition = response.headers['content-disposition'];
      let fileName = `ChamCong_${selectedDate || `${selectedMonth}_${selectedYear}`}.xlsx`;
      if (contentDisposition) {
        const fileNameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        if (fileNameMatch && fileNameMatch[1]) {
          fileName = decodeURIComponent(fileNameMatch[1].replace(/['"]/g, ''));
        }
      }
      
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      alert('Xuất Excel thành công!');
    } catch (error) {
      console.error('Error exporting Excel:', error);
      alert(error.response?.data?.error || 'Có lỗi xảy ra khi xuất Excel');
    }
  };

  const getWeekNumber = (date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
    const week1 = new Date(d.getFullYear(), 0, 4);
    return 1 + Math.round(((d - week1) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
  };

  const getDaysArray = () => {
    const days = [];
    const daysInSelectedMonth = getDaysInMonth(new Date(selectedYear, selectedMonth - 1));
    for (let day = 1; day <= daysInSelectedMonth; day++) {
      const dateKey = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      days.push({ day, dateKey });
    }
    return days;
  };

  const handleDateChange = (dateStr) => {
    setSelectedDate(dateStr);
    const date = new Date(dateStr);
    setSelectedMonth(date.getMonth() + 1);
    setSelectedYear(date.getFullYear());
  };

  const getDaysInSelectedMonth = () => {
    const days = getDaysInMonth(new Date(selectedYear, selectedMonth - 1));
    return Array.from({ length: days }, (_, i) => {
      const day = i + 1;
      const dateStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      return {
        day,
        dateStr,
        isSelected: dateStr === selectedDate,
        isToday: dateStr === format(new Date(), 'yyyy-MM-dd'),
      };
    });
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
    <div className="space-y-4 sm:space-y-6">
      <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1 sm:mb-0">Chấm công</h1>
          <p className="text-sm sm:text-base text-gray-600">Quản lý chấm công của nhân viên</p>
        </div>
        {isAdmin() && stores.length > 0 && (
          <div className="w-full sm:w-auto">
            <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">Lọc theo cửa hàng</label>
            <select
              value={selectedStoreId}
              onChange={(e) => setSelectedStoreId(e.target.value)}
              className="w-full sm:w-auto px-3 sm:px-4 py-2.5 sm:py-2 border border-gray-300 rounded-lg text-sm sm:text-base bg-white shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 touch-manipulation"
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

      {/* Check In/Out */}
      {!isAdmin() && (
        <div className="bg-gradient-to-br from-white to-gray-50 rounded-xl shadow-lg border border-gray-200 p-4 sm:p-8">
          <div className="text-center mb-4">
            <div className="text-xs sm:text-sm text-gray-600 mb-3 sm:mb-2">Hôm nay</div>
            {todayCheckIn ? (
              <div>
                <div className="text-base sm:text-lg font-medium text-green-600 mb-3 sm:mb-2">
                  Đã check-in: {new Date(todayCheckIn.check_in).toLocaleTimeString('vi-VN')}
                </div>
                <button
                  onClick={handleCheckOutClick}
                  className="w-full sm:w-auto bg-gradient-to-r from-red-600 to-red-700 text-white px-8 py-4 sm:py-3 rounded-xl active:from-red-700 active:to-red-800 hover:from-red-700 hover:to-red-800 font-semibold shadow-lg hover:shadow-xl transition-all duration-300 touch-manipulation text-base sm:text-lg"
                >
                  Check-out
                </button>
              </div>
            ) : (
              <div>
                <div className="text-base sm:text-lg font-medium text-gray-600 mb-3 sm:mb-2">Chưa check-in</div>
                <button
                  onClick={handleCheckInClick}
                  className="w-full sm:w-auto bg-gradient-to-r from-green-600 to-green-700 text-white px-8 py-4 sm:py-3 rounded-xl active:from-green-700 active:to-green-800 hover:from-green-700 hover:to-green-800 font-semibold shadow-lg hover:shadow-xl transition-all duration-300 touch-manipulation text-base sm:text-lg"
                >
                  Check-in
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Date Selector and View Mode - Admin */}
      {isAdmin() && (
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-3 sm:p-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setPeriodViewMode('day')}
                className={`px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all duration-300 touch-manipulation ${
                  periodViewMode === 'day'
                    ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg'
                    : 'bg-gray-100 text-gray-700 active:bg-gray-200 hover:bg-gray-200'
                }`}
              >
                Theo ngày
              </button>
              <button
                onClick={() => setPeriodViewMode('month')}
                className={`px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all duration-300 touch-manipulation ${
                  periodViewMode === 'month'
                    ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg'
                    : 'bg-gray-100 text-gray-700 active:bg-gray-200 hover:bg-gray-200'
                }`}
              >
                Theo tháng
              </button>
              <button
                onClick={() => setPeriodViewMode('year')}
                className={`px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all duration-300 touch-manipulation ${
                  periodViewMode === 'year'
                    ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg'
                    : 'bg-gray-100 text-gray-700 active:bg-gray-200 hover:bg-gray-200'
                }`}
              >
                Theo năm
              </button>
            </div>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setViewMode('list')}
                className={`px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all duration-300 touch-manipulation ${
                  viewMode === 'list'
                    ? 'bg-gradient-to-r from-indigo-600 to-indigo-700 text-white shadow-lg'
                    : 'bg-gray-100 text-gray-700 active:bg-gray-200 hover:bg-gray-200'
                }`}
              >
                Danh sách
              </button>
              <button
                onClick={() => setViewMode('daily')}
                className={`px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all duration-300 touch-manipulation ${
                  viewMode === 'daily'
                    ? 'bg-gradient-to-r from-indigo-600 to-indigo-700 text-white shadow-lg'
                    : 'bg-gray-100 text-gray-700 active:bg-gray-200 hover:bg-gray-200'
                }`}
              >
                Bảng giờ
              </button>
              <button
                onClick={() => setViewMode('payroll')}
                className={`px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all duration-300 touch-manipulation ${
                  viewMode === 'payroll'
                    ? 'bg-gradient-to-r from-indigo-600 to-indigo-700 text-white shadow-lg'
                    : 'bg-gray-100 text-gray-700 active:bg-gray-200 hover:bg-gray-200'
                }`}
              >
                Tính lương
              </button>
              <button
                onClick={handleExportExcel}
                className="px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all duration-300 touch-manipulation bg-green-600 text-white hover:bg-green-700 shadow-lg flex items-center gap-1"
                title="Xuất Excel"
              >
                <span>📊</span>
                <span>Xuất Excel</span>
              </button>
            </div>
          </div>
          
          {periodViewMode === 'day' && (
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={selectedYear}
                onChange={(e) => {
                  const year = parseInt(e.target.value) || new Date().getFullYear();
                  setSelectedYear(year);
                  const currentDate = new Date(selectedDate);
                  const newYearDate = new Date(year, selectedMonth - 1, 1);
                  let day = 1;
                  if (currentDate.getFullYear() === year && currentDate.getMonth() + 1 === selectedMonth) {
                    day = currentDate.getDate();
                    const daysInMonth = getDaysInMonth(newYearDate);
                    if (day > daysInMonth) day = daysInMonth;
                  }
                  const newDate = `${year}-${String(selectedMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  handleDateChange(newDate);
                }}
                className="px-2 py-2 sm:py-1.5 border rounded-lg text-xs sm:text-sm touch-manipulation flex-1 sm:flex-none"
              >
                {Array.from({ length: 5 }, (_, i) => {
                  const year = new Date().getFullYear() - 2 + i;
                  return (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  );
                })}
              </select>
              <select
                value={selectedMonth}
                onChange={(e) => {
                  const month = parseInt(e.target.value);
                  setSelectedMonth(month);
                  const currentDate = new Date(selectedDate);
                  const newMonthDate = new Date(selectedYear, month - 1, 1);
                  let day = 1;
                  if (currentDate.getMonth() + 1 === month && currentDate.getFullYear() === selectedYear) {
                    day = currentDate.getDate();
                    const daysInMonth = getDaysInMonth(newMonthDate);
                    if (day > daysInMonth) day = daysInMonth;
                  }
                  const newDate = `${selectedYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  handleDateChange(newDate);
                }}
                className="px-2 py-1.5 border rounded text-xs"
              >
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>
                    Tháng {i + 1}
                  </option>
                ))}
              </select>
              <select
                value={selectedDate}
                onChange={(e) => handleDateChange(e.target.value)}
                className="px-2 py-1.5 border rounded text-xs flex-1"
              >
                {getDaysInSelectedMonth().map(({ day, dateStr, isToday }) => {
                  const date = new Date(dateStr);
                  const dayOfWeek = date.getDay();
                  const dayName = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][dayOfWeek];
                  const displayText = isToday 
                    ? `Hôm nay - ${day}/${selectedMonth} (${dayName})`
                    : `${day}/${selectedMonth} (${dayName})`;
                  return (
                    <option key={dateStr} value={dateStr}>
                      {displayText}
                    </option>
                  );
                })}
              </select>
            </div>
          )}
          
          {periodViewMode === 'month' && (
            <div className="flex items-center gap-2">
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                className="px-2 py-1.5 border rounded text-xs"
              >
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>Tháng {i + 1}</option>
                ))}
              </select>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                className="px-2 py-1.5 border rounded text-xs"
              >
                {Array.from({ length: 5 }, (_, i) => {
                  const year = new Date().getFullYear() - 2 + i;
                  return <option key={year} value={year}>{year}</option>;
                })}
              </select>
            </div>
          )}
        </div>
      )}

      {/* Date Selector - Non-admin */}
      {!isAdmin() && (
        <div className="bg-white rounded-lg shadow p-2">
          <div className="flex items-center gap-2 flex-1">
            <select
              value={selectedYear}
              onChange={(e) => {
                const year = parseInt(e.target.value) || new Date().getFullYear();
                setSelectedYear(year);
                const currentDate = new Date(selectedDate);
                const newYearDate = new Date(year, selectedMonth - 1, 1);
                let day = 1;
                if (currentDate.getFullYear() === year && currentDate.getMonth() + 1 === selectedMonth) {
                  day = currentDate.getDate();
                  const daysInMonth = getDaysInMonth(newYearDate);
                  if (day > daysInMonth) day = daysInMonth;
                }
                const newDate = `${year}-${String(selectedMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                handleDateChange(newDate);
              }}
              className="px-2 py-1.5 border rounded text-xs"
            >
              {Array.from({ length: 5 }, (_, i) => {
                const year = new Date().getFullYear() - 2 + i;
                return (
                  <option key={year} value={year}>
                    {year}
                  </option>
                );
              })}
            </select>
            <select
              value={selectedMonth}
              onChange={(e) => {
                const month = parseInt(e.target.value);
                setSelectedMonth(month);
                const currentDate = new Date(selectedDate);
                const newMonthDate = new Date(selectedYear, month - 1, 1);
                let day = 1;
                if (currentDate.getMonth() + 1 === month && currentDate.getFullYear() === selectedYear) {
                  day = currentDate.getDate();
                  const daysInMonth = getDaysInMonth(newMonthDate);
                  if (day > daysInMonth) day = daysInMonth;
                }
                const newDate = `${selectedYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                handleDateChange(newDate);
              }}
              className="px-2 py-1.5 border rounded text-xs"
            >
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  Tháng {i + 1}
                </option>
              ))}
            </select>
            <select
              value={selectedDate}
              onChange={(e) => handleDateChange(e.target.value)}
              className="px-2 py-1.5 border rounded text-xs flex-1"
            >
              {getDaysInSelectedMonth().map(({ day, dateStr, isToday }) => {
                const date = new Date(dateStr);
                const dayOfWeek = date.getDay();
                const dayName = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][dayOfWeek];
                const displayText = isToday 
                  ? `Hôm nay - ${day}/${selectedMonth} (${dayName})`
                  : `${day}/${selectedMonth} (${dayName})`;
                return (
                  <option key={dateStr} value={dateStr}>
                    {displayText}
                  </option>
                );
              })}
            </select>
          </div>
        </div>
      )}

      {/* Daily Hours Table - Admin only */}
      {isAdmin() && viewMode === 'daily' && (
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
          <div className="bg-gradient-to-r from-cyan-500 to-blue-600 p-6">
            <h2 className="text-xl font-bold text-white">
              Chấm công theo ngày - Tháng {selectedMonth}/{selectedYear}
            </h2>
          </div>
          {dailyHoursLoading ? (
            <div className="p-8 text-center text-gray-500">Đang tải...</div>
          ) : dailyHours.length === 0 ? (
            <div className="p-8 text-center text-gray-500">Chưa có dữ liệu</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-1.5 py-1 text-left text-[10px] font-medium text-gray-700 uppercase border border-gray-300 sticky left-0 bg-gray-50 z-10 min-w-[60px]">
                      Ngày
                    </th>
                    {dailyHours.map((emp) => (
                      <th
                        key={emp.user_id}
                        className="px-1 py-1 text-center text-[10px] font-medium text-gray-700 uppercase border border-gray-300 min-w-[50px]"
                      >
                        <div className="flex flex-col items-center">
                          <span>{emp.employee_name || emp.user_name}</span>
                          {emp.employee_name && emp.user_name && emp.employee_name !== emp.user_name && (
                            <span className="text-[8px] text-gray-500 mt-0.5">({emp.user_name})</span>
                          )}
                        </div>
                      </th>
                    ))}
                    <th className="px-1.5 py-1 text-center text-[10px] font-medium text-gray-700 uppercase bg-gray-100 font-bold border border-gray-300 min-w-[50px]">
                      Tổng
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {getDaysArray().map(({ day, dateKey }) => {
                    const date = new Date(dateKey);
                    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                    const dayTotal = dailyHours.reduce(
                      (sum, emp) => sum + (emp.daily_hours[dateKey] || 0),
                      0
                    );
                    return (
                      <tr key={day} className="hover:bg-gray-50">
                        <td className={`px-1.5 py-1 text-[11px] font-medium text-gray-800 border border-gray-300 sticky left-0 bg-white z-10 ${
                          isWeekend ? 'bg-red-50' : ''
                        }`}>
                          <div>{day}/{selectedMonth}</div>
                          <div className="text-[9px] text-gray-500">
                            {date.toLocaleDateString('vi-VN', { weekday: 'short' })}
                          </div>
                        </td>
                        {dailyHours.map((emp) => {
                          const hours = emp.daily_hours[dateKey] || 0;
                          return (
                            <td
                              key={emp.user_id}
                              className={`px-1 py-1 text-[11px] text-center border border-gray-300 ${
                                isWeekend ? 'bg-red-50' : ''
                              } ${
                                hours > 0
                                  ? 'font-medium text-blue-600'
                                  : 'text-gray-400'
                              }`}
                              title={`${emp.user_name} - Ngày ${day}/${selectedMonth}: ${hours > 0 ? hours.toFixed(1) + ' giờ' : 'Không làm việc'}`}
                            >
                              {hours > 0 ? hours.toFixed(1) : '-'}
                            </td>
                          );
                        })}
                        <td className={`px-1.5 py-1 text-[11px] text-center font-bold text-gray-800 bg-gray-100 border border-gray-300 ${
                          isWeekend ? 'bg-red-100' : ''
                        }`}>
                          {dayTotal > 0 ? dayTotal.toFixed(1) : '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-gray-50 font-semibold">
                  <tr>
                    <td className="px-1.5 py-1 text-[11px] text-gray-800 border border-gray-300 sticky left-0 bg-gray-50 z-10">
                      Tổng
                    </td>
                    {dailyHours.map((emp) => (
                      <td key={emp.user_id} className="px-1 py-1 text-[11px] text-center font-bold text-gray-800 border border-gray-300">
                        {(parseFloat(emp.total_month_hours) || 0).toFixed(1)}
                      </td>
                    ))}
                    <td className="px-1.5 py-1 text-[11px] text-center bg-gray-100 border border-gray-300">
                      {dailyHours
                        .reduce((sum, emp) => sum + (parseFloat(emp.total_month_hours) || 0), 0)
                        .toFixed(1)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Payroll Table - Admin only */}
      {isAdmin() && viewMode === 'payroll' && (
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
          <div className="bg-gradient-to-r from-purple-500 to-pink-600 p-6">
            <h2 className="text-xl font-bold text-white mb-4">Tính giờ chấm công & Lương nhân viên</h2>
            
            {/* Filters */}
            <div className="flex flex-wrap gap-3 mb-4">
              <select
                value={payrollPeriod}
                onChange={(e) => {
                  setPayrollPeriod(e.target.value);
                  if (e.target.value === 'week') {
                    setPayrollWeek(getWeekNumber(new Date()));
                  }
                }}
                className="px-3 py-2 border rounded-lg"
              >
                <option value="week">Theo tuần</option>
                <option value="month">Theo tháng</option>
              </select>

              {payrollPeriod === 'week' ? (
                <>
                  <input
                    type="number"
                    min="1"
                    max="53"
                    value={payrollWeek}
                    onChange={(e) => setPayrollWeek(parseInt(e.target.value) || 1)}
                    className="px-3 py-2 border rounded-lg w-24"
                    placeholder="Tuần"
                  />
                  <input
                    type="number"
                    min="2020"
                    max="2100"
                    value={payrollYear}
                    onChange={(e) => setPayrollYear(parseInt(e.target.value) || new Date().getFullYear())}
                    className="px-3 py-2 border rounded-lg w-32"
                    placeholder="Năm"
                  />
                </>
              ) : (
                <>
                  <select
                    value={payrollMonth}
                    onChange={(e) => setPayrollMonth(parseInt(e.target.value))}
                    className="px-3 py-2 border rounded-lg"
                  >
                    {Array.from({ length: 12 }, (_, i) => (
                      <option key={i + 1} value={i + 1}>
                        Tháng {i + 1}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="2020"
                    max="2100"
                    value={payrollYear}
                    onChange={(e) => setPayrollYear(parseInt(e.target.value) || new Date().getFullYear())}
                    className="px-3 py-2 border rounded-lg w-32"
                    placeholder="Năm"
                  />
                </>
              )}
            </div>
          </div>

          {/* Payroll Table */}
          <div className="overflow-x-auto">
            {payrollLoading ? (
              <div className="p-8 text-center text-gray-500">Đang tải...</div>
            ) : payroll.length === 0 ? (
              <div className="p-8 text-center text-gray-500">Chưa có dữ liệu</div>
            ) : (
              <>
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Nhân viên</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Người đứng ca</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase">Số ca</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase">Giờ</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase">Lương/giờ</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase">Lương/ca</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase">Tổng lương</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {payroll.map((emp) => (
                      <tr key={emp.user_id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm font-medium text-gray-800">
                          {emp.employee_name || '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {emp.user_name || '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 text-right">{emp.total_shifts}</td>
                        <td className="px-4 py-3 text-sm font-medium text-gray-800 text-right">{(parseFloat(emp.total_hours) || 0).toFixed(2)}h</td>
                        <td className="px-4 py-3 text-sm text-gray-600 text-right">
                          {emp.hourly_rate > 0 ? new Intl.NumberFormat('vi-VN').format(emp.hourly_rate) + ' đ/h' : '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 text-right">
                          {emp.shift_rate > 0 ? new Intl.NumberFormat('vi-VN').format(emp.shift_rate) + ' đ/ca' : '-'}
                        </td>
                        <td className="px-4 py-3 text-sm font-bold text-green-600 text-right">
                          {new Intl.NumberFormat('vi-VN').format(emp.salary)} đ
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 font-semibold">
                    <tr>
                      <td colSpan="2" className="px-4 py-3 text-sm text-gray-800">Tổng cộng</td>
                      <td className="px-4 py-3 text-sm text-gray-600 text-right">
                        {payroll.reduce((sum, emp) => sum + emp.total_shifts, 0)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-800 text-right">
                        {payroll.reduce((sum, emp) => sum + (parseFloat(emp.total_hours) || 0), 0).toFixed(2)}h
                      </td>
                      <td colSpan="2" className="px-4 py-3 text-sm text-gray-600 text-right"></td>
                      <td className="px-4 py-3 text-sm text-green-600 text-right">
                        {new Intl.NumberFormat('vi-VN').format(payroll.reduce((sum, emp) => sum + emp.salary, 0))} đ
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </>
            )}
          </div>
        </div>
      )}

      {/* Timesheets List - Table for Admin, Cards for Non-admin */}
      {viewMode === 'list' && (
        isAdmin() ? (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Nhân viên</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Người đứng ca</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Ngày</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Check-in</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Check-out</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase">Giờ</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase">Doanh thu ca</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Ghi chú</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {timesheets.length === 0 ? (
                    <tr>
                      <td colSpan="8" className="px-4 py-8 text-center text-gray-500">
                        Chưa có dữ liệu chấm công
                      </td>
                    </tr>
                  ) : (
                    timesheets.map((timesheet) => (
                      <tr key={timesheet.id} className="hover:bg-blue-50 transition-colors duration-200 cursor-pointer">
                        <td className="px-4 py-3 font-medium text-gray-800">
                          {timesheet.employee_name || '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {timesheet.user_name || '-'}
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {new Date(timesheet.check_in).toLocaleDateString('vi-VN')}
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {new Date(timesheet.check_in).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {timesheet.check_out 
                            ? new Date(timesheet.check_out).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                            : <span className="px-3 py-1 bg-gradient-to-r from-yellow-100 to-amber-100 text-yellow-800 rounded-full text-xs font-semibold shadow-sm border border-yellow-200">Đang làm việc</span>
                          }
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-gray-800">
                          {(parseFloat(timesheet.regular_hours || 0) + parseFloat(timesheet.overtime_hours || 0)).toFixed(2)}h
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-green-600">
                          {timesheet.revenue_amount 
                            ? `${new Intl.NumberFormat('vi-VN').format(parseFloat(timesheet.revenue_amount) || 0)} đ`
                            : '-'
                          }
                        </td>
                        <td className="px-4 py-3 text-gray-600 text-sm">{timesheet.note || '-'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
                {timesheets.length > 0 && (
                  <tfoot className="bg-gray-50 font-semibold">
                    <tr>
                      <td colSpan="5" className="px-4 py-3 text-gray-800">Tổng cộng</td>
                      <td className="px-4 py-3 text-right text-gray-800">
                        {timesheets.reduce((sum, t) => sum + ((parseFloat(t.regular_hours) || 0) + (parseFloat(t.overtime_hours) || 0)), 0).toFixed(2)}h
                      </td>
                      <td className="px-4 py-3 text-right text-green-600">
                        {new Intl.NumberFormat('vi-VN').format(
                          timesheets.reduce((sum, t) => sum + (parseFloat(t.revenue_amount) || 0), 0)
                        )} đ
                      </td>
                      <td className="px-4 py-3"></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {timesheets.length === 0 ? (
              <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500 text-sm">
                Chưa có dữ liệu chấm công trong ngày này
              </div>
            ) : (
              timesheets.map((timesheet) => (
                <div key={timesheet.id} className="bg-gradient-to-br from-white to-gray-50 rounded-xl shadow-md border border-gray-200 p-4 hover:shadow-lg transition-all duration-300">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-gray-600 space-y-0.5">
                        <p>
                          <span className="font-medium">Ngày:</span>{' '}
                          {new Date(timesheet.check_in).toLocaleDateString('vi-VN')}
                        </p>
                        <p>
                          <span className="font-medium">Check-in:</span>{' '}
                          {new Date(timesheet.check_in).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </p>
                        {timesheet.check_out && (
                          <>
                            <p>
                              <span className="font-medium">Check-out:</span>{' '}
                              {new Date(timesheet.check_out).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            </p>
                            <p>
                              <span className="font-medium">Giờ:</span>{' '}
                              {(parseFloat(timesheet.regular_hours || 0) + parseFloat(timesheet.overtime_hours || 0)).toFixed(2)}h
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      {!timesheet.check_out ? (
                        <div className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-[10px] font-medium">
                          Đang làm việc
                        </div>
                      ) : timesheet.revenue_amount ? (
                        <div className="text-right">
                          <div className="text-xs text-gray-600 mb-0.5">Doanh thu ca</div>
                          <div className="text-base font-bold text-green-600">
                            {new Intl.NumberFormat('vi-VN').format(parseFloat(timesheet.revenue_amount) || 0)} đ
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )
      )}

      {/* Check-out Modal */}
      {showCheckoutModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center z-50 pb-16 sm:pb-0">
          <div className="bg-white rounded-t-xl sm:rounded-xl max-w-md w-full max-h-[85vh] flex flex-col shadow-2xl">
            <div className="flex-shrink-0 p-3 sm:p-4 border-b border-gray-200">
              <h2 className="text-base sm:text-lg font-bold text-gray-900">Kết thúc ca làm việc</h2>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); handleCheckOut(); }} className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <div className="flex-1 overflow-y-auto min-h-0 px-3 sm:px-4 py-2 sm:py-3 space-y-2 sm:space-y-3">
                {/* Expected Revenue - Always show */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5 sm:p-3">
                  <div className="text-xs text-blue-700 mb-1">
                    <span className="font-medium">Số tiền dự kiến:</span>
                    {expectedOrderCount > 0 ? (
                      <span> {expectedOrderCount} đơn</span>
                    ) : (
                      <span> Chưa có đơn</span>
                    )}
                  </div>
                  <div className="text-lg sm:text-xl font-bold text-blue-600 break-words">
                    {new Intl.NumberFormat('vi-VN').format(expectedRevenue || 0)} đ
                  </div>
                </div>

                {/* Số tiền đã rút trong ca (từ đơn) - chỉ hiển thị */}
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 sm:p-3">
                  <div className="text-xs text-amber-700 mb-1">
                    <span className="font-medium">Số tiền đã rút (từ đơn):</span>
                  </div>
                  <div className="text-lg sm:text-xl font-bold text-amber-700 break-words">
                    {new Intl.NumberFormat('vi-VN').format(totalWithdrawn || 0)} đ
                  </div>
                </div>

                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                    Số tiền rút (khi checkout) <span className="text-gray-500 font-normal">(tùy chọn)</span>
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    step="1"
                    value={checkoutWithdrawnAmount}
                    onChange={(e) => setCheckoutWithdrawnAmount(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-base focus:border-amber-500 focus:ring-1 focus:ring-amber-200 transition-all touch-manipulation"
                    placeholder="Nhập số tiền rút khi kết thúc ca"
                  />
                </div>

                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                    Số tiền thực tế (đ) *
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    step="1"
                    value={revenueAmount}
                    onChange={(e) => setRevenueAmount(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-base focus:border-blue-500 focus:ring-1 focus:ring-blue-200 transition-all touch-manipulation"
                    placeholder="Nhập số tiền"
                    required
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                    Ghi chú (tùy chọn)
                  </label>
                  <textarea 
                    value={checkoutNote}
                    onChange={(e) => setCheckoutNote(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-200 transition-all resize-none"
                    rows="2"
                    placeholder="Ghi chú..."
                  />
                </div>
              </div>
              <div className="flex-shrink-0 flex flex-col gap-2 p-3 sm:p-4 border-t border-gray-200 bg-gray-50">
                <button
                  type="submit"
                  className="w-full bg-red-600 text-white py-2 rounded-lg hover:bg-red-700 active:bg-red-800 font-medium text-sm shadow-sm transition-all touch-manipulation"
                >
                  Xác nhận Check-out
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCheckoutModal(false);
                    setRevenueAmount('');
                    setCheckoutNote('');
                    setCheckoutWithdrawnAmount('');
                    setExpectedRevenue(0);
                    setExpectedOrderCount(0);
                    setTotalWithdrawn(0);
                  }}
                  className="w-full bg-gray-200 text-gray-800 py-2 rounded-lg hover:bg-gray-300 active:bg-gray-400 font-medium text-sm transition-all touch-manipulation"
                >
                  Hủy
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Check-in Modal */}
      {showCheckinModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-2 sm:p-3 z-50 overflow-y-auto overflow-x-hidden">
          <div className="bg-white rounded-lg max-w-md w-full max-h-[90vh] flex flex-col my-auto shadow-2xl">
            <div className="flex items-center justify-between p-4 sm:p-5 pb-3 border-b border-gray-200 flex-shrink-0">
              <h2 className="text-base sm:text-lg font-bold truncate pr-2">Mở ca làm việc</h2>
              <button
                onClick={() => {
                  setShowCheckinModal(false);
                  setSelectedEmployee('');
                  setCheckinNote('');
                }}
                className="text-gray-500 hover:text-gray-700 text-xl w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-full hover:bg-gray-100 touch-manipulation"
              >
                ×
              </button>
            </div>
            <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 sm:px-5">
              <div className="space-y-3 min-w-0 py-2">
              {(() => {
                const employeeIdFromToken = getEmployeeId();
                const selectedEmployeeInfo = employees.find(emp => emp.id === parseInt(selectedEmployee || employeeIdFromToken || '0'));
                
                // Nếu đã chọn nhân viên khi login, hiển thị thông tin và ẩn dropdown
                if (employeeIdFromToken && selectedEmployeeInfo) {
                  return (
                    <div className="min-w-0">
                      <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                        Nhân viên
                      </label>
                      <div className="w-full min-w-0 px-3 py-2 border rounded-lg text-sm bg-gray-50 break-words">
                        {selectedEmployeeInfo.name} {selectedEmployeeInfo.phone ? `(${selectedEmployeeInfo.phone})` : ''}
                      </div>
                      <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5">
                        Đã chọn khi đăng nhập
                      </p>
                    </div>
                  );
                }
                
                // Nếu chưa chọn nhân viên khi login, hiển thị dropdown
                if (employees.length > 0) {
                  return (
                    <div className="min-w-0">
                      <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                        Chọn nhân viên <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={selectedEmployee}
                        onChange={(e) => setSelectedEmployee(e.target.value)}
                        className="w-full min-w-0 px-3 py-2 border rounded-lg text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-200"
                      >
                        <option value="">-- Chọn tên của bạn --</option>
                        {employees.map((emp) => (
                          <option key={emp.id} value={emp.id}>
                            {emp.name} {emp.phone ? `(${emp.phone})` : ''}
                          </option>
                        ))}
                      </select>
                      <div className="mt-2 p-2 bg-blue-50 rounded-lg border border-blue-200">
                        <p className="text-[10px] sm:text-xs text-blue-800 font-medium mb-1">
                          💡 Lưu ý khi nhiều người cùng làm việc:
                        </p>
                        <p className="text-[10px] sm:text-xs text-blue-700">
                          Mỗi nhân viên phải chọn <strong>tên của mình</strong> khi check-in. Nếu không chọn, chỉ có 1 người có thể check-in/ngày.
                        </p>
                      </div>
                    </div>
                  );
                }
                return (
                  <div className="min-w-0">
                    <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                      <p className="text-xs sm:text-sm text-yellow-800 font-medium mb-1">
                        ⚠️ Chưa có danh sách nhân viên
                      </p>
                      <p className="text-[10px] sm:text-xs text-yellow-700">
                        Nếu nhiều người cùng làm việc, vui lòng liên hệ admin để thêm nhân viên vào danh sách. Mỗi nhân viên cần chọn tên mình khi check-in.
                      </p>
                    </div>
                  </div>
                );
              })()}
              <div className="min-w-0">
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                  Ghi chú <span className="text-gray-500 text-[10px]">(tùy chọn)</span>
                </label>
                <textarea
                  value={checkinNote}
                  onChange={(e) => setCheckinNote(e.target.value)}
                  className="w-full min-w-0 px-3 py-2 border rounded-lg text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-200 resize-none"
                  rows="2"
                  placeholder="Ghi chú về ca làm việc..."
                />
              </div>
              </div>
            </div>
            <div className="flex flex-row gap-2 px-4 sm:px-5 pb-4 pt-2 border-t border-gray-200 flex-shrink-0">
              <button
                onClick={handleCheckIn}
                className="flex-1 min-w-0 bg-gradient-to-r from-green-500 to-green-600 text-white py-2.5 rounded-lg hover:from-green-600 hover:to-green-700 active:from-green-700 active:to-green-800 font-medium text-sm shadow-md transition-all touch-manipulation"
              >
                ✓ Xác nhận
              </button>
              <button
                onClick={() => {
                  setShowCheckinModal(false);
                  setSelectedEmployee('');
                  setCheckinNote('');
                }}
                className="flex-1 min-w-0 bg-gray-200 text-gray-800 py-2.5 rounded-lg hover:bg-gray-300 active:bg-gray-400 font-medium text-sm transition-all touch-manipulation"
              >
                Hủy
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Timesheets;

