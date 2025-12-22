// Project metadata display component

import { Calendar, Clock, Database, Layers } from 'lucide-react';
import type { Project } from '../types';

interface ProjectInfoProps {
  project: Project;
}

export function ProjectInfo({ project }: ProjectInfoProps) {
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getExpiryStatus = () => {
    const now = new Date();
    const expires = new Date(project.expires_at);
    const diffDays = Math.ceil((expires.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays <= 0) {
      return { text: 'Expired', color: 'text-red-600' };
    } else if (diffDays <= 2) {
      return { text: `Expires in ${diffDays} day${diffDays > 1 ? 's' : ''}`, color: 'text-yellow-600' };
    } else {
      return { text: `Expires in ${diffDays} days`, color: 'text-gray-600' };
    }
  };

  const expiry = getExpiryStatus();

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Project Info</h3>
        <span className="text-xs font-mono bg-gray-100 px-2 py-1 rounded">
          {project.id}
        </span>
      </div>

      <div className="space-y-3">
        {/* Episodes count */}
        <div className="flex items-center gap-3">
          <Database className="w-5 h-5 text-gray-400" />
          <div>
            <p className="text-sm text-gray-600">Episodes</p>
            <p className="font-medium">{project.n_episodes.toLocaleString()}</p>
          </div>
        </div>

        {/* Embedding dimension */}
        <div className="flex items-center gap-3">
          <Layers className="w-5 h-5 text-gray-400" />
          <div>
            <p className="text-sm text-gray-600">Embedding Dimension</p>
            <p className="font-medium">{project.embedding_dim}</p>
          </div>
        </div>

        {/* Created date */}
        <div className="flex items-center gap-3">
          <Calendar className="w-5 h-5 text-gray-400" />
          <div>
            <p className="text-sm text-gray-600">Created</p>
            <p className="font-medium">{formatDate(project.created_at)}</p>
          </div>
        </div>

        {/* Expiry */}
        <div className="flex items-center gap-3">
          <Clock className="w-5 h-5 text-gray-400" />
          <div>
            <p className="text-sm text-gray-600">Retention</p>
            <p className={`font-medium ${expiry.color}`}>{expiry.text}</p>
          </div>
        </div>

        {/* Available metadata */}
        <div className="border-t pt-3 mt-3">
          <p className="text-sm text-gray-600 mb-2">Available Metadata</p>
          <div className="flex flex-wrap gap-2">
            {project.has_success_labels && (
              <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                success
              </span>
            )}
            {project.has_task_labels && (
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                task
              </span>
            )}
            {project.has_episode_length && (
              <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded">
                episode_length
              </span>
            )}
            {!project.has_success_labels && !project.has_task_labels && !project.has_episode_length && (
              <span className="text-xs text-gray-500">No metadata available</span>
            )}
          </div>
        </div>

        {/* Dataset name if available */}
        {project.dataset_name && (
          <div className="border-t pt-3 mt-3">
            <p className="text-sm text-gray-600">Dataset</p>
            <p className="font-medium">{project.dataset_name}</p>
          </div>
        )}

        {/* Description if available */}
        {project.description && (
          <div className="border-t pt-3 mt-3">
            <p className="text-sm text-gray-600">Description</p>
            <p className="text-sm">{project.description}</p>
          </div>
        )}
      </div>
    </div>
  );
}
