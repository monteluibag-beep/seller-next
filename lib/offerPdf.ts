import type { Offer } from '@/types';

type Currency = 'TRY' | 'USD' | 'EUR' | 'GBP';
const CURRENCY_SYMBOLS: Record<Currency, string> = { TRY: '₺', USD: '$', EUR: '€', GBP: '£' };

export interface FirmInfo {
  name: string;
  address: string;
  phone: string;
  email: string;
  terms: string;
  bankInfo?: string;
  invoiceInfo?: string;
  logoDataUrl?: string;
}

function fmtDate(ts: unknown): string {
  if (!ts) return '—';
  const d = (ts as { toDate?: () => Date }).toDate?.() ?? new Date(ts as string);
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtNum(n: number): string {
  return n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function generateOfferHtml(offer: Offer, firm: FirmInfo): string {
  const cur = ((offer as Offer & { currency?: Currency }).currency) ?? 'TRY';
  const sym = CURRENCY_SYMBOLS[cur] ?? '₺';
  const dr  = (offer as Offer & { discountRate?: number }).discountRate ?? 0;
  const sub = offer.items.reduce((s, i) => s + (i.listPrice ?? 0) * i.qty, 0);

  const logoHtml = firm.logoDataUrl
    ? `<img src="${firm.logoDataUrl}" alt="${esc(firm.name)}" style="height:44px;object-fit:contain;display:block;">`
    : `<div style="font-size:20px;font-weight:800;color:#E85D04;">${esc(firm.name)}</div>`;

  const contactParts = [
    firm.address ? esc(firm.address).replace(/\n/g, ' · ') : '',
    firm.phone   ? `Tel: ${esc(firm.phone)}`  : '',
    firm.email   ? esc(firm.email) : '',
  ].filter(Boolean);
  const contactHtml = contactParts.map(p => `<div>${p}</div>`).join('');

  /* ---- product rows ---- */
  const rows = offer.items.map(item => {
    const unit  = item.finalPrice ?? item.listPrice ?? 0;
    const total = unit * item.qty;
    const disc  = item.discountRate ?? 0;
    const imgHtml = item.photo
      ? `<img src="${item.photo}" alt="${esc(item.name)}" style="width:44px;height:44px;object-fit:cover;border-radius:5px;display:block;flex-shrink:0;">`
      : `<div style="width:44px;height:44px;border-radius:5px;background:#F0F0F0;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
           <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#CCC" stroke-width="1.5">
             <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
             <polyline points="21 15 16 10 5 21"/>
           </svg>
         </div>`;
    return `
      <tr>
        <td>
          <div style="display:flex;align-items:center;gap:10px;">
            ${imgHtml}
            <span style="font-weight:600;font-size:12px;">${esc(item.name)}</span>
          </div>
        </td>
        <td class="c">${item.qty}</td>
        <td class="r">${sym}${fmtNum(item.listPrice ?? 0)}</td>
        <td class="c" style="color:${disc > 0 ? '#16A34A' : '#999'};">${disc > 0 ? `%${disc}` : '—'}</td>
        <td class="r fw">${sym}${fmtNum(unit)}</td>
        <td class="r fw">${sym}${fmtNum(total)}</td>
      </tr>`;
  }).join('');

  const discountRows = dr > 0 ? `
    <tr class="sub-row">
      <td colspan="5" class="r" style="color:#555;">Ara Toplam</td>
      <td class="r" style="color:#555;">${sym}${fmtNum(sub)}</td>
    </tr>
    <tr class="sub-row">
      <td colspan="5" class="r" style="color:#16A34A;">İskonto (%${dr})</td>
      <td class="r" style="color:#16A34A;">-${sym}${fmtNum(sub - offer.total)}</td>
    </tr>` : '';

  const termsHtml = firm.terms ? `
    <div class="info-section">
      <div class="info-section-title">Koşullar ve Notlar</div>
      <div style="font-size:11px;color:#555;line-height:1.7;">${esc(firm.terms).replace(/\n/g, '<br>')}</div>
    </div>` : '';

  const noteHtml = offer.note ? `
    <div class="note-box">
      <strong>Not:</strong> ${esc(offer.note)}
    </div>` : '';

  /* ---- bank + invoice info ---- */
  const hasBankOrInvoice = (firm.bankInfo && firm.bankInfo.trim()) || (firm.invoiceInfo && firm.invoiceInfo.trim());
  const bottomInfoHtml = hasBankOrInvoice ? `
    <div class="bottom-info-grid">
      ${firm.bankInfo?.trim() ? `
      <div class="info-section">
        <div class="info-section-inner">
          <div class="info-section-title">Hesap Bilgilerimiz</div>
          <div style="font-family:monospace;font-size:10.5px;color:#444;line-height:1.8;white-space:pre-wrap;">${esc(firm.bankInfo.trim())}</div>
        </div>
      </div>` : '<div class="info-section"></div>'}
      ${firm.invoiceInfo?.trim() ? `
      <div class="info-section">
        <div class="info-section-inner">
          <div class="info-section-title">Fatura Bilgilerimiz</div>
          <div style="font-size:10.5px;color:#444;line-height:1.8;white-space:pre-wrap;">${esc(firm.invoiceInfo.trim())}</div>
        </div>
      </div>` : '<div class="info-section"></div>'}
    </div>` : '';

  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <title>Teklif ${esc(offer.no)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 12px;
      color: #222;
      background: #fff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    @page {
      size: A4;
      margin: 14mm 14mm 16mm 14mm;
    }

    /* Screen preview wrapper */
    @media screen {
      body { background: #e8e8e8; padding: 28px 0 40px; }
      .a4 {
        width: 210mm;
        min-height: 297mm;
        margin: 0 auto;
        background: #fff;
        box-shadow: 0 6px 32px rgba(0,0,0,.18);
        padding: 14mm 14mm 18mm;
      }
    }

    /* Print: natural flow, @page handles margins */
    @media print {
      body { background: #fff; padding: 0; }
      .a4  { width: 100%; padding: 0; }
    }

    /* ── Header ── */
    .doc-header {
      display: table;
      width: 100%;
      border-bottom: 2.5px solid #E85D04;
      padding-bottom: 10px;
      margin-bottom: 12px;
    }
    .doc-header-left  { display: table-cell; vertical-align: middle; width: 60%; }
    .doc-header-right { display: table-cell; vertical-align: middle; text-align: right; }
    .firm-contact { font-size: 10px; color: #666; line-height: 1.65; margin-top: 5px; }
    .offer-badge .title { font-size: 22px; font-weight: 800; color: #E85D04; line-height: 1; }
    .offer-badge .no    { font-size: 12px; color: #444; margin-top: 3px; font-weight: 700; }
    .offer-badge .date  { font-size: 10px; color: #888; margin-top: 2px; }
    .offer-badge .cur   { font-size: 10px; color: #E85D04; margin-top: 3px; font-weight: 700; letter-spacing: .5px; }

    /* ── Info box ── */
    .info-box {
      display: table;
      width: 100%;
      background: #F5F5F5;
      border-radius: 5px;
      padding: 9px 12px;
      margin-bottom: 14px;
    }
    .info-box-row { display: table-row; }
    .info-cell { display: table-cell; width: 25%; padding: 0 6px; border-right: 1px solid #E0E0E0; }
    .info-cell:first-child { padding-left: 0; }
    .info-cell:last-child  { border-right: none; }
    .info-label { font-size: 9px; font-weight: 700; color: #999; text-transform: uppercase; letter-spacing: .4px; margin-bottom: 2px; }
    .info-value { font-size: 12px; font-weight: 700; color: #222; }

    /* ── Table ── */
    table { width: 100%; border-collapse: collapse; margin-bottom: 0; }
    thead tr { background: #EEEEEE; }
    th {
      padding: 7px 8px;
      font-size: 9px;
      font-weight: 700;
      color: #555;
      text-transform: uppercase;
      letter-spacing: .3px;
    }
    td {
      padding: 7px 8px;
      border-bottom: 1px solid #EEEEEE;
      font-size: 11.5px;
      vertical-align: middle;
    }
    tbody tr:nth-child(even) td { background: #FAFAFA; }
    .c  { text-align: center; }
    .r  { text-align: right; }
    .fw { font-weight: 700; }
    .sub-row td { border: none; padding: 3px 8px; font-size: 11px; background: #fff !important; }

    /* ── Totals ── */
    .total-wrap { text-align: right; margin: 8px 0 14px; }
    .total-box {
      display: inline-block;
      background: #E85D04;
      color: #fff;
      border-radius: 5px;
      padding: 8px 16px;
    }
    .total-label  { font-size: 9px; font-weight: 700; letter-spacing: .6px; opacity: .85; }
    .total-amount { font-size: 16px; font-weight: 800; }

    /* ── Note / Terms ── */
    .note-box {
      background: #FAFAFA;
      border: 1px solid #DDD;
      border-radius: 4px;
      padding: 7px 11px;
      margin-bottom: 9px;
      font-size: 11px;
      color: #444;
      line-height: 1.6;
    }

    /* ── Bottom info grid (bank + invoice) ── */
    .bottom-info-grid {
      display: table;
      width: 100%;
      margin-top: 12px;
    }
    .bottom-info-grid .info-section {
      display: table-cell;
      width: 50%;
      vertical-align: top;
      padding-right: 8px;
    }
    .bottom-info-grid .info-section:last-child { padding-right: 0; padding-left: 8px; }
    .info-section-inner {
      border: 1px solid #E8E8E8;
      border-radius: 5px;
      padding: 9px 11px;
      background: #FAFAFA;
    }
    .info-section-title {
      font-size: 9px;
      font-weight: 700;
      color: #E85D04;
      text-transform: uppercase;
      letter-spacing: .5px;
      margin-bottom: 5px;
      padding-bottom: 4px;
      border-bottom: 1px solid #E8E8E8;
    }

    /* Terms section */
    .terms-section {
      margin-top: 10px;
      border: 1px solid #FCD34D;
      border-radius: 5px;
      padding: 9px 12px;
      background: #FFFBEB;
    }
    .terms-section .info-section-title { color: #92400E; border-bottom-color: #FCD34D; }

    /* ── Footer ── */
    .footer {
      margin-top: 18px;
      padding-top: 8px;
      border-top: 1px solid #DDD;
      display: table;
      width: 100%;
      font-size: 9px;
      color: #999;
    }
    .footer-cell { display: table-cell; }
    .footer-cell:last-child { text-align: right; }
    .footer-cell:nth-child(2) { text-align: center; }

    /* Print helpers */
    @media print {
      table { page-break-inside: auto; }
      tr    { page-break-inside: avoid; page-break-after: auto; }
      thead { display: table-header-group; }
      tfoot { display: table-footer-group; }
    }
  </style>
</head>
<body>
  <div class="a4">

    <!-- Header -->
    <div class="doc-header">
      <div class="doc-header-left">
        ${logoHtml}
        <div class="firm-contact">${contactHtml}</div>
      </div>
      <div class="doc-header-right">
        <div class="offer-badge">
          <div class="title">TEKLİF</div>
          <div class="no">${esc(offer.no)}</div>
          <div class="date">${fmtDate(offer.date)}</div>
          ${cur !== 'TRY' ? `<div class="cur">${cur} CİNSİNDEN</div>` : ''}
        </div>
      </div>
    </div>

    <!-- Customer info box -->
    <div class="info-box">
      <div class="info-box-row">
        <div class="info-cell">
          <div class="info-label">Müşteri</div>
          <div class="info-value">${esc(offer.customer)}</div>
        </div>
        <div class="info-cell">
          <div class="info-label">Teklif No</div>
          <div class="info-value">${esc(offer.no)}</div>
        </div>
        <div class="info-cell">
          <div class="info-label">Hazırlayan</div>
          <div class="info-value">${esc(offer.by)}</div>
        </div>
        <div class="info-cell">
          <div class="info-label">Tarih</div>
          <div class="info-value">${fmtDate(offer.date)}</div>
        </div>
      </div>
    </div>

    <!-- Products table -->
    <table>
      <thead>
        <tr>
          <th>Ürün</th>
          <th class="c">Adet</th>
          <th class="r">Liste (${sym})</th>
          <th class="c">İskonto</th>
          <th class="r">Birim (${sym})</th>
          <th class="r">Tutar (${sym})</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
        ${discountRows}
      </tbody>
    </table>

    <!-- Grand total -->
    <div class="total-wrap">
      <div class="total-box">
        <div class="total-label">GENEL TOPLAM</div>
        <div class="total-amount">${sym}${fmtNum(offer.total)}</div>
      </div>
    </div>

    ${noteHtml}
    ${termsHtml}
    ${bottomInfoHtml}

    <!-- Footer -->
    <div class="footer">
      <div class="footer-cell">${esc(firm.name)}</div>
      <div class="footer-cell">${firm.email ? esc(firm.email) : ''}</div>
      <div class="footer-cell">${firm.phone ? esc(firm.phone) : ''}</div>
    </div>
  </div>
</body>
</html>`;
}
