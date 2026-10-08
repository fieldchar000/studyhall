// A studyhall://invite/CODE link was opened. Signed out: go to sign-up with the code filled in.
// Signed in: confirm, then become friends / join the server.

import { useEffect, useState } from 'react'
import type { InviteCheck } from '@shared/cloud'
import { api, notifyChanged } from '@/lib/data'
import { useCloud, usePendingInvite } from '@/lib/cloud'
import { navigate } from '@/lib/nav'
import { Modal } from './ui'

export function InviteLinkHandler(): React.JSX.Element | null {
  const c = useCloud()
  const [code, clear] = usePendingInvite()
  const [info, setInfo] = useState<InviteCheck | null>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!code || !c) return
    if (!c.signedIn) {
      navigate({ name: 'settings' }) // AccountCard picks the code up and opens "Create account"
      return
    }
    void api.cloud.checkInvite(code).then(setInfo)
  }, [code, c?.signedIn]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!code || !c?.signedIn || !info) return null
  const close = (): void => {
    setInfo(null)
    setErr('')
    clear()
  }
  const accept = async (): Promise<void> => {
    try {
      const r = await api.cloud.redeem(code)
      notifyChanged('cloud:friendships')
      notifyChanged('cloud:server_members')
      close()
      navigate(r.kind === 'server' && r.server_id ? { name: 'servers', serverId: r.server_id } : { name: 'friends' })
    } catch (e) {
      setErr(String(e instanceof Error ? e.message : e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
    }
  }
  return (
    <Modal title="Invite" onClose={close}>
      <div className="flex flex-col gap-3 text-sm">
        {info.valid ? (
          <p>{info.kind === 'server' ? `Join the server “${info.server}”?` : `Add ${info.inviter ?? 'this person'} as a friend?`}</p>
        ) : (
          <p className="text-danger">This invite is invalid, expired or already used up.</p>
        )}
        {err && <p className="text-danger">{err}</p>}
        <div className="flex justify-end gap-2">
          <button className="btn" onClick={close}>
            {info.valid ? 'Cancel' : 'Close'}
          </button>
          {info.valid && (
            <button className="btn-primary" onClick={() => void accept()}>
              {info.kind === 'server' ? 'Join' : 'Add friend'}
            </button>
          )}
        </div>
      </div>
    </Modal>
  )
}
