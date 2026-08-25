'use client';

interface PaginationProps {
  page: number;
  total: number;
  pageSize?: number;
  onChange: (page: number) => void;
}

const PAGE_WINDOW = 10;

export default function Pagination({ page, total, pageSize = 20, onChange }: PaginationProps) {
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) return null;

  // Which window of 10 pages are we in?
  const windowStart = Math.floor((page - 1) / PAGE_WINDOW) * PAGE_WINDOW + 1;
  const windowEnd = Math.min(windowStart + PAGE_WINDOW - 1, totalPages);
  const pages = Array.from({ length: windowEnd - windowStart + 1 }, (_, i) => windowStart + i);

  const hasPrevWindow = windowStart > 1;
  const hasNextWindow = windowEnd < totalPages;

  const btn = (content: React.ReactNode, target: number, active = false, disabled = false) => (
    <button
      key={String(target) + String(content)}
      onClick={() => !disabled && onChange(target)}
      disabled={disabled}
      style={{
        minWidth: 32, height: 32, padding: '0 8px',
        borderRadius: 7,
        border: active ? '1.5px solid #E85D04' : '1.5px solid var(--border)',
        background: active ? '#E85D04' : 'var(--surface-2)',
        color: active ? '#fff' : disabled ? 'var(--text-3)' : 'var(--text-2)',
        fontWeight: active ? 700 : 500,
        fontSize: 13,
        cursor: disabled ? 'default' : 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all .12s',
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {content}
    </button>
  );

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '16px 0', flexWrap: 'wrap' }}>
      {/* Önceki sayfa */}
      {btn('‹', page - 1, false, page === 1)}

      {/* Önceki pencere */}
      {hasPrevWindow && btn('···', windowStart - 1)}

      {/* Sayfa numaraları */}
      {pages.map(p => btn(p, p, p === page))}

      {/* Sonraki pencere */}
      {hasNextWindow && btn('···', windowEnd + 1)}

      {/* Sonraki sayfa */}
      {btn('›', page + 1, false, page === totalPages)}
    </div>
  );
}
