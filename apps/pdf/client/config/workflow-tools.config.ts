import { ToolDefinition } from '../types/workflow.types.js';

export const WORKFLOW_TOOLS: ToolDefinition[] = [
  { category: 'pdf', group: 'Optimizar PDF', icon: 'compress', id: 'compress-pdf', name: 'Comprimir PDF' },
  { category: 'pdf', group: 'Organizar PDF', icon: 'call_split', id: 'split-pdf', name: 'Dividir PDF' },
  { category: 'pdf', group: 'Organizar PDF', icon: 'layers', id: 'organize-pdf', name: 'Ordenar páginas PDF' },
  { category: 'pdf', group: 'Convertir PDF', icon: 'description', id: 'pdf-to-word', isTerminal: true, name: 'PDF a Word' },
  { category: 'pdf', group: 'Convertir PDF', icon: 'table_chart', id: 'pdf-to-excel', isTerminal: true, name: 'PDF a Excel' },
  { category: 'pdf', group: 'Convertir PDF', icon: 'slideshow', id: 'pdf-to-powerpoint', isTerminal: true, name: 'PDF a PowerPoint' },
  { category: 'pdf', group: 'Convertir PDF', icon: 'image', id: 'pdf-to-jpg', isTerminal: true, name: 'PDF a JPG' },
];
