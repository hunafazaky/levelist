import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef } from 'react'
import { db } from '../db/schema'
import { t } from '../i18n'
import { useObjectUrl } from './useObjectUrl'

export function ProofThumb({ proofId, label, onOpen }: { proofId: string; label: string; onOpen: () => void }) {
  const proof = useLiveQuery(() => db.proofs.get(proofId), [proofId])
  const url = useObjectUrl(proof?.blob)
  return (
    <button type="button" className="thumb" onClick={onOpen} aria-label={t('View proof for {label}', { label })}>
      {url ? <img src={url} alt="" /> : null}
    </button>
  )
}

export function ProofViewer({ proofId, title, onClose }: { proofId: string; title: string; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const proof = useLiveQuery(() => db.proofs.get(proofId), [proofId])
  const url = useObjectUrl(proof?.blob)

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  return (
    <dialog ref={dialogRef} className="sheet" onClose={onClose} aria-labelledby="viewer-title">
      <div className="sheet__body">
        <h2 id="viewer-title">{title}</h2>
        {url ? <img className="preview" src={url} alt={t('Proof photo for {title}', { title })} /> : null}
        <div className="actions">
          <span className="spacer" />
          <button type="button" className="btn" onClick={() => dialogRef.current?.close()}>
            {t('Close')}
          </button>
        </div>
      </div>
    </dialog>
  )
}
