import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type { Receipt } from '../data';
import { validReceipt } from '../data/receipt-share';
import { naira } from '../data/money';
export async function receiptPdf(
  receipt: Receipt,
  fontBytes: Uint8Array,
  sample: boolean,
): Promise<Uint8Array> {
  if (!validReceipt(receipt)) throw new Error('Invalid receipt totals or fields.');
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  // Full embedding avoids fontkit composite-glyph subset corruption in PDF renderers.
  const font = await doc.embedFont(fontBytes, { subset: false });
  const supported = new Set(font.getCharacterSet());
  doc.setTitle(`Receipt #${String(receipt.number).padStart(4, '0')} · ${receipt.vendorName}`);
  doc.setAuthor(receipt.vendorName);
  doc.setSubject(
    `Order ${receipt.orderId}${sample ? ' · SAMPLE DATA · Not proof of payment' : ''}`,
  );
  doc.setCreationDate(new Date(receipt.issuedAt));
  doc.setModificationDate(new Date(receipt.issuedAt));
  let page = doc.addPage([595.28, 841.89]);
  let y = 790;
  const ink = rgb(0.06, 0.09, 0.16),
    primary = rgb(0.26, 0.22, 0.79);
  function footer() {
    page.drawText(
      `${sample ? 'SAMPLE DATA · Not proof of payment · ' : ''}Read-only receipt · ${receipt.orderId}`,
      { x: 42, y: 28, size: 8, font, color: ink },
    );
  }
  function line(text: string, size = 11, color = ink) {
    // Wrap by actual embedded font widths, including very long names.
    if ([...text].some((ch) => !/[\r\n\t]/.test(ch) && !supported.has(ch.codePointAt(0)!)))
      throw new Error('Receipt contains characters not supported by the embedded font.');
    let row = '';
    for (const ch of text.replace(/[\r\n\t]/g, ' ')) {
      if (font.widthOfTextAtSize(row + ch, size) > 505 && row) {
        draw(row, size, color);
        row = '';
      }
      row += ch;
    }
    if (row) draw(row, size, color);
  }
  function draw(text: string, size: number, color: ReturnType<typeof rgb>) {
    if (y < 70) {
      footer();
      page = doc.addPage([595.28, 841.89]);
      y = 790;
    }
    page.drawText(text, { x: 42, y, size, font, color });
    y -= size + 9;
  }
  if (sample) line('SAMPLE DATA — NOT PROOF OF PAYMENT', 11, primary);
  line(receipt.vendorName, 22, primary);
  line(`Receipt #${String(receipt.number).padStart(4, '0')}`, 18);
  line(
    `Issued ${new Date(receipt.issuedAt).toLocaleString('en-NG', { timeZone: 'Africa/Lagos' })} (Lagos)`,
  );
  line(`Customer: ${receipt.customerName}`);
  line(`Order: ${receipt.orderId}`);
  y -= 15;
  for (const item of receipt.items) {
    line(`${item.quantity} × ${item.name}`, 12);
    if (item.variantName) line(item.variantName, 10);
    line(`${naira(item.unitPriceKobo)} each · ${naira(item.unitPriceKobo * item.quantity)}`, 10);
    y -= 6;
  }
  y -= 10;
  line(`Subtotal: ${naira(receipt.subtotalKobo)}`);
  line(`Delivery: ${naira(receipt.deliveryFeeKobo)}`);
  line(`TOTAL: ${naira(receipt.totalKobo)}`, 18, primary);
  line(
    `Payment verified: ${receipt.paymentSource === 'vendor' ? 'vendor bank check' : 'Paystack webhook'}`,
  );
  line('Thank you for shopping with us.');
  footer();
  return doc.save();
}
