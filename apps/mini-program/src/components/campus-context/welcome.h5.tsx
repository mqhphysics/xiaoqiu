import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { campusRepository, type CampusProfile } from '../../features/campus/campus.repository.h5'
import { readSession } from '../../features/product/session'
import { productRepository } from '../../features/product/product.repository'
import { identityEntryActions } from '../../features/identity/entry-actions.h5'
import { useOverlayFocus } from '../overlay-focus'

const skipped = new Set<string>()
const steps = [
  {
    number: '01',
    title: '当前赛季：绿茵杯',
    body: '平台默认展示正在进行的 2026 绿茵杯。新生杯、计科杯等其他杯赛由赛事方在管理端切换发布。',
  },
  {
    number: '02',
    title: '你的资料，各有归属',
    body: '姓名和学号属于学生档案；昵称、头像和背景属于账号。成为球员后，还能维护球员照片与足球资料。',
  },
  {
    number: '03',
    title: '让每一次记录都有依据',
    body: '球队名单和比赛记录按赛季保存。队长、教练和信息员是经过确认的附属身份，你可以在“我的身份”查看或申请。',
  },
] as const
export function CampusWelcome() {
  const token = readSession()?.accessToken,
    id = readSession()?.user.id
  const [profile, setProfile] = useState<CampusProfile | null>(null),
    [step, setStep] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  useEffect(() => {
    let current = true
    setProfile(null)
    if (token && id && !skipped.has(id))
      campusRepository
        .me()
        .then((value) => {
          if (current) setProfile(value)
        })
        .catch(() => {})
    return () => {
      current = false
    }
  }, [token, id])
  const tutorial = !!profile && !profile.onboardingCompletedAt
  const candidate =
    profile?.onboardingCompletedAt && !profile.playerOfferDismissedAt
      ? profile.playerCandidate
      : null
  const open = tutorial || !!candidate
  function close() {
    if (id) skipped.add(id)
    setProfile(null)
  }
  useOverlayFocus(open, '.campus-welcome', close)
  async function save(action: string) {
    if (!profile || busy) return
    setBusy(true)
    setError('')
    try {
      await campusRepository.onboarding(action, candidate?.id)
      if (action === 'CONFIRM_PLAYER') {
        const user = await productRepository.getMe()
        window.dispatchEvent(new CustomEvent('xiaoqiu:identity:changed', { detail: user }))
      }
      setProfile(await campusRepository.me())
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : '保存失败，请重试')
    } finally {
      setBusy(false)
    }
  }
  if (!open) return null
  const current = steps[step]!
  return createPortal(
    <div className="campus-modal-backdrop">
      <section
        className="campus-dialog campus-welcome"
        role="dialog"
        aria-modal="true"
        aria-labelledby="campus-welcome-title"
        tabIndex={-1}
      >
        <header>
          <div>
            <span className="campus-eyebrow">{tutorial ? '欢迎来到晓球' : '找到你的球员档案'}</span>
            <h2 id="campus-welcome-title">{tutorial ? current.title : '这是你的球员身份吗？'}</h2>
          </div>
          <button
            data-campus-button
            className="campus-icon-button"
            type="button"
            aria-label="稍后查看"
            onClick={close}
          >
            ×
          </button>
        </header>
        {tutorial ? (
          <>
            <div className="campus-welcome__step" aria-label={`第${step + 1}步，共3步`}>
              <span>{current.number}</span>
              <div className="campus-welcome__progress">
                {steps.map((s, n) => (
                  <i key={s.number} className={n === step ? 'is-current' : ''} />
                ))}
              </div>
            </div>
            <p className="campus-welcome__copy">{current.body}</p>
          </>
        ) : candidate ? (
          <div className="campus-welcome__identity">
            {candidate.portraitUrl && (
              <img
                src={
                  candidate.portraitUrl.startsWith('/api/')
                    ? `${(process.env.TARO_APP_API_BASE_URL ?? '').replace(/\/api\/?$/, '')}${candidate.portraitUrl}`
                    : candidate.portraitUrl
                }
                alt="球员照片"
              />
            )}
            <div>
              <strong>{candidate.name}</strong>
              <p>
                {profile?.studentRecord?.collegeName} · {profile?.studentRecord?.academicYear}
              </p>
              <p>已与核验过的学生档案匹配。确认后，你可以查看和维护自己的球员资料。</p>
            </div>
          </div>
        ) : null}
        {error && (
          <p className="campus-error" role="alert">
            {error}
          </p>
        )}
        <footer>
          {tutorial ? (
            <>
              <button
                data-campus-button
                type="button"
                className="campus-secondary"
                onClick={() => (step ? setStep(step - 1) : close())}
              >
                {step ? '上一步' : '稍后了解'}
              </button>
              <button
                data-campus-button
                type="button"
                disabled={busy}
                onClick={() => (step < 2 ? setStep(step + 1) : void save('TUTORIAL_COMPLETE'))}
              >
                {busy ? '正在保存…' : step < 2 ? '下一步' : '开始使用'}
              </button>
            </>
          ) : (
            <>
              <button
                data-campus-button
                type="button"
                className="campus-secondary"
                disabled={busy}
                onClick={() => void save('DISMISS_PLAYER')}
              >
                稍后确认
              </button>
              <button
                data-campus-button
                type="button"
                disabled={busy}
                onClick={() => void save('CONFIRM_PLAYER')}
              >
                {busy ? '正在关联…' : '确认是我'}
              </button>
            </>
          )}
        </footer>
        {!tutorial && (
          <p className="campus-footnote">
            资料不符？
            <button
              data-campus-button
              type="button"
              onClick={() => {
                close()
                void identityEntryActions.identity()
              }}
            >
              申请核验
            </button>
          </p>
        )}
      </section>
    </div>,
    document.body,
  )
}
