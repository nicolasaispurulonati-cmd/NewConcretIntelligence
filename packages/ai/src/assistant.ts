/**
 * El asistente.
 *
 * "La IA aparece cuando aporta valor. Nunca como una pantalla separada."
 *
 * Por eso este módulo expone una función, no una interfaz. Cualquier dominio la
 * llama desde su propio contexto — Compras preguntando qué comprar, Productos
 * preguntando qué actualizar de una FAQ — y recibe una respuesta que ya viene
 * explicada, justificada y con sus fuentes.
 */

import Anthropic from '@anthropic-ai/sdk';

import { recordAudit, type Scope } from '@nci/core';
import type { DomainId } from '@nci/domain';

import { ANSWER_SCHEMA, type AiAnswer } from './contract.js';
import { buildSystemPrompt } from './personality.js';
import { renderContext, retrieveContext, type RetrievedContext } from './retrieval.js';

export interface AssistantConfig {
  readonly apiKey?: string;
  readonly model?: string;
  /**
   * Profundidad de razonamiento. `high` es el equilibrio correcto para
   * consultas de negocio; `xhigh` conviene en análisis ejecutivo.
   */
  readonly effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  readonly maxTokens?: number;
}

export interface AssistRequest {
  readonly question: string;
  /** La entidad que el usuario tiene abierta. Cambia por completo la respuesta. */
  readonly focusEntityId?: string;
  readonly domain?: DomainId;
}

export interface AssistResult {
  readonly answer: AiAnswer;
  /** Qué información se usó. Permite auditar la respuesta después. */
  readonly context: RetrievedContext;
  readonly model: string;
}

const DEFAULT_MODEL = 'claude-opus-5';

export class Assistant {
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly effort: NonNullable<AssistantConfig['effort']>;
  private readonly maxTokens: number;

  constructor(config: AssistantConfig = {}) {
    this.client = new Anthropic(config.apiKey ? { apiKey: config.apiKey } : {});
    this.model = config.model ?? process.env['NCI_AI_MODEL'] ?? DEFAULT_MODEL;
    this.effort = config.effort ?? 'high';
    this.maxTokens = config.maxTokens ?? 16000;
  }

  /**
   * Responde una pregunta con el contexto que esta persona puede ver.
   *
   * El Scope es obligatorio y es lo único que da acceso a los datos: no existe
   * una versión de esta función que consulte la plataforma sin un Actor.
   */
  async assist(scope: Scope, request: AssistRequest): Promise<AssistResult> {
    scope.actor.assert('ai.assistant.read');

    const context = await retrieveContext(scope, {
      question: request.question,
      ...(request.focusEntityId ? { focusEntityId: request.focusEntityId } : {}),
      ...(request.domain ? { domain: request.domain } : {}),
    });

    const response = await this.client.beta.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      // Las clasificaciones de seguridad pueden rechazar una consulta; el
      // reemplazo automático evita que una operación legítima quede sin
      // respuesta por un falso positivo.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      thinking: { type: 'adaptive' },
      output_config: {
        effort: this.effort,
        format: { type: 'json_schema', schema: ANSWER_SCHEMA },
      },
      system: buildSystemPrompt({
        actor: scope.actor,
        ...(request.domain ? { domain: request.domain } : {}),
      }),
      messages: [
        {
          role: 'user',
          content: `${renderContext(context)}\n\n---\n\nPregunta: ${request.question}`,
        },
      ],
      // `fallbacks` y `output_config.format` todavía no están en los tipos
      // publicados del SDK; el cuerpo es válido contra la API.
    } as never);

    const answer = this.readAnswer(response as Anthropic.Beta.BetaMessage);

    await recordAudit(scope, {
      action: 'ai.assist',
      capabilityUsed: 'ai.assistant.read',
      ...(request.focusEntityId ? { entityId: request.focusEntityId } : {}),
      after: {
        pregunta: request.question,
        confianza: answer.confidence,
        fuentes: answer.sources.map((source) => source.entityId),
      },
    });

    return { answer, context, model: this.model };
  }

  /**
   * Extrae la respuesta y convierte un rechazo en una respuesta útil.
   *
   * Un rechazo llega como una respuesta exitosa con contenido vacío. Leer
   * `content[0]` sin verificar `stop_reason` rompe justo cuando algo salió mal.
   */
  private readAnswer(message: Anthropic.Beta.BetaMessage): AiAnswer {
    if (message.stop_reason === 'refusal') {
      return {
        answer: 'No puedo responder esta consulta.',
        explanation:
          'La consulta quedó fuera de lo que el asistente puede procesar por sus políticas de uso.',
        justification: 'La respuesta fue interrumpida antes de generarse.',
        proposedActions: [
          {
            label: 'Reformular la consulta',
            rationale: 'Una formulación más acotada al trabajo concreto suele poder responderse.',
          },
        ],
        sources: [],
        confidence: 'baja',
        missingInformation: 'La consulta no pudo procesarse en su forma actual.',
      };
    }

    const text = message.content.find(
      (block): block is Anthropic.Beta.BetaTextBlock => block.type === 'text',
    );

    if (!text) {
      throw new Error('El asistente no devolvió contenido de texto.');
    }

    return JSON.parse(text.text) as AiAnswer;
  }
}

/** Instancia compartida del proceso. Crear una por consulta es desperdiciar conexiones. */
let shared: Assistant | undefined;

export function getAssistant(): Assistant {
  shared ??= new Assistant();
  return shared;
}
