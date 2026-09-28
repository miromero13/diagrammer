import { PHASE_STEPS, RESUMABLE_GENERATION_STATUSES } from './code-generation.service';

describe('code generation controller phase', () => {
  it('packages generated projects after controller generation without a compilation phase', () => {
    const ids = PHASE_STEPS.map(({ id }) => id);

    expect(ids.indexOf('GENERATING_CONTROLLERS')).toBeGreaterThan(ids.indexOf('GENERATING_SERVICES'));
    expect(ids.indexOf('PACKAGING_ZIP')).toBeGreaterThan(ids.indexOf('GENERATING_CONTROLLERS'));
    expect(RESUMABLE_GENERATION_STATUSES).toContain('GENERATING_CONTROLLERS');
    expect(ids).not.toContain('COMPILING');
    expect(RESUMABLE_GENERATION_STATUSES).not.toContain('COMPILING');
  });
});
