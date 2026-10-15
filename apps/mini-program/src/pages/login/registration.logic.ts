export interface NativeRegistrationValues {
  realName: string
  studentId: string
  username: string
  password: string
  confirmPassword: string
  email: string
}

export const registrationLabels: Record<keyof NativeRegistrationValues, string> = {
  realName: '姓名',
  studentId: '学号',
  username: '用户名',
  password: '密码',
  confirmPassword: '确认密码',
  email: '绑定邮箱',
}

export const requiredRegistrationFields = [
  'realName',
  'studentId',
  'username',
  'password',
  'confirmPassword',
] as const

function fieldMissing(field: keyof NativeRegistrationValues, value: string) {
  return field === 'password' || field === 'confirmPassword' ? value.length === 0 : !value.trim()
}

export function registrationErrors(
  value: NativeRegistrationValues,
): Partial<Record<keyof NativeRegistrationValues, string>> {
  const errors: Partial<Record<keyof NativeRegistrationValues, string>> = {}
  for (const field of requiredRegistrationFields) {
    if (fieldMissing(field, value[field])) errors[field] = `${registrationLabels[field]}还未填写`
  }
  if (value.realName.trim() && value.realName.trim().length < 2) errors.realName = '请填写完整姓名'
  if (value.studentId && !/^\d{10}$/.test(value.studentId)) errors.studentId = '学号应为10位数字'
  if (value.username && !/^[A-Za-z0-9_.-]{3,32}$/.test(value.username))
    errors.username = '用户名需为3至32位字母、数字或点、下划线、短横线'
  if (
    value.password &&
    (Array.from(value.password).length < 6 || Array.from(value.password).length > 128)
  )
    errors.password = '密码需为6至128位，不限制字符类型'
  if (value.confirmPassword && value.password !== value.confirmPassword)
    errors.confirmPassword = '两次密码不一致'
  if (value.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email.trim()))
    errors.email = '邮箱格式不正确'
  return errors
}

export function missingRegistrationMessage(value: NativeRegistrationValues): string {
  const missing = requiredRegistrationFields
    .filter((key) => fieldMissing(key, value[key]))
    .map((key) => registrationLabels[key])
  return missing.length ? `${missing.join('、')}还未填写` : ''
}
