import { expect, it } from 'vitest';
import { DEFAULT_REGISTRATION_PASSWORD, validPassword } from '../utils/registration/contracts';
it('requires a locally configured password instead of shipping a usable default', () => {
  expect(DEFAULT_REGISTRATION_PASSWORD).toBe('');
  expect(validPassword(DEFAULT_REGISTRATION_PASSWORD)).toBe(false);
});
