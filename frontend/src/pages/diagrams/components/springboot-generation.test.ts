import { describe, expect, it } from 'vitest'

import { attributeName, validateAuthentication } from './springboot-generation'

describe('basic authentication generation form', () => {
  it('requires each selected authentication value', () => {
    expect(validateAuthentication({ principalClassId: 'account', loginField: 'email', credentialField: 'passwordHash', testUserLogin: 'test@example.com', testUserPassword: '' })).toBeTruthy()
    expect(validateAuthentication({ principalClassId: 'account', loginField: 'email', credentialField: 'passwordHash', testUserLogin: 'test@example.com', testUserPassword: 'safe-test-password' })).toBeNull()
  })

  it('uses UML attribute names in field selectors', () => {
    expect(attributeName('+ passwordHash : String')).toBe('passwordHash')
  })
})
