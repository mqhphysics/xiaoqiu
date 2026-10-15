/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type StudentRecordDto = {
    /**
     * 操作原因
     */
    reason: string;
    /**
     * 学生姓名
     */
    realName: string;
    /**
     * 组织内唯一的10位学号
     */
    studentNumber: string;
    gender: 'MALE' | 'FEMALE' | 'UNSPECIFIED';
    collegeName?: string;
    academicYear?: string;
    expectedVersion?: number;
    status?: 'ACTIVE' | 'PENDING' | 'ARCHIVED';
};

