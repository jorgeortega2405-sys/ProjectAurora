export interface ToolLimitDefinition {
  free: {
    maxFiles: number;
    maxFileSizeMB: number;
    maxTotalSizeMB: number;
  };
  premium: {
    maxFiles: number;
    maxFileSizeMB: number;
    maxTotalSizeMB: number;
    requiredPermission?: string;
  };
}

export const TOOLS_LIMITS: Record<string, ToolLimitDefinition> = {
  'compare-pdf': {
    free: { maxFiles: 2, maxFileSizeMB: 50, maxTotalSizeMB: 100 },
    premium: { maxFiles: 2, maxFileSizeMB: 500, maxTotalSizeMB: 1000, requiredPermission: 'tools:high_size_limit' },
  },
  'compress-pdf': {
    free: { maxFiles: 1, maxFileSizeMB: 100, maxTotalSizeMB: 100 },
    premium: { maxFiles: 10, maxFileSizeMB: 1000, maxTotalSizeMB: 2000, requiredPermission: 'tools:high_size_limit' },
  },
  'crop-pdf': {
    free: { maxFiles: 1, maxFileSizeMB: 100, maxTotalSizeMB: 100 },
    premium: { maxFiles: 5, maxFileSizeMB: 1000, maxTotalSizeMB: 1000, requiredPermission: 'tools:high_size_limit' },
  },
  'edit-pdf': {
    free: { maxFiles: 1, maxFileSizeMB: 50, maxTotalSizeMB: 50 },
    premium: { maxFiles: 5, maxFileSizeMB: 500, maxTotalSizeMB: 500, requiredPermission: 'tools:high_size_limit' },
  },
  'merge-pdf': {
    free: { maxFiles: 25, maxFileSizeMB: 50, maxTotalSizeMB: 100 },
    premium: { maxFiles: 500, maxFileSizeMB: 1000, maxTotalSizeMB: 2000, requiredPermission: 'tools:merge:batch_500' },
  },
  'ocr-pdf': {
    free: { maxFiles: 1, maxFileSizeMB: 50, maxTotalSizeMB: 50 },
    premium: { maxFiles: 5, maxFileSizeMB: 500, maxTotalSizeMB: 1000, requiredPermission: 'tools:high_size_limit' },
  },
  'organize-pdf': {
    free: { maxFiles: 25, maxFileSizeMB: 50, maxTotalSizeMB: 100 },
    premium: { maxFiles: 500, maxFileSizeMB: 1000, maxTotalSizeMB: 2000, requiredPermission: 'tools:merge:batch_500' },
  },
  'page-numbers': {
    free: { maxFiles: 1, maxFileSizeMB: 100, maxTotalSizeMB: 100 },
    premium: { maxFiles: 10, maxFileSizeMB: 1000, maxTotalSizeMB: 1000, requiredPermission: 'tools:high_size_limit' },
  },
  'pdf-converter': {
    free: { maxFiles: 5, maxFileSizeMB: 50, maxTotalSizeMB: 100 },
    premium: { maxFiles: 50, maxFileSizeMB: 500, maxTotalSizeMB: 1000, requiredPermission: 'tools:high_size_limit' },
  },
  'pdf-to-markdown': {
    free: { maxFiles: 1, maxFileSizeMB: 50, maxTotalSizeMB: 50 },
    premium: { maxFiles: 5, maxFileSizeMB: 500, maxTotalSizeMB: 500, requiredPermission: 'tools:high_size_limit' },
  },
  'protect-pdf': {
    free: { maxFiles: 1, maxFileSizeMB: 100, maxTotalSizeMB: 100 },
    premium: { maxFiles: 10, maxFileSizeMB: 1000, maxTotalSizeMB: 1000, requiredPermission: 'tools:high_size_limit' },
  },
  'redact-pdf': {
    free: { maxFiles: 1, maxFileSizeMB: 50, maxTotalSizeMB: 50 },
    premium: { maxFiles: 5, maxFileSizeMB: 500, maxTotalSizeMB: 500, requiredPermission: 'tools:high_size_limit' },
  },
  'remove-pdf-pages': {
    free: { maxFiles: 1, maxFileSizeMB: 100, maxTotalSizeMB: 100 },
    premium: { maxFiles: 1, maxFileSizeMB: 1000, maxTotalSizeMB: 1000, requiredPermission: 'tools:high_size_limit' },
  },
  'repair-pdf': {
    free: { maxFiles: 1, maxFileSizeMB: 100, maxTotalSizeMB: 100 },
    premium: { maxFiles: 5, maxFileSizeMB: 1000, maxTotalSizeMB: 1000, requiredPermission: 'tools:high_size_limit' },
  },
  'rotate-pdf': {
    free: { maxFiles: 1, maxFileSizeMB: 100, maxTotalSizeMB: 100 },
    premium: { maxFiles: 20, maxFileSizeMB: 1000, maxTotalSizeMB: 1000, requiredPermission: 'tools:high_size_limit' },
  },
  'split-pdf': {
    free: { maxFiles: 1, maxFileSizeMB: 100, maxTotalSizeMB: 100 },
    premium: { maxFiles: 1, maxFileSizeMB: 1000, maxTotalSizeMB: 1000, requiredPermission: 'tools:split:by_size' },
  },
  'summarize-pdf': {
    free: { maxFiles: 1, maxFileSizeMB: 50, maxTotalSizeMB: 50 },
    premium: { maxFiles: 1, maxFileSizeMB: 200, maxTotalSizeMB: 200, requiredPermission: 'tools:ai:advanced' },
  },
  'to-pdf-converter': {
    free: { maxFiles: 5, maxFileSizeMB: 50, maxTotalSizeMB: 100 },
    premium: { maxFiles: 50, maxFileSizeMB: 500, maxTotalSizeMB: 1000, requiredPermission: 'tools:high_size_limit' },
  },
  'translate-pdf': {
    free: { maxFiles: 1, maxFileSizeMB: 50, maxTotalSizeMB: 50 },
    premium: { maxFiles: 1, maxFileSizeMB: 200, maxTotalSizeMB: 200, requiredPermission: 'tools:ai:advanced' },
  },
  'unlock-pdf': {
    free: { maxFiles: 1, maxFileSizeMB: 100, maxTotalSizeMB: 100 },
    premium: { maxFiles: 10, maxFileSizeMB: 1000, maxTotalSizeMB: 1000, requiredPermission: 'tools:high_size_limit' },
  },
  'watermark-pdf': {
    free: { maxFiles: 1, maxFileSizeMB: 100, maxTotalSizeMB: 100 },
    premium: { maxFiles: 10, maxFileSizeMB: 1000, maxTotalSizeMB: 1000, requiredPermission: 'tools:high_size_limit' },
  },
};

export function getToolLimits(toolId: string, permissions: string[] = []): { maxFiles: number; maxFileSizeMB: number; maxTotalSizeMB: number } {
  const config = TOOLS_LIMITS[toolId];
  if (!config) {
    return { maxFiles: 1, maxFileSizeMB: 50, maxTotalSizeMB: 50 };
  }

  const hasWildcard = permissions.includes('*');
  const hasSpecific = config.premium.requiredPermission ? permissions.includes(config.premium.requiredPermission) : false;
  const hasPro = permissions.includes('subscription:feature:pro') || permissions.includes('subscription:feature:enterprise');

  if (hasWildcard || hasSpecific || hasPro) {
    return {
      maxFiles: config.premium.maxFiles,
      maxFileSizeMB: config.premium.maxFileSizeMB,
      maxTotalSizeMB: config.premium.maxTotalSizeMB,
    };
  }

  return {
    maxFiles: config.free.maxFiles,
    maxFileSizeMB: config.free.maxFileSizeMB,
    maxTotalSizeMB: config.free.maxTotalSizeMB,
  };
}

export const WORKFLOW_LIMITS = {
  enterprise: 1000,
  free: 1,
  pro: 100,
};

export function getMaxWorkflows(permissions: string[] = []): number {
  if (permissions.includes('*') || permissions.includes('subscription:feature:enterprise')) {
    return WORKFLOW_LIMITS.enterprise;
  }
  if (permissions.includes('subscription:feature:pro')) {
    return WORKFLOW_LIMITS.pro;
  }
  return WORKFLOW_LIMITS.free;
}
