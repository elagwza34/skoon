import { prisma } from '@/lib/prisma'

export const MAIN_BRANCH_CODE = 'MAIN'

export class MainBranchConfigurationError extends Error {
  constructor() {
    super('Main branch is not configured')
    this.name = 'MainBranchConfigurationError'
  }
}

/** Resolve the configured operational branch without creating or changing data. */
export async function resolveMainBranch(): Promise<{ id: bigint; name: string }> {
  const branch = await prisma.cafeBranch.findUnique({
    where: { code: MAIN_BRANCH_CODE },
    select: { id: true, name: true, isActive: true },
  })
  if (!branch?.isActive) throw new MainBranchConfigurationError()
  return { id: branch.id, name: branch.name }
}
