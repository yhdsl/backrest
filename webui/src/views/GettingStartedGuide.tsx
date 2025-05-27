import { Collapse, Divider, Spin, Typography } from "antd";
import React, { useEffect, useState } from "react";
import { backrestService } from "../api";
import { useConfig } from "../components/ConfigProvider";
import { Config, ConfigSchema } from "../../gen/ts/v1/config_pb";
import { isDevBuild } from "../state/buildcfg";
import { toJsonString } from "@bufbuild/protobuf";

export const GettingStartedGuide = () => {
  const config = useConfig()[0];

  return (
    <>
      <Typography.Text>
        <h1>快速入门</h1>
        {/* open link in new tab */}
        <p>
          <a href="https://github.com/garethgeorge/backrest" target="_blank">
            在 GitHub 上检查 Backrest 的新版本
          </a>
        </p>
        <Divider orientation="left">概述</Divider>
        <ul>
          <li>
            首先需要配置你的 restic 储存库的磁盘位置。
          </li>
          <li>
            调度计划包含了待备份的目录以及待备份的时间。同一个 restic 储存库可以被用于多个调度计划。
          </li>
          <li>
            查看{" "}
            <a
              href="https://restic.readthedocs.io/en/latest/030_preparing_a_new_repo.html"
              target="_blank"
            >
              初始化新储存库的 restic 文档
            </a>{" "}
            以了解可用的后端类型以及如何配置。
          </li>
          <li>
            查看{" "}
            <a href="https://garethgeorge.github.io/backrest" target="_blank">
              Backrest 维基页面
            </a>{" "}
            了解更多如何配置 Backrest 的信息。
          </li>
        </ul>
        <Divider orientation="left">小提示</Divider>
        <ul>
          <li>
            注意备份你的 Backrest 配置文件：Backrest 配置文件中包含所有储存库、
            调度计划以及解密储存库所需的密码。在按照喜好配置完成 Backrest 后，
            请务必将配置文件副本 (或至少储存库密码副本) 存储在安全位置，
            例如密码管理器中的安全记录内。
          </li>
          <li>
            使用钩子函数：Backrest 可以发送有关备份操作相关的通知。
            强烈建议添加一个在出现错误时调用的钩子函数，
            以便在备份操作失败 (例如储存或网络连接问题) 时通知您。
            钩子函数可以在调度计划或储存库的配置文件中设置。
          </li>
        </ul>
        {isDevBuild && (
          <>
            <Divider orientation="left">查看配置文件</Divider>
            <Collapse
              size="small"
              items={[
                {
                  key: "1",
                  label: "处于安全考虑隐藏 JSON 形式的配置文件",
                  children: config ? (
                    <Typography>
                      <pre>
                        {toJsonString(ConfigSchema, config, {
                          prettySpaces: 2,
                        })}
                      </pre>
                    </Typography>
                  ) : (
                    <Spin />
                  ),
                },
              ]}
            />
          </>
        )}
      </Typography.Text>
    </>
  );
};
