const featureSubpackages = '(?:entity|repository|service|controller|dto|filter|provider)';

export const relocateTemplateFeaturePath = (targetRelative: string, packagePath: string) => {
  const normalized = targetRelative.split(/[\\/]/g).join('/');
  const match = normalized.match(new RegExp(`^src/main/java/backend/users/${featureSubpackages}(?:/(.*))?$`));
  if (!match) return normalized;
  return `src/main/java/${packagePath}/users${match[1] ? `/${match[1]}` : ''}`;
};

export const adaptTemplateSource = (source: string, packageName: string, className: string, backendName: string) => source
  .replace(new RegExp(`\\bbackend\\.users\\.${featureSubpackages}\\b`, 'g'), `${packageName}.users`)
  .replace(/package backend(?=[.;])/g, `package ${packageName}`)
  .replace(/import backend(?=[.;])/g, `import ${packageName}`)
  .replace(/\bBackendApplication\b/g, className)
  .replace(/\bbackend\b/g, backendName)
  .replace(/com\.example\.[a-z0-9_]+/g, packageName);
