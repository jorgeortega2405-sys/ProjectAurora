export type ToastType = 'success' | 'error' | 'warning' | 'info' | 'danger';

export interface ViewController {
  destroy?: () => void;
  init?: (container: HTMLElement) => Promise<void> | void;
}

export interface Language {
  code: string;
  name: string;
}

export interface ModalInstance {
  backdrop: HTMLElement;
  body: HTMLElement;
  btnCancel: HTMLElement | null;
  btnConfirm: HTMLButtonElement | null;
  cancelBtn: HTMLElement | null;
  card: HTMLElement | null;
  clearError: () => void;
  close: () => void;
  closeBtn: HTMLElement | null;
  confirmBtn: HTMLButtonElement | null;
  errorBanner: HTMLElement | null;
  setBody: (newBody: string | HTMLElement) => void;
  setConfirmLoading: (isLoading: boolean, loadingText?: string) => void;
  setConfirmText: (newText: string, newKey?: string) => void;
  setConfirmVisible: (visible: boolean) => void;
  setDescription: (newDesc: string, newKey?: string, params?: Record<string, number | string>) => void;
  setError?: (msg: string) => void;
  setOnConfirm: (fn: ((inst: ModalInstance) => boolean | Promise<boolean | void> | void) | null) => void;
  setTitle: (newTitle: string, newKey?: string) => void;
  showError: (message: string) => void;
  [key: string]: any;
}

export interface ModalOptions {
  bodyHtml?: HTMLElement | string;
  cancelText?: string;
  confirmClass?: string;
  confirmText?: string;
  description?: string;
  descriptionKey?: string;
  descriptionParams?: Record<string, number | string>;
  onCancel?: ((inst: ModalInstance) => void) | null;
  onClose?: (() => void) | null;
  onConfirm?: ((inst: ModalInstance) => boolean | Promise<boolean | void> | void) | null;
  showCancel?: boolean;
  showConfirm?: boolean;
  size?: 'lg' | 'md' | 'sm' | string;
  title?: string;
  titleKey?: string;
}
