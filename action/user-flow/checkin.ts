"use server";

import { db } from "@/db/drizzle";
import { flow, interviewCheckin, interviewStation, userFlow } from "@/db/schema";
import { verifyRole } from "@/lib/dal";
import { isOfficeDepartmentKey } from "@/lib/authz";
import { MANAGER_ROLE } from "@/lib/link/role";
import { writeOperationAudit } from "@/lib/operation-audit";
import { logServerError } from "@/lib/server-error-log";
import { listPeopleUsersByLinkIds } from "@/lib/link/user-lookup";
import {
  departmentLabel,
  departmentQueuePrefix,
  isDepartmentEnabled,
} from "@/const/department";
import { isOfficeInterviewFlow, OFFICE_INTERVIEW_FLOW_TYPE } from "@/const/flow";
import {
  canTransitionCheckin,
  countCheckinQueue,
  formatQueueNo,
  MAX_QUEUE_SKIPS,
  QUEUE_SKIP_BACKOFF,
  type CheckinBlock,
  type CheckinQueueCounts,
  type InterviewCheckinStatusKey,
} from "@/lib/interview-checkin";
import { and, asc, desc, eq, inArray, isNull, lte, notInArray, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

/**
 * 办公类部门面试现场签到与叫号（全场共用）。
 *
 * 场地模型：多个办公部门同一个大面试间，共用一个签到台与一块大屏；每个部门可配置
 * 多个「面试位」（部长各自一对一面试）。签到叫号页与大屏页都不按部门切分——
 * 任一办公部门的部长进来都能看到全部部门的面试位与队列。
 *
 * 队伍：按 (流程, 轮次) 隔离，叫号号段按部门（办公室 B / 科宣部 K / 外联部 W / 赛事部 S）；
 * 所有写入路径（签到、叫号、过号重排）都拿同一把「场地 + 轮次」粒度的 advisory xact 锁串行化，
 * 避免并发重号、同一面试位被重复占位、以及同一个人被两个部门同时叫号。
 *
 * 一人同时有一/二志愿（两条部门报名）时：两条各自独立排队、各自叫号；
 * 但同一时刻只能在一个部门被叫/面试——叫号会跳过「正在其他部门面试」的候选人，
 * 手动叫号若撞上则直接拒绝。
 *
 * 权限：管理员，或归属部门为办公部门（办公室/科宣部/外联部/赛事部）的部长。
 */

const CHECKIN_CONSOLE_PATH = "/dashboard/checkin";
const CHECKIN_BOARD_PATH = "/checkin/board";

/**
 * 场地级 advisory 锁命名空间（`0x4f46464b`，与仓库其它单参数 advisory 锁的 key 空间不重叠）。
 * 签到分号、自动叫号、手动叫号、过号重排都拿 `(本命名空间, 轮次)`：同一轮次里这些写入彼此串行，
 * 于是不会出现「并发分配到同一个号」「同一个面试位被两人同时占」「同一个人被两个部门同时叫号」。
 * 现场量级（每分钟几次写入、每次几毫秒）远低于锁的争用阈值。
 */
const VENUE_ADVISORY_LOCK = 0x4f46464b;

/** 取「场地 + 轮次」的 advisory xact 锁（必须在事务里调用，事务结束自动释放）。 */
const lockVenue = (
  executor: Executor,
  round: number,
): Promise<unknown> =>
  executor.execute(
    sql`select pg_advisory_xact_lock(${VENUE_ADVISORY_LOCK}, ${round})`,
  );

/** 已产生结论的报名状态：这些候选人不再等待面试，也就不能再签到。 */
const TERMINAL_PROGRESS_STATUSES = ["passed", "failed", "withdrawn"] as const;

/** 占用面试位的状态：这两个状态下候选人正被某个部门占着。 */
const BUSY_STATUSES = ["called", "interviewing"] as const;

const isActiveProgress = (status: string | null): boolean =>
  status === null ||
  !(TERMINAL_PROGRESS_STATUSES as readonly string[]).includes(status);

export type StationOccupant = {
  checkinId: number;
  userFlowId: number;
  uid: number;
  name: string;
  queueNo: string;
  status: InterviewCheckinStatusKey;
  round: number;
  calledAt: string | null;
};

export type CheckinStation = {
  id: number;
  flowId: number;
  departmentLabel: string;
  label: string;
  interviewerUid: number | null;
  interviewerName: string | null;
  sortOrder: number;
  status: string;
  occupant: StationOccupant | null;
};

/** 排队中被挡住的原因（类型定义在 lib，界面与控制台共用同一套文案）。 */
export type { CheckinBlock } from "@/lib/interview-checkin";

export type CheckinEntry = {
  id: number;
  flowId: number;
  userFlowId: number;
  uid: number;
  name: string;
  studentId: string | null;
  interviewSlot: string | null;
  /** 志愿类型：1=第一志愿、2=第二志愿（办公类）；其他为空 */
  choice: number | null;
  round: number;
  queueNo: string;
  queueSeq: number;
  status: InterviewCheckinStatusKey;
  method: string;
  room: string | null;
  stationId: number | null;
  stationLabel: string | null;
  /** 非空表示此刻不能叫（叫号会跳过） */
  block: CheckinBlock | null;
  /** 该同学本轮还报了哪些办公部门（用于提示「他还要面 X」） */
  otherDepartments: string[];
  checkedInAt: string;
  calledAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  callCount: number;
  /** 过号次数：>1 之后不再自动叫号 */
  skipCount: number;
  note: string | null;
};

export type AwaitingCandidate = {
  userFlowId: number;
  uid: number;
  name: string;
  studentId: string | null;
  interviewSlot: string | null;
  choice: number | null;
  round: number;
  /** 该同学本轮还报了哪些办公部门 */
  otherDepartments: string[];
};

export type VenueDepartmentSnapshot = {
  flowId: number;
  title: string;
  department: string | null;
  departmentLabel: string;
  stations: CheckinStation[];
  /** 本轮全部签到记录（含已完成/已取消，用于留档展示） */
  entries: CheckinEntry[];
  /** 本轮已报名但尚未在本部门签到的候选人 */
  awaiting: AwaitingCandidate[];
  counts: CheckinQueueCounts;
};

export type VenueSnapshot = {
  round: number;
  departments: VenueDepartmentSnapshot[];
  updatedAt: string;
};

export type CheckinResult =
  | { success: true; entry: CheckinEntry }
  | { success: false; error: { message: string } };

export type StationResult =
  | { success: true; station: CheckinStation }
  | { success: false; error: { message: string } };

/** 扫码命中的一条报名：同一同学可能有第一/第二志愿两条。 */
export type CheckinCandidateMatch = {
  flowId: number;
  departmentLabel: string;
  choice: number | null;
  /** 已在本部门签到则带回现状 */
  existing: CheckinEntry | null;
  /** 未签到且报名仍在进行 → 可签到 */
  candidate: AwaitingCandidate | null;
  /** 该同学此刻是否不能叫（正在别部门面试 / 第一志愿未面完） */
  block: CheckinBlock | null;
};

export type CheckinCandidateLookup = {
  uid: number;
  matches: CheckinCandidateMatch[];
};

export type CheckinMethod = "staff_scan" | "manual";

/** 签到叫号的操作用户（审计需要的最小字段）。 */
export type VenueActor = {
  uid: number;
  role: number;
  realRole: number;
};

type OfficeFlowContext = {
  id: number;
  title: string;
  type: string | null;
  department: string | null;
};

/**
 * 签到叫号的入口鉴权：**所有部长**（role ≥ 3）都能进。
 * 签到叫号是多个办公部门共用的场地资源，刻意不按部门收敛数据。
 */
const verifyVenueAccess = async (): Promise<VenueActor> => {
  const session = await verifyRole(MANAGER_ROLE);
  return { uid: session.uid, role: session.role, realRole: session.realRole };
};

/** 载入办公类流程（全场口径，不校验归属部门）。 */
const loadOfficeFlowForVenue = async (
  flowId: number,
): Promise<
  | { kind: "ok"; actor: VenueActor; flow: OfficeFlowContext }
  | { kind: "forbidden"; message: string }
  | { kind: "missing" }
> => {
  const actor = await verifyVenueAccess();
  const [record] = await db
    .select({
      id: flow.id,
      title: flow.title,
      type: flow.type,
      department: flow.department,
    })
    .from(flow)
    .where(and(eq(flow.id, flowId), eq(flow.isDeleted, false)))
    .limit(1);

  if (!record) return { kind: "missing" };
  if (!isOfficeInterviewFlow(record.type ?? "")) {
    return { kind: "forbidden", message: "签到叫号仅用于办公类部门面试" };
  }
  /* 面试位/签到只服务办公部门（办公室/科宣部/外联部/赛事部） */
  if (!isOfficeDepartmentKey(record.department)) {
    return { kind: "forbidden", message: "该部门不属于办公部门，不能使用签到叫号" };
  }
  return { kind: "ok", actor, flow: record };
};

const normalizeRound = (round: number): number => (round === 2 ? 2 : 1);

const toIso = (value: Date | null): string | null =>
  value ? value.toISOString() : null;

/* ---------------------------------------------------------------- 读取 */

type RawEntryRow = {
  id: number;
  flowId: number;
  userFlowId: number;
  uid: number;
  round: number;
  queueNo: string;
  queueSeq: number;
  status: string;
  method: string;
  room: string | null;
  stationId: number | null;
  stationLabel: string | null;
  choice: number | null;
  checkedInAt: Date;
  calledAt: Date | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  callCount: number;
  skipCount: number;
  note: string | null;
  interviewSlot: string | null;
};

const entrySelection = {
  id: interviewCheckin.id,
  flowId: interviewCheckin.fkFlowId,
  userFlowId: interviewCheckin.fkUserFlowId,
  uid: userFlow.fkUserId,
  round: interviewCheckin.round,
  queueNo: interviewCheckin.queueNo,
  queueSeq: interviewCheckin.queueSeq,
  status: interviewCheckin.status,
  method: interviewCheckin.method,
  room: interviewCheckin.room,
  stationId: interviewCheckin.fkStationId,
  stationLabel: interviewStation.label,
  choice: userFlow.choice,
  checkedInAt: interviewCheckin.checkedInAt,
  calledAt: interviewCheckin.calledAt,
  startedAt: interviewCheckin.startedAt,
  finishedAt: interviewCheckin.finishedAt,
  callCount: interviewCheckin.callCount,
  skipCount: interviewCheckin.skipCount,
  note: interviewCheckin.note,
  interviewSlot: userFlow.interviewSlot,
};

const checkinQuery = () =>
  db
    .select(entrySelection)
    .from(interviewCheckin)
    .innerJoin(userFlow, eq(interviewCheckin.fkUserFlowId, userFlow.id))
    .leftJoin(interviewStation, eq(interviewCheckin.fkStationId, interviewStation.id));

const mapEntriesWithUsers = async (
  rows: RawEntryRow[],
): Promise<CheckinEntry[]> => {
  if (rows.length === 0) return [];
  const userMap = await listPeopleUsersByLinkIds(rows.map((row) => row.uid));
  return rows.map((row) => {
    const user = userMap.get(row.uid);
    return {
      id: row.id,
      flowId: row.flowId,
      userFlowId: row.userFlowId,
      uid: row.uid,
      name: user?.name ?? "未知用户",
      studentId: user?.studentId ?? null,
      interviewSlot: row.interviewSlot,
      choice: row.choice,
      round: row.round,
      queueNo: row.queueNo,
      queueSeq: row.queueSeq,
      status: row.status as InterviewCheckinStatusKey,
      method: row.method,
      room: row.room,
      stationId: row.stationId,
      stationLabel: row.stationLabel,
      block: null,
      otherDepartments: [],
      checkedInAt: row.checkedInAt.toISOString(),
      calledAt: toIso(row.calledAt),
      startedAt: toIso(row.startedAt),
      finishedAt: toIso(row.finishedAt),
      callCount: row.callCount,
      skipCount: row.skipCount,
      note: row.note,
    };
  });
};

const loadRawEntries = async (checkinIds: number[]): Promise<RawEntryRow[]> => {
  if (checkinIds.length === 0) return [];
  return checkinQuery().where(inArray(interviewCheckin.id, checkinIds));
};

/** 本轮仍可签到的候选人：报名仍在进行、且尚未产生签到记录。 */
const loadAwaitingCandidates = async (
  flowId: number,
  round: number,
): Promise<AwaitingCandidate[]> => {
  const registered = await db
    .select({
      userFlowId: userFlow.id,
      uid: userFlow.fkUserId,
      interviewSlot: userFlow.interviewSlot,
      choice: userFlow.choice,
    })
    .from(userFlow)
    .where(
      and(
        eq(userFlow.fkFlowId, flowId),
        eq(sql`coalesce(${userFlow.round}, 1)`, round),
        or(
          isNull(userFlow.progressStatus),
          notInArray(userFlow.progressStatus, [...TERMINAL_PROGRESS_STATUSES]),
        ),
      ),
    )
    .orderBy(asc(userFlow.interviewSlot), asc(userFlow.id));

  const checkedRows = await db
    .select({ userFlowId: interviewCheckin.fkUserFlowId })
    .from(interviewCheckin)
    .where(
      and(
        eq(interviewCheckin.fkFlowId, flowId),
        eq(interviewCheckin.round, round),
      ),
    );
  const checkedIds = new Set(checkedRows.map((row) => row.userFlowId));

  const awaiting = registered.filter((row) => !checkedIds.has(row.userFlowId));
  const userMap = await listPeopleUsersByLinkIds(awaiting.map((row) => row.uid));

  return awaiting.map((row) => ({
    userFlowId: row.userFlowId,
    uid: row.uid,
    name: userMap.get(row.uid)?.name ?? "未知用户",
    studentId: userMap.get(row.uid)?.studentId ?? null,
    interviewSlot: row.interviewSlot,
    choice: row.choice,
    round,
    otherDepartments: [],
  }));
};

const loadStations = async (flowIds: number[]): Promise<CheckinStation[]> => {
  if (flowIds.length === 0) return [];
  const stationRows = await db
    .select()
    .from(interviewStation)
    .where(inArray(interviewStation.fkFlowId, flowIds))
    .orderBy(
      asc(interviewStation.fkFlowId),
      asc(interviewStation.sortOrder),
      asc(interviewStation.id),
    );

  const stationIds = stationRows.map((row) => row.id);
  const occupantRows = stationIds.length
    ? await db
        .select({
          checkinId: interviewCheckin.id,
          userFlowId: interviewCheckin.fkUserFlowId,
          stationId: interviewCheckin.fkStationId,
          uid: userFlow.fkUserId,
          queueNo: interviewCheckin.queueNo,
          status: interviewCheckin.status,
          round: interviewCheckin.round,
          calledAt: interviewCheckin.calledAt,
        })
        .from(interviewCheckin)
        .innerJoin(userFlow, eq(interviewCheckin.fkUserFlowId, userFlow.id))
        .where(
          and(
            inArray(interviewCheckin.fkStationId, stationIds),
            inArray(interviewCheckin.status, [...BUSY_STATUSES]),
          ),
        )
    : [];

  const users = await listPeopleUsersByLinkIds([
    ...stationRows
      .map((row) => row.fkInterviewerId)
      .filter((id): id is number => id !== null),
    ...occupantRows.map((row) => row.uid),
  ]);

  const occupantByStation = new Map<number, StationOccupant>();
  for (const row of occupantRows) {
    if (row.stationId === null) continue;
    occupantByStation.set(row.stationId, {
      checkinId: row.checkinId,
      userFlowId: row.userFlowId,
      uid: row.uid,
      name: users.get(row.uid)?.name ?? "未知用户",
      queueNo: row.queueNo,
      status: row.status as InterviewCheckinStatusKey,
      round: row.round,
      calledAt: toIso(row.calledAt),
    });
  }

  const flowDepartment = new Map<number, string>();
  const flowRows = await db
    .select({ id: flow.id, department: flow.department })
    .from(flow)
    .where(inArray(flow.id, flowIds));
  for (const row of flowRows) {
    flowDepartment.set(row.id, departmentLabel(row.department));
  }

  return stationRows.map((row) => ({
    id: row.id,
    flowId: row.fkFlowId,
    departmentLabel: flowDepartment.get(row.fkFlowId) ?? "",
    label: row.label,
    interviewerUid: row.fkInterviewerId,
    interviewerName:
      row.fkInterviewerId !== null
        ? users.get(row.fkInterviewerId)?.name ?? null
        : null,
    sortOrder: row.sortOrder,
    status: row.status,
    occupant: occupantByStation.get(row.id) ?? null,
  }));
};

/* ---------------------------------------------------------------- 快照 */

/** 全场快照：全部启用的办公部门（签到叫号页与大屏共用同一份数据）。 */
export const getVenueSnapshot = async (
  roundInput: number,
): Promise<VenueSnapshot> => {
  const round = normalizeRound(roundInput);
  await verifyVenueAccess();

  const flowRows = await db
    .select({
      id: flow.id,
      title: flow.title,
      department: flow.department,
    })
    .from(flow)
    .where(
      and(
        eq(flow.type, OFFICE_INTERVIEW_FLOW_TYPE),
        eq(flow.isDeleted, false),
      ),
    )
    .orderBy(asc(flow.department), desc(flow.id));

  const flows = flowRows.filter(
    (row) =>
      isDepartmentEnabled(row.department) && isOfficeDepartmentKey(row.department),
  );
  const updatedAt = new Date().toISOString();
  if (flows.length === 0) {
    return { round, departments: [], updatedAt };
  }

  const flowIds = flows.map((row) => row.id);
  const [entryRows, blockers, stations, awaitingByFlow] = await Promise.all([
    checkinQuery()
      .where(
        and(
          inArray(interviewCheckin.fkFlowId, flowIds),
          eq(interviewCheckin.round, round),
        ),
      )
      .orderBy(asc(interviewCheckin.queueSeq)),
    loadVenueBlockers(db),
    loadStations(flowIds),
    Promise.all(flows.map((row) => loadAwaitingCandidates(row.id, round))),
  ]);

  const entries = await mapEntriesWithUsers(entryRows);

  const departmentOfFlow = new Map(
    flows.map((row) => [row.id, departmentLabel(row.department)]),
  );
  const volunteerDepartmentsByUid = new Map<number, Set<string>>(
    [...blockers.departmentsByUid].map(([uid, set]) => [uid, new Set(set)]),
  );
  const trackVolunteer = (uid: number, label: string) => {
    if (!label) return;
    const set = volunteerDepartmentsByUid.get(uid) ?? new Set<string>();
    set.add(label);
    volunteerDepartmentsByUid.set(uid, set);
  };

  awaitingByFlow.forEach((list, index) => {
    const label = departmentOfFlow.get(flows[index].id) ?? "";
    for (const candidate of list) trackVolunteer(candidate.uid, label);
  });

  const departments = flows.map((flowRow, index) => {
    const ownLabel = departmentOfFlow.get(flowRow.id) ?? "";
    const decorate = <T extends { uid: number; choice: number | null }>(row: T) => ({
      otherDepartments: [...(volunteerDepartmentsByUid.get(row.uid) ?? [])].filter(
        (label) => label && label !== ownLabel,
      ),
    });

    const flowEntries = entries
      .filter((entry) => entry.flowId === flowRow.id)
      .map((entry) => ({
        ...entry,
        ...decorate(entry),
        block: buildCheckinBlock(entry, blockers),
      }));
    const awaiting = (awaitingByFlow[index] ?? []).map((candidate) => ({
      ...candidate,
      ...decorate(candidate),
    }));

    return {
      flowId: flowRow.id,
      title: flowRow.title,
      department: flowRow.department,
      departmentLabel: ownLabel,
      stations: stations.filter((station) => station.flowId === flowRow.id),
      entries: flowEntries,
      awaiting,
      counts: countCheckinQueue(flowEntries),
    };
  });

  return { round, departments, updatedAt };
};

/** 只有等待中的候选人才会被挡住；已在面试/已结束的不标注。 */
const buildCheckinBlock = (
  entry: { uid: number; choice: number | null; status: InterviewCheckinStatusKey },
  blockers: VenueBlockers,
): CheckinBlock | null =>
  entry.status === "waiting" || entry.status === "skipped"
    ? resolveBlock(entry.uid, entry.choice, blockers)
    : null;

type Executor =
  | typeof db
  | Parameters<Parameters<typeof db.transaction>[0]>[0];

export type VenueBlockers = {
  /** uid → 正在被叫/面试的部门名 */
  busyByUid: Map<number, string>;
  /** uid → 第一志愿尚未面完的部门名（第二志愿要等它） */
  firstChoicePendingByUid: Map<number, string>;
  /** uid → 该同学有签到记录的办公部门名（用于提示「他还要面 X」） */
  departmentsByUid: Map<number, Set<string>>;
};

/** 正在别部门面试（硬性：同一时刻只能在一个部门，叫号必须跳过）。 */
const busyElsewhere = (
  uid: number,
  blockers: VenueBlockers,
): string | null => blockers.busyByUid.get(uid) ?? null;

/** 第二志愿的第一志愿尚未面完（软性：只影响排序优先，不硬挡）。 */
const pendingFirstChoice = (
  uid: number,
  choice: number | null,
  blockers: VenueBlockers,
): string | null =>
  choice === 2 ? blockers.firstChoicePendingByUid.get(uid) ?? null : null;

/** 展示用：把两种「此刻不叫他」的原因合并成一条提示。 */
const resolveBlock = (
  uid: number,
  choice: number | null,
  blockers: VenueBlockers,
): CheckinBlock | null => {
  const busy = busyElsewhere(uid, blockers);
  if (busy) return { reason: "busy", departmentLabel: busy };

  const first = pendingFirstChoice(uid, choice, blockers);
  return first ? { reason: "await_first_choice", departmentLabel: first } : null;
};

/** 全场（所有办公部门、所有轮次）的阻塞集合。 */
const loadVenueBlockers = async (executor: Executor): Promise<VenueBlockers> => {
  const busyByUid = new Map<number, string>();
  const firstChoicePendingByUid = new Map<number, string>();
  const departmentsByUid = new Map<number, Set<string>>();

  const flowRows = await executor
    .select({ id: flow.id, department: flow.department })
    .from(flow)
    .where(
      and(eq(flow.type, OFFICE_INTERVIEW_FLOW_TYPE), eq(flow.isDeleted, false)),
    );
  const officeFlows = flowRows.filter(
    (row) =>
      isDepartmentEnabled(row.department) && isOfficeDepartmentKey(row.department),
  );
  if (officeFlows.length === 0) {
    return { busyByUid, firstChoicePendingByUid, departmentsByUid };
  }

  const labelOf = new Map(
    officeFlows.map((row) => [row.id, departmentLabel(row.department)]),
  );
  const rows = await executor
    .select({
      uid: userFlow.fkUserId,
      choice: userFlow.choice,
      status: interviewCheckin.status,
      flowId: interviewCheckin.fkFlowId,
    })
    .from(interviewCheckin)
    .innerJoin(userFlow, eq(interviewCheckin.fkUserFlowId, userFlow.id))
    .where(
      inArray(
        interviewCheckin.fkFlowId,
        officeFlows.map((row) => row.id),
      ),
    );

  for (const row of rows) {
    const label = labelOf.get(row.flowId) ?? "";
    if (row.status === "called" || row.status === "interviewing") {
      busyByUid.set(row.uid, label);
    }
    if (row.choice === 1 && row.status !== "done" && row.status !== "cancelled") {
      firstChoicePendingByUid.set(row.uid, label);
    }
    if (label) {
      const set = departmentsByUid.get(row.uid) ?? new Set<string>();
      set.add(label);
      departmentsByUid.set(row.uid, set);
    }
  }
  return { busyByUid, firstChoicePendingByUid, departmentsByUid };
};

/* ---------------------------------------------------------------- 扫码命中 */

/**
 * 用 uid 在全场命中候选人的报名（可能两条：第一/第二志愿）。
 * 每条带部门、志愿、是否已签到、此刻是否在别部门面试。
 */
export const resolveCheckinCandidates = async (
  roundInput: number,
  uid: number,
): Promise<CheckinCandidateLookup> => {
  const round = normalizeRound(roundInput);
  await verifyVenueAccess();

  const rows = await db
    .select({
      flowId: userFlow.fkFlowId,
      department: flow.department,
      userFlowId: userFlow.id,
      choice: userFlow.choice,
      round: sql<number>`coalesce(${userFlow.round}, 1)`,
      interviewSlot: userFlow.interviewSlot,
      progressStatus: userFlow.progressStatus,
    })
    .from(userFlow)
    .innerJoin(flow, eq(userFlow.fkFlowId, flow.id))
    .where(
      and(
        eq(userFlow.fkUserId, uid),
        eq(flow.type, OFFICE_INTERVIEW_FLOW_TYPE),
        eq(flow.isDeleted, false),
        eq(sql`coalesce(${userFlow.round}, 1)`, round),
      ),
    );

  const active = rows.filter(
    (row) =>
      isDepartmentEnabled(row.department) &&
      isOfficeDepartmentKey(row.department) &&
      isActiveProgress(row.progressStatus),
  );
  if (active.length === 0) return { uid, matches: [] };

  const flowIds = active.map((row) => row.flowId);
  const [existingEntries, blockers, userMap] = await Promise.all([
    checkinQuery().where(
      and(
        inArray(interviewCheckin.fkFlowId, flowIds),
        eq(interviewCheckin.round, round),
        inArray(interviewCheckin.fkUserFlowId, active.map((row) => row.userFlowId)),
      ),
    ),
    loadVenueBlockers(db),
    listPeopleUsersByLinkIds([uid]),
  ]);

  const existing = await mapEntriesWithUsers(existingEntries as RawEntryRow[]);
  const user = userMap.get(uid);
  const otherDepartments = active.map((row) => departmentLabel(row.department));

  return {
    uid,
    matches: active.map((row) => ({
      flowId: row.flowId,
      departmentLabel: departmentLabel(row.department),
      choice: row.choice,
      existing: existing.find((entry) => entry.userFlowId === row.userFlowId) ?? null,
      candidate: existing.some((entry) => entry.userFlowId === row.userFlowId)
        ? null
        : {
            userFlowId: row.userFlowId,
            uid,
            name: user?.name ?? "未知用户",
            studentId: user?.studentId ?? null,
            interviewSlot: row.interviewSlot,
            choice: row.choice,
            round,
            otherDepartments: otherDepartments.filter(
              (label) => label !== departmentLabel(row.department),
            ),
          },
      block: resolveBlock(uid, row.choice, blockers),
    })),
  };
};

/* ---------------------------------------------------------------- 签到 */

/** 签到：分配叫号序号并落库；已签到则幂等返回现有记录。 */
export const checkInCandidate = async (
  flowId: number,
  roundInput: number,
  userFlowId: number,
  method: CheckinMethod,
): Promise<CheckinResult> => {
  let actorId: number | null = null;
  const round = normalizeRound(roundInput);

  try {
    const context = await loadOfficeFlowForVenue(flowId);
    if (context.kind === "missing") {
      return { success: false, error: { message: "流程不存在" } };
    }
    if (context.kind === "forbidden") {
      return { success: false, error: { message: context.message } };
    }
    const { actor } = context;
    actorId = actor.uid;

    if (method !== "staff_scan" && method !== "manual") {
      return { success: false, error: { message: "签到方式无效" } };
    }

    const outcome = await db.transaction(async (tx) => {
      /* 场地粒度锁：同一轮的签到分号串行，保证序号不重号（与叫号/过号重排同一把锁） */
      await lockVenue(tx, round);

      const [existing] = await tx
        .select({ id: interviewCheckin.id, uid: userFlow.fkUserId })
        .from(interviewCheckin)
        .innerJoin(userFlow, eq(interviewCheckin.fkUserFlowId, userFlow.id))
        .where(
          and(
            eq(interviewCheckin.fkUserFlowId, userFlowId),
            eq(interviewCheckin.round, round),
          ),
        )
        .limit(1);

      if (existing) {
        return { kind: "existing" as const, checkinId: existing.id };
      }

      const [candidate] = await tx
        .select({
          uid: userFlow.fkUserId,
          progressStatus: userFlow.progressStatus,
          round: sql<number>`coalesce(${userFlow.round}, 1)`,
        })
        .from(userFlow)
        .where(and(eq(userFlow.id, userFlowId), eq(userFlow.fkFlowId, flowId)))
        .limit(1);

      if (!candidate) {
        return { kind: "error" as const, message: "报名记录不存在" };
      }
      if (Number(candidate.round) !== round) {
        return {
          kind: "error" as const,
          message: `该候选人当前在${Number(candidate.round) === 2 ? "二" : "一"}面，不能在这里签到`,
        };
      }
      if (!isActiveProgress(candidate.progressStatus)) {
        return { kind: "error" as const, message: "该候选人的报名已结束，无法签到" };
      }

      const [{ nextSeq }] = await tx
        .select({
          nextSeq: sql<number>`coalesce(max(${interviewCheckin.queueSeq}), 0) + 1`,
        })
        .from(interviewCheckin)
        .where(
          and(
            eq(interviewCheckin.fkFlowId, flowId),
            eq(interviewCheckin.round, round),
          ),
        );

      const seq = Number(nextSeq) || 1;
      const [inserted] = await tx
        .insert(interviewCheckin)
        .values({
          fkUserFlowId: userFlowId,
          fkFlowId: flowId,
          round,
          queueNo: formatQueueNo(
            departmentQueuePrefix(context.flow.department),
            seq,
          ),
          queueSeq: seq,
          status: "waiting",
          method,
          checkedInBy: actor.uid,
        })
        .returning({ id: interviewCheckin.id, queueNo: interviewCheckin.queueNo });

      return {
        kind: "created" as const,
        checkinId: inserted.id,
        queueNo: inserted.queueNo,
        uid: candidate.uid,
      };
    });

    if (outcome.kind === "error") {
      return { success: false, error: { message: outcome.message } };
    }

    const [entry] = await mapEntriesWithUsers(await loadRawEntries([outcome.checkinId]));

    if (outcome.kind === "created") {
      await writeOperationAudit({
        actorId: actor.uid,
        actorRole: actor.realRole,
        action: "interview_checkin.create",
        resourceType: "interview_checkin",
        resourceId: outcome.checkinId,
        department: context.flow.department,
        metadata: {
          flowId,
          round,
          userFlowId,
          queueNo: outcome.queueNo,
          method,
          targetUserId: outcome.uid,
        },
      });
      revalidatePath(CHECKIN_CONSOLE_PATH);
      revalidatePath(CHECKIN_BOARD_PATH);
    }

    return { success: true, entry };
  } catch (error) {
    logServerError("user-flow:checkInCandidate", error, {
      path: CHECKIN_CONSOLE_PATH,
      action: "interview-checkin-create",
      userId: actorId,
      flowId,
      userFlowId,
      metadata: { round, method },
    });
    throw error;
  }
};

/* ---------------------------------------------------------------- 叫号 */

/**
 * 状态迁移：叫号 / 进场 / 结束 / 过号 / 重呼 / 取消签到。
 * `stationId` 仅在叫号（→ called）时使用，且此时必填——每次叫号都落到具体面试位。
 * 过号 / 取消会释放面试位，结束保留（留档「在几号位面的」）。
 * 若候选人此刻正在其他部门被叫/面试，叫号会被拒绝（同一时刻只能在一个部门）。
 */
export const transitionCheckin = async (
  checkinId: number,
  to: InterviewCheckinStatusKey,
  options: { stationId?: number | null } = {},
): Promise<CheckinResult> => {
  let actorId: number | null = null;

  try {
    /* 先轻量读一次定位流程（权限校验 + 审计归属）；真正的状态校验与写入在场地锁内重做 */
    const [pointer] = await db
      .select({
        flowId: interviewCheckin.fkFlowId,
        round: interviewCheckin.round,
      })
      .from(interviewCheckin)
      .where(eq(interviewCheckin.id, checkinId))
      .limit(1);

    if (!pointer) {
      return { success: false, error: { message: "签到记录不存在" } };
    }

    const context = await loadOfficeFlowForVenue(pointer.flowId);
    if (context.kind === "missing") {
      return { success: false, error: { message: "流程不存在" } };
    }
    if (context.kind === "forbidden") {
      return { success: false, error: { message: context.message } };
    }
    const { actor } = context;
    actorId = actor.uid;

    const outcome = await db.transaction(async (tx) => {
      await lockVenue(tx, pointer.round);

      const [record] = await tx
        .select({
          status: interviewCheckin.status,
          callCount: interviewCheckin.callCount,
          skipCount: interviewCheckin.skipCount,
          uid: userFlow.fkUserId,
        })
        .from(interviewCheckin)
        .innerJoin(userFlow, eq(interviewCheckin.fkUserFlowId, userFlow.id))
        .where(eq(interviewCheckin.id, checkinId))
        .limit(1);

      if (!record) return { kind: "missing" as const };

      const from = record.status as InterviewCheckinStatusKey;
      if (!canTransitionCheckin(from, to)) return { kind: "invalid" as const };

      let stationId: number | null = null;
      if (to === "called") {
        if (!options.stationId) return { kind: "no-station" as const };

        const [station] = await tx
          .select({ id: interviewStation.id, status: interviewStation.status })
          .from(interviewStation)
          .where(
            and(
              eq(interviewStation.id, options.stationId),
              eq(interviewStation.fkFlowId, pointer.flowId),
            ),
          )
          .limit(1);
        if (!station) return { kind: "station-missing" as const };
        if (station.status !== "active") return { kind: "station-paused" as const };
        if ((await stationOccupantId(tx, options.stationId, checkinId)) !== null) {
          return { kind: "station-busy" as const };
        }

        const busy = busyElsewhere(record.uid, await loadVenueBlockers(tx));
        if (busy) return { kind: "busy" as const, label: busy };

        stationId = station.id;
      }

      const now = new Date();
      const patch: Partial<typeof interviewCheckin.$inferInsert> = { status: to };
      if (to === "called") {
        patch.calledAt = now;
        patch.callCount = record.callCount + 1;
        patch.fkStationId = stationId;
      } else if (to === "interviewing") {
        patch.startedAt = now;
      } else if (to === "done") {
        patch.finishedAt = now;
      } else if (to === "skipped") {
        /* 过号：号不变，往后顺延；累计超过上限就不再自动叫号 */
        patch.fkStationId = null;
        patch.skipCount = record.skipCount + 1;
      } else if (to === "cancelled") {
        patch.fkStationId = null;
      }

      /* 条件更新：只有「读到的状态仍是当前状态」才写，行数为 0 说明已被别人改过 */
      const updated = await tx
        .update(interviewCheckin)
        .set(patch)
        .where(
          and(eq(interviewCheckin.id, checkinId), eq(interviewCheckin.status, from)),
        )
        .returning({ id: interviewCheckin.id });
      if (updated.length === 0) return { kind: "stale" as const };

      if (to === "skipped") {
        await requeueAfterSkip(tx, pointer.flowId, pointer.round, checkinId);
      }

      return { kind: "ok" as const, from, stationId };
    });

    if (outcome.kind === "busy") {
      return {
        success: false,
        error: { message: `该候选人正在${outcome.label}面试中，不能同时叫号` },
      };
    }

    if (outcome.kind !== "ok") {
      const messages: Record<
        Exclude<typeof outcome.kind, "ok" | "busy">,
        string
      > = {
        missing: "签到记录不存在",
        invalid: "当前状态不能执行该操作，请刷新后重试",
        stale: "状态已变化，请刷新后重试",
        "no-station": "请选择叫到哪个面试位",
        "station-missing": "面试位不存在（需属于本部门）",
        "station-paused": "该面试位已暂停",
        "station-busy": "该面试位还在面试中，请先结束",
      };
      return { success: false, error: { message: messages[outcome.kind] } };
    }

    await writeOperationAudit({
      actorId: actor.uid,
      actorRole: actor.realRole,
      action: `interview_checkin.${to}`,
      resourceType: "interview_checkin",
      resourceId: checkinId,
      department: context.flow.department,
      metadata: {
        flowId: pointer.flowId,
        round: pointer.round,
        from: outcome.from,
        to,
        stationId: outcome.stationId,
      },
    });

    const [entry] = await mapEntriesWithUsers(await loadRawEntries([checkinId]));
    revalidatePath(CHECKIN_CONSOLE_PATH);
    revalidatePath(CHECKIN_BOARD_PATH);
    return { success: true, entry };
  } catch (error) {
    logServerError("user-flow:transitionCheckin", error, {
      path: CHECKIN_CONSOLE_PATH,
      action: "interview-checkin-transition",
      userId: actorId,
      metadata: { checkinId, to, stationId: options.stationId ?? null },
    });
    throw error;
  }
};

/**
 * 过号重排：把该候选人往后顺延 `QUEUE_SKIP_BACKOFF` 位（不足则排到队尾），号码不变。
 * 只重排「还会被自动叫到」的行（等待中 + 过号未超限），并把序号压平为 1..N。
 * 超过过号上限后本行已不在候选集里，这里会直接跳过（不再自动叫号）。
 */
const requeueAfterSkip = async (
  executor: Executor,
  flowId: number,
  round: number,
  checkinId: number,
): Promise<void> => {
  const rows = await executor
    .select({ id: interviewCheckin.id, queueSeq: interviewCheckin.queueSeq })
    .from(interviewCheckin)
    .where(
      and(
        eq(interviewCheckin.fkFlowId, flowId),
        eq(interviewCheckin.round, round),
        or(
          eq(interviewCheckin.status, "waiting"),
          and(
            eq(interviewCheckin.status, "skipped"),
            lte(interviewCheckin.skipCount, MAX_QUEUE_SKIPS),
          ),
        ),
      ),
    )
    .orderBy(asc(interviewCheckin.queueSeq), asc(interviewCheckin.id));

  const selfIndex = rows.findIndex((row) => row.id === checkinId);
  if (selfIndex === -1) return;

  const self = rows[selfIndex];
  const others = rows.filter((row) => row.id !== checkinId);
  const insertAt = Math.min(selfIndex + QUEUE_SKIP_BACKOFF, others.length);
  const ordered = [...others.slice(0, insertAt), self, ...others.slice(insertAt)];

  for (let index = 0; index < ordered.length; index += 1) {
    if (ordered[index].queueSeq === index + 1) continue;
    await executor
      .update(interviewCheckin)
      .set({ queueSeq: index + 1 })
      .where(eq(interviewCheckin.id, ordered[index].id));
  }
};

/** 面试位当前占用的签到 id（called / interviewing）；空闲返回 null。 */
const stationOccupantId = async (
  executor: Executor,
  stationId: number,
  exceptCheckinId?: number,
): Promise<number | null> => {
  const rows = await executor
    .select({ id: interviewCheckin.id })
    .from(interviewCheckin)
    .where(
      and(
        eq(interviewCheckin.fkStationId, stationId),
        inArray(interviewCheckin.status, [...BUSY_STATUSES]),
      ),
    )
    .limit(5);
  const occupant = rows.find((row) => row.id !== exceptCheckinId);
  return occupant ? occupant.id : null;
};

/* ---------------------------------------------------------------- 面试位 */

/** 新增面试位：必须指定部门（流程）与名称。 */
export const createCheckinStation = async (
  flowId: number,
  label: string,
): Promise<StationResult> => {
  try {
    const context = await loadOfficeFlowForVenue(flowId);
    if (context.kind !== "ok") {
      return { success: false, error: { message: context.kind === "missing" ? "流程不存在" : context.message } };
    }

    const normalized = label.trim();
    if (!normalized) {
      return { success: false, error: { message: "请填写面试位名称" } };
    }
    if (normalized.length > 32) {
      return { success: false, error: { message: "面试位名称过长" } };
    }

    const existing = await loadStations([flowId]);
    if (existing.some((station) => station.label === normalized)) {
      return { success: false, error: { message: "本部门已有同名面试位" } };
    }

    const sortOrder =
      existing.reduce((max, station) => Math.max(max, station.sortOrder), 0) + 1;
    const [inserted] = await db
      .insert(interviewStation)
      .values({
        fkFlowId: flowId,
        label: normalized,
        sortOrder,
        status: "active",
      })
      .returning({ id: interviewStation.id });

    await writeOperationAudit({
      actorId: context.actor.uid,
      actorRole: context.actor.realRole,
      action: "interview_station.create",
      resourceType: "interview_station",
      resourceId: inserted.id,
      department: context.flow.department,
      metadata: { flowId, label: normalized },
    });

    const stations = await loadStations([flowId]);
    const station = stations.find((item) => item.id === inserted.id);
    revalidatePath(CHECKIN_CONSOLE_PATH);
    revalidatePath(CHECKIN_BOARD_PATH);
    return station
      ? { success: true, station }
      : { success: false, error: { message: "面试位创建失败" } };
  } catch (error) {
    logServerError("user-flow:createCheckinStation", error, {
      path: CHECKIN_CONSOLE_PATH,
      action: "interview-station-create",
      flowId,
      metadata: { label },
    });
    throw error;
  }
};

export const updateCheckinStation = async (
  stationId: number,
  patch: { label?: string; status?: string },
): Promise<StationResult> => {
  try {
    const target = await loadStationWithFlow(stationId);
    if (!target) {
      return { success: false, error: { message: "面试位不存在" } };
    }
    const context = await loadOfficeFlowForVenue(target.fkFlowId);
    if (context.kind !== "ok") {
      return { success: false, error: { message: "无权修改该面试位" } };
    }

    const values: Partial<typeof interviewStation.$inferInsert> = {};
    if (patch.label !== undefined) {
      const label = patch.label.trim();
      if (!label) {
        return { success: false, error: { message: "面试位名称不能为空" } };
      }
      if (label.length > 32) {
        return { success: false, error: { message: "面试位名称过长" } };
      }
      values.label = label;
    }
    if (patch.status !== undefined) {
      if (patch.status !== "active" && patch.status !== "paused") {
        return { success: false, error: { message: "面试位状态无效" } };
      }
      values.status = patch.status;
    }
    if (Object.keys(values).length === 0) {
      return { success: false, error: { message: "没有需要修改的内容" } };
    }

    try {
      await db
        .update(interviewStation)
        .set(values)
        .where(eq(interviewStation.id, stationId));
    } catch (error) {
      if (isUniqueViolation(error)) {
        return { success: false, error: { message: "本部门已有同名面试位" } };
      }
      throw error;
    }

    await writeOperationAudit({
      actorId: context.actor.uid,
      actorRole: context.actor.realRole,
      action: "interview_station.update",
      resourceType: "interview_station",
      resourceId: stationId,
      department: context.flow.department,
      metadata: { flowId: target.fkFlowId, ...values },
    });

    const stations = await loadStations([target.fkFlowId]);
    const station = stations.find((item) => item.id === stationId);
    revalidatePath(CHECKIN_CONSOLE_PATH);
    revalidatePath(CHECKIN_BOARD_PATH);
    return station
      ? { success: true, station }
      : { success: false, error: { message: "面试位更新失败" } };
  } catch (error) {
    logServerError("user-flow:updateCheckinStation", error, {
      path: CHECKIN_CONSOLE_PATH,
      action: "interview-station-update",
      metadata: { stationId },
    });
    throw error;
  }
};

export const deleteCheckinStation = async (
  stationId: number,
): Promise<{ success: true } | { success: false; error: { message: string } }> => {
  try {
    const target = await loadStationWithFlow(stationId);
    if (!target) {
      return { success: false, error: { message: "面试位不存在" } };
    }
    const context = await loadOfficeFlowForVenue(target.fkFlowId);
    if (context.kind !== "ok") {
      return { success: false, error: { message: "无权删除该面试位" } };
    }
    if ((await stationOccupantId(db, stationId)) !== null) {
      return { success: false, error: { message: "该面试位还在面试中，请先结束" } };
    }

    await db.delete(interviewStation).where(eq(interviewStation.id, stationId));
    await writeOperationAudit({
      actorId: context.actor.uid,
      actorRole: context.actor.realRole,
      action: "interview_station.delete",
      resourceType: "interview_station",
      resourceId: stationId,
      department: context.flow.department,
      metadata: { flowId: target.fkFlowId, label: target.label },
    });

    revalidatePath(CHECKIN_CONSOLE_PATH);
    revalidatePath(CHECKIN_BOARD_PATH);
    return { success: true };
  } catch (error) {
    logServerError("user-flow:deleteCheckinStation", error, {
      path: CHECKIN_CONSOLE_PATH,
      action: "interview-station-delete",
      metadata: { stationId },
    });
    throw error;
  }
};

/**
 * 部门在自己的面试位上叫下一位：取本部门本轮等待队列中**最早且当前空闲**的候选人
 * （正在其他部门被叫/面试的跳过——一二志愿撞车时不会重复叫同一个人），指派到该位。
 */
export const callNextAtStation = async (
  stationId: number,
  roundInput: number,
): Promise<CheckinResult> => {
  let actorId: number | null = null;
  const round = normalizeRound(roundInput);

  try {
    const target = await loadStationWithFlow(stationId);
    if (!target) {
      return { success: false, error: { message: "面试位不存在" } };
    }
    const context = await loadOfficeFlowForVenue(target.fkFlowId);
    if (context.kind !== "ok") {
      return { success: false, error: { message: "无权使用该面试位" } };
    }
    const { actor } = context;
    actorId = actor.uid;

    if (target.status !== "active") {
      return { success: false, error: { message: "该面试位已暂停" } };
    }

    const outcome = await db.transaction(async (tx) => {
      /* 与手动叫号、签到分号、过号重排共用同一把场地锁 */
      await lockVenue(tx, round);

      const busyStation = await tx
        .select({ id: interviewCheckin.id })
        .from(interviewCheckin)
        .where(
          and(
            eq(interviewCheckin.fkStationId, stationId),
            inArray(interviewCheckin.status, [...BUSY_STATUSES]),
          ),
        )
        .limit(1);
      if (busyStation.length > 0) {
        return { kind: "error" as const, message: "该面试位还在面试中，请先结束" };
      }

      const waiting = await tx
        .select({
          id: interviewCheckin.id,
          status: interviewCheckin.status,
          callCount: interviewCheckin.callCount,
          uid: userFlow.fkUserId,
          choice: userFlow.choice,
        })
        .from(interviewCheckin)
        .innerJoin(userFlow, eq(interviewCheckin.fkUserFlowId, userFlow.id))
        .where(
          and(
            eq(interviewCheckin.fkFlowId, target.fkFlowId),
            eq(interviewCheckin.round, round),
            /* 过号但还没用完自动重排次数的人，排在后面继续叫；超过次数的不再叫 */
            or(
              eq(interviewCheckin.status, "waiting"),
              and(
                eq(interviewCheckin.status, "skipped"),
                lte(interviewCheckin.skipCount, MAX_QUEUE_SKIPS),
              ),
            ),
          ),
        )
        .orderBy(asc(interviewCheckin.queueSeq), asc(interviewCheckin.id));

      if (waiting.length === 0) {
        return { kind: "error" as const, message: "本部门本轮没有等待叫号的候选人" };
      }

      /* 正在别部门面试的人跳过（队列不因此卡住，直接叫下一个）；
         第一志愿还没面完的只是「先叫别人」，没有别人可叫时照样叫他。
         两种都只是这一轮不叫/后叫，不会丢掉队列位置。 */
      const blockers = await loadVenueBlockers(tx);
      const available = waiting.filter(
        (row) => busyElsewhere(row.uid, blockers) === null,
      );
      if (available.length === 0) {
        return {
          kind: "error" as const,
          message: "队首候选人都正在其他部门面试，请稍后再叫",
        };
      }
      const next =
        available.find(
          (row) => pendingFirstChoice(row.uid, row.choice, blockers) === null,
        ) ?? available[0];

      const now = new Date();
      const moved = await tx
        .update(interviewCheckin)
        .set({
          status: "called",
          fkStationId: stationId,
          calledAt: now,
          callCount: next.callCount + 1,
          updatedAt: now,
        })
        .where(
          and(
            eq(interviewCheckin.id, next.id),
            eq(interviewCheckin.status, next.status),
          ),
        )
        .returning({ id: interviewCheckin.id });
      if (moved.length === 0) {
        return { kind: "error" as const, message: "状态已变化，请刷新后重试" };
      }

      return { kind: "ok" as const, checkinId: next.id };
    });

    if (outcome.kind === "error") {
      return { success: false, error: { message: outcome.message } };
    }

    await writeOperationAudit({
      actorId: actor.uid,
      actorRole: actor.realRole,
      action: "interview_checkin.called",
      resourceType: "interview_checkin",
      resourceId: outcome.checkinId,
      department: context.flow.department,
      metadata: {
        flowId: target.fkFlowId,
        round,
        stationId,
        stationLabel: target.label,
        via: "station",
      },
    });

    const [entry] = await mapEntriesWithUsers(await loadRawEntries([outcome.checkinId]));
    revalidatePath(CHECKIN_CONSOLE_PATH);
    revalidatePath(CHECKIN_BOARD_PATH);
    return { success: true, entry };
  } catch (error) {
    logServerError("user-flow:callNextAtStation", error, {
      path: CHECKIN_CONSOLE_PATH,
      action: "interview-checkin-call-next",
      userId: actorId,
      metadata: { stationId, round },
    });
    throw error;
  }
};

/* ---------------------------------------------------------------- 工具 */

const loadStationWithFlow = async (stationId: number) => {
  const [station] = await db
    .select({
      id: interviewStation.id,
      fkFlowId: interviewStation.fkFlowId,
      label: interviewStation.label,
      status: interviewStation.status,
    })
    .from(interviewStation)
    .where(eq(interviewStation.id, stationId))
    .limit(1);
  return station ?? null;
};

const isUniqueViolation = (error: unknown): boolean => {
  if (!error || typeof error !== "object") return false;
  if ("code" in error && error.code === "23505") return true;
  const cause = "cause" in error ? error.cause : undefined;
  return Boolean(
    cause && typeof cause === "object" && "code" in cause && cause.code === "23505",
  );
};
