import { Operation, OperationStatus } from "../../gen/ts/v1/operations_pb";
import { formatBytes, formatDuration, normalizeSnapshotId } from "../lib/formatting";

export enum DisplayType {
  UNKNOWN,
  BACKUP,
  SNAPSHOT,
  FORGET,
  PRUNE,
  CHECK,
  RESTORE,
  STATS,
  RUNHOOK,
  RUNCOMMAND,
}

export interface FlowDisplayInfo {
  displayTime: number,
  flowID: bigint,
  planID: string,
  repoID: string,
  instanceID: string,
  snapshotID: string,
  status: OperationStatus,
  type: DisplayType;
  subtitleComponents: string[];
  hidden: boolean;
  operations: Operation[];
}

export const displayInfoForFlow = (ops: Operation[]): FlowDisplayInfo => {
  ops.sort((a, b) => Number(a.id - b.id));
  const firstOp = ops[0];

  const info: FlowDisplayInfo = {
    flowID: firstOp.flowId,
    planID: firstOp.planId,
    repoID: firstOp.repoId,
    snapshotID: firstOp.snapshotId,
    instanceID: firstOp.instanceId,
    type: getTypeForDisplay(firstOp),
    status: firstOp.status,
    displayTime: Number(firstOp.unixTimeStartMs),
    subtitleComponents: [],
    hidden: false,
    operations: [...ops], // defensive copy
  };

  const duration = Number(firstOp.unixTimeEndMs - firstOp.unixTimeStartMs);

  if (firstOp.status === OperationStatus.STATUS_PENDING) {
    info.subtitleComponents.push("已安排，等待中");
  }

  switch (firstOp.op.case) {
    case "operationBackup":
      {
        const lastStatus = firstOp.op.value.lastStatus;
        if (lastStatus) {
          if (lastStatus.entry.case === "status") {
            const percentage = lastStatus.entry.value.percentDone * 100;
            const bytesDone = formatBytes(Number(lastStatus.entry.value.bytesDone));
            const totalBytes = formatBytes(Number(lastStatus.entry.value.totalBytes));
            info.subtitleComponents.push(`已处理 ${percentage.toFixed(2)}%`);
            info.subtitleComponents.push(`${bytesDone}/${totalBytes}`);
          } else if (lastStatus.entry.case === "summary") {
            const totalBytes = formatBytes(Number(lastStatus.entry.value.totalBytesProcessed));
            info.subtitleComponents.push(`${totalBytes} 共计 ${formatDuration(duration)}`);
            info.subtitleComponents.push(`ID: ${normalizeSnapshotId(lastStatus.entry.value.snapshotId)}`);
          }
        }
      }
      break;
    case "operationRestore":
      {
        const lastStatus = firstOp.op.value.lastStatus;
        if (lastStatus) {
          if (lastStatus.messageType === "summary") {
            const totalBytes = formatBytes(Number(lastStatus.totalBytes));
            info.subtitleComponents.push(`${totalBytes} 共计 ${formatDuration(duration)}`);
          } else if (lastStatus.messageType === "status") {
            const percentage = lastStatus.percentDone * 100;
            const bytesDone = formatBytes(Number(lastStatus.bytesRestored));
            const totalBytes = formatBytes(Number(lastStatus.totalBytes));
            info.subtitleComponents.push(`已处理 ${percentage.toFixed(2)}%`);
            info.subtitleComponents.push(`${bytesDone}/${totalBytes}`);
          }
        }
        info.subtitleComponents.push(`ID: ${normalizeSnapshotId(firstOp.snapshotId)}`);
      }
      break;
    case "operationIndexSnapshot":
      const snapshot = firstOp.op.value.snapshot;
      if (!snapshot) break;
      if (snapshot.summary && snapshot.summary.totalBytesProcessed) {
        info.subtitleComponents.push(`${formatBytes(Number(snapshot.summary.totalBytesProcessed))} 共计 ${formatDuration(snapshot.summary.totalDuration * 1000)}`);
      }
      info.subtitleComponents.push(`ID: ${normalizeSnapshotId(snapshot.id)}`);
      break;
    default:
      switch (firstOp.status) {
        case OperationStatus.STATUS_INPROGRESS:
          info.subtitleComponents.push("运行中");
          break;
        case OperationStatus.STATUS_USER_CANCELLED:
          info.subtitleComponents.push("由用户取消");
          break;
        case OperationStatus.STATUS_SYSTEM_CANCELLED:
          info.subtitleComponents.push("由系统取消");
          break;
        default:
          if (duration > 100) {
            info.subtitleComponents.push(`用时 ${formatDuration(duration)}`);
          }
          break;
      }
  }

  for (let op of ops) {
    if (op.op.case === "operationIndexSnapshot") {
      if (op.op.value.forgot) {
        info.hidden = true;
      }
    }
    if (op.op.case === "operationRunHook" && op.status === OperationStatus.STATUS_ERROR) {
      if (info.status === OperationStatus.STATUS_SUCCESS) {
        info.status = OperationStatus.STATUS_WARNING;
      }
    } else if (op.status === OperationStatus.STATUS_INPROGRESS || op.status === OperationStatus.STATUS_ERROR || op.status === OperationStatus.STATUS_WARNING) {
      info.status = op.status;
    }
  }

  return info;
}

export const shouldHideOperation = (operation: Operation) => {
  return (
    operation.op.case === "operationStats" ||
    shouldHideStatus(operation.status)
  );
};
export const shouldHideStatus = (status: OperationStatus) => {
  return status === OperationStatus.STATUS_SYSTEM_CANCELLED;
};

export const getTypeForDisplay = (op: Operation) => {
  switch (op.op.case) {
    case "operationBackup":
      return DisplayType.BACKUP;
    case "operationIndexSnapshot":
      return DisplayType.SNAPSHOT;
    case "operationForget":
      return DisplayType.FORGET;
    case "operationPrune":
      return DisplayType.PRUNE;
    case "operationCheck":
      return DisplayType.CHECK;
    case "operationRestore":
      return DisplayType.RESTORE;
    case "operationStats":
      return DisplayType.STATS;
    case "operationRunHook":
      return DisplayType.RUNHOOK;
    case "operationRunCommand":
      return DisplayType.RUNCOMMAND;
    default:
      return DisplayType.UNKNOWN;
  }
};

export const displayTypeToString = (type: DisplayType) => {
  switch (type) {
    case DisplayType.BACKUP:
      return "备份(Backup)";
    case DisplayType.SNAPSHOT:
      return "快照(Snapshot)";
    case DisplayType.FORGET:
      return "忘记(Forget)";
    case DisplayType.PRUNE:
      return "修剪(Prune)";
    case DisplayType.CHECK:
      return "检查(Check)";
    case DisplayType.RESTORE:
      return "恢复(Restore)";
    case DisplayType.STATS:
      return "统计信息";
    case DisplayType.RUNHOOK:
      return "运行钩子函数";
    case DisplayType.RUNCOMMAND:
      return "运行命令";
    default:
      return "未知";
  }
};

export const colorForStatus = (status: OperationStatus) => {
  switch (status) {
    case OperationStatus.STATUS_PENDING:
      return "grey";
    case OperationStatus.STATUS_INPROGRESS:
      return "blue";
    case OperationStatus.STATUS_ERROR:
      return "red";
    case OperationStatus.STATUS_WARNING:
      return "orange";
    case OperationStatus.STATUS_SUCCESS:
      return "green";
    case OperationStatus.STATUS_USER_CANCELLED:
      return "orange";
    default:
      return "grey";
  }
};

export const nameForStatus = (status: OperationStatus) => {
  switch (status) {
    case OperationStatus.STATUS_PENDING:
      return "等待中";
    case OperationStatus.STATUS_INPROGRESS:
      return "执行中";
    case OperationStatus.STATUS_ERROR:
      return "错误";
    case OperationStatus.STATUS_WARNING:
      return "警告";
    case OperationStatus.STATUS_SUCCESS:
      return "成功";
    case OperationStatus.STATUS_USER_CANCELLED:
      return "取消";
    case OperationStatus.STATUS_SYSTEM_CANCELLED:
      return "取消";
    default:
      return "未知";
  }
}
