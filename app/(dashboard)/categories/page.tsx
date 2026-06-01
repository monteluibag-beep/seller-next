'use client';
import { useState, useEffect } from 'react';
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Category } from '@/types';
import { IconPlus, IconEdit, IconTrash, IconX, IconTag } from '@tabler/icons-react';

function autoPrefix(name: string): string {
  const words = name.trim().toUpperCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  if (words.length === 1) return words[0].slice(0, 3);
  return words.map(w => w[0]).join('').slice(0, 4);
}

const empty: Omit<Category, 'id'> = { name: '', prefix: '', desc: '' };

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [form, setForm] = useState<Omit<Category, 'id'>>(empty);
  const [saving, setSaving] = useState(false);
  const [prefixManual, setPrefixManual] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const snap = await getDocs(collection(db, 'categories'));
    setCategories(snap.docs.map(d => ({ id: d.id, ...d.data() } as Category)));
    setLoading(false);
  }

  function openAdd() {
    setEditing(null);
    setForm(empty);
    setPrefixManual(false);
    setOpen(true);
  }

  function openEdit(c: Category) {
    setEditing(c);
    setForm({ name: c.name, prefix: c.prefix, desc: c.desc });
    setPrefixManual(true);
    setOpen(true);
  }

  function handleNameChange(name: string) {
    if (!prefixManual) {
      setForm(f => ({ ...f, name, prefix: autoPrefix(name) }));
    } else {
      setForm(f => ({ ...f, name }));
    }
  }

  async function save() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (editing?.id) {
        await updateDoc(doc(db, 'categories', editing.id), { ...form });
      } else {
        await addDoc(collection(db, 'categories'), { ...form, createdAt: serverTimestamp() });
      }
      setOpen(false);
      load();
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('Bu kategoriyi silmek istediğinize emin misiniz?')) return;
    await deleteDoc(doc(db, 'categories', id));
    load();
  }

  return (
    <>
      <div className="topbar">
        <div>
          <div className="page-title">Kategoriler</div>
          <div className="page-sub">{categories.length} kategori</div>
        </div>
        <button className="btn btn-primary" onClick={openAdd}>
          <IconPlus size={16} /> Yeni Kategori
        </button>
      </div>

      <div className="page-content">
        <div className="card">
          <div className="table-wrap">
            {loading ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>Yükleniyor...</div>
            ) : categories.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>
                <IconTag size={32} color="#ddd" style={{ marginBottom: 8 }} />
                <div>Henüz kategori eklenmedi</div>
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Prefix</th>
                    <th>Kategori Adı</th>
                    <th>Açıklama</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {categories.map(c => (
                    <tr key={c.id}>
                      <td>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          background: 'rgba(232,93,4,.1)', color: '#E85D04',
                          padding: '4px 12px', borderRadius: 6, fontWeight: 700, fontSize: 13,
                          letterSpacing: 1,
                        }}>{c.prefix}</span>
                      </td>
                      <td style={{ fontWeight: 600 }}>{c.name}</td>
                      <td style={{ color: '#888' }}>{c.desc || '—'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-secondary btn-sm" onClick={() => openEdit(c)}><IconEdit size={13} /></button>
                          <button className="btn btn-sm" style={{ background: 'rgba(239,68,68,.1)', color: '#DC2626' }} onClick={() => remove(c.id!)}><IconTrash size={13} /></button>
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

      {open && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setOpen(false)}>
          <div className="modal-box" style={{ maxWidth: 440 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700 }}>{editing ? 'Kategori Düzenle' : 'Yeni Kategori'}</h3>
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#aaa' }}><IconX size={20} /></button>
            </div>

            <div className="form-group">
              <label className="form-label">Kategori Adı *</label>
              <input className="form-input" value={form.name} onChange={e => handleNameChange(e.target.value)} placeholder="Sırt Çantaları" />
            </div>

            <div className="form-group">
              <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Prefix (Otomatik)</span>
                <label style={{ fontWeight: 400, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <input type="checkbox" checked={prefixManual} onChange={e => setPrefixManual(e.target.checked)} />
                  Manuel
                </label>
              </label>
              <input
                className="form-input"
                value={form.prefix}
                onChange={e => setForm(f => ({ ...f, prefix: e.target.value.toUpperCase() }))}
                placeholder="SÇ"
                readOnly={!prefixManual}
                style={{ fontFamily: 'monospace', fontWeight: 700, letterSpacing: 2, background: !prefixManual ? '#f8f8f8' : undefined }}
              />
              {!prefixManual && <div style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>Kategori adından otomatik oluşturulur</div>}
            </div>

            <div className="form-group">
              <label className="form-label">Açıklama</label>
              <input className="form-input" value={form.desc} onChange={e => setForm(f => ({ ...f, desc: e.target.value }))} placeholder="Opsiyonel açıklama" />
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setOpen(false)}>İptal</button>
              <button className="btn btn-primary" onClick={save} disabled={saving || !form.name.trim()}>
                {saving ? 'Kaydediliyor...' : editing ? 'Güncelle' : 'Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
