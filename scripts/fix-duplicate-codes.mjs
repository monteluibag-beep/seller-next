// Firestore'daki çakışan stok kodlarını bulur ve düzeltir
// Çalıştırmak için: node scripts/fix-duplicate-codes.mjs
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Service account olmadığı için REST API ile çekeceğiz
// Bu script tarayıcıda çalışmak yerine admin key gerektirir.
// Bunun yerine tarayıcı konsolunda çalışacak kod üretelim.

console.log(`
=== Tarayıcı Konsolu Script'i ===

Aşağıdaki kodu seller.caliskancanta.com adresinde açık bir sayfada
tarayıcı geliştirici araçları konsoluna (F12 → Console) yapıştırın:

---

(async () => {
  const { getFirestore, collection, getDocs, updateDoc, doc } = await import('https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js');

  // Firebase zaten yüklü — window.__firebase_db veya app'den al
  // Uygulamanın kendi firebase instance'ını kullanalım
  const db = window._firebaseDb || (()=>{ throw new Error('db bulunamadı'); })();

  const snap = await getDocs(collection(db, 'products'));
  const products = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  // Çakışan kodları bul
  const codeMap = {};
  for (const p of products) {
    if (!p.code) continue;
    if (!codeMap[p.code]) codeMap[p.code] = [];
    codeMap[p.code].push(p);
  }

  const duplicates = Object.entries(codeMap).filter(([, arr]) => arr.length > 1);

  if (duplicates.length === 0) {
    console.log('✅ Çakışan stok kodu yok!');
    return;
  }

  console.log(\`⚠️ \${duplicates.length} çakışan kod bulundu:\`);
  for (const [code, arr] of duplicates) {
    console.log(\`  \${code}: \${arr.map(p => p.name).join(', ')}\`);
  }

  // Türkçe karakter temizleme
  function toAscii(str) {
    return str.toUpperCase()
      .replace(/Ç/g, 'C').replace(/ç/g, 'C')
      .replace(/Ğ/g, 'G').replace(/ğ/g, 'G')
      .replace(/İ/g, 'I').replace(/ı/g, 'I')
      .replace(/Ö/g, 'O').replace(/ö/g, 'O')
      .replace(/Ş/g, 'S').replace(/ş/g, 'S')
      .replace(/Ü/g, 'U').replace(/ü/g, 'U')
      .replace(/[^A-Z0-9-]/g, '');
  }

  // Her çakışmada ilk ürün kodunu koru, diğerlerine yeni sıra ver
  const allCodes = new Set(products.map(p => p.code).filter(Boolean));

  for (const [, arr] of duplicates) {
    // İlk ürün olduğu gibi kalır
    for (let i = 1; i < arr.length; i++) {
      const p = arr[i];
      const parts = p.code.split('-');
      const prefix = toAscii(parts[0]);
      const year = parts[1] || '26';

      // Boş sıra numarası bul
      let seq = 1;
      while (allCodes.has(\`\${prefix}-\${year}-\${String(seq).padStart(3,'0')}\`)) seq++;
      const newCode = \`\${prefix}-\${year}-\${String(seq).padStart(3,'0')}\`;

      allCodes.add(newCode);
      await updateDoc(doc(db, 'products', p.id), { code: newCode });
      console.log(\`✏️ \${p.name}: \${p.code} → \${newCode}\`);
    }
  }

  console.log('✅ Düzeltme tamamlandı. Sayfayı yenileyin.');
})();

---
`);
