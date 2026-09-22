import { PHASE_STEPS, RESUMABLE_GENERATION_STATUSES } from './code-generation.service';

describe('code generation controller phase', () => {
  it('runs after services, before compilation, and is resumable on startup', () => {
    const ids = PHASE_STEPS.map(({ id }) => id);

    expect(ids.indexOf('GENERATING_CONTROLLERS')).toBeGreaterThan(ids.indexOf('GENERATING_SERVICES'));
    expect(ids.indexOf('GENERATING_CONTROLLERS')).toBeLessThan(ids.indexOf('COMPILING'));
    expect(RESUMABLE_GENERATION_STATUSES).toContain('GENERATING_CONTROLLERS');
    expect(RESUMABLE_GENERATION_STATUSES).toContain('COMPILING');
  });
});
