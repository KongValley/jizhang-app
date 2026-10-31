import { useMemo } from 'react'
import { useStore } from '../store'
import { badgeProgressLabel, buildBadges, recordStreak, type Badge } from '../insights'
import { Dialog, ProgressBar, Sheet } from '../ui'
import { Icon } from '../icons'
import { cn } from '../utils'

export function AchievementsSheet({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const { data } = useStore()
  const badges = useMemo(() => buildBadges(data), [data])
  const streak = useMemo(() => recordStreak(data.transactions), [data.transactions])
  const unlocked = badges.filter((b) => b.unlocked).length

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="我的成就"
      subtitle="每一次记录，都值得被看见"
      className="sheet--tall"
    >
      <div className="sheet__body">
        <div className="ach-stats">
          <div>
            <span>连续记账</span>
            <b>
              {streak.current}
              <em>天</em>
            </b>
          </div>
          <div>
            <span>最长连续</span>
            <b>
              {streak.best}
              <em>天</em>
            </b>
          </div>
          <div>
            <span>累计天数</span>
            <b>
              {streak.totalDays}
              <em>天</em>
            </b>
          </div>
        </div>

        <div className="ach-overall">
          <div className="ach-overall__row">
            <span>
              已解锁 <b>{unlocked}</b> / {badges.length}
            </span>
            <span>{Math.round((unlocked / badges.length) * 100)}%</span>
          </div>
          <ProgressBar value={(unlocked / badges.length) * 100} />
        </div>

        <div className="badge-grid">
          {badges.map((badge) => (
            <div
              key={badge.id}
              className={cn('badge-card', badge.unlocked ? 'is-unlocked' : 'is-locked')}
            >
              <span
                className="badge-card__icon"
                style={
                  badge.unlocked
                    ? { background: `${badge.color}1a`, color: badge.color }
                    : undefined
                }
              >
                <Icon name={badge.icon} size={20} />
              </span>
              <div className="badge-card__body">
                <b>{badge.name}</b>
                <span>{badge.desc}</span>
                {!badge.unlocked && (
                  <ProgressBar value={badge.progress * 100} color={badge.color} />
                )}
                <em className={badge.unlocked ? 'is-unlocked' : undefined}>
                  {badgeProgressLabel(badge)}
                </em>
              </div>
            </div>
          ))}
        </div>

        <p className="ach-footnote">成就一旦解锁就会保留，断签或余额变化都不会收回。</p>
      </div>
    </Sheet>
  )
}

export function BadgeCelebration({
  badges,
  onClose,
}: {
  badges: Badge[]
  onClose: () => void
}) {
  return (
    <Dialog
      open={badges.length > 0}
      onClose={onClose}
      title="成就解锁"
      footer={
        <button className="btn btn--primary btn--block btn--tall" onClick={onClose}>
          收下这份成就
        </button>
      }
    >
      <div className="celebrate">
        <div className="celebrate__sparkles" aria-hidden="true">
          {Array.from({ length: 12 }).map((_, i) => (
            <i key={i} style={{ ['--i' as string]: i }} />
          ))}
        </div>
        <div className={cn('celebrate__badges', badges.length > 1 && 'is-multi')}>
          {badges.map((badge) => (
            <div key={badge.id} className="celebrate__badge">
              <span
                className="celebrate__icon"
                style={{ background: `${badge.color}1f`, color: badge.color }}
              >
                <Icon name={badge.icon} size={26} />
              </span>
              <b>{badge.name}</b>
              <em>{badge.desc}</em>
            </div>
          ))}
        </div>
        <p className="celebrate__quote">每一次记录，都在让生活更清晰。</p>
      </div>
    </Dialog>
  )
}
