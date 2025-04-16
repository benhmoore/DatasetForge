import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import useAuth from '../hooks/useAuth';
import api from '../api/apiClient';

// Mock the API client
vi.mock('../api/apiClient', () => ({
  default: {
    login: vi.fn(),
    logout: vi.fn(),
  },
}));

// Mock sessionStorage
const mockSessionStorage = (() => {
  let store = {};
  return {
    getItem: vi.fn((key) => store[key] || null),
    setItem: vi.fn((key, value) => {
      store[key] = value.toString();
    }),
    removeItem: vi.fn((key) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(window, 'sessionStorage', {
  value: mockSessionStorage,
});

// Create a wrapper for useAuth hook since it uses React Router hooks
const wrapper = ({ children }) => <BrowserRouter>{children}</BrowserRouter>;

describe('useAuth Hook', () => {
  beforeEach(() => {
    // Clear all mocks and sessionStorage before each test
    vi.clearAllMocks();
    mockSessionStorage.clear();
  });
  
  afterEach(() => {
    vi.resetAllMocks();
  });
  
  it('returns not authenticated when no auth in sessionStorage', () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.isLoading).toBe(false);
  });
  
  it('returns authenticated when auth exists in sessionStorage', () => {
    // Set up sessionStorage with auth data
    mockSessionStorage.setItem('auth', 'fake-auth-token');
    mockSessionStorage.setItem('loginAt', Date.now().toString());
    
    const { result } = renderHook(() => useAuth(), { wrapper });
    
    expect(result.current.isAuthenticated).toBe(true);
  });
  
  it('handles login correctly', async () => {
    // Mock API login to return success
    api.login.mockResolvedValue(true);
    
    const { result } = renderHook(() => useAuth(), { wrapper });
    
    // Call the login function
    let success;
    await act(async () => {
      success = await result.current.login('testuser', 'password123');
    });
    
    // Check results
    expect(success).toBe(true);
    expect(api.login).toHaveBeenCalledWith('testuser', 'password123');
    expect(result.current.isAuthenticated).toBe(true);
  });
  
  it('handles logout correctly', async () => {
    // Set up initial authenticated state
    mockSessionStorage.setItem('auth', 'fake-auth-token');
    mockSessionStorage.setItem('loginAt', Date.now().toString());
    
    const { result } = renderHook(() => useAuth(), { wrapper });
    
    // Verify initial authenticated state
    expect(result.current.isAuthenticated).toBe(true);
    
    // Call the logout function
    await act(async () => {
      await result.current.logout();
    });
    
    // Check results
    expect(api.logout).toHaveBeenCalled();
    expect(mockSessionStorage.removeItem).toHaveBeenCalledWith('auth');
    expect(mockSessionStorage.removeItem).toHaveBeenCalledWith('loginAt');
    expect(result.current.isAuthenticated).toBe(false);
  });
  
  it('detects expired sessions', () => {
    // Set up expired session (more than 30 minutes old)
    const thirtyMinutesInMs = 30 * 60 * 1000;
    const expiredTime = Date.now() - thirtyMinutesInMs - 1000; // Add 1 second to ensure it's expired
    
    mockSessionStorage.setItem('auth', 'fake-auth-token');
    mockSessionStorage.setItem('loginAt', expiredTime.toString());
    
    const { result } = renderHook(() => useAuth(), { wrapper });
    
    // Should detect expired session and be not authenticated
    expect(result.current.isAuthenticated).toBe(false);
    expect(mockSessionStorage.getItem('auth')).toBe(null);
  });
});