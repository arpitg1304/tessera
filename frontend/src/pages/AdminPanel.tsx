// Admin panel for system monitoring and management

import { useState } from 'react';
import axios from 'axios';
import { Trash2, RefreshCw, Database, HardDrive, Users, Activity, AlertCircle } from 'lucide-react';
import { ThemeToggle } from '../components/ThemeToggle';

const API_BASE = '/api';

interface ProjectInfo {
  id: string;
  dataset_name: string | null;
  description: string | null;
  n_episodes: number;
  embedding_dim: number;
  created_at: string;
  expires_at: string;
  storage_mb: number;
  has_success_labels: boolean;
  has_task_labels: boolean;
  has_episode_length: boolean;
}

interface RateLimitInfo {
  ip_address: string;
  upload_count: number;
  last_upload: string;
}

interface SystemStats {
  total_projects: number;
  total_storage_gb: number;
  storage_used_gb: number;
  storage_available_gb: number;
  storage_usage_percent: number;
  total_episodes: number;
  active_ips: number;
}

interface AdminDashboard {
  system_stats: SystemStats;
  projects: ProjectInfo[];
  rate_limits: RateLimitInfo[];
}

interface SystemConfig {
  max_file_size_mb: number;
  max_episodes: number;
  max_embedding_dim: number;
  project_retention_days: number;
  storage_path: string;
  database_path: string;
  uploads_per_day_limit: number;
}

export default function AdminPanel() {
  const [dashboard, setDashboard] = useState<AdminDashboard | null>(null);
  const [config, setConfig] = useState<SystemConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authHeader, setAuthHeader] = useState<string>('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');

  const createAuthHeader = (user: string, pass: string) => {
    return 'Basic ' + btoa(`${user}:${pass}`);
  };

  const fetchData = async (auth: string) => {
    try {
      setLoading(true);
      setError(null);

      const headers = { Authorization: auth };

      const [dashboardRes, configRes] = await Promise.all([
        axios.get<AdminDashboard>(`${API_BASE}/admin/dashboard`, { headers }),
        axios.get<SystemConfig>(`${API_BASE}/admin/config`, { headers }),
      ]);

      setDashboard(dashboardRes.data);
      setConfig(configRes.data);
      setIsAuthenticated(true);
    } catch (err: any) {
      if (err.response?.status === 401) {
        setError('Invalid credentials. Please try again.');
        setIsAuthenticated(false);
      } else {
        setError(err.response?.data?.detail || 'Failed to load admin data');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const auth = createAuthHeader(username, password);
    setAuthHeader(auth);
    fetchData(auth);
  };

  const handleRefresh = () => {
    if (authHeader) {
      fetchData(authHeader);
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    if (!confirm(`Are you sure you want to delete project ${projectId}?`)) {
      return;
    }

    try {
      await axios.delete(`${API_BASE}/admin/projects/${projectId}`, {
        headers: { Authorization: authHeader },
      });
      handleRefresh();
    } catch (err: any) {
      alert(`Failed to delete project: ${err.response?.data?.detail || err.message}`);
    }
  };

  const handleCleanup = async () => {
    if (!confirm('Clean up all expired projects?')) {
      return;
    }

    try {
      const res = await axios.post(
        `${API_BASE}/admin/cleanup`,
        {},
        { headers: { Authorization: authHeader } }
      );
      alert(`Cleaned up ${res.data.projects_cleaned} expired projects`);
      handleRefresh();
    } catch (err: any) {
      alert(`Failed to cleanup: ${err.response?.data?.detail || err.message}`);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  const formatBytes = (mb: number) => {
    if (mb < 1) return `${(mb * 1024).toFixed(1)} KB`;
    if (mb < 1024) return `${mb.toFixed(1)} MB`;
    return `${(mb / 1024).toFixed(2)} GB`;
  };

  // Login screen
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-800 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-900 rounded-lg shadow-lg p-8 w-full max-w-md">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Activity className="w-8 h-8 text-blue-600" />
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Admin Panel</h1>
            </div>
            <ThemeToggle />
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {loading ? 'Logging in...' : 'Login'}
            </button>
          </form>

          <p className="mt-4 text-xs text-gray-500 dark:text-gray-400 text-center">
            Default: admin / admin123 (change in production!)
          </p>
        </div>
      </div>
    );
  }

  if (loading && !dashboard) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-800 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-2" />
          <p className="text-gray-600 dark:text-gray-300">Loading admin panel...</p>
        </div>
      </div>
    );
  }

  if (!dashboard || !config) {
    return null;
  }

  const stats = dashboard.system_stats;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-800 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <Activity className="w-8 h-8 text-blue-600" />
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Admin Panel</h1>
              <p className="text-sm text-gray-600 dark:text-gray-400">System monitoring and management</p>
            </div>
          </div>

          <div className="flex gap-2">
            <ThemeToggle />
            <button
              onClick={handleCleanup}
              className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Cleanup Expired
            </button>
            <button
              onClick={handleRefresh}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
          </div>
        </div>

        {/* System Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow p-6">
            <div className="flex items-center gap-3 mb-2">
              <Database className="w-5 h-5 text-blue-600" />
              <h3 className="text-sm font-medium text-gray-600 dark:text-gray-300">Projects</h3>
            </div>
            <p className="text-3xl font-bold text-gray-900 dark:text-white">{stats.total_projects}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{stats.total_episodes.toLocaleString()} total episodes</p>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-lg shadow p-6">
            <div className="flex items-center gap-3 mb-2">
              <HardDrive className="w-5 h-5 text-green-600" />
              <h3 className="text-sm font-medium text-gray-600 dark:text-gray-300">Storage</h3>
            </div>
            <p className="text-3xl font-bold text-gray-900 dark:text-white">{stats.storage_usage_percent.toFixed(1)}%</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {stats.storage_used_gb.toFixed(2)} / {stats.total_storage_gb.toFixed(2)} GB
            </p>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-lg shadow p-6">
            <div className="flex items-center gap-3 mb-2">
              <Users className="w-5 h-5 text-purple-600" />
              <h3 className="text-sm font-medium text-gray-600 dark:text-gray-300">Active IPs</h3>
            </div>
            <p className="text-3xl font-bold text-gray-900 dark:text-white">{stats.active_ips}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Last 24 hours</p>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-lg shadow p-6">
            <div className="flex items-center gap-3 mb-2">
              <Activity className="w-5 h-5 text-orange-600" />
              <h3 className="text-sm font-medium text-gray-600 dark:text-gray-300">Retention</h3>
            </div>
            <p className="text-3xl font-bold text-gray-900 dark:text-white">{config.project_retention_days}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">days</p>
          </div>
        </div>

        {/* Projects Table */}
        <div className="bg-white dark:bg-gray-900 rounded-lg shadow mb-8">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">All Projects</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">ID</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Episodes</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Dim</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Storage</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Created</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Expires</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {dashboard.projects.map((project) => (
                  <tr key={project.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-6 py-4 text-sm font-mono text-gray-900 dark:text-white">{project.id}</td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">
                      {project.dataset_name || <span className="text-gray-400 italic">Unnamed</span>}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">{project.n_episodes.toLocaleString()}</td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">{project.embedding_dim}</td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">{formatBytes(project.storage_mb)}</td>
                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{formatDate(project.created_at)}</td>
                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{formatDate(project.expires_at)}</td>
                    <td className="px-6 py-4 text-sm">
                      <button
                        onClick={() => handleDeleteProject(project.id)}
                        className="text-red-600 hover:text-red-800"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Rate Limits Table */}
        {dashboard.rate_limits.length > 0 && (
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Rate Limits (Last 24h)</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">IP Address</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Upload Count</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Last Upload</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {dashboard.rate_limits.map((limit) => (
                    <tr key={limit.ip_address} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="px-6 py-4 text-sm font-mono text-gray-900 dark:text-white">{limit.ip_address}</td>
                      <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">{limit.upload_count}</td>
                      <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{formatDate(limit.last_upload)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
