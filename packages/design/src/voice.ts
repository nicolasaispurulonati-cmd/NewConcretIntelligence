/**
 * La voz de la plataforma, verificable.
 *
 * "La plataforma habla como un profesional. No utiliza lenguaje robótico. No
 *  utiliza frases exageradas. No utiliza emojis. No felicita constantemente al
 *  usuario."
 *
 * Un principio de tono que sólo vive en un documento se pierde en el tercer
 * sprint. Esta función lo hace comprobable: los tests del sistema pasan por acá
 * todos los textos que la plataforma le muestra a una persona.
 */

export interface VoiceViolation {
  readonly rule: string;
  readonly excerpt: string;
  readonly suggestion: string;
}

const EMOJI =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{1F000}-\u{1F02F}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/u;

const EXAGGERATIONS = [
  'increíble',
  'genial',
  'perfecto',
  'excelente',
  'fantástico',
  'impresionante',
  'asombroso',
  'buenísimo',
];

const CONGRATULATIONS = [
  'felicitaciones',
  'felicidades',
  'muy bien hecho',
  'buen trabajo',
  'lo lograste',
];

const ROBOTIC = ['error 500', 'error 404', 'null', 'undefined', 'exception', 'stack trace'];

/**
 * Revisa un texto destinado al usuario.
 *
 * Devuelve las infracciones con una sugerencia concreta: el objetivo es
 * corregir, no reprobar.
 */
export function checkVoice(text: string): readonly VoiceViolation[] {
  const violations: VoiceViolation[] = [];
  const lower = text.toLowerCase();

  const emoji = EMOJI.exec(text);
  if (emoji) {
    violations.push({
      rule: 'Sin emojis',
      excerpt: emoji[0],
      suggestion: 'Quitarlo. El significado tiene que estar en las palabras.',
    });
  }

  if (text.includes('¡') || text.includes('!')) {
    violations.push({
      rule: 'Sin signos de exclamación',
      excerpt: text.slice(Math.max(0, text.indexOf('!') - 30), text.indexOf('!') + 1).trim(),
      suggestion: 'Terminar la frase con punto. "Presupuesto generado correctamente."',
    });
  }

  for (const word of EXAGGERATIONS) {
    if (lower.includes(word)) {
      violations.push({
        rule: 'Sin frases exageradas',
        excerpt: word,
        suggestion: 'Describir el hecho: qué pasó y qué significa.',
      });
    }
  }

  for (const phrase of CONGRATULATIONS) {
    if (lower.includes(phrase)) {
      violations.push({
        rule: 'No felicitar al usuario',
        excerpt: phrase,
        suggestion: 'Confirmar la acción y seguir. El usuario está trabajando, no jugando.',
      });
    }
  }

  for (const term of ROBOTIC) {
    if (lower.includes(term)) {
      violations.push({
        rule: 'El error enseña',
        excerpt: term,
        suggestion:
          'Decir qué no se pudo hacer, por qué, y ofrecer una acción. "No fue posible generar el presupuesto porque el cliente no tiene condición de pago asignada."',
      });
    }
  }

  return violations;
}

/** Para usar en tests. Falla con el detalle de qué corregir. */
export function assertVoice(text: string, context = 'texto'): void {
  const violations = checkVoice(text);
  if (violations.length === 0) return;

  const detail = violations
    .map((violation) => `  · ${violation.rule} — "${violation.excerpt}". ${violation.suggestion}`)
    .join('\n');

  throw new Error(`La voz de la plataforma no se respeta en ${context}:\n${detail}`);
}
