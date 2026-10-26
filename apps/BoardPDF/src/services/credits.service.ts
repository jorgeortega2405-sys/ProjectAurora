export const AI_CREDIT_COSTS = {
  advancedSummarize: 10,
  advancedTranslate: 10,
  standard: 0,
};

export async function getUserCredits(_userId?: string): Promise<number> {
  return 9999;
}

export async function deductUserCredits(
  _userId?: string,
  _amount?: number,
  _taskDescription = 'ai_task'
): Promise<{ remaining: number; success: boolean }> {
  return { remaining: 9999, success: true };
}

export async function grantUserCredits(
  _userId?: string,
  amount = 0
): Promise<number> {
  return amount;
}
