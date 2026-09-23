import { BadRequestException, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { randomUUID } from 'crypto';

import { AIInteractionEntity } from './entities/ai-interaction.entity';
import { AIInteractionType } from './enums/ai-interaction-type.enum';
import { ChatAiAttachmentDto, ChatAiDto, ChatAiMode } from './dto/chat-ai.dto';
import { containsDiagramCommand, parseDiagramCommands } from './diagram-command-parser';

type OpenAIInputPart = { type: 'input_text'; text: string } | { type: 'input_image'; image_url: string } | { type: 'input_file'; filename: string; file_data: string };

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
    agent: `Interpret the user's requested diagram creation or edit using the attached image/document and current diagram. Return ONLY a JSON object: {"message":"brief result","actions":[{"type":"create_class","data":{"id":"unique-id","name":"User","attributes":[],"methods":[],"position":{"x":100,"y":100}}}]}. Actions must be nonempty and directly executable. Supported types: create_class, create_interface, create_abstract_class, create_enum, create_relationship, modify_element, delete_element. Create nodes with unique ids and names; create_enum also needs literals (strings). For create_relationship use data {"id":"unique-id","type":"association|dependency|inheritance|implementation|composition|aggregation","sourceId":"existing-or-new-node-id","targetId":"existing-or-new-node-id","sourceMultiplicity":"1","targetMultiplicity":"*"}. For modify_element use data {"targetId":"existing-node-id","name":"NewName"} or attributes/methods/literals/position/addAttributes/removeAttributes. For delete_element use data {"targetId":"existing-node-or-edge-id"}. Use exact existing IDs from the diagram; new relationship endpoints must reference existing or created node IDs. Do not use names as references. Only emit fields supported by these actions; no explanatory prose or markdown outside JSON. If the attachment does not contain enough information, return {"message":"Cannot determine diagram changes","actions":[]}.`,
  };

  private initialized = false;
  private apiKey?: string;
  private model = 'gpt-4.1';

  constructor(
    @InjectRepository(AIInteractionEntity)
    private readonly interactionsRepository: Repository<AIInteractionEntity>,
    private readonly configService: ConfigService,
  ) {}

  private initialize() {
    if (this.initialized) return;

    this.apiKey = this.configService.get<string>('OPENAI_API_KEY')?.trim() || undefined;
    this.model = this.configService.get<string>('OPENAI_MODEL')?.trim() || 'gpt-4.1';
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
          context += `- ${name} (id: ${element.id ?? 'unknown'})`;
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
    const agentKeywords = /\b(crear|crea|genera|generar|diseña|diseñar|construye|construir|corrige|corregir|modifica|modificar|actualiza|actualizar|renombra|renombrar|agrega|agregar|añade|elimina|eliminar|create|generate|design|build|edit|modify|update|rename|add|delete|remove|fix)\b/i;
    if (/^\s*¿?\s*(?:qué|que es|cómo|como|cuál|cuáles|por qué|what|how|why|explain)\b/i.test(payload.message || '')) return ChatAiMode.ASK;
    if (agentKeywords.test(payload.message || '')) return ChatAiMode.AGENT;

    return ChatAiMode.ASK;
  }

  private buildUserParts(payload: ChatAiDto, context: string): OpenAIInputPart[] {
    const parts: OpenAIInputPart[] = [{ type: 'input_text', text: `${context}\n\nUsuario: ${payload.message}`.trim() }];
    const attachments = payload.attachments || [];

    attachments.forEach((attachment) => {
      if (!attachment?.base64?.trim()) {
        if (attachment?.text?.trim()) return;
        throw new BadRequestException('Attachment has no content');
      }
      const mime = attachment.mimeType?.trim().toLowerCase();
      const data = this.normalizeBase64(attachment.base64.trim());
      if (['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(mime || '')) {
        parts.push({ type: 'input_image', image_url: `data:${mime};base64,${data}` });
      } else if (mime === 'application/pdf') {
        parts.push({ type: 'input_file', filename: attachment.name?.trim() || 'document.pdf', file_data: `data:application/pdf;base64,${data}` });
      } else {
        throw new BadRequestException('Unsupported attachment type. Upload a PNG, JPEG, WebP, GIF, PDF, or text file.');
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

  async callOpenAI(systemPrompt: string, userParts: OpenAIInputPart[]) {
    this.initialize();

    if (!this.apiKey) {
      throw new ServiceUnavailableException('AI service not available. Please configure OPENAI_API_KEY.');
    }

    const response = await axios.post(
      'https://api.openai.com/v1/responses',
      {
        model: this.model,
        instructions: systemPrompt,
        input: [{ role: 'user', content: userParts }],
      },
      { timeout: 60000, headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' } },
    );

    if (response.data?.status && response.data.status !== 'completed') throw new ServiceUnavailableException('AI response was not completed');
    const output = response.data?.output;
    const text = (Array.isArray(output) ? output : []).flatMap((item: any) => item?.type === 'message' && Array.isArray(item.content)
      ? item.content.filter((part: any) => part?.type === 'output_text' && typeof part.text === 'string').map((part: any) => part.text) : []).join('') || '';
    if (!text.trim()) throw new ServiceUnavailableException('AI response contained no text');
    return text;
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

  private processAgentResponse(aiResponse: string, diagramData: any): AgentResponse & { success: boolean } {
    try {
      const jsonPayload = this.extractJsonPayload(aiResponse);
      const parsed = JSON.parse(jsonPayload || 'null');
      const actions = this.validateActions(parsed?.actions, diagramData);
      if (typeof parsed?.message !== 'string' || !parsed.message.trim() || !actions) throw new Error('Invalid diagram response');
      return { success: true, message: parsed.message, actions, mode: ChatAiMode.AGENT };
    } catch {
      return { success: false, message: 'Could not apply diagram changes. Please clarify your request.', actions: [], mode: ChatAiMode.AGENT };
    }
  }

  private validateActions(actions: unknown, diagramData: any): Array<Record<string, any>> | null {
    if (!Array.isArray(actions) || !actions.length) return null;
    const content = this.normalizeDiagramContent(diagramData);
    const nodeIds = new Set(content.elements.map((item) => item.id));
    const edgeIds = new Set(content.connections.map((item) => item.id));
    const names = new Set(content.elements.map((item) => String(item.name).toLowerCase()));
    const string = (value: unknown): value is string => typeof value === 'string' && !!value.trim();
    const strings = (value: unknown) => Array.isArray(value) && value.every(string);
    const position = (value: any) => value && Number.isFinite(value.x) && Number.isFinite(value.y);
    const allowed = (data: any, keys: string[]) => Object.keys(data).every((key) => keys.includes(key));
    const nodeActions = ['create_class', 'create_interface', 'create_abstract_class', 'create_enum'];
    const valid: Array<Record<string, any>> = [];

    for (const action of actions) {
      if (!action || typeof action !== 'object' || Object.keys(action).some((key) => !['type', 'data'].includes(key)) || !action.data || typeof action.data !== 'object' || Array.isArray(action.data)) return null;
      const { type, data } = action;
      if (nodeActions.includes(type)) {
        if (!allowed(data, ['id', 'name', 'attributes', 'methods', 'literals', 'position']) || !string(data.name) ||
          (data.attributes !== undefined && !strings(data.attributes)) || (data.methods !== undefined && !strings(data.methods)) ||
          (data.literals !== undefined && !strings(data.literals)) || (type === 'create_enum' && !strings(data.literals)) || (data.position !== undefined && !position(data.position))) return null;
        const id = data.id ?? randomUUID();
        if (!string(id) || nodeIds.has(id) || names.has(data.name.toLowerCase())) return null;
        nodeIds.add(id);
        names.add(data.name.toLowerCase());
        valid.push({ type, data: { ...data, id, position: data.position ?? { x: 100, y: 100 } } });
      } else if (type === 'create_relationship') {
        if (!allowed(data, ['id', 'type', 'sourceId', 'targetId', 'sourceMultiplicity', 'targetMultiplicity']) ||
          !string(data.sourceId) || !string(data.targetId) || !nodeIds.has(data.sourceId) || !nodeIds.has(data.targetId) || data.sourceId === data.targetId ||
          (data.type !== undefined && !['association', 'dependency', 'inheritance', 'implementation', 'composition', 'aggregation'].includes(data.type)) ||
          (data.sourceMultiplicity !== undefined && !string(data.sourceMultiplicity)) || (data.targetMultiplicity !== undefined && !string(data.targetMultiplicity))) return null;
        const id = data.id ?? randomUUID();
        if (!string(id) || edgeIds.has(id)) return null;
        edgeIds.add(id);
        valid.push({ type, data: { ...data, id } });
      } else if (type === 'modify_element') {
        if (!allowed(data, ['targetId', 'name', 'attributes', 'methods', 'literals', 'position', 'addAttributes', 'removeAttributes']) ||
          !string(data.targetId) || !nodeIds.has(data.targetId) || Object.keys(data).length < 2 ||
          (data.name !== undefined && !string(data.name)) ||
          [data.attributes, data.addAttributes, data.removeAttributes].filter((value) => value !== undefined).length > 1 ||
          ['attributes', 'methods', 'literals', 'addAttributes', 'removeAttributes'].some((key) => data[key] !== undefined && !strings(data[key])) ||
          (data.position !== undefined && !position(data.position))) return null;
        valid.push(action);
      } else if (type === 'delete_element') {
        if (!allowed(data, ['targetId']) || !string(data.targetId) || (!nodeIds.has(data.targetId) && !edgeIds.has(data.targetId))) return null;
        if (nodeIds.delete(data.targetId)) {
          for (const connection of content.connections) if (connection.sourceId === data.targetId || connection.targetId === data.targetId) edgeIds.delete(connection.id);
        } else edgeIds.delete(data.targetId);
        valid.push(action);
      } else return null;
    }
    return valid;
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

    if (mode === ChatAiMode.AGENT && !payload.attachments?.length && !payload.sourceText?.trim()) {
      const result = parseDiagramCommands(payload.message, payload.diagramData as any);
      if (result.success || containsDiagramCommand(payload.message)) {
        await this.saveInteraction(userId, payload.diagramId || null, AIInteractionType.AGENT, payload.message, result.message);
        return { success: result.success, message: result.message, mode: ChatAiMode.AGENT, actions: result.actions };
      }
    }

    const systemPrompt = this.systemPrompts[mode] || this.systemPrompts.ask;
    const context = this.buildContext(payload.diagramData, payload.conversationHistory || [], payload.sourceText || null, payload.attachments || []);
    const userParts = this.buildUserParts(payload, context);

    try {
      const aiResponse = await this.callOpenAI(systemPrompt, userParts);
      const processedResponse = mode === ChatAiMode.AGENT
        ? this.processAgentResponse(aiResponse, payload.diagramData)
        : { message: aiResponse, mode: ChatAiMode.ASK, success: true };

      if (processedResponse.success) await this.saveInteraction(userId, payload.diagramId || null, mode === ChatAiMode.AGENT ? AIInteractionType.AGENT : AIInteractionType.ASK, payload.message, processedResponse.message);

      return processedResponse;
    } catch (error: any) {
      const status = error?.response?.status;

      if (status === 401 || status === 403) {
        throw new UnauthorizedException('Error de autorización con OpenAI');
      }

      if (status === 429) {
        throw new BadRequestException('API quota exceeded. Please try again later.');
      }

      if (error instanceof ServiceUnavailableException) {
        throw error;
      }

      if (error instanceof BadRequestException) throw error;

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
