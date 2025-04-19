import { useState, useEffect } from 'react'; // Import useEffect
import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'react-toastify';
import useAuth from '../hooks/useAuth';
import Icon from './Icons';
import api from '../api/apiClient'; // Import api client

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false); // Renamed state for clarity
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Check setup status on component mount
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const status = await api.getSetupStatus();
        setNeedsSetup(status.needs_setup);
        if (status.needs_setup) {
           console.log('Setup required: No users exist in the system.');
        }
      } catch (error) {
        console.error('Error checking setup status:', error);
        // Optionally handle error, e.g., show a generic error message
        // For now, assume setup is not needed if status check fails
        setNeedsSetup(false);
      }
    };
    checkStatus();
  }, []); // Empty dependency array ensures this runs only once on mount

  const handleSubmit = async (e) => {
    e.preventDefault();
    // No need to reset needsSetup here, it's determined on load

    if (!username || !password) {
      toast.error('Please enter both username and password');
      return;
    }

    // If setup is needed, prevent login attempt
    if (needsSetup) {
        toast.error('Cannot log in. System setup required. Please use the CLI.');
        return;
    }

    setIsLoading(true);

    try {
      const success = await login(username, password);

      if (success) {
        toast.success('Login successful');
        const from = location.state?.from?.pathname || '/';
        navigate(from);
      }
      // Removed the specific 'no_users_exist' check here, as it's handled by needsSetup state
      // The login function itself might still throw 401 for invalid credentials
    } catch (error) {
      if (error.response && error.response.status === 429) {
        toast.error('Too many login attempts. Please wait a minute.');
      } else if (error.response && error.response.status === 401) {
        // General invalid credentials message for 401 errors during login attempt
        toast.error('Invalid username or password.');
      } else {
        // Generic error for other issues
        toast.error('Login failed. Please check the console or try again later.');
      }
      console.error('Login error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow-md">
        <div>
          <h2 className="mt-6 text-center text-3xl font-bold text-gray-900">
            DatasetForge
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            {needsSetup ? 'System Setup Required' : 'Sign in to your account'}
          </p>
        </div>

        {/* Conditionally render the persistent setup message */}
        {needsSetup && (
          <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 mb-6" role="alert">
            <p className="font-bold">Setup Required</p>
            <p>No users exist in the system. Please use the command line tool to create the first user:</p>
            <code className="block bg-gray-200 text-sm p-2 my-2 rounded">python backend/app/cli.py create-user</code>
            <p>Refer to the <code className="text-sm">README.md</code> file for more details.</p>
          </div>
        )}

        {/* Disable form if setup is needed */}
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <fieldset disabled={needsSetup}> {/* Disable form fields if setup needed */}
            <div className="rounded-md shadow-sm -space-y-px">
              <div>
                <label htmlFor="username" className="sr-only">Username</label>
                <input
                  id="username"
                  name="username"
                  type="text"
                  autoComplete="username"
                  required
                  className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 focus:z-10 sm:text-sm disabled:bg-gray-100" // Added disabled style
                  placeholder="Username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={isLoading || needsSetup} // Disable if loading or setup needed
                />
              </div>
              <div>
                <label htmlFor="password" className="sr-only">Password</label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 focus:z-10 sm:text-sm disabled:bg-gray-100" // Added disabled style
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading || needsSetup} // Disable if loading or setup needed
                />
              </div>
            </div>

            <div className="flex items-center justify-between mt-4">
              <button
                type="submit"
                className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:bg-primary-300 disabled:cursor-not-allowed transition-all duration-200"
                disabled={isLoading || needsSetup} // Disable button if loading or setup needed
              >
                {isLoading ? (
                  <span className="flex items-center">
                    <Icon name="spinner" className="animate-spin -ml-1 mr-3 h-4 w-4 text-white" />
                    Signing in...
                  </span>
                ) : 'Sign in'}
              </button>
            </div>
          </fieldset>
        </form>
      </div>
    </div>
  );
};

export default Login;