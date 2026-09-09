import { BadRequestException, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { randomUUID } from 'crypto';

import { AIInteractionEntity } from './entities/ai-interaction.entity';
import { AIInteractionType } from './enums/ai-interaction-type.enum';
import { ChatAiAttachmentDto, ChatAiDto, ChatAiMode } from './dto/chat-ai.dto';

type GeminiPart = {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string;
  };
};

type DiagramContent = {
  elements: Array<Record<string, any>>;
  connections: Array<Record<string, any>>;
  metadata: Record<string, any>;
};

type AgentResponse = {
  message: string;
  actions: Array<Record<string, any>>;
  mode: ChatAiMode.AGENT;
};

@Injectable()
export class AiService {
  private readonly systemPrompts = {
    ask: `Eres un experto en UML y diseño de software. Tu trabajo es ayudar a los usuarios a entender y mejorar sus diagramas UML de clases.

Puedes:
- Analizar diagramas UML existentes
- Sugerir mejoras de diseño
- Explicar conceptos de UML
- Responder preguntas sobre patrones de diseño
- Validar buenas prácticas

Responde siempre en español, de manera clara y educativa. Si no tienes información sobre el diagrama, pregunta por más detalles.`,
    agent: `Eres un asistente especializado en bases de datos, diagramas entidad-relación y UML. Tu trabajo es crear un esquema desde cero o corregir uno existente a partir de texto, imagen o documento.

Debes poder:
- Crear una base de datos desde cero usando una imagen, un documento o una descripción textual.
- Corregir un esquema existente.
- Cambiar relaciones entre tablas o entidades.
- Renombrar tablas, atributos o campos.
- Agregar o eliminar campos, tablas y relaciones.

Reglas:
- Si no hay diagrama actual, genera una propuesta completa desde cero.
- Si hay diagrama actual, devuelve solo cambios incrementales y preserva IDs existentes siempre que sea posible.
- Prioriza tablas o entidades, atributos o campos, claves primarias, claves foráneas y cardinalidades.
- Si la entrada es una imagen o un documento, interpreta el contenido y úsalo como fuente principal.

    Responde SIEMPRE en JSON válido con esta estructura:
{
  "message": "Descripción breve del resultado",
  "actions": [
    {
      "type": "create_class|create_interface|create_abstract_class|create_relationship|modify_element|delete_element",
      "data": {
        "name": "Nombre de la tabla o entidad",
        "attributes": ["id: uuid", "name: string"],
        "methods": [],
        "position": {"x": 100, "y": 100}
      }
    }
  ],
}

Para relaciones usa:
{
  "type": "create_relationship",
  "data": {
    "type": "association|inheritance|implementation|composition|aggregation",
    "sourceId": "id_origen",
    "targetId": "id_destino",
    "sourceMultiplicity": "1",
    "targetMultiplicity": "*"
  }
}

Para modificaciones usa "modify_element" con cambios concretos, por ejemplo renombrar atributos, cambiar relaciones o actualizar tipos.
Cuando sea una modificación, responde solo con las acciones puntuales necesarias, no con el diagrama completo.
Responde siempre en español pero las claves del JSON deben mantenerse en inglés.`,
  };

  private initialized = false;
  private apiKey?: string;
  private model = 'gemini-3.6-flash';

  constructor(
    @InjectRepository(AIInteractionEntity)
    private readonly interactionsRepository: Repository<AIInteractionEntity>,
    private readonly configService: ConfigService,
  ) {}

  private initialize() {
    if (this.initialized) return;

    this.apiKey = this.configService.get<string>('GEMINI_API_KEY');
    const configured = !!this.apiKey && this.apiKey !== 'your-gemini-pro-api-key-here';
    if (!configured) {
      this.apiKey = undefined;
    }
    this.initialized = true;
  }

  private buildContext(
    diagramData: any,
    conversationHistory: Array<{ user: string; ai: string }> = [],
    sourceText?: string | null,
    attachments: Array<NonNullable<ChatAiDto['attachments']>[number]> = [],
  ) {
    let context = '';

    context += 'Objetivo: genera o corrige un esquema de base de datos con acciones concretas y mínimas.\n';

    if (diagramData) {
      const elements = diagramData.elements ?? diagramData.content?.elements ?? [];
      const links = diagramData.links ?? diagramData.connections ?? diagramData.content?.connections ?? [];

      context += '\nDiagrama actual:\n';
      context += `- ${diagramData.elementCount ?? elements.length ?? 0} elementos\n`;
      context += `- ${diagramData.linkCount ?? links.length ?? 0} relaciones\n`;

      if (Array.isArray(elements) && elements.length > 0) {
        context += '\nEntidades actuales:\n';
        elements.forEach((element: any) => {
          const name = element.name?.replace(/<<.*?>>\n/, '') || 'Sin nombre';
          context += `- ${name}`;
          if (element.attributes?.length) context += ` (${element.attributes.length} atributos)`;
          if (element.methods?.length) context += ` (${element.methods.length} métodos)`;
          context += '\n';
        });
      }

      if (Array.isArray(links) && links.length > 0) {
        context += '\nRelaciones existentes:\n';
        links.forEach((link: any) => {
          const source = link.sourceId || link.source || 'origen-desconocido';
          const target = link.targetId || link.target || 'destino-desconocido';
          context += `- ${source} -> ${target}`;
          if (link.type) context += ` (${link.type})`;
          context += '\n';
        });
      }
    } else {
      context += '\nEl diagrama está vacío.\n';
    }

    if (sourceText?.trim()) {
      context += `\nDocumento fuente:\n${sourceText.trim()}\n`;
    }

    const textAttachments = (attachments || []).filter((attachment) => attachment?.text?.trim());
    if (textAttachments.length > 0) {
      context += '\nAdjuntos de texto:\n';
      textAttachments.forEach((attachment, index) => {
        context += `- Adjunto ${index + 1}${attachment.name ? ` (${attachment.name})` : ''}: ${attachment.text?.trim()}\n`;
      });
    }

    if (conversationHistory.length > 0) {
      context += '\nConversación reciente:\n';
      conversationHistory.slice(-3).forEach((conv) => {
        context += `Usuario: ${conv.user}\n`;
        context += `IA: ${conv.ai}\n`;
      });
    }

    return context;
  }

  private normalizeBase64(value: string) {
    return value.includes('base64,') ? value.split('base64,').pop() || value : value;
  }

  private inferMode(payload: ChatAiDto) {
    if (payload.mode) return payload.mode;

    const hasStructuredInput = Boolean(payload.diagramData || payload.sourceText?.trim() || (payload.attachments?.length ?? 0) > 0);
    if (hasStructuredInput) return ChatAiMode.AGENT;

    const agentKeywords = /(crear|generar|diseñar|construir|corregir|modificar|actualizar|renombrar|relacion|tabla|atributo|campo|documento|imagen|esquema|base de datos)/i;
    if (agentKeywords.test(payload.message || '')) return ChatAiMode.AGENT;

    return ChatAiMode.ASK;
  }

  private buildUserParts(payload: ChatAiDto, context: string): GeminiPart[] {
    const parts: GeminiPart[] = [{ text: `${context}\n\nUsuario: ${payload.message}`.trim() }];
    const attachments = payload.attachments || [];

    attachments.forEach((attachment) => {
      if (attachment?.base64?.trim() && attachment?.mimeType?.trim()) {
        parts.push({
          inlineData: {
            mimeType: attachment.mimeType.trim(),
            data: this.normalizeBase64(attachment.base64.trim()),
          },
        });
      }
    });

    return parts;
  }

  private normalizeDiagramContent(diagramData: any): DiagramContent {
    const baseContent = diagramData?.content ?? diagramData ?? {};
    const elements = Array.isArray(baseContent.elements) ? baseContent.elements : Array.isArray(diagramData?.elements) ? diagramData.elements : [];
    const connections = Array.isArray(baseContent.connections)
      ? baseContent.connections
      : Array.isArray(diagramData?.connections)
        ? diagramData.connections
        : Array.isArray(diagramData?.links)
          ? diagramData.links
          : [];

    return {
      elements: elements.map((element: any) => ({ ...element })),
      connections: connections.map((connection: any) => ({ ...connection })),
      metadata: { ...(baseContent.metadata ?? diagramData?.metadata ?? {}) },
    };
  }

  private getConnectionType(action: any) {
    return action?.data?.type || action?.data?.relationType || action?.type || 'association';
  }

  private getElementTypeFromAction(actionType: string) {
    if (actionType === 'create_interface') return 'uml.Interface';
    if (actionType === 'create_abstract_class') return 'uml.AbstractClass';
    return 'uml.Class';
  }

  private getElementNameFromAction(actionType: string, data: any) {
    const name = String(data?.name ?? '');
    if (actionType === 'create_interface' && !name.startsWith('<<interface>>')) return `<<interface>>\n${name}`;
    if (actionType === 'create_abstract_class' && !name.startsWith('<<abstract>>')) return `<<abstract>>\n${name}`;
    return name;
  }

  private resolveElementIdMap(actions: Array<Record<string, any>>) {
    const map = new Map<string, string>();

    actions.forEach((action) => {
      if (!['create_class', 'create_interface', 'create_abstract_class'].includes(String(action.type))) return;
      const data = action.data ?? {};
      const id = String(data.id ?? randomUUID());
      const name = String(data.name ?? '');
      map.set(id.toLowerCase(), id);
      if (name) map.set(name.toLowerCase(), id);
      if (data.alias) map.set(String(data.alias).toLowerCase(), id);
    });

    return map;
  }

  private resolveReference(reference: any, idMap: Map<string, string>) {
    if (!reference) return '';
    const raw = typeof reference === 'object' ? reference?.id ?? reference?.name ?? reference?.alias : reference;
    return idMap.get(String(raw).toLowerCase()) ?? String(raw);
  }

  private buildContentFromActions(diagramData: any, actions: Array<Record<string, any>>): DiagramContent {
    const content = this.normalizeDiagramContent(diagramData);
    const idMap = this.resolveElementIdMap(actions);

    actions.forEach((action) => {
      const type = String(action.type);
      const data = action.data ?? {};

      if (['create_class', 'create_interface', 'create_abstract_class'].includes(type)) {
        const id = String(data.id ?? randomUUID());
        idMap.set(id.toLowerCase(), id);
        if (data.name) idMap.set(String(data.name).toLowerCase(), id);

        const element = {
          id,
          type: this.getElementTypeFromAction(type),
          name: this.getElementNameFromAction(type, data),
          attributes: Array.isArray(data.attributes) ? data.attributes : [],
          methods: Array.isArray(data.methods) ? data.methods : [],
          position: data.position ?? { x: 100, y: 100 },
          size: data.size,
        };

        const index = content.elements.findIndex((item) => String(item.id) === id);
        if (index >= 0) content.elements[index] = { ...content.elements[index], ...element };
        else content.elements.push(element);
        return;
      }

      if (type === 'create_relationship') {
        const id = String(data.id ?? randomUUID());
        const sourceId = this.resolveReference(data.sourceId ?? data.source ?? data.sourceName, idMap);
        const targetId = this.resolveReference(data.targetId ?? data.target ?? data.targetName, idMap);
        if (!sourceId || !targetId) return;

        const connection = {
          id,
          type: this.getConnectionType(action),
          sourceId,
          targetId,
          source: sourceId,
          target: targetId,
          sourceMultiplicity: data.sourceMultiplicity ?? '1',
          targetMultiplicity: data.targetMultiplicity ?? '1',
        };

        const index = content.connections.findIndex((item) => String(item.id) === id);
        if (index >= 0) content.connections[index] = { ...content.connections[index], ...connection };
        else content.connections.push(connection);
        return;
      }

      const targetId = String(data.targetId ?? data.id ?? '');
      if (!targetId) return;

      const elementIndex = content.elements.findIndex((item) => String(item.id) === targetId);
      if (elementIndex >= 0) {
        const current = content.elements[elementIndex];
        const currentAttributes = Array.isArray(current.attributes) ? current.attributes : [];
        const nextAttributes = Array.isArray(data.attributes)
          ? data.attributes
          : Array.isArray(data.addAttributes)
            ? [...currentAttributes, ...data.addAttributes]
            : Array.isArray(data.removeAttributes)
              ? currentAttributes.filter((attribute: string) => !data.removeAttributes.includes(attribute))
              : currentAttributes;

        content.elements[elementIndex] = {
          ...current,
          ...(typeof data.name === 'string' ? { name: data.name } : {}),
          ...(typeof data.type === 'string' ? { type: data.type } : {}),
          ...(typeof data.position === 'object' ? { position: data.position } : {}),
          ...(Array.isArray(data.methods) ? { methods: data.methods } : {}),
          attributes: nextAttributes,
        };
        return;
      }

      const connectionIndex = content.connections.findIndex((item) => String(item.id) === targetId);
      if (connectionIndex >= 0) {
        content.connections[connectionIndex] = {
          ...content.connections[connectionIndex],
          ...(typeof data.sourceId === 'string' ? { sourceId: this.resolveReference(data.sourceId, idMap), source: this.resolveReference(data.sourceId, idMap) } : {}),
          ...(typeof data.targetId === 'string' ? { targetId: this.resolveReference(data.targetId, idMap), target: this.resolveReference(data.targetId, idMap) } : {}),
          ...(typeof data.type === 'string' ? { type: data.type } : {}),
          ...(typeof data.relationType === 'string' ? { type: data.relationType } : {}),
          ...(typeof data.sourceMultiplicity === 'string' ? { sourceMultiplicity: data.sourceMultiplicity } : {}),
          ...(typeof data.targetMultiplicity === 'string' ? { targetMultiplicity: data.targetMultiplicity } : {}),
        };
      }
    });

    return content;
  }

  private async callGemini(systemPrompt: string, userParts: GeminiPart[]) {
    this.initialize();

    if (!this.apiKey) {
      throw new ServiceUnavailableException('AI service not available. Please configure GEMINI_API_KEY.');
    }

    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`,
      {
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: userParts.length > 0 ? userParts : [{ text: 'Analiza la solicitud.' }] }],
        generationConfig: { temperature: 0.2 },
      },
      { timeout: 60000 },
    );

    return response.data?.candidates?.[0]?.content?.parts?.map((part: any) => part.text || '').join('') || '';
  }

  private extractJsonPayload(aiResponse: string) {
    const fencedMatch = aiResponse.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fencedMatch?.[1]) return fencedMatch[1].trim();

    const firstBrace = aiResponse.indexOf('{');
    const lastBrace = aiResponse.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return aiResponse.slice(firstBrace, lastBrace + 1).trim();
    }

    return null;
  }

  private processAgentResponse(aiResponse: string): AgentResponse | { message: string; mode: ChatAiMode.ASK } {
    try {
      const jsonPayload = this.extractJsonPayload(aiResponse);
      if (jsonPayload) {
        const jsonResponse = JSON.parse(jsonPayload);
        if (jsonResponse.message && jsonResponse.actions) {
          const actions = this.validateActions(jsonResponse.actions);
          return {
            message: jsonResponse.message,
            actions,
            mode: ChatAiMode.AGENT,
          };
        }
      }

      return { message: aiResponse, mode: ChatAiMode.ASK };
    } catch {
      return { message: aiResponse, mode: ChatAiMode.ASK };
    }
  }

  private validateActions(actions: unknown) {
    if (!Array.isArray(actions)) return [];

    return actions.filter((action: any) => {
      if (!action?.type || !action?.data) return false;
      return [
        'create_class',
        'create_interface',
        'create_abstract_class',
        'create_relationship',
        'modify_element',
        'delete_element',
        'rename_element',
        'rename_attribute',
        'add_attribute',
        'remove_attribute',
        'update_relationship',
      ].includes(action.type);
    }).map((action: any) => {
      const data = { ...action.data };

      if (['create_class', 'create_interface', 'create_abstract_class'].includes(action.type)) {
        data.id = data.id || randomUUID();
      }

      if (!data.position && ['create_class', 'create_interface', 'create_abstract_class'].includes(action.type)) {
        data.position = { x: 100, y: 100 };
      }

      if (action.type === 'modify_element' && !data.targetId && data.id) {
        data.targetId = data.id;
      }

      return { ...action, data };
    });
  }

  private async saveInteraction(userId: string, diagramId: string | null, interactionType: AIInteractionType, prompt: string, response: string) {
    try {
      await this.interactionsRepository.save(
        this.interactionsRepository.create({
          id: randomUUID(),
          createdAt: new Date(),
          userId,
          diagramId,
          interactionType,
          prompt,
          response,
          context: { timestamp: new Date().toISOString(), mode: interactionType },
          confidenceScore: 1,
        }),
      );
    } catch {
      // No interrumpir el flujo principal.
    }
  }

  async chat(userId: string, payload: ChatAiDto) {
    if (!payload.message?.trim()) {
      throw new BadRequestException('Message is required');
    }

    const mode = this.inferMode(payload);
    const systemPrompt = this.systemPrompts[mode] || this.systemPrompts.ask;
    const context = this.buildContext(payload.diagramData, payload.conversationHistory || [], payload.sourceText || null, payload.attachments || []);
    const userParts = this.buildUserParts(payload, context);

    try {
      const aiResponse = await this.callGemini(systemPrompt, userParts);
      const processedResponse = mode === ChatAiMode.AGENT ? this.processAgentResponse(aiResponse) : { message: aiResponse, mode: ChatAiMode.ASK };

      await this.saveInteraction(userId, payload.diagramId || null, mode === ChatAiMode.AGENT ? AIInteractionType.AGENT : AIInteractionType.ASK, payload.message, aiResponse);

      return { success: true, ...processedResponse };
    } catch (error: any) {
      console.error('========== GEMINI ERROR ==========' );
      console.error('STATUS:', error?.response?.status);
      console.error('DATA:', JSON.stringify(error?.response?.data, null, 2));
      console.error('MESSAGE:', error?.message);
      console.error('==================================');

      const status = error?.response?.status;

      if (status === 401 || status === 403) {
        throw new UnauthorizedException('Error de autorización con Gemini');
      }

      if (status === 429) {
        throw new BadRequestException('API quota exceeded. Please try again later.');
      }

      if (error instanceof ServiceUnavailableException) {
        throw error;
      }

      throw new ServiceUnavailableException('Internal server error processing AI request');
    }
  }

  async getDiagramChatMessages(userId: string, diagramId: string, limit = 100) {
    if (!diagramId?.trim()) {
      throw new BadRequestException('diagramId is required');
    }

    const interactions = await this.interactionsRepository.find({
      where: { userId, diagramId },
      order: { createdAt: 'ASC' },
      take: limit,
      select: ['id', 'interactionType', 'prompt', 'response', 'createdAt'],
    });

    const messages = interactions.flatMap((interaction) => ([
      {
        id: `${interaction.id}:user`,
        interactionId: interaction.id,
        role: 'user' as const,
        content: interaction.prompt,
        interactionType: interaction.interactionType,
        createdAt: interaction.createdAt,
      },
      {
        id: `${interaction.id}:assistant`,
        interactionId: interaction.id,
        role: 'assistant' as const,
        content: interaction.response,
        interactionType: interaction.interactionType,
        createdAt: interaction.createdAt,
      },
    ]));

    return { success: true, diagramId, messages };
  }

}
