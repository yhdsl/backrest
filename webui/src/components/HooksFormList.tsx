import React, { useState } from "react";
import {
  Hook_Condition,
  Hook_ConditionSchema,
  Hook_OnError,
  Hook_OnErrorSchema,
} from "../../gen/ts/v1/config_pb";
import {
  Button,
  Card,
  Form,
  FormListFieldData,
  Input,
  Popover,
  Select,
  Tooltip,
} from "antd";
import { MinusCircleOutlined, PlusOutlined } from "@ant-design/icons";
import { Rule } from "antd/es/form";

export interface HookFormData {
  hooks: {
    conditions: string[];
  }[];
}

export interface HookFields {
  conditions: string[];
  actionCommand?: any;
  actionGotify?: any;
  actionDiscord?: any;
  actionWebhook?: any;
  actionSlack?: any;
  actionShoutrrr?: any;
  actionHealthchecks?: any;
  actionTelegram?: any;
}

export const hooksListTooltipText = (
  <>
    钩子函数允许你自定义某些操作，例如备份过程中
    自动运行的通知或脚本。查看{" "}
    <a
      href="https://garethgeorge.github.io/backrest/docs/hooks"
      target="_blank"
    >
      钩子函数文档
    </a>{" "}
    了解可用的选项，或者访问{" "}
    <a
      href="https://garethgeorge.github.io/backrest/cookbooks/command-hook-examples"
      target="_blank"
    >
      cookbook
    </a>{" "}
    以获取示例脚本。
  </>
);

/**
 * HooksFormList is a UI component for editing a list of hooks that can apply either at the repo level or at the plan level.
 */
export const HooksFormList = () => {
  const form = Form.useFormInstance();

  return (
    <Form.List name="hooks">
      {(fields, { add, remove }, { errors }) => (
        <>
          {fields.map((field, index) => {
            const hookData = form.getFieldValue([
              "hooks",
              field.name,
            ]) as HookFields;

            return (
              <Card
                key={index}
                title={
                  <>
                    Hook {index} {findHookTypeName(hookData)}
                    <MinusCircleOutlined
                      className="dynamic-delete-button"
                      onClick={() => remove(field.name)}
                      style={{
                        marginRight: "5px",
                        marginTop: "2px",
                        float: "right",
                      }}
                    />
                  </>
                }
                size="small"
                style={{ marginBottom: "5px" }}
              >
                <HookConditionsTooltip>
                  <Form.Item name={[field.name, "conditions"]}>
                    <Select
                      mode="multiple"
                      allowClear
                      style={{ width: "100%" }}
                      placeholder="运行于..."
                      options={Hook_ConditionSchema.values.map((v) => ({
                        label: v.name,
                        value: v.name,
                      }))}
                    />
                  </Form.Item>
                </HookConditionsTooltip>
                <Form.Item
                  shouldUpdate={(prevValues, curValues) => {
                    return prevValues.hooks[index] !== curValues.hooks[index];
                  }}
                >
                  <HookBuilder field={field} />
                </Form.Item>
              </Card>
            );
          })}
          <Form.Item>
            <Popover
              content={
                <>
                  {hookTypes.map((hookType, index) => {
                    return (
                      <Button
                        key={index}
                        onClick={() => {
                          add(structuredClone(hookType.template));
                        }}
                      >
                        {hookType.name}
                      </Button>
                    );
                  })}
                </>
              }
              style={{ width: "60%" }}
              placement="bottom"
            >
              <Button
                type="dashed"
                icon={<PlusOutlined />}
                style={{ width: "100%" }}
              >
                添加钩子函数
              </Button>
            </Popover>
            <Form.ErrorList errors={errors} />
          </Form.Item>
        </>
      )}
    </Form.List>
  );
};

const hookTypes: {
  name: string;
  template: HookFields;
  oneofKey: string;
  component: ({ field }: { field: FormListFieldData }) => React.ReactNode;
}[] = [
  {
    name: "Command",
    template: {
      actionCommand: {
        command: "echo {{ .ShellEscape .Summary }}",
      },
      conditions: [],
    },
    oneofKey: "actionCommand",
    component: ({ field }: { field: FormListFieldData }) => {
      return (
        <>
          <Tooltip title="待执行的脚本。">脚本:</Tooltip>
          <Form.Item
            name={[field.name, "actionCommand", "command"]}
            rules={[requiredField("脚本命令为必填项")]}
          >
            <Input.TextArea
              style={{ width: "100%", fontFamily: "monospace" }}
            />
          </Form.Item>
          <ItemOnErrorSelector field={field} />
        </>
      );
    },
  },
  {
    name: "Shoutrrr",
    template: {
      actionShoutrrr: {
        template: "{{ .Summary }}",
      },
      conditions: [],
    },
    oneofKey: "actionShoutrrr",
    component: ({ field }: { field: FormListFieldData }) => {
      return (
        <>
          <Form.Item
            name={[field.name, "actionShoutrrr", "shoutrrrUrl"]}
            rules={[requiredField("shoutrrr URL 为必填项")]}
          >
            <Input
              addonBefore={
                <Tooltip
                  title={
                    <>
                      Shoutrrr 是一个多平台的通知服务，查看{" "}
                      <a
                        href="https://containrrr.dev/shoutrrr/v0.8/services/overview/"
                        target="_blank"
                      >
                        Shoutrrr 文档
                      </a>{" "}
                      了解支持的通知服务
                    </>
                  }
                >
                  <div style={{ width: "8em" }}>Shoutrrr URL</div>
                </Tooltip>
              }
            />
          </Form.Item>
          文本模板:
          <Form.Item name={[field.name, "actionShoutrrr", "template"]}>
            <Input.TextArea
              style={{ width: "100%", fontFamily: "monospace" }}
            />
          </Form.Item>
        </>
      );
    },
  },
  {
    name: "Discord",
    template: {
      actionDiscord: {
        webhookUrl: "",
        template: "{{ .Summary }}",
      },
      conditions: [],
    },
    oneofKey: "actionDiscord",
    component: ({ field }: { field: FormListFieldData }) => {
      return (
        <>
          <Form.Item
            name={[field.name, "actionDiscord", "webhookUrl"]}
            rules={[requiredField("webhook URL 为必填项")]}
          >
            <Input
              addonBefore={<div style={{ width: "8em" }}>Discord Webhook</div>}
            />
          </Form.Item>
          文本模板:
          <Form.Item name={[field.name, "actionDiscord", "template"]}>
            <Input.TextArea
              style={{ width: "100%", fontFamily: "monospace" }}
            />
          </Form.Item>
        </>
      );
    },
  },
  {
    name: "Gotify",
    template: {
      actionGotify: {
        baseUrl: "",
        token: "",
        template: "{{ .Summary }}",
        titleTemplate:
          "根据调度计划 {{ .Plan.Id }} 运行 Backrest {{ .EventName .Event }} 中",
        priority: 5,
      },
      conditions: [],
    },
    oneofKey: "actionGotify",
    component: ({ field }: { field: FormListFieldData }) => {
      return (
        <>
          <Form.Item
            name={[field.name, "actionGotify", "baseUrl"]}
            rules={[
              requiredField("gotify base URL 为必填项"),
              { type: "string" },
            ]}
          >
            <Input
              addonBefore={<div style={{ width: "8em" }}>Gotify Base URL</div>}
            />
          </Form.Item>
          <Form.Item
            name={[field.name, "actionGotify", "token"]}
            rules={[requiredField("gotify 密钥为必填项")]}
          >
            <Input
              addonBefore={<div style={{ width: "8em" }}>Gotify 密钥</div>}
            />
          </Form.Item>
          <Form.Item
            name={[field.name, "actionGotify", "titleTemplate"]}
            rules={[requiredField("gotify 标题模板为必填项")]}
          >
            <Input
              addonBefore={<div style={{ width: "8em" }}>标题模板</div>}
            />
          </Form.Item>
          文本模板:
          <Form.Item name={[field.name, "actionGotify", "template"]}>
            <Input.TextArea
              style={{ width: "100%", fontFamily: "monospace" }}
            />
          </Form.Item>
          <Form.Item name={[field.name, "actionGotify", "priority"]}>
            <Select
              allowClear
              style={{ width: "100%" }}
              placeholder={"Set priority"}
              options={[
                  {label: "0 - 无任何通知", value: 0},
                  {label: "1 - 通知栏中的图标", value: 1},
                  {label: "4 - 通知栏中的图标 + 声音提示", value: 4},
                  {label: "8 - 通知栏中的图标 + 声音提示 + 振动提示", value: 8},
              ]}
            />
          </Form.Item>
        </>
      );
    },
  },
  {
    name: "Slack",
    template: {
      actionSlack: {
        webhookUrl: "",
        template: "{{ .Summary }}",
      },
      conditions: [],
    },
    oneofKey: "actionSlack",
    component: ({ field }: { field: FormListFieldData }) => {
      return (
        <>
          <Form.Item
            name={[field.name, "actionSlack", "webhookUrl"]}
            rules={[requiredField("webhook URL 为必填项")]}
          >
            <Input
              addonBefore={<div style={{ width: "8em" }}>Slack Webhook</div>}
            />
          </Form.Item>
          文本模板:
          <Form.Item name={[field.name, "actionSlack", "template"]}>
            <Input.TextArea
              style={{ width: "100%", fontFamily: "monospace" }}
            />
          </Form.Item>
        </>
      );
    },
  },
  {
    name: "Healthchecks",
    template: {
      actionHealthchecks: {
        webhookUrl: "",
        template: "{{ .Summary }}",
      },
      conditions: [],
    },
    oneofKey: "actionHealthchecks",
    component: ({ field }: { field: FormListFieldData }) => {
      return (
        <>
          <Form.Item
            name={[field.name, "actionHealthchecks", "webhookUrl"]}
            rules={[requiredField("Ping URL 为必填项")]}
          >
            <Input addonBefore={<div style={{ width: "8em" }}>Ping URL</div>} />
          </Form.Item>
          文本模板:
          <Form.Item name={[field.name, "actionHealthchecks", "template"]}>
            <Input.TextArea
              style={{ width: "100%", fontFamily: "monospace" }}
            />
          </Form.Item>
        </>
      );
    },
  },
  {
    name: "Telegram",
    template: {
      actionTelegram: {
        botToken: "",
        chatId: "",
        template: "{{ .Summary }}",
      },
      conditions: [],
    },
    oneofKey: "actionTelegram",
    component: ({ field }: { field: FormListFieldData }) => {
      return (
        <>
          <Form.Item
            name={[field.name, "actionTelegram", "botToken"]}
            rules={[requiredField("bot token 为必填项")]}
          >
            <Input
              addonBefore={
                <Tooltip
                  title={
                    <>
                      使用{" "}
                      <a
                        href="https://t.me/botfather"
                        target="_blank"
                      >
                        @BotFather
                      </a>{" "}
                      创建一个 Telegram bot，并在此填写提供的 bot token
                    </>
                  }
                >
                  <div style={{ width: "8em" }}>Bot Token</div>
                </Tooltip>
              }
            />
          </Form.Item>
          <Form.Item
            name={[field.name, "actionTelegram", "chatId"]}
            rules={[requiredField("chat ID 为必填项")]}
          >
            <Input
              addonBefore={
                <Tooltip
                  title={
                    <>
                      Chat ID 可以是一个用户ID，聊天组ID，或者频道ID。使用{" "}
                      <a
                        href="https://t.me/userinfobot"
                        target="_blank"
                      >
                        @userinfobot
                      </a>{" "}
                      来获取你个人的用户ID
                    </>
                  }
                >
                  <div style={{ width: "8em" }}>Chat ID</div>
                </Tooltip>
              }
            />
          </Form.Item>
          文本模板:
          <Form.Item name={[field.name, "actionTelegram", "template"]}>
            <Input.TextArea
              style={{ width: "100%", fontFamily: "monospace" }}
            />
          </Form.Item>
        </>
      );
    },
  },
];

const findHookTypeName = (field: HookFields): string => {
  if (!field) {
    return "Unknown";
  }
  for (const hookType of hookTypes) {
    if (hookType.oneofKey in field) {
      return hookType.name;
    }
  }
  return "Unknown";
};

const HookBuilder = ({ field }: { field: FormListFieldData }) => {
  const form = Form.useFormInstance();
  const hookData = form.getFieldValue(["hooks", field.name]) as HookFields;

  if (!hookData) {
    return <p>未知的钩子函数类型</p>;
  }

  for (const hookType of hookTypes) {
    if (hookType.oneofKey in hookData) {
      return hookType.component({ field });
    }
  }

  return <p>未知的钩子函数类型</p>;
};

const ItemOnErrorSelector = ({ field }: { field: FormListFieldData }) => {
  return (
    <>
      <Tooltip
        title={
          <>
            当执行钩子函数中出现错误时会发生什么 (仅对启动类型的钩子函数有效，例如开始执行 backup, prune, check 等命令时)
            <ul>
              <li>
                忽略 - 所有的错误将会被忽略，后续的钩子函数和备份操作将继续执行
              </li>
              <li>
                失败 - 中止备份操作，并触发错误通知，后续的钩子函数将不会被执行
              </li>
              <li>
                取消 - 取消备份操作，不会触发任何通知，后续的钩子函数将不会被执行
              </li>
            </ul>
          </>
        }
      >
        错误处理方式:
      </Tooltip>
      <Form.Item name={[field.name, "onError"]}>
        <Select
          allowClear
          style={{ width: "100%" }}
          placeholder={"仅当钩子函数失败时执行..."}
          options={Hook_OnErrorSchema.values.map((v) => ({
            label: v.name,
            value: v.name,
          }))}
        />
      </Form.Item>
    </>
  );
};

const requiredField = (message: string, extra?: Rule) => ({
  required: true,
  message: message,
});

const HookConditionsTooltip = ({ children }: { children: React.ReactNode }) => {
  return (
    <Tooltip
      title={
        <div>
          可用的执行条件
          <ul>
            <li>CONDITION_ANY_ERROR - 在执行任何任务中遇到错误时</li>
            <li>CONDITION_SNAPSHOT_START - 在启动一个备份(backup)操作前</li>
            <li>
              CONDITION_SNAPSHOT_END - 在完成一个备份(backup)操作后 (无论成功或失败)
            </li>
            <li>
              CONDITION_SNAPSHOT_SUCCESS - 在成功完成一个备份(backup)操作后
            </li>
            <li>CONDITION_SNAPSHOT_ERROR - 在未能成功完成一个备份(backup)操作后</li>
            <li>CONDITION_SNAPSHOT_WARNING - 在部分完成一个备份(backup)操作后</li>
            <li>CONDITION_PRUNE_START - 在启动一个修剪(prune)操作前</li>
            <li>CONDITION_PRUNE_SUCCESS - 在成功完成一个修剪(prune)操作后</li>
            <li>CONDITION_PRUNE_ERROR - 在未能成功完成一个修剪(prune)操作后</li>
            <li>CONDITION_CHECK_START - 在启动一个检查(check)操作前</li>
            <li>CONDITION_CHECK_SUCCESS - 在成功完成一个检查(check)操作后</li>
            <li>CONDITION_CHECK_ERROR - 在未能成功完成一个检查(check)操作后</li>
          </ul>
          查看{" "}
          <a
            href="https://garethgeorge.github.io/backrest/docs/hooks"
            target="_blank"
          >
            文档
          </a>{" "}
          以了解更多信息
        </div>
      }
    >
      {children}
    </Tooltip>
  );
};
