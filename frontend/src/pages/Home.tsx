// Landing page with upload

import { useNavigate, Link } from 'react-router-dom';
import { UploadZone } from '../components/UploadZone';
import { BarChart3, Target, Download, Zap, Settings } from 'lucide-react';
import { ThemeToggle } from '../components/ThemeToggle';

export function Home() {
  const navigate = useNavigate();

  const handleUploadSuccess = (projectId: string) => {
    navigate(`/project/${projectId}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold text-gray-900 dark:text-white">Tessera</span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link
              to="/admin"
              className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white flex items-center gap-1"
            >
              <Settings className="w-4 h-4" />
              Admin
            </Link>
            <a
              href="https://github.com/yourusername/tessera"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900"
            >
              Documentation
            </a>
          </div>
        </div>
      </header>

      {/* Hero section */}
      <main className="max-w-6xl mx-auto px-4 py-16">
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-4">
            Dataset Diversity Analysis
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto mb-2">
            Visualize episode embeddings and select maximally diverse training subsets.
          </p>
          <p className="text-lg text-primary-600 font-medium">
            Train on 10K diverse episodes instead of 50K random ones.
          </p>
        </div>

        {/* Upload zone */}
        <div className="mb-16">
          <UploadZone onUploadSuccess={handleUploadSuccess} />
        </div>

        {/* Features */}
        <div className="grid md:grid-cols-3 gap-8 mb-16">
          <div className="bg-white dark:bg-gray-900 rounded-xl p-6 shadow-sm border">
            <div className="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center mb-4">
              <BarChart3 className="w-6 h-6 text-primary-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Visualize Embeddings
            </h3>
            <p className="text-gray-600 dark:text-gray-300">
              Interactive 2D scatter plot of your episode embeddings using UMAP dimensionality reduction.
            </p>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-xl p-6 shadow-sm border">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4">
              <Target className="w-6 h-6 text-green-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Intelligent Sampling
            </h3>
            <p className="text-gray-600 dark:text-gray-300">
              K-means diversity sampling to select episodes that maximize coverage of your embedding space.
            </p>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-xl p-6 shadow-sm border">
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
              <Download className="w-6 h-6 text-purple-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Export & Integrate
            </h3>
            <p className="text-gray-600 dark:text-gray-300">
              Export selected episode IDs as JSON or CSV with Python code snippets for easy integration.
            </p>
          </div>
        </div>

        {/* How it works */}
        <div className="bg-white dark:bg-gray-900 rounded-xl p-8 shadow-sm border">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6 text-center">
            How It Works
          </h2>
          <div className="grid md:grid-cols-4 gap-6">
            <div className="text-center">
              <div className="w-10 h-10 bg-primary-600 text-white rounded-full flex items-center justify-center mx-auto mb-3 font-bold">
                1
              </div>
              <h4 className="font-medium text-gray-900 dark:text-white mb-1">Generate Embeddings</h4>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Use CLIP, R3M, or your own encoder on your GPU
              </p>
            </div>
            <div className="text-center">
              <div className="w-10 h-10 bg-primary-600 text-white rounded-full flex items-center justify-center mx-auto mb-3 font-bold">
                2
              </div>
              <h4 className="font-medium text-gray-900 dark:text-white mb-1">Upload to Tessera</h4>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Drag and drop your .h5 file
              </p>
            </div>
            <div className="text-center">
              <div className="w-10 h-10 bg-primary-600 text-white rounded-full flex items-center justify-center mx-auto mb-3 font-bold">
                3
              </div>
              <h4 className="font-medium text-gray-900 dark:text-white mb-1">Explore & Sample</h4>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Visualize and select diverse episodes
              </p>
            </div>
            <div className="text-center">
              <div className="w-10 h-10 bg-primary-600 text-white rounded-full flex items-center justify-center mx-auto mb-3 font-bold">
                4
              </div>
              <h4 className="font-medium text-gray-900 dark:text-white mb-1">Train Better</h4>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Use the diverse subset in your pipeline
              </p>
            </div>
          </div>
        </div>

        {/* BYOE note */}
        <div className="mt-8 text-center">
          <div className="inline-flex items-center gap-2 bg-yellow-50 text-yellow-800 px-4 py-2 rounded-lg text-sm">
            <Zap className="w-4 h-4" />
            <span>
              <strong>Bring Your Own Embeddings</strong> - Generate embeddings on your infrastructure, visualize on Tessera
            </span>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t bg-white dark:bg-gray-900 mt-16">
        <div className="max-w-6xl mx-auto px-4 py-8 text-center text-gray-600 dark:text-gray-400 text-sm">
          <p>Projects are automatically deleted after 7 days.</p>
          <p className="mt-1">
            No account required. View-only sharing with project links.
          </p>
        </div>
      </footer>
    </div>
  );
}
