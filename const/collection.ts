/**
 * 成员信息收集表：表单字段固定，供社团注册/年审等场景按轮次收集。
 * 类别是唯一必须严格限定的单选字段；政治面貌按说明保留「等」的扩展空间，
 * 前端给常用选项，服务端只校验长度与非空。
 */
export const COLLECTION_CATEGORIES = [
  "社长",
  "副社长",
  "部长",
  "副部长",
  "其他管理层",
  "注册社员",
  "其他",
] as const;

export type CollectionCategory = (typeof COLLECTION_CATEGORIES)[number];

export const COLLECTION_POLITICAL_STATUSES = [
  "中共党员",
  "中共预备党员",
  "共青团员",
  "群众",
  "其他",
  "民革会员",
  "民盟盟员",
  "民建会员",
  "民进会员",
  "农工党党员",
  "致公党党员",
  "九三学社社员",
  "台盟盟员",
  "无党派人士",
] as const;

export const COLLECTION_DEFAULT_TITLE = "社团成员信息收集表";

/** 社团名称固定，不再由填写人输入（除非后续做成可配置的组织名） */
export const COLLECTION_CLUB_NAME = "南京邮电大学大学生科学技术协会";

export const COLLECTION_DEFAULT_INSTRUCTIONS = `填表说明：
1.社团名称固定为“南京邮电大学大学生科学技术协会”；
2.类别主要分为：社长、副社长、部长、副部长、其他管理层、注册社员、其他 7 个类型，不得填写 7 个类型之外的内容；
3.出生年月请选择年份与月份；
4.政治面貌主要包含“中共党员、中共预备党员、共青团员、群众、其他、民革会员、民盟盟员、民建会员、民进会员、农工党党员、致公党党员、九三学社社员、台盟盟员、无党派人士”等；
5.学院请务必填写学院全称。`;

export const COLLECTION_FORM_STATUSES = ["open", "closed"] as const;

export type CollectionFormStatus = (typeof COLLECTION_FORM_STATUSES)[number];

/**
 * 填写身份限制：发起时直接勾选允许填写的身份；空数组 = 不限制。
 * 0 新同学 / 1 部员 / 2 讲师 / 3 部长 / 4 管理员（与 People 角色阶梯一致）。
 */
export const COLLECTION_FILL_ROLE_OPTIONS = [
  { value: 0, label: "新同学" },
  { value: 1, label: "部员" },
  { value: 2, label: "讲师" },
  { value: 3, label: "部长" },
  { value: 4, label: "管理员" },
] as const;

export const collectionFillRoleLabel = (allowedRoles: number[]): string =>
  allowedRoles.length === 0
    ? "不限制身份"
    : allowedRoles
        .map(
          (role) =>
            COLLECTION_FILL_ROLE_OPTIONS.find((option) => option.value === role)
              ?.label ?? `角色 ${role}`,
        )
        .join("、");

/** 自定义收集项的类型 */
export const COLLECTION_EXTRA_FIELD_TYPES = [
  "text",
  "textarea",
  "number",
  "select",
  "radio",
  "checkbox",
  "date",
  "datetime",
  "time",
  "email",
  "url",
  "phone",
  "rating",
] as const;

export type CollectionExtraFieldType =
  (typeof COLLECTION_EXTRA_FIELD_TYPES)[number];

export const COLLECTION_EXTRA_FIELD_TYPE_LABELS: Record<
  CollectionExtraFieldType,
  string
> = {
  text: "单行文本",
  textarea: "多行文本",
  number: "数字",
  select: "下拉单选",
  radio: "单选按钮",
  checkbox: "多选",
  date: "日期",
  datetime: "日期时间",
  time: "时间",
  email: "邮箱",
  url: "链接",
  phone: "手机号",
  rating: "评分（1-5 星）",
};

/** 需要维护选项的字段类型 */
export const COLLECTION_OPTION_FIELD_TYPES: Record<
  CollectionExtraFieldType,
  boolean
> = {
  text: false,
  textarea: false,
  number: false,
  select: true,
  radio: true,
  checkbox: true,
  date: false,
  datetime: false,
  time: false,
  email: false,
  url: false,
  phone: false,
  rating: false,
};

/** 可以从 SAST Link 文本资料自动带入的字段类型 */
export const COLLECTION_PREFILLABLE_FIELD_TYPES: Record<
  CollectionExtraFieldType,
  boolean
> = {
  text: true,
  textarea: true,
  number: false,
  select: true,
  radio: true,
  checkbox: false,
  date: false,
  datetime: false,
  time: false,
  email: true,
  url: false,
  phone: false,
  rating: false,
};

export const COLLECTION_RATING_MAX = 5;

export type CollectionAnswer = string | string[];

export type CollectionExtraAnswers = Record<string, CollectionAnswer>;

export type CollectionFlowOption = {
  id: number;
  label: string;
};

export const collectionFlowScopeLabel = (
  allowedFlowIds: number[],
  flows: CollectionFlowOption[],
): string => {
  if (allowedFlowIds.length === 0) return "不限流程";
  return allowedFlowIds
    .map(
      (flowId) =>
        flows.find((flow) => flow.id === flowId)?.label ?? `流程 #${flowId}`,
    )
    .join("、");
};

export const formatCollectionAnswer = (value: CollectionAnswer | undefined) =>
  Array.isArray(value) ? value.join("、") : (value ?? "");

/**
 * 从 SAST Link 自动带入的字段来源。只允许个人资料里稳定存在的字段，
 * 避免把 Link 的内部标识或敏感字段暴露到收集表。
 */
export const COLLECTION_LINK_PREFILL_SOURCES = [
  "name",
  "studentId",
  "college",
  "major",
  "email",
  "qq",
] as const;

export type CollectionLinkPrefillSource =
  (typeof COLLECTION_LINK_PREFILL_SOURCES)[number];

export type CollectionLinkProfile = Record<CollectionLinkPrefillSource, string>;

export type CollectionExtraField = {
  id: string;
  label: string;
  type: CollectionExtraFieldType;
  required: boolean;
  options: string[];
  /** 填写提示，显示在字段名下方 */
  description?: string;
  prefillFrom?: CollectionLinkPrefillSource;
};