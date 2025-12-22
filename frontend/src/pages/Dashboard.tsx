// Project visualization dashboard

import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Download, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { useProject, useVisualization, useVisualizationStatus, useTriggerUmap } from '../hooks/useProjectData';
import { ScatterPlot } from '../components/ScatterPlot';
import { ControlPanel } from '../components/ControlPanel';
import { SamplingPanel } from '../components/SamplingPanel';
import { ProjectInfo } from '../components/ProjectInfo';
import { ExportModal } from '../components/ExportModal';
import { useProjectStore } from '../stores/projectStore';

export function Dashboard() {
  const { projectId } = useParams<{ projectId: string }>();
  const [exportModalOpen, setExportModalOpen] = useState(false);

  const { data: project, isLoading: projectLoading, error: projectError } = useProject(projectId);
  const { data: vizData, isLoading: vizLoading, error: vizError } = useVisualization(projectId);
  const { data: vizStatus } = useVisualizationStatus(projectId);
  const triggerUmap = useTriggerUmap(projectId);

  const { selectedIndices } = useProjectStore();

  // Loading state
  if (projectLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading project...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (projectError) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Project Not Found</h2>
          <p className="text-gray-600 mb-4">
            {projectError instanceof Error ? projectError.message : 'This project may have expired or does not exist.'}
          </p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-primary-600 hover:text-primary-700"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  if (!project) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b bg-white sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              to="/"
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft className="w-5 h-5" />
              <span>Back</span>
            </Link>
            <div className="h-6 w-px bg-gray-300" />
            <div>
              <h1 className="font-semibold text-gray-900">
                Project: <span className="font-mono text-primary-600">{projectId}</span>
              </h1>
              <p className="text-sm text-gray-500">
                {project.n_episodes.toLocaleString()} episodes
              </p>
            </div>
          </div>
          <button
            onClick={() => setExportModalOpen(true)}
            disabled={selectedIndices.size === 0}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" />
            Export ({selectedIndices.size.toLocaleString()})
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar */}
          <div className="lg:col-span-1 space-y-6">
            <ProjectInfo project={project} />
            {vizData && <ControlPanel data={vizData} />}
          </div>

          {/* Main visualization area */}
          <div className="lg:col-span-2">
            {vizLoading ? (
              <div className="bg-white rounded-lg shadow p-8 flex flex-col items-center justify-center min-h-[500px]">
                <Loader2 className="w-12 h-12 animate-spin text-primary-600 mb-4" />
                <p className="text-gray-600 mb-2">Computing UMAP visualization...</p>
                <p className="text-sm text-gray-500">
                  This may take a minute for large datasets
                </p>
              </div>
            ) : vizError ? (
              <div className="bg-white rounded-lg shadow p-8 flex flex-col items-center justify-center min-h-[500px]">
                <AlertCircle className="w-12 h-12 text-yellow-500 mb-4" />
                <p className="text-gray-900 font-medium mb-2">Visualization not ready</p>
                <p className="text-gray-600 text-sm mb-4">
                  {vizStatus?.message || 'UMAP computation may still be in progress'}
                </p>
                <button
                  onClick={() => triggerUmap.mutate()}
                  disabled={triggerUmap.isPending}
                  className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                >
                  {triggerUmap.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                  {triggerUmap.isPending ? 'Starting...' : 'Compute Visualization'}
                </button>
              </div>
            ) : vizData ? (
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <ScatterPlot
                  data={vizData}
                  width={800}
                  height={600}
                />
              </div>
            ) : null}

            {/* Visualization tips */}
            {vizData && (
              <div className="mt-4 text-sm text-gray-500">
                <p>
                  <strong>Tips:</strong> Click on points to select/deselect. Use mouse wheel to zoom, drag to pan.
                  {!vizData.umap_cached && (
                    <span className="ml-2 text-green-600">
                      (UMAP freshly computed)
                    </span>
                  )}
                </p>
              </div>
            )}
          </div>

          {/* Sampling panel */}
          <div className="lg:col-span-1">
            {vizData && projectId && (
              <SamplingPanel projectId={projectId} data={vizData} />
            )}
          </div>
        </div>
      </main>

      {/* Export modal */}
      {projectId && (
        <ExportModal
          projectId={projectId}
          isOpen={exportModalOpen}
          onClose={() => setExportModalOpen(false)}
        />
      )}
    </div>
  );
}
