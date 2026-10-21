import { createContext, useContext, useState, useCallback } from 'react';

const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((message, type = 'ok') => {
    const id = Math.random();
    setItems((x) => [...x, { id, message, type }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 3800);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 left-1/2 z-[100] flex w-[92vw] max-w-sm -translate-x-1/2 flex-col gap-2">
        {items.map((t) => (
          <div key={t.id} className={`pointer-events-auto rounded-md px-4 py-3 text-sm font-semibold text-white shadow-lg ${t.type === 'err' ? 'bg-coral' : 'bg-ink-950'}`}>
            {t.type === 'err' ? '⚠ ' : '✓ '}{t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
