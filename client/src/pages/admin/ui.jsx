// 관리자 화면 공용 조각
export const Panel = ({ title, action, children, className = '' }) => (
  <section className={`rounded-2xl bg-slate-900 border border-slate-800 p-4 space-y-3 ${className}`}>
    {(title || action) && (
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-bold">{title}</h2>
        {action}
      </div>
    )}
    {children}
  </section>
);

export const btn = 'px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm font-bold disabled:opacity-30 transition-colors';
export const btnPrimary = 'px-3 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-sm font-bold disabled:opacity-30 transition-colors';
export const input = 'px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm focus:outline-none focus:border-sky-500';
