/**
 * @gwangjang/api-client — 광장 API 클라이언트 안전 (server/client 양쪽에서 사용 가능) 모듈.
 *
 * 사용:
 *   import { apiError } from "@gwangjang/api-client/api-error"
 *   import { validateUploadedFile } from "@gwangjang/api-client/file-validation"
 *   import { getHeroBanners, type BannerData } from "@gwangjang/api-client/hero-banners"
 *
 * 또는 배럴:
 *   import { apiError, validateUploadedFile, type BannerData } from "@gwangjang/api-client"
 */

export * from "./api-error"
export * from "./file-validation"
export * from "./hero-banners"
export * from "./page-heroes"
export * from "./billing/types"
