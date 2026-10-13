// Photos for the journal and shared memories: resized on this PC (max 1600px JPEG), saved into
// the app's data folder, and shown through the private material:// address.

import type { Photo } from '@shared/types'
import { api, db } from './data'

export const photoSrc = (p: Pick<Photo, 'id'>): string => `material://local/${p.id}/photo`

async function shrink(file: File, max = 1600): Promise<{ data: Uint8Array; width: number; height: number }> {
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const width = Math.round(bmp.width * scale)
  const height = Math.round(bmp.height * scale)
  const canvas = new OffscreenCanvas(width, height)
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, width, height)
  bmp.close()
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.86 })
  return { data: new Uint8Array(await blob.arrayBuffer()), width, height }
}

/** Add pictures (from a file picker or a drop) to a journal day or a memory. */
export async function addPhotos(files: File[], parent_table: Photo['parent_table'], parent_id: string, startSort = 0): Promise<number> {
  let n = 0
  // Some drops arrive without a type, so the file name counts too.
  const pictures = files.filter((f) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|bmp|avif)$/i.test(f.name))
  for (const file of pictures.slice(0, 30)) {
    const img = await shrink(file).catch(() => null)
    if (!img) continue // not a picture this PC can read (e.g. some phone formats)
    const saved = await api.photos.save(img.data)
    await db.create('photos', { parent_table, parent_id, local_path: saved.local_path, size_bytes: saved.size_bytes, width: img.width, height: img.height, sort: startSort + n })
    n++
  }
  return n
}

/** Pictures in a paste (Ctrl+V of a copied image or screenshot). */
export function pastedImages(e: React.ClipboardEvent | ClipboardEvent): File[] {
  const items = [...(e.clipboardData?.items ?? [])]
  return items
    .filter((i) => i.kind === 'file' && i.type.startsWith('image/'))
    .map((i) => i.getAsFile())
    .filter((f): f is File => !!f)
    .map((f) => (f.name && f.name !== 'image.png' ? f : new File([f], `pasted-${Date.now()}.${f.type.split('/')[1] || 'png'}`, { type: f.type })))
}
