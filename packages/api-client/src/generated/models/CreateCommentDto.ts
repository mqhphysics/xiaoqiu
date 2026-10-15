/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type CreateCommentDto = {
    /**
     * 发表评论时同步发布引用原帖的动态，不带标签
     */
    repostToFeed?: boolean;
    /**
     * 客户端生成的评论幂等键
     */
    clientCommentId: string;
    /**
     * 回复的评论 ID
     */
    parentCommentId?: string;
    body: string;
};

