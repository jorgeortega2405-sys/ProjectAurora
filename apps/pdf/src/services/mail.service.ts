import fs from 'fs';
import nodemailer from 'nodemailer';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from '../config/env.config.js';
import { logger } from './logger.service.js';

export interface EmailTemplate {
  html: string;
  subject: string;
  text: string;
}

function loadTemplates(): Record<string, EmailTemplate> {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const candidatePaths = [
    path.resolve(currentDir, '../config/email-templates.json'),
    path.resolve(currentDir, '../../src/config/email-templates.json'),
  ];
  const target = candidatePaths.find((candidate) => fs.existsSync(candidate));
  if (!target) {
    return {};
  }
  try {
    return JSON.parse(fs.readFileSync(target, 'utf-8'));
  } catch {
    return {};
  }
}

const emailTemplates = loadTemplates();

const isTestOrUnconfigured =
  config.nodeEnv === 'test' ||
  process.env.NODE_ENV === 'test' ||
  process.env.SMTP_MOCK === 'true' ||
  !config.smtp.user ||
  !config.smtp.pass;

const transporter = isTestOrUnconfigured
  ? nodemailer.createTransport({ jsonTransport: true })
  : nodemailer.createTransport({
      auth: {
        pass: config.smtp.pass,
        user: config.smtp.user,
      },
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465,
      socketTimeout: 10000,
    });

export function escapeHtml(str: unknown): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function renderTemplateString(
  template: string,
  variables: Record<string, string | number>,
  isHtml = false
): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) => {
    if (key in variables) {
      const val = variables[key];
      return isHtml ? escapeHtml(val) : String(val);
    }
    return match;
  });
}

export async function sendTemplateEmail(
  templateKey: string,
  toEmail: string,
  variables: Record<string, string | number> = {}
): Promise<void> {
  const template: EmailTemplate | undefined = emailTemplates[templateKey];
  if (!template) {
    throw new Error(`Plantilla de email no encontrada: ${templateKey}`);
  }

  const mergedVariables: Record<string, string | number> = {
    appName: config.appName,
    year: new Date().getFullYear(),
    ...variables,
  };

  const subject = renderTemplateString(template.subject, mergedVariables, false);
  const html = renderTemplateString(template.html, mergedVariables, true);
  const text = renderTemplateString(template.text, mergedVariables, false);
  const fromAddress = `"${config.smtp.fromName}" <${config.smtp.fromEmail}>`;

  await transporter.sendMail({
    from: fromAddress,
    html,
    subject,
    text,
    to: toEmail,
  });

  logger.app.info(`Correo ${templateKey} enviado exitosamente a ${toEmail}`);
}

export async function sendVerificationCodeEmail(
  toEmail: string,
  username: string,
  code: string,
  expiresInMinutes = 15
): Promise<void> {
  await sendTemplateEmail('verification_code', toEmail, {
    code,
    expiresIn: expiresInMinutes,
    username,
  });
}

export async function sendWelcomeEmail(
  toEmail: string,
  username: string
): Promise<void> {
  await sendTemplateEmail('welcome', toEmail, {
    username,
  });
}

export async function sendPasswordResetEmail(
  toEmail: string,
  username: string,
  resetUrl: string,
  expiresInMinutes = 15
): Promise<void> {
  await sendTemplateEmail('password_reset', toEmail, {
    expiresIn: expiresInMinutes,
    resetUrl,
    username,
  });
}

export async function sendEmailChangeCodeEmail(
  toEmail: string,
  username: string,
  code: string,
  expiresInMinutes = 15
): Promise<void> {
  await sendTemplateEmail('email_change_code', toEmail, {
    code,
    expiresIn: expiresInMinutes,
    username,
  });
}

export async function sendEducationVerificationEmail(
  toEmail: string,
  username: string,
  schoolName: string,
  code: string,
  expiresInMinutes = 15
): Promise<void> {
  await sendTemplateEmail('education_verification_code', toEmail, {
    code,
    expiresIn: expiresInMinutes,
    schoolName,
    username,
  });
}


