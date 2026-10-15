/** Saves a Blob as a file through the browser's download. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Give the browser time to start the download before the URL goes away.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
