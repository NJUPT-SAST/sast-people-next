export const interviewMeetingRooms = [
  {
    id: "omm_f2b7a9f9ba5afa0b96906cf2cb4f1a06",
    name: "大学生活动中心-汇客厅(112 - 113)",
  },
  {
    id: "omm_17a653591966274e91219f66043e1218",
    name: "大学生活动中心-101 中区",
  },
] as const;

export function getInterviewMeetingRoom(id?: string | null) {
  if (!id) return undefined;
  return interviewMeetingRooms.find((room) => room.id === id);
}
