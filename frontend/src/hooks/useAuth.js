import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/apiClient';

const useAuth = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  // Check if user is authenticated
  useEffect(() => {
    const checkAuth = () => {
      const auth = sessionStorage.getItem('auth');
      const loginAt = sessionStorage.getItem('loginAt');
      
      if (!auth || !loginAt) {
        setIsAuthenticated(false);
        setIsLoading(false);
        return;
      }
      
      // Check session expiry (30 minutes)
      const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes in milliseconds
      const loginTime = parseInt(loginAt, 10);
      const now = Date.now();
      
      if (now - loginTime > SESSION_TIMEOUT) {
        // Session expired
        sessionStorage.removeItem('auth');
        sessionStorage.removeItem('loginAt');
        setIsAuthenticated(false);
        setIsLoading(false);
        return;
      }
      
      // Update login time on activity
      sessionStorage.setItem('loginAt', now.toString());
      setIsAuthenticated(true);
      setIsLoading(false);
    };
    
    checkAuth();
    
    // Add event listeners to update session time on activity
    const handleActivity = () => {
      const auth = sessionStorage.getItem('auth');
      if (auth) {
        sessionStorage.setItem('loginAt', Date.now().toString());
      }
    };
    
    window.addEventListener('click', handleActivity);
    window.addEventListener('keypress', handleActivity);
    
    return () => {
      window.removeEventListener('click', handleActivity);
      window.removeEventListener('keypress', handleActivity);
    };
  }, []);

  // Login function
  const login = async (username, password) => {
    try {
      await api.login(username, password);
      setIsAuthenticated(true);
      return true;
    } catch (error) {
      console.error('Login failed:', error);
      return false;
    }
  };

  // Logout function
  const logout = async () => {
    try {
      await api.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      sessionStorage.removeItem('auth');
      sessionStorage.removeItem('loginAt');
      setIsAuthenticated(false);
      navigate('/login');
    }
  };

  return {
    isAuthenticated,
    isLoading,
    login,
    logout
  };
};

export default useAuth;