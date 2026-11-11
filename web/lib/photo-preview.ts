/** Resize locally before storing/uploading; never fetch arbitrary remote image URLs. */
export async function photoPreview(file: File, lowData: boolean): Promise<string> {
  const bitmap = await createImageBitmap(file);
  try {
    const edge = lowData ? 640 : 1280;
    const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image processing unavailable');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', lowData ? 0.65 : 0.82);
  } finally {
    bitmap.close();
  }
}
