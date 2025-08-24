import {
  Operation,
  OperationEvent,
  OperationEventType,
  OperationStatus,
} from "../../gen/ts/v1/operations_pb";
import { GetOperationsRequest, OpSelector } from "../../gen/ts/v1/service_pb";
import { BackupProgressEntry, ResticSnapshot, RestoreProgressEntry } from "../../gen/ts/v1/restic_pb";
import _ from "lodash";
import { backrestService } from "../api";

const subscribers: ((event?: OperationEvent, err?: Error) => void)[] = [];

// Start fetching and emitting operations.
(async () => {
  while (true) {
    let nextConnWaitUntil = new Date().getTime() + 5000;
    try {
      for await (const event of backrestService.getOperationEvents({})) {
        console.log("操作事件", event);
        subscribers.forEach((subscriber) => subscriber(event, undefined));
      }
    } catch (e: any) {
      console.warn("操作流由于异常而中止: ", e);
    }
    await new Promise((accept, _) =>
      setTimeout(accept, nextConnWaitUntil - new Date().getTime()),
    );
    subscribers.forEach((subscriber) => subscriber(undefined, new Error("重新连接")));
  }
})();

export const getOperations = async (
  req: GetOperationsRequest,
): Promise<Operation[]> => {
  const opList = await backrestService.getOperations(req);
  return opList.operations || [];
};

export const subscribeToOperations = (
  callback: (event?: OperationEvent, err?: Error) => void,
) => {
  subscribers.push(callback);
  console.log("已订阅操作，总订阅数: ", subscribers.length);
};

export const unsubscribeFromOperations = (
  callback: (event?: OperationEvent, err?: Error) => void,
) => {
  const index = subscribers.indexOf(callback);
  if (index > -1) {
    subscribers[index] = subscribers[subscribers.length - 1];
    subscribers.pop();
  }
  console.log("已取消订阅操作，总订阅数: ", subscribers.length);
};


export const shouldHideOperation = (operation: Operation) => {
  return (
    operation.op.case === "operationStats" ||
    (operation.status === OperationStatus.STATUS_SUCCESS && operation.op.case === "operationBackup" && !operation.snapshotId) ||
    shouldHideStatus(operation.status)
  );
};
export const shouldHideStatus = (status: OperationStatus) => {
  return status === OperationStatus.STATUS_SYSTEM_CANCELLED;
};
