'use client';
import { useAuth } from '@/hooks/useAuth';
import { useEffect, useState } from 'react';
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc,
  doc, serverTimestamp, query, where, orderBy
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Task, AppUser } from '@/types';
import { IconClipboardList, IconPlus, IconEdit, IconTrash } from '@tabler/icons-react';

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

const STATUS_LABELS: Record<string, string> = {
  todo: 'Yapılacak',
  in_progress: 'Devam Ediyor',
  done: 'Tamamlandı',
};

const STATUS_BADGE: Record<string, string> = {
  todo: 'badge badge-amber',
  in_progress: 'badge badge-blue',
  done: 'badge badge-green',
};

const TABS = ['Tümü', 'Yapılacak', 'Devam Ediyor', 'Tamamlandı'] as const;
type TabType = typeof TABS[number];

const emptyForm = (): Omit<Task, 'id' | 'createdBy' | 'createdByName' | 'createdAt' | 'startedAt' | 'completedAt'> => ({
  title: '',
  description: '',
  assignedTo: '',
  assignedToName: '',
  price: 0,
  showPriceToWorkshop: false,
  status: 'todo',
  category: '',
  note: '',
});

export default function TasksPage() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [workers, setWorkers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('Tümü');
  const [modalOpen, setModalOpen] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [tasksSnap, workersSnap] = await Promise.all([
        getDocs(query(collection(db, 'tasks'), orderBy('createdAt', 'desc'))),
        getDocs(query(collection(db, 'users'), where('role', '==', 'atolye'))),
      ]);
      setTasks(tasksSnap.docs.map(d => ({ id: d.id, ...d.data() } as Task)));
      setWorkers(workersSnap.docs.map(d => ({ id: d.id, ...d.data() } as AppUser)));
    } catch (err) {
      console.error('Tasks load error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const openNew = () => {
    setEditTask(null);
    setForm(emptyForm());
    setModalOpen(true);
  };

  const openEdit = (t: Task) => {
    setEditTask(t);
    setForm({
      title: t.title,
      description: t.description,
      assignedTo: t.assignedTo,
      assignedToName: t.assignedToName,
      price: t.price,
      showPriceToWorkshop: t.showPriceToWorkshop,
      status: t.status,
      category: t.category,
      note: t.note,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.title || !form.assignedTo) return;
    setSaving(true);
    try {
      const worker = workers.find(w => w.uid === form.assignedTo);
      const data = {
        ...form,
        assignedToName: worker?.name || form.assignedToName,
        price: Number(form.price) || 0,
      };
      if (editTask?.id) {
        await updateDoc(doc(db, 'tasks', editTask.id), data);
      } else {
        await addDoc(collection(db, 'tasks'), {
          ...data,
          status: 'todo',
          createdAt: serverTimestamp(),
          startedAt: null,
          completedAt: null,
          createdBy: user?.uid || '',
          createdByName: user?.displayName || user?.email || '',
        });
      }
      setModalOpen(false);
      await loadData();
    } catch (err) {
      console.error('Save error:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (t: Task) => {
    if (!confirm(`"${t.title}" görevini silmek istediğinize emin misiniz?`)) return;
    if (!t.id) return;
    await deleteDoc(doc(db, 'tasks', t.id));
    await loadData();
  };

  const handleStatusChange = async (t: Task, newStatus: Task['status']) => {
    if (!t.id) return;
    const upd: Partial<Task> = { status: newStatus };
    if (newStatus === 'in_progress') upd.startedAt = serverTimestamp();
    if (newStatus === 'done') upd.completedAt = serverTimestamp();
    await updateDoc(doc(db, 'tasks', t.id), upd);
    await loadData();
  };

  const filteredTasks = tasks.filter(t => {
    if (activeTab === 'Tümü') return true;
    if (activeTab === 'Yapılacak') return t.status === 'todo';
    if (activeTab === 'Devam Ediyor') return t.status === 'in_progress';
    if (activeTab === 'Tamamlandı') return t.status === 'done';
    return true;
  });

  const totalTasks = tasks.length;
  const inProgress = tasks.filter(t => t.status === 'in_progress').length;
  const done = tasks.filter(t => t.status === 'done').length;
  const totalEarning = tasks.filter(t => t.status === 'done').reduce((s, t) => s + (t.price || 0), 0);

  // Atölye bazlı istatistik
  const workerStats = workers.map(w => ({
    worker: w,
    done: tasks.filter(t => t.assignedTo === w.uid && t.status === 'done').length,
    earning: tasks.filter(t => t.assignedTo === w.uid && t.status === 'done').reduce((s, t) => s + (t.price || 0), 0),
    inProgress: tasks.filter(t => t.assignedTo === w.uid && t.status === 'in_progress').length,
  }));

  return (
    <>
      <div className="topbar">
        <div>
          <div className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <IconClipboardList size={22} style={{ color: 'var(--or)' }} />
            Görevler
          </div>
          <div className="page-sub">Tüm görev ve hakediş yönetimi</div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={openNew}>
          <IconPlus size={15} /> Yeni Görev
        </button>
      </div>

      <div className="page-content">
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-3)' }}>Yükleniyor...</div>
        ) : (
          <>
            {/* Stats */}
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-label">Toplam Görev</div>
                <div className="stat-value">{totalTasks}</div>
              </div>
              <div className="stat-card accent-blue">
                <div className="stat-label">Devam Eden</div>
                <div className="stat-value">{inProgress}</div>
              </div>
              <div className="stat-card accent-green">
                <div className="stat-label">Tamamlanan</div>
                <div className="stat-value">{done}</div>
              </div>
              <div className="stat-card accent-orange">
                <div className="stat-label">Toplam Hakediş</div>
                <div className="stat-value" style={{ fontSize: 20 }}>{formatTRY(totalEarning)}</div>
              </div>
            </div>

            {/* Atölye istatistikleri */}
            {workerStats.length > 0 && (
              <div className="card" style={{ marginBottom: 24 }}>
                <div className="card-header">
                  <div className="card-title">Atölye Bazlı İstatistik</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12, padding: '0 0 4px' }}>
                  {workerStats.map(ws => (
                    <div key={ws.worker.uid} style={{
                      background: 'var(--surface2)', borderRadius: 10, padding: '14px 16px',
                      border: '1px solid var(--border)'
                    }}>
                      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8, color: '#fff' }}>{ws.worker.name}</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
                          Tamamlanan: <b style={{ color: '#4ade80' }}>{ws.done}</b>
                        </span>
                        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
                          Devam Eden: <b style={{ color: '#60a5fa' }}>{ws.inProgress}</b>
                        </span>
                        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
                          Hakediş: <b style={{ color: 'var(--or)' }}>{formatTRY(ws.earning)}</b>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tabs */}
            <div className="card">
              <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', paddingBottom: 0, marginBottom: 16, overflowX: 'auto' }}>
                {TABS.map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    style={{
                      padding: '8px 16px',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: 13,
                      fontWeight: activeTab === tab ? 700 : 400,
                      color: activeTab === tab ? 'var(--or)' : 'var(--text-3)',
                      borderBottom: activeTab === tab ? '2px solid var(--or)' : '2px solid transparent',
                      marginBottom: -1,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {tab}
                    <span style={{
                      marginLeft: 6, fontSize: 11,
                      background: 'var(--surface3)', borderRadius: 10, padding: '1px 7px'
                    }}>
                      {tab === 'Tümü' ? tasks.length
                        : tab === 'Yapılacak' ? tasks.filter(t => t.status === 'todo').length
                        : tab === 'Devam Ediyor' ? tasks.filter(t => t.status === 'in_progress').length
                        : tasks.filter(t => t.status === 'done').length}
                    </span>
                  </button>
                ))}
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Başlık</th>
                      <th>Atanan</th>
                      <th>Kategori</th>
                      <th>Durum</th>
                      <th>Hakediş</th>
                      <th>Tarih</th>
                      <th style={{ textAlign: 'right' }}>İşlem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTasks.length === 0 ? (
                      <tr>
                        <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-3)', padding: 32 }}>
                          Görev bulunamadı
                        </td>
                      </tr>
                    ) : filteredTasks.map(t => (
                      <tr key={t.id}>
                        <td style={{ fontWeight: 600 }}>{t.title}</td>
                        <td>{t.assignedToName || '—'}</td>
                        <td>
                          {t.category
                            ? <span className="badge" style={{ background: 'var(--surface3)', color: 'var(--text-2)' }}>{t.category}</span>
                            : <span style={{ color: 'var(--text-3)' }}>—</span>}
                        </td>
                        <td>
                          <select
                            value={t.status}
                            onChange={e => handleStatusChange(t, e.target.value as Task['status'])}
                            style={{
                              background: 'var(--surface2)', border: '1px solid var(--border)',
                              borderRadius: 6, padding: '4px 8px', fontSize: 12, color: '#fff', cursor: 'pointer'
                            }}
                          >
                            <option value="todo">Yapılacak</option>
                            <option value="in_progress">Devam Ediyor</option>
                            <option value="done">Tamamlandı</option>
                          </select>
                        </td>
                        <td style={{ fontWeight: 700, color: 'var(--or)' }}>{formatTRY(t.price || 0)}</td>
                        <td style={{ fontSize: 12, color: 'var(--text-3)' }}>{formatDate(t.createdAt)}</td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                            <button className="btn btn-secondary btn-sm" onClick={() => openEdit(t)}>
                              <IconEdit size={13} />
                            </button>
                            <button
                              className="btn btn-sm"
                              style={{ background: 'rgba(220,38,38,.15)', color: '#f87171', border: '1px solid rgba(220,38,38,.3)' }}
                              onClick={() => handleDelete(t)}
                            >
                              <IconTrash size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <div className="card-header" style={{ marginBottom: 20 }}>
              <div className="card-title">{editTask ? 'Görevi Düzenle' : 'Yeni Görev'}</div>
              <button
                onClick={() => setModalOpen(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 20 }}
              >×</button>
            </div>

            <div className="form-group">
              <label className="form-label">Başlık *</label>
              <input
                className="form-input"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Görev başlığı"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Açıklama</label>
              <textarea
                className="form-input"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Görev açıklaması"
                rows={3}
                style={{ resize: 'vertical' }}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Atanan Kişi *</label>
              <select
                className="form-input"
                value={form.assignedTo}
                onChange={e => setForm(f => ({ ...f, assignedTo: e.target.value }))}
              >
                <option value="">Seçiniz...</option>
                {workers.map(w => (
                  <option key={w.uid} value={w.uid}>{w.name}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Kategori</label>
              <input
                className="form-input"
                value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                placeholder="Örn: Dikiş, Baskı..."
              />
            </div>

            <div className="form-group">
              <label className="form-label">Hakediş ₺</label>
              <input
                className="form-input"
                type="number"
                min={0}
                step={0.01}
                value={form.price}
                onChange={e => setForm(f => ({ ...f, price: Number(e.target.value) }))}
                placeholder="0.00"
              />
            </div>

            <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                type="checkbox"
                id="showPrice"
                checked={form.showPriceToWorkshop}
                onChange={e => setForm(f => ({ ...f, showPriceToWorkshop: e.target.checked }))}
                style={{ width: 16, height: 16, cursor: 'pointer' }}
              />
              <label htmlFor="showPrice" className="form-label" style={{ margin: 0, cursor: 'pointer' }}>
                Atölyeye Fiyat Göster
              </label>
            </div>

            <div className="form-group">
              <label className="form-label">Not</label>
              <textarea
                className="form-input"
                value={form.note}
                onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                placeholder="Ek notlar..."
                rows={2}
                style={{ resize: 'vertical' }}
              />
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
              <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>İptal</button>
              <button
                className="btn btn-primary"
                onClick={handleSave}
                disabled={saving || !form.title || !form.assignedTo}
              >
                {saving ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
