import {
  Button,
  Card,
  Col,
  Collapse,
  Descriptions,
  Divider,
  Empty,
  Flex,
  Row,
  Spin,
  Typography,
} from "antd";
import React, { useEffect, useState } from "react";
import { useConfig } from "../components/ConfigProvider";
import {
  SummaryDashboardResponse,
  SummaryDashboardResponse_Summary,
} from "../../gen/ts/v1/service_pb";
import { backrestService } from "../api";
import { useAlertApi } from "../components/Alerts";
import {
  formatBytes,
  formatDate,
  formatDuration,
  formatTime,
} from "../lib/formatting";
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { colorForStatus } from "../state/flowdisplayaggregator";
import { OperationStatus } from "../../gen/ts/v1/operations_pb";
import { isMobile } from "../lib/browserutil";
import { useNavigate } from "react-router";
import { toJsonString } from "@bufbuild/protobuf";
import { ConfigSchema } from "../../gen/ts/v1/config_pb";

export const SummaryDashboard = () => {
  const config = useConfig()[0];
  const alertApi = useAlertApi()!;
  const navigate = useNavigate();

  const [summaryData, setSummaryData] =
    useState<SummaryDashboardResponse | null>();

  useEffect(() => {
    // Fetch summary data
    const fetchData = async () => {
      // check if the tab is in the foreground
      if (document.hidden) {
        return;
      }

      try {
        const data = await backrestService.getSummaryDashboard({});
        setSummaryData(data);
      } catch (e) {
        alertApi.error("获取摘要数据时出错: " + e);
      }
    };

    fetchData();

    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!config) {
      return;
    }

    if (config.repos.length === 0 && config.plans.length === 0) {
      navigate("/getting-started");
    }
  }, [config]);

  if (!summaryData) {
    return <Spin />;
  }

  return (
    <>
      <Flex gap={16} vertical>
        <Typography.Title level={3}>储存库</Typography.Title>
        {summaryData && summaryData.repoSummaries.length > 0 ? (
          summaryData.repoSummaries.map((summary) => (
            <SummaryPanel summary={summary} key={summary.id} />
          ))
        ) : (
          <Empty description="未找到储存库" />
        )}
        <Typography.Title level={3}>调度计划</Typography.Title>
        {summaryData && summaryData.planSummaries.length > 0 ? (
          summaryData.planSummaries.map((summary) => (
            <SummaryPanel summary={summary} key={summary.id} />
          ))
        ) : (
          <Empty description="未找到调度计划" />
        )}
        <Divider />
        <Typography.Title level={3}>系统信息</Typography.Title>
        <Descriptions
          layout="vertical"
          column={2}
          items={[
            {
              key: 1,
              label: "配置文件路径",
              children: summaryData.configPath,
            },
            {
              key: 2,
              label: "数据文件夹",
              children: summaryData.dataPath,
            },
          ]}
        />
        <Collapse
          size="small"
          items={[
            {
              label: "使用 JSON 预览配置文件",
              children: (
                <pre>
                  {config &&
                    toJsonString(ConfigSchema, config, { prettySpaces: 2 })}
                </pre>
              ),
            },
          ]}
        />
      </Flex>
    </>
  );
};

const SummaryPanel = ({
  summary,
}: {
  summary: SummaryDashboardResponse_Summary;
}) => {
  const recentBackupsChart: {
    idx: number;
    time: number;
    durationMs: number;
    color: string;
    bytesAdded: number;
  }[] = [];
  const recentBackups = summary.recentBackups!;
  for (let i = 0; i < recentBackups.timestampMs.length; i++) {
    const color = colorForStatus(recentBackups.status[i]);
    recentBackupsChart.push({
      idx: i,
      time: Number(recentBackups.timestampMs[i]),
      durationMs: Number(recentBackups.durationMs[i]),
      color: color,
      bytesAdded: Number(recentBackups.bytesAdded[i]),
    });
  }
  while (recentBackupsChart.length < 60) {
    recentBackupsChart.push({
      idx: recentBackupsChart.length,
      time: 0,
      durationMs: 0,
      color: "white",
      bytesAdded: 0,
    });
  }

  const BackupChartTooltip = ({ active, payload, label }: any) => {
    const idx = Number(label);

    const entry = recentBackupsChart[idx];
    if (!entry || entry.idx > recentBackups.timestampMs.length) {
      return null;
    }

    const isPending =
      recentBackups.status[idx] === OperationStatus.STATUS_PENDING;

    return (
      <Card style={{ opacity: 0.9 }} size="small" key={label}>
        <Typography.Text>备份于 {formatTime(entry.time)}</Typography.Text>{" "}
        <br />
        {isPending ? (
          <Typography.Text type="secondary">
            已安排，等待中。
          </Typography.Text>
        ) : (
          <Typography.Text type="secondary">
            用时 {formatDuration(entry.durationMs)}, 已添加{" "}
            {formatBytes(entry.bytesAdded)}
          </Typography.Text>
        )}
      </Card>
    );
  };

  const cardInfo: { key: number; label: string; children: React.ReactNode }[] =
    [];

  cardInfo.push(
    {
      key: 1,
      label: "备份 (30d)",
      children: (
        <>
          {summary.backupsSuccessLast30days ? (
            <Typography.Text type="success" style={{ marginRight: "5px" }}>
              {summary.backupsSuccessLast30days + ""} 成功
            </Typography.Text>
          ) : undefined}
          {summary.backupsFailed30days ? (
            <Typography.Text type="danger" style={{ marginRight: "5px" }}>
              {summary.backupsFailed30days + ""} 失败
            </Typography.Text>
          ) : undefined}
          {summary.backupsWarningLast30days ? (
            <Typography.Text type="warning" style={{ marginRight: "5px" }}>
              {summary.backupsWarningLast30days + ""} 警告
            </Typography.Text>
          ) : undefined}
        </>
      ),
    },
    {
      key: 2,
      label: "已扫描大小 (30d)",
      children: formatBytes(Number(summary.bytesScannedLast30days)),
    },
    {
      key: 3,
      label: "已添加大小 (30d)",
      children: formatBytes(Number(summary.bytesAddedLast30days)),
    }
  );

  // check if mobile layout
  if (!isMobile()) {
    cardInfo.push(
      {
        key: 4,
        label: "下次备份",
        children: summary.nextBackupTimeMs
          ? formatTime(Number(summary.nextBackupTimeMs))
          : "无安排",
      },
      {
        key: 5,
        label: "平均扫描大小",
        children: formatBytes(Number(summary.bytesScannedAvg)),
      },
      {
        key: 6,
        label: "平均添加大小",
        children: formatBytes(Number(summary.bytesAddedAvg)),
      }
    );
  }

  return (
    <Card title={summary.id} style={{ width: "100%" }}>
      <Row gutter={16} key={1}>
        <Col span={10}>
          <Descriptions
            layout="vertical"
            column={3}
            items={cardInfo}
          ></Descriptions>
        </Col>
        <Col span={14}>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={recentBackupsChart}>
              <Bar dataKey="durationMs">
                {recentBackupsChart.map((entry, index) => (
                  <Cell cursor="pointer" fill={entry.color} key={`${index}`} />
                ))}
              </Bar>
              <YAxis dataKey="durationMs" hide />
              <XAxis dataKey="idx" hide />
              <Tooltip content={<BackupChartTooltip />} cursor={false} />
            </BarChart>
          </ResponsiveContainer>
        </Col>
      </Row>
    </Card>
  );
};
