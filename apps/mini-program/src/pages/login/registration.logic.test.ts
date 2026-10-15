import assert from 'node:assert/strict'
import test from 'node:test'
import {
  missingRegistrationMessage,
  registrationErrors,
  requiredRegistrationFields,
} from './registration.logic.ts'

const valid = {
  realName: '测试同学',
  studentId: '2026990001',
  username: 'campus-user',
  password: 'ExamplePassword2026!',
  confirmPassword: 'ExamplePassword2026!',
  email: '',
}
test('exactly ten numeric student digits are required, without silently truncating an extra digit', () => {
  for (const studentId of ['123', '12345678901', '123456789x'])
    assert.ok(registrationErrors({ ...valid, studentId }).studentId)
  assert.equal(registrationErrors(valid).studentId, undefined)
})
test('email is optional in the native form and required-field feedback names missing fields', () => {
  assert.deepEqual(registrationErrors(valid), {})
  assert.equal(requiredRegistrationFields.includes('email' as never), false)
  assert.equal(
    missingRegistrationMessage({ ...valid, realName: '', username: '' }),
    '姓名、用户名还未填写',
  )
})
test('mismatched passwords and supplied malformed mail are reported on their fields', () => {
  assert.ok(registrationErrors({ ...valid, confirmPassword: 'different' }).confirmPassword)
  assert.ok(registrationErrors({ ...valid, email: 'bad-email' }).email)
})
