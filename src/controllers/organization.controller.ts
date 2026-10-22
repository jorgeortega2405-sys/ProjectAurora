import { logger } from '../services/logger.service.js';
import { addMemberToOrganization, addOrganizationDomain, countActiveMembers, createOrganization, getOrganizationById, getUserOrganization, listOrganizationDomains, listOrganizationMembers, removeMemberFromOrganization, removeOrganizationDomain } from '../services/organization.service.js';
import { Request, Response } from 'express';

export async function createOrganizationHandler(req: Request, res: Response): Promise<void> {
  try {
    const user = (req as any).user;
    if (!user) {
      res.status(401).json({ error: 'Sesión no válida o expirada.', success: false });
      return;
    }

    const { domain, name, orgType, seatLimit, slug } = req.body || {};
    if (typeof name !== 'string' || name.trim().length < 2) {
      res.status(400).json({ error: 'El nombre de la organización debe tener al menos 2 caracteres.', success: false });
      return;
    }

    const parsedLimit = typeof seatLimit === 'number' && seatLimit > 0 ? seatLimit : 5;

    const organization = await createOrganization({
      domain,
      name,
      orgType: orgType === 'education' ? 'education' : 'business',
      ownerId: user.id,
      seatLimit: parsedLimit,
      slug,
    });

    res.status(201).json({
      organization,
      success: true,
    });
  } catch (err: any) {
    logger.app.error('Error al crear organización', err);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al crear la organización. Por favor intenta más tarde.',
      success: false,
    });
  }
}

export async function getMyOrganizationHandler(req: Request, res: Response): Promise<void> {
  try {
    const user = (req as any).user;
    if (!user) {
      res.status(401).json({ error: 'Sesión requerida.', success: false });
      return;
    }

    const userOrg = await getUserOrganization(user.id);
    if (!userOrg) {
      res.status(404).json({ error: 'No perteneces a ninguna organización corporativa.', success: false });
      return;
    }

    const activeMembersCount = await countActiveMembers(userOrg.organization.id);
    const domains = await listOrganizationDomains(userOrg.organization.id);

    res.json({
      activeMembersCount,
      domains,
      memberRole: userOrg.memberRole,
      organization: userOrg.organization,
      success: true,
    });
  } catch (err) {
    logger.app.error('Error al obtener organización del usuario', err);
    res.status(500).json({
      error: 'No se pudo obtener la información de la organización.',
      success: false,
    });
  }
}

export async function listMembersHandler(req: Request, res: Response): Promise<void> {
  try {
    const user = (req as any).user;
    const userOrg = await getUserOrganization(user.id);
    if (!userOrg) {
      res.status(404).json({ error: 'Organización no encontrada.', success: false });
      return;
    }

    const members = await listOrganizationMembers(userOrg.organization.id);
    const activeMembersCount = await countActiveMembers(userOrg.organization.id);

    res.json({
      activeMembersCount,
      members,
      seatLimit: userOrg.organization.seat_limit,
      success: true,
    });
  } catch (err) {
    logger.app.error('Error al listar miembros de la organización', err);
    res.status(500).json({
      error: 'No se pudo obtener la lista de miembros.',
      success: false,
    });
  }
}

export async function addMemberHandler(req: Request, res: Response): Promise<void> {
  try {
    const user = (req as any).user;
    const userOrg = await getUserOrganization(user.id);
    if (!userOrg) {
      res.status(404).json({ error: 'Organización no encontrada.', success: false });
      return;
    }

    const { email, role } = req.body || {};
    if (typeof email !== 'string' || !email.includes('@')) {
      res.status(400).json({ error: 'Por favor ingresa un correo electrónico válido.', success: false });
      return;
    }

    const member = await addMemberToOrganization({
      email,
      organizationId: userOrg.organization.id,
      role: role === 'ORG_ADMIN' ? 'ORG_ADMIN' : 'ORG_MEMBER',
    });

    const activeMembersCount = await countActiveMembers(userOrg.organization.id);

    res.status(201).json({
      activeMembersCount,
      member,
      seatLimit: userOrg.organization.seat_limit,
      success: true,
    });
  } catch (err: any) {
    if (err?.message === 'SEAT_LIMIT_REACHED') {
      res.status(400).json({
        error: 'Se ha alcanzado el límite máximo de asientos contratados para tu organización.',
        success: false,
      });
      return;
    }
    if (err?.message === 'ALREADY_MEMBER') {
      res.status(400).json({
        error: 'El usuario ya es un miembro activo de esta organización.',
        success: false,
      });
      return;
    }

    logger.app.error('Error al agregar miembro a la organización', err);
    res.status(500).json({
      error: 'No se pudo añadir el miembro a la organización. Por favor intenta más tarde.',
      success: false,
    });
  }
}

export async function removeMemberHandler(req: Request, res: Response): Promise<void> {
  try {
    const user = (req as any).user;
    const userOrg = await getUserOrganization(user.id);
    if (!userOrg) {
      res.status(404).json({ error: 'Organización no encontrada.', success: false });
      return;
    }

    const memberId = req.params.memberId;
    if (!memberId) {
      res.status(400).json({ error: 'Identificador de miembro requerido.', success: false });
      return;
    }

    await removeMemberFromOrganization(userOrg.organization.id, memberId);

    const activeMembersCount = await countActiveMembers(userOrg.organization.id);

    res.json({
      activeMembersCount,
      message: 'Miembro removido exitosamente.',
      success: true,
    });
  } catch (err: any) {
    if (err?.message === 'CANNOT_REMOVE_OWNER') {
      res.status(400).json({
        error: 'No es posible remover al propietario principal de la organización.',
        success: false,
      });
      return;
    }

    logger.app.error('Error al remover miembro de la organización', err);
    res.status(500).json({
      error: 'No se pudo remover el miembro de la organización.',
      success: false,
    });
  }
}

export async function addDomainHandler(req: Request, res: Response): Promise<void> {
  try {
    const user = (req as any).user;
    const userOrg = await getUserOrganization(user.id);
    if (!userOrg) {
      res.status(404).json({ error: 'Organización no encontrada.', success: false });
      return;
    }

    const { domain } = req.body || {};
    if (typeof domain !== 'string' || !domain.trim()) {
      res.status(400).json({ error: 'Dominio inválido.', success: false });
      return;
    }

    const domainId = await addOrganizationDomain(userOrg.organization.id, domain);

    res.status(201).json({
      domain: domain.trim().toLowerCase().replace(/^@+/, ''),
      domainId,
      success: true,
    });
  } catch (err: any) {
    if (err?.message === 'DOMAIN_ALREADY_REGISTERED') {
      res.status(400).json({
        error: 'El dominio corporativo ya está registrado por otra organización.',
        success: false,
      });
      return;
    }

    logger.app.error('Error al vincular dominio corporativo', err);
    res.status(500).json({
      error: 'No se pudo registrar el dominio corporativo.',
      success: false,
    });
  }
}

export async function removeDomainHandler(req: Request, res: Response): Promise<void> {
  try {
    const user = (req as any).user;
    const userOrg = await getUserOrganization(user.id);
    if (!userOrg) {
      res.status(404).json({ error: 'Organización no encontrada.', success: false });
      return;
    }

    const domainId = req.params.domainId;
    if (!domainId) {
      res.status(400).json({ error: 'Identificador de dominio requerido.', success: false });
      return;
    }

    const removed = await removeOrganizationDomain(userOrg.organization.id, domainId);
    if (!removed) {
      res.status(404).json({ error: 'Dominio no encontrado.', success: false });
      return;
    }

    res.json({
      message: 'Dominio corporativo eliminado exitosamente.',
      success: true,
    });
  } catch (err) {
    logger.app.error('Error al remover dominio corporativo', err);
    res.status(500).json({
      error: 'No se pudo eliminar el dominio corporativo.',
      success: false,
    });
  }
}

