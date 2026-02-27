/**
 * CRUD for selector_knowledge + increment usage_count.
 */

import { prisma } from "@/lib/db/client";

export interface SelectorKnowledgeRow {
  id: string;
  projectId: string;
  applicationId: string;
  semanticKey: string;
  selector: string;
  confidenceScore: number;
  usageCount: number;
  lastVerifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export async function findSelector(
  projectId: string,
  applicationId: string,
  semanticKey: string
): Promise<SelectorKnowledgeRow | null> {
  const row = await prisma.selectorKnowledge.findUnique({
    where: {
      projectId_applicationId_semanticKey: { projectId, applicationId, semanticKey },
    },
  });
  return row;
}

export async function upsertSelector(params: {
  projectId: string;
  applicationId: string;
  semanticKey: string;
  selector: string;
  confidenceScore?: number;
}): Promise<SelectorKnowledgeRow> {
  const now = new Date();
  const row = await prisma.selectorKnowledge.upsert({
    where: {
      projectId_applicationId_semanticKey: {
        projectId: params.projectId,
        applicationId: params.applicationId,
        semanticKey: params.semanticKey,
      },
    },
    create: {
      projectId: params.projectId,
      applicationId: params.applicationId,
      semanticKey: params.semanticKey,
      selector: params.selector,
      confidenceScore: params.confidenceScore ?? 1.0,
      usageCount: 1,
      lastVerifiedAt: now,
    },
    update: {
      selector: params.selector,
      confidenceScore: params.confidenceScore ?? 1.0,
      usageCount: { increment: 1 },
      lastVerifiedAt: now,
      updatedAt: now,
    },
  });
  return row as SelectorKnowledgeRow;
}

export async function incrementUsageCount(
  projectId: string,
  applicationId: string,
  semanticKey: string
): Promise<void> {
  const now = new Date();
  await prisma.selectorKnowledge.updateMany({
    where: {
      projectId,
      applicationId,
      semanticKey,
    },
    data: {
      usageCount: { increment: 1 },
      lastVerifiedAt: now,
      updatedAt: now,
    },
  });
}
