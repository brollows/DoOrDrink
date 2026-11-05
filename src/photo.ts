/** Profile photos: cropped to a square and shrunk on the phone before they are sent. */

/** Width and height of a stored photo. Sharp enough for the big winner photo, small enough to send quickly. */
const size = 256;
const quality = 0.8;
/** Same limit as set_photo on the server. */
const maxLength = 120000;
const storageKey = 'do-or-drink-photo';

/** Crops the middle square of an image file and returns it as a small JPEG data URL. */
export async function photoFromFile(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    try { await image.decode(); } catch { throw new Error('Kunne ikke lese bildet. Prøv et annet.'); }
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const context = canvas.getContext('2d')!;
    // Transparent images (PNG) get the app background instead of black.
    context.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--panel').trim() || '#000';
    context.fillRect(0, 0, size, size);
    context.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 0, 0, size, size);
    for (const q of [quality, 0.6, 0.4]) {
      const photo = canvas.toDataURL('image/jpeg', q);
      if (photo.length <= maxLength) return photo;
    }
    throw new Error('Bildet er for stort. Prøv et annet.');
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** The last photo chosen on this device, so the join form can suggest it next time. */
export function savedPhoto(): string | null {
  try { return localStorage.getItem(storageKey); } catch { return null; }
}
export function savePhoto(photo: string | null) {
  try {
    if (photo) localStorage.setItem(storageKey, photo);
    else localStorage.removeItem(storageKey);
  } catch { /* The photo is still used for this game. */ }
}
