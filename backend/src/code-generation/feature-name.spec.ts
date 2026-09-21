import { featureName, featurePackageName } from './feature-name';

describe('feature names', () => {
  it('keeps camelCase feature names while deriving lowercase Java package names', () => {
    expect(featureName('EmailNotificationService')).toBe('emailNotificationServices');
    expect(featurePackageName('EmailNotificationService')).toBe('emailnotificationservices');
  });
});
