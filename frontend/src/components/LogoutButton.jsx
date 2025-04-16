import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import useAuth from '../hooks/useAuth';

const LogoutButton = () => {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await logout();
      toast.success('Logged out successfully');
      navigate('/login');
    } catch (error) {
      console.error('Error during logout:', error);
      // Even if the API call fails, we'll still clear session storage
      sessionStorage.removeItem('auth');
      sessionStorage.removeItem('loginAt');
      navigate('/login');
    }
  };

  return (
    <button
      onClick={handleLogout}
      className="text-gray-500 hover:text-gray-700 px-3 py-2 flex items-center space-x-1"
      title="Logout"
    >
      <span>👤</span>
      <span>Logout</span>
    </button>
  );
};

export default LogoutButton;