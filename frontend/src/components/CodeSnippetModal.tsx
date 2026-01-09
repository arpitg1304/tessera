// Code snippet display modal component

import { X, Copy, Check } from 'lucide-react';
import { useState } from 'react';

// Simple Python syntax highlighting helper
function formatPythonCode(code: string) {
  const lines = code.split('\n');
  return lines.map((line, idx) => {
    // Detect comments
    if (line.trim().startsWith('#')) {
      return (
        <span key={idx}>
          <span style={{ color: '#6B7280' }}>{line}</span>
          {idx < lines.length - 1 && '\n'}
        </span>
      );
    }

    // Highlight keywords, strings, and variables
    let formattedLine = line;

    // Keywords (from, import, if, for, in, etc.)
    const keywords = ['from', 'import', 'if', 'for', 'in', 'def', 'class', 'return', 'with', 'as'];
    keywords.forEach(keyword => {
      const regex = new RegExp(`\\b(${keyword})\\b`, 'g');
      formattedLine = formattedLine.replace(regex, `<span style="color: #C084FC">$1</span>`);
    });

    // Strings (single and double quotes)
    formattedLine = formattedLine.replace(
      /"([^"]*)"/g,
      '<span style="color: #34D399">"$1"</span>'
    );
    formattedLine = formattedLine.replace(
      /'([^']*)'/g,
      "<span style=\"color: #34D399\">'$1'</span>"
    );

    // Numbers
    formattedLine = formattedLine.replace(
      /\b(\d+)\b/g,
      '<span style="color: #F472B6">$1</span>'
    );

    return (
      <span key={idx} dangerouslySetInnerHTML={{ __html: formattedLine + (idx < lines.length - 1 ? '\n' : '') }} />
    );
  });
}

interface CodeSnippetModalProps {
  isOpen: boolean;
  onClose: () => void;
  code: string;
  episodeCount: number;
}

export function CodeSnippetModal({ isOpen, onClose, code, episodeCount }: CodeSnippetModalProps) {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white dark:bg-gray-900 rounded-xl shadow-xl max-w-3xl w-full mx-4 p-6 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Export Successful
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {episodeCount.toLocaleString()} episodes exported
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Code snippet section */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-200">Python Code Snippet</h3>
            <button
              onClick={handleCopy}
              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg transition-colors"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-green-600" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  Copy Code
                </>
              )}
            </button>
          </div>

          {/* Code display with syntax highlighting */}
          <div className="flex-1 overflow-auto bg-gray-900 rounded-lg p-4 border border-gray-700">
            <pre className="text-sm font-mono leading-relaxed">
              <code className="text-gray-100" style={{
                display: 'block',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word'
              }}>
                {formatPythonCode(code)}
              </code>
            </pre>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
            Use this code snippet to load the selected episodes in your training pipeline.
          </p>
          <button
            onClick={onClose}
            className="w-full bg-primary-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-primary-700 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
