/** Legacy browser key written by pre-security-fix login forms. */
export const LEGACY_LOGIN_CREDENTIAL_KEY = 'skoon/login-credentials'

/** Deletes only the obsolete application-owned credential entry. */
export function clearLegacyLoginCredentials(storage: Pick<Storage, 'removeItem'>) {
  storage.removeItem(LEGACY_LOGIN_CREDENTIAL_KEY)
}
