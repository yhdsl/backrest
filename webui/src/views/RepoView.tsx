import React, { Suspense, useContext, useEffect, useState } from "react";
import { Repo } from "../../gen/ts/v1/config_pb";
import { Flex, Tabs, Tooltip, Typography, Button } from "antd";
import { OperationListView } from "../components/OperationListView";
import { OperationTreeView } from "../components/OperationTreeView";
import { MAX_OPERATION_HISTORY, STATS_OPERATION_HISTORY } from "../constants";
import {
  DoRepoTaskRequest_Task,
  DoRepoTaskRequestSchema,
  GetOperationsRequestSchema,
  OpSelectorSchema,
} from "../../gen/ts/v1/service_pb";
import { backrestService } from "../api";
import { SpinButton } from "../components/SpinButton";
import { useConfig } from "../components/ConfigProvider";
import { formatErrorAlert, useAlertApi } from "../components/Alerts";
import { useShowModal } from "../components/ModalManager";
import { create } from "@bufbuild/protobuf";

const StatsPanel = React.lazy(() => import("../components/StatsPanel"));

export const RepoView = ({ repo }: React.PropsWithChildren<{ repo: Repo }>) => {
  const [config, _] = useConfig();
  const showModal = useShowModal();
  const alertsApi = useAlertApi()!;

  // Task handlers
  const handleIndexNow = async () => {
    try {
      await backrestService.doRepoTask(
        create(DoRepoTaskRequestSchema, {
          repoId: repo.id!,
          task: DoRepoTaskRequest_Task.INDEX_SNAPSHOTS,
        })
      );
    } catch (e: any) {
      alertsApi.error(formatErrorAlert(e, "索引快照时出错: "));
    }
  };

  const handleUnlockNow = async () => {
    try {
      alertsApi.info("解锁储存库中...");
      await backrestService.doRepoTask(
        create(DoRepoTaskRequestSchema, {
          repoId: repo.id!,
          task: DoRepoTaskRequest_Task.UNLOCK,
        })
      );
      alertsApi.success("已解锁储存库");
    } catch (e: any) {
      alertsApi.error("解锁储存库时出错: " + e.message);
    }
  };

  const handleStatsNow = async () => {
    try {
      await backrestService.doRepoTask(
        create(DoRepoTaskRequestSchema, {
          repoId: repo.id!,
          task: DoRepoTaskRequest_Task.STATS,
        })
      );
    } catch (e: any) {
      alertsApi.error(formatErrorAlert(e, "计算统计信息时出错: "));
    }
  };

  const handlePruneNow = async () => {
    try {
      await backrestService.doRepoTask(
        create(DoRepoTaskRequestSchema, {
          repoId: repo.id!,
          task: DoRepoTaskRequest_Task.PRUNE,
        })
      );
    } catch (e: any) {
      alertsApi.error(formatErrorAlert(e, "修剪时出错: "));
    }
  };

  const handleCheckNow = async () => {
    try {
      await backrestService.doRepoTask(
        create(DoRepoTaskRequestSchema, {
          repoId: repo.id!,
          task: DoRepoTaskRequest_Task.CHECK,
        })
      );
    } catch (e: any) {
      alertsApi.error(formatErrorAlert(e, "检查时出错: "));
    }
  };

  // Gracefully handle deletions by checking if the plan is still in the config.
  let repoInConfig = config?.repos?.find((r) => r.id === repo.id);
  if (!repoInConfig) {
    return (
      <>
        已删除储存库
        <pre>{JSON.stringify(config, null, 2)}</pre>
      </>
    );
  }
  repo = repoInConfig;

  const items = [
    {
      key: "1",
      label: "树形视图",
      children: (
        <>
          <OperationTreeView
            req={create(GetOperationsRequestSchema, {
              selector: {
                repoGuid: repo.guid,
              },
              lastN: BigInt(MAX_OPERATION_HISTORY),
            })}
          />
        </>
      ),
      destroyInactiveTabPane: true,
    },
    {
      key: "2",
      label: "列表视图",
      children: (
        <>
          <h3>备份活动记录</h3>
          <OperationListView
            req={create(GetOperationsRequestSchema, {
              selector: {
                repoGuid: repo.guid,
              },
              lastN: BigInt(MAX_OPERATION_HISTORY),
            })}
            showPlan={true}
            showDelete={true}
          />
        </>
      ),
      destroyInactiveTabPane: true,
    },
    {
      key: "3",
      label: "统计信息",
      children: (
        <Suspense fallback={<div>加载中...</div>}>
          <StatsPanel
            selector={create(OpSelectorSchema, {
              repoGuid: repo.guid,
              instanceId: config?.instance,
            })}
          />
        </Suspense>
      ),
      destroyInactiveTabPane: true,
    },
  ];
  return (
    <>
      <Flex gap="small" align="center" wrap="wrap">
        <Typography.Title>{repo.id}</Typography.Title>
      </Flex>
      <Flex gap="small" align="center" wrap="wrap">
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

        <Tooltip title="索引储存库中的快照。每次备份操作后也会自动索引快照。">
          <SpinButton type="default" onClickAsync={handleIndexNow}>
            索引快照
          </SpinButton>
        </Tooltip>

        <Tooltip title="删除锁锁定文件并检查储存库是否存在错误。仅当在确定储存库未被其他系统访问时运行。">
          <SpinButton type="default" onClickAsync={handleUnlockNow}>
            解锁储存库
          </SpinButton>
        </Tooltip>

        <Tooltip title="对储存库运行修剪(prune)操作，以删除旧快照并释放空间">
          <SpinButton type="default" onClickAsync={handlePruneNow}>
            立即修剪
          </SpinButton>
        </Tooltip>

        <Tooltip title="对储存库运行检查(check)操作，以验证储存库的完整性">
          <SpinButton type="default" onClickAsync={handleCheckNow}>
            立即检查
          </SpinButton>
        </Tooltip>

        <Tooltip title="计算储存库的统计信息，这可能会花费大量的时间">
          <SpinButton type="default" onClickAsync={handleStatsNow}>
            计算统计信息
          </SpinButton>
        </Tooltip>
      </Flex>
      <Tabs defaultActiveKey={items[0].key} items={items} />
    </>
  );
};
