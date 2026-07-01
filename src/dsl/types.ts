export type NodeType = 'service' | 'database' | 'cache' | 'queue' | 'external' | 'lambda';

export const NODE_TYPES: readonly NodeType[] = [
  'service',
  'database',
  'cache',
  'queue',
  'external',
  'lambda',
];

export interface ComponentDecl {
  id: string;
  type: NodeType;
  label: string;
  color?: string;
  group?: string;
  line: number;
}

export interface GroupDecl {
  id: string;
  label: string;
  line: number;
}

export interface EdgeDecl {
  source: string;
  target: string;
  label?: string;
  bidirectional: boolean;
  line: number;
}

export interface ParseError {
  line: number;
  message: string;
}

export interface ParsedDocument {
  components: ComponentDecl[];
  groups: GroupDecl[];
  edges: EdgeDecl[];
  errors: ParseError[];
}
