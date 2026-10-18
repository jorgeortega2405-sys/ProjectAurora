import { Request, Response } from 'express';
import { getMaxWorkflows } from '../config/tools-limits.config.js';
import { getCurrentUser, getSessionUser } from '../services/auth.service.js';
import { logger } from '../services/logger.service.js';
import { getUserEffectivePermissions } from '../services/pbac.service.js';
import { createWorkflow, deleteWorkflow, executeWorkflow, getWorkflowById, getWorkflowResult, listWorkflows, updateWorkflow } from '../services/workflow.service.js';

export async function getWorkflowsHandler(req: Request, res: Response): Promise<void> {
  try {
    const user = getCurrentUser(req);
    if (!user) {
      res.status(401).json({ error: 'No autorizado', success: false });
      return;
    }

    const workflows = await listWorkflows(user.id);
    res.json({ success: true, workflows });
  } catch (err) {
    logger.app.error('Error al obtener lista de flujos de trabajo', err);
    res.status(500).json({ error: 'No se pudo obtener la lista de flujos de trabajo', success: false });
  }
}

export async function getWorkflowHandler(req: Request, res: Response): Promise<void> {
  try {
    const user = getCurrentUser(req);
    const workflowId = req.params.id;
    if (!user) {
      res.status(401).json({ error: 'No autorizado', success: false });
      return;
    }

    const workflow = await getWorkflowById(workflowId, user.id);
    if (!workflow) {
      res.status(404).json({ error: 'Flujo de trabajo no encontrado', success: false });
      return;
    }

    res.json({ success: true, workflow });
  } catch (err) {
    logger.app.error('Error al obtener detalle del flujo de trabajo', err);
    res.status(500).json({ error: 'No se pudo cargar el flujo de trabajo', success: false });
  }
}

export async function createWorkflowHandler(req: Request, res: Response): Promise<void> {
  try {
    const user = (req as any).user || (await getSessionUser(req)) || getCurrentUser(req);
    if (!user) {
      res.status(401).json({ error: 'No autorizado', success: false });
      return;
    }

    const permissions: string[] = user.permissions || (await getUserEffectivePermissions(user));
    const maxWorkflows = getMaxWorkflows(permissions);
    const existingWorkflows = await listWorkflows(user.id);

    if (existingWorkflows.length >= maxWorkflows) {
      res.status(403).json({
        code: 'WORKFLOW_LIMIT_REACHED',
        error: `Has alcanzado el límite de ${maxWorkflows} flujo${maxWorkflows === 1 ? '' : 's'} de trabajo de tu plan actual. Sube de categoría para crear más.`,
        limit: maxWorkflows,
        success: false,
      });
      return;
    }

    const { category, description, name, steps } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ error: 'El nombre del flujo es obligatorio', success: false });
      return;
    }

    if (!Array.isArray(steps) || steps.length === 0) {
      res.status(400).json({ error: 'Debes añadir al menos una herramienta al flujo', success: false });
      return;
    }

    const workflow = await createWorkflow(user.id, {
      category: category === 'image' ? 'image' : 'pdf',
      description,
      name,
      steps,
    });

    res.status(201).json({ success: true, workflow });
  } catch (err) {
    logger.app.error('Error al crear flujo de trabajo', err);
    res.status(500).json({ error: 'No se pudo crear el flujo de trabajo', success: false });
  }
}

export async function updateWorkflowHandler(req: Request, res: Response): Promise<void> {
  try {
    const user = getCurrentUser(req);
    const workflowId = req.params.id;
    if (!user) {
      res.status(401).json({ error: 'No autorizado', success: false });
      return;
    }

    const { category, description, name, steps } = req.body;
    const workflow = await updateWorkflow(workflowId, user.id, {
      category,
      description,
      name,
      steps,
    });

    if (!workflow) {
      res.status(404).json({ error: 'Flujo de trabajo no encontrado', success: false });
      return;
    }

    res.json({ success: true, workflow });
  } catch (err) {
    logger.app.error('Error al actualizar flujo de trabajo', err);
    res.status(500).json({ error: 'No se pudo actualizar el flujo de trabajo', success: false });
  }
}

export async function deleteWorkflowHandler(req: Request, res: Response): Promise<void> {
  try {
    const user = getCurrentUser(req);
    const workflowId = req.params.id;
    if (!user) {
      res.status(401).json({ error: 'No autorizado', success: false });
      return;
    }

    const deleted = await deleteWorkflow(workflowId, user.id);
    if (!deleted) {
      res.status(404).json({ error: 'Flujo de trabajo no encontrado', success: false });
      return;
    }

    res.json({ success: true });
  } catch (err) {
    logger.app.error('Error al eliminar flujo de trabajo', err);
    res.status(500).json({ error: 'No se pudo eliminar el flujo de trabajo', success: false });
  }
}

export async function executeWorkflowHandler(req: Request, res: Response): Promise<void> {
  try {
    const user = getCurrentUser(req);
    const workflowId = req.params.id;
    if (!user) {
      res.status(401).json({ error: 'No autorizado', success: false });
      return;
    }

    const file = req.file;
    if (!file || !file.buffer) {
      res.status(400).json({ error: 'Debes proporcionar un archivo para procesar', success: false });
      return;
    }

    const result = await executeWorkflow(workflowId, user.id, file.buffer, file.originalname);
    res.json({ result, success: true });
  } catch (err) {
    logger.app.error('Error al ejecutar flujo de trabajo', err);
    res.status(500).json({ error: 'Ocurrió un error al ejecutar el flujo de trabajo', success: false });
  }
}

export async function downloadWorkflowResultHandler(req: Request, res: Response): Promise<void> {
  try {
    const token = req.params.token;
    if (!token) {
      res.status(400).send('Token no válido');
      return;
    }

    const file = await getWorkflowResult(token);
    if (!file) {
      res.status(404).send('Archivo no encontrado o expirado');
      return;
    }

    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.filename)}"`);
    res.setHeader('Content-Length', file.buffer.length);
    res.send(file.buffer);
  } catch (err) {
    logger.app.error('Error al descargar archivo del flujo de trabajo', err);
    res.status(500).send('Error al descargar el archivo');
  }
}
