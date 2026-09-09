import { Injectable } from '@nestjs/common';

@Injectable()
export class CollaborationStateService {
  diagramUsers = new Map<string, Set<string>>();
  elementLocks = new Map<string, { userId: string; timestamp: number; diagramId: string }>();
  cursorPositions = new Map<string, { position: any; diagramId: string; timestamp: number }>();
  elementSelections = new Map<string, { userId: string; diagramId: string; timestamp: number }>();
}
