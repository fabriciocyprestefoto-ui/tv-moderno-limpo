import React, { useState, useEffect, useCallback, createContext, useContext } from 'react';

interface ToastMessage {
  id: number;
  text: string;
  type: 'info' | 'warning' | 'error' | 'success';
  duration?: number;
}

interface ToastContextType {
  showToast: (text: string, type?: ToastMessage['type'], duration?: number) => void;
}

const ToastContext = createContext<ToastContextType>({ showToast: () => {} });

export const useToast = () => useContext(ToastContext);

let toastIdCounter = 0;

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = useCallback(
    (text: string, type: ToastMessage['type'] = 'info', duration = 4000) => {
      const id = ++toastIdCounter;
      setToasts((prev) => {
        const next = [...prev, { id, text, type, duration }];
        return next.length > 3 ? next.slice(next.length - 3) : next;
      });
    },
    []
  );

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="false"
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2 pointer-events-none"
      >
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onRemove={removeToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
};

const COLORS: Record<ToastMessage['type'], string> = {
  info: 'bg-white/10 border-white/20 text-white',
  warning: 'bg-yellow-900/80 border-yellow-600/40 text-yellow-100',
  error: 'bg-red-900/80 border-red-600/40 text-red-100',
  success: 'bg-green-900/80 border-green-600/40 text-green-100',
};

const ToastItem: React.FC<{ toast: ToastMessage; onRemove: (id: number) => void }> = ({
  toast,
  onRemove,
}) => {
  const [visible, setVisible] = useState(false);
  const removeTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    setVisible(false);
    if (removeTimerRef.current) clearTimeout(removeTimerRef.current);
    removeTimerRef.current = setTimeout(() => onRemove(toast.id), 300);
  }, [onRemove, toast.id]);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    const timer = setTimeout(dismiss, toast.duration || 4000);
    return () => {
      clearTimeout(timer);
      if (removeTimerRef.current) clearTimeout(removeTimerRef.current);
    };
  }, [dismiss, toast.duration]);

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={`pointer-events-auto px-5 py-3 rounded-xl border text-sm font-medium shadow-2xl backdrop-blur-sm transition-all duration-300 flex items-center gap-3 ${COLORS[toast.type]} ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
    >
      <span className="flex-1">{toast.text}</span>
      <button
        tabIndex={0}
        onClick={dismiss}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            dismiss();
          }
        }}
        aria-label="Fechar notificação"
        className="ml-1 text-current opacity-60 hover:opacity-100 focus:opacity-100 focus:outline-none rounded-md transition-opacity"
      >
        ✕
      </button>
    </div>
  );
};

export default ToastProvider;
