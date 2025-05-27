import {
  Form,
  Modal,
  Input,
  Typography,
  Select,
  Button,
  Tooltip,
  Radio,
  InputNumber,
  Row,
  Card,
  Col,
  Collapse,
  Checkbox,
} from "antd";
import React, { useEffect, useState } from "react";
import { useShowModal } from "../components/ModalManager";
import { MinusCircleOutlined, PlusOutlined } from "@ant-design/icons";
import { formatErrorAlert, useAlertApi } from "../components/Alerts";
import { namePattern, validateForm } from "../lib/formutil";
import { useConfig } from "../components/ConfigProvider";
import { authenticationService, backrestService } from "../api";
import { clone, fromJson, toJson, toJsonString } from "@bufbuild/protobuf";
import {
  AuthSchema,
  ConfigSchema,
  UserSchema,
} from "../../gen/ts/v1/config_pb";

interface FormData {
  auth: {
    users: {
      name: string;
      passwordBcrypt: string;
      needsBcrypt?: boolean;
    }[];
  };
  instance: string;
}

export const SettingsModal = () => {
  let [config, setConfig] = useConfig();
  const showModal = useShowModal();
  const alertsApi = useAlertApi()!;
  const [form] = Form.useForm<FormData>();

  if (!config) {
    return null;
  }

  const handleOk = async () => {
    try {
      // Validate form
      let formData = await validateForm(form);

      if (formData.auth?.users) {
        for (const user of formData.auth?.users) {
          if (user.needsBcrypt) {
            const hash = await authenticationService.hashPassword({
              value: user.passwordBcrypt,
            });
            user.passwordBcrypt = hash.value;
            delete user.needsBcrypt;
          }
        }
      }

      // Update configuration
      let newConfig = clone(ConfigSchema, config);
      newConfig.auth = fromJson(AuthSchema, formData.auth, {
        ignoreUnknownFields: false,
      });
      newConfig.instance = formData.instance;

      if (!newConfig.auth?.users && !newConfig.auth?.disabled) {
        throw new Error(
          "必须添加一个用户账户或者禁用身份验证"
        );
      }

      setConfig(await backrestService.setConfig(newConfig));
      alertsApi.success("已更新设置", 5);
      setTimeout(() => {
        window.location.reload();
      }, 500);
    } catch (e: any) {
      alertsApi.error(formatErrorAlert(e, "操作错误: "), 15);
      console.error(e);
    }
  };

  const handleCancel = () => {
    showModal(null);
  };

  const users = config.auth?.users || [];

  return (
    <>
      <Modal
        open={true}
        onCancel={handleCancel}
        title={"设置"}
        width="40vw"
        footer={[
          <Button key="back" onClick={handleCancel}>
            取消
          </Button>,
          <Button key="submit" type="primary" onClick={handleOk}>
            提交
          </Button>,
        ]}
      >
        <Form
          autoComplete="off"
          form={form}
          labelCol={{ span: 6 }}
          wrapperCol={{ span: 16 }}
        >
          {users.length > 0 || config.auth?.disabled ? null : (
            <>
              <strong>初始化 backrest 设置！ </strong>
              <p>
                Backrest 检测到您没有添加任何用户账户，请至少添加一位用户账户以保护 Web 界面的安全。
              </p>
              <p>
                您稍后可以添加更多用户账户，或者如果您忘记了密码，可以通过编辑配置文件 (通常位于 $HOME/.backrest/config.json) 来重置用户账户
              </p>
            </>
          )}
          <Tooltip title="用于识别该 backrest 的唯一实例名称。请谨慎设置该值，创建后将无法修改。">
            <Form.Item
              hasFeedback
              name="instance"
              label="实例 ID"
              required
              initialValue={config.instance || ""}
              rules={[
                { required: true, message: "实例 ID 为必填项" },
                {
                  pattern: namePattern,
                  message:
                    "实例 ID 中只能包含数字和字母，以及连接符 - 或下划线 _",
                },
              ]}
            >
              <Input
                placeholder={
                  "该 backrest 安装的唯一实例名称 ，例如my-backrest-server"
                }
                disabled={!!config.instance}
              />
            </Form.Item>
          </Tooltip>
          <Form.Item
            label="禁用身份验证"
            name={["auth", "disabled"]}
            valuePropName="checked"
            initialValue={config.auth?.disabled || false}
          >
            <Checkbox />
          </Form.Item>
          <Form.Item label="用户账户" required={true}>
            <Form.List
              name={["auth", "users"]}
              initialValue={
                config.auth?.users?.map((u) =>
                  toJson(UserSchema, u, { alwaysEmitImplicit: true })
                ) || []
              }
            >
              {(fields, { add, remove }) => (
                <>
                  {fields.map((field, index) => {
                    return (
                      <Row key={field.key} gutter={16}>
                        <Col span={11}>
                          <Form.Item
                            name={[field.name, "name"]}
                            rules={[
                              { required: true, message: "用户名为必填项" },
                              {
                                pattern: namePattern,
                                message:
                                  "用户名中只能包含数字和字母，以及连接符 - 或下划线 _",
                              },
                            ]}
                          >
                            <Input placeholder="用户名" />
                          </Form.Item>
                        </Col>
                        <Col span={11}>
                          <Form.Item
                            name={[field.name, "passwordBcrypt"]}
                            rules={[
                              {
                                required: true,
                                message: "密码为必填项",
                              },
                            ]}
                          >
                            <Input.Password
                              placeholder="密码"
                              onFocus={() => {
                                form.setFieldValue(
                                  ["auth", "users", index, "needsBcrypt"],
                                  true
                                );
                                form.setFieldValue(
                                  ["auth", "users", index, "passwordBcrypt"],
                                  ""
                                );
                              }}
                            />
                          </Form.Item>
                        </Col>
                        <Col span={2}>
                          <MinusCircleOutlined
                            onClick={() => {
                              remove(field.name);
                            }}
                          />
                        </Col>
                      </Row>
                    );
                  })}
                  <Form.Item>
                    <Button
                      type="dashed"
                      onClick={() => {
                        add();
                      }}
                      block
                    >
                      <PlusOutlined /> 添加用户账户
                    </Button>
                  </Form.Item>
                </>
              )}
            </Form.List>
          </Form.Item>

          <Form.Item shouldUpdate label="预览">
            {() => (
              <Collapse
                size="small"
                items={[
                  {
                    key: "1",
                    label: "使用 JSON 预览配置文件",
                    children: (
                      <Typography>
                        <pre>
                          {JSON.stringify(form.getFieldsValue(), null, 2)}
                        </pre>
                      </Typography>
                    ),
                  },
                ]}
              />
            )}
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};
