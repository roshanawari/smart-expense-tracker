import React from "react";

export function Card({
  children,
  className = "",
  title,
  subtitle,
  action,
}: {
  children: React.ReactNode;
  className?: string;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className={`bg-white rounded-xl border border-slate-200 p-5 shadow-sm ${className}`}>
      {(title || subtitle || action) && (
        <div className="flex items-start justify-between gap-4 mb-4 pb-3 border-b border-slate-100">
          <div>
            {title && <h2 className="text-lg font-semibold text-[#0F172A]">{title}</h2>}
            {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

export function Button({
  children,
  variant = "primary",
  size = "md",
  className = "",
  disabled,
  type = "button",
  onClick,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "outline-danger" | "ghost";
  size?: "sm" | "md" | "lg";
}) {
  const base =
    "inline-flex items-center justify-center font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer";

  const sizeClasses = {
    sm: "px-2.5 py-1.5 text-xs gap-1.5",
    md: "px-3.5 py-2 text-sm gap-2",
    lg: "px-5 py-2.5 text-base gap-2.5",
  }[size];

  const variantClasses = {
    primary:
      "bg-[#0F766E] text-white hover:bg-[#0d655e] focus:ring-[#0F766E] shadow-sm",
    secondary:
      "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 focus:ring-slate-300 shadow-sm",
    danger:
      "bg-[#DC2626] text-white hover:bg-[#b91c1c] focus:ring-[#DC2626] shadow-sm",
    "outline-danger":
      "bg-white border border-red-200 text-[#DC2626] hover:bg-red-50 focus:ring-red-200",
    ghost:
      "text-slate-600 hover:bg-slate-100 focus:ring-slate-300",
  }[variant];

  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`${base} ${sizeClasses} ${variantClasses} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Input({
  label,
  error,
  helperText,
  id,
  className = "",
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  error?: string;
  helperText?: string;
}) {
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-[#0F172A] mb-1.5">
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={`w-full px-3 py-2 bg-white border rounded-lg text-sm text-[#0F172A] placeholder-slate-400 focus:outline-none focus:ring-2 transition-colors ${
          error
            ? "border-red-300 focus:border-red-500 focus:ring-red-200"
            : "border-slate-300 focus:border-[#0F766E] focus:ring-[#0F766E]/20"
        } disabled:bg-slate-50 disabled:text-slate-500 ${className}`}
        {...props}
      />
      {error && <p className="mt-1 text-xs text-[#DC2626]">{error}</p>}
      {helperText && !error && <p className="mt-1 text-xs text-slate-500">{helperText}</p>}
    </div>
  );
}

export function Select({
  label,
  error,
  id,
  options,
  className = "",
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
}) {
  const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={selectId} className="block text-sm font-medium text-[#0F172A] mb-1.5">
          {label}
        </label>
      )}
      <select
        id={selectId}
        className={`w-full px-3 py-2 bg-white border rounded-lg text-sm text-[#0F172A] focus:outline-none focus:ring-2 transition-colors cursor-pointer ${
          error
            ? "border-red-300 focus:border-red-500 focus:ring-red-200"
            : "border-slate-300 focus:border-[#0F766E] focus:ring-[#0F766E]/20"
        } ${className}`}
        {...props}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && <p className="mt-1 text-xs text-[#DC2626]">{error}</p>}
    </div>
  );
}

export function ProgressBar({
  value,
  max = 100,
  isOver = false,
  className = "",
}: {
  value: number;
  max?: number;
  isOver?: boolean;
  className?: string;
}) {
  const percent = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const barColor = isOver ? "bg-[#DC2626]" : percent >= 100 ? "bg-[#16A34A]" : "bg-[#0F766E]";

  return (
    <div className={`w-full h-2.5 bg-slate-100 rounded-full overflow-hidden ${className}`}>
      <div
        className={`h-full transition-all duration-300 rounded-full ${barColor}`}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  confirmVariant = "danger",
  onConfirm,
  onCancel,
  isLoading = false,
}: {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: "primary" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-xl border border-slate-200 max-w-md w-full p-6 shadow-xl space-y-4">
        <h3 className="text-lg font-semibold text-[#0F172A]">{title}</h3>
        <p className="text-sm text-slate-600 leading-relaxed">{message}</p>
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onCancel} disabled={isLoading}>
            {cancelLabel}
          </Button>
          <Button variant={confirmVariant} onClick={onConfirm} disabled={isLoading}>
            {isLoading ? "Processing..." : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function FormModal({
  isOpen,
  title,
  children,
  onClose,
}: {
  isOpen: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-xl border border-slate-200 max-w-lg w-full p-6 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="text-lg font-semibold text-[#0F172A]">{title}</h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-md cursor-pointer"
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>
        <div>{children}</div>
      </div>
    </div>
  );
}
