function startupErrorMessage(reason: unknown) {
  return reason instanceof Error ? reason.message : String(reason);
}

export async function collectStartupWarnings(tasks: Promise<unknown>[]) {
  const results = await Promise.allSettled(tasks);
  return results.flatMap((result) =>
    result.status === "rejected" ? [startupErrorMessage(result.reason)] : [],
  );
}

export async function collectStartupWarningStages(
  stages: Array<() => Promise<unknown>[]>,
) {
  const warnings: string[] = [];
  for (const createTasks of stages) {
    warnings.push(...(await collectStartupWarnings(createTasks())));
  }
  return warnings;
}

export async function withStartupFallback<T>(
  task: Promise<T>,
  fallback: T,
  warnings: string[],
) {
  try {
    return await task;
  } catch (error) {
    warnings.push(startupErrorMessage(error));
    return fallback;
  }
}
