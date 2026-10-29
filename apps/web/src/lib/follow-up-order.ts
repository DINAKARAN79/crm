export interface FollowUpStatusRecord {
  isCompleted?: boolean | null;
  isMissed?: boolean | null;
  dueDate?: string | Date | null;
}

export function sortFollowUpsByStatus<T extends FollowUpStatusRecord>(
  followUps: readonly T[],
): T[] {
  const statusOrder = (followUp: FollowUpStatusRecord) =>
    followUp.isCompleted ? 2 : followUp.isMissed ? 1 : 0;
  const dueDateTimestamp = (followUp: FollowUpStatusRecord) => {
    if (!followUp.dueDate) return Number.POSITIVE_INFINITY;
    const timestamp = new Date(followUp.dueDate).getTime();
    return Number.isNaN(timestamp) ? Number.POSITIVE_INFINITY : timestamp;
  };

  return [...followUps].sort((first, second) => {
    const statusDifference = statusOrder(first) - statusOrder(second);
    if (statusDifference !== 0) return statusDifference;
    return dueDateTimestamp(first) - dueDateTimestamp(second);
  });
}
