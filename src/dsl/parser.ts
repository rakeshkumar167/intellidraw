import {
  ComponentDecl,
  EdgeDecl,
  GroupDecl,
  NODE_TYPES,
  NodeType,
  ParsedDocument,
} from './types';

const ID = String.raw`[A-Za-z_][\w.-]*`;
const COMPONENT_RE = new RegExp(`^component\\s+(${ID})\\s*(.*)$`);
const GROUP_RE = new RegExp(`^group\\s+(${ID})\\s*(.*?)\\s*\\{$`);
const EDGE_RE = new RegExp(`^(${ID})\\s*(<->|->)\\s*(${ID})\\s*(?::\\s*(.+?)\\s*)?$`);
// key=value where value is quoted (may contain spaces) or a bare token
const ATTR_RE = /(\w+)=(?:"([^"]*)"|(\S+))/g;

function parseAttrs(raw: string): { attrs: Map<string, string>; leftover: string } {
  const attrs = new Map<string, string>();
  const leftover = raw.replace(ATTR_RE, (_m, key: string, quoted: string, bare: string) => {
    attrs.set(key, quoted ?? bare);
    return '';
  });
  return { attrs, leftover: leftover.trim() };
}

export function parse(text: string): ParsedDocument {
  const components: ComponentDecl[] = [];
  const groups: GroupDecl[] = [];
  const edges: EdgeDecl[] = [];
  const errors: ParsedDocument['errors'] = [];
  const seenIds = new Set<string>();

  let currentGroup: string | undefined;

  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const line = lines[i].trim();
    if (line === '' || line.startsWith('#') || line.startsWith('//')) continue;

    if (line === '}') {
      if (currentGroup === undefined) {
        errors.push({ line: lineNo, message: "'}' without a matching 'group ... {'" });
      }
      currentGroup = undefined;
      continue;
    }

    const groupMatch = line.match(GROUP_RE);
    if (groupMatch) {
      if (currentGroup !== undefined) {
        errors.push({ line: lineNo, message: 'nested groups are not supported' });
        continue;
      }
      const [, id, rest] = groupMatch;
      const { attrs, leftover } = parseAttrs(rest);
      if (leftover !== '') {
        errors.push({ line: lineNo, message: `unexpected text in group declaration: "${leftover}"` });
      }
      groups.push({ id, label: attrs.get('label') ?? id, line: lineNo });
      currentGroup = id;
      continue;
    }

    if (line.startsWith('component')) {
      const compMatch = line.match(COMPONENT_RE);
      if (!compMatch) {
        errors.push({ line: lineNo, message: 'invalid component declaration' });
        continue;
      }
      const [, id, rest] = compMatch;
      if (seenIds.has(id)) {
        errors.push({ line: lineNo, message: `duplicate component id "${id}"` });
        continue;
      }
      const { attrs, leftover } = parseAttrs(rest);
      if (leftover !== '') {
        errors.push({ line: lineNo, message: `unexpected text after component: "${leftover}"` });
        continue;
      }
      const type = attrs.get('type') ?? 'service';
      if (!NODE_TYPES.includes(type as NodeType)) {
        errors.push({
          line: lineNo,
          message: `unknown type "${type}" (expected one of: ${NODE_TYPES.join(', ')})`,
        });
        continue;
      }
      seenIds.add(id);
      const decl: ComponentDecl = { id, type: type as NodeType, label: attrs.get('label') ?? id, line: lineNo };
      const color = attrs.get('color');
      if (color !== undefined) decl.color = color;
      if (currentGroup !== undefined) decl.group = currentGroup;
      components.push(decl);
      continue;
    }

    const edgeMatch = line.match(EDGE_RE);
    if (edgeMatch) {
      const [, source, arrow, target, label] = edgeMatch;
      const decl: EdgeDecl = { source, target, bidirectional: arrow === '<->', line: lineNo };
      if (label !== undefined) decl.label = label;
      edges.push(decl);
      continue;
    }

    errors.push({ line: lineNo, message: `cannot parse line: "${line}"` });
  }

  if (currentGroup !== undefined) {
    errors.push({ line: lines.length, message: `unclosed group "${currentGroup}"` });
  }

  return { components, groups, edges, errors };
}
