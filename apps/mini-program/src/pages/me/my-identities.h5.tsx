import { useEffect, useState } from 'react'
import Taro from '@tarojs/taro'
import { productRepository } from '../../features/product/product.repository'
import type { AuthUser } from '../../features/product/product.types'
import {
  identityBadgeKinds,
  identityLabels,
  type IdentityBadgeKind,
} from '../../features/product/identity-badges'
import { openPlayer } from '../../features/product/player-navigation.h5'
import { openPerson } from '../../features/product/person-navigation.h5'
import { identityEntryActions } from '../../features/identity/entry-actions.h5'
import { SelfPlayerEditor } from '../../components/player-overlay/self-editor.h5'
import { SelfPersonEditor } from '../../components/person-overlay/self-editor.h5'
import { VerificationBadge } from '../../components/verification-badge/index.h5'
import { ProfileDialog } from './profile-dialog.h5'
import './my-identities.h5.scss'

export function MyIdentitiesDialog({
  user,
  tournamentId,
  onClose,
  onUserChange,
  onPersonal,
  onInformation,
  onTeam,
  onMatch,
  onManage,
}: {
  user: AuthUser
  tournamentId: string
  onClose: () => void
  onUserChange: (user: AuthUser) => void
  onPersonal: () => void
  onInformation: () => void
  onTeam: () => void
  onMatch: () => void
  onManage: () => void
}) {
  const initial = identityBadgeKinds(user.verificationLevel, user.roles)
  const [kinds, setKinds] = useState<IdentityBadgeKind[]>(initial.length ? initial : ['student'])
  const [selected, setSelected] = useState<IdentityBadgeKind>(initial[0] ?? 'student')
  const [editing, setEditing] = useState<'player' | 'coach' | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    void productRepository
      .getBadgePreference()
      .then((data) => {
        if (!active) return
        const available = data.availableKinds.length ? data.availableKinds : ['student' as const]
        setKinds(available)
        setSelected((value) => (available.includes(value) ? value : available[0]!))
      })
      .catch((issue) => {
        if (active) setError(issue.message)
      })
    return () => {
      active = false
    }
  }, [user.id, user.organizationId])
  const label =
    selected === 'student' && user.verificationLevel === 'UNVERIFIED'
      ? '学生'
      : identityLabels[selected]
  const open = (action: Promise<void>) => {
    onClose()
    void action.catch((issue) => Taro.showToast({ title: issue.message, icon: 'none' }))
  }
  return (
    <ProfileDialog title="我的身份" note="选择身份，查看或编辑对应资料。" onClose={onClose}>
      <div className="my-identities-tabs" role="tablist" aria-label="切换我的身份">
        {kinds.map((kind) => (
          <button
            key={kind}
            data-profile-button
            role="tab"
            id={`identity-tab-${kind}`}
            aria-selected={selected === kind}
            aria-controls="my-identity-content"
            onClick={() => setSelected(kind)}
          >
            {kind === 'student' && user.verificationLevel === 'UNVERIFIED'
              ? '学生'
              : identityLabels[kind]}
          </button>
        ))}
      </div>
      {error && (
        <p className="profile-error" role="alert">
          {error}
        </p>
      )}
      <div
        className="my-identity-content"
        id="my-identity-content"
        role="tabpanel"
        aria-labelledby={`identity-tab-${selected}`}
      >
        <div className="profile-current-identity">
          <VerificationBadge
            level={user.verificationLevel}
            roles={user.roles}
            displayedKind={selected}
          />
          <strong>{label}</strong>
        </div>
        <p>
          {selected === 'player'
            ? '你的球员档案、技术资料与赛季表现。'
            : selected === 'coach'
              ? '你的教练资料与球队管理入口。'
              : selected === 'reporter'
                ? '查看录入记录，维护已授权比赛的信息。'
                : selected === 'captain'
                  ? '维护本队资料、成员与比赛名单。'
                  : '查看当前身份与个人资料。'}
        </p>
        <div className="my-identity-actions">
          {selected === 'player' && user.linkedPlayer ? (
            <>
              <button
                data-profile-button
                className="profile-button profile-button--outline"
                onClick={() => open(openPlayer(user.linkedPlayer!.id, tournamentId))}
              >
                查看球员档案
              </button>
              <button
                data-profile-button
                className="profile-button profile-button--primary"
                onClick={() => setEditing('player')}
              >
                编辑球员资料
              </button>
            </>
          ) : selected === 'coach' ? (
            <>
              <button
                data-profile-button
                className="profile-button profile-button--outline"
                onClick={() => open(openPerson(user.id, tournamentId, 'coach'))}
              >
                查看教练资料
              </button>
              <button
                data-profile-button
                className="profile-button profile-button--primary"
                onClick={() => setEditing('coach')}
              >
                编辑教练资料
              </button>
              <button
                data-profile-button
                className="profile-button profile-button--outline"
                onClick={onTeam}
              >
                管理球队
              </button>
            </>
          ) : selected === 'reporter' ? (
            <button
              data-profile-button
              className="profile-button profile-button--primary"
              onClick={onInformation}
            >
              编辑比赛信息与查看记录
            </button>
          ) : selected === 'captain' ? (
            <button
              data-profile-button
              className="profile-button profile-button--primary"
              onClick={onTeam}
            >
              管理球队
            </button>
          ) : ['operator', 'admin'].includes(selected) ? (
            <button
              data-profile-button
              className="profile-button profile-button--primary"
              onClick={() => open(identityEntryActions.administrationEntry())}
            >
              进入管理中心
            </button>
          ) : (
            <button
              data-profile-button
              className="profile-button profile-button--primary"
              onClick={onPersonal}
            >
              编辑个人信息
            </button>
          )}
        </div>
      </div>
      <div className="my-identity-footer">
        <button data-profile-button onClick={onMatch}>
          自动匹配
        </button>
        <button data-profile-button onClick={onManage}>
          管理展示身份 →
        </button>
      </div>
      {editing === 'player' && (
        <SelfPlayerEditor
          onClose={() => setEditing(null)}
          onSaved={() =>
            window.dispatchEvent(
              new CustomEvent('xiaoqiu:player-profile:changed', { detail: user.linkedPlayer?.id }),
            )
          }
        />
      )}
      {editing === 'coach' && (
        <SelfPersonEditor
          onClose={() => setEditing(null)}
          onChanged={() => {
            void productRepository
              .getMe()
              .then(onUserChange)
              .catch(() => undefined)
          }}
        />
      )}
    </ProfileDialog>
  )
}
