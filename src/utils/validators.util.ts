export interface ValidationResult {
  error?: string;
  valid: boolean;
}

export function validateEmail(email: unknown): ValidationResult {
  if (!email || typeof email !== 'string') {
    return { error: 'El correo electrónico es requerido.', valid: false };
  }

  const trimmed = email.trim().toLowerCase();

  if (trimmed.length < 5 || trimmed.length > 254) {
    return { error: 'Ingresa un correo electrónico válido.', valid: false };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmed)) {
    return { error: 'Ingresa un correo electrónico válido.', valid: false };
  }

  return { valid: true };
}

export function validatePassword(password: unknown): ValidationResult {
  if (!password || typeof password !== 'string') {
    return { error: 'La contraseña es requerida.', valid: false };
  }

  if (password.length < 8) {
    return { error: 'La contraseña debe tener al menos 8 caracteres.', valid: false };
  }

  if (password.length > 128) {
    return { error: 'La contraseña no puede exceder los 128 caracteres.', valid: false };
  }

  return { valid: true };
}

export function validateUsername(username: unknown): ValidationResult {
  if (!username || typeof username !== 'string') {
    return { error: 'El nombre de usuario es requerido.', valid: false };
  }

  const trimmed = username.trim();

  if (trimmed.length < 3) {
    return { error: 'El nombre de usuario debe tener al menos 3 caracteres.', valid: false };
  }

  if (trimmed.length > 30) {
    return { error: 'El nombre de usuario no puede superar los 30 caracteres.', valid: false };
  }

  const usernameRegex = /^[a-zA-Z0-9_.-]+$/;
  if (!usernameRegex.test(trimmed)) {
    return {
      error: 'El nombre de usuario solo puede contener letras, números, guiones y puntos.',
      valid: false,
    };
  }

  return { valid: true };
}

export function validateVerificationCode(code: unknown): ValidationResult {
  if (!code || typeof code !== 'string') {
    return { error: 'El código de verificación es requerido.', valid: false };
  }

  const trimmed = code.trim();
  if (!/^\d{6}$/.test(trimmed)) {
    return { error: 'El código debe contener exactamente 6 dígitos numéricos.', valid: false };
  }

  return { valid: true };
}
