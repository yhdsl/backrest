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
  Col,
  Collapse,
  Checkbox,
  AutoComplete,
} from "antd";
import React, { useEffect, useMemo, useState } from "react";
import { useShowModal } from "../components/ModalManager";
import {
  ConfigSchema,
  PlanSchema,
  RetentionPolicySchema,
  Schedule_Clock,
  type Plan,
} from "../../gen/ts/v1/config_pb";
import {
  CalculatorOutlined,
  MinusCircleOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import { URIAutocomplete } from "../components/URIAutocomplete";
import { formatErrorAlert, useAlertApi } from "../components/Alerts";
import { namePattern, validateForm } from "../lib/formutil";
import {
  HooksFormList,
  hooksListTooltipText,
} from "../components/HooksFormList";
import { ConfirmButton, SpinButton } from "../components/SpinButton";
import { useConfig } from "../components/ConfigProvider";
import { backrestService } from "../api";
import {
  ScheduleDefaultsDaily,
  ScheduleFormItem,
} from "../components/ScheduleFormItem";
import { clone, create, equals, fromJson, toJson } from "@bufbuild/protobuf";
import { formatDuration } from "../lib/formatting";
import { getMinimumCronDuration } from "../lib/cronutil";
import _ from "lodash";
import { StringList } from "../../gen/ts/types/value_pb";
import { isWindows } from "../state/buildcfg";

const { TextArea } = Input;
const sep = isWindows ? "\\" : "/";

const PathsTextArea = ({ value, onChange, ...props }: any) => {
  const [options, setOptions] = useState<{ value: string }[]>([]);
  const [currentLine, setCurrentLine] = useState("");
  const [cursorPosition, setCursorPosition] = useState(0);

  const handleSearch = _.debounce((searchValue: string) => {
    if (!searchValue) {
      setOptions([]);
      return;
    }

    const lastSlash = searchValue.lastIndexOf(sep);
    let searchPath = searchValue;
    if (lastSlash !== -1) {
      searchPath = searchValue.substring(0, lastSlash);
    }

    backrestService
      .pathAutocomplete({ value: searchPath + sep })
      .then((res: StringList) => {
        if (!res.values) {
          return;
        }
        const vals = res.values.map((v) => {
          return {
            value: searchPath + sep + v,
          };
        });
        setOptions(vals.filter((o) => o.value.indexOf(searchValue) !== -1));
      })
      .catch((e) => {
        console.log("路径自动补全错误: ", e);
      });
  }, 200);

  const handleTextAreaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const cursorPos = e.target.selectionStart || 0;

    // Find the current line based on cursor position
    const lines = newValue.substring(0, cursorPos).split("\n");
    const currentLineValue = lines[lines.length - 1];

    setCurrentLine(currentLineValue);
    setCursorPosition(cursorPos);

    // Trigger autocomplete for the current line
    handleSearch(currentLineValue);

    // Update the form value
    if (onChange) {
      onChange(newValue);
    }
  };

  const onSelect = (selectedValue: string) => {
    const lines = (value || "").split("\n");
    const beforeCursor = (value || "").substring(0, cursorPosition);
    const afterCursor = (value || "").substring(cursorPosition);
    const linesBeforeCursor = beforeCursor.split("\n");

    // Replace the current line with the selected value
    linesBeforeCursor[linesBeforeCursor.length - 1] = selectedValue;
    const newValue = linesBeforeCursor.join("\n") + afterCursor;

    if (onChange) {
      onChange(newValue);
    }
    setOptions([]);
  };

  return (
    <AutoComplete
      options={options}
      onSelect={onSelect}
      onSearch={() => {}} // We handle search in textarea change
      {...props}
    >
      <TextArea
        value={value}
        onChange={handleTextAreaChange}
        placeholder="请输入路径，每行输入一个路径&#10;例如&#10;/home/user/documents&#10;/home/user/photos"
        style={{ minHeight: 100 }}
        autoSize={{ minRows: 3, maxRows: 10 }}
      />
    </AutoComplete>
  );
};

const planDefaults = create(PlanSchema, {
  schedule: {
    schedule: {
      case: "cron",
      value: "0 * * * *", // every hour
    },
    clock: Schedule_Clock.LOCAL,
  },
  retention: {
    policy: {
      case: "policyTimeBucketed",
      value: {
        hourly: 24,
        daily: 30,
        monthly: 12,
      },
    },
  },
});

export const AddPlanModal = ({ template }: { template: Plan | null }) => {
  const [confirmLoading, setConfirmLoading] = useState(false);
  const showModal = useShowModal();
  const alertsApi = useAlertApi()!;
  const [config, setConfig] = useConfig();
  const [form] = Form.useForm();
  useEffect(() => {
    const formData = template
      ? toJson(PlanSchema, template, { alwaysEmitImplicit: true })
      : toJson(PlanSchema, planDefaults, { alwaysEmitImplicit: true });

    // Convert paths array to newline-separated string for the textarea
    const formDataObj = formData as any;
    if (formDataObj?.paths && Array.isArray(formDataObj.paths)) {
      formDataObj.pathsText = formDataObj.paths.join("\n");
    } else {
      formDataObj.pathsText = "";
    }

    form.setFieldsValue(formDataObj);
  }, [template]);

  if (!config) {
    return null;
  }

  const handleDestroy = async () => {
    setConfirmLoading(true);

    try {
      if (!template) {
        throw new Error("未找到模板");
      }

      const configCopy = clone(ConfigSchema, config);

      // Remove the plan from the config
      const idx = configCopy.plans.findIndex((r) => r.id === template.id);
      if (idx === -1) {
        throw new Error("更新配置文件时出错，未找到待删除的调度计划");
      }
      configCopy.plans.splice(idx, 1);

      // Update config and notify success.
      setConfig(await backrestService.setConfig(configCopy));
      showModal(null);

      alertsApi.success(
        "该调度计划已从配置文件中删除，但尚未从 Restic 储存库中删除。快照将保留在储存库中，并且会继续跟踪相关操作，直到手动删除为止。如果已执行备份，则不建议重复使用已被删除的调度计划ID。",
        30
      );
    } catch (e: any) {
      alertsApi.error(formatErrorAlert(e, "销毁错误:"), 15);
    } finally {
      setConfirmLoading(false);
    }
  };

  const handleOk = async () => {
    setConfirmLoading(true);

    try {
      let planFormData = await validateForm(form);

      // Convert pathsText back to paths array
      if (planFormData.pathsText) {
        planFormData.paths = planFormData.pathsText
          .split("\n")
          .map((path: string) => path.trim())
          .filter((path: string) => path.length > 0);
        delete planFormData.pathsText;
      } else {
        planFormData.paths = [];
      }

      const plan = fromJson(PlanSchema, planFormData, {
        ignoreUnknownFields: false,
      });

      if (
        plan.retention &&
        equals(
          RetentionPolicySchema,
          plan.retention,
          create(RetentionPolicySchema, {})
        )
      ) {
        delete plan.retention;
      }

      const configCopy = clone(ConfigSchema, config);

      // Merge the new plan (or update) into the config
      if (template) {
        const idx = configCopy.plans.findIndex((r) => r.id === template.id);
        if (idx === -1) {
          throw new Error("更新调度计划时出错，未找到该调度计划");
        }
        configCopy.plans[idx] = plan;
      } else {
        configCopy.plans.push(plan);
      }

      // Update config and notify success.
      setConfig(await backrestService.setConfig(configCopy));
      showModal(null);
    } catch (e: any) {
      alertsApi.error(formatErrorAlert(e, "操作错误: "), 15);
      console.error(e);
    } finally {
      setConfirmLoading(false);
    }
  };

  const handleCancel = () => {
    showModal(null);
  };

  const repos = config?.repos || [];

  return (
    <>
      <Modal
        open={true}
        onCancel={handleCancel}
        title={template ? "更新调度计划" : "添加调度计划"}
        width="60vw"
        footer={[
          <Button loading={confirmLoading} key="back" onClick={handleCancel}>
            取消
          </Button>,
          template != null ? (
            <ConfirmButton
              key="delete"
              type="primary"
              danger
              onClickAsync={handleDestroy}
              confirmTitle="确认删除？"
            >
              删除
            </ConfirmButton>
          ) : null,
          <SpinButton key="submit" type="primary" onClickAsync={handleOk}>
            提交
          </SpinButton>,
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
          以了解如何配置调度计划。
        </p>
        <br />
        <Form
          autoComplete="off"
          form={form}
          labelCol={{ span: 6 }}
          wrapperCol={{ span: 16 }}
          disabled={confirmLoading}
        >
          {/* Plan.id */}
          <Form.Item<Plan>
            hasFeedback
            name="id"
            label="调度计划名称"
            initialValue={template ? template.id : ""}
            validateTrigger={["onChange", "onBlur"]}
            tooltip="后台用于识别该调度计划的唯一标识名称，例如s3-myplan。注意创建后将无法修改。"
            rules={[
              {
                required: true,
                message: "请输入调度计划名称",
              },
              {
                validator: async (_, value) => {
                  if (template) return;
                  if (config?.plans?.find((r) => r.id === value)) {
                    throw new Error("调度计划名称已存在");
                  }
                },
                message: "调度计划名称已存在",
              },
              {
                pattern: namePattern,
                message:
                  "名称中只能包含数字和字母，以及连接符 - 或下划线 _",
              },
            ]}
          >
            <Input
              placeholder={"plan" + ((config?.plans?.length || 0) + 1)}
              disabled={!!template}
            />
          </Form.Item>

          {/* Plan.repo */}
          <Form.Item<Plan>
            name="repo"
            label="储存库"
            validateTrigger={["onChange", "onBlur"]}
            initialValue={template ? template.repo : ""}
            tooltip="Backrest 用于储存快照的储存库地址"
            rules={[
              {
                required: true,
                message: "请选择一个储存库",
              },
            ]}
          >
            <Select
              // defaultValue={repos.length > 0 ? repos[0].id : undefined}
              options={repos.map((repo) => ({
                value: repo.id,
              }))}
              disabled={!!template}
            />
          </Form.Item>

          {/* Plan.paths */}
          <Form.Item
            name="pathsText"
            label="路径"
            required={true}
            tooltip="请输入需要备份的文件路径，每行一个。输入时可使用自动补齐功能。"
            rules={[
              {
                validator: async (_, value) => {
                  if (!value || !value.trim()) {
                    throw new Error("请输入至少一个路径以进行备份");
                  }
                  const paths = value
                    .split("\n")
                    .map((p: string) => p.trim())
                    .filter((p: string) => p.length > 0);
                  if (paths.length === 0) {
                    throw new Error(
                      "请输入至少一个有效的路径以进行备份"
                    );
                  }
                },
              },
            ]}
          >
            <PathsTextArea />
          </Form.Item>

          {/* Plan.excludes */}
          <Form.Item
            label="排除规则"
            required={false}
            tooltip={
              <>
                指定不会备份至储存库数据的排除规则。查看{" "}
                <a
                  href="https://restic.readthedocs.io/en/latest/040_backup.html#excluding-files"
                  target="_blank"
                >
                  restic 文档
                </a>{" "}
                了解更多信息。
              </>
            }
          >
            <Form.List
              name="excludes"
              rules={[]}
              initialValue={template ? template.excludes : []}
            >
              {(fields, { add, remove }, { errors }) => (
                <>
                  {fields.map((field, index) => {
                    const { key, ...restField } = field;
                    return (
                      <Form.Item required={false} key={field.key}>
                        <Form.Item
                          {...restField}
                          validateTrigger={["onChange", "onBlur"]}
                          initialValue={""}
                          rules={[
                            {
                              required: true,
                              message: "请输入排除规则",
                            },
                          ]}
                          noStyle
                        >
                          <URIAutocomplete
                            style={{ width: "90%" }}
                            onBlur={() => form.validateFields()}
                            globAllowed={true}
                          />
                        </Form.Item>
                        <MinusCircleOutlined
                          className="dynamic-delete-button"
                          onClick={() => remove(field.name)}
                          style={{ paddingLeft: "5px" }}
                        />
                      </Form.Item>
                    );
                  })}
                  <Form.Item>
                    <Button
                      type="dashed"
                      onClick={() => add()}
                      style={{ width: "90%" }}
                      icon={<PlusOutlined />}
                    >
                      添加排除规则模式
                    </Button>
                    <Form.ErrorList errors={errors} />
                  </Form.Item>
                </>
              )}
            </Form.List>
          </Form.Item>

          {/* Plan.iexcludes */}
          <Form.Item
            label="排除规则 (不区分大小写)"
            required={false}
            tooltip={
              <>
                指定不会备份至储存库数据的排除规则 (不区分大小写)。查看{" "}
                <a
                  href="https://restic.readthedocs.io/en/latest/040_backup.html#excluding-files"
                  target="_blank"
                >
                  restic 文档
                </a>{" "}
                了解更多信息。
              </>
            }
          >
            <Form.List
              name="iexcludes"
              rules={[]}
              initialValue={template ? template.iexcludes : []}
            >
              {(fields, { add, remove }, { errors }) => (
                <>
                  {fields.map((field, index) => {
                    const { key, ...restField } = field;
                    return (
                      <Form.Item required={false} key={field.key}>
                        <Form.Item
                          {...restField}
                          validateTrigger={["onChange", "onBlur"]}
                          initialValue={""}
                          rules={[
                            {
                              required: true,
                              message: "请输入排除规则",
                            },
                          ]}
                          noStyle
                        >
                          <URIAutocomplete
                            style={{ width: "90%" }}
                            onBlur={() => form.validateFields()}
                            globAllowed={true}
                          />
                        </Form.Item>
                        <MinusCircleOutlined
                          className="dynamic-delete-button"
                          onClick={() => remove(field.name)}
                          style={{ paddingLeft: "5px" }}
                        />
                      </Form.Item>
                    );
                  })}
                  <Form.Item>
                    <Button
                      type="dashed"
                      onClick={() => add()}
                      style={{ width: "90%" }}
                      icon={<PlusOutlined />}
                    >
                      添加排除规则模式 (不区分大小写)
                    </Button>
                    <Form.ErrorList errors={errors} />
                  </Form.Item>
                </>
              )}
            </Form.List>
          </Form.Item>

          {/* Plan.cron */}
          <Form.Item label="备份调度">
            <ScheduleFormItem
              name={["schedule"]}
              defaults={ScheduleDefaultsDaily}
            />
          </Form.Item>

          {/* Plan.backup_flags */}
          <Form.Item
            label={
              <Tooltip title="待添加至 'restic backup' 命令中的额外 flag">
                额外命令 Flag
              </Tooltip>
            }
          >
            <Form.List name="backup_flags">
              {(fields, { add, remove }, { errors }) => (
                <>
                  {fields.map((field, index) => {
                    const { key, ...restField } = field;
                    return (
                      <Form.Item required={false} key={field.key}>
                        <Form.Item
                          {...restField}
                          validateTrigger={["onChange", "onBlur"]}
                          rules={[
                            {
                              required: true,
                              whitespace: true,
                              pattern: /^\-\-?.*$/,
                              message:
                              "输入应当为一个命令行 flag，查看命令 restic backup --help 输出了解可用的 flag",
                            },
                          ]}
                          noStyle
                        >
                          <Input
                            placeholder="--flag"
                            style={{ width: "90%" }}
                          />
                        </Form.Item>
                        <MinusCircleOutlined
                          className="dynamic-delete-button"
                          onClick={() => remove(index)}
                          style={{ paddingLeft: "5px" }}
                        />
                      </Form.Item>
                    );
                  })}
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

          {/* Plan.retention */}
          <RetentionPolicyView />

          {/* Plan.hooks */}
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
                    label: "使用 JSON 预览调度计划配置",
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

const RetentionPolicyView = () => {
  const form = Form.useFormInstance();
  const schedule = Form.useWatch("schedule", { form }) as any;
  const retention = Form.useWatch("retention", { form, preserve: true }) as any;
  // If the first value in the cron expression (minutes) is not just a plain number (e.g. 30), the
  // cron will hit more than once per hour (e.g. "*/15" "1,30" and "*").
  const cronIsSubHourly = useMemo(
    () => schedule?.cron && !/^\d+ /.test(schedule.cron),
    [schedule?.cron]
  );
  // Translates the number of snapshots retained to a retention duration for cron schedules.
  const minRetention = useMemo(() => {
    const keepLastN = retention?.policyTimeBucketed?.keepLastN;
    if (!keepLastN) {
      return null;
    }
    const msPerHour = 60 * 60 * 1000;
    const msPerDay = 24 * msPerHour;
    let duration = 0;
    // Simple calculations for non-cron schedules
    if (schedule?.maxFrequencyHours) {
      duration = schedule.maxFrequencyHours * (keepLastN - 1) * msPerHour;
    } else if (schedule?.maxFrequencyDays) {
      duration = schedule.maxFrequencyDays * (keepLastN - 1) * msPerDay;
    } else if (schedule?.cron && retention.policyTimeBucketed?.keepLastN) {
      duration = getMinimumCronDuration(
        schedule.cron,
        retention.policyTimeBucketed?.keepLastN
      );
    }
    return duration ? formatDuration(duration, { minUnit: "h" }) : null;
  }, [schedule, retention?.policyTimeBucketed?.keepLastN]);

  const determineMode = () => {
    if (!retention) {
      return "policyTimeBucketed";
    } else if (retention.policyKeepLastN) {
      return "policyKeepLastN";
    } else if (retention.policyKeepAll) {
      return "policyKeepAll";
    } else if (retention.policyTimeBucketed) {
      return "policyTimeBucketed";
    }
  };

  const mode = determineMode();

  let elem: React.ReactNode = null;
  if (mode === "policyKeepAll") {
    elem = (
      <>
        <p>
          所有的备份都将会被保留，例如应用于仅追加式备份的方案。
          请确保定时手动对不需要的备份执行忘记(forget)和修剪(prune)操作。
          Backrest 将会在下次执行备份操作时自动记录外部执行的忘记(forget)操作。
        </p>
        <Form.Item
          name={["retention", "policyKeepAll"]}
          valuePropName="checked"
          initialValue={true}
          hidden={true}
        >
          <Checkbox />
        </Form.Item>
      </>
    );
  } else if (mode === "policyKeepLastN") {
    elem = (
      <Form.Item
        name={["retention", "policyKeepLastN"]}
        initialValue={0}
        validateTrigger={["onChange", "onBlur"]}
        rules={[
          {
            required: true,
            message: "请输入至少保留的快照数目",
          },
        ]}
      >
        <InputNumber
          addonBefore={<div style={{ width: "5em" }}>快照数目</div>}
          type="number"
        />
      </Form.Item>
    );
  } else if (mode === "policyTimeBucketed") {
    elem = (
      <>
        <Row>
          <Col span={11}>
            <Form.Item
              name={["retention", "policyTimeBucketed", "yearly"]}
              validateTrigger={["onChange", "onBlur"]}
              initialValue={0}
              required={false}
            >
              <InputNumber
                addonBefore={<div style={{ width: "5em" }}>每年</div>}
                type="number"
              />
            </Form.Item>
            <Form.Item
              name={["retention", "policyTimeBucketed", "monthly"]}
              initialValue={0}
              validateTrigger={["onChange", "onBlur"]}
              required={false}
            >
              <InputNumber
                addonBefore={<div style={{ width: "5em" }}>每月</div>}
                type="number"
              />
            </Form.Item>
            <Form.Item
              name={["retention", "policyTimeBucketed", "weekly"]}
              initialValue={0}
              validateTrigger={["onChange", "onBlur"]}
              required={false}
            >
              <InputNumber
                addonBefore={<div style={{ width: "5em" }}>每周</div>}
                type="number"
              />
            </Form.Item>
          </Col>
          <Col span={11} offset={1}>
            <Form.Item
              name={["retention", "policyTimeBucketed", "daily"]}
              validateTrigger={["onChange", "onBlur"]}
              initialValue={0}
              required={false}
            >
              <InputNumber
                addonBefore={<div style={{ width: "5em" }}>每天</div>}
                type="number"
              />
            </Form.Item>
            <Form.Item
              name={["retention", "policyTimeBucketed", "hourly"]}
              validateTrigger={["onChange", "onBlur"]}
              initialValue={0}
              required={false}
            >
              <InputNumber
                addonBefore={<div style={{ width: "5em" }}>每小时</div>}
                type="number"
              />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item
          name={["retention", "policyTimeBucketed", "keepLastN"]}
          label="无视时间要求保留的快照数目"
          validateTrigger={["onChange", "onBlur"]}
          initialValue={0}
          required={cronIsSubHourly}
          rules={[
            {
              validator: async (_, value) => {
                if (cronIsSubHourly && !(value > 1)) {
                  throw new Error("请输入大于 1 的数字");
                }
              },
              message:
                "该调度计划每小时将运行多次，请指定在执行保留策略之前需要保留多少个快照。",
            },
          ]}
        >
          <InputNumber
            type="number"
            min={0}
            addonAfter={
              <Tooltip
                title={
                  minRetention
                    ? `最近至少 ${minRetention} 中将保留 ${retention?.policyTimeBucketed?.keepLastN}  个快照，
                但由于手动操作或者设备离线，可能会发生变化。`
                    : "选择待保留的快照数目，然后继续悬浮以查看预计覆盖的持续时间。"
                }
              >
                <CalculatorOutlined
                  style={{
                    padding: ".5em",
                    margin: "0 -.5em",
                  }}
                />
              </Tooltip>
            }
          />
        </Form.Item>
      </>
    );
  }

  return (
    <>
      <Form.Item label="保留策略">
        <Row>
          <Radio.Group
            value={mode}
            onChange={(e) => {
              const selected = e.target.value;
              if (selected === "policyKeepLastN") {
                form.setFieldValue("retention", { policyKeepLastN: 30 });
              } else if (selected === "policyTimeBucketed") {
                form.setFieldValue("retention", {
                  policyTimeBucketed: {
                    yearly: 0,
                    monthly: 3,
                    weekly: 4,
                    daily: 7,
                    hourly: 24,
                  },
                });
              } else {
                form.setFieldValue("retention", { policyKeepAll: true });
              }
            }}
          >
            <Radio.Button value={"policyKeepLastN"}>
              <Tooltip title="Restic 将保留最后N个快照。保留策略用于在每次备份操作结束后删除较旧的快照。">
                数量
              </Tooltip>
            </Radio.Button>
            <Radio.Button value={"policyTimeBucketed"}>
              <Tooltip title="Restic 将保留每个时间段的最后N个快照。保留策略用于在每次备份操作结束后删除较旧的快照。">
                时间间隔
              </Tooltip>
            </Radio.Button>
            <Radio.Button value={"policyKeepAll"}>
              <Tooltip title="所有的快照都将会被保留。注意，非常大的储存库可能会导致过慢的备份操作。">
                无
              </Tooltip>
            </Radio.Button>
          </Radio.Group>
        </Row>
        <br />
        <Row>
          <Form.Item>{elem}</Form.Item>
        </Row>
      </Form.Item>
    </>
  );
};
