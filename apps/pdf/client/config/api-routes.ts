export const API_ROUTES = {
  auth: {
    forgotPassword: '/api/forgot-password',
    googleLink: '/api/auth/google',
    login: '/api/login',
    login2fa: '/api/login/verify-2fa',
    logout: '/api/logout',
    logoutAll: '/api/logout-all',
    register: '/api/register',
    resetPassword: '/api/reset-password',
    resetPasswordValidate: (token: string) => `/api/reset-password/validate?token=${encodeURIComponent(token)}`,
    switchAccount: '/api/switch-account',
  },
  avatar: (name: string) => `/api/avatar?name=${encodeURIComponent(name)}`,
  avatarBase: '/api/avatar',
  download: {
    delete: (token: string) => `/api/download/${encodeURIComponent(token)}`,
    file: (token: string) => `/api/download/${encodeURIComponent(token)}`,
    info: (token: string) => `/api/download/${encodeURIComponent(token)}/info`,
  },
  education: {
    checkEmail: '/api/education/check-email',
    claimInstantPro: '/api/education/claim-instant-pro',
    institutionInquiry: '/api/education/institution-inquiry',
    requestOtp: '/api/education/request-otp',
    status: '/api/education/status',
    verify: '/api/education/verify',
    verifyOtp: '/api/education/verify-otp',
  },
  health: '/api/health',
  me: '/api/me',
  organization: {
    domains: '/api/organizations/me/domains',
    me: '/api/organizations/me',
    members: '/api/organizations/me/members',
    removeDomain: (domainId: string) => `/api/organizations/me/domains/${encodeURIComponent(domainId)}`,
    removeMember: (memberId: string) => `/api/organizations/me/members/${encodeURIComponent(memberId)}`,
    ssoConfig: '/api/auth/sso/config',
    ssoInitiate: (emailOrDomain: string) => `/api/auth/sso/initiate?email=${encodeURIComponent(emailOrDomain)}`,
    ssoLookup: (email: string) => `/api/auth/sso/lookup?email=${encodeURIComponent(email)}`,
  },
  settings: {
    accountDelete: '/api/settings/account/delete',
    avatar: '/api/settings/avatar',
    avatarDelete: '/api/settings/avatar/delete',
    email: '/api/settings/email',
    emailRequestCode: '/api/settings/email/request-code',
    emailVerifyCode: '/api/settings/email/verify-code',
    googleUnlink: '/api/settings/google/unlink',
    password: '/api/settings/password',
    passwordStatus: '/api/settings/password/status',
    passwordVerify: '/api/settings/password/verify',
    preferences: '/api/settings/preferences',
    twoFactorDisable: '/api/settings/2fa/disable',
    twoFactorEnable: '/api/settings/2fa/enable',
    twoFactorGenerate: '/api/settings/2fa/generate',
    twoFactorStatus: '/api/settings/2fa/status',
    username: '/api/settings/username',
  },
  tools: {
    comparePdf: {
      compare: '/api/tools/compare-pdf/compare',
      download: (fileId: string) => `/api/tools/compare-pdf/download/${encodeURIComponent(fileId)}`,
    },
    compressPdf: {
      compress: '/api/tools/compress-pdf/compress',
      download: (fileId: string) => `/api/tools/compress-pdf/download/${encodeURIComponent(fileId)}`,
    },
    cropPdf: {
      download: (fileId: string) => `/api/tools/crop-pdf/download/${encodeURIComponent(fileId)}`,
      process: '/api/tools/crop-pdf/process',
    },
    editPdf: {
      download: (fileId: string) => `/api/tools/edit-pdf/download/${encodeURIComponent(fileId)}`,
      process: '/api/tools/edit-pdf/process',
    },
    mergePdf: {
      download: (fileId: string) => `/api/tools/merge-pdf/download/${encodeURIComponent(fileId)}`,
      merge: '/api/tools/merge-pdf/merge',
    },
    ocrPdf: {
      download: (fileId: string) => `/api/tools/ocr-pdf/download/${encodeURIComponent(fileId)}`,
      process: '/api/tools/ocr-pdf/process',
    },
    organizePdf: {
      download: (fileId: string) => `/api/tools/organize-pdf/download/${encodeURIComponent(fileId)}`,
      organize: '/api/tools/organize-pdf/organize',
    },
    pageNumbers: {
      download: (fileId: string) => `/api/tools/page-numbers/download/${encodeURIComponent(fileId)}`,
      process: '/api/tools/page-numbers/process',
    },
    pdfConverter: {
      convert: '/api/tools/pdf-converter/convert',
      download: (token: string) => `/api/tools/pdf-converter/download/${encodeURIComponent(token)}`,
    },
    pdfToMarkdown: {
      convert: '/api/tools/pdf-to-markdown/convert',
      download: (fileId: string) => `/api/tools/pdf-to-markdown/download/${encodeURIComponent(fileId)}`,
    },
    protectPdf: {
      download: (fileId: string) => `/api/tools/protect-pdf/download/${encodeURIComponent(fileId)}`,
      process: '/api/tools/protect-pdf/process',
    },
    redactPdf: {
      download: (fileId: string) => `/api/tools/redact-pdf/download/${encodeURIComponent(fileId)}`,
      redact: '/api/tools/redact-pdf/redact',
    },
    removePdfPages: {
      download: (fileId: string) => `/api/tools/remove-pdf-pages/download/${encodeURIComponent(fileId)}`,
      remove: '/api/tools/remove-pdf-pages/remove',
    },
    repairPdf: {
      download: (fileId: string) => `/api/tools/repair-pdf/download/${encodeURIComponent(fileId)}`,
      repair: '/api/tools/repair-pdf/repair',
    },
    rotatePdf: {
      download: (fileId: string) => `/api/tools/rotate-pdf/download/${encodeURIComponent(fileId)}`,
      process: '/api/tools/rotate-pdf/process',
    },
    splitPdf: {
      download: (fileId: string) => `/api/tools/split-pdf/download/${encodeURIComponent(fileId)}`,
      split: '/api/tools/split-pdf/split',
    },
    summarizePdf: {
      summarize: '/api/tools/summarize-pdf/summarize',
    },
    toPdfConverter: {
      convert: '/api/tools/to-pdf/convert',
      download: (token: string) => `/api/tools/to-pdf/download/${encodeURIComponent(token)}`,
    },
    translatePdf: {
      download: (fileId: string) => `/api/tools/translate-pdf/download/${encodeURIComponent(fileId)}`,
      translate: '/api/tools/translate-pdf/translate',
    },
    unlockPdf: {
      download: (fileId: string) => `/api/tools/unlock-pdf/download/${encodeURIComponent(fileId)}`,
      process: '/api/tools/unlock-pdf/process',
    },
    watermarkPdf: {
      download: (fileId: string) => `/api/tools/watermark-pdf/download/${encodeURIComponent(fileId)}`,
      process: '/api/tools/watermark-pdf/process',
    },
  },
};
