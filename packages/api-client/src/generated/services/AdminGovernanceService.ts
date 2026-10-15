/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AdminCenterEditDto } from '../models/AdminCenterEditDto';
import type { AdminCenterReasonDto } from '../models/AdminCenterReasonDto';
import type { AdminContentDecisionDto } from '../models/AdminContentDecisionDto';
import type { AdminMediaDecisionDto } from '../models/AdminMediaDecisionDto';
import type { AdminPasswordResetDto } from '../models/AdminPasswordResetDto';
import type { AdminProvisionAccountsDto } from '../models/AdminProvisionAccountsDto';
import type { AdminSanctionDto } from '../models/AdminSanctionDto';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class AdminGovernanceService {
    /**
     * @param requestBody
     * @returns any
     * @throws ApiError
     */
    public static adminGovernanceControllerProvision(
        requestBody: AdminProvisionAccountsDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/admin/center/users/provision-from-players',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * @param id
     * @returns any
     * @throws ApiError
     */
    public static adminGovernanceControllerLoginInformation(
        id: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/admin/center/users/{id}/login-access',
            path: {
                'id': id,
            },
        });
    }
    /**
     * @param id
     * @param requestBody
     * @returns any
     * @throws ApiError
     */
    public static adminGovernanceControllerResetLoginPassword(
        id: string,
        requestBody: AdminPasswordResetDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/admin/center/users/{id}/login-password',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * @param id
     * @returns any
     * @throws ApiError
     */
    public static adminGovernanceControllerDetail(
        id: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/admin/center/users/{id}',
            path: {
                'id': id,
            },
        });
    }
    /**
     * @param id
     * @param requestBody
     * @returns any
     * @throws ApiError
     */
    public static adminGovernanceControllerEdit(
        id: string,
        requestBody: AdminCenterEditDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/api/admin/center/users/{id}',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * @param id
     * @returns any
     * @throws ApiError
     */
    public static adminGovernanceControllerActivity(
        id: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/admin/center/users/{id}/activity',
            path: {
                'id': id,
            },
        });
    }
    /**
     * @param id
     * @param requestBody
     * @returns any
     * @throws ApiError
     */
    public static adminGovernanceControllerSanction(
        id: string,
        requestBody: AdminSanctionDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/admin/center/users/{id}/sanctions',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * @param id
     * @param requestBody
     * @returns any
     * @throws ApiError
     */
    public static adminGovernanceControllerIdentity(
        id: string,
        requestBody: AdminCenterEditDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/api/admin/center/players/{id}/identity',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * @returns any
     * @throws ApiError
     */
    public static adminGovernanceControllerLibrary(): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/admin/center/media/library',
        });
    }
    /**
     * @param url
     * @returns any
     * @throws ApiError
     */
    public static adminGovernanceControllerPreview(
        url: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/admin/center/media/preview',
            query: {
                'url': url,
            },
        });
    }
    /**
     * @param requestBody
     * @returns any
     * @throws ApiError
     */
    public static adminGovernanceControllerMediaDecision(
        requestBody: AdminMediaDecisionDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/admin/center/media/decisions',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * @param id
     * @param requestBody
     * @returns any
     * @throws ApiError
     */
    public static adminGovernanceControllerDecision(
        id: string,
        requestBody: AdminContentDecisionDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/admin/center/posts/{id}/decisions',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * @returns any
     * @throws ApiError
     */
    public static adminGovernanceControllerCapabilities(): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/admin/center/moderation/capabilities',
        });
    }
    /**
     * @param id
     * @param requestBody
     * @returns any
     * @throws ApiError
     */
    public static adminGovernanceControllerAiPost(
        id: string,
        requestBody: AdminCenterReasonDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/admin/center/posts/{id}/ai-review',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * @param url
     * @param requestBody
     * @returns any
     * @throws ApiError
     */
    public static adminGovernanceControllerAiMedia(
        url: string,
        requestBody: AdminCenterReasonDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/admin/center/media/ai-review',
            query: {
                'url': url,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
}
