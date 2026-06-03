'use client';
import { useState, useEffect } from 'react';
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc, doc, setDoc, getDoc,
} from 'firebase/firestore';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { db } from '@/lib/firebase';
import { secondaryAuth } from '@/lib/auth';
import type { AppUser, PermissionKey } from '@/types';
import { IconPlus, IconEdit, IconTrash, IconX, IconShield } from '@tabler/icons-react';

const ALL_PAGES: { key: PermissionKey; label: string }[] = [
  { key: 'products', label: 'Ürünler' },
  { key: 'stock', label: 'Stoklar' },
  { key: 'sales', label: 'Satışlar' },
  { key: 'offers', label: 'Teklifler' },
  { key: 'categories', label: 'Kategoriler' },
  { key: 'users', label: 'Kullanıcılar' },
  { key: 'settings', label: 'Ayarlar' },
  { key: 'tasks', label: 'İş Takip (Yönetim)' },
  { key: 'my-tasks', label: 'İş Takip (Atölye)' },
];

const DEFAULT_PERMS: Record<string, PermissionKey[]> = {
  admin: ['products', 'stock', 'sales', 'offers', 'categories', 'users', 'settings', 'tasks', 'my-tasks'],
  atolye: ['my-tasks'],
  sales: ['products', 'offers', 'sales'],
};

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  atolye: 'Atölye',
  sales: 'Satış',
};

export default function UsersPage() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [perms, setPerms] = useState<Record<string, PermissionKey[]>>(DEFAULT_PERMS);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [permOpen, setPermOpen] = useState(false);
  const [editing, setEditing] = useState<AppUser | null>(null);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'sales' as AppUser['role'] });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { load(); loadPerms(); }, []);

  async function load() {
    setLoading(true);
    const snap = await getDocs(collection(db, 'users'));
    setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() } as AppUser)));
    setLoading(false);
  }

  async function loadPerms() {
    try {
      const d = await getDoc(doc(db, 'settings', 'permissions'));
      if (d.exists()) {
        const raw = d.data() as Record<string, unknown>;
        const normalized: Record<string, PermissionKey[]> = { ...DEFAULT_PERMS };
        for (const key of Object.keys(raw)) {
          normalized[key] = Array.isArray(raw[key]) ? (raw[key] as PermissionKey[]) : [];
        }
        setPerms(normalized);
      }
    } catch {}
  }

  function openAdd() {
    setEditing(null);
    setForm({ name: '', email: '', password: '', role: 'sales' });
    setError('');
    setOpen(true);
  }

  function openEdit(u: AppUser) {
    setEditing(u);
    setForm({ name: u.name, email: u.email, password: '', role: u.role });
    setError('');
    setOpen(true);
  }

  async function save() {
    if (!form.name.trim() || !form.email.trim()) return;
    setSaving(true);
    setError('');
    try {
      if (editing?.id) {
        await updateDoc(doc(db, 'users', editing.id), {
          name: form.name, role: form.role,
        });
      } else {
        if (!form.password || form.password.length < 6) {
          setError('Şifre en az 6 karakter olmalıdır');
          setSaving(false);
          return;
        }
        const cred = await createUserWithEmailAndPassword(secondaryAuth, form.email, form.password);
        await updateProfile(cred.user, { displayName: form.name });
        await secondaryAuth.signOut();
        await addDoc(collection(db, 'users'), {
          name: form.name, email: form.email,
          role: form.role, uid: cred.user.uid, active: true,
        });
      }
      setOpen(false);
      load();
    } catch (e: unknown) {
      const msg = (e as { code?: string })?.code;
      if (msg === 'auth/email-already-in-use') setError('Bu e-posta adresi zaten kullanılıyor');
      else if (msg === 'auth/invalid-email') setError('Geçersiz e-posta adresi');
      else setError('Bir hata oluştu. Tekrar deneyin.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(u: AppUser) {
    await updateDoc(doc(db, 'users', u.id!), { active: !u.active });
    load();
  }

  async function remove(id: string) {
    if (!confirm('Bu kullanıcıyı silmek istediğinize emin misiniz?')) return;
    await deleteDoc(doc(db, 'users', id));
    load();
  }

  function togglePerm(role: string, page: PermissionKey) {
    setPerms(p => {
      const current = Array.isArray(p[role]) ? p[role] : [];
      const next = current.includes(page) ? current.filter(x => x !== page) : [...current, page];
      return { ...p, [role]: next };
    });
  }

  async function savePerms() {
    await setDoc(doc(db, 'settings', 'permissions'), perms);
    setPermOpen(false);
  }

  return (
    <>
      <div className="topbar">
        <div>
          <div className="page-title">Kullanıcılar</div>
          <div className="page-sub">{users.length} kullanıcı</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" onClick={() => setPermOpen(true)}>
            <IconShield size={16} /> Yetki Matrisi
          </button>
          <button className="btn btn-primary" onClick={openAdd}>
            <IconPlus size={16} /> Yeni Kullanıcı
          </button>
        </div>
      </div>

      <div className="page-content">
        <div className="card">
          <div className="table-wrap">
            {loading ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>Yükleniyor...</div>
            ) : users.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>Kullanıcı bulunamadı</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Ad Soyad</th>
                    <th>E-posta</th>
                    <th>Rol</th>
                    <th>Durum</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id}>
                      <td style={{ fontWeight: 600 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{
                            width: 34, height: 34, borderRadius: '50%', background: '#E85D04',
                            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 12, fontWeight: 700, flexShrink: 0,
                          }}>
                            {u.name.substring(0, 2).toUpperCase()}
                          </div>
                          {u.name}
                        </div>
                      </td>
                      <td style={{ color: '#888' }}>{u.email}</td>
                      <td>
                        <span className={`badge ${u.role === 'admin' ? 'badge-blue' : u.role === 'atolye' ? 'badge-amber' : 'badge-green'}`}>
                          {ROLE_LABELS[u.role] ?? u.role}
                        </span>
                      </td>
                      <td>
                        <button
                          onClick={() => toggleActive(u)}
                          className={`badge ${u.active ? 'badge-green' : 'badge-red'}`}
                          style={{ border: 'none', cursor: 'pointer' }}
                        >
                          {u.active ? 'Aktif' : 'Pasif'}
                        </button>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-secondary btn-sm" onClick={() => openEdit(u)}><IconEdit size={13} /></button>
                          <button className="btn btn-sm" style={{ background: 'rgba(239,68,68,.1)', color: '#DC2626' }} onClick={() => remove(u.id!)}><IconTrash size={13} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Add/Edit User Modal */}
      {open && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setOpen(false)}>
          <div className="modal-box" style={{ maxWidth: 440 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700 }}>{editing ? 'Kullanıcı Düzenle' : 'Yeni Kullanıcı'}</h3>
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#aaa' }}><IconX size={20} /></button>
            </div>

            {error && (
              <div style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', color: '#DC2626', padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 14 }}>
                {error}
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Ad Soyad *</label>
              <input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ad Soyad" />
            </div>

            <div className="form-group">
              <label className="form-label">E-posta *</label>
              <input className="form-input" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="kullanici@caliskancanta.com" disabled={!!editing} />
            </div>

            {!editing && (
              <div className="form-group">
                <label className="form-label">Şifre *</label>
                <input className="form-input" type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="Minimum 6 karakter" />
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Rol</label>
              <select className="form-input" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as AppUser['role'] }))}>
                <option value="admin">Admin (Tüm yetkiler)</option>
                <option value="atolye">Atölye (Fason görev takibi)</option>
                <option value="sales">Satış (Teklif, Satış)</option>
              </select>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setOpen(false)}>İptal</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>
                {saving ? 'Kaydediliyor...' : editing ? 'Güncelle' : 'Kullanıcı Oluştur'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Permissions Modal */}
      {permOpen && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setPermOpen(false)}>
          <div className="modal-box" style={{ maxWidth: 560 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700 }}>Yetki Matrisi</h3>
              <button onClick={() => setPermOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#aaa' }}><IconX size={20} /></button>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th>Sayfa</th>
                    <th style={{ textAlign: 'center' }}>Admin</th>
                    <th style={{ textAlign: 'center' }}>Atölye</th>
                    <th style={{ textAlign: 'center' }}>Satış</th>
                  </tr>
                </thead>
                <tbody>
                  {ALL_PAGES.map(page => (
                    <tr key={page.key}>
                      <td style={{ fontWeight: 500 }}>{page.label}</td>
                      {(['admin', 'atolye', 'sales'] as const).map(role => (
                        <td key={role} style={{ textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={(Array.isArray(perms[role]) ? perms[role] : []).includes(page.key)}
                            onChange={() => togglePerm(role, page.key)}
                            disabled={role === 'admin'}
                            style={{ width: 16, height: 16, cursor: role === 'admin' ? 'default' : 'pointer' }}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ fontSize: 11, color: '#aaa', marginTop: 8 }}>Admin rolü her zaman tüm sayfalara erişebilir.</div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button className="btn btn-secondary" onClick={() => setPermOpen(false)}>İptal</button>
              <button className="btn btn-primary" onClick={savePerms}>Kaydet</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
