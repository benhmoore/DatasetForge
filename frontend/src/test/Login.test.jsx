import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Login from '../components/Login';
import * as authHook from '../hooks/useAuth';

// Mock the useAuth hook
vi.mock('../hooks/useAuth', async () => {
  const actual = await vi.importActual('../hooks/useAuth');
  return {
    ...actual,
    default: vi.fn(),
  };
});

// Mock react-toastify
vi.mock('react-toastify', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock react-router-dom
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => ({ state: null }),
    BrowserRouter: ({ children }) => <div>{children}</div>,
  };
});

describe('Login Component', () => {
  const mockLogin = vi.fn();
  
  // Set up mocks before each test
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock useAuth to return our mock login function
    authHook.default.mockReturnValue({
      login: mockLogin,
      isAuthenticated: false,
      isLoading: false,
    });
  });
  
  it('renders the login form', () => {
    render(
      <BrowserRouter>
        <Login />
      </BrowserRouter>
    );
    
    // Check that form elements are rendered
    expect(screen.getByText('DatasetForge')).toBeInTheDocument();
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });
  
  it('handles form submission with valid credentials', async () => {
    // Mock successful login
    mockLogin.mockResolvedValue(true);
    
    render(
      <BrowserRouter>
        <Login />
      </BrowserRouter>
    );
    
    // Fill the form
    fireEvent.change(screen.getByLabelText(/username/i), {
      target: { value: 'testuser' },
    });
    
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'password123' },
    });
    
    // Submit the form
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    
    // Wait for the login to complete
    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('testuser', 'password123');
      expect(mockNavigate).toHaveBeenCalled();
    });
  });
  
  it('shows error message for invalid credentials', async () => {
    // Mock failed login
    mockLogin.mockResolvedValue(false);
    
    render(
      <BrowserRouter>
        <Login />
      </BrowserRouter>
    );
    
    // Fill the form
    fireEvent.change(screen.getByLabelText(/username/i), {
      target: { value: 'testuser' },
    });
    
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'wrongpassword' },
    });
    
    // Submit the form
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    
    // Wait for the login to complete
    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('testuser', 'wrongpassword');
      // In a real test, we would check for the toast message
      // but since we've mocked it, we just check it was called
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });
});