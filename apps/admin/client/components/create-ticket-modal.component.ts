import { renderIcons } from '../services/icon.service.js';
import { loadTemplate } from '../services/template.service.js';
import { toast } from '../services/toast.service.js';

interface DepartmentOption {
  id: string;
  name: string;
}

export interface CreateTicketModalOptions {
  onSuccess?: () => void;
}

let isSubmitting = false;

export async function openCreateTicketModal(options: CreateTicketModalOptions = {}): Promise<void> {
  let backdrop = document.querySelector<HTMLElement>('[data-ref="modal-create-ticket-backdrop"]');

  if (!backdrop) {
    const template = await loadTemplate('/views/internal-tickets/internal-tickets.html');
    const modalInTemplate = template.querySelector<HTMLElement>('[data-ref="modal-create-ticket-backdrop"]');
    if (modalInTemplate) {
      document.body.appendChild(modalInTemplate);
      backdrop = modalInTemplate;
      renderIcons(backdrop);
    }
  }

  if (!backdrop) return;

  const form = backdrop.querySelector<HTMLFormElement>('[data-ref="form-create-ticket"]');
  const errorBanner = backdrop.querySelector<HTMLElement>('[data-ref="create-ticket-error"]');
  const btnClose = backdrop.querySelector<HTMLButtonElement>('[data-ref="btn-close-create-modal"]');
  const btnCancel = backdrop.querySelector<HTMLButtonElement>('[data-ref="btn-cancel-create-ticket"]');
  const targetDeptSelect = backdrop.querySelector<HTMLSelectElement>('[data-ref="select-create-target-dept"]');
  const sourceDeptSelect = backdrop.querySelector<HTMLSelectElement>('[data-ref="select-create-source-dept"]');
  const titleInput = backdrop.querySelector<HTMLInputElement>('[data-ref="input-create-title"]');
  const descTextarea = backdrop.querySelector<HTMLTextAreaElement>('[data-ref="textarea-create-desc"]');
  const prioritySelect = backdrop.querySelector<HTMLSelectElement>('[data-ref="select-create-priority"]');
  const categorySelect = backdrop.querySelector<HTMLSelectElement>('[data-ref="select-create-category"]');
  const submitBtn = backdrop.querySelector<HTMLButtonElement>('[data-ref="btn-submit-create-ticket"]');

  if (form) form.reset();
  if (errorBanner) errorBanner.style.display = 'none';

  if (targetDeptSelect && targetDeptSelect.options.length <= 1) {
    try {
      const res = await fetch('/api/admin/internal-tickets/options');
      if (res.ok) {
        const data = await res.json() as { departments: DepartmentOption[]; success: boolean };
        if (data.success && Array.isArray(data.departments)) {
          targetDeptSelect.innerHTML = '<option value="">Selecciona departamento</option>';
          if (sourceDeptSelect) {
            sourceDeptSelect.innerHTML = '<option value="">Detectar automáticamente</option>';
          }
          data.departments.forEach((dept) => {
            const optTarget = document.createElement('option');
            optTarget.value = dept.id;
            optTarget.textContent = dept.name;
            targetDeptSelect.appendChild(optTarget);

            if (sourceDeptSelect) {
              const optSource = document.createElement('option');
              optSource.value = dept.id;
              optSource.textContent = dept.name;
              sourceDeptSelect.appendChild(optSource);
            }
          });
        }
      }
    } catch {}
  }

  const closeModal = () => {
    backdrop.style.display = 'none';
    backdrop.classList.remove('is-open', 'is-visible');
    const openModals = document.querySelectorAll<HTMLElement>('.modal-backdrop.is-open, .modal-backdrop[style*="display: flex"]');
    if (openModals.length === 0) {
      document.body.classList.remove('modal-open');
    }
  };

  btnClose?.addEventListener('click', (e) => {
    e.preventDefault();
    closeModal();
  });

  btnCancel?.addEventListener('click', (e) => {
    e.preventDefault();
    closeModal();
  });

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) {
      closeModal();
    }
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (errorBanner) errorBanner.style.display = 'none';

      const title = titleInput?.value.trim() || '';
      const targetDept = targetDeptSelect?.value || '';
      const category = categorySelect?.value || 'other';
      const priority = prioritySelect?.value || 'medium';
      const sourceDept = sourceDeptSelect?.value || null;
      const description = descTextarea?.value.trim() || '';

      if (!title || title.length < 3) {
        if (errorBanner) {
          errorBanner.textContent = 'El título debe contener al menos 3 caracteres.';
          errorBanner.style.display = 'block';
        }
        titleInput?.focus();
        return;
      }

      if (!targetDept) {
        if (errorBanner) {
          errorBanner.textContent = 'Selecciona el departamento responsable para atender la incidencia.';
          errorBanner.style.display = 'block';
        }
        targetDeptSelect?.focus();
        return;
      }

      if (!description || description.length < 5) {
        if (errorBanner) {
          errorBanner.textContent = 'Por favor describe la incidencia con mayor detalle (mínimo 5 caracteres).';
          errorBanner.style.display = 'block';
        }
        descTextarea?.focus();
        return;
      }

      isSubmitting = true;
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Registrando...';
      }

      try {
        const res = await fetch('/api/admin/internal-tickets', {
          body: JSON.stringify({
            category,
            description,
            priority,
            source_department_id: sourceDept,
            target_department_id: targetDept,
            title,
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        });

        const data = await res.json() as { error?: string; success: boolean; ticket?: { ticket_number: string } };

        if (!res.ok || !data.success) {
          if (errorBanner) {
            errorBanner.textContent = data.error || 'No se pudo registrar la incidencia. Intenta más tarde.';
            errorBanner.style.display = 'block';
          }
          return;
        }

        toast.success(`Incidencia ${data.ticket?.ticket_number || ''} registrada exitosamente.`);
        closeModal();
        options.onSuccess?.();
      } catch {
        if (errorBanner) {
          errorBanner.textContent = 'Error de conexión al registrar la incidencia.';
          errorBanner.style.display = 'block';
        }
      } finally {
        isSubmitting = false;
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Registrar Ticket';
        }
      }
    });

  backdrop.style.display = 'flex';
  backdrop.classList.add('is-open', 'is-visible');
  document.body.classList.add('modal-open');
  titleInput?.focus();
}
