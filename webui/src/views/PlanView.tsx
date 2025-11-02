import React, { useEffect, useState } from "react";
import { Plan } from "../../gen/ts/v1/config_pb";
import { Button, Flex, Tabs, Tooltip, Typography } from "antd";
import { useAlertApi } from "../components/Alerts";
import { MAX_OPERATION_HISTORY } from "../constants";
import { backrestService } from "../api";
import {
  ClearHistoryRequestSchema,
  DoRepoTaskRequest_Task,
  DoRepoTaskRequestSchema,
  GetOperationsRequestSchema,
} from "../../gen/ts/v1/service_pb";
import { SpinButton } from "../components/SpinButton";
import { useShowModal } from "../components/ModalManager";
import { create } from "@bufbuild/protobuf";
import { useConfig } from "../components/ConfigProvider";
import { OperationListView } from "../components/OperationListView";
import { OperationTreeView } from "../components/OperationTreeView";

export const PlanView = ({ plan }: React.PropsWithChildren<{ plan: Plan }>) => {
  const [config, _] = useConfig();
  const alertsApi = useAlertApi()!;
  const showModal = useShowModal();
  const repo = config?.repos.find((r) => r.id === plan.repo);

  const handleBackupNow = async () => {
    try {
      await backrestService.backup({ value: plan.id });
      alertsApi.success("备份已安排");
    } catch (e: any) {
      alertsApi.error("安排备份时出错: " + e.message);
    }
  };

  const handleUnlockNow = async () => {
    try {
      alertsApi.info("解锁储存库中...");
      await backrestService.doRepoTask(
        create(DoRepoTaskRequestSchema, {
          repoId: plan.repo!,
          task: DoRepoTaskRequest_Task.UNLOCK,
        })
      );
      alertsApi.success("已解锁储存库");
    } catch (e: any) {
      alertsApi.error("解锁储存库时出错: " + e.message);
    }
  };

  const handleClearErrorHistory = async () => {
    try {
      alertsApi.info("清除错误历史记录中...");
      await backrestService.clearHistory(
        create(ClearHistoryRequestSchema, {
          selector: {
            planId: plan.id,
            repoGuid: repo!.guid,
            originalInstanceKeyid: "",
          },
          onlyFailed: true,
        })
      );
      alertsApi.success("已清除错误历史记录");
    } catch (e: any) {
      alertsApi.error("清除错误历史记录时出错: " + e.message);
    }
  };

  if (!repo) {
    return (
      <>
        <Typography.Title>
          调度计划 {plan.id} 中的储存库 {plan.repo} 未找到
        </Typography.Title>
      </>
    );
  }

  return (
    <>
      <Flex gap="small" align="center" wrap="wrap">
        <Typography.Title>{plan.id}</Typography.Title>
      </Flex>
      <Flex gap="small" align="center" wrap="wrap">
        <SpinButton type="primary" onClickAsync={handleBackupNow}>
          立即备份
        </SpinButton>
        <Tooltip title="仅高级用户：在储存库中执行任意 Restic 命令。随后重新索引快照并在 Backrest 中显示可能的更改。">
          <Button
            type="default"
            onClick={async () => {
              const { RunCommandModal } = await import("./RunCommandModal");
              showModal(<RunCommandModal repo={repo} />);
            }}
          >
            运行命令
          </Button>
        </Tooltip>
        <Tooltip title="删除锁锁定文件并检查储存库是否存在错误。仅当在确定储存库未被其他系统访问时运行。">
          <SpinButton type="default" onClickAsync={handleUnlockNow}>
            解锁储存库
          </SpinButton>
        </Tooltip>
        <Tooltip title="从列表中删除失败的操作记录">
          <SpinButton type="default" onClickAsync={handleClearErrorHistory}>
            清除错误记录
          </SpinButton>
        </Tooltip>
      </Flex>
      <Tabs
        defaultActiveKey="1"
        items={[
          {
            key: "1",
            label: "树形视图",
            children: (
              <>
                <OperationTreeView
                  req={create(GetOperationsRequestSchema, {
                    selector: {
                      instanceId: config?.instance,
                      repoGuid: repo.guid,
                      planId: plan.id!,
                    },
                    lastN: BigInt(MAX_OPERATION_HISTORY),
                  })}
                  isPlanView={true}
                />
              </>
            ),
            destroyOnHidden: true,
          },
          {
            key: "2",
            label: "列表视图",
            children: (
              <>
                <h2>备份活动记录</h2>
                <OperationListView
                  req={create(GetOperationsRequestSchema, {
                    selector: {
                      instanceId: config?.instance,
                      repoGuid: repo.guid,
                      planId: plan.id!,
                    },
                    lastN: BigInt(MAX_OPERATION_HISTORY),
                  })}
                  showDelete={true}
                />
              </>
            ),
            destroyOnHidden: true,
          },
        ]}
      />
    </>
  );
};
