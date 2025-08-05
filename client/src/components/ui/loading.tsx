import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

// Standard loading spinner
export function LoadingSpinner({ 
  size = "default", 
  className 
}: { 
  size?: "sm" | "default" | "lg"; 
  className?: string;
}) {
  const sizeClasses = {
    sm: "w-4 h-4",
    default: "w-6 h-6",
    lg: "w-8 h-8"
  };

  return (
    <Loader2 
      className={cn(
        "animate-spin text-primary",
        sizeClasses[size],
        className
      )} 
    />
  );
}

// Page loading state
export function PageLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <LoadingSpinner size="lg" className="mx-auto mb-4" />
        <p className="text-slate-600">Loading...</p>
      </div>
    </div>
  );
}

// Card loading skeleton
export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6", className)}>
      <div className="animate-pulse space-y-4">
        <div className="h-6 bg-slate-200 rounded w-1/3"></div>
        <div className="space-y-2">
          <div className="h-4 bg-slate-200 rounded"></div>
          <div className="h-4 bg-slate-200 rounded w-2/3"></div>
          <div className="h-4 bg-slate-200 rounded w-1/2"></div>
        </div>
      </div>
    </div>
  );
}

// Table row skeleton
export function TableRowSkeleton({ columns = 4 }: { columns?: number }) {
  return (
    <div className="animate-pulse flex items-center space-x-4 p-4 border-b border-slate-100">
      {Array.from({ length: columns }).map((_, i) => (
        <div key={i} className="flex-1">
          <div className="h-4 bg-slate-200 rounded"></div>
        </div>
      ))}
    </div>
  );
}

// Product card skeleton
export function ProductCardSkeleton() {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 animate-pulse">
      <div className="space-y-3">
        <div className="w-12 h-12 bg-slate-200 rounded-lg mx-auto"></div>
        <div className="space-y-2">
          <div className="h-4 bg-slate-200 rounded"></div>
          <div className="h-3 bg-slate-200 rounded w-2/3"></div>
        </div>
        <div className="h-6 bg-slate-200 rounded w-1/2"></div>
      </div>
    </div>
  );
}

// Chart skeleton
export function ChartSkeleton({ height = "h-64" }: { height?: string }) {
  return (
    <div className={cn("bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6", height)}>
      <div className="animate-pulse space-y-4">
        <div className="h-6 bg-slate-200 rounded w-1/3"></div>
        <div className="flex items-end justify-between h-32 space-x-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <div 
              key={i} 
              className="flex-1 bg-slate-200 rounded-t"
              style={{ height: `${Math.random() * 60 + 20}%` }}
            ></div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Button loading state
export function ButtonLoading({ children, ...props }: React.ComponentProps<"button">) {
  return (
    <button 
      {...props} 
      disabled 
      className="inline-flex items-center justify-center"
    >
      <LoadingSpinner size="sm" className="mr-2" />
      {children}
    </button>
  );
}

// List skeleton
export function ListSkeleton({ items = 5 }: { items?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: items }).map((_, i) => (
        <div key={i} className="animate-pulse flex items-center space-x-3 p-3">
          <div className="w-10 h-10 bg-slate-200 rounded-lg"></div>
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-slate-200 rounded"></div>
            <div className="h-3 bg-slate-200 rounded w-2/3"></div>
          </div>
        </div>
      ))}
    </div>
  );
}

// Form skeleton
export function FormSkeleton({ fields = 3 }: { fields?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="animate-pulse space-y-2">
          <div className="h-4 bg-slate-200 rounded w-1/4"></div>
          <div className="h-10 bg-slate-200 rounded"></div>
        </div>
      ))}
    </div>
  );
} 