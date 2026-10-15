/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AuthRoleDto } from './AuthRoleDto';
import type { LinkedPlayerDto } from './LinkedPlayerDto';
export type AuthUserDto = {
    emailVerifiedAt?: string | null;
    id: string;
    /**
     * 当前会话绑定的组织
     */
    organizationId: string;
    username: string;
    displayName: string;
    realName?: string | null;
    studentId?: string | null;
    email?: string | null;
    bio?: string | null;
    avatarUrl?: string | null;
    verificationLevel: string;
    roles: Array<AuthRoleDto>;
    linkedPlayer?: LinkedPlayerDto | null;
};

