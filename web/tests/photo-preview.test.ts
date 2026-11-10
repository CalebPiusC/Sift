import { it, expect, vi, afterEach } from 'vitest';
import { photoPreview } from '../lib/photo-preview';
afterEach(() => vi.restoreAllMocks());
it.each([
  [true, 640, 0.65],
  [false, 1280, 0.82],
] as const)(
  'resizes locally in lowData=%s and closes decoded bitmap',
  async (low, edge, quality) => {
    const close = vi.fn();
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValue({ width: 2400, height: 1200, close }),
    );
    const draw = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      fillStyle: '',
      fillRect: vi.fn(),
      drawImage: draw,
    } as never);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(function (
      this: HTMLCanvasElement,
      type,
      q,
    ) {
      expect(this.width).toBe(edge);
      expect(this.height).toBe(edge / 2);
      expect(type).toBe('image/jpeg');
      expect(q).toBe(quality);
      return 'data:image/jpeg;base64,ok';
    });
    expect(await photoPreview(new File(['x'], 'test.png', { type: 'image/png' }), low)).toContain(
      'image/jpeg',
    );
    expect(draw).toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
    vi.unstubAllGlobals();
  },
);
it('fails safely when processing unavailable and still releases bitmap', async () => {
  const close = vi.fn();
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 100, height: 50, close }));
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  await expect(photoPreview(new File(['x'], 'x.png'), true)).rejects.toThrow('unavailable');
  expect(close).toHaveBeenCalled();
  vi.unstubAllGlobals();
});
