import { Request, Response } from 'express';
import { deleteHrDocument, getAllDepartments, getAllEmployees, getDocumentsByEmployeeId, getEmployeeById, getHrSummaryStats, getOrganigramTree, getVacationRequests, hireEmployee, requestVacation, reviewVacationRequest, terminateEmployee, updateEmployee, uploadHrDocument } from '../services/hr.service.js';
import { logger } from '../services/logger.service.js';
import { DocumentType, EmployeeStatus, EmploymentType, HireEmployeeInput, SalaryFrequency, VacationStatus } from '../types/hr.types.js';

export async function getHrOverview(_req: Request, res: Response): Promise<void> {
  try {
    const [stats, departments, recentEmployees, pendingVacations] = await Promise.all([
      getHrSummaryStats(),
      getAllDepartments(),
      getAllEmployees(),
      getVacationRequests(undefined, 'pending'),
    ]);

    res.json({
      departments,
      pending_vacations: pendingVacations.slice(0, 5),
      recent_employees: recentEmployees.slice(0, 10),
      stats,
      success: true,
    });
  } catch (err) {
    logger.app.error('Error al obtener datos generales de RRHH', err);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
}

export async function listDepartments(_req: Request, res: Response): Promise<void> {
  try {
    const departments = await getAllDepartments();
    res.json({
      departments,
      success: true,
    });
  } catch (err) {
    logger.app.error('Error al listar departamentos', err);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
}

export async function listEmployees(req: Request, res: Response): Promise<void> {
  try {
    const departmentId = typeof req.query.department_id === 'string' ? req.query.department_id : undefined;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;

    const employees = await getAllEmployees({ department_id: departmentId, search, status });
    res.json({
      employees,
      success: true,
      total: employees.length,
    });
  } catch (err) {
    logger.app.error('Error al listar empleados', err);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
}

export async function getEmployee(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const employee = await getEmployeeById(id);
    if (!employee) {
      res.status(404).json({
        error: 'Empleado no encontrado.',
        success: false,
      });
      return;
    }

    const [documents, vacations] = await Promise.all([
      getDocumentsByEmployeeId(id),
      getVacationRequests(id),
    ]);

    res.json({
      documents,
      employee,
      success: true,
      vacations,
    });
  } catch (err) {
    logger.app.error('Error al obtener detalle de empleado', err);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
}

export async function postHireEmployee(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as Partial<HireEmployeeInput>;
    const fullName = body.full_name?.trim();
    const departmentId = body.department_id?.trim();
    const jobTitle = body.job_title?.trim();
    const role = body.role?.trim() || 'USER';
    const salaryAmount = typeof body.salary_amount === 'number' ? body.salary_amount : parseFloat(String(body.salary_amount)) || 0;

    if (!fullName || !departmentId || !jobTitle) {
      res.status(400).json({
        error: 'El nombre completo, departamento y puesto de trabajo son obligatorios.',
        success: false,
      });
      return;
    }

    const input: HireEmployeeInput = {
      department_id: departmentId,
      email: body.email?.trim() || undefined,
      employment_type: body.employment_type || 'full_time',
      full_name: fullName,
      hire_date: body.hire_date || new Date().toISOString().split('T')[0],
      job_title: jobTitle,
      manager_id: body.manager_id || null,
      notes: body.notes?.trim() || undefined,
      role,
      salary_amount: salaryAmount,
      salary_currency: body.salary_currency || 'USD',
      salary_frequency: body.salary_frequency || 'monthly',
      vacation_days_allocated: typeof body.vacation_days_allocated === 'number' ? body.vacation_days_allocated : 15,
    };

    const result = await hireEmployee(input);

    res.status(201).json({
      credentials: result.credentials,
      employee: result.employee,
      message: 'Trabajador contratado exitosamente. Se han generado sus credenciales por defecto.',
      success: true,
    });
  } catch (err: any) {
    logger.app.error('Error al contratar trabajador', err);
    const clientMessage = err.message && err.message.includes('correo')
      ? err.message
      : 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.';
    res.status(400).json({
      error: clientMessage,
      success: false,
    });
  }
}

export async function patchEmployee(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const body = req.body as {
      department_id?: string;
      employment_type?: EmploymentType;
      job_title?: string;
      manager_id?: string | null;
      notes?: string | null;
      role?: string;
      salary_amount?: number;
      salary_currency?: string;
      salary_frequency?: SalaryFrequency;
      status?: EmployeeStatus;
      vacation_days_allocated?: number;
      vacation_days_used?: number;
    };

    const updated = await updateEmployee(id, body);
    if (!updated) {
      res.status(404).json({
        error: 'Empleado no encontrado.',
        success: false,
      });
      return;
    }

    res.json({
      employee: updated,
      message: 'Información del empleado actualizada correctamente.',
      success: true,
    });
  } catch (err) {
    logger.app.error('Error al actualizar empleado', err);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
}

export async function deleteEmployee(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { notes } = req.body as { notes?: string };
    const success = await terminateEmployee(id, notes);
    if (!success) {
      res.status(404).json({
        error: 'Empleado no encontrado.',
        success: false,
      });
      return;
    }

    res.json({
      message: 'Empleado dado de baja exitosamente.',
      success: true,
    });
  } catch (err) {
    logger.app.error('Error al finalizar contrato de empleado', err);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
}

export async function getOrganigram(_req: Request, res: Response): Promise<void> {
  try {
    const tree = await getOrganigramTree();
    res.json({
      organigram: tree,
      success: true,
    });
  } catch (err) {
    logger.app.error('Error al obtener organigrama', err);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
}

export async function listDocuments(req: Request, res: Response): Promise<void> {
  try {
    const employeeId = typeof req.query.employee_id === 'string' ? req.query.employee_id : undefined;
    const documents = await getDocumentsByEmployeeId(employeeId);
    res.json({
      documents,
      success: true,
      total: documents.length,
    });
  } catch (err) {
    logger.app.error('Error al listar documentos de RRHH', err);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
}

export async function postUploadDocument(req: Request, res: Response): Promise<void> {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({
        error: 'Por favor adjunta un archivo válido para subir.',
        success: false,
      });
      return;
    }

    const { document_type, employee_id, title } = req.body as {
      document_type?: DocumentType;
      employee_id?: string;
      title?: string;
    };

    if (!employee_id || !title || !title.trim()) {
      res.status(400).json({
        error: 'El empleado y el título del documento son obligatorios.',
        success: false,
      });
      return;
    }

    const docType: DocumentType = document_type || 'contract';
    const adminUser = (req as any).adminUser;
    const uploadedByUserId = adminUser?.id;

    const doc = await uploadHrDocument(employee_id, docType, title.trim(), file, uploadedByUserId);

    res.status(201).json({
      document: doc,
      message: 'Documento subido y registrado exitosamente.',
      success: true,
    });
  } catch (err: any) {
    logger.app.error('Error al subir documento de RRHH', err);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
}

export async function deleteDocument(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const success = await deleteHrDocument(id);
    if (!success) {
      res.status(404).json({
        error: 'Documento no encontrado.',
        success: false,
      });
      return;
    }

    res.json({
      message: 'Documento eliminado exitosamente.',
      success: true,
    });
  } catch (err) {
    logger.app.error('Error al eliminar documento de RRHH', err);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
}

export async function listVacationRequests(req: Request, res: Response): Promise<void> {
  try {
    const employeeId = typeof req.query.employee_id === 'string' ? req.query.employee_id : undefined;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;

    const vacations = await getVacationRequests(employeeId, status);
    res.json({
      success: true,
      total: vacations.length,
      vacations,
    });
  } catch (err) {
    logger.app.error('Error al listar solicitudes de vacaciones', err);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
}

export async function postVacationRequest(req: Request, res: Response): Promise<void> {
  try {
    const { days_count, employee_id, end_date, reason, start_date } = req.body as {
      days_count?: number;
      employee_id?: string;
      end_date?: string;
      reason?: string;
      start_date?: string;
    };

    if (!employee_id || !start_date || !end_date) {
      res.status(400).json({
        error: 'El empleado, la fecha de inicio y la fecha de fin son obligatorios.',
        success: false,
      });
      return;
    }

    const days = typeof days_count === 'number' && days_count > 0 ? days_count : 1;
    const request = await requestVacation(employee_id, start_date, end_date, days, reason);

    res.status(201).json({
      message: 'Solicitud de vacaciones registrada exitosamente.',
      request,
      success: true,
    });
  } catch (err) {
    logger.app.error('Error al registrar solicitud de vacaciones', err);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
}

export async function patchVacationRequest(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { review_notes, status } = req.body as { review_notes?: string; status?: VacationStatus };

    if (!status || (status !== 'approved' && status !== 'rejected')) {
      res.status(400).json({
        error: 'El estado debe ser aprobado o rechazado.',
        success: false,
      });
      return;
    }

    const adminUser = (req as any).adminUser;
    const reviewerUserId = adminUser?.id;

    const updated = await reviewVacationRequest(id, status, reviewerUserId, review_notes);
    if (!updated) {
      res.status(404).json({
        error: 'Solicitud de vacaciones no encontrada.',
        success: false,
      });
      return;
    }

    res.json({
      message: status === 'approved' ? 'Solicitud de vacaciones aprobada.' : 'Solicitud de vacaciones rechazada.',
      request: updated,
      success: true,
    });
  } catch (err) {
    logger.app.error('Error al revisar solicitud de vacaciones', err);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
}
