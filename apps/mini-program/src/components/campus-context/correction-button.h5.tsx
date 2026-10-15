import { useState } from 'react'
import { createPortal } from 'react-dom'
import { campusRepository } from '../../features/campus/campus.repository.h5'
import { createClientActionId } from '../../features/product/product.repository'
import { readSession } from '../../features/product/session'
import { useOverlayFocus } from '../overlay-focus'
import './index.h5.scss'
export function MatchCorrectionButton({ matchId }: { matchId: string }) {
  const [open, setOpen] = useState(false),
    [records, setRecords] = useState<Array<{ id: string; version: number; reporterName: string }>>(
      [],
    ),
    [revision, setRevision] = useState(''),
    [field, setField] = useState('score'),
    [description, setDescription] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(false),
    [actionId] = useState(() => createClientActionId('correction'))
  useOverlayFocus(open, '.campus-correction', () => setOpen(false))
  if (!readSession()) return null
  async function show() {
    setOpen(true)
    setError('')
    try {
      const data = await campusRepository.correctionContext(matchId)
      setRecords(data.records)
      setRevision(data.records[0]?.id ?? '')
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : '报告记录读取失败')
    }
  }
  async function submit() {
    if (!revision || description.trim().length < 8 || busy) return
    setBusy(true)
    try {
      await campusRepository.correct(
        matchId,
        {
          reportRevisionId: revision,
          errorKey: field,
          description: description.trim(),
          evidence: [],
        },
        actionId,
      )
      setDone(true)
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : '提交失败')
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <button
        data-campus-button
        className="campus-correction-entry"
        type="button"
        onClick={() => void show()}
      >
        比赛信息有误？提交纠错
      </button>
      {open &&
        createPortal(
          <div className="campus-modal-backdrop">
            <section
              className="campus-dialog campus-correction"
              role="dialog"
              aria-modal="true"
              aria-labelledby="campus-correction-title"
              tabIndex={-1}
            >
              <header>
                <div>
                  <span className="campus-eyebrow">让记录更准确</span>
                  <h2 id="campus-correction-title">比赛信息纠错</h2>
                </div>
                <button
                  data-campus-button
                  type="button"
                  className="campus-icon-button"
                  aria-label="关闭纠错窗口"
                  onClick={() => setOpen(false)}
                >
                  ×
                </button>
              </header>
              {done ? (
                <p>已提交，总管理员会核对报告与证据。确认前不会扣除信息员分数。</p>
              ) : (
                <>
                  <p className="campus-muted">
                    请写清具体问题和你核对的依据。同一版本的相同问题会合并处理。
                  </p>
                  {error && (
                    <p className="campus-error" role="alert">
                      {error}
                    </p>
                  )}
                  {records.length ? (
                    <>
                      <label data-campus-label className="campus-field">
                        报告版本
                        <select value={revision} onChange={(e) => setRevision(e.target.value)}>
                          {records.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.reporterName} · 第{r.version}版
                            </option>
                          ))}
                        </select>
                      </label>
                      <label data-campus-label className="campus-field">
                        信息位置
                        <select value={field} onChange={(e) => setField(e.target.value)}>
                          <option value="score">比分与比赛结果</option>
                          <option value="goal">进球或助攻</option>
                          <option value="lineup">名单与出场</option>
                          <option value="card">红黄牌</option>
                          <option value="other">其他信息</option>
                        </select>
                      </label>
                      <label data-campus-label className="campus-field">
                        问题与核对依据
                        <textarea
                          data-campus-input
                          value={description}
                          maxLength={2000}
                          minLength={8}
                          onChange={(e) => setDescription(e.target.value)}
                          placeholder="例如：第20分钟进球者应为7号，现场记录和视频均可核对。"
                        />
                      </label>
                      <footer>
                        <button
                          data-campus-button
                          type="button"
                          className="campus-secondary"
                          onClick={() => setOpen(false)}
                        >
                          取消
                        </button>
                        <button
                          data-campus-button
                          type="button"
                          disabled={busy || description.trim().length < 8}
                          onClick={() => void submit()}
                        >
                          {busy ? '正在提交…' : '提交核实'}
                        </button>
                      </footer>
                    </>
                  ) : (
                    <p>本场暂时没有可供纠错的信息员提交记录。</p>
                  )}
                </>
              )}
            </section>
          </div>,
          document.body,
        )}
    </>
  )
}
