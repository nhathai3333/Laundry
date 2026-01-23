/**
 * Component hiển thị yêu cầu mật khẩu
 */
export default function PasswordRequirements({ password = '', showOnly = false }) {
  const requirements = [
    { 
      text: 'Ít nhất 8 ký tự', 
      met: password.length >= 8 
    },
    { 
      text: 'Có chữ hoa (A-Z)', 
      met: /[A-Z]/.test(password) 
    },
    { 
      text: 'Có chữ thường (a-z)', 
      met: /[a-z]/.test(password) 
    },
    { 
      text: 'Có số (0-9)', 
      met: /[0-9]/.test(password) 
    },
    { 
      text: 'Có ký tự đặc biệt (!@#$%^&*...)', 
      met: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password) 
    },
  ];

  if (showOnly) {
    return (
      <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-xs sm:text-sm font-medium text-blue-900 mb-2">
          Yêu cầu mật khẩu:
        </p>
        <ul className="text-xs text-blue-800 space-y-1 list-disc list-inside">
          {requirements.map((req, index) => (
            <li key={index}>{req.text}</li>
          ))}
          <li className="text-blue-700">Không chứa thông tin cá nhân (tên, số điện thoại)</li>
          <li className="text-blue-700">Không dùng mật khẩu phổ biến</li>
        </ul>
      </div>
    );
  }

  return (
    <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
      <p className="text-xs sm:text-sm font-medium text-blue-900 mb-2">
        Yêu cầu mật khẩu:
      </p>
      <ul className="text-xs text-blue-800 space-y-1">
        {requirements.map((req, index) => (
          <li key={index} className="flex items-center gap-2">
            <span className={req.met ? 'text-green-600' : 'text-gray-400'}>
              {req.met ? '✓' : '○'}
            </span>
            <span className={req.met ? 'text-green-700 font-medium' : 'text-blue-700'}>
              {req.text}
            </span>
          </li>
        ))}
        <li className="flex items-center gap-2 text-blue-700">
          <span>○</span>
          <span>Không chứa thông tin cá nhân (tên, số điện thoại)</span>
        </li>
        <li className="flex items-center gap-2 text-blue-700">
          <span>○</span>
          <span>Không dùng mật khẩu phổ biến</span>
        </li>
      </ul>
    </div>
  );
}
