// Settings → Relationships: who shows on the Partner page and what to call them.

import { db, useRows } from '@/lib/data'
import { navigate } from '@/lib/nav'
import { setPartner, useProfile } from '@/lib/profile'
import { PARTNER_LABELS } from '@/lib/peopleContent'
import { createPerson } from '@/pages/People'

export function RelationshipsCard(): React.JSX.Element | null {
  const profile = useProfile()
  const people = useRows('people', { archived: 0 }, 'sort') ?? []
  if (!profile) return null
  const partner = people.find((p) => p.id === profile.partner_id)
  return (
    <section className="card mb-4 p-5">
      <h2 className="mb-1 font-semibold">Relationships</h2>
      <p className="mb-3 text-sm text-muted">Choose who appears on the Partner page in Life, and what the tab is called.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          Partner
          <select
            className="field-boxed"
            value={profile.partner_id ?? ''}
            onChange={async (e) => {
              const v = e.target.value
              if (v === 'new') {
                const p = await createPerson('partner')
                await setPartner({ partner_id: p.id })
                navigate({ name: 'people', id: p.id })
              } else {
                if (v) await db.update('people', v, { kind: 'partner' })
                await setPartner({ partner_id: v || null })
              }
            }}
          >
            <option value="">Nobody (hide the details)</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name || 'Unnamed'}
              </option>
            ))}
            <option value="new">＋ Add someone new…</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Call them my
          <select className="field-boxed" value={profile.partner_label || 'Partner'} onChange={(e) => void setPartner({ partner_label: e.target.value })}>
            {PARTNER_LABELS.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </label>
        {partner && (
          <label className="flex flex-col gap-1 text-sm">
            Together since
            <input type="date" className="field-boxed" value={partner.anniversary ?? ''} onChange={(e) => void db.update('people', partner.id, { anniversary: e.target.value || null })} />
          </label>
        )}
      </div>
    </section>
  )
}
