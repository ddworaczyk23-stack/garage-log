/**
 * Hand a file to the user. In a browser: an <a download>. In the store app
 * (`--mode capacitor`) a webview ignores blob downloads, so the file is written
 * to the app's cache and handed to the native share sheet ("Save to Files",
 * AirDrop, Drive, Quick Look). Resolves false when the user cancels the sheet.
 */
export async function saveFile(blob: Blob, filename: string): Promise<boolean> {
  if (import.meta.env.MODE === 'capacitor') {
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([
      import('@capacitor/filesystem'),
      import('@capacitor/share'),
    ])
    // ponytail: whole file goes over the bridge as base64; stream it if a
    // backup with many photos gets too big for memory.
    const { uri } = await Filesystem.writeFile({
      path: filename,
      data: await toBase64(blob),
      directory: Directory.Cache,
    })
    try {
      await Share.share({ title: filename, files: [uri] })
      return true
    } catch (err) {
      if (/cancel/i.test((err as Error).message)) return false
      throw err
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
  return true
}

/**
 * onClick for a blob link (`<a href={blobUrl} target="_blank">`). A webview
 * opens neither, so the store app routes the tap to the share sheet instead;
 * the browser keeps the plain link.
 */
export function openInApp(blob: Blob, filename: string): ((e: Event) => void) | undefined {
  if (import.meta.env.MODE !== 'capacitor') return undefined
  return (e) => {
    e.preventDefault()
    saveFile(blob, filename).catch((err) => console.error('[files] share failed', err))
  }
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',', 2)[1] ?? '')
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}
