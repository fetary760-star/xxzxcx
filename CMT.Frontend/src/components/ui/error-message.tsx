import { AlertCircle } from 'lucide-react';

interface ErrorMessageProps {
  title?: string;
  message: string;
  className?: string;
}

export function ErrorMessage({ 
  title = 'Error', 
  message, 
  className = '' 
}: ErrorMessageProps) {
  return (
    <div className={`p-4 bg-red-50 border border-red-200 rounded-lg ${className}`}>
      <div className="flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
        <div>
          <h4 className="text-sm font-semibold text-red-900 mb-1">{title}</h4>
          <p className="text-sm text-red-700">{message}</p>
        </div>
      </div>
    </div>
  );
}