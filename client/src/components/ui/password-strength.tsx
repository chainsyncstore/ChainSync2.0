import React from 'react';
import { zxcvbn } from 'zxcvbn';
import { cn } from '@/lib/utils';

interface PasswordStrengthProps {
  password: string;
  className?: string;
}

export function PasswordStrength({ password, className }: PasswordStrengthProps) {
  if (!password) return null;

  const result = zxcvbn(password);
  const { score, feedback } = result;

  const getStrengthColor = (score: number) => {
    switch (score) {
      case 0:
      case 1:
        return 'bg-red-500';
      case 2:
        return 'bg-orange-500';
      case 3:
        return 'bg-yellow-500';
      case 4:
        return 'bg-green-500';
      default:
        return 'bg-gray-200';
    }
  };

  const getStrengthText = (score: number) => {
    switch (score) {
      case 0:
      case 1:
        return 'Very Weak';
      case 2:
        return 'Weak';
      case 3:
        return 'Fair';
      case 4:
        return 'Strong';
      default:
        return 'Very Weak';
    }
  };

  const getStrengthWidth = (score: number) => {
    return `${(score + 1) * 25}%`;
  };

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-600">Password Strength:</span>
        <span className={cn(
          'font-medium',
          score <= 1 ? 'text-red-600' : '',
          score === 2 ? 'text-orange-600' : '',
          score === 3 ? 'text-yellow-600' : '',
          score === 4 ? 'text-green-600' : ''
        )}>
          {getStrengthText(score)}
        </span>
      </div>
      
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className={cn(
            'h-2 rounded-full transition-all duration-300',
            getStrengthColor(score)
          )}
          style={{ width: getStrengthWidth(score) }}
        />
      </div>
      
      {feedback.warning && (
        <p className="text-sm text-amber-600 bg-amber-50 p-2 rounded">
          ⚠️ {feedback.warning}
        </p>
      )}
      
      {feedback.suggestions.length > 0 && (
        <div className="text-sm text-gray-600 space-y-1">
          <p className="font-medium">Suggestions:</p>
          <ul className="list-disc list-inside space-y-1">
            {feedback.suggestions.map((suggestion, index) => (
              <li key={index}>{suggestion}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
