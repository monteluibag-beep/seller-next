'use client';
import { useEffect, useState } from 'react';
import { collection, getDocs, updateDoc, doc, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';

const OLD = 'TEKNİSYEN ÇANTA';
const NEW = 'TEKNİSYEN ÇANTASI';

export default function FixCatPage() {
  const [log, setLog] = useState<string[]>([]);
  const [done, setDone] = useState(false);

  useEffect(() => {
    async function run() {
      const msgs: string[] = [];

      const catSnap = await getDocs(collection(db, 'categories'));
      let catUpdated = 0;
      for (const d of catSnap.docs) {
        if (d.data().name === OLD) {
          await updateDoc(doc(db, 'categories', d.id), { name: NEW });
          catUpdated++;
        }
      }
      msgs.push(`Kategori belgesi: ${catUpdated} güncellendi`);

      const prodSnap = await getDocs(collection(db, 'products'));
      const batch = writeBatch(db);
      let prodUpdated = 0;
      for (const d of prodSnap.docs) {
        if (d.data().catName === OLD) {
          batch.update(doc(db, 'products', d.id), { catName: NEW });
          prodUpdated++;
        }
      }
      if (prodUpdated > 0) await batch.commit();
      msgs.push(`Ürünler: ${prodUpdated} güncellendi`);
      msgs.push('✅ Tamamlandı!');
      setLog(msgs);
      setDone(true);
    }
    run().catch(e => setLog([`❌ Hata: ${e.message}`]));
  }, []);

  return (
    <div style={{ padding: 40 }}>
      <h2>Kategori Düzeltme</h2>
      <p><b>{OLD}</b> → <b>{NEW}</b></p>
      {log.length === 0 && <p>Çalışıyor...</p>}
      {log.map((l, i) => <p key={i}>{l}</p>)}
      {done && <p style={{ color: 'green' }}>Bu sayfayı kapatabilirsiniz.</p>}
    </div>
  );
}
