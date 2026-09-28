import { BadRequestException, ForbiddenException, HttpException, HttpStatus, Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { randomUUID } from 'crypto';

import { AIInteractionEntity } from './entities/ai-interaction.entity';
import { AIInteractionType } from './enums/ai-interaction-type.enum';
import { ChatAiAttachmentDto, ChatAiDto, ChatAiMode } from './dto/chat-ai.dto';
import { parseAttribute, validUmlType } from '../code-generation/uml-analysis';
import { DiagramsService } from '../diagrams/diagrams.service';

type OpenAIInputPart = { type: 'input_text'; text: string } | { type: 'input_image'; image_url: string } | { type: 'input_file'; filename: string; file_data: string };

type DiagramContent = {
  elements: Array<Record<string, any>>;
  connections: Array<Record<string, any>>;
  metadata: Record<string, any>;
};

type AgentResponse = {
  message: string;
  actions: Array<Record<string, any>>;
  mode: ChatAiMode;
};

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly systemPrompts = {
    ask: `Eres un experto en UML y diseño de software. Tu trabajo es ayudar a los usuarios a entender y mejorar sus diagramas UML de clases.

Puedes:
- Analizar diagramas UML existentes
- Sugerir mejoras de diseño
- Explicar conceptos de UML
- Responder preguntas sobre patrones de diseño
- Validar buenas prácticas

Responde siempre en español, de manera clara y educativa. Si no tienes información sobre el diagrama, pregunta por más detalles.`,
    agent: `Interpret the user's free-form Spanish or English text, image and current diagram. Return ONLY JSON {"intent":"ask|edit","message":"natural-language response","actions":[]}. Questions and explanations without a request to change the diagram are ask with no actions. Requests to create or edit content in the current diagram are edit with nonempty actions. An image alone requests creation or updating from the image; preserve unrelated existing content. Never delete or replace existing content unless clearly requested; if destructive intent is ambiguous, ask for clarification with no actions. If edits cannot be determined safely, return ask with an honest explanation and no actions. Supported action types: create_class, create_interface, create_abstract_class, create_enum, create_relationship, modify_element, delete_element. Create nodes with unique ids and names; create_enum needs literals (strings). Attributes must be UML name: type strings using String, UUID, int, boolean, date, datetime, existing class names, or List/Set/Map of these; never SQL types or PK/FK annotations. For create_relationship use data {"id":"unique-id","type":"association|dependency|inheritance|implementation|composition|aggregation","sourceId":"existing-or-new-node-id","targetId":"existing-or-new-node-id","sourceMultiplicity":"1","targetMultiplicity":"*"}. For modify_element use data {"targetId":"existing-node-id","name":"NewName"} or attributes/methods/literals/position/addAttributes/removeAttributes. For delete_element use data {"targetId":"existing-node-or-edge-id"}. Use exact existing IDs; new relationship endpoints reference existing or created node IDs. Do not use names as references. Only emit supported fields.`,
  };

  private initialized = false;
  private apiKey?: string;
  private model = 'gpt-5.5';

  constructor(
    @InjectRepository(AIInteractionEntity)
    private readonly interactionsRepository: Repository<AIInteractionEntity>,
    private readonly configService: ConfigService,
    private readonly diagramsService: DiagramsService,
  ) {}

  private initialize() {
    if (this.initialized) return;

    this.apiKey = this.configService.get<string>('OPENAI_API_KEY')?.trim() || undefined;
    this.model = this.configService.get<string>('OPENAI_MODEL')?.trim() || 'gpt-5.5';
    this.initialized = true;
  }

  private buildContext(
    diagramData: any,
    conversationHistory: Array<{ user: string; ai: string }> = [],
    sourceText?: string | null,
    attachments: Array<NonNullable<ChatAiDto['attachments']>[number]> = [],
  ) {
    let context = '';

    context += 'Current diagram context; respect the user intent and existing content.\n';

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

  private buildUserParts(payload: ChatAiDto, context: string): OpenAIInputPart[] {
    const parts: OpenAIInputPart[] = [{ type: 'input_text', text: `${context}\n\nUser: ${payload.message?.trim() || '[Attachment provided]'}`.trim() }];
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
    if (actionType === 'create_enum') return 'uml.Enumeration';
    return 'uml.Class';
  }

  private getElementNameFromAction(actionType: string, data: any) {
    const name = String(data?.name ?? '');
    if (actionType === 'create_interface' && !name.startsWith('<<interface>>')) return `<<interface>>\n${name}`;
    if (actionType === 'create_abstract_class' && !name.startsWith('<<abstract>>')) return `<<abstract>>\n${name}`;
    if (actionType === 'create_enum' && !name.startsWith('<<enumeration>>')) return `<<enumeration>>\n${name}`;
    return name;
  }

  private resolveElementIdMap(actions: Array<Record<string, any>>) {
    const map = new Map<string, string>();

    actions.forEach((action) => {
      if (!['create_class', 'create_interface', 'create_abstract_class', 'create_enum'].includes(String(action.type))) return;
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

      if (['create_class', 'create_interface', 'create_abstract_class', 'create_enum'].includes(type)) {
        const id = String(data.id ?? randomUUID());
        idMap.set(id.toLowerCase(), id);
        if (data.name) idMap.set(String(data.name).toLowerCase(), id);

        const element = {
          id,
          type: this.getElementTypeFromAction(type),
          name: this.getElementNameFromAction(type, data),
          attributes: Array.isArray(data.attributes) ? data.attributes : [],
          methods: Array.isArray(data.methods) ? data.methods : [],
          literals: Array.isArray(data.literals) ? data.literals : [],
          position: data.position ?? { x: 100, y: 100 },
          size: data.size,
        };

        content.elements.push(element);
        return;
      }

      if (type === 'create_relationship') {
        const id = String(data.id ?? randomUUID());
        const sourceId = this.resolveReference(data.sourceId ?? data.source ?? data.sourceName, idMap);
        const targetId = this.resolveReference(data.targetId ?? data.target ?? data.targetName, idMap);
        if (!sourceId || !targetId) throw new BadRequestException('Invalid relationship endpoints');

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

        content.connections.push(connection);
        return;
      }

      const targetId = String(data.targetId ?? data.id ?? '');
       if (!targetId) throw new BadRequestException('Missing action target');

       if (type === 'delete_element') {
         content.elements = content.elements.filter((item) => item.id !== targetId);
         content.connections = content.connections.filter((item) => item.id !== targetId && item.sourceId !== targetId && item.targetId !== targetId);
         return;
       }

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
           ...(typeof data.name === 'string' ? { name: this.getElementNameFromAction(current.type === 'uml.Interface' ? 'create_interface' : current.type === 'uml.Enumeration' ? 'create_enum' : current.type === 'uml.AbstractClass' ? 'create_abstract_class' : 'create_class', data) } : {}),
          ...(typeof data.type === 'string' ? { type: data.type } : {}),
          ...(typeof data.position === 'object' ? { position: data.position } : {}),
           ...(Array.isArray(data.methods) ? { methods: data.methods } : {}),
           ...(Array.isArray(data.literals) ? { literals: data.literals } : {}),
          attributes: nextAttributes,
        };
        return;
      }

       throw new BadRequestException('Missing action target');
    });

    return content;
  }

  async callOpenAI(systemPrompt: string, userParts: OpenAIInputPart[], mode: ChatAiMode = ChatAiMode.ASK) {
    this.initialize();

    if (!this.apiKey) {
      throw new ServiceUnavailableException('AI service not available. Please configure OPENAI_API_KEY.');
    }

    let response;
    try {
      response = await axios.post(
      'https://api.openai.com/v1/responses',
      {
        model: this.model,
        instructions: systemPrompt,
        input: [{ role: 'user', content: userParts }],
        ...(mode === ChatAiMode.AGENT ? { text: { format: { type: 'json_object' } } } : {}),
      },
      { timeout: 60000, headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' } },
      );
    } catch (error) {
      if (!axios.isAxiosError(error)) throw error;
      const status = error.response?.status;
      const upstreamCode = error.response?.data?.error?.code;
      const safeCode = typeof upstreamCode === 'string' && /^(invalid_json|invalid_request_error|invalid_parameter|unsupported_parameter|model_not_found|invalid_api_key|insufficient_quota|rate_limit_exceeded)$/.test(upstreamCode)
        ? upstreamCode : undefined;
      const upstreamParam = error.response?.data?.error?.param;
      const safeParam = typeof upstreamParam === 'string' && /^(model|text\.format|input|input\.[0-9]+\.content|instructions)$/.test(upstreamParam)
        ? upstreamParam.replace(/^input\.[0-9]+\.content$/, 'input.*.content') : undefined;
      this.logger.warn(`OpenAI request failed: status=${Number.isInteger(status) && status >= 100 && status <= 599 ? status : 'unknown'} code=${safeCode ?? 'unknown'} parameter=${safeParam ?? 'unknown'}`);
      if (status === 401) throw new UnauthorizedException('AI provider authentication failed');
      if (status === 403) throw new ForbiddenException('AI provider access denied');
      if (status === 429) throw new HttpException('AI provider rate limit reached. Please retry later.', HttpStatus.TOO_MANY_REQUESTS);
      if (status === 400 || status === 404 || status === 422) {
        throw new HttpException({ message: 'AI provider rejected the request. Check the configured model and input format.', code: safeCode, parameter: safeParam }, status);
      }
      if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') throw new HttpException('AI provider request timed out', HttpStatus.GATEWAY_TIMEOUT);
      throw new ServiceUnavailableException('AI provider is unavailable. Please retry later.');
    }

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
      if (typeof parsed?.message !== 'string' || !parsed.message.trim() || /^\s*(?:[{[]|```|@startuml)/i.test(parsed.message)) throw new Error('Non-conversational response');
      if (parsed?.intent === 'ask' && Array.isArray(parsed.actions) && parsed.actions.length === 0 && typeof parsed.message === 'string' && parsed.message.trim()) {
        return { success: true, message: parsed.message, actions: [], mode: ChatAiMode.ASK };
      }
      const actions = this.validateActions(parsed?.actions, diagramData);
      if (parsed?.intent !== 'edit' || typeof parsed?.message !== 'string' || !parsed.message.trim() || !actions) throw new Error('Invalid diagram response');
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
    const names = new Set(content.elements.map((item) => String(item.name).replace(/^<<.*?>>\n/, '').toLowerCase()));
    const typeNames = new Set([...names, ...actions.filter((action) => action && typeof action === 'object' && ['create_class', 'create_interface', 'create_abstract_class', 'create_enum'].includes(action.type) && typeof action.data?.name === 'string').map((action) => action.data.name.toLowerCase())]);
    const string = (value: unknown): value is string => typeof value === 'string' && !!value.trim();
    const strings = (value: unknown) => Array.isArray(value) && value.every(string);
    const attributes = (value: unknown) => strings(value) && value.every((attribute: string) => {
      const parsed = parseAttribute(attribute);
      return parsed && !/[={}]/.test(attribute) && validUmlType(parsed.sourceType, typeNames);
    });
    const position = (value: any) => value && Number.isFinite(value.x) && Number.isFinite(value.y);
    const allowed = (data: any, keys: string[]) => Object.keys(data).every((key) => keys.includes(key));
    const nodeActions = ['create_class', 'create_interface', 'create_abstract_class', 'create_enum'];
    const valid: Array<Record<string, any>> = [];

    for (const action of actions) {
      if (!action || typeof action !== 'object' || Object.keys(action).some((key) => !['type', 'data'].includes(key)) || !action.data || typeof action.data !== 'object' || Array.isArray(action.data)) return null;
      const { type, data } = action;
      if (nodeActions.includes(type)) {
        if (!allowed(data, ['id', 'name', 'attributes', 'methods', 'literals', 'position']) || !string(data.name) ||
          (data.attributes !== undefined && !attributes(data.attributes)) || (data.methods !== undefined && !strings(data.methods)) ||
          (data.literals !== undefined && !strings(data.literals)) || (type === 'create_enum' && !strings(data.literals)) || (data.position !== undefined && !position(data.position))) return null;
        const id = data.id ?? randomUUID();
         if (!string(id) || nodeIds.has(id) || edgeIds.has(id) || names.has(data.name.toLowerCase())) return null;
        nodeIds.add(id);
        names.add(data.name.toLowerCase());
        valid.push({ type, data: { ...data, id, position: data.position ?? { x: 100, y: 100 } } });
      } else if (type === 'create_relationship') {
        if (!allowed(data, ['id', 'type', 'sourceId', 'targetId', 'sourceMultiplicity', 'targetMultiplicity']) ||
          !string(data.sourceId) || !string(data.targetId) || !nodeIds.has(data.sourceId) || !nodeIds.has(data.targetId) || data.sourceId === data.targetId ||
          (data.type !== undefined && !['association', 'dependency', 'inheritance', 'implementation', 'composition', 'aggregation'].includes(data.type)) ||
          (data.sourceMultiplicity !== undefined && !string(data.sourceMultiplicity)) || (data.targetMultiplicity !== undefined && !string(data.targetMultiplicity))) return null;
        const id = data.id ?? randomUUID();
         if (!string(id) || edgeIds.has(id) || nodeIds.has(id)) return null;
        edgeIds.add(id);
        valid.push({ type, data: { ...data, id } });
      } else if (type === 'modify_element') {
        if (!allowed(data, ['targetId', 'name', 'attributes', 'methods', 'literals', 'position', 'addAttributes', 'removeAttributes']) ||
          !string(data.targetId) || !nodeIds.has(data.targetId) || Object.keys(data).length < 2 ||
          (data.name !== undefined && !string(data.name)) ||
          [data.attributes, data.addAttributes, data.removeAttributes].filter((value) => value !== undefined).length > 1 ||
          ['attributes', 'methods', 'literals', 'addAttributes', 'removeAttributes'].some((key) => data[key] !== undefined && !strings(data[key])) ||
          ['attributes', 'addAttributes'].some((key) => data[key] !== undefined && !attributes(data[key])) ||
          (data.position !== undefined && !position(data.position))) return null;
         if (data.name !== undefined) {
           const old = content.elements.find((item) => item.id === data.targetId);
           const next = data.name.toLowerCase();
           if (names.has(next) && old?.name?.replace(/^<<.*?>>\n/, '').toLowerCase() !== next) return null;
           names.delete(String(old?.name).replace(/^<<.*?>>\n/, '').toLowerCase());
           names.add(next);
         }
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
     if (!payload.message?.trim() && !payload.attachments?.some((item) => item.base64 || item.text)) throw new BadRequestException('Message or attachment is required');
     if (!payload.diagramId) throw new BadRequestException('Open diagram is required');
     const diagram = await this.diagramsService.getDiagram(userId, payload.diagramId);
     const context = this.buildContext(diagram.content, payload.conversationHistory || [], payload.sourceText || null, payload.attachments || []);
     const userParts = this.buildUserParts(payload, context);

     try {
       const aiResponse = await this.callOpenAI(this.systemPrompts.agent, userParts, ChatAiMode.AGENT);
       const processedResponse = this.processAgentResponse(aiResponse, diagram.content);
       if (processedResponse.success && processedResponse.mode === ChatAiMode.AGENT) {
         const content = this.buildContentFromActions(diagram.content, processedResponse.actions);
         const canonicalContent = await this.diagramsService.compareAndSave(userId, diagram.id, diagram.content, content);
         await this.saveInteraction(userId, diagram.id, AIInteractionType.AGENT, payload.message || '[Image]', processedResponse.message);
         return { ...processedResponse, content: canonicalContent };
       }
       if (processedResponse.success) await this.saveInteraction(userId, diagram.id, AIInteractionType.ASK, payload.message || '[Image]', processedResponse.message);

       return processedResponse;
    } catch (error: any) {
      if (error instanceof HttpException) throw error;

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
