/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type RegisterDto = {
    /**
     * 邮箱服务启用后必填，6位邮件验证码
     */
    emailCode?: string;
    /**
     * 登录用户名
     */
    username: string;
    /**
     * 公开昵称
     */
    displayName: string;
    /**
     * 后台实名
     */
    realName: string;
    studentId: string;
    email?: string;
    password: string;
};

