import {
  getInterviewMeetingRoom,
  interviewMeetingRooms,
} from "@/lib/interview-meeting-rooms";

describe("interview meeting rooms", () => {
  it("only resolves configured Feishu room resources", () => {
    expect(interviewMeetingRooms).toHaveLength(2);
    expect(getInterviewMeetingRoom("omm_f2b7a9f9ba5afa0b96906cf2cb4f1a06")).toEqual({
      id: "omm_f2b7a9f9ba5afa0b96906cf2cb4f1a06",
      name: "大学生活动中心-汇客厅(112 - 113)",
    });
    expect(getInterviewMeetingRoom("omm_unknown")).toBeUndefined();
  });
});
