export const featureName = (className: string) => `${className.charAt(0).toLowerCase()}${className.slice(1)}s`;

export const featurePackageName = (className: string) => featureName(className).toLowerCase();
