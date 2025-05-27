import {
  Form,
  Modal,
  Input,
  Typography,
  AutoComplete,
  Tooltip,
  Button,
  Row,
  Col,
  Card,
  InputNumber,
  FormInstance,
  Collapse,
  Checkbox,
  Select,
  Space,
} from "antd";
import React, { useEffect, useState } from "react";
import { useShowModal } from "../components/ModalManager";
import {
  CommandPrefix_CPUNiceLevel,
  CommandPrefix_CPUNiceLevelSchema,
  CommandPrefix_IONiceLevel,
  CommandPrefix_IONiceLevelSchema,
  type Repo,
  RepoSchema,
  Schedule_Clock,
} from "../../gen/ts/v1/config_pb";
import { StringValueSchema } from "../../gen/ts/types/value_pb";
import { URIAutocomplete } from "../components/URIAutocomplete";
import { MinusCircleOutlined, PlusOutlined } from "@ant-design/icons";
import { formatErrorAlert, useAlertApi } from "../components/Alerts";
import { namePattern, validateForm } from "../lib/formutil";
import { backrestService } from "../api";
import {
  HooksFormList,
  hooksListTooltipText,
} from "../components/HooksFormList";
import { ConfirmButton, SpinButton } from "../components/SpinButton";
import { useConfig } from "../components/ConfigProvider";
import Cron from "react-js-cron";
import {
  ScheduleDefaultsInfrequent,
  ScheduleFormItem,
} from "../components/ScheduleFormItem";
import { isWindows } from "../state/buildcfg";
import { create, fromJson, JsonValue, toJson } from "@bufbuild/protobuf";

const repoDefaults = create(RepoSchema, {
  prunePolicy: {
    maxUnusedPercent: 10,
    schedule: {
      schedule: {
        case: "cron",
        value: "0 0 1 * *", // 1st of the month,
      },
      clock: Schedule_Clock.LAST_RUN_TIME,
    },
  },
  checkPolicy: {
    schedule: {
      schedule: {
        case: "cron",
        value: "0 0 1 * *", // 1st of the month,
      },
      clock: Schedule_Clock.LAST_RUN_TIME,
    },
  },
  commandPrefix: {
    ioNice: CommandPrefix_IONiceLevel.IO_DEFAULT,
    cpuNice: CommandPrefix_CPUNiceLevel.CPU_DEFAULT,
  },
});

export const AddRepoModal = ({ template }: { template: Repo | null }) => {
  const [confirmLoading, setConfirmLoading] = useState(false);
  const showModal = useShowModal();
  const alertsApi = useAlertApi()!;
  const [config, setConfig] = useConfig();
  const [form] = Form.useForm<JsonValue>();
  useEffect(() => {
    const initVal = template
      ? toJson(RepoSchema, template, {
          alwaysEmitImplicit: true,
        })
      : toJson(RepoSchema, repoDefaults, { alwaysEmitImplicit: true });
    form.setFieldsValue(initVal);
  }, [template]);

  if (!config) {
    return null;
  }

  const handleDestroy = async () => {
    setConfirmLoading(true);

    try {
      // Update config and notify success.
      setConfig(
        await backrestService.removeRepo(
          create(StringValueSchema, { value: template!.id })
        )
      );
      showModal(null);
      alertsApi.success(
        "已删除的储存库 " +
          template!.id! +
          " 已从配置文件中移除，但是相关文件仍然存在。请手动删除这些文件以释放储存空间。URI: " +
          template!.uri
      );
    } catch (e: any) {
      alertsApi.error(formatErrorAlert(e, "操作错误: "), 15);
    } finally {
      setConfirmLoading(false);
    }
  };

  const handleOk = async () => {
    setConfirmLoading(true);

    try {
      let repoFormData = await validateForm(form);
      const repo = fromJson(RepoSchema, repoFormData, {
        ignoreUnknownFields: false,
      });

      if (template !== null) {
        // We are in the update repo flow, update the repo via the service
        setConfig(await backrestService.addRepo(repo));
        showModal(null);
        alertsApi.success("已更新储存库配置 " + repo.uri);
      } else {
        // We are in the create repo flow, create the new repo via the service
        setConfig(await backrestService.addRepo(repo));
        showModal(null);
        alertsApi.success("已添加储存库 " + repo.uri);
      }

      try {
        // Update the snapshots for the repo to confirm the config works.
        // TODO: this operation is only used here, find a different RPC for this purpose.
        await backrestService.listSnapshots({ repoId: repo.id });
      } catch (e: any) {
        alertsApi.error(
          formatErrorAlert(
            e,
            "从已添加/已更新的储存库中列举快照时出错: "
          ),
          10
        );
      }
    } catch (e: any) {
      alertsApi.error(formatErrorAlert(e, "操作错误: "), 10);
    } finally {
      setConfirmLoading(false);
    }
  };

  const handleCancel = () => {
    showModal(null);
  };

  return (
    <>
      <Modal
        open={true}
        onCancel={handleCancel}
        title={template ? "编辑 Restic 储存库" : "添加 Restic 储存库"}
        width="60vw"
        footer={[
          <Button loading={confirmLoading} key="back" onClick={handleCancel}>
            取消
          </Button>,
          template != null ? (
            <Tooltip title="从配置文件中移除储存库，但不会从本地文件中删除 Restic 储存库">
              <ConfirmButton
                key="delete"
                type="primary"
                danger
                onClickAsync={handleDestroy}
                confirmTitle="确认删除？"
              >
                删除
              </ConfirmButton>
            </Tooltip>
          ) : null,
          <SpinButton
            key="check"
            onClickAsync={async () => {
              let repoFormData = await validateForm(form);
              console.log("检查储存库", repoFormData);
              const repo = fromJson(RepoSchema, repoFormData, {
                ignoreUnknownFields: false,
              });
              try {
                const exists = await backrestService.checkRepoExists(repo);
                if (exists.value) {
                  alertsApi.success(
                    "已成功连接至 " +
                      repo.uri +
                      " 并找到了一个存在的储存库。",
                    10
                  );
                } else {
                  alertsApi.success(
                    "已成功连接至 " +
                      repo.uri +
                      "。但没有找到储存库，将会初始化创建一个新的。",
                    10
                  );
                }
              } catch (e: any) {
                alertsApi.error(formatErrorAlert(e, "检查错误: "), 10);
              }
            }}
          >
            测试配置
          </SpinButton>,
          <Button
            key="submit"
            type="primary"
            loading={confirmLoading}
            onClick={handleOk}
          >
            提交
          </Button>,
        ]}
        maskClosable={false}
      >
        <p>
          查看{" "}
          <a
            href="https://garethgeorge.github.io/backrest/introduction/getting-started"
            target="_blank"
          >
            backrest getting started guide
          </a>{" "}
          以了解如何配置储存库。或者查看{" "}
          <a href="https://restic.readthedocs.io/" target="_blank">
            restic 文档
          </a>{" "}
          了解更多有关储存库的信息。
        </p>
        <br />
        <Form
          autoComplete="off"
          form={form}
          labelCol={{ span: 4 }}
          wrapperCol={{ span: 18 }}
          disabled={confirmLoading}
        >
          {/* Repo.id */}
          <Tooltip
            title={
              "后台用于识别该储存库的唯一标识名称，例如s3-mybucket。注意创建后将无法修改。"
            }
          >
            <Form.Item<Repo>
              hasFeedback
              name="id"
              label="储存库名称"
              validateTrigger={["onChange", "onBlur"]}
              rules={[
                {
                  required: true,
                  message: "请输入储存库名称",
                },
                {
                  validator: async (_, value) => {
                    if (template) return;
                    if (config?.repos?.find((r) => r.id === value)) {
                      throw new Error();
                    }
                  },
                  message: "储存库名称已存在",
                },
                {
                  pattern: namePattern,
                  message:
                    "名称中只能包含数字和字母，以及连接符 - 或下划线 _",
                },
              ]}
            >
              <Input
                disabled={!!template}
                placeholder={"repo" + ((config?.repos?.length || 0) + 1)}
              />
            </Form.Item>
          </Tooltip>

          <Form.Item<Repo> name="guid" hidden>
            <Input />
          </Form.Item>

          {/* Repo.uri */}

          <Tooltip
            title={
              <>
                可用的储存库 URI 包括:
                <ul>
                  <li>本地文件系统路径</li>
                  <li>S3路径，例如 s3:// ...</li>
                  <li>SFTP路径，例如 sftp:user@host:/repo-path</li>
                  <li>
                    查看{" "}
                    <a
                      href="https://restic.readthedocs.io/en/latest/030_preparing_a_new_repo.html#preparing-a-new-repository"
                      target="_blank"
                    >
                      restic 文档
                    </a>{" "}
                    了解更多信息。
                  </li>
                </ul>
              </>
            }
          >
            <Form.Item<Repo>
              hasFeedback
              name="uri"
              label="储存库 URI"
              validateTrigger={["onChange", "onBlur"]}
              rules={[
                {
                  required: true,
                  message: "请输入储存库 URI",
                },
              ]}
            >
              <URIAutocomplete disabled={!!template} />
            </Form.Item>
          </Tooltip>

          {/* Repo.password */}
          <Tooltip
            title={
              <>
                密码用于加密储存库中的数据。
                <ul>
                  <li>
                    建议选择熵为 128 比特或更高的密码 (20 个字符或更长)
                  </li>
                  <li>
                    你也可用通过环境变量提供，例如
                    RESTIC_PASSWORD, RESTIC_PASSWORD_FILE, 或
                    RESTIC_PASSWORD_COMMAND
                  </li>
                  <li>
                    或者点击 [生成] 按钮使用浏览器提供的API生成随机加密的密码
                  </li>
                </ul>
              </>
            }
          >
            <Form.Item label="密码">
              <Row>
                <Col span={16}>
                  <Form.Item<Repo>
                    hasFeedback
                    name="password"
                    validateTrigger={["onChange", "onBlur"]}
                  >
                    <Input disabled={!!template} />
                  </Form.Item>
                </Col>
                <Col
                  span={7}
                  offset={1}
                  style={{ display: "flex", justifyContent: "left" }}
                >
                  <Button
                    type="text"
                    onClick={() => {
                      if (template) return;
                      form.setFieldsValue({
                        password: cryptoRandomPassword(),
                      });
                    }}
                  >
                    [生成]
                  </Button>
                </Col>
              </Row>
            </Form.Item>
          </Tooltip>

          {/* Repo.env */}
          <Tooltip
            title={
              "传递至 restic 的环境变量 (例如用于提供 S3 或 B2 凭证)。支持使用 FOO=${MY_FOO_VAR} 以应用父进程中的环境变量。"
            }
          >
            <Form.Item label="环境变量">
              <Form.List
                name="env"
                rules={[
                  {
                    validator: async (_, envVars) => {
                      return await envVarSetValidator(form, envVars);
                    },
                  },
                ]}
              >
                {(fields, { add, remove }, { errors }) => (
                  <>
                    {fields.map((field, index) => (
                      <Form.Item key={field.key}>
                        <Form.Item
                          {...field}
                          validateTrigger={["onChange", "onBlur"]}
                          rules={[
                            {
                              required: true,
                              whitespace: true,
                              pattern: /^[\w-]+=.*$/,
                              message:
                                "环境变量必须设置为 KEY=VALUE 的形式",
                            },
                          ]}
                          noStyle
                        >
                          <Input
                            placeholder="KEY=VALUE"
                            onBlur={() => form.validateFields()}
                            style={{ width: "90%" }}
                          />
                        </Form.Item>
                        <MinusCircleOutlined
                          className="dynamic-delete-button"
                          onClick={() => remove(index)}
                          style={{ paddingLeft: "5px" }}
                        />
                      </Form.Item>
                    ))}
                    <Form.Item>
                      <Button
                        type="dashed"
                        onClick={() => add("")}
                        style={{ width: "90%" }}
                        icon={<PlusOutlined />}
                      >
                        添加环境变量
                      </Button>
                      <Form.ErrorList errors={errors} />
                    </Form.Item>
                  </>
                )}
              </Form.List>
            </Form.Item>
          </Tooltip>

          {/* Repo.flags */}
          <Form.Item label="Flags">
            <Form.List name="flags">
              {(fields, { add, remove }, { errors }) => (
                <>
                  {fields.map((field, index) => (
                    <Form.Item required={false} key={field.key}>
                      <Form.Item
                        {...field}
                        validateTrigger={["onChange", "onBlur"]}
                        rules={[
                          {
                            required: true,
                            whitespace: true,
                            pattern: /^\-\-?.*$/,
                            message:
                              "输入应当为一个命令行 flag，查看命令 restic --help 输出了解可用的 flag",
                          },
                        ]}
                        noStyle
                      >
                        <Input placeholder="--flag" style={{ width: "90%" }} />
                      </Form.Item>
                      <MinusCircleOutlined
                        className="dynamic-delete-button"
                        onClick={() => remove(index)}
                        style={{ paddingLeft: "5px" }}
                      />
                    </Form.Item>
                  ))}
                  <Form.Item>
                    <Button
                      type="dashed"
                      onClick={() => add()}
                      style={{ width: "90%" }}
                      icon={<PlusOutlined />}
                    >
                      添加 Flag
                    </Button>
                    <Form.ErrorList errors={errors} />
                  </Form.Item>
                </>
              )}
            </Form.List>
          </Form.Item>

          {/* Repo.prunePolicy */}
          <Form.Item
            label={
              <Tooltip
                title={
                  <span>
                    针对此储存库定时运行修剪(prune)操作的调度计划。阅读{" "}
                    <a
                      href="https://restic.readthedocs.io/en/stable/060_forget.html#customize-pruning"
                      target="_blank"
                    >
                      自定义修剪(prune)操作的 restic 文档
                    </a>{" "}
                    以了解更多信息。
                  </span>
                }
              >
                修剪(prune)策略
              </Tooltip>
            }
          >
            <Form.Item
              name={["prunePolicy", "maxUnusedPercent"]}
              initialValue={10}
              required={false}
            >
              <InputPercent
                addonBefore={
                  <Tooltip title="修剪(prune)结束后，储存库中未使用内容所占的最大百分比，较大的数值会减少复制操作，但会增大储存空间。">
                    <div style={{ width: "12" }}>最大未使用比</div>
                  </Tooltip>
                }
              />
            </Form.Item>
            <ScheduleFormItem
              name={["prunePolicy", "schedule"]}
              defaults={ScheduleDefaultsInfrequent}
            />
          </Form.Item>

          {/* Repo.checkPolicy */}
          <Form.Item
            label={
              <Tooltip
                title={
                  <span>
                    针对此储存库定时运行检查(check)操作的调度计划。
                    该操作通过扫描备份数据的磁盘内容来验证储存库的完整性。
                    检查(check)操作可以设置为重新读取和重新哈希，虽然速度可能会很慢，
                    并且会占用大量的带宽，但是能够捕获磁盘储存中的数据损坏。
                  </span>
                }
              >
                检查(check)策略
              </Tooltip>
            }
          >
            <Form.Item
              name={["checkPolicy", "readDataSubsetPercent"]}
              initialValue={0}
              required={false}
            >
              <InputPercent
                addonBefore={
                  <Tooltip title="每次读取和验证数据的占比。越高的数值占用的带宽就越高。例如 100% 表示每次检查时都会重新读取完整的储存库。">
                    <div style={{ width: "12" }}>验证数据占比</div>
                  </Tooltip>
                }
              />
            </Form.Item>
            <ScheduleFormItem
              name={["checkPolicy", "schedule"]}
              defaults={ScheduleDefaultsInfrequent}
            />
          </Form.Item>

          {/* Repo.commandPrefix */}
          {!isWindows && (
            <Form.Item
              label={
                <Tooltip
                  title={
                    <span>
                      备份操作的修饰符，例如设置 CPU 或 IO 的优先级。
                    </span>
                  }
                >
                  命令修饰符
                </Tooltip>
              }
              colon={false}
            >
              <Row>
                <Col span={12} style={{ paddingLeft: "5px" }}>
                  <Tooltip
                    title={
                      <>
                        可用的 IO 优先级模式
                        <ul>
                          <li>
                            IO_BEST_EFFORT_LOW - 以低优先级运行 (优先考虑其它进程)
                          </li>
                          <li>
                            IO_BEST_EFFORT_HIGH - 以高优先级运行 (将位于磁盘IO队列顶部)
                          </li>
                          <li>
                            IO_IDLE - 仅空闲时运行 (例如没有其它操作排队)
                          </li>
                        </ul>
                      </>
                    }
                  >
                    IO 优先级:
                    <br />
                    <Form.Item
                      name={["commandPrefix", "ioNice"]}
                      required={false}
                    >
                      <Select
                        allowClear
                        style={{ width: "100%" }}
                        placeholder="选择一个 IO 优先级"
                        options={CommandPrefix_IONiceLevelSchema.values.map(
                          (v) => ({
                            label: v.name,
                            value: v.name,
                          })
                        )}
                      />
                    </Form.Item>
                  </Tooltip>
                </Col>
                <Col span={12} style={{ paddingLeft: "5px" }}>
                  <Tooltip
                    title={
                      <>
                        可用的 CPU 优先级模式:
                        <ul>
                          <li>CPU_DEFAULT - 默认优先级</li>
                          <li>
                            CPU_HIGH - 高优先级 (Backrest 必须以 root 身份运行)
                          </li>
                          <li>CPU_LOW - 低优先级</li>
                        </ul>
                      </>
                    }
                  >
                    CPU 优先级:
                    <br />
                    <Form.Item
                      name={["commandPrefix", "cpuNice"]}
                      required={false}
                    >
                      <Select
                        allowClear
                        style={{ width: "100%" }}
                        placeholder="选择一个 CPU 优先级"
                        options={CommandPrefix_CPUNiceLevelSchema.values.map(
                          (v) => ({
                            label: v.name,
                            value: v.name,
                          })
                        )}
                      />
                    </Form.Item>
                  </Tooltip>
                </Col>
              </Row>
            </Form.Item>
          )}

          <Form.Item
            label={
              <Tooltip
                title={
                  "自动解锁功能将在忘记(forget)和修剪(prune)操作开始前删除锁定文件。" +
                  "如果储存库由多个设备共同使用，可能会不安全。默认情况下禁用。"
                }
              >
                自动解锁
              </Tooltip>
            }
            name="autoUnlock"
            valuePropName="checked"
          >
            <Checkbox />
          </Form.Item>

          <Form.Item
            label={<Tooltip title={hooksListTooltipText}>钩子函数</Tooltip>}
          >
            <HooksFormList />
          </Form.Item>

          <Form.Item shouldUpdate label="预览">
            {() => (
              <Collapse
                size="small"
                items={[
                  {
                    key: "1",
                    label: "使用 JSON 预览储存库配置",
                    children: (
                      <Typography>
                        <pre>
                          {JSON.stringify(form.getFieldsValue(), undefined, 2)}
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

const expectedEnvVars: { [scheme: string]: string[][] } = {
  s3: [
    ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"],
    ["AWS_SHARED_CREDENTIALS_FILE"],
  ],
  b2: [["B2_ACCOUNT_ID", "B2_ACCOUNT_KEY"]],
  azure: [
    ["AZURE_ACCOUNT_NAME", "AZURE_ACCOUNT_KEY"],
    ["AZURE_ACCOUNT_NAME", "AZURE_ACCOUNT_SAS"],
  ],
  gs: [
    ["GOOGLE_APPLICATION_CREDENTIALS", "GOOGLE_PROJECT_ID"],
    ["GOOGLE_ACCESS_TOKEN"],
  ],
};

const envVarSetValidator = (form: FormInstance<any>, envVars: string[]) => {
  if (!envVars) {
    return Promise.resolve();
  }

  let uri = form.getFieldValue("uri");
  if (!uri) {
    return Promise.resolve();
  }

  const envVarNames = envVars.map((e) => {
    if (!e) {
      return "";
    }
    let idx = e.indexOf("=");
    if (idx === -1) {
      return "";
    }
    return e.substring(0, idx);
  });

  // check that password is provided in some form
  const password = form.getFieldValue("password");
  if (
    (!password || password.length === 0) &&
    !envVarNames.includes("RESTIC_PASSWORD") &&
    !envVarNames.includes("RESTIC_PASSWORD_COMMAND") &&
    !envVarNames.includes("RESTIC_PASSWORD_FILE")
  ) {
    return Promise.reject(
      new Error(
        "未提供储存库密码。请输入密码或者选择设置 RESTIC_PASSWORD, RESTIC_PASSWORD_COMMAND, RESTIC_PASSWORD_FILE 环境变量"
      )
    );
  }

  // find expected env for scheme
  let schemeIdx = uri.indexOf(":");
  if (schemeIdx === -1) {
    return Promise.resolve();
  }

  let scheme = uri.substring(0, schemeIdx);

  return checkSchemeEnvVars(scheme, envVarNames);
};

const cryptoRandomPassword = (): string => {
  let vals = crypto.getRandomValues(new Uint8Array(64));
  // 48 chars is at least log2(64) * 48 = ~288 bits of entropy.
  return btoa(String.fromCharCode(...vals)).slice(0, 48);
};

const checkSchemeEnvVars = (
  scheme: string,
  envVarNames: string[]
): Promise<void> => {
  let expected = expectedEnvVars[scheme];
  if (!expected) {
    return Promise.resolve();
  }

  const missingVarsCollection: string[][] = [];

  for (let possibility of expected) {
    const missingVars = possibility.filter(
      (envVar) => !envVarNames.includes(envVar)
    );

    // If no env vars are missing, we have a full match and are good
    if (missingVars.length === 0) {
      return Promise.resolve();
    }

    // First pass: Only add those missing vars from sets where at least one existing env var already exists
    if (missingVars.length < possibility.length) {
      missingVarsCollection.push(missingVars);
    }
  }

  // If we didn't find any env var set with a partial match, then add all expected sets
  if (!missingVarsCollection.length) {
    missingVarsCollection.push(...expected);
  }

  return Promise.reject(
    new Error(
      "缺失环境变量 " +
        formatMissingEnvVars(missingVarsCollection) +
        " 在协议 " +
        scheme +
        " 中"
    )
  );
};

const formatMissingEnvVars = (partialMatches: string[][]): string => {
  return partialMatches
    .map((x) => {
      if (x.length > 1) {
        return `[ ${x.join(", ")} ]`;
      }
      return x[0];
    })
    .join(" 或 ");
};

const InputPercent = ({ ...props }) => {
  return (
    <InputNumber
      step={1}
      min={0}
      max={100}
      precision={2}
      controls={false}
      suffix="%"
      {...props}
    />
  );
};
