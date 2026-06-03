'use client';
import { useAuth } from '@/hooks/useAuth';
import { useEffect, useState } from 'react';
import {
  collection, getDocs, updateDoc,
  doc, serverTimestamp, query, where, orderBy
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Task } from '@/types';
import { IconClipboardList } from '@tabler/icons-react';

function formatTRY(n: number): string {
  return `₺${n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getTimestamp(ts: unknown): Date | null {
  if (!ts) return null;
  const t = ts as { toDate?: () => Date };
  if (t.toDate) return t.toDate();
  return new Date(ts as string);
}

function formatDate(ts: unknown): string {
  const d = getTimestamp(ts);
  if (!d) return '—';
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const STATUS_BADGE: Record<string, string> = {
  todo: 'badge badge-amber',
  in_progress: 'badge badge-blue',
  done: 'badge badge-green',
};

const STATUS_LABELS: Record<string, string> = {
  todo: 'Yapılacak',
  in_progress: 'Devam Ediyor',
  done: 'Tamamlandı',
};

export default function MyTasksPage() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'active' | 'done'>('active');
  const [updating, setUpdating] = useState<string | null>(null);

  const loadTasks = async () => {
    if (!user?.uid) return;
    setLoading(true);
    try {
      const snap = await getDocs(
        query(
          collection(db, 'tasks'),
          where('assignedTo', '==', user.uid)
        )
      );
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() } as Task));
      all.sort((a, b) => {
        const ta = (a.createdAt as { toDate?: () => Date })?.toDate?.()?.getTime() ?? 0;
        const tb = (b.createdAt as { toDate?: () => Date })?.toDate?.()?.getTime() ?? 0;
        return tb - ta;
      });
      setTasks(all);
    } catch (err) {
      console.error('My tasks load error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.uid) loadTasks();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  const handleStart = async (t: Task) => {
    if (!t.id) return;
    setUpdating(t.id);
    try {
      await updateDoc(doc(db, 'tasks', t.id), {
        status: 'in_progress',
        startedAt: serverTimestamp(),
      });
      await loadTasks();
    } finally {
      setUpdating(null);
    }
  };

  const handleComplete = async (t: Task) => {
    if (!t.id) return;
    setUpdating(t.id);
    try {
      await updateDoc(doc(db, 'tasks', t.id), {
        status: 'done',
        completedAt: serverTimestamp(),
      });
      await loadTasks();
    } finally {
      setUpdating(null);
    }
  };

  const activeTasks = tasks.filter(t => t.status === 'todo' || t.status === 'in_progress');
  const doneTasks = tasks.filter(t => t.status === 'done');
  const totalEarning = doneTasks
    .filter(t => t.showPriceToWorkshop)
    .reduce((s, t) => s + (t.price || 0), 0);

  const renderTaskCard = (t: Task, readonly = false) => (
    <div
      key={t.id}
      style={{
        background: 'var(--surface2)',
        borderRadius: 12,
        padding: '18px 20px',
        border: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 16, color: '#fff', lineHeight: 1.3 }}>{t.title}</div>
        <span className={STATUS_BADGE[t.status]}>{STATUS_LABELS[t.status]}</span>
      </div>

      {t.description && (
        <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>{t.description}</div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        {t.category && (
          <span className="badge" style={{ background: 'var(--surface3)', color: 'var(--text-2)' }}>
            {t.category}
          </span>
        )}
        {t.showPriceToWorkshop && (
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--or)' }}>
            {formatTRY(t.price || 0)}
          </span>
        )}
      </div>

      {readonly ? (
        <div style={{ fontSize: 12, color: 'var(--text-3)', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {!!t.completedAt && <span>Tamamlandı: {formatDate(t.completedAt)}</span>}
          {!!t.createdAt && <span>Oluşturuldu: {formatDate(t.createdAt)}</span>}
        </div>
      ) : (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
            Oluşturuldu: {formatDate(t.createdAt)}
          </span>
          {t.status === 'todo' && (
            <button
              className="btn btn-primary btn-sm"
              disabled={updating === t.id}
              onClick={() => handleStart(t)}
            >
              {updating === t.id ? 'Güncelleniyor...' : 'Başladım'}
            </button>
          )}
          {t.status === 'in_progress' && (
            <button
              className="btn btn-sm"
              disabled={updating === t.id}
              onClick={() => handleComplete(t)}
              style={{ background: '#16a34a', color: '#fff', border: 'none', cursor: 'pointer' }}
            >
              {updating === t.id ? 'Güncelleniyor...' : 'Tamamladım'}
            </button>
          )}
        </div>
      )}
    </div>
  );

  return (
    <>
      <div className="topbar">
        <div>
          <div className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <IconClipboardList size={22} style={{ color: 'var(--or)' }} />
            İşlerim
          </div>
          <div className="page-sub">Bana atanan görevler</div>
        </div>
      </div>

      <div className="page-content">
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-3)' }}>Yükleniyor...</div>
        ) : (
          <>
            {/* Tabs */}
            <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
              {([['active', 'Yapılacak İşler', activeTasks.length], ['done', 'Tamamlanan İşler', doneTasks.length]] as const).map(([key, label, count]) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  style={{
                    padding: '8px 16px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: activeTab === key ? 700 : 400,
                    color: activeTab === key ? 'var(--or)' : 'var(--text-3)',
                    borderBottom: activeTab === key ? '2px solid var(--or)' : '2px solid transparent',
                    marginBottom: -1,
                  }}
                >
                  {label}
                  <span style={{
                    marginLeft: 6, fontSize: 11,
                    background: 'var(--surface3)', borderRadius: 10, padding: '1px 7px'
                  }}>{count}</span>
                </button>
              ))}
            </div>

            {/* Active tab */}
            {activeTab === 'active' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {activeTasks.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-3)', fontSize: 14 }}>
                    Aktif göreviniz bulunmuyor
                  </div>
                ) : activeTasks.map(t => renderTaskCard(t, false))}
              </div>
            )}

            {/* Done tab */}
            {activeTab === 'done' && (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {doneTasks.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-3)', fontSize: 14 }}>
                      Tamamlanan göreviniz bulunmuyor
                    </div>
                  ) : doneTasks.map(t => renderTaskCard(t, true))}
                </div>

                {doneTasks.some(t => t.showPriceToWorkshop) && (
                  <div style={{
                    marginTop: 24,
                    padding: '16px 20px',
                    background: 'var(--surface2)',
                    borderRadius: 10,
                    border: '1px solid var(--border)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-2)' }}>Toplam Hakediş</span>
                    <span style={{ fontWeight: 700, fontSize: 18, color: 'var(--or)' }}>{formatTRY(totalEarning)}</span>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}
