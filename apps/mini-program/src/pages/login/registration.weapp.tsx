import { Button, Input, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useState } from 'react'
import { productRepository, request } from '../../features/product/product.repository'
import {
  missingRegistrationMessage,
  registrationErrors,
  registrationLabels,
  requiredRegistrationFields,
  type NativeRegistrationValues,
} from './registration.logic'

const fields = [
  'realName',
  'studentId',
  'username',
  'password',
  'confirmPassword',
  'email',
] as const
const empty: NativeRegistrationValues = {
  realName: '',
  studentId: '',
  username: '',
  password: '',
  confirmPassword: '',
  email: '',
}

export function NativeRegistrationForm() {
  const [value, setValue] = useState(empty)
  const [touched, setTouched] = useState<Partial<Record<keyof NativeRegistrationValues, boolean>>>(
    {},
  )
  const [attempted, setAttempted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [serverError, setServerError] = useState('')
  const [emailCode, setEmailCode] = useState('')
  const [sending, setSending] = useState(false)
  const errors = registrationErrors(value)
  const sendCode = async () => {
    if (!value.email.trim() || errors.email || sending) return
    setSending(true)
    setServerError('')
    try {
      const reply = await request<{ message: string }>('/auth/email/code', {
        method: 'POST',
        authenticated: false,
        data: { email: value.email.trim(), purpose: 'REGISTER' },
      })
      await Taro.showToast({ title: reply.message, icon: 'none' })
    } catch (reason) {
      setServerError(reason instanceof Error ? reason.message : '验证码申请失败')
    } finally {
      setSending(false)
    }
  }
  const submit = async () => {
    if (submitting) return
    setAttempted(true)
    setServerError('')
    const message = missingRegistrationMessage(value) || Object.values(errors)[0]
    if (message) {
      await Taro.showToast({ title: message, icon: 'none', duration: 2500 })
      return
    }
    if (value.email.trim() && !/^\d{6}$/.test(emailCode)) {
      setServerError('请填写邮箱验证码')
      return
    }
    setSubmitting(true)
    try {
      const payload = {
        username: value.username.trim(),
        displayName: value.username.trim(),
        realName: value.realName.trim(),
        studentId: value.studentId.trim(),
        password: value.password,
        email: value.email.trim(),
        emailCode: emailCode || undefined,
      }
      await productRepository.register(payload)
      await Taro.reLaunch({ url: '/pages/index/index' })
    } catch (reason) {
      setServerError(reason instanceof Error ? reason.message : '注册失败，请重试。')
    } finally {
      setSubmitting(false)
    }
  }
  return (
    <View className="auth-form native-register">
      {fields.map((field) => {
        const required = (requiredRegistrationFields as readonly string[]).includes(field)
        const invalid = Boolean(
          errors[field] &&
          (attempted || touched[field] || (field === 'studentId' && value.studentId)),
        )
        return (
          <View key={field} className="native-register__field">
            <Text className="auth-label">
              {required && <Text className="native-register__required">*</Text>}
              {registrationLabels[field]}
            </Text>
            <Input
              className={`auth-input${invalid ? ' native-register__input--invalid' : ''}`}
              type={field === 'studentId' ? 'number' : 'text'}
              password={field === 'password' || field === 'confirmPassword'}
              maxlength={field === 'studentId' ? 32 : 128}
              placeholder={registrationLabels[field]}
              value={value[field]}
              onInput={(event) => {
                setValue((current) => ({ ...current, [field]: event.detail.value }))
                if (field === 'email') setEmailCode('')
              }}
              onBlur={() => setTouched((current) => ({ ...current, [field]: true }))}
            />
            {invalid && <Text className="native-register__error">{errors[field]}</Text>}
          </View>
        )
      })}
      {value.email.trim() && !errors.email ? (
        <View className="auth-code-row">
          <Input
            className="auth-input"
            type="number"
            maxlength={6}
            placeholder="邮箱验证码"
            value={emailCode}
            onInput={(event) => setEmailCode(event.detail.value)}
          />
          <Button loading={sending} disabled={sending} onClick={() => void sendCode()}>
            获取验证码
          </Button>
        </View>
      ) : null}
      {serverError && <Text className="native-register__error">{serverError}</Text>}
      <Button
        className="auth-primary"
        loading={submitting}
        disabled={submitting}
        onClick={() => void submit()}
      >
        注册并进入
      </Button>
    </View>
  )
}
