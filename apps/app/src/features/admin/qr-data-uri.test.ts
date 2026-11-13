import { qrDataUri } from './qr-data-uri';

const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 2"><path fill="#000000" d="M0 0h1v1H0z"/></svg>';

describe('qrDataUri', () => {
  it("percent-encodes Supabase's raw SVG data URI", () => {
    const uri = qrDataUri(`data:image/svg+xml;utf-8,${svg}`);
    expect(uri.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true);
    expect(uri).not.toMatch(/[<>"#]/);
    expect(decodeURIComponent(uri.slice(uri.indexOf(',') + 1))).toBe(svg);
  });

  it('leaves base64, already encoded and other values as they are', () => {
    expect(qrDataUri('data:image/svg+xml;base64,PHN2Zy8+')).toBe(
      'data:image/svg+xml;base64,PHN2Zy8+',
    );
    const encoded = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    expect(qrDataUri(encoded)).toBe(encoded);
    expect(qrDataUri('https://example.com/qr.png')).toBe('https://example.com/qr.png');
  });
});
