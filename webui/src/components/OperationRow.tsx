import React, { useEffect, useState } from "react";
import {
  Operation,
  OperationForget,
  OperationRestore,
  OperationStatus,
} from "../../gen/ts/v1/operations_pb";
import {
  Button,
  Col,
  Collapse,
  List,
  Modal,
  Progress,
  Row,
  Typography,
} from "antd";
import type { ItemType } from "rc-collapse/es/interface";
import {
  BackupProgressEntry,
  ResticSnapshot,
  SnapshotSummary,
} from "../../gen/ts/v1/restic_pb";
import { SnapshotBrowser } from "./SnapshotBrowser";
import {
  formatBytes,
  formatDuration,
  formatTime,
  normalizeSnapshotId,
} from "../lib/formatting";
import _ from "lodash";
import { ClearHistoryRequestSchema } from "../../gen/ts/v1/service_pb";
import { MessageInstance } from "antd/es/message/interface";
import { backrestService } from "../api";
import { useShowModal } from "./ModalManager";
import { useAlertApi } from "./Alerts";
import {
  displayTypeToString,
  getTypeForDisplay,
  nameForStatus,
} from "../state/flowdisplayaggregator";
import { OperationIcon } from "./OperationIcon";
import { LogView } from "./LogView";
import { ConfirmButton } from "./SpinButton";
import { create } from "@bufbuild/protobuf";
import { OperationListView } from "./OperationListView";

export const OperationRow = ({
  operation,
  alertApi,
  showPlan,
  hookOperations,
  showDelete,
}: React.PropsWithoutRef<{
  operation: Operation;
  alertApi?: MessageInstance;
  showPlan?: boolean;
  hookOperations?: Operation[];
  showDelete?: boolean;
}>) => {
  const showModal = useShowModal();
  const displayType = getTypeForDisplay(operation);
  const setRefresh = useState(0)[1];

  useEffect(() => {
    if (operation.status === OperationStatus.STATUS_INPROGRESS) {
      const interval = setInterval(() => {
        setRefresh((x) => x + 1);
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [operation.status]);

  const doDelete = async () => {
    try {
      await backrestService.clearHistory(
        create(ClearHistoryRequestSchema, {
          selector: {
            ids: [operation.id!],
          },
          onlyFailed: false,
        })
      );
      alertApi?.success("已删除操作");
    } catch (e: any) {
      alertApi?.error("删除操作时失败: " + e.message);
    }
  };

  const doCancel = async () => {
    try {
      await backrestService.cancel({ value: operation.id! });
      alertApi?.success("已请求取消操作");
    } catch (e: any) {
      alertApi?.error("取消操作时失败: " + e.message);
    }
  };

  const doShowLogs = () => {
    showModal(
      <Modal
        width="70%"
        title={
          opName +
          "的操作日志，于 " +
          formatTime(Number(operation.unixTimeStartMs))
        }
        open={true}
        footer={null}
        onCancel={() => {
          showModal(null);
        }}
      >
        <LogView logref={operation.logref!} />
      </Modal>
    );
  };

  let details: string = "";
  if (operation.status !== OperationStatus.STATUS_SUCCESS) {
    details = nameForStatus(operation.status);
  }
  if (operation.unixTimeEndMs - operation.unixTimeStartMs > 100) {
    details +=
      " 用时 " +
      formatDuration(
        Number(operation.unixTimeEndMs - operation.unixTimeStartMs)
      );
  }

  const opName = displayTypeToString(getTypeForDisplay(operation));

  const title: React.ReactNode[] = [
    <div key="title">
      {showPlan
        ? operation.instanceId + " - " + operation.planId + " - "
        : undefined}{" "}
      {formatTime(Number(operation.unixTimeStartMs))} - {opName}{" "}
      <span className="backrest operation-details">{details}</span>
    </div>,
  ];

  if (operation.logref) {
    title.push(
      <Button
        key="logs"
        type="link"
        size="small"
        className="backrest operation-details"
        onClick={doShowLogs}
      >
        [查看日志]
      </Button>
    );
  }

  if (
    operation.status === OperationStatus.STATUS_INPROGRESS ||
    operation.status === OperationStatus.STATUS_PENDING
  ) {
    title.push(
      <ConfirmButton
        key="cancel"
        type="link"
        size="small"
        className="backrest operation-details"
        confirmTitle="[确认取消？]"
        onClickAsync={doCancel}
      >
        [取消操作]
      </ConfirmButton>
    );
  } else if (showDelete) {
    title.push(
      <ConfirmButton
        key="delete"
        type="link"
        size="small"
        className="backrest operation-details hidden-child"
        confirmTitle="[确认删除？]"
        onClickAsync={doDelete}
      >
        [删除]
      </ConfirmButton>
    );
  }

  let displayMessage = operation.displayMessage;

  const bodyItems: ItemType[] = [];
  const expandedBodyItems: string[] = [];

  if (operation.op.case === "operationBackup") {
    if (operation.status === OperationStatus.STATUS_INPROGRESS) {
      expandedBodyItems.push("details");
    }
    const backupOp = operation.op.value;
    bodyItems.push({
      key: "details",
      label: "备份(backup)操作详细情况",
      children: <BackupOperationStatus status={backupOp.lastStatus} />,
    });

    if (backupOp.errors.length > 0) {
      bodyItems.push({
        key: "errors",
        label: "错误条目",
        children: (
          <pre>
            {backupOp.errors.map((e) => "条目中的错误: " + e.item).join("\n")}
          </pre>
        ),
      });
    }
  } else if (operation.op.case === "operationIndexSnapshot") {
    expandedBodyItems.push("details");
    const snapshotOp = operation.op.value;
    bodyItems.push({
      key: "details",
      label: "详细信息",
      children: <SnapshotDetails snapshot={snapshotOp.snapshot!} />,
    });
    bodyItems.push({
      key: "browser",
      label: "快照文件浏览器",
      children: (
        <SnapshotBrowser
          snapshotId={snapshotOp.snapshot!.id}
          repoId={operation.repoId}
          planId={operation.planId}
        />
      ),
    });
  } else if (operation.op.case === "operationForget") {
    const forgetOp = operation.op.value;
    bodyItems.push({
      key: "forgot",
      label: "已移除 " + forgetOp.forget?.length + " 个快照",
      children: <ForgetOperationDetails forgetOp={forgetOp} />,
    });
  } else if (operation.op.case === "operationPrune") {
    const prune = operation.op.value;
    expandedBodyItems.push("prune");
    bodyItems.push({
      key: "prune",
      label: "修剪(prune)操作输出",
      children: prune.outputLogref ? (
        <LogView logref={prune.outputLogref} />
      ) : (
        <pre>{prune.output}</pre>
      ),
    });
  } else if (operation.op.case === "operationCheck") {
    const check = operation.op.value;
    expandedBodyItems.push("check");
    bodyItems.push({
      key: "check",
      label: "检查(check)操作输出",
      children: check.outputLogref ? (
        <LogView logref={check.outputLogref} />
      ) : (
        <pre>{check.output}</pre>
      ),
    });
  } else if (operation.op.case === "operationRunCommand") {
    const run = operation.op.value;
    if (run.outputSizeBytes < 64 * 1024) {
      expandedBodyItems.push("run");
    }
    bodyItems.push({
      key: "run",
      label:
        "命令输出" +
        (run.outputSizeBytes > 0
          ? ` (${formatBytes(Number(run.outputSizeBytes))})`
          : ""),
      children: (
        <>
          <LogView logref={run.outputLogref} />
        </>
      ),
    });
  } else if (operation.op.case === "operationRestore") {
    expandedBodyItems.push("restore");
    bodyItems.push({
      key: "restore",
      label: "恢复(restore)操作详细情况",
      children: <RestoreOperationStatus operation={operation} />,
    });
  } else if (operation.op.case === "operationRunHook") {
    const hook = operation.op.value;
    if (operation.logref) {
      if (operation.status === OperationStatus.STATUS_INPROGRESS) {
        expandedBodyItems.push("logref");
      }
      bodyItems.push({
        key: "logref",
        label: "钩子函数输出",
        children: <LogView logref={operation.logref} />,
      });
    }
  }

  if (hookOperations) {
    bodyItems.push({
      key: "hookOperations",
      label: "已触发钩子函数",
      children: (
        <OperationListView
          useOperations={hookOperations}
          displayHooksInline={true}
        />
      ),
    });

    for (const op of hookOperations) {
      if (op.status !== OperationStatus.STATUS_SUCCESS) {
        expandedBodyItems.push("hookOperations");
        break;
      }
    }
  }

  return (
    <div className="backrest visible-on-hover">
      <List.Item key={operation.id}>
        <List.Item.Meta
          title={
            <div style={{ display: "flex", flexDirection: "row" }}>{title}</div>
          }
          avatar={
            <OperationIcon type={displayType} status={operation.status} />
          }
          description={
            <div className="backrest" style={{ width: "100%", height: "100%" }}>
              {operation.displayMessage && (
                <div key="message">
                  <pre>
                    {operation.status !== OperationStatus.STATUS_SUCCESS &&
                      nameForStatus(operation.status) + ": "}
                    {displayMessage}
                  </pre>
                </div>
              )}
              <Collapse
                size="small"
                destroyInactivePanel={true}
                items={bodyItems}
                defaultActiveKey={expandedBodyItems}
              />
            </div>
          }
        />
      </List.Item>
    </div>
  );
};

const SnapshotDetails = ({ snapshot }: { snapshot: ResticSnapshot }) => {
  const summary: Partial<SnapshotSummary> = snapshot.summary || {};

  const rows: React.ReactNode[] = [
    <Row gutter={16} key={1}>
      <Col span={8}>
        <Typography.Text strong>用户名@主机名</Typography.Text>
        <br />
        {snapshot.username}@{snapshot.hostname}
      </Col>
      <Col span={12}>
        <Typography.Text strong>标签</Typography.Text>
        <br />
        {snapshot.tags.join(", ")}
      </Col>
    </Row>,
  ];

  if (
    summary.filesNew ||
    summary.filesChanged ||
    summary.filesUnmodified ||
    summary.dataAdded ||
    summary.totalFilesProcessed ||
    summary.totalBytesProcessed
  ) {
    rows.push(
      <Row gutter={16} key={2}>
        <Col span={8}>
          <Typography.Text strong>文件已添加</Typography.Text>
          <br />
          {"" + summary.filesNew}
        </Col>
        <Col span={8}>
          <Typography.Text strong>文件已修改</Typography.Text>
          <br />
          {"" + summary.filesChanged}
        </Col>
        <Col span={8}>
          <Typography.Text strong>文件未修改</Typography.Text>
          <br />
          {"" + summary.filesUnmodified}
        </Col>
      </Row>
    );
    rows.push(
      <Row gutter={16} key={3}>
        <Col span={8}>
          <Typography.Text strong>已添加文件大小</Typography.Text>
          <br />
          {formatBytes(Number(summary.dataAdded))}
        </Col>
        <Col span={8}>
          <Typography.Text strong>已处理文件大小</Typography.Text>
          <br />
          {formatBytes(Number(summary.totalBytesProcessed))}
        </Col>
        <Col span={8}>
          <Typography.Text strong>已处理文件数目</Typography.Text>
          <br />
          {"" + summary.totalFilesProcessed}
        </Col>
      </Row>
    );
  }

  return (
    <>
      <Typography.Text>
        <Typography.Text strong>快照ID: </Typography.Text>
        {normalizeSnapshotId(snapshot.id!)} <br />
        {rows}
      </Typography.Text>
    </>
  );
};

const RestoreOperationStatus = ({ operation }: { operation: Operation }) => {
  const restoreOp = operation.op.value as OperationRestore;
  const isDone = restoreOp.lastStatus?.messageType === "summary";
  const progress = restoreOp.lastStatus?.percentDone || 0;
  const alertApi = useAlertApi();
  const lastStatus = restoreOp.lastStatus;

  return (
    <>
      恢复 {restoreOp.path} 至 {restoreOp.target}
      {!isDone ? (
        <Progress percent={Math.round(progress * 1000) / 10} status="active" />
      ) : null}
      {operation.status == OperationStatus.STATUS_SUCCESS ? (
        <>
          <Button
            type="link"
            onClick={() => {
              backrestService
                .getDownloadURL({ value: operation.id })
                .then((resp) => {
                  window.open(resp.value, "_blank");
                })
                .catch((e) => {
                  alertApi?.error("获取下载 URL 时出错: " + e.message);
                });
            }}
          >
            下载文件
          </Button>
        </>
      ) : null}
      <br />
      已恢复快照ID: {normalizeSnapshotId(operation.snapshotId!)}
      {lastStatus && (
        <Row gutter={16}>
          <Col span={12}>
            <Typography.Text strong>已处理大小/总文件大小</Typography.Text>
            <br />
            {formatBytes(Number(lastStatus.bytesRestored))}/
            {formatBytes(Number(lastStatus.totalBytes))}
          </Col>
          <Col span={12}>
            <Typography.Text strong>已处理数目/总文件数目</Typography.Text>
            <br />
            {Number(lastStatus.filesRestored)}/{Number(lastStatus.totalFiles)}
          </Col>
        </Row>
      )}
    </>
  );
};

const BackupOperationStatus = ({
  status,
}: {
  status?: BackupProgressEntry;
}) => {
  if (!status) {
    return <>尚未存在任何统计信息。</>;
  }

  if (status.entry.case === "status") {
    const st = status.entry.value;
    const progress =
      Math.round(
        (Number(st.bytesDone) / Math.max(Number(st.totalBytes), 1)) * 1000
      ) / 10;
    return (
      <>
        <Progress percent={progress} status="active" />
        <br />
        <Row gutter={16}>
          <Col span={12}>
            <Typography.Text strong>已处理大小/总文件大小</Typography.Text>
            <br />
            {formatBytes(Number(st.bytesDone))}/
            {formatBytes(Number(st.totalBytes))}
          </Col>
          <Col span={12}>
            <Typography.Text strong>已处理数目/总文件数目</Typography.Text>
            <br />
            {Number(st.filesDone)}/{Number(st.totalFiles)}
          </Col>
        </Row>
        {st.currentFile && st.currentFile.length > 0 ? (
          <pre>Current file: {st.currentFile.join("\n")}</pre>
        ) : null}
      </>
    );
  } else if (status.entry.case === "summary") {
    const sum = status.entry.value;
    return (
      <>
        <Typography.Text>
          <Typography.Text strong>快照ID: </Typography.Text>
          {sum.snapshotId !== ""
            ? normalizeSnapshotId(sum.snapshotId!)
            : "未创建任何快照"}
        </Typography.Text>
        <Row gutter={16}>
          <Col span={8}>
            <Typography.Text strong>文件已添加</Typography.Text>
            <br />
            {sum.filesNew.toString()}
          </Col>
          <Col span={8}>
            <Typography.Text strong>文件已修改</Typography.Text>
            <br />
            {sum.filesChanged.toString()}
          </Col>
          <Col span={8}>
            <Typography.Text strong>文件未修改</Typography.Text>
            <br />
            {sum.filesUnmodified.toString()}
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={8}>
            <Typography.Text strong>已添加文件大小</Typography.Text>
            <br />
            {formatBytes(Number(sum.dataAdded))}
          </Col>
          <Col span={8}>
            <Typography.Text strong>已处理文件总大小</Typography.Text>
            <br />
            {formatBytes(Number(sum.totalBytesProcessed))}
          </Col>
          <Col span={8}>
            <Typography.Text strong>已处理文件总数目</Typography.Text>
            <br />
            {sum.totalFilesProcessed.toString()}
          </Col>
        </Row>
      </>
    );
  } else {
    console.error("意外的统计信息内容: ", status);
    return <>未设置任何字段，不应当发生这种情况</>;
  }
};

const ForgetOperationDetails = ({
  forgetOp,
}: {
  forgetOp: OperationForget;
}) => {
  const policy = forgetOp.policy! || {};
  const policyDesc = [];
  if (policy.policy) {
    if (policy.policy.case === "policyKeepAll") {
      policyDesc.push("保留全部快照");
    } else if (policy.policy.case === "policyKeepLastN") {
      policyDesc.push(`保留最近的 ${policy.policy.value} 个快照`);
    } else if (policy.policy.case == "policyTimeBucketed") {
      const val = policy.policy.value;
      if (val.hourly) {
        policyDesc.push(`最近的 ${val.hourly} 个小时，每小时保留一个快照`);
      }
      if (val.daily) {
        policyDesc.push(`最近的 ${val.daily} 天，每天保留一个快照`);
      }
      if (val.weekly) {
        policyDesc.push(`最近的 ${val.weekly} 周，每周保留一个快照`);
      }
      if (val.monthly) {
        policyDesc.push(`最近的 ${val.monthly} 个月，每月保留一个快照`);
      }
      if (val.yearly) {
        policyDesc.push(`最近的 ${val.yearly} 年，每年保留一个快照`);
      }
      if (val.keepLastN) {
        policyDesc.push(`保留最新的 ${val.keepLastN} 个快照，无视时间情况`);
      }
    }
  }

  return (
    <>
      已移除的快照:
      <pre>
        {forgetOp.forget?.map((f) => (
          <div key={f.id}>
            {"已移除快照 " +
              normalizeSnapshotId(f.id!) +
              " ，花费 " +
              formatTime(Number(f.unixTimeMs))}{" "}
            <br />
          </div>
        ))}
      </pre>
      策略:
      <ul>
        {policyDesc.map((desc, idx) => (
          <li key={idx}>{desc}</li>
        ))}
      </ul>
    </>
  );
};
