// Drag-and-drop upload component

import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileCheck, AlertCircle, Loader2 } from 'lucide-react';
import { useUpload } from '../hooks/useProjectData';
import { validateFile } from '../utils/api';
import type { ValidationResult } from '../types';

interface UploadZoneProps {
  onUploadSuccess: (projectId: string, editUrl: string) => void;
}

export function UploadZone({ onUploadSuccess }: UploadZoneProps) {
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const uploadMutation = useUpload();

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    setSelectedFile(file);
    setValidating(true);
    setValidationResult(null);

    try {
      const result = await validateFile(file);
      setValidationResult(result);
    } catch (error) {
      setValidationResult({
        valid: false,
        n_episodes: 0,
        embedding_dim: 0,
        has_success: false,
        has_task: false,
        has_episode_length: false,
        has_dataset: false,
        metadata_fields: [],
        errors: [error instanceof Error ? error.message : 'Validation failed'],
        warnings: [],
      });
    } finally {
      setValidating(false);
    }
  }, []);

  const handleUpload = async () => {
    if (!selectedFile) return;

    try {
      const result = await uploadMutation.mutateAsync(selectedFile);
      onUploadSuccess(result.project_id, result.edit_url);
    } catch {
      // Error is handled by the mutation
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/x-hdf5': ['.h5', '.hdf5'],
    },
    maxFiles: 1,
    maxSize: 100 * 1024 * 1024, // 100MB
  });

  const reset = () => {
    setSelectedFile(null);
    setValidationResult(null);
  };

  return (
    <div className="w-full max-w-xl mx-auto">
      {!selectedFile ? (
        <div
          {...getRootProps()}
          className={`
            border-2 border-dashed rounded-xl p-12 text-center cursor-pointer
            transition-all duration-200
            ${isDragActive
              ? 'border-primary-500 bg-primary-50'
              : 'border-gray-300 hover:border-primary-400 hover:bg-gray-50'
            }
          `}
        >
          <input {...getInputProps()} />
          <Upload className="w-12 h-12 mx-auto mb-4 text-gray-400" />
          {isDragActive ? (
            <p className="text-lg text-primary-600">Drop your embeddings file here</p>
          ) : (
            <>
              <p className="text-lg text-gray-600 mb-2">
                Drag and drop your <code className="bg-gray-100 px-1 rounded">.h5</code> file here
              </p>
              <p className="text-sm text-gray-400">or click to select a file</p>
            </>
          )}
        </div>
      ) : (
        <div className="border rounded-xl p-6 bg-white shadow-sm">
          {/* File info */}
          <div className="flex items-center gap-3 mb-4">
            <FileCheck className="w-8 h-8 text-primary-500" />
            <div>
              <p className="font-medium text-gray-900">{selectedFile.name}</p>
              <p className="text-sm text-gray-500">
                {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
              </p>
            </div>
          </div>

          {/* Validation status */}
          {validating && (
            <div className="flex items-center gap-2 text-gray-600 mb-4">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Validating file format...</span>
            </div>
          )}

          {validationResult && (
            <div className={`rounded-lg p-4 mb-4 ${
              validationResult.valid ? 'bg-green-50' : 'bg-red-50'
            }`}>
              {validationResult.valid ? (
                <div className="text-green-800">
                  <p className="font-medium mb-2">File is valid</p>
                  <ul className="text-sm space-y-1">
                    <li>Episodes: {validationResult.n_episodes.toLocaleString()}</li>
                    <li>Embedding dimension: {validationResult.embedding_dim}</li>
                    {validationResult.metadata_fields.length > 0 && (
                      <li>Metadata: {validationResult.metadata_fields.join(', ')}</li>
                    )}
                  </ul>
                </div>
              ) : (
                <div className="text-red-800">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle className="w-5 h-5" />
                    <p className="font-medium">Validation failed</p>
                  </div>
                  <ul className="text-sm space-y-1">
                    {validationResult.errors.map((error, i) => (
                      <li key={i}>{error}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Warnings */}
          {validationResult?.warnings && validationResult.warnings.length > 0 && (
            <div className="bg-yellow-50 rounded-lg p-4 mb-4">
              <p className="text-yellow-800 text-sm">
                Warnings: {validationResult.warnings.join(', ')}
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={reset}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Choose different file
            </button>
            <button
              onClick={handleUpload}
              disabled={!validationResult?.valid || uploadMutation.isPending}
              className={`
                flex-1 px-4 py-2 rounded-lg font-medium transition-colors
                ${validationResult?.valid
                  ? 'bg-primary-600 text-white hover:bg-primary-700'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }
              `}
            >
              {uploadMutation.isPending ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Uploading...
                </span>
              ) : (
                'Upload and Visualize'
              )}
            </button>
          </div>

          {/* Error message */}
          {uploadMutation.isError && (
            <div className="mt-4 p-3 bg-red-50 rounded-lg text-red-700 text-sm">
              {uploadMutation.error instanceof Error
                ? uploadMutation.error.message
                : 'Upload failed'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
