import { z } from 'zod';

const id = z.string().trim().min(1);
const text = z.string().trim().min(1);
const refs = z.array(id).min(1);

export const ConceptNodeSchema = z.object({
  id,
  title: text,
  summary: text,
  sourceRefs: refs,
  originBlocks: z.array(id).optional(),
  keyTerms: z.array(text).optional(),
});

export const ConceptBranchSchema = z.object({
  id,
  title: text,
  description: text.optional(),
  originBlocks: z.array(id).optional(),
  nodes: z.array(ConceptNodeSchema).min(1),
});

export const ConceptTreeSchema = z.object({
  schemaVersion: z.literal(1),
  id,
  documentId: id.optional(),
  rootTitle: text,
  summary: text.optional(),
  treeHash: z.string().optional(),
  complete: z.boolean().optional(),
  warnings: z.array(z.string()).optional(),
  branches: z.array(ConceptBranchSchema).min(1),
});

export type ConceptNode = z.infer<typeof ConceptNodeSchema>;
export type ConceptBranch = z.infer<typeof ConceptBranchSchema>;
export type ConceptTree = z.infer<typeof ConceptTreeSchema>;

export const conceptTreeJsonSchema = z.toJSONSchema(ConceptTreeSchema);
