import {
  Form,
  Modal,
  Input,
  Typography,
  Button,
  Radio,
  InputNumber,
  Row,
  Col,
  Collapse,
  Checkbox,
  FormInstance,
  Tooltip,
  Select,
} from "antd";
import React, { useEffect, useState } from "react";
import { useShowModal } from "../components/ModalManager";
import { MinusCircleOutlined, PlusOutlined } from "@ant-design/icons";
import { formatErrorAlert, useAlertApi } from "../components/Alerts";
import { namePattern, validateForm } from "../lib/formutil";
import { useConfig } from "../components/ConfigProvider";
import { authenticationService, backrestService } from "../api";
import { clone, fromJson, toJson } from "@bufbuild/protobuf";
import {
  AuthSchema,
  Config,
  ConfigSchema,
  UserSchema,
  MultihostSchema,
  Multihost_PeerSchema,
  Multihost_Permission_Type,
} from "../../gen/ts/v1/config_pb";
import { PeerState } from "../../gen/ts/v1sync/syncservice_pb";
import { useSyncStates } from "../state/peerstates";
import { PeerStateConnectionStatusIcon } from "../components/SyncStateIcon";
import { isMultihostSyncEnabled } from "../state/buildcfg";

interface FormData {
  auth: {
    users: {
      name: string;
      passwordBcrypt: string;
      needsBcrypt?: boolean;
    }[];
  };
  instance: string;
  multihost: {
    identity: {
      keyId: string;
    };
    knownHosts: {
      instanceId: string;
      keyId: string;
      keyIdVerified?: boolean;
      instanceUrl: string;
      permissions?: {
        type: number;
        scopes: string[];
      }[];
    }[];
    authorizedClients: {
      instanceId: string;
      keyId: string;
      keyIdVerified?: boolean;
      permissions?: {
        type: number;
        scopes: string[];
      }[];
    }[];
  };
}

export const SettingsModal = () => {
  let [config, setConfig] = useConfig();
  const showModal = useShowModal();
  const alertsApi = useAlertApi()!;
  const [form] = Form.useForm<FormData>();
  const peerStates = useSyncStates();
  const [reloadOnCancel, setReloadOnCancel] = useState(false);
  const [formEdited, setFormEdited] = useState(false);

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
      newConfig.multihost = fromJson(MultihostSchema, formData.multihost, {
        ignoreUnknownFields: false,
      });
      newConfig.instance = formData.instance;

      if (!newConfig.auth?.users && !newConfig.auth?.disabled) {
        throw new Error(
          "必须添加一个用户账户或者禁用身份验证"
        );
      }

      setConfig(await backrestService.setConfig(newConfig));
      setReloadOnCancel(true);
      alertsApi.success("已更新设置", 5);
      setFormEdited(false);
    } catch (e: any) {
      alertsApi.error(formatErrorAlert(e, "操作错误: "), 15);
    }
  };

  const handleCancel = () => {
    showModal(null);
    if (reloadOnCancel) {
      window.location.reload();
    }
  };

  const users = config.auth?.users || [];

  return (
    <>
      <Modal
        open={true}
        onCancel={handleCancel}
        title={"设置"}
        width="60vw"
        footer={[
          <Button key="back" onClick={handleCancel}>
            {formEdited ? "取消" : "关闭"}
          </Button>,
          <Button key="submit" type="primary" onClick={handleOk}>
            提交
          </Button>,
        ]}
      >
        <Form
          autoComplete="off"
          form={form}
          labelCol={{ span: 4 }}
          wrapperCol={{ span: 20 }}
          onValuesChange={() => setFormEdited(true)}
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
          <Form.Item
            hasFeedback
            name="instance"
            label="实例 ID"
            required
            initialValue={config.instance || ""}
            tooltip="用于识别该 backrest 的唯一实例名称。请谨慎设置该值，创建后将无法修改。"
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

          <Collapse
            items={[
              {
                key: "1",
                label: "身份验证",
                forceRender: true,
                children: <AuthenticationForm form={form} config={config} />,
              },
              {
                key: "2",
                label: "多主机身份验证与共享",
                forceRender: true,
                children: (
                  <MultihostIdentityForm
                    form={form}
                    config={config}
                    peerStates={peerStates}
                  />
                ),
                style: isMultihostSyncEnabled ? undefined : { display: "none" },
              },
              {
                key: "last",
                label: "预览",
                children: (
                  <Form.Item shouldUpdate wrapperCol={{ span: 24 }}>
                    {() => (
                      <Typography>
                        <pre>
                          {JSON.stringify(form.getFieldsValue(), null, 2)}
                        </pre>
                      </Typography>
                    )}
                  </Form.Item>
                ),
              },
            ]}
          />
        </Form>
      </Modal>
    </>
  );
};

const AuthenticationForm: React.FC<{
  config: Config;
  form: FormInstance<FormData>;
}> = ({ form, config }) => {
  return (
    <>
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
                          {
                            required: true,
                            message: "用户名为必填项",
                          },
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
                  <PlusOutlined /> 添加用户
                </Button>
              </Form.Item>
            </>
          )}
        </Form.List>
      </Form.Item>
    </>
  );
};

const MultihostIdentityForm: React.FC<{
  config: Config;
  form: FormInstance<FormData>;
  peerStates: PeerState[];
}> = ({ form, config, peerStates }) => {
  return (
    <>
      <Typography.Paragraph italic>
        多主机身份验证允许您在多个 Backrest 实例之间共享同一个储存库。
        这在处理包含多个系统的备份状态时非常有用。
      </Typography.Paragraph>
      <Typography.Paragraph italic>
        该功能尚处于实验阶段，将来可能会出现版本不兼容的变化，届时需要同时更新所有的实例。
      </Typography.Paragraph>

      {/* Show the current instance's identity */}
      <Form.Item
        label="多主机身份验证"
        name={["multihost", "identity", "keyId"]}
        initialValue={config.multihost?.identity?.keyid || ""}
        rules={[
          {
            required: true,
            message: "需要启用多主机身份验证",
          },
        ]}
        tooltip="多主机身份标识码用于在多主机设置中识别此实例。它由该实例的公钥加密派生得来。"
        wrapperCol={{ span: 16 }}
      >
        <Row>
          <Col flex="auto">
            <Input
              placeholder="多主机身份标识码"
              disabled
              value={config.multihost?.identity?.keyid}
            />
          </Col>
          <Col>
            <Button
              type="link"
              onClick={() =>
                -navigator.clipboard.writeText(
                  config.multihost?.identity?.keyid || ""
                )
              }
            >
              复制
            </Button>
          </Col>
        </Row>
      </Form.Item>

      {/* Authorized client peers. */}
      <Form.Item
        label="实例授权"
        tooltip="授权其它 Backrest 实例访问此实例上的储存库。"
      >
        <PeerFormList
          form={form}
          listName={["multihost", "authorizedClients"]}
          showInstanceUrl={false}
          itemTypeName="实例授权"
          peerStates={peerStates}
          config={config}
          listType="authorizedClients"
          initialValue={
            config.multihost?.authorizedClients?.map((peer) =>
              toJson(Multihost_PeerSchema, peer, { alwaysEmitImplicit: true })
            ) || []
          }
        />
      </Form.Item>

      {/* Known host peers. */}
      <Form.Item
        label="已知主机"
        tooltip="已知主机是该实例可以连接的其它 Backrest 实例。"
      >
        <PeerFormList
          form={form}
          listName={["multihost", "knownHosts"]}
          showInstanceUrl={true}
          itemTypeName="已知主机"
          peerStates={peerStates}
          config={config}
          listType="knownHosts"
          initialValue={
            config.multihost?.knownHosts?.map((peer) =>
              toJson(Multihost_PeerSchema, peer, { alwaysEmitImplicit: true })
            ) || []
          }
        />
      </Form.Item>
    </>
  );
};

const PeerFormList: React.FC<{
  form: FormInstance<FormData>;
  listName: string[];
  showInstanceUrl: boolean;
  itemTypeName: string;
  peerStates: PeerState[];
  initialValue: any[];
  config: Config;
  listType: "knownHosts" | "authorizedClients";
}> = ({
  form,
  listName,
  showInstanceUrl,
  itemTypeName,
  peerStates,
  initialValue,
  config,
  listType,
}) => {
  return (
    <Form.List name={listName} initialValue={initialValue}>
      {(fields, { add, remove }, { errors }) => (
        <>
          {fields.map((field, index) => (
            <PeerFormListItem
              key={field.key}
              form={form}
              fieldName={field.name}
              remove={remove}
              showInstanceUrl={showInstanceUrl}
              peerStates={peerStates}
              isKnownHost={listType === "knownHosts"}
              index={index}
              config={config}
              listType={listType}
            />
          ))}
          <Form.Item>
            <Button
              type="dashed"
              onClick={() => add({})}
              block
              icon={<PlusOutlined />}
            >
              添加 {itemTypeName || "Peer"}
            </Button>
            <Form.ErrorList errors={errors} />
          </Form.Item>
        </>
      )}
    </Form.List>
  );
};

const PeerFormListItem: React.FC<{
  form: FormInstance<FormData>;
  fieldName: number;
  remove: (index: number | number[]) => void;
  showInstanceUrl: boolean;
  peerStates: PeerState[];
  isKnownHost?: boolean;
  index: number;
  config: Config;
  listType: "knownHosts" | "authorizedClients";
}> = ({
  form,
  fieldName,
  remove,
  showInstanceUrl,
  peerStates,
  isKnownHost = false,
  index,
  config,
  listType,
}) => {
  // Get the instance ID from the form to find the matching sync state, its a bit hacky but works reliably.
  const keyId = isKnownHost
    ? form.getFieldValue(["multihost", "knownHosts", index, "keyId"])
    : form.getFieldValue(["multihost", "authorizedClients", index, "keyId"]);

  const peerState = peerStates.find((state) => state.peerKeyid === keyId);

  return (
    <div
      style={{
        border: "1px solid #d9d9d9",
        borderRadius: "6px",
        padding: "16px",
        marginBottom: "16px",
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: "8px",
          right: "8px",
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}
      >
        {peerState && <PeerStateConnectionStatusIcon peerState={peerState} />}
        <MinusCircleOutlined
          style={{
            color: "#999",
            cursor: "pointer",
          }}
          onClick={() => remove(fieldName)}
        />
      </div>

      <Row gutter={16}>
        <Col span={10}>
          <Form.Item
            name={[fieldName, "instanceId"]}
            label="实例 ID"
            rules={[
              { required: true, message: "实例 ID 为必填项" },
              {
                pattern: namePattern,
                message:
                  "实例 ID 中只能包含数字和字母，以及分隔符 “_-.”",
              },
            ]}
          >
            <Input placeholder="例如 my-backup-server" />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item
            name={[fieldName, "keyId"]}
            label="密钥 ID"
            rules={[{ required: true, message: "密钥 ID 为必填项" }]}
          >
            <Input placeholder="公钥标识符" />
          </Form.Item>
        </Col>
        <Col span={0}>
          <Form.Item
            name={[fieldName, "keyIdVerified"]}
            valuePropName="checked"
            // At the moment, we require clients to explicitly provide keys so there's nothing implicit. Manually checking the box doesn't add much value.
            // It will be more useful if we automate fetching keyids from known hosts in the future / provide a "connection token" like mechanism for easier setup.
            hidden={true}
          >
            <Checkbox defaultChecked={true}>已验证</Checkbox>
          </Form.Item>
        </Col>
      </Row>

      {showInstanceUrl && (
        <Row gutter={16}>
          <Col span={24}>
            <Form.Item
              name={[fieldName, "instanceUrl"]}
              label="实例 URL"
              rules={[
                {
                  required: showInstanceUrl,
                  message: "位于已知主机，需要一个实例 URL",
                },
                { type: "url", message: "请输入一个合法的 URL" },
              ]}
            >
              <Input placeholder="https://example.com:9898" />
            </Form.Item>
          </Col>
        </Row>
      )}

      {/* No meaningful permissions to grant to clients today, only show permissions UI for known hosts */}
      {isKnownHost ? (
        <PeerPermissionsTile
          form={form}
          fieldName={fieldName}
          listType={listType}
          config={config}
        />
      ) : null}
    </div>
  );
};

const PeerPermissionsTile: React.FC<{
  form: FormInstance<FormData>;
  fieldName: number;
  listType: "knownHosts" | "authorizedClients";
  config: Config;
}> = ({ form, fieldName, listType, config }) => {
  const repoOptions = (config.repos || []).map((repo) => ({
    label: repo.id,
    value: `repo:${repo.id}`,
  }));

  return (
    <div>
      <Typography.Text strong style={{ marginBottom: "8px", display: "block" }}>
        权限
      </Typography.Text>

      <Form.List name={[fieldName, "permissions"]}>
        {(
          permissionFields,
          { add: addPermission, remove: removePermission }
        ) => (
          <>
            {permissionFields.map((permissionField) => (
              <div
                key={permissionField.key}
                style={{
                  border: "1px solid #d9d9d9",
                  borderRadius: "4px",
                  padding: "12px",
                  marginBottom: "8px",
                  backgroundColor: "transparent",
                }}
              >
                <Row gutter={8} align="middle">
                  <Col span={11}>
                    <Form.Item
                      name={[permissionField.name, "type"]}
                      label="Type"
                      rules={[
                        {
                          required: true,
                          message: "权限类型为必填项",
                        },
                      ]}
                    >
                      <Select placeholder="选择权限类型">
                        <Select.Option
                          value={
                            Multihost_Permission_Type.PERMISSION_READ_WRITE_CONFIG
                          }
                        >
                          编辑储存库配置
                        </Select.Option>
                        <Select.Option
                          value={
                            Multihost_Permission_Type.PERMISSION_READ_OPERATIONS
                          }
                        >
                          读取操作
                        </Select.Option>
                      </Select>
                    </Form.Item>
                  </Col>
                  <Col span={11}>
                    <Form.Item
                      name={[permissionField.name, "scopes"]}
                      label="作用域"
                      rules={[
                        {
                          required: true,
                          message: "至少一个作用域为必填项",
                        },
                      ]}
                    >
                      <Select
                        mode="multiple"
                        placeholder="选择作用的储存库，或者使用 * 授权访问全部储存库"
                        options={[
                          { label: "全部储存库 (*)", value: "*" },
                          ...repoOptions,
                        ]}
                      />
                    </Form.Item>
                  </Col>
                  <Col span={2}>
                    <MinusCircleOutlined
                      style={{
                        color: "#999",
                        cursor: "pointer",
                        fontSize: "16px",
                      }}
                      onClick={() => removePermission(permissionField.name)}
                    />
                  </Col>
                </Row>
              </div>
            ))}
            <Button
              type="dashed"
              onClick={() =>
                addPermission({
                  type: Multihost_Permission_Type.PERMISSION_READ_OPERATIONS,
                  scopes: ["*"],
                })
              }
              icon={<PlusOutlined />}
              size="small"
              style={{ width: "100%" }}
            >
              添加权限
            </Button>
          </>
        )}
      </Form.List>
    </div>
  );
};
