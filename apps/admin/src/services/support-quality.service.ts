import { adminConfig } from '../config/env.config.js';
import { logger } from './logger.service.js';

export interface SupportQualityResult {
  isOffensive: boolean;
  reason: string | null;
  refinedMessage: string | null;
}

const OFFENSIVE_TERMS_REGEX = /\b(idiota|idiotas|estupido|estupidos|estúpido|estúpidos|estupida|estúpida|estupidas|estúpidas|imbecil|imbeciles|imbécil|imbéciles|tarado|tarada|tarados|taradas|inutil|inútil|inutiles|inútiles|mierda|mierdas|joder|jodes|jodete|jódete|jodan|puta|putas|puto|putos|pendejo|pendejos|pendeja|pendejas|cabron|cabrón|cabrones|culiao|culiaos|culia|culias|gilipollas|maricon|maricón|maricones|desgraciado|desgraciada|desgraciados|desgraciadas|maldito|maldita|malditos|malditas|callate|cállate|callense|cállense|basura|porqueria|porquería|incompetente|incompetentes|vete a la mierda|no me jodas|no me joda|eres tonto|eres tonta|idiot|idiots|stupid|moron|dumb|asshole|assholes|bitch|bitches|fuck|fucking|shit|bullshit|shut up|useless)\b/i;

const QUALITY_SYSTEM_PROMPT = `Eres el supervisor de calidad y moderación de soporte técnico de ProjectAurora.
Tu tarea es auditar el borrador de respuesta que un agente de soporte técnico va a enviar a un usuario.

Instrucciones:
1. MODERACIÓN: Evalúa si el mensaje del agente contiene lenguaje ofensivo, insultos, actitud agresiva, descalificaciones, groserías, vulgaridades, desprecio, sarcasmo hostil o falta de respeto hacia el cliente.
   - Si es ofensivo, hostil, despectivo o irrespetuoso:
     "is_offensive": true
     "reason": "Explicación concisa y profesional indicando por qué el mensaje es inapropiado"
     "refined_message": null
   - NOTA: El lenguaje coloquial, informal o con modismos comunes (como 'reinicia la compu', 'checa a ver si jala', 'mira', 'dame un segundo') NO es ofensivo; debe clasificarse como is_offensive = false y formalizarse en el paso 2.

2. REFINAMIENTO FORMAL: Si el mensaje NO es ofensivo:
   - Reescribe el borrador con un tono formal, cortés, empático, claro y profesional, idóneo para un servicio de atención técnica de primer nivel.
   - Corrige rigurosamente ortografía, acentuación, puntuación y gramática.
   - Conserva con exactitud todas las instrucciones técnicas, pasos, aclaraciones o preguntas formuladas por el agente, sin omitir datos ni inventar hechos no mencionados.
   - Responde en el mismo idioma del borrador (predeterminadamente español).
   - "is_offensive": false
   - "reason": null
   - "refined_message": "Texto pulido y formalizado"

Responde EXCLUSIVAMENTE un objeto JSON válido con la siguiente estructura exacta:
{
  "is_offensive": boolean,
  "reason": string | null,
  "refined_message": string | null
}`;

export class SupportQualityService {
  static checkOfflineOffensive(text: string): boolean {
    return OFFENSIVE_TERMS_REGEX.test(text);
  }

  static heuristicRefine(text: string): string {
    const trimmed = text.trim();
    if (!trimmed) return trimmed;
    let polished = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
    if (!/[.!?]$/.test(polished)) {
      polished += '.';
    }
    return polished;
  }

  static async refineAndModerateMessage(
    draft: string,
    context?: { subject?: string; tier?: string; userName?: string }
  ): Promise<SupportQualityResult> {
    const trimmed = draft.trim();
    if (!trimmed) {
      return {
        isOffensive: false,
        reason: null,
        refinedMessage: '',
      };
    }

    if (this.checkOfflineOffensive(trimmed)) {
      return {
        isOffensive: true,
        reason: 'El mensaje contiene términos o frases consideradas ofensivas o despectivas.',
        refinedMessage: null,
      };
    }

    const apiKey = adminConfig.gemini.apiKey;
    if (!apiKey) {
      logger.app.info('GEMINI_API_KEY no configurada en admin, aplicando moderación y refinamiento heurístico');
      return {
        isOffensive: false,
        reason: null,
        refinedMessage: this.heuristicRefine(trimmed),
      };
    }

    const primaryModel = adminConfig.gemini.model || 'gemini-flash-lite-latest';
    const fallbackModels = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3-flash-preview'];
    const modelsToTry = [primaryModel, ...fallbackModels.filter((m) => m !== primaryModel)];

    const promptContext = context
      ? `\nContexto del caso:\n- Usuario: ${context.userName || 'Usuario'}\n- Asunto: ${context.subject || 'Sin especificar'}\n- Nivel de soporte: ${context.tier || 'L1'}\n`
      : '';

    const contents = [
      {
        parts: [{ text: `${promptContext}\nBorrador redactado por el agente:\n${trimmed}` }],
        role: 'user',
      },
    ];

    for (const model of modelsToTry) {
      const abortController = new AbortController();
      const timeoutId = setTimeout(() => abortController.abort(), 6000);

      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const res = await fetch(url, {
          body: JSON.stringify({
            contents,
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: 0.2,
            },
            systemInstruction: {
              parts: [{ text: QUALITY_SYSTEM_PROMPT }],
            },
          }),
          headers: {
            'Content-Type': 'application/json',
          },
          method: 'POST',
          signal: abortController.signal,
        });

        clearTimeout(timeoutId);

        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          logger.app.warn(`Respuesta no exitosa de Gemini (${model}) para calidad de soporte: ${res.status}`, { error: errText });
          continue;
        }

        const data = (await res.json()) as any;
        const candidateText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (typeof candidateText === 'string' && candidateText.trim().length > 0) {
          const parsed = JSON.parse(candidateText.trim()) as {
            is_offensive?: boolean;
            reason?: string | null;
            refined_message?: string | null;
          };

          const isOffensive = Boolean(parsed.is_offensive);
          const reason = isOffensive ? (parsed.reason || 'El mensaje fue marcado como inapropiado por la IA.') : null;
          const refinedMessage = isOffensive ? null : (parsed.refined_message || this.heuristicRefine(trimmed));

          return {
            isOffensive,
            reason,
            refinedMessage,
          };
        }
      } catch (err: any) {
        clearTimeout(timeoutId);
        logger.app.warn(`Fallo al evaluar calidad de soporte con Gemini (${model})`, { error: err?.message || err });
      }
    }

    logger.app.info('Filtro de contingencia activado tras fallar peticiones a Gemini');
    return {
      isOffensive: false,
      reason: null,
      refinedMessage: this.heuristicRefine(trimmed),
    };
  }
}
