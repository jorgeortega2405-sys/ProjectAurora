import { openModal } from '../../components/modal.component.js';
import { checkAuthSession, currentUser, getApi, postApi } from '../../services/api.service.js';
import { t, translateElement } from '../../services/i18n.service.js';
import { renderIcons } from '../../services/icon.service.js';
import { navigate } from '../../services/navigation.service.js';
import { loadTemplate } from '../../services/template.service.js';
import { showToast } from '../../services/toast.service.js';
import { ViewController } from '../../types/common.types.js';

interface BillingDetails {
  amount: number;
  cancel_at_period_end: boolean;
  currency: string;
  current_period_end: string | null;
  hasSubscription: boolean;
  interval: 'month' | 'year';
  status: string;
  subscription_id: string | null;
  tier: string;
}

export class BillingViewController implements ViewController {
  private abortController: AbortController | null = null;
  private container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async init(): Promise<void> {
    this.abortController = new AbortController();
    translateElement(this.container);
    renderIcons(this.container);
    await this.loadBillingData();
  }

  destroy(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  private async loadBillingData(): Promise<void> {
    try {
      const res = await getApi('/api/subscriptions/billing');
      if (res.ok) {
        const data = await res.json();
        if (data.billing) {
          this.renderBillingInfo(data.billing);
          return;
        }
      }
      this.renderFallbackInfo();
    } catch {
      this.renderFallbackInfo();
    }
  }

  private renderBillingInfo(billing: BillingDetails): void {
    const tokensBadge = this.container.querySelector<HTMLElement>('[data-ref="tokens-balance-badge"]');
    if (tokensBadge) {
      const balance = currentUser?.ai_credits_balance ?? 0;
      tokensBadge.textContent = `${balance.toLocaleString()} créditos`;
    }

    const planNameEl = this.container.querySelector<HTMLElement>('[data-ref="current-plan-name"]');
    const planStatusBadge = this.container.querySelector<HTMLElement>('[data-ref="current-plan-status-badge"]');
    const planDescEl = this.container.querySelector<HTMLElement>('[data-ref="current-plan-desc"]');
    const btnUpgrade = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-upgrade-plan"]');

    const itemAutoRenewal = this.container.querySelector<HTMLElement>('[data-ref="item-auto-renewal"]');
    const dividerAutoRenewal = this.container.querySelector<HTMLElement>('[data-ref="divider-auto-renewal"]');
    const autoRenewalDesc = this.container.querySelector<HTMLElement>('[data-ref="auto-renewal-desc"]');
    const btnToggleRenewal = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-toggle-auto-renewal"]');

    const itemCancelSub = this.container.querySelector<HTMLElement>('[data-ref="item-cancel-subscription"]');
    const dividerCancelSub = this.container.querySelector<HTMLElement>('[data-ref="divider-cancel-sub"]');
    const btnCancelImmediate = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-cancel-subscription-immediate"]');

    const effectiveTier = (billing.tier || currentUser?.subscription_tier || 'free').toLowerCase();
    const hasActiveSub = Boolean(
      (billing.hasSubscription || (effectiveTier !== 'free' && effectiveTier !== 'none')) &&
      effectiveTier !== 'free'
    );

    if (hasActiveSub) {
      const isEnterpriseTier = effectiveTier === 'enterprise' || effectiveTier === 'business';
      const isEducationTier = effectiveTier === 'education';

      if (isEnterpriseTier) {
        if (planNameEl) planNameEl.textContent = 'Aurora Empresas (Corporativo)';
        if (planStatusBadge) {
          planStatusBadge.style.display = 'inline-flex';
          planStatusBadge.className = 'component-badge component-badge--sm component-badge--success';
          planStatusBadge.textContent = 'Plan Corporativo Activo';
        }
        if (planDescEl) {
          planDescEl.textContent = 'Tu suscripción corporativa es administrada directamente por la organización o contrato empresarial. Para cambios de licencias o facturación centralizada, contacta a tu administrador.';
        }
        if (btnUpgrade) {
          btnUpgrade.textContent = 'Soporte empresarial';
          btnUpgrade.onclick = (e) => {
            e.preventDefault();
            navigate('/contact');
          };
        }
        if (itemAutoRenewal) itemAutoRenewal.style.display = 'none';
        if (dividerAutoRenewal) dividerAutoRenewal.style.display = 'none';
        if (itemCancelSub) itemCancelSub.style.display = 'none';
        if (dividerCancelSub) dividerCancelSub.style.display = 'none';
        return;
      }

      if (isEducationTier) {
        if (planNameEl) planNameEl.textContent = 'Aurora Educación Pro (Estudiantil)';
        if (planStatusBadge) {
          planStatusBadge.style.display = 'inline-flex';
          planStatusBadge.className = 'component-badge component-badge--sm component-badge--success';
          planStatusBadge.textContent = 'Beca Académica Activa';
        }
        if (planDescEl) {
          planDescEl.textContent = 'Suscripción 100% bonificada para estudiantes y personal docente verificados. Válida durante tu ciclo lectivo activo.';
        }
        if (btnUpgrade) {
          btnUpgrade.style.display = 'none';
        }
        if (itemAutoRenewal) itemAutoRenewal.style.display = 'none';
        if (dividerAutoRenewal) dividerAutoRenewal.style.display = 'none';
        if (itemCancelSub) itemCancelSub.style.display = 'none';
        if (dividerCancelSub) dividerCancelSub.style.display = 'none';
        return;
      }

      const tierName = 'Aurora Pro';
      const intervalText = billing.interval === 'year'
        ? (t('upgrade.billing_yearly') || 'Anual')
        : (t('upgrade.billing_monthly') || 'Mensual');

      if (planNameEl) {
        planNameEl.textContent = `${tierName} (${intervalText})`;
      }

      let dateFormatted = '';
      if (billing.current_period_end) {
        try {
          const d = new Date(billing.current_period_end);
          dateFormatted = d.toLocaleDateString(undefined, {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          });
        } catch {}
      }

      if (planStatusBadge) {
        planStatusBadge.style.display = 'inline-flex';
        if (billing.cancel_at_period_end) {
          planStatusBadge.className = 'component-badge component-badge--sm component-badge--warning';
          planStatusBadge.textContent = t('settings.billing.status_cancel_scheduled') || 'Cancelación programada';
        } else {
          planStatusBadge.className = 'component-badge component-badge--sm component-badge--success';
          planStatusBadge.textContent = t('settings.billing.status_active') || 'Activo';
        }
      }

      if (planDescEl) {
        if (billing.cancel_at_period_end) {
          planDescEl.textContent = dateFormatted
            ? `Tu plan expirará el ${dateFormatted}. Conservas todos tus beneficios hasta esa fecha.`
            : 'Tu plan expirará al finalizar el ciclo actual de facturación.';
        } else {
          const amountText = billing.amount > 0 ? `USD $${billing.amount.toFixed(2)} - ` : '';
          planDescEl.textContent = dateFormatted
            ? `${amountText}Próximo cobro programado para el ${dateFormatted}.`
            : `${amountText}Suscripción activa.`;
        }
      }

      if (btnUpgrade) {
        btnUpgrade.textContent = t('settings.billing.btn_change_plan') || 'Cambiar de plan';
        btnUpgrade.onclick = (e) => {
          e.preventDefault();
          navigate('/upgrade');
        };
      }

      if (itemAutoRenewal) itemAutoRenewal.style.display = 'flex';
      if (dividerAutoRenewal) dividerAutoRenewal.style.display = 'block';
      if (itemCancelSub) itemCancelSub.style.display = 'flex';
      if (dividerCancelSub) dividerCancelSub.style.display = 'block';

      if (btnToggleRenewal && autoRenewalDesc) {
        if (billing.cancel_at_period_end) {
          autoRenewalDesc.textContent = t('settings.billing.auto_renewal_paused_desc') || 'La renovación automática está pausada. Tu suscripción no se cobrará nuevamente.';
          btnToggleRenewal.textContent = t('settings.billing.btn_reactivate_renewal') || 'Reactivar renovación';
          btnToggleRenewal.className = 'component-button component-button--h34 component-button--black';
          btnToggleRenewal.onclick = (e) => {
            e.preventDefault();
            this.handleToggleAutoRenewal(false);
          };
        } else {
          autoRenewalDesc.textContent = dateFormatted
            ? `Tu suscripción se renovará automáticamente el ${dateFormatted}.`
            : (t('settings.billing.auto_renewal_desc') || 'Tu suscripción se renovará automáticamente al finalizar cada ciclo.');
          btnToggleRenewal.textContent = t('settings.billing.btn_cancel_renewal') || 'Cancelar renovación';
          btnToggleRenewal.className = 'component-button component-button--h34';
          btnToggleRenewal.onclick = (e) => {
            e.preventDefault();
            this.handleToggleAutoRenewal(true, dateFormatted);
          };
        }
      }

      if (btnCancelImmediate) {
        btnCancelImmediate.onclick = (e) => {
          e.preventDefault();
          this.handleCancelImmediate();
        };
      }
    } else {
      this.renderFallbackInfo();
    }
  }

  private renderFallbackInfo(): void {
    const effectiveTier = (currentUser?.subscription_tier || 'free').toLowerCase();
    if (effectiveTier !== 'free' && effectiveTier !== 'none') {
      this.renderBillingInfo({
        amount: 0,
        cancel_at_period_end: false,
        currency: 'USD',
        current_period_end: null,
        hasSubscription: true,
        interval: 'month',
        status: 'active',
        subscription_id: null,
        tier: effectiveTier,
      });
      return;
    }

    const tokensBadge = this.container.querySelector<HTMLElement>('[data-ref="tokens-balance-badge"]');
    if (tokensBadge) {
      const balance = currentUser?.ai_credits_balance ?? 0;
      tokensBadge.textContent = `${balance.toLocaleString()} créditos`;
    }

    const planNameEl = this.container.querySelector<HTMLElement>('[data-ref="current-plan-name"]');
    const planStatusBadge = this.container.querySelector<HTMLElement>('[data-ref="current-plan-status-badge"]');
    const planDescEl = this.container.querySelector<HTMLElement>('[data-ref="current-plan-desc"]');
    const btnUpgrade = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-upgrade-plan"]');

    const itemAutoRenewal = this.container.querySelector<HTMLElement>('[data-ref="item-auto-renewal"]');
    const dividerAutoRenewal = this.container.querySelector<HTMLElement>('[data-ref="divider-auto-renewal"]');
    const itemCancelSub = this.container.querySelector<HTMLElement>('[data-ref="item-cancel-subscription"]');
    const dividerCancelSub = this.container.querySelector<HTMLElement>('[data-ref="divider-cancel-sub"]');

    if (planNameEl) {
      planNameEl.textContent = t('settings.billing.free_plan_title') || 'Plan Gratuito';
    }
    if (planStatusBadge) {
      planStatusBadge.style.display = 'none';
    }
    if (planDescEl) {
      planDescEl.textContent = t('settings.billing.free_plan_desc') || 'Actualmente disfrutas del plan básico gratuito de ProjectAurora.';
    }
    if (btnUpgrade) {
      btnUpgrade.textContent = t('settings.billing.btn_explore_plans') || 'Explorar planes';
      btnUpgrade.onclick = (e) => {
        e.preventDefault();
        navigate('/upgrade');
      };
    }

    if (itemAutoRenewal) itemAutoRenewal.style.display = 'none';
    if (dividerAutoRenewal) dividerAutoRenewal.style.display = 'none';
    if (itemCancelSub) itemCancelSub.style.display = 'none';
    if (dividerCancelSub) dividerCancelSub.style.display = 'none';
  }

  private handleToggleAutoRenewal(cancelAtPeriodEnd: boolean, dateFormatted = ''): void {
    if (cancelAtPeriodEnd) {
      openModal({
        cancelText: t('common.cancel') || 'Volver',
        confirmClass: 'component-button--black',
        confirmText: t('settings.billing.btn_confirm_cancel_renewal') || 'Confirmar cancelación',
        description: dateFormatted
          ? `Tu suscripción continuará activa con todas sus funciones hasta el ${dateFormatted}. A partir de esa fecha, no se realizará ningún cobro y volverás al plan gratuito.`
          : 'Tu suscripción finalizará al término del periodo facturado y no se renovará.',
        onConfirm: async (inst) => {
          inst.setConfirmLoading(true);
          try {
            const res = await postApi('/api/subscriptions/renewal', { cancelAtPeriodEnd: true });
            const data = await res.json();
            if (res.ok && data.success) {
              inst.close();
              showToast(t('settings.billing.toast_renewal_paused') || 'Renovación automática pausada.', 'info');
              await this.loadBillingData();
            } else {
              inst.setConfirmLoading(false);
              showToast(data.message || 'No se pudo cancelar la renovación.', 'danger');
            }
          } catch {
            inst.setConfirmLoading(false);
            showToast('Error de conexión al actualizar renovación.', 'danger');
          }
        },
        size: 'sm',
        title: t('settings.billing.modal_cancel_renewal_title') || '¿Pausar renovación automática?',
      });
    } else {
      (async () => {
        try {
          const res = await postApi('/api/subscriptions/renewal', { cancelAtPeriodEnd: false });
          const data = await res.json();
          if (res.ok && data.success) {
            showToast(t('settings.billing.toast_renewal_active') || 'Renovación automática reactivada.', 'success');
            await this.loadBillingData();
          } else {
            showToast(data.message || 'No se pudo reactivar la renovación.', 'danger');
          }
        } catch {
          showToast('Error de conexión al reactivar renovación.', 'danger');
        }
      })();
    }
  }

  private handleCancelImmediate(): void {
    openModal({
      cancelText: t('common.cancel') || 'Volver',
      confirmClass: 'component-button--danger',
      confirmText: t('settings.billing.btn_confirm_cancel_immediate') || 'Sí, cancelar de inmediato',
      description: t('settings.billing.modal_cancel_immediate_desc') || 'Esta acción cancelará tu suscripción de inmediato en Stripe y perderás el acceso a las funciones Pro. ¿Deseas continuar?',
      onConfirm: async (inst) => {
        inst.setConfirmLoading(true);
        try {
          const res = await postApi('/api/subscriptions/cancel');
          const data = await res.json();
          if (res.ok && data.success) {
            inst.close();
            await checkAuthSession();
            showToast(t('settings.billing.toast_cancelled_success') || 'Suscripción cancelada exitosamente.', 'info');
            await this.loadBillingData();
          } else {
            inst.setConfirmLoading(false);
            showToast(data.message || 'No se pudo cancelar la suscripción.', 'danger');
          }
        } catch {
          inst.setConfirmLoading(false);
          showToast('Error de conexión al cancelar suscripción.', 'danger');
        }
      },
      size: 'sm',
      title: t('settings.billing.modal_cancel_immediate_title') || '¿Cancelar suscripción de inmediato?',
    });
  }
}

export async function createBillingView(): Promise<HTMLElement> {
  const container = await loadTemplate('/views/settings/billing.html');
  const controller = new BillingViewController(container);
  await controller.init();
  (container as any).__controller = controller;
  return container;
}
