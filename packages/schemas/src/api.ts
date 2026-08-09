import { z } from "zod";

export const requestMetaSchema = z.object({
  requestId: z.string().min(1)
});

export const paginationSchema = z.object({
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1).max(100),
  limit: z.number().int().min(1).max(100),
  total: z.number().int().min(0),
  totalItems: z.number().int().min(0),
  pageCount: z.number().int().min(0),
  totalPages: z.number().int().min(0),
  hasNextPage: z.boolean(),
  hasPreviousPage: z.boolean()
});

export const apiErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  details: z.unknown().optional()
});

export const apiSuccessSchema = <T extends z.ZodTypeAny>(data: T) =>
  z.object({
    success: z.literal(true),
    data,
    meta: requestMetaSchema
  });

export const apiCollectionSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    success: z.literal(true),
    data: z.array(item),
    pagination: paginationSchema,
    meta: requestMetaSchema
  });

export const apiFailureSchema = z.object({
  success: z.literal(false),
  error: apiErrorSchema,
  meta: requestMetaSchema
});

export type RequestMeta = z.infer<typeof requestMetaSchema>;
export type Pagination = z.infer<typeof paginationSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
export type ApiSuccess<T> = {
  success: true;
  data: T;
  meta: RequestMeta;
};
export type ApiCollection<T> = {
  success: true;
  data: T[];
  pagination: Pagination;
  meta: RequestMeta;
};
export type ApiFailure = z.infer<typeof apiFailureSchema>;
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;
export type ApiCollectionResponse<T> = ApiCollection<T> | ApiFailure;
