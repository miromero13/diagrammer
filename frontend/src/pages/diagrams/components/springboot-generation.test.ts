import { describe, expect, it } from 'vitest'

import { attributeName, authenticationPayload, validateAuthentication } from './springboot-generation'

describe('basic authentication generation form', () => {
  it('requires each selected authentication value', () => {
    expect(validateAuthentication({ principalClassId: 'account', loginField: 'email', credentialField: 'passwordHash', testUserLogin: 'test@example.com', testUserPassword: '' })).toBeTruthy()
    expect(validateAuthentication({ principalClassId: 'account', loginField: 'email', credentialField: 'passwordHash', testUserLogin: 'test@example.com', testUserPassword: 'safe-test-password' })).toBeNull()
  })

  it('sends only enabled false when authentication is disabled', () => {
    const config = { principalClassId: 'account', loginField: 'email', credentialField: 'passwordHash', testUserLogin: 'test@example.com', testUserPassword: 'safe-test-password' }

    expect(authenticationPayload(false, config)).toEqual({ enabled: false })
    expect(authenticationPayload(true, config)).toEqual({ enabled: true, ...config })
  })

  it('uses UML attribute names in field selectors', () => {
    expect(attributeName('+ passwordHash : String')).toBe('passwordHash')
  })
})
