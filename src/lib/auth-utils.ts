import { createHash } from "crypto"

export const PWD_SALT = "question-detector-pwd-salt-2026"
export const TOKEN_SALT = "question-detector-token-salt-2026"

/** 内置默认密码：env 未配置时的兜底（部署后可在「修改密码」里覆盖） */
export const BUILTIN_DEFAULT_PASSWORD = "123456"

export function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex")
}

/** 密码 → hash（存库用） */
export function passwordHash(password: string): string {
  return sha256(`${password}::${PWD_SALT}`)
}

/** 密码 hash → cookie token */
export function tokenFromHash(hash: string): string {
  return sha256(`${hash}::${TOKEN_SALT}`)
}
