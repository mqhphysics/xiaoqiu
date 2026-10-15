import type { Prisma } from '../generated/prisma/client'
import { centerError } from '../admin-center/admin-center.policy'

/** Directory matching does not verify ownership or award a player/staff identity. */
export async function attachRegisteredStudent(
  tx: Prisma.TransactionClient,
  organizationId: string,
  userId: string,
  realName: string,
  studentNumber: string,
) {
  const student = await tx.studentRecord.findUnique({
    where: { organizationId_studentNumber: { organizationId, studentNumber } },
    include: { user: { select: { id: true } } },
  })
  if (
    student &&
    (student.status === 'ARCHIVED' ||
      student.realName.normalize('NFKC').trim() !== realName.normalize('NFKC').trim())
  )
    throw centerError(409, '姓名与该学号的学生档案不一致，请联系管理员核验')
  if (student?.user && student.user.id !== userId)
    throw centerError(409, '该学生档案已关联账号，请使用原账号或申请找回')
  const record =
    student ??
    (await tx.studentRecord.create({
      data: {
        organizationId,
        realName,
        studentNumber,
        status: 'PENDING',
        sourceType: 'SELF_REGISTRATION',
      },
    }))
  await tx.user.update({
    where: { id: userId },
    data: { studentRecordId: record.id, profileCohort: record.cohort },
  })
  return record.id
}
