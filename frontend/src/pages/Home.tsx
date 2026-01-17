// Landing page with upload

import { useNavigate, Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { UploadZone } from '../components/UploadZone';
import { BarChart3, Target, Download, Zap, Settings, Database, ArrowRight, ExternalLink, CheckCircle, Tag, Play } from 'lucide-react';
import { ThemeToggle } from '../components/ThemeToggle';
import axios from 'axios';

interface ExampleProject {
  id: string;
  dataset_name: string | null;
  description: string | null;
  n_episodes: number;
  embedding_dim: number;
  has_success_labels: boolean;
  has_task_labels: boolean;
  has_thumbnails: boolean;
  has_gifs: boolean;
}

// Loading skeleton for example cards
function ExampleCardSkeleton() {
  return (
    <div className="flex-shrink-0 w-72 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden animate-pulse">
      <div className="w-full h-36 bg-gray-200 dark:bg-gray-700" />
      <div className="p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gray-200 dark:bg-gray-700 rounded-lg" />
          <div className="flex-1">
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2" />
            <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
          </div>
        </div>
      </div>
    </div>
  );
}

function ExampleCard({ example }: { example: ExampleProject }) {
  const [isHovered, setIsHovered] = useState(false);

  // Determine which preview to show
  const hasPreview = example.has_gifs || example.has_thumbnails;
  const staticSrc = example.has_gifs
    ? `/api/project/${example.id}/gif/0/frame`  // First frame of GIF
    : example.has_thumbnails
      ? `/api/project/${example.id}/thumbnail/0`
      : null;
  const animatedSrc = example.has_gifs
    ? `/api/project/${example.id}/gif/0`
    : null;

  // Build feature badges
  const badges = [];
  if (example.has_success_labels) badges.push({ icon: CheckCircle, label: 'Success labels', color: 'text-green-500' });
  if (example.has_task_labels) badges.push({ icon: Tag, label: 'Task labels', color: 'text-blue-500' });
  if (example.has_gifs) badges.push({ icon: Play, label: 'Video previews', color: 'text-purple-500' });

  return (
    <Link
      to={`/project/${example.id}`}
      className="group flex-shrink-0 w-72 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 hover:border-primary-500 dark:hover:border-primary-500 hover:shadow-lg transition-all snap-start overflow-hidden relative"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Preview Image */}
      {hasPreview && (
        <div className="w-full h-36 bg-gray-100 dark:bg-gray-700 relative overflow-hidden">
          {staticSrc && (
            <img
              src={isHovered && animatedSrc ? animatedSrc : staticSrc}
              alt={`Preview of ${example.dataset_name || 'dataset'}`}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          )}
          {/* Play indicator when GIF available */}
          {example.has_gifs && !isHovered && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
              <div className="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center">
                <div className="w-0 h-0 border-t-[6px] border-t-transparent border-l-[10px] border-l-gray-800 border-b-[6px] border-b-transparent ml-1" />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Card Content */}
      <div className="p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-primary-500 to-primary-600 rounded-lg flex items-center justify-center shadow-sm flex-shrink-0">
            <Database className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900 dark:text-white truncate">
              {example.dataset_name || `Dataset ${example.id}`}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {example.n_episodes.toLocaleString()} episodes · {example.embedding_dim}D
            </p>
          </div>
          <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-primary-600 group-hover:translate-x-1 transition-all flex-shrink-0" />
        </div>
      </div>

      {/* Feature badges overlay on image */}
      {hasPreview && badges.length > 0 && (
        <div className="absolute top-2 left-2 flex flex-wrap gap-1 z-10">
          {badges.map((badge, i) => (
            <div
              key={i}
              className="flex items-center gap-1 px-1.5 py-0.5 bg-black/70 text-white text-xs rounded"
            >
              <badge.icon className={`w-3 h-3 ${badge.color}`} />
              <span className="hidden group-hover:inline">{badge.label}</span>
            </div>
          ))}
        </div>
      )}
    </Link>
  );
}

export function Home() {
  const navigate = useNavigate();
  const [examples, setExamples] = useState<ExampleProject[]>([]);
  const [loadingExamples, setLoadingExamples] = useState(true);

  useEffect(() => {
    // Track page visit
    axios.post('/api/track').catch(() => {});

    // Load examples
    axios.get('/api/project/examples/list')
      .then(res => setExamples(res.data))
      .catch(() => setExamples([]))
      .finally(() => setLoadingExamples(false));
  }, []);

  const handleUploadSuccess = (projectId: string) => {
    navigate(`/project/${projectId}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white dark:from-gray-950 dark:to-gray-900">
      {/* Header */}
      <header className="border-b border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm sticky top-0 z-10">
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
          </div>
        </div>
      </header>

      {/* Hero section */}
      <main className="max-w-6xl mx-auto px-4 py-10 md:py-12">
        {/* Hero */}
        <div className="text-center mb-10">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-3">
            Dataset Diversity Analysis
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            Visualize episode embeddings and select maximally diverse training subsets.
            <span className="text-primary-600 font-medium"> Train on 10K diverse episodes instead of 50K random ones.</span>
          </p>
        </div>

        {/* Upload zone */}
        <div className="mb-10">
          <UploadZone onUploadSuccess={handleUploadSuccess} />
        </div>

        {/* Example Projects - Horizontal Carousel */}
        {(loadingExamples || examples.length > 0) && (
          <div className="mb-12">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Or explore example datasets
              </p>
              <span className="text-xs text-gray-400 hidden sm:block">Scroll →</span>
            </div>
            <div className="relative -mx-4 px-4">
              <div className="flex gap-4 overflow-x-auto pb-3 snap-x snap-mandatory scrollbar-thin">
                {loadingExamples ? (
                  // Loading skeletons
                  <>
                    <ExampleCardSkeleton />
                    <ExampleCardSkeleton />
                    <ExampleCardSkeleton />
                  </>
                ) : (
                  examples.map((example) => (
                    <ExampleCard key={example.id} example={example} />
                  ))
                )}
              </div>
              {/* Fade edges */}
              <div className="absolute left-0 top-0 bottom-3 w-4 bg-gradient-to-r from-gray-50 dark:from-gray-900 to-transparent pointer-events-none" />
              <div className="absolute right-0 top-0 bottom-3 w-8 bg-gradient-to-l from-gray-50 dark:from-gray-900 to-transparent pointer-events-none" />
            </div>
          </div>
        )}

        {/* Features */}
        <div className="grid md:grid-cols-3 gap-5 mb-10">
          <div className="flex items-start gap-4 p-4 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div className="w-11 h-11 bg-primary-100 dark:bg-primary-900/50 rounded-xl flex items-center justify-center flex-shrink-0">
              <BarChart3 className="w-6 h-6 text-primary-600 dark:text-primary-400" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white mb-1">Visualize Embeddings</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Interactive UMAP scatter plots with filtering
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4 p-4 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div className="w-11 h-11 bg-green-100 dark:bg-green-900/50 rounded-xl flex items-center justify-center flex-shrink-0">
              <Target className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white mb-1">Intelligent Sampling</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                K-means diversity sampling for max coverage
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4 p-4 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div className="w-11 h-11 bg-purple-100 dark:bg-purple-900/50 rounded-xl flex items-center justify-center flex-shrink-0">
              <Download className="w-6 h-6 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white mb-1">Export & Integrate</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                JSON, CSV & Python code snippets
              </p>
            </div>
          </div>
        </div>

        {/* How it works */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 mb-8">
          <div className="flex items-center justify-between gap-6">
            <div className="flex items-center gap-3 flex-1">
              <div className="w-8 h-8 bg-primary-600 text-white rounded-full flex items-center justify-center font-bold flex-shrink-0">1</div>
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Generate</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">CLIP/R3M on your GPU</p>
              </div>
            </div>
            <div className="text-gray-300 dark:text-gray-600 text-lg">→</div>
            <div className="flex items-center gap-3 flex-1">
              <div className="w-8 h-8 bg-primary-600 text-white rounded-full flex items-center justify-center font-bold flex-shrink-0">2</div>
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Upload</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Drop your .h5 file</p>
              </div>
            </div>
            <div className="text-gray-300 dark:text-gray-600 text-lg">→</div>
            <div className="flex items-center gap-3 flex-1">
              <div className="w-8 h-8 bg-primary-600 text-white rounded-full flex items-center justify-center font-bold flex-shrink-0">3</div>
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Explore</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Visualize & sample</p>
              </div>
            </div>
            <div className="text-gray-300 dark:text-gray-600 text-lg">→</div>
            <div className="flex items-center gap-3 flex-1">
              <div className="w-8 h-8 bg-primary-600 text-white rounded-full flex items-center justify-center font-bold flex-shrink-0">4</div>
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Train</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Better models</p>
              </div>
            </div>
          </div>
        </div>

        {/* BYOE note */}
        <div className="text-center space-y-3">
          <span className="inline-flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <Zap className="w-4 h-4 text-yellow-500" />
            <strong>Bring Your Own Embeddings</strong> — Generate on your infrastructure, visualize here
          </span>
          <div>
            <a
              href="https://colab.research.google.com/drive/1pVsTizT8Ec1iST0tyNDzhgh4h6YUtZUh"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium"
            >
              <img src="https://colab.research.google.com/assets/colab-badge.svg" alt="Open In Colab" className="h-5" />
              Generate embeddings from LeRobot datasets
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 mt-10">
        <div className="max-w-6xl mx-auto px-4 py-4 text-center text-gray-500 dark:text-gray-400 text-xs">
          Projects auto-delete after 7 days · No account required · View-only sharing
        </div>
      </footer>
    </div>
  );
}
